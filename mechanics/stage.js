// stage — a story is narrated; drag the puppet it calls for from the banana trunk onto its mark on the screen.
// Plays full-screen in landscape. Asks phones held upright to turn sideways.
// content: { intro, seconds?, music?, puppets:{ id:{ name, side:'good'|'centre'|'bad', height, faces?:'left'|'right' } },
//            beats:[ { puppet, x, y?, face?, clear?, enter?:[ { puppet, x } ], cue, story, audio?,
//                      after?:{ story?, audio?, exit?:[id], exitTo?:'left'|'right', fall?:[id], clear? } } ] }
//   story is what the narrator tells (audio is its recording, shown as a subtitle); cue is the big instruction
//   naming the puppet to bring on. music names a looping audio asset; without it a gamelan-style loop is synthesized.
//   A puppet id is also the key of its preloaded image. height is a fraction of the screen's height. x and y place
//   the puppet's centre as fractions of the screen; without y it stands on the trunk. faces is the way the photo
//   faces; each puppet is turned to face the middle of the screen unless the beat's face says otherwise.
//   clear and enter set the screen before a beat is narrated; after plays once its puppet is placed.
//   The trunk holds good puppets on the player's left and bad on the right, as the dalang stakes them.
//   Each beat scores up to 3: the right puppet first time, dropped on its mark, and within `seconds` of the narration ending.
export const meta = { id: 'stage', name: 'Narrated shadow stage' };

const ON_MARK = 0.16;  // a drop this close to the mark, as a fraction of the screen's height, is on it
const SLENDRO = [0, 240, 480, 720, 960].map(c => 293.66 * 2 ** (c / 1200));
const MELODY = [1, 0, 1, 3, 1, 0, 1, 3, 2, 4, 2, 1, 3, 2, 1, 0];  // one gong cycle, as slendro degrees
const BEAT = 0.62;  // seconds per melody note

