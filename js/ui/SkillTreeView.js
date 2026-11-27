// クラシックの200スキル＋STARTを19の紋章区画として描くUI。
// 専用アトラスの効果絵・種類別の装飾枠・通路の配線は表示専用。
// パン、ピンチ、検索、取得可能一覧、マウス即時選択、詳細、保存を担当する。
// 接続・効果・条件・コストは js/game/SkillTree.js（skillTreeModel.js 経由）を唯一の正とし、ここで変更しない。

import { TREE_LAYOUT } from './skillTreeLayout.js';
import { GROUP_ART, START_ART, CROSS_ART, FRAME_ART, SKILL_ART, atlasMarkup, atlasElement } from './KingdomArt.js';
import { treeIndex } from '../game/SkillTree.js';
import {
  allStatuses, buildSummary, edgeList, edgeState, routeTo, searchNodes, groupList, nodeDetail, nodeKind,
  acquire, releaseNode, setConfig, applyPreset, loadSavedBuild, saveBuild, buildForGame, STATE_LABEL,
} from './skillTreeModel.js';

const SVG = 'http://www.w3.org/2000/svg';
const R = { start: 42, normal: 26, ultimate: 40, cross: 23 };
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
    this.previousFocus = document.activeElement;
    this.box.hidden = false;
    document.documentElement.classList.add('skilltree-open');
    if (this.notice) {
      this.toast(this.notice, 'info');
      this.notice = null;
    }
    this.render();
    requestAnimationFrame(() => { this.initialView(); this.box.querySelector('.st-back').focus({ preventScroll: true }); });
  }

  close() {
    clearTimeout(this.tapTimer);
    this.box.hidden = true;
    document.documentElement.classList.remove('skilltree-open');
    this.previousFocus?.focus?.({ preventScroll: true });
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
        <svg class="st-svg" role="group" aria-label="スキルツリーの図（ドラッグで移動・ホイールかピンチで拡大）"><defs><pattern id="st-dots" width="60" height="60" patternUnits="userSpaceOnUse"><circle cx="0" cy="0" r="1.4" fill="#997344" opacity=".18"/></pattern></defs><rect class="st-bg" x="-5000" y="-5000" width="10000" height="10000" fill="url(#st-dots)"/><g class="st-labels"></g><g class="st-edges"></g><g class="st-route"></g><g class="st-nodes"></g></svg>
        <div class="st-minimap" aria-hidden="true"><canvas width="180" height="180"></canvas><span>全体マップ</span></div>
        <div class="st-zoom" role="group" aria-label="拡大縮小">
          <button type="button" data-zoom="in" aria-label="拡大">＋</button><button type="button" data-zoom="out" aria-label="縮小">−</button><button type="button" data-zoom="fit" aria-label="全体を表示">全体</button><button type="button" data-zoom="current" aria-label="選択中のノードまたはSTARTへ戻る">現在地</button>
        </div>
        <details class="st-legend"><summary>凡例・操作</summary>
          <ul>
            <li><span class="lg lg-start">◎</span>START（紋章・0pt）</li>
            <li><span class="lg lg-normal">●</span>通常 ／ <span class="lg lg-ult">◆</span>奥義（大きな菱形・1つまで） ／ <span class="lg lg-cross">⬢</span>横断（六角形）</li>
            <li><span class="lg lg-owned">✓</span>取得済み（ロイヤルブルーの塗り・チェック）</li>
            <li><span class="lg lg-avail">＋</span>取得できる（金の太い輪郭）</li>
            <li><span class="lg lg-blocked">!</span>条件不足（破線：必須ノード・奥義・ポイント）</li>
            <li><span class="lg lg-unconn"> </span>未接続（点線・暗い・灰色のアイコン）</li>
            <li>密集した場所は＋で拡大、または「取得できる」一覧から選べます。</li><li>ロイヤルブルーの太線＝取得済みの経路／金の線＝次に取れるノードへの線／点線＝横断の線</li>
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
    const chip = (id, name, color) => `<button type="button" class="st-chip" data-group="${esc(id)}" aria-pressed="false" style="--gc:${esc(color)}">${GROUP_ART[id] || id==='X' ? atlasMarkup(GROUP_ART[id]??CROSS_ART,'',26) : ''}${esc(name)}</button>`;
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
      if (this.filter && this.filter !== 'available') {
        const ids=this.filter==='X'?searchNodes(this.tree,'','X'):this.tree.nodes.filter(n=>!n.cross&&n.group===this.filter).map(n=>n.id);
        this.jumpToIds(ids);
      }
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
      else if (z === 'current') this.centerOn(this.selected ?? this.build.ids.at(-1) ?? this.ix.startId);
      else if (z) this.zoomAt(z === 'in' ? 1.4 : 1 / 1.4);
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        const items = [...box.querySelectorAll('button,input,select,summary,[tabindex="0"]')].filter(el => !el.disabled && el.getClientRects().length);
        const first = items[0], last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
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

  /** UI専用の区画配置。元のゲームデータ座標は書き換えない。 */
  pos(id) {
    return TREE_LAYOUT.positions[id] ?? null;
  }

  edgePath(a, b) {
    const pa=this.pos(a),pb=this.pos(b);
    const cross=this.ix.byId.get(a)?.cross ? a : this.ix.byId.get(b)?.cross ? b : null;
    if (!cross) {
      if (a===this.ix.startId || b===this.ix.startId) {
        const id=a===this.ix.startId?b:a,p=this.pos(id),c=TREE_LAYOUT.centers[id[0]],y=c.y-150;
        return `M 0 -150 L -200 -150 L -200 ${y} L ${c.x-200} ${y} L ${c.x-200} ${p.y} L ${p.x} ${p.y}`;
      }
      return `M ${pa.x} ${pa.y} L ${pb.x} ${pb.y}`;
    }
    const normal=cross===a?b:a,p=this.pos(normal),q=this.pos(cross),c=TREE_LAYOUT.centers[normal[0]];
    const gx=c.x+(q.x<c.x?-200:200),gy=c.y+(q.y<c.y?-150:150);
    return `M ${p.x} ${p.y} Q ${gx} ${p.y} ${gx} ${gy} L ${q.x} ${gy} L ${q.x} ${q.y}`;
  }

  /** 辺とノードの形（状態に関係しない部分）を一度だけ作る */
  drawStatic() {
    // Heraldic districts: one quiet panel and bespoke icon for each of the 19 groups.
    for (const [gid, c] of Object.entries(TREE_LAYOUT.centers)) {
      const g=this.tree.groups[gid];
      const district=document.createElementNS(SVG,'g');district.classList.add('st-district');district.dataset.group=gid;
      district.style.setProperty('--gc',g.color);
      district.innerHTML=`<rect x="${c.x-174}" y="${c.y-156}" width="348" height="312" rx="26"/><path d="M ${c.x-145} ${c.y-118} H ${c.x+145}"/><text x="${c.x+12}" y="${c.y-130}">${esc(g.name)}</text>`;
      const icon=atlasElement(GROUP_ART[gid],42,'st-district-icon');icon.setAttribute('x',c.x-95);icon.setAttribute('y',c.y-162);district.append(icon);
      this.gLabels.append(district);
    }
    this.edgeEls = edgeList(this.tree).map(([a, b]) => {
      const line = document.createElementNS(SVG, 'path');
      line.setAttribute('d',this.edgePath(a,b));
      line.classList.add('st-edge');
      if(a===this.ix.startId || b===this.ix.startId)line.classList.add('trunk');
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
      g.setAttribute('tabindex', id === this.ix.startId ? '0' : '-1');
      g.style.setProperty('--gc', color);
      const r = R[kind];
      const pts = shapePath(kind, r);
      const shape = document.createElementNS(SVG, pts ? 'polygon' : 'circle');
      if (pts) shape.setAttribute('points', pts); else shape.setAttribute('r', r);
      shape.classList.add('st-shape');
      const ring = document.createElementNS(SVG, 'circle');
      ring.setAttribute('r', (kind === 'ultimate' ? r * 1.35 : r) + 9);
      ring.classList.add('st-ring');
      const size = r * (kind === 'ultimate' ? 1.85 : 1.65);
      const img=atlasElement(node ? SKILL_ART[id] : START_ART,size,'st-icon');
      img.setAttribute('x',-size/2);img.setAttribute('y',-size/2);
      const frameSize=r*(kind==='ultimate'?3.25:2.65);
      const decor=atlasElement(FRAME_ART[kind],frameSize,'st-node-frame');
      decor.setAttribute('x',-frameSize/2);decor.setAttribute('y',-frameSize/2);
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
      const hit = document.createElementNS(SVG, 'circle');
      hit.classList.add('st-hit');
      hit.setAttribute('r', Math.max(r + 5, 24));
      g.append(hit, ring, shape, decor, img, badge, idText, name);
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
      g.setAttribute('tabindex', id === (this.selected ?? this.ix.startId) ? '0' : '-1');
      g.setAttribute('aria-pressed', String(this.selected === id));
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
    if (this.view) this.applyView();
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
    const first = [...this.ix.adj.get(route[0])].find((x) => x === this.ix.startId || this.build.ids.includes(x));
    const routeIds=[first,...route];
    const pts=routeIds.slice(1).map((x,i)=>this.edgePath(routeIds[i],x)).join(' ');
    const line = document.createElementNS(SVG, 'path');
    line.setAttribute('d', pts);
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
    const dicon = dnode ? SKILL_ART[id] : START_ART;
    this.detail.innerHTML = `
      <div class="st-d-head"><span class="st-d-kind k-${d.kind}">${esc(d.kindLabel)}</span>${d.group ? `<span class="st-d-group">${esc(d.group)}</span>` : ''}
        <h3>${esc(d.name)} <small>${esc(d.id === this.ix.startId ? '' : d.id)}</small></h3>
        <button type="button" class="st-d-close" data-act="close" aria-label="詳細を閉じる">×</button></div>
      <div class="st-card${d.kind === 'ultimate' ? ' ult' : ''}" aria-hidden="true">${atlasMarkup(dicon,'st-card-art',120)}<img class="st-card-frame" src="assets/cards/frame-${d.kind === 'ultimate' ? 'legendary' : 'rare'}.png" alt=""></div>
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
    if (id && (center || this.size().w<900)) this.centerOn(id);
    else this.applyView();
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
    if (this.size().w < 900) {
      if (this.build.ids.length) this.centerOn(this.build.ids.at(-1));
      else { const {w,h}=this.size(); this.view={cx:0,cy:-150,k:Math.min(w/780,h/640,0.65)}; this.applyView(); }
    }
  }

  fit() {
    const all = this.tree.nodes.map((n) => this.pos(n.id));
    const xs = all.map((p) => p.x), ys = all.map((p) => p.y);
    const pad = 120;
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
    this.svg.classList.toggle('zoom-names', k >= 0.85);
    // CSS pixels: every node has a hit disc at least 48px wide at every zoom.
    for (const { g, node } of this.nodeEls.values()) {
      g.querySelector('.st-hit').setAttribute('r', Math.max(R[nodeKind(node)] + 5, 24 / k));
    }
    this.svg.classList.toggle('zoom-far', k < 0.3);
    this.drawMinimap();
  }

  /** ミニマップ（PR200 と同じく Canvas に全体の線・点・今見ている範囲）。タップでその場所へ */
  drawMinimap() {
    const c = this.minimap;
    if (!c || !this.view) return;
    const ctx = c.getContext?.('2d');
    if (!ctx) return;
    const W = c.width, H = c.height, ext = 1250, sc = Math.min(W, H) / (2 * ext);
    const tx = (x) => W / 2 + x * sc, ty = (y) => H / 2 + y * sc;
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = '#997344';
    ctx.beginPath();
    for (const e of this.edgeEls) { const a = this.pos(e.a), b = this.pos(e.b); ctx.moveTo(tx(a.x), ty(a.y)); ctx.lineTo(tx(b.x), ty(b.y)); }
    ctx.stroke();
    for (const [id, { node }] of this.nodeEls) {
      const p = this.pos(id);
      const st = this.statuses?.get(id)?.state;
      ctx.fillStyle = st === 'owned' || st === 'start' ? '#2a52b0' : st === 'available' ? '#946014' : node?.ultimate ? '#f2a347' : '#8c7556';
      const s = st === 'owned' || st === 'available' ? 3 : 2;
      ctx.fillRect(tx(p.x) - s / 2, ty(p.y) - s / 2, s, s);
    }
    const { w, h } = this.size();
    ctx.strokeStyle = '#2a52b0';
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
    let moved = 0, pinch = null, downTarget = null, lastTap = null;
    // At overview zoom hit discs can overlap: resolve to the nearest centre, never SVG paint order.
    const nearest = (e) => {
      const { w, h, left, top } = this.size();
      const x = this.view.cx + (e.clientX - left - w / 2) / this.view.k;
      const y = this.view.cy + (e.clientY - top - h / 2) / this.view.k;
      let best = null, distance = Infinity;
      for (const [id, { node }] of this.nodeEls) {
        const p = this.pos(id), d = Math.hypot(p.x - x, p.y - y);
        const r = Math.max(R[nodeKind(node)] + 5, 24 / this.view.k);
        if (d <= r && d < distance) { best = id; distance = d; }
      }
      return best;
    };
    svg.addEventListener('pointerdown', (e) => {
      svg.setPointerCapture?.(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) { moved = 0; downTarget = nearest(e); }
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: this.view.k };
        moved = 99;
        clearTimeout(this.tapTimer); lastTap = null;
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
        clearTimeout(this.tapTimer); lastTap = null;
        this.view.cx -= dx / this.view.k;
        this.view.cy -= dy / this.view.k;
        this.applyView();
      }
    });
    const up = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size === 0 && moved <= 6 && e.type === 'pointerup') {
        const now = performance.now();
        if (lastTap && now - lastTap.time < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 28) {
          clearTimeout(this.tapTimer);
          this.zoomAt(1.6, e.clientX, e.clientY); lastTap = null;
        } else {
          const id = downTarget;
          clearTimeout(this.tapTimer);
          if(e.pointerType==='mouse') this.select(id);
          else this.tapTimer = setTimeout(() => { if (!this.box.hidden) this.select(id); }, 280);
          lastTap = { time: now, x: e.clientX, y: e.clientY };
        }
      }
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
    svg.addEventListener('dblclick', (e) => { if (e.detail) e.preventDefault(); });
    // キーボード：フォーカスのあるノードで Enter／Space
    svg.addEventListener('keydown', (e) => {
      const id = e.target.closest?.('.st-node')?.dataset.id;
      if (id && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const p = this.pos(id), dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0, dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
        const next = [...this.nodeEls.keys()].filter(n => n !== id).map(n => {
          const q = this.pos(n), x = q.x - p.x, y = q.y - p.y;
          return { id:n, forward:x*dx+y*dy, score:Math.hypot(x,y)+Math.abs(x*dy-y*dx)*2 };
        }).filter(n => n.forward > 0).sort((a,b) => a.score-b.score)[0];
        if (next) this.select(next.id, { center:true });
      }
      if (id && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); this.select(id); }
    });
  }
}

function confirmReset() {
  try { return globalThis.confirm ? globalThis.confirm('取得したスキルをすべて外しますか？') : true; } catch { return true; }
}
