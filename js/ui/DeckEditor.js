import { checkCostDeck, DECK_COST_DEFAULTS, deckCostOf, isDeckable } from '../game/Setup.js';
import { rarityMark } from './cardFrame.js';
import { cardDescription, cardShort } from './text.js';
import { deckCard, renderDeckStrip } from './DeckPreview.js';
import { deleteMyDeck, loadDecks, saveMyDeck, selectMyDeck } from './DeckStore.js';
import { canRequestFoilTilt, enableFoilTilt } from './Hologram.js';
import { sound } from './Sound.js';
import { UI_CONFIG } from './config.js';

const kinds = {
  soldier: '兵士', attack: '攻撃魔法', heal: '回復', defense: '防御',
  weapon: '武器', spirit: '精霊', resource: 'コイン・MP', special: 'その他',
};
const effectKinds = {
  damageEnemyCastle: 'attack', damageEnemySoldiers: 'attack', poisonEnemySoldiers: 'attack', poisonEnemy: 'attack',
  freezeEnemySoldiers: 'attack', healOwnCastle: 'heal', curePoison: 'heal', summonSpirit: 'spirit',
  gainCoins: 'resource', gainMp: 'resource',
};
const kindOf = def => effectKinds[def.effect] ?? (Object.hasOwn(kinds, def.kind) ? def.kind : 'special');

export class DeckEditor {
  constructor({ cards, rarities, rules, decks, animate, onChange }) {
    Object.assign(this, { cards, rarities, rules, decks, animate, onChange });
    this.min = rules.deckCostMin ?? DECK_COST_DEFAULTS.deckCostMin;
    this.max = rules.deckCostMax ?? DECK_COST_DEFAULTS.deckCostMax;
    this.types = Object.keys(cards).filter(type => isDeckable(cards[type]));
    this.rank = Object.keys(rarities);
    this.drafts = new Map();
    this.effects = new Set();
    this.box = document.createElement('dialog');
    this.box.id = 'deck-editor';
    this.box.setAttribute('aria-labelledby', 'deck-editor-title');
    this.box.innerHTML = `
      <div class="deck-box">
        <header class="deck-heading">
          <h2 id="deck-editor-title">デッキ編成</h2>
          <button type="button" class="deck-icon deck-close" aria-label="デッキ編成を閉じる" autofocus>×</button>
        </header>
        <div class="deck-tools">
          <select class="deck-slots" aria-label="デッキ枠"></select>
          <button type="button" class="deck-button deck-manage">管理</button>
          <button type="button" class="deck-button deck-recommend">おすすめで埋める</button>
        </div>
        <section class="deck-tray" aria-label="編集中のデッキ">
          <div class="deck-tray-header"><p class="deck-summary" role="status"></p><span class="deck-range"></span></div>
          <div class="deck-meter-bar meter" role="meter" aria-label="デッキの合計コスト" aria-valuemin="0"><i class="deck-meter-fill meter-fill"></i><i class="deck-meter-min"></i></div>
          <div class="deck-limits"></div>
          <div class="deck-current"></div>
        </section>
        <div class="deck-filters">
          <select class="deck-filter-rarity" aria-label="レアリティ"></select>
          <select class="deck-filter-kind" aria-label="カードの種類"></select>
          <select class="deck-sort" aria-label="並べ替え">
            <option value="rarity">レア度順</option><option value="cost">コスト順</option><option value="name">名前順</option>
          </select>
        </div>
        <ul class="deck-grid" aria-label="カード一覧"></ul>
        <footer class="deck-footer">
          <p class="deck-status" role="status"></p><button type="button" class="deck-button deck-save">保存</button>
        </footer>
      </div>
      <dialog class="deck-subdialog deck-management" aria-labelledby="deck-manage-title">
        <h3 id="deck-manage-title">デッキを管理</h3>
        <label>デッキ名<input class="deck-name-input" maxlength="24"></label>
        <label>見本から読み込む<select class="deck-preset"></select></label>
        <button type="button" class="deck-button deck-duplicate">空き枠に複製</button>
        <button type="button" class="deck-button deck-clear">カードをすべて外す</button>
        <button type="button" class="deck-button deck-delete">この枠を削除</button>
        <button type="button" class="deck-button deck-tilt" hidden>傾きで光を動かす</button>
        <p class="deck-manage-status" role="status"></p>
        <button type="button" class="deck-button deck-manage-close">完了</button>
      </dialog>
      <dialog class="deck-subdialog deck-details" aria-labelledby="deck-details-title">
        <h3 id="deck-details-title"></h3><div class="deck-detail-art"></div><p class="deck-detail-text"></p>
        <button type="button" class="deck-button deck-detail-close">閉じる</button>
      </dialog>`;
    document.getElementById('app').append(this.box);
    this.q = selector => this.box.querySelector(selector);
    this.q('.deck-range').textContent = `目標 ${this.min}〜${this.max}`;
    this.q('.deck-meter-min').style.left = `${this.min / this.max * 100}%`;
    this.q('.deck-filter-rarity').append(new Option('全レア度', ''), ...this.rank.map(id => new Option(rarities[id].name, id)));
    this.q('.deck-filter-kind').append(new Option('全種類', ''), ...Object.entries(kinds).map(([id, label]) => new Option(label, id)));
    this.q('.deck-preset').append(new Option('見本を選ぶ', ''), ...Object.entries(decks)
      .filter(([, deck]) => deck.costDeck).map(([id, deck]) => new Option(deck.name, id)));
    this.bindControls();
  }

