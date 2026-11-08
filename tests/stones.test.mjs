import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scatter, touched, flickPower, planThrow, judgeCatch, GAP, HIT, CATCH_R, CATCH_WINDOW, CATCH_GRACE } from '../mechanics/stones.js';
import { rng } from '../mechanics/tray.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Is there a stroke through exactly `need` stones, using straight lines from stone to stone?
const solvable = (stones, need) => {
  const grow = chain => chain.length === need || stones.some(s => !chain.includes(s)
    && touched([...chain, s], stones).length === chain.length + 1 && grow([...chain, s]));
  return grow([]);
};

test('scatter keeps five stones apart and on the floor, and differs by seed', () => {
  const seen = new Set();
  for (let seed = 0; seed < 2000; seed++) {
    const stones = scatter(rng(seed));
    assert.equal(stones.length, 5);
    seen.add(JSON.stringify(stones));
    stones.forEach((a, i) => {
      assert.ok(a.x >= 10 && a.x <= 90 && a.y >= 10 && a.y <= 90);
      stones.slice(i + 1).forEach(b => assert.ok(dist(a, b) >= GAP));
    });
  }
  assert.equal(seen.size, 2000);
});

test('whichever stone is thrown, every scatter can be swept one or two at a time', () => {
  for (let seed = 0; seed < 2000; seed++) {
    const stones = scatter(rng(seed));
    for (const thrown of stones) {
      const floor = stones.filter(s => s !== thrown);
      assert.ok(solvable(floor, 1), `seed ${seed}: single`);
      assert.ok(solvable(floor, 2), `seed ${seed}: pair`);
    }
  }
});

test('solvable really can say no, so the test above means something', () => {
  // Stones too close for the real scatter: any line to one passes through the others.
  const cramped = [{ x: 50, y: 50 }, { x: 52, y: 50 }, { x: 50, y: 52 }];
  assert.equal(solvable(cramped, 1), false);
  assert.equal(solvable(cramped, 2), false);
});

test('touched counts a stone at the edge of the stroke but not just past it', () => {
  const stone = { x: 50, y: 50 };
  assert.deepEqual(touched([{ x: 50, y: 50 + HIT - 0.01 }], [stone]), [stone]);
  assert.deepEqual(touched([{ x: 50, y: 50 + HIT }], [stone]), []);
});

test('touched catches a stone a fast swipe jumps over between two samples', () => {
  const between = { x: 50, y: 50 }, aside = { x: 50, y: 70 };
  assert.deepEqual(touched([{ x: 10, y: 50 }, { x: 90, y: 50 }], [between, aside]), [between]);
});

test('touched does not run past the ends of a stroke', () => {
  const beyond = { x: 70, y: 50 };
  assert.deepEqual(touched([{ x: 10, y: 50 }, { x: 60, y: 50 }], [beyond]), []);
});

test('flickPower: faster is stronger, capped at 1, and downward or slow is no throw', () => {
  const swipe = pxPerMs => [0, 16, 32, 48].map(t => [500 - pxPerMs * t, t]);
  const soft = flickPower(swipe(0.6), 48), hard = flickPower(swipe(1.8), 48);
  assert.ok(soft > 0 && soft < hard && hard < 1);
  assert.equal(flickPower(swipe(9), 48), 1);
  assert.equal(flickPower(swipe(0.1), 48), 0);
  assert.equal(flickPower(swipe(-2), 48), 0);
  assert.equal(flickPower([[500, 0]], 0), 0);
});

test('flickPower ignores a fast start followed by a long pause', () => {
  const samples = [[500, 0], [400, 40], [400, 500], [400, 520]];
  assert.equal(flickPower(samples, 520), 0);
});

test('planThrow: a harder flick stays up longer and lands further away', () => {
  const from = { x: 50, y: 50 };
  const soft = planThrow(0, rng(3), from, []), hard = planThrow(0.8, rng(3), from, []);
  assert.ok(hard.airtime > soft.airtime);
  assert.ok(dist(from, hard.landing) > dist(from, soft.landing));
});

test('planThrow always lands on the floor, clear of the stones, from any catch spot', () => {
  for (let seed = 0; seed < 2000; seed++) {
    const rand = rng(seed);
    const floor = scatter(rand).slice(0, 4);
    const from = { x: 10 + rand() * 80, y: 10 + rand() * 80 };
    const { landing } = planThrow(rand(), rand, from, floor);
    assert.ok(landing.x >= 10 && landing.x <= 90 && landing.y >= 10 && landing.y <= 90);
    floor.forEach(s => assert.ok(dist(s, landing) >= CATCH_R + HIT));
  }
});

test('judgeCatch at each edge of the window and the shadow', () => {
  const landing = { x: 40, y: 60 }, landsAt = 2000, on = { x: 40, y: 60 };
  assert.equal(judgeCatch(on, landing, landsAt - CATCH_WINDOW - 1, landsAt), 'early');
  assert.equal(judgeCatch(on, landing, landsAt - CATCH_WINDOW, landsAt), 'caught');
  assert.equal(judgeCatch(on, landing, landsAt + CATCH_GRACE, landsAt), 'caught');
  assert.equal(judgeCatch(on, landing, landsAt + CATCH_GRACE + 1, landsAt), 'late');
  assert.equal(judgeCatch({ x: 40 + CATCH_R - 0.01, y: 60 }, landing, landsAt, landsAt), 'caught');
  assert.equal(judgeCatch({ x: 40 + CATCH_R, y: 60 }, landing, landsAt, landsAt), 'wide');
});

test('the game sweeps exactly the four stones left on the floor in every step', () => {
  const { steps } = JSON.parse(readFileSync(new URL('../games/five-stones/game.json', import.meta.url))).content;
  for (const s of steps) assert.equal(s.picks.reduce((a, b) => a + b), 4, s.title);
});
