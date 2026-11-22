// 盤面背景（#scenery）を、Blender 製の 3D フィールドモデル（assets/models/field-<ステージ>.glb）と three.js で描く。
// 読み込めない・WebGL が使えない・?field3d=2d / ?fx=lite のときは何もしないので、既存の 2D 背景（stage-*.png）のまま動く。

const STAGE_SLUGS = {
  meadow: 'meadow',
  lava: 'lava',
  ice: 'ice',
  ruins: 'ruins',
  darkForest: 'dark-forest',
  desert: 'desert',
};

const STAGE_LOOK = {
  meadow:     { bg: '#9eb018', sun: '#fff8e2', sunInt: 2.4, hemiSky: '#d4ecff', hemiGnd: '#7a8e22', hemiInt: 1.25 },
  lava:       { bg: '#533a3e', sun: '#ffd8b8', sunInt: 2.2, hemiSky: '#b08688', hemiGnd: '#4d322e', hemiInt: 1.35 },
  ice:        { bg: '#80c9ec', sun: '#f5fbff', sunInt: 2.35, hemiSky: '#e8f7ff', hemiGnd: '#4e9ad4', hemiInt: 1.30 },
  ruins:      { bg: '#ecb25f', sun: '#fff2d0', sunInt: 2.45, hemiSky: '#fff0cc', hemiGnd: '#ad7c42', hemiInt: 1.25 },
  darkForest: { bg: '#15644d', sun: '#c4f0df', sunInt: 1.95, hemiSky: '#529c8c', hemiGnd: '#164236', hemiInt: 1.25 },
  desert:     { bg: '#f6a139', sun: '#fff2ca', sunInt: 2.55, hemiSky: '#ffe8be', hemiGnd: '#c46f2c', hemiInt: 1.25 },
};

const EMISSIVE_NAMES = new Set([
  'Mat_Lava_Glow',
  'Mat_DF_Lantern',
  'Mat_DF_MushCap',
  'Mat_DF_Crystal',
  'Mat_Ice_Crystal',
  'Mat_Ruins_Crystal',
]);

let libs;
const modelLoads = new Map();

function isDisabledByQuery() {
  try {
    const q = new URLSearchParams(location.search);
    return q.get('field3d') === '2d' || q.get('fx') === 'lite';
  } catch {
    return false;
  }
}

function prefersReducedMotion() {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  } catch {
    return false;
  }
}

const loadLibs = () => (libs ??= Promise.all([
  import('../vendor/three/three.module.min.js'),
  import('../vendor/three/GLTFLoader.js'),
]).then(([THREE, { GLTFLoader }]) => ({ THREE, GLTFLoader })));

function loadFieldModel(GLTFLoader, slug) {
  const path = `assets/models/field-${slug}.glb`;
  if (!modelLoads.has(path)) {
    const p = new GLTFLoader()
      .loadAsync(new URL(path, document.baseURI).href)
      .catch((err) => {
        modelLoads.delete(path);
        throw err;
      });
    modelLoads.set(path, p);
  }
  return modelLoads.get(path);
}

export class FieldGL {
  /**
   * @param {HTMLElement} appEl  #app 要素
   * @param {HTMLElement} hostEl #scenery 要素
   */
  constructor(appEl, hostEl) {
    this.appEl = appEl;
    this.hostEl = hostEl;
    this.disabled = isDisabledByQuery();
    this.stageId = null;
    this.timeOfDay = 'day';
    this.hidden = false;
    this.disposed = false;
    this.loadSeq = 0;

    this.THREE = null;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.sun = null;
    this.hemi = null;
    this.stageGroup = null;
    this.swayNodes = [];
    this.smokeNodes = [];
    this.glowMats = [];
    this.rafId = 0;
    this.startTime = performance.now();

    this._onResize = () => this.resize();
    this._onVisibility = () => {
      if (document.hidden) this.stopLoop();
      else this.maybeStartLoop();
    };
  }

