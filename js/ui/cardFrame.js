// Card-frame selection is shared by hand, catalogue, fusion and reward previews.
// All artwork comes from the PNGs. These helpers only place already existing UI icons.

export const RARITY_IDS = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const KINDS = new Set(['soldier', 'spell', 'weapon', 'defense']);
const KIND_ICON = { soldier: 'sword', spell: 'fire', weapon: 'hammer', defense: 'shield' };
const RARITY_MARK = { common: '●', uncommon: '◆', rare: '✦', epic: '✶', legendary: '♛' };

export function frameAsset(def, rarities) {
  if (def?.rarity && RARITY_IDS.includes(def.rarity) && rarities?.[def.rarity]) {
    return `cards/frame-${def.rarity}.png`;
  }
  return KINDS.has(def?.kind) ? `cards/frame-${def.kind}.png` : null;
}
export const kindIcon = (kind) => KIND_ICON[kind] ?? 'card';
export const rarityMark = (rarity) => RARITY_MARK[rarity] ?? '';

