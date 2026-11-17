// Card-frame selection is shared by hand, catalogue, fusion and reward previews.
// All artwork comes from the PNGs. These helpers only place already existing UI icons.

export const RARITY_IDS = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const KINDS = new Set(['soldier', 'spell', 'weapon', 'defense']);
const KIND_ICON = { soldier: 'sword', spell: 'fire', weapon: 'hammer', defense: 'shield' };
const RARITY_MARK = { common: '●', uncommon: '◆', rare: '✦', epic: '✶', legendary: '♛', special: '❖' };

export function frameAsset(def, rarities) {
  // スペシャル：専用の枠の絵がまだないので、レアの枠を虹色にして使う（css の data-rarity=special）
  if (def?.rarity === 'special' && rarities?.special) return 'cards/frame-rare.png';
  if (def?.rarity && RARITY_IDS.includes(def.rarity) && rarities?.[def.rarity]) {
    return `cards/frame-${def.rarity}.png`;
  }
  return KINDS.has(def?.kind) ? `cards/frame-${def.kind}.png` : null;
}
export const kindIcon = (kind) => KIND_ICON[kind] ?? 'card';
export const rarityMark = (rarity) => RARITY_MARK[rarity] ?? '';

