// クラシックの対戦前に開く、スキルツリーの画面（200ノード＋辺を SVG で描く）。
// - ドラッグでパン、ホイール・ピンチでズーム、＋／−／全体ボタン
// - 系統の絞り込み・検索（ジャンプ）、取得済みの経路の強調、残りポイント・奥義数・取得数
// - ノードをタップすると詳細（名前・効果・条件・回数・取得できるかと理由）。取得・解除・E04/X25 の選択
// - おすすめ（data の presets）・全リセット。変えるたびに localStorage へ保存（SkillTree.serializeBuild の版つき）
// ルールはすべて js/game/SkillTree.js（skillTreeModel.js 経由）。この画面で別の決まりを作らない。
// 見た目・操作は PR #200 の独立プレビュー（previews/skill-tree/）を土台にした：深い青緑の配色、系統アイコン（既存の assets/ui）、
// 奥義＝大きな菱形、取得済み＝水色＋チェック、取得できる＝金の輪郭、選択＝金の点線の輪、ミニマップ（Canvas）、系統名のラベル。
// ノードの種類（START＝紋章の大きな円・通常＝円・奥義＝大きな菱形・横断＝六角形）と状態（取得済み＝水色の塗り＋✓／
// 取得できる＝金の太い輪郭＋「＋」／条件不足＝破線＋「!」／未接続＝点線・暗い・アイコン灰色）は、色だけでなく形・明暗・線種・記号で区別する。

import { treeIndex } from '../game/SkillTree.js';
import { GROUP_ICONS, CROSS_ICON, START_ICON } from './skillTreeExport.js';
import {
  allStatuses, buildSummary, edgeList, edgeState, routeTo, searchNodes, groupList, nodeDetail, nodeKind,
  acquire, releaseNode, setConfig, applyPreset, loadSavedBuild, saveBuild, buildForGame, STATE_LABEL,
} from './skillTreeModel.js';

const SVG = 'http://www.w3.org/2000/svg';
const R = { start: 40, normal: 22, ultimate: 34, cross: 18 };
/** データの layout 座標の倍率（PR200 と同じくらいのノードの大きさで重ならないように広げる） */
const SCALE = 1.8;
const asset = (path) => `assets/${path}`;
const MARK = { owned: '✓', available: '+', blocked: '!', unconnected: '', start: '★' };
const IMPL_TEXT = { handler: '', core: '', static: '', null: '※この効果は今のクラシックの仕組みでは発動しません（休眠）' };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function shapePath(kind, r) {
  if (kind === 'cross') {
    return Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 6 + (i * Math.PI) / 3; return `${(r * Math.cos(a)).toFixed(1)},${(r * Math.sin(a)).toFixed(1)}`; }).join(' ');
  }
  if (kind === 'ultimate') return `0,${-r * 1.35} ${r * 1.35},0 0,${r * 1.35} ${-r * 1.35},0`; // PR200 と同じ大きな菱形
  return null; // 円（通常・START）
}

export class SkillTreeView {
  /**
   * @param {{ tree: object, storage?: Storage, toast?: (text: string, kind?: string) => void }} o
   */
  constructor({ tree, storage = globalThis.localStorage, toast = () => {} }) {
    this.tree = tree;
    this.storage = storage;
    this.toast = toast;
    this.budget = tree.budget;
    this.ix = treeIndex(tree);
    const saved = loadSavedBuild(tree, storage);
    this.build = saved.build;
    this.notice = saved.notice;
    this.selected = null;
    this.filter = null; // 系統ID か 'available' か null
    this.query = '';
    this.view = null;
    this.handlers = null;
    this.makeDom();
  }

  /** 今の（保存済みの）ビルドを対戦に渡す形で（{ ids, config }） */
  currentBuild() {
    return buildForGame(this.tree, this.build, this.budget);
  }

