// 手札のカードを 1 つの WebGL canvas で 3D 表示する（HandView.js から呼ぶ）。
// 各カードの DOM（#hand .card[data-id]）の位置・サイズに同期して Blender の 3D カードを配置し、
// 選んだカードが持ち上がって傾く・ホバーで軽く傾く立体表現を加える。
// 文字・数値・タップ・ドラッグ・キーボード操作・smoke.js はすべて DOM のまま残す。
// 変化がないときは毎フレーム描かず、タブが隠れたら止める。手札が出るまで three.js / GLB は読み込まない。

import { cardSkinNow } from './cardFrame.js';
import { buildCardMesh3D, card3DWanted, cardMotionReduced, loadCardThree, setupCardStudio } from './CardMesh3D.js';

const FOV = 28;
const CAM_Z = 12;

export class Hand3D {
  /**
   * @param {{ controls: HTMLElement, handEl: HTMLElement, cards: object, rarities: object }} opts
   */
  constructor({ controls, handEl, cards, rarities }) {
    this.controls = controls;
    this.handEl = handEl;
    this.cards = cards;
    this.rarities = rarities;

    this.ready = false;
    this.failed = false;
    this.loading = false;
    this.entries = new Map(); // cardId -> { key, group, dispose, cur: {...}, tgt: {...} }
    this.handData = [];
    this.selectedId = null;
    this.hoverId = null;
    this.hoverPos = { x: 0, y: 0 };
    this.raf = 0;
    this.syncToken = 0;
    this.size = { w: 0, h: 0 };

    this.onScroll = () => this.kick();
    this.onResize = () => { this.resize(); this.kick(); };
    this.onVisibility = () => {
      if (document.hidden) this.stopLoop();
      else this.kick();
    };
    this.onPointerMove = (e) => {
      if (!this.ready || cardMotionReduced()) return;
      const cardEl = e.target.closest?.('.card');
      if (!cardEl || !this.handEl.contains(cardEl)) {
        if (this.hoverId) { this.hoverId = null; this.kick(); }
        return;
      }
      const r = cardEl.getBoundingClientRect();
      if (!r.width || !r.height) return;
      this.hoverId = cardEl.dataset.id;
      this.hoverPos.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      this.hoverPos.y = ((e.clientY - r.top) / r.height) * 2 - 1;
      this.kick();
    };
    this.onPointerLeave = () => {
      if (this.hoverId) { this.hoverId = null; this.kick(); }
    };

    handEl.addEventListener('scroll', this.onScroll, { passive: true });
    handEl.addEventListener('pointermove', this.onPointerMove, { passive: true });
    handEl.addEventListener('pointerleave', this.onPointerLeave);
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  async ensureInit() {
    if (this.ready) return true;
    if (this.failed || this.loading || !card3DWanted()) return false;
    this.loading = true;
    try {
      const { THREE } = await loadCardThree();
      this.T = THREE;
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'hand3d-canvas';
      this.canvas.setAttribute('aria-hidden', 'true');
      this.gl = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
      this.gl.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      this.gl.outputColorSpace = THREE.SRGBColorSpace;
      this.gl.toneMapping = THREE.ACESFilmicToneMapping;
      this.gl.toneMappingExposure = 1.06;

      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 60);
      this.camera.position.set(0, 0, CAM_Z);
      this.camera.lookAt(0, 0, 0);
      this.studio = setupCardStudio(THREE, this.gl, this.scene);

      // #hand の直前に 1 枚だけ canvas を敷く
      this.handEl.before(this.canvas);
      this.ro = new ResizeObserver(() => { this.resize(); this.kick(); });
      this.ro.observe(this.handEl);
      this.ready = true;
      this.loading = false;
      this.resize();
      return true;
    } catch (error) {
      console.warn('[hand3d] 手札の 3D 表示を使えないため、2D のまま描きます', error);
      this.failed = true;
      this.loading = false;
      this.handEl.classList.remove('hand-3d');
      return false;
    }
  }

  /** 手札の配列・選択状態が変わったときに同期する */
  async sync(hand, selectedId) {
    this.handData = hand ?? [];
    this.selectedId = selectedId ?? null;
    if (!this.handData.length) {
      this.clearMeshes();
      if (this.canvas) this.canvas.hidden = true;
      this.handEl.classList.remove('hand-3d');
      this.stopLoop();
      return;
    }
    if (!card3DWanted()) {
      this.handEl.classList.remove('hand-3d');
      return;
    }
    const ok = await this.ensureInit();
    if (!ok) return;

    const token = ++this.syncToken;
    const skin = cardSkinNow();
    const wantedIds = new Set(this.handData.map((c) => c.cardId));

    // 手札から消えたカードのメッシュを片づける
    for (const [id, entry] of [...this.entries]) {
      if (!wantedIds.has(id)) {
        this.scene.remove(entry.group);
        entry.dispose();
        this.entries.delete(id);
      }
    }

    // 新しいカード・状態が変わったカードのメッシュを組み立てる
    const tasks = this.handData.map(async (card) => {
      const el = this.handEl.querySelector(`.card[data-id="${CSS.escape(card.cardId)}"]`);
      const dim = Boolean(el?.classList.contains('dim'));
      const key = `${card.type}|${skin ?? ''}|${dim ? 1 : 0}`;
      const existing = this.entries.get(card.cardId);
      if (existing && existing.key === key) return;

      const def = this.cards?.[card.type] ?? { name: card.type };
      const rarityColor = def.monster ? '#a51d34' : this.rarities?.[def.rarity]?.color;
      const built = await buildCardMesh3D(this.T, {
        type: card.type,
        def,
        rarities: this.rarities,
        skin: def.monster ? null : skin,
        rarityColor,
        showLabel: false, // 手札の文字・数値は DOM のまま残す
        dim,
      });
      if (token !== this.syncToken) {
        built.dispose();
        return;
      }
      const prev = this.entries.get(card.cardId);
      if (prev) {
        this.scene.remove(prev.group);
        prev.dispose();
      }
      built.group.visible = false;
      this.scene.add(built.group);
      this.entries.set(card.cardId, {
        key,
        group: built.group,
        dispose: built.dispose,
        cur: { rx: 0, ry: 0, lift: 0 },
      });
    });

    await Promise.all(tasks);
    if (token !== this.syncToken) return;

    this.handEl.classList.add('hand-3d');
    if (this.canvas) this.canvas.hidden = false;
    this.resize();
    this.kick();
  }

