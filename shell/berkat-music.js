// Original pentatonic background loop: soft metallic notes and sparse percussion.
// Synthesized in the browser; this is a new composition, not a traditional recording.
export function backgroundMusic({ root, el }) {
  const storageKey = 'hg:berkat-music';
  let enabled = true, volume = .35;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (typeof saved?.enabled === 'boolean') enabled = saved.enabled;
    if (Number.isFinite(saved?.volume)) volume = Math.max(0, Math.min(1, saved.volume));
  } catch {}

  let ac, master, timer, next = 0, step = 0, disposed = false, starting, failed = false;
  const voices = new Set();
  const melody = [
    0, null, null, 4, 7, null, 4, null, 2, null, 0, null, null, null, null, null,
    4, null, 7, null, 9, null, 7, null, 4, null, 2, null, null, null, null, null,
    7, null, null, 9, 12, null, 9, null, 7, null, 4, null, null, null, null, null,
    4, null, 2, null, 0, null, -3, null, 0, null, null, null, null, null, null, null
  ];
  const button = el('button', { class: 'btn', type: 'button', 'aria-pressed': 'false' });
  const slider = el('input', {
    type: 'range', min: '0', max: '100', step: '1', value: String(Math.round(volume * 100)),
    'aria-label': 'Music volume'
  });
  const note = el('span', { class: 'muted berkat-music-note' });
  const toolbar = el('div', { class: 'music-controls berkat-music', role: 'group', 'aria-label': 'Background music' },
    note, button, el('label', {}, 'Volume', slider));
  root.prepend(toolbar);

  const remember = () => {
    try { localStorage.setItem(storageKey, JSON.stringify({ enabled, volume })); } catch {}
  };
  const update = () => {
    const playing = enabled && ac?.state === 'running' && !document.hidden;
    button.textContent = playing ? 'Music on' : enabled ? 'Play music' : 'Music off';
    button.setAttribute('aria-pressed', String(Boolean(playing)));
    note.textContent = failed ? 'Music unavailable' : !ac && enabled ? 'Music starts when you play' : '';
  };
  const level = () => volume * .22;

  const tone = (frequency, time, duration, gain, partials) => {
    for (const [ratio, strength, decay] of partials) {
      const oscillator = ac.createOscillator(), envelope = ac.createGain();
      oscillator.frequency.value = frequency * ratio;
      envelope.gain.setValueAtTime(0, time);
      envelope.gain.linearRampToValueAtTime(gain * strength, time + .015);
      envelope.gain.exponentialRampToValueAtTime(.00001, time + duration * decay);
      oscillator.connect(envelope).connect(master);
      voices.add(oscillator);
      oscillator.onended = () => {
        voices.delete(oscillator);
        oscillator.disconnect(); envelope.disconnect();
      };
      oscillator.start(time);
      oscillator.stop(time + duration * decay + .03);
    }
  };
  const bell = (frequency, time, duration, gain) => tone(frequency, time, duration, gain,
    [[1, 1, 1], [2.76, .13, .45], [5.4, .025, .22]]);
  const schedule = () => {
    if (disposed || !enabled || document.hidden || ac.state !== 'running') return;
    // Skip a late tick instead of playing a burst of notes after a stalled tab.
    if (next < ac.currentTime) next = ac.currentTime + .04;
    while (next < ac.currentTime + .2) {
      const note = melody[step % melody.length];
      if (note !== null) bell(261.6256 * 2 ** (note / 12), next, 2.2, .24);
      if (step % 16 === 0) bell(step % 32 === 0 ? 130.8128 : 195.9977, next, 4, .16);
      if (step % 8 === 4) tone(145, next, .18, .08, [[1, 1, 1], [1.53, .22, .5]]);
      step++;
      next += .5;
    }
  };
  const start = () => {
    if (disposed || !enabled || document.hidden || starting) return starting;
    starting = (async () => {
      try {
        failed = false;
        if (!ac) {
          ac = new (window.AudioContext || window.webkitAudioContext)();
          master = ac.createGain();
          master.gain.value = 0;
          master.connect(ac.destination);
        }
        await ac.resume();
        if (disposed || !enabled || document.hidden) {
          if (ac.state === 'running') await ac.suspend();
          return;
        }
        master.gain.cancelScheduledValues(ac.currentTime);
        master.gain.setTargetAtTime(level(), ac.currentTime, .12);
        if (!timer) {
          next = ac.currentTime + .04;
          schedule();
          timer = setInterval(schedule, 80);
        }
      } catch {
        enabled = false;
        failed = true;
      }
    })().finally(() => {
      starting = null;
      update();
    });
    return starting;
  };
  const stop = () => {
    clearInterval(timer);
    timer = null;
    if (ac) {
      master.gain.cancelScheduledValues(ac.currentTime);
      master.gain.setValueAtTime(0, ac.currentTime);
      for (const voice of voices) voice.stop();
      if (ac.state !== 'closed') void ac.suspend().catch(() => {});
    }
    update();
  };
  button.addEventListener('click', () => {
    if (enabled && ac?.state === 'running') { enabled = false; stop(); }
    else { enabled = true; void start(); }
    remember(); update();
  });
  slider.addEventListener('input', () => {
    volume = Number(slider.value) / 100;
    if (ac && enabled) master.gain.setTargetAtTime(level(), ac.currentTime, .06);
    remember();
  });
  const interact = event => { if (!toolbar.contains(event.target)) void start(); };
  const visibility = () => { if (document.hidden) stop(); else void start(); };
  const pagehide = event => { if (event.persisted) stop(); else cleanup(); };
  const pageshow = () => { void start(); };
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    stop();
    document.removeEventListener('click', interact);
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('pagehide', pagehide);
    window.removeEventListener('pageshow', pageshow);
    if (ac && ac.state !== 'closed') void ac.close().catch(() => {});
  };
  // Start after the completed click, so updating the toolbar cannot move a
  // game button between pointerdown and pointerup. Keyboard clicks work too.
  document.addEventListener('click', interact);
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('pagehide', pagehide);
  window.addEventListener('pageshow', pageshow);
  update();
  return cleanup;
}