  /**
   * 画面を開く。onDone(build) は「このスキルで決定」、onCancel は「もどる」
   * @param {{ title?: string, doneLabel?: string, onDone: (build: object) => void, onCancel?: () => void }} o
   */
  open({ title = 'スキルツリー（クラシック）', doneLabel = 'このスキルで決定', onDone, onCancel } = {}) {
    this.handlers = { onDone, onCancel };
    this.box.querySelector('.st-title').textContent = title;
    this.box.querySelector('.st-done').textContent = doneLabel;
    this.box.hidden = false;
    document.documentElement.classList.add('skilltree-open');
    if (this.notice) {
      this.toast(this.notice, 'info');
      this.notice = null;
    }
    this.render();
    requestAnimationFrame(() => { this.initialView(); this.box.querySelector('.st-search').focus({ preventScroll: true }); });
  }

  close() {
    this.box.hidden = true;
    document.documentElement.classList.remove('skilltree-open');
  }

  // ================= DOM =================

  makeDom() {
    const box = document.createElement('section');
    box.id = 'skilltree-view';
    box.className = 'skilltree';
    box.hidden = true;
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'st-title');
    const presets = Object.entries(this.tree.presets ?? {});
    box.innerHTML = `
      <header class="st-head">
        <button type="button" class="st-back" aria-label="もどる">もどる</button>
        <h2 id="st-title" class="st-title"></h2>
        <div class="st-summary" aria-live="polite"></div>
      </header>
      <div class="st-tools">
        <label class="st-search-wrap"><span class="visually-hidden">ノードを探す</span>
          <input class="st-search" type="search" placeholder="名前・効果・系統で探す（例：会心、MP）" autocomplete="off" enterkeyhint="search"></label>
        <select class="st-preset" aria-label="おすすめのビルド"><option value="">おすすめを適用…</option>${presets.map(([id, p]) => `<option value="${esc(id)}">${esc(p.name)}</option>`).join('')}</select>
        <button type="button" class="st-reset">全リセット</button>
      </div>
      <div class="st-groups" role="toolbar" aria-label="系統で絞り込む"></div>
      <ul class="st-results" aria-label="見つかったノード" hidden></ul>
      <div class="st-stage">
        <svg class="st-svg" role="group" aria-label="スキルツリーの図（ドラッグで移動・ホイールかピンチで拡大）"><defs><pattern id="st-dots" width="60" height="60" patternUnits="userSpaceOnUse"><circle cx="0" cy="0" r="1.4" fill="#8ad7de" opacity=".15"/></pattern></defs><rect class="st-bg" x="-5000" y="-5000" width="10000" height="10000" fill="url(#st-dots)"/><g class="st-labels"></g><g class="st-edges"></g><g class="st-route"></g><g class="st-nodes"></g></svg>
        <div class="st-minimap" aria-hidden="true"><canvas width="180" height="180"></canvas><span>全体マップ</span></div>
        <div class="st-zoom" role="group" aria-label="拡大縮小">
          <button type="button" data-zoom="in" aria-label="拡大">＋</button><button type="button" data-zoom="out" aria-label="縮小">−</button><button type="button" data-zoom="fit" aria-label="全体を表示">全体</button>
        </div>
        <details class="st-legend"><summary>凡例</summary>
          <ul>
            <li><span class="lg lg-start">◎</span>START（紋章・0pt）</li>
            <li><span class="lg lg-normal">●</span>通常 ／ <span class="lg lg-ult">◆</span>奥義（大きな菱形・1つまで） ／ <span class="lg lg-cross">⬢</span>横断（六角形）</li>
            <li><span class="lg lg-owned">✓</span>取得済み（水色の塗り・チェック）</li>
            <li><span class="lg lg-avail">＋</span>取得できる（金の太い輪郭）</li>
            <li><span class="lg lg-blocked">!</span>条件不足（破線：必須ノード・奥義・ポイント）</li>
            <li><span class="lg lg-unconn"> </span>未接続（点線・暗い・灰色のアイコン）</li>
            <li>水色の太線＝取得済みの経路／金の線＝次に取れるノードへの線／点線＝横断の線</li>
          </ul>
        </details>
      </div>
      <aside class="st-detail" aria-live="polite" hidden></aside>
      <footer class="st-foot">
        <button type="button" class="st-done"></button>
      </footer>`;
    document.body.append(box);
    this.box = box;
    this.svg = box.querySelector('.st-svg');
    this.gEdges = box.querySelector('.st-edges');
    this.gLabels = box.querySelector('.st-labels');
    this.minimap = box.querySelector('.st-minimap canvas');
    this.gRoute = box.querySelector('.st-route');
    this.gNodes = box.querySelector('.st-nodes');
    this.detail = box.querySelector('.st-detail');
    this.results = box.querySelector('.st-results');

