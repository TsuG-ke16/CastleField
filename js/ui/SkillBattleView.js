// 対戦中のスキル表示（クラシックでスキルを取ったときだけ出る）。
// - 左の「スキル」ボタンで開くパネル：取得スキル一覧（折りたたみ・回数）、状態（魂・血気・貯蔵MP・予約・債務・SP など）、
//   任意スキルのメニュー（Game.listSkillActions の結果だけを使う：対象・コスト・プレビュー・キャンセル・実行）、発動ログ
// - カード使用前のダイアログ：playCard の第3引数 skillOptions（B01/B08 の HP置換・B03・X27・L06）。費用の見積もりは
//   セッションの previewCardCost（Game の費用計画をそのまま使う。画面で計算しない）
// 同じ端末（LocalSession：Game を直接）とオンライン（OnlineClient：サーバー経由）は、セッションのメソッドの呼び方が同じ。
// 違いは、オンラインの見積もりが Promise で返ることと、発動ログがサーバーから届くこと（receiveLog）だけ
// 相手については getState の公開部分（skills・skillState の公開キー）だけを出す。ルールは Game 側だけにある。

import { treeIndex } from '../game/SkillTree.js';
import { skillStatusRows, skillLogText, usesText, cardSkillQuestions, answersToOptions, implementationOf } from './skillTreeModel.js';
import { playerName } from './text.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const COST_NAMES = { mp: 'MP', sp: 'SP', hp: '城HP', soul: '魂', blood: '血気', storedMp: '貯蔵MP', healStore: '回復貯蔵', coins: 'コイン' };
const LOG_MAX = 40;

function costText(cost) {
  const parts = Object.entries(cost ?? {}).filter(([, v]) => v > 0).map(([k, v]) => `${COST_NAMES[k] ?? k}${v}`);
  return parts.length ? `消費：${parts.join('・')}` : '消費なし';
}
function previewText(p) {
  if (p === null || p === undefined) return '';
  if (typeof p !== 'object') return String(p);
  return Object.entries(p).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' ／ ');
}
/** 任意アクションの args にある兵士のID（盤面で光らせる） */
const soldierOf = (args) => args?.soldierId ?? args?.targetId ?? null;

export class SkillBattleView {
  /**
   * @param {{ tree: object, cards: object, renderer: object, toast: Function,
   *           onRun: (actionId: string, args: object) => Promise<{ok:boolean, reason?:string}|null>,
   *           canAct: () => boolean }} o
   */
  constructor({ tree, cards, renderer, toast = () => {}, onRun, canAct = () => true }) {
    Object.assign(this, { tree, cards, renderer, toast, onRun, canAct });
    this.ix = treeIndex(tree);
    this.log = [];
    this.unread = 0;
    this.state = null;
    this.viewerId = null;
    this.session = null;
    this.pick = null; // 任意アクションの選択中 { action, optionIndex }
    this.makeDom();
  }

  makeDom() {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'skill-battle-toggle';
    toggle.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'skill-battle');
    toggle.innerHTML = 'スキル<span class="sb-badge" hidden></span>';
    const panel = document.createElement('section');
    panel.id = 'skill-battle';
    panel.className = 'skill-battle';
    panel.hidden = true;
    panel.setAttribute('aria-label', 'スキル');
    document.body.append(toggle, panel);
    this.toggle = toggle;
    this.panel = panel;
    toggle.addEventListener('click', (e) => { e.stopPropagation(); this.setOpen(panel.hidden); });
    panel.addEventListener('click', (e) => { e.stopPropagation(); this.onClick(e); });
    panel.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  setOpen(open) {
    this.panel.hidden = !open;
    this.toggle.setAttribute('aria-expanded', String(open));
    if (open) { this.unread = 0; this.render(); this.panel.querySelector('button')?.focus({ preventScroll: true }); }
    else this.clearPick();
    this.renderBadge();
  }

  /** 試合が変わったとき */
  reset() {
    this.h01Told = false;
    this.log = [];
    this.unread = 0;
    this.state = null;
    this.clearPick();
    this.setOpen(false);
    this.toggle.hidden = true;
  }

  /** 発動ログの1件（game.observeSkills から）。自分のもの以外は skillLogText が null を返す */
  addLog(entry, viewerId = this.viewerId) {
    const text = skillLogText(this.tree, entry, viewerId);
    if (!text) return;
    this.log.push({ turn: entry.turn, text });
    if (this.log.length > LOG_MAX) this.log.shift();
    if (this.panel.hidden) this.unread += 1;
    this.renderBadge();
  }

