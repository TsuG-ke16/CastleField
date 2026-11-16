// 盤面（城・道・兵士・魔物・枚数表示）を描く。
// ゲームの状態は書き換えない。main.js が持つ「表示用の状態」を受け取って描くだけ。
//
// 道（レーン）は rules.laneCount 本が横に並び、1本は rules.laneLength マス。上が相手の城・下が自分の城。
// 同じマスに両方の兵士がいることがあるので、相手の兵士はレーンの左より・自分の兵士は右よりに置く。
// 真ん中のマス（floor(laneLength / 2)）は魔物の居場所で、魔物はそのレーンのまん中に置く。
// レーンは roadId の「#番号」で決まる（番号なしなら1本目）。

import { UI_CONFIG } from './config.js';
import { RARITY_NAMES } from './rarity.js';
import { playerName } from './text.js';
import { ELEMENT_LOOK } from './look.js';
import { castleArt, unitArt, monsterArt, treeArt, icon, colorOf, spiritSprite } from './art.js';

const $ = (id) => document.getElementById(id);

/** レーンの幅に対する、兵士を置く横の位置（%）。自分は右より・相手は左より */
const X_ME = 74;
const X_OPP = 26;
/** 広場：城を置く円の半径（盤面の%）。左右の城の名札が画面の外に切れない大きさにする */
const PLAZA_RADIUS = 37;
/** 広場：城から最初のマスまでの間（マス何個ぶんか）。兵士が城の名札・HPに重ならないだけ離す */
const PLAZA_SPOKE_START = 2;

export class Renderer {
  /**
   * @param {{ cards: object, rules: object, monsters?: object, showCoins?: boolean,
   *           onSoldierTap?: (info: object) => void,
   *           onMonsterTap?: (info: object) => void,
   *           onTargetTap?: (target: object|null) => void }} opts
   *   onTargetTap：対象を選んでいるときに盤面がタップされたら呼ぶ（光っていない所なら null）
   *   showCoins：コインを出すか（自分と相手で同じ条件。main.js が決める）
   */
  constructor({ cards, rules, monsters = null, castles = null, showCoins = false, onCastleTap, onSoldierTap, onMonsterTap, onTargetTap }) {
    this.cards = cards;
    this.castleDefs = castles ?? {};
    this.rules = rules;
    this.monsterDefs = monsters;
    this.onCastleTap = onCastleTap;
    this.onSoldierTap = onSoldierTap;
    this.onMonsterTap = onMonsterTap;
    this.onTargetTap = onTargetTap;
    this.viewerId = 'p1';
    this.playerOrder = ['p1', 'p2'];
    /** soldierId → { el, playerId, type, hp, attack, position, weapon, element, shield, statuses } */
    this.soldiers = new Map();
    /** monsterId → { el, ...魔物の状態 } */
    this.monsters = new Map();
    /** 対象を選んでいるときの、光らせている対象（null なら選んでいない） */
    this.targets = null;
    this.players = {};
    this.castles = new Map();
    this.zoom = 1;

    this.el = {
      app: $('app'),
      board: $('board'),
      field: $('field'),
      road: $('road'),
      units: $('unit-layer'),
      oppName: $('opp-name'),
      oppHandCount: $('opp-hand-count'),
      oppCoins: $('opp-coins'),
      myCoins: $('my-coins'),
      turnInfo: $('turn-info'),
      deckPile: $('deck-pile'),
      discardPile: $('discard-pile'),
      deckCount: $('deck-count'),
      discardCount: $('discard-count'),
      castle: { me: $('castle-me'), opp: $('castle-opp') },
      castleLabel: { me: $('castle-me-label'), opp: $('castle-opp-label') },
    };
    // コインは自分（「強化」ボタンの中）と相手（上のバー）を同じ条件で出す
    this.el.oppCoins.hidden = !showCoins;
    $('upgrade-open').hidden = !showCoins;

    // HTML に data-icon="heart" のように書いた所へ、小さな記号を入れる
    for (const el of document.querySelectorAll('[data-icon]')) el.innerHTML = icon(el.dataset.icon);
    this.buildScenery();
    this.buildRoad();

    // 盤面のタップ：対象を選んでいるときは対象を、そうでなければ兵士・魔物の情報を出す
    this.el.board.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.targetable,.soldier,.monster,.castle')) { e.preventDefault(); e.target.click(); } });
    this.el.board.addEventListener('click', (e) => {
      if (this.targets) {
        this.onTargetTap?.(this.targetFromEl(e.target));
        return;
      }
      const castle=e.target.closest('.castle');
      if(castle){const id=castle.dataset.playerId;this.onCastleTap?.({playerId:id,...this.players[id]});return;}
      const sEl = e.target.closest('.soldier');
      if (sEl) {
        const s = this.soldiers.get(sEl.dataset.id);
        if (s) this.onSoldierTap?.({ ...s, el: undefined });
        return;
      }
      const mEl = e.target.closest('.monster');
      if (mEl) {
        const m = this.monsters.get(mEl.dataset.id);
        if (m) this.onMonsterTap?.({ ...m, el: undefined });
      }
    });
    window.addEventListener('resize', () => { this.layoutStacks(); this.fitPlaza(); });
    this.buildPlazaControls();
  }

  get laneLength() {
    return this.rules.laneLength;
  }

  /** レーン（道）の本数 */
  get laneCount() {
    return this.rules.laneCount ?? 1;
  }

  /** roadId → レーン番号（0から。"p1-p2#2" なら 1、番号なしなら 0） */
  laneOf(roadId) {
    const m = /#(\d+)$/.exec(roadId ?? '');
    return m ? Math.min(this.laneCount - 1, Math.max(0, Number(m[1]) - 1)) : 0;
  }

