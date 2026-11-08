// spice — run a spice counter: scoop a mix, grind or bag it, and hand it over before patience runs out.
// Content: { spices, blends, customers, days }. A day: { title, intro, steps?, spices, blends, spots,
// customers, gap, patience, mills, grind, goals:[1★,2★,3★], hidden? }.
// The rules (everything above mount) are pure, so tests can play whole days without a DOM.
import { rng } from './tray.js';

export const meta = { id: 'spice', name: 'Spice counter' };

export const TRAY_MAX = 8;     // scoops the tray holds
export const SHELF_SIZE = 3;   // finished packets waiting to be handed over
export const WRONG_COST = .3;  // share of a customer's patience lost to a wrong packet
export const PEEK_COST = 1;    // dollars to look a recipe up on a hidden day
export const STREAK_MAX = 5;   // most dollars a streak adds to one sale

const scoops = mix => Object.values(mix).reduce((a, b) => a + b, 0);
const formOf = blend => blend.whole ? 'whole' : 'ground';

// Scoops separating two mixes. 0 is the same mix.
export function distance(a, b) {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .reduce((sum, id) => sum + Math.abs((a[id] || 0) - (b[id] || 0)), 0);
}

// The wrong form always fails: ground panch phoron can't be un-ground. One scoop off is a poor sale.
export function grade(packet, blend) {
  if (packet.form !== formOf(blend)) return { grade: 'wrong', reason: 'form' };
  const off = distance(packet.mix, blend.recipe);
  if (off === 0) return { grade: 'exact' };
  return off === 1 ? { grade: 'close', reason: 'mix' } : { grade: 'wrong', reason: 'mix' };
}

// What a packet says on its label: the blend it exactly is, or nothing.
export function identify(packet, blends) {
  return blends.find(b => grade(packet, b).grade === 'exact') ?? null;
}

// exact: price, tip for patience left, streak bonus. close: half price. wrong: nothing.
export function payment(result, blend, customer, patienceLeft, streak) {
  const base = blend.price * customer.pay;
  if (result === 'exact') return Math.round(base + base * .5 * patienceLeft) + Math.min(streak, STREAK_MAX);
  return result === 'close' ? Math.round(base / 2) : 0;
}

// One arrival per customer, at a jittered gap. Never the same blend three times running,
// never the same person twice running.
export function schedule(day, content, random = Math.random) {
  const out = [];
  let at = 0;
  for (let i = 0; i < day.customers; i++) {
    const a = out[i - 1], b = out[i - 2];
    const fresh = day.blends.filter(id => !(a && b && a.blend === id && b.blend === id));
    const blends = fresh.length ? fresh : day.blends;  // a one-blend day has nothing else to offer
    const people = content.customers.map((_, n) => n).filter(n => !a || n !== a.customer);
    out.push({
      at,
      blend: blends[Math.floor(random() * blends.length)],
      customer: people[Math.floor(random() * people.length)]
    });
    at += day.gap * (.75 + random() * .5);
  }
  return out;
}

export function newDay(day, content, random = Math.random) {
  return {
    day, t: 0, money: 0, streak: 0, served: 0, lost: 0, nextId: 1, nextOrder: 1,
    blends: Object.fromEntries(content.blends.map(b => [b.id, b])),
    people: content.customers,
    queue: schedule(day, content, random),
    spots: Array(day.spots).fill(null),
    mills: Array(day.mills).fill(null),
    tray: {}, trayOrder: null, shelf: [], log: []
  };
}

export function isDone(s) {
  return !s.queue.length && s.spots.every(c => !c);
}

// Customers who have turned up but can't reach the counter yet.
export function waiting(s) {
  return s.queue.filter(q => q.at <= s.t).length;
}

export const dollars = n => `${n < 0 ? '-' : ''}$${Math.abs(n)}`;

export function stars(money, goals) {
  return goals.filter(g => money >= g).length;
}

export function tick(s, dt) {
  s.t += dt;
  s.mills.forEach((job, i) => {
    if (!job) return;
    job.left = Math.max(0, job.left - dt);
    // A full shelf stalls the mill: the packet has nowhere to go.
    if (job.left === 0 && s.shelf.length < SHELF_SIZE) {
      s.shelf.push({ id: s.nextId++, mix: job.mix, form: 'ground', order: job.order });
      s.mills[i] = null;
      s.log.push({ type: 'milled' });
    }
  });
  s.spots.forEach((c, i) => {
    if (!c) return;
    c.patience -= dt;
    if (c.patience <= 0) {
      s.spots[i] = null;
      s.lost++;
      s.streak = 0;
      s.log.push({ type: 'left', spot: i, customer: c });
    }
  });
  for (let i = 0; i < s.spots.length && s.queue[0]?.at <= s.t; i++) {
    if (s.spots[i]) continue;
    const next = s.queue.shift(), person = s.people[next.customer];
    const max = s.day.patience * person.patience;
    s.spots[i] = { id: s.nextId++, number: s.nextOrder++, person, blend: s.blends[next.blend], patience: max, max, peeked: false };
    s.log.push({ type: 'arrived', spot: i });
  }
}

export function scoop(s, id, customerId = null) {
  if (scoops(s.tray) >= TRAY_MAX) return false;
  if (!scoops(s.tray)) {
    const customer = s.spots.find(c => c?.id === customerId);
    s.trayOrder = customer ? { id: customer.id, number: customer.number, name: customer.person.name, blend: customer.blend.id } : null;
  }
  s.tray[id] = (s.tray[id] || 0) + 1;
  return true;
}

export function unscoop(s, id) {
  if (!s.tray[id]) return false;
  if (--s.tray[id] === 0) delete s.tray[id];
  if (!scoops(s.tray)) s.trayOrder = null;
  return true;
}

export function tipBack(s) {
  if (!scoops(s.tray)) return false;
  s.tray = {};
  s.trayOrder = null;
  return true;
}

export function canGrind(s) {
  return scoops(s.tray) > 0 && s.mills.includes(null);
}

export function grind(s) {
  if (!canGrind(s)) return false;
  s.mills[s.mills.indexOf(null)] = { mix: s.tray, left: s.day.grind, order: s.trayOrder };
  s.tray = {};
  s.trayOrder = null;
  return true;
}

export function canBag(s) {
  return scoops(s.tray) > 0 && s.shelf.length < SHELF_SIZE;
}

export function bagWhole(s) {
  if (!canBag(s)) return false;
  s.shelf.push({ id: s.nextId++, mix: s.tray, form: 'whole', order: s.trayOrder });
  s.tray = {};
  s.trayOrder = null;
  return true;
}

export function bin(s, packetId) {
  const i = s.shelf.findIndex(p => p.id === packetId);
  if (i < 0) return false;
  s.shelf.splice(i, 1);
  return true;
}

