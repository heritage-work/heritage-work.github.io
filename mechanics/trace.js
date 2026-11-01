// trace — draw a pattern in one unbroken line, without going over a line twice.
// content: { prompt, patterns:[ { name, note?, dots:[[x,y]], lines:[[from, to, bend?]] } ] }
//   x, y in a 0-100 box. bend pushes the control point of a curved line sideways (0 = straight).
export const meta = { id: 'trace', name: 'One unbroken line' };

const NS = 'http://www.w3.org/2000/svg';
const HIT = 6.5;   // how close (in box units) the finger must come to a dot
const COLOURS = ['#e0a526', '#d2462e', '#3f8f5a', '#c2457f', '#3d5aa8'];

const svg = (tag, attrs = {}) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Geometry for one line: its control point, true midpoint and path segment.
function shape(dots, [a, b, bend = 0]) {
  const p = dots[a], q = dots[b];
  const len = dist(p, q);
  const nx = -(q[1] - p[1]) / len, ny = (q[0] - p[0]) / len;
  const c = [(p[0] + q[0]) / 2 + nx * bend, (p[1] + q[1]) / 2 + ny * bend];
  const mid = [(p[0] + 2 * c[0] + q[0]) / 4, (p[1] + 2 * c[1] + q[1]) / 4];
  return { c, mid, seg: (from, to) => bend ? `Q${c[0]} ${c[1]} ${to[0]} ${to[1]}` : `L${to[0]} ${to[1]}` };
}

export async function mount({ root, content, api }) {
  const pats = content.patterns;
  let i = 0, score = 0, breaks = 0;

  const play = () => {
    const pat = pats[i];
    const { dots, lines } = pat;
    const shapes = lines.map(l => shape(dots, l));
    const degree = dots.map((_, d) => lines.filter(l => l[0] === d || l[1] === d).length);
    const odd = degree.map((n, d) => n % 2 ? d : -1).filter(d => d >= 0);
    let tries = 0;
    api.setProgress(i, pats.length);

    const board = svg('svg', { viewBox: '-4 -4 108 108', class: 'trace-board', role: 'img',
      'aria-label': `${pat.name}: ${lines.length} lines to trace` });
    const fill = svg('path', { class: 'trace-fill', 'fill-rule': 'evenodd', fill: COLOURS[i % COLOURS.length] });
    const guides = svg('g', { class: 'trace-guide' });
    const drawn = svg('path', { class: 'trace-line' });
    const rubber = svg('line', { class: 'trace-rubber' });
    const dotLayer = svg('g');
    lines.forEach(([a, b], k) => guides.append(svg('path', {
      d: `M${dots[a][0]} ${dots[a][1]}${shapes[k].seg(dots[a], dots[b])}` })));
    const dotEls = dots.map(([x, y], d) => {
      const c = svg('circle', { cx: x, cy: y, r: 2.4, class: odd.includes(d) ? 'trace-dot start' : 'trace-dot' });
      dotLayer.append(c);
      return c;
    });
    board.append(fill, guides, drawn, rubber, dotLayer);

    const status = api.el('p', { class: 'muted trace-status', 'aria-live': 'polite' },
      odd.length ? 'Start at a gold dot. ' : '', `${lines.length} lines to draw.`);
    const skip = api.el('button', { class: 'btn', hidden: '', onclick: () => next() }, 'Skip this one');
    root.replaceChildren(
      api.el('h2', {}, pat.name),
      api.el('p', { class: 'muted' }, content.prompt),
      board, status, api.el('div', { class: 'row' }, skip));

    // Drawing state
    let at = -1, used = new Set(), d = '', near = new Map(), last = null, done = false;

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
      at = -1; used = new Set(); d = ''; near = new Map(); last = null;
      drawn.setAttribute('d', ''); rubber.setAttribute('visibility', 'hidden');
      dotEls.forEach(c => c.classList.remove('here'));
    };
    const moveTo = k => {
      dotEls[at]?.classList.remove('here');
      at = k; near = new Map();
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
      rubber.setAttribute('x1', dots[at][0]); rubber.setAttribute('y1', dots[at][1]);
      rubber.setAttribute('x2', p[0]); rubber.setAttribute('y2', p[1]);
      rubber.setAttribute('visibility', 'visible');
    });
    const lift = () => {
      if (at < 0 || done) return;
      if (used.size) {
        tries++; breaks++;
        status.textContent = 'The line broke. A rangoli line is unbroken, so start again.';
        board.classList.add('broke');
        setTimeout(() => board.classList.remove('broke'), 400);
        skip.hidden = tries < 2;
      }
      reset();
    };
    board.addEventListener('pointerup', lift);
    board.addEventListener('pointercancel', lift);

    const complete = () => {
      done = true; score++;
      rubber.setAttribute('visibility', 'hidden');
      fill.setAttribute('d', d);
      board.classList.add('complete');
      dotEls[at].classList.remove('here');
      status.replaceChildren(api.el('strong', {}, tries ? 'Unbroken at last.' : 'Unbroken, first try.'));
      skip.remove();
      root.append(
        pat.note ? api.el('div', { class: 'fact' }, pat.note) : null,
        api.el('button', { class: 'btn primary', onclick: () => next() },
          i + 1 < pats.length ? 'Next pattern' : 'Finish'));
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
