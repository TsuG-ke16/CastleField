// Card-frame selection is shared by hand, catalogue, fusion and reward previews.
// All artwork comes from the PNGs. These helpers only place already existing UI icons.

import { rankSkinFront } from './skinArt.js';

// 画面を見ている人のランクカード（ランクの id か null）。ランクのカード裏を装備すると、表の枠も同じランクになる（裏表一体）。
// カード裏と同じく、画面に出るカードはすべてこの枠で描く。Cosmetics.applyBack が装備に合わせて決める
let cardSkin = null;
export const setCardSkin = (rank) => {
  const next = rankSkinFront(rank) ? rank : null;
  if (next === cardSkin) return;
  cardSkin = next;
  // 手札など、もう描いてあるカードを描き直してもらう
  globalThis.document?.dispatchEvent(new CustomEvent('cardskinchange', { detail: { skin: next } }));
};
export const cardSkinNow = () => cardSkin;

export const RARITY_IDS = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const KINDS = new Set(['soldier', 'spell', 'weapon', 'defense']);
const KIND_ICON = { soldier: 'sword', spell: 'fire', weapon: 'hammer', defense: 'shield' };
const RARITY_MARK = { common: '●', uncommon: '◆', rare: '✦', epic: '✶', legendary: '♛', special: '❖' };

export function frameAsset(def, rarities, skin = cardSkin) {
  if (def?.monster) return 'cards/frame-beast.png';
  if (skin && rankSkinFront(skin)) return rankSkinFront(skin);
  // スペシャルは真珠色・虹色の専用枠を使う。
  if (def?.rarity === 'special' && rarities?.special) return 'cards/frame-special.png';
  if (def?.rarity && RARITY_IDS.includes(def.rarity) && rarities?.[def.rarity]) {
    return `cards/frame-${def.rarity}.png`;
  }
  return null;
}
export function kindIcon(def) {
  // Preserve the old identifier-only API; card UI passes the full definition for wild cards.
  if (typeof def === 'string') return KIND_ICON[def] ?? 'card';
  if (def?.effect === 'wild') return 'kind-wild';
  return KINDS.has(def?.kind) ? `kind-${def.kind}` : 'card';
}
export const rarityIcon = (rarity) => RARITY_MARK[rarity] ? `rarity-${rarity}` : null;
export const rarityMark = (rarity) => RARITY_MARK[rarity] ?? '';

