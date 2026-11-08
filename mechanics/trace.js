// trace — draw a pattern in one unbroken line, without going over a line twice, then colour it in.
// content: { prompt, powders?:[ { name, colour, label?, description? } ],
//            patterns:[ { name, note?, dots:[[x,y]], lines:[[from, to, bend?]] } ] }
//   x, y in a 0-100 box. bend pushes the control point of a curved line sideways (0 = straight).
//   Each tap colours only the enclosed space selected, including in symmetric designs.
//   A pattern with two odd dots can only be finished from one of them, so those dots show gold.
export const meta = { id: 'trace', name: 'One unbroken line' };

const NS = 'http://www.w3.org/2000/svg';
const HIT = 6.5;          // how close (in box units) the finger must come to a dot
const PX = 4;             // paint canvas pixels per box unit
const SIZE = 108 * PX;    // the box runs from -4 to 104
const MIN_SPACE = 120;    // smaller enclosed spaces (in pixels) don't need colouring
const POWDERS = [{ name: 'Turmeric', colour: '#e0a526' }, { name: 'Vermillion', colour: '#d2462e' }];

const svg = (tag, attrs = {}) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const toPx = ([x, y]) => [Math.round((x + 4) * PX), Math.round((y + 4) * PX)];

// Geometry for one line: its control point, true midpoint and path segment.
function shape(dots, [a, b, bend = 0]) {
  const p = dots[a], q = dots[b];
  const len = dist(p, q);
  const nx = -(q[1] - p[1]) / len, ny = (q[0] - p[0]) / len;
  const c = [(p[0] + q[0]) / 2 + nx * bend, (p[1] + q[1]) / 2 + ny * bend];
  const mid = [(p[0] + 2 * c[0] + q[0]) / 4, (p[1] + 2 * c[1] + q[1]) / 4];
  return { c, mid, seg: (from, to) => bend ? `Q${c[0]} ${c[1]} ${to[0]} ${to[1]}` : `L${to[0]} ${to[1]}` };
}

// Label every space the lines enclose. Spaces touching the edge are the floor, not the design.
function spaces(dots, lines, shapes) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = SIZE;
  const g = cv.getContext('2d');
  g.setTransform(PX, 0, 0, PX, 4 * PX, 4 * PX);
  g.lineWidth = 0.8; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath();
  lines.forEach(([a, b, bend], k) => {
    g.moveTo(...dots[a]);
    if (bend) g.quadraticCurveTo(...shapes[k].c, ...dots[b]); else g.lineTo(...dots[b]);
  });
  g.stroke();
  const wall = g.getImageData(0, 0, SIZE, SIZE).data;
  const label = new Int32Array(SIZE * SIZE).fill(-1);
  const sizes = [], edge = [];
  for (let s = 0; s < SIZE * SIZE; s++) {
    if (label[s] >= 0 || wall[s * 4 + 3] > 100) continue;
    const id = sizes.length, stack = [s];
    let n = 0, touches = false;
    label[s] = id;
    while (stack.length) {
      const q = stack.pop(), x = q % SIZE, y = (q - x) / SIZE;
      n++;
      if (x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1) touches = true;
      for (const r of [x > 0 && q - 1, x < SIZE - 1 && q + 1, y > 0 && q - SIZE, y < SIZE - 1 && q + SIZE]) {
        if (r !== false && label[r] < 0 && wall[r * 4 + 3] <= 100) { label[r] = id; stack.push(r); }
      }
    }
    sizes.push(n); edge.push(touches);
  }
  const ids = sizes.map((n, id) => id).filter(id => !edge[id] && sizes[id] >= MIN_SPACE);
  return { label, ids: new Set(ids) };
}

