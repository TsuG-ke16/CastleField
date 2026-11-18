// デッキ編成の画面。レアリティごとのコスト・上限（rarities.json の deckCost / maxCopies / deckLimit、
// rules.json の deckCostMin / deckCostMax）の決まりは、ロジックと同じ checkCostDeck で確かめる。
// 決まりに合うデッキだけ保存できる。カード名・説明は textContent / 既存の関数で出す。
import { checkCostDeck, deckRarityOf, deckCostOf, isDeckable } from '../game/Setup.js';
import { cardDescription } from './text.js';
import { loadMyDeck, saveMyDeck } from './DeckStore.js';

export class DeckEditor {
  /**
   * @param {object} o
   * @param {object} o.cards cards.json
   * @param {object} o.rarities rarities.json
   * @param {object} o.rules rules.json
   * @param {object} o.decks decks.json（costDeck: true の見本を読み込める）
   * @param {(list: object) => void} [o.onSave] 保存したとき
   */
  constructor({ cards, rarities, rules, decks, onSave }) {
    this.cards = cards;
    this.rarities = rarities;
    this.rules = rules;
    this.decks = decks ?? {};
    this.onSave = onSave;
    this.list = {};
    this.filter = 'all';
    this.box = document.createElement('div');
    this.box.id = 'deck-editor';
    this.box.className = 'screen dim';
    this.box.hidden = true;
    this.box.setAttribute('role', 'dialog');
    this.box.setAttribute('aria-modal', 'true');
    this.box.setAttribute('aria-labelledby', 'deck-editor-title');
    this.box.innerHTML =
      '<div class="screen-box parchment deck-box">' +
      '<h2 id="deck-editor-title">デッキ編成</h2>' +
      '<div class="deck-meter" role="status" aria-live="polite"><div class="deck-meter-bar meter"><i class="deck-meter-fill meter-fill"></i><i class="deck-meter-min"></i></div><p class="deck-summary"></p></div>' +
      '<p class="deck-limits"></p>' +
      '<div class="deck-tools"><label>見本から読み込む <select class="deck-preset"></select></label><button type="button" class="small-btn deck-clear">空にする</button></div>' +
      '<div class="deck-tabs" role="tablist" aria-label="レアリティ"></div>' +
      '<ul class="deck-rows inset-panel"></ul>' +
      '<ul class="deck-problems" role="alert"></ul>' +
      '<div class="deck-actions"><button type="button" class="plank-btn deck-save">保存</button><button type="button" class="small-btn deck-close">閉じる</button></div>' +
      '<p class="deck-status" role="status"></p></div>';
    document.getElementById('app').append(this.box);
    this.q = (s) => this.box.querySelector(s);
    this.q('.deck-close').addEventListener('click', () => this.close());
    this.q('.deck-save').addEventListener('click', () => this.save());
    this.q('.deck-clear').addEventListener('click', () => { this.list = {}; this.render(); });
    this.box.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); });
    const preset = this.q('.deck-preset');
    preset.append(new Option('選んでください', ''));
    for (const [id, d] of Object.entries(this.decks)) if (d.costDeck) preset.append(new Option(d.name ?? id, id));
    preset.addEventListener('change', () => {
      const d = this.decks[preset.value];
      if (d) { this.list = { ...d.cards }; this.render(); }
      preset.value = '';
    });
    // レアリティの絞り込み（スペシャルはレアと同じ枠なので、レアに入れる）
    const tabs = this.q('.deck-tabs');
    const ids = Object.keys(rarities).filter((id) => !rarities[id].deckAs);
    for (const [id, label] of [['all', 'すべて'], ...ids.map((r) => [r, rarities[r].name])]) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'deck-tab'; b.dataset.filter = id; b.textContent = label;
      b.setAttribute('role', 'tab');
      b.addEventListener('click', () => { this.filter = id; this.render(); });
      tabs.append(b);
    }
  }

  /** 開く。いま覚えているマイデッキ（なければ見本）から始める */
  open() {
    const mine = loadMyDeck();
    const first = Object.values(this.decks).find((d) => d.costDeck);
    this.list = mine ?? (first ? { ...first.cards } : {});
    this.filter = 'all';
    this.q('.deck-status').textContent = '';
    this.box.hidden = false;
    this.render();
    this.q('.deck-close').focus({ preventScroll: true });
  }

  close() {
    this.box.hidden = true;
  }

  get check() {
    return checkCostDeck(this.list, this.cards, this.rarities, this.rules);
  }

  /** そのカードをもう1枚足せない理由（足せるなら null） */
  whyNot(type) {
    const trial = checkCostDeck({ ...this.list, [type]: (this.list[type] ?? 0) + 1 }, this.cards, this.rarities, this.rules);
    // 合計コストが足りないだけのときは、足すのをじゃましない（足りない側は、足していけば満たせる）
    return trial.problems.find((p) => !/未満/.test(p)) ?? null;
  }

  change(type, delta) {
    const n = (this.list[type] ?? 0) + delta;
    if (n < 0) return;
    if (delta > 0 && this.whyNot(type)) return;
    if (n === 0) delete this.list[type]; else this.list[type] = n;
    this.q('.deck-status').textContent = '';
    this.render();
  }

  save() {
    const c = this.check;
    if (!c.ok) {
      this.q('.deck-status').textContent = `保存できません：${c.reason}`;
      return;
    }
    saveMyDeck(this.list);
    this.q('.deck-status').textContent = '保存しました。ひとりで遊ぶ・部屋で「マイデッキ」を選ぶと使えます';
    this.onSave?.({ ...this.list });
  }

  render() {
    const { cost, total, counts, problems, ok } = this.check;
    const { deckCostMin: min, deckCostMax: max } = this.rules;
    const fill = this.q('.deck-meter-fill');
    fill.style.width = `${Math.min(100, (cost / max) * 100)}%`;
    this.q('.deck-meter-bar').dataset.state = cost > max ? 'over' : cost < min ? 'low' : 'ok';
    this.q('.deck-meter-min').style.left = `${(min / max) * 100}%`;
    this.q('.deck-summary').textContent = `コスト ${cost}（${min}〜${max}にしてください）・${total}枚`;
    // レアリティごとの枚数と上限
    const parts = [];
    for (const [id, r] of Object.entries(this.rarities)) {
      if (r.deckAs) continue;
      parts.push(`${r.name} ${counts[id] ?? 0}${r.deckLimit != null ? `/${r.deckLimit}` : ''}枚（コスト${r.deckCost}）`);
    }
    this.q('.deck-limits').textContent = `${parts.join(' · ')}　※スペシャルはレアと同じ扱い`;
    for (const t of this.box.querySelectorAll('.deck-tab')) {
      const on = t.dataset.filter === this.filter;
      t.setAttribute('aria-selected', String(on));
      t.classList.toggle('on', on);
    }
    const rows = this.q('.deck-rows');
    rows.replaceChildren();
    const order = Object.keys(this.rarities);
    const types = Object.keys(this.cards).filter((t) => isDeckable(this.cards[t]))
      .filter((t) => this.filter === 'all' || deckRarityOf(this.cards[t], this.rarities) === this.filter)
      .sort((a, b) => order.indexOf(this.cards[b].rarity) - order.indexOf(this.cards[a].rarity) || a.localeCompare(b));
    for (const type of types) {
      const def = this.cards[type];
      const n = this.list[type] ?? 0;
      const li = document.createElement('li');
      li.className = 'deck-row';
      li.dataset.type = type;
      li.dataset.rarity = def.rarity;
      li.style.setProperty('--rarity', this.rarities[def.rarity]?.color ?? '#999');
      li.classList.toggle('in', n > 0);
      const name = document.createElement('div');
      name.className = 'deck-name';
      const b = document.createElement('b'); b.textContent = def.name;
      const c = document.createElement('span'); c.className = 'deck-cost'; c.textContent = `コスト${deckCostOf(def, this.rarities)}`;
      const d = document.createElement('small'); d.textContent = cardDescription(def, this.rules);
      name.append(b, c, d);
      const ctl = document.createElement('div');
      ctl.className = 'deck-count';
      const minus = document.createElement('button'); minus.type = 'button'; minus.textContent = '−'; minus.disabled = n === 0;
      minus.setAttribute('aria-label', `${def.name}を1枚減らす`);
      minus.addEventListener('click', () => this.change(type, -1));
      const num = document.createElement('output'); num.textContent = String(n);
      const plus = document.createElement('button'); plus.type = 'button'; plus.textContent = '＋';
      plus.setAttribute('aria-label', `${def.name}を1枚増やす`);
      const why = this.whyNot(type);
      plus.disabled = Boolean(why);
      if (why) plus.title = why;
      plus.addEventListener('click', () => this.change(type, 1));
      ctl.append(minus, num, plus);
      li.append(name, ctl);
      rows.append(li);
    }
    const list = this.q('.deck-problems');
    list.replaceChildren(...(ok ? [] : problems).map((p) => { const li = document.createElement('li'); li.textContent = p; return li; }));
    this.q('.deck-save').disabled = !ok;
  }
}
