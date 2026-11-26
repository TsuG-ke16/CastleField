// ホーム画面用 4陣営3D浮遊島ジオラマ（王国の空に浮かぶ箱庭＋4時間帯連続ライティング）
// - assets/models/diorama/castle_field_diorama.glb を js/vendor/three/ でリアルタイム描画
// - 自然な空のグラデーション（GLSL）。惑星・星雲・星屑は表示せず、夜だけ控えめな星空。
// - 4時間帯（明け方／昼／黄昏／夜）を現在時刻で連続補間、設定画面から手動固定も可能
// - 4陣営モードでは中央広場 (0,0,0) を軸に滑らかに360°旋回（他陣営による遮蔽ゼロ）
// - ?fx=lite / ?home3d=2d / WebGL不可時は何も描かず既存の2D背景へ安全にフォールバック

import { UI_CONFIG } from './config.js';

export const DIORAMA_GLB_PATH = 'assets/models/diorama/castle_field_diorama.glb';

export const HOME_SKY_MODES = ['auto', 'dawn', 'day', 'dusk', 'night'];
export const HOME_SKY_LABELS = {
  auto: '自動（時刻）',
  dawn: '明け方',
  day: '昼',
  dusk: '黄昏',
  night: '夜',
};

// Blender Z-up -> Three.js Y-up: (x, y, z)_three = (x, z, -y)_blender
// 角度定義（XZ平面）: angle=0 -> +X (demon), 90 -> -Z (kingdom), 180 -> -X (forest), 270 -> +Z (dragon)
const FACTION_ANGLE_DEG = {
  demon: 0,
  kingdom: 90,
  forest: 180,
  dragon: 270,
};

const FACTION_TARGET_Y = {
  kingdom: 5.25,
  forest: 5.65,
  demon: 4.95,
  dragon: 3.05,
};

// 王国の空の4時間帯キーフレーム。既存の時刻補間とモデル照明を維持する。
const SKY_PRESETS = {
  dawn: {
    label: '王国の夜明け',
    zenith: '#a6c9ef',
    mid: '#f3d5b2',
    horizon: '#ffe9c3',
    abyss: '#e7c99c',
    nebulaA: '#8e6c96',
    nebulaB: '#537ea8',
    nebulaStrength: 0,
    starVisibility: 0.02,
    haloColor: '#f6c8b2',
    haloStrength: 0.42,
    sunDir: [0.76, 0.30, -0.58],
    keyColor: '#ffdcc4',
    keyIntensity: 2.15,
    rimColor: '#7ea8e8',
    rimIntensity: 0.92,
    underColor: '#4c6296',
    underIntensity: 0.52,
    hemiSky: '#8fa6d4',
    hemiGround: '#1a2038',
    hemiIntensity: 0.72,
    pointScale: 0.55,
    emissiveScale: 1.05,
    dustColor: '#e8d8ff',
    dustOpacity: 0,
    planetAlpha: 0,
    exposure: 0.96,
  },
  day: {
    label: '王国の昼',
    zenith: '#83c9ff',
    mid: '#bfe5ff',
    horizon: '#edf7ff',
    abyss: '#c7dcbb',
    nebulaA: '#4f82bd',
    nebulaB: '#7ab3d8',
    nebulaStrength: 0,
    starVisibility: 0,
    haloColor: '#d9ecff',
    haloStrength: 0.34,
    sunDir: [0.46, 0.74, 0.49],
    keyColor: '#f4f8ff',
    keyIntensity: 2.35,
    rimColor: '#88bcff',
    rimIntensity: 0.85,
    underColor: '#5c82b8',
    underIntensity: 0.55,
    hemiSky: '#a8cdf0',
    hemiGround: '#243554',
    hemiIntensity: 0.92,
    pointScale: 0.35,
    emissiveScale: 0.82,
    dustColor: '#d8f0ff',
    dustOpacity: 0,
    planetAlpha: 0,
    exposure: 1.0,
  },
  dusk: {
    label: '王国の黄昏',
    zenith: '#9a91c0',
    mid: '#ecaf92',
    horizon: '#ffe1a4',
    abyss: '#bba385',
    nebulaA: '#b85c60',
    nebulaB: '#593d80',
    nebulaStrength: 0,
    starVisibility: 0.08,
    haloColor: '#ff9c6e',
    haloStrength: 0.52,
    sunDir: [-0.78, 0.24, 0.58],
    keyColor: '#ffad7a',
    keyIntensity: 1.78,
    rimColor: '#7664c9',
    rimIntensity: 0.82,
    underColor: '#4e3668',
    underIntensity: 0.44,
    hemiSky: '#b0788c',
    hemiGround: '#1b1429',
    hemiIntensity: 0.68,
    pointScale: 0.85,
    emissiveScale: 1.48,
    dustColor: '#ffd4b8',
    dustOpacity: 0,
    planetAlpha: 0,
    exposure: 0.96,
  },
  night: {
    label: '王国の夜',
    zenith: '#334e7b',
    mid: '#516e9e',
    horizon: '#8cacc8',
    abyss: '#526c7c',
    nebulaA: '#2d4b7a',
    nebulaB: '#3e326e',
    nebulaStrength: 0,
    starVisibility: 0.18,
    haloColor: '#98bef8',
    haloStrength: 0.26,
    sunDir: [-0.42, 0.62, -0.66],
    keyColor: '#a6c2f5',
    keyIntensity: 1.25,
    rimColor: '#5c7fd6',
    rimIntensity: 0.76,
    underColor: '#36508a',
    underIntensity: 0.42,
    hemiSky: '#5874ad',
    hemiGround: '#0d1326',
    hemiIntensity: 0.56,
    pointScale: 1.15,
    emissiveScale: 1.85,
    dustColor: '#b8d4ff',
    dustOpacity: 0,
    planetAlpha: 0,
    exposure: 0.96,
  },
};

