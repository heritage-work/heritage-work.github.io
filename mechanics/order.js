// order — drag-free ordering. Tap items in the order you think is right.
// content: { prompt, items:[ { label, rank, note? } ] }  rank = correct position, 1-based
export const meta = { id: 'order', name: 'Put in order' };

export async function mount({ root, content, api }) {
  const pool = api.shuffle(content.items);
  const chosen = [];

  const render = () => {
    api.setProgress(chosen.length, pool.length);
    root.replaceChildren(
      api.el('h2', {}, content.prompt),
      api.el('p', { class: 'muted' }, 'Tap them in order, earliest first.'),
      api.el('div', { class: 'grid' },
        pool.filter(x => !chosen.includes(x)).map(x =>
          api.el('button', { class: 'btn', style: 'text-align:left', onclick: () => { chosen.push(x); step(); } }, x.label))),
      chosen.length ? api.el('p', { class: 'muted', style: 'margin-top:14px' },
        chosen.map((c, n) => `${n + 1}. ${c.label}`).join('  ·  ')) : null
    );
  };

  const step = () => chosen.length === pool.length ? reveal() : render();

  const reveal = () => {
    const correct = pool.slice().sort((a, b) => a.rank - b.rank);
    let score = 0;
    const rows = correct.map((c, n) => {
      const ok = chosen[n] === c;
      if (ok) score++;
      return api.el('div', { style: 'padding:8px 0;border-bottom:1px solid var(--line)' },
        api.el('strong', { style: `color:${ok ? 'var(--ok)' : 'var(--bad)'}` }, `${n + 1}. `),
        c.label, c.note ? api.el('div', { class: 'muted', style: 'font-size:.85rem' }, c.note) : null);
    });
    root.replaceChildren(api.el('h2', {}, 'The real order'), ...rows,
      api.el('button', {
        class: 'btn primary', style: 'margin-top:14px',
        onclick: () => api.finish({ score, total: pool.length })
      }, 'Done'));
  };

  render();
}
