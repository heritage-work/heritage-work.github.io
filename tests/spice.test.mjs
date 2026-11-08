import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  bagWhole, bin, canBag, canGrind, distance, dollars, grade, grind, identify, isDone, newDay, payment, peek, PEEK_COST, schedule,
  scoop, unscoop, serve, SHELF_SIZE, stars, STREAK_MAX, tick, tipBack, TRAY_MAX, waiting, WRONG_COST
} from '../mechanics/spice.js';
import { rng } from '../mechanics/tray.js';

const { content } = JSON.parse(readFileSync(new URL('../games/spice-counter/game.json', import.meta.url)));
const blend = id => content.blends.find(b => b.id === id);
const fill = (s, recipe) => Object.entries(recipe).forEach(([id, n]) => { for (let i = 0; i < n; i++) scoop(s, id); });
const person = { name: 'T', pay: 1, patience: 1, thanks: '', close: '', wrong: '', look: {} };

// A day with one customer who wants `id`, standing at spot 0.
const oneCustomer = (id, overrides = {}) => {
  const day = { ...content.days[0], customers: 1, spots: 1, blends: [id], ...overrides };
  const s = newDay(day, content, rng(1));
  tick(s, 0);
  assert.equal(s.spots[0].blend.id, id);
  return s;
};
const packetFor = (s, recipe, form = 'ground') => {
  fill(s, recipe);
  if (form === 'whole') bagWhole(s); else { grind(s); tick(s, s.day.grind); }
  return s.shelf.at(-1).id;
};

test('content: every reference resolves and each day can make what it sells', () => {
  const spices = new Set(content.spices.map(s => s.id));
  assert.equal(spices.size, content.spices.length);
  for (const b of content.blends) for (const id of Object.keys(b.recipe)) assert.ok(spices.has(id), `${b.id}: ${id}`);
  for (const day of content.days) {
    for (const id of day.spices) assert.ok(spices.has(id), id);
    for (const id of day.blends) {
      for (const need of Object.keys(blend(id).recipe)) assert.ok(day.spices.includes(need), `${day.title}: ${id} needs ${need}`);
    }
    assert.ok(day.goals[0] < day.goals[1] && day.goals[1] < day.goals[2], day.title);
  }
});

test('content: every recipe fits the tray, and no blend is one scoop from another', () => {
  content.blends.forEach((a, i) => {
    assert.ok(Object.values(a.recipe).reduce((x, y) => x + y) <= TRAY_MAX, a.id);
    content.blends.slice(i + 1).forEach(b => assert.ok(distance(a.recipe, b.recipe) > 2, `${a.id}/${b.id}`));
  });
});

test('panch phoron is five spices in equal parts, and only it stays whole', () => {
  const panch = blend('panch');
  assert.deepEqual(Object.values(panch.recipe), [1, 1, 1, 1, 1]);
  assert.deepEqual(content.blends.filter(b => b.whole).map(b => b.id), ['panch']);
});

test('grade: exact, one scoop off either way, two off, and the wrong form', () => {
  const fish = blend('fish'), recipe = fish.recipe;
  assert.equal(grade({ mix: { ...recipe }, form: 'ground' }, fish).grade, 'exact');
  assert.equal(grade({ mix: { ...recipe, chilli: 2 }, form: 'ground' }, fish).grade, 'close');
  assert.equal(grade({ mix: { ...recipe, coriander: 1 }, form: 'ground' }, fish).grade, 'close');
  assert.equal(grade({ mix: { ...recipe, pepper: 1 }, form: 'ground' }, fish).grade, 'close');
  assert.equal(grade({ mix: { ...recipe, chilli: 3 }, form: 'ground' }, fish).grade, 'wrong');
  // Swapping one spice for another is two scoops off, not one.
  assert.equal(grade({ mix: { ...recipe, chilli: 0, pepper: 1 }, form: 'ground' }, fish).grade, 'wrong');
  assert.deepEqual(grade({ mix: { ...recipe }, form: 'whole' }, fish), { grade: 'wrong', reason: 'form' });
  assert.deepEqual(grade({ mix: { ...blend('panch').recipe }, form: 'ground' }, blend('panch')), { grade: 'wrong', reason: 'form' });
  assert.equal(grade({ mix: { ...blend('panch').recipe }, form: 'whole' }, blend('panch')).grade, 'exact');
});