// 24時間サイクルのアンカー（時刻hとプリセット名）
const TIME_ANCHORS = [
  { h: 0.0, key: 'night' },
  { h: 4.5, key: 'night' },
  { h: 6.5, key: 'dawn' },
  { h: 9.0, key: 'dawn' },
  { h: 11.0, key: 'day' },
  { h: 15.5, key: 'day' },
  { h: 17.5, key: 'dusk' },
  { h: 19.0, key: 'dusk' },
  { h: 20.5, key: 'night' },
  { h: 24.0, key: 'night' },
];

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r, g, b) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + [clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function lerpHex(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex(
    ca[0] + (cb[0] - ca[0]) * t,
    ca[1] + (cb[1] - ca[1]) * t,
    ca[2] + (cb[2] - ca[2]) * t,
  );
}

function lerpNum(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

function blendPresets(a, b, rawT, dominantKey) {
  const t = smoothstep(rawT);
  const out = { key: dominantKey, label: SKY_PRESETS[dominantKey].label };
  for (const k of Object.keys(a)) {
    if (k === 'label') continue;
    const va = a[k];
    const vb = b[k];
    if (typeof va === 'string' && va.startsWith('#')) {
      out[k] = lerpHex(va, vb, t);
    } else if (Array.isArray(va)) {
      const x = lerpNum(va[0], vb[0], t);
      const y = lerpNum(va[1], vb[1], t);
      const z = lerpNum(va[2], vb[2], t);
      const len = Math.hypot(x, y, z) || 1;
      out[k] = [x / len, y / len, z / len];
    } else if (typeof va === 'number') {
      out[k] = lerpNum(va, vb, t);
    }
  }
  return out;
}

/**
 * 指定モード（auto / dawn / day / dusk / night）と時刻から現在の空のライティング状態を求める。
 * @param {string} mode
 * @param {Date} [date]
 */
export function resolveSkyPhase(mode = 'auto', date = new Date()) {
  if (mode && mode !== 'auto' && Object.hasOwn(SKY_PRESETS, mode)) {
    return { key: mode, ...SKY_PRESETS[mode] };
  }
  const h = (date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600) % 24;
  for (let i = 0; i < TIME_ANCHORS.length - 1; i++) {
    const a = TIME_ANCHORS[i];
    const b = TIME_ANCHORS[i + 1];
    if (h >= a.h && h <= b.h) {
      const span = Math.max(0.001, b.h - a.h);
      const t = (h - a.h) / span;
      const dom = t < 0.5 ? a.key : b.key;
      if (a.key === b.key) return { key: a.key, ...SKY_PRESETS[a.key] };
      return blendPresets(SKY_PRESETS[a.key], SKY_PRESETS[b.key], t, dom);
    }
  }
  return { key: 'night', ...SKY_PRESETS.night };
}

function querySkyOverride() {
  try {
    const q = new URLSearchParams(location.search).get('sky');
    if (q && HOME_SKY_MODES.includes(q)) return q;
  } catch { /* ignore */ }
  return null;
}

function isDisabledByQuery() {
  try {
    const q = new URLSearchParams(location.search);
    return q.get('fx') === 'lite' || q.get('home3d') === '2d';
  } catch {
    return false;
  }
}

function isReducedMotion() {
  try {
    if (UI_CONFIG?.reducedMotion) return true;
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  } catch {
    return false;
  }
}

let libsPromise = null;
let glbPromise = null;

function loadLibs() {
  return (libsPromise ??= Promise.all([
    import('../vendor/three/three.module.min.js'),
    import('../vendor/three/GLTFLoader.js'),
  ]).then(([THREE, { GLTFLoader }]) => ({ THREE, GLTFLoader })));
}

function loadDioramaGlb(GLTFLoader) {
  if (!glbPromise) {
    const url = typeof document !== 'undefined' ? new URL(DIORAMA_GLB_PATH, document.baseURI).href : DIORAMA_GLB_PATH;
    glbPromise = new GLTFLoader().loadAsync(url).catch((err) => {
      glbPromise = null;
      throw err;
    });
  }
  return glbPromise;
}

function shortestAngleDiff(fromDeg, toDeg) {
  let d = ((toDeg - fromDeg + 180) % 360 + 360) % 360 - 180;
  return d;
}

// 360°宇宙スカイドーム用 GLSL シェーダー
const SKY_VERTEX_SHADER = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uMid;
  uniform vec3 uHorizon;
  uniform vec3 uAbyss;
  uniform vec3 uNebulaA;
  uniform vec3 uNebulaB;
  uniform float uNebulaStrength;
  uniform vec3 uSunDir;
  uniform vec3 uHaloColor;
  uniform float uHaloStrength;
  uniform float uStarVis;
  uniform float uTime;
  varying vec3 vDir;

  float hash31(vec3 p) {
    p = fract(p * vec3(443.897, 441.423, 437.195));
    p += dot(p, p.yzx + 19.19);
    return fract((p.x + p.y) * p.z);
  }

  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash31(i + vec3(0.0, 0.0, 0.0));
    float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash31(i + vec3(1.0, 1.0, 1.0));
    float nx00 = mix(n000, n100, f.x);
    float nx10 = mix(n010, n110, f.x);
    float nx01 = mix(n001, n101, f.x);
    float nx11 = mix(n011, n111, f.x);
    float nxy0 = mix(nx00, nx10, f.y);
    float nxy1 = mix(nx01, nx11, f.y);
    return mix(nxy0, nxy1, f.z);
  }

  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.52;
    for (int i = 0; i < 4; i++) {
      v += a * noise3(p);
      p = p * 2.03 + vec3(11.3, 5.7, 7.1);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;

    // 深い宇宙の縦グラデーション
    vec3 col = mix(uAbyss, uHorizon, smoothstep(-0.55, 0.02, h));
    col = mix(col, uMid, smoothstep(0.02, 0.34, h));
    col = mix(col, uZenith, smoothstep(0.32, 0.88, h));

    // 斜めに横切る静かな天の川・星雲ベール
    vec3 nebP = vec3(d.x * 2.2 + d.z * 0.9, d.y * 3.1 - d.x * 1.4, d.z * 2.2) + vec3(uTime * 0.004, 0.0, -uTime * 0.003);
    float n1 = fbm(nebP * 1.4);
    float n2 = fbm(nebP * 2.8 + vec3(3.1, -2.4, 1.7));
    float band = exp(-pow((d.y + 0.28 * d.x - 0.14 * d.z) * 2.6, 2.0));
    float wisps = smoothstep(0.42, 0.84, n1 * 0.72 + n2 * 0.28) * (0.38 + 0.62 * band);
    vec3 nebCol = mix(uNebulaA, uNebulaB, n2);
    col += nebCol * wisps * uNebulaStrength;

    // 遠い恒星・月のやわらかな光輪
    float sunDot = max(0.0, dot(d, normalize(uSunDir)));
    float halo = pow(sunDot, 10.0) * 0.55 + pow(sunDot, 64.0) * 0.75;
    col += uHaloColor * halo * uHaloStrength;

    gl_FragColor = vec4(col, 1.0);
  }
`;

export class HomeDioramaGL {
  /**
   * @param {object} opts
   * @param {HTMLElement} opts.skyEl   全画面キャンバスを置く .home-sky
   * @param {HTMLElement} opts.heroEl  城・浮遊島を中心に収める .home-hero
   * @param {HTMLElement} opts.homeEl  #home ルート（状態クラス付与用）
   * @param {string} [opts.viewMode]   'factions' | 'overview'
   * @param {string} [opts.faction]    'kingdom' | 'forest' | 'demon' | 'dragon'
   * @param {string} [opts.skyMode]    'auto' | 'dawn' | 'day' | 'dusk' | 'night'
   */
  constructor({ skyEl, heroEl, homeEl, viewMode = 'overview', faction = 'kingdom', skyMode = 'auto' }) {
    this.skyEl = skyEl;
    this.heroEl = heroEl;
    this.homeEl = homeEl;
    this.viewMode = viewMode;
    this.faction = FACTION_ANGLE_DEG[faction] !== undefined ? faction : 'kingdom';
    this.skyMode = querySkyOverride() ?? (HOME_SKY_MODES.includes(skyMode) ? skyMode : 'auto');
    this.activeTab = 'battle';
    this.visible = false;
    this.destroyed = false;
    this.ready = false;
    this.failed = false;

    // カメラ軌道状態
    this.orbitAngleDeg = FACTION_ANGLE_DEG[this.faction] ?? 90;
    this.targetOrbitDeg = this.orbitAngleDeg;
    this.overviewAngleDeg = 7.0;
    this.dragYawDeg = 0;
    this.dragPitchDeg = 0;
    this.dragging = false;
    this.lastPointerX = 0;
    this.lastPointerY = 0;
    this.currentTargetY = FACTION_TARGET_Y[this.faction] ?? 5.25;

    // 流れ星状態
    this.meteorTimer = 6.0;
    this.meteorLife = -1;
    this.meteorDuration = 1.1;

    this.emissiveMats = [];
    this.factionLights = [];
    this.lastClockSync = 0;
    this.rafId = 0;
    this.lastFrameTs = 0;
    this.elapsed = 0;

    if (isDisabledByQuery()) {
      this.failed = true;
      return;
    }

    this.initPromise = this.init().catch((err) => {
      console.warn('[HomeDioramaGL] 3D背景をスキップして2Dへフォールバックします:', err?.message ?? err);
      this.failed = true;
      this.homeEl?.classList.remove('has-3d-diorama', 'diorama-3d-ready');
    });
  }

  async init() {
    const { THREE, GLTFLoader } = await loadLibs();
    if (this.destroyed) return;
    this.THREE = THREE;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.className = 'home-diorama-canvas';
    renderer.domElement.setAttribute('aria-hidden', 'true');
    this.renderer = renderer;

    const scene = new THREE.Scene();
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(46, 1, 0.5, 650);
    this.camera = camera;

    // 1. 360°宇宙スカイドーム
    this.buildSkyDome(THREE, scene);
    // 2. 瞬く3D星空・遠景の輪を持つ月・漂う星屑・流れ星
    this.buildCosmicElements(THREE, scene);
    // 3. ライティング構築
    this.buildLights(THREE, scene);

    // キャンバスを .home-sky へマウント（GLBロード中も美しい宇宙空が即座に表示される！）
    this.skyEl.replaceChildren(renderer.domElement);
    this.homeEl.classList.add('has-3d-diorama');

    this.bindEvents();
    this.applySkyPhase(true);
    this.resize();
    if (this.visible) this.startLoop();

    // 4. 4陣営3Dジオラマ GLB を非同期ロード
    const gltf = await loadDioramaGlb(GLTFLoader);
    if (this.destroyed) return;

    const model = gltf.scene.clone(true);
    // GLB に同梱された Blender Cycles 用の高出力ライトは無効化し、Three.js の時間帯ライトのみで正確に制御する！
    // 併せて昼用雲リングを非表示にし、発光マップの強度を時間帯連動へ正規化
    const embeddedLights = [];
    model.traverse((obj) => {
      if (obj.isLight) {
        obj.intensity = 0;
        obj.visible = false;
        embeddedLights.push(obj);
        return;
      }
      if (!obj.isMesh) return;
      if (obj.name === 'Props_Floating_Cloud_Ring') {
        obj.visible = false;
        return;
      }
      if (obj.name === 'Water_Waterfall_MistPlumes') {
        const m = obj.material?.clone?.();
        if (m) {
          m.transparent = true;
          m.opacity = 0.22;
          m.depthWrite = false;
          obj.material = m;
        }
        return;
      }
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      const cloned = mats.map((mat) => {
        if (!mat) return mat;
        const m = mat.clone();
        const hasEmissive = Boolean(m.emissiveMap) || (m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.05);
        if (hasEmissive) {
          // Blender の Emission Strength (3.0+) をそのまま掛けると白飛びするため 1.0 基準へ正規化
          const baseInt = m.emissiveMap ? 0.95 : 1.15;
          m.emissiveIntensity = baseInt;
          this.emissiveMats.push({ mat: m, base: baseInt });
        }
        return m;
      });
      obj.material = Array.isArray(obj.material) ? cloned : cloned[0];
    });
    for (const l of embeddedLights) l.parent?.remove(l);

    this.dioramaRoot = new THREE.Group();
    this.dioramaRoot.add(model);
    scene.add(this.dioramaRoot);

    this.ready = true;
    this.homeEl.classList.add('diorama-3d-ready');
    this.applySkyPhase(true);
    this.resize();
    this.renderOnce();
  }

  buildSkyDome(THREE, scene) {
    const geo = new THREE.SphereGeometry(420, 40, 28);
    const mat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX_SHADER,
      fragmentShader: SKY_FRAGMENT_SHADER,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uZenith: { value: new THREE.Color('#02040d') },
        uMid: { value: new THREE.Color('#081024') },
        uHorizon: { value: new THREE.Color('#12203e') },
        uAbyss: { value: new THREE.Color('#010309') },
        uNebulaA: { value: new THREE.Color('#2d4b7a') },
        uNebulaB: { value: new THREE.Color('#3e326e') },
        uNebulaStrength: { value: 0.46 },
        uSunDir: { value: new THREE.Vector3(-0.42, 0.62, -0.66).normalize() },
        uHaloColor: { value: new THREE.Color('#98bef8') },
        uHaloStrength: { value: 0.26 },
        uStarVis: { value: 1.0 },
        uTime: { value: 0.0 },
      },
    });
    this.skyMat = mat;
    this.skyMesh = new THREE.Mesh(geo, mat);
    this.skyMesh.renderOrder = -10;
    scene.add(this.skyMesh);
  }

  createSoftDotTexture(THREE) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0.0, 'rgba(255,255,255,1)');
    g.addColorStop(0.28, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.65, 'rgba(210,230,255,0.22)');
    g.addColorStop(1.0, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  buildCosmicElements(THREE, scene) {
    const dotTex = this.createSoftDotTexture(THREE);
    this.dotTex = dotTex;

    // 1. 瞬く3D星空（2層：極小の遠星 1,100個 + ほのかに輝く主星 280個。すべて滑らかな円形グロー）
    let seed = 1337;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    const palette = [
      new THREE.Color('#ffffff'),
      new THREE.Color('#c8e0ff'),
      new THREE.Color('#ffe8c8'),
      new THREE.Color('#b8c8ff'),
    ];
    const makeStarLayer = (count, size, lumMin) => {
      const pos = new Float32Array(count * 3);
      const col = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const u = rand() * 2 - 1;
        const phi = rand() * Math.PI * 2;
        const r = 270 + rand() * 90;
        const s = Math.sqrt(Math.max(0, 1 - u * u));
        pos[i * 3] = r * s * Math.cos(phi);
        pos[i * 3 + 1] = r * u;
        pos[i * 3 + 2] = r * s * Math.sin(phi);
        const c = palette[Math.floor(rand() * palette.length)];
        const lum = lumMin + (1 - lumMin) * rand();
        col[i * 3] = c.r * lum;
        col[i * 3 + 1] = c.g * lum;
        col[i * 3 + 2] = c.b * lum;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const mat = new THREE.PointsMaterial({
        size,
        map: dotTex,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      return { points: new THREE.Points(geo, mat), mat };
    };
    const faintStars = makeStarLayer(1100, 1.55, 0.35);
    const brightStars = makeStarLayer(280, 2.85, 0.65);
    this.starField = new THREE.Group();
    this.starField.add(faintStars.points, brightStars.points);
    this.starMats = [faintStars.mat, brightStars.mat];
    scene.add(this.starField);

    // 2. 遠くに佇む淡い輪を持つ惑星（寂しさと宇宙スケールの象徴）
    const planetGroup = new THREE.Group();
    planetGroup.position.set(-145, 92, -210);
    const planetMat = new THREE.MeshStandardMaterial({
      color: '#5f7399',
      emissive: '#1e2c4a',
      emissiveIntensity: 0.55,
      roughness: 0.92,
      metalness: 0.05,
      transparent: true,
      opacity: 0.78,
    });
    const planetMesh = new THREE.Mesh(new THREE.SphereGeometry(15, 24, 18), planetMat);
    const ringMat = new THREE.MeshBasicMaterial({
      color: '#9db8df',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    const ringMesh = new THREE.Mesh(new THREE.RingGeometry(20, 31, 48), ringMat);
    ringMesh.rotation.set(Math.PI * 0.37, 0.25, -0.32);
    planetGroup.add(planetMesh, ringMesh);
    this.planetGroup = planetGroup;
    this.planetMat = planetMat;
    this.ringMat = ringMat;
    planetGroup.visible = false; // 王国の空に惑星・環は置かない
    scene.add(planetGroup);

    // 3. 浮遊島の周囲をゆっくり漂う微細な星屑パーティクル（180個）
    const dustCount = 180;
    const dustPos = new Float32Array(dustCount * 3);
    this.dustBase = new Float32Array(dustCount * 4); // x, y, z, phase
    for (let i = 0; i < dustCount; i++) {
      const ang = rand() * Math.PI * 2;
      const rad = 16 + rand() * 52;
      const y = -34 + rand() * 58;
      const x = Math.cos(ang) * rad;
      const z = Math.sin(ang) * rad;
      dustPos[i * 3] = x;
      dustPos[i * 3 + 1] = y;
      dustPos[i * 3 + 2] = z;
      this.dustBase[i * 4] = x;
      this.dustBase[i * 4 + 1] = y;
      this.dustBase[i * 4 + 2] = z;
      this.dustBase[i * 4 + 3] = rand() * Math.PI * 2;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    this.dustGeo = dustGeo;
    this.dustMat = new THREE.PointsMaterial({
      size: 0.72,
      map: dotTex,
      color: '#b8d4ff',
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.dustPoints = new THREE.Points(dustGeo, this.dustMat);
    scene.add(this.dustPoints);

    // 4. 時折遠くの夜空を横切る控えめな流れ星（1本を再利用）
    const meteorGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(-18, 5, 0),
    ]);
    this.meteorMat = new THREE.LineBasicMaterial({
      color: '#dcecff',
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.meteorLine = new THREE.Line(meteorGeo, this.meteorMat);
    this.meteorStart = new THREE.Vector3();
    this.meteorDir = new THREE.Vector3();
    scene.add(this.meteorLine);
  }

  buildLights(THREE, scene) {
    this.hemiLight = new THREE.HemisphereLight('#5874ad', '#0d1326', 0.65);
    scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight('#a6c2f5', 1.5);
    this.keyLight.position.set(-40, 60, -60);
    scene.add(this.keyLight);

    this.rimLight = new THREE.DirectionalLight('#5c7fd6', 0.9);
    this.rimLight.position.set(55, 36, 52);
    scene.add(this.rimLight);

    // 浮遊島裏面の彫刻岩盤が闇に沈みきらないための淡い星雲照り返し
    this.underLight = new THREE.DirectionalLight('#36508a', 0.48);
    this.underLight.position.set(12, -75, 24);
    scene.add(this.underLight);

    // 4陣営＋中央広場のローカル灯り（Three.js Y-up座標・物理減衰バランス調整済み）
    const pointSpecs = [
      { pos: [0, 4.8, 0], color: '#ffd894', intensity: 16, distance: 26 },         // 中央広場ランタン
      { pos: [0, 6.2, -16.0], color: '#ffe0a8', intensity: 18, distance: 22 },     // 王国（北 -Z）
      { pos: [-16.0, 4.5, 0], color: '#a8ff90', intensity: 15, distance: 20 },     // 森の同盟（西 -X）
      { pos: [20.6, 11.0, 0], color: '#c464ff', intensity: 28, distance: 26 },     // 魔族軍（東 +X）
      { pos: [0, 4.8, 17.0], color: '#ff7030', intensity: 24, distance: 24 },      // 竜族帝国（南 +Z）
    ];
    for (const s of pointSpecs) {
      const pl = new THREE.PointLight(s.color, s.intensity, s.distance, 1.45);
      pl.position.set(...s.pos);
      scene.add(pl);
      this.factionLights.push({ light: pl, base: s.intensity });
    }
  }

  applySkyPhase(force = false) {
    const now = Date.now();
    if (!force && this.skyMode === 'auto' && now - this.lastClockSync < 30000) return;
    this.lastClockSync = now;

    const p = resolveSkyPhase(this.skyMode, new Date());
    this.currentPhase = p;
    if (this.homeEl) this.homeEl.dataset.skyPhase = p.key;

    if (!this.skyMat || !this.THREE) return;
    const u = this.skyMat.uniforms;
    u.uZenith.value.set(p.zenith);
    u.uMid.value.set(p.mid);
    u.uHorizon.value.set(p.horizon);
    u.uAbyss.value.set(p.abyss);
    u.uNebulaA.value.set(p.nebulaA);
    u.uNebulaB.value.set(p.nebulaB);
    u.uNebulaStrength.value = p.nebulaStrength;
    u.uSunDir.value.set(p.sunDir[0], p.sunDir[1], p.sunDir[2]).normalize();
    u.uHaloColor.value.set(p.haloColor);
    u.uHaloStrength.value = p.haloStrength;
    u.uStarVis.value = p.starVisibility;

    for (const sm of this.starMats ?? []) sm.opacity = p.starVisibility * 0.5;
    this.dustMat.color.set(p.dustColor);
    this.dustMat.opacity = p.dustOpacity;
    this.planetMat.opacity = p.planetAlpha;
    this.ringMat.opacity = p.planetAlpha * 0.34;

    this.keyLight.color.set(p.keyColor);
    this.keyLight.intensity = p.keyIntensity;
    this.keyLight.position.set(p.sunDir[0] * 95, p.sunDir[1] * 95, p.sunDir[2] * 95);

    this.rimLight.color.set(p.rimColor);
    this.rimLight.intensity = p.rimIntensity;
    this.underLight.color.set(p.underColor);
    this.underLight.intensity = p.underIntensity;

    this.hemiLight.color.set(p.hemiSky);
    this.hemiLight.groundColor.set(p.hemiGround);
    this.hemiLight.intensity = p.hemiIntensity;

    for (const item of this.factionLights) {
      item.light.intensity = item.base * p.pointScale;
    }
    for (const item of this.emissiveMats) {
      item.mat.emissiveIntensity = item.base * p.emissiveScale;
    }
    if (this.renderer) this.renderer.toneMappingExposure = p.exposure;
    if (this.visible && isReducedMotion()) this.renderOnce();
  }

  bindEvents() {
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize, { passive: true });
    this.onVisChange = () => {
      if (document.hidden) this.stopLoop();
      else if (this.visible) this.startLoop();
    };
    document.addEventListener('visibilitychange', this.onVisChange);

    if (typeof ResizeObserver !== 'undefined' && this.heroEl) {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(this.heroEl);
    }

    // .home-hero 上での軽いドラッグ鑑賞（指・マウスで左右に少し覗き込める）
    if (this.heroEl) {
      this.onPointerDown = (e) => {
        if (e.target.closest('button')) return;
        this.dragging = true;
        this.lastPointerX = e.clientX;
        this.lastPointerY = e.clientY;
        this.heroEl.setPointerCapture?.(e.pointerId);
      };
      this.onPointerMove = (e) => {
        if (!this.dragging) return;
        const dx = e.clientX - this.lastPointerX;
        const dy = e.clientY - this.lastPointerY;
        this.lastPointerX = e.clientX;
        this.lastPointerY = e.clientY;
        if (this.viewMode === 'overview') {
          this.overviewAngleDeg -= dx * 0.35;
          this.dragPitchDeg = Math.max(-14, Math.min(18, this.dragPitchDeg + dy * 0.14));
        } else {
          this.dragYawDeg = Math.max(-28, Math.min(28, this.dragYawDeg - dx * 0.24));
          this.dragPitchDeg = Math.max(-8, Math.min(10, this.dragPitchDeg + dy * 0.10));
        }
      };
      this.onPointerUp = () => {
        this.dragging = false;
      };
      this.heroEl.addEventListener('pointerdown', this.onPointerDown);
      this.heroEl.addEventListener('pointermove', this.onPointerMove);
      this.heroEl.addEventListener('pointerup', this.onPointerUp);
      this.heroEl.addEventListener('pointercancel', this.onPointerUp);
    }
  }

  resize() {
    if (!this.renderer || !this.camera || !this.skyEl) return;
    const rect = this.skyEl.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width || window.innerWidth));
    const h = Math.max(1, Math.round(rect.height || window.innerHeight));
    this.viewW = w;
    this.viewH = h;
    this.renderer.setSize(w, h, false);

    // 縦長スマホでも城の横幅が途切れないようFOVを動的に調整
    const aspect = w / h;
    let fov = 45.5;
    if (this.viewMode === 'factions' && aspect < 0.9) {
      const minHalfH = (16.5 * Math.PI) / 180;
      const neededV = 2 * Math.atan(Math.tan(minHalfH) / Math.max(0.38, aspect));
      fov = Math.max(45.5, Math.min(64, (neededV * 180) / Math.PI));
    } else if (this.viewMode === 'overview' && aspect < 0.9) {
      fov = 50;
    }
    this.camera.fov = fov;
    this.camera.aspect = aspect;

    // .home-hero の実位置を測って setViewOffset で中央へ綺麗に配置（全画面は宇宙背景のまま！）
    if (this.activeTab === 'battle' && this.heroEl) {
      const hr = this.heroEl.getBoundingClientRect();
      if (hr.width > 40 && hr.height > 40) {
        const cx = hr.left - rect.left + hr.width * 0.5;
        const cy = hr.top - rect.top + hr.height * 0.5;
        this.heroW = hr.width;
        this.heroH = hr.height;
        const offX = w * 0.5 - cx;
        const offY = h * 0.5 - cy;
        this.camera.setViewOffset(w, h, offX, offY, w, h);
      } else {
        this.camera.clearViewOffset();
      }
    } else {
      this.camera.clearViewOffset();
    }
    this.camera.updateProjectionMatrix();
    if (this.visible) this.renderOnce();
  }

  setVisible(on) {
    this.visible = Boolean(on);
    if (this.failed) return;
    if (this.visible) {
      this.applySkyPhase(true);
      this.resize();
      this.startLoop();
    } else {
      this.stopLoop();
    }
  }

  setTab(tab) {
    this.activeTab = tab;
    if (this.dioramaRoot) {
      this.dioramaRoot.visible = (tab === 'battle');
    }
    this.resize();
  }

  setViewMode(mode) {
    const next = mode === 'factions' ? 'factions' : 'overview';
    if (this.viewMode === next) return;
    this.viewMode = next;
    this.dragYawDeg = 0;
    this.dragPitchDeg = 0;
    this.resize();
  }

  setFaction(faction) {
    if (FACTION_ANGLE_DEG[faction] === undefined) return;
    this.faction = faction;
    this.targetOrbitDeg = FACTION_ANGLE_DEG[faction];
    this.dragYawDeg = 0;
    if (this.visible && isReducedMotion()) {
      this.orbitAngleDeg = this.targetOrbitDeg;
      this.currentTargetY = FACTION_TARGET_Y[faction];
      this.renderOnce();
    }
  }

  setSkyMode(mode) {
    const override = querySkyOverride();
    const next = HOME_SKY_MODES.includes(mode) ? mode : 'auto';
    // ユーザーが設定UIから明示的に変えた場合は即反映
    this.skyMode = next;
    if (!mode && override) this.skyMode = override;
    this.applySkyPhase(true);
    if (this.visible) this.renderOnce();
  }

  startLoop() {
    if (this.rafId || this.destroyed || !this.renderer) return;
    this.lastFrameTs = performance.now();
    const tick = (ts) => {
      if (!this.visible || this.destroyed) {
        this.rafId = 0;
        return;
      }
      const dt = Math.min(0.05, Math.max(0.001, (ts - this.lastFrameTs) / 1000));
      this.lastFrameTs = ts;
      this.update(dt);
      this.renderer.render(this.scene, this.camera);
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

  renderOnce() {
    if (!this.renderer || !this.scene || !this.camera) return;
    this.updateCamera(0.016, true);
    this.renderer.render(this.scene, this.camera);
  }

  update(dt) {
    const reduced = isReducedMotion();
    if (!reduced) this.elapsed += dt;

    if (this.skyMode === 'auto') this.applySkyPhase(false);
    if (this.skyMat) this.skyMat.uniforms.uTime.value = this.elapsed;

    // 浮遊島のゆったりとした呼吸のような上下浮遊
    if (this.dioramaRoot) {
      this.dioramaRoot.position.y = reduced ? 0 : Math.sin(this.elapsed * 0.65) * 0.38;
    }

    // 星空の極めてゆっくりとした回転
    if (this.starField && !reduced) {
      this.starField.rotation.y = this.elapsed * 0.004;
    }

    // 周囲の星屑パーティクルの穏やかな浮遊
    if (this.dustGeo && this.currentPhase?.dustOpacity > 0 && !reduced) {
      const attr = this.dustGeo.getAttribute('position');
      const arr = attr.array;
      const base = this.dustBase;
      const t = this.elapsed;
      for (let i = 0; i < arr.length / 3; i++) {
        const bx = base[i * 4];
        const by = base[i * 4 + 1];
        const bz = base[i * 4 + 2];
        const ph = base[i * 4 + 3];
        arr[i * 3] = bx + Math.sin(t * 0.35 + ph) * 0.9;
        arr[i * 3 + 1] = by + Math.sin(t * 0.55 + ph * 1.7) * 1.1;
        arr[i * 3 + 2] = bz + Math.cos(t * 0.32 + ph) * 0.9;
      }
      attr.needsUpdate = true;
    }

    // 夜間・黄昏の控えめな流れ星
    if (this.meteorLine && !reduced) {
      const starVis = this.currentPhase?.starVisibility ?? 0.8;
      if (this.meteorLife >= 0) {
        this.meteorLife += dt;
        const u = this.meteorLife / this.meteorDuration;
        if (u >= 1) {
          this.meteorLife = -1;
          this.meteorMat.opacity = 0;
          this.meteorTimer = 11 + Math.random() * 14;
        } else {
          this.meteorLine.position.copy(this.meteorStart).addScaledVector(this.meteorDir, u * 115);
          this.meteorMat.opacity = Math.sin(u * Math.PI) * 0.55 * starVis;
        }
      } else if (starVis > 0.45) {
        this.meteorTimer -= dt;
        if (this.meteorTimer <= 0) {
          this.meteorLife = 0;
          const az = Math.random() * Math.PI * 2;
          this.meteorStart.set(Math.cos(az) * 230, 85 + Math.random() * 75, Math.sin(az) * 230);
          this.meteorDir.set(-Math.sin(az) * 0.9, -0.35, Math.cos(az) * 0.9).normalize();
          this.meteorLine.lookAt(this.meteorStart.clone().add(this.meteorDir));
        }
      }
    }

    this.updateCamera(dt, reduced);
  }

  updateCamera(dt, snap = false) {
    if (!this.camera) return;
    const damp = snap ? 1 : 1 - Math.exp(-5.4 * dt);

    if (this.viewMode === 'factions') {
      // 4陣営ホームカメラ：中央広場 (0,0,0) を軸に滑らかに360°旋回！
      const diff = shortestAngleDiff(this.orbitAngleDeg, this.targetOrbitDeg);
      this.orbitAngleDeg += diff * damp;
      if (!this.dragging) {
        this.dragYawDeg *= Math.exp(-4.5 * dt);
        this.dragPitchDeg *= Math.exp(-4.5 * dt);
      }
      const wantY = FACTION_TARGET_Y[this.faction] ?? 5.25;
      this.currentTargetY += (wantY - this.currentTargetY) * damp;

      const ang = ((this.orbitAngleDeg + this.dragYawDeg) * Math.PI) / 180;
      // Three.js Y-up: dir = (cos(ang), 0, -sin(ang)), right-perp = (sin(ang), 0, cos(ang))
      const dx = Math.cos(ang);
      const dz = -Math.sin(ang);
      const px = Math.sin(ang);
      const pz = Math.cos(ang);

      const rBack = 11.4;
      const rSide = 2.6;
      const camY = 8.4 + this.dragPitchDeg * 0.35;
      const targetDist = 16.0;

      // 城の上端が見出しと重ならないよう .home-hero の高さ比に応じて自然に距離を調整
      const heroFrac = (this.heroH && this.viewH) ? (this.heroH / this.viewH) : 0.45;
      const pull = heroFrac < 0.48 ? (0.48 - heroFrac) * 18.0 : 0;

      this.camera.position.set(
        -dx * (rBack + pull) + px * rSide,
        camY + pull * 0.32,
        -dz * (rBack + pull) + pz * rSide,
      );
      this.camera.lookAt(dx * targetDist, this.currentTargetY + 0.55, dz * targetDist);
    } else {
      // 通常モード：4陣営の浮遊島全体が宇宙にぽつんと浮かぶ斜め俯瞰（見出し・下部UIに被らない余裕ある距離）
      if (!this.dragging && !snap) {
        this.overviewAngleDeg += dt * 1.45;
      }
      const rad = (this.overviewAngleDeg * Math.PI) / 180;
      const heroFrac = (this.heroH && this.viewH) ? (this.heroH / this.viewH) : 0.42;
      const heroWFrac = (this.heroW && this.viewW) ? (this.heroW / this.viewW) : 0.85;
      const distByH = 68 / Math.max(0.24, heroFrac * 0.92);
      const distByW = 72 / Math.max(0.45, heroWFrac * 0.95);
      const dist = Math.max(128, Math.min(215, Math.max(distByH * 0.72, distByW * 0.82)));

      const pitchRad = ((23 + this.dragPitchDeg) * Math.PI) / 180;
      const horiz = dist * Math.cos(pitchRad);
      const camY = dist * Math.sin(pitchRad) - 5.0;

      this.camera.position.set(Math.sin(rad) * horiz, camY, Math.cos(rad) * horiz);
      this.camera.lookAt(0, -11.5, 0);
    }
  }

  destroy() {
    this.destroyed = true;
    this.stopLoop();
    if (this.onResize) window.removeEventListener('resize', this.onResize);
    if (this.onVisChange) document.removeEventListener('visibilitychange', this.onVisChange);
    this.ro?.disconnect();
    if (this.heroEl && this.onPointerDown) {
      this.heroEl.removeEventListener('pointerdown', this.onPointerDown);
      this.heroEl.removeEventListener('pointermove', this.onPointerMove);
      this.heroEl.removeEventListener('pointerup', this.onPointerUp);
      this.heroEl.removeEventListener('pointercancel', this.onPointerUp);
    }
    this.dotTex?.dispose();
    this.renderer?.dispose();
    this.renderer?.domElement?.remove();
    this.homeEl?.classList.remove('has-3d-diorama', 'diorama-3d-ready');
  }
}
