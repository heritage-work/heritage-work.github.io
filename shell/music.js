// Original, gently plucked instrumental with a drone and light hand-drum sounds.
// Synthesized locally: no recordings, downloads or third-party audio services.
export function backgroundMusic({ root, el }) {
  let ac, master, timer, beat = 0, next = 0, enabled = true, disposed = false;
  const voices = new Set();
  const melody = [
    0, null, 2, 4, 7, null, 4, 2, 0, null, -3, 0, 2, null, null, null,
    4, null, 7, 9, 12, null, 9, 7, 4, 2, 0, null, 2, null, null, null,
    7, null, 9, 7, 4, null, 2, 0, -3, null, 0, 2, 4, null, null, null,
    9, null, 7, 4, 2, null, 0, -3, 0, null, 2, -3, 0, null, null, null
  ];
  const button = el('button', { class: 'btn', type: 'button', 'aria-pressed': 'true' }, 'Music on');
  const toolbar = el('div', { class: 'music-controls' }, button);
  root.prepend(toolbar);

  const voice = (frequency, time, duration, volume, harmonics = [1, .35, .16, .08]) => {
    const envelope = ac.createGain();
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(volume, time + .012);
    envelope.gain.exponentialRampToValueAtTime(.0001, time + duration);
    envelope.connect(master);
    let remaining = harmonics.length;
    harmonics.forEach((amplitude, i) => {
      const oscillator = ac.createOscillator(), partial = ac.createGain();
      oscillator.frequency.value = frequency * (i + 1);
      partial.gain.value = amplitude;
      oscillator.connect(partial).connect(envelope);
      voices.add(oscillator);
      oscillator.onended = () => {
        voices.delete(oscillator);
        oscillator.disconnect(); partial.disconnect();
        if (--remaining === 0) envelope.disconnect();
      };
      oscillator.start(time); oscillator.stop(time + duration + .02);
    });
  };

  const drum = (time, bass) => {
    const oscillator = ac.createOscillator(), envelope = ac.createGain();
    oscillator.frequency.setValueAtTime(bass ? 150 : 390, time);
    oscillator.frequency.exponentialRampToValueAtTime(bass ? 72 : 220, time + .09);
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(bass ? .18 : .065, time + .003);
    envelope.gain.exponentialRampToValueAtTime(.0001, time + .22);
    oscillator.connect(envelope).connect(master);
    voices.add(oscillator);
    oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); envelope.disconnect(); };
    oscillator.start(time); oscillator.stop(time + .25);
  };

  const schedule = () => {
    if (ac.state !== 'running') return;
    while (next < ac.currentTime + .25) {
      const n = beat % melody.length, note = melody[n];
      if (note !== null) voice(261.6256 * 2 ** (note / 12), next, 1.6, .2);
      if (beat % 8 === 0) voice(130.8128, next, 5, .15, [1, .45, .22, .12, .06]);
      if (beat % 8 === 4) voice(97.9989, next, 4, .12, [1, .4, .18, .08]);
      if (beat % 4 === 0) drum(next, true);
      if (beat % 4 === 2 || beat % 8 === 7) drum(next, false);
      beat++; next += .375;
    }
  };

  const start = async () => {
    if (!enabled || disposed || document.hidden) return;
    try {
      if (!ac) {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        master = ac.createGain(); master.gain.value = .22; master.connect(ac.destination);
      }
      await ac.resume();
      if (!enabled || disposed || document.hidden) return;
      if (!timer) {
        next = ac.currentTime + .04;
        schedule(); timer = setInterval(schedule, 100);
      }
    } catch {
      enabled = false; update();
    }
  };
  const stop = () => {
    clearInterval(timer); timer = null;
    for (const oscillator of voices) oscillator.stop();
    if (ac) void ac.suspend();
  };
  const update = () => {
    button.textContent = enabled ? 'Music on' : 'Music off';
    button.setAttribute('aria-pressed', String(enabled));
  };
  button.addEventListener('click', () => {
    enabled = !enabled; update();
    if (enabled) void start(); else stop();
  });
  const interact = e => { if (!button.contains(e.target)) void start(); };
  const visibility = () => { if (document.hidden) stop(); else void start(); };
  const pagehide = e => { if (e.persisted) stop(); else cleanup(); };
  const pageshow = () => { void start(); };
  const cleanup = () => {
    disposed = true; stop();
    document.removeEventListener('pointerdown', interact);
    document.removeEventListener('keydown', interact);
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('pagehide', pagehide);
    window.removeEventListener('pageshow', pageshow);
    if (ac) void ac.close();
  };
  document.addEventListener('pointerdown', interact);
  document.addEventListener('keydown', interact);
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('pagehide', pagehide);
  window.addEventListener('pageshow', pageshow);
  return cleanup;
}