test('identify names only an exact mix in the right form', () => {
  assert.equal(identify({ mix: { ...blend('rasam').recipe }, form: 'ground' }, content.blends).id, 'rasam');
  assert.equal(identify({ mix: { ...blend('rasam').recipe }, form: 'whole' }, content.blends), null);
  assert.equal(identify({ mix: { ...blend('rasam').recipe, cumin: 2 }, form: 'ground' }, content.blends), null);
});

test('payment: patience and streak raise an exact sale, and the streak is capped', () => {
  const b = { price: 10 }, c = { pay: 1.5 };
  assert.equal(payment('exact', b, c, 0, 0), 15);
  assert.equal(payment('exact', b, c, 1, 0), 23);   // 15 + half again, rounded
  assert.equal(payment('exact', b, c, .5, 2), 21);  // 15 + 3.75, rounded, + 2
  assert.equal(payment('exact', b, c, 0, 99), 15 + STREAK_MAX);
  assert.equal(payment('close', b, c, 1, 99), 8);
  assert.equal(payment('wrong', b, c, 1, 99), 0);
});

test('schedule: right count, gaps within the jitter, no triple blend, no person twice running', () => {
  for (let seed = 0; seed < 300; seed++) for (const day of content.days) {
    const plan = schedule(day, content, rng(seed));
    assert.equal(plan.length, day.customers);
    assert.equal(plan[0].at, 0);
    plan.forEach((q, i) => {
      assert.ok(day.blends.includes(q.blend));
      if (i) {
        const gap = q.at - plan[i - 1].at;
        assert.ok(gap >= day.gap * .75 && gap <= day.gap * 1.25);
        assert.notEqual(q.customer, plan[i - 1].customer);
      }
      if (i > 1) assert.ok(!(q.blend === plan[i - 1].blend && q.blend === plan[i - 2].blend));
    });
  }
});

test('schedule: a day selling one blend still gives every customer that blend', () => {
  const plan = schedule({ ...content.days[0], blends: ['panch'], customers: 6 }, content, rng(3));
  assert.deepEqual(plan.map(q => q.blend), Array(6).fill('panch'));
});

test('the tray stops at its limit, and tipping back empties it', () => {
  const s = oneCustomer('fish');
  for (let i = 0; i < TRAY_MAX; i++) assert.ok(scoop(s, 'cumin'));
  assert.equal(scoop(s, 'cumin'), false);
  assert.equal(s.tray.cumin, TRAY_MAX);
  assert.ok(tipBack(s));
  assert.deepEqual(s.tray, {});
  assert.equal(tipBack(s), false);
});

test('the mill takes the tray, frees it for the next mix, and finishes only after grind time', () => {
  const s = oneCustomer('fish', { grind: 3 });
  assert.equal(grind(s), false, 'an empty tray cannot be ground');
  fill(s, blend('fish').recipe);
  assert.ok(grind(s));
  assert.deepEqual(s.tray, {});
  scoop(s, 'cumin');
  assert.equal(canGrind(s), false, 'one mill, already busy');
  tick(s, 2.9);
  assert.equal(s.shelf.length, 0);
  tick(s, .2);
  assert.equal(s.shelf.length, 1);
  assert.equal(s.shelf[0].form, 'ground');
  assert.ok(canGrind(s));
});

test('a full shelf stalls the mill without losing the mix, and clearing it restarts', () => {
  const s = oneCustomer('fish', { grind: 1, patience: 999 });
  for (let i = 0; i < SHELF_SIZE; i++) { scoop(s, 'cumin'); bagWhole(s); }
  assert.equal(canBag(s), false);
  scoop(s, 'pepper');
  assert.equal(bagWhole(s), false);
  assert.ok(grind(s));
  tick(s, 5);
  assert.equal(s.shelf.length, SHELF_SIZE);
  assert.ok(s.mills[0], 'the job waits in the mill');
  assert.ok(bin(s, s.shelf[0].id));
  tick(s, .01);
  assert.equal(s.mills[0], null);
  assert.deepEqual(s.shelf.at(-1).mix, { pepper: 1 });
});

test('two mills run two mixes at once', () => {
  const s = oneCustomer('fish', { mills: 2, grind: 3 });
  scoop(s, 'cumin'); assert.ok(grind(s));
  tick(s, 1);
  scoop(s, 'pepper'); assert.ok(grind(s));
  tick(s, 2);
  assert.equal(s.shelf.length, 1);
  tick(s, 1);
  assert.equal(s.shelf.length, 2);
});

