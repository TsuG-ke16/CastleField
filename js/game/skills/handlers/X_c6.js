// 横断ノード（罠と、読み替えた X06）：X06 戦士の遺産・X23 死者の地雷・X42 伏兵配置。
// 罠は js/game/Traps.js。読み替えは人間に確認して決めた（CLAUDE.md「罠」）。

/** X06：受け継ぐ武器（死んだ区間を覚える。次の自分のターンが終わるまで有効） */
function legacyOf(api) {
  const v = api.state.vars.x06;
  if (!v) return null;
  // 倒れた区間の次の区間（＝次の自分のターン）が終わったら消える
  if (api.state.interval > v.interval + 1) {
    api.state.vars.x06 = null;
    return null;
  }
  return v;
}

/** X42：罠を動かせる先（となりのレーンの同じマスで、空いているところ） */
function trapMoves(game, player) {
  const out = [];
  for (const trap of player.traps) {
    const road = game.findRoad(trap.roadId);
    if (!road) continue;
    const slots = game.trapSlots(player, { except: trap });
    for (const r of game.roads) {
      if (r.players[0] !== road.players[0] || r.players[1] !== road.players[1] || Math.abs(r.lane - road.lane) !== 1) continue;
      if (slots.some((s) => s.roadId === r.roadId && s.square === trap.square)) out.push({ trap, road: r });
    }
  }
  return out;
}

export default {
  // 戦士の遺産（読み替え）：手札から出した味方兵士（トークンでない）が武器を持ったまま倒れたら、その武器（攻撃の加算の合計と属性）を、
  // 次に手札から出す兵士が受け継ぐ。次の自分のターンが終わるまでに出さなければ消える（各自ターン1回。固有能力＝武器）
  X06: {
    on: {
      onUnitDeath(api, ev) {
        if (ev.ownerId !== api.playerId || ev.snapshot?.token || !ev.snapshot?.weapon) return;
        api.state.vars.x06 = {
          interval: api.state.interval, weapon: ev.snapshot.weapon, bonus: ev.snapshot.weaponBonus ?? 0, element: ev.snapshot.weaponElement ?? null, from: ev.snapshot.soldierId,
        };
      },
      onSummon(api, ev) {
        if (ev.ownerId !== api.playerId || ev.origin !== 'hand' || ev.token) return;
        const legacy = legacyOf(api);
        if (!legacy || !api.canUse()) return;
        const soldier = api.player.soldiers.find((s) => s.soldierId === ev.targetId);
        if (!soldier || !api.trigger({ targetId: soldier.soldierId, from: legacy.from })) return;
        api.state.vars.x06 = null;
        soldier.weaponBonus += legacy.bonus;
        soldier.weapon = legacy.weapon;
        if (legacy.element) soldier.element = legacy.element;
        api.as('skillActive', () => api.game.emit('weaponEquipped', {
          playerId: api.playerId, soldierId: soldier.soldierId, type: legacy.weapon, attack: soldier.attack, element: soldier.element, legacy: true,
        }));
        api.consume();
      },
    },
  },

  // 死者の地雷：トークンでない味方兵士が倒れたら、その兵士の道で、倒れたマスにいちばん近い置けるマスに一時罠（入った敵に固定2ダメージ）を作る（各自ターン1回）
  X23: {
    on: {
      onUnitDeath(api, ev) {
        if (ev.ownerId !== api.playerId || ev.snapshot?.token || !api.canUse()) return;
        const game = api.game;
        const { roadId, position } = ev.snapshot;
        const slots = game.trapSlots(api.player).filter((s) => s.roadId === roadId);
        if (slots.length === 0 || api.player.traps.length >= game.trapRules().max) return;
        // 近い順。同じ近さなら相手の城に近い方（倒れた兵士が向かっていた方）
        slots.sort((a, b) => Math.abs(a.square - position) - Math.abs(b.square - position) || b.square - a.square);
        const slot = slots[0];
        if (!api.trigger({ roadId, square: slot.square })) return;
        const def = { name: '死者の地雷', damage: api.params.damage ?? 2 };
        api.as('skillActive', () => game.placeTrap(api.player, 'deadMine', def, roadId, slot.square, { generated: true, noRegen: true, source: 'X23' }));
        api.consume();
      },
    },
  },

  // 伏兵配置：メイン行動中、自分の罠1つを、となりのレーンの同じマス（空いているところ）へ移す（各自ターン1回）
  X42: {
    actions: {
      X42: {
        label: '伏兵配置（罠を隣のレーンへ）',
        list(api) {
          return trapMoves(api.game, api.player).map(({ trap, road }) => ({
            args: { trapId: trap.trapId, roadId: road.roadId },
            label: `${trap.name}（${trap.square}マス目）を${road.lane + 1}番レーンへ`,
          }));
        },
        check(api, args) {
          const found = trapMoves(api.game, api.player).find(({ trap, road }) => trap.trapId === args?.trapId && road.roadId === args?.roadId);
          if (!found) return { ok: false, reason: '動かせる罠と、となりのレーンの空いたマスを選んでください' };
          return { ok: true, cost: {}, preview: { trapId: found.trap.trapId, roadId: found.road.roadId, square: found.trap.square } };
        },
        run(api, args) {
          const found = trapMoves(api.game, api.player).find(({ trap, road }) => trap.trapId === args?.trapId && road.roadId === args?.roadId);
          if (!found) return { ok: false, reason: '動かせる罠と、となりのレーンの空いたマスを選んでください' };
          api.game.moveTrap(api.player, found.trap, found.road.roadId, found.trap.square);
          return { trapId: found.trap.trapId, roadId: found.road.roadId };
        },
      },
    },
  },
};
