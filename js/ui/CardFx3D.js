// カードを出す・引く・合成する演出を three.js の 3D カードで再生する（Animations.js から呼ぶ）。
// #fx-layer に 1 つだけ共有の WebGL canvas を置き、演出中だけ表示・描画する。
// タップによる早送り（skipAll）・動きを減らす設定・?flat=1・WebGL 不可に完全対応。

import { UI_CONFIG } from './config.js';
import { cardSkinNow } from './cardFrame.js';
import { buildCardMesh3D, card3DWanted, cardMotionReduced, loadCardThree, setupCardStudio } from './CardMesh3D.js';

const FOV = 32;
const CAM_Z = 14;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a, b, t) => a + (b - a) * t;

export class CardFx3D {
  constructor(fxLayer) {
    this.fxLayer = fxLayer;
    this.ready = false;
    this.failed = false;
    this.loading = null;
    this.activeJobs = new Set();
    this.raf = 0;
  }

  available() {
    return card3DWanted() && !cardMotionReduced() && UI_CONFIG.speed > 0 && !this.failed;
  }

  async ensureInit() {
    if (this.ready) return true;
    if (!this.available()) return false;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      try {
        const { THREE } = await loadCardThree();
        this.T = THREE;
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'card-fx-3d';
        this.canvas.setAttribute('aria-hidden', 'true');
        this.canvas.hidden = true;
        this.gl = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
        this.gl.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        this.gl.outputColorSpace = THREE.SRGBColorSpace;
        this.gl.toneMapping = THREE.ACESFilmicToneMapping;
        this.gl.toneMappingExposure = 1.08;

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 60);
        this.camera.position.set(0, 0, CAM_Z);
        this.camera.lookAt(0, 0, 0);
        this.studio = setupCardStudio(THREE, this.gl, this.scene);
        this.fxLayer.append(this.canvas);
        this.ready = true;
        return true;
      } catch (error) {
        console.warn('[cardfx3d] 3D カード演出を使えないため、従来の演出にします', error);
        this.failed = true;
        return false;
      } finally {
        this.loading = null;
      }
    })();
    return this.loading;
  }

  syncSize() {
    const r = this.fxLayer.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    this.gl.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const visH = 2 * CAM_Z * Math.tan((FOV * Math.PI) / 360);
    return { w, h, visH, visW: visH * (w / h) };
  }

  toWorld(px, py, metrics) {
    return {
      x: (px / metrics.w - 0.5) * metrics.visW,
      y: (0.5 - py / metrics.h) * metrics.visH,
    };
  }

  runJob(durationMs, onFrame, onCleanup) {
    const dur = Math.min(UI_CONFIG.maxAnimation, Math.max(1, durationMs * UI_CONFIG.speed));
    return new Promise((resolve) => {
      const start = performance.now();
      const job = {
        finish: () => {
          if (!this.activeJobs.has(job)) return;
          this.activeJobs.delete(job);
          onCleanup();
          if (!this.activeJobs.size) {
            this.stopLoop();
            if (this.canvas) this.canvas.hidden = true;
          }
          resolve();
        },
        step: (now) => {
          const p = Math.min(1, (now - start) / dur);
          onFrame(p);
          if (p >= 1) job.finish();
        },
      };
      this.activeJobs.add(job);
      this.canvas.hidden = false;
      this.startLoop();
    });
  }

  startLoop() {
    if (this.raf) return;
    const tick = (now) => {
      this.raf = 0;
      if (!this.activeJobs.size || document.hidden) {
        if (!this.activeJobs.size && this.canvas) this.canvas.hidden = true;
        return;
      }
      for (const job of [...this.activeJobs]) job.step(now);
      if (this.activeJobs.size) {
        this.gl.render(this.scene, this.camera);
        this.raf = requestAnimationFrame(tick);
      }
    };
    this.raf = requestAnimationFrame(tick);
  }

  stopLoop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** 進行中の 3D カード演出をすべて即座に終わらせる（タップでスキップ） */
  skipAll() {
    for (const job of [...this.activeJobs]) job.finish();
  }

  /** 1. カードを出す演出：手札から盤面へ弧を描いて飛び、回転しながら大きく見せる */
  async playCardFly({ type, def, rarities, from, to, cardHeight = 110, duration }) {
    if (!this.available()) return false;
    if (!(await this.ensureInit())) return false;
    const metrics = this.syncSize();
    const skin = def?.monster ? null : cardSkinNow();
    const rarityColor = def?.monster ? '#a51d34' : rarities?.[def?.rarity]?.color;
    const built = await buildCardMesh3D(this.T, { type, def, rarities, skin, rarityColor, showLabel: true });
    this.scene.add(built.group);

    const p0 = this.toWorld(from.x, from.y, metrics);
    const p1 = this.toWorld(to.x, to.y, metrics);
    const baseScale = (cardHeight / metrics.h) * metrics.visH / 3.0;
    const peakScale = baseScale * 1.68;
    const leanZ = Math.max(-0.26, Math.min(0.26, (p0.x - p1.x) * 0.08));

    await this.runJob(duration, (t) => {
      if (t < 0.36) {
        const u = easeOut(t / 0.36);
        built.group.position.set(lerp(p0.x, p1.x, u), lerp(p0.y, p1.y, u), Math.sin(u * Math.PI) * 1.4);
        built.group.scale.setScalar(lerp(baseScale, peakScale, u));
        built.group.rotation.set(lerp(0.28, -0.08, u), lerp(-0.32, 0.08, u), lerp(leanZ, 0, u));
      } else if (t < 0.76) {
        const u = (t - 0.36) / 0.40;
        built.group.position.set(p1.x, p1.y, 0.35);
        built.group.scale.setScalar(lerp(peakScale, peakScale * 0.96, u));
        built.group.rotation.set(Math.sin(u * Math.PI) * 0.06, Math.sin(u * Math.PI * 2) * 0.14, 0);
      } else {
        const u = easeInOut((t - 0.76) / 0.24);
        built.group.position.set(p1.x, p1.y + u * 0.6, lerp(0.35, -1.2, u));
        built.group.scale.setScalar(lerp(peakScale * 0.96, 0.01, u));
        built.group.rotation.set(-0.2 * u, 0.4 * u, 0);
      }
    }, () => {
      this.scene.remove(built.group);
      built.dispose();
    });
    return true;
  }

  /** 2. カードを引く演出：山札から裏面で飛び出し、空中でクルッと裏返って表になり手札へ収まる */
  async playDrawFlip({ type, def, rarities, from, to, cardHeight = 110, duration }) {
    if (!this.available()) return false;
    if (!(await this.ensureInit())) return false;
    const metrics = this.syncSize();
    const skin = def?.monster ? null : cardSkinNow();
    const rarityColor = def?.monster ? '#a51d34' : rarities?.[def?.rarity]?.color;
    const built = await buildCardMesh3D(this.T, { type, def, rarities, skin, rarityColor, showLabel: true });
    this.scene.add(built.group);

    const p0 = this.toWorld(from.x, from.y, metrics);
    const p1 = this.toWorld(to.x, to.y, metrics);
    const endScale = (cardHeight / metrics.h) * metrics.visH / 3.0;
    const startScale = endScale * 0.25;

    await this.runJob(duration, (t) => {
      const u = easeOut(t);
      const arcZ = Math.sin(u * Math.PI) * 1.8;
      built.group.position.set(lerp(p0.x, p1.x, u), lerp(p0.y, p1.y, u), arcZ);
      built.group.scale.setScalar(lerp(startScale, endScale, u));
      // 裏（PI）から表（0）へクルッと裏返る
      built.group.rotation.set(Math.sin(u * Math.PI) * 0.24, lerp(Math.PI, 0, easeInOut(t)), lerp(-0.35, 0, u));
    }, () => {
      this.scene.remove(built.group);
      built.dispose();
    });
    return true;
  }

  /** 3. 合成の演出：2枚の 3D カードが中央へ吸い込まれ、新しい 3D カードが回転しながら現れる */
  async playFusion({ leftType, rightType, toType, cards, rarities, center, duration, onImpact }) {
    if (!this.available()) return false;
    if (!(await this.ensureInit())) return false;
    const metrics = this.syncSize();
    const c = this.toWorld(center.x, center.y, metrics);
    const cardScale = (145 / metrics.h) * metrics.visH / 3.0;

    const make = (t) => {
      const def = cards?.[t] ?? { name: t };
      const skin = def?.monster ? null : cardSkinNow();
      const rarityColor = def?.monster ? '#a51d34' : rarities?.[def?.rarity]?.color;
      return buildCardMesh3D(this.T, { type: t, def, rarities, skin, rarityColor, showLabel: true });
    };
    const [left, right, result] = await Promise.all([make(leftType), make(rightType), make(toType)]);
    result.group.visible = false;
    this.scene.add(left.group, right.group, result.group);
    let impacted = false;

    await this.runJob(duration, (t) => {
      if (t < 0.54) {
        const u = easeInOut(t / 0.54);
        const spread = lerp(2.1, 0.0, u);
        const spin = u * Math.PI * 1.2;
        left.group.position.set(c.x - spread, c.y, Math.sin(u * Math.PI) * 0.8);
        right.group.position.set(c.x + spread, c.y, -Math.sin(u * Math.PI) * 0.8);
        left.group.rotation.set(0, spin, lerp(-0.22, 0.1, u));
        right.group.rotation.set(0, -spin, lerp(0.22, -0.1, u));
        const s = cardScale * lerp(0.95, 0.22, Math.max(0, (u - 0.6) / 0.4));
        left.group.scale.setScalar(s);
        right.group.scale.setScalar(s);
      } else {
        left.group.visible = false;
        right.group.visible = false;
        result.group.visible = true;
        if (!impacted) { impacted = true; onImpact?.(); }
        const u = (t - 0.54) / 0.46;
        if (u < 0.35) {
          const k = easeOut(u / 0.35);
          result.group.position.set(c.x, c.y, lerp(-0.5, 0.8, k));
          result.group.scale.setScalar(cardScale * lerp(0.15, 1.28, k));
          result.group.rotation.set(0, lerp(Math.PI * 2, 0, k), 0);
        } else if (u < 0.72) {
          const k = (u - 0.35) / 0.37;
          result.group.position.set(c.x, c.y, 0.8);
          result.group.scale.setScalar(cardScale * lerp(1.28, 1.12, k));
          result.group.rotation.set(0.06 * Math.sin(k * Math.PI), 0.22 * Math.sin(k * Math.PI * 2), 0);
        } else {
          const k = easeInOut((u - 0.72) / 0.28);
          result.group.position.set(c.x, c.y - k * 1.1, lerp(0.8, -0.4, k));
          result.group.scale.setScalar(cardScale * lerp(1.12, 0.01, k));
          result.group.rotation.set(0, k * 0.6, 0);
        }
      }
    }, () => {
      this.scene.remove(left.group, right.group, result.group);
      left.dispose();
      right.dispose();
      result.dispose();
    });
    return true;
  }
}
