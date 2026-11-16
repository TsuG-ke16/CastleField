// 防御の帯：相手に攻撃されたとき、何が起きるか（攻撃のダメージ・このまま受けたときの城HP）と、
// 選んだ防御カードで結果がどう変わるかを見せる。「防御する」と「受ける」の2つのボタンがある。
// 計算は js/game/Reaction.js（Game と同じ計算）。ここでは状態を書き換えない。

import { previewReaction } from '../game/Reaction.js';
import { cardShort } from './text.js';

const $ = (id) => document.getElementById(id);

export class ReactionPanel {
  /**
   * @param {{ cards: object, onPass: () => void, onGo: () => void }} opts
   */
  constructor({ cards, onPass, onGo }) {
    this.cards = cards;
    this.el = {
      panel: $('reaction-panel'),
      title: document.querySelector('#reaction-panel .react-title'),
      line: document.querySelector('#reaction-panel .react-line'),
      list: document.querySelector('#reaction-panel .react-list'),
      timer: document.querySelector('#reaction-panel .react-timer'),
      timerBar: document.querySelector('#reaction-panel .react-timer i'),
      pass: document.querySelector('#reaction-panel .react-pass'),
      go: document.querySelector('#reaction-panel .react-go'),
    };
    this.info = null;
    this.names = {};
    this.el.pass.addEventListener('click', (e) => { e.stopPropagation(); onPass(); });
    this.el.go.addEventListener('click', (e) => { e.stopPropagation(); onGo(); });
  }

  get isOpen() {
    return !this.el.panel.hidden;
  }

  /**
   * @param {object} info getState().reaction
   * @param {{ attackerName: string, attackerCastleHp: number }} ctx
   */
  open(info, ctx) {
    this.info = info;
    this.ctx = ctx;
    const attackName = info.source.kind === 'soldier'
      ? `${this.cards[info.soldier?.type]?.name ?? '兵士'}が城に突撃！`
      : `${this.cards[info.source.type]?.name ?? '魔法'}！`;
    this.el.title.textContent = `${ctx.attackerName}の${attackName}`;
    this.el.panel.hidden = false;
    this.update([]);
  }

  close() {
    this.el.panel.hidden = true;
    this.info = null;
    this.setTimer(null);
  }

  /** 選んでいる防御カードに合わせて、見積もりを描き直す。picks は [{ cardId, type }] */
  update(picks) {
    const info = this.info;
    if (!info) return;
    const defs = picks.map((p) => this.cards[p.type]);
    const attack = { source: info.source.kind, damage: info.damage, unblockable: info.unblockable, soldier: info.soldier };
    const pv = previewReaction(attack, defs);
    const hit = (damage) => Math.max(0, damage - (info.armor ?? 0));
    const before = hit(info.damage);
    const after = hit(pv.damage);
    const armorNote = info.armor > 0 ? `（城壁${info.armor}が先に受ける）` : '';

    this.el.line.innerHTML = '';
    const dmg = document.createElement('b');
    dmg.className = 'react-dmg';
    dmg.textContent = `${info.damage}ダメージ`;
    this.el.line.append(dmg, ` ${armorNote}`);
    const hpLine = document.createElement('span');
    hpLine.className = 'react-hp';
    const left = (hp) => Math.max(0, info.castleHp - hp);
    hpLine.textContent = picks.length === 0
      ? `このまま受けると 城 ${info.castleHp} → ${left(before)}`
      : `結果：城 ${info.castleHp} → ${left(after)}`;
    if (left(picks.length === 0 ? before : after) <= 0) hpLine.classList.add('deadly');
    this.el.line.append(document.createElement('br'), hpLine);

    this.el.list.innerHTML = '';
    const add = (text, cls = '') => {
      const li = document.createElement('li');
      li.textContent = text;
      if (cls) li.className = cls;
      this.el.list.appendChild(li);
    };
    if (picks.length === 0) {
      if (left(before) <= 0) add('このままだと城が落ちます！ 光っているカードで防ごう', 'bad');
      else add('光っているカードをタップして、防御を選ぶ（使わずに受けてもOK）', 'hint');
    }
    for (const p of picks) {
      const def = this.cards[p.type];
      const short = cardShort(def).map((x) => x.text).join(' ');
      if (def.effect === 'guard') add(`${def.name}（${short}）：ダメージを${def.amount}減らす`);
      else if (def.effect === 'counter') add(`${def.name}：ダメージを${def.block}減らし、相手の城に${def.amount}ダメージ${this.ctx.attackerCastleHp <= def.amount ? '（城を落とせる！）' : ''}`);
      else if (def.effect === 'intercept') {
        const name = this.cards[info.soldier?.type]?.name ?? '兵士';
        if (pv.intercepted) add(`${def.name}：${name}を倒せる！ 攻撃は無効`, 'good');
        else add(`${def.name}：${name}は倒せない（HP ${info.soldier.hp} → ${pv.soldierHpAfter}）。攻撃は止まりません`, 'bad');
      }
    }
    if (pv.intercepted && picks.length > 1) add('迎撃で倒せるので、ほかのカードは使わなくても防げます', 'hint');
    this.el.go.disabled = picks.length === 0;
    this.el.go.textContent = picks.length ? `防御する（${picks.length}枚）` : '防御する';
  }

  /** 防御を待つ残り時間（オンライン）。ms が null なら出さない */
  setTimer(ms, total = ms) {
    this.el.timer.hidden = ms == null;
    if (ms == null) return;
    this.el.timerBar.style.width = `${Math.max(0, Math.min(1, ms / (total || 1))) * 100}%`;
    this.el.timer.classList.toggle('low', ms < 8000);
  }
}
