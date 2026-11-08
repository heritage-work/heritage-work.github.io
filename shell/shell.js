// Heritage Games — shared shell.
// Responsibilities: load manifest, load a game's content, dynamically import
// its mechanic module, give the mechanic a small API, render the result screen.

export const BASE = new URL('..', import.meta.url); // repo root

export async function loadManifest() {
  const res = await fetch(new URL('games/manifest.json', BASE));
  if (!res.ok) throw new Error('No manifest at games/manifest.json');
  const m = await res.json();
  const today = new Date().toISOString().slice(0, 10);
  // Anything dated in the future stays in the buffer and is not listed.
  m.games = m.games.filter(g => !g.publish || g.publish <= today)
                   .sort((a, b) => (b.publish || '').localeCompare(a.publish || ''));
  return m;
}

export async function loadGame(slug) {
  const res = await fetch(new URL(`games/${slug}/game.json`, BASE));
  if (!res.ok) throw new Error(`No game.json for "${slug}"`);
  return res.json();
}

// Mechanics are ES modules in /mechanics/<id>.js exporting mount().
export async function loadMechanic(id) {
  const mod = await import(new URL(`mechanics/${id}.js`, BASE));
  if (typeof mod.mount !== 'function') {
    throw new Error(`Mechanic "${id}" has no mount() export`);
  }
  return mod;
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null) continue;
    n.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return n;
};

// Per-viewer convenience only. Never load-bearing.
export function remember(key, val) {
  try { localStorage.setItem('hg:' + key, JSON.stringify(val)); } catch {}
}
export function recall(key, fallback = null) {
  try {
    const v = localStorage.getItem('hg:' + key);
    return v === null ? fallback : JSON.parse(v);
  } catch { return fallback; }
}


// ---------------------------------------------------------------------------
// Assets. A game.json may declare:
//   "assets": { "drum": {"audio":"audio/hit-drum"}, "poster": {"image":"poster.jpg"} }
// Audio paths are given WITHOUT an extension; we pick .ogg or .m4a per browser.
// Paths are relative to games/<slug>/.
// ---------------------------------------------------------------------------
let _ac = null;
export function audioContext() {
  if (!_ac) _ac = new (window.AudioContext || window.webkitAudioContext)();
  return _ac;
}

function audioExt() {
  const a = document.createElement('audio');
  return a.canPlayType('audio/ogg; codecs=opus') ? 'ogg' : 'm4a';
}

export async function preload(slug, assets, onProgress = () => {}) {
  const base = new URL(`games/${slug}/`, BASE);
  const entries = Object.entries(assets || {});
  const out = {};
  let done = 0;
  const ext = audioExt();

  await Promise.all(entries.map(async ([key, spec]) => {
    if (spec.audio) {
      const url = new URL(`${spec.audio}.${ext}`, base);
      const buf = await fetch(url).then(r => {
        if (!r.ok) throw new Error(`Missing asset ${spec.audio}.${ext}`);
        return r.arrayBuffer();
      });
      out[key] = await audioContext().decodeAudioData(buf);
    } else if (spec.image) {
      const url = new URL(spec.image, base);
      out[key] = await new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = () => rej(new Error(`Missing asset ${spec.image}`));
        img.src = url;
      });
    }
    onProgress(++done, entries.length);
  }));
  return out;
}

// Fire a decoded buffer. Returns the source node so a caller can stop it.
export function play(buffer, { when = 0, gain = 1 } = {}) {
  const ac = audioContext();
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const g = ac.createGain();
  g.gain.value = gain;
  src.connect(g).connect(ac.destination);
  src.start(when || ac.currentTime);
  return src;
}

function loadingScreen(root) {
  const bar = el('i');
  const pct = el('span', { class: 'muted' }, '0%');
  root.replaceChildren(el('div', { class: 'loading' },
    el('div', { class: 'kicker' }, 'Loading'),
    el('p', { class: 'muted' }, 'Fetching sound and images. One moment.'),
    el('div', { class: 'progress' }, bar),
    pct));
  return (done, total) => {
    const p = Math.round((done / total) * 100);
    bar.style.width = p + '%';
    pct.textContent = p + '%';
  };
}

