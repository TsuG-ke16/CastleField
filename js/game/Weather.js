// 天候の定義（data/weather.json）のチェック。DOM は使わない。

/** 天候が持てる効果のキー */
export const WEATHER_EFFECT_KEYS = ['elementBonus', 'lightning', 'missChance', 'stopMarch', 'sandDamage', 'coinPerTurn'];

/** weather.json の中身をチェックする（間違いは例外） */
export function validateWeather(weather, elements) {
  if (!weather || typeof weather !== 'object' || Array.isArray(weather)) {
    throw new Error('weather.json は天候の種類をキーにしたオブジェクトにしてください');
  }
  for (const [type, def] of Object.entries(weather)) {
    const where = `weather.json の "${type}"`;
    if (!def || typeof def !== 'object') throw new Error(`${where}: 定義がオブジェクトではありません`);
    if (typeof def.name !== 'string' || def.name === '') throw new Error(`${where}: name を書いてください`);
    if (typeof def.weight !== 'number' || !(def.weight > 0)) throw new Error(`${where}: weight は0より大きい数にしてください`);
    const r = def.rounds;
    if (!Array.isArray(r) || r.length !== 2 || !r.every((n) => Number.isInteger(n) && n >= 1) || r[0] > r[1]) {
      throw new Error(`${where}: rounds は [最短の周回数, 最長の周回数]（1以上の整数、最短 ≤ 最長）にしてください`);
    }
    if (def.elementBonus !== undefined) {
      for (const [el, v] of Object.entries(def.elementBonus)) {
        if (!elements.includes(el)) throw new Error(`${where}: elementBonus の属性は ${elements.join(' / ')} のどれかにしてください`);
        if (!Number.isInteger(v) || v < 0) throw new Error(`${where}: elementBonus の値は0以上の整数にしてください`);
      }
    }
    for (const key of ['lightning', 'sandDamage', 'coinPerTurn']) {
      if (def[key] !== undefined && (!Number.isInteger(def[key]) || def[key] < 1)) throw new Error(`${where}: ${key} は1以上の整数にしてください`);
    }
    if (def.missChance !== undefined && !(typeof def.missChance === 'number' && def.missChance > 0 && def.missChance <= 1)) {
      throw new Error(`${where}: missChance は0より大きく1以下の数にしてください`);
    }
    if (def.stopMarch !== undefined && typeof def.stopMarch !== 'boolean') throw new Error(`${where}: stopMarch は true か false にしてください`);
  }
}
