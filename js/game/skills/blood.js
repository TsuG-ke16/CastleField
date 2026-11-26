// 血魔術（B）・闘志（Q）・横断（X26〜X35）の共通補助（段階C・C5 担当）。
// - 宣言の記録（declare）：手札のカードの費用の計画（mods "mpToHp"・preview でないとき）に、そのカードの任意の選択（playCard の第3引数）と
//   宣言時の城HPを原アクションごとに覚える。B03（血の刃）・B05（瀕死の覚醒）・X27（血のやまびこ）が使う
//   選択のキー：hpForMp（B08 の置換量。0/false なら B01/B08 の置換をしない）、bloodBlade（B03）、bloodEcho（X27）
// - 吸血・回復は実際に増えた城HPだけを数える（castle.heal の戻り値）

/** 攻撃魔法（敵にダメージを与える魔法）の effect。クラシックの実データ */
export const ATTACK_SPELL_EFFECTS = new Set(['singleDamage', 'randomElementDamage', 'damageEnemySoldiers', 'damageEnemyCastle', 'damageCastleAndHeal', 'armorBlast']);

export const isAttackSpell = (def) => Boolean(def) && def.kind === 'spell' && ATTACK_SPELL_EFFECTS.has(def.effect);

/** 自分の城（陣営の城） */
export const castleOf = (api) => api.game.players[api.game.side(api.playerId)].castle;

/** 宣言の記録（mpToHp の mods から。preview では書かない） */
export function declare(api, ctx) {
  if (ctx.preview) return;
  const rootId = api.rt.root?.id ?? null;
  const cur = api.state.vars.bloodDecl;
  if (cur && cur.rootId === rootId && cur.cardId === ctx.card.cardId) return;
  const castle = castleOf(api);
  api.state.vars.bloodDecl = {
    rootId, cardId: ctx.card.cardId, type: ctx.card.type, options: { ...(ctx.options ?? {}) }, copy: Boolean(ctx.copy),
    hp: castle.hp, maxHp: castle.maxHp, b03: false, b05: false,
  };
}

/** 今の原アクションの宣言（なければ null） */
export function currentDecl(api, rootId = api.rt.root?.id ?? null) {
  const d = api.state.vars.bloodDecl;
  return d && d.rootId === rootId ? d : null;
}

/**
 * hit/castleHit の ctx が「手札から使った攻撃魔法の直接命中（敵へ）」か。宣言のカードと同じ実カードであること
 */
export function isHandAttackHit(api, ctx, decl) {
  if (!decl || !ctx.direct || ctx.origin !== 'hand') return false;
  const card = api.rt.handCard;
  if (!card || card.cardId !== decl.cardId || !isAttackSpell(card.def)) return false;
  if (ctx.kind === 'spell') return Boolean(ctx.enemy);
  return ctx.kind === 'castle' && ctx.source?.kind === 'spell';
}

/** 自分の城HPを回復（実回復量を返す）。城が落ちていたら0 */
export function healCastle(api, n, origin = null) {
  const owner = api.game.players[api.game.side(api.playerId)];
  if (!(n > 0) || owner.castle.isDestroyed || api.game.phase === 'gameOver') return 0;
  return api.as(origin, () => {
    const healed = owner.castle.heal(n);
    if (healed > 0) api.game.emit('castleHealed', { playerId: owner.id, amount: healed, hp: owner.castle.hp, source: { kind: 'skill', skill: api.skillId } });
    return healed;
  });
}

/** 各自ターンの合計量の上限（perTurnMax）のうち、まだ使える量 */
export const roomOf = (api, key, max) => Math.max(0, max - api.used(key));

/** 自分の兵士（安定順：レーン → 位置 → ID） */
export function ownSoldiers(api, { tokens = true } = {}) {
  const game = api.game;
  return [...game.players[api.playerId].soldiers]
    .filter((s) => tokens || !s.token)
    .sort((a, b) => (game.findRoad(a.roadId)?.lane ?? 0) - (game.findRoad(b.roadId)?.lane ?? 0) || a.position - b.position || Number(a.soldierId.slice(1)) - Number(b.soldierId.slice(1)));
}

/** 相手の見えている兵士 [{ owner, soldier }]（安定順） */
export function enemySoldiers(api) {
  const game = api.game;
  const out = [];
  for (const foe of game.opponentsOf(api.playerId)) for (const s of foe.visibleSoldiers) out.push({ owner: foe, soldier: s });
  return out.sort((a, b) => (game.findRoad(a.soldier.roadId)?.lane ?? 0) - (game.findRoad(b.soldier.roadId)?.lane ?? 0)
    || a.soldier.position - b.soldier.position || Number(a.soldier.soldierId.slice(1)) - Number(b.soldier.soldierId.slice(1)));
}

/** 攻撃した兵士の ID（hit の ctx：fight/shot の attacker、castleHit：source.soldierId） */
export function attackerSoldierId(ctx) {
  if (ctx.kind === 'fight' || ctx.kind === 'shot') return ctx.attacker?.soldierId ?? null;
  if (ctx.kind === 'castle' && ctx.source?.kind === 'soldier') return ctx.source.soldierId ?? null;
  return null;
}

/** ctx が自分の兵士の通常攻撃（兵士・城へ）か */
export function isOwnNormalAttack(api, ctx) {
  const id = attackerSoldierId(ctx);
  if (!id) return false;
  if (ctx.kind === 'castle') return ctx.attackerId === api.playerId;
  return ctx.attackerOwner?.id === api.playerId;
}
