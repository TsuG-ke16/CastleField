// 系統 D（防御）の効果ハンドラ。D01（初期城壁+4）・D05（城壁2未満なら2まで）は試合開始時の数値で SkillTree.js の STATIC が接続済み。
// D02〜D04・D06〜D08 をここで実装する。castleReduce の order：D04(10) → D06(20) → X38(30)。castleLethal：X14(10) → D08(20)。
import { isEnemySide, mySoldiers } from '../helpers-c4.js';

const DIRECT_SOURCES = new Set(['soldier', 'spell']);

export default {
  // 反射障壁：城壁が吸収した実ダメージの20%（切り捨て）を、攻撃元の生存兵士か敵城へ固定反射。各自ターン合計最大4（実際に与えた量で数える）
  D02: {
    on: {
      onCastleDamage(api, ev) {
        if (ev.victimOwnerId !== api.game.side(api.playerId) || !(ev.blocked > 0)) return;
        if (!DIRECT_SOURCES.has(ev.sourceKind) || ev.origin === 'reflect' || ev.ownerId === null || ev.ownerId === api.playerId) return;
        if (!isEnemySide(api.game, ev.ownerId, api.playerId)) return;
        const left = (api.params.perTurnMax ?? 4) - api.used('amount');
        const amount = Math.min(Math.floor(ev.blocked * (api.params.ratio ?? 0.2)), left);
        if (amount <= 0) return;
        const game = api.game;
        // 攻撃元の兵士が生きていればその兵士へ、いなければ（魔法など）敵城へ
        const found = ev.sourceSoldierId ? api.findSoldier(ev.sourceSoldierId) : null;
        if (found && !isEnemySide(game, found.owner.id, api.playerId)) return;
        if (!api.trigger({ targetId: found ? found.soldier.soldierId : 'castle', amount })) return;
        api.consume('amount', amount);
        if (found) api.fixedDamage(found.owner.id, found.soldier, amount, 'reflect');
        else {
          const foe = game.players[game.side(ev.ownerId)];
          api.as('reflect', () => game.damageCastle(foe, amount, { kind: 'skill', skill: 'D02' }));
          game.checkGameOver();
        }
      },
    },
  },

  // 危機察知：味方兵士への直接攻撃・直接攻撃魔法の命中を10%で回避（幸運対象）
  D03: {
    mods: {
      hitEvade(api, ctx) {
        if (ctx.evaded || !ctx.enemy || !ctx.direct || ctx.isExtra) return;
        if (!api.roll(api.params.chance ?? 0.1)) return;
        if (!api.trigger({ targetId: ctx.victim?.soldierId ?? null })) return;
        ctx.evaded = true;
      },
    },
  },

  // 緊急防衛：自分の城壁が敵の攻撃で壊れた後、次の城HPへの直接攻撃ダメージを50%軽減（非累積・付与は各自ターン1回）
  D04: {
    on: {
      onWallBreak(api, ev) {
        if (ev.victimOwnerId !== api.game.side(api.playerId) || ev.ownerId === api.playerId) return;
        if (!DIRECT_SOURCES.has(ev.sourceKind) || !api.canUse() || api.state.vars.D04) return;
        if (!api.trigger({ kind: 'grant' })) return;
        api.state.vars.D04 = true;
        api.consume();
      },
    },
    mods: {
      castleReduce: {
        order: 10,
        fn(api, ctx) {
          if (!api.state.vars.D04 || !ctx.direct || !(ctx.loss > 0)) return;
          api.state.vars.D04 = false;
          ctx.loss -= Math.floor(ctx.loss * (api.params.ratio ?? 0.5));
        },
      },
    },
  },

  // 守護結界：自分の城HPへ通る最初の直接攻撃ダメージを最大3吸収（各自ターン1回）
  D06: {
    mods: {
      castleReduce: {
        order: 20,
        fn(api, ctx) {
          if (!ctx.direct || !(ctx.loss > 0) || !api.canUse()) return;
          const absorbed = Math.min(api.params.absorb ?? 3, ctx.loss);
          if (!api.trigger({ amount: absorbed })) return;
          ctx.loss -= absorbed;
          api.consume();
        },
      },
    },
  },

  // 守護の誓い：メイン行動中、味方兵士1体を指定。次の敵の直接攻撃で受けるダメージを2軽減。次の自ターン開始で失効（各自ターン1回）
  D07: {
    on: {
      onTurnStart(api) {
        delete api.state.vars.D07;
      },
    },
    mods: {
      hitReduce(api, ctx) {
        const oath = api.state.vars.D07;
        if (!oath || !ctx.enemy || !ctx.direct || ctx.victim?.soldierId !== oath.soldierId) return 0;
        delete api.state.vars.D07;
        return api.params.reduce ?? 2;
      },
    },
    actions: {
      D07: {
        label: '守護の誓い',
        list: (api) => mySoldiers(api).map((s) => ({ args: { soldierId: s.soldierId }, label: `${s.soldierId}（${s.type}）` })),
        check(api, args) {
          const s = api.player.soldiers.find((x) => x.soldierId === args.soldierId);
          if (!s) return { ok: false, reason: '味方の兵士を指定してください' };
          return { ok: true, cost: {}, preview: `${s.soldierId} が次に受ける敵の直接攻撃のダメージ-${api.params.reduce ?? 2}` };
        },
        run(api, args) {
          api.state.vars.D07 = { soldierId: args.soldierId };
        },
      },
    },
  },

  // 奥義：絶対防衛。敵由来の致死ダメージで城HP1にとどまり、城壁5を生成（試合中1回）。HP支払・強制終了は castleLoss を通らないので対象外
  D08: {
    mods: {
      castleLethal: {
        order: 20,
        fn(api, ctx) {
          const castle = ctx.owner.castle;
          if (ctx.loss < castle.hp || !api.canUseMatch()) return;
          if (!api.trigger({ prevented: ctx.loss - (castle.hp - 1) })) return;
          ctx.loss = Math.max(0, castle.hp - 1);
          api.consumeMatch();
          api.addArmor(api.params.armor ?? 5);
        },
      },
    },
  },
};
