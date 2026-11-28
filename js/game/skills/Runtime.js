// スキルの実行時の状態とイベントバス（仕様 5.1・5.5・7）。
//
// - Game は skillTree を渡したゲーム（クラシック）で、だれかがノードを1つ以上取ったときだけ new SkillRuntime(game, seatSkills) を作る（game.skillRt）。
//   ほかのモード・全員が何も取っていないクラシックでは game.skillRt は null で、Game.js のフックはすべて素通り（乱数も状態も変えない）
// - プレイヤーごとの状態（取得ID・設定値・回数・会心蓄積・幸運蓄積・資源・予約・債務・墓地・カウンタ）は PlayerSkillState。人どうしで共有しない
// - Game のイベント（emit）は observe() でスキルイベント（Events.js の SKILL_EVENTS）に直し、購読しているハンドラがあるときだけ同じ原アクションの FIFO キューに積む。
//   キューは原アクションの区切り（手札の使用・ターン開始/終了・任意アクション・公開メソッドの終わり）で drain() し、勝敗が決まったら捨てる
// - 数値を変える処理（会心・軽減・コスト・反応ダメージ…）は mods：Game.js のフックから同期で呼ぶ（キューを通さない）
// - QA：this.log（game.skillEvents）と observe(fn)。counters(playerId) は実装済みノード 0 から、未実装ノード null

import { SKILL_EVENTS, STAGES, EXTRA_EXCEPTIONS, SAME_KIND_BANNED, makeEvent, isExtraOrigin, isDirect } from './Events.js';
import { LIMITS, RESOURCE_CAPS } from './Limits.js';
import * as Luck from './Luck.js';
import * as Crit from './Crit.js';
import * as Resources from './Resources.js';
import * as Scheduled from './Scheduled.js';
import * as Units from './Units.js';
import * as Cards from './Cards.js';
import { HANDLERS, CORE_IMPLEMENTED, STATIC_IMPLEMENTED } from './handlers/index.js';

/** Game の公開メソッドのうち、終わったらキューを drain するもの（原アクションの区切り） */
const SETTLE_METHODS = ['start', 'mulligan', 'playCard', 'endTurn', 'discard', 'defend', 'passDefense', 'surrender', 'skillAction'];
/** 持続ダメージの cause */
const DOT_CAUSES = new Set(['poison', 'burn', 'bleed', 'sand', 'frostbite']);
/** 敵由来の城へのダメージ（致死防止・軽減の対象） */
const ENEMY_CASTLE_SOURCES = new Set(['soldier', 'spell', 'spirit', 'reaction', 'passiveSpirit', 'monster']);
/** 会心不可の命中（反射・固定・罠・反応・回復・HP支払） */
const NO_CRIT_ORIGINS = new Set(['reflect', 'reaction', 'hpCost', 'sacrifice', 'dot', 'fixed', 'trap']);
/** ログの最大件数（古いものから捨てる。counters は捨てない） */
const LOG_MAX = 5000;
/**
 * 段階D2：プレイ中に本人が切り替えられる仮ルールの選択（人間・CPU 共通。既定は params の値）。
 * X35.autoDefer：任意HP支払の自動延期（既定 false＝延期しない。params.autoDefer）。playCard の skillOptions.deferHp で1枚ごとに上書きできる
 * X15.pick：先頭2枚からの選び方（"cost"＝MPコストの大きい方・同じなら先頭／"first"／"second"／"ask"＝毎回本人が選ぶ。既定 params.pick）。
 *   "ask" は2枚を保留（state.choice）にして、任意アクション X15pick で選ぶ。選ぶ前にほかの公開メソッドを呼ぶと "cost" で自動決定
 * L06.diceChoice：手札のサイコロの2つの出目からの選び方（"high"／"low"／"first"／"second"）。playCard の skillOptions.diceChoice が優先
 */
export const SKILL_PREFS = {
  X35: { autoDefer: (v) => typeof v === 'boolean' },
  X15: { pick: (v) => ['cost', 'first', 'second', 'ask'].includes(v) },
  L06: { diceChoice: (v) => ['high', 'low', 'first', 'second'].includes(v) },
};

class PlayerSkillState {
  constructor(playerId, seat, build) {
    this.playerId = playerId;
    this.seat = seat;
    this.ids = [...build.ids];
    this.owned = new Set(build.ids);
    this.config = { ...(build.config ?? {}) };
    /** 回数：turn は自ターン開始でリセット（次の自ターン開始までが1区間）、match はリセットなし */
    this.uses = { turn: {}, match: {} };
    /** 自分のターンが始まった回数（区間の番号） */
    this.interval = 0;
    this.intervalSuccess = 0;
    this.critStack = 0;
    this.critFocus = 0;
    this.critForcedNext = false;
    /** L03 の運命蓄積（プレイヤー共通） */
    this.luckStack = 0;
    this.luckFailsThisTurn = 0;
    this.res = Object.fromEntries(Object.keys(RESOURCE_CAPS).map((k) => [k, 0]));
    this.debt = 0;
    this.scheduled = [];
    this.grave = [];
    /** historyId → { auto, total } */
    this.revives = {};
    this.tokensThisTurn = 0;
    /** ハンドラの自由な状態：pub は相手にも見せてよいもの、vars は本人だけ */
    this.pub = {};
    this.vars = {};
    /** 本人だけが見られる情報（山札の先頭の確認など） */
    this.peek = null;
    /** skillId → 成功回数（実装済みだけ） */
    this.counts = {};
    /** 段階D2：仮ルールの選択（SKILL_PREFS。本人だけに見せる） */
    this.prefs = {};
    /** 本人の選択待ち（X15 の "ask"）：{ skillId, kind, cards }。なければ null。本人だけに見せる */
    this.choice = null;
  }
}

export class SkillRuntime {
  /**
   * @param {import('../Game.js').Game} game
   * @param {{build: {ids: string[], config: object}}[]} seatSkills 席ごとのビルド
   */
  constructor(game, seatSkills) {
    this.game = game;
    this.tree = game.skillTree;
    this.nodeById = new Map(this.tree.nodes.map((n) => [n.id, n]));
    /** @type {Record<string, PlayerSkillState>} */
    this.states = {};
    game.playerOrder.forEach((id, seat) => {
      const build = seatSkills?.[seat]?.build;
      if (build && build.ids.length > 0) this.states[id] = new PlayerSkillState(id, seat, build);
    });
    this.eventSeq = 0;
    this.rootSeq = 0;
    /** 今の原アクション { id, origin, playerId, derived, echoes, extras } */
    this.root = null;
    this.queue = [];
    this.draining = false;
    /** 実行中の文脈（ハンドラ・追加効果）の積み重ね { ev, skillId, playerId, origin } */
    this.ctxStack = [];
    /** 今のドローの種類（normal / extra / copy / recover） */
    this.drawKind = null;
    /** 手札から使った今のカード（原アクション "hand" の間） */
    this.handCard = null;
    /** soldierId → { playerId, origin, skillId }：最後にダメージを与えた人（撃破の判定） */
    this.lastHit = new Map();
    /** soldierId → { status → playerId }：有害状態の付与元 */
    this.statusSource = new Map();
    /** playerId → 既存の lastFallen に対応する墓地の記録 */
    this.lastFallenEntry = new Map();
    this.seenFallen = new WeakSet();
    this.pendingHeal = null;
    this.spiritHeal = null;
    /** QA 用のログ（game.skillEvents） */
    this.log = [];
    this.observers = new Set();
    // 購読表：イベント名 → [{ skillId, playerId, stage, fn }]（段階 → スキルID → 席の順）
    this.subs = new Map();
    for (const st of Object.values(this.states)) {
      for (const id of st.ids) {
        const def = HANDLERS[id];
        if (!def?.on) continue;
        for (const [type, h] of Object.entries(def.on)) {
          if (!SKILL_EVENTS.includes(type)) throw new Error(`スキル ${id} のハンドラ：${type} というスキルイベントはありません`);
          const fn = typeof h === 'function' ? h : h.fn;
          const stage = typeof h === 'function' ? def.stage ?? 'extra' : h.stage ?? def.stage ?? 'extra';
          if (!STAGES.includes(stage)) throw new Error(`スキル ${id} のハンドラ：段階 ${stage} はありません（${STAGES.join(' / ')}）`);
          if (!this.subs.has(type)) this.subs.set(type, []);
          this.subs.get(type).push({ skillId: id, playerId: st.playerId, seat: st.seat, stage, fn });
        }
      }
    }
    for (const list of this.subs.values()) {
      list.sort((a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage) || a.skillId.localeCompare(b.skillId) || a.seat - b.seat);
    }
    // 公開メソッドの終わりでキューを処理する（このゲームのインスタンスだけ。ほかのゲームの Game.prototype は変えない）
    for (const m of SETTLE_METHODS) {
      const orig = game[m].bind(game);
      game[m] = (...args) => {
        // 選択待ち（X15 の "ask"）を残したまま別の操作をしたら、先に既定の選び方で決める（山札の先頭が宙に浮かないように）
        if (!(m === 'skillAction' && this.isChoiceAction(args[0], args[1]))) this.resolveChoices();
        const r = orig(...args);
        this.settle();
        return r;
      };
    }
  }

  // ================= 基本 =================

  stateOf(playerId) {
    return this.states[playerId] ?? null;
  }

  owns(playerId, id) {
    return Boolean(this.states[playerId]?.owned.has(id));
  }

  node(id) {
    return this.nodeById.get(id) ?? null;
  }

  /** ノードの params の値（なければ fallback） */
  param(id, key, fallback) {
    const v = this.nodeById.get(id)?.params?.[key];
    return v === undefined ? fallback : v;
  }

