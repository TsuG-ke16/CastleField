// 手札・山札まわりの基盤（仕様 5.1・5.4）：追加ドロー・回収・コピー。
// - 手札上限（player.maxHand）に従う：満杯なら任意取得（optional）は拒否、自動追加は不発
// - 山札の枯渇は既存の drawCards（捨て札をシャッフルして山札に）に従う
// - コピーカード：元ID・コピー由来を card.skillCopy に記録。使ったら消える（Game.throwAway が捨て札に入れない）。
//   山札・墓地・捨て札へ恒久的に入らない。コピーからコピーは作らない
// - 山札の中身はクライアントに出さない（必要な情報はスキル状態の非公開部分に、本人だけ）

/** 手札の空き（満杯なら0） */
export const handRoom = (rt, playerId) => {
  const p = rt.game.players[playerId];
  return Math.max(0, p.maxHand - p.hand.length);
};

/** 追加ドロー。引いたカードIDを返す */
export function drawExtra(rt, playerId, n, { skillId = null, optional = false, parent = null } = {}) {
  const room = handRoom(rt, playerId);
  if (room <= 0) return { ok: false, reason: '手札がいっぱいです', cardIds: [], optional };
  const p = rt.game.players[playerId];
  const before = p.hand.length;
  rt.withDrawKind('extra', skillId, parent, () => rt.game.drawCards(p, Math.min(n, room)));
  const cardIds = p.hand.slice(before).map((c) => c.cardId);
  if (cardIds.length === 0) return { ok: false, reason: '山札も捨て札もありません', cardIds };
  return { ok: true, cardIds };
}

/** 山札の上から、pred に合う最初のカードを1枚引く（なければ不発。シャッフルしない） */
export function drawFirstMatching(rt, playerId, pred, { skillId = null, parent = null } = {}) {
  if (handRoom(rt, playerId) <= 0) return { ok: false, reason: '手札がいっぱいです' };
  const game = rt.game;
  const pile = game.pileOf(playerId);
  const i = pile.deck.findIndex((c) => pred(c));
  if (i === -1) return { ok: false, reason: '山札に合うカードがありません' };
  const [card] = pile.deck.splice(i, 1);
  const p = game.players[playerId];
  p.hand.push(card);
  rt.withDrawKind('extra', skillId, parent, () => game.emit('cardDrawn', { playerId, cardIds: [card.cardId] }));
  return { ok: true, cardId: card.cardId };
}

/** 捨て札のカードを手札へ（回収） */
export function recoverFromDiscard(rt, playerId, cardId, { skillId = null, parent = null } = {}) {
  if (handRoom(rt, playerId) <= 0) return { ok: false, reason: '手札がいっぱいです' };
  const game = rt.game;
  const pile = game.pileOf(playerId);
  const i = pile.discard.findIndex((c) => c.cardId === cardId);
  if (i === -1) return { ok: false, reason: '捨て札にそのカードがありません' };
  const [card] = pile.discard.splice(i, 1);
  game.players[playerId].hand.push(card);
  rt.withDrawKind('recover', skillId, parent, () => game.emit('cardDrawn', { playerId, cardIds: [card.cardId] }));
  return { ok: true, cardId: card.cardId };
}

/** 一時コピーを手札へ。source はコピー元のカード（Card）か type */
export function addCopy(rt, playerId, source, { skillId = null, parent = null } = {}) {
  const game = rt.game;
  if (source && typeof source === 'object' && source.skillCopy) {
    rt.diagnostic('copyOfCopy', { playerId, skillId });
    return { ok: false, reason: 'コピーからコピーは作れません' };
  }
  if (parent?.origin === 'copy') return { ok: false, reason: 'コピー由来からコピーは作れません' };
  if (handRoom(rt, playerId) <= 0) return { ok: false, reason: '手札がいっぱいです' };
  const type = typeof source === 'string' ? source : source?.type;
  if (!type || !game.cardDefs[type]) return { ok: false, reason: 'コピーするカードがありません' };
  const card = game.createCard(type);
  card.skillCopy = { of: typeof source === 'object' ? source.cardId : null, type, skillId };
  game.players[playerId].hand.push(card);
  rt.withDrawKind('copy', skillId, parent, () => game.emit('cardDrawn', { playerId, cardIds: [card.cardId] }));
  return { ok: true, cardId: card.cardId, card };
}

/** 山札の先頭 n 枚の種類（本人の非公開情報として使う。山札全体は出さない） */
export function peekTop(rt, playerId, n) {
  return rt.game.pileOf(playerId).deck.slice(0, n).map((c) => ({ cardId: c.cardId, type: c.type }));
}
