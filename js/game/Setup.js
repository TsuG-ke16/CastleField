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
    if (def.mpCost !== undefined && !(Number.isInteger(def.mpCost) && def.mpCost >= 0)) throw new Error(`${where}: mpCost は0以上の整数にしてください`);
    // デッキ編成（deckMode "cost"）：コスト・同じカードの上限・そのレアリティの合計枚数の上限（null は無制限）。special は deckAs で別のレアリティと同じ扱いにできる
    if (def.deckCost !== undefined && !(Number.isInteger(def.deckCost) && def.deckCost >= 0)) throw new Error(`${where}: deckCost は0以上の整数にしてください`);
    if (def.maxCopies !== undefined && !(Number.isInteger(def.maxCopies) && def.maxCopies >= 1)) throw new Error(`${where}: maxCopies は1以上の整数にしてください`);
    if (def.deckLimit !== undefined && def.deckLimit !== null && !(Number.isInteger(def.deckLimit) && def.deckLimit >= 0)) throw new Error(`${where}: deckLimit は0以上の整数か null（無制限）にしてください`);
    if (def.deckAs !== undefined && !(typeof def.deckAs === 'string' && Object.hasOwn(rarities, def.deckAs) && !rarities[def.deckAs].deckAs)) throw new Error(`${where}: deckAs は、別のレアリティの名前にしてください`);
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

// ================= デッキ編成（deckMode "cost"） =================

/** デッキ編成の合計コストの範囲（rules.json に書かなかったときの値） */
export const DECK_COST_DEFAULTS = { deckCostMin: 90, deckCostMax: 100 };

/** デッキ編成で、そのカードが数えられるレアリティ（スペシャルは deckAs のレアリティと同じ扱い） */
export function deckRarityOf(def, rarities) {
  const r = rarities[def.rarity];
  return def.deckAs ?? r?.deckAs ?? def.rarity; // カードの deckAs（ゴッドサイコロ：スペシャルだがレジェンド枠）が先
}

/** そのカード1枚のコスト（デッキ編成） */
export function deckCostOf(def, rarities) {
  return rarities[deckRarityOf(def, rarities)]?.deckCost ?? 0;
}

/** デッキに入れられるカードか（魔物の駒は倒したごほうび専用なので入れられない） */
export function isDeckable(def) {
  return def.monster === undefined;
}

/**
 * デッキの編成を確かめる（読むだけ）。list は { カード種類: 枚数 }。
 * ルール：合計コストが [rules.deckCostMin, rules.deckCostMax]／同じカードは maxCopies 枚まで／レアリティごとの合計枚数は deckLimit まで
 * @returns {{ ok: boolean, reason?: string, problems: string[], cost: number, total: number, counts: Record<string, number> }}
 *   counts はレアリティ（deckAs を反映）ごとの枚数
 */
export function checkCostDeck(list, cards, rarities, rules) {
  const problems = [];
  const counts = {};
  let cost = 0;
  let total = 0;
  if (!list || typeof list !== 'object' || Array.isArray(list)) {
    return { ok: false, reason: 'デッキの形が正しくありません', problems: ['デッキの形が正しくありません'], cost, total, counts };
  }
  for (const [type, n] of Object.entries(list)) {
    const def = Object.hasOwn(cards, type) ? cards[type] : null;
    if (!def) { problems.push(`「${type}」というカードはありません`); continue; }
    if (!Number.isInteger(n) || n < 0) { problems.push(`「${def.name}」の枚数は0以上の整数にしてください`); continue; }
    if (n === 0) continue;
    if (!isDeckable(def)) { problems.push(`「${def.name}」はデッキに入れられません`); continue; }
    const rid = deckRarityOf(def, rarities);
    const rdef = rarities[rid];
    const maxCopies = Math.min(rdef.maxCopies ?? Infinity, def.maxCopies ?? Infinity); // カード個別の上限（王の財宝など）
    if (n > maxCopies) problems.push(`「${def.name}」は${maxCopies}枚までです（${n}枚）`);
    counts[rid] = (counts[rid] ?? 0) + n;
    cost += n * (rdef.deckCost ?? 0);
    total += n;
  }
  for (const [rid, n] of Object.entries(counts)) {
    const limit = rarities[rid].deckLimit;
    if (limit != null && n > limit) problems.push(`${rarities[rid].name}は合計${limit}枚までです（${n}枚）`);
  }
  // rules に書いていなければ既定値（Game と同じ。部屋・画面が rules.json をそのまま渡しても同じ判定になるように）
  const max = rules?.deckCostMax ?? DECK_COST_DEFAULTS.deckCostMax;
  const min = rules?.deckCostMin ?? DECK_COST_DEFAULTS.deckCostMin;
  if (cost > max) problems.push(`合計コストが${max}を超えています（${cost}）`);
  if (cost < min) problems.push(`合計コストが${min}未満です（${cost}）`);
  return { ok: problems.length === 0, reason: problems[0], problems, cost, total, counts };
}

