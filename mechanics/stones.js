// stones — five stones scatter on the floor. Throw one up, sweep the called-for stones in one stroke, catch it.
// content: { lives?, steps:[ { title, picks:[ n, ... ] } ] }
//   picks has one entry per throw: how many stones that throw must sweep up.
//   A miss or a foul costs a life and the step starts again, as in the playground rule.
// The floor is a 100 by 100 field, whatever size it is drawn at.
export const meta = { id: 'stones', name: 'Five stones' };

export const HIT = 8;             // a stroke touches a stone within this distance of its centre
export const GAP = 20;            // stones never land closer than this, so one tap can't touch two
export const CATCH_R = 10;        // how close to the shadow a catch must be
export const CATCH_WINDOW = 350;  // ms before landing that a catch counts
export const CATCH_GRACE = 80;    // ms after landing, so a tap on the beat isn't lost to a frame
const STONE_R = 5;
const MARGIN = 10;
const AIR_MIN = 1300, AIR_MAX = 2200;   // ms in the air for the softest and hardest flick
const REACH_MIN = 12, REACH_MAX = 50;   // how far from the hand it lands, for the same two flicks
const FAST_FLICK = 2.6;                 // upward px per ms that counts as a full throw
const MIN_FLICK = 0.2;                  // anything slower isn't a throw
const SCATTER_MS = 900;
const FAIL_MS = 1600;
const COLOURS = ['#b3321f', '#c8962c', '#2f7a4f', '#3b5f9e', '#7a4a8c'];

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function segmentDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

// Random spots with at least GAP between any two.
export function scatter(rand, n = 5) {
  const stones = [];
  while (stones.length < n) {
    const s = { x: MARGIN + rand() * (100 - 2 * MARGIN), y: MARGIN + rand() * (100 - 2 * MARGIN) };
    if (stones.every(o => dist(o, s) >= GAP)) stones.push(s);
  }
  return stones;
}

// The stones a stroke has touched. A stroke is a list of points, joined up so a fast swipe can't skip one.
export function touched(stroke, stones) {
  return stones.filter(s => stroke.some((p, n) => segmentDist(s, stroke[Math.max(0, n - 1)], p) < HIT));
}

// Fastest upward stretch in the last moments, so a pause before letting go still counts.
// samples are [y, time]. Each stretch spans at least 16 ms so bursts of events don't inflate it.
// Returns 0 to 1, where 0 means it wasn't a throw.
export function flickPower(samples, now) {
  const recent = samples.filter(p => now - p[1] < 200);
  let speed = 0;
  for (let n = 1, m = 0; n < recent.length; n++) {
    while (m + 1 < n && recent[n][1] - recent[m + 1][1] >= 16) m++;
    speed = Math.max(speed, (recent[m][0] - recent[n][0]) / Math.max(16, recent[n][1] - recent[m][1]));
  }
  return speed <= MIN_FLICK ? 0 : Math.min(1, speed / FAST_FLICK);
}

// A harder flick stays up longer but lands further away. It never lands on a floor stone,
// so a catch can't be mistaken for a pick-up.
export function planThrow(power, rand, from, floor) {
  const airtime = AIR_MIN + (AIR_MAX - AIR_MIN) * power;
  let reach = REACH_MIN + (REACH_MAX - REACH_MIN) * power;
  for (;;) {
    const a = rand() * 2 * Math.PI;
    const landing = { x: from.x + reach * Math.cos(a), y: from.y + reach * Math.sin(a) };
    const inside = [landing.x, landing.y].every(v => v >= MARGIN && v <= 100 - MARGIN);
    if (inside && floor.every(s => dist(s, landing) >= CATCH_R + HIT)) return { landing, airtime };
    reach += 0.5;
    if (reach > 100) reach = REACH_MIN;
  }
}

// 'wide' is a tap away from the shadow, which isn't a catch attempt at all.
export function judgeCatch(tap, landing, now, landsAt) {
  if (dist(tap, landing) >= CATCH_R) return 'wide';
  if (now < landsAt - CATCH_WINDOW) return 'early';
  return now <= landsAt + CATCH_GRACE ? 'caught' : 'late';
}