  /** ノードの設定値（E04・X25。なければデータの default） */
  configOf(playerId, id) {
    const node = this.nodeById.get(id);
    if (!node?.config) return undefined;
    return this.states[playerId]?.config?.[id] ?? node.config.default;
  }

  /** 段階D2：仮ルールの選択（SKILL_PREFS）を変える。{ ok, reason?, prefs }。取っていないノードは拒否 */
  setPrefs(playerId, prefs) {
    const st = this.states[playerId];
    if (!st) return { ok: false, reason: 'スキルがありません' };
    if (!prefs || typeof prefs !== 'object') return { ok: false, reason: '{ ノードID: { キー: 値 } } で渡してください' };
    for (const [id, kv] of Object.entries(prefs)) {
      const schema = SKILL_PREFS[id];
      if (!schema) return { ok: false, reason: `${id} には選べる設定がありません` };
      if (!st.owned.has(id)) return { ok: false, reason: `${id} を取っていません` };
      for (const [k, v] of Object.entries(kv ?? {})) if (!schema[k]?.(v)) return { ok: false, reason: `${id}.${k} に ${JSON.stringify(v)} は使えません` };
    }
    for (const [id, kv] of Object.entries(prefs)) st.prefs[id] = { ...(st.prefs[id] ?? {}), ...kv };
    return { ok: true, prefs: structuredClone(st.prefs) };
  }

  /** 仮ルールの選択の値（本人の選択 → params の既定 → fallback） */
  prefOf(playerId, skillId, key, fallback) {
    const v = this.states[playerId]?.prefs?.[skillId]?.[key];
    return v === undefined ? this.param(skillId, key, fallback) : v;
  }

  /** その人の選択待ちを解決する任意アクションか（ハンドラの actions の choice: true） */
  isChoiceAction(playerId, actionId) {
    const st = this.states[playerId];
    return Boolean(st?.choice && HANDLERS[st.choice.skillId]?.actions?.[actionId]?.choice);
  }

  /** 残っている選択待ちを、ハンドラの resolveChoice（index null＝既定の選び方）で決める。選択待ちがなければ何もしない */
  resolveChoices() {
    for (const st of Object.values(this.states)) {
      if (!st.choice) continue;
      const h = HANDLERS[st.choice.skillId]?.resolveChoice;
      if (typeof h !== 'function') { st.choice = null; continue; }
      this.beginRoot('system', { playerId: st.playerId });
      h(this.api(st.playerId, st.choice.skillId, null), null);
      st.choice = null;
      this.drain();
    }
  }

  nextEventId() {
    this.eventSeq += 1;
    return this.eventSeq;
  }

  /** ノードの実装状況："handler"（段階C 以降のハンドラ）/ "core"（基盤が実装）/ "static"（試合開始時の数値）/ null（未実装） */
  implementation(id) {
    if (HANDLERS[id] && (HANDLERS[id].on || HANDLERS[id].mods || HANDLERS[id].actions || HANDLERS[id].scheduled || HANDLERS[id].mulligan)) return 'handler';
    if (CORE_IMPLEMENTED.has(id)) return 'core';
    if (STATIC_IMPLEMENTED.has(id)) return 'static';
    return null;
  }

  // ================= 回数（5.1） =================

  /** 回数の上限に達していないか。scope "turn" は自ターン開始でリセット、"match" はリセットなし */
  canUse(playerId, skillId, key = 'use', limit = 1, scope = 'turn') {
    const st = this.states[playerId];
    if (!st) return false;
    return (st.uses[scope][`${skillId}:${key}`] ?? 0) < limit;
  }

  /** 回数を使う（成功したときだけ呼ぶ。失敗・対象不在では呼ばない） */
  consume(playerId, skillId, key = 'use', n = 1, scope = 'turn') {
    const st = this.states[playerId];
    if (!st) return;
    const k = `${skillId}:${key}`;
    st.uses[scope][k] = (st.uses[scope][k] ?? 0) + n;
  }

  used(playerId, skillId, key = 'use', scope = 'turn') {
    return this.states[playerId]?.uses[scope][`${skillId}:${key}`] ?? 0;
  }

  /**
   * スキルの成功を数える（counters と区間の成功上限）。上限を超えたら false（診断だけ出して、効果は止める）
   */
  countSuccess(playerId, skillId, fields = {}) {
    const st = this.states[playerId];
    if (!st) return false;
    if (st.intervalSuccess >= LIMITS.successPerInterval) {
      this.diagnostic('successLimit', { playerId, skillId, limit: LIMITS.successPerInterval });
      return false;
    }
    st.intervalSuccess += 1;
    st.counts[skillId] = (st.counts[skillId] ?? 0) + 1;
    const ctx = this.ctx();
    this.record({
      eventId: ctx?.ev?.eventId ?? null, rootActionId: this.root?.id ?? null, origin: fields.origin ?? ctx?.origin ?? ctx?.ev?.origin ?? null,
      depth: ctx?.ev ? ctx.ev.depth + 1 : 0, ...fields, kind: 'trigger', playerId, skillId, count: st.counts[skillId],
    });
    return true;
  }

  /** プレイヤーのノード別の成功回数。実装済み（handler・core）は数（未発動は 0）、未実装・static は null */
  counters(playerId) {
    const st = this.states[playerId];
    if (!st) return {};
    return Object.fromEntries(st.ids.map((id) => {
      const impl = this.implementation(id);
      return [id, impl === 'handler' || impl === 'core' ? st.counts[id] ?? 0 : null];
    }));
  }

  // ================= ログ・診断（7章） =================

  record(entry) {
    const e = { turn: this.game.turn, ...entry };
    this.log.push(e);
    if (this.log.length > LOG_MAX) this.log.splice(0, this.log.length - LOG_MAX);
    for (const fn of [...this.observers]) {
      try {
        fn(e);
      } catch (err) {
        console.error('スキルの observe の処理中にエラー:', err);
      }
    }
  }

  recordLuck(entry) {
    this.record({ ...entry, kind: 'luck' });
  }

  recordCrit(entry) {
    this.record({ ...entry, kind: 'crit' });
  }

  diagnostic(code, data = {}) {
    this.record({ rootActionId: this.root?.id ?? null, ...data, kind: 'diagnostic', code });
  }

  /** QA：ログを購読する。解除関数を返す */
  observe(fn) {
    this.observers.add(fn);
    return () => this.observers.delete(fn);
  }

  // ================= 原アクションとキュー（5.5） =================

  /** 新しい原アクションを始める（前の原アクションのキューは先に処理する） */
  beginRoot(origin, { playerId = null, cardId = null } = {}) {
    this.drain();
    this.rootSeq += 1;
    this.root = { id: this.rootSeq, origin, playerId, cardId, derived: 0, echoes: 0, extras: {} };
    this.handCard = null;
    return this.root;
  }

  ctx() {
    return this.ctxStack.at(-1) ?? null;
  }

  /** origin・skillId・親イベントを文脈にして fn を実行（その間に起きた Game のイベントは、この親から派生したものになる） */
  withOrigin(origin, skillId, parent, fn, playerId = null) {
    const cur = this.ctx();
    this.ctxStack.push({ ev: parent ?? cur?.ev ?? null, skillId: skillId ?? cur?.skillId ?? null, playerId: playerId ?? cur?.playerId ?? null, origin: origin ?? cur?.origin ?? null });
    try {
      return fn();
    } finally {
      this.ctxStack.pop();
    }
  }

  withDrawKind(kind, skillId, parent, fn) {
    const before = this.drawKind;
    this.drawKind = kind;
    try {
      return this.withOrigin(null, skillId, parent, fn);
    } finally {
      this.drawKind = before;
    }
  }

  /** スキルイベントを作ってキューに積む（購読がなければ積まない）。派生の上限を超えたら診断だけ */
  enqueue(type, fields = {}) {
    const ctx = this.ctx();
    const parent = fields.parent ?? ctx?.ev ?? null;
    const ev = makeEvent(this, type, {
      ...fields,
      parent,
      sourceSkillId: fields.sourceSkillId ?? ctx?.skillId ?? null,
      origin: fields.origin ?? ctx?.origin ?? undefined,
    });
    ev.isExtra = isExtraOrigin(ev.origin);
    ev.direct = isDirect(ev);
    if (!this.subs.has(type)) return ev;
    if (this.game.phase === 'gameOver') return null;
    if (parent && this.root) {
      this.root.derived += 1;
      if (this.root.derived > LIMITS.derived || ev.depth > LIMITS.depth) {
        this.diagnostic(ev.depth > LIMITS.depth ? 'depthLimit' : 'derivedLimit', { type, depth: ev.depth, derived: this.root.derived, sourceSkillId: ev.sourceSkillId });
        return null;
      }
    }
    this.queue.push(ev);
    return ev;
  }