export async function mount({ root, content, api }) {
  const ac = api.audioContext();
  const { puppets, beats } = content;
  const seconds = content.seconds || 8;
  const image = id => api.assets[id];

  // Sounds: everything but the narration and a recorded music loop is synthesized here.
  const out = ac.createGain();
  out.connect(ac.destination);
  // A recording is mastered far louder than the synthesized notes, so it gets its own levels.
  const [musicLevel, duckedLevel] = content.music ? [0.3, 0.12] : [0.09, 0.035];
  const music = ac.createGain();
  music.gain.value = musicLevel;
  music.connect(out);
  const tone = (freq, at, { gain = 0.3, decay = 1, to = out, partial = 2.76 } = {}) => {
    for (const [mult, g] of [[1, gain], [partial, gain * 0.25]]) {
      const o = ac.createOscillator(), v = ac.createGain();
      o.frequency.value = freq * mult;
      v.gain.setValueAtTime(g, at);
      v.gain.exponentialRampToValueAtTime(0.0001, at + decay);
      o.connect(v).connect(to);
      o.start(at);
      o.stop(at + decay);
    }
  };
  const gong = (at = ac.currentTime) => {
    tone(65, at, { gain: 0.5, decay: 5, partial: 1.02 });
    tone(131, at, { gain: 0.12, decay: 3.5, partial: 2.4 });
  };
  // The dalang's sound effects: the mallet knocking on the puppet box to cue the next part,
  // and the hanging metal plates he rattles with his foot, here as a puppet lands.
  const noise = (at, { gain, decay, freq, q }) => {
    const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * decay), ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let n = 0; n < d.length; n++) d[n] = (Math.random() * 2 - 1) * (1 - n / d.length) ** 3;
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), v = ac.createGain();
    src.buffer = buf;
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    v.gain.value = gain;
    src.connect(f).connect(v).connect(out);
    src.start(at);
  };
  const knock = (at = ac.currentTime) => {
    for (const t of [0, 0.16]) {
      tone(190, at + t, { gain: 0.35, decay: 0.09, partial: 2.3 });
      noise(at + t, { gain: 0.5, decay: 0.05, freq: 900, q: 3 });
    }
  };
  const kepyak = (at = ac.currentTime) => {
    for (const t of [0, 0.07, 0.13]) {
      for (const f of [2200, 3150, 4170]) tone(f * (1 + t), at + t, { gain: 0.05, decay: 0.18, partial: 1.41 });
      noise(at + t, { gain: 0.25, decay: 0.08, freq: 5200, q: 2 });
    }
  };
  const thud = () => tone(140, ac.currentTime, { gain: 0.25, decay: 0.2, partial: 1.5 });

  // A recorded loop if the game has one, otherwise a gamelan-style loop:
  // saron on every note, bonang answering between them, kenong every fourth, gong at the end of the cycle.
  let step = 0, nextAt = 0, timer = null;
  const startMusic = () => {
    const loop = content.music && api.assets[content.music];
    if (loop) {
      const src = ac.createBufferSource();
      src.buffer = loop;
      src.loop = true;
      src.connect(music);
      src.start();
      timer = { stop: () => src.stop() };
      return;
    }
    nextAt = ac.currentTime + 0.1;
    const id = setInterval(() => {
      while (nextAt < ac.currentTime + 0.3) {
        const f = SLENDRO[MELODY[step % MELODY.length]];
        tone(f, nextAt, { gain: 0.22, decay: 0.9, to: music });
        const next = SLENDRO[MELODY[(step + 1) % MELODY.length]];
        tone(next * 2, nextAt + BEAT / 2, { gain: 0.07, decay: 0.35, to: music, partial: 3.1 });
        if (step % 4 === 3) tone(f / 2, nextAt, { gain: 0.18, decay: 2.2, to: music, partial: 2 });
        if (step % 16 === 15) tone(65, nextAt, { gain: 0.5, decay: 5, to: music, partial: 1.02 });
        step++;
        nextAt += BEAT;
      }
    }, 100);
    timer = { stop: () => clearInterval(id) };
  };
  const duck = on => music.gain.setTargetAtTime(on ? duckedLevel : musicLevel, ac.currentTime, 0.2);

  let voice = null;
  const narrate = key => new Promise(res => {
    voice?.stop();
    if (!key || !api.assets[key]) return res();
    duck(true);
    const src = voice = api.play(api.assets[key]);
    src.onended = () => {
      if (voice === src) { voice = null; duck(false); }
      res();
    };
  });

  // Layout.
  const cueEl = api.el('strong', { class: 'stage-cue', 'aria-live': 'polite' });
  const storyEl = api.el('span', { class: 'stage-story' });
  const line = api.el('p', { class: 'stage-line' }, cueEl, storyEl);
  const replay = api.el('button', { class: 'stage-replay', 'aria-label': 'Hear it again' }, '↻');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let motionOn = !reducedMotion.matches;
  const motion = api.el('button', { class: 'stage-motion-toggle', type: 'button' });
  const scoreEl = api.el('span', { class: 'stage-score' });
  const time = api.el('i', { class: 'stage-time' });
  const screen = api.el('div', { class: 'stage-screen' });
  const mark = api.el('div', { class: 'stage-mark', hidden: '' });
  screen.append(mark);
  const trunk = api.el('div', { class: 'stage-trunk' });
  const theatre = api.el('div', { class: 'stage-theatre' },
    api.el('div', { class: 'stage-top' }, line, motion, replay, scoreEl, time), screen, trunk,
    api.el('div', { class: 'stage-rotate' }, api.el('span', { class: 'stage-rotate-icon' }, '📱'),
      api.el('p', {}, 'Turn your phone sideways to play.')));
  root.replaceChildren(theatre);
  document.documentElement.classList.add('stage-lock');
  const updateMotion = () => {
    theatre.classList.toggle('motion-paused', !motionOn);
    motion.textContent = motionOn ? 'Pause motion' : 'Motion off · Play';
    motion.setAttribute('aria-label', 'Puppet animation');
    motion.setAttribute('aria-pressed', String(motionOn));
  };
  motion.addEventListener('click', () => { motionOn = !motionOn; updateMotion(); });
  updateMotion();

  // Puppets on the screen.
  const placed = new Map();
  const movements = { kayon: 'tree', jatayu: 'fly', deer: 'prance', hanoman: 'leap', semar: 'comic', rahwana: 'strong', ogre: 'strong' };
  const where = (id, x, y) => y ?? 1.04 - puppets[id].height / 2;
  const put = (id, x, y, face) => {
    const p = puppets[id], img = image(id);
    const want = face || (x < 0.5 ? 'right' : x > 0.5 ? 'left' : p.faces);
    const body = api.el('div', { class: `stage-motion motion-${movements[id] || 'sway'}` },
      api.el('div', { class: 'stage-flip' + (p.faces && want !== p.faces ? ' flipped' : '') },
        api.el('img', { class: 'stage-cast', src: img.src, alt: '' }),
        api.el('img', { src: img.src, alt: p.name })));
    // Start at the first pose so the performance is visible immediately after a drop.
    const el = api.el('div', { class: 'stage-puppet', 'data-puppet': id }, body);
    el.style.height = `${p.height * 100}%`;
    el.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
    el.style.left = `${x * 100}%`;
    el.style.top = `${y * 100}%`;
    placed.get(id)?.remove();
    placed.set(id, el);
    screen.append(el);
    slots.get(id)?.classList.add('out');
    return el;
  };
  // Exits go off the nearer side, or off `to` when the story sends puppets one way.
  const leave = (id, how, to) => {
    const el = placed.get(id);
    if (!el) return;
    placed.delete(id);
    el.classList.add('leaving');
    slots.get(id)?.classList.remove('out');
    const x = parseFloat(el.style.left) / 100;
    el.classList.add(how === 'fall' || how === 'fade' ? how
      : to ? `exit-${to}` : x > 0.5 ? 'exit-right' : x < 0.5 ? 'exit-left' : 'exit-up');
    setTimeout(() => el.remove(), 900);
  };
  const clear = () => [...placed.keys()].forEach(id => leave(id, 'fade'));

  // The banana trunk: good puppets on the left, the kayon in the middle, bad on the right.
  const slots = new Map();
  const ids = Object.keys(puppets);
  const order = [...api.shuffle(ids.filter(id => puppets[id].side === 'good')),
    ...ids.filter(id => puppets[id].side === 'centre'),
    ...api.shuffle(ids.filter(id => puppets[id].side === 'bad'))];
  for (const id of order) {
    const slot = api.el('button', { class: `stage-slot ${puppets[id].side}`, 'aria-label': puppets[id].name },
      api.el('span', { class: 'stage-rack-puppet' }, api.el('img', { src: image(id).src, alt: '', draggable: 'false' })),
      api.el('span', { class: 'stage-slot-name' }, puppets[id].name));
    slots.set(id, slot);
    trunk.append(slot);
    drag(slot, id);
  }

  // Game state.
  let i = -1, score = 0, wrong = false, endedAt = 0, busy = true, selected = null;
  const total = beats.length * 3;
  const showScore = () => { scoreEl.textContent = `${score} / ${total}`; };
  const say = (cue, story) => {
    if (cue != null) cueEl.textContent = cue;
    if (story != null) storyEl.textContent = story;
  };
  const markAt = beat => {
    const y = where(beat.puppet, beat.x, beat.y);
    mark.style.left = `${beat.x * 100}%`;
    mark.style.top = `${y * 100}%`;
    mark.hidden = false;
  };

  const startBeat = async () => {
    i++;
    api.setProgress(i, beats.length);
    if (i >= beats.length) return end();
    const beat = beats[i];
    if (beat.clear) clear();
    for (const e of beat.enter || []) put(e.puppet, e.x, where(e.puppet, e.x));
    wrong = false;
    endedAt = 0;
    time.classList.remove('run');
    if (beat.clear || beat.puppet === 'kayon') gong();
    knock();
    say(beat.cue, beat.story);
    for (const [id, slot] of slots) slot.classList.toggle('called', id === beat.puppet);
    markAt(beat);
    busy = false;
    const at = i;
    await pause(450);
    await narrate(beat.audio);
    if (at !== i || busy) return;
    endedAt = performance.now();
    time.style.animationDuration = `${seconds}s`;
    time.classList.add('run');
  };

  replay.addEventListener('click', () => {
    const beat = beats[i];
    if (!busy && beat) narrate(beat.audio);
  });

  const drop = async (id, cx, cy) => {
    if (busy || i < 0 || i >= beats.length) return;
    const beat = beats[i];
    if (id !== beat.puppet) {
      wrong = true;
      thud();
      const slot = slots.get(id);
      slot.classList.remove('wrong');
      void slot.offsetWidth;
      slot.classList.add('wrong');
      say(`Not ${puppets[id].name}. ${beat.cue}`);
      return;
    }
    busy = true;
    selectSlot(null);
    time.classList.remove('run');
    const r = screen.getBoundingClientRect();
    const y = where(id, beat.x, beat.y);
    const keyboard = cx == null;
    const dx = keyboard ? 0 : cx - (r.left + beat.x * r.width);
    const dy = keyboard ? 0 : cy - (r.top + y * r.height);
    const onMark = Math.hypot(dx, dy) / r.height <= ON_MARK;
    const inTime = !endedAt || performance.now() - endedAt <= seconds * 1000;
    const got = [!wrong, onMark, inTime];
    const points = got.filter(Boolean).length;
    score += points;
    showScore();

    // It appears where it was dropped, then settles onto its mark.
    const el = put(id, keyboard ? beat.x : (cx - r.left) / r.width, keyboard ? y : (cy - r.top) / r.height, beat.face);
    mark.hidden = true;
    kepyak();
    // Even a late drop gets a full performance before the puppet exits or falls.
    const performanceDone = pause(2400);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.classList.add('settle');
      el.style.left = `${beat.x * 100}%`;
      el.style.top = `${y * 100}%`;
    }));
    const missed = [wrong && 'not first pick', !onMark && 'off the mark', !inTime && 'a bit slow'].filter(Boolean);
    const pop = api.el('div', { class: 'stage-pop' }, api.el('strong', {}, `+${points}`),
      missed.length ? api.el('span', {}, missed.join(' · ')) : api.el('span', {}, 'perfect'));
    pop.style.left = `${beat.x * 100}%`;
    // Above the puppet's head, or beside it when there is no room above.
    const head = y - puppets[id].height / 2 - 0.08;
    pop.style.top = `${Math.max(0.1, head) * 100}%`;
    if (head < 0.1) pop.style.left = `${(beat.x + (beat.x > 0.5 ? -0.16 : 0.16)) * 100}%`;
    screen.append(pop);
    setTimeout(() => pop.remove(), 1600);

    // Let the description finish before the story moves on.
    if (voice) await new Promise(res => { voice.addEventListener('ended', res, { once: true }); });
    await performanceDone;
    await pause(500);
    const after = beat.after;
    if (after) {
      if (after.story) say('', after.story);
      const spoken = narrate(after.audio);
      await pause(after.story ? 300 : 0);
      for (const id of after.exit || []) leave(id, 'exit', after.exitTo);
      for (const id of after.fall || []) leave(id, 'fall');
      if (after.clear) clear();
      await spoken;
      await pause(after.audio ? 400 : 700);
    }
    startBeat();
  };
  const pause = ms => new Promise(res => setTimeout(res, ms));

  // Dragging from the trunk. A tap picks a puppet up instead, and the next tap on the screen puts it down.
  function selectSlot(id) {
    selected = id;
    for (const [k, s] of slots) s.classList.toggle('picked', k === id);
  }
  function drag(slot, id) {
    let start = null, ghost = null;
    slot.addEventListener('pointerdown', e => {
      if (busy) return;
      e.preventDefault();
      start = [e.clientX, e.clientY];
      slot.setPointerCapture(e.pointerId);
    });
    slot.addEventListener('pointermove', e => {
      if (!start) return;
      if (!ghost && Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 8) {
        const h = puppets[id].height * screen.clientHeight;
        ghost = api.el('img', { class: 'stage-ghost', src: image(id).src, alt: '' });
        ghost.style.height = `${h}px`;
        theatre.append(ghost);
        slot.classList.add('lifted');
      }
      if (ghost) {
        // Held above the finger so the puppet stays visible. Its centre is what lands.
        ghost.style.left = `${e.clientX}px`;
        ghost.style.top = `${e.clientY - ghost.offsetHeight * 0.3}px`;
      }
    });
    const finish = e => {
      if (!start) return;
      start = null;
      slot.classList.remove('lifted');
      if (!ghost) { selectSlot(selected === id ? null : id); return; }
      const cx = e.clientX, cy = e.clientY - ghost.offsetHeight * 0.3;
      ghost.remove();
      ghost = null;
      const r = screen.getBoundingClientRect();
      if (e.type === 'pointerup' && cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom + 20) drop(id, cx, cy);
    };
    slot.addEventListener('pointerup', finish);
    slot.addEventListener('pointercancel', finish);
    slot.addEventListener('click', e => { if (e.detail === 0) drop(id); });  // keyboard puts it straight on the mark
  }
  screen.addEventListener('pointerdown', e => {
    if (selected) drop(selected, e.clientX, e.clientY);
  });

  const end = async () => {
    await pause(600);
    gong();
    await pause(1800);
    timer?.stop();
    out.gain.setTargetAtTime(0, ac.currentTime, 0.3);
    document.documentElement.classList.remove('stage-lock');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    const r = score / total;
    api.finish({ score, total, line: r === 1 ? 'A master dalang. Every puppet, every mark.'
      : r >= 0.75 ? 'The audience stayed till dawn.' : r >= 0.5 ? 'A good night behind the screen.'
      : 'Every dalang starts somewhere. Try again?' });
  };

  // Opening: explain, then light the lamp.
  showScore();
  say('You are the dalang', content.intro);
  const begin = api.el('button', { class: 'btn primary stage-begin' }, 'Light the lamp');
  screen.append(begin);
  begin.addEventListener('click', async () => {
    begin.remove();
    try {
      await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
      await window.screen.orientation?.lock?.('landscape');
    } catch {}
    theatre.classList.add('lit');
    startMusic();
    await pause(1200);
    startBeat();
  });
}
