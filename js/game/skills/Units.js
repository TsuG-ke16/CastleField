// 兵士・トークン・墓地・蘇生の基盤（仕様 5.4）。
// - 弱体トークン：元兵士の基礎最大HP・攻撃力の50%（切り捨て・最低1）、元の基本移動・射程・役割、固有能力なし
// - 使い魔：HP2・攻撃1・移動1・射程1（クラシック専用の兵士。進む兵士）
// - トークンは自分の通常出撃領域の空き枠（自分の城の前＝マス0 に自分の兵士がいない道。安定したレーン順）に出る
// - 同時に場にいるトークンは1人3体まで、生成は各自ターン（自ターン開始〜次の自ターン開始）合計2体まで
// - トークンは墓地に入らず、撃破報酬・SP・コイン・魂・回収・再召喚・死亡時誘発を起こさない（onTokenGone だけ）
// - 墓地：スキルを持つ人の、倒れた（killed）非トークン兵士の記録。カードID（盤面に出したカード）と盤面インスタンスID（soldierId）を区別し、
//   蘇生した兵士は元の履歴ID（historyId）を継承する
// - 蘇生：既存の蘇生（reviveFallen）と同じ置き方（倒れた道の自分の城の前）。HPは最大HPの50%（切り捨て・最低1）、武器・盾・状態異常・予約バフは持ち越さない。
//   自動蘇生は1インスタンス試合中1回、手動を含めて合計2回まで

import { Soldier } from '../Soldier.js';
import { TOKEN_LIMITS, FAMILIAR, REVIVE_LIMITS } from './Limits.js';

/** スキルのトークンの type（カードではない。cardDefs にはない） */
export const SKILL_TOKEN_TYPE = 'skillToken';
export const FAMILIAR_TYPE = 'skillFamiliar';

const newSoldierId = (game) => `s${String(game.nextSoldierNumber++).padStart(2, '0')}`;
export const historyOf = (soldier) => soldier.skillHistoryId ?? soldier.soldierId;

/** 自分の通常出撃領域の空き枠（道の一覧。安定したレーン順）。prefer の道が空いていれば先頭 */
export function emptySlots(rt, ownerId, { prefer = null } = {}) {
  const game = rt.game;
  const owner = game.players[ownerId];
  const roads = [];
  for (const enemy of game.opponentsOf(ownerId)) {
    for (const road of game.roadsBetween(game.side(ownerId), game.side(enemy.id))) {
      if (!roads.some((r) => r.road === road)) roads.push({ road, targetId: game.side(enemy.id) });
    }
  }
  roads.sort((a, b) => (a.road.lane ?? 0) - (b.road.lane ?? 0) || String(a.road.roadId).localeCompare(String(b.road.roadId)));
  const free = roads.filter(({ road }) => !owner.soldiers.some((s) => s.roadId === road.roadId && s.position === 0));
  if (prefer) free.sort((a, b) => (b.road.roadId === prefer) - (a.road.roadId === prefer));
  return free;
}

export const aliveTokens = (rt, ownerId) => rt.game.players[ownerId].soldiers.filter((s) => s.skillToken);

/** トークンを今作れるか（上限・空き枠）。作れなければ理由 */
export function canSummon(rt, ownerId, opts = {}) {
  const st = rt.stateOf(ownerId);
  if (!st) return { ok: false, reason: 'スキルがありません' };
  if (rt.game.phase === 'gameOver') return { ok: false, reason: 'ゲームは終わっています' };
  if (aliveTokens(rt, ownerId).length >= TOKEN_LIMITS.alive) return { ok: false, reason: `トークンは同時に${TOKEN_LIMITS.alive}体までです` };
  if (st.tokensThisTurn >= TOKEN_LIMITS.perTurn) return { ok: false, reason: `トークンの生成は各自ターン${TOKEN_LIMITS.perTurn}体までです` };
  const slots = emptySlots(rt, ownerId, opts);
  if (slots.length === 0) return { ok: false, reason: '空き枠がありません' };
  return { ok: true, slot: slots[0] };
}

/**
 * トークンを召喚する。kind "weak"（from: 元兵士の type）か "familiar"
 * @returns {{ok: boolean, reason?: string, soldier?: Soldier}}
 */
export function summonToken(rt, ownerId, { kind, fromType = null, skillId = null, prefer = null, parent = null } = {}) {
  const game = rt.game;
  const check = canSummon(rt, ownerId, { prefer });
  if (!check.ok) return check;
  let def;
  let name;
  let type;
  if (kind === 'weak') {
    const src = game.cardDefs[fromType];
    if (!src || src.hp === undefined) return { ok: false, reason: '元の兵士がいません' };
    const half = (v) => Math.max(1, Math.floor((v ?? 0) * 0.5));
    def = { hp: half(src.hp), attack: half(src.attack), speed: src.speed ?? 0, role: src.role ?? 'melee', range: src.range ?? 0, stay: src.stay ?? 0 };
    name = `${src.name ?? fromType}（分身）`;
    type = SKILL_TOKEN_TYPE;
  } else if (kind === 'familiar') {
    def = { hp: FAMILIAR.hp, attack: FAMILIAR.attack, speed: FAMILIAR.speed, role: 'melee', range: FAMILIAR.range };
    name = FAMILIAR.name;
    type = FAMILIAR_TYPE;
  } else {
    return { ok: false, reason: `トークンの種類 ${kind} はありません` };
  }
  const { road, targetId } = check.slot;
  const soldierId = newSoldierId(game);
  const owner = game.players[ownerId];
  const soldier = new Soldier(soldierId, { type, def }, road.roadId, targetId);
  soldier.token = true;
  soldier.tokenName = name;
  soldier.skillToken = { kind, fromType, skillId };
  owner.soldiers.push(soldier);
  rt.stateOf(ownerId).tokensThisTurn += 1;
  rt.withOrigin('token', skillId, parent, () => game.emit('soldierDeployed', {
    playerId: ownerId, soldierId, type, roadId: road.roadId, targetId, position: soldier.position, hp: soldier.hp, attack: soldier.attack,
    token: true, name, skillToken: kind,
  }));
  return { ok: true, soldier };
}