  /** キューを FIFO で処理する。勝敗が決まったら残りを捨てる */
  drain() {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length > 0) {
        if (this.game.phase === 'gameOver') {
          if (this.queue.length) this.diagnostic('discardedAfterGameOver', { count: this.queue.length });
          this.queue = [];
          break;
        }
        this.dispatch(this.queue.shift());
      }
    } finally {
      this.draining = false;
    }
  }

  /** 公開メソッドの終わり：キューを処理して、勝敗を確かめる */
  settle() {
    if (this.queue.length === 0) return;
    if (this.game.phase === 'defend') return; // 防御の返事を待っている間は処理しない（返事のあとで処理する）
    this.drain();
    if (this.game.phase !== 'gameOver' && this.game.phase !== 'ready') this.game.checkGameOver();
  }

  dispatch(ev) {
    const list = this.subs.get(ev.type);
    if (!list) return;
    for (const sub of list) {
      if (this.game.phase === 'gameOver') return;
      const api = this.api(sub.playerId, sub.skillId, ev);
      this.ctxStack.push({ ev, skillId: sub.skillId, playerId: sub.playerId, origin: null });
      try {
        sub.fn(api, ev);
      } catch (err) {
        console.error(`スキル ${sub.skillId} のハンドラ（${ev.type}）でエラー:`, err);
        this.diagnostic('handlerError', { skillId: sub.skillId, type: ev.type, message: String(err?.message ?? err) });
      } finally {
        this.ctxStack.pop();
      }
    }
  }

  // ================= mods（同期の数値補正） =================

  /** その人が持つスキルの mods[name] を順に呼ぶ（order → スキルID の順）。ctx を返す */
  runMods(name, playerId, ctx) {
    const st = this.states[playerId];
    if (!st) return ctx;
    for (const { skillId, fn } of this.modsOf(st, name)) {
      const api = this.api(playerId, skillId, this.ctx()?.ev ?? null);
      this.ctxStack.push({ ev: this.ctx()?.ev ?? null, skillId, playerId, origin: null });
      try {
        fn(api, ctx);
      } catch (err) {
        console.error(`スキル ${skillId} の mods（${name}）でエラー:`, err);
        this.diagnostic('handlerError', { skillId, mod: name, message: String(err?.message ?? err) });
      } finally {
        this.ctxStack.pop();
      }
    }
    return ctx;
  }

  /** mods[name] が数を返すもの：[{ skillId, value }]（0 は除く） */
  collectMods(name, playerId, ctx) {
    const st = this.states[playerId];
    if (!st) return [];
    const out = [];
    for (const { skillId, fn } of this.modsOf(st, name)) {
      const v = fn(this.api(playerId, skillId, this.ctx()?.ev ?? null), ctx);
      if (typeof v === 'number' && v !== 0) out.push({ skillId, value: v });
    }
    return out;
  }

  modsOf(st, name) {
    const list = [];
    for (const id of st.ids) {
      const m = HANDLERS[id]?.mods?.[name];
      if (!m) continue;
      list.push({ skillId: id, fn: typeof m === 'function' ? m : m.fn, order: typeof m === 'function' ? 100 : m.order ?? 100 });
    }
    return list.sort((a, b) => a.order - b.order || a.skillId.localeCompare(b.skillId));
  }

  // ================= 追加発動のルール（5.5） =================

  /**
   * 追加発動（やまびこ・追撃・連鎖・召喚…）を作ってよいか。よければ記録して { ok: true, origin } を返す。
   * - 追加由来（EXTRA_ORIGINS）からの追加は、EXTRA_EXCEPTIONS にあって allow で明示し、必要なノードを持つときだけ
   * - 反射→反射・蘇生→蘇生・コピー→コピー・召喚→召喚は禁止（X19 の1回だけ例外）
   * - やまびこは同じ原アクションで合計3回（M08 なし2回）まで
   */
  spawnExtra(playerId, parent, kind, { skillId = null, allow = null } = {}) {
    const deny = (reason, code) => {
      this.diagnostic(code, { playerId, skillId, extraKind: kind, parentOrigin: parent?.origin ?? null, reason });
      return { ok: false, reason };
    };
    if (this.game.phase === 'gameOver') return { ok: false, reason: 'ゲームは終わっています' };
    const root = this.root;
    const from = parent?.origin ?? null;
    const key = `${from}>${kind}`;
    const exc = EXTRA_EXCEPTIONS[key];
    const fromExtra = parent?.isExtra || isExtraOrigin(from);
    if (fromExtra || (from === kind && SAME_KIND_BANNED.has(kind))) {
      if (!exc || allow !== key) return deny(`追加発動（${from}）から追加発動（${kind}）は作れません`, 'extraFromExtra');
      if (!this.owns(playerId, exc.needs)) return deny(`${exc.needs} がないので ${key} は作れません`, 'extraFromExtra');
      const used = root?.extras[key] ?? 0;
      if (exc.max !== undefined && used >= exc.max) return deny(`${key} は1つの原アクションで${exc.max}回までです`, 'extraLimit');
    }
    if (kind === 'echo') {
      const max = this.owns(playerId, 'M08') ? this.param('M08', 'maxExtra', 3) : 2;
      if ((root?.echoes ?? 0) >= max) return deny(`同じ原魔法の追加詠唱は合計${max}回までです`, 'extraLimit');
      if (root) root.echoes += 1;
    }
    if (root) root.extras[key] = (root.extras[key] ?? 0) + 1;
    this.record({ kind: 'extra', playerId, skillId, extraKind: kind, parentOrigin: from, parentEventId: parent?.eventId ?? null, depth: (parent?.depth ?? 0) + 1, rootActionId: root?.id ?? null });
    return { ok: true, origin: kind };
  }

  // ================= ハンドラに渡す API =================

  api(playerId, skillId, ev) {
    return new SkillApi(this, playerId, skillId, ev);
  }

  // ================= Game.js のフック =================

  /** emit の最後に呼ばれる。Game のイベントをスキルイベントに直す */
  onGameEvent(type, payload) {
    const ctx = this.ctx();
    // スキルの文脈で起きた実ダメージ・実回復を、スキルの効果として記録（QA）
    if (ctx?.skillId && ['soldierDamaged', 'castleHealed', 'soldierHealed', 'shieldAdded', 'castleArmored', 'soldierDeployed'].includes(type)) {
      this.record({ kind: 'effect', skillId: ctx.skillId, playerId: ctx.playerId, type, amount: payload.amount ?? null, origin: ctx.origin ?? ctx.ev?.origin ?? null, depth: ctx.ev ? ctx.ev.depth + 1 : 0 });
    }
    switch (type) {
      case 'soldierDamaged': {
        const cause = payload.cause;
        if (DOT_CAUSES.has(cause)) {
          const src = this.statusSource.get(payload.soldierId)?.[cause] ?? null;
          if (src) this.lastHit.set(payload.soldierId, { playerId: src, origin: 'dot' });
          // C5 追加：victimToken・loss（出血は hpBefore を渡すので実HP損失が分かる。X30 血液感染）
          const victimToken = Boolean(this.game.players[payload.playerId]?.soldiers.find((x) => x.soldierId === payload.soldierId)?.token);
          const loss = payload.hpBefore === undefined ? null : Math.max(0, payload.hpBefore - payload.hp);
          this.enqueue('onStatusTick', { ownerId: src, victimOwnerId: payload.playerId, targetId: payload.soldierId, status: cause, amount: payload.amount, hp: payload.hp, origin: 'dot', victimToken, loss });
        } else if (ctx?.playerId) {
          this.lastHit.set(payload.soldierId, { playerId: ctx.playerId, origin: ctx.origin ?? null, skillId: ctx.skillId ?? null });
        }
        this.enqueue('onDamageDealt', {
          ownerId: this.lastHit.get(payload.soldierId)?.playerId ?? null, victimOwnerId: payload.playerId, targetId: payload.soldierId,
          amount: payload.amount, blocked: payload.blocked ?? 0, hp: payload.hp, cause, ...(DOT_CAUSES.has(cause) ? { origin: 'dot' } : {}),
        });
        break;
      }
      case 'statusApplied': {
        const src = ctx?.playerId ?? this.game.currentPlayer;
        const m = this.statusSource.get(payload.soldierId) ?? {};
        m[payload.status] = src;
        this.statusSource.set(payload.soldierId, m);
        this.enqueue('onStatusApplied', { ownerId: src, victimOwnerId: payload.playerId, targetId: payload.soldierId, status: payload.status, turns: payload.turns ?? null, amount: payload.amount ?? null });
        break;
      }
      case 'spiritTriggered':
        // 水の精霊（継続回復）の直後の castleHealed を T05 が見分けられるように覚えておく
        this.spiritHeal = payload.spirit === 'water' ? payload.playerId : null;
        break;
      case 'castleHealed':
      case 'soldierHealed': {
        const heal = type === 'castleHealed' ? this.pendingHeal : null;
        this.pendingHeal = null;
        const continuous = type === 'castleHealed' && this.spiritHeal === payload.playerId;
        if (type === 'castleHealed') this.spiritHeal = null;
        this.enqueue('onHeal', {
          continuous,
          ownerId: payload.playerId, targetId: type === 'castleHealed' ? 'castle' : payload.soldierId, amount: payload.amount,
          overflow: heal?.overflow ?? null, sourceCardId: heal?.cardId ?? null, cardType: heal?.cardType ?? null, source: payload.source ?? null,
        });
        break;
      }
      case 'cardDrawn':
        this.enqueue('onDraw', { ownerId: payload.playerId, cardIds: [...payload.cardIds], kind: this.drawKind ?? 'other' });
        break;
      case 'mpChanged':
        this.enqueue('onResourceChange', { ownerId: payload.playerId, resource: 'mp', delta: payload.delta, value: payload.mp, reason: payload.reason });
        break;
      case 'coinsChanged':
        this.enqueue('onResourceChange', { ownerId: payload.playerId, resource: 'coins', delta: payload.delta, value: payload.coins, reason: payload.reason });
        break;
      case 'soldierDeployed': {
        let origin = ctx?.origin ?? null;
        if (payload.revived) {
          origin = 'resurrection';
          this.spellRevived(payload);
        } else if (payload.raised || payload.token) origin = origin ?? 'token';
        else if (!origin && this.root?.origin === 'hand' && this.handCard?.isSoldier) {
          origin = 'hand';
          const s = this.game.players[payload.playerId].soldiers.find((x) => x.soldierId === payload.soldierId);
          if (s) s.skillCardId = this.handCard.cardId;
        }
        this.enqueue('onSummon', { ownerId: payload.playerId, targetId: payload.soldierId, type: payload.type, roadId: payload.roadId, origin: origin ?? 'system', token: Boolean(payload.token || payload.raised) });
        break;
      }
      case 'monsterDefeated':
        this.enqueue('onMonsterKill', { ownerId: payload.playerId, targetId: payload.monsterId, reward: payload.reward });
        break;
      case 'spellCast':
        this.enqueue('onSpellCast', { ownerId: payload.playerId, cardType: payload.type, targetId: payload.soldierId ?? payload.target ?? null, targetKind: payload.targetKind, targetPlayerId: payload.targetKind === 'player' ? payload.target : null, roadId: payload.roadId ?? null });
        break;
      case 'attackMissed':
        this.enqueue('onMiss', { ownerId: payload.playerId, kind: payload.kind, soldierId: payload.soldierId ?? null });
        break;
      case 'elementAttached':
        this.enqueue('onElementAttached', { ownerId: ctx?.playerId ?? this.game.currentPlayer, victimOwnerId: payload.playerId, targetId: payload.soldierId, element: payload.element, turns: payload.turns });
        break;
      case 'weaponEquipped':
        this.enqueue('onWeaponEquip', { ownerId: payload.playerId, targetId: payload.soldierId, cardType: payload.type });
        break;
      case 'trapSet':
      case 'trapTriggered':
      case 'trapRemoved': {
        // 罠（js/game/Traps.js）：phase "set"（置いた）/ "triggered"（発動した）/ "removed"（消えた。reason つき）
        const phase = type === 'trapSet' ? 'set' : type === 'trapTriggered' ? 'triggered' : 'removed';
        this.enqueue('onTrap', {
          phase, ownerId: payload.playerId, trapId: payload.trapId, trapType: payload.type, roadId: payload.roadId, square: payload.square,
          reason: payload.reason ?? null, generated: Boolean(payload.generated), fromHand: Boolean(payload.fromHand), noRegen: Boolean(payload.noRegen),
          chained: Boolean(payload.chained), victimOwnerId: payload.victimId ?? null, targetId: payload.soldierId ?? null, origin: 'trap',
        });
        break;
      }
      case 'soldierMoved':
        this.enqueue('onUnitMoved', {
          ownerId: payload.playerId, targetId: payload.soldierId, roadId: payload.roadId, fromRoadId: payload.fromRoadId ?? payload.roadId,
          from: payload.from, to: payload.to, kind: payload.skillMove ?? 'march',
        });
        break;
      default:
        break;
    }
  }

  /** 自分のターンの始め（turnStarted の直後）：回数のリセットと新しい原アクション */
  turnBegin(player) {
    this.beginRoot('turnStart', { playerId: player.id });
    const st = this.states[player.id];
    if (!st) return;
    st.interval += 1;
    st.uses.turn = {};
    st.intervalSuccess = 0;
    st.tokensThisTurn = 0;
    st.luckFailsThisTurn = 0;
  }

  /**
   * 自分のターンの始め（既存の更新のあと・Game.skillTurnStart の位置）：HP債務 → 予約効果 → 出血の tick → ほかの開始時効果（onTurnStart）。
   * ゲームが終わったら true
   */
  turnStart(player) {
    const st = this.states[player.id];
    if (st) {
      Resources.payDebt(this, player.id);
      Scheduled.runDue(this, player.id);
    }
    this.tickBleed(player);
    if (this.game.checkGameOver()) return true;
    if (st) this.enqueue('onTurnStart', { ownerId: player.id, origin: 'turnStart' });
    this.drain();
    return this.game.checkGameOver();
  }

  /** ターンの終わり（endTurn の最初）。ゲームが終わったら true */
  turnEnd(player) {
    this.beginRoot('turnEnd', { playerId: player.id });
    if (this.states[player.id]) {
      this.runMods('turnEnd', player.id, { playerId: player.id });
      this.enqueue('onTurnEnd', { ownerId: player.id, origin: 'turnEnd' });
    }
    this.drain();
    return this.game.checkGameOver();
  }

  /** 毎ターンのドロー（ふつうのドロー）。mods "beforeNormalDraw" で X15 などが手を入れられる */
  normalDraw(player, count, draw) {
    const ctx = { playerId: player.id, count, handled: false };
    if (this.states[player.id]) this.runMods('beforeNormalDraw', player.id, ctx);
    if (ctx.handled) return;
    const before = this.drawKind;
    this.drawKind = 'normal';
    try {
      draw(ctx.count);
    } finally {
      this.drawKind = before;
    }
  }

  /**
   * マリガン（Game.mulligan の引き直し）をハンドラが置き換える（H01）。ハンドラの mulligan(api, { cards, drawn }) が true を返したら置き換え済み。
   * cards：戻すカード（手札から外してある）。drawn：引いたカードIDを入れる配列
   */
  mulliganHook(player, cards, drawn) {
    const st = this.states[player.id];
    if (!st) return false;
    for (const id of st.ids) {
      const h = HANDLERS[id]?.mulligan;
      if (typeof h !== 'function') continue;
      if (h(this.api(player.id, id, null), { cards, drawn })) return true;
    }
    return false;
  }

  /** 兵士が場からいなくなった（removeSoldier の中、soldierDestroyed の前） */
  unitRemoved(owner, soldier, reason) {
    const killer = this.lastHit.get(soldier.soldierId) ?? null;
    this.lastHit.delete(soldier.soldierId);
    const sources = this.statusSource.get(soldier.soldierId) ?? {};
    this.statusSource.delete(soldier.soldierId);
    const snapshot = {
      soldierId: soldier.soldierId, historyId: Units.historyOf(soldier), type: soldier.type, attack: soldier.attack, maxHp: soldier.maxHp,
      position: soldier.position, roadId: soldier.roadId, targetId: soldier.targetId, token: Boolean(soldier.token), statusSources: { ...sources },
      bleed: soldier.skillBleed ? { ...soldier.skillBleed } : null,
      // 段階C（S01 感染）：死亡時の毒・やけど
      poison: soldier.poison ? { ...soldier.poison } : null, burn: soldier.burn ? { ...soldier.burn } : null,
      // X06（戦士の遺産）：倒れたときの武器（攻撃の加算の合計と、武器の属性）
      weapon: soldier.weapon ?? null, weaponBonus: soldier.weaponBonus ?? 0, weaponElement: soldier.weapon ? soldier.element : null,
    };
    if (soldier.skillToken) {
      this.enqueue('onTokenGone', { ownerId: owner.id, targetId: soldier.soldierId, cause: reason, killerId: killer?.playerId ?? null, snapshot, origin: 'token' });
      return;
    }
    if (reason !== 'killed') return;
    // 既存の蘇生（lastFallen）が記録した兵士なら、墓地の記録と結びつける
    let entry = null;
    if (!soldier.token && this.states[owner.id]) {
      const lf = owner.lastFallen;
      const recorded = lf && !this.seenFallen.has(lf) && lf.type === soldier.type && lf.roadId === soldier.roadId;
      if (recorded) {
        this.seenFallen.add(lf);
        entry = Units.recordGrave(this, owner, soldier);
        this.lastFallenEntry.set(owner.id, entry);
      }
    }
    // SP（クラシックの最小追加）：非トークンの敵兵士を倒すと +1
    if (!soldier.token && killer?.playerId && this.states[killer.playerId] && this.game.side(killer.playerId) !== this.game.side(owner.id)) {
      Resources.gain(this, killer.playerId, 'sp', 1, { reason: 'kill' });
    }
    if (soldier.token) return;
    this.enqueue('onUnitDeath', { ownerId: owner.id, targetId: soldier.soldierId, killerId: killer?.playerId ?? null, killOrigin: killer?.origin ?? null, snapshot, graveEntry: entry ? true : false });
  }

  /** 既存の蘇生の魔法（reviveFallen）で生き返った：墓地の記録を消し、履歴IDと回数を引き継ぐ */
  spellRevived(payload) {
    const entry = this.lastFallenEntry.get(payload.playerId);
    const st = this.states[payload.playerId];
    if (!entry || !st) return;
    this.lastFallenEntry.delete(payload.playerId);
    st.grave = st.grave.filter((x) => x !== entry);
    const used = st.revives[entry.historyId] ?? { auto: 0, total: 0 };
    st.revives[entry.historyId] = { auto: used.auto, total: used.total + 1 };
    const s = this.game.players[payload.playerId].soldiers.find((x) => x.soldierId === payload.soldierId);
    if (s) s.skillHistoryId = entry.historyId;
    this.revived(payload.playerId, s, entry, { auto: false, skillId: null });
  }

  revived(playerId, soldier, entry, { auto, skillId, parent = null }) {
    this.enqueue('onRevive', { ownerId: playerId, targetId: soldier?.soldierId ?? null, historyId: entry.historyId, auto, sourceSkillId: skillId, parent: parent ?? undefined, origin: 'resurrection' });
    this.record({ kind: 'revive', playerId, skillId, historyId: entry.historyId, auto });
  }

  /**
   * 直接命中（兵士の通常攻撃・射撃・魔法の命中）。回避 → 基礎威力の固定加算 → 割合加算 → 会心 → 受ける側の軽減。
   * スキルに関係がなければ null（Game はもとの値を使う）
   * @param {{kind: 'fight'|'shot'|'spell', attackerOwner?: object, attacker?: object, victimOwner: object, victim: object, amount: number, card?: object}} h
   */
  hit(h) {
    const game = this.game;
    const ctx = this.ctx();
    const attackerOwner = h.attackerOwner ?? game.players[ctx?.playerId ?? game.currentPlayer];
    const aSt = attackerOwner ? this.states[attackerOwner.id] : null;
    const vSt = this.states[h.victimOwner.id];
    if (!aSt && !vSt) {
      if (attackerOwner) this.lastHit.set(h.victim.soldierId, { playerId: attackerOwner.id, origin: h.kind === 'spell' ? 'hand' : 'normalAttack' });
      return null;
    }
    const origin = ctx?.origin ?? (h.kind === 'spell' ? 'hand' : 'normalAttack');
    const enemy = attackerOwner && game.side(attackerOwner.id) !== game.side(h.victimOwner.id);
    const out = {
      ...h, attackerOwner, origin, enemy, base: h.amount, amount: h.amount, evaded: false, crit: false, multiplier: 1,
      isExtra: isExtraOrigin(origin), direct: !isExtraOrigin(origin) && (origin === 'hand' || origin === 'normalAttack'),
      skillId: ctx?.skillId ?? null, parent: ctx?.ev ?? null, cardId: h.card?.cardId ?? this.handCard?.cardId ?? null,
    };
    if (vSt && enemy) {
      this.runMods('hitEvade', h.victimOwner.id, out);
      if (out.evaded) {
        this.record({ kind: 'evade', playerId: h.victimOwner.id, attackerId: attackerOwner?.id ?? null, soldierId: h.victim.soldierId, hitKind: h.kind });
        if (h.kind === 'spell') game.emitMiss(attackerOwner?.id ?? null, 'spell', { type: h.card?.type, evaded: true });
        return out;
      }
    }
    if (aSt) {
      for (const r of this.collectMods('hitBaseAdd', attackerOwner.id, out)) out.amount += r.value;
      const pct = this.collectMods('hitBasePct', attackerOwner.id, out).reduce((s, r) => s + r.value, 0);
      if (pct !== 0) out.amount = Math.max(0, Math.floor(out.amount * (1 + pct)));
      if (enemy && !NO_CRIT_ORIGINS.has(origin)) {
        const c = Crit.resolve(this, {
          ownerId: attackerOwner.id, category: h.kind === 'spell' ? 'spellHit' : 'soldierAttack', amount: out.amount, victim: h.victim, direct: out.direct,
        });
        out.crit = c.crit;
        out.multiplier = c.multiplier;
        out.amount = c.amount;
      }
    }
    if (vSt && enemy) {
      const reduce = this.collectMods('hitReduce', h.victimOwner.id, out).reduce((s, r) => s + r.value, 0);
      if (reduce > 0) out.amount = Math.max(0, out.amount - reduce);
    }
    if (attackerOwner) this.lastHit.set(h.victim.soldierId, { playerId: attackerOwner.id, origin, skillId: out.skillId });
    return out;
  }

  /** 直接命中の解決後（実ダメージと撃破が決まったあと）→ onAttackResolve */
  afterHit(out, { dealt, killed, hit = true }) {
    if (!out || out.evaded || !hit) return;
    this.enqueue('onAttackResolve', {
      ownerId: out.attackerOwner?.id ?? null, victimOwnerId: out.victimOwner.id, targetId: out.victim.soldierId, targetKind: 'soldier',
      hitKind: out.kind, base: out.base, amount: out.amount, dealt, killed, crit: out.crit, multiplier: out.multiplier, origin: out.origin,
      direct: out.direct, isExtra: out.isExtra, enemy: out.enemy, sourceCardId: out.cardId, cardType: out.card?.type ?? null,
      attackerSoldierId: out.attacker?.soldierId ?? null, parent: out.parent ?? undefined, sourceSkillId: out.skillId,
      victimMaxHp: out.victim.maxHp, victimHp: out.victim.hp,
      victimToken: Boolean(out.victim.token), // C5 追加：吸血（B04）はトークンへのダメージから得ない
    });
  }

  /** 城への直接攻撃（damageCastle の最初、身代わりのあと）：基礎威力補正 → 会心（X10）→ 城壁貫通（mods "castlePierce"） */
  castleHit(owner, amount, source) {
    if (!source || (source.kind !== 'soldier' && source.kind !== 'spell')) return null;
    const game = this.game;
    const ctx = this.ctx();
    let attackerId = null;
    if (source.kind === 'soldier') attackerId = game.playerOrder.find((id) => game.players[id].soldiers.some((x) => x.soldierId === source.soldierId)) ?? null;
    else attackerId = ctx?.playerId ?? game.creditTo ?? game.currentPlayer;
    if (!attackerId || !this.states[attackerId] || game.side(attackerId) === game.side(owner.id)) return null;
    const origin = ctx?.origin ?? (source.kind === 'spell' ? (game.creditTo ? 'reflect' : 'hand') : 'normalAttack');
    const out = {
      kind: 'castle', attackerId, victimOwner: owner, source, origin, base: amount, amount, crit: false, multiplier: 1, pierce: 0,
      isExtra: isExtraOrigin(origin), direct: origin === 'hand' || origin === 'normalAttack', skillId: ctx?.skillId ?? null, targetKind: 'castle',
    };
    for (const r of this.collectMods('hitBaseAdd', attackerId, out)) out.amount += r.value;
    const pct = this.collectMods('hitBasePct', attackerId, out).reduce((s, r) => s + r.value, 0);
    if (pct !== 0) out.amount = Math.max(0, Math.floor(out.amount * (1 + pct)));
    if (!NO_CRIT_ORIGINS.has(origin)) {
      const c = Crit.resolve(this, { ownerId: attackerId, category: 'castle', amount: out.amount, direct: out.direct });
      out.crit = c.crit;
      out.multiplier = c.multiplier;
      out.amount = c.amount;
    }
    this.runMods('castlePierce', attackerId, out);
    out.pierce = Math.max(0, Math.min(out.amount, Math.floor(out.pierce)));
    this.lastCastleHit = out;
    return out;
  }

  /** 城HPを減らす直前：軽減・肩代わり（mods "castleReduce"）→ 致死防止（mods "castleLethal"：X14 → D08 の順。order で決める） */
  castleLoss(owner, loss, source) {
    const st = this.states[owner.id];
    if (!st || loss <= 0) return null;
    const ctx = { owner, loss, original: loss, source, fromEnemy: ENEMY_CASTLE_SOURCES.has(source?.kind), direct: source?.kind === 'soldier' || source?.kind === 'spell', prevented: 0 };
    if (ctx.fromEnemy) this.runMods('castleReduce', owner.id, ctx);
    ctx.loss = Math.max(0, Math.floor(ctx.loss));
    // 段階D2：敵のスキルの固定ダメージ（A01・X39・D02 の反射など source kind "skill"）も「敵由来の致死」として X14・D08 の対象にする。
    // 軽減（castleReduce：D04・D06・X38 は直接攻撃が対象）は通さない。HP支払（hpCost）・自傷は従来どおり対象外
    const skillOwner = source?.kind === 'skill' ? this.ctx()?.playerId ?? null : null;
    const fromEnemySkill = Boolean(skillOwner) && this.game.side(skillOwner) !== this.game.side(owner.id);
    if (fromEnemySkill) ctx.enemySkill = source.skill ?? null;
    ctx.enemyOrigin = ctx.fromEnemy || fromEnemySkill; // 致死防止（X14・D08）が見る「敵由来」
    if (ctx.enemyOrigin && ctx.loss >= owner.castle.hp) this.runMods('castleLethal', owner.id, ctx);
    ctx.loss = Math.max(0, Math.floor(ctx.loss));
    return { loss: ctx.loss, prevented: ctx.original - ctx.loss };
  }

  /** castleDamaged のあと：onCastleDamage と、城壁が攻撃で0になったら onWallBreak */
  castleDamaged(owner, info) {
    const hit = this.lastCastleHit;
    this.lastCastleHit = null;
    const attackerId = hit?.attackerId ?? (info.source?.kind === 'soldier'
      ? this.game.playerOrder.find((id) => this.game.players[id].soldiers.some((x) => x.soldierId === info.source.soldierId)) ?? null
      : this.ctx()?.playerId ?? this.game.creditTo ?? this.game.currentPlayer);
    const fields = {
      ownerId: attackerId, victimOwnerId: owner.id, targetId: 'castle', targetKind: 'castle', amount: info.amount, blocked: info.blocked, loss: info.loss,
      prevented: info.prevented ?? 0, pierce: info.pierce ?? 0, armorBefore: info.armorBefore, hpBefore: info.hpBefore, crit: hit?.crit ?? false,
      origin: hit?.origin ?? this.ctx()?.origin ?? undefined, direct: hit?.direct ?? false, sourceKind: info.source?.kind ?? null,
      sourceSoldierId: info.source?.soldierId ?? null, // 段階C（D02 反射障壁）
    };
    this.enqueue('onCastleDamage', fields);
    if (info.armorBefore > 0 && owner.armor === 0 && info.blocked > 0) this.enqueue('onWallBreak', fields);
  }

  /** 反応のダメージ（triggerReaction の中）。起こした人の mods "reactionDamage" */
  reactionDamage(owner, soldier, reaction, damage) {
    const byId = reaction.by?.id ?? null;
    if (!byId || !this.states[byId] || this.game.side(byId) === this.game.side(owner.id)) return damage;
    const ctx = { owner, soldier, reaction, damage, byId };
    this.runMods('reactionDamage', byId, ctx);
    return Math.max(0, Math.floor(ctx.damage));
  }

  /** 反応が起きたあと → onReaction */
  reacted(owner, soldier, reaction, damage, alive) {
    const byId = reaction.by?.id ?? null;
    this.enqueue('onReaction', {
      ownerId: byId, victimOwnerId: owner.id, targetId: soldier.soldierId, reaction: reaction.id, elements: [...reaction.elements], consumed: [...reaction.consumed],
      damage, alive, origin: 'reaction',
    });
    if (byId && this.states[byId]) this.record({ kind: 'reaction', playerId: byId, reaction: reaction.id, damage, alive });
  }

  /** 持続ダメージの量（毒・やけどの tick）。付与元の X17 会心と mods "dotAmount" */
  dotAmount(owner, soldier, status, amount) {
    // T04 先延ばし：延期された tick は今回ダメージなし（次回の tick に回す）。期限の減算は dotHold が見送る
    const defer = soldier.skillTickSkip?.[status];
    if (defer === 'armed') {
      soldier.skillTickSkip[status] = 'skipped';
      return 0;
    }
    if (defer === 'skipped') delete soldier.skillTickSkip[status]; // 期限の減算がない永続の毒など：次の tick は通常どおり
    const src = this.statusSource.get(soldier.soldierId)?.[status] ?? null;
    if (!src || !this.states[src] || this.game.side(src) === this.game.side(owner.id)) return amount;
    const ctx = { owner, soldier, status, amount, sourceId: src };
    this.runMods('dotAmount', src, ctx);
    const c = Crit.resolve(this, { ownerId: src, category: 'dot', amount: ctx.amount, direct: false });
    return c.amount;
  }

  /** 持続ダメージの期限を今回減らさないか（T02 など。mods "dotHold" が ctx.hold = true にする） */
  dotHold(owner, soldier, status) {
    if (soldier.skillTickSkip?.[status] === 'skipped') {
      delete soldier.skillTickSkip[status];
      return true;
    }
    const src = this.statusSource.get(soldier.soldierId)?.[status] ?? null;
    if (!src || !this.states[src]) return false;
    const ctx = { owner, soldier, status, sourceId: src, hold: false };
    this.runMods('dotHold', src, ctx);
    return ctx.hold;
  }

  /**
   * 出血（クラシックに既存の定義がないので、スキル専用の最小定義）：対象の持ち主のターン開始時に固定1ダメージ、指定期間。
   * 同種の再付与は期限の大きい方で更新、同じ付与元は量を足さない。盾は効かない
   */
  applyBleed(sourceId, owner, soldier, turns, amount = 1) {
    if (!owner.soldiers.includes(soldier) || this.game.wardsStatus(soldier)) return false;
    const cur = soldier.skillBleed;
    soldier.skillBleed = { amount: Math.max(amount, cur?.amount ?? 0), turns: Math.max(turns, cur?.turns ?? 0), sourceId: cur?.sourceId ?? sourceId };
    this.withOrigin(null, null, null, () => this.game.emit('statusApplied', { playerId: owner.id, soldierId: soldier.soldierId, status: 'bleed', turns: soldier.skillBleed.turns, amount: soldier.skillBleed.amount }), sourceId);
    return true;
  }

  /** 出血の tick（turnStart から。その人の兵士） */
  tickBleed(player) {
    for (const soldier of [...player.soldiers]) {
      const b = soldier.skillBleed;
      if (!b) continue;
      const amount = this.dotAmount(player, soldier, 'bleed', b.amount);
      const hpBefore = soldier.hp;
      soldier.takeDamage(amount, { ignoreShield: true });
      this.game.emit('soldierDamaged', { playerId: player.id, soldierId: soldier.soldierId, amount, hp: soldier.hp, cause: 'bleed', blocked: 0, hpBefore });
      if (!this.dotHold(player, soldier, 'bleed')) b.turns -= 1;
      if (soldier.isDead) {
        this.game.removeSoldier(player, soldier, 'killed');
        continue;
      }
      if (b.turns <= 0) {
        soldier.skillBleed = null;
        this.game.emit('statusCleared', { playerId: player.id, soldierId: soldier.soldierId, status: 'bleed' });
      }
    }
  }

  /** 回復の量（healOwnCastle の前）：mods "healAmount" */
  healAmount(player, card, amount) {
    if (!this.states[player.id]) return amount;
    const ctx = { player, card, amount, origin: this.ctx()?.origin ?? 'hand' };
    this.runMods('healAmount', player.id, ctx);
    return Math.max(0, Math.floor(ctx.amount));
  }

  /** 回復のあと（castleHealed の前）：余剰を記録し、mods "healOverflow"（X08 → R02 の順。order で決める） */
  healResult(player, card, { requested, healed }) {
    const overflow = Math.max(0, requested - healed);
    this.pendingHeal = { overflow, cardId: card?.cardId ?? null, cardType: card?.type ?? null };
    if (!this.states[player.id] || overflow <= 0) return;
    this.runMods('healOverflow', player.id, { player, card, overflow, remaining: overflow, origin: this.ctx()?.origin ?? 'hand' });
  }

  /** MP の回復が上限を超えた（changeMp の中）：mods "mpOverflow"（P02 の貯蔵など） */
  mpOverflow(player, overflow, reason) {
    if (overflow <= 0 || !this.states[player.id]) return;
    this.runMods('mpOverflow', player.id, { player, overflow, reason });
  }

  /**
   * 段階C（L06）：サイコロの出目（Game.rollDice の基本のサイコロ・rollGodDice）。mods "diceValue"（ctx.value を書き換える）。
   * reroll は注入 RNG で振り直す関数（mods が呼んだときだけ乱数を使う）。fromHand：手札から使ったそのカードの効果か（神頼みなどは false）
   */
  diceValue(player, card, value, reroll) {
    if (!this.states[player.id]) return value;
    const fromHand = this.root?.origin === 'hand' && Boolean(card) && this.handCard?.cardId === card.cardId && !this.ctx();
    const ctx = { player, card, value, reroll, fromHand, options: this.handPlan?.options ?? {}, done: false, rolls: [value] };
    this.runMods('diceValue', player.id, ctx);
    if (ctx.rolls.length > 1) this.record({ kind: 'dice', playerId: player.id, cardId: card?.cardId ?? null, rolls: [...ctx.rolls], value: ctx.value });
    return ctx.value;
  }

  // ================= 手札のカードの費用（5.6） =================

  /**
   * 手札のカードの費用の計画：MP軽減（mods "mpCost"）→ HP置換（mods "mpToHp"。options.hpForMp）。preview なら乱数を使う補正は飛ばす。
   * スキルがなければ null。払えなければ { ok: false, reason }
   */
  planCardCost(player, card, baseCost, options = {}, { preview = false } = {}) {
    if (!this.states[player.id]) return null;
    const ctx = { player, card, base: baseCost, cost: baseCost, hp: 0, options: options ?? {}, preview, copy: Boolean(card.skillCopy) };
    this.runMods('mpCost', player.id, ctx);
    ctx.cost = Math.max(0, Math.floor(ctx.cost));
    this.runMods('mpToHp', player.id, ctx);
    ctx.cost = Math.max(0, Math.floor(ctx.cost));
    if (ctx.cost > player.mp) return { ok: false, reason: `MPが足りません（${ctx.cost}必要・あと${ctx.cost - player.mp}）` };
    if (ctx.hp > 0) {
      const check = Resources.payHp(this, player.id, ctx.hp, { preview: true });
      if (!check.ok) return { ok: false, reason: check.reason };
    }
    return { ok: true, mp: ctx.cost, hp: ctx.hp, base: baseCost, options: ctx.options };
  }

  /** checkPlayable：MP が足りないときに、スキルで払えるか（乱数を使わない見積もり） */
  canAfford(player, card, cost, options) {
    const plan = this.planCardCost(player, card, cost, options, { preview: true });
    return Boolean(plan?.ok);
  }

  /** 手札のカードを使った（MP を払ったあと、cardPlayed の直後）：HP 支払と onCardPlayed */
  cardPaid(player, card, plan) {
    this.handCard = card;
    this.handPlan = plan ?? null; // 段階C（L06）：手札のカードの skillOptions を、効果の解決中に読めるように
    let hpPaid = 0;
    if (plan?.hp > 0) hpPaid = Resources.payHp(this, player.id, plan.hp, { skillId: 'cardCost' }).paid;
    const fields = {
      ownerId: player.id, sourceCardId: card.cardId, cardType: card.type, kind: card.def.kind, effect: card.def.effect ?? null,
      mpPaid: plan ? plan.mp : null, hpPaid, baseCost: plan?.base ?? null, copy: Boolean(card.skillCopy), copySkillId: card.skillCopy?.skillId ?? null, options: plan?.options ?? {}, origin: 'hand',
      cardNumberThisTurn: player.cardsPlayedThisTurn,
    };
    if (this.states[player.id]) this.enqueue('onCardPlayed', fields);
    for (const foe of this.game.opponentsOf(player.id)) {
      if (this.states[foe.id]) this.enqueue('onEnemyCardPlayed', { ...fields, ownerId: foe.id, enemyId: player.id, sourceCardId: null, options: undefined });
    }
  }

  /** 手札のカードを使い始める（費用の前）。新しい原アクション */
  beginCard(player, card) {
    this.beginRoot('hand', { playerId: player.id, cardId: card.cardId });
  }

  /** コピーカードが使われた・捨てられた（throwAway）：消える */
  copyGone(playerId, card) {
    this.record({ kind: 'copyGone', playerId, cardId: card.cardId, cardType: card.type, skillId: card.skillCopy?.skillId ?? null });
  }

  // ================= 資源の記録 =================

  resourceChanged(playerId, resource, delta, value, meta = {}) {
    this.enqueue('onResourceChange', { ownerId: playerId, resource, delta, value, reason: meta.reason ?? null, sourceSkillId: meta.skillId ?? undefined });
    this.record({ kind: 'resource', playerId, resource, delta, value, skillId: meta.skillId ?? this.ctx()?.skillId ?? null });
  }

  hpPaid(playerId, info) {
    this.enqueue('onHpPayment', { ownerId: playerId, amount: info.paid, requested: info.amount, waived: info.waived, deferred: info.deferred, debt: Boolean(info.debt), sourceSkillId: info.skillId ?? undefined, origin: 'hpCost' });
    this.record({ kind: 'hpPayment', playerId, ...info });
  }

  // ================= 予約 =================

  runScheduled(item) {
    const def = HANDLERS[item.skillId];
    if (!def?.scheduled) {
      this.diagnostic('scheduledNoHandler', { skillId: item.skillId, ownerId: item.ownerId });
      return;
    }
    const ev = makeEvent(this, 'scheduled', { ownerId: item.ownerId, sourceSkillId: item.skillId, targetId: item.targetId, origin: 'scheduled', amount: item.basePower });
    ev.isExtra = true;
    const api = this.api(item.ownerId, item.skillId, ev);
    this.ctxStack.push({ ev, skillId: item.skillId, playerId: item.ownerId, origin: 'scheduled' });
    try {
      const r = def.scheduled(api, item);
      this.record({ kind: 'scheduledResolved', ownerId: item.ownerId, skillId: item.skillId, id: item.id, ok: r !== false });
    } catch (err) {
      console.error(`スキル ${item.skillId} の予約でエラー:`, err);
      this.diagnostic('handlerError', { skillId: item.skillId, scheduled: true, message: String(err?.message ?? err) });
    } finally {
      this.ctxStack.pop();
    }
  }

  // ================= 任意アクション（5.1） =================

  /** その人が持つ任意アクションの定義 [{ actionId, skillId, def }] */
  actionDefs(playerId) {
    const st = this.states[playerId];
    if (!st) return [];
    const out = [];
    for (const id of st.ids) {
      for (const [actionId, def] of Object.entries(HANDLERS[id]?.actions ?? {})) out.push({ actionId, skillId: id, def });
    }
    return out;
  }

  actionLimit(playerId, skillId, def) {
    const scope = def.scope ?? (this.param(skillId, 'perMatch', undefined) !== undefined ? 'match' : 'turn');
    const limit = def.limit ?? this.param(skillId, scope === 'match' ? 'perMatch' : 'perTurn', 1);
    return { scope, limit, key: def.key ?? 'action' };
  }

  /** メイン行動中か（自分の番・phase "main"） */
  actionPhaseOk(playerId) {
    const g = this.game;
    if (g.phase === 'gameOver') return { ok: false, reason: 'ゲームは終わっています' };
    if (g.phase !== 'main') return { ok: false, reason: '任意のスキルはメイン行動中だけ使えます' };
    if (g.currentPlayer !== playerId) return { ok: false, reason: 'あなたの番ではありません' };
    return { ok: true };
  }

  /** 費用 { mp, sp, soul, blood, storedMp, healStore, coins, hp } を払えるか */
  canPay(playerId, cost = {}) {
    const p = this.game.players[playerId];
    const st = this.states[playerId];
    if ((cost.mp ?? 0) > p.mp) return { ok: false, reason: `MPが足りません（${cost.mp}必要）` };
    if ((cost.coins ?? 0) > p.coins) return { ok: false, reason: `コインが足りません（${cost.coins}必要）` };
    for (const r of Resources.SKILL_RESOURCES) if ((cost[r] ?? 0) > st.res[r]) return { ok: false, reason: `${r} が足りません（${cost[r]}必要）` };
    if ((cost.hp ?? 0) > 0) {
      const c = Resources.payHp(this, playerId, cost.hp, { preview: true });
      if (!c.ok) return c;
    }
    return { ok: true };
  }

  pay(playerId, cost = {}, skillId = null) {
    const p = this.game.players[playerId];
    if (cost.mp > 0) this.game.changeMp(p, -cost.mp, 'skill');
    if (cost.coins > 0) this.game.changeCoins(p, -cost.coins, 'skill');
    for (const r of Resources.SKILL_RESOURCES) if (cost[r] > 0) Resources.spend(this, playerId, r, cost[r], { skillId });
    if (cost.hp > 0) Resources.payHp(this, playerId, cost.hp, { skillId });
  }

  /** 合法な任意アクションの一覧（対象・支払い・上限・プレビュー付き）。DOM 非依存（画面・CPU・headless が同じものを使う） */
  listActions(playerId) {
    const phase = this.actionPhaseOk(playerId);
    const out = [];
    for (const { actionId, skillId, def } of this.actionDefs(playerId)) {
      const { scope, limit, key } = this.actionLimit(playerId, skillId, def);
      const api = this.api(playerId, skillId, null);
      if (def.hidden?.(api)) continue; // 選択待ちのときだけ出すアクション（X15pick など）
      const base = { actionId, skillId, label: def.label ?? this.node(skillId)?.name ?? actionId, scope, limit, used: this.used(playerId, skillId, key, scope) };
      if (!phase.ok) {
        out.push({ ...base, ok: false, reason: phase.reason, options: [] });
        continue;
      }
      if (!this.canUse(playerId, skillId, key, limit, scope)) {
        out.push({ ...base, ok: false, reason: scope === 'match' ? `試合中${limit}回まで使いました` : `このターンはもう使いました（${limit}回まで）`, options: [] });
        continue;
      }
      const options = [];
      for (const opt of def.list ? def.list(api) : [{ args: {} }]) {
        const plan = def.check ? def.check(api, opt.args ?? {}) : { ok: true, cost: {} };
        const pay = plan.ok ? this.canPay(playerId, plan.cost ?? {}) : plan;
        if (pay.ok) options.push({ args: opt.args ?? {}, label: opt.label ?? null, cost: { ...(plan.cost ?? {}) }, preview: plan.preview ?? opt.preview ?? null });
      }
      out.push({ ...base, ok: options.length > 0, reason: options.length > 0 ? null : '今は使える対象・支払いがありません', options });
    }
    return out;
  }

  /** 任意アクションを実行（原子的：対象・支払い・上限を確かめてから。成り立たなければ何も消費しない） */
  runAction(playerId, actionId, args = {}) {
    const phase = this.actionPhaseOk(playerId);
    if (!phase.ok) return phase;
    const found = this.actionDefs(playerId).find((a) => a.actionId === actionId);
    if (!found) return { ok: false, reason: `「${actionId}」という任意スキルは持っていません` };
    const { skillId, def } = found;
    const { scope, limit, key } = this.actionLimit(playerId, skillId, def);
    if (!this.canUse(playerId, skillId, key, limit, scope)) return { ok: false, reason: scope === 'match' ? `試合中${limit}回まで使いました` : `このターンはもう使いました（${limit}回まで）` };
    const api0 = this.api(playerId, skillId, null);
    const plan = def.check ? def.check(api0, args ?? {}) : { ok: true, cost: {} };
    if (!plan?.ok) return { ok: false, reason: plan?.reason ?? '使えません' };
    const pay = this.canPay(playerId, plan.cost ?? {});
    if (!pay.ok) return pay;
    this.beginRoot('skillActive', { playerId });
    const ev = makeEvent(this, 'skillAction', { ownerId: playerId, sourceSkillId: skillId, origin: 'skillActive' });
    const api = this.api(playerId, skillId, ev);
    this.ctxStack.push({ ev, skillId, playerId, origin: 'skillActive' });
    let result;
    try {
      this.pay(playerId, plan.cost ?? {}, skillId);
      result = def.run(api, args ?? {}, plan);
    } finally {
      this.ctxStack.pop();
    }
    // free：選択待ちの解決など（回数・成功は保留を作ったときに数えてある）
    if (!def.free) {
      this.consume(playerId, skillId, key, 1, scope);
      this.countSuccess(playerId, skillId, { action: actionId, origin: 'skillActive' });
    }
    this.drain();
    this.game.checkGameOver();
    return { ok: true, result: result ?? null };
  }

  // ================= 公開状態・保存（5.1） =================

  /** getState の players[id] に足すキー（スキルを持たない人は何も足さない）。相手には公開部分だけ */
  stateFor(playerId, viewerId) {
    const st = this.states[playerId];
    if (!st) return {};
    const pub = {
      resources: { ...st.res },
      debt: st.debt,
      tokens: Units.aliveTokens(this, playerId).length,
      scheduledCount: st.scheduled.length,
      graveCount: st.grave.length,
      public: structuredClone(st.pub),
    };
    if (viewerId !== playerId) return { skillState: pub };
    return {
      skillState: {
        ...pub,
        uses: structuredClone(st.uses),
        critStack: st.critStack,
        critFocus: st.critFocus,
        critForcedNext: st.critForcedNext,
        luckStack: st.luckStack,
        tokensThisTurn: st.tokensThisTurn,
        scheduled: structuredClone(st.scheduled),
        grave: st.grave.map((g) => ({ historyId: g.historyId, type: g.type, roadId: g.roadId, maxHp: g.maxHp })),
        peek: st.peek ? structuredClone(st.peek) : null,
        prefs: structuredClone(st.prefs),
        ...(st.choice ? { choice: { skillId: st.choice.skillId, kind: st.choice.kind, options: st.choice.cards.map((c, index) => ({ index, cardId: c.cardId, type: c.type, mpCost: this.game.mpCostOf(c) })) } } : {}),
        counters: this.counters(playerId),
        actions: this.listActions(playerId),
      },
    };
  }

  /** 状態の保存（JSON にできる形）。Game の盤面（兵士の skillToken・skillHistoryId・skillBleed など）は兵士側に残る */
  serialize() {
    return {
      version: 1,
      eventSeq: this.eventSeq,
      rootSeq: this.rootSeq,
      states: Object.fromEntries(Object.entries(this.states).map(([id, st]) => [id, {
        ...structuredClone({ ...st, owned: undefined, grave: undefined }),
        owned: [...st.owned],
        grave: st.grave.map((g) => ({ ...g })),
        lastFallen: this.lastFallenEntry.has(id) ? st.grave.indexOf(this.lastFallenEntry.get(id)) : -1,
      }])),
      statusSource: [...this.statusSource.entries()].map(([k, v]) => [k, { ...v }]),
      lastHit: [...this.lastHit.entries()].map(([k, v]) => [k, { ...v }]),
    };
  }

  restore(data) {
    if (!data || data.version !== 1) throw new Error('スキルの状態の形が違います');
    this.eventSeq = data.eventSeq;
    this.rootSeq = data.rootSeq;
    this.lastFallenEntry.clear();
    for (const [id, saved] of Object.entries(data.states)) {
      const st = this.states[id];
      if (!st) throw new Error(`${id} はスキルを持っていません`);
      const { owned, grave, lastFallen, ...rest } = structuredClone(saved);
      Object.assign(st, rest);
      st.owned = new Set(owned);
      st.grave = grave;
      if (lastFallen >= 0) this.lastFallenEntry.set(id, st.grave[lastFallen]);
    }
    this.statusSource = new Map(data.statusSource.map(([k, v]) => [k, { ...v }]));
    this.lastHit = new Map(data.lastHit.map(([k, v]) => [k, { ...v }]));
    this.queue = [];
  }
}

