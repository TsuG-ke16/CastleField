// 魔力系統（P）のハンドラ（段階C・skillC2）。
// P01（初期MP+2）・P07（MP上限+2）は試合開始時の数値（SkillTree.js の STATIC_HANDLERS）で接続済み。ここには書かない。
import { isAttackSpell } from '../c2util.js';

const mpRoom = (api) => Math.max(0, api.game.maxMpOf(api.player) - api.player.mp);
const storeRoom = (api) => Math.max(0, (api.params.storeMax ?? 5) - api.state.res.storedMp);

export default {
  // MP回復の上限超過分を貯蔵（最大5）。自ターン開始時に1まで空きMPへ自動移送する（P08 がなくても）
  P02: {
    mods: {
      mpOverflow(api, ctx) {
        const n = Math.min(ctx.overflow, storeRoom(api));
        if (n <= 0) return;
        const got = api.gain('storedMp', n);
        if (got > 0) api.trigger({ amount: got, reason: ctx.reason });
      },
    },
    on: {
      onTurnStart: {
        stage: 'resource',
        fn(api, ev) {
          if (ev.ownerId !== api.playerId) return;
          const n = Math.min(api.params.autoTransfer ?? 1, api.state.res.storedMp, mpRoom(api));
          if (n <= 0) return;
          if (!api.spend('storedMp', n)) return;
          api.mp(n);
          api.trigger({ amount: n, auto: true });
        },
      },
    },
  },

  // 戦闘内コイン1を消費してMP2回復（各自ターン1回）
  P03: {
    actions: {
      P03: {
        label: '等価交換（コイン1でMP2）',
        check(api) {
          const room = mpRoom(api) + (api.owns('P02') ? storeRoom(api) : 0);
          if (room <= 0) return { ok: false, reason: 'MPがいっぱいで、回復しても無駄になります' };
          return { ok: true, cost: { coins: api.params.coinCost ?? 1 }, preview: { mp: api.params.mp ?? 2 } };
        },
        run(api) {
          return { mp: api.mp(api.params.mp ?? 2) };
        },
      },
    },
  },

  // 魔物にとどめを刺すと戦闘内コイン+1（試合中2回まで）
  P04: {
    on: {
      onMonsterKill: {
        stage: 'resource',
        fn(api, ev) {
          if (ev.ownerId !== api.playerId || !api.canUseMatch()) return;
          if (!api.trigger({ monsterId: ev.targetId })) return;
          api.coins(api.params.coins ?? 1);
          api.consumeMatch();
        },
      },
    },
  },

  // 手札からの有料カードの使用宣言時10%でMPコスト-1（最低1）。乱数は見積もり（preview）では使わない
  P05: {
    mods: {
      mpCost(api, ctx) {
        if (ctx.preview || !(ctx.base > 0)) return;
        const min = api.params.mpMin ?? 1;
        if (ctx.cost <= min) return;
        if (!api.roll(api.params.chance ?? 0.1)) return;
        ctx.cost = Math.max(min, ctx.cost - (api.params.mpReduce ?? 1));
        api.trigger({ cardId: ctx.card.cardId, cost: ctx.cost });
      },
    },
  },

  // 使用宣言時のMPが上限なら、その攻撃魔法の直接基礎ダメージ+2
  P06: {
    mods: {
      // 宣言時（MPを払う前）のMPを覚える。見積もり（preview）では覚えない
      mpCost(api, ctx) {
        if (ctx.preview || !isAttackSpell(ctx.card.def)) return;
        const max = api.game.maxMpOf(ctx.player);
        api.state.vars.P06 = { cardId: ctx.card.cardId, full: max > 0 && ctx.player.mp >= max };
      },
      hitBaseAdd(api, ctx) {
        const v = api.state.vars.P06;
        if (!v?.full || ctx.origin !== 'hand') return 0;
        if (ctx.kind === 'spell' && !ctx.enemy) return 0;
        if (ctx.kind !== 'spell' && !(ctx.kind === 'castle' && ctx.source?.kind === 'spell')) return 0;
        if ((ctx.cardId ?? api.rt.handCard?.cardId) !== v.cardId) return 0;
        if (!api.trigger({ cardId: v.cardId, kind: ctx.kind })) return 0;
        return api.params.damage ?? 2;
      },
    },
  },

  // 貯蔵MPを空きMP分まで任意に一括移送（各自ターン1回）。P02 必須
  P08: {
    actions: {
      P08: {
        label: '魔力覚醒（貯蔵MPを移す）',
        list(api) {
          const max = Math.min(api.state.res.storedMp, mpRoom(api));
          return Array.from({ length: max }, (_, i) => ({ args: { amount: i + 1 }, label: `貯蔵MP${i + 1}をMPへ` }));
        },
        check(api, args) {
          const max = Math.min(api.state.res.storedMp, mpRoom(api));
          const n = Number.isInteger(args?.amount) ? args.amount : max;
          if (max <= 0) return { ok: false, reason: '移せる貯蔵MPか空きMPがありません' };
          if (n < 1 || n > max) return { ok: false, reason: `移せるのは1〜${max}です` };
          return { ok: true, cost: { storedMp: n }, preview: { mp: n } };
        },
        run(api, args, plan) {
          return { mp: api.mp(plan.cost.storedMp) };
        },
      },
    },
  },
};
