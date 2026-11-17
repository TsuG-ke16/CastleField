// STEP 5 の設定データ（城の種類・デッキ）のチェック。間違いは例外（どこが悪いかを書く）。

export const CASTLE_KEYS = ['hpBonus', 'maxHandBonus', 'castleSpellBonus', 'soldierAttackBonus'];

/** castles.json の中身をチェックする */
export function validateCastles(castles) {
  if (!castles || typeof castles !== 'object' || Array.isArray(castles)) {
    throw new Error('castles.json は城の種類をキーにしたオブジェクトにしてください');
  }
  for (const [type, def] of Object.entries(castles)) {
    const where = `castles.json の "${type}"`;
    if (!def || typeof def !== 'object') throw new Error(`${where}: 定義がオブジェクトではありません`);
    if (typeof def.name !== 'string' || def.name === '') throw new Error(`${where}: name を書いてください`);
    for (const key of CASTLE_KEYS) {
      if (def[key] !== undefined && !Number.isInteger(def[key])) throw new Error(`${where}: ${key} は整数にしてください`);
    }
    // マイナスにすると、ダメージがマイナス（＝回復）になってしまうので0以上
    for (const key of ['castleSpellBonus', 'soldierAttackBonus']) {
      if (def[key] !== undefined && def[key] < 0) throw new Error(`${where}: ${key} は0以上にしてください`);
    }
  }
}

/** decks.json の中身をチェックする（カードの種類は cards.json にあるものだけ） */
export function validateDecks(decks, cards) {
  if (!decks || typeof decks !== 'object' || Array.isArray(decks)) {
    throw new Error('decks.json はデッキのIDをキーにしたオブジェクトにしてください');
  }
  for (const [id, def] of Object.entries(decks)) {
    const where = `decks.json の "${id}"`;
    if (!def || typeof def !== 'object') throw new Error(`${where}: 定義がオブジェクトではありません`);
    if (typeof def.name !== 'string' || def.name === '') throw new Error(`${where}: name を書いてください`);
    if (!def.cards || typeof def.cards !== 'object') throw new Error(`${where}: cards（カード種類 → 枚数）を書いてください`);
    let total = 0;
    for (const [type, n] of Object.entries(def.cards)) {
      if (!Object.hasOwn(cards, type)) throw new Error(`${where}: "${type}" というカードはありません`);
      if (!Number.isInteger(n) || n < 0) throw new Error(`${where}: "${type}" の枚数は0以上の整数にしてください`);
      total += n;
    }
    if (total === 0) throw new Error(`${where}: カードが1枚もありません`);
  }
}

/** 山札1組（山札・捨て札・使い切り置き場） */
export class Pile {
  constructor(owner) {
    /** だれの山札か（全員共通なら null） */
    this.owner = owner;
    /** 先頭（index 0）から引く */
    this.deck = [];
    this.discard = [];
    /** 使い切りのカード（exhaust: true）は、使ったらここへ行き、山札には戻らない */
    this.exhausted = [];
  }
}

/** 合成・ラッキーで「1つ上」になる、ふつうのレアリティの並び（`special: true` のスペシャルは入らない） */
export function chainOrder(rarities) {
  return Object.keys(rarities).filter((id) => !rarities[id].special);
}

/** rarities.json の中身をチェックする（キーの並びが低い順。dropRate は%で、合計100） */
export function validateRarities(rarities) {
  if (!rarities || typeof rarities !== 'object' || Array.isArray(rarities)) {
    throw new Error('rarities.json はレアリティをキーにしたオブジェクトにしてください（低い順）');
  }
  const ids = Object.keys(rarities);
  if (ids.length < 2) throw new Error('rarities.json にレアリティが2つ以上必要です');
  let total = 0;
  for (const id of ids) {
    const def = rarities[id];
    const where = `rarities.json の "${id}"`;
    if (!def || typeof def.name !== 'string' || def.name === '') throw new Error(`${where}: name を書いてください`);
    if (typeof def.dropRate !== 'number' || def.dropRate < 0) throw new Error(`${where}: dropRate は0以上の数（%）にしてください`);
    if (def.special !== undefined && typeof def.special !== 'boolean') throw new Error(`${where}: special は true か false にしてください`);
    total += def.dropRate;
  }
  if (Math.abs(total - 100) > 1e-9) throw new Error(`rarities.json の dropRate の合計は100にしてください（今は${total}）`);
}