/**
 * ハンドラに渡す API（1回の呼び出しごと）。ハンドラは api だけを使い、Game の内部をなるべく直接さわらない。
 * 書き方の例は docs/skilltree-200-progress.md の段階B「ハンドラ登録APIの書き方」
 */
export class SkillApi {
  constructor(rt, playerId, skillId, ev) {
    this.rt = rt;
    this.game = rt.game;
    this.playerId = playerId;
    this.skillId = skillId;
    this.ev = ev;
  }

  get player() {
    return this.game.players[this.playerId];
  }

  get state() {
    return this.rt.states[this.playerId];
  }

  get params() {
    return this.rt.node(this.skillId)?.params ?? {};
  }

  get config() {
    return this.rt.configOf(this.playerId, this.skillId);
  }

  /** 仮ルールの選択（SKILL_PREFS。本人の選択 → params の既定） */
  pref(key, fallback) {
    return this.rt.prefOf(this.playerId, this.skillId, key, fallback);
  }

  owns(id) {
    return this.rt.owns(this.playerId, id);
  }

  /** 各自ターンの回数（既定：params.perTurn、なければ1） */
  canUse(key = 'use', limit = this.params.perTurn ?? this.params.perTurnMax ?? 1) {
    return this.rt.canUse(this.playerId, this.skillId, key, limit, 'turn');
  }

