// 対象を選ぶ（対象が2つ以上あるカード）。盤面の対象を光らせ、タップで選んでもらう。
// やめ方：「手札に戻す」ボタン・右クリック・Esc・光っていない所をタップ・盤面の外（手札など）をタップ。
// 出す前ならいつでもやめられ、カードは手札に残る（誤操作・配置ミスを防ぐ）。
// どこに出せるかは main.js が game.getTargets() で調べて渡す。ここでは状態を書き換えない。

import { playerName } from './text.js';

const $ = (id) => document.getElementById(id);

export class Targeting {
  /**
   * @param {{ renderer: import('./Renderer.js').Renderer,
   *           handView: import('./HandView.js').HandView,
   *           onChoose: (cardId: string, target: object) => void }} opts
   */
  constructor({ renderer, handView, onChoose, onCancel }) {
    this.renderer = renderer;
    this.handView = handView;
    this.onChoose = onChoose;
    this.onCancel = onCancel; // 人がやめたとき（ボタン・右クリック・Esc・外をタップ）に呼ぶ
    this.current = null; // { cardId, targets, armed }
    this.el = {
      app: $('app'),
      bar: $('target-bar'),
      msg: document.querySelector('#target-bar .target-msg'),
      cancel: document.querySelector('#target-bar .target-cancel'),
    };
    this.el.cancel.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cancel(true);
    });
    // 右クリック・Esc でもやめる（PC で、出す場所をまちがえたとき）
    this.el.app.addEventListener('contextmenu', (e) => {
      if (!this.current) return;
      e.preventDefault();
      this.cancel(true);
    });
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !this.current) return;
      e.preventDefault();
      this.cancel(true);
    });
    // 盤面と帯の外をタップしたらやめる（盤面のタップは Renderer から tap() で届く）
    this.el.app.addEventListener('click', (e) => {
      if (!this.current?.armed) return;
      if (e.target.closest('#board, #target-bar, #debug-panel, #debug-toggle')) return;
      this.cancel(true);
    });
  }

  get active() {
    return Boolean(this.current);
  }

  /**
   * @param {string} cardId
   * @param {object[]} targets getTargets の結果（2つ以上）
   * @param {string} cardName 帯に出すカード名
   */
  start(cardId, targets, cardName) {
    this.cancel();
    const t = { cardId, targets, armed: false };
    this.current = t;
    // カードを出したタップそのもので「やめる」にならないよう、次のタップから受け付ける
    setTimeout(() => { t.armed = true; }, 0);
    this.renderer.setTargets(targets);
    this.handView.cardEl(cardId)?.classList.add('choosing');
    const kinds = new Set(targets.map((x) => (x.soldierId ? '兵士' : x.monsterId ? '魔物' : x.roadId ? '道' : '城')));
    const isSoldierCard = targets.every((x) => x.roadId && x.playerId) && !targets.some((x) => x.soldierId || x.monsterId);
    this.el.msg.textContent = isSoldierCard
      ? `「${cardName}」をどの道に使う？ 光っている道をタップ`
      : `「${cardName}」をどこに使う？ 光っている${[...kinds].join('か')}をタップ`;
    this.el.bar.title = '右クリック・Esc でも手札に戻せます';
    this.el.bar.hidden = false;
  }

  /** @param {boolean} [byUser] 人がやめたとき true（手札に戻したことを知らせる） */
  cancel(byUser = false) {
    if (!this.current) return;
    const cardId = this.current.cardId;
    this.handView.cardEl(cardId)?.classList.remove('choosing');
    this.current = null;
    this.renderer.setTargets(null);
    this.el.bar.hidden = true;
    this.el.bar.querySelector('.target-members')?.remove();
    if (byUser) {
      const card = this.handView.cardEl(cardId);
      if (card) { card.classList.remove('returned'); void card.offsetWidth; card.classList.add('returned'); }
      this.onCancel?.(cardId);
    }
  }

  /** 盤面がタップされた。光っている対象なら選び、そうでなければやめる */
  tap(target) {
    const t = this.current;
    if (!t || !t.armed) return;
    if (!target) {
      this.cancel(true);
      return;
    }
    if (target.options) {
      this.el.bar.querySelector('.target-members')?.remove();
      const members = document.createElement('div'); members.className = 'target-members';
      this.el.msg.textContent = 'この城のだれの兵士を狙う？';
      for (const option of target.options) {
        const button = document.createElement('button'); button.type = 'button';button.className = 'small-btn';
        button.textContent = playerName(option.playerId);
        button.addEventListener('click', e => {e.stopPropagation(); this.onChoose(t.cardId,option);});
        members.append(button);
      }
      this.el.bar.append(members); return;
    }
    this.onChoose(t.cardId, target);
  }
}
