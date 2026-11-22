import { cardArt, icon } from './art.js';
import { KIND_LABEL } from './text.js';
import { cardSkinNow, FACTION_IDS, factionFrameFront, factionFromCard, frameAsset, kindIcon, rarityIcon, rarityMark } from './cardFrame.js';
import { rankSkinFront } from './skinArt.js';

/** skin：ランク報酬のカードスキン（ランクの id。省略すると装備中のランクカード）。4陣営カードは専用陣営フレームを優先する */
export function mountMiniCard(root, type, def, rarities, { showName = true, skin = cardSkinNow(), faction = null } = {}) {
  const resolvedFaction = def?.monster ? null : (faction && FACTION_IDS.includes(faction) ? faction : factionFromCard(type, def));
  const skinPath = !resolvedFaction && skin && !def?.monster ? rankSkinFront(skin) : null;
  const path = (resolvedFaction ? factionFrameFront(resolvedFaction) : null) ?? skinPath ?? frameAsset(def, rarities, null, type);
  if (!path) {
    root.innerHTML = cardArt(type, 'blue', def?.name ?? '');
    return root;
  }
  root.classList.add('mini-card');
  if (def?.monster) root.dataset.beast = def.monster;
  if (def?.effect === 'wild') root.classList.add('wild');
  if (resolvedFaction) { root.dataset.faction = resolvedFaction; }
  else if (skinPath) { root.dataset.rarity = 'common'; root.dataset.skin = skin; }
  else if (def?.rarity && rarities?.[def.rarity]) root.dataset.rarity = def.rarity;
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
  kind.innerHTML = icon(kindIcon(def));
  kind.title = def?.effect === 'wild' ? 'どれにもなれる（適応）' : KIND_LABEL[def?.kind] ?? '';
  kind.setAttribute('role', 'img');
  kind.setAttribute('aria-label', kind.title);
  const rarity = document.createElement('span');
  rarity.className = 'mini-card-rarity';
  rarity.innerHTML = icon(rarityIcon(def?.rarity), rarityMark(def?.rarity));
  rarity.title = `${rarities?.[def?.rarity]?.name ?? def?.rarity ?? ''}（${rarityMark(def?.rarity)}）`;
  rarity.setAttribute('role', 'img');
  rarity.setAttribute('aria-label', rarity.title);
  rarity.style.setProperty('--rarity', rarities?.[def?.rarity]?.color ?? '#9aa3ad');
  const banner = document.createElement('span');
  banner.className = 'mini-card-name';
  if (showName) banner.textContent = def?.name ?? '';
  root.replaceChildren(frame, illustration, banner, kind, rarity);
  return root;
}
