// toss — a phrase is called, drag the ingredient it goes with onto the plate, then flick up to toss.
// content: { inOrder?, opening?:{ saying, pinyin?, wish, phrase? }, tossCall?, tossPrompt, tosses?, mixedImage?,
//            ingredients:[ { name, wish, colour, image?, tossable?, saying?, pinyin?, phrase?, note? } ] }
//   inOrder calls the ingredients in the order listed; otherwise they're shuffled.
//   opening is a greeting step before the first ingredient. phrase names an audio asset.
//   tossCall pops up at random spots over the plate on every toss.
//   saying and pinyin are the phrase as written and spoken; note is shown once the ingredient is on.
//   image names a preloaded image asset. tossable:false keeps condiment dishes out of the airborne bits.
export const meta = { id: 'toss', name: 'Add and toss' };

const NS = 'http://www.w3.org/2000/svg';
const GRAVITY = 0.0016;   // px per ms², for the falling bits
const FAST_FLICK = 2.6;   // upward speed in px per ms that counts as a full toss

const svg = (tag, attrs = {}) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

// One ring segment of the plate, from angle a0 to a1 (radians), between radii r0 and r1.
function wedge(a0, a1, r0, r1) {
  const pt = (r, a) => `${50 + r * Math.cos(a)} ${50 + r * Math.sin(a)}`;
  return `M${pt(r0, a0)}L${pt(r1, a0)}A${r1} ${r1} 0 0 1 ${pt(r1, a1)}L${pt(r0, a1)}A${r0} ${r0} 0 0 0 ${pt(r0, a0)}Z`;
}

