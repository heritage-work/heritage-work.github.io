// berkat — reserve take-home food, then share a tray as requests arrive.
// Rules: { portions, rounds, packet, need }. Guests accept any offered side dish.
// Score: one point per side serving toward a guest's goal and per take-home portion.
import { drawDish as drawBaseDish, drawRice, rng } from './tray.js';

export const meta = { id: 'berkat', name: 'Leave some for berkat' };

const NS = 'http://www.w3.org/2000/svg';
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const svg = (tag, attrs = {}) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

// Reuse the preloaded food artwork on the tray, stock list and packets.
// The shared vector drawing supports games without image assets.
function drawDish(dish, seed, assets) {
  const image = assets?.[dish.asset];
  if (image) return svg('image', { href: image.src, x: -16, y: -16, width: 32, height: 32 });
  const art = drawBaseDish(dish, seed);
  art.firstChild.setAttribute('fill', '#356842');
  const veins = svg('g', { fill: 'none', stroke: '#a7c47b', 'stroke-width': .3, opacity: .6 });
  veins.append(svg('path', { d: 'M-10 10L10-10' }));
  for (let n = -6; n <= 6; n += 3) {
    veins.append(svg('path', { d: `M${n - 5} ${-n - 4}L${n} ${-n}L${n + 5} ${-n + 4}` }));
  }
  art.insertBefore(veins, art.children[1]);
  art.append(svg('path', { d: 'M-9 10Q0 16 10 8', fill: 'none', stroke: '#bed38b', 'stroke-width': .45, opacity: .7 }));
  return art;
}

// Most portions that can be packed: a family takes at most one of each dish, and at most `packet` in all.
export function packable(left, families, packet) {
  return Math.min(families * packet, left.reduce((s, n) => s + Math.min(n, families), 0));
}

// Deal what's left into packets. A dish's portions go to consecutive families, so no packet gets a dish twice.
export function pack(left, families, packet) {
  const packets = Array.from({ length: families }, () => []);
  let k = 0;
  left.forEach((n, d) => {
    for (let c = 0; c < Math.min(n, families) && k < families * packet; c++, k++) packets[k % families].push(d);
  });
  return packets;
}

export function makeRequests(dishes, families, rounds, random = Math.random) {
  const weights = dishes.map(d => d.popularity ?? 1);
  const sum = weights.reduce((a, b) => a + b, 0);
  const draw = () => {
    let x = random() * sum, d = 0;
    while (x >= weights[d]) x -= weights[d++];
    return d;
  };
  const out = [];
  for (let r = 0; r < rounds; r++) for (let g = 0; g < families; g++) out.push({ guest: g, dish: draw() });
  return out;
}

// Reserving a full set of packets must leave enough food to meet every meal goal.
export function prepareMeal(start, reserved, families, rules) {
  if (start.length !== reserved.length || reserved.some((n, d) =>
    !Number.isInteger(n) || n < 0 || n > Math.min(start[d], families))) {
    throw new Error('Choose available portions, with at most one of each dish per family.');
  }
  if (reserved.reduce((sum, n) => sum + n, 0) !== families * rules.packet) {
    throw new Error(`Set aside ${families * rules.packet} portions for the berkat first.`);
  }
  const left = start.map((n, d) => n - reserved[d]);
  if (left.reduce((sum, n) => sum + n, 0) < families * rules.need || rules.rounds < rules.need) {
    throw new Error('The shared tray needs more portions to meet every guest’s goal.');
  }
  return left;
}

export function servePortion(left, served, guest, dish) {
  if (!Number.isInteger(dish) || !Number.isInteger(guest) ||
      dish < 0 || dish >= left.length || guest < 0 || guest >= served.length || left[dish] <= 0) return false;
  left[dish]--;
  served[guest]++;
  return true;
}