  bindControls() {
    const onClick = (cls, fn) => this.q(cls).addEventListener('click', fn);
    onClick('.deck-close', () => this.box.close());
    onClick('.deck-save', () => this.save());
    onClick('.deck-recommend', () => this.recommend());
    onClick('.deck-manage', () => {
      this.q('.deck-manage-status').textContent = '';
      this.q('.deck-management').showModal();
    });
    onClick('.deck-manage-close', () => this.q('.deck-management').close());
    onClick('.deck-detail-close', () => this.q('.deck-details').close());
    onClick('.deck-duplicate', () => this.duplicate());
    onClick('.deck-clear', () => {
      this.draft.list = {};
      this.render();
      this.q('.deck-management').close();
    });
    onClick('.deck-delete', () => this.removeSlot());
    this.q('.deck-tilt').hidden = !canRequestFoilTilt();
    onClick('.deck-tilt', async () => {
      const enabled = await enableFoilTilt();
      this.q('.deck-manage-status').textContent = enabled ? '傾きで光が動きます' : 'カードをなぞると光が動きます';
    });
    this.q('.deck-name-input').addEventListener('input', event => { this.draft.name = event.target.value; });
    this.q('.deck-preset').addEventListener('change', event => {
      if (!event.target.value) return;
      this.draft.list = { ...this.decks[event.target.value].cards };
      event.target.value = '';
      this.render();
      this.q('.deck-management').close();
    });
    this.q('.deck-slots').addEventListener('change', event => this.useSlot(Number(event.target.value)));
    for (const select of this.box.querySelectorAll('.deck-filters select')) {
      select.addEventListener('change', () => {
        this.renderGrid();
        this.q('.deck-grid').scrollTop = 0;
      });
    }
    this.box.addEventListener('pointerdown', () => this.skipEffects(), true);
    this.box.addEventListener('close', () => {
      if (this.box.open) return;
      this.skipEffects();
      this.drafts.clear();
    });
    this.bindStripDetails();
  }

