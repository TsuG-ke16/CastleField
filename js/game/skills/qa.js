// QA 公開API（仕様 7章「Codex の QA ツールとの連携契約」）。段階D2。
//
// QA の adapter（tools/castle-qa/ 側。このリポジトリにはまだない）は、ここを薄く委譲するだけでよい：
//   import { createSkillQa } from '../../js/game/skills/qa.js';
//   const qa = createSkillQa(skillTree);  // skillTree は data/classic/skilltree.json の中身（tests/helpers.js の loadOptionalData('classic').skillTree）
//   qa.nodes / qa.canAcquire / qa.validate / qa.cost / qa.apply / qa.observe / qa.verify（+ qa.attach / qa.summarize）
//
// - 取得・検証は本番の SkillTree.js をそのまま呼ぶ（QA 独自の取得ルール・効果シミュレーターはない）
// - apply は new Game() に渡すオプションを作るだけ（既存のオプションは壊さない。seeded RNG・firstPlayer・strategies はそのまま）
// - observe / attach / summarize は本番の実処理のログ（game.skillEvents / game.observeSkills / Game のイベント）から数値を作る。
//   「既知の未発動」は 0、「未計測（そのノードに効果のハンドラがない・数えられない）」は null。表示用のダミー値は返さない
// - verify はスキルの状態・資源の上限・ビルドの合法性・ハンドラのエラーを確かめ、違反の一覧を返す（空なら問題なし）

import * as Tree from '../SkillTree.js';
import { HANDLERS, CORE_IMPLEMENTED, STATIC_IMPLEMENTED } from './handlers/index.js';
import { RESOURCE_CAPS, TOKEN_LIMITS, LIMITS, REVIVE_LIMITS, PROB_CAPS } from './Limits.js';

/** ノードの実装状況："handler" / "core" / "static" / null（休眠）。Runtime.implementation と同じ判定（Game がなくても使える） */
export function implementationOf(id) {
  const h = HANDLERS[id];
  if (h && (h.on || h.mods || h.actions || h.scheduled || h.mulligan)) return 'handler';
  if (CORE_IMPLEMENTED.has(id)) return 'core';
  if (STATIC_IMPLEMENTED.has(id)) return 'static';
  return null;
}

/** 発動回数を数えられるか（handler・core は数える。static は試合開始時の数値なので回数がない → null） */
const countable = (id) => {
  const impl = implementationOf(id);
  return impl === 'handler' || impl === 'core';
};

/** スキルのログ（game.skillEvents の1件）の kind → observe の metric */
const EFFECT_METRIC = { soldierDamaged: 'damage', castleHealed: 'heal', soldierHealed: 'heal', shieldAdded: 'shield', castleArmored: 'armor', soldierDeployed: 'summon' };

/**
 * Game のイベント（game.on の type, payload）か、スキルのログ（type "skill"、payload は game.skillEvents の1件）を数値にする。
 * @returns {Array<{metric: string, playerId: string|null, skillId: string|null, value: number|null, [k: string]: any}>|null}
 *   配列（空なら「知っているイベントだが数値はない」）。null は未計測（知らない種類）
 */
export function observe(type, payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (type === 'skill') return observeSkillEntry(payload);
  const p = payload;
  switch (type) {
    case 'mpChanged':
      return [{ metric: 'mp', playerId: p.playerId, skillId: null, value: p.delta, reason: p.reason ?? null }];
    case 'coinsChanged':
      return [{ metric: 'coins', playerId: p.playerId, skillId: null, value: p.delta, reason: p.reason ?? null }];
    case 'castleDamaged':
      return [{
        metric: p.source?.kind === 'hpCost' ? 'hpPaidCastle' : 'castleDamage', playerId: p.playerId, skillId: p.source?.skill && p.source.skill !== true ? p.source.skill : null,
        value: (p.amount ?? 0) - (p.blocked ?? 0), blocked: p.blocked ?? 0, prevented: p.prevented ?? 0, pierce: p.pierce ?? 0, sourceKind: p.source?.kind ?? null,
      }];
    case 'castleHealed':
      return [{ metric: 'castleHeal', playerId: p.playerId, skillId: p.source?.skill ?? null, value: p.amount ?? null }];
    case 'soldierDamaged':
      return [{ metric: 'soldierDamage', playerId: p.playerId, skillId: null, value: p.amount ?? null, cause: p.cause ?? null }];
    case 'castleArmored':
      // armor は「今の城壁」で増加量ではない（増加量はスキルの effect のログにも出ない）→ 値は未計測
      return [{ metric: 'armorSet', playerId: p.playerId, skillId: typeof p.skill === 'string' ? p.skill : null, value: null, armor: p.armor ?? null }];
    case 'shieldAdded':
      return [{ metric: 'shield', playerId: p.playerId, skillId: typeof p.skill === 'string' ? p.skill : null, value: p.amount ?? null }];
    case 'reactionTriggered':
      return [{ metric: 'reaction', playerId: p.playerId ?? null, skillId: null, value: p.damage ?? null, reaction: p.reaction ?? null }];
    default:
      return null;
  }
}

