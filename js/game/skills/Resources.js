// スキルのリソース（仕様 5.1・5.6）：魂・貯蔵MP・血気・余剰回復貯蔵・SP（スキル側の状態）と、MP・コイン・城壁・シールド（Game の既存の値）。
// - 新規リソースの上限は Limits.RESOURCE_CAPS。SP はクラシックに既存の仕組みがないので、スキルを持つ試合だけの最小追加（初期0・上限30）
// - コインは既存の戦闘内コイン（player.coins / Game.changeCoins）を使う
// - 城壁は既存の上限（rules.armorMax）があればそれ、なければ暫定10。シールドは既存上限がないので新規生成は10まで（既存の値は削らない）
// - HP支払はダメージではない独立イベント（城壁・シールド・軽減・回避・反射・致死防止を通さない）。HP1を残し、債務があれば新たな任意支払は不可

import { RESOURCE_CAPS, NEW_DEFENSE_CAP } from './Limits.js';

export const SKILL_RESOURCES = Object.keys(RESOURCE_CAPS);

/** スキルのリソースを増やす（上限まで）。実際に増えた量を返す */
export function gain(rt, playerId, res, n, meta = {}) {
  const st = rt.stateOf(playerId);
  if (!st || !(n > 0) || !SKILL_RESOURCES.includes(res)) return 0;
  const before = st.res[res];
  st.res[res] = Math.min(RESOURCE_CAPS[res], before + Math.floor(n));
  const delta = st.res[res] - before;
  if (delta !== 0) rt.resourceChanged(playerId, res, delta, st.res[res], meta);
  return delta;
}

/** スキルのリソースを使う。足りなければ使わずに false */
export function spend(rt, playerId, res, n, meta = {}) {
  const st = rt.stateOf(playerId);
  if (!st || !SKILL_RESOURCES.includes(res) || !(n >= 0) || st.res[res] < n) return false;
  if (n === 0) return true;
  st.res[res] -= n;
  rt.resourceChanged(playerId, res, -n, st.res[res], meta);
  return true;
}

/** MP を増減（既存の changeMp。上限は既存の maxMpOf）。実際の増減を返す */
export function changeMp(rt, playerId, delta, reason = 'skill') {
  return rt.game.changeMp(rt.game.players[playerId], delta, reason);
}

/** 戦闘内コイン（既存）を増やす */
export function gainCoins(rt, playerId, n, reason = 'skill') {
  if (!(n > 0)) return 0;
  rt.game.changeCoins(rt.game.players[playerId], n, reason);
  return n;
}

/** 城壁を足す（既存の上限 armorMax、なければ暫定10。今の値は削らない）。実際に増えた量 */
export function addArmor(rt, playerId, n, meta = {}) {
  const game = rt.game;
  const owner = game.players[game.side(playerId)];
  if (!(n > 0) || owner.castle.isDestroyed) return 0;
  const cap = game.rules.armorMax || NEW_DEFENSE_CAP;
  const before = owner.armor;
  owner.armor = Math.max(before, Math.min(cap, before + n));
  const delta = owner.armor - before;
  if (delta > 0) game.emit('castleArmored', { playerId: owner.id, armor: owner.armor, skill: meta.skillId ?? true });
  return delta;
}

/** 兵士にシールド（新規生成は10まで。今の値は削らない）。実際に増えた量 */
export function addShield(rt, ownerId, soldier, n, meta = {}) {
  const game = rt.game;
  const owner = game.players[ownerId];
  if (!(n > 0) || !owner.soldiers.includes(soldier)) return 0;
  const before = soldier.shield;
  soldier.shield = Math.max(before, Math.min(NEW_DEFENSE_CAP, before + n));
  const delta = soldier.shield - before;
  if (delta > 0) game.emit('shieldAdded', { playerId: ownerId, soldierId: soldier.soldierId, amount: delta, shield: soldier.shield, skill: meta.skillId ?? true });
  return delta;
}

/**
 * 任意のHP支払（B01・B02・B03・X27 など）。順序：（MP軽減・HP置換は呼ぶ側）→ X32 免除（mods "hpPayWaive"）→ X35 延期（mods "hpPayDefer"）→ 実支払。
 * 拒否：債務が残っている・HP1と債務を残せない。preview なら状態を変えずに結果だけ返す。
 * @returns {{ok: boolean, reason?: string, amount: number, waived: number, deferred: number, paid: number}}
 */
export function payHp(rt, playerId, amount, { skillId = null, preview = false, parent = null } = {}) {
  const game = rt.game;
  const st = rt.stateOf(playerId);
  const castle = game.players[game.side(playerId)].castle;
  const out = { ok: false, amount, waived: 0, deferred: 0, paid: 0 };
  if (!st) return { ...out, reason: 'スキルがありません' };
  if (!Number.isInteger(amount) || amount <= 0) return { ...out, reason: '支払う量がありません' };
  if (st.debt > 0) return { ...out, reason: `HPの債務（${st.debt}）が残っている間は、新たにHPで支払えません` };
  if (castle.hp - amount < 1) return { ...out, reason: `城HPが足りません（HP1を残す必要があります。今${castle.hp}・支払${amount}）` };
  if (preview) return { ...out, ok: true, paid: amount };
  // 段階D2：手札のカードの使用中（原アクション "hand"）なら、そのカードの skillOptions（deferHp など）を mods に渡す
  const options = rt.root?.origin === 'hand' && rt.root.playerId === playerId ? rt.handPlan?.options ?? {} : {};
  const ctx = { playerId, amount, waived: 0, deferred: 0, skillId, options };
  rt.runMods('hpPayWaive', playerId, ctx);
  ctx.waived = Math.max(0, Math.min(amount, ctx.waived));
  if (ctx.waived < amount) {
    rt.runMods('hpPayDefer', playerId, ctx);
    ctx.deferred = Math.max(0, Math.min(amount - ctx.waived, ctx.deferred));
  }
  if (ctx.deferred > 0) st.debt += ctx.deferred;
  const paid = amount - ctx.waived - ctx.deferred;
  if (paid > 0) {
    castle.takeDamage(paid);
    game.emit('castleDamaged', { playerId: game.side(playerId), amount: paid, blocked: 0, hp: castle.hp, source: { kind: 'hpCost', skill: skillId } });
  }
  rt.hpPaid(playerId, { amount, waived: ctx.waived, deferred: ctx.deferred, paid, skillId, parent });
  return { ok: true, amount, waived: ctx.waived, deferred: ctx.deferred, paid };
}

/** 自ターン開始時の債務の支払（最優先）。HP1を残して払い、残りは繰り越す。払った量を返す */
export function payDebt(rt, playerId) {
  const game = rt.game;
  const st = rt.stateOf(playerId);
  if (!st || st.debt <= 0) return 0;
  const castle = game.players[game.side(playerId)].castle;
  const pay = Math.max(0, Math.min(st.debt, castle.hp - 1));
  st.debt -= pay;
  if (pay > 0) {
    castle.takeDamage(pay);
    game.emit('castleDamaged', { playerId: game.side(playerId), amount: pay, blocked: 0, hp: castle.hp, source: { kind: 'hpCost', debt: true } });
    rt.hpPaid(playerId, { amount: pay, waived: 0, deferred: 0, paid: pay, skillId: null, debt: true });
  }
  return pay;
}