  /** 選択状態・出せない状態（dim）だけが変わったときの軽い更新 */
  updateStates(selectedId) {
    this.selectedId = selectedId ?? null;
    if (!this.ready) return;
    // dim の変化があれば再構築が必要なので sync に流す
    for (const card of this.handData) {
      const el = this.handEl.querySelector(`.card[data-id="${CSS.escape(card.cardId)}"]`);
      const dim = Boolean(el?.classList.contains('dim'));
      const entry = this.entries.get(card.cardId);
      if (entry && entry.key.endsWith(`|${dim ? 0 : 1}`)) {
        void this.sync(this.handData, this.selectedId);
        return;
      }
    }
    this.kick();
  }

  clearMeshes() {
    for (const entry of this.entries.values()) {
      this.scene?.remove(entry.group);
      entry.dispose();
    }
    this.entries.clear();
  }

  resize() {
    if (!this.ready || !this.canvas) return;
    const hr = this.handEl.getBoundingClientRect();
    const cr = this.controls.getBoundingClientRect();
    // 選んだカードが上に持ち上がっても切れないよう、上に少し余白をとる
    const padTop = 26;
    const w = Math.max(1, Math.round(hr.width));
    const h = Math.max(1, Math.round(hr.height + padTop));
    this.canvas.style.left = `${hr.left - cr.left}px`;
    this.canvas.style.top = `${hr.top - cr.top - padTop}px`;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    if (w === this.size.w && h === this.size.h) return;
    this.size = { w, h };
    this.gl.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  kick() {
    if (!this.ready || document.hidden || this.raf) return;
    this.raf = requestAnimationFrame(() => this.tick());
  }

  stopLoop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  tick() {
    this.raf = 0;
    if (!this.ready || document.hidden || !this.entries.size) return;

    const canvasRect = this.canvas.getBoundingClientRect();
    if (!canvasRect.width || !canvasRect.height) return;

    const visH = 2 * CAM_Z * Math.tan((FOV * Math.PI) / 360);
    const visW = visH * (canvasRect.width / canvasRect.height);
    const still = cardMotionReduced();
    let animating = false;

    for (const [cardId, entry] of this.entries) {
      const el = this.handEl.querySelector(`.card[data-id="${CSS.escape(cardId)}"]`);
      if (!el || !el.classList.contains('has-frame') || el.classList.contains('drag-source') || el.style.visibility === 'hidden') {
        entry.group.visible = false;
        continue;
      }
      const r = el.getBoundingClientRect();
      // 画面外（横スクロール外）のカードは描かない
      if (!r.width || !r.height || r.right < canvasRect.left - 20 || r.left > canvasRect.right + 20) {
        entry.group.visible = false;
        continue;
      }
      entry.group.visible = true;

      const selected = cardId === this.selectedId;
      const hovered = !still && cardId === this.hoverId;
      const tgtRx = still ? 0 : selected ? -0.15 : hovered ? -this.hoverPos.y * 0.16 : 0;
      const tgtRy = still ? 0 : selected ? 0.10 : hovered ? this.hoverPos.x * 0.22 : 0;
      const tgtLift = still ? (selected ? 0.12 : 0) : (selected ? 0.42 : hovered ? 0.18 : 0);

      if (still) {
        entry.cur.rx = tgtRx;
        entry.cur.ry = tgtRy;
        entry.cur.lift = tgtLift;
      } else {
        const k = 0.22;
        entry.cur.rx += (tgtRx - entry.cur.rx) * k;
        entry.cur.ry += (tgtRy - entry.cur.ry) * k;
        entry.cur.lift += (tgtLift - entry.cur.lift) * k;
        if (Math.abs(tgtRx - entry.cur.rx) > 0.003 || Math.abs(tgtRy - entry.cur.ry) > 0.003 || Math.abs(tgtLift - entry.cur.lift) > 0.005) {
          animating = true;
        }
      }

      const cx = r.left - canvasRect.left + r.width * 0.5;
      const cy = r.top - canvasRect.top + r.height * 0.5;
      const scale = (r.height / canvasRect.height) * visH / 3.0;
      const wx = (cx / canvasRect.width - 0.5) * visW;
      const wy = (0.5 - cy / canvasRect.height) * visH;

      entry.group.position.set(wx, wy, entry.cur.lift * scale);
      entry.group.scale.setScalar(scale);
      entry.group.rotation.set(entry.cur.rx, entry.cur.ry, 0);
    }

    this.gl.render(this.scene, this.camera);
    if (animating) this.kick();
  }

  destroy() {
    this.stopLoop();
    this.ro?.disconnect();
    this.handEl.removeEventListener('scroll', this.onScroll);
    this.handEl.removeEventListener('pointermove', this.onPointerMove);
    this.handEl.removeEventListener('pointerleave', this.onPointerLeave);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.clearMeshes();
    this.studio?.envRT?.dispose();
    this.gl?.dispose();
    this.canvas?.remove();
    this.handEl.classList.remove('hand-3d');
  }
}
