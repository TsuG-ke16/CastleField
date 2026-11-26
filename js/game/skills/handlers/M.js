// 系統 M（魔法）のスキル効果ハンドラ。やまびこ（M02/M08）の上限・原魔法ごとの回数は ../echo.js（X01・X27・X18・X22 と共有）。
// 書き方は docs/skilltree-200-progress.md の段階B「ハンドラ登録APIの書き方」。
// 「攻撃魔法の命中」は onAttackResolve の hitKind "spell"。「手札から」は origin "hand"（追加由来・予約由来は除く）。
// 「単体攻撃魔法」は echo.js の SINGLE_ATTACK_EFFECTS（クラシックの singleDamage・randomElementDamage）。

import { echoKey, echoTarget, echoCard, reserveEcho, castEcho, originalBase, isSingleAttackType } from '../echo.js';
import { REMEMBER_DEATHS, adjacentEnemies } from '../victims.js';

/** 自分の、敵兵士への攻撃魔法の命中 */
const mySpellOnEnemy = (api, ev) => ev.ownerId === api.playerId && ev.enemy && ev.hitKind === 'spell' && ev.targetKind === 'soldier';
/** 手札から使った攻撃魔法の直接命中（追加由来でない） */
const handSpellOnEnemy = (api, ev) => mySpellOnEnemy(api, ev) && ev.origin === 'hand' && !ev.isExtra;

/** 今の手札のカード（原アクション "hand" の間）が一時コピーか */
const isCopyCard = (api, ev) => {
  const c = api.rt.handCard;
  return Boolean(c && c.cardId === ev.sourceCardId && c.skillCopy);
};

/** やまびこの基礎の率：M08 があれば params の 50%、なければ M02 の 20% */
const echoChance = (api) => (api.owns('M08') ? api.rt.param('M08', 'chance', 0.5) : api.rt.param('M02', 'chance', 0.2));
const echoRatio = (api) => api.rt.param('M02', 'powerRatio', 0.5);

/** 1回のやまびこ（判定 → 上限 → 命中）。成功したら true */
function tryEcho(api, ev, { allow = null, max = null } = {}) {
  const key = echoKey(ev);
  const base = originalBase(api.rt, key, ev);
  const found = echoTarget(api, ev.targetId);
  if (!found) return false; // 同じ対象がもういない：不発（判定しない）
  if (!api.roll(echoChance(api))) return false;
  const r = reserveEcho(api, { key, parent: ev, allow, max });
  if (!r.ok) return false;
  if (!api.trigger({ targetId: ev.targetId, echoIndex: r.index })) return false;
  castEcho(api, { found, base, ratio: echoRatio(api), card: echoCard(api.game, ev.sourceCardId, ev.cardType) });
  return true;
}