export async function mount({ root, content, api }) {
  const { steps } = content;
  const totalThrows = steps.reduce((n, s) => n + s.picks.length, 0);
  const throwsBefore = k => steps.slice(0, k).reduce((n, s) => n + s.picks.length, 0);
  let lives = content.lives ?? 3;
  let step = 0, pick = 0, phase = 'wait', running = true;
  let floor = [], hand = { x: 50, y: 88 }, thrown = null, flight = null;
  let stroke = null, samples = [], scatteredAt = 0;

  const banner = api.el('div', { class: 'stones-banner', 'aria-live': 'polite' });
  const canvas = api.el('canvas', { class: 'stones-field' });
  root.replaceChildren(banner, canvas);
  const g = canvas.getContext('2d');

  const need = () => steps[step].picks[pick];
  const say = (headline, hint) => banner.replaceChildren(
    api.el('span', { class: 'kicker' },
      `${steps[step]?.title ?? 'Done'} · Throw ${pick + 1} of ${steps[step]?.picks.length ?? 0} · ${lives} ${lives === 1 ? 'life' : 'lives'}`),
    api.el('strong', {}, headline), api.el('span', { class: 'muted' }, hint));
  const stones = n => `${n} ${n === 1 ? 'stone' : 'stones'}`;

  const startStep = () => {
    pick = 0;
    thrown = null;
    hand = { x: 50, y: 88 };
    floor = scatter(Math.random).map((s, n) => ({ ...s, colour: COLOURS[n] }));
    phase = 'scatter';
    scatteredAt = performance.now();
    api.setProgress(throwsBefore(step), totalThrows);
    say('The stones scatter…', '');
    setTimeout(() => {
      phase = 'choose';
      say('Pick your throwing stone', 'Tap the stone you want to throw. It leaves the floor.');
    }, SCATTER_MS);
  };

  const readyToThrow = (headline = 'Flick up to throw') => {
    phase = 'ready';
    say(headline, `Then sweep up ${stones(need())} in one stroke and tap the shadow to catch.`);
  };

  const end = () => {
    running = false;
    const cleared = step === steps.length;
    api.finish({ score: step, total: steps.length,
      line: cleared ? 'Every step cleared without running out of lives.'
        : `You got as far as ${steps[step].title}. In the playground, that's where your next turn would begin.` });
  };

  const fail = (headline) => {
    flight = null;
    stroke = null;
    lives--;
    phase = 'wait';
    say(headline, lives ? 'This step starts again.' : 'No lives left.');
    setTimeout(() => lives ? startStep() : end(), FAIL_MS);
  };

  const caught = () => {
    hand = flight.landing;
    const swept = flight.swept;
    flight = null;
    stroke = null;
    if (!swept) return readyToThrow('Caught, but nothing swept up. Throw again');
    pick++;
    api.setProgress(throwsBefore(step) + pick, totalThrows);
    if (pick < steps[step].picks.length) return readyToThrow('Caught! Flick up again');
    step++;
    if (step === steps.length) end(); else startStep();
  };

  const toField = e => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * 100, y: (e.clientY - r.top) / r.height * 100 };
  };

  const strokeTo = p => {
    stroke.push(p);
    if (touched(stroke, floor).length > need()) fail('Foul! You touched another stone.');
  };

  canvas.addEventListener('pointerdown', e => {
    const p = toField(e), now = performance.now();
    canvas.setPointerCapture(e.pointerId);
    if (phase === 'choose') {
      const chosen = touched([p], floor)[0];
      if (!chosen) return;
      floor = floor.filter(s => s !== chosen);
      thrown = chosen;
      readyToThrow();
    } else if (phase === 'ready') {
      samples = [[e.clientY, e.timeStamp]];
    } else if (phase === 'air') {
      const verdict = judgeCatch(p, flight.landing, now, flight.landsAt);
      if (verdict === 'caught') caught();
      else if (verdict !== 'wide') fail('Too early! It slipped through your fingers.');
      else if (!flight.swept) { stroke = []; strokeTo(p); }
    }
  });

  canvas.addEventListener('pointermove', e => {
    if (phase === 'ready' && samples.length) samples.push([e.clientY, e.timeStamp]);
    if (phase === 'air' && stroke) strokeTo(toField(e));
  });

  canvas.addEventListener('pointerup', e => {
    if (phase === 'ready' && samples.length) {
      samples.push([e.clientY, e.timeStamp]);
      const power = flickPower(samples, e.timeStamp);
      samples = [];
      if (!power) return;
      const { landing, airtime } = planThrow(power, Math.random, hand, floor);
      flight = { landing, from: hand, airtime, landsAt: performance.now() + airtime, swept: false };
      phase = 'air';
      say(`Sweep up ${stones(need())}!`, 'One stroke, touching nothing else. Then tap the shadow as the ring closes.');
    } else if (phase === 'air' && stroke) {
      const hits = touched(stroke, floor);
      stroke = null;
      if (hits.length !== need()) return;
      floor = floor.filter(s => !hits.includes(s));
      flight.swept = true;
      say('Now catch it!', 'Tap the shadow as the ring closes.');
    }
  });

  canvas.addEventListener('pointercancel', () => { samples = []; stroke = null; });

  const drawStone = (x, y, r, colour, lit) => {
    g.beginPath();
    g.arc(x, y, r, 0, 2 * Math.PI);
    g.fillStyle = colour;
    g.fill();
    g.lineWidth = lit ? 1.4 : 0.5;
    g.strokeStyle = lit ? '#fffdf8' : 'rgba(26,21,18,.55)';
    g.stroke();
  };

  const ring = (x, y, r, colour, width = 0.8) => {
    g.beginPath();
    g.arc(x, y, r, 0, 2 * Math.PI);
    g.strokeStyle = colour;
    g.lineWidth = width;
    g.stroke();
  };

  const drawFlight = now => {
    const { landing, from, airtime, landsAt } = flight;
    const left = landsAt - now, t = Math.min(1, 1 - left / airtime), height = 4 * t * (1 - t);
    g.beginPath();
    g.ellipse(landing.x, landing.y, STONE_R, STONE_R * 0.8, 0, 0, 2 * Math.PI);
    g.fillStyle = 'rgba(26,21,18,.45)';
    g.fill();
    g.strokeStyle = '#c8962c';   // the outline keeps the shadow visible on the dark theme's floor
    g.lineWidth = 0.6;
    g.stroke();
    const open = left <= CATCH_WINDOW;
    ring(landing.x, landing.y, CATCH_R + Math.max(0, left / airtime) * 26, open ? '#2f7a4f' : '#b3321f', open ? 1.4 : 0.8);
    const x = from.x + (landing.x - from.x) * t, y = from.y + (landing.y - from.y) * t;
    drawStone(x, y - height * 22, STONE_R * (1 + height * 0.9), thrown.colour);
  };

  const frame = now => {
    if (!running) return;
    if (phase === 'air' && now > flight.landsAt + CATCH_GRACE) fail('Dropped! The stone hit the floor.');
    const size = Math.round(canvas.clientWidth * devicePixelRatio);
    if (canvas.width !== size) canvas.width = canvas.height = size;
    g.setTransform(size / 100, 0, 0, size / 100, 0, 0);
    g.clearRect(0, 0, 100, 100);
    const lit = stroke ? touched(stroke, floor) : [];
    floor.forEach((s, n) => {
      // Each stone arcs out of the hand and settles where it fell.
      const t = phase === 'scatter' ? Math.max(0, Math.min(1, (now - scatteredAt - n * 90) / (SCATTER_MS - 400))) : 1;
      const ease = 1 - (1 - t) ** 3;
      drawStone(hand.x + (s.x - hand.x) * ease, hand.y + (s.y - hand.y) * ease - Math.sin(t * Math.PI) * 10,
        STONE_R, s.colour, lit.includes(s));
    });
    if (stroke?.length > 1) {
      g.beginPath();
      stroke.forEach((p, n) => n ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y));
      g.strokeStyle = 'rgba(200,150,44,.7)';
      g.lineWidth = 2;
      g.lineCap = 'round';
      g.stroke();
    }
    if (phase === 'ready') {
      drawStone(hand.x, hand.y, STONE_R, thrown.colour);
      ring(hand.x, hand.y, STONE_R + 3 + Math.sin(now / 250), '#c8962c');
    }
    if (flight) drawFlight(now);
    requestAnimationFrame(frame);
  };

  startStep();
  requestAnimationFrame(frame);
}