// Goes on credit: a hidden day starts at $0, and the first customer may need the book most.
export function peek(s, spot) {
  const c = s.spots[spot];
  if (!c || c.peeked || !s.day.hidden) return false;
  c.peeked = true;
  s.money -= PEEK_COST;
  return true;
}

// A wrong packet is used up and costs patience, but the customer stays and still wants their blend.
export function serve(s, packetId, spot) {
  const c = s.spots[spot], i = s.shelf.findIndex(p => p.id === packetId);
  if (!c || i < 0) return null;
  const [packet] = s.shelf.splice(i, 1);
  const verdict = grade(packet, c.blend);
  const earned = payment(verdict.grade, c.blend, c.person, c.patience / c.max, s.streak);
  s.money += earned;
  if (verdict.grade === 'wrong') {
    c.patience -= c.max * WRONG_COST;
    s.streak = 0;
  } else {
    s.spots[spot] = null;
    s.served++;
    s.streak = verdict.grade === 'exact' ? s.streak + 1 : 0;
  }
  const result = { type: 'served', spot, earned, person: c.person, ...verdict };
  s.log.push(result);
  return result;
}

// ---------------------------------------------------------------------------
// Drawings for the sacks and tools; customer and shop artwork loads from game assets.
// ---------------------------------------------------------------------------
const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...kids) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  n.append(...kids);
  return n;
};

// Recognisable ingredient silhouettes, shared by the sacks and recipe slip.
function drawIngredient(spice) {
  const out = svg('svg', { viewBox: '0 0 80 56', 'aria-hidden': 'true' });
  const group = (x, y, angle, ...kids) => svg('g', { transform: `translate(${x} ${y}) rotate(${angle})` }, ...kids);
  if (spice.id === 'chilli') {
    for (const [x, y, a] of [[16, 15, -20], [35, 10, 20], [48, 23, 40]]) out.append(group(x, y, a,
      svg('path', { d: 'M0 0Q24 -9 21 6Q17 22 1 29Q12 15 9 6Z', fill: '#c33c26', stroke: '#862719', 'stroke-width': 1.2 }),
      svg('path', { d: 'M0 0Q4 -6 10 -5', fill: 'none', stroke: '#627447', 'stroke-width': 3 }),
      svg('path', { d: 'M13 4Q16 10 9 19', fill: 'none', stroke: '#ed7950', 'stroke-width': 1.5 })));
  } else if (spice.id === 'cinnamon') {
    for (const [x, y, a] of [[15, 18, -14], [29, 10, 23], [20, 33, -5]]) out.append(group(x, y, a,
      svg('rect', { width: 43, height: 10, rx: 3, fill: '#aa6338', stroke: '#713e25', 'stroke-width': 1.5 }),
      svg('path', { d: 'M4 3H39M4 7H39', stroke: '#d59960', 'stroke-width': 1 }),
      svg('ellipse', { cx: 43, cy: 5, rx: 3, ry: 5, fill: '#673c28' }),
      svg('path', { d: 'M43 2Q39 5 43 8Q46 5 43 4', fill: 'none', stroke: '#d59960', 'stroke-width': 1 })));
  } else if (spice.id === 'turmeric') {
    out.append(svg('path', { d: 'M7 40Q16 29 23 28Q37 1 50 23Q59 25 74 41Q42 55 7 40Z', fill: '#e6a81e' }),
      svg('path', { d: 'M18 36Q34 19 43 19Q46 29 62 37', fill: 'none', stroke: '#f8cd4f', 'stroke-width': 3 }));
    const random = rng(19);
    for (let i = 0; i < 45; i++) out.append(svg('circle', { cx: 19 + random() * 41, cy: 34 + random() * 9, r: .7, fill: '#c58a12' }));
  } else {
    const random = rng(spice.id.length * 13);
    const large = ['clove', 'cardamom'].includes(spice.id);
    for (let i = 0; i < (large ? 8 : 27); i++) {
      const x = 13 + random() * 54, y = 10 + random() * 33, a = random() * 180;
      let item;
      if (spice.id === 'clove') item = group(x, y, a,
        svg('path', { d: 'M0 1L1 14L3 1Z', fill: '#633e29', stroke: '#40281e', 'stroke-width': .8 }),
        svg('path', { d: 'M-2 0L-3 -4L1 -3L5 -4L4 0Z', fill: '#845335' }),
        svg('circle', { cx: 1, cy: -3, r: 3, fill: '#5b3425' }));
      else if (spice.id === 'cardamom') item = group(x, y, a,
        svg('path', { d: 'M0 -8Q13 0 0 9Q-10 1 0 -8Z', fill: '#b0bb7b', stroke: '#71804b', 'stroke-width': 1.2 }),
        svg('path', { d: 'M0 -6Q5 0 0 7M0 -6Q-4 0 0 7', fill: 'none', stroke: '#7f8e53', 'stroke-width': 1 }));
      else if (spice.id === 'coriander' || spice.id === 'pepper' || spice.id === 'mustard') {
        const r = spice.id === 'mustard' ? 2.1 : 3.6;
        item = group(x, y, 0, svg('circle', { r, fill: spice.colour, stroke: spice.speck, 'stroke-width': 1 }),
          svg('path', { d: `M-1 ${-r + 1}Q-3 0 -1 ${r - 1}`, fill: 'none', stroke: spice.id === 'coriander' ? '#ead09a' : '#a2917e', 'stroke-width': .9 }));
      } else if (spice.id === 'fenugreek' || spice.id === 'nigella') item = group(x, y, a,
        svg('path', { d: spice.id === 'nigella' ? 'M-2 -3L3 -1L1 3L-3 1Z' : 'M-3 -3L3 -2L2 3L-3 2Z', fill: spice.colour, stroke: spice.speck, 'stroke-width': .9 }));
      else item = group(x, y, a,
        svg('path', { d: 'M-1 -5Q5 0 1 6Q-4 1 -1 -5Z', fill: spice.colour, stroke: spice.speck, 'stroke-width': 1 }),
        svg('path', { d: 'M0 -3L1 4', stroke: spice.id === 'fennel' ? '#d3d99a' : '#c1a371', 'stroke-width': 1 }));
      out.append(item);
    }
  }
  return out;
}

