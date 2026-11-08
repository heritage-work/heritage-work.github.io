import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareMeal, servePortion, sharingScore, makeRequests, pack, packable, nextGuest, guestReaction } from '../mechanics/berkat.js';
import { rng } from '../mechanics/tray.js';

const { rules, dishes, guests } = JSON.parse(readFileSync(new URL('../games/nasi-ambeng/game.json', import.meta.url))).content;
const families = guests.length;

for (const stage of [{ title: 'One feast', rules: {} }]) {
  const r = { ...rules, ...stage.rules };
  const start = dishes.map(d => d.portions ?? r.portions);
  test(`${stage.title}: fair serving succeeds with unknown requests and substitutes`, () => {
    for (let seed = 0; seed < 200; seed++) {
      const random = rng(seed), reserved = start.map(() => 0);
      for (let n = 0; n < families * r.packet;) {
        const d = Math.floor(random() * dishes.length);
        if (reserved[d] < Math.min(start[d], families)) { reserved[d]++; n++; }
      }
      const saved = reserved.slice(), left = prepareMeal(start, reserved, families, r);
      const served = guests.map(() => 0);
      // Decide using only the current request, current stock, and this guest's count.
      for (let round = 0; round < r.rounds; round++) for (let guest = 0; guest < families; guest++) {
        const requested = makeRequests(dishes, 1, 1, random)[0].dish;
        if (served[guest] >= r.need) continue;
        const chosen = left[requested] > 0 ? requested : left.findIndex(n => n > 0);
        assert(servePortion(left, served, guest, chosen));
        assert(left.every(n => n >= 0));
      }
      assert.deepEqual(reserved, saved, 'Serving must never consume the reserved food');
      const result = sharingScore(served, reserved, r);
      assert.equal(result.fed, families);
      assert.equal(result.packed, families * r.packet);
      assert.equal(result.score, result.total);
      assert.equal(left.reduce((a, b) => a + b, 0) + served.reduce((a, b) => a + b, 0) + reserved.reduce((a, b) => a + b, 0), start.reduce((a, b) => a + b, 0));
    }
  });
}

test('reservation rejects incomplete, overdrawn, duplicate and infeasible packets', () => {
  const r = { packet: 2, need: 2, rounds: 4 };
  const start = [4, 4, 4, 4, 4], reserved = [2, 2, 2, 1, 1];
  assert.deepEqual(prepareMeal(start, reserved, 4, r), [2, 2, 2, 3, 3]);
  assert.deepEqual(start, [4, 4, 4, 4, 4]);
  assert.throws(() => prepareMeal(start, [1, 1, 1, 1, 1], 4, r));
  assert.throws(() => prepareMeal(start, [5, 0, 1, 1, 1], 4, r));
  assert.throws(() => prepareMeal([8, 8], [5, 3], 4, r));
  assert.throws(() => prepareMeal(start, [2.5, 1.5, 2, 1, 1], 4, r));
  assert.throws(() => prepareMeal(start, [2, -1, 4, 2, 1], 4, r));
  assert.throws(() => prepareMeal([2, 2, 2, 2, 2], reserved, 4, r));
  assert.throws(() => prepareMeal(start, reserved, 4, { ...r, rounds: 1 }));
});

test('an empty dish or invalid choice cannot consume stock or add a serving', () => {
  const left = [0, 1], served = [0, 0];
  for (const [guest, dish] of [[0, 0], [0, -1], [0, 5], [-1, 1], [4, 1], [0, .5]]) {
    assert.equal(servePortion(left, served, guest, dish), false);
    assert.deepEqual(left, [0, 1]);
    assert.deepEqual(served, [0, 0]);
  }
  assert(servePortion(left, served, 1, 1));
  assert.deepEqual(left, [0, 0]);
  assert.deepEqual(served, [0, 1]);
});

test('a guest can receive the same substitute twice while take-home packets stay varied', () => {
  const reserved = [2, 2, 2, 1, 1], left = [1, 2, 1, 1, 1], served = [0, 0, 0, 0];
  assert(servePortion(left, served, 0, 1));
  assert(servePortion(left, served, 0, 1));
  assert.equal(served[0], 2);
  assert.equal(left[1], 0);
  assert.equal(sharingScore(served, reserved, { need: 2, packet: 2 }).score, 10);
  for (const packet of pack(reserved, 4, 2)) assert.equal(new Set(packet).size, 2);
});

test('fair sharing rewards partial progress and gives no bonus for extra servings', () => {
  const r = { need: 2, packet: 2 }, reserved = [2, 2, 2, 1, 1];
  assert.equal(sharingScore([0, 0, 0, 0], reserved, r).score, 8);
  assert.equal(sharingScore([1, 0, 0, 0], reserved, r).score, 9);
  assert.equal(sharingScore([2, 2, 2, 2], reserved, r).score, 16);
  assert.equal(sharingScore([5, 2, 2, 2], reserved, r).score, 16);
  assert(sharingScore([2, 2, 2, 2], reserved, r).score > sharingScore([4, 4, 0, 0], reserved, r).score);
});

test('packets are balanced, respect stock, and contain different dishes', () => {
  for (let seed = 0; seed < 5000; seed++) {
    const random = rng(seed);
    const left = dishes.map(() => Math.floor(random() * 8));
    const packets = pack(left, families, rules.packet);
    assert.equal(packets.flat().length, packable(left, families, rules.packet));
    for (const packet of packets) {
      assert(packet.length <= rules.packet);
      assert.equal(new Set(packet).size, packet.length);
    }
    for (let d = 0; d < dishes.length; d++) assert(packets.flat().filter(i => i === d).length <= left[d]);
    const sizes = packets.map(p => p.length);
    assert(Math.max(...sizes) - Math.min(...sizes) <= 1);
  }
});


test('the shorter feast has a valid favourite for every guest and at most 16 offers', () => {
  assert(rules.rounds * guests.length >= 12 && rules.rounds * guests.length <= 16);
  for (const guest of guests) assert(dishes.some(d => d.id === guest.favorite));
});

test('requests help the least-served guest and stop once everyone has enough', () => {
  assert.equal(nextGuest([3, 2, 0, 1], 3), 2);
  assert.equal(nextGuest([3, 3, 3, 3], 3), -1);
  for (let seed = 0; seed < 100; seed++) {
    const g = nextGuest([0, 0, 0, 0], 3, 0, rng(seed));
    assert(g > 0 && g < 4, 'Rotate between equally hungry guests');
  }
});

test('guests acknowledge favourites, substitutes, repeats and having enough', () => {
  const guest = guests[0], favorite = dishes.find(d => d.id === guest.favorite);
  const other = dishes.find(d => d.id !== guest.favorite);
  assert.equal(guestReaction(guest, favorite, [], 1, 3), guest.thanks);
  assert.equal(guestReaction(guest, other, [], 1, 3), guest.substitute);
  assert(guestReaction(guest, other, [other.id], 2, 3).includes('Another helping'));
  assert(guestReaction(guest, other, [], 3, 3).includes('enough for me'));
  assert(guestReaction(guest, other, [], 4, 3).includes('everyone gets some'));
});