function observeSkillEntry(e) {
  const pid = e.playerId ?? e.ownerId ?? null;
  switch (e.kind) {
    case 'trigger':
      return [{ metric: 'trigger', playerId: pid, skillId: e.skillId, value: 1, origin: e.origin ?? null, depth: e.depth ?? null }];
    case 'luck':
      return [{ metric: 'roll', playerId: pid, skillId: e.skillId, value: e.result ? 1 : 0, p: e.p, certain: Boolean(e.certain), rollKind: e.rollKind ?? null }];
    case 'crit':
      return [{ metric: 'crit', playerId: pid, skillId: e.breakdown?.unlock ?? null, value: e.crit ? 1 : 0, p: e.chance, forced: Boolean(e.forced), multiplier: e.multiplier, before: e.before, after: e.amount, category: e.category }];
    case 'effect':
      return EFFECT_METRIC[e.type]
        ? [{ metric: EFFECT_METRIC[e.type], playerId: pid, skillId: e.skillId, value: e.type === 'soldierDeployed' ? 1 : e.amount ?? null, origin: e.origin ?? null, depth: e.depth ?? null }]
        : [];
    case 'resource':
      return [{ metric: `resource:${e.resource}`, playerId: pid, skillId: e.skillId ?? null, value: e.delta }];
    case 'hpPayment':
      return [{ metric: 'hpPaid', playerId: pid, skillId: e.skillId ?? null, value: e.paid, requested: e.amount, waived: e.waived, deferred: e.deferred, debt: Boolean(e.debt) }];
    case 'extra':
      return [{ metric: 'extra', playerId: pid, skillId: e.skillId ?? null, value: 1, extraKind: e.extraKind, depth: e.depth }];
    case 'revive':
      return [{ metric: 'revive', playerId: pid, skillId: e.skillId ?? null, value: 1, auto: Boolean(e.auto) }];
    case 'reaction':
      return [{ metric: 'reactionBy', playerId: pid, skillId: null, value: e.damage ?? null, reaction: e.reaction }];
    case 'dice':
      return [{ metric: 'dice', playerId: pid, skillId: 'L06', value: e.value, rolls: e.rolls }];
    case 'evade':
      return [{ metric: 'evade', playerId: pid, skillId: null, value: 1 }];
    case 'scheduled':
      return [{ metric: 'scheduled', playerId: pid, skillId: e.skillId, value: 1 }];
    case 'scheduledResolved':
      return [{ metric: 'scheduledResolved', playerId: pid, skillId: e.skillId, value: e.ok ? 1 : 0 }];
    case 'scheduledExpired':
      return [{ metric: 'scheduledExpired', playerId: pid, skillId: e.skillId, value: 1 }];
    case 'diagnostic':
      return [{ metric: `diagnostic:${e.code}`, playerId: pid, skillId: e.skillId ?? null, value: 1 }];
    case 'copyGone':
      return [];
    default:
      return null;
  }
}

/** プレイヤーごとの集計の入れ物（取ったノードは、数えられるものは 0、数えられないものは null から） */
function emptySummary(game) {
  const out = {};
  const st = game.getState(null);
  for (const pid of st.playerOrder) {
    const ids = st.players[pid].skills ?? [];
    const per = (fill) => Object.fromEntries(ids.map((id) => [id, fill(id)]));
    out[pid] = {
      skills: [...ids],
      triggers: per((id) => (countable(id) ? 0 : null)),
      damage: per((id) => (implementationOf(id) === 'handler' ? 0 : null)),
      heal: per((id) => (implementationOf(id) === 'handler' ? 0 : null)),
      shield: per((id) => (implementationOf(id) === 'handler' ? 0 : null)),
      summon: per((id) => (implementationOf(id) === 'handler' ? 0 : null)),
      rolls: {}, // skillId → { attempts, successes, pSum }（判定のあったものだけ）
      crit: { checks: 0, crits: 0, forced: 0 },
      resources: Object.fromEntries([...Object.keys(RESOURCE_CAPS), 'mp', 'coins'].map((r) => [r, { gained: 0, spent: 0 }])),
      hp: { paid: 0, waived: 0, deferred: 0, debtPaid: 0 },
      extras: 0,
      maxDepth: 0,
      revives: 0,
      evades: 0,
      reactions: 0,
      diagnostics: {},
    };
  }
  return out;
}

