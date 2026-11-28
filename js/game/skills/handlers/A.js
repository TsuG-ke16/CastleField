// 系統 A（攻城）のスキル効果。
// 既存の城への攻撃：兵士が城に着いたとき（Game.advanceSoldiers）と、魔法使いの射撃・攻撃魔法。城に着いた兵士はその攻撃のあと消える（残らない）。
// 対応づけ：
//   「敵城に到達した（到達済みの）味方兵士」＝ 自分の兵士が城に着いて攻撃した。着いた兵士は消えるので、「いる間」は
//     「その自ターン開始〜次の自ターン開始の区間のうちに到達した兵士がいる間」と読む（A03）
//   「固定兵器」＝ 武器を装備した味方兵士（A02。F系統の注記を参照）
// A06（総攻撃）の読み替え：到達済みの兵士は到達の攻撃で消えるので、「到達済みの味方兵士」は
//   「相手の城の前のマス（position が laneLength - 1）にいる、進む味方兵士」と読む（人間に確認して決めた）。

import * as T from '../Tactics.js';

/** A06：城への攻撃魔法（手札から撃つと総攻撃が起きる）の effect */
const CASTLE_SPELLS = new Set(['damageEnemyCastle', 'armorBlast', 'drainCastle', 'sacrificeAttack', 'damageCastleAndHeal', 'damageEnemyAll']);

export default {
  // 城壁破砕：敵城壁を破壊した自身の直接攻撃の解決後、敵城へ固定2ダメージ（各自ターン1回）
  A01: {
    on: {
      onWallBreak(api, ev) {
        if (ev.ownerId !== api.playerId || !ev.direct || !api.canUse()) return;
        if (!api.spawnExtra('chain').ok || !api.trigger({ targetId: ev.victimOwnerId })) return;
        if (T.fixedCastleDamage(api, ev.victimOwnerId, api.params.damage ?? 2)) api.consume();
      },
    },
  },

  // 攻城兵器：固定兵器（武器を装備した兵士）の射程+1
  A02: {
    on: {
      onWeaponEquip(api, ev) {
        if (ev.ownerId !== api.playerId) return;
        const soldier = api.player.soldiers.find((s) => s.soldierId === ev.targetId);
        if (!soldier || soldier.skillRange?.A02) return;
        T.setRangeAdd(soldier, 'A02', api.params.range ?? 1);
        api.trigger({ targetId: ev.targetId });
      },
    },
  },

  // 包囲戦：敵城に到達した味方兵士がいる間（この区間に到達した兵士がいれば）、手札からの城への攻撃魔法の直接基礎ダメージ+2
  A03: {
    mods: {
      castlePierce(api, ctx) {
        if (T.arrivedSoldier(api, ctx)) api.state.vars.a03 = api.state.interval;
      },
      hitBaseAdd(api, ctx) {
        if (ctx.kind !== 'castle' || ctx.source?.kind !== 'spell' || ctx.origin !== 'hand' || api.state.vars.a03 !== api.state.interval) return 0;
        api.trigger();
        return api.params.damage ?? 2;
      },
    },
  },

  // 突破口：自分が敵城壁を破壊すると1枚ドロー（各自ターン1回）
  A04: {
    on: {
      onWallBreak(api, ev) {
        if (ev.ownerId !== api.playerId || !api.canUse()) return;
        const r = api.drawExtra(api.params.draw ?? 1);
        if (!r.ok || !api.trigger({ cardIds: r.cardIds })) return;
        api.consume();
      },
    },
  },

  // 貫通攻撃：敵城への直接ダメージの20%を、城壁を経由せず城HPへ通す
  A05: {
    mods: {
      castlePierce(api, ctx) {
        const v = Math.floor(ctx.amount * (api.params.ratio ?? 0.2));
        if (v <= 0) return;
        ctx.pierce = (ctx.pierce ?? 0) + v;
        api.trigger({ pierce: v });
      },
    },
  },

  // 城門の標的：味方兵士が初めて敵城へ到達すると、次の城への直接攻撃+2（各自ターン1回・非累積）
  A07: {
    mods: {
      castlePierce(api, ctx) {
        if (!T.arrivedSoldier(api, ctx) || !api.canUse('arm')) return;
        api.consume('arm');
        api.state.vars.a07 = true;
      },
      hitBaseAdd(api, ctx) {
        if (ctx.kind !== 'castle' || !ctx.direct || !api.state.vars.a07) return 0;
        api.state.vars.a07 = false;
        api.trigger();
        return api.params.damage ?? 2;
      },
    },
  },

  // 奥義：城門突破：到達済み味方兵士（城に着いた兵士）の通常攻撃が敵城壁を100%貫通する
  A08: {
    mods: {
      castlePierce(api, ctx) {
        if (!T.arrivedSoldier(api, ctx)) return;
        const v = Math.floor(ctx.amount * (api.params.pierceRatio ?? 1));
        if (v <= 0) return;
        ctx.pierce = (ctx.pierce ?? 0) + v;
        api.trigger({ pierce: v });
      },
    },
  },

  // 総攻撃（読み替え）：手札から城への攻撃魔法を撃ったあと、その相手の城の前のマスにいる進む味方兵士1体が、相手の城を攻撃力ぶん攻撃する
  // （城に着いたときの倍率はかけない。兵士は消えない。城壁は受ける。各自ターン1回）
  A06: {
    on: {
      onSpellCast(api, ev) {
        if (ev.ownerId !== api.playerId || ev.origin !== 'hand' || ev.targetKind !== 'player' || !api.canUse()) return;
        const game = api.game;
        if (!CASTLE_SPELLS.has(game.cardDefs[ev.cardType]?.effect)) return;
        if (!ev.targetPlayerId || !game.players[ev.targetPlayerId]) return;
        const targetSide = game.side(ev.targetPlayerId);
        if (!targetSide || targetSide === game.side(api.playerId)) return;
        const front = game.rules.laneLength - 1;
        const soldier = api.player.soldiers.find((s) => !s.isStationary && s.targetId === targetSide && s.position === front);
        if (!soldier) return;
        const enemy = game.players[targetSide];
        if (!enemy || enemy.castle.isDestroyed || enemy.eliminated) return;
        if (!api.spawnExtra('extraAttack').ok || !api.trigger({ targetId: targetSide, soldierId: soldier.soldierId })) return;
        const amount = game.stageBoost(soldier, game.attackOf(soldier));
        api.as('extraAttack', () => game.damageCastle(enemy, amount, { kind: 'soldier', soldierId: soldier.soldierId }));
        game.checkGameOver();
        api.consume();
      },
    },
  },
};