  bindStripDetails() {
    const strip = this.q('.deck-current');
    let pending;
    let handled;
    const cancel = () => {
      clearTimeout(pending?.timer);
      pending = null;
    };
    const show = button => {
      if (!Object.hasOwn(this.cards, button.dataset.type)) return;
      this.details(button.dataset.type);
    };
    strip.addEventListener('pointerdown', event => {
      const button = event.target.closest('button');
      handled = null;
      if (!button || event.button !== 0 || !Object.hasOwn(this.cards, button.dataset.type)) return;
      cancel();
      const { clientX, clientY } = event;
      pending = { clientX, clientY, timer: setTimeout(() => {
        handled = button;
        show(button);
        cancel();
      }, UI_CONFIG.input.longPress) };
    });
    strip.addEventListener('pointermove', event => {
      if (pending && Math.hypot(event.clientX - pending.clientX, event.clientY - pending.clientY) > 8) cancel();
    });
    for (const event of ['pointerup', 'pointercancel', 'pointerleave']) strip.addEventListener(event, cancel);
    strip.addEventListener('click', event => {
      if (handled?.contains(event.target)) event.stopImmediatePropagation();
      handled = null;
    }, true);
    strip.addEventListener('contextmenu', event => {
      const button = event.target.closest('button');
      if (!button || !Object.hasOwn(this.cards, button.dataset.type)) return;
      event.preventDefault();
      cancel();
      if (!this.q('.deck-details').open) show(button);
    });
    strip.addEventListener('keydown', event => {
      if (event.key !== 'ArrowDown' || !event.target.closest('button')) return;
      event.preventDefault();
      show(event.target.closest('button'));
    });
  }

  open(slot = loadDecks().active) {
    if (this.box.open) return;
    this.useSlot(slot);
    this.box.showModal();
  }

  useSlot(slot) {
    const { slots } = loadDecks();
    this.slot = slot;
    if (!this.drafts.has(slot)) {
      const sample = Object.values(this.decks).find(deck => deck.costDeck);
      const list = slot === 0 && !slots.some(Boolean) ? { ...sample?.cards } : {};
      this.drafts.set(slot, slots[slot] ?? { name: `デッキ ${slot + 1}`, list });
    }
    this.draft = this.drafts.get(slot);
    selectMyDeck(slot);
    this.q('.deck-name-input').value = this.draft.name;
    this.refreshSlots();
    this.render();
    this.onChange?.();
  }

  refreshSlots() {
    const { slots } = loadDecks();
    const select = this.q('.deck-slots');
    select.replaceChildren(...slots.map((deck, index) => new Option(`${index + 1}. ${deck?.name ?? '空き枠'}`, index)));
    select.value = this.slot;
  }

  check(list = this.draft.list) {
    return checkCostDeck(list, this.cards, this.rarities, this.rules);
  }

  whyNot(type, knownList) {
    const trial = this.check({ ...knownList, [type]: (knownList[type] ?? 0) + 1 });
    return trial.problems.find(problem => !/^合計コストが\d+未満/.test(problem));
  }

  knownList() {
    return Object.fromEntries(Object.entries(this.draft.list).filter(([type]) =>
      Object.hasOwn(this.cards, type) && isDeckable(this.cards[type])));
  }

  change(type, delta, source) {
    this.skipEffects();
    const before = this.check();
    const why = delta > 0 && this.whyNot(type, this.knownList());
    if (why) {
      this.status(why);
      sound.play('deny');
      return;
    }
    const list = this.draft.list;
    const n = (list[type] ?? 0) + delta;
    if (n > 0) list[type] = n;
    else delete list[type];
    const rect = source.getBoundingClientRect();
    const focusIndex = [...source.parentElement.children].indexOf(source);
    this.renderDeck();
    this.updateGrid();
    const strip = this.q('.deck-current');
    const target = [...strip.children].find(entry => entry.dataset.type === type);
    if (delta < 0 && !document.activeElement?.closest('#deck-editor')) {
      (target ?? strip.children[Math.min(focusIndex, strip.children.length - 1)]?.closest('button') ?? this.q('.deck-recommend')).focus();
    }
    if (delta > 0 && target) {
      const left = target.offsetLeft;
      if (left < strip.scrollLeft || left + target.offsetWidth > strip.scrollLeft + strip.clientWidth) {
        strip.scrollLeft = Math.max(0, left - strip.clientWidth + target.offsetWidth + 8);
      }
    }
    const after = this.check();
    const ready = !before.ok && after.ok;
    this.status(ready ? '目標を達成！ デッキを保存できます' : after.reason ?? '');
    const rank = Math.max(0, this.rank.indexOf(this.cards[type]?.rarity));
    sound.play(delta > 0 ? 'deckAdd' : 'deckRemove', rank / 5);
    if (ready) {
      sound.play('deckReady');
      this.playEffect(this.q('.deck-meter-bar'), [{ filter: 'brightness(1.8)' }, { filter: 'brightness(1)' }], UI_CONFIG.timing.deckReady);
    }
    if (target || delta < 0) this.flyCard(type, source, rect, delta > 0 ? target : null, rank);
  }

