// 手札の表示と入力。カードを使う方法は3つ（js/ui/config.js の input で切り替え）：
//   1. タップで選ぶ →「使う」ボタン
//   2. 選んだカードをもう一度タップ
//   3. カードを上（盤面）へドラッグして離す
// 捨てるカードを選ぶ画面もここで扱う。

import { currentRates } from './CardInfo.js';
import { UI_CONFIG } from './config.js';
import { groupStarts, sortHand } from './handOrder.js';
import { KIND_LABEL, cardDescription, cardShort, slotNote } from './text.js';
import { cardArt, icon, isAssetReady } from './art.js';
import { sound } from './Sound.js';
import { cardSkinNow, frameAsset, kindIcon, rarityIcon, rarityMark } from './cardFrame.js';

const $ = (id) => document.getElementById(id);

export class HandView {
  /**
   * @param {{ cards: object, rules: object, textOpts?: object,
   *           onPlay: (cardId: string) => void,
   *           onDiscard: (cardIds: string[]) => void,
   *           onNotice: (text: string) => void }} opts
   */
  constructor({ cards, rules, rarities = null, textOpts = {}, getContext = () => ({}), onPlay, onDiscard, onNotice }) {
    this.rarities = rarities;
    this.getContext = getContext;
    this.cards = cards;
    this.rules = rules;
    this.textOpts = textOpts; // 説明文の切りかえ（魔物が出るゲームか など）
    this.onPlay = onPlay;
    this.onDiscard = onDiscard;
    this.onNotice = onNotice;

    this.hand = [];          // [{ cardId, type }]
    this.selectedId = null;
    this.locked = true;      // 演出中・交代画面中は操作しない
    // ランクカードの装備が変わったら、手札を同じ並びのまま描き直す（枠が変わる）
    document.addEventListener('cardskinchange', () => { if (this.hand?.length) this.render(this.hand); });
    this.blocked = new Map(); // 出せないカード：cardId → 理由（見た目を暗くするだけ。押せば理由が出る）
    this.discardCount = 0;   // 0 以外なら「捨てるカードを選ぶ」モード
    this.discardPicks = new Set();
    this.drag = null;

    this.el = {
      app: $('app'),
      controls: $('controls'),
      hand: $('hand'),
      field: $('field'),
      dropHint: $('drop-hint'),
      detail: $('card-detail'),
      detailKind: document.querySelector('#card-detail .detail-kind'),
      detailName: document.querySelector('#card-detail .detail-name'),
      detailDesc: document.querySelector('#card-detail .detail-desc'),
      detailHint: document.querySelector('#card-detail .detail-hint'),
      detailUse: document.querySelector('#card-detail .detail-use'),
      discardBar: $('discard-bar'),
      discardMsg: document.querySelector('#discard-bar .discard-msg'),
      discardOk: document.querySelector('#discard-bar .discard-ok'),
    };

    this.el.detail.querySelector('.detail-close').onclick = () => this.select(null);
    let press;
    const stopPress = () => { clearTimeout(press?.timer); press = null; };
    this.el.hand.addEventListener('pointerdown', (e) => {
      this.suppressClick = false;
      const card = e.target.closest('.card'); if (!card || this.discardCount || (e.button !== undefined && e.button !== 0)) return;
      stopPress();
      press = { x: e.clientX, y: e.clientY, timer: setTimeout(() => {
        this.select(card.dataset.id); this.suppressClick = true; this.cancelDrag();
      }, UI_CONFIG.input.longPress) };
    });
    this.el.hand.addEventListener('pointermove', (e) => { if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > UI_CONFIG.input.dragStartDistance) stopPress(); });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) this.el.hand.addEventListener(event, stopPress);
    this.el.hand.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      // 右クリックで、選んでいるカードを手札に戻す（誤操作防止）
      if (!this.drag && this.selectedId && !this.discardCount) this.select(null);
    });
    const refill = $('hand-refill');
    if (refill) refill.textContent = rules.drawUntilHand > 0 ? `毎ターン${rules.drawUntilHand}枚まで補充` : '';
    // Esc で、選んでいるカードを手札に戻す
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.drag && this.selectedId && !this.discardCount && !this.locked) this.select(null);
    });
    this.el.hand.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.card')) {
        e.preventDefault();
        e.target.click();
        if(this.selectedId&&!this.el.detail.hidden)this.el.detailUse.focus({preventScroll:true});
      }
    });
    this.el.hand.addEventListener('click', (e) => this.handleClick(e));
    this.el.hand.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
    this.el.detailUse.addEventListener('click', () => {
      if (!this.locked && this.selectedId) this.play(this.selectedId);
    });
    this.el.discardOk.addEventListener('click', () => {
      if (this.locked || !this.discardCount) return;
      const left = this.discardCount - this.discardPicks.size;
      if (left > 0) this.onNotice(`捨てるカードをあと${left}枚えらんでください`);
      else this.onDiscard([...this.discardPicks]);
    });
    // 手札の外をタップしたら選択をやめる
    window.addEventListener('resize', () => this.layout());
    this.el.app.addEventListener('click', (e) => {
      if (this.selectedId && !e.target.closest('#hand, #card-detail, #debug-panel, #debug-toggle')) this.select(null);
    });
  }

  // ---------- 表示 ----------

  /**
   * @param {{cardId:string,type:string}[]} hand
   * @param {{ newIds?: Iterable<string> }} opts
   */
  render(hand, { newIds = [] } = {}) {
    // 並び：種類順 → レアリティの高い順（js/ui/handOrder.js）
    this.hand = sortHand(hand.map((c) => ({ ...c })), this.cards, this.rarities);
    if (this.selectedId && !this.hand.some((c) => c.cardId === this.selectedId)) this.selectedId = null;
    for (const id of [...this.discardPicks]) if (!this.hand.some((c) => c.cardId === id)) this.discardPicks.delete(id);
    const fresh = new Set(newIds);
    const box = this.el.hand;
    box.innerHTML = '';
    if (this.hand.length === 0) {
      box.innerHTML = '<div class="hand-empty">手札がありません</div>';
    }
    for (const card of this.hand) box.appendChild(this.makeCardEl(card, fresh.has(card.cardId)));
    this.markCards();
    this.layout();
    this.updateDetail();
    this.updateDiscardBar();
  }

  /** 今の手札が、server/Game の手札と同じカードの集まりか（並びは見ない。表示は並べ替えてあるため） */
  sameCards(hand) {
    if (hand.length !== this.hand.length) return false;
    const ids = new Set(this.hand.map((c) => c.cardId));
    return hand.every((c) => ids.has(c.cardId));
  }

  /** グループと合成の印は、手札が1枚増減したときも付け直す。 */
  markCards() {
    const starts = groupStarts(this.hand, this.cards);
    const counts = new Map();
    const types = new Map();
    for (const { cardId, type } of this.hand) {
      counts.set(type, (counts.get(type) ?? 0) + 1);
      types.set(cardId, type);
    }
    const hasWild = [...counts.keys()].some(type => this.cards[type]?.effect === 'wild');
    const canMatchWild = [...counts.keys()].some(type => this.cards[type]?.fuseTo);
    for (const el of this.el.hand.querySelectorAll('.card')) {
      const type = types.get(el.dataset.id);
      const def = this.cards[type];
      const fusable = def?.effect === 'wild' ? canMatchWild : Boolean(def?.fuseTo && (hasWild || counts.get(type) >= 2));
      el.classList.toggle('group-start', starts.has(el.dataset.id));
      el.classList.toggle('can-fuse', fusable);
      this.applyCardClasses(el);
    }
  }

  /** カードを重ねず、全体が読める幅で横に並べる。 */
  layout() {
    const box = this.el.hand;
    const cards = box.querySelectorAll('.card');
    box.style.setProperty('--gap', '8px');
    const count = $('hand-count');
    if (count) count.textContent = `手札 ${cards.length}枚`;
    // 描画直後にも測定できるよう、幅はレイアウト済みの値を使う。
    const overflow = box.scrollWidth > box.clientWidth;
    const hint = document.querySelector('.hand-scroll-hint'); if (hint) hint.hidden = !overflow;
    this.el.controls.classList.toggle('hand-scrolls', overflow);
  }

  /** カードの色（兵士の絵を、持ち主の色で描く） */
  setColor(color) {
    this.color = color;
  }

  makeCardEl(card, isNew = false) {
    const def = this.cards[card.type] ?? { name: card.type };
    const el = document.createElement('div');
    el.className = `card ${def.kind ?? ''}${def.exhaust ? ' exhaust' : ''}${def.effect === 'wild' ? ' wild' : ''}`;
    el.dataset.id = card.cardId;
    if (def.monster) el.dataset.beast = def.monster;
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', `${def.name}。${cardDescription(def, this.rules, this.textOpts)}`);
    if (def.element) el.dataset.element = def.element;
    const mpCost = this.mpCosts?.[card.type] ?? 0;
    el.innerHTML = '<span class="card-kind"></span><div class="card-art"></div><span class="card-name"></span>' +
      '<span class="card-short"></span><span class="card-exhaust">使い切り</span>';
    // ランクカード（表の枠）を装備しているときは、レアリティの色・光を出さない（common と同じ扱い）
    const skin = def.monster ? null : cardSkinNow();
    if (skin) el.dataset.skin = skin;
    if (def.rarity && this.rarities?.[def.rarity]) {
      el.dataset.rarity = skin ? 'common' : def.rarity;
      el.style.setProperty('--rarity', this.rarities[def.rarity].color);
      const badge = document.createElement('span');
      badge.className = 'card-rarity';
      badge.innerHTML = icon(rarityIcon(def.rarity), rarityMark(def.rarity));
      badge.title = `${this.rarities[def.rarity].name}（${rarityMark(def.rarity)}）`;
      badge.setAttribute('role', 'img');
      badge.setAttribute('aria-label', badge.title);
      el.appendChild(badge);
    }
    const framePath = frameAsset(def, this.rarities);
    if (framePath) {
      const frame = document.createElement('img');
      frame.className = 'card-frame';
      frame.src = `assets/${framePath}`;
      frame.alt = '';
      frame.draggable = false;
      el.prepend(frame);
      if (isAssetReady(framePath)) el.classList.add('has-frame');
    }
    const kind = el.querySelector('.card-kind');
    if (framePath) {
      kind.innerHTML = icon(kindIcon(def));
      kind.title = def.effect === 'wild' ? 'どれにもなれる（適応）' : KIND_LABEL[def.kind] ?? '';
      kind.setAttribute('role', 'img');
      kind.setAttribute('aria-label', kind.title);
    } else kind.textContent = KIND_LABEL[def.kind] ?? '';
    el.querySelector('.card-art').innerHTML = cardArt(card.type, this.color ?? 'blue', def.name ?? '');
    const name = el.querySelector('.card-name');
    name.textContent = def.name;
    if (String(def.name ?? '').length >= 6) name.classList.add('long');
    const short = el.querySelector('.card-short');
    for (const part of cardShort(def)) {
      const span = document.createElement('span');
      span.innerHTML = icon(part.icon);
      span.appendChild(document.createTextNode(String(part.text)));
      short.appendChild(span);
    }
    el.title = cardDescription(def, this.rules, this.textOpts);
    // MP を使うカードは、右上に必要な MP を出す
    if (mpCost > 0) {
      // 絵に重ねず、下の効果の行に「MP 3」と書く
      const badge = document.createElement('span');
      badge.className = 'card-mp';
      badge.textContent = `MP${mpCost}`;
      badge.title = `MP ${mpCost} を使います`;
      short.appendChild(badge);
      el.title += `（MP${mpCost}を使う）`;
      el.setAttribute('aria-label', `${el.getAttribute('aria-label')}（MP${mpCost}）`);
    }
    if (def.effect === 'gainMp') {
      const mark = document.createElement('span'); mark.className = 'mana-recovery'; mark.textContent = `MP +${def.amount}`; el.append(mark);
    }
    if (isNew) el.classList.add('new');
    this.applyCardClasses(el);
    return el;
  }

  applyCardClasses(el) {
    const id = el.dataset.id;
    const reason = this.blocked.get(id);
    const description = [reason && `今は出せません：${reason}`, el.classList.contains('can-fuse') && '合成できる組み合わせがあります。']
      .filter(Boolean).join(' ');
    if (description) el.setAttribute('aria-description', description);
    else el.removeAttribute('aria-description');
    el.classList.toggle('selected', id === this.selectedId);
    el.classList.toggle('dim', this.blocked.has(id) && !this.discardCount);
    el.classList.toggle('discard-pick', this.discardPicks.has(id));
  }

  refreshClasses() {
    for (const el of this.el.hand.querySelectorAll('.card')) this.applyCardClasses(el);
  }

  /** 手札を一度空にする（手番交代の画面を出すとき、前の人の手札を残さない） */
  clear() {
    this.hand = [];
    this.selectedId = null;
    this.discardCount = 0;
    this.discardPicks.clear();
    this.cancelDrag();
    this.el.hand.innerHTML = '';
    this.layout();
    this.updateDetail();
    this.updateDiscardBar();
  }

  setLocked(locked) {
    this.locked = locked;
    if (locked) this.cancelDrag();
    this.updateDetail();
  }

  /** @param {Map<string, string>} blocked 出せないカード：cardId → 理由 */
  setPlayability(blocked) {
    this.blocked = blocked;
    this.refreshClasses();
    this.updateDetail();
  }

  /** カードを出したあと：残りの手札はすべて出せない（理由は押したときに Game から出る） */
  blockAll() {
    this.setPlayability(new Map(this.hand.map((c) => [c.cardId, ''])));
  }

  cardEl(cardId) {
    return this.el.hand.querySelector(`.card[data-id="${CSS.escape(cardId)}"]`);
  }

  /** 演出用：カードを手札から抜き、抜く前の位置と見た目の複製を返す */
  takeCard(cardId) {
    const el = this.cardEl(cardId);
    let info = null;
    if (el) {
      info = { rect: el.getBoundingClientRect(), clone: el.cloneNode(true) };
      el.remove();
    }
    this.hand = this.hand.filter((c) => c.cardId !== cardId);
    if (this.selectedId === cardId) this.selectedId = null;
    if (this.hand.length === 0 && !this.el.hand.querySelector('.hand-empty')) {
      this.el.hand.innerHTML = '<div class="hand-empty">手札がありません</div>';
    }
    this.markCards();
    this.layout();
    this.updateDetail();
    return info;
  }

  /** 引いたカードを1枚ずつ加える */
  addCard(card) {
    this.el.hand.querySelector('.hand-empty')?.remove();
    // 引いたカードは、並びの正しい位置に入れる（いつも右端に付けない）
    this.hand = sortHand([...this.hand, { ...card }], this.cards, this.rarities);
    const at = this.hand.findIndex((c) => c.cardId === card.cardId);
    const el = this.makeCardEl(card, true);
    const next = this.hand[at + 1] ? this.cardEl(this.hand[at + 1].cardId) : null;
    this.el.hand.insertBefore(el, next);
    this.markCards();
    this.layout();
  }

  /** 出せなかったカードを揺らす */
  deny(cardId) {
    sound.play('deny');
    const el = this.cardEl(cardId);
    if (!el) return;
    el.classList.remove('denied');
    void el.offsetWidth;
    el.classList.add('denied');
  }

  // ---------- 選択と「使う」 ----------

  select(cardId) {
    if (cardId !== this.selectedId) this.el.detail.querySelector('.detail-extra').open = false;
    if (cardId && cardId !== this.selectedId) sound.play('tap');
    this.selectedId = cardId;
    this.refreshClasses();
    this.updateDetail();
  }

  play(cardId) {
    const reason = this.blocked.get(cardId);
    if (reason) {
      if (this.selectedId !== cardId) this.select(cardId);
      this.deny(cardId);
      this.onNotice(reason);
      return;
    }
    this.select(null);
    this.onPlay(cardId);
  }

  updateDetail() {
    const card = this.hand.find((c) => c.cardId === this.selectedId);
    if (!card || this.discardCount) {
      this.onMpSelect?.(0);
      this.el.detail.hidden = true;
      return;
    }
    const def = this.cards[card.type] ?? { name: card.type };
    this.onMpSelect?.(this.mpCosts?.[card.type] ?? 0);
    const input = UI_CONFIG.input;
    this.el.detailKind.textContent = KIND_LABEL[def.kind] ?? '';
    this.el.detailName.textContent = def.name;
    this.el.detailDesc.textContent = cardDescription(def, this.rules, this.textOpts);
    const reason = this.blocked.get(card.cardId);
    this.el.detailHint.classList.toggle('warn', Boolean(reason));
    if (reason) this.el.detailHint.textContent = `いまは出せません：${reason}`;
    else this.el.detailHint.textContent = slotNote(def);
    const rarity = this.rarities?.[def.rarity];
    const badge = this.el.detail.querySelector('.detail-rarity');
    badge.textContent = rarity?.name ?? '';
    badge.style.setProperty('--rarity', rarity?.color ?? '#999');
    const meta = this.el.detail.querySelector('.detail-meta');
    const context = this.getContext();
    const rates = currentRates(context, this.cards, this.rarities);
    const boosted = Boolean(context.session?.getState(context.viewerId)?.players[context.viewerId]?.luck);
    const next = def.fuseTo ? this.cards[def.fuseTo]?.name : null;
    meta.textContent = `${next ? `合成先：${next}（同じカード2枚）` : def.effect === 'wild' ? '合成：合成先のあるカードと組み合わせられます' : '合成：これ以上合成できません'} ／ 排出率${boosted ? '（祈り中）' : ''} ${Number(rates[card.type] ?? 0).toFixed(3)}%`;
    this.el.detailUse.disabled = this.locked;
    this.el.detailUse.hidden = !input.useButton;
    this.el.detailUse.classList.toggle('blocked', this.blocked.has(card.cardId));
    this.el.detailUse.textContent = reason ? '理由を確認' : '使う';
    this.el.detail.hidden = false;
  }

  handleClick(e) {
    if (this.suppressClick) { this.suppressClick = false; return; }
    if (this.drag?.moved) return;
    const el = e.target.closest('.card');
    if (!el) return;
    const id = el.dataset.id;
    if (this.locked) { this.select(id); return; }

    if (this.discardCount) {
      this.toggleDiscard(id);
      return;
    }
    const input = UI_CONFIG.input;
    if (id === this.selectedId) {
      if (input.tapAgain) this.play(id);
      else this.select(null);
      return;
    }
    // 選ぶ方法がどれも無効なら、タップで即使う（押して何も起きない、を避ける）
    if (!input.useButton && !input.tapAgain && !input.dragToPlay) {
      this.play(id);
      return;
    }
    this.select(id);
  }

  // ---------- ドラッグで使う ----------

  handlePointerDown(e) {
    if (this.locked || this.discardCount || !UI_CONFIG.input.dragToPlay) return;
    if (e.button !== undefined && e.button !== 0) return;
    const el = e.target.closest('.card');
    if (!el) return;
    this.drag = { id: el.dataset.id, el, startX: e.clientX, startY: e.clientY, moved: false, ghost: null, pointerId: e.pointerId };
    const move = (ev) => this.handlePointerMove(ev);
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('contextmenu', cancel);
      window.removeEventListener('keydown', cancel);
      this.handlePointerUp(ev);
    };
    const cancel = (ev) => {
      if (ev?.type === 'keydown' && ev.key !== 'Escape') return;
      if (ev?.type === 'contextmenu' || ev?.type === 'keydown') ev.preventDefault();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('contextmenu', cancel);
      window.removeEventListener('keydown', cancel);
      this.cancelDrag();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    // ドラッグ中に右クリック・Esc で、出さずに手札に戻す
    window.addEventListener('contextmenu', cancel);
    window.addEventListener('keydown', cancel);
  }

  handlePointerMove(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved) {
      // 上向きに動かしたときだけドラッグ（横は手札のスライドにまかせる）
      if (-dy < UI_CONFIG.input.dragStartDistance || Math.abs(dy) < Math.abs(dx)) return;
      d.moved = true;
      d.ghost = d.el.cloneNode(true);
      d.ghost.classList.remove('selected', 'new', 'denied');
      d.ghost.classList.add('drag-ghost');
      this.el.app.appendChild(d.ghost);
      d.el.classList.add('drag-source');
      this.el.dropHint.hidden = false;
      this.select(null);
    }
    const app = this.el.app.getBoundingClientRect();
    d.ghost.style.left = `${e.clientX - app.left}px`;
    d.ghost.style.top = `${e.clientY - app.top}px`;
    this.el.dropHint.classList.toggle('active', this.overField(e));
  }

  handlePointerUp(e) {
    const d = this.drag;
    if (!d) return;
    if (d.moved && this.overField(e)) {
      const id = d.id;
      this.cancelDrag();
      this.play(id);
      return;
    }
    this.cancelDrag();
  }

  overField(e) {
    const r = this.el.field.getBoundingClientRect();
    const board = document.getElementById('board').getBoundingClientRect();
    return e.clientY < r.bottom && e.clientY > board.top && e.clientX > board.left && e.clientX < board.right;
  }

  cancelDrag() {
    const d = this.drag;
    if (!d) return;
    d.ghost?.remove();
    d.el.classList.remove('drag-source');
    this.el.dropHint.hidden = true;
    this.el.dropHint.classList.remove('active');
    // click イベントが後から来るので、少し後に drag を消す
    if (d.moved) setTimeout(() => { if (this.drag === d) this.drag = null; }, 0);
    else this.drag = null;
  }

  // ---------- 捨てるカードを選ぶ ----------

  /** @param {number} count 捨てる枚数 @param {number} [maxHand] 手札の上限（城の種類で変わる） */
  enterDiscard(count, maxHand) {
    this.maxHand = maxHand;
    this.discardCount = count;
    this.discardPicks.clear();
    this.select(null);
    this.el.controls.classList.add('discarding');
    this.refreshClasses();
    this.updateDiscardBar();
  }

  exitDiscard() {
    this.discardCount = 0;
    this.discardPicks.clear();
    this.el.controls.classList.remove('discarding');
    this.refreshClasses();
    this.updateDiscardBar();
  }

  toggleDiscard(cardId) {
    if (this.discardPicks.has(cardId)) this.discardPicks.delete(cardId);
    else if (this.discardPicks.size < this.discardCount) this.discardPicks.add(cardId);
    else {
      // 上限まで選んでいたら、いちばん古い選択と入れかえる
      const first = this.discardPicks.values().next().value;
      this.discardPicks.delete(first);
      this.discardPicks.add(cardId);
    }
    this.refreshClasses();
    this.updateDiscardBar();
  }

  updateDiscardBar() {
    if (!this.discardCount) {
      this.el.discardBar.hidden = true;
      return;
    }
    const left = this.discardCount - this.discardPicks.size;
    this.el.discardMsg.textContent = left > 0
      ? `手札が${this.maxHand ?? this.rules.maxHand}枚を超えています。捨てるカードをあと${left}枚えらんでください`
      : `この${this.discardCount}枚を捨てます`;
    this.el.discardOk.textContent = `捨てる（${this.discardPicks.size}/${this.discardCount}）`;
    this.el.discardOk.classList.toggle('not-ready', left > 0);
    this.el.discardBar.hidden = false;
  }
}