  /** 試合中の回数（既定：params.perMatch、なければ1） */
  canUseMatch(key = 'use', limit = this.params.perMatch ?? 1) {
    return this.rt.canUse(this.playerId, this.skillId, key, limit, 'match');
  }

  consume(key = 'use', n = 1) {
    this.rt.consume(this.playerId, this.skillId, key, n, 'turn');
  }

  consumeMatch(key = 'use', n = 1) {
    this.rt.consume(this.playerId, this.skillId, key, n, 'match');
  }

  used(key = 'use', scope = 'turn') {
    return this.rt.used(this.playerId, this.skillId, key, scope);
  }

  /** 幸運の対象の確率判定（Luck.roll）。retry を渡すと X24 の遅延再試行の対象になる */
  roll(prob, opts = {}) {
    return Luck.roll(this.rt, this.playerId, prob, { skillId: this.skillId, ...opts }).ok;
  }

  /** 幸運の対象でない乱数（ランダム対象・属性の選択など）。注入 RNG */
  random() {
    return this.game.rng();
  }

  /** 合法候補（安定ソート済み）から注入 RNG で一様に1つ */
  pick(list) {
    if (!list || list.length === 0) return null;
    return list[Math.floor(this.game.rng() * list.length)];
  }

  /** 成功を数える（counters・区間の成功上限・QA のログ）。上限なら false（効果を止める） */
  trigger(fields = {}) {
    return this.rt.countSuccess(this.playerId, this.skillId, fields);
  }

