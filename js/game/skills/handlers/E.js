// 系統 E（属性）のスキル効果ハンドラ。E01・E04・E06 は試合開始時の数値（SkillTree.js の STATIC_HANDLERS → Game の既存処理）で効いている（ここには書かない）。
// 付着・反応は Game の既存処理（elementHit / triggerReaction / 付着の turns）をそのまま使う（仕様 5.4）。
// 書き方は docs/skilltree-200-progress.md の段階B「ハンドラ登録APIの書き方」。

import { elementIds } from '../../Elements.js';
import { REMEMBER_DEATHS, adjacentEnemies } from '../victims.js';

/** 使える非無属性（クラシックの elements.json の全属性） */
const usableElements = (game) => elementIds(game.elementDefs);

/** 自分が敵兵士に付けた付着か */
const myAttachOnEnemy = (api, ev) => ev.ownerId === api.playerId && ev.victimOwnerId && api.game.side(ev.victimOwnerId) !== api.game.side(api.playerId);

/** 反応を起こした側（当たった攻撃）の属性：消えた（付いていた）属性に入っていないもの */
const triggeringElement = (ev) => (ev.elements ?? []).find((e) => !(ev.consumed ?? []).includes(e)) ?? null;

/** 自分の、敵兵士への属性反応 */
const myReactionOnEnemy = (api, ev) => ev.ownerId === api.playerId && ev.victimOwnerId && api.game.side(ev.victimOwnerId) !== api.game.side(api.playerId);

/** 属性 element を、自分の攻撃として敵兵士に当てる（既存の付着/反応。ダメージなし） */
function attachAsMine(api, found, element) {
  if (found.soldier.stealth || !found.owner.soldiers.includes(found.soldier)) return false;
  api.as('chain', () => api.game.elementHit(found.owner, found.soldier, element, { by: api.player }));
  api.game.checkGameOver();
  return true;
}

/** 安定順（席 → 兵士の番号）の敵兵士の一覧 */
function enemySoldiers(api, { exclude = null } = {}) {
  const out = [];
  for (const foe of api.game.opponentsOf(api.playerId)) {
    for (const s of foe.visibleSoldiers) if (s.soldierId !== exclude && !s.stealth) out.push({ owner: foe, soldier: s });
  }
  return out.sort((a, b) => api.game.playerOrder.indexOf(a.owner.id) - api.game.playerOrder.indexOf(b.owner.id)
    || Number(a.soldier.soldierId.slice(1)) - Number(b.soldier.soldierId.slice(1)));
}

export default {
  // E02 元素残留：自分が敵兵士へ与える属性付着の持続回数+1（既存の付着モデルは turns だけなので「消費回数」はない）
  E02: {
    on: {
      onElementAttached: {
        stage: 'state',
        fn(api, ev) {
          if (!myAttachOnEnemy(api, ev)) return;
          const found = api.findSoldier(ev.targetId);
          const a = found?.soldier.attachments.find((x) => x.element === ev.element);
          if (!a) return;
          if (!api.trigger({ targetId: ev.targetId, element: ev.element })) return;
          a.turns += api.params.extraCount ?? 1;
        },
      },
    },
  },

  // E03 二重付着：手札由来の属性付着のとき 20% で、異なる属性をもう1つ既存の付着処理で付ける（各自ターン1回。反応することもある）
  E03: {
    on: {
      onElementAttached: {
        stage: 'extra',
        fn(api, ev) {
          if (!myAttachOnEnemy(api, ev) || ev.origin !== 'hand' || !api.canUse()) return;
          const found = api.findSoldier(ev.targetId);
          if (!found || found.soldier.stealth) return;
          const choices = usableElements(api.game).filter((e) => e !== ev.element);
          if (choices.length === 0) return;
          if (!api.roll(api.params.chance ?? 0.2)) return;
          if (!api.spawnExtra('chain').ok) return;
          const element = api.pick(choices); // 属性のランダム選択は幸運の対象外
          if (!api.trigger({ targetId: ev.targetId, element })) return;
          api.consume();
          attachAsMine(api, found, element);
        },
      },
    },
  },

  // E05 元素拡散：自分の属性反応のとき、反応対象の隣接敵兵士1体に、反応を起こした側の属性を付ける（各自ターン1回。既存の反応を1回誘発できる）
  E05: {
    on: {
      ...REMEMBER_DEATHS,
      onReaction: {
        stage: 'extra',
        fn(api, ev) {
          if (!myReactionOnEnemy(api, ev) || !api.canUse()) return;
          const element = triggeringElement(ev);
          if (!element) return;
          const near = adjacentEnemies(api, ev.targetId).filter((x) => !x.soldier.stealth);
          if (near.length === 0) return;
          if (!api.spawnExtra('chain').ok) return;
          const t = near[0];
          if (!api.trigger({ targetId: t.soldier.soldierId, element })) return;
          api.consume();
          attachAsMine(api, t, element);
        },
      },
    },
  },

  // E07 残響：自分が起こす（その区間で最初に成立した）属性反応のあと、反応前の付着を1回分残す。復元では即反応させない（各自ターン1回）
  E07: {
    on: {
      onReaction: {
        stage: 'state',
        fn(api, ev) {
          if (!myReactionOnEnemy(api, ev) || !api.canUse()) return;
          const found = api.findSoldier(ev.targetId);
          if (!found) return; // 倒れた：不発（回数は使わない）
          const element = (ev.consumed ?? []).find((e) => !found.soldier.attachments.some((a) => a.element === e) && found.soldier.element !== e);
          if (!element) return;
          if (!api.trigger({ targetId: ev.targetId, element })) return;
          api.consume();
          const turns = api.game.reactionDefs?.attachTurns ?? 1;
          found.soldier.attachments.push({ element, turns });
          api.as('chain', () => api.game.emit('elementAttached', { playerId: found.owner.id, soldierId: found.soldier.soldierId, element, turns, source: 'skill' }));
        },
      },
    },
  },

  // E08 元素暴走：自分の反応のあと、別の敵兵士1体（ランダム）にランダム属性を付ける。既存の反応を誘発できる（各自ターン1回）
  E08: {
    on: {
      onReaction: {
        stage: 'extra',
        fn(api, ev) {
          if (!myReactionOnEnemy(api, ev) || !api.canUse()) return;
          const list = enemySoldiers(api, { exclude: ev.targetId });
          const elements = usableElements(api.game);
          if (list.length === 0 || elements.length === 0) return;
          if (!api.spawnExtra('chain').ok) return;
          const t = api.pick(list);
          const element = api.pick(elements);
          if (!api.trigger({ targetId: t.soldier.soldierId, element })) return;
          api.consume();
          attachAsMine(api, t, element);
        },
      },
    },
  },
};
