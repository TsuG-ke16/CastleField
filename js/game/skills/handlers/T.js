// 時間系統（T）のハンドラ（段階C・skillC2）。
//   T01/T08：「自ターン最初の手札由来の単体攻撃魔法」を覚える。T07 は T01 の予約魔法の解決に反応する（mods "scheduledSpell"）
//   T04：延期した持続ダメージの tick は Runtime.dotAmount / dotHold が soldier.skillTickSkip を見て飛ばす
//   T05：既存の「継続回復」＝水の精霊の毎ターンの城回復（onHeal の continuous）に対応づけた
import { isSingleAttackSpell, pseudoCard, enemySoldiers } from '../c2util.js';

const DEFER_STATUSES = ['poison', 'burn', 'bleed'];

/** 原魔法のカード1枚ぶんを覚える：vars[key] = { interval, cardId, ... }（自ターンで最初の単体攻撃魔法だけ） */
function armFirstSingle(api, ev, key, extra = {}) {
  if (ev.ownerId !== api.playerId || api.game.currentPlayer !== api.playerId) return null;
  if (!isSingleAttackSpell(api.game.cardDefs[ev.cardType])) return null;
  const vars = api.state.vars;
  if (vars[key]?.interval === api.state.interval) return null;
  vars[key] = { interval: api.state.interval, cardId: ev.sourceCardId, cardType: ev.cardType, base: null, ...extra };
  return vars[key];
}

