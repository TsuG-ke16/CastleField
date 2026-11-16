import { cardArt, monsterArt, icon } from './art.js';
import { KIND_LABEL, cardDescription, cardShort, elementName } from './text.js';
import { currentRates, fusionPaths } from './CardInfo.js';
import { rewardOdds } from '../game/Setup.js';

const node = (tag, cls, text) => {
  const el = document.createElement(tag); el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
};

export class CardGuide {
  constructor({ cards, rarities, rules, monsters, getContext, debug }) {
    Object.assign(this, { cards, rarities, rules, monsters, getContext, debug });
    this.filters = { rarity: '', kind: '' };
    this.screen = node('div', 'screen dim guide-screen'); this.screen.id = 'card-guide'; this.screen.hidden = true;
    this.box = node('section', 'parchment guide-box');
    this.box.setAttribute('role', 'dialog'); this.box.setAttribute('aria-modal', 'true'); this.box.setAttribute('aria-labelledby', 'guide-title');
    const head = node('div', 'progress-head');
    const title = node('h2', 'menu-title', 'カード・魔物図鑑'); title.id = 'guide-title';
    this.closeButton = node('button', 'round-btn', '×'); this.closeButton.type = 'button'; this.closeButton.setAttribute('aria-label', '一覧を閉じる');
    this.closeButton.onclick = () => this.close(); head.append(title, this.closeButton);
    this.tabs = node('div', 'guide-tabs'); this.tabs.setAttribute('role', 'tablist');
    for (const [key, label] of [['cards', 'カード'], ['monsters', '魔物'], ['rates', '排出率']]) {
      const button = node('button', 'small-btn', label); button.type = 'button'; button.dataset.tab = key; button.id = `guide-tab-${key}`;
      button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', 'guide-content');
      button.onclick = () => this.render(key);
      button.onkeydown = (e) => {
        if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
        e.preventDefault(); const all = [...this.tabs.children], index = all.indexOf(button);
        const next = all[(index + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length]; next.click(); next.focus();
      };
      this.tabs.append(button);
    }
    this.content = node('div', 'guide-content'); this.content.id = 'guide-content'; this.content.setAttribute('role', 'tabpanel');
    this.box.append(head, this.tabs, this.content); this.screen.append(this.box); document.getElementById('app').append(this.screen);
    this.screen.onclick = (e) => { if (e.target === this.screen) this.close(); };
    this.screen.onkeydown = (e) => {
      if (e.key === 'Escape') this.close();
      if (e.key !== 'Tab') return;
      const items = [...this.box.querySelectorAll('button:not(:disabled), select, input, summary')].filter((el) => el.tabIndex >= 0);
      if (e.shiftKey && document.activeElement === items[0]) { e.preventDefault(); items.at(-1)?.focus(); }
      else if (!e.shiftKey && document.activeElement === items.at(-1)) { e.preventDefault(); items[0]?.focus(); }
    };
    for (const id of ['title-catalog', 'menu-catalog']) document.getElementById(id).onclick = () => {
      document.getElementById('menu').hidden = true; this.open('cards');
    };
  }
  open(tab = 'cards') {
    this.returnFocus = document.activeElement; this.screen.hidden = false; this.render(tab); this.closeButton.focus();
  }
  close() { this.screen.hidden = true; this.returnFocus?.focus({ preventScroll: true }); }
  rates() { return currentRates(this.getContext(), this.cards, this.rarities); }
  render(tab) {
    this.tab = tab;
    for (const button of this.tabs.children) {
      const active = button.dataset.tab === tab; button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
    }
    this.content.setAttribute('aria-labelledby', `guide-tab-${tab}`); this.content.replaceChildren(); this.content.scrollTop = 0;
    if (tab === 'cards') this.renderCards();
    if (tab === 'monsters') this.renderMonsters();
    if (tab === 'rates') this.renderRates();
  }
  renderCards() {
    const filters = node('div', 'guide-filters');
    for (const [key, label, options] of [['rarity', 'レアリティ', Object.entries(this.rarities ?? {}).map(([id, r]) => [id, r.name])], ['kind', '種類', Object.entries(KIND_LABEL)]]) {
      const field = node('label', '', label), select = node('select', ''); select.setAttribute('aria-label', label);
      for (const [id, text] of [['', 'すべて'], ...options]) { const option = node('option', '', text); option.value = id; select.append(option); }
      select.value = this.filters[key]; select.onchange = () => { this.filters[key] = select.value; this.render('cards'); this.content.querySelector(`select[aria-label="${label}"]`)?.focus(); };
      field.append(select); filters.append(field);
    }
    this.content.append(filters);
    const rates = this.rates(); let count = 0;
    for (const [rarityId, rarity] of Object.entries(this.rarities ?? {})) {
      if (this.filters.rarity && this.filters.rarity !== rarityId) continue;
      const members = Object.entries(this.cards).filter(([, c]) => c.rarity === rarityId && (!this.filters.kind || c.kind === this.filters.kind));
      if (!members.length) continue;
      this.content.append(node('h3', 'guide-group-title', `${rarity.name} · ${members.length}種`));
      const grid = node('div', 'guide-grid');
      for (const [type, def] of members) {
        count++;
        const button = node('button', 'guide-card'); button.type = 'button'; button.dataset.type = type;
        button.style.setProperty('--rarity', rarity.color);
        const art = node('div', 'guide-art'); art.innerHTML = cardArt(type, 'blue', def.name);
        const short = node('span', 'guide-short');
        for (const item of cardShort(def)) { const part = node('span', ''); part.innerHTML = icon(item.icon); part.append(document.createTextNode(String(item.text))); short.append(part); }
        button.append(art, node('b', '', def.name), node('small', '', rarity.name), short, node('small', '', `${rates[type].toFixed(3)}%`));
        button.onclick = () => this.showCard(type); grid.append(button);
      }
      this.content.append(grid);
    }
    if (!count) this.content.append(node('p', 'progress-empty', 'この条件のカードはありません。'));
  }
  showCard(type) {
    const def = this.cards[type], rarity = this.rarities?.[def.rarity];
    this.content.replaceChildren(); this.content.scrollTop = 0;
    const back = node('button', 'small-btn', '← カード一覧へ'); back.type = 'button'; back.onclick = () => this.render('cards'); this.content.append(back);
    const hero = node('div', 'guide-card-detail'); hero.style.setProperty('--rarity', rarity?.color ?? '#999');
    const art = node('div', 'guide-detail-art'); art.innerHTML = cardArt(type, 'blue', def.name);
    const info = node('div', ''); info.append(node('h3', '', def.name), node('span', 'rarity-label', `${rarity?.name ?? ''} ／ ${KIND_LABEL[def.kind]}`));
    hero.append(art, info); this.content.append(hero, node('p', 'guide-effect', cardDescription(def, this.rules, { monsters: Boolean(this.monsters), debug: this.debug })));
    this.content.append(node('p', 'progress-note', `排出率：${this.rates()[type].toFixed(3)}%（通常、または現在の運命の祈りを反映）`));
    this.content.append(node('h4', '', '合成の流れ'));
    for (const path of fusionPaths(type, this.cards)) this.content.append(node('p', 'fusion-path', path.map((id) => this.cards[id].name).join(' → ')));
    this.content.append(node('p', 'progress-note', def.fuseTo ? `同じ${def.name}を2枚で、${this.cards[def.fuseTo].name}に合成できます。` : 'これ以上は合成できません。'));
    back.focus({ preventScroll: true });
  }
  renderMonsters() {
    for (const [type, def] of Object.entries(this.monsters ?? {})) {
      const row = node('article', 'guide-monster'); const art = node('div', 'guide-art'); art.innerHTML = monsterArt(type, def.name);
      const info = node('div', ''); info.append(node('h3', '', def.name), node('p', '', `HP ${def.hp} ／ 攻撃 ${def.attack} ／ ${elementName(def.element) || '属性なし'}`));
      info.append(node('p', '', `${def.attackEvery}周ごとに城へ${def.castleAttack}ダメージ。攻めるたびに＋${this.rules.monsterAttackGrowth ?? 0}`));
      if (def.rewardRarity) {
        const odds = rewardOdds(this.cards, this.rarities, def.rewardRarity, this.rules.rewardLuckyChance ?? 0);
        info.append(node('p', 'guide-loot', odds.map((o) => `${this.rarities[o.rarity].name} ${o.rate.toFixed(1)}%${o.lucky ? '（ラッキー）' : ''}`).join(' ／ ')));
      } else info.append(node('p', 'guide-loot', `コイン ${def.reward}`));
      row.append(art, info); this.content.append(row);
    }
  }
  renderRates() {
    const ctx = this.getContext(), luck = ctx.session?.getState(ctx.viewerId)?.players[ctx.viewerId]?.luck;
    const rates = this.rates();
    this.content.append(node('p', 'progress-note', luck ? `表示時点の運命の祈り：あと${luck.draws}枚。${this.rarities?.[ctx.luckFrom]?.name ?? '対象レアリティ'}以上の抽選比率を上げ、合計100%に再計算しています。` : '通常抽選の確率です。入手券は指定レアリティ、合成は決まったカードを獲得します。'));
    for (const [id, def] of Object.entries(this.rarities ?? {})) {
      const members = Object.entries(this.cards).filter(([, c]) => c.rarity === id);
      const group = node('details', 'rate-group'); group.style.setProperty('--rarity', def.color);
      group.append(node('summary', '', `${def.name}　${members.reduce((sum, [key]) => sum + rates[key], 0).toFixed(2)}%`));
      for (const [key, card] of members) { const row = node('div', 'rate-row'); row.append(node('span', '', card.name), node('b', '', `${rates[key].toFixed(3)}%`)); group.append(row); }
      this.content.append(group);
    }
    this.content.append(node('h3', '', '魔物の報酬とラッキーの内訳'));
    this.renderMonsters();
  }
}
