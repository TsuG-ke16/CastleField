// 系統 C（会心）のスキル効果ハンドラ。C01・C02・C03・C05 は基盤（Crit.js）が直接実装している（ここには書かない）。
// 書き方は docs/skilltree-200-progress.md の段階B「ハンドラ登録APIの書き方」。

import { ratioAmount } from '../Crit.js';

/** 自分が敵兵士に当てた直接命中の会心（追加由来の会心からは誘発しない） */
const directCritOnEnemy = (api, ev) => ev.ownerId === api.playerId && ev.enemy && ev.crit && ev.direct && ev.targetKind === 'soldier';

export default {
  // C04 深い傷跡：直接会心で生存した敵兵士に出血2ターン（出血はスキル専用の最小定義。api.bleed）
  C04: {
    on: {
      onAttackResolve: {
        stage: 'state',
        fn(api, ev) {
          if (!directCritOnEnemy(api, ev) || ev.killed) return;
          const found = api.findSoldier(ev.targetId);
          if (!found) return;
          if (!api.trigger({ targetId: ev.targetId })) return;
          api.as(ev.origin, () => api.bleed(found.owner.id, found.soldier, api.params.turns ?? 2));
        },
      },
    },
  },

  // C06 追撃：直接会心時 20% で同じ敵へ威力50%の追加攻撃（各自ターン1回）。追加攻撃は会心判定できるが、そこから直接会心時の誘発は起きない
  C06: {
    on: {
      onAttackResolve: {
        stage: 'extra',
        fn(api, ev) {
          if (!directCritOnEnemy(api, ev) || ev.killed) return;
          if (!api.canUse()) return;
          const found = api.findSoldier(ev.targetId);
          if (!found) return; // 対象不在は不発（判定もしない）
          const amount = ratioAmount(ev.base, api.params.powerRatio ?? 0.5, { directExtra: true });
          if (!(amount > 0)) return;
          if (!api.roll(api.params.chance ?? 0.2)) return;
          if (!api.spawnExtra('extraAttack').ok) return;
          if (!api.trigger({ targetId: ev.targetId, amount })) return;
          api.consume();
          // 魔法の命中の経路（回避・基礎補正・会心・軽減・死亡処理）を属性なしで使う
          api.as('extraAttack', () => api.game.spellHit(found.owner, found.soldier, amount, { cardId: null, type: null, def: {} }));
          api.game.checkGameOver();
        },
      },
    },
  },

  // C07 会心の余韻：直接会心で敵兵士を倒すと SP+1（各自ターン1回）
  C07: {
    on: {
      onAttackResolve: {
        stage: 'resource',
        fn(api, ev) {
          if (!directCritOnEnemy(api, ev) || !ev.killed) return;
          if (!api.canUse()) return;
          if (!api.trigger({ targetId: ev.targetId })) return;
          api.consume();
          api.gain('sp', api.params.sp ?? 1);
        },
      },
    },
  },

  // C08 殺戮の連鎖：会心で敵兵士を倒すと、次の会心対象命中を確定会心にする（state.critForcedNext。消費は Crit.js）。
  // 獲得は各自ターン1回・非累積（すでに立っていれば何もしない＝回数も使わない）
  C08: {
    on: {
      onAttackResolve: {
        stage: 'state',
        fn(api, ev) {
          if (ev.ownerId !== api.playerId || !ev.enemy || !ev.crit || !ev.killed || ev.targetKind !== 'soldier') return;
          if (api.state.critForcedNext || !api.canUse()) return;
          if (!api.trigger({ targetId: ev.targetId })) return;
          api.consume();
          api.state.critForcedNext = true;
        },
      },
    },
  },
};