export default {
  // 手札から使った自ターン最初の単体攻撃魔法を、次の自ターン開始時に元対象へ威力50%で予約発動
  T01: {
    on: {
      onCardPlayed: { stage: 'extra', fn(api, ev) { armFirstSingle(api, ev, 'T01', { scheduled: false }); } },
      onAttackResolve: {
        stage: 'extra',
        fn(api, ev) {
          const v = api.state.vars.T01;
          if (ev.ownerId !== api.playerId || !v || v.scheduled || ev.sourceCardId !== v.cardId || ev.origin !== 'hand' || ev.isExtra) return;
          if (ev.killed || !api.canUse()) return;
          const r = api.schedule({ targetId: ev.targetId, basePower: ev.base, data: { cardType: ev.cardType, cardId: ev.sourceCardId } });
          if (!r.ok) return;
          v.scheduled = true;
          api.consume();
        },
      },
    },
    scheduled(api, item) {
      const found = api.findSoldier(item.targetId);
      if (!found || api.game.side(found.owner.id) === api.game.side(api.playerId)) return false; // 対象がいない・もう敵ではない：不発
      const power = Math.max(1, Math.floor((item.basePower ?? 0) * (api.params.powerRatio ?? 0.5)));
      if (!api.trigger({ targetId: item.targetId, basePower: item.basePower })) return false;
      const card = pseudoCard(api.game, item.data.cardType, item.data.cardId);
      api.as('scheduled', () => api.game.spellHit(found.owner, found.soldier, power, card));
      api.game.checkGameOver();
      // T07：自身の予約魔法が合法に解決された
      api.rt.runMods('scheduledSpell', api.playerId, { source: 'T01', item });
      return true;
    },
  },

  // 自身が敵に付与した有害状態の期限減算時20%で1回だけ見送る（各状態の寿命延長は最大1ターン）
  T02: {
    mods: {
      dotHold(api, ctx) {
        if (ctx.hold || api.game.side(ctx.owner.id) === api.game.side(api.playerId)) return;
        const used = (api.state.vars.T02 ??= {});
        const key = `${ctx.soldier.soldierId}:${ctx.status}`;
        if ((used[key] ?? 0) >= (api.params.maxExtend ?? 1)) return;
        if (!api.roll(api.params.chance ?? 0.2)) return;
        used[key] = (used[key] ?? 0) + 1;
        ctx.hold = true;
        api.trigger({ targetId: ctx.soldier.soldierId, status: ctx.status });
      },
    },
    on: {
      // 状態が新しく付いたら、その状態の延長の記録を戻す
      onStatusApplied(api, ev) {
        if (ev.ownerId !== api.playerId) return;
        const used = api.state.vars.T02;
        if (used) delete used[`${ev.targetId}:${ev.status}`];
      },
    },
  },

  // 自ターン終了時にMPが2以上残っていれば、次の自ターン開始時MP+1
  T03: {
    on: {
      onTurnEnd(api, ev) {
        if (ev.ownerId !== api.playerId) return;
        api.state.vars.T03 = api.player.mp >= (api.params.mpThreshold ?? 2);
      },
      onTurnStart: {
        stage: 'resource',
        fn(api, ev) {
          if (ev.ownerId !== api.playerId || !api.state.vars.T03) return;
          api.state.vars.T03 = false;
          api.mp(api.params.mp ?? 1);
          api.trigger({ amount: api.params.mp ?? 1 });
        },
      },
    },
  },

  // メイン行動中、味方兵士1体の解除可能な持続ダメージ（毒・やけど・出血）の次の1tickを次回へ延期（各自ターン1回）
  T04: {
    actions: {
      T04: {
        label: '先延ばし（持続ダメージを1回見送る）',
        list(api) {
          const out = [];
          for (const s of api.player.soldiers) {
            for (const status of DEFER_STATUSES) {
              const has = status === 'bleed' ? s.skillBleed : s[status];
              if (has && !s.skillTickSkip?.[status]) out.push({ args: { soldierId: s.soldierId, status }, label: `${s.soldierId} の${status}`, preview: { status } });
            }
          }
          return out;
        },
        check(api, args) {
          const s = api.player.soldiers.find((x) => x.soldierId === args?.soldierId);
          if (!s || !DEFER_STATUSES.includes(args?.status)) return { ok: false, reason: '対象の兵士か状態が違います' };
          if (!(args.status === 'bleed' ? s.skillBleed : s[args.status])) return { ok: false, reason: 'その状態は付いていません' };
          if (s.skillTickSkip?.[args.status]) return { ok: false, reason: 'もう延期されています' };
          return { ok: true, cost: {} };
        },
        run(api, args) {
          const s = api.player.soldiers.find((x) => x.soldierId === args.soldierId);
          s.skillTickSkip = { ...(s.skillTickSkip ?? {}), [args.status]: 'armed' };
          return { soldierId: s.soldierId, status: args.status };
        },
      },
    },
  },

  // 自分の継続回復（水の精霊の毎ターンの城回復）が起きたあと、次の自ターンにもHP1回復を予約（各自ターン1回）
  T05: {
    on: {
      onHeal: {
        stage: 'extra',
        fn(api, ev) {
          if (ev.ownerId !== api.playerId || !ev.continuous || ev.origin === 'scheduled' || !api.canUse()) return;
          const r = api.schedule({ targetId: 'castle', basePower: api.params.heal ?? 1, data: { heal: api.params.heal ?? 1 } });
          if (r.ok) api.consume();
        },
      },
    },
    scheduled(api, item) {
      const owner = api.game.players[api.game.side(api.playerId)];
      if (owner.castle.isDestroyed || owner.castle.isFull) return false;
      const healed = api.as('scheduled', () => {
        const h = owner.castle.heal(item.data.heal ?? 1);
        if (h > 0) api.game.emit('castleHealed', { playerId: owner.id, amount: h, hp: owner.castle.hp, source: { kind: 'skill' } });
        return h;
      });
      if (healed <= 0) return false;
      api.trigger({ amount: healed });
      return true;
    },
  },

  // メイン行動中、次の自ターン開始時に1枚追加ドローを予約（試合中2回）
  T06: {
    actions: {
      T06: {
        label: '時の錨（次のターンに1枚追加ドロー）',
        check() {
          return { ok: true, cost: {} };
        },
        run(api) {
          const r = api.schedule({ targetId: null, data: { draw: api.params.draw ?? 1 } });
          return { ok: r.ok };
        },
      },
    },
    scheduled(api, item) {
      const r = api.drawExtra(item.data.draw ?? 1);
      if (!r.ok) return false; // 手札がいっぱい・山札なし：不発
      api.trigger({ cardIds: r.cardIds });
      return true;
    },
  },

  // 自身の予約魔法（T01）が合法に解決されたときMP+1（各自ターン1回）
  T07: {
    mods: {
      scheduledSpell(api) {
        if (!api.canUse()) return;
        api.mp(api.params.mp ?? 1);
        api.trigger({ amount: api.params.mp ?? 1 });
        api.consume();
      },
    },
  },

  // メイン行動中、前の自ターンの最初の手札由来の単体攻撃魔法を元の基礎威力100%で1回再発動（対象は再選択可・試合中1回）
  T08: {
    on: {
      onTurnStart: {
        stage: 'state',
        fn(api, ev) {
          if (ev.ownerId !== api.playerId) return;
          api.state.vars.T08prev = api.state.vars.T08cur ?? null;
          api.state.vars.T08cur = null;
        },
      },
      onCardPlayed(api, ev) {
        if (api.state.vars.T08cur) return;
        if (ev.ownerId !== api.playerId || api.game.currentPlayer !== api.playerId) return;
        if (!isSingleAttackSpell(api.game.cardDefs[ev.cardType])) return;
        api.state.vars.T08cur = { cardId: ev.sourceCardId, cardType: ev.cardType, base: api.game.cardDefs[ev.cardType].amount ?? null };
      },
      onAttackResolve(api, ev) {
        const cur = api.state.vars.T08cur;
        if (ev.ownerId !== api.playerId || !cur || ev.sourceCardId !== cur.cardId || ev.origin !== 'hand' || ev.isExtra) return;
        cur.base = ev.base;
      },
    },
    actions: {
      T08: {
        label: '時の残響（前のターンの魔法をもう一度）',
        list(api) {
          if (!api.state.vars.T08prev) return [];
          return enemySoldiers(api.game, api.playerId).map(({ soldier }) => ({ args: { targetId: soldier.soldierId }, label: soldier.soldierId }));
        },
        check(api, args) {
          const prev = api.state.vars.T08prev;
          if (!prev) return { ok: false, reason: '前の自分のターンに、手札から単体攻撃魔法を使っていません' };
          const found = enemySoldiers(api.game, api.playerId).find((x) => x.soldier.soldierId === args?.targetId);
          if (!found) return { ok: false, reason: '敵の兵士を選んでください' };
          return { ok: true, cost: {}, preview: { cardType: prev.cardType, power: prev.base } };
        },
        run(api, args) {
          const prev = api.state.vars.T08prev;
          const found = enemySoldiers(api.game, api.playerId).find((x) => x.soldier.soldierId === args.targetId);
          const power = Math.max(1, Math.floor((prev.base ?? 1) * (api.params.powerRatio ?? 1)));
          const card = pseudoCard(api.game, prev.cardType, prev.cardId);
          api.as('skillActive', () => api.game.spellHit(found.owner, found.soldier, power, card));
          return { cardType: prev.cardType, power };
        },
      },
    },
  },
};