  /** 追加発動を作ってよいか（Events.EXTRA_EXCEPTIONS） */
  spawnExtra(kind, parent = this.ev, opts = {}) {
    return this.rt.spawnExtra(this.playerId, parent, kind, { skillId: this.skillId, ...opts });
  }

  /** origin を付けて fn を実行（その間のダメージ・付着などは、このスキルの派生になる） */
  as(origin, fn, parent = this.ev) {
    return this.rt.withOrigin(origin, this.skillId, parent, fn, this.playerId);
  }

  emit(type, fields = {}) {
    return this.rt.enqueue(type, { ownerId: this.playerId, sourceSkillId: this.skillId, ...fields });
  }

  // 資源
  gain(res, n, meta = {}) {
    return Resources.gain(this.rt, this.playerId, res, n, { skillId: this.skillId, ...meta });
  }

  spend(res, n, meta = {}) {
    return Resources.spend(this.rt, this.playerId, res, n, { skillId: this.skillId, ...meta });
  }

  mp(delta) {
    return this.as(this.ev?.origin ?? null, () => Resources.changeMp(this.rt, this.playerId, delta, 'skill'));
  }

  coins(n) {
    return this.as(this.ev?.origin ?? null, () => Resources.gainCoins(this.rt, this.playerId, n, 'skill'));
  }