/** 墓地の記録（Runtime.unitRemoved から。killed の非トークン兵士） */
export function recordGrave(rt, owner, soldier) {
  const st = rt.stateOf(owner.id);
  if (!st) return null;
  const entry = {
    historyId: historyOf(soldier),
    soldierId: soldier.soldierId,
    cardId: soldier.skillCardId ?? null,
    type: soldier.type,
    roadId: soldier.roadId,
    targetId: soldier.targetId,
    maxHp: soldier.maxHp,
    attack: soldier.attack,
    turn: rt.game.turn,
  };
  st.grave.push(entry);
  return entry;
}

/** 蘇生できるか（回数の上限） */
export function canRevive(rt, ownerId, entry, { auto = false } = {}) {
  const st = rt.stateOf(ownerId);
  if (!st || !entry || !st.grave.includes(entry)) return { ok: false, reason: '墓地にその兵士がいません' };
  if (rt.game.phase === 'gameOver') return { ok: false, reason: 'ゲームは終わっています' };
  const used = st.revives[entry.historyId] ?? { auto: 0, total: 0 };
  if (used.total >= REVIVE_LIMITS.total) return { ok: false, reason: `同じ兵士の蘇生は合計${REVIVE_LIMITS.total}回までです` };
  if (auto && used.auto >= REVIVE_LIMITS.auto) return { ok: false, reason: '自動蘇生は同じ兵士に1回までです' };
  if (!rt.game.findRoad(entry.roadId)) return { ok: false, reason: '倒れた道がもうありません' };
  return { ok: true };
}

/** 蘇生（墓地から取り除く。HP 50% 切り捨て・最低1。元の履歴IDを継承） */
export function revive(rt, ownerId, entry, { auto = false, skillId = null, hpRatio = 0.5, parent = null } = {}) {
  const check = canRevive(rt, ownerId, entry, { auto });
  if (!check.ok) return check;
  const game = rt.game;
  const st = rt.stateOf(ownerId);
  const owner = game.players[ownerId];
  st.grave = st.grave.filter((x) => x !== entry);
  // 既存の蘇生（reviveFallen）の「最後に倒れた兵士」と同じなら、そちらからも消す（同じ死亡で2回生き返らない）
  if (rt.lastFallenEntry.get(ownerId) === entry) {
    owner.lastFallen = null;
    rt.lastFallenEntry.delete(ownerId);
  }
  const used = st.revives[entry.historyId] ?? { auto: 0, total: 0 };
  st.revives[entry.historyId] = { auto: used.auto + (auto ? 1 : 0), total: used.total + 1 };
  const soldierId = newSoldierId(game);
  const soldier = new Soldier(soldierId, { type: entry.type, def: game.cardDefs[entry.type] }, entry.roadId, entry.targetId);
  soldier.baseAttack += owner.castleDef.soldierAttackBonus ?? 0;
  soldier.baseAttack += owner.armyAttack;
  soldier.maxHp = entry.maxHp;
  soldier.hp = Math.max(1, Math.floor(entry.maxHp * hpRatio));
  soldier.skillHistoryId = entry.historyId;
  owner.soldiers.push(soldier);
  if (soldier.stealth) (game.stealthSides ??= new Map()).set(soldierId, game.side(ownerId));
  rt.withOrigin('resurrection', skillId, parent, () => game.emit('soldierDeployed', {
    playerId: ownerId, soldierId, type: entry.type, roadId: entry.roadId, targetId: entry.targetId, position: soldier.position, hp: soldier.hp, attack: soldier.attack,
    revived: true,
  }));
  rt.revived(ownerId, soldier, entry, { auto, skillId, parent });
  return { ok: true, soldier };
}

/** 生贄（X29 など）：死亡扱いにしない除去（撃破報酬・蘇生・召喚・死亡誘発の対象外） */
export function sacrifice(rt, ownerId, soldier) {
  const owner = rt.game.players[ownerId];
  if (!owner.soldiers.includes(soldier) || soldier.token) return { ok: false, reason: '生贄にできる兵士ではありません' };
  rt.game.removeSoldier(owner, soldier, 'sacrificed');
  return { ok: true };
}

/** トークンを消す（V05 送還など。死亡扱いにしない） */
export function dismissToken(rt, ownerId, soldier) {
  const owner = rt.game.players[ownerId];
  if (!owner.soldiers.includes(soldier) || !soldier.skillToken) return { ok: false, reason: 'スキルのトークンではありません' };
  rt.game.removeSoldier(owner, soldier, 'dismissed');
  return { ok: true };
}
