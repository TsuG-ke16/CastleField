import { dropRates, rewardOdds } from '../game/Setup.js';
import { setRarities } from './rarity.js';
import { cardArt } from './art.js';

const make = (tag, cls, text) => {
  const el = document.createElement(tag);
  el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
};

export class ProgressPanel {
  constructor({ cards, rarities, rules, monsters, getContext, onFuse }) {
    Object.assign(this, { cards, rarities, rules, monsters, getContext, onFuse });
    setRarities(rarities);
    this.openButton = document.getElementById('fusion-open');
    this.status = document.getElementById('economy-status');
    this.screen = make('div', 'screen dim progress-screen');
    this.screen.hidden = true;
    this.screen.id = 'progress-screen';
    this.box = make('section', 'screen-box parchment progress-box');
    this.box.setAttribute('role', 'dialog');
    this.box.setAttribute('aria-modal', 'true');
    this.box.setAttribute('aria-labelledby', 'progress-title');
    const head = make('div', 'progress-head');
    this.title = make('h2', 'menu-title'); this.title.id = 'progress-title';
    this.closeButton = make('button', 'round-btn', '×');
    this.closeButton.type = 'button'; this.closeButton.setAttribute('aria-label', '閉じる');
    head.append(this.title, this.closeButton);
    this.content = make('div', 'progress-content');
    this.box.append(head, this.content); this.screen.append(this.box);
    document.getElementById('app').append(this.screen);
    this.closeButton.onclick = () => this.close();
    this.screen.onclick = (e) => { if (e.target === this.screen) this.close(); };
    this.screen.onkeydown = (e) => {
      if (e.key === 'Escape') this.close();
      if (e.key === 'Tab') {
        const items = [...this.box.querySelectorAll('button:not(:disabled), summary')];
        const first = items[0], last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    this.openButton.onclick = () => this.showFusion();
    document.getElementById('menu-rates').onclick = () => {
      document.getElementById('menu').hidden = true;
      this.showRates();
    };
  }
  close() {
    this.screen.hidden = true;
    this.returnFocus?.focus({ preventScroll: true });
  }
  closeFusion() { if (this.mode === 'fusion' && !this.screen.hidden) this.close(); }
  open(mode, title) {
    this.returnFocus = document.activeElement;
    this.mode = mode; this.title.textContent = title;
    this.content.replaceChildren(); this.screen.hidden = false;
    this.closeButton.focus();
  }
  state() {
    const ctx = this.getContext();
    return { ...ctx, state: ctx.session?.getState(ctx.viewerId) };
  }
  pairs() {
    const { state, viewerId, busy, sending } = this.state();
    if (!state || state.phase !== 'main' || state.currentPlayer !== viewerId || busy || sending) return [];
    const groups = new Map();
    for (const card of state.players[viewerId]?.hand ?? []) {
      if (!this.cards[card.type]?.fuseTo) continue;
      const list = groups.get(card.type) ?? []; list.push(card); groups.set(card.type, list);
    }
    return [...groups.values()].filter((list) => list.length >= 2);
  }
  refresh() {
    const { state, viewerId } = this.state();
    const count = this.pairs().length;
    this.openButton.textContent = count ? `合成 ${count}` : '合成';
    this.openButton.classList.toggle('ready', count > 0);
    this.openButton.setAttribute('aria-label', count ? `合成できる組み合わせが${count}種類あります` : 'カードを合成する');
    const me = state?.players[viewerId];
    this.status.textContent = me ? [me.armyAttack ? `軍の攻撃＋${me.armyAttack}` : '', me.armyHp ? `軍のHP＋${me.armyHp}` : '', me.luck ? `運命の祈り：あと${me.luck.draws}枚` : ''].filter(Boolean).join(' ／ ') : '';
    this.status.hidden = !this.status.textContent;
  }
  showFusion() {
    this.open('fusion', 'カードを合成');
    this.content.append(make('p', 'progress-note', '同じ種類を2枚使い、次のレアリティのカードを1枚獲得。メインの1枚には数えません。'));
    const pairs = this.pairs();
    if (!pairs.length) {
      const { state, viewerId, busy, sending } = this.state();
      this.content.append(make('p', 'progress-empty', busy || sending ? '演出や操作の完了後に合成できます。' : state?.phase !== 'main' || state?.currentPlayer !== viewerId ? '自分のメインの場面で合成できます。' : '合成できる組み合わせがありません。同じ種類のカードを2枚集めてください。レジェンドは合成できません。'));
    }
    for (const list of pairs) {
      const def = this.cards[list[0].type], next = this.cards[def.fuseTo];
      const btn = make('button', 'fusion-pair'); btn.type = 'button';
      const art = make('div', 'fusion-art'); art.innerHTML = cardArt(def.fuseTo, 'blue', next.name);
      const text = make('span', 'fusion-text');
      text.append(make('span', '', `${def.name} ×2 →`), make('b', '', next.name), make('small', '', this.rarities?.[next.rarity]?.name ?? next.rarity));
      btn.style.setProperty('--rarity', this.rarities?.[next.rarity]?.color ?? '#999');
      btn.append(art, text, make('span', 'fusion-label', '合成する'));
      btn.onclick = () => { this.close(); this.onFuse(list[0].cardId, list[1].cardId); };
      this.content.append(btn);
    }
  }
  showRates() {
    this.open('rates', '排出率を見る');
    if (!this.rarities) { this.content.append(make('p', '', '排出率データがありません。')); return; }
    const { state, viewerId } = this.state();
    const luck = state?.players[viewerId]?.luck;
    const boost = luck ? { from: this.getLuckRarity(), multiplier: luck.boost } : null;
    const rates = dropRates(this.cards, this.rarities, boost);
    this.content.append(make('p', 'progress-note', luck ? `運命の祈り中：次の${luck.draws}枚の確率です。` : '通常抽選の確率です。入手券は指定レアリティ、合成は表示されたカードを獲得します。小数点以下の丸めで合計がずれる場合があります。'));
    for (const [id, rarity] of Object.entries(this.rarities)) {
      const group = make('details', 'rate-group');
      const members = Object.entries(this.cards).filter(([, c]) => c.rarity === id);
      const total = members.reduce((sum, [key]) => sum + rates[key], 0);
      group.style.setProperty('--rarity', rarity.color);
      group.append(make('summary', '', `${rarity.name}　${total.toFixed(2)}%`));
      for (const [type, def] of members) {
        const row = make('div', 'rate-row'); row.append(make('span', '', def.name), make('b', '', `${rates[type].toFixed(3)}%`)); group.append(row);
      }
      this.content.append(group);
    }
    this.content.append(make('h3', '', '魔物の報酬（とどめを刺した人に1枚）'));
    for (const monster of Object.values(this.monsters ?? {})) {
      if (!monster.rewardRarity) continue;
      const odds = rewardOdds(this.cards, this.rarities, monster.rewardRarity, this.rules.rewardLuckyChance ?? 0);
      const row = make('div', 'reward-row');
      row.append(make('b', '', monster.name), make('span', '', odds.map((o) => `${this.rarities[o.rarity].name} ${o.rate.toFixed(1)}%${o.lucky ? '（ラッキー）' : ''}`).join(' ／ ')));
      this.content.append(row);
    }
  }
  getLuckRarity() { return this.getContext().luckFrom ?? 'rare'; }
}