export async function mount({ root, content, api }) {
  const sound = key => key && api.assets?.[key] && api.play(api.assets[key]);
  const items = content.ingredients;
  const artwork = item => item.image && api.assets?.[item.image];
  const calls = content.inOrder ? items : api.shuffle(items);
  const first = content.opening ? 2 : 1, steps = items.length + first;
  const tosses = content.tosses || 3;
  let call = 0, firstTry = 0, missed = false;

  const banner = api.el('div', { class: 'toss-banner', 'aria-live': 'polite' });
  const plateSvg = svg('svg', { viewBox: '0 0 100 100', class: 'toss-plate', 'aria-hidden': 'true' });
  plateSvg.append(svg('circle', { cx: 50, cy: 50, r: 48, class: 'toss-rim' }),
    svg('circle', { cx: 50, cy: 50, r: 43, class: 'toss-dish' }));
  const pile = svg('g');
  plateSvg.append(pile);
  const canvas = api.el('canvas', { class: 'toss-bits' });
  const scale = api.el('div', { class: 'toss-scale', hidden: '' });
  const tray = api.el('div', { class: 'toss-tray' });
  const stage = api.el('div', { class: 'toss' }, scale, tray, plateSvg, canvas);
  const fact = api.el('p', { class: 'toss-fact', 'aria-live': 'polite' });
  root.replaceChildren(banner, stage, fact);

  const phrase = (kicker, p, ...rest) => banner.replaceChildren(api.el('span', { class: 'kicker' }, kicker),
    api.el('span', { class: 'toss-saying' }, p.saying || ''),
    p.pinyin ? api.el('span', { class: 'toss-pinyin' }, p.pinyin) : '',
    api.el('strong', {}, `“${p.wish}”`), ...rest);

  const sayWish = () => {
    phrase(`Step ${call + first} of ${steps}`, calls[call],
      api.el('span', { class: 'muted' }, 'Drag the ingredient that goes with this phrase onto the plate.'));
    api.setProgress(call, items.length);
    sound(calls[call].phrase);
  };

  const onPlate = (x, y) => {
    const r = plateSvg.getBoundingClientRect();
    return Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2)) < r.width / 2;
  };

  const drop = (item, chip) => {
    if (item !== calls[call]) {
      missed = true;
      chip.classList.add('wrong');
      setTimeout(() => chip.classList.remove('wrong'), 450);
      banner.lastChild.textContent = `Not that one: ${item.name.toLowerCase()} goes with “${item.wish}”.`;
      return;
    }
    if (!missed) firstTry++;
    fact.textContent = item.note || '';
    missed = false;
    const k = call, a = 2 * Math.PI / items.length;
    const image = artwork(item);
    if (image) {
      const angle = k * a - Math.PI / 2;
      const x = 50 + 22 * Math.cos(angle), y = 50 + 22 * Math.sin(angle);
      pile.append(svg('image', { href: image.src, x: x - 20, y: y - 20, width: 40, height: 40,
        preserveAspectRatio: 'xMidYMid meet', class: 'toss-heap' }));
    } else {
      pile.append(svg('path', { d: wedge(k * a - Math.PI / 2, (k + 1) * a - Math.PI / 2, 9, 40), fill: item.colour, class: 'toss-heap' }));
    }
    chip.remove();
    call++;
    if (call < calls.length) sayWish(); else tossTime();
  };

  // The tray is shuffled so its layout never gives away the order the phrases are called in.
  for (const item of api.shuffle(items)) {
    const image = artwork(item);
    const chip = api.el('button', { class: `toss-chip${image ? ' toss-chip-art' : ''}` },
      image ? api.el('img', { src: image.src, alt: '', draggable: 'false', width: 88, height: 72 })
        : api.el('i', { style: `background:${item.colour}` }), api.el('span', {}, item.name));
    let start = null;
    chip.addEventListener('pointerdown', e => {
      start = [e.clientX, e.clientY];
      chip.setPointerCapture(e.pointerId);
      chip.classList.add('dragging');
    });
    chip.addEventListener('pointermove', e => {
      if (!start) return;
      chip.style.transform = `translate(${e.clientX - start[0]}px, ${e.clientY - start[1]}px)`;
    });
    const end = e => {
      if (!start) return;
      const moved = Math.hypot(e.clientX - start[0], e.clientY - start[1]);
      start = null;
      chip.style.transform = '';
      chip.classList.remove('dragging');
      // A tap counts as putting it on the plate, so the game also works without dragging.
      if (moved < 8 || onPlate(e.clientX, e.clientY)) drop(item, chip);
    };
    chip.addEventListener('pointerup', end);
    chip.addEventListener('click', e => { if (e.detail === 0) drop(item, chip); });  // keyboard
    chip.addEventListener('pointercancel', () => { start = null; chip.style.transform = ''; chip.classList.remove('dragging'); });
    tray.append(chip);
  }

  // The opening greeting, said as everyone gathers before any ingredient goes on.
  if (content.opening) {
    tray.hidden = true;
    phrase(`Step 1 of ${steps}`, content.opening, api.el('button', {
      class: 'btn primary', style: 'margin-top:8px',
      onclick: () => { tray.hidden = false; sayWish(); }
    }, 'Gather round'));
    sound(content.opening.phrase);
  } else sayWish();

  // Toss: flick up from the plate. The faster the flick, the higher everything flies.
  const tossTime = () => {
    api.setProgress(items.length, items.length);
    tray.remove();
    scale.hidden = false;
    scale.replaceChildren(...['Higher', '', '', 'Plate'].map(t => api.el('span', {}, t)));
    stage.classList.add('tossing');
    const heights = [];
    const mixed = content.mixedImage && api.assets?.[content.mixedImage];
    const originalPile = Array.from(pile.children);
    let mixedShown = false;
    const showMixture = show => {
      if (!mixed || show === mixedShown) return;
      mixedShown = show;
      pile.replaceChildren(...(show ? [svg('image', { href: mixed.src, x: 8, y: 8, width: 84, height: 84,
        preserveAspectRatio: 'xMidYMid meet', class: 'toss-heap' })] : originalPile));
    };
    const shout = content.tossCall || 'Lo hei!';
    banner.replaceChildren(api.el('span', { class: 'kicker' }, `Step ${steps} of ${steps} · Toss 1 of ${tosses}`),
      api.el('strong', {}, shout), api.el('span', { class: 'muted' }, content.tossPrompt));

    const g = canvas.getContext('2d');
    const tossItems = items.filter(item => item.tossable !== false);
    const flyingItems = tossItems.length ? tossItems : items;
    let samples = [], flying = false;
    stage.addEventListener('pointerdown', e => {
      if (flying || heights.length >= tosses) return;
      stage.setPointerCapture(e.pointerId);
      samples = [[e.clientY, e.timeStamp]];
    });
    stage.addEventListener('pointermove', e => {
      if (!samples.length) return;
      showMixture(heights.length > 0 || samples[0][0] - e.clientY > 8);
      samples.push([e.clientY, e.timeStamp]);
    });
    stage.addEventListener('pointercancel', () => {
      samples = [];
      showMixture(heights.length > 0);
    });
    stage.addEventListener('pointerup', e => {
      if (!samples.length) return;
      samples.push([e.clientY, e.timeStamp]);
      // Fastest upward stretch in the last moments, so a brief pause before letting go still counts.
      // Each stretch spans at least 16 ms so bursts of events close together don't inflate it.
      const recent = samples.filter(p => e.timeStamp - p[1] < 200);
      let speed = 0;
      for (let n = 1, m = 0; n < recent.length; n++) {
        while (m + 1 < n && recent[n][1] - recent[m + 1][1] >= 16) m++;
        speed = Math.max(speed, (recent[m][0] - recent[n][0]) / Math.max(16, recent[n][1] - recent[m][1]));
      }
      samples = [];
      if (speed <= 0.2) { showMixture(heights.length > 0); return; }
      launch(Math.min(1, speed / FAST_FLICK));
    });

    // The call pops up a few times at random spots, more often for a higher toss.
    // Each pop gets its own band across the stage, in shuffled order, so they don't pile up.
    const shoutOut = power => {
      const count = 2 + Math.round(power * 3);
      api.shuffle([...Array(count).keys()]).forEach((band, n) => {
        setTimeout(() => {
          const left = 15 + (band + 0.2 + Math.random() * 0.6) * 70 / count;
          const pop = api.el('span', { class: 'toss-shout', 'aria-hidden': 'true',
            style: `left:${left}%;top:${8 + Math.random() * 50}%;--tilt:${Math.round((Math.random() - 0.5) * 24)}deg` }, shout);
          stage.append(pop);
          pop.addEventListener('animationend', () => pop.remove());
        }, n * 180 + Math.random() * 120);
      });
    };

    const launch = power => {
      flying = true;
      shoutOut(power);
      const w = canvas.width = stage.clientWidth * devicePixelRatio;
      const h = canvas.height = stage.clientHeight * devicePixelRatio;
      g.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      const r = plateSvg.getBoundingClientRect(), s = stage.getBoundingClientRect();
      const cx = r.left - s.left + r.width / 2, cy = r.top - s.top + r.height / 2;
      const rise = power * (cy - 12);
      const bits = Array.from({ length: 90 }, () => {
        const item = flyingItems[Math.floor(Math.random() * flyingItems.length)];
        const peak = rise * (0.75 + Math.random() * 0.25);
        return { x: cx + (Math.random() - 0.5) * r.width * 0.6, y: cy, vx: (Math.random() - 0.5) * 0.12,
          vy: -Math.sqrt(2 * GRAVITY * peak), c: item.colour, image: artwork(item),
          len: 4 + Math.random() * 8, size: 18 + Math.random() * 22, rot: Math.random() * 6 };
      });
      let t = performance.now();
      const frame = now => {
        const dt = Math.min(32, now - t); t = now;
        g.clearRect(0, 0, w, h);
        let live = 0;
        for (const b of bits) {
          b.vy += GRAVITY * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.rot += 0.01 * dt;
          if (b.y > cy && b.vy > 0) continue;
          live++;
          if (b.image) {
            g.save();
            g.translate(b.x, b.y);
            g.rotate(b.rot);
            g.drawImage(b.image, -b.size / 2, -b.size / 2, b.size, b.size);
            g.restore();
            continue;
          }
          g.strokeStyle = b.c; g.lineWidth = 3; g.lineCap = 'round';
          g.beginPath();
          g.moveTo(b.x - Math.cos(b.rot) * b.len / 2, b.y - Math.sin(b.rot) * b.len / 2);
          g.lineTo(b.x + Math.cos(b.rot) * b.len / 2, b.y + Math.sin(b.rot) * b.len / 2);
          g.stroke();
        }
        if (live) return requestAnimationFrame(frame);
        g.clearRect(0, 0, w, h);
        landed(power);
      };
      requestAnimationFrame(frame);
    };

    const landed = power => {
      flying = false;
      heights.push(power);
      showMixture(true);
      const pct = Math.round(power * 100);
      const word = power > 0.85 ? 'Sky high!' : power > 0.55 ? 'A good toss.' : 'Go higher! Higher tosses mean more fortune.';
      if (heights.length < tosses) {
        banner.replaceChildren(api.el('span', { class: 'kicker' }, `Step ${steps} of ${steps} · Toss ${heights.length + 1} of ${tosses}`),
          api.el('strong', {}, `${pct}% high. ${word}`), api.el('span', { class: 'muted' }, content.tossPrompt));
        return;
      }
      const best = Math.round(Math.max(...heights) * 100);
      const finish = () => api.finish({ score: firstTry, total: items.length,
        line: `${firstTry} of ${items.length} ingredients right first time. Your highest toss reached ${best}%.` });
      if (mixed) {
        banner.replaceChildren(api.el('span', { class: 'kicker' }, 'All tossed!'),
          api.el('strong', {}, `${shout} Your yusheng is ready.`),
          api.el('span', { class: 'muted' }, `Your highest toss reached ${best}%.`),
          api.el('button', { class: 'btn primary', onclick: finish }, 'See results'));
      } else finish();
    };
  };
}
