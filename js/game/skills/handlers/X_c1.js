// 横断ノードの一部（段階C の担当 C1）：X01・X02・X03・X12・X13・X14・X15・X16・X19。
// X11（豪運）・X17（持続ダメージの会心）は基盤（Crit.js）が直接実装している（ここには書かない）。
// ほかの横断ノードは handlers/X.js（と別担当の分割ファイル）。登録表は handlers/index.js（先頭の英字で系統を判定）。

import { echoKey, echoTarget, echoCard, reserveEcho, castEcho, originalBase, isSingleAttackType } from '../echo.js';
import { REMEMBER_DEATHS, adjacentEnemies } from '../victims.js';
import { ratioAmount } from '../Crit.js';
import * as Units from '../Units.js';

/** 自分の、敵兵士へのダメージ型属性反応 */
const myDamageReaction = (api, ev) => ev.ownerId === api.playerId && ev.victimOwnerId
  && api.game.side(ev.victimOwnerId) !== api.game.side(api.playerId) && ev.damage > 0;

export default {
  // X01 会心の残響：手札由来の単体攻撃魔法が直接会心したとき 25% で威力50%の追加発動（各自ターン1回）。やまびこの合計上限は echo.js（M02 と共有）
  X01: {
    on: {
      onAttackResolve: {
        stage: 'extra',
        fn(api, ev) {
          if (ev.ownerId !== api.playerId || !ev.enemy || ev.hitKind !== 'spell' || ev.origin !== 'hand' || !ev.direct || !ev.crit) return;
          if (!isSingleAttackType(api.game, ev.cardType) || !api.canUse()) return;
          const c = api.rt.handCard;
          let max = null;
          if (c && c.cardId === ev.sourceCardId && c.skillCopy) {
            // 模倣由来のカード：やまびこは X22 があるときだけ（最大1回）
            if (!api.owns('X22')) return;
            max = api.rt.param('X22', 'maxExtra', 1);
          }
          const key = echoKey(ev);
          const base = originalBase(api.rt, key, ev);
          const found = echoTarget(api, ev.targetId);
          if (!found) return;
          if (!api.roll(api.params.chance ?? 0.25)) return;
          const r = reserveEcho(api, { key, parent: ev, max });
          if (!r.ok || !api.trigger({ targetId: ev.targetId, echoIndex: r.index })) return;
          api.consume();
          castEcho(api, { found, base, ratio: api.params.powerRatio ?? 0.5, card: echoCard(api.game, ev.sourceCardId, ev.cardType) });
        },
      },
    },
  },

  // X02 元素連鎖：自分のダメージ型属性反応が、隣接する別の敵兵士1体へ威力50%で伝播（固定ダメージ。付着・新しい反応・会心なし。各自ターン1回）
  X02: {
    on: {
      ...REMEMBER_DEATHS,
      onReaction: {
        stage: 'extra',
        fn(api, ev) {
          if (!myDamageReaction(api, ev) || !api.canUse()) return;
          const amount = ratioAmount(ev.damage, api.params.powerRatio ?? 0.5);
          if (!(amount > 0)) return;
          const near = adjacentEnemies(api, ev.targetId);
          if (near.length === 0) return;
          if (!api.spawnExtra('chain').ok) return;
          const t = near[0];
          if (!api.trigger({ targetId: t.soldier.soldierId, amount })) return;
          api.consume();
          api.fixedDamage(t.owner.id, t.soldier, amount, 'chain');
        },
      },
    },
  },

  // X03 元素吸収：自分の属性反応で MP+1（各自ターン1回）
  X03: {
    on: {
      onReaction: {
        stage: 'resource',
        fn(api, ev) {
          if (ev.ownerId !== api.playerId || !ev.victimOwnerId || api.game.side(ev.victimOwnerId) === api.game.side(api.playerId)) return;
          if (!api.canUse() || !api.trigger({ targetId: ev.targetId })) return;
          api.consume();
          api.mp(api.params.mp ?? 1);
        },
      },
    },
  },

  // X12 奇跡の詠唱：やまびこ（M02 由来＝M02・M08 のやまびこ）成功時 10% で原カードを捨て札から手札へ（各自ターン1回）。
  // 「成功」はやまびこの命中が解決したとき。同じ実カードは捨て札から1回しか戻らない（M05 で戻っていれば不発）
  X12: {
    on: {
      onAttackResolve: {
        stage: 'resource',
        fn(api, ev) {
          if (ev.ownerId !== api.playerId || ev.origin !== 'echo' || (ev.sourceSkillId !== 'M02' && ev.sourceSkillId !== 'M08')) return;
          if (!api.canUse() || !ev.sourceCardId) return;
          if (!api.game.pileOf(api.playerId).discard.some((c) => c.cardId === ev.sourceCardId)) return;
          if (api.player.hand.length >= api.player.maxHand) return;
          if (!api.roll(api.params.chance ?? 0.1)) return;
          if (!api.trigger({ cardId: ev.sourceCardId })) return;
          if (!api.recover(ev.sourceCardId).ok) return;
          api.consume();
        },
      },
    },
  },

  // X13 元素の賽：自分のダメージ型属性反応のとき 10% で、同じ対象に威力50%の固定反応ダメージを再現（付着・新しい反応なし。各自ターン1回）
  X13: {
    on: {
      onReaction: {
        stage: 'extra',
        fn(api, ev) {
          if (!myDamageReaction(api, ev) || !api.canUse()) return;
          const found = api.findSoldier(ev.targetId);
          if (!found) return;
          const amount = ratioAmount(ev.damage, api.params.powerRatio ?? 0.5);
          if (!(amount > 0)) return;
          if (!api.roll(api.params.chance ?? 0.1)) return;
          if (!api.spawnExtra('chain').ok) return;
          if (!api.trigger({ targetId: ev.targetId, amount })) return;
          api.consume();
          api.fixedDamage(found.owner.id, found.soldier, amount, 'chain');
        },
      },
    },
  },

  // X14 九死一生：敵由来の城の致死ダメージのとき 20% で HP1 にとどまる。成功は試合中1回。絶対防衛（D08・order 20）より先（order 10）。
  // HP支払・既存の強制終了は castleLethal を通らない（Runtime.castleLoss は敵由来のダメージだけ）
  X14: {
    mods: {
      castleLethal: {
        order: 10,
        fn(api, ctx) {
          if (!(ctx.enemyOrigin ?? ctx.fromEnemy) || ctx.loss < ctx.owner.castle.hp || !api.canUseMatch()) return;
          if (!api.roll(api.params.chance ?? 0.2, { deferrable: false })) return;
          if (!api.trigger({ loss: ctx.loss })) return;
          api.consumeMatch();
          ctx.loss = Math.max(0, ctx.owner.castle.hp - 1);
        },
      },
    },
  },

  // X15 運命の引き寄せ：通常ドローのとき 20% で山札の先頭2枚から1枚を選んで引く。選ばなかったカードは元の位置（先頭）に残る（各自ターン1回）。
  // 選び方：CPU・headless の決定論的なフォールバックとして「MPコストの大きい方（同じなら先頭）」（選択UIは段階D）。山札全体は公開しない
  X15: {
    mods: {
      beforeNormalDraw(api, ctx) {
        if (ctx.handled || !(ctx.count > 0) || !api.canUse()) return;
        const game = api.game;
        const pile = game.pileOf(api.playerId);
        if (pile.deck.length < (api.params.reveal ?? 2)) return; // 2枚から選べない（再補充の前）：判定しない
        if (!api.roll(api.params.chance ?? 0.2)) return;
        const top = pile.deck.slice(0, api.params.reveal ?? 2);
        // 段階D2：選び方は本人の選択（game.setSkillPrefs(pid, { X15: { pick } })）→ params.pick（既定 "cost"）
        const how = api.pref('pick', 'cost');
        let pickIndex = 0;
        if (how === 'second') pickIndex = top.length - 1;
        else if (how === 'cost') for (let i = 1; i < top.length; i++) if (game.mpCostOf(top[i]) > game.mpCostOf(top[pickIndex])) pickIndex = i;
        if (!api.trigger({ revealed: top.length, picked: pickIndex })) return;
        api.consume();
        const [card] = pile.deck.splice(pickIndex, 1);
        api.player.hand.push(card);
        api.rt.withDrawKind('normal', api.skillId, null, () => game.emit('cardDrawn', { playerId: api.playerId, cardIds: [card.cardId] }));
        ctx.count -= 1;
        if (ctx.count <= 0) ctx.handled = true;
      },
    },
  },

  // X16 黄金の祝福：戦闘内コインを得たとき 20% でその獲得量を2倍（各自ターン1回）。X16 自身の追加分は対象外
  X16: {
    on: {
      onResourceChange: {
        stage: 'resource',
        fn(api, ev) {
          if (ev.ownerId !== api.playerId || ev.resource !== 'coins' || !(ev.delta > 0) || ev.sourceSkillId === 'X16' || !api.canUse()) return;
          if (!api.roll(api.params.chance ?? 0.2)) return;
          const add = ev.delta * ((api.params.multiplier ?? 2) - 1);
          if (!(add > 0) || !api.trigger({ amount: add })) return;
          api.consume();
          api.coins(add);
        },
      },
    },
  },

  // X19 双子：自分がスキルのトークン召喚に成功したとき 20% で同じトークンをもう1体（各自ターン1回。token>token の例外は1回だけ）
  X19: {
    on: {
      onSummon: {
        stage: 'extra',
        fn(api, ev) {
          if (ev.ownerId !== api.playerId || !ev.token || ev.sourceSkillId === 'X19' || !api.canUse()) return;
          const found = api.findSoldier(ev.targetId);
          const info = found?.soldier.skillToken;
          if (!info) return; // スキルのトークンだけ（既存の骸骨などは対象外）
          if (!Units.canSummon(api.rt, api.playerId).ok) return; // 上限・空き枠がない：判定しない
          if (!api.roll(api.params.chance ?? 0.2)) return;
          if (!api.spawnExtra('token', ev, { allow: 'token>token' }).ok) return;
          const r = api.summonToken({ kind: info.kind, fromType: info.fromType });
          if (!r.ok) return;
          api.consume();
          api.trigger({ targetId: r.soldier.soldierId });
        },
      },
    },
  },
};