  playEffect(element, frames, duration) {
    if (!this.animate || UI_CONFIG.reducedMotion || UI_CONFIG.speed === 0) return Promise.resolve();
    const result = this.animate(element, frames, { duration, easing: UI_CONFIG.easing.enter });
    for (const animation of element.getAnimations()) this.effects.add(animation);
    return result.finally(() => {
      for (const animation of this.effects) if (animation.playState !== 'running') this.effects.delete(animation);
    });
  }

  skipEffects() {
    for (const effect of this.effects) {
      try { effect.finish(); } catch { effect.cancel(); }
    }
    this.effects.clear();
  }

  flyCard(type, source, rect, target, rank) {
    if (UI_CONFIG.reducedMotion || UI_CONFIG.speed === 0) return;
    const flying = deckCard(type, this.cards, this.rarities, 'deck-flying');
    const image = source.querySelector('.mini-card');
    const from = image?.getBoundingClientRect();
    const bounds = from?.width ? from : rect;
    Object.assign(flying.style, { left: `${bounds.left}px`, top: `${bounds.top}px`, width: `${bounds.width}px` });
    this.box.append(flying);
    const to = target?.querySelector('.deck-strip-card')?.getBoundingClientRect();
    const x = to ? to.left - bounds.left : 12 + rank * 3;
    const y = to ? to.top - bounds.top : 80;
    const scale = to ? to.width / bounds.width : .65;
    const glow = this.rarities[this.cards[type]?.rarity]?.color ?? '#fff';
    const frames = [
      { transform: 'translate(0, 0)', filter: `drop-shadow(0 0 ${rank * 3}px ${glow})` },
      { transform: `translate(${x}px, ${y}px) scale(${scale}) rotate(${to ? 0 : 12}deg)`, opacity: to ? .85 : 0 },
    ];
    this.playEffect(flying, frames, UI_CONFIG.timing.deckTransfer + rank * 14).then(() => flying.remove());
  }

  recommend() {
    const before = this.check();
    if (before.cost >= this.min) {
      this.status(before.ok ? '目標コストに達しています' : before.reason);
      return;
    }
    const list = this.knownList();
    const affinity = {};
    for (const [type, count] of Object.entries(list)) {
      const kind = kindOf(this.cards[type]);
      affinity[kind] = (affinity[kind] ?? 0) + count;
    }
    const candidates = [...this.types].sort((a, b) => this.cost(a) - this.cost(b)
      || (affinity[kindOf(this.cards[b])] ?? 0) - (affinity[kindOf(this.cards[a])] ?? 0));
    let added = 0;
    while (this.check(list).cost < this.min) {
      const type = candidates.find(candidate => this.cost(candidate) > 0 && !this.whyNot(candidate, list));
      if (!type) break;
      list[type] = (list[type] ?? 0) + 1;
      this.draft.list[type] = list[type];
      added++;
    }
    this.render();
    const result = this.check();
    if (result.ok) {
      sound.play('deckReady');
      this.playEffect(this.q('.deck-meter-bar'), [{ filter: 'brightness(1.8)' }, { filter: 'brightness(1)' }], UI_CONFIG.timing.deckReady);
    }
    this.status(result.ok ? `${added}枚追加。目標を達成しました` : result.reason ?? '追加できるカードがありません');
  }

