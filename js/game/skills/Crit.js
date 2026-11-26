// 会心（仕様 5.2）。Crit.resolve(rt, ctx) が1回の命中の会心を決める。
// - 解放前は 0%。C01：兵士の通常攻撃・敵兵士への攻撃魔法の直接命中に 15% / 1.5倍。X10：城への直接攻撃。X17：自分の毒・出血・やけどの tick
// - 補正：C02 の蓄積（非会心ごと +10pt、最大 +30、会心でリセット）、C03 倍率 +0.3、Q05 の集中（次の直接命中 +20pt、消費）、X48（SP20以上 +10pt）
// - 確定会心：C05（命中直前のHPが20%以下の敵兵士）、C08 の「次の会心確定」（state.critForcedNext）、ctx.forced。確定は確率補正・蓄積を使わない
// - 上限：確率80%（確定は別扱い）、倍率3.0。X11 の豪運倍率（×2）は加算のあとに掛ける
// - 会心不可：反射・固定追撃・罠・属性反応・回復・HP支払（ctx.noCrit）
// - 追加由来（echo など）も会心判定はできるが、C06/X01/B04 などの「直接会心時」誘発は起こさない（ev.direct が false）

import { roll } from './Luck.js';
import { CRIT_MULTIPLIER_CAP } from './Limits.js';

/** 会心のカテゴリ → 解放するノード */
export const CRIT_UNLOCK = { soldierAttack: 'C01', spellHit: 'C01', castle: 'X10', dot: 'X17' };

/**
 * @param {import('./Runtime.js').SkillRuntime} rt
 * @param {{ownerId: string, category: 'soldierAttack'|'spellHit'|'castle'|'dot', amount: number, victim?: object, direct?: boolean, forced?: boolean, noCrit?: boolean, skillId?: string}} ctx
 * @returns {{crit: boolean, amount: number, multiplier: number, chance: number, forced: boolean, unlocked: boolean}}
 */
export function resolve(rt, ctx) {
  const none = { crit: false, amount: ctx.amount, multiplier: 1, chance: 0, forced: false, unlocked: false };
  const st = rt.stateOf(ctx.ownerId);
  if (!st || ctx.noCrit || !(ctx.amount > 0)) return none;
  const unlockId = CRIT_UNLOCK[ctx.category];
  if (!unlockId || !st.owned.has(unlockId)) return none;
  const own = (id) => st.owned.has(id);
  const base = rt.param(unlockId, 'critChance', 0.15);
  let multiplier = rt.param(unlockId, 'critMultiplier', 1.5);
  let add = 0;
  const breakdown = { unlock: unlockId, base, add: {}, multiplierAdd: {} };
  if (own('C02') && st.critStack > 0) {
    add += st.critStack;
    breakdown.add.C02 = st.critStack;
  }
  if (ctx.direct && st.critFocus > 0) {
    add += st.critFocus;
    breakdown.add.Q05 = st.critFocus;
    st.critFocus = 0; // 次の直接会心対象命中で消費
  }
  if (own('X48') && st.res.sp >= rt.param('X48', 'spThreshold', 20)) {
    const v = rt.param('X48', 'critChanceAdd', 0.1);
    add += v;
    breakdown.add.X48 = v;
  }
  // 段階C のハンドラが足す会心率・倍率（mods "critChance" / "critMultiplier"：ctx を見て数値を返す）
  for (const r of rt.collectMods('critChance', ctx.ownerId, ctx)) {
    add += r.value;
    breakdown.add[r.skillId] = r.value;
  }
  if (own('C03')) {
    const v = rt.param('C03', 'multiplierAdd', 0.3);
    multiplier += v;
    breakdown.multiplierAdd.C03 = v;
  }
  for (const r of rt.collectMods('critMultiplier', ctx.ownerId, ctx)) {
    multiplier += r.value;
    breakdown.multiplierAdd[r.skillId] = r.value;
  }
  let forced = Boolean(ctx.forced);
  if (!forced && own('C05') && ctx.victim && (ctx.category === 'soldierAttack' || ctx.category === 'spellHit')
    && ctx.victim.maxHp > 0 && ctx.victim.hp <= ctx.victim.maxHp * rt.param('C05', 'hpRatio', 0.2)) {
    forced = true;
    breakdown.forcedBy = 'C05';
  }
  if (!forced && st.critForcedNext) {
    forced = true;
    st.critForcedNext = false;
    breakdown.forcedBy = 'C08';
  }
  let crit;
  let chance;
  if (forced) {
    crit = true;
    chance = 1;
  } else {
    const r = roll(rt, ctx.ownerId, base, { kind: 'crit', add, skillId: unlockId, label: `crit:${ctx.category}`, deferrable: false });
    crit = r.ok;
    chance = r.p;
  }
  // 豪運（X11）：直接会心時 10% で倍率をさらに2倍（加算のあと。合計の上限3）
  if (crit && ctx.direct && own('X11')) {
    const r = roll(rt, ctx.ownerId, rt.param('X11', 'chance', 0.1), { skillId: 'X11', label: 'X11', deferrable: false });
    if (r.ok) {
      multiplier *= rt.param('X11', 'multiplier', 2);
      breakdown.X11 = true;
      rt.countSuccess(ctx.ownerId, 'X11');
    }
  }
  multiplier = Math.min(CRIT_MULTIPLIER_CAP, multiplier);
  if (own('C02')) {
    // 会心対象の非会心命中ごとに蓄積、会心でリセット（確定会心でもリセット）
    st.critStack = crit ? 0 : Math.min(rt.param('C02', 'chanceMax', 0.3), st.critStack + rt.param('C02', 'chanceStep', 0.1));
  }
  const amount = crit ? Math.floor(ctx.amount * multiplier) : ctx.amount;
  const out = { crit, amount, multiplier: crit ? multiplier : 1, chance, forced, unlocked: true, breakdown };
  rt.recordCrit({ ownerId: ctx.ownerId, category: ctx.category, before: ctx.amount, ...out, direct: Boolean(ctx.direct) });
  if (crit) rt.countSuccess(ctx.ownerId, unlockId);
  // X48：SP20以上の加算が乗った判定で会心が出たときだけ成功として数える（確定会心は確率補正を使わないので数えない）
  if (crit && !forced && breakdown.add.X48) rt.countSuccess(ctx.ownerId, 'X48', { sp: st.res.sp });
  return out;
}

/**
 * 丸め（仕様 5.2）：追加威力などの割合は切り捨て。directExtra（正の元ダメージへの直接追加攻撃）は最小1
 * @param {number} base 元の量
 * @param {number} ratio 割合（0.5 など）
 */
export function ratioAmount(base, ratio, { directExtra = false } = {}) {
  const v = Math.floor(base * ratio);
  if (directExtra && base > 0) return Math.max(1, v);
  return Math.max(0, v);
}