export function sharingScore(served, reserved, rules) {
  const families = served.length;
  const packed = packable(reserved, families, rules.packet);
  const fed = served.filter(n => n >= rules.need).length;
  const score = served.reduce((sum, n) => sum + Math.min(n, rules.need), 0) + packed;
  return { fed, packed, score, total: families * (rules.need + rules.packet) };
}

// Requests favour guests who still need food; the host may serve anyone.
export function nextGuest(served, need, previous = -1, random = Math.random) {
  const waiting = served.map((n, g) => ({ n, g })).filter(({ n }) => n < need);
  if (!waiting.length) return -1;
  const least = Math.min(...waiting.map(({ n }) => n));
  let candidates = waiting.filter(({ n }) => n === least).map(({ g }) => g);
  if (candidates.length > 1) candidates = candidates.filter(g => g !== previous);
  return candidates[Math.floor(random() * candidates.length)];
}

export function guestReaction(guest, dish, previousDishes, count, need) {
  if (count > need) return 'I have plenty now. Let’s make sure everyone gets some!';
  let line = previousDishes.includes(dish.id) ? 'Another helping—thank you!' :
    dish.id === guest.favorite ? guest.thanks || 'My favourite! Thank you!' :
      guest.substitute || `${dish.name} sounds lovely too. Thank you!`;
  if (count === need) line += ' That’s enough for me!';
  return line;
}

export async function mount({ root, content, api }) {
  root.classList.add('berkat-feast');
  const guide = mountDishGuide({ root, content, api });
  const reserved = await reserveMeal({ root, content, rules: content.rules, api });
  const result = await new Promise(resolve => meal({ root, content, rules: content.rules, api, reserved, guide, resolve }));
  api.finish({ score: result.score, total: result.top, line: result.line,
    headline: result.complete ? 'Everyone served, every family taking food home.' :
      'Food for home, and a lesson in sharing the tray.' });
}

// Keep the dialog beside the stage; contextual buttons open it during play.
function mountDishGuide({ root, content, api }) {
  const { dishes } = content;
  let current = 0, opener;
  const title = api.el('h2', { id: 'berkat-dish-title', tabindex: '-1' });
  const subtitle = api.el('p', { class: 'berkat-guide-subtitle muted' });
  const art = svg('svg', { viewBox: '-17 -17 34 34', class: 'berkat-guide-art', 'aria-hidden': 'true' });
  const description = api.el('p');
  const facts = api.el('dl', { class: 'berkat-dish-facts' });
  const story = api.el('p', { class: 'berkat-dish-story' });
  const sources = api.el('div', { class: 'berkat-dish-sources' });
  const position = api.el('span', { class: 'muted' });
  const dialog = api.el('dialog', { class: 'berkat-dish-dialog', 'aria-labelledby': 'berkat-dish-title' },
    api.el('div', { class: 'berkat-guide-close-row' },
      api.el('button', { class: 'btn', type: 'button', onclick: () => dialog.close() }, 'Close dish guide')),
    api.el('div', { class: 'berkat-guide-heading' }, art, api.el('div', {}, title, subtitle)),
    description, facts, story,
    api.el('p', { class: 'berkat-guide-variation muted' }, 'These are the versions shown on our tray. Ingredients and seasoning vary between cooks.'),
    sources,
    api.el('div', { class: 'berkat-guide-navigation' },
      api.el('button', { class: 'btn', type: 'button', onclick: () => show((current + dishes.length - 1) % dishes.length) }, 'Previous dish'),
      position,
      api.el('button', { class: 'btn', type: 'button', onclick: () => show((current + 1) % dishes.length) }, 'Next dish')));
  const show = d => {
    current = d;
    const dish = dishes[d], info = dish.info || {};
    title.textContent = dish.name;
    subtitle.textContent = info.subtitle || dish.note || '';
    art.replaceChildren(drawDish(dish, d + 1, api.assets));
    description.textContent = info.description || dish.note || '';
    facts.replaceChildren(...[
      ['Made with', info.ingredients], ['Flavour & texture', info.taste], ['Spot it on the tray', info.spot]
    ].filter(([, value]) => value).flatMap(([label, value]) => [api.el('dt', {}, label), api.el('dd', {}, value)]));
    story.textContent = info.story || '';
    sources.replaceChildren(api.el('span', {}, 'Read more: '), ...(info.sources || []).flatMap((source, i) => [
      i ? ' · ' : '', api.el('a', { href: source.url, target: '_blank', rel: 'noopener noreferrer' }, source.title)
    ]));
    position.textContent = `${d + 1} of ${dishes.length}`;
    dialog.scrollTop = 0;
    title.focus({ preventScroll: true });
  };
  const open = d => {
    opener = document.activeElement;
    if (!dialog.open) dialog.showModal();
    document.body.classList.add('berkat-guide-open');
    show(d);
  };
  dialog.addEventListener('close', () => {
    document.body.classList.remove('berkat-guide-open');
    if (opener?.isConnected && !opener.disabled) opener.focus({ preventScroll: true });
  });
  root.after(dialog);
  return { open };
}