  save() {
    const check = this.check();
    if (!check.ok) {
      this.status(check.problems.join('。'));
      return;
    }
    this.draft.name = this.draft.name.trim() || `デッキ ${this.slot + 1}`;
    this.q('.deck-name-input').value = this.draft.name;
    const saved = saveMyDeck(this.slot, this.draft.name, this.draft.list);
    this.refreshSlots();
    this.status(saved ? 'デッキを保存しました' : 'このページで使えます。端末には保存できませんでした');
    this.onChange?.({ slot: this.slot, list: { ...this.draft.list } });
  }

  duplicate() {
    const openSlot = loadDecks().slots.findIndex((deck, slot) => !deck && !this.drafts.has(slot));
    const check = this.check();
    const status = this.q('.deck-manage-status');
    if (openSlot < 0 || !check.ok) {
      status.textContent = openSlot < 0 ? '空き枠がありません' : check.reason;
      return;
    }
    const name = `${this.draft.name.trim().slice(0, 20)} の写し`;
    const saved = saveMyDeck(openSlot, name, this.draft.list);
    this.useSlot(openSlot);
    this.q('.deck-management').close();
    this.status(saved ? '空き枠に複製しました' : 'このページの空き枠に複製しました');
    this.onChange?.({ slot: openSlot, list: { ...this.draft.list } });
  }

  removeSlot() {
    const { slots } = loadDecks();
    if (slots[this.slot] && !window.confirm(`「${slots[this.slot].name}」を削除しますか？`)) return;
    const saved = deleteMyDeck(this.slot);
    this.drafts.delete(this.slot);
    this.drafts.set(this.slot, { name: `デッキ ${this.slot + 1}`, list: {} });
    this.useSlot(this.slot);
    this.q('.deck-management').close();
    this.status(saved ? 'デッキ枠を空にしました' : 'このページのデッキ枠を空にしました');
    this.onChange?.({ slot: this.slot });
  }

  status(message) { this.q('.deck-status').textContent = message; }
  cost(type) { return deckCostOf(this.cards[type], this.rarities); }

  render() {
    this.renderDeck();
    this.renderGrid();
    this.status(this.check().reason ?? '保存できます');
  }

  renderDeck() {
    const { cost, total, counts, ok } = this.check();
    const bar = this.q('.deck-meter-bar');
    bar.setAttribute('aria-valuemax', String(this.max));
    bar.setAttribute('aria-valuenow', String(Math.min(cost, this.max)));
    bar.setAttribute('aria-valuetext', `${cost}、目標は ${this.min}〜${this.max}`);
    bar.dataset.state = cost > this.max ? 'over' : cost < this.min ? 'low' : 'ok';
    this.q('.deck-meter-fill').style.width = `${Math.min(100, cost / this.max * 100)}%`;
    this.q('.deck-summary').textContent = `コスト ${cost} / ${this.max} · ${total}枚`;
    const limits = this.q('.deck-limits');
    limits.replaceChildren();
    for (const [id, rarity] of Object.entries(this.rarities)) {
      if (rarity.deckAs) continue;
      const n = counts[id] ?? 0;
      const meter = document.createElement('span');
      meter.className = 'deck-limit';
      meter.style.setProperty('--rarity', rarity.color);
      meter.style.setProperty('--portion', `${rarity.deckLimit ? Math.min(100, n / rarity.deckLimit * 100) : 0}%`);
      meter.textContent = `${rarityMark(id)} ${n}${rarity.deckLimit == null ? '' : '/' + rarity.deckLimit}`;
      meter.setAttribute('aria-label', `${rarity.name} ${n}枚${rarity.deckLimit == null ? '' : `・上限${rarity.deckLimit}枚`}`);
      meter.title = meter.getAttribute('aria-label');
      limits.append(meter);
    }
    const strip = this.q('.deck-current');
    const scroll = strip.scrollLeft;
    renderDeckStrip(strip, this.draft.list, this.cards, this.rarities, (type, source) => this.change(type, -1, source));
    strip.scrollLeft = scroll;
    this.q('.deck-save').setAttribute('aria-disabled', String(!ok));
  }

