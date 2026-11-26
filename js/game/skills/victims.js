// 命中・反応の対象の位置（隣接の判定用）。対象が倒れて盤面から消えたあとでも、その位置の隣接を調べられるようにする。
// 死亡（onUnitDeath / onTokenGone）のスナップショットを原アクションの間だけ覚える（rt.root に置くので原アクションが変われば消える。保存しない）。
// 同じ原アクションの FIFO キューでは、死亡のイベントが命中の解決（onAttackResolve）・反応（onReaction）より先に積まれる。

/** 死亡・消滅のイベントのスナップショットを覚える（ハンドラの on.onUnitDeath / on.onTokenGone から呼ぶ） */
export function rememberDeath(api, ev) {
  const root = api.rt.root;
  if (!root || !ev?.snapshot) return;
  root.victims ??= {};
  root.victims[ev.snapshot.soldierId] = { ...ev.snapshot, ownerId: ev.ownerId };
}

/**
 * 対象の位置：場にいればその兵士、倒れていれば覚えたスナップショット。{ ref, ownerId, alive, owner?, soldier? } か null
 */
export function placeOf(api, targetId) {
  const found = targetId ? api.findSoldier(targetId) : null;
  if (found) return { ref: found.soldier, ownerId: found.owner.id, alive: true, owner: found.owner, soldier: found.soldier };
  const snap = api.rt.root?.victims?.[targetId];
  if (!snap) return null;
  return { ref: snap, ownerId: snap.ownerId, alive: false };
}

/** 対象に隣接する、自分から見た敵の兵士（対象自身は除く。安定順：レーン → 位置 → ID） */
export function adjacentEnemies(api, targetId) {
  const place = placeOf(api, targetId);
  if (!place) return [];
  const mySide = api.game.side(api.playerId);
  return api.adjacentSoldiers(place.ref, { side: place.ownerId })
    .filter((x) => x.soldier.soldierId !== targetId && api.game.side(x.owner.id) !== mySide && x.owner.soldiers.includes(x.soldier));
}

/** 死亡のスナップショットを覚えるだけのハンドラ（on に足す） */
export const REMEMBER_DEATHS = {
  onUnitDeath: { stage: 'state', fn: rememberDeath },
  onTokenGone: { stage: 'state', fn: rememberDeath },
};
