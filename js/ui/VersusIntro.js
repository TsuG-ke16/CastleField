// 対戦開始の VS 画面：お互いのアイコン・名前・称号・レベル・ランクを見せてから始める。
// ランクマッチで「相手がどのくらい強いか」が分からないモヤモヤをなくす。タップで飛ばせる。
// 名前・称号は人が入れた文字なので、textContent で出す（HTML として入れない）。

import { profileArt } from './profileArt.js';
import { rankEmblem } from './RankEmblem.js';
import { UI_CONFIG } from './config.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

/**
 * @typedef {{ playerId: string, name: string, you?: boolean, cpu?: string|null, cpuLabel?: string,
 *   profile?: { icon?: string, iconImage?: string, level?: number, title?: string,
 *     rank?: { name: string, divisionLabel?: string, color?: string, tierIndex?: number, rp?: number|null } | null,
 *     placement?: { left: number, total: number } | null } | null, guest?: boolean }} VsPlayer
 */

/** 1人ぶんの札 */
function plate(p, ranked, duel) {
  const card = el('article', `vs-plate${p.you ? ' you' : ''}`);
  // 2人のときは、格闘ゲームのように 自分＝青・相手＝赤。3人以上は席の色
  const color = duel ? (p.you ? '#2f7de1' : '#e03b3b') : UI_CONFIG.teamColors[(Number(String(p.playerId).slice(1)) || 1) - 1];
  card.style.setProperty('--seat', color ?? '#4da3e8');
  const avatar = el('div', 'vs-avatar');
  const src = p.profile ? profileArt(p.profile.icon, p.profile.iconImage) : null;
  if (src) { const img = new Image(); img.src = src; img.alt = ''; avatar.append(img); }
  else avatar.textContent = p.cpu ? '🤖' : ([...String(p.name ?? '?')][0] ?? '?');
  if (p.profile?.iconFrame) avatar.dataset.frame = p.profile.iconFrame; // ランク報酬のアイコンフレーム
  const info = el('div', 'vs-info');
  const nameLine = el('div', 'vs-name');
  nameLine.append(el('b', null, p.name));
  if (p.you) nameLine.append(el('small', 'vs-you', 'あなた'));
  info.append(nameLine);
  const sub = [p.profile?.title, p.profile?.level ? `Lv.${p.profile.level}` : null, p.cpu ? 'コンピューター' : null].filter(Boolean).join('　');
  if (sub) info.append(el('div', 'vs-sub', sub));
  const rankRow = el('div', 'vs-rank');
  const r = p.profile?.rank;
  if (r) {
    const emblem = el('span', 'vs-emblem'); emblem.innerHTML = rankEmblem(r, 40);
    const label = el('div', 'vs-rank-text');
    label.append(el('b', null, r.divisionLabel ?? r.name));
    if (r.rp != null) label.append(el('small', null, `${r.rp} RP`));
    if (r.color) label.style.setProperty('--rank', r.color);
    rankRow.append(emblem, label);
  } else if (p.profile?.placement) {
    const pl = p.profile.placement;
    rankRow.append(el('span', 'vs-rank-none', `ランク未確定（判定戦 あと${pl.left}/${pl.total}戦）`));
  } else if (!p.cpu) {
    rankRow.append(el('span', 'vs-rank-none', p.profile ? (ranked ? 'ランク未確定' : 'ランクなし') : 'ゲスト'));
  }
  if (rankRow.childElementCount) info.append(rankRow);
  card.append(avatar, info);
  return card;
}

/**
 * VS 画面を出して、終わる（時間が来る・タップ）まで待つ。動きを減らす設定・演出スキップでも、短く出す（相手が分かることが大事なので）。
 * @param {VsPlayer[]} players 席順
 * @param {{ ranked?: boolean, heading?: string }} opts
 */
export function showVersus(players, { ranked = false, heading = '' } = {}) {
  if (!players?.length) return Promise.resolve();
  document.querySelector('.vs-intro')?.remove();
  const root = el('div', `vs-intro${players.length > 2 ? ' many' : ' duel'}${ranked ? ' ranked' : ''}`);
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', '対戦相手');
  root.append(el('div', 'vs-heading', heading || (ranked ? 'ランクマッチ' : '対戦開始')));
  const list = el('div', 'vs-list');
  // 2人なら「相手（上）VS 自分（下）」。3人以上は席順に並べる
  const order = players.length === 2 ? [...players].sort((a, b) => Number(Boolean(a.you)) - Number(Boolean(b.you))) : players;
  order.forEach((p, i) => {
    if (i > 0 && order.length === 2) list.append(el('div', 'vs-mark', 'VS'));
    list.append(plate(p, ranked, order.length === 2));
  });
  root.append(list, el('div', 'vs-skip', 'タップで始める'));
  (document.getElementById('app') ?? document.body).append(root);
  const ms = UI_CONFIG.reducedMotion || UI_CONFIG.speed === 0 ? 1400 : 2600;
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      root.classList.add('leaving');
      setTimeout(() => { root.remove(); resolve(); }, UI_CONFIG.reducedMotion ? 0 : 220);
    };
    const timer = setTimeout(finish, ms);
    root.addEventListener('click', finish);
    root.addEventListener('keydown', finish);
    root.tabIndex = -1;
    root.focus({ preventScroll: true });
  });
}
