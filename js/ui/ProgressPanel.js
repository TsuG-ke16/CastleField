import { setRarities } from './rarity.js';
import { cardArt } from './art.js';
import { mountMiniCard } from './cardView.js';

const make = (tag, cls, text) => {
  const el = document.createElement(tag);
  el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
};

export class ProgressPanel {
  constructor({ cards, rarities, rules, monsters, getContext, onFuse, onRates }) {
    Object.assign(this, { cards, rarities, rules, monsters, getContext, onFuse, onRates });
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
    const { state, viewerId, busy, sending, session } = this.state();
    if (!state || state.phase !== 'main' || state.currentPlayer !== viewerId || busy || sending) return [];
    const groups = new Map();
    const hand = state.players[viewerId]?.hand ?? [];
    for (const card of hand) {
      if (!this.cards[card.type]?.fuseTo) continue;
      const list = groups.get(card.type) ?? []; list.push(card); groups.set(card.type, list);
    }
    // 適応：どのカードとでも合成できる。合成先のあるカードの種類ごとに「適応＋そのカード」の組を作る
    const wild = hand.find((c) => this.cards[c.type]?.effect === 'wild');
    const result = [];
    for (const [type, list] of groups) {
      const pair = list.length >= 2 ? list.slice(0, 2) : wild ? [wild, list[0]] : null;
      if (pair) result.push({ pair, type, withWild: list.length < 2 });
      if (list.length >= 2 && wild) result.push({ pair: [wild, list[0]], type, withWild: true });
    }
    return result.filter((x) => !session.canFuse || session.canFuse(x.pair[0].cardId, x.pair[1].cardId).ok);
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
    this.content.append(make('p', 'progress-note', '同じ種類を2枚（または適応＋好きな1枚）使い、次のレアリティのカードを1枚獲得。メインの1枚には数えません。'));
    const pairs = this.pairs();
    if (!pairs.length) {
      const { state, viewerId, busy, sending } = this.state();
      this.content.append(make('p', 'progress-empty', busy || sending ? '演出や操作の完了後に合成できます。' : state?.phase !== 'main' || state?.currentPlayer !== viewerId ? '自分のメインの場面で合成できます。' : '合成できる組み合わせがありません。同じ種類のカードを2枚集めてください。レジェンドは合成できません。'));
    }
    for (const { pair: list, type, withWild } of pairs) {
      const def = this.cards[type], next = this.cards[def.fuseTo];
      const btn = make('button', 'fusion-pair'); btn.type = 'button';
      const art = make('div', 'fusion-art'); mountMiniCard(art, def.fuseTo, next, this.rarities, { showName: false });
      const text = make('span', 'fusion-text');
      text.append(make('span', '', withWild ? `適応 ＋ ${def.name} →` : `${def.name} ×2 →`), make('b', '', next.name), make('small', '', this.rarities?.[next.rarity]?.name ?? next.rarity));
      btn.style.setProperty('--rarity', this.rarities?.[next.rarity]?.color ?? '#999');
      if (withWild) {
        const source = make('div', 'fusion-source');
        const wild = list.find(card => this.cards[card.type]?.effect === 'wild');
        mountMiniCard(source, wild.type, this.cards[wild.type], this.rarities);
        btn.append(source);
      }
      btn.append(art, text, make('span', 'fusion-label', '合成する'));
      btn.onclick = () => { this.close(); this.onFuse(list[0].cardId, list[1].cardId); };
      this.content.append(btn);
    }
  }
  showRates() { this.onRates?.(); }
}