    // 系統のボタン
    const groups = box.querySelector('.st-groups');
    const chip = (id, name, color) => `<button type="button" class="st-chip" data-group="${esc(id)}" aria-pressed="false" style="--gc:${esc(color)}">${GROUP_ICONS[id] || id === 'X' ? `<img src="${asset(GROUP_ICONS[id] ?? CROSS_ICON)}" alt="">` : ''}${esc(name)}</button>`;
    groups.innerHTML = chip('', 'すべて', '#ccc') + chip('available', '取得できる', '#fff') + groupList(this.tree).map((g) => chip(g.id, g.name, g.color)).join('');

    this.drawStatic();

    box.querySelector('.st-back').addEventListener('click', () => { this.close(); this.handlers?.onCancel?.(); });
    box.querySelector('.st-done').addEventListener('click', () => { this.save(); this.close(); this.handlers?.onDone?.(this.currentBuild()); });
    box.querySelector('.st-reset').addEventListener('click', () => {
      if (this.build.ids.length && !confirmReset()) return;
      this.update({ ids: [], config: {} }, 'リセットしました');
    });
    const presetSel = box.querySelector('.st-preset');
    presetSel.addEventListener('change', () => {
      const id = presetSel.value;
      presetSel.value = '';
      if (!id) return;
      const r = applyPreset(this.tree, id, this.budget);
      if (!r.ok) return this.toast(r.reason);
      this.update(r.build, `おすすめ「${this.tree.presets[id].name}」を適用しました`);
    });
    groups.addEventListener('click', (e) => {
      const b = e.target.closest('[data-group]');
      if (!b) return;
      this.filter = b.dataset.group || null;
      this.render();
      if (this.filter && this.filter !== 'available') this.jumpToIds(searchNodes(this.tree, '', this.filter));
    });
    const search = box.querySelector('.st-search');
    search.addEventListener('input', () => { this.query = search.value; this.render(); });
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const first = this.results.querySelector('button');
        if (first) first.click();
      }
    });
    this.results.addEventListener('click', (e) => {
      const b = e.target.closest('[data-id]');
      if (!b) return;
      this.select(b.dataset.id, { center: true });
    });
    box.querySelector('.st-zoom').addEventListener('click', (e) => {
      const z = e.target.closest('[data-zoom]')?.dataset.zoom;
      if (z === 'fit') this.fit();
      else if (z) this.zoomAt(z === 'in' ? 1.4 : 1 / 1.4);
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!this.detail.hidden) { this.select(null); e.stopPropagation(); }
      }
    });
    this.detail.addEventListener('click', (e) => this.onDetailClick(e));
    this.detail.addEventListener('change', (e) => {
      const sel = e.target.closest('select[data-config]');
      if (!sel) return;
      const r = setConfig(this.tree, this.build, sel.dataset.config, sel.value, this.budget);
      if (!r.ok) return this.toast(r.reason);
      this.update(r.build);
    });
    this.setupGestures();
    window.addEventListener('resize', () => { if (!this.box.hidden) this.applyView(); });
  }

  /** 画面上の座標（データの layout × SCALE） */
  pos(id) {
    const l = id === this.ix.startId ? this.tree.start.layout ?? { x: 0, y: 0 } : this.ix.byId.get(id)?.layout;
    return l ? { x: l.x * SCALE, y: l.y * SCALE } : null;
  }

  /** 辺とノードの形（状態に関係しない部分）を一度だけ作る */
  drawStatic() {
    const pos = (id) => this.pos(id);
    // 系統名のラベル（PR200 のクラスター名）：その系統の奥義（08）の外側
    for (const [gid, g] of Object.entries(this.tree.groups)) {
      const ult = this.pos(`${gid}08`);
      if (!ult) continue;
      const len = Math.hypot(ult.x, ult.y) || 1;
      const out = gid === this.tree.center ? { x: ult.x, y: ult.y + 70 } : { x: ult.x + (ult.x / len) * 80, y: ult.y + (ult.y / len) * 80 };
      const t = document.createElementNS(SVG, 'text');
      t.setAttribute('x', out.x); t.setAttribute('y', out.y);
      t.classList.add('st-cluster');
      t.textContent = g.name;
      this.gLabels.append(t);
    }
    this.edgeEls = edgeList(this.tree).map(([a, b]) => {
      const pa = pos(a), pb = pos(b);
      const line = document.createElementNS(SVG, 'line');
      line.setAttribute('x1', pa.x); line.setAttribute('y1', pa.y); line.setAttribute('x2', pb.x); line.setAttribute('y2', pb.y);
      line.classList.add('st-edge');
      if (this.ix.byId.get(a)?.cross || this.ix.byId.get(b)?.cross) line.classList.add('cross');
      this.gEdges.append(line);
      return { a, b, el: line };
    });
    this.nodeEls = new Map();
    const ids = [this.ix.startId, ...this.ix.order];
    for (const id of ids) {
      const node = this.ix.byId.get(id) ?? null;
      const kind = nodeKind(node);
      const p = pos(id);
      const color = node ? (node.cross ? this.tree.crossGroup?.color ?? '#fff' : this.tree.groups[node.group]?.color ?? '#999') : '#ffd54f';
      const g = document.createElementNS(SVG, 'g');
      g.classList.add('st-node', `k-${kind}`);
      g.dataset.id = id;
      g.setAttribute('transform', `translate(${p.x} ${p.y})`);
      g.setAttribute('role', 'button');
      g.setAttribute('tabindex', '-1');
      g.style.setProperty('--gc', color);
      const r = R[kind];
      const pts = shapePath(kind, r);
      const shape = document.createElementNS(SVG, pts ? 'polygon' : 'circle');
      if (pts) shape.setAttribute('points', pts); else shape.setAttribute('r', r);
      shape.classList.add('st-shape');
      const ring = document.createElementNS(SVG, 'circle');
      ring.setAttribute('r', (kind === 'ultimate' ? r * 1.35 : r) + 9);
      ring.classList.add('st-ring');
      const img = document.createElementNS(SVG, 'image');
      const icon = !node ? START_ICON : node.cross ? CROSS_ICON : GROUP_ICONS[node.group];
      const size = r * (kind === 'start' ? 1.5 : 1.25);
      img.setAttribute('href', asset(icon ?? 'ui/icon-kind-spell.png'));
      img.setAttribute('x', -size / 2); img.setAttribute('y', -size / 2); img.setAttribute('width', size); img.setAttribute('height', size);
      img.classList.add('st-icon');
      // 状態の記号（✓ ＋ !）は右下の小さな丸に（PR200 のチェックの位置）
      const badge = document.createElementNS(SVG, 'g');
      badge.classList.add('st-badge');
      const off = (kind === 'ultimate' ? r * 1.0 : r * 0.75);
      badge.setAttribute('transform', `translate(${off} ${off})`);
      const bdisc = document.createElementNS(SVG, 'circle');
      bdisc.setAttribute('r', 9);
      const mark = document.createElementNS(SVG, 'text');
      mark.classList.add('st-mark');
      mark.setAttribute('dy', '0.35em');
      badge.append(bdisc, mark);
      const idText = document.createElementNS(SVG, 'text');
      idText.classList.add('st-id');
      const below = kind === 'ultimate' ? r * 1.35 : r;
      idText.setAttribute('y', below + 14);
      idText.textContent = node ? id : 'START';
      const name = document.createElementNS(SVG, 'text');
      name.classList.add('st-name');
      name.setAttribute('y', below + 27);
      name.textContent = node ? node.name : '';
      g.append(ring, shape, img, badge, idText, name);
      this.gNodes.append(g);
      this.nodeEls.set(id, { g, mark, node });
    }
  }

  // ================= 描画（状態） =================

  render() {
    const picked = this.build.ids;
    const st = allStatuses(this.tree, picked, this.budget);
    this.statuses = st;
    const matches = this.query.trim() || (this.filter && this.filter !== 'available')
      ? new Set(searchNodes(this.tree, this.query, this.filter && this.filter !== 'available' ? this.filter : null))
      : null;
    for (const [id, { g, mark, node }] of this.nodeEls) {
      const s = st.get(id);
      g.classList.remove('st-owned', 'st-available', 'st-blocked', 'st-unconnected', 'st-start', 'dim', 'hit', 'selected');
      g.classList.add(`st-${s.state}`);
      mark.textContent = MARK[s.state] ?? '';
      const label = node ? `${id} ${node.name}（${node.cross ? '横断' : node.ultimate ? '奥義' : '通常'}）・${STATE_LABEL[s.state]}` : 'スタート';
      g.setAttribute('aria-label', label);
      let dim = false;
      if (matches && id !== this.ix.startId) dim = !matches.has(id);
      if (this.filter === 'available' && id !== this.ix.startId) dim = s.state !== 'available';
      g.classList.toggle('dim', dim);
      g.classList.toggle('hit', Boolean(matches?.has(id) && this.query.trim()));
      g.classList.toggle('selected', this.selected === id);
    }
    for (const e of this.edgeEls) {
      e.el.classList.remove('path', 'next', 'plain', 'dim');
      e.el.classList.add(edgeState(st, e.a, e.b));
      if (matches || this.filter === 'available') e.el.classList.add('dim');
    }
    for (const b of this.box.querySelectorAll('.st-chip')) b.setAttribute('aria-pressed', String((b.dataset.group || null) === this.filter));
    this.renderSummary();
    this.drawMinimap();
    this.renderResults(matches);
    this.renderRoute();
    this.renderDetail();
  }

  renderSummary() {
    const s = buildSummary(this.tree, this.build.ids, this.budget);
    this.box.querySelector('.st-summary').innerHTML =
      `<span class="st-pt${s.left === 0 ? ' zero' : ''}">残り <b>${s.left}</b>/${s.budget}pt</span>` +
      `<span>奥義 <b>${s.ultimates}</b>/1</span><span>取得 <b>${s.count}</b></span>`;
  }

  renderResults(matches) {
    const showList = this.query.trim() || this.filter === 'available';
    if (!showList) { this.results.hidden = true; return; }
    const ids = this.filter === 'available' && !this.query.trim()
      ? this.ix.order.filter((id) => this.statuses.get(id).state === 'available')
      : [...(matches ?? [])].filter((id) => this.filter !== 'available' || this.statuses.get(id).state === 'available');
    this.results.hidden = false;
    this.results.innerHTML = ids.length
      ? ids.slice(0, 40).map((id) => {
        const n = this.ix.byId.get(id);
        const s = this.statuses.get(id).state;
        return `<li><button type="button" class="st-result st-r-${s}" data-id="${id}"><span class="st-r-mark" aria-hidden="true">${MARK[s] || '·'}</span><b>${id}</b> ${esc(n.name)} <small>${STATE_LABEL[s]}</small></button></li>`;
      }).join('') + (ids.length > 40 ? `<li class="st-more">ほか ${ids.length - 40}件（言葉をしぼってください）</li>` : '')
      : '<li class="st-more">見つかりません</li>';
  }

  /** 選んだノードまでの道（未接続のときの案内。表示だけ） */
  renderRoute() {
    this.gRoute.replaceChildren();
    const id = this.selected;
    if (!id || !this.ix.byId.has(id) || this.build.ids.includes(id)) return;
    const route = routeTo(this.tree, this.build.ids, id);
    if (!route || route.length < 2) return;
    const pos = (x) => this.pos(x);
    const first = [...this.ix.adj.get(route[0])].find((x) => x === this.ix.startId || this.build.ids.includes(x));
    const pts = [first, ...route].map((x) => { const p = pos(x); return `${p.x},${p.y}`; }).join(' ');
    const line = document.createElementNS(SVG, 'polyline');
    line.setAttribute('points', pts);
    line.classList.add('st-routeline');
    this.gRoute.append(line);
  }

  renderDetail() {
    const id = this.selected;
    if (!id) { this.detail.hidden = true; return; }
    const d = nodeDetail(this.tree, this.build.ids, id, this.budget);
    if (!d) { this.detail.hidden = true; return; }
    this.detail.hidden = false;
    const s = d.status;
    const route = s.state === 'unconnected' ? routeTo(this.tree, this.build.ids, id) : null;
    const cfg = d.config ? `<label class="st-config">${esc(d.config.key === 'reaction' ? '強める反応' : '付ける属性')}：
        <select data-config="${id}">${d.config.options.map((o) => `<option value="${esc(o.id)}"${(this.build.config[id] ?? d.config.default) === o.id ? ' selected' : ''}>${esc(o.name)}${o.amount ? ` +${o.amount}` : ''}</option>`).join('')}</select></label>` : '';
    let actions = '';
    if (s.state === 'owned') {
      const rc = d.releaseCheck;
      actions = `<button type="button" class="small-btn st-release" data-act="release"${rc?.ok ? '' : ' aria-disabled="true"'}>解除する</button>${rc?.ok ? '' : `<p class="st-reason">${esc(rc?.reason)}</p>`}`;
    } else if (s.state === 'available') {
      actions = '<button type="button" class="st-acquire" data-act="acquire">取得する（1pt）</button>';
    } else if (s.state !== 'start') {
      actions = `<button type="button" class="small-btn" data-act="acquire" aria-disabled="true">取得できません</button><p class="st-reason">${esc(s.reason)}</p>${route ? `<p class="st-route-text">ここまでの道：${route.map((x) => esc(`${x}`)).join(' → ')}（${route.length}pt）</p>` : ''}`;
    }
    const dnode = this.ix.byId.get(id);
    const dicon = !dnode ? START_ICON : dnode.cross ? CROSS_ICON : GROUP_ICONS[dnode.group];
    this.detail.innerHTML = `
      <div class="st-d-head"><span class="st-d-kind k-${d.kind}">${esc(d.kindLabel)}</span>${d.group ? `<span class="st-d-group">${esc(d.group)}</span>` : ''}
        <h3>${esc(d.name)} <small>${esc(d.id === this.ix.startId ? '' : d.id)}</small></h3>
        <button type="button" class="st-d-close" data-act="close" aria-label="詳細を閉じる">×</button></div>
      <div class="st-card${d.kind === 'ultimate' ? ' ult' : ''}" aria-hidden="true"><img class="st-card-art" src="${asset(dicon ?? 'ui/icon-kind-spell.png')}" alt=""><img class="st-card-frame" src="assets/cards/frame-${d.kind === 'ultimate' ? 'legendary' : 'rare'}.png" alt=""></div>
      <p class="st-d-desc">${esc(d.desc)}</p>
      ${d.requires.length ? `<p class="st-d-row"><b>必須：</b>${esc(d.requires.join('・'))}</p>` : ''}
      ${d.ends.length ? `<p class="st-d-row"><b>つなぐ：</b>${esc(d.ends.join(' ↔ '))}（どちらか一方を取れば取得できます）</p>` : ''}
      ${d.limit ? `<p class="st-d-row"><b>回数：</b>${esc(d.limit)}</p>` : ''}
      ${IMPL_TEXT[d.implemented] ? `<p class="st-d-row st-dormant">${esc(IMPL_TEXT[d.implemented])}</p>` : ''}
      <p class="st-d-state st-s-${s.state}"><span aria-hidden="true">${MARK[s.state] || '·'}</span> ${esc(STATE_LABEL[s.state])}</p>
      ${cfg}
      <div class="st-d-actions">${actions}</div>`;
  }

  onDetailClick(e) {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'close') return this.select(null);
    const id = this.selected;
    if (act === 'acquire') {
      const r = acquire(this.tree, this.build, id, this.budget);
      if (!r.ok) return this.toast(r.reason);
      this.update(r.build);
    } else if (act === 'release') {
      const r = releaseNode(this.tree, this.build, id, this.budget);
      if (!r.ok) return this.toast(r.reason);
      this.update(r.build);
    }
  }

  update(build, message) {
    this.build = build;
    this.save();
    this.render();
    if (message) this.toast(message, 'info');
  }

  save() {
    if (!saveBuild(this.tree, this.storage, this.build, this.budget)) this.toast('スキルを保存できませんでした（この端末では次回は空になります）', 'info');
  }

  select(id, { center = false } = {}) {
    this.selected = id;
    this.render();
    if (id && center) this.centerOn(id);
    if (id) this.nodeEls.get(id)?.g.focus({ preventScroll: true });
  }

  // ================= 視点（パン・ズーム） =================

  size() {
    const r = this.svg.getBoundingClientRect();
    return { w: Math.max(1, r.width), h: Math.max(1, r.height), left: r.left, top: r.top };
  }

  /** 開いたとき：取得済みがあればその周り、なければ START の周りを読める大きさで（全体は「全体」ボタン） */
  initialView() {
    this.fit();
    if (this.build.ids.length) this.jumpToIds(this.build.ids);
    else this.view = { cx: 0, cy: 0, k: Math.max(this.view.k, 0.45) };
    this.view.k = Math.max(this.view.k, Math.min(0.45, this.view.k * 2.5));
    this.applyView();
  }

  fit() {
    const all = this.tree.nodes.map((n) => this.pos(n.id));
    const xs = all.map((p) => p.x), ys = all.map((p) => p.y);
    const pad = 60;
    const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad, minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
    const { w, h } = this.size();
    this.view = { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, k: Math.min(w / (maxX - minX), h / (maxY - minY)) };
    this.applyView();
  }

  applyView() {
    if (!this.view) return this.fit();
    const { w, h } = this.size();
    const k = this.view.k;
    this.svg.setAttribute('viewBox', `${this.view.cx - w / (2 * k)} ${this.view.cy - h / (2 * k)} ${w / k} ${h / k}`);
    this.svg.classList.toggle('zoom-names', k >= 0.6);
    this.svg.classList.toggle('zoom-far', k < 0.3);
    this.drawMinimap();
  }

  /** ミニマップ（PR200 と同じく Canvas に全体の線・点・今見ている範囲）。タップでその場所へ */
  drawMinimap() {
    const c = this.minimap;
    if (!c || !this.view) return;
    const ctx = c.getContext?.('2d');
    if (!ctx) return;
    const W = c.width, H = c.height, ext = 760 * SCALE, sc = Math.min(W, H) / (2 * ext);
    const tx = (x) => W / 2 + x * sc, ty = (y) => H / 2 + y * sc;
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = '#57757e';
    ctx.beginPath();
    for (const e of this.edgeEls) { const a = this.pos(e.a), b = this.pos(e.b); ctx.moveTo(tx(a.x), ty(a.y)); ctx.lineTo(tx(b.x), ty(b.y)); }
    ctx.stroke();
    for (const [id, { node }] of this.nodeEls) {
      const p = this.pos(id);
      const st = this.statuses?.get(id)?.state;
      ctx.fillStyle = st === 'owned' || st === 'start' ? '#b4e8dd' : st === 'available' ? '#f5cb80' : node?.ultimate ? '#f2a347' : '#6c939f';
      const s = st === 'owned' || st === 'available' ? 3 : 2;
      ctx.fillRect(tx(p.x) - s / 2, ty(p.y) - s / 2, s, s);
    }
    const { w, h } = this.size();
    ctx.strokeStyle = '#8ad7de';
    ctx.lineWidth = 1;
    const vw = (w / this.view.k) * sc, vh = (h / this.view.k) * sc;
    ctx.strokeRect(tx(this.view.cx) - vw / 2, ty(this.view.cy) - vh / 2, vw, vh);
    this.minimapScale = { sc, W, H };
  }

  /** 画面上の点 (sx, sy)（なければ中央）を中心に拡大縮小 */
  zoomAt(factor, sx = null, sy = null) {
    if (!this.view) this.fit();
    const { w, h, left, top } = this.size();
    const px = sx === null ? w / 2 : sx - left, py = sy === null ? h / 2 : sy - top;
    const k0 = this.view.k;
    const k1 = Math.max(0.15, Math.min(4, k0 * factor));
    const wx = this.view.cx + (px - w / 2) / k0, wy = this.view.cy + (py - h / 2) / k0;
    this.view = { cx: wx - (px - w / 2) / k1, cy: wy - (py - h / 2) / k1, k: k1 };
    this.applyView();
  }

  centerOn(id) {
    const p = this.pos(id);
    if (!p) return;
    if (!this.view) this.fit();
    this.view = { cx: p.x, cy: p.y, k: Math.max(this.view.k, 1.1) };
    this.applyView();
  }

  jumpToIds(ids) {
    const ps = ids.map((id) => this.pos(id)).filter(Boolean);
    if (!ps.length) return;
    const xs = ps.map((p) => p.x), ys = ps.map((p) => p.y);
    const { w, h } = this.size();
    const pad = 70;
    const bw = Math.max(...xs) - Math.min(...xs) + pad * 2, bh = Math.max(...ys) - Math.min(...ys) + pad * 2;
    this.view = { cx: (Math.max(...xs) + Math.min(...xs)) / 2, cy: (Math.max(...ys) + Math.min(...ys)) / 2, k: Math.min(2, w / bw, h / bh) };
    this.applyView();
  }

  setupGestures() {
    const svg = this.svg;
    const pts = new Map();
    let moved = 0, pinch = null, downTarget = null;
    svg.addEventListener('pointerdown', (e) => {
      svg.setPointerCapture?.(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) { moved = 0; downTarget = e.target.closest?.('.st-node')?.dataset.id ?? null; }
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: this.view.k };
        moved = 99;
      }
    });
    svg.addEventListener('pointermove', (e) => {
      const prev = pts.get(e.pointerId);
      if (!prev || !this.view) return;
      const cur = { x: e.clientX, y: e.clientY };
      pts.set(e.pointerId, cur);
      if (pts.size >= 2 && pinch) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const target = pinch.k * (d / Math.max(1, pinch.d));
        this.zoomAt(target / this.view.k, (a.x + b.x) / 2, (a.y + b.y) / 2);
        return;
      }
      const dx = cur.x - prev.x, dy = cur.y - prev.y;
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 6) {
        this.view.cx -= dx / this.view.k;
        this.view.cy -= dy / this.view.k;
        this.applyView();
      }
    });
    const up = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size === 0 && moved <= 6 && e.type === 'pointerup') this.select(downTarget, {});
    };
    svg.addEventListener('pointerup', up);
    this.minimap?.addEventListener('click', (e) => {
      if (!this.minimapScale || !this.view) return;
      const r = this.minimap.getBoundingClientRect();
      const { sc, W, H } = this.minimapScale;
      const x = ((e.clientX - r.left) * W) / r.width, y = ((e.clientY - r.top) * H) / r.height;
      this.view.cx = (x - W / 2) / sc;
      this.view.cy = (y - H / 2) / sc;
      this.applyView();
    });
    svg.addEventListener('pointercancel', up);
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
    }, { passive: false });
    // キーボード：フォーカスのあるノードで Enter／Space
    svg.addEventListener('keydown', (e) => {
      const id = e.target.closest?.('.st-node')?.dataset.id;
      if (id && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); this.select(id); }
    });
  }
}

function confirmReset() {
  try { return globalThis.confirm ? globalThis.confirm('取得したスキルをすべて外しますか？') : true; } catch { return true; }
}