  /** そのレーンの中心の、盤面の幅に対する位置（%） */
  laneCenter(lane) {
    return ((lane + 0.5) / this.laneCount) * 100;
  }

  /** レーンの要素（roadId を渡さなければ道ぜんぶ） */
  laneEl(roadId) {
    if (roadId === undefined) return this.el.road;
    return this.el.road.querySelectorAll('.lane')[this.laneOf(roadId)] ?? this.el.road;
  }

  /** 道の真ん中のマス番号（魔物の居場所） */
  get middleSquare() {
    return Math.floor(this.laneLength / 2);
  }

  buildScenery() {
    const box = $('scenery');
    // [左%, 上%, 大きさpx]
    const trees = [[-3, 17, 74], [84, 22, 64], [-5, 40, 60], [88, 45, 78], [-2, 58, 70], [86, 63, 58]];
    box.innerHTML = trees.map(([x, y, s]) =>
      `<div class="tree" style="left:${x}%;top:${y}%;width:${s}px">${treeArt()}</div>`).join('');
  }

  buildRoad() {
    const L = this.laneLength;
    document.documentElement.style.setProperty('--cells', String(L));
    document.documentElement.style.setProperty('--lanes', String(this.laneCount));
    this.el.road.innerHTML = '';
    this.el.road.classList.toggle('multi', this.laneCount > 1);
    for (let n = 0; n < this.laneCount; n++) {
      const lane = this.el.road.appendChild(document.createElement('div'));
      lane.className = 'lane';
      lane.dataset.lane = String(n);
      const cells = lane.appendChild(document.createElement('div'));
      cells.className = 'cells';
      for (let i = 0; i < L; i++) {
        const cell = cells.appendChild(document.createElement('div'));
        cell.className = 'cell';
        cell.innerHTML = '<span class="stone"></span>';
      }
    }
  }

  // ---------- 視点 ----------

  /** 誰の視点で描くか。画面を見ている人の城がいつも下になる */
  setViewer(viewerId) {
    if (this.viewerId !== viewerId) {
      this.clearSoldiers();
      this.clearMonsters();
    }
    this.viewerId = viewerId;
    this.el.app.dataset.viewer = viewerId;
    const opp = this.opponentOf(viewerId);
    this.el.oppName.textContent = '相手';
    this.el.castleLabel.me.innerHTML = '<span class="you-tag">あなた</span><span class="castle-owner"></span>';
    this.el.castleLabel.me.querySelector('.castle-owner').textContent = playerName(viewerId);
    this.el.castleLabel.opp.textContent = playerName(opp);
    for (const [side, id] of [['me', viewerId], ['opp', opp]]) {
      const castle = this.el.castle[side];
      castle.dataset.color = colorOf(id);
      castle.querySelector('.castle-pic').innerHTML = castleArt(colorOf(id));
    }
    // 真ん中のマスは魔物の居場所だと分かるように、見た目を変える
    const midRow = this.rowOfSquare(this.middleSquare);
    this.el.road.querySelectorAll('.cell').forEach((cell, i) => cell.classList.toggle('mid', i % this.laneLength === midRow));
  }

  opponentOf(playerId) {
    return this.playerOrder.find((id) => this.ownerOf(id) !== this.ownerOf(playerId)) ?? (playerId === 'p1' ? 'p2' : 'p1');
  }

  sideOf(playerId) {
    return this.ownerOf(playerId) === this.ownerOf(this.viewerId) ? 'me' : 'opp';
  }

  castleEl(playerId) {
    return this.castles.get(this.ownerOf(playerId)) ?? this.el.castle[this.sideOf(playerId)];
  }

  ownerOf(id) { return this.players[id]?.castleOwner ?? id; }

  castlePicture(id, damage = 0) {
    const size = this.teamSize(id);
    const tier = UI_CONFIG.castleTiers.filter(t => size >= t.min).at(-1);
    const art = castleArt(colorOf(this.ownerOf(id)), damage, this.players[this.ownerOf(id)]?.castleType);
    return `${tier.towers ? `<span class="extra-tower tower-left">${art}</span><span class="extra-tower tower-right">${art}</span>` : ''}${art}${tier.wall ? '<span class="team-wall"></span>' : ''}${tier.fortress ? '<span class="fortress-flags">⚑ ⚑ ⚑</span>' : ''}`;
  }
  teamSize(id) { return this.teams?.[this.players[id]?.team]?.size ?? (Object.values(this.players).filter(p => p.castleOwner === this.ownerOf(id)).length || 1); }