  async ensureReady() {
    if (this.disabled || this.disposed) return false;
    if (this.renderer) return true;
    try {
      const { THREE, GLTFLoader } = await loadLibs();
      if (this.disposed) return false;
      this.THREE = THREE;
      this.GLTFLoader = GLTFLoader;

      const canvas = document.createElement('canvas');
      canvas.className = 'field-gl';
      canvas.setAttribute('aria-hidden', 'true');

      const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'low-power',
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(34, 9 / 16, 0.5, 120);

      const hemi = new THREE.HemisphereLight('#ffffff', '#666666', 0.95);
      scene.add(hemi);

      const sun = new THREE.DirectionalLight('#fff6dd', 2.3);
      sun.position.set(10, 22, 12);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.camera.near = 2;
      sun.shadow.camera.far = 60;
      const d = 14;
      sun.shadow.camera.left = -d;
      sun.shadow.camera.right = d;
      sun.shadow.camera.top = d;
      sun.shadow.camera.bottom = -d;
      sun.shadow.bias = -0.0008;
      scene.add(sun);

      this.renderer = renderer;
      this.scene = scene;
      this.camera = camera;
      this.sun = sun;
      this.hemi = hemi;

      this.hostEl.prepend(canvas);
      window.addEventListener('resize', this._onResize);
      document.addEventListener('visibilitychange', this._onVisibility);
      this.resize();
      return true;
    } catch {
      this.disabled = true;
      return false;
    }
  }

  /** ステージを切り替える（stageId が null なら 3D を隠す） */
  async setStage(stageId) {
    this.stageId = stageId && STAGE_SLUGS[stageId] ? stageId : null;
    const seq = ++this.loadSeq;

    if (!this.stageId || this.disabled || this.hidden) {
      this.setVisible(false);
      return;
    }

    const ok = await this.ensureReady();
    if (!ok || seq !== this.loadSeq || this.disposed) return;

    const slug = STAGE_SLUGS[this.stageId];
    try {
      const gltf = await loadFieldModel(this.GLTFLoader, slug);
      if (seq !== this.loadSeq || this.disposed) return;
      this.mountModel(gltf.scene, this.stageId);
      this.applyLighting();
      this.resize();
      this.setVisible(!this.hidden);
      this.renderFrame(performance.now());
      this.maybeStartLoop();
    } catch {
      // モデル読み込みに失敗しても 2D 背景（stage-*.png）のまま安全に動かす
      if (seq === this.loadSeq) this.setVisible(false);
    }
  }

  /** 昼・夜のライティング切り替え */
  setTime(timeOfDay) {
    this.timeOfDay = timeOfDay === 'night' ? 'night' : 'day';
    if (!this.renderer || !this.stageId) return;
    this.applyLighting();
    this.renderFrame(performance.now());
  }

  /** 広場モードなど、2人用縦フィールドを使わないときは隠す */
  setHidden(hidden) {
    this.hidden = Boolean(hidden);
    if (this.hidden) {
      this.setVisible(false);
    } else if (this.stageId && this.stageGroup) {
      this.setVisible(true);
      this.resize();
      this.renderFrame(performance.now());
      this.maybeStartLoop();
    }
  }

  setVisible(visible) {
    if (this.renderer?.domElement) {
      this.renderer.domElement.hidden = !visible;
    }
    if (visible) {
      this.appEl.dataset.stage3d = '1';
    } else {
      delete this.appEl.dataset.stage3d;
      this.stopLoop();
    }
  }

  mountModel(sourceScene, stageId) {
    const THREE = this.THREE;
    if (this.stageGroup) {
      this.scene.remove(this.stageGroup);
    }
    this.swayNodes = [];
    this.smokeNodes = [];
    this.glowMats = [];

    const group = sourceScene.clone(true);
    const seenMats = new Set();

    group.traverse((obj) => {
      if (!obj.isMesh) return;
      const isGround = obj.name.includes('Ground') || obj.name.includes('Lava_River') || obj.name.includes('Lava_Crack');
      obj.castShadow = !isGround;
      obj.receiveShadow = true;

      if (/Tree|Pine|Bush|Fern|Tuft/i.test(obj.name)) {
        this.swayNodes.push({
          obj,
          baseRotZ: obj.rotation.z,
          phase: obj.position.x * 1.3 + obj.position.z * 0.7,
        });
      }
      if (/Smoke/i.test(obj.name)) {
        this.smokeNodes.push({
          obj,
          baseY: obj.position.y,
          phase: obj.position.x * 0.9,
        });
      }

      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (!m || seenMats.has(m)) continue;
        seenMats.add(m);
        if (obj.geometry?.attributes?.color) {
          m.vertexColors = true;
        }
        if (EMISSIVE_NAMES.has(m.name) || (m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.05)) {
          this.glowMats.push({
            mat: m,
            baseIntensity: m.emissiveIntensity ?? 1.0,
          });
        }
      }
    });