  addArmor(n) {
    return this.as(this.ev?.origin ?? null, () => Resources.addArmor(this.rt, this.playerId, n, { skillId: this.skillId }));
  }

  addShield(ownerId, soldier, n) {
    return this.as(this.ev?.origin ?? null, () => Resources.addShield(this.rt, ownerId, soldier, n, { skillId: this.skillId }));
  }

  payHp(amount, opts = {}) {
    return Resources.payHp(this.rt, this.playerId, amount, { skillId: this.skillId, parent: this.ev, ...opts });
  }

  // 予約
  schedule(item) {
    return Scheduled.schedule(this.rt, { ownerId: this.playerId, skillId: this.skillId, ...item }, this.ev);
  }

  // 手札
  drawExtra(n = 1, opts = {}) {
    return Cards.drawExtra(this.rt, this.playerId, n, { skillId: this.skillId, parent: this.ev, ...opts });
  }

  drawFirstMatching(pred) {
    return Cards.drawFirstMatching(this.rt, this.playerId, pred, { skillId: this.skillId, parent: this.ev });
  }

  recover(cardId) {
    return Cards.recoverFromDiscard(this.rt, this.playerId, cardId, { skillId: this.skillId, parent: this.ev });
  }

  addCopy(source) {
    return Cards.addCopy(this.rt, this.playerId, source, { skillId: this.skillId, parent: this.ev });
  }