  configureBoard(model) {
    this.players = model.players;
    this.teams = model.teams;
    this.playerOrder = model.playerOrder;
    this.isPlaza = model.layout === 'plaza';
    this.owners = [...new Set(model.playerOrder.map(id => this.ownerOf(id)))];
    const key = JSON.stringify([this.isPlaza, this.owners, this.viewerId]);
    if (key !== this.boardKey) {
      this.boardKey = key;
      this.clearSoldiers(); this.clearMonsters(); this.castles.clear();
      this.plazaStage.querySelectorAll('.plaza-castle').forEach(el => el.remove());
      this.el.board.classList.toggle('plaza-board', this.isPlaza);
      this.plazaViewport.hidden = !this.isPlaza;
      this.zoomBar.hidden = !this.isPlaza;
      this.el.castle.me.hidden = this.el.castle.opp.hidden = this.isPlaza;
      this.el.field.hidden = this.isPlaza;
      if (this.isPlaza) {
        this.zoom = 1;
        this.plazaSize = this.owners.length <= 4 ? UI_CONFIG.plazaSizeCompact : UI_CONFIG.plazaSize;
        this.plazaStage.style.width = this.plazaStage.style.height = `${this.plazaSize}px`;
        this.plazaStage.append(this.el.units);
        this.plazaStage.querySelectorAll('.spoke-dot').forEach(el => el.remove());
        this.owners.forEach(id => {
          const castle = this.el.castle.me.cloneNode(true);
          castle.removeAttribute('id'); castle.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
          castle.hidden = false; castle.classList.add('plaza-castle');
          const p = this.castlePoint(id);
          castle.style.left = `${p.x}%`; castle.style.top = `${p.y}%`;
          // 上半分の城は名札・HPを絵の上（外側）に出す。広場へ向かう兵士と重ならないように
          castle.classList.toggle('plaza-upper', p.y < 45);
          this.plazaStage.append(castle); this.castles.set(id, castle);
          for (let n = 0; n < this.middleSquare; n++) {
            const dot = document.createElement('span'); dot.className = 'spoke-dot';
            const t = (n + PLAZA_SPOKE_START) / (this.middleSquare + PLAZA_SPOKE_START);
            dot.style.left = `${p.x + (50-p.x)*t}%`; dot.style.top = `${p.y+(50-p.y)*t}%`;
            this.plazaStage.prepend(dot);
          }
        });
      } else {
        this.el.field.append(this.el.units);
        const me = this.ownerOf(this.viewerId);
        this.castles.set(me, this.el.castle.me);
        this.castles.set(this.owners.find(id => id !== me) ?? me, this.el.castle.opp);
        this.buildRoad();
      }
      this.fitPlaza();
    }
    const palette = UI_CONFIG.teamColors;
    for (const id of this.owners) {
      const castle = this.castleEl(id);
      const members = model.playerOrder.filter(p => this.ownerOf(p) === id);
      const label = members.map(playerName).join('・');
      const team = this.players[id]?.team;
      castle.dataset.playerId = id;
      castle.setAttribute('aria-label', label);
      castle.setAttribute('role','button');
      castle.tabIndex = 0;
      castle.dataset.color = colorOf(id);
      castle.style.setProperty('--team-color', palette[team] ?? palette[this.owners.indexOf(id) % palette.length]);
      const kind=this.players[id]?.castleType;
      const kindName=this.castleDefs[kind]?.name??'';
      castle.dataset.castleType=kind??'standard';
      castle.querySelector('.castle-label').textContent = `席${model.playerOrder.indexOf(id)+1} ${members.includes(this.viewerId) && !members.some(m => playerName(m) === 'あなた') ? 'あなた · ' : ''}${label}${kind && kind!=='standard' ? ' · '+kindName : ''}`;
      castle.setAttribute('aria-label',`席${model.playerOrder.indexOf(id)+1}、${label}、${kindName}`);
      castle.querySelector('.castle-label').title = label;
      castle.classList.toggle('eliminated', Boolean(this.players[id]?.eliminated));
      const tier = UI_CONFIG.castleTiers.filter(t => members.length >= t.min).at(-1);
      if (castle.dataset.tier !== tier.name || castle.dataset.artColor !== colorOf(id) || castle.dataset.artKind !== (kind??'standard')) {
        castle.dataset.artKind=kind??'standard';
        castle.dataset.tier = tier.name;
        castle.dataset.artColor = colorOf(id);
        castle.querySelector('.castle-pic').innerHTML = this.castlePicture(id, Number(castle.dataset.damage ?? 0));
      }
    }
  }

  castlePoint(id) {
    const viewer = this.owners.indexOf(this.ownerOf(this.viewerId));
    const index = this.owners.indexOf(this.ownerOf(id));
    const angle = Math.PI / 2 + (index - viewer) * Math.PI * 2 / this.owners.length;
    return { x: 50 + Math.cos(angle)*PLAZA_RADIUS, y: 50 + Math.sin(angle)*PLAZA_RADIUS };
  }
  plazaPoint(playerId, position, targetId) {
    const from = this.castlePoint(playerId);
    const target = this.castlePoint(targetId ?? this.opponentOf(playerId));
    const mid = this.middleSquare;
    if (position >= this.laneLength) return target;
    const square = position < mid ? position : this.laneLength - 1 - position;
    const t = (square + PLAZA_SPOKE_START)/(mid + PLAZA_SPOKE_START);
    const castle = position < mid ? from : target;
    return position === mid ? {x:50,y:50} : {x:castle.x+(50-castle.x)*t,y:castle.y+(50-castle.y)*t};
  }