/**
 * カードごとの排出率（%）。レアリティの dropRate を、同じレアリティのカードの weight（省略すると1）で分ける。
 * そのレアリティのカードが1枚もなければ、その分は残りのレアリティに按分する。
 */
export function dropRates(cards, rarities, boost = null) {
  const sums = {};
  for (const def of Object.values(cards)) sums[def.rarity] = (sums[def.rarity] ?? 0) + (def.weight ?? 1);
  // boost: { from: レアリティ, multiplier } … from 以上のレアリティの割合を multiplier 倍にして、全体を100%に直す
  const order = chainOrder(rarities);
  const factor = (id) => (boost && order.indexOf(id) >= order.indexOf(boost.from) ? boost.multiplier : 1);
  const live = Object.entries(rarities).filter(([id]) => sums[id] > 0);
  const total = live.reduce((n, [id, r]) => n + r.dropRate * factor(id), 0);
  const rates = {};
  for (const [type, def] of Object.entries(cards)) {
    const r = rarities[def.rarity];
    rates[type] = sums[def.rarity] > 0 && total > 0 ? ((r.dropRate * factor(def.rarity) / total) * 100 * (def.weight ?? 1)) / sums[def.rarity] : 0;
  }
  return rates;
}

/** 排出率どおりに size 枚を引き当てる（rng を使うので、シードで固定できる） */
export function sampleDeckTypes(cards, rarities, size, rng) {
  return Array.from({ length: size }, () => sampleType(cards, rarities, rng));
}

/** 排出率どおりに1種類を引き当てる（boost を渡すと、その分だけ高いレアリティが出やすい） */
export function sampleType(cards, rarities, rng, boost = null) {
  const entries = Object.entries(dropRates(cards, rarities, boost)).filter(([, v]) => v > 0);
  const total = entries.reduce((n, [, v]) => n + v, 0);
  let x = rng() * total;
  for (const [type, v] of entries) {
    if ((x -= v) < 0) return type;
  }
  return entries[entries.length - 1][0];
}

/** 指定したレアリティのカードを、weight の重みで1種類引き当てる（そのレアリティのカードがなければ null） */
export function sampleTypeOfRarity(cards, rarity, rng) {
  const entries = Object.entries(cards).filter(([, d]) => d.rarity === rarity && (d.weight ?? 1) > 0);
  const total = entries.reduce((n, [, d]) => n + (d.weight ?? 1), 0);
  if (total <= 0) return null;
  let x = rng() * total;
  for (const [type, d] of entries) {
    if ((x -= d.weight ?? 1) < 0) return type;
  }
  return entries[entries.length - 1][0];
}

/** base の1つ上のレアリティ（そのレアリティのカードがあるものだけ）。なければ null */
export function nextRarityWithCards(cards, rarities, base) {
  const order = chainOrder(rarities);
  if (!order.includes(base)) return null;
  const next = order[order.indexOf(base) + 1];
  if (next === undefined) return null;
  return Object.values(cards).some((d) => d.rarity === next && (d.weight ?? 1) > 0) ? next : null;
}

/**
 * 魔物のごほうびの内訳（%）。ラッキー（chance の確率）で1つ上のレアリティになる。
 * @returns {{rarity: string, rate: number, lucky: boolean}[]}
 */
export function rewardOdds(cards, rarities, base, chance = 0) {
  const next = chance > 0 ? nextRarityWithCards(cards, rarities, base) : null;
  if (!next) return [{ rarity: base, rate: 100, lucky: false }];
  return [
    { rarity: base, rate: (1 - chance) * 100, lucky: false },
    { rarity: next, rate: chance * 100, lucky: true },
  ];
}