export default {
  // M01 魔力還元：攻撃魔法の直接ダメージで敵兵士を倒すと MP+1（各自ターン1回）
  M01: {
    on: {
      onAttackResolve: {
        stage: 'resource',
        fn(api, ev) {
          if (!mySpellOnEnemy(api, ev) || !ev.direct || !ev.killed || !api.canUse()) return;
          if (!api.trigger({ targetId: ev.targetId })) return;
          api.consume();
          api.mp(api.params.mp ?? 1);
        },
      },
    },
  },

  // M02 魔法のやまびこ：手札から使った単体攻撃魔法が 20%（M08 で 50%）で同じ対象へ威力50%の追加発動。MP・カードは使わない。
  // 一時コピー（模倣由来）のカードは X22 があるときだけ（追加発動最大1回）
  M02: {
    on: {
      onAttackResolve: {
        stage: 'extra',
        fn(api, ev) {
          if (!handSpellOnEnemy(api, ev) || !isSingleAttackType(api.game, ev.cardType)) return;
          let max = null;
          if (isCopyCard(api, ev)) {
            if (!api.owns('X22')) return;
            max = api.rt.param('X22', 'maxExtra', 1);
          }
          tryEcho(api, ev, { max });
        },
      },
    },
  },

  // M03 連鎖魔法：手札からの単体攻撃魔法の直接ダメージを、対象に隣接する別の敵兵士1体へ 25% で伝播（固定ダメージ・会心なし・付着なし）
  M03: {
    on: {
      ...REMEMBER_DEATHS,
      onAttackResolve: {
        stage: 'extra',
        fn(api, ev) {
          if (!handSpellOnEnemy(api, ev) || !isSingleAttackType(api.game, ev.cardType) || !(ev.amount > 0)) return;
          const near = adjacentEnemies(api, ev.targetId);
          if (near.length === 0) return;
          if (!api.roll(api.params.chance ?? 0.25)) return;
          if (!api.spawnExtra('chain').ok) return;
          const t = near[0]; // 自動対象は安定順の先頭
          if (!api.trigger({ targetId: t.soldier.soldierId, amount: ev.amount })) return;
          api.fixedDamage(t.owner.id, t.soldier, ev.amount, 'chain');
        },
      },
    },
  },

  // M04 魔力残留：攻撃魔法が敵兵士を倒した場合、余剰直接ダメージ（最大3）を隣接する敵兵士1体へ（各自ターン1回）
  M04: {
    on: {
      ...REMEMBER_DEATHS,
      onAttackResolve: {
        stage: 'extra',
        fn(api, ev) {
          if (!mySpellOnEnemy(api, ev) || !ev.killed || !api.canUse()) return;
          const over = Math.min(api.params.overflowMax ?? 3, Math.max(0, (ev.amount ?? 0) - (ev.dealt ?? 0)));
          if (!(over > 0)) return;
          const near = adjacentEnemies(api, ev.targetId);
          if (near.length === 0) return;
          if (!api.spawnExtra('chain').ok) return;
          const t = near[0];
          if (!api.trigger({ targetId: t.soldier.soldierId, amount: over })) return;
          api.consume();
          api.fixedDamage(t.owner.id, t.soldier, over, 'chain');
        },
      },
    },
  },

  // M05 魔法の複製：手札から使った魔法が 5% で捨て札から手札へ戻る（各自ターン1回）。一時コピー・使い切りは捨て札にないので戻らない
  M05: {
    on: {
      onCardPlayed: {
        stage: 'resource',
        fn(api, ev) {
          if (ev.ownerId !== api.playerId || ev.kind !== 'spell' || ev.copy || !api.canUse()) return;
          const pile = api.game.pileOf(api.playerId);
          if (!pile.discard.some((c) => c.cardId === ev.sourceCardId)) return; // 捨て札にない（使い切り・すでに回収）：判定しない
          if (api.player.hand.length >= api.player.maxHand) return; // 手札が満杯：自動追加は不発
          if (!api.roll(api.params.chance ?? 0.05)) return;
          if (!api.trigger({ cardId: ev.sourceCardId })) return;
          if (!api.recover(ev.sourceCardId).ok) return;
          api.consume();
        },
      },
    },
  },

  // M06 魔術の探求：手札からの攻撃魔法で敵兵士を倒すと 20% で1枚ドロー（各自ターン1回）
  M06: {
    on: {
      onAttackResolve: {
        stage: 'resource',
        fn(api, ev) {
          if (!handSpellOnEnemy(api, ev) || !ev.killed || !api.canUse()) return;
          if (api.player.hand.length >= api.player.maxHand) return;
          if (!api.roll(api.params.chance ?? 0.2)) return;
          if (!api.trigger({ targetId: ev.targetId })) return;
          if (!api.drawExtra(api.params.draw ?? 1).ok) return;
          api.consume();
        },
      },
    },
  },

  // M07 詠唱の準備：自ターン内で手札から2枚の魔法を使ったら、次の手札からの魔法の消費MP-1（最低1）。獲得は各自ターン1回
  M07: {
    on: {
      onTurnStart: {
        stage: 'state',
        fn(api) {
          api.state.vars.M07count = 0;
        },
      },
      onCardPlayed: {
        stage: 'state',
        fn(api, ev) {
          if (ev.ownerId !== api.playerId || ev.kind !== 'spell') return;
          const v = api.state.vars;
          // 軽減を使ったカード：準備を消費
          if (v.M07applied && v.M07applied === ev.sourceCardId) {
            v.M07ready = false;
            v.M07applied = null;
            api.state.pub.M07ready = false;
          }
          if (api.game.currentPlayer !== api.playerId) return;
          v.M07count = (v.M07count ?? 0) + 1;
          if (v.M07count < (api.params.spellsNeeded ?? 2) || v.M07ready || !api.canUse()) return;
          if (!api.trigger({ cardId: ev.sourceCardId })) return;
          api.consume();
          v.M07ready = true;
          api.state.pub.M07ready = true;
        },
      },
    },
    mods: {
      mpCost(api, ctx) {
        const v = api.state.vars;
        if (!v.M07ready || ctx.card?.def?.kind !== 'spell') return;
        const min = api.params.mpMin ?? 1;
        if (ctx.cost <= min) return; // 減らせない（準備は残す）
        ctx.cost = Math.max(min, ctx.cost - (api.params.mpReduce ?? 1));
        if (!ctx.preview) v.M07applied = ctx.card.cardId;
      },
    },
  },

  // M08 多重詠唱（M02 必須）：やまびこの率を50%に（M02 の tryEcho が読む）、1枚の原魔法あたり追加発動最大3回（echo.js）。
  // 各追加発動は前の成功に続く独立判定：M02 系のやまびこの命中から、次のやまびこ（echo>echo の例外）
  M08: {
    on: {
      onAttackResolve: {
        stage: 'extra',
        fn(api, ev) {
          if (!mySpellOnEnemy(api, ev) || ev.origin !== 'echo' || !api.owns('M02')) return;
          if (ev.sourceSkillId !== 'M02' && ev.sourceSkillId !== 'M08') return; // M02 に由来するやまびこの続きだけ
          tryEcho(api, ev, { allow: 'echo>echo' });
        },
      },
    },
  },
};