  fitPlaza() {
    if (!this.isPlaza) return;
    const fit = Math.min(this.plazaViewport.clientWidth, this.plazaViewport.clientHeight) / (this.plazaSize ?? UI_CONFIG.plazaSize);
    this.plazaScale = fit*this.zoom;
    this.plazaStage.style.transform = `translate(-50%, -50%) scale(${this.plazaScale})`;
    this.zoomText.textContent = `${Math.round(this.zoom*100)}%`;
  }
  buildPlazaControls() {
    this.plazaViewport = document.createElement('div'); this.plazaViewport.className = 'plaza-viewport'; this.plazaViewport.hidden = true;
    this.plazaStage = document.createElement('div'); this.plazaStage.className = 'plaza-stage';
    this.plazaStage.style.width = this.plazaStage.style.height = `${UI_CONFIG.plazaSize}px`;
    const hub = document.createElement('div'); hub.className = 'plaza-hub'; hub.textContent = '広場';
    this.plazaStage.append(hub); this.plazaViewport.append(this.plazaStage); this.el.board.append(this.plazaViewport);
    this.zoomBar = document.createElement('div'); this.zoomBar.className = 'plaza-zoom'; this.zoomBar.hidden = true;
    this.zoomText = document.createElement('span');
    for (const [text, delta] of [['−',-.15],['＋',.15]]) {
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'small-btn'; btn.textContent = text;
      btn.setAttribute('aria-label', delta < 0 ? '盤面を縮小' : '盤面を拡大');
      btn.addEventListener('click', () => {this.zoom = Math.min(1.6,Math.max(.65,this.zoom+delta)); this.fitPlaza();});
      this.zoomBar.append(btn);
    }
    this.zoomBar.append(this.zoomText); this.el.board.append(this.zoomBar);
    let startDistance = 0, startZoom = 1;
    this.plazaViewport.addEventListener('touchstart', e => {
      if(e.touches.length !== 2) return;
      startDistance = Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY); startZoom = this.zoom;
    }, {passive:true});
    this.plazaViewport.addEventListener('touchmove', e => {
      if(e.touches.length !== 2 || !startDistance) return;
      e.preventDefault(); const d = Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
      this.zoom = Math.min(1.6,Math.max(.65,startZoom*d/startDistance)); this.fitPlaza();
    }, {passive:false});
  }

  /** 道（魔法の演出を重ねる場所） */
  roadEl() {
    return this.isPlaza ? this.plazaStage : this.el.road;
  }

  /** そのプレイヤーの兵士の要素（魔法が当たる相手を光らせる・雷を落とす） */
  soldierElsOf(playerId, roadId) {
    return [...this.soldiers.values()]
      .filter((s) => s.playerId === playerId && (roadId === undefined || this.laneOf(s.roadId) === this.laneOf(roadId)))
      .map((s) => s.el);
  }

  /** 道のマス番号（players[0] の城側が 0）→ 上から数えた行。2人なら players[0] は p1 */
  rowOfSquare(square) {
    const L = this.laneLength;
    const viewerPos = this.viewerId === this.playerOrder[0] ? square : L - 1 - square;
    return L - 1 - viewerPos;
  }

  // ---------- まとめて描く ----------

  /** @param {object} model main.js の表示用の状態 */
  renderAll(model) {
    this.configureBoard(model);
    if (model.playerOrder) this.playerOrder = model.playerOrder;
    this.setTurnInfo(model.turn, model.round);
    this.setPiles(model.deckCount, model.discardCount);
    const opp = this.opponentOf(this.viewerId);
    this.setOppHandCount(model.players[opp]?.handCount ?? 0);
    this.el.oppName.textContent = this.playerOrder.length > 2 ? `${this.owners.length}つの城` : playerName(opp);
    for (const id of this.playerOrder) {
      const p = model.players[id];
      this.setCastleHp(id, p.castleHp, { instant: true, max: p.castleMaxHp });
      this.setArmor(id, p.armor);
      this.setSpirit(id, p.spirit);
      this.setCoins(id, p.coins);
    }
    this.syncSoldiers(model);
    this.syncMonsters(model);
    this.updateThreatWarnings();
  }

  setTurnInfo(turn, round) {
    this.el.turnInfo.textContent = round ? `${round}周目` : (turn ? `ターン${turn}` : '');
    this.el.turnInfo.title = `通算ターン ${turn}`;
  }

  /** 手番の人の城を目立たせる */
  setCurrentPlayer(playerId) {
    for (const id of this.owners ?? this.playerOrder) this.castleEl(id).classList.toggle('current', id === this.ownerOf(playerId));
  }

  setPiles(deckCount, discardCount, { bumpDeck = false, bumpDiscard = false } = {}) {
    this.el.deckCount.textContent = String(deckCount ?? 0);
    this.el.discardCount.textContent = String(discardCount ?? 0);
    if (bumpDeck) this.bump(this.el.deckPile);
    if (bumpDiscard) this.bump(this.el.discardPile);
  }

  setOppHandCount(count) {
    if (this.playerOrder.length > 2) count = this.playerOrder.filter(id => id !== this.viewerId).reduce((n,id) => n+(this.players[id]?.handCount ?? 0),0);
    this.el.oppHandCount.parentElement.title = this.playerOrder.length > 2 ? 'ほかの人の手札（合計）' : '相手の手札';
    this.el.oppHandCount.textContent = String(count);
  }

  /** コインの表示（相手は上のバー、自分は「強化」ボタン） */
  setCoins(playerId, coins, { bump = false } = {}) {
    const el = playerId === this.viewerId ? this.el.myCoins : this.el.oppCoins.querySelector('b');
    if (playerId !== this.viewerId && this.playerOrder.length > 2) coins = this.playerOrder.filter(id => id !== this.viewerId).reduce((n,id) => n+(this.players[id]?.coins ?? 0),0);
    this.el.oppCoins.title = this.playerOrder.length > 2 ? 'ほかの人のコイン（合計）' : '相手のコイン';
    el.textContent = String(coins ?? 0);
    if (bump) this.bump(this.coinEl(playerId));
  }

  coinEl(playerId) {
    return playerId === this.viewerId ? $('upgrade-open') : this.el.oppCoins;
  }

  bump(el) {
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  setCastleHp(playerId, hp, { instant = false, max } = {}) {
    const castle = this.castleEl(playerId);
    if (max) castle.dataset.max = String(max);
    const maxHp = Number(castle.dataset.max) || this.rules.castleMaxHp;
    castle.dataset.hp = String(hp);
    const ratio = Math.max(0, Math.min(1, hp / maxHp));
    const fill = castle.querySelector('.hp-fill');
    const lag = castle.querySelector('.hp-lag');
    if (instant) {
      fill.style.transition = lag.style.transition = 'none';
      void fill.offsetWidth;
    }
    fill.style.width = `${ratio * 100}%`;
    lag.style.width = `${ratio * 100}%`;
    if (instant) {
      void fill.offsetWidth;
      fill.style.transition = lag.style.transition = '';
    }
    fill.classList.toggle('mid', ratio <= 0.5 && ratio > 0.25);
    fill.classList.toggle('low', ratio <= 0.25);
    castle.classList.toggle('danger', ratio <= 0.25 && ratio > 0);
    // 城が壊れていく見た目（0：無傷 〜 3：落ちた）
    const damage = String(ratio <= 0 ? 3 : ratio <= 0.34 ? 2 : ratio <= 0.67 ? 1 : 0);
    if (castle.querySelector('.castle-pic > .castle-art')?.dataset.damageStage !== damage) {
      castle.querySelector('.castle-pic').innerHTML = this.castlePicture(playerId, Number(damage));
    }
    castle.dataset.damage = damage;
    castle.querySelector('.hp-value').textContent = String(Math.max(0, hp));
    castle.querySelector('.hp-max').textContent = `/${maxHp}`;
    this.updateThreatWarnings();
  }

  /** 城壁（armor）の表示 */
  setArmor(playerId, armor) {
    const castle = this.castleEl(playerId);
    const badge = castle.querySelector('.castle-armor');
    const on = armor > 0;
    castle.classList.toggle('armored', on);
    badge.hidden = !on;
    badge.innerHTML = on ? `${icon('wall')}<b></b>` : '';
    if (on) badge.querySelector('b').textContent = `城壁 ${armor}`;
  }

  /** 来ている精霊を、城のそばのバッジで見せる（なければ隠す） */
  setSpirit(playerId, spirit) {
    const badge = this.castleEl(playerId).querySelector('.castle-spirit');
    if (!badge) return;
    if (this.teamSize(playerId) > 1) {
      if (this.players[playerId]) this.players[playerId].spirit = spirit;
      const spirits = Object.entries(this.players).filter(([id,p]) => this.ownerOf(id) === this.ownerOf(playerId) && p.spirit);
      badge.hidden = !spirits.length; badge.replaceChildren();
      for (const [id,p] of spirits) {
        const label = document.createElement('span');
        label.className='team-spirit';
        label.innerHTML=spiritSprite(p.spirit.spirit,p.spirit.type.startsWith('great')||p.spirit.type.endsWith('King'));
        label.append(document.createTextNode(`席${this.playerOrder.indexOf(id)+1} あと${p.spirit.turns}`));
        label.title=`${playerName(id)}：${this.cards[p.spirit.type]?.name ?? ''}`;
        badge.append(label);
      }
      badge.title = [...badge.children].map(el => el.textContent).join(' / ');
      return;
    }
    badge.hidden = !spirit;
    badge.replaceChildren();
    if (spirit) {
      const name = document.createElement('b');
      const symbol = document.createElement('span');
      symbol.className = 'spirit-symbol';
      symbol.innerHTML = spiritSprite(spirit.spirit,spirit.type.startsWith('great')||spirit.type.endsWith('King'));
      name.textContent = this.cards[spirit.type]?.name ?? '精霊';
      const detail = document.createElement('span');
      const effects = {
        fire: `城に${spirit.amount}ダメージ`, water: `城を${spirit.amount}回復`,
        wind: `速さ最低${spirit.amount}`, earth: `ダメージ−${spirit.amount}`,
      };
      // 盤面（道）にかぶらないよう、バッジは「印＋あとN回」だけの小さな形。名前と効果はタップ（title）で読む
      detail.textContent = `あと${spirit.turns}`;
      badge.append(symbol, detail);
      badge.title = `${name.textContent}：${effects[spirit.spirit] ?? ''}・あと${spirit.turns}回`;
      badge.setAttribute('aria-label', badge.title);
    }
  }

  // ---------- 兵士 ----------

  /** 兵士の位置 → 道の上の top(%)。城に着いた兵士は相手の城に重なる位置 */
  topPercent(playerId, position) {
    const L = this.laneLength;
    const pos = Math.max(0, Math.min(position, L));
    const fromTop = this.sideOf(playerId) === 'me' ? L - 1 - pos : pos;
    return ((fromTop + 0.5) / L) * 100;
  }

  place(s) {
    if (this.isPlaza) {
      let p = this.plazaPoint(s.playerId, s.position, s.targetId);
      if (s.place?.at === 'plaza') p = {x:50,y:50};
      else if(s.place?.at === 'spoke') {
        const castle = this.castlePoint(s.place.playerId), t = (s.place.square+PLAZA_SPOKE_START)/(this.middleSquare+PLAZA_SPOKE_START);
        p = {x:castle.x+(50-castle.x)*t,y:castle.y+(50-castle.y)*t};
      }
      s.el.style.top = `${p.y}%`; s.el.style.setProperty('--x', `${p.x}%`); return;
    }
    const arrived = s.position >= this.laneLength;
    s.el.style.top = `${this.topPercent(s.playerId, s.position)}%`;
    // レーンの中で、自分は右より・相手は左より。城に着いた兵士は、そのレーンのまん中へ寄る
    const center = this.laneCenter(this.laneOf(s.roadId));
    const side = ((this.sideOf(s.playerId) === 'me' ? X_ME : X_OPP) - 50) / 100; // レーン幅に対する割合
    s.el.style.setProperty('--x', `${arrived ? center : center + (side * 100) / this.laneCount}%`);
  }

  addSoldier(playerId, st, { appear = false } = {}) {
    const def = this.cards[st.type] ?? {};
    const el = document.createElement('div');
    el.className = `soldier ${this.sideOf(playerId)} no-anim`;
    el.dataset.id = st.soldierId;
    el.tabIndex=0;el.setAttribute('role','button');
    el.dataset.role = st.role ?? def.role ?? 'melee';
    const team = this.players[playerId]?.team;
    el.dataset.team = team ?? '';
    el.style.setProperty('--team-color', UI_CONFIG.teamColors[team] ?? UI_CONFIG.teamColors[this.playerOrder.indexOf(playerId)]);
    el.dataset.color = colorOf(playerId);
    if (appear) el.classList.add('appear');
    el.innerHTML = '<div class="soldier-token"><div class="soldier-pic"></div>' +
      '<span class="soldier-weapon" hidden></span><span class="soldier-shield" hidden></span><span class="soldier-status" hidden></span></div>' +
      `<div class="soldier-stats"><span class="st atk">${icon('sword')}<b></b></span><span class="st hp">${icon('heart')}<b></b></span></div>`;
    el.querySelector('.soldier-pic').innerHTML = unitArt(st.type, colorOf(playerId), def.name ?? st.type);
    const seat = document.createElement('span');seat.className='seat-mark';seat.textContent=String(this.playerOrder.indexOf(playerId)+1);seat.title=playerName(playerId);seat.setAttribute('aria-label',`席${seat.textContent}、${playerName(playerId)}`);el.append(seat);
    const turns = document.createElement('span'); turns.className = 'soldier-turns'; el.append(turns);
    this.el.units.appendChild(el);
    const s = {
      el,
      playerId,
      soldierId: st.soldierId,
      roadId: st.roadId, targetId: st.targetId, place: st.place, role: st.role ?? def.role ?? 'melee', turnsLeft: st.turnsLeft ?? def.stay ?? null,
      type: st.type,
      hp: st.hp ?? def.hp,
      attack: st.attack ?? def.attack,
      position: st.position,
      weapon: st.weapon ?? null,
      element: st.element ?? null,
      shield: st.shield ?? 0,
      statuses: { poison: st.statuses?.poison ?? null, frozen: st.statuses?.frozen ?? 0 },
    };
    this.soldiers.set(st.soldierId, s);
    this.updateSoldierBadges(s);
    this.place(s);
    void el.offsetWidth; // 位置を確定させてからアニメーションを有効にする
    el.classList.remove('no-anim');
    this.layoutStacks();
    return el;
  }

  /** 兵士の見た目を、持っている値（HP・攻撃・武器・盾・状態異常）に合わせる */
  updateSoldierBadges(s) {
    s.el.setAttribute('aria-label',`席${this.playerOrder.indexOf(s.playerId)+1} ${this.cards[s.type]?.name??''}、攻撃${s.attack}、HP${s.hp}`);
    const q = (sel) => s.el.querySelector(sel);
    q('.soldier-turns').hidden = s.turnsLeft == null;
    q('.soldier-turns').textContent = `${s.role === 'mage' ? '✦' : '➶'} あと${s.turnsLeft}回`;
    s.el.title = `${this.cards[s.type]?.name ?? ''} · ${playerName(s.playerId)}${s.turnsLeft == null ? '' : ` · あと${s.turnsLeft}回`}`;
    q('.st.hp b').textContent = String(Math.max(0, s.hp));
    q('.st.atk b').textContent = String(s.attack);
    const baseHp = this.cards[s.type]?.hp;
    q('.st.hp').classList.toggle('hurt', baseHp != null && s.hp < baseHp);
    const baseAtk = this.cards[s.type]?.attack;
    q('.st.atk').classList.toggle('up', baseAtk != null && s.attack > baseAtk);
    const look = ELEMENT_LOOK[s.element];
    if (look) s.el.style.setProperty('--element', look.color);
    else s.el.style.removeProperty('--element');
    s.el.classList.toggle('has-element', Boolean(look));
    const weapon = q('.soldier-weapon');
    weapon.hidden = !s.weapon;
    weapon.innerHTML = s.weapon ? icon(look?.iconName ?? 'sword') : '';
    const shield = q('.soldier-shield');
    shield.hidden = !(s.shield > 0);
    shield.innerHTML = s.shield > 0 ? `${icon('shield')}<b>${Number(s.shield)}</b>` : '';
    const poison = s.statuses?.poison;
    const frozen = s.statuses?.frozen > 0;
    const status = q('.soldier-status');
    status.innerHTML = `${poison ? icon('skull') : ''}${frozen ? icon('snow') : ''}`;
    status.hidden = !poison && !frozen;
    s.el.classList.toggle('poisoned', Boolean(poison));
    s.el.classList.toggle('frozen', frozen);
  }

  soldierEl(soldierId) {
    return this.soldiers.get(soldierId)?.el ?? null;
  }

  soldier(soldierId) {
    return this.soldiers.get(soldierId) ?? null;
  }

  /** 兵士の値を一部だけ変えて描き直す（例：{ shield: 3 }） */
  updateSoldier(soldierId, patch) {
    const s = this.soldiers.get(soldierId);
    if (!s) return;
    Object.assign(s, patch);
    this.updateSoldierBadges(s);
  }

  moveSoldier(soldierId, position) {
    const s = this.soldiers.get(soldierId);
    if (!s) return;
    s.position = position;
    s.place = null;
    this.place(s);
  }

  setSoldierHp(soldierId, hp) {
    this.updateSoldier(soldierId, { hp });
  }

  /** 画面から兵士を外す（消える演出は Animations が先にやる） */
  removeSoldier(soldierId) {
    const s = this.soldiers.get(soldierId);
    if (!s) return;
    this.soldiers.delete(soldierId);
    s.el.remove();
    this.layoutStacks();
  }

  clearSoldiers() {
    for (const s of this.soldiers.values()) s.el.remove();
    this.soldiers.clear();
  }

  /** 同じマスにいる同じ人の兵士を、横に少しずつずらす（道の外側へ広げる） */
  layoutStacks() {
    const groups = new Map();
    for (const s of this.soldiers.values()) {
      if (s.position >= this.laneLength) {
        s.el.style.setProperty('--offset', '0px');
        continue;
      }
      const point = this.isPlaza ? this.plazaPoint(s.playerId, s.position, s.targetId) : null;
      const key = point ? `${point.x.toFixed(1)}:${point.y.toFixed(1)}` : `${s.playerId}:${s.roadId}:${s.position}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
    }
    const width = (this.el.units.clientWidth || 320) / this.laneCount; // 1レーンの幅
    const half = this.isPlaza ? 110 : width * 0.5;
    for (const list of groups.values()) {
      // 片側の幅（道の半分）に収まるように間をつめる
      const token = list[0].el.offsetWidth || 56;
      const room = Math.max(0, half - token - 8);
      const step = list.length > 1 ? Math.min(token * 0.9, room / (list.length - 1)) : 0;
      list.forEach((s, i) => {
        s.el.style.setProperty('--offset', `${(i - (list.length - 1) / 2) * step}px`);
        s.el.style.zIndex = String(10 + i);
      });
    }
  }

  /** 表示用の状態に兵士を合わせる（足りなければ作り、余れば消す。動きはつけない） */
  syncSoldiers(model) {
    const alive = new Set();
    for (const playerId of this.playerOrder) {
      for (const st of model.players[playerId].soldiers) {
        alive.add(st.soldierId);
        const s = this.soldiers.get(st.soldierId);
        if (!s) {
          this.addSoldier(playerId, st);
          continue;
        }
        s.el.classList.add('no-anim');
        this.moveSoldier(st.soldierId, st.position);
        Object.assign(s, {
          role: st.role, turnsLeft: st.turnsLeft, place: st.place, targetId: st.targetId,
          hp: st.hp,
          attack: st.attack,
          weapon: st.weapon ?? null,
          element: st.element ?? null,
          shield: st.shield ?? 0,
          statuses: { poison: st.statuses?.poison ?? null, frozen: st.statuses?.frozen ?? 0 },
        });
        this.updateSoldierBadges(s);
        this.place(s);
        void s.el.offsetWidth;
        s.el.classList.remove('no-anim', 'hit', 'hit-poison', 'blocked', 'appear', 'glow');
      }
    }
    for (const id of [...this.soldiers.keys()]) if (!alive.has(id)) this.removeSoldier(id);
    this.layoutStacks();
  }

  // ---------- 魔物 ----------

  addMonster(st, { appear = false } = {}) {
    const def = this.monsterDefs?.[st.type] ?? {};
    const el = document.createElement('div');
    el.className = 'monster';
    el.dataset.id = st.monsterId;
    el.tabIndex=0;el.setAttribute('role','button');
    if (appear) el.classList.add('appear');
    el.innerHTML = '<div class="monster-token"><div class="monster-pic"></div>' +
      '<span class="monster-element" hidden></span><span class="monster-attack-in" hidden></span></div>' +
      '<div class="monster-hp"><div class="monster-hp-fill"></div><span class="monster-hp-text"></span></div>' +
      `<div class="monster-stats"><span class="st atk">${icon('sword')}<b></b></span></div>`;
    el.querySelector('.monster-pic').innerHTML = monsterArt(st.type, def.name ?? st.type);
    el.style.top = `${((this.rowOfSquare(st.square) + 0.5) / this.laneLength) * 100}%`;
    el.style.left = `${this.laneCenter(this.laneOf(st.roadId))}%`;
    if (st.roadId === 'plaza') { el.style.top = '50%'; el.style.left = '50%'; }
    this.el.units.appendChild(el);
    const m = { ...st, el };
    this.monsters.set(st.monsterId, m);
    this.updateMonster(st.monsterId, {});
    return el;
  }

  monsterEl(monsterId) {
    return this.monsters.get(monsterId)?.el ?? null;
  }

  monster(monsterId) {
    return this.monsters.get(monsterId) ?? null;
  }

  updateMonster(monsterId, patch) {
    const m = this.monsters.get(monsterId);
    if (!m) return;
    const before = m.castleAttack;
    Object.assign(m, patch);
    m.el.setAttribute('aria-label',`${this.monsterDefs?.[m.type]?.name??'魔物'}、HP${m.hp}、次の城への攻撃${m.castleAttack??0}`);
    if (before != null && m.castleAttack > before) {
      m.el.classList.remove('threat-grown'); void m.el.offsetWidth; m.el.classList.add('threat-grown');
    }
    const look = ELEMENT_LOOK[m.element];
    if (look) m.el.style.setProperty('--element', look.color);
    const elBadge = m.el.querySelector('.monster-element');
    elBadge.hidden = !look;
    elBadge.innerHTML = look ? icon(look.iconName) : '';
    const ratio = Math.max(0, Math.min(1, m.hp / (m.maxHp || 1)));
    m.el.querySelector('.monster-hp-fill').style.width = `${ratio * 100}%`;
    m.el.querySelector('.monster-hp-text').textContent = `${Math.max(0, m.hp)}/${m.maxHp}`;
    m.el.querySelector('.st.atk b').textContent = m.attack == null ? '?' : String(m.attack);
    const attackIn = m.el.querySelector('.monster-attack-in');
    attackIn.hidden = m.attackIn == null;
    const soon = m.attackIn != null && m.attackIn <= 1;
    attackIn.replaceChildren();
    const damage = document.createElement('b'); damage.textContent = `城へ ${m.castleAttack ?? '?'} ダメージ`;
    const countdown = document.createElement('small'); countdown.textContent = soon ? '次の周回で攻撃！' : `あと${m.attackIn}周`;
    attackIn.append(damage, countdown);
    m.el.dataset.danger = String(soon);
    let reward = m.el.querySelector('.monster-reward');
    if (!reward) { reward = document.createElement('div'); reward.className = 'monster-reward'; m.el.appendChild(reward); }
    reward.textContent = m.rewardRarity ? `${RARITY_NAMES[m.rewardRarity] ?? m.rewardRarity}カード` : `コイン${m.reward ?? 0}`;
    attackIn.classList.toggle('soon', soon);
  }

  updateThreatWarnings() {
    const near = [...this.monsters.values()].some((m) => m.attackIn != null && m.attackIn <= 1);
    for (const castle of new Set([...Object.values(this.el.castle), ...this.castles.values()])) {
      const hp = Number(castle.dataset.hp), max = Number(castle.dataset.max);
      const on = near && hp > 0 && max > 0 && hp / max <= UI_CONFIG.warningHpRatio;
      castle.classList.toggle('under-threat', on);
      let badge = castle.querySelector('.castle-threat');
      if (!badge) { badge = document.createElement('span'); badge.className = 'castle-threat'; badge.textContent = '危険：魔物の攻撃が近い'; castle.append(badge); }
      badge.hidden = !on;
    }
  }

  removeMonster(monsterId) {
    const m = this.monsters.get(monsterId);
    if (!m) return;
    this.monsters.delete(monsterId);
    m.el.remove();
  }

  clearMonsters() {
    for (const m of this.monsters.values()) m.el.remove();
    this.monsters.clear();
  }

  syncMonsters(model) {
    const alive = new Set();
    for (const st of model.monsters ?? []) {
      alive.add(st.monsterId);
      if (!this.monsters.has(st.monsterId)) this.addMonster(st);
      else {
        this.monsters.get(st.monsterId).el.classList.remove('appear', 'hit');
        this.updateMonster(st.monsterId, { ...st });
      }
    }
    for (const id of [...this.monsters.keys()]) if (!alive.has(id)) this.removeMonster(id);
  }

  // ---------- 対象を選ぶ ----------

  /** 対象（getTargets の結果）を光らせる。null で元に戻す */
  setTargets(targets) {
    for(const {el,tab,role,label} of this.targetRestore??[]){
      el.classList.remove('targetable');
      for(const [key,value] of [['tabindex',tab],['role',role],['aria-label',label]])value===null?el.removeAttribute(key):el.setAttribute(key,value);
    }
    this.targetRestore=[];
    this.targets=targets?.length?targets:null;
    this.el.app.classList.toggle('targeting',Boolean(this.targets));
    if(!this.targets)return;
    for(const t of this.targets){const el=this.elOfTarget(t);if(!el||this.targetRestore.some(x=>x.el===el))continue;
      this.targetRestore.push({el,tab:el.getAttribute('tabindex'),role:el.getAttribute('role'),label:el.getAttribute('aria-label')});
      el.classList.add('targetable');el.tabIndex=0;el.setAttribute('role','button');
      el.setAttribute('aria-label',t.roadId?`道${this.laneOf(t.roadId)+1}、${playerName(t.playerId)}`:t.monsterId?'魔物を狙う':t.soldierId?'兵士を選ぶ':`${playerName(t.playerId)}の城を選ぶ`);
    }
    this.targetRestore[0]?.el.focus({preventScroll:true});
  }

  elOfTarget(t) {
    if (t.soldierId) return this.soldierEl(t.soldierId);
    if (t.monsterId) return this.monsterEl(t.monsterId);
    if (t.roadId) return this.laneEl(t.roadId); // 兵士を出す道・魔法で狙う道
    if (t.playerId) return this.castleEl(t.playerId);
    return null;
  }

  /** タップされた要素 → 対象（光っている対象でなければ null） */
  targetFromEl(node) {
    if (!this.targets) return null;
    const sEl = node.closest('.soldier');
    const mEl = node.closest('.monster');
    const cEl = node.closest('.castle');
    const lEl = node.closest('.lane');
    if (sEl) return this.targets.find(x => x.soldierId === sEl.dataset.id) ?? (!this.isPlaza ? this.targets.find(x => x.roadId && this.laneOf(x.roadId) === this.laneOf(this.soldier(sEl.dataset.id)?.roadId)) : null) ?? null;
    if (mEl) return this.targets.find(x => x.monsterId === mEl.dataset.id) ?? (!this.isPlaza ? this.targets.find(x => x.roadId && this.laneOf(x.roadId) === this.laneOf(this.monster(mEl.dataset.id)?.roadId)) : null) ?? null;
    if (cEl) {
      const playerId = cEl.dataset.playerId ?? (cEl === this.el.castle.me ? this.viewerId : this.opponentOf(this.viewerId));
      const options = this.targets.filter(x => this.ownerOf(x.playerId) === playerId && !x.roadId && !x.soldierId && !x.monsterId);
      return options.length > 1 ? {options} : options[0] ?? null;
    }
    if (lEl) return this.targets.find((x) => x.roadId && this.laneOf(x.roadId) === Number(lEl.dataset.lane)) ?? null;
    return null;
  }
}
