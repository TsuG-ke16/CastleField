// 手札の並び順。デフォルトは「種類順 → その中でレアリティの高い順」。
//   1. 種類のグループ（UI_CONFIG.hand.groupOrder の順。兵士 → 武器 → 魔法 → 防御 → 特殊）
//   2. 同じグループの中は、レアリティが高い方から低い方へ（rarities.json のキーが低い順なので、逆から数える）
//   3. 同じレアリティの中は、同じ種類のカードが隣り合うように種類順（合成できる2枚が並ぶ）
//   4. それでも同じなら、カードIDの順（引いた順に近い。並びがぶれないようにするため）
// DOM を使わない（HandView から呼ぶだけ）。

import { UI_CONFIG } from './config.js';

/** 「特殊」に入れる魔法の効果（攻めでも回復でも状態異常でも精霊でもないもの） */
const SPECIAL_EFFECTS = new Set(['redrawHand', 'randomEffect', 'stealCard', 'gainCoins']);

/** カード定義が入るグループ名："soldier" | "weapon" | "spell" | "defense" | "special" */
export function groupOf(def) {
  if (!def) return 'special';
  if (def.kind === 'spell' && SPECIAL_EFFECTS.has(def.effect)) return 'special';
  return def.kind;
}

/**
 * 手札を並べ替えた新しい配列を返す（元の配列は変えない）
 * @param {{cardId:string,type:string}[]} hand
 * @param {object} cards cards.json
 * @param {object|null} rarities rarities.json（なければレアリティは見ない）
 */
export function sortHand(hand, cards, rarities = null) {
  const order = UI_CONFIG.hand.groupOrder;
  const groupRank = (type) => {
    const i = order.indexOf(groupOf(cards[type]));
    return i < 0 ? order.length : i;
  };
  const ids = rarities ? Object.keys(rarities) : [];
  const rarityRank = (type) => ids.indexOf(cards[type]?.rarity); // 高いほど大きい
  const num = (id) => Number(String(id).replace(/\D/g, '')) || 0;
  return [...hand].sort((a, b) =>
    groupRank(a.type) - groupRank(b.type)
    || rarityRank(b.type) - rarityRank(a.type)
    || (a.type < b.type ? -1 : a.type > b.type ? 1 : 0)
    || num(a.cardId) - num(b.cardId));
}

/** 並べたとき、グループの最初のカードか（見た目で少し間をあけるために使う） */
export function groupStarts(sorted, cards) {
  const starts = new Set();
  let prev = null;
  for (const c of sorted) {
    const g = groupOf(cards[c.type]);
    if (g !== prev) starts.add(c.cardId);
    prev = g;
  }
  return starts;
}
