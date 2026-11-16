import { cardArt, icon } from './art.js';
import { frameAsset, kindIcon } from './cardFrame.js';
import { badgeKind, badgeRarity } from './badges.js';

export function mountMiniCard(root, type, def, rarities, { showName = true } = {}) {
  const path = frameAsset(def, rarities);
  if (!path) {
    root.innerHTML = cardArt(type, 'blue', def?.name ?? '');
    return root;
  }
  root.classList.add('mini-card');
  if (def?.rarity && rarities?.[def.rarity]) root.dataset.rarity = def.rarity;
  const frame = document.createElement('img');
  frame.className = 'mini-card-frame';
  frame.src = `assets/${path}`;
  frame.alt = '';
  frame.draggable = false;
  const illustration = document.createElement('span');
  illustration.className = 'mini-card-image';
  illustration.innerHTML = cardArt(type, 'blue', def?.name ?? '');
  const kind = document.createElement('span');
  kind.className = 'mini-card-kind';
  kind.innerHTML = badgeKind(def?.kind) || icon(kindIcon(def?.kind));
  kind.title = def?.kind ?? '';
  const rarity = document.createElement('span');
  rarity.className = 'mini-card-rarity';
  rarity.innerHTML = badgeRarity(def?.rarity, rarities?.[def?.rarity]?.color);
  rarity.title = rarities?.[def?.rarity]?.name ?? '';
  rarity.style.setProperty('--rarity', rarities?.[def?.rarity]?.color ?? '#9aa3ad');
  const banner = document.createElement('span');
  banner.className = 'mini-card-name';
  if (showName) banner.textContent = def?.name ?? '';
  root.replaceChildren(frame, illustration, banner, kind, rarity);
  return root;
}
