// 横断ノード（skillC2 担当）：X04・X05・X18・X22・X24・X44・X47。handlers/index.js が X.js に合流させる。
// X18/X22 は M02 のやまびこの「許可」：判定の率・威力は M02/M08 と同じ（M02 必須）。回数・上限は ../echo.js（原魔法ごとの追加詠唱カウンタ）で他のやまびこと共有。
import { handRoom } from '../Cards.js';
import { echoKey, echoTarget, echoCard, reserveEcho, castEcho, originalBase, isSingleAttackType } from '../echo.js';
import { IMITATION_SKILLS, isImitationCard, setPeek } from '../c2util.js';

/** 自分の、敵兵士への攻撃魔法の命中（onAttackResolve） */
const mySpellOnEnemy = (api, ev) => ev.ownerId === api.playerId && ev.enemy && ev.hitKind === 'spell' && ev.targetKind === 'soldier';
const echoChance = (api) => (api.owns('M08') ? api.rt.param('M08', 'chance', 0.5) : api.rt.param('M02', 'chance', 0.2));
const echoRatio = (api) => api.rt.param('M02', 'powerRatio', 0.5);

/** やまびこ1回（判定 → 上限 → 命中）。allow は EXTRA_EXCEPTIONS のキー、max はこのノード固有の上限 */
function tryEcho(api, ev, { allow = null, max = null } = {}) {
  const key = echoKey(ev);
  const base = originalBase(api.rt, key, ev);
  const found = echoTarget(api, ev.targetId);
  if (!found) return false;
  if (!api.roll(echoChance(api))) return false;
  const r = reserveEcho(api, { key, parent: ev, allow, max });
  if (!r.ok) return false;
  if (!api.trigger({ targetId: ev.targetId, echoIndex: r.index })) return false;
  castEcho(api, { found, base, ratio: echoRatio(api), card: echoCard(api.game, ev.sourceCardId, ev.cardType) });
  return true;
}

/** X24：保存した再試行（関数は状態の保存に入れられないので、Runtime ごとにメモリだけに置く） */
const PENDING = new WeakMap();
const pendingOf = (rt) => {
  let m = PENDING.get(rt);
  if (!m) {
    m = { items: {}, running: new Set() };
    PENDING.set(rt, m);
  }
  return m;
};

