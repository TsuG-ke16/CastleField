// Card-frame selection is shared by hand, catalogue, fusion and reward previews.
// All artwork comes from the PNGs. These helpers only place already existing UI icons.

export const RARITY_IDS = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const KINDS = new Set(['soldier', 'spell', 'weapon', 'defense']);
const KIND_ICON = { soldier: 'sword', spell: 'fire', weapon: 'hammer', defense: 'shield' };
const RARITY_MARK = { common: '●', uncommon: '◆', rare: '✦', epic: '✶', legendary: '♛', special: '❖' };

export function frameAsset(def, rarities) {
  if (def?.monster) return 'cards/frame-beast.png';
  // スペシャルは真珠色・虹色の専用枠を使う。
  if (def?.rarity === 'special' && rarities?.special) return 'cards/frame-special.png';
  if (def?.rarity && RARITY_IDS.includes(def.rarity) && rarities?.[def.rarity]) {
    return `cards/frame-${def.rarity}.png`;
  }
  return KINDS.has(def?.kind) ? `cards/frame-${def.kind}.png` : null;
}
export function kindIcon(def) {
  // Preserve the old identifier-only API; card UI passes the full definition for wild cards.
  if (typeof def === 'string') return KIND_ICON[def] ?? 'card';
  if (def?.effect === 'wild') return 'kind-wild';
  return KINDS.has(def?.kind) ? `kind-${def.kind}` : 'card';
}
export const rarityIcon = (rarity) => RARITY_MARK[rarity] ? `rarity-${rarity}` : null;
export const rarityMark = (rarity) => RARITY_MARK[rarity] ?? '';

