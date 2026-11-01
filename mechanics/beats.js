// beats — three lanes: drum, gong, cymbal. Tap on the line.
// content: {
//   track: "<asset key of the backing performance>",   (optional)
//   leadIn: 2.0,            seconds of runway before the first note
//   approach: 1.8,          seconds a note is visible before its hit time
//   window: 0.13,           hit tolerance, seconds
//   lanes: [{ key:"drum", label:"Drum", asset:"drum" }, ...],
//   notes: [ { t: 1.00, lane: 0 }, ... ]   t = seconds from track start
// }
export const meta = { id: 'beats', name: 'Keep the beat' };

const KEYS = ['f', 'g', 'h'];

export async function mount({ root, content, api }) {
  const lanes = content.lanes;
  const approach = content.approach ?? 1.8;
  const win = content.window ?? 0.13;
  const leadIn = content.leadIn ?? 2.0;
  const notes = content.notes.map((n, i) => ({ ...n, i, hit: false, missed: false }));

  const ac = api.audioContext();
  const field = api.el('div', { class: 'beats' });
  const judge = api.el('div', { class: 'judge' });

  lanes.forEach((l, i) => field.append(
    api.el('div', { class: 'lane', style: `left:${i * 33.333}%` })));
  field.append(api.el('div', { class: 'hitline' }));

  const pads = lanes.map((l, i) => api.el('div', { class: 'pad' }, l.label));
  field.append(api.el('div', { class: 'pads' }, pads), judge);

  // Note elements, positioned each frame.
  const els = notes.map(n => {
    const e = api.el('div', { class: `note ${lanes[n.lane].key}`,
      style: `left:${n.lane * 33.333 + 3}%;width:27%;transform:translateY(-40px)` });
    field.append(e);
    return e;
  });

  root.replaceChildren(
    api.el('p', { class: 'muted' },
      `Tap the pad as the block crosses the line. Keyboard: ${KEYS.join(' ').toUpperCase()}.`),
    field);

  let hits = 0, misses = 0, finished = false;
  const HIT_Y = field.clientHeight - 62; // the hitline

  const t0 = ac.currentTime + leadIn;
  let backing = null;
  if (content.track && api.assets[content.track]) {
    backing = api.play(api.assets[content.track], { when: t0 });
  }

  const flash = (txt, good) => {
    judge.textContent = txt;
    judge.style.color = good ? 'var(--ok)' : 'var(--bad)';
    judge.classList.add('show');
    clearTimeout(flash._t);
    flash._t = setTimeout(() => judge.classList.remove('show'), 260);
  };

  const strike = (lane) => {
    pads[lane].classList.add('on');
    setTimeout(() => pads[lane].classList.remove('on'), 90);
    const now = ac.currentTime - t0;
    // nearest unhit note in this lane
    let best = null, bestD = Infinity;
    for (const n of notes) {
      if (n.lane !== lane || n.hit || n.missed) continue;
      const d = Math.abs(n.t - now);
      if (d < bestD) { bestD = d; best = n; }
    }
    const sample = api.assets[lanes[lane].asset];
    if (sample) api.play(sample, { gain: 0.9 });
    if (best && bestD <= win) {
      best.hit = true; hits++;
      els[best.i].style.display = 'none';
      flash(bestD < win / 2 ? 'Clean' : 'Good', true);
    } else {
      flash('Off', false);
    }
  };

  pads.forEach((p, i) => {
    p.addEventListener('pointerdown', e => { e.preventDefault(); strike(i); });
  });
  const onKey = e => {
    const i = KEYS.indexOf(e.key.toLowerCase());
    if (i >= 0) { e.preventDefault(); strike(i); }
  };
  window.addEventListener('keydown', onKey);

  const frame = () => {
    if (finished) return;
    const now = ac.currentTime - t0;
    for (const n of notes) {
      if (n.hit) continue;
      const dt = n.t - now;
      if (dt < -win && !n.missed) { n.missed = true; misses++; els[n.i].style.opacity = '.2'; }
      if (dt > approach || dt < -0.5) { els[n.i].style.visibility = 'hidden'; continue; }
      els[n.i].style.visibility = 'visible';
      const y = HIT_Y - (dt / approach) * HIT_Y;
      els[n.i].style.transform = `translateY(${y}px)`;
      api.setProgress(hits + misses, notes.length);
    }
    const last = notes[notes.length - 1];
    if (now > last.t + 1.2) return done();
    requestAnimationFrame(frame);
  };

  const done = () => {
    finished = true;
    window.removeEventListener('keydown', onKey);
    try { backing && backing.stop(); } catch {}
    api.finish({ score: hits, total: notes.length });
  };

  requestAnimationFrame(frame);
}
