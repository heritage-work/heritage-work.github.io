// match — tap a term, then tap its pair.
// content: { prompt, pairs:[ { a, b, note? } ] }
export const meta = { id: 'match', name: 'Match the pairs' };

export async function mount({ root, content, api }) {
  const pairs = content.pairs;
  const left = api.shuffle(pairs.map((p, i) => ({ t: p.a, i })));
  const right = api.shuffle(pairs.map((p, i) => ({ t: p.b, i })));
  const solved = new Set();
  let sel = null, tries = 0;

  const col = (items, side) => api.el('div', { class: 'grid' },
    items.map(x => api.el('button', {
      class: 'btn',
      style: `text-align:left;${solved.has(x.i) ? 'opacity:.35' : ''}${sel && sel.side === side && sel.i === x.i ? ';border-color:var(--accent)' : ''}`,
      onclick: () => tap(x, side)
    }, x.t)));

  const render = () => {
    api.setProgress(solved.size, pairs.length);
    root.replaceChildren(
      api.el('h2', {}, content.prompt),
      api.el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px' },
        col(left, 'L'), col(right, 'R'))
    );
  };

  const tap = (x, side) => {
    if (solved.has(x.i)) return;
    if (!sel) { sel = { ...x, side }; return render(); }
    if (sel.side === side) { sel = { ...x, side }; return render(); }
    tries++;
    if (sel.i === x.i) {
      solved.add(x.i);
      sel = null;
      if (solved.size === pairs.length) {
        const score = Math.max(1, pairs.length * 2 - tries);
        return api.finish({ score: pairs.length, total: pairs.length,
          line: tries === pairs.length ? 'Clean sweep, no misses.' : `Got there in ${tries} tries.` });
      }
    } else { sel = null; }
    render();
  };

  render();
}