export default {
  // メイン行動中、貯蔵MP2を消費して1枚ドロー（各自ターン1回）。P02 必須
  X04: {
    actions: {
      X04: {
        label: '魔力の知恵（貯蔵MP2で1枚引く）',
        check(api) {
          if (handRoom(api.rt, api.playerId) <= 0) return { ok: false, reason: '手札がいっぱいです' };
          const pile = api.game.pileOf(api.playerId);
          if (pile.deck.length + pile.discard.length === 0) return { ok: false, reason: '引けるカードがありません' };
          return { ok: true, cost: { storedMp: api.params.storeCost ?? 2 } };
        },
        run(api) {
          const r = api.drawExtra(api.params.draw ?? 1);
          return { cardIds: r.cardIds ?? [] };
        },
      },
    },
  },

  // 非トークン味方兵士の死亡時、山札の先頭側の兵士カード1枚を引く（各自ターン1回）
  X05: {
    on: {
      onUnitDeath: {
        stage: 'resource',
        fn(api, ev) {
          if (ev.ownerId !== api.playerId || !api.canUse()) return;
          const r = api.drawFirstMatching((c) => c.isSoldier);
          if (!r.ok) return; // 手札がいっぱい・山札に兵士がいない：不発（回数を使わない）
          api.trigger({ cardId: r.cardId, deadId: ev.targetId });
          api.consume();
        },
      },
    },
  },

  // 予約発動した単体攻撃魔法（T01）にも通常のやまびこを1回だけ許可。M02 必須
  X18: {
    on: {
      onAttackResolve: {
        stage: 'extra',
        fn(api, ev) {
          if (!mySpellOnEnemy(api, ev) || ev.origin !== 'scheduled' || !isSingleAttackType(api.game, ev.cardType)) return;
          tryEcho(api, ev, { allow: 'scheduled>echo', max: api.params.maxEcho ?? 1 });
        },
      },
    },
  },

  // 模倣由来カード（I02・I03 のコピー）を手札から使ったとき、M02 の通常やまびこを許可（追加発動は最大1回）。M02 必須。
  // やまびこの判定・上限の本体は M02 のハンドラ（M.js。X22 を持つときだけコピーのカードにも判定する）。二重に判定しないよう、ここは「許可の実行」を数えるだけ：
  // 模倣由来のコピーの単体攻撃魔法から、実際にやまびこが起きた（origin "echo"）ときに成功を数える
  X22: {
    on: {
      onAttackResolve: {
        stage: 'extra',
        fn(api, ev) {
          if (!mySpellOnEnemy(api, ev) || ev.origin !== 'echo') return;
          const card = api.rt.handCard;
          if (!card || card.cardId !== ev.sourceCardId || !isImitationCard(card)) return;
          api.trigger({ targetId: ev.targetId, cardId: ev.sourceCardId });
        },
      },
    },
  },

  // 幸運対象の判定が最終失敗したら、自ターン中1件だけ記録して次の自ターン開始時に同じ判定を1回だけ再試行する。
  // 再試行の中身は判定した側が opts.retry（関数）で渡す：対象・資源・回数・元カードを再検査して、無効なら false を返す（破棄）。
  // 再試行の判定からさらに延期は作らない。deferrable:false（宣言時限定の判定）は対象外
  X24: {
    mods: {
      luckFinalFail(api, ctx) {
        if (typeof ctx.retry !== 'function' || api.game.currentPlayer !== api.playerId) return;
        const pend = pendingOf(api.rt);
        if (pend.running.has(api.playerId) || !api.canUse('record')) return;
        api.consume('record');
        pend.items[api.playerId] = { retry: ctx.retry, skillId: ctx.skillId ?? null, label: ctx.entry?.label ?? null, turn: api.game.turn };
      },
    },
    on: {
      onTurnStart: {
        stage: 'extra',
        fn(api, ev) {
          if (ev.ownerId !== api.playerId) return;
          const pend = pendingOf(api.rt);
          const item = pend.items[api.playerId];
          if (!item) return;
          delete pend.items[api.playerId];
          pend.running.add(api.playerId);
          let result;
          try {
            result = api.as('turnStart', () => item.retry(api));
          } finally {
            pend.running.delete(api.playerId);
          }
          if (result !== false) api.trigger({ retried: item.skillId, label: item.label });
        },
      },
    },
  },

  // 自ターン終了時に手札が2枚以上あれば、次の通常ドローの先頭最大2枚を自分だけ確認し、順序を選ぶ（各自ターン1回）。
  // 順序の選択は、メイン行動中に任意アクション X44（swap: true で入れ替え・false でそのまま）で予約しておく。選ばなければそのまま
  X44: {
    actions: {
      X44: {
        label: '先読み（ターン終了時に先頭2枚を入れ替える／そのまま）',
        key: 'order',
        limit: 99,
        list(api) {
          const top = api.game.pileOf(api.playerId).deck.slice(0, api.params.reveal ?? 2).map((c) => c.type);
          return [{ args: { swap: false }, label: 'そのまま', preview: { top } }, { args: { swap: true }, label: '入れ替える', preview: { top } }];
        },
        check(api, args) {
          if (typeof args?.swap !== 'boolean') return { ok: false, reason: 'swap（true か false）を選んでください' };
          if (api.player.hand.length < (api.params.handMin ?? 2)) return { ok: false, reason: '手札が2枚以上ないと使えません' };
          return { ok: true, cost: {} };
        },
        run(api, args) {
          api.state.vars.X44swap = args.swap;
          return { swap: args.swap };
        },
      },
    },
    on: {
      onTurnEnd: {
        stage: 'extra',
        fn(api, ev) {
          if (ev.ownerId !== api.playerId) return;
          const swap = Boolean(api.state.vars.X44swap);
          api.state.vars.X44swap = false;
          if (!api.canUse() || api.player.hand.length < (api.params.handMin ?? 2)) return;
          const deck = api.game.pileOf(api.playerId).deck;
          const n = Math.min(api.params.reveal ?? 2, deck.length);
          if (n === 0) return;
          if (swap && n >= 2) [deck[0], deck[1]] = [deck[1], deck[0]];
          setPeek(api.state, 'X44', { turn: api.game.turn, cards: deck.slice(0, n).map((c) => ({ cardId: c.cardId, type: c.type })), swapped: swap && n >= 2 });
          api.trigger({ revealed: n, swapped: swap && n >= 2 });
          api.consume();
        },
      },
    },
  },

  // 手札から模倣カード（I02・I03 のコピー）を使った後、1枚ドロー（各自ターン1回）
  X47: {
    on: {
      onCardPlayed: {
        stage: 'extra',
        fn(api, ev) {
          if (ev.ownerId !== api.playerId || !IMITATION_SKILLS.includes(ev.copySkillId) || !api.canUse()) return;
          const r = api.drawExtra(api.params.draw ?? 1);
          if (!r.ok) return;
          api.trigger({ cardIds: r.cardIds });
          api.consume();
        },
      },
    },
  },
};