// Open burlap sacks keep the counter's original provision-shop character.
function drawSack(spice) {
  const out = svg('svg', { viewBox: '0 0 100 80', 'aria-hidden': 'true' },
    svg('ellipse', { cx: 50, cy: 74, rx: 35, ry: 4, fill: '#322619', opacity: .14 }),
    svg('path', { d: 'M18 31Q10 50 14 68Q17 77 50 76Q83 77 86 68Q90 50 82 31Z', fill: '#b99661', stroke: '#8c6c40', 'stroke-width': 1.5 }),
    svg('path', { d: 'M22 39Q14 61 22 69M78 39Q86 61 78 69M31 43L28 72M69 43L72 72', fill: 'none', stroke: '#d4b57f', 'stroke-width': 2 }),
    svg('path', { d: 'M19 52H81M17 57H83M18 62H82M20 67H80', stroke: '#977344', 'stroke-width': .6, opacity: .55 }),
    svg('ellipse', { cx: 50, cy: 32, rx: 35, ry: 19, fill: '#dec496', stroke: '#8c6c40', 'stroke-width': 2 }),
    svg('ellipse', { cx: 50, cy: 31, rx: 30, ry: 15, fill: spice.colour }));
  const ingredients = drawIngredient(spice);
  ingredients.setAttribute('x', '18'); ingredients.setAttribute('y', '5');
  ingredients.setAttribute('width', '64'); ingredients.setAttribute('height', '45');
  out.append(ingredients,
    svg('path', { d: 'M16 33Q50 59 84 33L83 39Q50 64 17 39Z', fill: '#d6b882', stroke: '#a4814c', 'stroke-width': 1 }),
    svg('rect', { x: 33, y: 55, width: 34, height: 14, rx: 1, fill: '#efe1bd', transform: 'rotate(-3 50 62)' }),
    svg('path', { d: 'M39 60H61M43 64H57', stroke: '#a58450', 'stroke-width': 1 }));
  return out;
}

function drawMill() {
  return svg('svg', { viewBox: '0 0 80 70', class: 'spice-mill-art', 'aria-hidden': 'true' },
    svg('path', { d: 'M18 12H54L46 30H27Z', fill: '#b8bbb0', stroke: '#697568', 'stroke-width': 2 }),
    svg('path', { d: 'M25 30H48V53H25Z', fill: '#667f6c', stroke: '#38513e', 'stroke-width': 2 }),
    svg('path', { d: 'M25 50L16 63H59L48 50', fill: '#38513e' }),
    svg('path', { d: 'M49 38H61V49', fill: 'none', stroke: '#829082', 'stroke-width': 5 }),
    svg('circle', { cx: 35, cy: 41, r: 11, fill: '#e4ddc4', stroke: '#38513e', 'stroke-width': 2 }),
    svg('path', { class: 'spice-wheel', d: 'M35 31V51M25 41H45M28 34L42 48M28 48L42 34', stroke: '#6d7d69', 'stroke-width': 2 }),
    svg('path', { d: 'M56 53H67L66 65H57Z', fill: '#cda870', stroke: '#99733f', 'stroke-width': 1 }));
}

function drawPacket() {
  return svg('svg', { viewBox: '0 0 48 54', class: 'spice-packet-art', 'aria-hidden': 'true' },
    svg('path', { d: 'M10 4H38L35 13L41 48Q24 54 7 48L13 13Z', fill: '#cda870', stroke: '#99733f', 'stroke-width': 1.5 }),
    svg('path', { d: 'M13 12H35M15 8H33', stroke: '#8d6438', 'stroke-width': 2 }),
    svg('rect', { x: 12, y: 24, width: 24, height: 16, rx: 2, fill: '#fff7df' }),
    svg('path', { d: 'M18 29H30M20 34H28', stroke: '#9e7450', 'stroke-width': 1.5 }));
}

// Asset images are preloaded by the shell; each customer gets their own DOM node.
function portraitImage(asset) {
  const image = asset.cloneNode();
  image.alt = '';
  image.setAttribute('aria-hidden', 'true');
  image.draggable = false;
  return image;
}