async function reserveMeal({ root, content, rules, api }) {
  const { dishes, guests } = content, F = guests.length;
  const start = dishes.map(d => d.portions ?? rules.portions);
  const reserved = dishes.map(() => 0), target = F * rules.packet;
  if (start.reduce((sum, n) => sum + Math.min(n, F), 0) < target ||
      start.reduce((sum, n) => sum + n, 0) - target < F * rules.need || rules.need > rules.rounds) {
    throw new Error('This meal needs more portions or serving rounds to meet both sharing goals.');
  }
  return new Promise(resolve => {
    const status = api.el('p', { class: 'berkat-reserve-status', role: 'status' });
    const preview = api.el('p', { class: 'berkat-hint muted' });
    const begin = api.el('button', { class: 'btn primary', disabled: '', onclick: () => {
      prepareMeal(start, reserved, F, rules);
      begin.disabled = true;
      resolve(reserved.slice());
    } }, 'Start the feast');
    const counts = [], plus = [], minus = [];
    const cards = dishes.map((dish, d) => {
      const art = svg('svg', { viewBox: '-16 -16 32 32', 'aria-hidden': 'true' });
      art.append(drawDish(dish, d + 1, api.assets));
      counts[d] = api.el('span', { class: 'berkat-reserve-count' });
      minus[d] = api.el('button', { class: 'btn', type: 'button', 'aria-label': `Reserve less ${dish.name.toLowerCase()}`,
        onclick: () => { if (reserved[d] > 0) reserved[d]--; render(); } }, '−');
      plus[d] = api.el('button', { class: 'btn', type: 'button', 'aria-label': `Reserve more ${dish.name.toLowerCase()}`,
        onclick: () => {
          if (reserved[d] < Math.min(start[d], F) && reserved.reduce((a, b) => a + b, 0) < target) reserved[d]++;
          render();
        } }, '+');
      return api.el('li', { class: 'berkat-stock' }, art, api.el('strong', {}, dish.name), counts[d],
        api.el('div', { class: 'berkat-reserve-adjust' }, minus[d], plus[d]));
    });
    const fillMix = () => {
      reserved.fill(0);
      for (let n = 0, d = 0; n < target; d = (d + 1) % dishes.length) {
        if (reserved[d] < Math.min(start[d], F)) { reserved[d]++; n++; }
      }
      render();
    };
    const suggest = api.el('button', { class: 'btn', onclick: fillMix }, 'Reset suggested mix');
    const packetPreview = api.el('div', { class: 'berkat-setup-packets' });
    const render = () => {
      const total = reserved.reduce((a, b) => a + b, 0);
      const packets = pack(reserved, F, rules.packet);
      const complete = packets.filter(p => p.length === rules.packet).length;
      packetPreview.replaceChildren(...packets.map((p, g) => api.el('div', {},
        guestPortrait(guests[g], api, 'berkat-person-preview'),
        api.el('span', {}, `${guests[g].name}’s family`),
        api.el('div', { class: 'berkat-packet-art', 'aria-label': p.map(d => dishes[d].name).join(' and ') }, p.map(d => {
          const art = svg('svg', { viewBox: '-17 -17 34 34', 'aria-hidden': 'true' });
          art.append(drawDish(dishes[d], d + 1, api.assets));
          return art;
        })))));
      status.textContent = `${total} of ${target} portions set aside · ${complete} of ${F} packets ready`;
      counts.forEach((node, d) => {
        node.textContent = `${reserved[d]} for home · ${start[d] - reserved[d]} for the table`;
        minus[d].disabled = reserved[d] === 0;
        plus[d].disabled = reserved[d] >= Math.min(start[d], F) || total >= target;
      });
      let ready = false;
      try { prepareMeal(start, reserved, F, rules); ready = true; } catch {}
      begin.disabled = !ready;
      preview.textContent = ready
        ? `${start.reduce((a, b) => a + b, 0) - total} portions will stay on the shared tray. Your berkat is protected while you serve.`
        : `Choose ${target - total} more portions, or reset the suggested mix. Each packet will contain ${rules.packet} different dishes.`;
    };
    root.replaceChildren(api.el('div', { class: 'berkat-goal' },
      api.el('span', { class: 'kicker' }, 'Before everyone sits down'),
      api.el('h2', {}, 'A little for every family'),
      api.el('p', {}, `We’ve set aside ${rules.packet} different dishes per family. Change the mix if you like, then bring everyone around the tray.`)),
      packetPreview, status,
      api.el('details', { class: 'berkat-help berkat-reserve-options' }, api.el('summary', {}, 'Change the mix'),
        api.el('ul', { class: 'berkat-inventory berkat-reserve' }, cards), suggest),
      preview, api.el('p', { class: 'berkat-hint' }, `Then tap a dish and tap a guest. Share ${rules.need} side-dish servings with everyone; substitutes and repeated dishes count too.`),
      api.el('div', { class: 'row berkat-reserve-actions' }, begin));
    fillMix();
  });
}

