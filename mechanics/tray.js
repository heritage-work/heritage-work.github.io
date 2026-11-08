// tray — fill a shared tray around the rice, then find out what your picks say about you.
// content: { pick, prompt, dishes:[ { id, name, note, look, types:{ <type>: weight } } ],
//            types:{ <type>: { name, text } } }
//   look picks how a dish is drawn (a key of LOOKS). The type with the most weight wins;
//   an exact tie goes to the type your earlier picks leaned towards.
export const meta = { id: 'tray', name: 'Fill the tray' };

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

// Seeded so a dish looks the same on the tray and on its button.
export function rng(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const scatter = (rand, n, r) => Array.from({ length: n }, () => {
  const a = rand() * 2 * Math.PI, d = Math.sqrt(rand()) * r;
  return [d * Math.cos(a), d * Math.sin(a)];
});
const pick = (rand, list) => list[Math.floor(rand() * list.length)];
const spin = (rand, x, y) => `rotate(${Math.round(rand() * 360)} ${x} ${y})`;

// Each draws one dish inside a radius of about 11 around the origin.
const LOOKS = {
  rendang(g, rand) {
    g.append(svg('circle', { r: 11, fill: '#6b3a1e' }));
    for (const [x, y] of scatter(rand, 6, 6)) {
      g.append(svg('rect', { x: x - 3, y: y - 2.5, width: 6, height: 5, rx: 2, fill: '#45200f', transform: spin(rand, x, y) }));
    }
  },
  sambal(g, rand) {
    g.append(svg('circle', { r: 11, fill: '#c8371d' }));
    for (const [x, y] of scatter(rand, 7, 6)) {
      const a = rand() * Math.PI, dx = 4.5 * Math.cos(a), dy = 4.5 * Math.sin(a);
      g.append(svg('line', { x1: x - dx, y1: y - dy, x2: x + dx, y2: y + dy, stroke: '#4f8a2b', 'stroke-width': 1.6, 'stroke-linecap': 'round' }));
    }
    for (const [x, y] of scatter(rand, 5, 7)) {
      g.append(svg('rect', { x: x - 1.3, y: y - 1.3, width: 2.6, height: 2.6, fill: '#d9a75a', transform: spin(rand, x, y) }));
    }
  },
  tempe(g, rand) {
    for (const [x, y] of [[-4, -4], [4, -3], [-3, 4], [5, 5]]) {
      const t = spin(rand, x, y);
      g.append(svg('rect', { x: x - 4.5, y: y - 2.6, width: 9, height: 5.2, rx: 1, fill: '#c98a3a', stroke: '#8a5522', 'stroke-width': .5, transform: t }));
      for (const [px, py] of scatter(rand, 5, 2)) {
        g.append(svg('circle', { cx: x + px, cy: y + py * .8, r: .55, fill: '#f0d29a', transform: t }));
      }
    }
  },
  urap(g, rand) {
    g.append(svg('circle', { r: 10, fill: '#6f9e3f' }));
    for (const [x, y] of scatter(rand, 14, 8)) {
      const a = rand() * 2 * Math.PI;
      g.append(svg('path', {
        d: `M${x} ${y}q${3 * Math.cos(a + 1)} ${3 * Math.sin(a + 1)} ${5 * Math.cos(a)} ${5 * Math.sin(a)}`,
        fill: 'none', stroke: pick(rand, ['#3f7a2a', '#9cc25a']), 'stroke-width': 1.1, 'stroke-linecap': 'round'
      }));
    }
    for (const [x, y] of scatter(rand, 26, 9)) g.append(svg('circle', { cx: x, cy: y, r: .6, fill: '#fbf6ec' }));
  },
  serunding(g, rand) {
    for (const [x, y] of scatter(rand, 130, 10)) {
      g.append(svg('circle', { cx: x, cy: y, r: .75, fill: pick(rand, ['#a8642a', '#c98a3a', '#7a4419']) }));
    }
  },
  bergedil(g, rand) {
    for (const [x, y] of [[-4, -3.5], [4.5, -2], [0, 5]]) {
      g.append(svg('circle', { cx: x, cy: y, r: 5, fill: '#8a5a2b' }));
      for (const [px, py] of scatter(rand, 8, 4)) {
        g.append(svg('circle', { cx: x + px, cy: y + py, r: .5, fill: pick(rand, ['#5a3416', '#c9934f']) }));
      }
    }
  },
  ayam(g, rand) {
    for (const [x, y] of [[-3, -4], [4, 1], [-3, 5]]) {
      const t = spin(rand, x, y);
      g.append(svg('rect', { x: x + 4, y: y - .8, width: 4, height: 1.6, rx: .8, fill: '#f3e6cc', transform: t }));
      g.append(svg('ellipse', { cx: x, cy: y, rx: 5.5, ry: 3.8, fill: '#b5651d', transform: t }));
      for (const [px, py] of scatter(rand, 6, 3)) {
        g.append(svg('circle', { cx: x + px, cy: y + py * .7, r: .6, fill: '#7a3e10', transform: t }));
      }
    }
  },
  rempeyek(g, rand) {
    for (const [cx, cy] of [[-3, -2], [3, 3]]) {
      const pts = Array.from({ length: 12 }, (_, i) => {
        const a = i / 12 * 2 * Math.PI, d = 6 + rand() * 2;
        return `${(cx + d * Math.cos(a)).toFixed(2)},${(cy + d * Math.sin(a)).toFixed(2)}`;
      });
      g.append(svg('polygon', { points: pts.join(' '), fill: '#e6c27a', stroke: '#c9a45a', 'stroke-width': .5 }));
      for (const [x, y] of scatter(rand, 5, 4.5)) {
        g.append(svg('ellipse', { cx: cx + x, cy: cy + y, rx: 1.1, ry: .8, fill: '#9b5a2a', transform: spin(rand, cx + x, cy + y) }));
      }
    }
  }
};

// A dish on its banana leaf, centred on the origin.
export function drawDish(dish, seed) {
  const g = svg('g');
  g.append(svg('circle', { r: 14, class: 'tray-leaf' }));
  LOOKS[dish.look](g, rng(seed));
  return g;
}

export function drawRice(rand) {
  const g = svg('g');
  g.append(svg('circle', { cx: 50, cy: 50, r: 15, class: 'tray-rice' }));
  for (const [x, y] of scatter(rand, 46, 13)) {
    g.append(svg('ellipse', { cx: 50 + x, cy: 50 + y, rx: 1.1, ry: .45, class: 'tray-grain', transform: spin(rand, 50 + x, 50 + y) }));
  }
  return g;
}

export function personality(picks, types) {
  const total = {};
  picks.forEach((d, i) => {
    for (const [t, w] of Object.entries(d.types)) {
      // The small order bonus only matters when two types are otherwise level.
      total[t] = (total[t] || 0) + w + (picks.length - i) * 0.01;
    }
  });
  const [best] = Object.entries(total).sort((a, b) => b[1] - a[1])[0];
  return types[best];
}

export async function mount({ root, content, api }) {
  const need = content.pick;
  const dishes = content.dishes;
  const slots = Array(need).fill(null); // dish in each position round the rice
  const picks = [];                     // dishes in the order they were chosen

  const board = svg('svg', { viewBox: '0 0 100 100', class: 'tray-board', role: 'img', 'aria-label': 'Your tray' });
  board.append(svg('circle', { cx: 50, cy: 50, r: 49, class: 'tray-rim' }),
    svg('circle', { cx: 50, cy: 50, r: 46, class: 'tray-face' }));
  const at = i => {
    const a = -Math.PI / 2 + Math.PI / need + i * 2 * Math.PI / need;
    return [50 + 30 * Math.cos(a), 50 + 30 * Math.sin(a)];
  };
  const slotGroups = slots.map((_, i) => {
    const [x, y] = at(i);
    const g = svg('g', { transform: `translate(${x} ${y})` });
    board.append(g);
    return g;
  });
  board.append(drawRice(rng(7)));

  const note = api.el('p', { class: 'tray-note', 'aria-live': 'polite' });
  const serve = api.el('button', { class: 'btn primary', onclick: () => done() });
  const chips = dishes.map((dish, i) => {
    const thumb = svg('svg', { viewBox: '-15 -15 30 30', 'aria-hidden': 'true' });
    thumb.append(drawDish(dish, i + 1));
    return api.el('button', { class: 'tray-chip', 'aria-pressed': 'false', onclick: () => toggle(i) },
      thumb, api.el('span', {}, dish.name));
  });

  root.replaceChildren(
    api.el('h2', { class: 'tray-prompt' }, content.prompt),
    api.el('div', { class: 'tray-wrap' }, board),
    note,
    api.el('div', { class: 'tray-chips' }, chips),
    api.el('div', { class: 'row', style: 'justify-content:center;margin-top:14px' }, serve));

  const render = () => {
    slots.forEach((dish, i) => {
      const g = slotGroups[i];
      if (g.dataset.id === (dish?.id ?? '')) return;
      g.dataset.id = dish?.id ?? '';
      if (!dish) { g.replaceChildren(svg('circle', { r: 14, class: 'tray-slot' })); return; }
      const pop = svg('g', { class: 'tray-pop' });
      pop.append(drawDish(dish, dishes.indexOf(dish) + 1));
      g.replaceChildren(pop);
    });
    const full = picks.length === need;
    chips.forEach((c, i) => {
      const on = picks.includes(dishes[i]);
      c.setAttribute('aria-pressed', String(on));
      c.disabled = full && !on;
    });
    serve.disabled = !full;
    serve.textContent = full ? 'Serve it' : `Pick ${need - picks.length} more`;
    api.setProgress(picks.length, need);
  };

  const toggle = i => {
    const dish = dishes[i];
    if (picks.includes(dish)) {
      picks.splice(picks.indexOf(dish), 1);
      slots[slots.indexOf(dish)] = null;
      note.textContent = '';
    } else if (picks.length < need) {
      picks.push(dish);
      slots[slots.indexOf(null)] = dish;
      note.replaceChildren(api.el('strong', {}, dish.name + '. '), dish.note);
    }
    render();
  };

  const done = () => {
    const type = personality(picks, content.types);
    const names = picks.map(d => d.name.toLowerCase()).join(', ');
    api.finish({ result: type.name, line: `${type.text} Your tray: rice with ${names}.` });
  };

  render();
}
