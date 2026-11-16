// コインで買う強化のパネル（upgrades.json の強化を並べる）。
// 買えるかどうかと理由は main.js が game.canBuyUpgrade() で調べて渡す。ここでは状態を書き換えない。

import { upgradeDescription } from './text.js';
import { UPGRADE_ICON_NAME } from './look.js';
import { icon } from './art.js';

const $ = (id) => document.getElementById(id);

export class UpgradePanel {
  /**
   * @param {{ upgrades: object, onBuy: (upgradeId: string) => void, onOpen: () => void,
   *           onDenied: (reason: string) => void }} opts
   *   onOpen：パネルを開くとき（main.js が最新の状態で refresh() を呼ぶ）
   *   onDenied：いま開けないときにボタンが押された（理由を出す）
   */
  constructor({ upgrades, rarities, onBuy, onOpen, onDenied }) {
    this.upgrades = upgrades;
    this.rarities = rarities;
    this.onBuy = onBuy;
    this.onOpen = onOpen;
    this.onDenied = onDenied;
    this.category = 'repair';
    this.groups = { repair: '回復', draw: '補充', army: '強化（兵士）', ticket: '入手券', special: '特殊' };
    this.offReason = ''; // いま開けない理由（空なら開ける）
    this.el = {
      open: $('upgrade-open'),
      panel: $('upgrade-panel'),
      list: document.querySelector('#upgrade-panel .upgrade-list'),
      coins: document.querySelector('#upgrade-panel .upgrade-coins'),
      close: document.querySelector('#upgrade-panel .upgrade-close'),
    };
    this.tabs = document.createElement('div'); this.tabs.className = 'shop-tabs'; this.tabs.setAttribute('role', 'tablist');
    this.el.list.id = 'shop-items'; this.el.list.setAttribute('role', 'tabpanel');
    for (const [key, label] of Object.entries(this.groups)) {
      const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = label; btn.dataset.category = key;
      btn.id = `shop-tab-${key}`; btn.setAttribute('role', 'tab'); btn.setAttribute('aria-controls', 'shop-items');
      btn.onclick = () => { this.category = key; this.render(); };
      btn.onkeydown = (e) => {
        if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
        e.preventDefault(); const all = [...this.tabs.children], i = all.indexOf(btn);
        const next = all[(i + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length]; next.click(); next.focus();
      };
      this.tabs.append(btn);
    }
    this.el.list.before(this.tabs);
    // ボタンは disabled にしない。開けないときは、押すと理由を出す（押して何も起きない、を作らない）
    this.el.open.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.offReason) this.onDenied(this.offReason);
      else if (this.el.panel.hidden) this.open();
      else this.close();
    });
    this.el.close.addEventListener('click', () => this.close());
    this.el.panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { this.close(); this.el.open.focus(); } });
    this.el.list.addEventListener('click', (e) => {
      const btn = e.target.closest('.upgrade-item');
      if (!btn) return;
      this.onBuy(btn.dataset.id);
    });
    // パネルの外をタップしたら閉じる
    document.getElementById('app').addEventListener('click', (e) => {
      if (!this.el.panel.hidden && !e.target.closest('#upgrade-panel, #upgrade-open')) this.close();
    });
  }

  get isOpen() {
    return !this.el.panel.hidden;
  }

  open() {
    this.onOpen();
    this.el.panel.hidden = false;
    this.el.close.focus({ preventScroll: true });
  }

  close() {
    this.el.panel.hidden = true;
  }

  /**
   * 開けるかどうか（自分のメインの場面だけ）
   * @param {boolean} enabled
   * @param {{ highlight?: boolean, reason?: string }} opts reason：開けないときに出す理由
   */
  setEnabled(enabled, { highlight = false, reason = 'いまは強化を買えません' } = {}) {
    this.offReason = enabled ? '' : reason;
    this.el.open.classList.toggle('off', !enabled);
    this.el.open.classList.toggle('ready', enabled && highlight);
    if (!enabled) this.close();
  }

  /**
   * @param {number} coins 自分のコイン
   * @param {{ [upgradeId: string]: { ok: boolean, reason?: string } }} status canBuyUpgrade の結果
   * @param {{ [upgradeId: string]: number }|null} bought このゲームで買った回数（分からないときは null）
   */
  refresh(coins, status, bought) {
    this.el.coins.innerHTML = `${icon('coin')}<b>${Number(coins)}</b>`;
    this.snapshot = { coins, status, bought };
    this.render();
  }

  group(def) {
    return { repairCastle: 'repair', drawCards: 'draw', sharpenSoldiers: 'army', trainArmy: 'army', fortifyArmy: 'army', gainCard: 'ticket' }[def.effect] ?? 'special';
  }

  render() {
    if (!this.snapshot) return;
    const { status, bought } = this.snapshot;
    const list = this.el.list; list.replaceChildren();
    list.dataset.category = this.category;
    list.setAttribute('aria-labelledby', `shop-tab-${this.category}`);
    for (const btn of this.tabs.children) {
      const active = btn.dataset.category === this.category;
      btn.setAttribute('aria-selected', String(active)); btn.tabIndex = active ? 0 : -1;
    }
    for (const [id, def] of Object.entries(this.upgrades).filter(([, d]) => this.group(d) === this.category)) {
      const st = status[id] ?? { ok: false, reason: '' };
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `upgrade-item${st.ok ? '' : ' blocked'}`;
      btn.dataset.id = id;
      btn.setAttribute('aria-disabled', String(!st.ok));
      if (def.rarity) { btn.dataset.rarity = def.rarity; btn.style.setProperty('--rarity', this.rarities?.[def.rarity]?.color ?? '#999'); }
      btn.innerHTML = '<span class="upgrade-icon"></span><span class="upgrade-text"><b class="upgrade-name"></b>' +
        '<span class="upgrade-desc"></span><span class="upgrade-reason"></span></span><span class="upgrade-cost"></span>';
      btn.querySelector('.upgrade-icon').innerHTML = icon(UPGRADE_ICON_NAME[id] ?? 'crown');
      btn.querySelector('.upgrade-name').textContent = def.name;
      let desc = upgradeDescription(def);
      // 買った回数が分からないとき（オンラインでつなぎ直したあと）は、上限だけ出す
      if (def.limit !== undefined) desc += bought ? `（あと${Math.max(0, def.limit - (bought[id] ?? 0))}回）` : `（1試合${def.limit}回まで）`;
      btn.querySelector('.upgrade-desc').textContent = desc;
      btn.querySelector('.upgrade-reason').textContent = st.ok ? '' : (st.reason ?? '');
      btn.querySelector('.upgrade-cost').innerHTML = `${icon('coin')}<b>${Number(def.cost)}</b>`;
      list.appendChild(btn);
    }
  }
}
