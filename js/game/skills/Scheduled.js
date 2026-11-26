// 予約効果（仕様 5.4）：所有者・対象ID・元イベント・元の基礎威力・期限を保存し、所有者の次の自ターン開始時に解決する。
// 自ターン開始時の順序：既存の基本更新・リセット → HP債務 → 予約効果 → ほかのスキル開始時効果（Runtime.turnStart）。
// 解決はハンドラの scheduled(api, item)（handlers/<系統>.js）。対象が消えた・無効なら不発（ハンドラが false を返す）。
// 予約由来（origin "scheduled"）から新しい予約は作れない（X18 のやまびこ1回は spawnExtra の例外）。

/**
 * @param {import('./Runtime.js').SkillRuntime} rt
 * @param {{ownerId: string, skillId: string, targetId?: string|null, sourceEventId?: number|null, basePower?: number|null, expiresTurn?: number|null, data?: object}} item
 * @param {object|null} parent 元のイベント（origin が scheduled なら拒否）
 */
export function schedule(rt, item, parent = null) {
  const st = rt.stateOf(item.ownerId);
  if (!st) return { ok: false, reason: 'スキルがありません' };
  if (parent?.origin === 'scheduled') {
    rt.diagnostic('scheduleFromScheduled', { ownerId: item.ownerId, skillId: item.skillId });
    return { ok: false, reason: '予約由来から新しい予約は作れません' };
  }
  const entry = {
    id: rt.nextEventId(),
    ownerId: item.ownerId,
    skillId: item.skillId,
    targetId: item.targetId ?? null,
    sourceEventId: item.sourceEventId ?? parent?.eventId ?? null,
    basePower: item.basePower ?? null,
    createdTurn: rt.game.turn,
    expiresTurn: item.expiresTurn ?? null,
    data: item.data ?? {},
  };
  st.scheduled.push(entry);
  rt.record({ kind: 'scheduled', ownerId: entry.ownerId, skillId: entry.skillId, targetId: entry.targetId, id: entry.id, turn: rt.game.turn });
  return { ok: true, entry };
}

/** 所有者の自ターン開始時：予約した順に解決する（このターンに作った予約は次の自ターン） */
export function runDue(rt, playerId) {
  const st = rt.stateOf(playerId);
  if (!st || st.scheduled.length === 0) return;
  const due = st.scheduled.filter((x) => x.createdTurn < rt.game.turn);
  st.scheduled = st.scheduled.filter((x) => !due.includes(x));
  for (const item of due) {
    if (rt.game.phase === 'gameOver') return;
    if (item.expiresTurn !== null && rt.game.turn > item.expiresTurn) {
      rt.record({ kind: 'scheduledExpired', ownerId: playerId, skillId: item.skillId, id: item.id, turn: rt.game.turn });
      continue;
    }
    rt.runScheduled(item);
  }
}
