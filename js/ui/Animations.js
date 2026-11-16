// Game のイベントを1つずつ演出する。
// 演出しながら「表示用の状態（model）」も進める。最後に main.js が getState() で答え合わせをする。
// 画面をタップすると skip() が呼ばれ、残りの演出は一瞬で終わる。

import { UI_CONFIG, scaled } from './config.js';
import { ELEMENT_LOOK, STATUS_ICON, ICON, SPELL_TINT, GLOW, upgradeIcon } from './look.js';
import { sound } from './Sound.js';
import { cardArt, icon, imageArt } from './art.js';

const $ = (id) => document.getElementById(id);

export class Animations {
  /**
   * @param {{ renderer: import('./Renderer.js').Renderer,
   *           handView: import('./HandView.js').HandView,
   *           cards: object, rules: object, monsters?: object, upgrades?: object }} opts
   */
  constructor({ renderer, handView, cards, rules, monsters = null, upgrades = null, rarities = null }) {
    this.renderer = renderer;
    this.handView = handView;
    this.cards = cards;
    this.rules = rules;
    this.monsterDefs = monsters;
    this.upgradeDefs = upgrades;
    this.rarities = rarities;
    this.skipping = false;
    this.timers = new Set();     // 待っている delay
    this.running = new Set();    // 動いている Web Animation
    this.el = { app: $('app'), board: $('board'), fx: $('fx-layer') };
    this.applyCssTiming();
  }

  /** config の時間を CSS 変数に反映する */
  applyCssTiming() {
    const t = UI_CONFIG.timing;
    const root = document.documentElement.style;
    root.setProperty('--t-move', `${t.soldierMove * UI_CONFIG.speed}ms`);
    root.setProperty('--t-deploy', `${t.deploy * UI_CONFIG.speed}ms`);
    root.setProperty('--t-death', `${t.soldierDeath * UI_CONFIG.speed}ms`);
    root.setProperty('--t-heal', `${t.heal * UI_CONFIG.speed}ms`);
    root.setProperty('--t-equip', `${t.equip * UI_CONFIG.speed}ms`);
  }

  // ---------- 飛ばす ----------

  skip() {
    if (this.skipping) return;
    this.skipping = true;
    sound.enabled = false; // 飛ばしているあいだは鳴らさない
    this.el.app.classList.add('skipping');
    for (const a of [...this.running]) {
      try { a.finish(); } catch { a.cancel(); }
    }
    // 兵士の移動・HPバーなど CSS の動きも終わらせる
    for (const a of document.getAnimations()) {
      if (a instanceof CSSTransition) a.finish();
    }
    for (const t of [...this.timers]) t.done();
  }

  endSkip() {
    this.skipping = false;
    sound.enabled = true;
    this.el.app.classList.remove('skipping');
  }

  // ---------- 基本の道具 ----------