  /** オンライン：サーバーから届いた発動ログ（自分の分だけ）。replace はつなぎ直したときの送り直し */
  receiveLog(msg, viewerId) {
    if (msg.replace) { this.log = []; this.unread = 0; }
    for (const entry of msg.entries ?? []) this.addLog(entry, viewerId);
    if (msg.replace) { this.unread = 0; this.renderBadge(); }
    if (!this.panel.hidden) this.render();
  }

  /** 状態の更新（settle のたび） */
  update(st, viewerId, session) {
    this.state = st;
    this.viewerId = viewerId;
    this.session = session;
    const anySkills = st && Object.values(st.players ?? {}).some((p) => p.skills?.length);
    this.toggle.hidden = !anySkills || st.phase === 'gameOver';
    if (this.toggle.hidden) { this.setOpen(false); return; }
    // H01 戦略的準備：最初の手札の引き直しで、戻す枚数が0〜2枚なら「先に引いてから戻したカードを混ぜる」
    if (st.phase === 'mulligan' && st.mulligan?.pending?.includes(viewerId) && st.players[viewerId]?.skills?.includes('H01') && !this.h01Told) {
      this.h01Told = true;
      this.toast('戦略的準備（H01）：戻すカードが0〜2枚なら、先に山札から引いてから、戻したカードを山札に混ぜます', 'info');
    }
    if (!this.panel.hidden) this.render();
  }

  renderBadge() {
    const b = this.toggle.querySelector('.sb-badge');
    b.hidden = this.unread === 0;
    b.textContent = String(this.unread);
  }

  actions() {
    if (!this.session || !this.viewerId) return [];
    try { return this.session.listSkillActions?.(this.viewerId) ?? []; } catch { return []; }
  }

  render() {
    const st = this.state;
    if (!st) return;
    const me = st.players[this.viewerId];
    const name = (id) => this.ix.byId.get(id)?.name ?? id;
    const section = (pid, own) => {
      const p = st.players[pid];
      if (!p?.skills?.length) return own ? '<p class="sb-note">スキルを取っていません。</p>' : '';
      const rows = skillStatusRows(p.skills, p.skillState, own);
      const list = p.skills.map((id) => {
        const uses = own ? usesText(this.tree, p.skillState, id) : '';
        const dormant = implementationOf(id) === null;
        return `<li><b>${esc(name(id))}</b><small>${id}${p.skillConfig?.[id] ? `・${esc(this.configName(id, p.skillConfig[id]))}` : ''}${uses ? `・${esc(uses)}` : ''}</small>${dormant ? '<small class="sb-dormant">休眠</small>' : ''}</li>`;
      }).join('');
      return `${rows.length ? `<dl class="sb-rows">${rows.map((r) => `<dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd>`).join('')}</dl>` : ''}
        <details${own ? '' : ''}><summary>取得スキル（${p.skills.length}）</summary><ul class="sb-skills">${list}</ul></details>
        ${p.skillError ? `<p class="sb-note">${esc(p.skillError)}（スキルなしで対戦中）</p>` : ''}`;
    };
    const foes = st.playerOrder.filter((id) => id !== this.viewerId && st.players[id]?.skills?.length);
    const acts = me?.skills?.length ? this.actions() : [];
    const myTurn = st.phase === 'main' && st.currentPlayer === this.viewerId;
    let actionsHtml = '';
    if (acts.length) {
      actionsHtml = `<h3>スキルを使う</h3>${myTurn ? '' : '<p class="sb-note">任意スキルは自分の番のメイン行動中に使えます。</p>'}<div class="sb-actions">${acts.map((a, i) => {
        const open = this.pick?.actionId === a.actionId;
        const opts = open ? `<div class="sb-options" role="group" aria-label="${esc(a.label)}の対象・内容">${a.options.map((o, j) => `<button type="button" class="sb-option" data-opt="${j}" aria-pressed="${this.pick.optionIndex === j}">${esc(o.label ?? a.label)}<small>${esc(costText(o.cost))}${o.preview ? `・${esc(previewText(o.preview))}` : ''}</small></button>`).join('')}</div>
          ${this.pick.optionIndex !== null ? `<div class="sb-confirm"><button type="button" class="plank-btn" data-run="1">実行する</button><button type="button" class="small-btn" data-cancel="1">キャンセル</button></div>` : '<div class="sb-confirm"><button type="button" class="small-btn" data-cancel="1">キャンセル</button></div>'}` : '';
        return `<div><button type="button" class="sb-action" data-act="${i}"${a.ok ? '' : ' aria-disabled="true"'} aria-expanded="${open}">${esc(a.label)}<small>${a.ok ? `${a.scope === 'match' ? '試合中' : 'このターン'} ${a.used}/${a.limit}` : esc(a.reason ?? '')}</small></button>${opts}</div>`;
      }).join('')}</div>`;
    }
    this.panel.innerHTML = `
      <div class="sb-head"><h2>スキル</h2><button type="button" class="sb-close" data-close="1" aria-label="閉じる">×</button></div>
      <h3>あなた</h3>${section(this.viewerId, true)}
      ${actionsHtml}
      ${`<details${this.log.length ? ' open' : ''}><summary>発動ログ（${this.log.length}）</summary><ul class="sb-log">${this.log.slice().reverse().map((l) => `<li>${l.turn ? `${l.turn}手目：` : ''}${esc(l.text)}</li>`).join('') || '<li>まだありません</li>'}</ul></details>`}
      ${foes.map((id) => `<h3>${esc(playerName(id))}</h3>${section(id, false)}`).join('')}`;
    this.highlight();
  }

