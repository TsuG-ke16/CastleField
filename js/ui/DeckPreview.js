import { mountMiniCard } from './cardView.js';

export function deckCard(type, cards, rarities, className = '') {
  const art = document.createElement('span');
  art.className = className;
  art.setAttribute('aria-hidden', 'true');
  if (Object.hasOwn(cards, type)) {
    mountMiniCard(art, type, cards[type], rarities);
    if (className === 'deck-grid-art') {
      for (const image of art.querySelectorAll('img')) image.loading = 'lazy';
    }
  } else art.classList.add('deck-unknown-card');
  return art;
}

/** デッキを横に並べる。編集中だけカードが枚数を減らすボタンになる。 */
export function renderDeckStrip(root, list, cards, rarities, onRemove) {
  const entries = Object.entries(list ?? {});
  root.classList.add('deck-strip');
  root.replaceChildren();
  if (!entries.length) {
    const message = document.createElement('span');
    message.className = 'deck-strip-empty';
    message.textContent = 'カードはまだありません';
    root.append(message);
    return;
  }
  if (!onRemove) {
    root.tabIndex = 0;
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'デッキのカード');
  }
  for (const [type, count] of entries) {
    const entry = document.createElement(onRemove ? 'button' : 'span');
    const name = Object.hasOwn(cards, type) ? cards[type].name : type;
    entry.className = 'deck-strip-entry';
    entry.dataset.type = type;
    entry.dataset.zoom = type; // 長押しで拡大（CardZoom.js）
    entry.title = `${name} ×${count}`;
    if (onRemove) {
      entry.type = 'button';
      entry.setAttribute('aria-label', `${name}、${count}枚。1枚減らす`);
      if (Object.hasOwn(cards, type)) entry.setAttribute('aria-description', '下矢印でカードの詳細');
      entry.addEventListener('click', () => onRemove(type, entry));
    } else {
      entry.setAttribute('role', 'img');
      entry.setAttribute('aria-label', entry.title);
    }
    entry.classList.toggle('stacked', count > 1);
    const label = document.createElement('span');
    label.className = 'deck-strip-count';
    label.setAttribute('aria-hidden', 'true');
    label.textContent = `×${count}`;
    entry.append(deckCard(type, cards, rarities, 'deck-strip-card'), label);
    root.append(entry);
  }
}

export function renderDeckPreview(root, deck, cards, rarities) {
  root.classList.add('deck-preview');
  root.hidden = !deck;
  root.replaceChildren();
  if (!deck) return;
  const name = document.createElement('p');
  name.textContent = deck.name;
  const strip = document.createElement('div');
  renderDeckStrip(strip, deck.list, cards, rarities);
  root.append(name, strip);
}
