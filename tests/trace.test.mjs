import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const game = JSON.parse(readFileSync(new URL('../games/rangoli/game.json', import.meta.url), 'utf8'));
const HIT = 6.5;   // mechanics/trace.js: how close the finger must come to a dot

// Points along a line, matching shape() in mechanics/trace.js.
const along = (dots, [a, b, bend = 0]) => {
  const p = dots[a], q = dots[b], len = Math.hypot(q[0] - p[0], q[1] - p[1]);
  const c = [(p[0] + q[0]) / 2 - (q[1] - p[1]) / len * bend, (p[1] + q[1]) / 2 + (q[0] - p[0]) / len * bend];
  return Array.from({ length: 49 }, (_, n) => {
    const t = (n + 1) / 50;
    return [0, 1].map(i => (1 - t) ** 2 * p[i] + 2 * (1 - t) * t * c[i] + t * t * q[i]);
  });
};

for (const pat of game.content.patterns) {
  test(`${pat.name} can be drawn in one unbroken line`, () => {
    const { dots, lines } = pat;
    lines.forEach(([a, b]) => assert.ok(dots[a] && dots[b] && a !== b, `bad line ${a}-${b}`));
    const odd = dots.filter((_, d) => lines.filter(l => l[0] === d || l[1] === d).length % 2);
    assert.ok(odd.length === 0 || odd.length === 2, `${odd.length} odd dots`);
    const seen = new Set([lines[0][0]]);
    for (let grew = true; grew;) {
      grew = false;
      for (const [a, b] of lines) if (seen.has(a) !== seen.has(b)) { seen.add(a); seen.add(b); grew = true; }
    }
    dots.forEach((_, d) => assert.ok(seen.has(d), `dot ${d} is not joined to the rest`));
  });

  test(`${pat.name}: dots are far enough apart and no line runs over another dot`, () => {
    const { dots, lines } = pat;
    dots.forEach((p, a) => dots.slice(a + 1).forEach((q, n) =>
      assert.ok(Math.hypot(p[0] - q[0], p[1] - q[1]) >= 2 * HIT, `dots ${a} and ${a + 1 + n} overlap`)));
    lines.forEach((l, k) => along(dots, l).forEach(([x, y]) => dots.forEach((d, n) => {
      if (n !== l[0] && n !== l[1]) assert.ok(Math.hypot(d[0] - x, d[1] - y) >= HIT, `line ${k} runs over dot ${n}`);
    })));
  });
}