// ---------------------------------------------------------------------------
// run(): the one call play.html makes.
// ---------------------------------------------------------------------------
export async function run({ slug, root, head }) {
  const game = await loadGame(slug);
  const mech = await loadMechanic(game.mechanic);

  if (head) {
    head.append(
      el('div', { class: 'kicker' }, game.kicker || 'Heritage Games'),
      el('h1', {}, game.title),
      game.blurb ? el('p', { class: 'muted' }, game.blurb) : null
    );
  }
  document.title = `${game.title} — Heritage Games`;

  const bar = el('i');
  const progress = el('div', { class: 'progress' }, bar);
  const stage = el('div', { class: 'card stage' });
  // Show the source while playing too, unless an about section below already lists it.
  const source = game.credit && !game.about ? el('div', { class: 'credit', html: game.credit }) : null;
  const about = game.about ? aboutSection(slug, game.about) : null;
  root.append(progress, stage, source ?? '', about && game.mechanic === 'spice'
    ? el('details', { class: 'spice-about' }, el('summary', {}, 'The heritage behind the shop'), about)
    : about ?? '');

  // Preload before handing control to the mechanic.
  let assets = {};
  const needsAudio = Object.values(game.assets || {}).some(a => a.audio);
  if (game.assets && Object.keys(game.assets).length) {
    progress.style.display = 'none';
    const onProgress = loadingScreen(stage);
    assets = await preload(slug, game.assets, onProgress);
    progress.style.display = '';
  }
  // Browsers only let audio start from a user gesture, so take one.
  if (needsAudio) {
    await new Promise(res => {
      stage.replaceChildren(el('div', { class: 'loading' },
        el('h2', {}, 'Sound on'),
        el('p', { class: 'muted' }, 'This one needs audio. Headphones help.'),
        el('button', {
          class: 'btn primary',
          onclick: async () => { await audioContext().resume(); res(); }
        }, 'Start')));
    });
  }

  const api = {
    shuffle,
    el,
    setProgress(done, total) {
      bar.style.width = `${total ? (done / total) * 100 : 0}%`;
    },
    assets,
    play,
    audioContext,
    finish({ score = 0, total = 0, line, result, headline }) {
      progress.remove();
      source?.remove();
      stage.replaceWith(resultScreen({ game, score, total, line, result, headline }));
      remember(`done:${slug}`, { score, total, at: Date.now() });
    }
  };

  // Berkat stays mounted through setup, serving and packing. Install music before play.
  if (game.music === 'berkat') {
    const { backgroundMusic } = await import('./berkat-music.js');
    backgroundMusic({ root, el });
  }
  await mech.mount({ root: stage, content: game.content, game, api });
  if (game.music === 'indian-inspired') {
    const { backgroundMusic } = await import('./music.js');
    backgroundMusic({ root, el });
  }
}

// The heritage behind a game, shown under it the whole time: photos, short facts and sources.
//   about: { title, figures?:[ { src?, alt, caption } ], cards?:[ { title, text } ], sources?:{ facts, media?:[string] } }
//   src is relative to games/<slug>/ (a figure without one is just its caption); caption, text, facts and media may contain links.
function aboutSection(slug, about) {
  const base = new URL(`games/${slug}/`, BASE);
  return el('section', { class: 'about' },
    el('h2', { class: 'about-title' }, about.title),
    about.figures?.length ? el('div', { class: 'about-figs' }, about.figures.map(f => el('figure', {},
      f.src ? el('img', { src: new URL(f.src, base).href, alt: f.alt || '', loading: 'lazy' }) : null,
      el('figcaption', { html: f.caption })))) : null,
    about.cards?.length ? el('div', { class: 'about-cards' }, about.cards.map(c => el('div', {},
      el('h3', {}, c.title), el('p', { html: c.text })))) : null,
    about.sources ? el('div', { class: 'about-sources' },
      el('p', { html: about.sources.facts }),
      about.sources.media?.length ? el('ul', {}, about.sources.media.map(m => el('li', { html: m }))) : null) : null);
}

// result replaces the score, for games with an outcome instead of a mark (a personality, say).
function resultScreen({ game, score, total, line, result, headline }) {
  const verdict = line || defaultLine(score, total);
  const shareText = result ? `${game.title}: ${result}` : `${game.title} ${score}/${total} — ${verdict}`;
  const box = el('div', { class: 'card result' },
    el('div', { class: 'kicker' }, result ? 'You are' : 'Done'),
    headline ? el('h2', { class: 'result-headline' }, headline) : null,
    el('div', { class: 'score' }, result || (total ? `${score}/${total}${headline ? ' points' : ''}` : '✓')),
    el('p', { class: 'muted' }, verdict),
    game.fact ? el('div', { class: 'fact' },
      el('strong', {}, 'One thing to keep: '), game.fact) : null,
    el('div', { class: 'row', style: 'justify-content:center;margin-top:8px' },
      el('button', {
        class: 'btn primary',
        onclick: async (e) => {
          const url = location.href;
          if (navigator.share) {
            try { await navigator.share({ title: game.title, text: shareText, url }); return; } catch {}
          }
          try {
            await navigator.clipboard.writeText(`${shareText}\n${url}`);
            e.target.textContent = 'Copied';
          } catch { e.target.textContent = 'Copy failed'; }
        }
      }, 'Share'),
      el('button', { class: 'btn', onclick: () => location.reload() }, 'Again'),
      el('a', { class: 'btn', href: new URL('index.html', BASE).href }, 'All games')
    ),
    game.credit ? el('div', { class: 'credit', html: game.credit }) : null
  );
  return box;
}

function defaultLine(score, total) {
  if (!total) return 'Thanks for playing.';
  const r = score / total;
  if (r === 1) return 'Perfect. Suspiciously good.';
  if (r >= 0.7) return 'Solid.';
  if (r >= 0.4) return 'Not bad — now you know.';
  return 'Now you know.';
}