  configName(id, value) {
    return this.ix.byId.get(id)?.config?.options.find((o) => o.id === value)?.name ?? value;
  }

  onClick(e) {
    if (e.target.closest('[data-close]')) return this.setOpen(false);
    const acts = this.actions();
    const actBtn = e.target.closest('[data-act]');
    if (actBtn) {
      const a = acts[Number(actBtn.dataset.act)];
      if (!a) return;
      if (!a.ok) return this.toast(a.reason ?? '今は使えません', 'info');
      this.pick = this.pick?.actionId === a.actionId ? null : { actionId: a.actionId, optionIndex: a.options.length === 1 ? 0 : null };
      return this.render();
    }
    const opt = e.target.closest('[data-opt]');
    if (opt && this.pick) { this.pick.optionIndex = Number(opt.dataset.opt); return this.render(); }
    if (e.target.closest('[data-cancel]')) { this.clearPick(); return this.render(); }
    if (e.target.closest('[data-run]')) this.run();
  }

  async run() {
    const a = this.actions().find((x) => x.actionId === this.pick?.actionId);
    const o = a?.options[this.pick?.optionIndex];
    if (!a || !o) return;
    if (!this.canAct()) return this.toast('演出が終わってから使えます', 'info');
    const res = await this.onRun(a.actionId, o.args ?? {});
    if (!res) return;
    if (!res.ok) { this.toast(res.reason ?? '使えませんでした'); return; }
    this.clearPick();
    this.toast(`${a.label}を使いました`, 'info');
  }

  clearPick() {
    this.pick = null;
    if (this.highlighted) { this.renderer?.setTargets(null); this.highlighted = false; }
  }

  /** 選んでいるアクションの対象の兵士を盤面で光らせる（既存の Renderer.setTargets を使う） */
  highlight() {
    const a = this.pick ? this.actions().find((x) => x.actionId === this.pick.actionId) : null;
    const targets = [];
    for (const o of a?.options ?? []) {
      const sid = soldierOf(o.args);
      if (!sid) continue;
      const owner = Object.entries(this.state?.players ?? {}).find(([, p]) => p.soldiers?.some((s) => s.soldierId === sid))?.[0];
      if (owner) targets.push({ playerId: owner, soldierId: sid });
    }
    if (targets.length) { this.renderer?.setTargets(targets); this.highlighted = true; }
    else if (this.highlighted) { this.renderer?.setTargets(null); this.highlighted = false; }
  }

  /** 盤面のタップ（光らせた兵士）。選んでいるアクションの、その兵士の選択肢が1つならそれを選ぶ。扱ったら true */
  tap(target) {
    if (!this.pick || !this.highlighted) return false;
    const a = this.actions().find((x) => x.actionId === this.pick.actionId);
    const idx = (a?.options ?? []).map((o, i) => [o, i]).filter(([o]) => soldierOf(o.args) && soldierOf(o.args) === target?.soldierId).map(([, i]) => i);
    if (idx.length) { this.pick.optionIndex = idx[0]; this.render(); if (this.panel.hidden) this.setOpen(true); }
    return true;
  }

  // ================= カード使用前の選択 =================

