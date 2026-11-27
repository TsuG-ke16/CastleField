// ランク報酬を見る画面：ランクごとの、エンブレム・アイコンフレーム・カードスキン（表と裏）の見本。
// 見本を長押しすると、カードは3Dで大きく見られる（CardZoom.js。裏は「裏から見る」）。ランクの色・名前は data/ranks.json。
// 表示だけで、サーバーや装備には関わらない。ランクのカード裏（back_rank_*）を装備すると、表の枠も同じランクになる（cardFrame.js の setCardSkin）。
import { RANK_IDS, rankSkinBack } from './skinArt.js';
import { mountMiniCard } from './cardView.js';

const LABELS = {
  iron: 'アイアン', bronze: 'ブロンズ', silver: 'シルバー', gold: 'ゴールド',
  platinum: 'プラチナ', diamond: 'ダイヤモンド', master: 'マスター', champion: 'チャンピオン',
};
const SAMPLE_CARD = 'infantry';   // 表のスキンの見本に使うカード
const el = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text != null) e.textContent = text; return e; };

export class RankRewardsView {
  /** @param {{ cards: object, rarities: object, tiers?: object[] }} options tiers は data/ranks.json の tiers（なくても見られる） */
  constructor({ cards, rarities, tiers = [] } = {}) {
    Object.assign(this, { cards, rarities, tiers });
    const box = this.box = el('div', 'screen dim');
    box.id = 'rank-rewards'; box.hidden = true;
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'rank-rewards-title');
    box.innerHTML = `<div class="screen-box parchment rank-rewards-box">
      <h2 id="rank-rewards-title">ランク報酬</h2>
      <p class="rank-rewards-note">シーズンで到達したランクに合わせて、アイコンフレームとランクカードがもらえます。ランクカードは表と裏が一体で、所持品で装備すると、カードの表も裏もそのランクの見た目になります。見本を長押しすると、3Dで大きく見られます。</p>
      <ul class="rank-rewards-list" data-part="list"></ul>
      <button type="button" class="plank-btn rank-rewards-close">閉じる</button>
    </div>`;
    document.getElementById('app').append(box);
    this.list = box.querySelector('[data-part="list"]');
    box.querySelector('.rank-rewards-close').addEventListener('click', () => this.close());
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); });
    box.addEventListener('click', (e) => { if (e.target === box) this.close(); });
    this.render();
  }

  tier(id) { return this.tiers.find((t) => t.id === id) ?? null; }

  render() {
    this.list.replaceChildren();
    for (const id of RANK_IDS) {
      const color = this.tier(id)?.color ?? '#b9b19a';
      const label = LABELS[id];
      const li = el('li', 'rank-reward-row'); li.dataset.rank = id;
      const head = el('div', 'rank-reward-head');
      const emblem = new Image(); emblem.src = `assets/ranks/rank-${id}.png`; emblem.alt = ''; emblem.className = 'rank-reward-emblem'; emblem.loading = 'lazy';
      head.append(emblem, el('strong', 'rank-reward-name', label));
      const items = el('div', 'rank-reward-items');

      const frame = el('figure', 'rank-reward-item');
      const avatar = el('span', 'rank-reward-avatar'); avatar.dataset.frame = `frame_${id}`;
      avatar.append(el('i', null, '👤'));
      frame.append(avatar, el('figcaption', null, 'アイコンフレーム'));

      const front = el('figure', 'rank-reward-item');
      const frontCard = el('div', 'rank-reward-card'); frontCard.dataset.zoom = SAMPLE_CARD;
      Object.assign(frontCard.dataset, { zoomSkin: id, zoomColor: color, zoomTitle: `${label}のカード（表）`, zoomText: 'ランク報酬のカードスキン。なぞって回すと裏も見られます' });
      if (this.cards?.[SAMPLE_CARD]) mountMiniCard(frontCard, SAMPLE_CARD, this.cards[SAMPLE_CARD], this.rarities, { skin: id });
      front.append(frontCard, el('figcaption', null, 'カード表'));

      const back = el('figure', 'rank-reward-item');
      const backCard = el('div', 'rank-reward-card back'); backCard.dataset.zoom = SAMPLE_CARD;
      Object.assign(backCard.dataset, { zoomSkin: id, zoomColor: color, zoomFlip: '1', zoomTitle: `${label}のカード（裏）`, zoomText: 'シーズン報酬のカード裏面。なぞって回すと表も見られます' });
      const art = rankSkinBack(id);
      if (art) { const img = new Image(); img.src = art.art; img.alt = `${label}のカード裏面`; img.draggable = false; img.loading = 'lazy'; backCard.append(img); }
      back.append(backCard, el('figcaption', null, 'カード裏面'));

      items.append(frame, front, back);
      li.append(head, items);
      this.list.append(li);
    }
  }

  open(onClose = null) {
    this.onClose = onClose;
    this.box.hidden = false;
    this.box.querySelector('.rank-rewards-close').focus({ preventScroll: true });
  }

  close() { if(this.box.hidden)return;this.box.hidden = true;const back=this.onClose;this.onClose=null;back?.(); }
}

export { LABELS as RANK_LABELS };