test('an exact sale pays, clears the spot and builds the streak; a close one resets it', () => {
  const s = oneCustomer('fish', { customers: 2, spots: 2, gap: 0 });
  tick(s, 0);
  s.spots.forEach(c => { c.person = person; c.blend = blend('fish'); });
  const full = packetFor(s, blend('fish').recipe);
  const expected = payment('exact', blend('fish'), person, s.spots[0].patience / s.spots[0].max, 0);
  assert.equal(serve(s, full, 0).earned, expected);
  assert.equal(s.money, expected);
  assert.equal(s.spots[0], null);
  assert.equal(s.streak, 1);
  const near = packetFor(s, { ...blend('fish').recipe, chilli: 2 });
  assert.equal(serve(s, near, 1).grade, 'close');
  assert.equal(s.money, expected + 3);
  assert.equal(s.streak, 0);
  assert.equal(s.served, 2);
  assert.ok(isDone(s));
});

test('a wrong packet is used up, costs patience and the streak, and the customer stays', () => {
  const s = oneCustomer('panch', { spices: content.days[2].spices, patience: 100 });
  s.streak = 3;
  const ruined = packetFor(s, blend('panch').recipe, 'ground');
  const before = s.spots[0].patience;
  const result = serve(s, ruined, 0);
  assert.equal(result.reason, 'form');
  assert.equal(s.money, 0);
  assert.equal(s.shelf.length, 0);
  assert.equal(s.streak, 0);
  assert.ok(Math.abs(s.spots[0].patience - (before - s.spots[0].max * WRONG_COST)) < 1e-9);
  const right = packetFor(s, blend('panch').recipe, 'whole');
  assert.equal(serve(s, right, 0).grade, 'exact');
});

test('serving nobody, or a packet that is gone, changes nothing', () => {
  const s = oneCustomer('fish');
  const id = packetFor(s, blend('fish').recipe);
  assert.equal(serve(s, 999, 0), null);
  assert.equal(serve(s, id, 5), null);
  assert.equal(s.shelf.length, 1);
  assert.ok(s.spots[0]);
});

test('out of patience, a customer leaves, the streak ends, and the spot reopens for the queue', () => {
  const s = newDay({ ...content.days[0], customers: 2, spots: 1, gap: 1, patience: 10 }, content, rng(2));
  s.queue.forEach(q => { q.customer = 0; });
  tick(s, 0);
  s.streak = 4;
  tick(s, 2);
  assert.equal(waiting(s), 1, 'the second customer is outside');
  tick(s, 8.1);
  assert.equal(s.lost, 1);
  assert.equal(s.streak, 0);
  assert.equal(waiting(s), 0);
  assert.ok(s.spots[0], 'second customer stepped up');
  assert.equal(s.spots[0].patience, s.spots[0].max, 'their patience starts at the counter');
  assert.equal(isDone(s), false);
  tick(s, 10.1);
  assert.ok(isDone(s));
  assert.equal(s.lost, 2);
});

test('peek works only on hidden days, goes on credit, and charges once per customer', () => {
  const open = oneCustomer('fish');
  open.money = 5;
  assert.equal(peek(open, 0), false);
  assert.equal(open.money, 5);
  const s = oneCustomer('fish', { hidden: true });
  assert.equal(s.money, 0);
  assert.ok(peek(s, 0), 'the first customer of a hidden day can be looked up at $0');
  assert.equal(s.money, -PEEK_COST);
  assert.equal(dollars(s.money), '-$1');
  assert.equal(peek(s, 0), false);
  assert.equal(s.money, -PEEK_COST);
  assert.equal(peek(s, 3), false, 'an empty spot has nothing to look up');
});

test('stars count goals reached, boundaries included', () => {
  const goals = [10, 20, 30];
  assert.deepEqual([9, 10, 19, 20, 29, 30, 99].map(m => stars(m, goals)), [0, 1, 1, 2, 2, 3, 3]);
});