    this.stageGroup = group;
    this.scene.add(group);
    this.stageId = stageId;
  }

  applyLighting() {
    if (!this.THREE || !this.sun || !this.hemi) return;
    const look = STAGE_LOOK[this.stageId] ?? STAGE_LOOK.meadow;
    const isNight = this.timeOfDay === 'night';

    this.scene.background = new this.THREE.Color(look.bg);
    if (isNight) {
      this.scene.background.multiplyScalar(0.38);
      this.sun.color.set('#6d92e8');
      this.sun.intensity = look.sunInt * 0.45;
      this.hemi.color.set('#385599');
      this.hemi.groundColor.set('#0e162e');
      this.hemi.intensity = look.hemiInt * 0.55;
    } else {
      this.sun.color.set(look.sun);
      this.sun.intensity = look.sunInt;
      this.hemi.color.set(look.hemiSky);
      this.hemi.groundColor.set(look.hemiGnd);
      this.hemi.intensity = look.hemiInt;
    }
  }

  resize() {
    if (!this.renderer || !this.camera || !this.hostEl) return;
    const rect = this.hostEl.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width || window.innerWidth));
    const h = Math.max(1, Math.round(rect.height || window.innerHeight));
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.camera.aspect = aspect;

    // 幅 12m のフィールドがスマホ縦画面でも PC 横画面でも左右の小物が映え、下の手札領域を避けて収まるカメラ位置を計算
    const vFovRad = (this.camera.fov * Math.PI) / 180;
    const tanHalfV = Math.tan(vFovRad / 2);
    const targetHalfW = aspect < 0.78 ? 6.35 : 6.10;
    const distForWidth = targetHalfW / (tanHalfV * aspect);
    const distForHeight = 9.4 / tanHalfV;
    const dist = Math.max(15.0, Math.min(distForWidth, distForHeight * 1.22));

    const pitch = (63 * Math.PI) / 180; // 見下ろし 63° で立体感とレーンの見やすさを両立
    const zShift = aspect < 0.78 ? 2.4 : 0.8; // スマホ縦画面では下の手札ぶん視点を上へ寄せる
    this.camera.position.set(0, Math.sin(pitch) * dist, Math.cos(pitch) * dist + zShift);
    this.camera.lookAt(0, 0, zShift);
    this.camera.updateProjectionMatrix();

    if (this.stageGroup && !this.hidden) {
      this.renderFrame(performance.now());
    }
  }

  maybeStartLoop() {
    if (this.rafId || this.disposed || this.hidden || document.hidden || !this.stageGroup) return;
    if (prefersReducedMotion()) return;
    const tick = (now) => {
      this.rafId = 0;
      if (this.disposed || this.hidden || document.hidden || !this.stageGroup) return;
      this.renderFrame(now);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stopLoop() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  renderFrame(now) {
    if (!this.renderer || !this.scene || !this.camera) return;
    const t = (now - this.startTime) * 0.001;
    if (!prefersReducedMotion()) {
      for (const item of this.swayNodes) {
        item.obj.rotation.z = item.baseRotZ + Math.sin(t * 1.45 + item.phase) * 0.025;
      }
      for (const item of this.smokeNodes) {
        item.obj.position.y = item.baseY + Math.sin(t * 1.2 + item.phase) * 0.14;
      }
      const nightBoost = this.timeOfDay === 'night' ? 1.35 : 1.0;
      for (const item of this.glowMats) {
        item.mat.emissiveIntensity = item.baseIntensity * nightBoost * (0.92 + 0.12 * Math.sin(t * 2.2));
      }
    }
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    this.disposed = true;
    this.stopLoop();
    window.removeEventListener('resize', this._onResize);
    document.removeEventListener('visibilitychange', this._onVisibility);
    if (this.renderer) {
      this.renderer.domElement?.remove();
      this.renderer.dispose();
      this.renderer = null;
    }
    delete this.appEl.dataset.stage3d;
  }
}
