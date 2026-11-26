// 系統 Q（闘志）のスキル効果ハンドラ（段階C・C5 担当）。仕様 3章 Q・5.1。
// SP はクラシックに既存の仕組みがないので、基盤（Runtime/Resources）の最小追加 state.res.sp（初期0・上限30・非トークンの敵兵士の撃破 +1）を使う。
// 攻撃力の一時補正（Q06・Q08）は兵士の値を書き換えず、mods "hitBaseAdd"（兵士の通常攻撃：fight/shot・城への攻撃）で足す。
// 期限は「次の自ターン開始まで」＝付与した区間（state.interval）が変わったら失効

import { RESOURCE_CAPS } from '../Limits.js';
import { ownSoldiers, attackerSoldierId, isOwnNormalAttack } from '../blood.js';

/** 自分の兵士を ID で（任意アクションの対象） */
const ownSoldier = (api, id) => api.player.soldiers.find((s) => s.soldierId === id) ?? null;

/** Q06/Q08 の攻撃力補正が今の区間で有効か */
const activeBuff = (api, key) => {
  const b = api.state.vars[key];
  return b && b.interval === api.state.interval ? b : null;
};

/** 自分の兵士1体を選ぶ任意アクションの共通部分 */
function soldierAction({ label, cost, run, extraCheck = null }) {
  return {
    label,
    list: (api) => ownSoldiers(api).map((s) => ({ args: { soldierId: s.soldierId }, label: s.soldierId })),
    check(api, args) {
      const s = ownSoldier(api, args.soldierId);
      if (!s) return { ok: false, reason: '自分の兵士を選んでください' };
      if (extraCheck) {
        const r = extraCheck(api, s);
        if (r) return { ok: false, reason: r };
      }
      return { ok: true, cost: cost(api), preview: { soldierId: s.soldierId } };
    },
    run: (api, args) => run(api, ownSoldier(api, args.soldierId)),
  };
}

