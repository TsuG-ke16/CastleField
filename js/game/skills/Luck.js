// 幸運（仕様 5.3）：自分の戦闘内スキルの明示的な確率判定の共通パイプライン。
// 順序：基礎確率＋加算ポイント（会心蓄積・L03 運命蓄積など）→ L01 ×1.1 → 上限（会心80%・ほか95%）
//      → L08 なら同じ確率で最大2回の独立判定 → 全失敗なら L02 の10%判定、成功なら元の確率で1回再抽選 → 最終成否 → L03 の蓄積を更新。
// - 乱数は Game の注入 RNG（game.rng）だけ。Math.random は使わない
// - 確定（baseProb >= 1 や certain）は補正・蓄積・乱数を使わない
// - 内部判定（L02 の10%）は幸運の判定を生まない（L03 も数えない）
// - すべての判定を rt.recordLuck に記録（確率・結果・補正の内訳）
// - 最終失敗では mods "luckFinalFail"（L07・X24 などの拡張点）を呼ぶ。opts.retry を渡すと、X24 のような遅延再試行が登録できる

import { PROB_CAPS } from './Limits.js';

/**
 * @param {import('./Runtime.js').SkillRuntime} rt
 * @param {string} playerId 判定する人（スキルの持ち主）
 * @param {number} baseProb 基礎確率（0〜1）
 * @param {{skillId?: string, kind?: 'crit'|'other', cap?: number, add?: number, certain?: boolean, retry?: Function, deferrable?: boolean, label?: string, noLuck?: boolean}} [opts]
 * @returns {{ok: boolean, p: number, entry: object}}
 */
export function roll(rt, playerId, baseProb, opts = {}) {
  const st = rt.stateOf(playerId);
  const kind = opts.kind ?? 'other';
  const entry = {
    kind: 'luck', playerId, skillId: opts.skillId ?? null, label: opts.label ?? null, rollKind: kind,
    base: baseProb, add: opts.add ?? 0, stack: 0, multiplier: 1, cap: null, p: null, rolls: [], secondChance: null, reroll: null, result: false, certain: false, turn: rt.game.turn,
  };
  if (opts.certain || baseProb >= 1) {
    entry.certain = true;
    entry.p = 1;
    entry.result = true;
    rt.recordLuck(entry);
    return { ok: true, p: 1, entry };
  }
  if (!(baseProb > 0) && !(entry.add > 0)) {
    // 確率0：乱数を使わず失敗（蓄積も更新しない）
    entry.p = 0;
    rt.recordLuck(entry);
    return { ok: false, p: 0, entry };
  }
  const own = (id) => !opts.noLuck && Boolean(st?.owned.has(id));
  let p = baseProb + entry.add;
  if (own('L03')) {
    entry.stack = st.luckStack;
    p += st.luckStack;
  }
  if (own('L01')) {
    entry.multiplier = rt.param('L01', 'chanceMultiplier', 1.1);
    p *= entry.multiplier;
  }
  const cap = Math.min(opts.cap ?? Infinity, kind === 'crit' ? PROB_CAPS.crit : PROB_CAPS.other);
  entry.cap = cap;
  p = Math.max(0, Math.min(cap, p));
  entry.p = p;
  const rng = rt.game.rng;
  const n = own('L08') ? rt.param('L08', 'rolls', 2) : 1;
  let ok = false;
  for (let i = 0; i < n; i++) {
    const r = rng() < p;
    entry.rolls.push(r);
    if (r) {
      ok = true;
      break; // 一方でも成功すれば1度だけ発動（2回目は引かない）
    }
  }
  if (!ok && own('L02')) {
    // L02：内部の10%判定（幸運の補正はかけない）→ 成功なら元の確率で1回だけ再抽選
    const second = rng() < rt.param('L02', 'chance', 0.1);
    entry.secondChance = second;
    if (second) {
      ok = rng() < p;
      entry.reroll = ok;
    }
  }
  entry.result = ok;
  if (own('L03')) {
    st.luckStack = ok ? 0 : Math.min(rt.param('L03', 'max', 0.1), st.luckStack + rt.param('L03', 'step', 0.02));
    entry.stackAfter = st.luckStack;
  }
  rt.recordLuck(entry);
  if (!ok && st && !opts.noLuck) {
    st.luckFailsThisTurn += rt.game.currentPlayer === playerId ? 1 : 0;
    rt.runMods('luckFinalFail', playerId, { entry, retry: opts.deferrable === false ? null : opts.retry ?? null, skillId: opts.skillId ?? null });
  }
  return { ok, p, entry };
}