function addMetric(sum, m) {
  const s = sum[m.playerId];
  if (!s) return;
  const bump = (table, id, v) => {
    if (id && Object.hasOwn(table, id) && table[id] !== null && typeof v === 'number') table[id] += v;
  };
  if (typeof m.depth === 'number') s.maxDepth = Math.max(s.maxDepth, m.depth);
  switch (m.metric) {
    case 'trigger': bump(s.triggers, m.skillId, 1); break;
    case 'damage': bump(s.damage, m.skillId, m.value); break;
    case 'heal': bump(s.heal, m.skillId, m.value); break;
    case 'shield': bump(s.shield, m.skillId, m.value); break;
    case 'summon': bump(s.summon, m.skillId, 1); break;
    case 'roll': {
      if (m.certain) break;
      const key = m.skillId ?? '(none)';
      const r = (s.rolls[key] ??= { attempts: 0, successes: 0, pSum: 0 });
      r.attempts += 1;
      r.successes += m.value;
      r.pSum += m.p ?? 0;
      break;
    }
    case 'crit':
      s.crit.checks += 1;
      s.crit.crits += m.value;
      if (m.forced) s.crit.forced += 1;
      break;
    case 'hpPaid':
      if (m.debt) s.hp.debtPaid += m.value;
      else {
        s.hp.paid += m.value;
        s.hp.waived += m.waived ?? 0;
        s.hp.deferred += m.deferred ?? 0;
      }
      break;
    case 'mp':
    case 'coins': {
      const r = s.resources[m.metric];
      if (m.value > 0) r.gained += m.value;
      else r.spent -= m.value;
      break;
    }
    case 'extra': s.extras += 1; break;
    case 'revive': s.revives += 1; break;
    case 'evade': s.evades += 1; break;
    case 'reactionBy': s.reactions += 1; break;
    default:
      if (m.metric.startsWith('resource:')) {
        const r = s.resources[m.metric.slice(9)];
        if (r) {
          if (m.value > 0) r.gained += m.value;
          else r.spent -= m.value;
        }
      } else if (m.metric.startsWith('diagnostic:')) {
        const code = m.metric.slice(11);
        s.diagnostics[code] = (s.diagnostics[code] ?? 0) + 1;
      }
  }
}

/**
 * 試合の最初から購読して集計する（ログの上限 5000 件に関係なく全部数える）。game.start() の前に呼ぶ。
 * スキルのない試合（通常モード・全員が空ビルド）では何も購読せず、summary() は空のプレイヤー表だけ。
 * @param {import('../Game.js').Game} game
 * @param {(metric: object) => void} [sink] 1件ごとに呼ぶ（任意）
 * @returns {{ stop: () => void, summary: () => object }}
 */
export function attach(game, sink = null) {
  const sum = emptySummary(game);
  const push = (list) => {
    for (const m of list ?? []) {
      addMetric(sum, m);
      if (sink) sink(m);
    }
  };
  const offs = [];
  if (game.skillRt) {
    offs.push(game.observeSkills((e) => push(observe('skill', e))));
    for (const type of ['mpChanged', 'coinsChanged']) {
      const fn = (p) => push(observe(type, p));
      game.on(type, fn);
      offs.push(() => game.off?.(type, fn));
    }
  }
  return {
    stop: () => offs.splice(0).forEach((f) => f()),
    summary: () => withCounters(game, structuredClone(sum), false),
  };
}

/**
 * いまの試合の集計（game.skillEvents から。ログは古いものから捨てるので、truncated が true なら attach() を使うこと）。
 * counters（Game.skillCounters：実装済みは 0 から、休眠・static は null）も入れる。MP・コインはスキル由来以外も含むので attach() のみ
 */
export function summarize(game) {
  const sum = emptySummary(game);
  for (const e of game.skillEvents) for (const m of observe('skill', e) ?? []) addMetric(sum, m);
  for (const s of Object.values(sum)) s.resources.mp = s.resources.coins = null; // ログからは数えられない（未計測）
  return withCounters(game, sum, game.skillEvents.length >= 5000);
}

