// 横断ノード（C5 担当分：X26〜X35）のスキル効果ハンドラ。仕様 4章・5.5・5.6。
// X48（闘気の焦点）は基盤（Crit.js）が直接実装している（CORE_IMPLEMENTED）ので、ここには書かない。
// 血魔術×回復×幸運の資源循環の決まり：
// - 支払由来（X28・X31・X33・X34）は onHpPayment の実消費量（ev.amount＝paid）だけ。X32 で免除された量・X35 で延期中の量からは作らない
//   （延期分は次の自ターン開始の債務支払で実消費になったときに数える＝二重には数えない）
// - 吸血（X26・X30）は自分の城HPの実回復だけを数える。X30 は自分由来の出血 tick による敵兵士（非トークン）の実HP損失だけ

import { declare, currentDecl, healCastle, roomOf, ownSoldiers } from '../blood.js';
import { sacrifice } from '../Units.js';
import { isSingleAttackType, echoKey, echoTarget, reserveEcho, castEcho, echoCard } from '../echo.js';

export default {
  // 鮮血の一撃：直接会心命中（敵兵士・城）で城HP1回復（各自ターン合計2まで）
  X26: {
    on: {
      onAttackResolve: {
        stage: 'resource',
        fn(api, ev) {
          if (ev.ownerId !== api.playerId || !ev.crit || !ev.direct || !ev.enemy) return;
          x26(api, ev);
        },
      },
      onCastleDamage: {
        stage: 'resource',
        fn(api, ev) {
          if (ev.ownerId !== api.playerId || !ev.crit || !ev.direct || api.game.side(ev.victimOwnerId) === api.game.side(api.playerId)) return;
          x26(api, ev);
        },
      },
    },
  },

  // 血のやまびこ：手札から単体攻撃魔法を使ったあと、任意（options.bloodEcho）で城HP2を払い、同じ対象に威力50%で再発動（各自ターン1回）。
  // やまびこの合計上限（M08 なし2回・あり3回）は echo.js で M02・X01 と共有。対象が消えていれば払わず不発。模倣由来のカードには使わない
  X27: {
    mods: { mpToHp: { order: 1, fn: (api, ctx) => declare(api, ctx) } },
    on: {
      onAttackResolve: {
        stage: 'extra',
        fn(api, ev) {
          if (ev.ownerId !== api.playerId || ev.hitKind !== 'spell' || !ev.direct || ev.origin !== 'hand') return;
          const decl = currentDecl(api, ev.rootActionId);
          if (!decl || !decl.options.bloodEcho || decl.copy || decl.x27 || decl.cardId !== ev.sourceCardId) return;
          if (!isSingleAttackType(api.game, ev.cardType) || !api.canUse()) return;
          decl.x27 = true;
          const found = echoTarget(api, ev.targetId);
          if (!found) return;
          const cost = api.params.hpCost ?? 2;
          if (!api.payHp(cost, { preview: true }).ok) return;
          const r = reserveEcho(api, { key: echoKey(ev) });
          if (!r.ok) return;
          const paid = api.payHp(cost);
          if (!paid.ok) return;
          api.consume();
          if (!api.trigger({ targetId: ev.targetId, paid: paid.paid, waived: paid.waived, deferred: paid.deferred })) return;
          castEcho(api, { found, base: ev.base, ratio: api.params.powerRatio ?? 0.5, card: echoCard(api.game, ev.sourceCardId, ev.cardType) });
        },
      },
    },
  },

  // 生命機関：任意の城HP支払（実消費）のあと、次の手札からの回復魔法の基礎回復量+2（各自ターン1回付与・非累積）
  X28: {
    on: {
      onHpPayment: {
        stage: 'resource',
        fn(api, ev) {
          if (ev.ownerId !== api.playerId || !(ev.amount > 0) || api.state.vars.x28 || !api.canUse()) return;
          api.state.vars.x28 = true;
          api.consume();
          api.trigger({ paid: ev.amount });
        },
      },
    },
    mods: {
      healAmount(api, ctx) {
        if (!api.state.vars.x28 || ctx.origin !== 'hand' || ctx.card?.def?.effect !== 'healOwnCastle' || api.rt.handCard !== ctx.card) return;
        api.state.vars.x28 = false;
        ctx.amount += api.params.heal ?? 2;
      },
    },
  },

  // 生贄の儀式：メイン行動中、非トークン味方兵士1体を生贄（死亡扱いにしない）にして城HP2・MP2回復（各自ターン1回）
  X29: {
    actions: {
      X29: {
        label: '生贄の儀式（兵士1体で城HP2・MP2）',
        list: (api) => ownSoldiers(api, { tokens: false }).map((s) => ({ args: { soldierId: s.soldierId }, label: s.soldierId })),
        check(api, args) {
          const s = api.player.soldiers.find((x) => x.soldierId === args.soldierId && !x.token);
          if (!s) return { ok: false, reason: '生贄にできる自分の兵士（トークン以外）を選んでください' };
          return { ok: true, cost: {}, preview: { castleHp: api.params.castleHp ?? 2, mp: api.params.mp ?? 2 } };
        },
        run(api, args) {
          const s = api.player.soldiers.find((x) => x.soldierId === args.soldierId);
          const r = api.as('sacrifice', () => sacrifice(api.rt, api.playerId, s));
          if (!r.ok) return r;
          const healed = healCastle(api, api.params.castleHp ?? 2, 'sacrifice');
          const mp = api.mp(api.params.mp ?? 2);
          return { healed, mp };
        },
      },
    },
  },

  // 血液感染：自分由来の出血 tick による敵兵士（非トークン）の実HP損失の25%（切り捨て）を城HPに回復（各自ターン合計2まで）
  X30: {
    on: {
      onStatusTick: {
        stage: 'resource',
        fn(api, ev) {
          if (ev.status !== 'bleed' || ev.ownerId !== api.playerId || ev.victimToken || !(ev.loss > 0)) return;
          if (api.game.side(ev.victimOwnerId) === api.game.side(api.playerId)) return;
          const n = Math.min(Math.floor(ev.loss * (api.params.ratio ?? 0.25)), roomOf(api, 'heal', api.params.perTurnMax ?? 2));
          if (n <= 0) return;
          const healed = healCastle(api, n);
          if (healed <= 0) return;
          api.consume('heal', healed);
          api.trigger({ amount: healed, targetId: ev.targetId });
        },
      },
    },
  },

  // 血の眷属：累計の任意HP支払（実消費）5ごとに使い魔1体を召喚（各自ターン1回）。成功時だけカウンタ5消費、カウンタは最大9まで繰越
  X31: {
    on: {
      onHpPayment: {
        stage: 'extra',
        fn(api, ev) {
          if (ev.ownerId !== api.playerId || !(ev.amount > 0)) return;
          const per = api.params.hpPerFamiliar ?? 5;
          const v = api.state.vars;
          v.x31 = Math.min(api.params.carryMax ?? 9, (v.x31 ?? 0) + ev.amount);
          api.state.pub.x31 = v.x31;
          if (v.x31 < per || !api.canUse()) return;
          const r = api.summonToken({ kind: 'familiar' });
          if (!r.ok) return;
          v.x31 -= per;
          api.state.pub.x31 = v.x31;
          api.consume();
          api.trigger({ targetId: r.soldier.soldierId });
        },
      },
    },
  },

  // 悪魔の賭け：任意HP支払の宣言時 20%（幸運の対象・遅延再試行なし）でその支払を免除（各自ターン1回）。債務の支払は対象外（基盤が mods を呼ばない）
  X32: {
    mods: {
      hpPayWaive(api, ctx) {
        if (!(ctx.amount > 0) || ctx.waived >= ctx.amount || !api.canUse()) return;
        if (!api.roll(api.params.chance ?? 0.2, { label: 'X32', deferrable: false })) return;
        ctx.waived = ctx.amount;
        api.consume();
        api.trigger({ waived: ctx.amount, payFor: ctx.skillId });
      },
    },
  },

  // 狂戦士：任意HP支払（実消費）1につき SP+1（各自ターン最大3）
  X33: {
    on: {
      onHpPayment: {
        stage: 'resource',
        fn(api, ev) {
          if (ev.ownerId !== api.playerId || !(ev.amount > 0)) return;
          const n = Math.min(ev.amount, roomOf(api, 'sp', api.params.perTurnMax ?? 3));
          if (n <= 0) return;
          const got = api.gain('sp', n * (api.params.spPerHp ?? 1), { reason: 'X33' });
          if (got <= 0) return;
          api.consume('sp', n);
          api.trigger({ amount: got });
        },
      },
    },
  },

  // 血の障壁：任意HP支払（実消費）1につき城壁+1（各自ターン最大3。既存の城壁上限）
  X34: {
    on: {
      onHpPayment: {
        stage: 'resource',
        fn(api, ev) {
          if (ev.ownerId !== api.playerId || !(ev.amount > 0)) return;
          const n = Math.min(ev.amount * (api.params.armorPerHp ?? 1), roomOf(api, 'armor', api.params.perTurnMax ?? 3));
          if (n <= 0) return;
          const got = api.addArmor(n);
          if (got <= 0) return;
          api.consume('armor', got);
          api.trigger({ amount: got });
        },
      },
    },
  },

  // 遅延代償：任意HP支払のうち最大2を次の自ターン開始まで延期（各自ターン1回。自動）。延期分は債務（state.debt）になり、
  // 次の自ターン開始に最優先で支払う（基盤 Resources.payDebt：HP1を残し、残りは繰越）。債務が残る間は新たな任意HP支払・延期は不可（基盤）
  // 段階D2：自動延期は既定 OFF（params.autoDefer=false。延期すると債務が残る間は以後の任意HP支払が全部できなくなるため、安全側）。
  // 本人の選択 game.setSkillPrefs(pid, { X35: { autoDefer: true } }) で既定を ON に、手札の1枚ごとは playCard の skillOptions.deferHp（true/false）で上書き
  X35: {
    mods: {
      hpPayDefer(api, ctx) {
        const rest = ctx.amount - ctx.waived - ctx.deferred;
        const want = typeof ctx.options?.deferHp === 'boolean' ? ctx.options.deferHp : api.pref('autoDefer', false);
        if (!want || !(rest > 0) || !api.canUse()) return;
        const d = Math.min(api.params.deferMax ?? 2, rest);
        ctx.deferred += d;
        api.consume();
        api.trigger({ deferred: d, payFor: ctx.skillId });
      },
    },
  },
};

/** X26 の回復（各自ターン合計2回まで） */
function x26(api, ev) {
  if (!api.canUse('use', api.params.perTurnMax ?? 2)) return;
  const healed = healCastle(api, api.params.heal ?? 1);
  if (healed <= 0) return;
  api.consume();
  api.trigger({ amount: healed, targetId: ev.targetId });
}

