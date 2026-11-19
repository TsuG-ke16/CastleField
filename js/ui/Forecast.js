// 出す前の見通し：城への魔法（ファイアボールなど）を出したら、相手の城がどこまで減るか。
// 「あと一撃で落とせる」をはっきり見せて、出すカードを決める手がかりにする（読むだけ。状態は変えない）。
// 霧で外れる・反射される、などは数えない（見通しなので、いちばんありそうな値）。

/**
 * @param {object} st getState(viewerId)
 * @param {string} viewerId
 * @param {object} cards cards.json
 * @param {object|null} castles castles.json
 * @param {(cardId: string) => Array<object>} getTargets 今出せる対象（session.getTargets）
 * @returns {Map<string, { amount: number, targets: Array<{ playerId: string, hp: number, after: number, lethal: boolean }>, lethal: boolean }>}
 *   cardId → 見通し（城への魔法で、出せるカードだけ）
 */
export function castleForecast(st, viewerId, cards, castles, getTargets) {
  const out = new Map();
  const me = st?.players?.[viewerId];
  if (!me?.hand || st.phase !== 'main' || st.currentPlayer !== viewerId) return out;
  const bonus = castles?.[me.castleType]?.castleSpellBonus ?? 0;
  for (const card of me.hand) {
    const def = cards[card.type];
    if (def?.kind !== 'spell' || def.effect !== 'damageEnemyCastle') continue;
    let targets;
    try { targets = getTargets(card.cardId) ?? []; } catch { continue; }
    const owners = [...new Set(targets.filter((t) => t.playerId).map((t) => st.players[t.playerId]?.castleOwner ?? t.playerId))];
    if (!owners.length) continue;
    const amount = (def.amount ?? 0) + bonus;
    const list = owners.map((playerId) => {
      const p = st.players[playerId];
      let hit = Math.max(0, amount - (p.armor ?? 0));
      // 土の精霊：受けるダメージが軽くなる（最低1）
      const earth = p.spirit?.spirit === 'earth' ? (p.spirit.amount ?? 0) : 0;
      if (hit > 0 && earth) hit = Math.max(1, hit - earth);
      const after = Math.max(0, p.castleHp - hit);
      return { playerId, hp: p.castleHp, after, lethal: p.castleHp > 0 && after <= 0 };
    });
    out.set(card.cardId, { amount, targets: list, lethal: list.some((t) => t.lethal) });
  }
  return out;
}
