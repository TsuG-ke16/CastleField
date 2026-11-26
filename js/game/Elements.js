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

/**
 * reactions.json（属性の付着と反応）の中身のチェック。間違っていれば、どこが悪いかを書いた Error を投げる。
 * 形：{ attachTurns, reactions: { <id>: { name, elements: [a, b], damage, frozenTurns?, frozenBonus?, (4陣営) multiplier?, burn?, slow?, blind?, splash?, castleDamage?, shieldBreak?, healCut? } }, chaos?: { element, name, damagePerElement, minElements } }
 * @param {object} data reactions.json の中身
 * @param {string[]} ids 使える属性ID（elementIds の結果）
 */
export function validateReactions(data, ids) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('reactions.json の中身（{ attachTurns, reactions, chaos }）を渡してください');
  const posInt = (v) => Number.isInteger(v) && v > 0;
  const nonNegInt = (v) => Number.isInteger(v) && v >= 0;
  if (!posInt(data.attachTurns)) throw new Error('reactions.json の attachTurns（付着が残る回数）は1以上の整数にしてください');
  if (data.randomAttach !== undefined && (!data.randomAttach || !posInt(data.randomAttach.turns))) {
    throw new Error('reactions.json の randomAttach は { turns: 1以上の整数 } にしてください（ターン開始時のランダム付着が残る回数）');
  }
  const list = data.reactions;
  if (!list || typeof list !== 'object' || Array.isArray(list)) throw new Error('reactions.json の reactions に、反応IDをキーにした反応を書いてください（なければ {}）');
  for (const [id, r] of Object.entries(list)) {
    const where = `reactions.json の "${id}"`;
    if (!r || typeof r !== 'object') throw new Error(`${where}: { name, elements, damage } のオブジェクトにしてください`);
    if (id === 'chaos') throw new Error(`${where}: "chaos" は混沌反応の名前なので、ほかの名前にしてください`);
    if (typeof r.name !== 'string' || r.name === '') throw new Error(`${where}: name（表示名）を書いてください`);
    if (!Array.isArray(r.elements) || r.elements.length !== 2 || r.elements[0] === r.elements[1]) {
      throw new Error(`${where}: elements は、ちがう属性2つの配列にしてください`);
    }
    for (const e of r.elements) if (!ids.includes(e)) throw new Error(`${where}: elements の "${e}" は属性の表にありません`);
    if (!nonNegInt(r.damage)) throw new Error(`${where}: damage（追加ダメージ）は0以上の整数にしてください`);
    if (r.frozenTurns !== undefined && !posInt(r.frozenTurns)) throw new Error(`${where}: frozenTurns（凍結の回数）は1以上の整数にしてください`);
    if (r.frozenBonus !== undefined && !nonNegInt(r.frozenBonus)) throw new Error(`${where}: frozenBonus（凍結中の追加ダメージ）は0以上の整数にしてください`);
    // 4陣営モードの追加の効果（どれも省略できる）
    const obj = (v) => v && typeof v === 'object' && !Array.isArray(v);
    const rate = (v) => typeof v === 'number' && v > 0 && v <= 1;
    if (r.multiplier !== undefined && !(typeof r.multiplier === 'number' && r.multiplier > 1)) throw new Error(`${where}: multiplier（当たった攻撃のダメージの倍率）は1より大きい数にしてください`);
    if (r.burn !== undefined && !(obj(r.burn) && posInt(r.burn.amount) && posInt(r.burn.turns) && [undefined, 'target', 'adjacent'].includes(r.burn.scope))) {
      throw new Error(`${where}: burn（やけど）は { amount, turns, scope?: "target" | "adjacent" }（1以上の整数）にしてください`);
    }
    if (r.dot !== undefined && !(obj(r.dot) && ['sand', 'frostbite'].includes(r.dot.status) && posInt(r.dot.amount) && posInt(r.dot.turns))) {
      throw new Error(`${where}: dot（継続ダメージ）は { status: "sand" | "frostbite", amount, turns }（1以上の整数）にしてください`);
    }
    if (r.slow !== undefined && !(obj(r.slow) && posInt(r.slow.amount) && posInt(r.slow.turns))) throw new Error(`${where}: slow（鈍足）は { amount, turns }（1以上の整数）にしてください`);
    if (r.blind !== undefined && !(obj(r.blind) && rate(r.blind.chance) && posInt(r.blind.turns))) throw new Error(`${where}: blind（目くらまし）は { chance: 0より大きく1以下, turns: 1以上の整数 } にしてください`);
    if (r.splash !== undefined && !(obj(r.splash) && posInt(r.splash.amount) && [undefined, 'lane'].includes(r.splash.scope))) throw new Error(`${where}: splash（同じ道のほかの兵士へのダメージ）は { amount: 1以上の整数, scope?: "lane" } にしてください`);
    if (r.castleDamage !== undefined && !posInt(r.castleDamage)) throw new Error(`${where}: castleDamage（城へのダメージ）は1以上の整数にしてください`);
    if (r.shieldBreak !== undefined && !(obj(r.shieldBreak) && nonNegInt(r.shieldBreak.bonus))) throw new Error(`${where}: shieldBreak（盾を壊す）は { bonus: 0以上の整数 } にしてください`);
    // 4陣営（試作）：城に起きた反応の効果（rules.castleAttach）。damage は城へのダメージ、armorBreak はその前に追加で削る城壁
    if (r.castle !== undefined && !(obj(r.castle) && nonNegInt(r.castle.damage) && (r.castle.armorBreak === undefined || posInt(r.castle.armorBreak)))) {
      throw new Error(`${where}: castle（城に起きた反応）は { damage: 0以上の整数, armorBreak?: 1以上の整数 } にしてください`);
    }
    if (r.healCut !== undefined && !(obj(r.healCut) && rate(r.healCut.ratio) && posInt(r.healCut.turns))) throw new Error(`${where}: healCut（回復量減少）は { ratio: 0より大きく1以下, turns: 1以上の整数 } にしてください`);
  }
  if (data.chaos !== undefined) {
    const c = data.chaos;
    const where = 'reactions.json の chaos';
    if (!c || typeof c !== 'object') throw new Error(`${where}: { element, name, damagePerElement, minElements } のオブジェクトにしてください`);
    if (!ids.includes(c.element)) throw new Error(`${where}: element（混沌の属性ID）が属性の表にありません`);
    if (typeof c.name !== 'string' || c.name === '') throw new Error(`${where}: name（表示名）を書いてください`);
    if (!nonNegInt(c.damagePerElement)) throw new Error(`${where}: damagePerElement は0以上の整数にしてください`);
    if (!Number.isInteger(c.minElements) || c.minElements < 2) throw new Error(`${where}: minElements は2以上の整数にしてください`);
    if (c.castleDamagePerElement !== undefined && !nonNegInt(c.castleDamagePerElement)) throw new Error(`${where}: castleDamagePerElement（城に起きた混沌反応の、種類ごとのダメージ）は0以上の整数にしてください`);
  }
}
