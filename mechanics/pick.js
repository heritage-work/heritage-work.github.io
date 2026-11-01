// pick — one question at a time, 2-4 options, pick the right one.
// content: { questions:[ { prompt, options:[string], answer:int, note? } ] }
export const meta = { id: 'pick', name: 'Pick one' };

export async function mount({ root, content, api }) {
  const qs = content.questions;
  let i = 0, score = 0;

  const render = () => {
    const q = qs[i];
    api.setProgress(i, qs.length);
    root.replaceChildren(
      api.el('h2', {}, q.prompt),
      api.el('div', { class: 'grid', style: 'margin-top:12px' },
        q.options.map((opt, idx) =>
          api.el('button', { class: 'btn', style: 'text-align:left', onclick: (e) => answer(idx, e) }, opt)))
    );
  };

  const answer = (idx, e) => {
    const q = qs[i];
    const right = idx === q.answer;
    if (right) score++;
    [...root.querySelectorAll('button')].forEach((b, bi) => {
      b.disabled = true;
      if (bi === q.answer) b.style.borderColor = 'var(--ok)';
      if (bi === idx && !right) b.style.borderColor = 'var(--bad)';
    });
    root.append(
      api.el('div', { class: 'fact' },
        api.el('strong', {}, right ? 'Yes. ' : 'Nope. '), q.note || ''),
      api.el('button', {
        class: 'btn primary', style: 'margin-top:4px',
        onclick: () => { i++; i < qs.length ? render() : api.finish({ score, total: qs.length }); }
      }, i + 1 < qs.length ? 'Next' : 'Finish')
    );
  };

  render();
}