function withCounters(game, sum, truncated) {
  for (const [pid, s] of Object.entries(sum)) {
    s.counters = game.skillCounters(pid);
    s.implementation = Object.fromEntries(s.skills.map((id) => [id, implementationOf(id)]));
  }
  return { truncated, players: sum };
}

/**
 * 本番のスキル状態・資源の上限・合法性を確かめる。違反の一覧（[{ code, severity: 'error'|'warning', playerId, message }]）を返す。空なら問題なし。
 * 通常モード（skillTree なし）では「スキルの処理がない」ことだけ確かめる
 * @param {import('../Game.js').Game} game
 */
export function verify(game) {
  const out = [];
  const bad = (code, playerId, message, severity = 'error') => out.push({ code, severity, playerId, message });
  const tree = game.skillTree ?? null;
  const rt = game.skillRt ?? null;
  const state = game.getState(null);
  if (!tree) {
    if (rt) bad('runtimeWithoutTree', null, 'skillTree のないゲームにスキルの処理がある');
    for (const pid of state.playerOrder) if (state.players[pid].skills) bad('skillsWithoutTree', pid, 'skillTree のないゲームに skills がある');
    return out;
  }
  const anyPicked = state.playerOrder.some((pid) => (state.players[pid].skills ?? []).length > 0);
  if (anyPicked && !rt) bad('runtimeMissing', null, 'ノードを取った人がいるのにスキルの処理がない');
  if (!anyPicked && rt) bad('runtimeUnexpected', null, '全員が空のビルドなのにスキルの処理がある（スキルなしの処理・乱数が変わる）');
  for (const pid of state.playerOrder) {
    const p = state.players[pid];
    const ids = p.skills ?? [];
    const v = Tree.validate(tree, ids, tree.budget);
    if (!v.ok) bad('illegalBuild', pid, `ビルドが決まりに合わない：${v.reason}`);
    const c = Tree.validateConfig(tree, ids, p.skillConfig ?? {});
    if (!c.ok) bad('illegalConfig', pid, `設定が決まりに合わない：${c.reason}`);
    const player = game.players[pid];
    const maxMp = game.maxMpOf(player);
    if (player.mp < 0 || (maxMp > 0 && player.mp > maxMp)) bad('mpRange', pid, `MP ${player.mp} が 0〜${maxMp} の外`);
    const castle = game.players[game.side(pid)].castle;
    if (castle.hp < 0 || castle.hp > castle.maxHp) bad('castleHpRange', pid, `城HP ${castle.hp} が 0〜${castle.maxHp} の外`);
    const armorCap = game.rules.armorMax || null;
    if (player.armor < 0 || (armorCap && player.armor > armorCap)) bad('armorRange', pid, `城壁 ${player.armor} が 0〜${armorCap ?? '∞'} の外`);
    for (const s of player.soldiers) {
      if (s.shield < 0) bad('shieldNegative', pid, `${s.soldierId} のシールドが負`);
      if (s.hp > s.maxHp) bad('soldierHpRange', pid, `${s.soldierId} の HP ${s.hp} が最大 ${s.maxHp} を超える`);
    }
    const st = rt?.stateOf(pid) ?? null;
    if (ids.length > 0 && rt && !st) bad('stateMissing', pid, 'ノードを取っているのにスキルの状態がない');
    if (!st) continue;
    if (st.ids.join(',') !== ids.join(',') || st.owned.size !== ids.length || ids.some((id) => !st.owned.has(id))) bad('ownedMismatch', pid, '取得IDとスキルの状態が一致しない');
    for (const [r, cap] of Object.entries(RESOURCE_CAPS)) {
      const val = st.res[r];
      if (!Number.isInteger(val) || val < 0 || val > cap) bad('resourceRange', pid, `${r} ${val} が 0〜${cap} の外`);
    }
    if (!Number.isInteger(st.debt) || st.debt < 0) bad('debtRange', pid, `債務 ${st.debt} が不正`);
    if (st.debt > 0 && !ids.includes('X35')) bad('debtWithoutX35', pid, `X35 なしで債務 ${st.debt}`);
    const tokens = player.soldiers.filter((s) => s.skillToken).length;
    if (tokens > TOKEN_LIMITS.alive) bad('tokenAlive', pid, `トークン ${tokens} 体が上限 ${TOKEN_LIMITS.alive} を超える`);
    if (st.tokensThisTurn > TOKEN_LIMITS.perTurn) bad('tokenPerTurn', pid, `このターンのトークン生成 ${st.tokensThisTurn} が上限 ${TOKEN_LIMITS.perTurn} を超える`);
    if (st.intervalSuccess > LIMITS.successPerInterval) bad('successPerInterval', pid, `区間の成功 ${st.intervalSuccess} が上限 ${LIMITS.successPerInterval} を超える`);
    if (st.critStack < 0 || st.critStack > (rt.param('C02', 'chanceMax', 0.3) + 1e-9)) bad('critStackRange', pid, `会心蓄積 ${st.critStack}`);
    if (st.luckStack < 0 || st.luckStack > (rt.param('L03', 'max', 0.1) + 1e-9)) bad('luckStackRange', pid, `運命蓄積 ${st.luckStack}`);
    if (st.critFocus < 0 || st.critFocus > PROB_CAPS.crit) bad('critFocusRange', pid, `集中 ${st.critFocus}`);
    for (const [hid, r] of Object.entries(st.revives)) {
      if (r.auto > REVIVE_LIMITS.auto || r.total > REVIVE_LIMITS.total) bad('reviveLimit', pid, `${hid} の蘇生回数 auto ${r.auto}・total ${r.total} が上限を超える`);
    }
    for (const [id, n] of Object.entries(st.counts)) {
      if (!ids.includes(id) && id !== 'cardCost') bad('countForUnowned', pid, `取っていない ${id} の発動が数えられている（${n}）`);
      if (!Number.isInteger(n) || n < 0) bad('countRange', pid, `${id} の回数 ${n} が不正`);
    }
    const counters = rt.counters(pid);
    for (const id of ids) {
      if (countable(id) && counters[id] === null) bad('counterNull', pid, `${id} は実装済みなのに counters が null`);
      if (!countable(id) && counters[id] !== null) bad('counterNotNull', pid, `${id} は数えられないのに counters が ${counters[id]}`);
    }
    for (const a of rt.listActions(pid)) {
      if (!ids.includes(a.skillId)) bad('actionForUnowned', pid, `取っていない ${a.skillId} の任意アクション`);
    }
  }
  for (const e of game.skillEvents) {
    if (e.kind !== 'diagnostic') continue;
    if (e.code === 'handlerError') bad('handlerError', e.playerId ?? null, `${e.skillId} のハンドラでエラー：${e.message}`);
    else if (['successLimit', 'depthLimit', 'derivedLimit'].includes(e.code)) bad(e.code, e.playerId ?? null, `安全上限に到達（${e.skillId ?? ''}）`, 'warning');
  }
  return out;
}