/**
 * 4陣営モード：陣営ごとのカード表から、陣営ごとのデッキ（decks.json と同じ形）を作る。
 * 陣営のカード表のカード全部が、count 枚ずつ、その陣営のデッキに入る（deckMode "own" で setup.decks に陣営のIDを渡す）。
 * @param {object} factions factions.json の中身（{ <陣営ID>: { name } }。"_" で始まるキーは説明なので読まない）
 * @param {object} cardSets { <陣営ID>: そのカード表の中身 }
 * @returns {object} { <陣営ID>: { name, cards: { <カード種類>: 枚数 } } }
 */
export function factionDecks(factions, cardSets) {
  const decks = {};
  for (const [id, def] of Object.entries(factions)) {
    if (id.startsWith('_')) continue;
    const set = cardSets[id];
    if (!set) throw new Error(`陣営 "${id}" のカード表がありません`);
    const cards = {};
    for (const [type, card] of Object.entries(set)) {
      if (type.startsWith('_')) continue;
      if (card.count > 0) cards[type] = card.count;
    }
    decks[id] = { name: def.name, cards };
    // 陣営の特性（森の常時の精霊）は、デッキに付けて Game に渡す（Game は席のデッキから読む）
    if (def.passiveSpirits !== undefined) decks[id].passiveSpirits = def.passiveSpirits;
  }
  return decks;
}

/** 常時の精霊の効果（passiveSpirits.spirits[].effect） */
export const PASSIVE_SPIRIT_EFFECTS = ['castleDamage', 'soldiersDamage', 'pushFront'];

/**
 * 常時の精霊（デッキの passiveSpirits。4陣営の森）のチェック。間違っていれば Error を投げる。
 * 形：{ attachTurns, everyTurns?, spirits: [{ spirit, name, element, effect, amount, ignoreArmor?, push? }] }
 * @param {object} data passiveSpirits
 * @param {string[]} elementIds 使える属性ID
 * @param {string} where エラーの文の頭
 */
export function validatePassiveSpirits(data, elementIds, where) {
  const posInt = (v) => Number.isInteger(v) && v > 0;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`${where}: passiveSpirits は { attachTurns, spirits } にしてください`);
  if (!posInt(data.attachTurns)) throw new Error(`${where}: passiveSpirits.attachTurns（付着が残る回数）は1以上の整数にしてください`);
  if (data.everyTurns !== undefined && !posInt(data.everyTurns)) throw new Error(`${where}: passiveSpirits.everyTurns（自分の何ターンに1回動くか）は1以上の整数にしてください`);
  if (!Array.isArray(data.spirits) || data.spirits.length === 0) throw new Error(`${where}: passiveSpirits.spirits に、動く順に精霊を1体以上書いてください`);
  const seen = new Set();
  data.spirits.forEach((sp, i) => {
    const w = `${where}: passiveSpirits.spirits[${i}]`;
    if (!sp || typeof sp !== 'object') throw new Error(`${w}: { spirit, name, element, effect, amount } のオブジェクトにしてください`);
    if (typeof sp.spirit !== 'string' || sp.spirit === '' || seen.has(sp.spirit)) throw new Error(`${w}: spirit（精霊のID）は、ほかの精霊と重ならない文字列にしてください`);
    seen.add(sp.spirit);
    if (typeof sp.name !== 'string' || sp.name === '') throw new Error(`${w}: name（表示名）を書いてください`);
    if (!elementIds.includes(sp.element)) throw new Error(`${w}: element の "${sp.element}" は属性の表にありません`);
    if (!PASSIVE_SPIRIT_EFFECTS.includes(sp.effect)) throw new Error(`${w}: effect は ${PASSIVE_SPIRIT_EFFECTS.join(' / ')} のどれかにしてください`);
    if (!posInt(sp.amount)) throw new Error(`${w}: amount（ダメージ）は1以上の整数にしてください`);
    if (sp.ignoreArmor !== undefined && (typeof sp.ignoreArmor !== 'boolean' || sp.effect !== 'castleDamage')) throw new Error(`${w}: ignoreArmor は castleDamage の精霊だけに、true / false で書けます`);
    if (sp.effect === 'pushFront' ? !posInt(sp.push) : sp.push !== undefined) throw new Error(`${w}: push（押し戻すマス数）は pushFront の精霊だけに、1以上の整数で書いてください`);
  });
}