  /**
   * カードを出す前に、スキルの選択（skillOptions）を聞く。聞くことがなければすぐ undefined（今までと同じ呼び方）。
   * キャンセルなら null
   */
  chooseCardOptions(cardId, type, session) {
    const st = this.state;
    const me = st?.players?.[this.viewerId];
    const def = this.cards[type];
    const questions = me?.skills?.length && st.phase === 'main' ? cardSkillQuestions(me.skills, def, { mp: me.mp ?? 0, cost: st.mpCosts?.[type] ?? 0 }) : [];
    if (!questions.length) return Promise.resolve(undefined);
    return new Promise((resolve) => {
      const dlg = document.createElement('div');
      dlg.className = 'skill-battle';
      dlg.setAttribute('role', 'dialog');
      dlg.setAttribute('aria-modal', 'true');
      dlg.setAttribute('aria-label', `${def?.name ?? 'カード'}のスキル選択`);
      const answers = Object.fromEntries(questions.map((q) => [q.key, q.default ?? (q.type === 'range' ? q.min : undefined)]));
      // 見積もり：同じ端末ならすぐ、オンラインならサーバーに聞く（Promise）。古い答えは捨てる
      let pvSeq = 0;
      let pvTimer = null;
      let done = false;
      const pvHtml = (pv, opts) => {
        if (pv === 'pending') return '<p class="sb-note">実際の支払いを確かめています…</p>';
        if (!pv) return '<p class="sb-note">実際の支払いの見積もりはありません。</p>';
        return pv.ok ? `<p class="sb-preview">実際の支払い：MP ${pv.mp}${pv.hp ? `・城HP ${pv.hp}` : ''}${opts.bloodBlade ? '（血の刃は命中時に城HP2）' : ''}${opts.bloodEcho ? '（血のやまびこは命中後に城HP2）' : ''}</p>` : `<p class="sb-preview bad">${esc(pv.reason)}</p>`;
      };
      const showPreview = (pv, opts) => {
        const box = dlg.querySelector('.sb-pv');
        if (box) box.innerHTML = pvHtml(pv, opts);
        const ok = dlg.querySelector('[data-ok]');
        if (pv && pv !== 'pending' && !pv.ok) ok?.setAttribute('aria-disabled', 'true');
        else ok?.removeAttribute('aria-disabled');
      };
      const refreshPreview = () => {
        const opts = answersToOptions(questions, answers);
        const seq = ++pvSeq;
        clearTimeout(pvTimer);
        if (!session.previewCardCost) return showPreview(null, opts);
        if (session.online) {
          // つまみを動かしているあいだに何度も送らないよう、少し待ってから聞く
          showPreview('pending', opts);
          pvTimer = setTimeout(async () => {
            let pv = null;
            try { pv = await session.previewCardCost(cardId, opts); } catch { pv = null; }
            if (!done && seq === pvSeq) showPreview(pv, opts);
          }, 150);
          return;
        }
        showPreview(session.previewCardCost(cardId, opts), opts);
      };
      const draw = () => {
        dlg.innerHTML = `<div class="sb-head"><h2>「${esc(def?.name ?? type)}」を使う</h2></div>
          ${questions.map((q) => {
            if (q.type === 'range') return `<div class="sb-q"><label for="sbq-${q.key}">${esc(q.label)}：<b>${answers[q.key]}</b></label><input id="sbq-${q.key}" type="range" min="${q.min}" max="${q.max}" step="1" value="${answers[q.key]}" data-q="${q.key}"></div>`;
            if (q.type === 'toggle') return `<div class="sb-q"><label><input type="checkbox" data-q="${q.key}"${answers[q.key] ? ' checked' : ''}>${esc(q.label)}</label></div>`;
            return `<div class="sb-q"><label>${esc(q.label)}<select data-q="${q.key}">${q.choices.map(([v, l]) => `<option value="${v}"${answers[q.key] === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label></div>`;
          }).join('')}
          <div class="sb-pv"></div>
          <div class="sb-confirm"><button type="button" class="plank-btn" data-ok="1">使う</button><button type="button" class="small-btn" data-no="1">キャンセル</button></div>`;
        refreshPreview();
      };
      const finish = (v) => { done = true; clearTimeout(pvTimer); dlg.remove(); resolve(v); };
      dlg.addEventListener('input', (e) => {
        const k = e.target.dataset?.q;
        if (!k) return;
        answers[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'range' ? Number(e.target.value) : e.target.value;
        const focus = k;
        draw();
        dlg.querySelector(`[data-q="${focus}"]`)?.focus();
      });
      dlg.addEventListener('click', (e) => {
        e.stopPropagation();
        if (e.target.closest('[data-no]')) finish(null);
        else if (e.target.closest('[data-ok]')) {
          if (e.target.closest('[data-ok]').getAttribute('aria-disabled') === 'true') return;
          finish(answersToOptions(questions, answers));
        }
      });
      dlg.addEventListener('pointerdown', (e) => e.stopPropagation());
      dlg.addEventListener('keydown', (e) => { if (e.key === 'Escape') finish(null); });
      draw();
      document.body.append(dlg);
      dlg.querySelector('[data-ok]')?.focus();
    });
  }
}