/**
 * QA の adapter に渡す組。skillTree は data/classic/skilltree.json の中身（validateSkillTree 済みにする）。
 * @param {object} skillTree
 */
export function createSkillQa(skillTree) {
  Tree.treeIndex(skillTree);
  const treeFor = (budget) => (budget === undefined || budget === null || budget === skillTree.budget ? skillTree : { ...skillTree, budget });
  return {
    /** [{ id, group }]（データの順） */
    nodes: Tree.nodes(skillTree).map((n) => ({ id: n.id, group: n.group })),
    /** { ok, reason? }：取得順の picked に id を足せるか（接続・必須・奥義・実コスト・予算） */
    canAcquire: (picked, id, budget) => Tree.canAcquire(skillTree, picked, id, budget),
    /** { ok, reason?, spent? }：取得順のビルド全体 */
    validate: (picked, budget) => Tree.validate(skillTree, picked, budget),
    /** 実際に払うポイント */
    cost: (picked) => Tree.cost(skillTree, picked),
    /**
     * new Game() に渡すオプションを作る（gameOptions は変更しない）。builds は席順（p1, p2, ...）の取得順ID配列か { ids, config }。
     * 空のビルドは []。budget を省略するとツリーの budget。ビルドが決まりに合わなければ例外（Game の黙った空ビルド化で測り違えないように）。
     * 全員が [] なら、スキルの処理・乱数の消費はない（無取得クラシック）
     */
    apply(gameOptions = {}, builds = [], budget) {
      const tree = treeFor(budget);
      if (!Array.isArray(builds)) throw new Error('builds は席順の配列にしてください');
      const skills = builds.map((b, i) => {
        const n = Tree.normalizeBuild(tree, b ?? [], tree.budget);
        if (!n.ok) throw new Error(`p${i + 1} のビルドが決まりに合いません：${n.reason}`);
        return n.build;
      });
      return { ...gameOptions, skillTree: tree, setup: { ...(gameOptions.setup ?? {}), skills } };
    },
    observe,
    verify,
    attach,
    summarize,
    implementationOf,
  };
}