  // 兵士
  summonToken(opts) {
    return Units.summonToken(this.rt, this.playerId, { skillId: this.skillId, parent: this.ev, ...opts });
  }

  revive(entry, opts = {}) {
    return Units.revive(this.rt, this.playerId, entry, { skillId: this.skillId, parent: this.ev, ...opts });
  }

  /** 固定ダメージ（会心不可・回避不可。既存の盾・土の精霊・死亡処理は通る）。倒したら true */
  fixedDamage(ownerId, soldier, amount, origin = 'chain') {
    const owner = this.game.players[ownerId];
    if (!owner.soldiers.includes(soldier) || !(amount > 0)) return false;
    const killed = this.as(origin, () => this.game.damageSoldier(owner, soldier, amount, 'skill'));
    this.game.checkGameOver();
    return killed;
  }

  /** 出血を付ける（スキル専用の最小定義） */
  bleed(ownerId, soldier, turns, amount = 1) {
    return this.rt.applyBleed(this.playerId, this.game.players[ownerId], soldier, turns, amount);
  }

  /** 盤面の兵士を ID で探す { owner, soldier } */
  findSoldier(soldierId) {
    for (const id of this.game.playerOrder) {
      const s = this.game.players[id].soldiers.find((x) => x.soldierId === soldierId);
      if (s) return { owner: this.game.players[id], soldier: s };
    }
    return null;
  }

  /** 隣接（縦横1枠・斜めなし）の兵士：同じ道の前後1マス、同じ2人の間のとなりのレーンの同じマス。安定順（レーン → 位置 → ID） */
  adjacentSoldiers(soldierOrSnapshot, { side = null } = {}) {
    const game = this.game;
    const road = game.findRoad(soldierOrSnapshot.roadId);
    if (!road) return [];
    const ownerId = side ?? game.playerOrder.find((id) => game.players[id].soldiers.some((x) => x.soldierId === soldierOrSnapshot.soldierId)) ?? null;
    const centerSide = ownerId ? game.side(ownerId) : null;
    const sq = centerSide ? road.toSquare(centerSide, soldierOrSnapshot.position) : null;
    if (sq === null) return [];
    const out = [];
    for (const id of game.alivePlayerIds()) {
      for (const x of game.players[id].visibleSoldiers) {
        if (x.soldierId === soldierOrSnapshot.soldierId) continue;
        const r = game.findRoad(x.roadId);
        if (!r) continue;
        const xsq = r.toSquare(game.side(id), x.position);
        const sameRoad = r.roadId === road.roadId && Math.abs(xsq - sq) === 1;
        const nextLane = r.pairId === road.pairId && Math.abs(r.lane - road.lane) === 1 && xsq === sq;
        if (sameRoad || nextLane) out.push({ owner: game.players[id], soldier: x, lane: r.lane, square: xsq });
      }
    }
    return out.sort((a, b) => a.lane - b.lane || a.square - b.square || Number(a.soldier.soldierId.slice(1)) - Number(b.soldier.soldierId.slice(1)));
  }
}