// ---------------------------------------------------------------------------
// The game.
// ---------------------------------------------------------------------------
export async function mount({ root, content, api }) {
  const { el } = api;
  document.body.classList.add('spice-page');
  root.classList.add('spice-stage');
  const spiceById = Object.fromEntries(content.spices.map(s => [s.id, s]));
  const earned = [];  // best stars per day cleared
  let muted = false, finished = false;
  const enterLandscape = async () => {
    try { if (!document.fullscreenElement && root.requestFullscreen) await root.requestFullscreen({ navigationUI: 'hide' }); } catch {}
    try { if (screen.orientation?.lock) await screen.orientation.lock('landscape'); } catch {}
  };
  const leaveFullscreen = async () => {
    try { screen.orientation?.unlock?.(); } catch {}
    try { if (document.fullscreenElement) await document.exitFullscreen(); } catch {}
  };

  const sound = (freq, length = .08, type = 'triangle', volume = .08) => {
    if (muted) return;
    try {
      const ac = api.audioContext(), now = ac.currentTime;
      void ac.resume();
      const osc = ac.createOscillator(), gain = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(.0001, now + length);
      osc.connect(gain).connect(ac.destination);
      osc.start(now);
      osc.stop(now + length);
    } catch {}
  };
  const chime = () => { sound(880, .12); setTimeout(() => sound(1320, .16), 70); };

  const chip = spice => el('span', { class: 'spice-chip' }, drawIngredient(spice), spice.name);
  const heading = (number, title, note) => el('div', { class: 'spice-section-head' },
    el('span', { class: 'spice-step-number', 'aria-hidden': 'true' }, number),
    el('h3', {}, title), note ? el('span', {}, note) : null);
  const starLine = n => '★'.repeat(n) + '☆'.repeat(3 - n);
  const orderNumber = order => `#${String(order.number ?? order.id).padStart(2, '0')}`;
  const totalStars = () => earned.reduce((a, b) => a + b, 0);

  const finish = () => {
    if (finished) return;
    finished = true;
    document.body.classList.remove('spice-playing');
    void leaveFullscreen();
    const score = totalStars(), total = content.days.length * 3;
    const line = earned.length < content.days.length ? 'You closed up early. The sacks will be here tomorrow.'
      : score === total ? 'The whole of Serangoon Road is talking about your counter.'
      : score >= total * .7 ? 'Regulars now cross the road to buy from you.'
      : 'You made it through Deepavali week. The shop is still standing.';
    api.finish({ score, total, line });
  };

  // Before each day: what's new, and what to earn.
  function dayIntro(index) {
    document.body.classList.remove('spice-playing');
    const day = content.days[index], previous = content.days[index - 1];
    const fresh = day.spices.filter(id => !previous?.spices.includes(id));
    const names = day.blends.filter(id => !previous?.blends.includes(id))
      .map(id => content.blends.find(b => b.id === id).name);
    api.setProgress(0, day.customers);
    root.replaceChildren(el('div', { class: 'spice-card' },
      el('div', { class: 'kicker' }, `Day ${index + 1} of ${content.days.length}`),
      el('div', { class: 'spice-intro-art', 'aria-hidden': 'true' }, fresh.slice(0, 3).map(id => drawSack(spiceById[id]))),
      el('h2', {}, day.title),
      el('p', {}, day.intro),
      day.steps ? el('ol', { class: 'spice-steps' }, day.steps.map(s => el('li', {}, s))) : null,
      names.length ? el('p', { class: 'muted' }, `New on the list: ${names.join(', ')}`) : null,
      fresh.length ? el('div', { class: 'spice-chips' }, fresh.map(id => chip(spiceById[id]))) : null,
      el('div', { class: 'spice-targets' }, day.goals.map((amount, i) => el('div', {},
        el('span', { 'aria-label': `${i + 1} stars` }, '★'.repeat(i + 1)), el('strong', {}, `$${amount}`),
        el('small', {}, i === 0 ? 'Stay open' : i === 1 ? 'Good business' : 'A perfect day')))),
      el('button', { class: 'btn primary', onclick: async () => {
        if (matchMedia('(pointer: coarse)').matches) await enterLandscape();
        playDay(index);
      } }, 'Open the shop')));
  }

  function dayEnd(index, s) {
    document.body.classList.remove('spice-playing');
    const day = content.days[index], got = stars(s.money, day.goals), last = index === content.days.length - 1;
    const passed = got > 0;
    if (passed) { earned[index] = Math.max(earned[index] || 0, got); chime(); } else sound(160, .3, 'sawtooth', .05);
    root.replaceChildren(el('div', { class: 'spice-card' },
      el('div', { class: 'kicker' }, `Day ${index + 1}: ${day.title}`),
      el('h2', {}, passed ? 'Shutters down' : 'A slow day'),
      el('div', { class: 'spice-stars', 'aria-label': `${got} of 3 stars` }, starLine(got)),
      el('p', {}, `You earned ${dollars(s.money)}. ${s.served} served, ${s.lost} walked out.`),
      el('p', { class: 'muted' }, passed
        ? (got < 3 ? `$${day.goals[got]} would have earned ${got === 2 ? 'three stars' : 'the next star'}.` : 'A perfect day.')
        : `You needed $${day.goals[0]} to stay open.`),
      el('div', { class: 'row spice-actions' },
        passed
          ? el('button', { class: 'btn primary', onclick: () => last ? finish() : dayIntro(index + 1) }, last ? 'See how you did' : 'Next day')
          : el('button', { class: 'btn primary', onclick: () => playDay(index) }, 'Try the day again'),
        passed && got < 3 ? el('button', { class: 'btn', onclick: () => playDay(index) }, 'Replay day') : null,
        !passed ? el('button', { class: 'btn', onclick: finish }, 'Close the shop') : null)));
  }

  function playDay(index) {
    document.body.classList.add('spice-playing');
    window.scrollTo(0, 0);
    const day = content.days[index];
    const s = newDay(day, content);
    const blends = Object.values(s.blends);
    let focus = null, selected = null, last = 0, closing = false, paused = false, uprightAllowed = false;
    let started = !day.steps?.length, departedOrder = null, lastNotice = '', noticeUntil = 0;
    let actionNotice = '', actionNoticeUntil = 0;
    // Let a new player read the first order before the day starts moving.
    if (!started) tick(s, 0);

    const set = (node, value) => { if (node.textContent !== value) node.textContent = value; };
    const reveal = node => {
      if (node === pad) showStation('order');
      if (node === handover) showStation('output');
    };
    const notice = text => { actionNotice = text; actionNoticeUntil = s.t + 3; };
    const matchingRecipient = (packet, customer) => {
      const owner = packet?.order && s.spots.find(c => c?.id === packet.order.id);
      return packet && (owner ? owner.id === customer.id : grade(packet, customer.blend).grade === 'exact');
    };
    const nextUnpreparedOrder = () => {
      const preparing = new Set([...s.mills.filter(Boolean), ...s.shelf].map(item => item.order?.id));
      return s.spots.filter(c => c && !preparing.has(c.id)).sort((a, b) => a.patience / a.max - b.patience / b.max)[0]?.id ?? null;
    };

    // HUD
    const money = el('strong', {}), goal = el('span', { class: 'muted' }), streak = el('span', { class: 'spice-streak' }), queue = el('span', { class: 'muted' });
    const muteButton = el('button', { class: 'spice-mute', type: 'button', 'aria-pressed': String(!muted), onclick: () => {
      muted = !muted;
      muteButton.setAttribute('aria-pressed', String(!muted));
      set(muteButton, muted ? 'Effects off' : 'Effects on');
    } }, muted ? 'Effects off' : 'Effects on');
    const pauseButton = el('button', { class: 'spice-pause', type: 'button', 'aria-pressed': 'false', onclick: () => {
      paused = !paused;
      pauseButton.setAttribute('aria-pressed', String(paused));
      set(pauseButton, paused ? 'Resume day' : 'Pause');
      work.classList.toggle('paused', paused);
      pauseNotice.hidden = !paused;
    } }, 'Pause');
    const earningsFill = el('i');
    const fullscreenButton = el('button', { class: 'spice-fullscreen', type: 'button', onclick: () => {
      if (document.fullscreenElement) void leaveFullscreen(); else void enterLandscape();
    } }, 'Fullscreen');
    const musicButton = el('button', { class: 'spice-mute', type: 'button', onclick: () => {
      root.parentElement?.querySelector(':scope > .music-controls button')?.click();
    } }, 'Music on');
    const hud = el('div', { class: 'spice-hud' },
      el('div', { class: 'spice-day-title' }, el('span', { class: 'kicker' }, `Day ${index + 1} / ${content.days.length}`), el('strong', {}, day.title)),
      el('div', { class: 'spice-earnings' }, el('span', {}, money, ' ', goal),
        el('span', { class: 'spice-earnings-bar', 'aria-hidden': 'true' }, earningsFill)),
      streak, queue, el('div', { class: 'spice-hud-controls' }, pauseButton, musicButton, muteButton, fullscreenButton),
      el('a', { class: 'spice-back', href: 'index.html' }, 'All games'));

    // Customers. Each spot keeps its element for the whole day, so a tap is never lost to a redraw.
    const spots = s.spots.map((_, i) => {
      const portrait = el('div', { class: 'spice-portrait' }), name = el('span', { class: 'spice-want' });
      const personName = el('span', { class: 'spice-person-name' });
      const patienceLabel = el('span', { class: 'spice-wait' });
      const action = el('span', { class: 'spice-customer-action' }, 'Waiting for a customer');
      const fill = el('i'), bar = el('span', { class: 'spice-patience' }, fill), say = el('span', { class: 'spice-say', role: 'status' });
      const button = el('button', { class: 'spice-spot', type: 'button', disabled: '', onclick: () => tapSpot(i) },
        el('span', { class: 'spice-order-bubble' }, name), portrait, personName, patienceLabel, action, bar, say);
      return { button, portrait, personName, name, patienceLabel, action, fill, say, id: null, sayUntil: 0, departedUntil: 0 };
    });
    const shopArt = portraitImage(api.assets.shopInterior);
    shopArt.className = 'spice-shelves';
    const shelves = el('div', { class: 'spice-shop', style: `--spots:${day.spots}` }, shopArt, ...spots.map(v => v.button));
    const shopStatus = el('span', { class: 'spice-shop-status', role: 'status' });
    const storefront = el('section', { class: 'spice-storefront', 'aria-label': 'Shop front and customers' },
      el('div', { class: 'spice-signboard' }, el('div', {}, el('small', {}, 'LITTLE INDIA · PROVISIONS & SPICES'),
        el('strong', {}, 'The Spice Counter')), el('span', { class: 'spice-open-sign' }, 'OPEN')),
      el('div', { class: 'spice-awning', 'aria-hidden': 'true' }), shelves,
      el('div', { class: 'spice-counter-edge' }, shopStatus, el('span', {}, 'Tap a customer to read their order')));

    // The order slip for the customer in focus.
    const padName = el('strong', {}), padRows = el('div', { class: 'spice-rows' }), padForm = el('span', { class: 'spice-form' });
    const padCustomer = el('span', { class: 'spice-receipt-customer' }), padNumber = el('span', {});
    const padProgress = el('strong', {}), padSummary = el('span', {});
    const peekButton = el('button', { class: 'btn spice-peek', type: 'button', onclick: () => {
      const i = s.spots.findIndex(c => c?.id === focus);
      if (peek(s, i)) sound(520);
    } }, `Peek at the book, $${PEEK_COST}`);
    const pad = el('section', { class: 'spice-pad', 'aria-label': 'Current order' },
      el('div', { class: 'spice-receipt-top' }, heading('1', 'Order slip'), padNumber),
      padCustomer, padName, padForm,
      el('div', { class: 'spice-receipt-columns', 'aria-hidden': 'true' }, el('span', {}, 'INGREDIENT'), el('span', {}, 'SCOOPED / NEED')),
      padRows, peekButton, el('div', { class: 'spice-receipt-total', role: 'status' }, padProgress, padSummary));

    // Work surface
    const scoopHistory = [];
    const removeScoop = id => {
      if (!unscoop(s, id)) return;
      const at = scoopHistory.lastIndexOf(id);
      if (at !== -1) scoopHistory.splice(at, 1);
      sound(340, .05);
    };
    const trayChips = el('div', { class: 'spice-tray-chips' }), trayCount = el('span', { class: 'spice-tray-count' });
    const grindButton = el('button', { class: 'btn primary', type: 'button', onclick: () => { if (grind(s)) { scoopHistory.length = 0; focus = nextUnpreparedOrder(); sound(110, .5, 'sawtooth', .04); } } }, 'Grind & bag');
    const bagButton = el('button', { class: 'btn', type: 'button', onclick: () => { if (bagWhole(s)) { scoopHistory.length = 0; focus = nextUnpreparedOrder(); sound(420); } } }, 'Bag whole');
    const undoButton = el('button', { class: 'btn spice-undo', type: 'button', onclick: () => {
      const id = scoopHistory.at(-1);
      if (id) removeScoop(id);
    } }, 'Undo last scoop');
    const tipButton = el('button', { class: 'btn spice-clear', type: 'button', onclick: () => { if (tipBack(s)) { scoopHistory.length = 0; sound(240); } } }, 'Clear tray');
    const trayHeading = el('h3', {}, 'Your mixing tray');
    const tray = el('section', { class: 'spice-tray', 'aria-label': 'Mixing tray' },
      el('div', { class: 'spice-tray-heading' }, trayHeading, trayCount), trayChips,
      el('div', { class: 'row' }, undoButton, tipButton));

    const mills = s.mills.map((_, i) => {
      const fill = el('i'), label = el('strong', {}), detail = el('small', {});
      const node = el('div', { class: 'spice-mill' }, drawMill(),
        el('div', { class: 'spice-mill-copy' }, el('span', {}, `MILL ${i + 1}`), label, detail), el('span', { class: 'spice-patience' }, fill));
      return { node, fill, label, detail };
    });
    const packets = Array.from({ length: SHELF_SIZE }, (_, i) => {
      const label = el('span', {});
      const ticket = el('b', { class: 'spice-packet-order' });
      const form = el('small', {});
      const button = el('button', { class: 'spice-packet', type: 'button', disabled: '', onclick: () => {
        const p = s.shelf[i];
        if (p) {
          selected = selected === p.id ? null : p.id;
          sound(640, .05);
          if (selected !== null) { paintTable(); reveal(handover); }
        }
      } }, ticket, drawPacket(), label, form);
      return { button, label, form, ticket };
    });
    const binButton = el('button', { class: 'btn spice-bin', type: 'button', disabled: '', onclick: () => {
      if (selected !== null && bin(s, selected)) { selected = null; sound(200); }
    } }, 'Discard selected packet');
    const hint = el('p', { class: 'spice-hint muted', role: 'status' });
    const prepareNote = el('p', { class: 'spice-prepare-note' });
    const shelfCount = el('span', {});
    const handoverTitle = el('strong', {}), handoverChoices = el('div', { class: 'spice-handover-choices' });
    const cancelHandover = el('button', { class: 'spice-put-back', type: 'button', onclick: () => { selected = null; } }, 'Put packet back');
    const handover = el('div', { class: 'spice-handover', hidden: '' }, handoverTitle,
      el('p', {}, 'Who is this packet for?'), handoverChoices, cancelHandover, binButton);
    const output = el('section', { class: 'spice-output', 'aria-label': 'Mills and finished packets' },
      heading('3', 'Prepare & serve'),
      el('div', { class: 'spice-fulfilment' },
        el('div', { class: 'spice-processing' }, prepareNote,
          el('div', { class: 'spice-prepare-actions' }, grindButton, bagButton),
          el('div', { class: 'spice-mills' }, mills.map(m => m.node))),
        el('div', { class: 'spice-collection' },
          el('div', { class: 'spice-shelf-heading' }, el('h4', {}, 'Ready to hand over'), shelfCount),
          el('div', { class: 'spice-packets' }, packets.map(p => p.button)), handover)));

    // Spice sacks
    const scoopCursor = el('img', { class: 'spice-scoop-cursor', src: api.assets.scoopTool.src, alt: '', 'aria-hidden': 'true', draggable: 'false', hidden: '' });
    let scoopHideTimer;
    const moveScoop = (event, button, dip = false) => {
      const gameBounds = gameNode.getBoundingClientRect(), bounds = button.getBoundingClientRect();
      const x = event.clientX || bounds.left + bounds.width / 2;
      const y = event.clientY || bounds.top + bounds.height / 2;
      scoopCursor.style.left = `${x - gameBounds.left - 20}px`;
      scoopCursor.style.top = `${y - gameBounds.top - 60}px`;
      scoopCursor.hidden = false;
      if (dip) {
        clearTimeout(scoopHideTimer);
        scoopCursor.classList.remove('scooping');
        void scoopCursor.offsetWidth;
        scoopCursor.classList.add('scooping');
        scoopHideTimer = setTimeout(() => {
          scoopCursor.classList.remove('scooping');
          scoopCursor.hidden = matchMedia('(hover: none)').matches || event.pointerType === 'touch' || !button.matches(':hover');
        }, 300);
      }
    };
    const bowls = day.spices.map((id, n) => {
      const spice = spiceById[id];
      const button = el('button', { class: 'spice-bowl', type: 'button', 'data-spice': id, 'aria-label': `Scoop ${spice.name}`,
        onpointermove: e => { if (e.pointerType !== 'touch' && !paused) moveScoop(e, e.currentTarget); },
        onpointerleave: () => { if (!scoopCursor.classList.contains('scooping')) scoopCursor.hidden = true; },
        onclick: e => {
        if (!scoop(s, id, focus)) return;
        started = true;
        scoopHistory.push(id);
        moveScoop(e, e.currentTarget, true);
        sound(700 + n * 30, .05, 'sine');
        e.currentTarget.classList.remove('dip');
        void e.currentTarget.offsetWidth;  // restart the dip animation on a quick second tap
        e.currentTarget.classList.add('dip');
      } }, drawSack(spice), el('span', { class: 'spice-bowl-name' }, spice.name), el('small', {}, '+1 scoop'),
        el('b', { class: 'spice-bowl-count', 'aria-hidden': 'true' }, '0'));
      const minus = el('button', { class: 'spice-return-scoop', type: 'button', hidden: '',
        'aria-label': `Remove one scoop of ${spice.name}`, onclick: () => removeScoop(id) }, '−');
      const node = el('div', { class: 'spice-sack' }, button, minus);
      return { button, minus, node };
    });

    const ingredients = el('section', { class: 'spice-ingredients', 'aria-label': 'Spice sacks' },
      heading('2', 'Scoop your spices', 'Tap to add · − to return'), el('div', { class: 'spice-bowls' }, bowls.map(v => v.node)), tray);
    const bench = el('div', { class: 'spice-bench', 'data-station': 'order' }, pad, ingredients, output);
    const stationButtons = [];
    function showStation(station) {
      bench.dataset.station = station;
      stationButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.station === station)));
    }
    const workNav = el('nav', { class: 'spice-work-nav', 'aria-label': 'Jump to a counter station' },
      [['order', '1', 'Order'], ['ingredients', '2', 'Spices'], ['output', '3', 'Prepare & serve']].map(([station, number, title]) => {
        const button = el('button', { type: 'button', 'data-station': station, 'aria-pressed': String(station === 'order'), onclick: () => showStation(station) },
          el('span', { 'aria-hidden': 'true' }, number), title);
        stationButtons.push(button);
        return button;
      }));
    pad.append(el('button', { class: 'btn spice-next-station', type: 'button', onclick: () => showStation('ingredients') }, 'Scoop this order →'));
    tray.append(el('button', { class: 'btn primary spice-next-station', type: 'button', onclick: () => showStation('output') }, 'Prepare this mix →'));
    const work = el('div', { class: 'spice-work' }, storefront,
      workNav, bench, hint);
    const pauseNotice = el('p', { class: 'spice-pause-notice', hidden: '', role: 'status' }, 'Shop paused. Take your time — your customers will wait.');
    const rotateCover = el('div', { class: 'spice-rotate-cover' },
      el('div', { class: 'spice-rotate-phone', 'aria-hidden': 'true' }, '↻'),
      el('h2', {}, 'Turn your phone sideways'),
      el('p', {}, 'The whole counter fits better in landscape. Your customers will wait.'),
      el('button', { class: 'btn primary', type: 'button', onclick: () => void enterLandscape() }, 'Play fullscreen'),
      el('button', { class: 'spice-continue-upright', type: 'button', onclick: () => { uprightAllowed = true; gameNode.classList.add('allow-upright'); } }, 'Continue upright'));
    const gameNode = el('div', { class: 'spice-game' }, hud, pauseNotice, work, rotateCover, scoopCursor);
    root.replaceChildren(gameNode);

    function tapSpot(i) {
      const c = s.spots[i];
      if (!c) return;
      if (selected === null) {
        if (s.trayOrder && s.trayOrder.id !== c.id) { notice(`Finish or clear mix ${orderNumber(s.trayOrder)} before switching orders.`); return; }
        focus = c.id; departedOrder = null; reveal(pad); return;
      }
      deliver(i);
    }

    function deliver(i) {
      const packet = s.shelf.find(p => p.id === selected), customer = s.spots[i];
      if (!packet || !customer) return;
      const owner = packet.order && s.spots.find(c => c?.id === packet.order.id);
      if (owner && owner.id !== customer.id) { notice(`This packet is for ${orderNumber(packet.order)} · ${packet.order.name}.`); return; }
      serve(s, selected, i);
      selected = null;
      actionNoticeUntil = 0;
    }

    const speak = (view, text, kind) => {
      set(view.say, text);
      view.say.className = `spice-say show ${kind}`;
      view.sayUntil = s.t + 1.8;
    };

    function drain() {
      for (const e of s.log.splice(0)) {
        const view = spots[e.spot];
        if (e.type === 'milled') sound(560, .1);
        if (e.type === 'arrived') sound(980, .05, 'sine', .05);
        if (e.type === 'left') {
          view.departedUntil = s.t + 6;
          lastNotice = `${e.customer.person.name} left waiting for ${e.customer.blend.short}. Their patience ran out.`;
          noticeUntil = s.t + 8;
          if (focus === e.customer.id) departedOrder = e.customer;
          sound(170, .25, 'sawtooth', .05);
        }
        if (e.type === 'served') {
          if (e.grade === 'exact') { speak(view, `${e.person.thanks} +$${e.earned}`, 'good'); chime(); }
          if (e.grade === 'close') { speak(view, `${e.person.close} +$${e.earned}`, 'meh'); sound(440, .12); }
          if (e.grade === 'wrong') {
            speak(view, e.reason === 'form' ? 'Wrong! Check if it should be ground or whole.' : e.person.wrong, 'bad');
            sound(170, .25, 'sawtooth', .06);
          }
        }
      }
    }

    function paintSpots() {
      s.spots.forEach((c, i) => {
        const view = spots[i];
        if (view.sayUntil && s.t > view.sayUntil) { view.say.className = 'spice-say'; view.sayUntil = 0; }
        if (!c) {
          if (view.departedUntil > s.t && view.id !== null) {
            view.button.disabled = true;
            view.button.classList.add('departed');
            view.button.classList.remove('focus', 'target', 'urgent');
            view.button.setAttribute('aria-pressed', 'false');
            view.button.setAttribute('aria-label', `${view.personName.textContent} left waiting for ${view.name.textContent}.`);
            set(view.patienceLabel, 'Left · patience ran out');
            view.fill.style.width = '0';
            return;
          }
          if (view.id !== null) {
            view.id = null;
            view.portrait.replaceChildren();
            set(view.name, '');
            set(view.personName, '');
            set(view.patienceLabel, '');
            set(view.action, 'Waiting for a customer');
            view.fill.style.width = '0';
            view.button.disabled = true;
            view.button.classList.remove('here', 'focus', 'target', 'departed', 'urgent');
            view.button.setAttribute('aria-pressed', 'false');
          }
          return;
        }
        if (view.id !== c.id) {
          const art = portraitImage(api.assets[c.person.portrait]);
          view.id = c.id;
          view.portrait.replaceChildren(art);
          set(view.name, c.blend.name);
          set(view.personName, `${orderNumber(c)} · ${c.person.name}`);
          view.button.disabled = false;
          view.button.classList.add('here');
          view.button.classList.remove('departed');
          view.departedUntil = 0;
        }
        const left = Math.max(0, c.patience / c.max), mood = left > .55 ? 'happy' : left > .25 ? 'neutral' : 'cross';
        view.fill.style.width = `${left * 100}%`;
        view.fill.dataset.mood = mood;
        view.portrait.dataset.mood = mood;
        const seconds = Math.max(1, Math.ceil(c.patience));
        const preparation = s.mills.some(job => job?.order?.id === c.id) ? 'Grinding' : s.shelf.some(p => p.order?.id === c.id) ? 'Packet ready' : 'Waits';
        set(view.patienceLabel, !started ? 'Clock paused' : `${mood === 'cross' ? 'Leaving in' : preparation} ${seconds}s`);
        view.button.classList.toggle('urgent', mood === 'cross');
        view.button.setAttribute('aria-label', `Order ${orderNumber(c)}. ${c.person.name} wants ${c.blend.name}. ${mood === 'cross' ? 'About to leave.' : ''}`);
        view.button.setAttribute('aria-pressed', String(c.id === focus));
        set(view.action, selected !== null ? 'Tap to serve' : mood === 'cross' ? 'Leaving soon!' : c.id === focus ? 'Order on your slip' : 'Read order');
        view.button.classList.toggle('focus', c.id === focus);
        view.button.classList.toggle('target', !!matchingRecipient(s.shelf.find(p => p.id === selected), c));
      });
    }

    function paintPad() {
      if (s.trayOrder) focus = s.trayOrder.id;
      const keepDeparted = departedOrder?.id === focus && scoops(s.tray) > 0;
      if (!s.spots.some(c => c?.id === focus) && !keepDeparted) focus = nextUnpreparedOrder() ?? s.spots.find(Boolean)?.id ?? null;
      const live = s.spots.find(x => x?.id === focus);
      const c = live ?? (keepDeparted ? departedOrder : null);
      const left = !!c && !live;
      const open = c && (!day.hidden || c.peeked);
      const key = `${c?.id}|${left}|${open}|${JSON.stringify(s.tray)}`;
      peekButton.hidden = !live || !day.hidden || c.peeked;
      if (pad.dataset.key === key) return;
      pad.dataset.key = key;
      set(padNumber, c ? `Order ${orderNumber(c)}` : '—');
      set(padCustomer, c ? `${left ? 'LEFT' : 'FOR'} ${c.person.name.toUpperCase()}` : 'AWAITING CUSTOMER');
      set(padName, c ? c.blend.name : 'Ready for the next order');
      set(padForm, c ? c.blend.whole ? 'Keep whole · bag without grinding' : 'Grind into powder · then serve' : 'The next order will appear here.');
      const needed = c ? scoops(c.blend.recipe) : 0;
      const remaining = c ? Object.entries(c.blend.recipe).reduce((n, [id, count]) => n + Math.max(0, count - (s.tray[id] || 0)), 0) : 0;
      const excess = c ? Object.entries(s.tray).reduce((n, [id, count]) => n + Math.max(0, count - (c.blend.recipe[id] || 0)), 0) : 0;
      const exact = c && remaining === 0 && excess === 0;
      pad.classList.toggle('complete', !!open && exact && !left);
      pad.classList.toggle('has-error', left || (!!open && excess > 0));
      set(padProgress, left ? 'This customer has left' : !c ? 'The shop is ready' : !open ? 'Recipe from memory' : excess ? `${excess} extra scoop${excess === 1 ? '' : 's'}` : exact ? 'Mix complete ✓' : `${remaining} scoop${remaining === 1 ? '' : 's'} to go`);
      set(padSummary, left ? 'Choose another customer or clear your tray.' : !c ? 'Choose a customer when they arrive.' : !open ? 'Peek below if you need a reminder.' : excess ? 'Undo a scoop or clear your tray.' : exact ? 'Ready for the preparation counter.' : `${needed} scoops in this blend`);
      if (!open) {
        padRows.replaceChildren(...(c ? [el('p', { class: 'spice-recipe-note' }, 'A regular’s order. Mix from memory or peek at the recipe below.')] : []));
        return;
      }
      const extra = Object.keys(s.tray).filter(id => !c.blend.recipe[id]);
      padRows.replaceChildren(...[...Object.entries(c.blend.recipe), ...extra.map(id => [id, 0])].map(([id, need]) => {
        const have = s.tray[id] || 0;
        return el('span', { class: `spice-row${have === need ? ' done' : have > need ? ' over' : ''}` },
          drawIngredient(spiceById[id]), el('span', {}, spiceById[id].name), el('b', {}, `${have}/${need}`));
      }));
    }

    function paintTable() {
      const trayKey = JSON.stringify(s.tray);
      if (trayChips.dataset.key !== trayKey) {
        trayChips.dataset.key = trayKey;
        const entries = Object.entries(s.tray);
        trayChips.replaceChildren(...(entries.length
          ? entries.map(([id, n]) => el('span', { class: 'spice-chip' }, drawIngredient(spiceById[id]), `${spiceById[id].name} ×${n}`))
          : [el('span', { class: 'muted' }, 'Your tray is empty. Tap a spice sack to begin.')]));
      }
      set(trayHeading, s.trayOrder ? `Mix for ${orderNumber(s.trayOrder)} · ${s.trayOrder.name}` : 'Your mixing tray');
      set(trayCount, `${s.trayOrder ? `${orderNumber(s.trayOrder)} · ` : ''}${scoops(s.tray)} / ${TRAY_MAX} scoops`);
      bowls.forEach(({ button, minus }) => {
        const id = button.dataset.spice, count = s.tray[id] || 0;
        set(button.querySelector('.spice-bowl-count'), String(count));
        button.classList.toggle('scooped', count > 0);
        button.disabled = scoops(s.tray) >= TRAY_MAX;
        button.setAttribute('aria-label', `Scoop ${spiceById[id].name}. ${count} in tray.`);
        minus.hidden = count === 0;
        if (!count && document.activeElement === minus) button.focus();
      });
      grindButton.disabled = !canGrind(s);
      bagButton.disabled = !canBag(s);
      tipButton.disabled = !Object.keys(s.tray).length;
      undoButton.disabled = scoopHistory.length === 0;
      const customer = s.spots.find(c => c?.id === focus);
      const whole = !!customer?.blend.whole;
      bagButton.classList.toggle('primary', whole);
      grindButton.classList.toggle('primary', !whole);
      bagButton.hidden = !day.blends.some(id => s.blends[id].whole);
      grindButton.title = s.mills.includes(null) ? 'Grind the tray and pack it into a bag' : 'All mills are busy';
      set(prepareNote, `${s.trayOrder ? `${orderNumber(s.trayOrder)} · ${s.trayOrder.name}. ` : ''}${!scoops(s.tray) ? 'Scoop your mix first, then bring it to the mill.' : whole ? 'Keep this mix whole. Bag without grinding.' : !canGrind(s) ? 'The mills are busy. Your mix can wait here.' : 'Grind your tray into powder. The mill bags it for you.'}`);

      s.mills.forEach((job, i) => {
        const view = mills[i], stalled = job && job.left === 0;
        view.node.classList.toggle('busy', !!job && !stalled);
        set(view.label, !job ? 'Ready to grind' : `${stalled ? 'Shelf full' : 'Grinding'}${job.order ? ` ${orderNumber(job.order)}` : '…'}`);
        set(view.detail, !job ? 'Add your mix above' : stalled ? 'Hand over a packet to make room' : `${job.order ? `${job.order.name} · ` : ''}${Math.ceil(job.left)}s · auto bag`);
        view.fill.style.width = job ? `${(1 - job.left / day.grind) * 100}%` : '0';
      });

      if (!s.shelf.some(p => p.id === selected)) selected = null;
      packets.forEach((view, i) => {
        const p = s.shelf[i];
        view.button.disabled = !p;
        view.button.classList.toggle('full', !!p);
        view.button.classList.toggle('selected', !!p && p.id === selected);
        view.button.setAttribute('aria-pressed', String(!!p && p.id === selected));
        set(view.ticket, p?.order ? orderNumber(p.order) : p ? 'Stock' : '');
        view.button.setAttribute('aria-label', p ? `${p.order ? `Order ${orderNumber(p.order)} for ${p.order.name}. ` : ''}${identify(p, blends)?.short ?? 'Custom mix'}. ${p.form}. Pick up packet.` : 'Empty packet slot');
        view.button.title = p?.order ? `${orderNumber(p.order)} · ${p.order.name}` : '';
        set(view.label, p ? identify(p, blends)?.short ?? 'Custom mix' : 'Empty slot');
        set(view.form, p ? `${p.form === 'whole' ? 'Whole seeds' : 'Ground powder'} · ${p.id === selected ? 'Selected' : 'Tap to pick up'}` : 'Packets go here');
      });
      binButton.disabled = selected === null;
      binButton.hidden = selected === null;
      set(shelfCount, `${s.shelf.length} / ${SHELF_SIZE} packets`);
      handover.hidden = selected === null;
      const packet = s.shelf.find(p => p.id === selected);
      const ownerHere = packet?.order && s.spots.some(c => c?.id === packet.order.id);
      set(handoverTitle, packet ? `${packet.order ? `${orderNumber(packet.order)} · ${packet.order.name}${ownerHere ? '' : ' (left)'}` : identify(packet, blends)?.short ?? 'Custom mix'}` : '');
      const handoverKey = `${selected}|${s.spots.map(c => c?.id).join(',')}`;
      if (handoverChoices.dataset.key !== handoverKey) {
        handoverChoices.dataset.key = handoverKey;
        handoverChoices.replaceChildren(...s.spots.flatMap((c, i) => c ? [el('button', {
          class: `spice-serve-customer${matchingRecipient(packet, c) ? ' match' : ''}`, type: 'button',
          ...(ownerHere && packet.order.id !== c.id ? { disabled: '' } : {}), onclick: () => deliver(i)
        }, el('strong', {}, `Serve ${orderNumber(c)} · ${c.person.name}`), el('span', {}, c.blend.short))] : []));
        if (!s.spots.some(Boolean)) handoverChoices.append(el('p', {}, 'No customers at the counter yet. You can put this packet back.'));
      }
      const ready = customer && distance(s.tray, customer.blend.recipe) === 0;
      set(hint, actionNoticeUntil > s.t ? actionNotice : !started ? 'Clock paused. Read the order; scoop a spice to begin.'
        : departedOrder?.id === focus && !customer && scoops(s.tray) ? `${departedOrder.person.name} has left. Your mix is still here. Choose another customer or clear the tray.`
        : selected !== null ? 'Packet in hand. Tap a customer to serve it, or tap the packet to put it back.'
        : s.shelf.length ? 'A packet is ready. Pick it up, then tap the customer it’s for.'
        : scoops(s.tray) >= TRAY_MAX ? 'Tray full. Prepare this mix or clear the tray to start again.'
        : ready ? `Your mix matches. ${whole ? 'Bag it whole' : 'Grind & bag'}, then serve your customer.`
        : 'Follow the order slip. Each tap adds one scoop to your tray.');
    }

    function paint() {
      set(money, dollars(s.money));
      set(fullscreenButton, document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen');
      const musicControl = root.parentElement?.querySelector(':scope > .music-controls button');
      if (musicControl) set(musicButton, musicControl.textContent);
      const target = day.goals.find(g => s.money < g);
      set(goal, target ? `/ $${target}` : '★★★');
      earningsFill.style.width = `${Math.max(0, Math.min(100, s.money / day.goals[2] * 100))}%`;
      set(streak, s.streak > 1 ? `${s.streak} in a row` : '');
      const outside = waiting(s);
      set(queue, outside ? `${outside} waiting` : '');
      const atCounter = s.spots.filter(Boolean).length;
      set(shopStatus, noticeUntil > s.t ? lastNotice : atCounter ? `${atCounter} customer${atCounter === 1 ? '' : 's'} at the counter` : 'Waiting for the next customer');
      api.setProgress(s.served + s.lost, day.customers);
      paintPad();
      paintSpots();
      paintTable();
    }

    function step(now) {
      // A hidden tab stops this loop, and the cap means the day resumes where it paused.
      const rotating = !uprightAllowed && matchMedia('(max-width: 759px) and (orientation: portrait) and (pointer: coarse)').matches;
      work.inert = paused || rotating;
      if (started && !paused && !closing && !rotating) tick(s, Math.min(.1, (now - last) / 1000 || 0));
      last = now;
      drain();
      paint();
      if (isDone(s) && !closing) {
        closing = true;
        setTimeout(() => dayEnd(index, s), 1200);
      }
      if (root.contains(shelves)) requestAnimationFrame(step);
    }
    paint();
    requestAnimationFrame(step);
  }

  // Sound effects can't start until the first tap, which "Open the shop" provides.
  dayIntro(0);
}