  renderGrid() {
    const rarity = this.q('.deck-filter-rarity').value;
    const kind = this.q('.deck-filter-kind').value;
    const sort = this.q('.deck-sort').value;
    const grid = this.q('.deck-grid');
    grid.replaceChildren();
    const types = this.types.filter(type => (!rarity || this.cards[type].rarity === rarity)
      && (!kind || kindOf(this.cards[type]) === kind));
    const byName = (a, b) => this.cards[a].name.localeCompare(this.cards[b].name, 'ja');
    types.sort((a, b) => (sort === 'cost' ? this.cost(a) - this.cost(b)
      : sort === 'rarity' ? this.rank.indexOf(this.cards[b].rarity) - this.rank.indexOf(this.cards[a].rarity) : 0)
      || byName(a, b));
    if (!types.length) {
      const empty = document.createElement('li');
      empty.className = 'deck-grid-empty';
      empty.textContent = '条件に合うカードがありません';
      grid.append(empty);
    }
    for (const type of types) {
      const def = this.cards[type];
      const item = document.createElement('li');
      item.className = 'deck-grid-item';
      item.dataset.type = type;
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'deck-add';
      const gem = document.createElement('span');
      gem.className = 'deck-gem';
      gem.style.setProperty('--rarity', this.rarities[def.rarity]?.color ?? '#9aa3ad');
      gem.textContent = String(this.cost(type));
      const hint = document.createElement('span');
      hint.className = 'deck-card-quantity';
      add.append(deckCard(type, this.cards, this.rarities, 'deck-grid-art'), gem, hint);
      add.addEventListener('click', () => this.change(type, 1, add));
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'deck-card-info';
      more.setAttribute('aria-label', `${def.name}の詳細`);
      const title = document.createElement('b');
      title.textContent = def.name;
      const short = document.createElement('span');
      short.textContent = cardShort(def).map(part => part.text).join(' · ') || cardDescription(def, this.rules);
      more.append(title, short);
      more.addEventListener('click', () => this.details(type));
      item.append(add, more);
      grid.append(item);
    }
    this.updateGrid();
  }

  updateGrid() {
    const list = this.knownList();
    for (const item of this.box.querySelectorAll('.deck-grid-item')) {
      const type = item.dataset.type;
      const def = this.cards[type];
      const count = list[type] ?? 0;
      const reason = this.whyNot(type, list);
      const add = item.querySelector('.deck-add');
      add.setAttribute('aria-label', `${def.name}を1枚追加、コスト${this.cost(type)}、${this.rarities[def.rarity]?.name ?? ''}、現在${count}枚`);
      add.setAttribute('aria-disabled', String(Boolean(reason)));
      if (reason) add.setAttribute('aria-description', reason);
      else add.removeAttribute('aria-description');
      item.querySelector('.deck-card-quantity').textContent = reason ? (count ? `×${count} · 上限` : '上限') : count ? `×${count} +` : '+';
    }
  }

  details(type) {
    const card = this.cards[type];
    this.q('#deck-details-title').textContent = card.name;
    this.q('.deck-detail-art').replaceChildren(deckCard(type, this.cards, this.rarities));
    this.q('.deck-detail-text').textContent = `${this.rarities[card.rarity]?.name ?? ''} · コスト ${this.cost(type)}。 ${cardDescription(card, this.rules)}`;
    this.q('.deck-details').showModal();
  }
}
