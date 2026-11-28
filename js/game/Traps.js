// 罠（クラシック。CLAUDE.md「罠」）。Game のメソッドとして使う（Game.js の最後で Game.prototype に足す）。
// DOM は使わない。数値は data/（rules.json の trap* と、cards.json の kind: "trap" のカード）から読む。
//
// - 罠は、自分の側の道のマス（自分の城から数えて 1〜trapSquares。道のマス0＝城の前と、真ん中より先には置けない）に置く
// - 相手の兵士が進軍でそのマスに入る（通り過ぎるときも）と発動し、兵士はそこで止まる。発動した罠は消える
// - 相手には見えない：罠のイベント（trapSet / trapRemoved（expired など）/ trapMoved）には持ち主の陣地 stealth を付ける
//   （visibility.js が同じ陣地でない人には送らない）。発動（trapTriggered と、そのときの trapRemoved）はだれにでも見える
// - 忍者（見えない兵士）では発動しない。魔物でも発動しない。広場（3人以上の roadLayout "plaza"）には置けない

/** 罠を使うときの決まり（rules に書かなければこの値） */
export const TRAP_DEFAULTS = { trapsPerTurn: 1, trapMax: 3, trapStay: 3 };

export const TrapMethods = {
  /** 罠の数値（rules の trapsPerTurn・trapMax・trapStay・trapSquares） */
  trapRules() {
    const r = this.rules;
    return {
      perTurn: r.trapsPerTurn ?? TRAP_DEFAULTS.trapsPerTurn,
      max: r.trapMax ?? TRAP_DEFAULTS.trapMax,
      stay: r.trapStay ?? TRAP_DEFAULTS.trapStay,
      squares: r.trapSquares ?? Math.floor(r.laneLength / 2),
    };
  },

  /** 同じ陣地（チーム戦なら城を共有するメンバー）の罠すべて */
  sideTraps(sideId) {
    return this.playerOrder.filter((id) => this.side(id) === sideId).flatMap((id) => this.players[id].traps.map((trap) => ({ owner: this.players[id], trap })));
  },

  /**
   * player が罠を置けるマス { roadId, square } の一覧（同じ陣地の罠がないマス）。広場では空。
   * except：その罠のマスは空いているものとして数える（罠を動かすとき）
   */
  trapSlots(player, { except = null } = {}) {
    if (this.plaza) return [];
    const mine = this.side(player.id);
    const taken = new Set(this.sideTraps(mine).filter(({ trap }) => trap !== except).map(({ trap }) => `${trap.roadId}@${trap.square}`));
    const { squares } = this.trapRules();
    const out = [];
    for (const road of this.roads) {
      if (!road.players.includes(mine)) continue;
      for (let square = 1; square <= squares; square += 1) {
        if (!taken.has(`${road.roadId}@${square}`)) out.push({ roadId: road.roadId, square });
      }
    }
    return out;
  },

  /** 罠のカードの対象（listTargets から呼ぶ） */
  trapTargets(player) {
    if (this.plaza) return { targets: [], reason: '広場の道には罠を置けません' };
    const { max } = this.trapRules();
    if (player.traps.length >= max) return { targets: [], reason: `罠は${max}つまでしか置けません` };
    return { targets: this.trapSlots(player), reason: '罠を置ける空いたマスがありません' };
  },

  /**
   * 罠を置く。置けなければ null（上限・マスが埋まっている）。
   * @param {object} def 罠の中身（cards.json の罠のカード。スキルの一時罠は { name, damage, ... }）
   * @param {{generated?: boolean, fromHand?: boolean, noRegen?: boolean, stay?: number, cardId?: string, source?: string}} opts
   *   generated：スキルが作った罠（再設置しない）／fromHand：手札から置いた罠／source：作ったスキルのID
   */
  placeTrap(player, type, def, roadId, square, { generated = false, fromHand = false, noRegen = false, stay, cardId = null, source = null } = {}) {
    const rules = this.trapRules();
    if (player.traps.length >= rules.max) return null;
    if (!this.trapSlots(player).some((s) => s.roadId === roadId && s.square === square)) return null;
    const trap = {
      trapId: `t${String(this.nextTrapNumber++).padStart(2, '0')}`,
      type,
      name: def.name,
      damage: def.damage ?? 0,
      freeze: def.freeze ?? 0,
      element: def.element ?? null,
      roadId,
      square,
      turnsLeft: stay ?? def.stay ?? rules.stay,
      generated,
      fromHand,
      noRegen: noRegen || generated,
      cardId,
      source,
    };
    player.traps.push(trap);
    this.emit('trapSet', {
      playerId: player.id, trapId: trap.trapId, type, name: trap.name, roadId, square, turns: trap.turnsLeft,
      generated, fromHand, ...(source ? { source } : {}), stealth: this.side(player.id),
    });
    return trap;
  },

  /** 罠を取り除く。reason が "triggered"（発動した）ならだれにでも見える。ほか（expired・eliminated・roadClosed）は持ち主の陣地だけ */
  removeTrap(player, trap, reason) {
    const i = player.traps.indexOf(trap);
    if (i === -1) return;
    player.traps.splice(i, 1);
    this.emit('trapRemoved', {
      playerId: player.id, trapId: trap.trapId, type: trap.type, reason, roadId: trap.roadId, square: trap.square,
      generated: trap.generated, fromHand: trap.fromHand, noRegen: trap.noRegen,
      ...(reason === 'triggered' ? {} : { stealth: this.side(player.id) }),
    });
  },

  /** 罠を動かす（スキルの伏兵配置）。動かせたら true */
  moveTrap(player, trap, roadId, square) {
    if (!player.traps.includes(trap)) return false;
    if (!this.trapSlots(player, { except: trap }).some((s) => s.roadId === roadId && s.square === square)) return false;
    const fromRoadId = trap.roadId;
    const fromSquare = trap.square;
    trap.roadId = roadId;
    trap.square = square;
    this.emit('trapMoved', { playerId: player.id, trapId: trap.trapId, fromRoadId, fromSquare, roadId, square, stealth: this.side(player.id) });
    return true;
  },

  /** 持ち主のターンの始め：残りを1減らし、0で消える（expired） */
  tickTraps(player) {
    for (const trap of [...player.traps]) {
      trap.turnsLeft -= 1;
      if (trap.turnsLeft <= 0) this.removeTrap(player, trap, 'expired');
    }
  },

  /** 道がなくなった（roadClosed）・持ち主が抜けたとき */
  clearTraps(player, reason, roadId = null) {
    for (const trap of [...player.traps]) if (roadId === null || trap.roadId === roadId) this.removeTrap(player, trap, reason);
  },

  /**
   * 進軍で owner の兵士 soldier が今のマスに入ったとき、そこにある罠（相手の陣地の罠）。なければ null。
   * 罠は「soldier が狙っている陣地」の罠で、同じ道・同じマス（持ち主の城から数えた位置）のもの
   */
  trapAt(owner, soldier) {
    if (this.plaza || soldier.stealth || !this.trapsOn) return null;
    const square = this.rules.laneLength - 1 - soldier.position;
    if (square < 1) return null;
    for (const { owner: trapOwner, trap } of this.sideTraps(soldier.targetId)) {
      if (trapOwner.eliminated || this.side(trapOwner.id) === this.side(owner.id)) continue;
      if (trap.roadId === soldier.roadId && trap.square === square) return { trapOwner, trap };
    }
    return null;
  },

  /** 罠を発動させてよい相手か（生きていて、見える相手の兵士） */
  trapCanHit(trapOwner, victimOwner, victim) {
    return victimOwner.soldiers.includes(victim) && !victim.stealth && this.side(trapOwner.id) !== this.side(victimOwner.id);
  },

  /**
   * 罠が発動する：trapTriggered → ダメージ（soldierDamaged の cause "trap"。盾が先に受ける。会心はない）→（生き残れば）凍結 → 属性の付着・反応
   * → trapRemoved（"triggered"）。chained：ほかの罠につられて発動した（連鎖起爆）。発動したら true
   */
  triggerTrap(trapOwner, trap, victimOwner, victim, { chained = false } = {}) {
    if (!trapOwner.traps.includes(trap) || !this.trapCanHit(trapOwner, victimOwner, victim)) return false;
    this.emit('trapTriggered', {
      playerId: trapOwner.id, trapId: trap.trapId, type: trap.type, name: trap.name, roadId: trap.roadId, square: trap.square,
      victimId: victimOwner.id, soldierId: victim.soldierId, damage: trap.damage, freeze: trap.freeze, element: trap.element,
      generated: trap.generated, fromHand: trap.fromHand, ...(chained ? { chained: true } : {}),
    });
    const apply = () => {
      if (trap.damage > 0 && this.damageSoldier(victimOwner, victim, trap.damage, 'trap')) return;
      if (trap.freeze > 0 && victim.frozen < trap.freeze && !this.wardsStatus(victim)) {
        victim.frozen = trap.freeze;
        this.emit('statusApplied', { playerId: victimOwner.id, soldierId: victim.soldierId, status: 'frozen', turns: victim.frozen });
      }
      if (trap.element) this.elementHit(victimOwner, victim, trap.element, { damage: trap.damage, by: trapOwner });
    };
    if (this.skillRt) this.skillRt.withOrigin('trap', trap.source, null, apply, trapOwner.id);
    else apply();
    this.removeTrap(trapOwner, trap, 'triggered');
    return true;
  },

  /** getState に足す罠のキー（罠を使うゲームだけ）。罠の中身は同じ陣地の人にだけ見せる。数はだれにでも */
  trapState(p, viewerId) {
    const sees = viewerId && this.players[viewerId] && this.side(viewerId) === this.side(p.id);
    return {
      trapCount: p.traps.length,
      traps: sees
        ? p.traps.map((t) => ({ trapId: t.trapId, type: t.type, name: t.name, roadId: t.roadId, square: t.square, turnsLeft: t.turnsLeft, damage: t.damage, freeze: t.freeze, element: t.element, generated: t.generated }))
        : null,
    };
  },
};
