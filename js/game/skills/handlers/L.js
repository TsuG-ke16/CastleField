// 系統 L（幸運）のスキル効果ハンドラ。L01・L02・L03・L08 は基盤（Luck.js）が直接実装している（ここには書かない）。
// 書き方は docs/skilltree-200-progress.md の段階B「ハンドラ登録APIの書き方」。

export default {
  // L04 奇跡の一枚：自ターン開始時 10% で追加ドロー1枚（手札が満杯なら判定しない）
  L04: {
    on: {
      onTurnStart: {
        stage: 'resource',
        fn(api, ev) {
          if (ev.ownerId !== api.playerId) return;
          if (api.player.hand.length >= api.player.maxHand) return;
          if (!api.roll(api.params.chance ?? 0.1)) return;
          if (!api.trigger()) return;
          api.drawExtra(api.params.draw ?? 1);
        },
      },
    },
  },

  // L05 天の恵み：手札からのカード使用時 5% で、実際に消費したMPを全部戻す（各自ターン1回。MPを払っていなければ判定しない）
  L05: {
    on: {
      onCardPlayed: {
        stage: 'resource',
        fn(api, ev) {
          if (ev.ownerId !== api.playerId || !(ev.mpPaid > 0) || !api.canUse()) return;
          if (!api.roll(api.params.chance ?? 0.05)) return;
          if (!api.trigger({ cardId: ev.sourceCardId, amount: ev.mpPaid })) return;
          api.consume();
          api.mp(ev.mpPaid);
        },
      },
    },
  },

  // L06 幸運の賽：自分の手札からのサイコロカードの出目を独立に2回生成し、片方を選ぶ（出目そのものは幸運の対象外）。
  // 選び方：playCard の第3引数 skillOptions.diceChoice（"first" / "second" / "high" / "low"）。渡さなければ大きい方（CPU・headless の決定論的なフォールバック。
  // クラシックのサイコロの効果はどれも出目が大きいほど得）。Game.rollDice / rollGodDice のフック（Runtime.diceValue → mods "diceValue"）
  L06: {
    mods: {
      diceValue(api, ctx) {
        if (!ctx.fromHand || ctx.done) return;
        const first = ctx.value;
        const second = ctx.reroll();
        // 手札1枚ごとの指定（skillOptions.diceChoice）→ 本人の設定（setSkillPrefs の L06.diceChoice）→ 大きい方
        const choice = ctx.options?.diceChoice ?? api.pref('diceChoice', 'high');
        let value;
        if (choice === 'first') value = first;
        else if (choice === 'second') value = second;
        else if (choice === 'low') value = Math.min(first, second);
        else value = Math.max(first, second);
        ctx.value = value;
        ctx.done = true;
        ctx.rolls = [first, second];
        api.trigger({ cardId: ctx.card?.cardId ?? null, rolls: [first, second], value, choice });
      },
    },
  },

  // L07 幸運の反動：幸運対象判定の最終失敗が自ターン内で3回に達すると MP+1（各自ターン1回）。数えるのは Luck.js（luckFailsThisTurn）
  L07: {
    mods: {
      luckFinalFail(api) {
        if (api.game.currentPlayer !== api.playerId) return;
        if (api.state.luckFailsThisTurn < (api.params.failures ?? 3) || !api.canUse()) return;
        if (!api.trigger({ failures: api.state.luckFailsThisTurn })) return;
        api.consume();
        api.mp(api.params.mp ?? 1);
      },
    },
  },
};
