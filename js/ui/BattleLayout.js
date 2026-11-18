// Information hierarchy only. IDs stay stable for existing renderers and input handlers.
import { playerName } from './text.js';
const $ = id => document.getElementById(id);
export class BattleLayout {
  constructor() {
    const hud = $('hud');
    this.turn = document.createElement('strong'); this.turn.id = 'turn-status';
    this.turn.setAttribute('role', 'status'); this.turn.setAttribute('aria-live', 'polite');
    hud.prepend(this.turn);
    const info = document.createElement('details'); info.id = 'match-info';
    const summary = document.createElement('summary'); summary.textContent = '対戦状況・山札';
    const piles = document.createElement('div'); piles.className = 'match-piles';
    piles.append($('deck-pile'), $('discard-pile'));
    const opponent = hud.querySelector('.hud-opp'); opponent.classList.add('match-opponent');
    this.seats = document.createElement('ul'); this.seats.className = 'match-seats';
    const economy = $('economy-status');
    info.append(summary, opponent, piles, this.seats, economy, $('menu-rates'));
    $('menu').querySelector('.menu-title').after(info);
    // Common resources remain next to the turn indicator; secondary counters are in the menu.
    hud.append($('my-mp'), $('chat-open'), $('menu-open'));
    hud.querySelector('.hud-right').remove();
    $('my-mp').querySelector('[data-icon]').insertAdjacentText('afterend', 'MP ');
    this.toolbar = document.createElement('div'); this.toolbar.className = 'hand-toolbar';
    this.count = document.createElement('strong'); this.count.id = 'hand-count';
    this.hint = document.createElement('span'); this.hint.className = 'hand-scroll-hint'; this.hint.textContent = '横にスワイプ';
    this.toolbar.append(this.count, this.hint, $('hand-toggle'));
    $('hand').before(this.toolbar);
    const extra = document.createElement('details'); extra.className = 'detail-extra';
    extra.innerHTML = '<summary>合成先・排出率</summary>';
    $('card-detail').querySelector('.detail-meta').before(extra);
    extra.append($('card-detail').querySelector('.detail-meta'));
    // Destructive record reset no longer sits beside the play modes.
    const records = document.createElement('details'); records.className = 'title-records';
    records.innerHTML = '<summary>戦績</summary>';
    $('title-record').before(records); records.append($('title-record'), $('record-clear'));
    const links = document.createElement('nav'); links.className = 'title-links'; links.setAttribute('aria-label', 'ゲームの案内');
    $('title-main').append(links); links.append($('title-deck'), $('title-catalog'), $('title-settings'), $('title-help'));
    $('record-clear').textContent = '戦績をリセット';
  }
  update(state, viewerId) {
    const me = state.players[viewerId];
    const defending = state.phase === 'defend';
    this.turn.textContent = me.eliminated ? '観戦中' : defending
      ? state.defense?.defenderId === viewerId ? '防御を選んでください' : '相手が防御を選択中'
      : state.currentPlayer === viewerId ? 'あなたの番' : `${playerName(state.currentPlayer)}の番`;
    document.getElementById('hud').dataset.turn = state.currentPlayer === viewerId ? 'mine' : 'other';
    this.count.textContent = `手札 ${me.handCount}枚`;

    // The per-seat list avoids labeling one opponent's resources as everyone's resources.
    this.seats.replaceChildren();
    for (const [i, id] of state.playerOrder.entries()) {
      const p = state.players[id], row = document.createElement('li');
      const label = document.createElement('b'); label.textContent = `席${i+1} ${playerName(id)}${id === viewerId && playerName(id) !== 'あなた' ? '（あなた）' : ''}`;
      const values = document.createElement('span');
      values.textContent = p.eliminated ? '脱落' : `HP ${p.castleHp}/${p.castleMaxHp} · 手札 ${p.handCount} · MP ${p.mp ?? 0} · コイン ${p.coins ?? 0}`;
      row.append(label, values); this.seats.append(row);
    }
  }
}