  /** ms 待つ（speed 倍率つき。飛ばしているときはすぐ終わる） */
  delay(ms) {
    if (this.skipping || ms <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      const t = {
        id: setTimeout(() => t.done(), ms * UI_CONFIG.speed),
        done: () => { clearTimeout(t.id); this.timers.delete(t); resolve(); },
      };
      this.timers.add(t);
    });
  }

  /** Web Animations API のラッパー。終わったら resolve。飛ばしているときは何もしない */
  animate(el, keyframes, { duration, ...opts }) {
    if (this.skipping) return Promise.resolve();
    const a = el.animate(keyframes, { duration: duration * UI_CONFIG.speed, ...opts });
    this.running.add(a);
    const end = () => this.running.delete(a);
    return a.finished.then(end, end);
  }

  /** ヒットストップ：動いているものをすべて止めて、少し待つ */
  async hitstop(ms) {
    if (this.skipping || ms <= 0) return;
    const paused = document.getAnimations().filter((a) => a.playState === 'running');
    paused.forEach((a) => a.pause());
    await this.delay(ms);
    paused.forEach((a) => { if (a.playState === 'paused') a.play(); });
  }

  shake(el, amplitude, duration) {
    const frames = [];
    const n = 8;
    for (let i = 0; i <= n; i++) {
      const k = 1 - i / n;
      const x = (i % 2 ? 1 : -1) * amplitude * k * (0.6 + Math.random() * 0.4);
      const y = (Math.random() - 0.5) * amplitude * k * 0.6;
      frames.push({ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)` });
    }
    frames[n] = { transform: 'translate(0, 0)' };
    return this.animate(el, frames, { duration, easing: 'linear' });
  }

  /** el の中心（#app の中の座標） */
  centerOf(el) {
    const app = this.el.app.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: r.left - app.left + r.width / 2, y: r.top - app.top + r.height / 2 };
  }

  fx(className, { x, y } = {}) {
    const el = document.createElement('div');
    el.className = className;
    const sprites = { 'fx-fireball': 'fireball', 'fx-burst': 'explosion', 'fx-bolt': 'lightning', 'fx-heal-sprite': 'heal' };
    if (sprites[className]) {
      el.classList.add('sprite-fx');
      el.innerHTML = imageArt(`fx/${sprites[className]}.png`, '', 'art');
    }
    if (x != null) el.style.left = `${x}px`;
    if (y != null) el.style.top = `${y}px`;
    this.el.fx.appendChild(el);
    return el;
  }

  /** 大きな数字を出す（待たない） */
  number(targetEl, text, { size, duration, kind = 'damage', dy = 0 }) {
    if (this.skipping) return;
    const c = this.centerOf(targetEl);
    const x = c.x;
    const y = c.y + dy;
    const el = this.fx(`fx-number ${kind}${size < 30 ? ' small' : ''}`, { x, y });
    el.textContent = text;
    el.style.fontSize = `${size}px`;
    const base = 'translate(-50%, -50%)';
    this.animate(el, [
      { transform: `${base} scale(2.4)`, opacity: 0 },
      { transform: `${base} scale(1)`, opacity: 1, offset: 0.12 },
      { transform: `${base} translateY(-8px) scale(1)`, opacity: 1, offset: 0.7 },
      { transform: `${base} translateY(-36px) scale(0.9)`, opacity: 0 },
    ], { duration, easing: 'ease-out', fill: 'forwards' }).then(() => el.remove());
  }

  flashClass(el, className, ms) {
    el.classList.add(className);
    return this.delay(ms).then(() => el.classList.remove(className));
  }

  banner(text, ms, variant = '') {
    if (this.skipping) return Promise.resolve();
    const el = this.fx(`fx-banner ${variant}`.trim());
    el.textContent = text;
    return this.animate(el, [
      { transform: 'scale(1.6)', opacity: 0 },
      { transform: 'scale(1)', opacity: 1, offset: 0.2 },
      { transform: 'scale(1)', opacity: 1, offset: 0.75 },
      { transform: 'scale(0.95)', opacity: 0 },
    ], { duration: ms, fill: 'forwards' }).then(() => el.remove());
  }

  /** 火花・かけらを飛び散らせる（待たない） */
  sparks({ x, y }, { count = 8, color = '#ffd93b', spread = 60, size = 8 } = {}) {
    if (this.skipping) return;
    for (let i = 0; i < count; i++) {
      const el = this.fx('fx-spark', { x, y });
      el.style.background = color;
      el.style.width = el.style.height = `${size * (0.6 + Math.random() * 0.8)}px`;
      const a = Math.random() * Math.PI * 2;
      const d = spread * (0.5 + Math.random() * 0.7);
      this.animate(el, [
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d + 20}px)) scale(0.2) rotate(${Math.random() * 360}deg)`, opacity: 0 },
      ], { duration: 380 + Math.random() * 220, easing: 'cubic-bezier(.2, .7, .4, 1)', fill: 'forwards' }).then(() => el.remove());
    }
  }

  /** 画面全体を一瞬光らせる（決着の一撃） */
  screenFlash(color = '#fff', ms = 420) {
    if (this.skipping) return;
    const el = this.fx('fx-flash');
    el.style.background = color;
    this.animate(el, [{ opacity: 0.85 }, { opacity: 0 }], { duration: ms, easing: 'ease-out', fill: 'forwards' }).then(() => el.remove());
  }

  // ---------- イベントの再生 ----------

  /**
   * イベントを1つ演出する。連続する進軍・ダメージは queue から取り出してまとめて動かす。
   * @param {{type:string,payload:object}} ev
   * @param {{type:string,payload:object}[]} queue まだ演出していないイベント
   * @param {object} model 表示用の状態（ここで進める）
   * @param {{ viewerId: string, lookupCard: (cardId:string)=>object|null }} ctx
   */
  async play(ev, queue, model, ctx) {
    const p = ev.payload ?? {};
    switch (ev.type) {
      case 'turnStarted':
        model.turn = p.turn;
        model.currentPlayer = p.playerId;
        for (const pl of Object.values(model.players)) {
          pl.playedThisTurn = false;
          pl.cardsPlayedThisTurn = 0;
        }
        this.renderer.setTurnInfo(p.turn, model.round);
        this.renderer.setCurrentPlayer(p.playerId);
        return;
      case 'roundStarted': return this.roundStarted(p, model);
      case 'cardsFused': return this.cardsFused(p, model, ctx);
      case 'cardDrawn': return this.cardDrawn(p, model, ctx);
      case 'deckShuffled':
        // drawCardsはシャッフル前に引いた分も最後のcardDrawnにまとめる。
        model.preShuffleDraws = (model.preShuffleDraws ?? 0) + model.deckCount;
        model.deckCount = p.deckCount;
        model.discardCount = 0;
        this.renderer.setPiles(model.deckCount, model.discardCount, { bumpDeck: true });
        sound.play('shuffle');
        this.banner('山札をシャッフル！', UI_CONFIG.timing.shuffle, 'small');
        return this.delay(UI_CONFIG.timing.shuffle * 0.6);
      case 'cardPlayed': return this.cardPlayed(p, model, ctx);
      case 'discardRequired':
        model.phase = 'discard';
        model.discardRequired = p.count;
        return;
      case 'cardDiscarded': return this.cardDiscarded(p, model, ctx);
      case 'soldierDeployed': return this.soldierDeployed(p, model);
      case 'soldierShot': return this.soldierShot(p, model);
      case 'soldierMoved': return this.soldiersMoved(ev, queue, model);
      case 'soldiersClashed': return this.soldiersClashed(p);
      case 'soldierDamaged': return this.soldiersDamaged(ev, queue, model);
      case 'soldierDestroyed': return this.soldiersDestroyed(ev, queue, model);
      case 'spellCast': return this.spellCast(p);
      case 'castleDamaged': return this.castleDamaged(p, model);
      case 'castleHealed': return this.castleHealed(p, model);
      case 'weaponEquipped': return this.weaponEquipped(p, model);
      case 'shieldAdded': return this.shieldAdded(p, model);
      case 'defenseRequested':
        model.phase = 'defend';
        if (p.defenderId === ctx.viewerId) this.banner('防御のチャンス！', 700, 'turn mine');
        return this.delay(p.defenderId === ctx.viewerId ? 500 : 150);
      case 'defenseEnded':
        model.phase = 'main';
        return undefined;
      case 'spiritSummoned': return this.spiritSummoned(p, model);
      case 'spiritTriggered': return this.spiritTriggered(p);
      case 'spiritEnded': return this.spiritEnded(p, model);
      case 'spellReflected': return this.spellReflected();
      case 'soldierDecoyed': return this.soldierDecoyed();
      case 'cardStolen': return this.cardStolen(p, model, ctx);
      case 'castleArmored': return this.castleArmored(p, model);
      case 'armorExpired': return this.armorExpired(p, model);
      case 'statusApplied': return this.statusesApplied(ev, queue, model);
      case 'statusCleared': return this.statusCleared(p, model);
      case 'monsterAppeared': return this.monsterAppeared(p, model);
      case 'monsterAttackedCastle': return this.monsterAttackedCastle(p, model);
      case 'monsterClashed': return this.monsterClashed(p);
      case 'monsterDamaged': return this.monsterDamaged(p, model);
      case 'monsterDefeated': return this.monsterDefeated(p, model);
      case 'coinsChanged': return this.coinsChanged(p, model);
      case 'upgradeBought': return this.upgradeBought(p, model);
      case 'soldierBuffed': return this.soldiersBuffed(ev, queue, model);
      case 'gameOver':
        model.phase = 'gameOver';
        model.winner = p.winner;
        model.winnerTeam = p.winnerTeam;
        model.gameOverReason = p.reason ?? null;
        return;
      default:
        // 知らないイベント（3人以上の playerEliminated など）は演出しない。最後に getState() で合わせる
        return;
    }
  }

  /** first と、そのあとに続けて来た同じ種類のイベントを queue から取り出し、ペイロードの配列で返す */
  takeRun(first, queue) {
    const list = [first.payload];
    while (queue[0]?.type === first.type) list.push(queue.shift().payload);
    return list;
  }

  /** 表示用の状態の兵士を探す */
  modelSoldier(model, playerId, soldierId) {
    return model.players[playerId]?.soldiers.find((x) => x.soldierId === soldierId) ?? null;
  }

  modelMonster(model, monsterId) {
    return model.monsters?.find((m) => m.monsterId === monsterId) ?? null;
  }

  /** 2つの要素の間に「ぶつかった」印を出す */
  async clashBetween(aEl, bEl) {
    if (this.skipping || !aEl || !bEl) return;
    const a = this.centerOf(aEl);
    const b = this.centerOf(bEl);
    sound.play('clash');
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    this.sparks(mid, { count: 6, spread: 34, size: 6 });
    const mark = this.fx('fx-clash', mid);
    mark.innerHTML = imageArt('fx/dust.png', ICON.clash, 'art');
    const dur = UI_CONFIG.timing.clash;
    this.animate(mark, [
      { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0 },
      { transform: 'translate(-50%, -50%) scale(1.4)', opacity: 1, offset: 0.35 },
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 },
    ], { duration: dur * 1.6, easing: 'ease-out', fill: 'forwards' }).then(() => mark.remove());
    // おたがいに少し前へ飛び出す
    const lunge = (el, to, from) => {
      const dx = (to.x - from.x) * 0.25;
      const dy = (to.y - from.y) * 0.25;
      const token = el.querySelector('.soldier-token, .monster-token') ?? el;
      return this.animate(token, [
        { transform: 'translate(0, 0)' },
        { transform: `translate(${dx}px, ${dy}px)`, offset: 0.4 },
        { transform: 'translate(0, 0)' },
      ], { duration: dur, easing: 'ease-out' });
    };
    await Promise.all([lunge(aEl, b, a), lunge(bEl, a, b)]);
  }

  soldiersClashed({ attacker, defender }) {
    return this.clashBetween(this.renderer.soldierEl(attacker?.soldierId), this.renderer.soldierEl(defender?.soldierId));
  }

  monsterClashed({ attacker, monsterId }) {
    return this.clashBetween(this.renderer.soldierEl(attacker?.soldierId), this.renderer.monsterEl(monsterId));
  }

  async roundStarted({ round }, model) {
    model.round = round;
    // 魔物の「城を攻めるまで」（attackIn）はイベントに入っていないので、演出のあとの getState で合わせる
    this.renderer.setTurnInfo(model.turn, round);
    if (round <= 1) return;
    this.banner(`${ICON.round} ${round}周目`, UI_CONFIG.timing.round, 'small');
    await this.delay(UI_CONFIG.timing.round * 0.5);
  }

  async cardsFused({ playerId, cardIds, cardId, from, to }, model, ctx) {
    const pl = model.players[playerId];
    pl.handCount = Math.max(0, pl.handCount - 1);
    if (playerId === ctx.viewerId) {
      model.hand = model.hand.filter((c) => !cardIds.includes(c.cardId));
      model.hand.push({ cardId, type: to });
      this.handView.render(model.hand, { newIds: [cardId] });
    } else this.renderer.setOppHandCount(pl.handCount);
    if (this.skipping) return;
    sound.play('equip');
    if (playerId !== ctx.viewerId) { await this.banner('相手がカードを合成！', UI_CONFIG.timing.fusion, 'fusion'); return; }
    const stage = this.fx('fx-fusion-stage', this.centerOf(this.renderer.el.field));
    const rank = this.rarities?.[this.cards[to]?.rarity];
    stage.style.setProperty('--rarity', rank?.color ?? '#d6b354');
    for (const side of [0, 1]) {
      const el = this.effectCard(from, this.cards[from]?.name); stage.append(el);
      this.animate(el, [
        { transform: `translate(${side ? 80 : -80}px, 0) rotate(${side ? 12 : -12}deg)`, opacity: 1 },
        { transform: 'translate(0, 0) scale(.7)', opacity: 1, offset: .45 },
        { transform: 'scale(.2)', opacity: 0, offset: .6 }, { opacity: 0 },
      ], { duration: UI_CONFIG.timing.fusion, fill: 'forwards' });
    }
    const result = this.effectCard(to, this.cards[to]?.name); stage.append(result);
    await this.animate(result, [{ transform: 'scale(.1)', opacity: 0 }, { transform: 'scale(.1)', opacity: 0, offset: .4 }, { transform: 'scale(1.15)', opacity: 1, offset: .65 }, { transform: 'scale(1)', opacity: 1, offset: .85 }, { transform: 'translateY(40px) scale(.6)', opacity: 0 }], { duration: UI_CONFIG.timing.fusion, fill: 'forwards' });
    stage.remove();
  }

  effectCard(type, name) {
    const el = document.createElement('div'); el.className = 'effect-card';
    const art = document.createElement('div'); art.className = 'effect-card-art';
    art.innerHTML = type ? cardArt(type, 'blue', name ?? '') : icon('card');
    const label = document.createElement('b'); label.textContent = name ?? '相手の報酬カード';
    el.append(art, label); return el;
  }

  async revealReward(reward, cardId, ctx) {
    if (this.skipping) return;
    const mine = reward.playerId === ctx.viewerId;
    const card = mine ? ctx.lookupCard(cardId) : null;
    const rarity = this.rarities?.[reward.rarity];
    const rank = Math.max(0, Object.keys(this.rarities ?? {}).indexOf(reward.rarity));
    const cfg = UI_CONFIG.rewardFx;
    const duration = Math.min(cfg.max, cfg.base + rank * cfg.perRank + (reward.lucky ? cfg.luckyExtra : 0));
    const stage = this.fx(`fx-reward-stage${reward.lucky ? ' lucky' : ''}`, this.centerOf(this.renderer.el.field));
    stage.style.setProperty('--rarity', rarity?.color ?? '#d6b354');
    stage.dataset.rarity = reward.rarity;
    const heading = document.createElement('strong'); heading.className = 'reward-heading';
    heading.textContent = reward.lucky ? `ラッキー！ ${this.rarities?.[reward.base]?.name ?? ''} → ${rarity?.name ?? ''}` : `${mine ? 'あなた' : '相手'}が${rarity?.name ?? ''}カード獲得！`;
    stage.append(heading, this.effectCard(card?.type, card ? this.cards[card.type]?.name : '相手の報酬カード'));
    const badge = document.createElement('span'); badge.className = 'reward-rarity'; badge.textContent = rarity?.name ?? ''; stage.append(badge);
    sound.play('equip');
    this.sparks(this.centerOf(this.renderer.el.field), { count: cfg.sparksBase + rank * cfg.sparksPerRank, color: rarity?.color ?? '#ffdf82', spread: 50 + rank * 20, size: 6 + rank });
    if (rank === Object.keys(this.rarities ?? {}).length - 1) this.screenFlash(rarity.color, duration * .4);
    try {
      await this.animate(stage, [{ opacity: 0, transform: 'translate(-50%, -50%) scale(.4)' }, { opacity: 1, transform: 'translate(-50%, -50%) scale(1.08)', offset: .18 }, { opacity: 1, transform: 'translate(-50%, -50%) scale(1)', offset: .8 }, { opacity: 0, transform: `translate(-50%, calc(-50% + ${mine ? 65 : -65}px)) scale(.5)` }], { duration, fill: 'forwards' });
    } finally { stage.remove(); }
  }

  async cardDrawn({ playerId, cardIds }, model, ctx) {
    const pl = model.players[playerId];
    if (pl.pendingReward) {
      const reward = pl.pendingReward; delete pl.pendingReward;
      await this.revealReward(reward, cardIds[0], ctx);
    }
    for (const cardId of cardIds) {
      pl.handCount += 1;
      if (pl.generatedDraws > 0) pl.generatedDraws -= 1;
      else if (pl.luck?.draws > 0) {
        pl.luck.draws -= 1;
        if (!pl.luck.draws) pl.luck = null;
      } else if (model.preShuffleDraws > 0) model.preShuffleDraws -= 1;
      else model.deckCount = Math.max(0, model.deckCount - 1);
      this.renderer.setPiles(model.deckCount, model.discardCount, { bumpDeck: true });
      if (playerId === ctx.viewerId) {
        const card = ctx.lookupCard(cardId);
        if (card) {
          model.hand.push(card);
          this.handView.addCard(card);
          sound.play('draw');
        }
      } else {
        this.renderer.setOppHandCount(pl.handCount);
      }
      await this.delay(UI_CONFIG.timing.draw);
    }
  }

  async cardPlayed({ playerId, cardId, type, free }, model, ctx) {
    const pl = model.players[playerId];
    const def = this.cards[type] ?? {};
    // 神頼みでタダで出したカード（free）は、山札の上から直接出る。手札は減らない
    if (free) model.deckCount = Math.max(0, model.deckCount - 1);
    else pl.handCount = Math.max(0, pl.handCount - 1);
    if (!free && def.kind !== 'weapon' && def.kind !== 'defense') pl.playedThisTurn = true;
    pl.cardsPlayedThisTurn = (pl.cardsPlayedThisTurn ?? 0) + 1;
    if (!def.exhaust) model.discardCount += 1; // 使い切りのカードは捨て札に行かない
    model.hand = model.hand.filter((c) => c.cardId !== cardId);
    let clone;
    let from;
    const app = this.el.app.getBoundingClientRect();
    if (free) {
      // 手札からではなく、画面の上から出てくる
    } else if (playerId === ctx.viewerId) {
      const taken = this.handView.takeCard(cardId);
      // 演出のあいだは手札を暗くしておく（出せるかどうかは、演出のあと main.js が canPlayCard で決め直す）
      this.handView.blockAll();
      if (taken) {
        clone = taken.clone;
        from = { x: taken.rect.left - app.left + taken.rect.width / 2, y: taken.rect.top - app.top + taken.rect.height / 2 };
      }
    } else {
      this.renderer.setOppHandCount(pl.handCount);
    }
    if (!clone) {
      clone = this.handView.makeCardEl({ cardId, type });
      from = { x: app.width / 2, y: 0 };
    }
    this.renderer.setPiles(model.deckCount, model.discardCount, { bumpDiscard: true });
    if (this.skipping) return;
    sound.play('card');

    clone.classList.remove('selected', 'dim', 'new', 'denied', 'drag-source', 'drag-ghost');
    clone.classList.add('fx-card');
    clone.style.left = `${from.x}px`;
    clone.style.top = `${from.y}px`;
    this.el.fx.appendChild(clone);
    const to = this.centerOf(this.renderer.el.field);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const base = 'translate(-50%, -50%)';
    const dur = UI_CONFIG.timing.cardPlay;
    const cardAnimation = this.animate(clone, [
      { transform: `${base} translate(0, 0) scale(1)` },
      { transform: `${base} translate(${dx}px, ${dy}px) scale(1.7)`, offset: 0.35 },
      { transform: `${base} translate(${dx}px, ${dy}px) scale(1.7)`, opacity: 1, offset: 0.75 },
      { transform: `${base} translate(${dx}px, ${dy - 30}px) scale(1.4)`, opacity: 0 },
    ], { duration: dur, easing: 'ease-out', fill: 'forwards' }).then(() => clone.remove());
    // 防御の帯はカードが消えてから見せる。ほかの効果は従来どおり重ねてテンポを保つ。
    if (type === 'reflect' || type === 'decoy') await cardAnimation;
    else await this.delay(dur * 0.7);
  }

  async cardDiscarded({ playerId, cardIds }, model, ctx) {
    const pl = model.players[playerId];
    pl.handCount = Math.max(0, pl.handCount - cardIds.length);
    model.discardCount += cardIds.length;
    model.phase = 'main';
    model.discardRequired = 0;
    model.hand = model.hand.filter((c) => !cardIds.includes(c.cardId));
    if (playerId === ctx.viewerId) {
      this.handView.exitDiscard();
      for (const id of cardIds) this.handView.takeCard(id);
    } else {
      this.renderer.setOppHandCount(pl.handCount);
    }
    this.renderer.setPiles(model.deckCount, model.discardCount, { bumpDiscard: true });
    await this.delay(UI_CONFIG.timing.discard);
  }

  async soldierDeployed({ playerId, soldierId, type, position, hp, attack, roadId, targetId }, model) {
    const def = this.cards[type] ?? {};
    const s = {
      role: def.role ?? 'melee', range: def.range, turnsLeft: def.stay ?? null,
      soldierId, type, hp: hp ?? def.hp, attack: attack ?? def.attack, position, roadId, targetId,
      weapon: null, element: null, shield: 0, statuses: { poison: null, frozen: 0 },
    };
    model.players[playerId].soldiers.push(s);
    this.renderer.addSoldier(playerId, s, { appear: true });
    sound.play('deploy');
    const dEl = this.renderer.soldierEl(soldierId);
    if (dEl && !this.skipping) this.sparks(this.centerOf(dEl), { count: 6, color: '#e9d3a6', spread: 30, size: 9 });
    await this.delay(UI_CONFIG.timing.deploy);
  }

  /** 進軍：ひと続きの進軍はまとめて同時に動かす（城への攻撃はそのあと順番に） */
  async soldiersMoved(first, queue, model) {
    const moves = [first.payload];
    // 戦い・魔物との戦いのイベントをはさんだ先の進軍は、まとめない（ぶつかる前に動いてしまうため）
    const related = new Set(['soldierMoved', 'castleDamaged', 'soldierDestroyed', 'gameOver']);
    for (let i = 0; i < queue.length && related.has(queue[i].type); ) {
      if (queue[i].type === 'soldierMoved') moves.push(queue.splice(i, 1)[0].payload);
      else i++;
    }
    let duration = 0;
    for (const m of moves) {
      const s = model.players[m.playerId].soldiers.find((x) => x.soldierId === m.soldierId);
      if (s) {s.position = m.to; s.place = null;}
      const el = this.renderer.soldierEl(m.soldierId);
      const speed = this.cards[s?.type]?.speed ?? 1;
      const ms = UI_CONFIG.timing.soldierMove * Math.max(.65, Math.abs(m.to-m.from)/Math.max(speed,1));
      duration = Math.max(duration, ms);
      if (el) el.style.transitionDuration = `${ms*UI_CONFIG.speed}ms`;
      this.renderer.moveSoldier(m.soldierId, m.to);
    }
    this.renderer.layoutStacks();
    sound.play('step');
    await this.delay(duration || UI_CONFIG.timing.soldierMove);
    for (const m of moves) this.renderer.soldierEl(m.soldierId)?.style.removeProperty('transition-duration');
  }

  /** 兵士へのダメージ：続けて来たものはまとめて同時に見せる。盾が受けたぶんと毒は見た目を変える */
  async soldiersDamaged(first, queue, model) {
    const hits = this.takeRun(first, queue);
    const cfg = UI_CONFIG.soldierHit;
    const small = UI_CONFIG.smallNumber;
    const shaken = [];
    let anyHit = false;
    let anyBlock = false;
    let anyPoison = false;
    for (const h of hits) {
      const blocked = h.blocked ?? 0;
      const dealt = Math.max(0, (h.amount ?? 0) - blocked);
      const s = this.modelSoldier(model, h.playerId, h.soldierId);
      if (s) {
        s.hp = h.hp;
        s.shield = Math.max(0, (s.shield ?? 0) - blocked);
        // 毒のダメージ1回で、毒の残りが1減る（0になれば statusCleared が来る）。量はここで分かる
        if (h.cause === 'poison' && s.statuses?.poison) {
          s.statuses = { ...s.statuses, poison: { amount: h.amount, turns: s.statuses.poison.turns - 1 } };
        }
      }
      this.renderer.updateSoldier(h.soldierId, { hp: h.hp, shield: s?.shield ?? 0, ...(s ? { statuses: s.statuses } : {}) });
      const el = this.renderer.soldierEl(h.soldierId);
      if (!el) continue;
      const poison = h.cause === 'poison';
      if (dealt > 0) {
        anyHit = true;
        el.classList.add(poison ? 'hit-poison' : 'hit');
        if (poison) anyPoison = true;
        shaken.push(el.querySelector('.soldier-token'));
        this.number(el, `${poison ? STATUS_ICON.poison : ''}-${dealt}`,
          { size: cfg.numberSize, duration: cfg.numberDuration, kind: poison ? 'poison' : 'damage' });
      }
      if (blocked > 0) {
        anyBlock = true;
        el.classList.add('blocked');
        this.number(el, `${ICON.shield}${blocked}`, { size: small.size, duration: small.duration, kind: 'block', dy: dealt > 0 ? -26 : 0 });
      }
    }
    if (anyHit) sound.play(anyPoison ? 'poison' : 'smallHit');
    else if (anyBlock) sound.play('block');
    if (anyHit) await this.hitstop(cfg.hitstop);
    for (const h of hits) this.renderer.soldierEl(h.soldierId)?.classList.remove('hit', 'hit-poison', 'blocked');
    for (const token of shaken) if (token) this.shake(token, cfg.shake, cfg.shakeDuration);
    await this.delay(UI_CONFIG.timing.afterSoldierHit);
  }

  async soldierShot({ playerId, soldierId, role, target }, model) {
    const from = this.renderer.soldierEl(soldierId);
    const to = target.kind === 'soldier' ? this.renderer.soldierEl(target.soldierId)
      : target.kind === 'monster' ? this.renderer.monsterEl(target.monsterId) : this.renderer.castleEl(target.playerId);
    if (!from || !to) return;
    const a = this.centerOf(from), b = this.centerOf(to);
    const projectile = this.fx(role === 'mage' ? 'shot-magic' : 'shot-arrow', a);
    const angle = Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;
    sound.play(role === 'mage' ? 'spell' : 'step');
    await this.animate(projectile, [
      {transform:`translate(-50%,-50%) rotate(${angle}deg)`,opacity:1},
      {transform:`translate(calc(-50% + ${b.x-a.x}px),calc(-50% + ${b.y-a.y}px)) rotate(${angle}deg)`,opacity:1},
    ], {duration:UI_CONFIG.timing.soldierShot,easing:'ease-in',fill:'forwards'});
    projectile.remove();
    const soldier = this.modelSoldier(model,playerId,soldierId);
    if(soldier?.turnsLeft != null) {
      soldier.turnsLeft = Math.max(0,soldier.turnsLeft-1);
      this.renderer.updateSoldier(soldierId,{turnsLeft:soldier.turnsLeft});
    }
  }

  /** 帰還は城へ飛んで消える。倒れた兵士はその場で消える。 */
  async soldiersDestroyed(first, queue, model) {
    const list = this.takeRun(first, queue);
    await Promise.all(list.map(async d => {
      const pl = model.players[d.playerId];
      pl.soldiers = pl.soldiers.filter(x => x.soldierId !== d.soldierId);
      const el = this.renderer.soldierEl(d.soldierId);
      if (el && d.reason === 'returned') {
        const a = this.centerOf(el), b = this.centerOf(this.renderer.castleEl(d.playerId));
        const scale = this.renderer.isPlaza ? this.renderer.plazaScale || 1 : 1;
        b.x = a.x+(b.x-a.x)/scale; b.y = a.y+(b.y-a.y)/scale;
        this.number(el,'帰還！',{kind:'heal',size:20,duration:UI_CONFIG.timing.soldierReturn});
        await this.animate(el,[
          {transform:'translate(-50%,-50%) scale(1)',opacity:1},
          {transform:`translate(calc(-50% + ${b.x-a.x}px),calc(-50% + ${b.y-a.y}px)) scale(.3)`,opacity:0},
        ],{duration:UI_CONFIG.timing.soldierReturn,easing:'ease-in',fill:'forwards'});
      } else {
        el?.classList.add(d.reason === 'reachedCastle' ? 'arrived' : 'dying');
        if (el && d.reason !== 'reachedCastle' && !this.skipping) this.sparks(this.centerOf(el),{count:7,color:'#fff',spread:36,size:9});
        await this.delay(UI_CONFIG.timing.soldierDeath);
      }
      this.renderer.removeSoldier(d.soldierId);
    }));
  }

  async spellCast({ playerId, type, target, targetKind, roadId }) {
    const def = this.cards[type] ?? {};
    if (targetKind === 'monster') {
      const mEl = this.renderer.monsterEl(target);
      if (mEl) return this.projectile(this.renderer.castleEl(playerId), mEl);
      return undefined;
    }
    const enemy = typeof target === 'string' ? target : this.renderer.opponentOf(playerId);
    if (def.effect === 'damageEnemyCastle') return this.fireball(playerId, enemy);
    if (def.effect === 'damageEnemySoldiers') return this.thunder(enemy, roadId);
    if (SPELL_TINT[def.effect]) return this.mist(enemy, SPELL_TINT[def.effect], roadId);
    if (def.effect === 'redrawHand') return this.banner('手札を引き直す！', UI_CONFIG.timing.shuffle, 'small');
    if (def.effect === 'randomEffect') return this.banner('神頼み！', UI_CONFIG.timing.shuffle, 'small');
    if (def.effect === 'stealCard') return this.banner('盗賊！', UI_CONFIG.timing.shuffle, 'small');
    // 回復などは castleHealed 側で見せる
    return undefined;
  }

  /** 精霊を呼ぶ：城のそばにバッジが出る */
  async spiritSummoned({ playerId, type, spirit, amount, turns, targetId }, model) {
    model.players[playerId].spirit = { type, spirit, amount, turns, targetId };
    this.renderer.setSpirit(playerId, model.players[playerId].spirit);
    if (this.skipping) return;
    sound.play('heal');
    this.banner(`${this.cards[type]?.name ?? '精霊'}！`, UI_CONFIG.timing.shuffle, 'small');
    await this.delay(UI_CONFIG.timing.shuffle * 0.8);
  }

  /** 精霊が効く（このあと castleDamaged / castleHealed） */
  async spiritTriggered({ type }) {
    if (this.skipping) return;
    this.banner(`${this.cards[type]?.name ?? '精霊'}`, UI_CONFIG.timing.shuffle * 0.7, 'small');
    await this.delay(UI_CONFIG.timing.shuffle * 0.4);
  }

  async spiritEnded({ playerId }, model) {
    model.players[playerId].spirit = null;
    this.renderer.setSpirit(playerId, null);
  }

  /** 反射：撃たれた魔法が、撃った人の城に返る（このあと castleDamaged） */
  async spellReflected() {
    if (this.skipping) return;
    sound.play('block');
    await this.banner('反射！', UI_CONFIG.timing.defenseResult, 'defense-result');
  }

  /** 身代わり：城に着いた兵士のダメージが消える（このあと兵士が消える） */
  async soldierDecoyed() {
    if (this.skipping) return;
    sound.play('block');
    await this.banner('身代わり！', UI_CONFIG.timing.defenseResult, 'defense-result');
  }

  /** 盗賊：相手の手札から1枚奪う。自分が奪われたら手札から消え、奪ったら手札に入る */
  async cardStolen({ playerId, victimId, cardId }, model, ctx) {
    model.players[playerId].handCount += 1;
    model.players[victimId].handCount = Math.max(0, model.players[victimId].handCount - 1);
    if (victimId === ctx.viewerId) {
      model.hand = model.hand.filter((c) => c.cardId !== cardId);
      this.handView.takeCard(cardId);
    } else {
      this.renderer.setOppHandCount(model.players[victimId].handCount);
    }
    if (playerId === ctx.viewerId) {
      const card = ctx.lookupCard(cardId);
      if (card) {
        model.hand.push(card);
        this.handView.addCard(card);
        sound.play('draw');
      }
    } else {
      this.renderer.setOppHandCount(model.players[playerId].handCount);
    }
    await this.delay(UI_CONFIG.timing.draw * 3);
  }

  /** 毒の霧・氷の息：相手の兵士の列に色のついた霧をかける */
  async mist(_targetId, color, roadId) {
    if (this.skipping) return;
    sound.play(color === SPELL_TINT.freezeEnemySoldiers ? 'freeze' : 'poison');
    const app = this.el.app.getBoundingClientRect();
    const r = this.renderer.laneEl(roadId).getBoundingClientRect(); // レーンを選んだ魔法は、その道だけに霧をかける
    const fog = this.fx('fx-mist');
    fog.innerHTML = imageArt(`fx/${color === SPELL_TINT.freezeEnemySoldiers ? 'ice' : 'poison'}.png`, '', 'art');
    fog.style.left = `${r.left - app.left}px`;
    fog.style.top = `${r.top - app.top}px`;
    fog.style.width = `${r.width}px`;
    fog.style.height = `${r.height}px`;
    fog.style.background = `radial-gradient(ellipse at 50% 50%, ${color}, transparent 75%)`;
    const dur = UI_CONFIG.timing.status;
    this.animate(fog, [{ opacity: 0 }, { opacity: 1, offset: 0.4 }, { opacity: 0 }],
      { duration: dur * 1.6, fill: 'forwards' }).then(() => fog.remove());
    await this.delay(dur * 0.5);
  }

  async fireball(fromId, toId) {
    return this.projectile(this.renderer.castleEl(fromId), this.renderer.castleEl(toId));
  }

  /** 火の玉を fromEl から toEl へ飛ばす */
  async projectile(fromEl, toEl) {
    if (this.skipping) return;
    const from = this.centerOf(fromEl);
    const to = this.centerOf(toEl);
    sound.play('fire');
    const ball = this.fx('fx-fireball', from);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const side = (dy < 0 ? 1 : -1) * 46; // 少し弧をえがいて飛ぶ
    await this.animate(ball, [
      { transform: 'translate(-50%, -50%) scale(0.5)' },
      { transform: `translate(calc(-50% + ${dx * 0.5 + side}px), calc(-50% + ${dy * 0.5}px)) scale(1.3)`, offset: 0.5 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1.7)` },
    ], { duration: UI_CONFIG.timing.spellProjectile, easing: 'cubic-bezier(.5, 0, 1, 1)', fill: 'forwards' });
    ball.remove();
  }

  /** 雷：相手の兵士1体ずつに落とす */
  async thunder(targetId, roadId) {
    if (this.skipping) return;
    sound.play('thunder');
    const app = this.el.app.getBoundingClientRect();
    const top = this.renderer.el.board.getBoundingClientRect().top - app.top;
    const dur = UI_CONFIG.timing.thunder;
    const targets = this.renderer.soldierElsOf(targetId, roadId);
    targets.forEach((el, i) => {
      const c = this.centerOf(el);
      const bolt = this.fx('fx-bolt');
      bolt.style.left = `${c.x}px`;
      bolt.style.top = `${top}px`;
      bolt.style.height = `${Math.max(40, c.y - top)}px`;
      this.animate(bolt, [
        { opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 0.15, offset: 0.3 },
        { opacity: 1, offset: 0.45 }, { opacity: 0 },
      ], { duration: dur, delay: i * 40 * UI_CONFIG.speed, fill: 'forwards' }).then(() => bolt.remove());
      this.sparks(c, { count: 5, color: '#ffe95a', spread: 30, size: 6 });
    });
    this.screenFlash('#fffbe0', dur * 0.6);
    this.shake(this.renderer.el.field, 5, dur);
    await this.delay(dur * 0.6);
  }

  patchCastle(model, id, patch) {
    const owner = model.players[id]?.castleOwner ?? id;
    for (const [pid, player] of Object.entries(model.players)) {
      if ((player.castleOwner ?? pid) === owner) Object.assign(player,patch);
    }
  }

  async castleDamaged({ playerId, amount, hp, blocked = 0 }, model) {
    const pl = model.players[playerId];
    this.patchCastle(model, playerId, {castleHp:hp});
    if (blocked > 0) {
      this.patchCastle(model, playerId, {armor:Math.max(0,(pl.armor ?? 0)-blocked)});
      this.renderer.setArmor(playerId, pl.armor);
    }
    const dealt = Math.max(0, amount - blocked);
    const castle = this.renderer.castleEl(playerId);
    if (blocked > 0 && !this.skipping) {
      const small = UI_CONFIG.smallNumber;
      this.number(castle, `${ICON.armor}${blocked}ふせいだ`, { size: small.size, duration: small.duration, kind: 'block', dy: dealt > 0 ? -34 : 0 });
    }
    if (dealt <= 0) {
      // 城壁がぜんぶ受けた：揺らさず、城壁が光るだけ
      this.renderer.setCastleHp(playerId, hp);
      if (this.skipping) return;
      sound.play('block');
      return this.flashClass(castle, 'armor-block', UI_CONFIG.timing.armor);
    }
    return this.castleHit(playerId, dealt, hp);
  }

  /** 城に当たったときの手応え（ヒットストップ・揺れ・大きな数字。強いほど大きく） */
  async castleHit(playerId, amount, hp) {
    const cfg = UI_CONFIG.castleHit;
    const finish = hp <= 0;
    const castle = this.renderer.castleEl(playerId);
    const stop = finish ? cfg.finishHitstop : scaled(cfg.hitstopBase, cfg.hitstopPerDamage, cfg.hitstopMax, amount);
    const amp = finish ? cfg.finishShake : scaled(cfg.shakeBase, cfg.shakePerDamage, cfg.shakeMax, amount);
    const size = scaled(cfg.numberBase, cfg.numberPerDamage, cfg.numberMax, amount) * (finish ? 1.3 : 1);

    this.renderer.setCastleHp(playerId, hp);
    if (this.skipping) return;
    sound.play('hit', finish ? 1 : Math.min(1, amount / 12));
    if (finish) this.screenFlash('#fff', 520);

    // 1) 当たった瞬間：白く光る＋爆発
    castle.classList.add('flash');
    const burst = this.fx('fx-burst', this.centerOf(castle));
    burst.style.transform = `scale(${0.6 + Math.min(amount, 30) / 20})`;
    // 2) 一瞬止める（ダメージが大きいほど長く）
    await this.hitstop(stop);
    castle.classList.remove('flash');
    // 3) 揺れ＋大きな数字
    this.number(castle, `-${amount}`, { size, duration: cfg.numberDuration });
    this.sparks(this.centerOf(castle), { count: finish ? 22 : 6 + Math.min(12, amount), color: '#d9cfbb', spread: finish ? 130 : 50 + amount * 3, size: finish ? 14 : 10 });
    this.animate(burst, [{ opacity: 1 }, { opacity: 0, transform: `scale(${1 + Math.min(amount, 30) / 15})` }],
      { duration: 260, fill: 'forwards' }).then(() => burst.remove());
    this.shake(this.el.board, amp, cfg.shakeDuration * (finish ? 1.6 : 1));
    await this.delay(cfg.shakeDuration * 0.7);
  }

  async castleHealed({ playerId, amount, hp }, model) {
    this.patchCastle(model, playerId, {castleHp:hp});
    const castle = this.renderer.castleEl(playerId);
    this.renderer.setCastleHp(playerId, hp);
    if (this.skipping) return;
    castle.classList.remove('heal-glow');
    void castle.offsetWidth;
    castle.classList.add('heal-glow');
    sound.play('heal');
    const aura = this.fx('fx-heal-sprite', this.centerOf(castle));
    this.animate(aura, [{ opacity: 0, transform: 'scale(.7)' }, { opacity: 1, offset: .3 }, { opacity: 0, transform: 'scale(1.3)' }], { duration: UI_CONFIG.timing.heal, fill: 'forwards' }).then(() => aura.remove());
    this.sparks(this.centerOf(castle), { count: 10, color: '#7fe08a', spread: 60, size: 8 });
    this.number(castle, `+${amount}`, { kind: 'heal', size: UI_CONFIG.healNumber.size, duration: UI_CONFIG.healNumber.duration });
    await this.delay(UI_CONFIG.timing.heal);
    castle.classList.remove('heal-glow');
  }

  // ---------- 武器・防御・状態異常 ----------

  /** 兵士の上に、色のついた光と短い文字を出す */
  async soldierGlow(soldierId, { color, text, className = 'glow', ms }) {
    const el = this.renderer.soldierEl(soldierId);
    if (!el || this.skipping) return;
    sound.play('equip');
    el.style.setProperty('--glow', color);
    if (text) {
      const small = UI_CONFIG.smallNumber;
      this.number(el, text, { size: small.size, duration: small.duration, kind: 'buff' });
    }
    await this.flashClass(el, className, ms);
  }

  async weaponEquipped({ playerId, soldierId, type, attack, element }, model) {
    const s = this.modelSoldier(model, playerId, soldierId);
    if (s) Object.assign(s, { weapon: type, attack, element: element ?? null });
    this.renderer.updateSoldier(soldierId, { weapon: type, attack, element: element ?? null });
    const look = ELEMENT_LOOK[element];
    await this.soldierGlow(soldierId, {
      color: look?.color ?? GLOW.weapon,
      text: `${look?.icon ?? '⚔'}${this.cards[type]?.name ?? ''}`,
      ms: UI_CONFIG.timing.equip,
    });
  }

  async shieldAdded({ playerId, soldierId, amount, shield }, model) {
    const s = this.modelSoldier(model, playerId, soldierId);
    if (s) s.shield = shield;
    this.renderer.updateSoldier(soldierId, { shield });
    await this.soldierGlow(soldierId, { color: GLOW.shield, text: `${ICON.shield}+${amount}`, ms: UI_CONFIG.timing.equip });
  }

  /** とぎ石：続けて来たものはまとめて光らせる */
  async soldiersBuffed(first, queue, model) {
    const list = this.takeRun(first, queue);
    const waits = [];
    for (const b of list) {
      const s = this.modelSoldier(model, b.playerId, b.soldierId);
      const before = s?.attack ?? b.attack;
      if (s) { s.attack = b.attack; if (b.hp != null) s.hp = b.hp; }
      this.renderer.updateSoldier(b.soldierId, { attack: b.attack, ...(b.hp != null ? { hp: b.hp } : {}) });
      const diff = b.attack - before;
      waits.push(this.soldierGlow(b.soldierId, {
        color: GLOW.buff, text: `⚔${diff > 0 ? `+${diff}` : b.attack}`, ms: UI_CONFIG.timing.equip,
      }));
    }
    await Promise.all(waits);
  }

  async castleArmored({ playerId, armor }, model) {
    this.patchCastle(model, playerId, {armor});
    this.renderer.setArmor(playerId, armor);
    if (this.skipping) return;
    const castle = this.renderer.castleEl(playerId);
    const small = UI_CONFIG.smallNumber;
    sound.play('block');
    this.number(castle, `${ICON.armor}+${armor}`, { size: small.size + 6, duration: small.duration, kind: 'block' });
    await this.flashClass(castle, 'armor-up', UI_CONFIG.timing.armor);
  }

  async armorExpired({ playerId }, model) {
    this.patchCastle(model, playerId, {armor:0});
    if (this.skipping) {
      this.renderer.setArmor(playerId, 0);
      return;
    }
    const castle = this.renderer.castleEl(playerId);
    castle.classList.add('armor-fade');
    await this.delay(UI_CONFIG.timing.armor * 0.6);
    castle.classList.remove('armor-fade');
    this.renderer.setArmor(playerId, 0);
  }

  /** 毒・凍結がかかる：続けて来たものはまとめて見せる */
  async statusesApplied(first, queue, model) {
    const list = this.takeRun(first, queue);
    for (const a of list) {
      const s = this.modelSoldier(model, a.playerId, a.soldierId);
      const statuses = { ...(s?.statuses ?? this.renderer.soldier(a.soldierId)?.statuses ?? { poison: null, frozen: 0 }) };
      if (a.status === 'poison') {
        // statusApplied に毒の量はない。量は推測せず（null）、毒のダメージを受けたときか getState で分かる
        statuses.poison = { amount: statuses.poison?.amount ?? null, turns: a.turns };
      } else if (a.status === 'frozen') {
        statuses.frozen = a.turns;
      }
      if (s) s.statuses = statuses;
      this.renderer.updateSoldier(a.soldierId, { statuses });
    }
    if (this.skipping) return;
    const small = UI_CONFIG.smallNumber;
    for (const a of list) {
      const el = this.renderer.soldierEl(a.soldierId);
      if (!el) continue;
      const icon = STATUS_ICON[a.status] ?? '';
      this.number(el, `${icon}${a.status === 'poison' ? '毒' : '凍結'}`, { size: small.size, duration: small.duration, kind: a.status });
      el.classList.add(`apply-${a.status}`);
    }
    await this.delay(UI_CONFIG.timing.status);
    for (const a of list) this.renderer.soldierEl(a.soldierId)?.classList.remove(`apply-${a.status}`);
  }

  async statusCleared({ playerId, soldierId, status }, model) {
    const s = this.modelSoldier(model, playerId, soldierId);
    const statuses = { ...(s?.statuses ?? this.renderer.soldier(soldierId)?.statuses ?? {}) };
    if (status === 'poison') statuses.poison = null;
    if (status === 'frozen') statuses.frozen = 0;
    if (s) s.statuses = statuses;
    this.renderer.updateSoldier(soldierId, { statuses });
    await this.delay(UI_CONFIG.timing.statusCleared);
  }

  // ---------- 魔物とコイン ----------

  async monsterAppeared(p, model) {
    const def = this.monsterDefs?.[p.type] ?? {};
    const m = {
      monsterId: p.monsterId, type: p.type, roadId: p.roadId, square: p.square,
      hp: p.hp, maxHp: p.hp, // 出たときは満タン
      attack: p.attack, element: p.element ?? null,
      rewardRarity: def.rewardRarity ?? null, attackIn: def.attackEvery ?? null, reward: def.reward ?? null, castleAttack: def.castleAttack ?? null,
    };
    model.monsters = [...(model.monsters ?? []).filter((x) => x.monsterId !== m.monsterId), m];
    if (this.renderer.monster(m.monsterId)) this.renderer.updateMonster(m.monsterId, m);
    else this.renderer.addMonster(m, { appear: true });
    if (this.skipping) return;
    sound.play('monster');
    this.banner(`${def.name ?? '魔物'}があらわれた！`, UI_CONFIG.timing.monsterAppear, 'monster');
    this.shake(this.renderer.el.field, 6, UI_CONFIG.timing.monsterAppear * 0.5);
    await this.delay(UI_CONFIG.timing.monsterAppear);
  }

  async monsterAttackedCastle({ monsterId, playerId, amount, hp }, model) {
    this.patchCastle(model, playerId, {castleHp:hp});
    const m = this.modelMonster(model, monsterId);
    if (m && m.castleAttack != null) { m.castleAttack += this.rules.monsterAttackGrowth ?? 0; this.renderer.updateMonster(monsterId, { castleAttack: m.castleAttack }); }
    const mEl = this.renderer.monsterEl(monsterId);
    const castle = this.renderer.castleEl(playerId);
    if (mEl && !this.skipping) {
      sound.play('monster');
      // 魔物が城へ飛びかかって戻る
      const from = this.centerOf(mEl);
      const to = this.centerOf(castle);
      const token = mEl.querySelector('.monster-token');
      const dx = (to.x - from.x) * 0.7;
      const dy = (to.y - from.y) * 0.7;
      await this.animate(token, [
        { transform: 'translate(0, 0) scale(1)' },
        { transform: `translate(${dx}px, ${dy}px) scale(1.3)`, offset: 0.6 },
        { transform: `translate(${dx}px, ${dy}px) scale(1.3)` },
      ], { duration: UI_CONFIG.timing.monsterAttack, easing: 'ease-in' });
      this.animate(token, [
        { transform: `translate(${dx}px, ${dy}px) scale(1.3)` },
        { transform: 'translate(0, 0) scale(1)' },
      ], { duration: UI_CONFIG.timing.monsterAttack, easing: 'ease-out' });
    }
    if (amount > 0) await this.castleHit(playerId, amount, hp);
    else this.renderer.setCastleHp(playerId, hp);
  }

  async monsterDamaged({ monsterId, amount, hp }, model) {
    const m = this.modelMonster(model, monsterId);
    if (m) m.hp = hp;
    this.renderer.updateMonster(monsterId, { hp });
    const el = this.renderer.monsterEl(monsterId);
    if (!el || this.skipping) return;
    const cfg = UI_CONFIG.monsterHit;
    el.classList.add('hit');
    sound.play('smallHit');
    this.number(el, `-${amount}`, { size: cfg.numberSize, duration: cfg.numberDuration });
    await this.hitstop(cfg.hitstop);
    el.classList.remove('hit');
    this.shake(el.querySelector('.monster-token'), cfg.shake, cfg.shakeDuration);
    await this.delay(UI_CONFIG.timing.afterMonsterHit);
  }

  async monsterDefeated({ monsterId, playerId, reward, rewardRarity, baseRarity, lucky }, model) {
    if (rewardRarity) {
      model.players[playerId].generatedDraws = (model.players[playerId].generatedDraws ?? 0) + 1;
      model.players[playerId].pendingReward = { playerId, rarity: rewardRarity, base: baseRarity, lucky };
    }
    model.monsters = (model.monsters ?? []).filter((m) => m.monsterId !== monsterId);
    const el = this.renderer.monsterEl(monsterId);
    if (!el || this.skipping) {
      this.renderer.removeMonster(monsterId);
      return;
    }
    sound.play('hit', 0.6);
    this.sparks(this.centerOf(el), { count: 12, color: this.rarities?.[rewardRarity]?.color ?? '#ffcf3f', spread: 55, size: 8 });
    if (!rewardRarity) this.banner(`とどめ！ ${ICON.coin}${reward}`, UI_CONFIG.timing.reward, 'reward');
    await this.hitstop(UI_CONFIG.monsterHit.hitstop);
    await this.animate(el, [{ opacity: 1, transform: 'translate(-50%, -50%) scale(1)' }, { opacity: 0, transform: 'translate(-50%, -50%) scale(.1) rotate(25deg)' }], { duration: UI_CONFIG.rewardFx.collapse, fill: 'forwards' });
    this.renderer.removeMonster(monsterId);
  }

  async coinsChanged({ playerId, delta, coins, reason }, model) {
    model.players[playerId].coins = coins;
    this.renderer.setCoins(playerId, coins, { bump: true });
    if (this.skipping) return;
    if (delta > 0) sound.play('coin');
    const target = this.renderer.coinEl(playerId);
    if (target && !target.hidden) {
      const small = UI_CONFIG.smallNumber;
      const fx = UI_CONFIG.coinFx;
      this.number(target, `${ICON.coin}${delta > 0 ? '+' : ''}${delta}`, { size: small.size * (reason === 'card' ? fx.cardScale : reason === 'turn' ? fx.turnScale : 1), duration: reason === 'card' ? fx.cardDuration : reason === 'turn' ? fx.turnDuration : small.duration, kind: delta > 0 ? 'coin' : 'block' });
    }
    await this.delay(UI_CONFIG.timing.coins);
  }

  async upgradeBought({ playerId, upgradeId }, model) {
    const def = this.upgradeDefs?.[upgradeId];
    if (def?.effect === 'gainCard') model.players[playerId].generatedDraws = (model.players[playerId].generatedDraws ?? 0) + def.amount;
    if (def?.effect === 'boostDrops') model.players[playerId].luck = { draws: def.amount, boost: def.boost, from: def.fromRarity };
    sound.play('equip');
    this.banner(`${upgradeIcon(upgradeId)} ${def?.name ?? '強化'}！`, UI_CONFIG.timing.upgrade, 'small');
    await this.delay(UI_CONFIG.timing.upgrade * 0.5);
  }

  // ---------- 勝利 ----------

  confetti(container, colors) {
    container.innerHTML = '';
    const n = 70;
    for (let i = 0; i < n; i++) {
      const c = document.createElement('i');
      c.style.left = `${Math.random() * 100}%`;
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = `${1800 + Math.random() * 1800}ms`;
      c.style.animationDelay = `${Math.random() * 600}ms`;
      c.style.setProperty('--dx', `${(Math.random() - 0.5) * 160}px`);
      c.style.setProperty('--rot', `${(Math.random() - 0.5) * 1440}deg`);
      container.appendChild(c);
    }
  }
}
