// 属性の強弱の表。DOM は使わない。
// new Game({ elements }) に data/classic/elements.json などの中身を渡すと、その表で「強いか」を決める。
// 渡さなければ、今までの4属性の輪（水→火→風→土→水）のまま（通常モード）。
// 形：{ elements: { <id>: { name: "火", beats: ["<id>", ...] }, ... } }。beats は「その属性が強い相手」。
// 強い側が与えるダメージは rules.elementBonus 増える（弱い側に当たっても減らない）。

import { ELEMENTS } from './Card.js';

/** 表を渡さないときの強弱（今までの輪。1つの属性に強い相手は1つ） */
export const DEFAULT_BEATS = { water: ['fire'], fire: ['wind'], wind: ['earth'], earth: ['water'] };

/** elements.json の中身のチェック。間違っていれば、どこが悪いかを書いた Error を投げる */
export function validateElements(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('elements.json の中身（{ elements: { ... } }）を渡してください');
  const els = data.elements;
  if (!els || typeof els !== 'object' || Array.isArray(els) || Object.keys(els).length === 0) {
    throw new Error('elements.json の elements に、属性IDをキーにした属性を書いてください');
  }
  for (const [id, def] of Object.entries(els)) {
    const where = `elements.json の "${id}"`;
    if (!def || typeof def !== 'object') throw new Error(`${where}: { name, beats } のオブジェクトにしてください`);
    if (typeof def.name !== 'string' || def.name === '') throw new Error(`${where}: name（表示名）を書いてください`);
    if (!Array.isArray(def.beats)) throw new Error(`${where}: beats（強い相手の属性IDの配列。なければ []）を書いてください`);
    for (const t of def.beats) {
      if (!Object.hasOwn(els, t)) throw new Error(`${where}: beats の "${t}" は elements にありません`);
      if (t === id) throw new Error(`${where}: 自分自身に強くはできません`);
    }
  }
}

/** 使える属性IDの一覧（表がなければ今までの4つ） */
export function elementIds(table) {
  return table ? Object.keys(table.elements) : ELEMENTS;
}

/** attacker の属性が defender の属性に強いか（どちらかが属性なしなら false） */
export function beatsElement(table, attacker, defender) {
  if (!attacker || !defender) return false;
  const beats = table ? table.elements[attacker]?.beats : DEFAULT_BEATS[attacker];
  return Boolean(beats?.includes(defender));
}