function guestPortrait(guest, api, className = 'berkat-person') {
  const image = api.assets?.[guest.portrait];
  return image ? api.el('img', { class: className, src: image.src, alt: '',
    width: '384', height: '384', draggable: 'false' }) :
    api.el('span', { class: 'berkat-person-fallback', 'aria-hidden': 'true' }, guest.name);
}

function meal({ root, content, rules, api, reserved, guide, resolve }) {
  const { guests, dishes } = content, F = guests.length, D = dishes.length;
  const left = prepareMeal(dishes.map(d => d.portions ?? rules.portions), reserved, F, rules);
  const served = Array(F).fill(0), history = guests.map(() => []);
  const maxOffers = F * rules.rounds;
  let offers = 0, selected = -1, requester = 0, requested = 0, rot = 0, busy = false, complete = false, ended = false;
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const slotAngle = d => -90 + d * 360 / D;
  const dishArt = d => {
    const art = svg('svg', { viewBox: '-16 -16 32 32', 'aria-hidden': 'true' });
    art.append(drawDish(dishes[d], d + 1, api.assets));
    return art;
  };
  const activate = (node, action) => {
    node.addEventListener('click', action);
    node.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); action(); }
    });
  };
  const spinner = svg('g', { class: 'berkat-spin' });
  spinner.append(svg('circle', { cx: 50, cy: 50, r: 49, class: 'tray-rim' }),
    svg('circle', { cx: 50, cy: 50, r: 46, class: 'tray-face' }));
  [47.5, 44.5].forEach(r => spinner.append(svg('circle', {
    cx: 50, cy: 50, r, fill: 'none', stroke: '#f8dfa1', 'stroke-width': .35
  })));
  const pips = [], rings = [];
  const slots = dishes.map((dish, d) => {
    const a = slotAngle(d) * Math.PI / 180;
    const slot = svg('g', { transform: `translate(${50 + 30 * Math.cos(a)} ${50 + 30 * Math.sin(a)})`,
      role: 'button', tabindex: '0', class: 'berkat-dish', 'data-dish': dish.id });
    rings[d] = svg('circle', { r: 16, class: 'berkat-ring' });
    const food = drawDish(dish, d + 1, api.assets);
    food.setAttribute('class', 'berkat-food');
    slot.append(svg('circle', { r: 16, fill: 'transparent' }), rings[d], food);
    const n = left[d], w = 3.2;
    slot.append(svg('rect', { x: -(n * w) / 2 - 1, y: 8.4, width: n * w + 2, height: 4, rx: 2, class: 'berkat-pill' }));
    pips[d] = Array.from({ length: n }, (_, p) => {
      const pip = svg('circle', { cx: (p - (n - 1) / 2) * w, cy: 10.4, r: 1.15, class: 'berkat-pip' });
      slot.append(pip); return pip;
    });
    activate(slot, () => chooseDish(d));
    spinner.append(slot);
    return slot;
  });
  const rice = drawRice(rng(7));rice.setAttribute('aria-hidden', 'true');spinner.append(rice);
  const board = svg('svg', { viewBox: '0 0 100 100', class: 'berkat-board', role: 'group', 'aria-label': 'Choose a side dish from the shared tray' });
  board.append(spinner);

  const plates = [], seatCounts = [];
  const seats = guests.map((guest, g) => {
    const favorite = dishes.find(d => d.id === guest.favorite)?.name;
    plates[g] = Array.from({ length: rules.need }, () => api.el('i', { class: 'berkat-plate-piece' }));
    seatCounts[g] = api.el('span', { class: 'berkat-seat-status' });
    return api.el('button', { type: 'button', class: 'berkat-seat', 'data-guest': String(g), onclick: () => serve(g) },
      guestPortrait(guest, api),
      api.el('span', { class: 'berkat-seat-details' }, api.el('strong', {}, guest.name),
        api.el('span', { class: 'berkat-favorite' }, favorite ? `Likes ${favorite.toLowerCase()}` : 'Happy to share'),
        api.el('span', { class: 'berkat-dots', 'aria-hidden': 'true' }, plates[g]), seatCounts[g]));
  });
  const table = api.el('div', { class: 'berkat-table' }, board, ...seats);
  const banner = api.el('div', { class: 'berkat-banner', 'aria-live': 'polite' });
  const requestArt = svg('svg', { viewBox: '-16 -16 32 32', class: 'berkat-request-art', 'aria-hidden': 'true' });
  const prompt = api.el('p', { class: 'berkat-selection', role: 'status' });
  const selectedNote = api.el('p', { class: 'muted' });
  const selectedAbout = api.el('button', { class: 'berkat-info-link', type: 'button', onclick: () => {
    if (selected >= 0) guide.open(selected);
  } });
  const selectedInfo = api.el('div', { class: 'berkat-selected-info', hidden: '' }, selectedNote, selectedAbout);
  const reaction = api.el('div', { class: 'berkat-reaction', role: 'status' }, 'Everyone is settling in. What will you share first?');
  const status = api.el('div', { class: 'berkat-status' });
  const offerBtn = api.el('button', { class: 'btn primary', onclick: () => complete ? end() : serve(requester) });
  const riceBtn = api.el('button', { class: 'btn', onclick: () => offerRice() });
  const inventory = dishes.map((dish, d) => {
    const count = api.el('span', { class: 'berkat-stock-count' });
    const button = api.el('button', { type: 'button', class: 'berkat-dish-choice', 'data-dish': dish.id,
      'aria-pressed': 'false', onclick: () => chooseDish(d) }, dishArt(d),
      api.el('strong', {}, dish.name), count);
    const about = api.el('button', { type: 'button', class: 'berkat-info-link',
      'aria-label': `About ${dish.name.toLowerCase()}`, onclick: () => guide.open(d) }, 'About this dish');
    return { item: api.el('li', { class: 'berkat-stock' }, button, about), button, count };
  });
  const instructions = api.el('details', { class: 'berkat-help' }, api.el('summary', {}, 'How to share the tray'),
    api.el('p', {}, `Tap a dish on the tray or in the list, then tap any guest to serve it. Each guest needs ${rules.need} side-dish servings. Their favourites are shown, but substitutes and repeated dishes count equally.`),
    api.el('p', {}, `You have up to ${maxOffers} offers. Rice does not add a side-dish serving. Extra servings beyond someone’s goal earn no points. Your reserved berkat stays safe throughout.`),
    api.el('p', {}, 'Little extra: let everyone taste two different side dishes. It is optional, and adds no points.'));
  root.replaceChildren(api.el('div', { class: 'berkat-goal' },
    api.el('span', { class: 'kicker' }, 'One tray. Four personalities.'),
    api.el('h2', {}, 'Tap a dish, then a guest'),
    api.el('p', {}, `${rules.need} side-dish servings each. Little extra: let everyone taste two different dishes.`)),
    status, api.el('div', { class: 'berkat-layout' }, api.el('div', { class: 'berkat-table-area' }, table),
      api.el('div', { class: 'berkat-play' }, api.el('div', { class: 'berkat-request' }, requestArt, banner),
        prompt, selectedInfo, api.el('div', { class: 'berkat-actions' }, offerBtn, riceBtn), reaction)),
    api.el('ul', { class: 'berkat-inventory', 'aria-label': 'Choose a side dish' }, inventory.map(i => i.item)), instructions);

  const ask = previous => {
    requester = nextGuest(served, rules.need, previous);
    if (requester < 0) return;
    const favorite = dishes.findIndex(d => d.id === guests[requester].favorite);
    requested = history[requester].length === 0 && favorite >= 0 ? favorite : makeRequests(dishes, 1, 1)[0].dish;
  };
  const chooseDish = d => {
    if (busy || complete || ended || left[d] <= 0) return;
    reaction.classList.remove('has-reaction');
    selected = d;
    render();
  };
  const render = () => {
    selectedInfo.hidden = selected < 0 || complete;
    if (selected >= 0) {
      selectedNote.textContent = dishes[selected].note || '';
      selectedAbout.textContent = `About ${dishes[selected].name.toLowerCase()}`;
      selectedAbout.disabled = busy;
    }
    const fed = served.filter(n => n >= rules.need).length;
    status.replaceChildren(
      api.el('div', {}, api.el('strong', {}, `${fed} of ${F} guests have enough`),
        api.el('span', {}, `${served.reduce((s, n) => s + Math.min(n, rules.need), 0)} of ${F * rules.need} side-dish servings shared`)),
      api.el('div', {}, api.el('strong', {}, `${F} berkat packets safely reserved`),
        api.el('span', {}, `${offers} of ${maxOffers} offers used · ${left.reduce((a, b) => a + b, 0)} portions on the tray`)));
    seats.forEach((seat, g) => {
      seat.disabled = busy || complete;
      seat.classList.toggle('on', g === requester && !complete);
      seat.classList.toggle('ready', selected >= 0 && !busy && !complete);
      seat.classList.toggle('satisfied', served[g] >= rules.need);
      seatCounts[g].textContent = `${served[g]}/${rules.need} side servings`;
      seat.setAttribute('aria-label', `${guests[g].name}, ${served[g]} of ${rules.need} side-dish servings. ` +
        (selected >= 0 ? `Serve ${dishes[selected].name.toLowerCase()} to ${guests[g].name}` : 'Choose a dish first'));
    });
    slots.forEach((slot, d) => {
      slot.classList.toggle('empty', left[d] === 0);
      slot.setAttribute('aria-label', `Choose ${dishes[d].name.toLowerCase()}, ${left[d]} portions left`);
      slot.setAttribute('aria-disabled', String(busy || complete || left[d] === 0));
      slot.setAttribute('aria-pressed', String(d === selected));
      rings[d].classList.toggle('on', d === requested && !complete);
      rings[d].classList.toggle('selected', d === selected);
      inventory[d].item.classList.toggle('on', d === selected);
      inventory[d].button.disabled = busy || complete || left[d] === 0;
      inventory[d].button.setAttribute('aria-pressed', String(d === selected));
      inventory[d].count.textContent = `${left[d]} on the tray · ${reserved[d]} reserved`;
    });
    if (complete) {
      banner.replaceChildren(api.el('strong', {}, fed === F ? 'Everyone has enough. Time to pack!' : 'The meal is over. Let’s pack the berkat.'),
        api.el('span', { class: 'muted' }, 'The food you saved is ready to share at home.'));
      prompt.textContent = 'Bring the reserved dishes to the packing table.';
      offerBtn.textContent = 'Pack the berkat'; offerBtn.disabled = false;
      riceBtn.hidden = true;
    } else {
      const guest = guests[requester], dish = dishes[requested];
      requestArt.replaceChildren(drawDish(dish, requested + 1, api.assets));
      const favorite = dish.id === guest.favorite;
      banner.replaceChildren(api.el('span', { class: 'kicker' }, `${guest.name} says`),
        api.el('strong', {}, `“${favorite && guest.request ? guest.request : `Could I have some ${dish.name.toLowerCase()}, please?`}”`),
        api.el('span', { class: 'muted' }, left[requested] > 0 ? 'A favourite is lovely. Another side dish is welcome too.' : 'That dish is finished. Offer a different side dish.'));
      prompt.textContent = busy ? 'Passing a portion around the tray…' : selected < 0 ?
        '1. Tap a dish on the tray or below.  2. Tap a guest to serve.' :
        `${dishes[selected].name} selected. Tap a guest, or serve ${guest.name} below.`;
      offerBtn.textContent = selected < 0 ? 'Choose a dish first' : `Serve ${dishes[selected].name.toLowerCase()} to ${guest.name}`;
      offerBtn.disabled = busy || selected < 0;
      riceBtn.textContent = `Offer rice to ${guest.name}`;riceBtn.disabled = busy;
    }
  };
  const finishOffer = previous => {
    offers++;
    selected = -1;
    complete = served.every(n => n >= rules.need) || offers >= maxOffers;
    if (!complete) ask(previous);
    api.setProgress(complete ? 1 : offers, complete ? 1 : maxOffers);
    render();
  };
  const serve = async g => {
    if (busy || complete || ended) return;
    if (selected < 0) { prompt.textContent = `Choose a dish first, then tap ${guests[g].name}.`;return; }
    const d = selected;
    if (left[d] <= 0) return;
    busy = true;render();
    const boardRect = board.getBoundingClientRect();
    const plateRect = seats[g].querySelector('.berkat-dots').getBoundingClientRect();
    const center = { x: boardRect.left + boardRect.width / 2, y: boardRect.top + boardRect.height / 2 };
    const target = { x: plateRect.left + plateRect.width / 2, y: plateRect.top + plateRect.height / 2 };
    const angle = Math.atan2(target.y - center.y, target.x - center.x);
    const delta = ((angle * 180 / Math.PI - slotAngle(d) - rot) % 360 + 540) % 360 - 180;
    rot += delta;spinner.style.transform = `rotate(${rot}deg)`;
    if (!reducedMotion()) await new Promise(r => setTimeout(r, 280));
    const tableRect = table.getBoundingClientRect(), flight = dishArt(d);
    flight.setAttribute('class', 'berkat-serving');table.append(flight);
    if (!reducedMotion() && flight.animate) {
      await flight.animate([
        { left: `${center.x - tableRect.left + boardRect.width * .3 * Math.cos(angle)}px`, top: `${center.y - tableRect.top + boardRect.height * .3 * Math.sin(angle)}px`, transform: 'translate(-50%,-50%) scale(1)' },
        { left: `${target.x - tableRect.left}px`, top: `${target.y - tableRect.top}px`, transform: 'translate(-50%,-50%) scale(.5)' }
      ], { duration: 340, easing: 'ease-out', fill: 'forwards' }).finished.catch(() => {});
    }
    flight.remove();
    const previousDishes = history[g].slice();
    servePortion(left, served, g, d);
    history[g].push(dishes[d].id);
    pips[d][left[d]].classList.add('gone');
    plates[g][served[g] - 1]?.replaceChildren(dishArt(d));
    seats[g].classList.remove('just-served');void seats[g].offsetWidth;seats[g].classList.add('just-served');
    reaction.replaceChildren(api.el('strong', {}, `${guests[g].name}: `),
      `“${guestReaction(guests[g], dishes[d], previousDishes, served[g], rules.need)}”`,
      api.el('span', { class: 'berkat-delivery muted' }, `${dishes[d].name} · ${served[g]} of ${rules.need} side-dish servings`));
    reaction.classList.add('has-reaction');
    busy = false;finishOffer(g);
  };
  const offerRice = () => {
    if (busy || complete || ended) return;
    const g = requester;
    reaction.replaceChildren(api.el('strong', {}, `${guests[g].name}: `), '“Some rice for now, thank you.”',
      api.el('span', { class: 'berkat-delivery muted' }, `Still ${served[g]} of ${rules.need} side-dish servings. The berkat stays safe.`));
    reaction.classList.add('has-reaction');
    finishOffer(g);
  };
  const end = () => {
    if (ended) return;
    ended = true;api.setProgress(1, 1);root.classList.add('berkat-celebration');
    const packets = pack(reserved, F, rules.packet), result = sharingScore(served, reserved, rules);
    const fullPackets = packets.filter(p => p.length === rules.packet).length;
    const everyone = result.fed === F, variety = history.every(p => new Set(p).size >= 2);
    const line = `${result.fed} of ${F} guests met their side-dish serving goal; ${fullPackets} of ${F} berkat packets complete.` +
      (variety ? ' Everyone tasted two different side dishes, too!' : '');
    root.replaceChildren(api.el('div', { class: 'berkat-goal' }, api.el('span', { class: 'kicker' }, 'From one tray to four homes'),
      api.el('h2', {}, everyone ? 'A good meal, with more to share.' : 'A little sharing goes home with everyone.'),
      api.el('p', {}, line), variety ? api.el('span', { class: 'berkat-variety' }, '★ Everyone tried two different sides') : null),
      api.el('ul', { class: 'berkat-packets' }, packets.map((p, g) => api.el('li', { style: `--packet-delay:${g * 90}ms` },
        api.el('div', { class: 'berkat-family-heading' }, guestPortrait(guests[g], api, 'berkat-person-preview'),
          api.el('strong', {}, `${guests[g].name}’s family`)),
        api.el('div', { class: 'berkat-packet-art', 'aria-hidden': 'true' }, p.map(dishArt)),
        p.map(d => dishes[d].name.toLowerCase()).join(' and '),
        api.el('span', { class: 'muted' }, `“Thank you! We’ll share this at home.”`),
        api.el('span', { class: 'muted' }, `${served[g]} side-dish servings at the table · ${p.length} different dishes for home`)))),
      api.el('div', { class: 'row berkat-reserve-actions' }, api.el('button', { class: 'btn primary', onclick: event => {
        event.currentTarget.disabled = true;
        resolve({ ...result, top: result.total, complete: everyone && fullPackets === F, line });
      } }, 'See how you shared')),
      api.el('p', { class: 'berkat-hint muted' }, `${result.score} of ${result.total} sharing points. The smiles and stories are part of the meal, too.`));
  };
  ask(-1);render();
}
