// ステージ（マップ）の定義（data/stages.json）のチェックと選び方。DOM は使わない。
// ステージは試合の最初に1つ決まり、試合のあいだ変わらない（CLAUDE.md「ステージ」）。

/** ステージが持てるキー */
export const STAGE_KEYS = [
  'name', 'icon', 'weight', 'description',
  'element', 'elementMultiplier', // その属性の武器を持った兵士のダメージが elementMultiplier 倍（小数は切り上げ）
  'effectBonus', // カードの効果（effect）ごとに、数値（amount か turns）に足す量
  'heat', 'lavaSquares', 'burn', 'eruption', // 溶岩
  'slipChance', // 氷
  'mpPerTurn', // 遺跡
  'nightChance', 'nightRoundsBonus', // 闇の森（夜）
  'rangePenalty', 'weatherWeights', // 砂漠
];

/** effectBonus に書ける効果（足すのは amount。凍結だけ turns） */
export const STAGE_BONUS_EFFECTS = ['damageEnemyCastle', 'damageEnemySoldiers', 'freezeEnemySoldiers', 'shieldSoldier'];

const isPosInt = (n) => Number.isInteger(n) && n >= 1;
const isChance = (n) => typeof n === 'number' && n > 0 && n <= 1;

/** stages.json の中身をチェックする（間違いは例外） */
export function validateStages(stages, elements) {
  if (!stages || typeof stages !== 'object' || Array.isArray(stages) || Object.keys(stages).length === 0) {
    throw new Error('stages.json はステージの種類をキーにしたオブジェクトにしてください（1つ以上）');
  }
  for (const [id, def] of Object.entries(stages)) {
    const where = `stages.json の "${id}"`;
    if (!def || typeof def !== 'object') throw new Error(`${where}: 定義がオブジェクトではありません`);
    for (const key of Object.keys(def)) if (!STAGE_KEYS.includes(key)) throw new Error(`${where}: 知らないキー ${key} があります`);
    if (typeof def.name !== 'string' || def.name === '') throw new Error(`${where}: name を書いてください`);
    if (typeof def.weight !== 'number' || !(def.weight > 0)) throw new Error(`${where}: weight は0より大きい数にしてください`);
    if (def.element !== undefined && !elements.includes(def.element)) throw new Error(`${where}: element は ${elements.join(' / ')} のどれかにしてください`);
    if (def.elementMultiplier !== undefined && !(typeof def.elementMultiplier === 'number' && def.elementMultiplier >= 1)) {
      throw new Error(`${where}: elementMultiplier は1以上の数にしてください`);
    }
    if (def.elementMultiplier !== undefined && def.element === undefined) throw new Error(`${where}: elementMultiplier を書くときは element も書いてください`);
    if (def.effectBonus !== undefined) {
      for (const [effect, v] of Object.entries(def.effectBonus)) {
        if (!STAGE_BONUS_EFFECTS.includes(effect)) throw new Error(`${where}: effectBonus に書けるのは ${STAGE_BONUS_EFFECTS.join(' / ')} です`);
        if (!isPosInt(v)) throw new Error(`${where}: effectBonus の値は1以上の整数にしてください`);
      }
    }
    for (const key of ['heat', 'mpPerTurn', 'rangePenalty', 'nightRoundsBonus']) {
      if (def[key] !== undefined && !isPosInt(def[key])) throw new Error(`${where}: ${key} は1以上の整数にしてください`);
    }
    for (const key of ['slipChance', 'nightChance']) {
      if (def[key] !== undefined && !isChance(def[key])) throw new Error(`${where}: ${key} は0より大きく1以下の数にしてください`);
    }
    if (def.lavaSquares !== undefined && !(Array.isArray(def.lavaSquares) && def.lavaSquares.every((n) => Number.isInteger(n) && n >= 0))) {
      throw new Error(`${where}: lavaSquares は、自分の城から数えたマス（0以上の整数）の配列にしてください`);
    }
    if (def.burn !== undefined && !(def.burn && isPosInt(def.burn.amount) && isPosInt(def.burn.turns))) {
      throw new Error(`${where}: burn は { amount, turns }（どちらも1以上の整数）にしてください`);
    }
    if ((def.lavaSquares !== undefined || def.eruption !== undefined) && def.burn === undefined) {
      throw new Error(`${where}: lavaSquares・eruption を書くときは、やけど（burn）も書いてください`);
    }
    if (def.eruption !== undefined && !(def.eruption && isChance(def.eruption.chance) && isPosInt(def.eruption.amount))) {
      throw new Error(`${where}: eruption は { chance（0より大きく1以下）, amount（1以上の整数） } にしてください`);
    }
    if (def.weatherWeights !== undefined) {
      if (!def.weatherWeights || typeof def.weatherWeights !== 'object') throw new Error(`${where}: weatherWeights は { 天候: 倍率 } にしてください`);
      for (const v of Object.values(def.weatherWeights)) {
        if (!(typeof v === 'number' && v > 0)) throw new Error(`${where}: weatherWeights の倍率は0より大きい数にしてください`);
      }
    }
  }
}

/** 重みでステージを1つ選ぶ */
export function pickStage(stages, rng) {
  const ids = Object.keys(stages);
  const total = ids.reduce((a, id) => a + stages[id].weight, 0);
  let r = rng() * total;
  return ids.find((id) => (r -= stages[id].weight) < 0) ?? ids.at(-1);
}