export default {
  // 戦意：味方兵士が敵の直接攻撃（兵士の攻撃・魔法の命中）で実HPダメージを受けると SP+1（各自ターン合計3まで）
  Q01: {
    on: {
      onAttackResolve: {
        stage: 'resource',
        fn(api, ev) {
          const g = api.game;
          if (!ev.victimOwnerId || g.side(ev.victimOwnerId) !== g.side(api.playerId) || !ev.ownerId || g.side(ev.ownerId) === g.side(api.playerId)) return;
          if (!(ev.dealt > 0) || !api.canUse('use', api.params.perTurnMax ?? 3)) return;
          if (api.gain('sp', api.params.sp ?? 1, { reason: 'Q01' }) <= 0) return;
          api.consume();
          api.trigger({ targetId: ev.targetId });
        },
      },
    },
  },

  // 闘気：SP15以上の間、自分の兵士の通常攻撃（兵士・城へ）の基礎ダメージ+1
  Q02: {
    mods: {
      hitBaseAdd(api, ctx) {
        if (api.state.res.sp < (api.params.spThreshold ?? 15) || !isOwnNormalAttack(api, ctx)) return 0;
        if (!api.trigger({ soldierId: attackerSoldierId(ctx) })) return 0;
        return api.params.damage ?? 1;
      },
    },
  },

  // 奮起：メイン行動中、SP3で味方兵士1体にシールド3（各自ターン1回）
  Q03: {
    actions: {
      Q03: soldierAction({
        label: '奮起（SP3でシールド3）',
        cost: (api) => ({ sp: api.params.spCost ?? 3 }),
        extraCheck: (api, s) => (s.shield >= 10 ? 'シールドが上限です' : null),
        run: (api, s) => ({ shield: api.addShield(api.playerId, s, api.params.shield ?? 3) }),
      }),
    },
  },

  // 闘志の火花：味方兵士が敵兵士（非トークン）を通常攻撃で倒すと、既存の SP 報酬に +1（各自ターン1回）
  Q04: {
    on: {
      onUnitDeath: {
        stage: 'resource',
        fn(api, ev) {
          const g = api.game;
          if (ev.killerId !== api.playerId || ev.killOrigin !== 'normalAttack' || g.side(ev.ownerId) === g.side(api.playerId)) return;
          if (!api.canUse()) return;
          if (api.gain('sp', api.params.sp ?? 1, { reason: 'Q04' }) <= 0) return;
          api.consume();
          api.trigger({ targetId: ev.targetId });
        },
      },
    },
  },

  // 集中：メイン行動中、SP3で次の自分の直接会心対象命中の会心率+20pt（各自ターン1回・非累積）。消費は Crit.js（state.critFocus）
  Q05: {
    actions: {
      Q05: {
        label: '集中（SP3で次の会心率+20pt）',
        check(api) {
          if (api.state.critFocus > 0) return { ok: false, reason: '集中はもう効いています（重ねられません）' };
          if (!api.owns('C01') && !api.owns('X10')) return { ok: false, reason: '会心が解放されていません（C01 か X10 が必要）' };
          return { ok: true, cost: { sp: api.params.spCost ?? 3 }, preview: { critChanceAdd: api.params.critChanceAdd ?? 0.2 } };
        },
        run(api) {
          api.state.critFocus = api.params.critChanceAdd ?? 0.2;
          return { critFocus: api.state.critFocus };
        },
      },
    },
  },

  // 戦場の号令：メイン行動中、SP5で味方兵士全員（今いる兵士）の攻撃力+1を次の自ターン開始まで（各自ターン1回）
  Q06: {
    actions: {
      Q06: {
        label: '戦場の号令（SP5で全員の攻撃力+1）',
        check(api) {
          if (api.player.soldiers.length === 0) return { ok: false, reason: '味方の兵士がいません' };
          return { ok: true, cost: { sp: api.params.spCost ?? 5 }, preview: { attack: api.params.attack ?? 1, count: api.player.soldiers.length } };
        },
        run(api) {
          const ids = ownSoldiers(api).map((s) => s.soldierId);
          api.state.vars.q06 = { interval: api.state.interval, ids };
          return { soldierIds: ids };
        },
      },
    },
    mods: {
      hitBaseAdd(api, ctx) {
        const b = activeBuff(api, 'q06');
        if (!b || !isOwnNormalAttack(api, ctx) || !b.ids.includes(attackerSoldierId(ctx))) return 0;
        return api.params.attack ?? 1;
      },
    },
  },

  // 燃える決意：SP が上限（30）に到達するたびに MP+2（各自ターン1回）。上限未満から上限になったときだけ
  Q07: {
    on: {
      onResourceChange: {
        stage: 'resource',
        fn(api, ev) {
          if (ev.ownerId !== api.playerId || ev.resource !== 'sp' || !(ev.delta > 0) || ev.value < RESOURCE_CAPS.sp) return;
          if (!api.canUse()) return;
          const got = api.mp(api.params.mp ?? 2);
          api.consume();
          api.trigger({ mp: got });
        },
      },
    },
  },

  // 覚醒（奥義）：メイン行動中、SP10で味方兵士1体に攻撃力+3（次の自ターン開始まで）・シールド3（各自ターン1回）
  Q08: {
    actions: {
      Q08: soldierAction({
        label: '覚醒（SP10で攻撃力+3・シールド3）',
        cost: (api) => ({ sp: api.params.spCost ?? 10 }),
        run(api, s) {
          api.state.vars.q08 = { interval: api.state.interval, id: s.soldierId };
          return { soldierId: s.soldierId, shield: api.addShield(api.playerId, s, api.params.shield ?? 3) };
        },
      }),
    },
    mods: {
      hitBaseAdd(api, ctx) {
        const b = activeBuff(api, 'q08');
        if (!b || !isOwnNormalAttack(api, ctx) || attackerSoldierId(ctx) !== b.id) return 0;
        return api.params.attack ?? 3;
      },
    },
  },
};
