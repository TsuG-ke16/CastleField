// やまびこ（追加詠唱）の共通補助（仕様 5.5）。M02/M08・X01・X27・X18・X22 が同じ規則で使う。
// - 同じ原魔法の追加詠唱は合計で M08 なし2回・M08 あり params.maxExtra（3）回まで（M02・X01・X27 などで共有）。
//   原魔法の識別は「原アクションID:実カードID」（echoKey）。カウンタは原アクション（rt.root）に置くので、原アクションが変われば消える
// - 基盤の spawnExtra('echo')（追加由来からの追加の禁止・EXTRA_EXCEPTIONS・原アクション単位のやまびこ合計）も必ず通す
// - 追加詠唱は「カードを使った」扱いにしない（onCardPlayed は出さない・MP/HP を払わない）。origin は "echo"
// - 使い方：
//     const key = echoKey(ev);
//     const found = echoTarget(api, ev.targetId);               // 対象が消えていれば不発（回数を使わない）
//     if (!found || !api.roll(p)) return;
//     const r = reserveEcho(api, { key });                      // X18/X22 なら { key, allow: 'scheduled>echo' / 'copy>echo', max: 1 }
//     if (!r.ok || !api.trigger({ targetId })) return;
//     castEcho(api, { found, base: originalBase(api.rt, key, ev), ratio: 0.5, card: echoCard(api.game, ev.sourceCardId, ev.cardType) });

import { ratioAmount } from './Crit.js';

/** 単体攻撃魔法（敵兵士1体だけを狙う攻撃魔法）の effect。クラシックの実データ：singleDamage（聖光・影）・randomElementDamage（混沌の波動） */
export const SINGLE_ATTACK_EFFECTS = new Set(['singleDamage', 'randomElementDamage']);

export function isSingleAttackSpell(def) {
  return Boolean(def) && def.kind === 'spell' && SINGLE_ATTACK_EFFECTS.has(def.effect);
}

/** カードの種類（type）から単体攻撃魔法か */
export function isSingleAttackType(game, type) {
  return isSingleAttackSpell(game.cardDefs?.[type]);
}

/** その人の、同じ原魔法の追加詠唱の合計上限 */
export function echoLimit(rt, playerId) {
  return rt.owns(playerId, 'M08') ? rt.param('M08', 'maxExtra', 3) : 2;
}

/** 原魔法の識別（原アクションID:実カードID）。explicit を渡せばそれを使う */
export function echoKey(ev, explicit = null) {
  if (explicit) return explicit;
  return `${ev?.rootActionId ?? 'none'}:${ev?.sourceCardId ?? ev?.targetId ?? 'none'}`;
}

/** 原魔法 key の追加詠唱の回数（今の原アクションの中） */
export function echoCount(rt, key) {
  return rt.root?.echoByKey?.[key] ?? 0;
}

/**
 * 原魔法 key の追加詠唱を1回確保する（上限と spawnExtra を確かめてから数える）。
 * @param {import('./Runtime.js').SkillApi} api
 * @param {{key: string, parent?: object, allow?: string|null, max?: number|null}} opts max はそのノード固有の上限（X18・X22 は1）
 * @returns {{ok: boolean, reason?: string, origin?: string, index?: number}}
 */
export function reserveEcho(api, { key, parent = api.ev, allow = null, max = null }) {
  const rt = api.rt;
  const limit = Math.min(echoLimit(rt, api.playerId), max ?? Infinity);
  const n = echoCount(rt, key);
  if (n >= limit) {
    rt.diagnostic('extraLimit', { playerId: api.playerId, skillId: api.skillId, extraKind: 'echo', key, reason: `同じ原魔法の追加詠唱は${limit}回までです` });
    return { ok: false, reason: `同じ原魔法の追加詠唱は${limit}回までです` };
  }
  const r = api.spawnExtra('echo', parent, allow ? { allow } : {});
  if (!r.ok) return r;
  if (rt.root) {
    rt.root.echoByKey ??= {};
    rt.root.echoByKey[key] = n + 1;
  }
  return { ok: true, origin: 'echo', index: n + 1 };
}

/**
 * 原魔法の元の基礎威力（追加詠唱の威力の基準。やまびこのやまびこでも元の威力の50%）。
 * 原魔法の命中（追加由来でない ev）を最初に見たときに覚え、以後はそれを返す
 */
export function originalBase(rt, key, ev) {
  if (!rt.root) return ev?.base ?? 0;
  rt.root.echoBase ??= {};
  if (rt.root.echoBase[key] === undefined && !ev?.isExtra) rt.root.echoBase[key] = ev?.base ?? 0;
  return rt.root.echoBase[key] ?? ev?.base ?? 0;
}

/** 追加詠唱の対象（敵兵士）がまだ場にいるか。{ owner, soldier } か null */
export function echoTarget(api, targetId) {
  const found = targetId ? api.findSoldier(targetId) : null;
  if (!found) return null;
  if (api.game.side(found.owner.id) === api.game.side(api.playerId)) return null;
  return found;
}

/** 追加詠唱に使うカードの形（spellHit が使う cardId・type・def だけ。山札・手札は動かさない） */
export function echoCard(game, cardId, type) {
  return { cardId: cardId ?? null, type, def: game.cardDefs?.[type] ?? {} };
}

/**
 * 追加詠唱の命中（origin "echo"）。威力は base × ratio の切り捨て（正の元威力なら最小1）。
 * 会心・属性付着/反応は spellHit の既存処理に任せる（追加由来なので「直接会心時」誘発は起きない）
 * @returns {{ok: boolean, amount?: number, killed?: boolean}}
 */
export function castEcho(api, { found, base, ratio, card, parent = api.ev }) {
  const { owner, soldier } = found;
  if (!owner.soldiers.includes(soldier)) return { ok: false };
  const amount = ratioAmount(base, ratio, { directExtra: true });
  if (!(amount > 0)) return { ok: false };
  const killed = api.as('echo', () => api.game.spellHit(owner, soldier, amount, card), parent);
  api.game.checkGameOver();
  return { ok: true, amount, killed };
}