export async function mount({ root, content, api }) {
  const pats = content.patterns;
  const powders = content.powders || POWDERS;
  let i = 0, score = 0, breaks = 0;

  const play = () => {
    const pat = pats[i];
    const { dots, lines } = pat;
    const shapes = lines.map(l => shape(dots, l));
    const degree = dots.map((_, d) => lines.filter(l => l[0] === d || l[1] === d).length);
    const odd = degree.map((n, d) => n % 2 ? d : -1).filter(d => d >= 0);
    let tries = 0;
    api.setProgress(i, pats.length);

    const paint = api.el('canvas', { class: 'trace-paint', width: SIZE, height: SIZE });
    const board = svg('svg', { viewBox: '-4 -4 108 108', class: 'trace-board', role: 'img',
      'aria-label': `${pat.name}: ${lines.length} lines to trace` });
    const guides = svg('g', { class: 'trace-guide' });
    const drawn = svg('path', { class: 'trace-line' });
    const rubber = svg('path', { class: 'trace-rubber' });   // the finger's own path since the last dot
    const dotLayer = svg('g');
    lines.forEach(([a, b], k) => guides.append(svg('path', {
      d: `M${dots[a][0]} ${dots[a][1]}${shapes[k].seg(dots[a], dots[b])}` })));
    const dotEls = dots.map(([x, y], d) => {
      const c = svg('circle', { cx: x, cy: y, r: 2.4, class: odd.includes(d) ? 'trace-dot start' : 'trace-dot' });
      dotLayer.append(c);
      return c;
    });
    board.append(guides, drawn, rubber, dotLayer);
    const wrap = api.el('div', { class: 'trace-wrap' }, paint, board);

    const status = api.el('p', { class: 'muted trace-status', 'aria-live': 'polite' },
      odd.length ? 'Start at a gold dot. ' : '', `${lines.length} lines to draw.`);
    const skip = api.el('button', { class: 'btn', hidden: '', onclick: () => next() }, 'Skip this one');
    const tools = api.el('div', { class: 'row trace-tools' }, skip);
    root.replaceChildren(
      api.el('h2', {}, pat.name),
      api.el('p', { class: 'muted' }, content.prompt),
      wrap, status, tools);

    // Drawing state
    let at = -1, used = new Set(), d = '', near = new Map(), last = null, done = false, colouring = null, trail = '';

    const toBox = e => {
      const m = board.getScreenCTM().inverse();
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
      return [p.x, p.y];
    };
    const dotNear = p => {
      let best = -1, bd = HIT;
      dots.forEach((q, k) => { const dd = dist(p, q); if (dd < bd) { bd = dd; best = k; } });
      return best;
    };
    const reset = () => {
      at = -1; used = new Set(); d = ''; near = new Map(); last = null; trail = '';
      drawn.setAttribute('d', ''); rubber.setAttribute('visibility', 'hidden');
      dotEls.forEach(c => c.classList.remove('here'));
    };
    const moveTo = k => {
      dotEls[at]?.classList.remove('here');
      at = k; near = new Map(); trail = `M${dots[k][0]} ${dots[k][1]}`;
      dotEls[k].classList.add('here');
    };

    // Follow the finger one small step at a time so a fast swipe can't skip a dot.
    const step = p => {
      lines.forEach((l, k) => {
        if (used.has(k) || (l[0] !== at && l[1] !== at)) return;
        near.set(k, Math.min(near.get(k) ?? Infinity, dist(p, shapes[k].mid)));
      });
      const k = dotNear(p);
      if (k < 0 || k === at) return;
      const open = lines.map((l, n) => n).filter(n => !used.has(n) &&
        ((lines[n][0] === at && lines[n][1] === k) || (lines[n][1] === at && lines[n][0] === k)));
      if (!open.length) return;
      const pick = open.reduce((x, y) => (near.get(x) ?? Infinity) <= (near.get(y) ?? Infinity) ? x : y);
      used.add(pick);
      d += shapes[pick].seg(dots[at], dots[k]);
      drawn.setAttribute('d', d);
      moveTo(k);
      status.textContent = `${lines.length - used.size} lines to go.`;
      if (used.size === lines.length) complete();
    };

    board.addEventListener('pointerdown', e => {
      if (colouring) return colouring(toBox(e));
      if (done) return;
      const p = toBox(e), k = dotNear(p);
      if (k < 0) return;
      if (odd.length && !odd.includes(k)) { status.textContent = 'Start at a gold dot. Only those can finish in one line.'; return; }
      e.preventDefault();
      board.setPointerCapture(e.pointerId);
      reset();
      d = `M${dots[k][0]} ${dots[k][1]}`;
      moveTo(k); last = p;
    });
    board.addEventListener('pointermove', e => {
      if (at < 0 || done) return;
      const p = toBox(e);
      const n = Math.max(1, Math.ceil(dist(last, p) / 1.5));
      for (let s = 1; s <= n && !done; s++) step([last[0] + (p[0] - last[0]) * s / n, last[1] + (p[1] - last[1]) * s / n]);
      last = p;
      if (done) return;
      trail += `L${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
      rubber.setAttribute('d', trail);
      rubber.setAttribute('visibility', 'visible');
    });
    const lift = () => {
      if (at < 0 || done) return;
      if (used.size) {
        tries++; breaks++;
        status.textContent = 'The line broke. A rangoli line is unbroken, so start again.';
        wrap.classList.add('broke');
        setTimeout(() => wrap.classList.remove('broke'), 400);
        skip.hidden = tries < 2;
      }
      reset();
    };
    board.addEventListener('pointerup', lift);
    board.addEventListener('pointercancel', lift);

    const complete = () => {
      done = true; score++;
      rubber.setAttribute('visibility', 'hidden');
      wrap.classList.add('complete');
      dotEls[at].classList.remove('here');
      skip.remove();
      colour(tries ? 'Unbroken at last.' : 'Unbroken, first try.');
    };

    // Colour stage: pick a material, then colour one enclosed space at a time.
    const colour = praise => {
      const { label, ids } = spaces(dots, lines, shapes);
      const g = paint.getContext('2d');
      const img = g.createImageData(SIZE, SIZE);
      const filled = new Map();
      let powder = powders[0];
      const count = api.el('span', {}, `0 of ${ids.size} spaces coloured.`);
      status.replaceChildren(api.el('strong', {}, praise), ' Now colour it in. ',
        'Choose a material, then tap one space. You can change its colour by tapping again. ', count);
      const materialInfo = api.el('p', { class: 'muted trace-material', 'aria-live': 'polite' },
        powder.description || powder.name);
      root.append(materialInfo);

      const swatches = powders.map(p => api.el('button', {
        class: 'swatch', 'aria-pressed': p === powder ? 'true' : 'false',
        onclick: e => {
          powder = p;
          materialInfo.textContent = p.description || p.name;
          tools.querySelectorAll('.swatch').forEach(b => b.setAttribute('aria-pressed', b === e.currentTarget ? 'true' : 'false'));
        }
      }, api.el('i', { style: `background:${p.colour}`, 'aria-hidden': 'true' }), p.label || p.name));
      const finish = api.el('button', { class: 'btn', onclick: () => reveal() }, 'Skip colouring');
      tools.replaceChildren(...swatches, finish);

      const spaceAt = ([x, y]) => {
        const [px, py] = toPx([x, y]);
        for (let r = 0; r <= 8; r += 2) for (let dy = -r; dy <= r; dy += 2) for (let dx = -r; dx <= r; dx += 2) {
          const sx = px + dx, sy = py + dy;
          if (sx < 0 || sy < 0 || sx >= SIZE || sy >= SIZE) continue;
          const id = label[sy * SIZE + sx];
          if (id >= 0) return id;
        }
        return -1;
      };
      const rgb = h => [1, 3, 5].map(o => parseInt(h.slice(o, o + 2), 16));
      colouring = p => {
        const id = spaceAt(p);
        if (!ids.has(id)) return;
        const [r, gr, b] = rgb(powder.colour);
        for (let s = 0; s < label.length; s++) {
          if (label[s] !== id) continue;
          img.data[s * 4] = r; img.data[s * 4 + 1] = gr; img.data[s * 4 + 2] = b; img.data[s * 4 + 3] = 235;
        }
        g.putImageData(img, 0, 0);
        filled.set(id, powder.name);
        count.textContent = `${filled.size} of ${ids.size} spaces coloured.`;
        if (filled.size === ids.size) reveal();
      };

      const reveal = () => {
        if (!tools.isConnected || tools.dataset.done) return;
        tools.dataset.done = '1';
        finish.remove();
        if (filled.size === ids.size) count.textContent = 'Every space coloured.';
        root.append(
          pat.note ? api.el('div', { class: 'fact' }, pat.note) : null,
          api.el('button', { class: 'btn primary', onclick: () => next() },
            i + 1 < pats.length ? 'Next pattern' : 'Finish'));
      };
    };
  };

  const next = () => {
    i++;
    if (i < pats.length) return play();
    api.finish({ score, total: pats.length,
      line: breaks ? `Your line broke ${breaks} time${breaks > 1 ? 's' : ''}.` : 'Not a single break.' });
  };

  play();
}