// A simulated player: one action every `tap` seconds, plus `think` seconds per order on hidden days.
// It always makes the most impatient customer's blend, and hands over whatever matches.
function play(day, seed, { tap, think = 0, ignore = false }) {
  const s = newDay(day, content, rng(seed));
  const dt = .05;
  let ready = 0, plan = [], planFor = null;
  for (let guard = 0; guard < 20000 && !isDone(s); guard++) {
    tick(s, dt);
    if (ignore || s.t < ready) continue;
    const act = cost => { ready = s.t + cost; };

    // Hand over first.
    const match = s.shelf.map(p => [p, s.spots.findIndex(c => c && grade(p, c.blend).grade === 'exact')]).find(([, i]) => i >= 0);
    if (match) { serve(s, match[0].id, match[1]); act(tap * 2); continue; }

    if (plan.length) { scoop(s, plan.shift()); act(tap); continue; }
    if (planFor) {
      if (planFor.whole ? bagWhole(s) : grind(s)) { planFor = null; act(tap); }
      continue;
    }
    // Whatever is on the shelf or in a mill covers those orders; look for one that's uncovered.
    const covered = [...s.shelf, ...s.mills.filter(Boolean).map(j => ({ mix: j.mix, form: 'ground' }))];
    const todo = s.spots.filter(Boolean).sort((a, b) => a.patience - b.patience).filter(c => {
      const i = covered.findIndex(p => grade(p, c.blend).grade === 'exact');
      if (i < 0) return true;
      covered.splice(i, 1);
      return false;
    })[0];
    if (!todo) continue;
    planFor = todo.blend;
    plan = Object.entries(todo.blend.recipe).flatMap(([id, n]) => Array(n).fill(id));
    act(day.hidden ? think : 0);
  }
  assert.ok(isDone(s), `${day.title} never ended`);
  return s;
}

const share = (day, bot, wanted) => {
  let hits = 0;
  for (let seed = 0; seed < 100; seed++) if (stars(play(day, seed, bot).money, day.goals) >= wanted) hits++;
  return hits / 100;
};

for (const [i, day] of content.days.entries()) {
  test(`balance, day ${i + 1}: idle earns nothing, steady clears it, quick earns three stars`, () => {
    const idle = play(day, 1, { ignore: true });
    assert.equal(idle.money, 0);
    assert.equal(idle.lost, day.customers);
    assert.ok(share(day, { tap: .6, think: 2 }, 1) >= .9, 'a steady player should clear the day');
    assert.ok(share(day, { tap: .3, think: .5 }, 3) >= .8, 'a quick player should be able to earn three stars');
  });
}

test('balance: the generous pace allows slower play on the later days', () => {
  const [regulars, deepavali] = content.days.slice(-2);
  for (const day of [regulars, deepavali]) {
    assert.ok(share(day, { tap: 1.1, think: 4 }, 1) >= .9, 'slower players should be able to keep the shop open');
  }
});

// Order metadata follows the physical mix, independently of the selected customer.
test('an order stays attached through scooping, milling and bagging', () => {
  const s = oneCustomer('fish');
  const customer = s.spots[0];
  scoop(s, 'coriander', customer.id);
  scoop(s, 'pepper', -1);
  assert.equal(s.trayOrder.id, customer.id, 'changing focus cannot reassign a partial mix');
  const order = { ...s.trayOrder };
  grind(s);
  assert.equal(s.trayOrder, null);
  assert.deepEqual(s.mills[0].order, order);
  tick(s, s.day.grind);
  assert.deepEqual(s.shelf[0].order, order);
  scoop(s, 'fennel', customer.id);
  bagWhole(s);
  assert.deepEqual(s.shelf[1].order, order);
  assert.equal(s.trayOrder, null);
});

test('returning a specific spice preserves the other scoops and clears an empty order', () => {
  const s = oneCustomer('fish');
  const id = s.spots[0].id;
  scoop(s, 'coriander', id);
  scoop(s, 'pepper', id);
  scoop(s, 'coriander', id);
  assert.ok(unscoop(s, 'coriander'));
  assert.deepEqual(s.tray, { coriander: 1, pepper: 1 });
  assert.equal(s.trayOrder.id, id);
  assert.equal(unscoop(s, 'turmeric'), false);
  assert.ok(unscoop(s, 'pepper'));
  assert.ok(unscoop(s, 'coriander'));
  assert.deepEqual(s.tray, {});
  assert.equal(s.trayOrder, null);
  assert.equal(unscoop(s, 'coriander'), false);
});
