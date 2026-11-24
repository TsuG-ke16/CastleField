// ホーム画面用 4陣営ジオラマ＆宇宙背景エンジン（ハイブリッド構成）
// - デフォルト（軽量・最高画質モード / home3d: false）：
//     Blender Cycles OPTIX＋本物Bloomで事前出力した 4時間帯×5視点のWebP画像と、
//     超軽量2D Canvasの「瞬く星空・星雲・星屑・流れ星」を組み合わせて表示（.glb未読込・低発熱・即起動）
// - リアルタイム3Dモード（設定「ホームの3D表示：ON」または ?home3d=3d）：
//     assets/models/diorama/castle_field_diorama.glb を Three.js でリアルタイム描画し、
//     360°宇宙スカイドーム・動く水面＆4本の滝シェーダー・滝壺ミスト・中央広場軸の360°旋回・ドラッグ鑑賞を提供
// - ?fx=lite / WebGL不可時は自動的に軽量モード・2D背景へ安全にフォールバック

import { UI_CONFIG } from './config.js';

export const DIORAMA_GLB_PATH = 'assets/models/diorama/castle_field_diorama.glb';
export const KINGDOM_TOWN_GLB_PATH = 'assets/models/diorama/kingdom_town_diorama.glb';
export const SKY_DRAGON_GLB_PATH = 'assets/models/diorama/sky_dragon.glb';
export const COSMIC_HOME_DIR = 'assets/models/diorama/cosmic_home';

export const HOME_SKY_MODES = ['auto', 'dawn', 'day', 'dusk', 'night'];
export const HOME_SKY_LABELS = {
  auto: '自動（時刻）',
  dawn: '明け方',
  day: '星昼',
  dusk: '黄昏',
  night: '深宇宙',
};

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

// 「宇宙に浮かぶ寂しい箱庭」を保った4時間帯キーフレーム
const SKY_PRESETS = {
  dawn: {
    label: '星の夜明け',
    zenith: '#081024',
    mid: '#162547',
    horizon: '#3c3a5e',
    abyss: '#050814',
    nebulaA: '#8e6c96',
    nebulaB: '#537ea8',
    nebulaStrength: 0.42,
    starVisibility: 0.58,
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
    waterDeep: '#19456b',
    waterShallow: '#58b4cc',
    waterGlint: '#ffe4cf',
    dustColor: '#e8d8ff',
    dustOpacity: 0.52,
    planetAlpha: 0.55,
    exposure: 0.96,
  },
  day: {
    label: '蒼い星昼',
    zenith: '#0a1936',
    mid: '#163566',
    horizon: '#2d598a',
    abyss: '#071124',
    nebulaA: '#4f82bd',
    nebulaB: '#7ab3d8',
    nebulaStrength: 0.36,
    starVisibility: 0.34,
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
    waterDeep: '#156092',
    waterShallow: '#68d4ea',
    waterGlint: '#ffffff',
    dustColor: '#d8f0ff',
    dustOpacity: 0.44,
    planetAlpha: 0.42,
    exposure: 1.0,
  },
  dusk: {
    label: '茜の星雲',
    zenith: '#09091c',
    mid: '#23193b',
    horizon: '#5c2f44',
    abyss: '#060512',
    nebulaA: '#b85c60',
    nebulaB: '#593d80',
    nebulaStrength: 0.52,
    starVisibility: 0.72,
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
    waterDeep: '#1f2852',
    waterShallow: '#548eb0',
    waterGlint: '#ffbe8a',
    dustColor: '#ffd4b8',
    dustOpacity: 0.62,
    planetAlpha: 0.70,
    exposure: 0.96,
  },
  night: {
    label: '静寂の深宇宙',
    zenith: '#02040d',
    mid: '#081024',
    horizon: '#12203e',
    abyss: '#010309',
    nebulaA: '#2d4b7a',
    nebulaB: '#3e326e',
    nebulaStrength: 0.46,
    starVisibility: 1.0,
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
    waterDeep: '#0a2648',
    waterShallow: '#2b7ba8',
    waterGlint: '#b8dcff',
    dustColor: '#b8d4ff',
    dustOpacity: 0.72,
    planetAlpha: 0.85,
    exposure: 0.96,
  },
};

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
 * 指定モード（auto / dawn / day / dusk / night）と時刻から現在の宇宙ライティング状態を求める。
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

/** Cycles 事前レンダリング WebP のパスを返す（通常モードは王国＋城下町、4陣営は各陣営） */
export function cosmicImagePath(phaseKey, viewMode, faction) {
  const phase = Object.hasOwn(SKY_PRESETS, phaseKey) ? phaseKey : 'night';
  const view = viewMode === 'factions' && FACTION_ANGLE_DEG[faction] !== undefined ? faction : 'kingdom_town';
  return `${COSMIC_HOME_DIR}/${phase}_${view}.webp`;
}

function querySkyOverride() {
  try {
    const q = new URLSearchParams(location.search).get('sky');
    if (q && HOME_SKY_MODES.includes(q)) return q;
  } catch { /* ignore */ }
  return null;
}

function queryHome3dOverride() {
  try {
    const q = new URLSearchParams(location.search);
    if (q.get('fx') === 'lite' || q.get('home3d') === '2d' || q.get('home3d') === '0') return false;
    if (q.get('home3d') === '3d' || q.get('home3d') === '1') return true;
  } catch { /* ignore */ }
  return null;
}

function isLiteMode() {
  try {
    return new URLSearchParams(location.search).get('fx') === 'lite';
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
const glbCache = new Map();

function loadLibs() {
  return (libsPromise ??= Promise.all([
    import('../vendor/three/three.module.min.js'),
    import('../vendor/three/GLTFLoader.js'),
  ]).then(([THREE, { GLTFLoader }]) => ({ THREE, GLTFLoader })));
}

function loadGlbAsset(GLTFLoader, relPath) {
  if (!glbCache.has(relPath)) {
    const url = typeof document !== 'undefined' ? new URL(relPath, document.baseURI).href : relPath;
    const p = new GLTFLoader().loadAsync(url).catch((err) => {
      glbCache.delete(relPath);
      throw err;
    });
    glbCache.set(relPath, p);
  }
  return glbCache.get(relPath);
}

function shortestAngleDiff(fromDeg, toDeg) {
  return ((toDeg - fromDeg + 180) % 360 + 360) % 360 - 180;
}

// ---------- GLSL シェーダー群 ----------

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

    vec3 col = mix(uAbyss, uHorizon, smoothstep(-0.55, 0.02, h));
    col = mix(col, uMid, smoothstep(0.02, 0.34, h));
    col = mix(col, uZenith, smoothstep(0.32, 0.88, h));

    vec3 nebP = vec3(d.x * 2.2 + d.z * 0.9, d.y * 3.1 - d.x * 1.4, d.z * 2.2) + vec3(uTime * 0.004, 0.0, -uTime * 0.003);
    float n1 = fbm(nebP * 1.4);
    float n2 = fbm(nebP * 2.8 + vec3(3.1, -2.4, 1.7));
    float band = exp(-pow((d.y + 0.28 * d.x - 0.14 * d.z) * 2.6, 2.0));
    float wisps = smoothstep(0.42, 0.84, n1 * 0.72 + n2 * 0.28) * (0.38 + 0.62 * band);
    vec3 nebCol = mix(uNebulaA, uNebulaB, n2);
    col += nebCol * wisps * uNebulaStrength;

    float sunDot = max(0.0, dot(d, normalize(uSunDir)));
    float halo = pow(sunDot, 10.0) * 0.55 + pow(sunDot, 64.0) * 0.75;
    col += uHaloColor * halo * uHaloStrength;

    gl_FragColor = vec4(col, 1.0);
  }
`;

// 動く環状堀・4河川シェーダー（外向きの流れ＋星明かり波紋きらめき＋白波）
const WATER_MOAT_VERT = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vec3 pos = position;
    pos.y += sin(pos.x * 0.75 + uTime * 1.9) * 0.035 + cos(pos.z * 0.82 - uTime * 1.55) * 0.035;
    vec4 wp = modelMatrix * vec4(pos, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const WATER_MOAT_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uGlint;
  varying vec2 vUv;
  varying vec3 vWorldPos;

  float wavePattern(vec2 p, float t) {
    float w1 = sin(p.x * 1.6 + t * 1.6 + sin(p.y * 1.1 - t * 0.9));
    float w2 = cos(p.y * 1.9 - t * 2.1 + cos(p.x * 1.3 + t * 1.2));
    float w3 = sin((p.x - p.y) * 2.4 + t * 2.5);
    return (w1 + w2 + w3) / 3.0;
  }

  void main() {
    float r = length(vWorldPos.xz);
    vec2 flowUv = vec2(vUv.x * 3.5, vUv.y * 3.0 - uTime * 0.55);
    float wA = wavePattern(flowUv * 1.8, uTime);
    float wB = wavePattern(vWorldPos.xz * 0.42 - vec2(uTime * 0.25, uTime * 0.18), uTime * 0.85);
    float ripples = 0.5 + 0.5 * (wA * 0.55 + wB * 0.45);

    vec3 col = mix(uDeep, uShallow, smoothstep(0.20, 0.88, ripples));

    // 流れ筋と微細な星明かりスペキュラ
    float streak = smoothstep(0.68, 0.96, sin(vUv.x * 26.0 + wA * 2.0) * 0.5 + 0.5) * smoothstep(0.35, 0.85, ripples);
    float sparkle = pow(max(0.0, wA * wB), 3.0) * 0.65;
    col = mix(col, uGlint, streak * 0.26 + sparkle * 0.55);

    // 広場縁（r ≈ 9.2〜10.0）に繊細な岸辺の波紋ハイライト
    float shore = smoothstep(10.1, 9.2, r) * (0.45 + 0.55 * sin(r * 9.0 - uTime * 3.0));
    col = mix(col, uGlint, clamp(shore * 0.35, 0.0, 0.4));

    gl_FragColor = vec4(col, 0.92);
  }
`;

// 流れ落ちる4本の滝シェーダー（連続落下スクロール＋白波リボン＋下端の宇宙霧フェード）
const WATERFALL_VERT = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 pos = position;
    float sway = sin(uv.y * 8.0 - uTime * 4.2 + uv.x * 6.0) * 0.08 * sin(uv.y * 3.14159);
    pos.x += sway;
    pos.z += sway;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const WATERFALL_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uGlint;
  varying vec2 vUv;

  void main() {
    // 上(v=0)から下(v=1)へ絶えず流れ落ちる二重スクロール
    float flow1 = vUv.y * 4.5 - uTime * 1.45;
    float flow2 = vUv.y * 8.0 - uTime * 2.25;

    float s1 = 0.5 + 0.5 * sin(vUv.x * 22.0 + sin(flow1 * 2.6) * 1.4);
    float s2 = 0.5 + 0.5 * sin(vUv.x * 40.0 - flow2 * 1.2 + cos(flow1 * 3.2));
    float foamRibbon = smoothstep(0.58, 0.92, s1 * 0.6 + s2 * 0.4);

    // 落ち口の白波クレスト（vUv.y < 0.16）
    float crestFoam = smoothstep(0.18, 0.0, vUv.y) * (0.55 + 0.45 * s2);

    vec3 col = mix(uDeep, uShallow, 0.35 + 0.45 * s1);
    col = mix(col, uGlint, clamp(foamRibbon * 0.58 + crestFoam * 0.72, 0.0, 0.92));

    // 左右端と下端が宇宙の霧へふわりと溶ける
    float edgeFade = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
    float bottomFade = smoothstep(1.0, 0.72, vUv.y);
    float alpha = (0.78 + foamRibbon * 0.20) * edgeFade * bottomFade;
    gl_FragColor = vec4(col, alpha);
  }
`;

// ---------- 軽量2D宇宙星空キャンバス（デフォルト：Cyclesプリレンダ背景の土台） ----------

class CosmicBackdrop2D {
  constructor(skyEl) {
    this.skyEl = skyEl;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'home-cosmic-2d-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.ctx = this.canvas.getContext('2d');
    this.phase = resolveSkyPhase('night');
    this.stars = [];
    this.dust = [];
    this.meteor = null;
    this.meteorCooldown = 5.0;
    this.elapsed = 0;

    let seed = 4242;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    const tints = ['#ffffff', '#cce2ff', '#ffe8c6', '#b8ccff'];
    for (let i = 0; i < 220; i++) {
      this.stars.push({
        x: rand(),
        y: rand() * 0.86,
        r: 0.55 + Math.pow(rand(), 2.2) * 1.75,
        phase: rand() * Math.PI * 2,
        speed: 0.9 + rand() * 2.1,
        tint: tints[Math.floor(rand() * tints.length)],
        alpha: 0.35 + rand() * 0.65,
      });
    }
    for (let i = 0; i < 48; i++) {
      this.dust.push({
        x: rand(),
        y: 0.15 + rand() * 0.75,
        r: 1.0 + rand() * 1.8,
        vx: (rand() - 0.5) * 0.008,
        vy: -(0.004 + rand() * 0.008),
        phase: rand() * Math.PI * 2,
      });
    }
  }

  mount() {
    this.skyEl.replaceChildren(this.canvas);
    this.resize();
  }

  resize() {
    const rect = this.skyEl.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(rect.width || window.innerWidth));
    const h = Math.max(1, Math.round(rect.height || window.innerHeight));
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  setPhase(p) {
    this.phase = p;
  }

  draw(dt, reduced) {
    if (!this.ctx || !this.w || !this.h) return;
    if (!reduced) this.elapsed += dt;
    const ctx = this.ctx;
    const w = this.w;
    const h = this.h;
    const p = this.phase;

    // 1. 深い宇宙の縦グラデーション
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0.0, p.zenith);
    bg.addColorStop(0.36, p.mid);
    bg.addColorStop(0.68, p.horizon);
    bg.addColorStop(1.0, p.abyss);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // 2. 柔らかな星雲グロー（2層）
    const drawNebula = (cx, cy, rad, hex, alpha) => {
      const [r, g, b] = hexToRgb(hex);
      const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      gr.addColorStop(0.0, `rgba(${r},${g},${b},${alpha.toFixed(3)})`);
      gr.addColorStop(0.55, `rgba(${r},${g},${b},${(alpha * 0.36).toFixed(3)})`);
      gr.addColorStop(1.0, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, w, h);
    };
    const drift = Math.sin(this.elapsed * 0.12) * w * 0.03;
    drawNebula(w * 0.28 + drift, h * 0.34, Math.max(w, h) * 0.58, p.nebulaA, p.nebulaStrength * 0.42);
    drawNebula(w * 0.74 - drift, h * 0.28, Math.max(w, h) * 0.52, p.nebulaB, p.nebulaStrength * 0.36);

    // 3. 瞬く星空
    const sv = Math.max(0.22, p.starVisibility);
    for (const s of this.stars) {
      const tw = reduced ? 0.85 : (0.58 + 0.42 * Math.sin(this.elapsed * s.speed + s.phase));
      ctx.globalAlpha = s.alpha * tw * sv;
      ctx.fillStyle = s.tint;
      ctx.beginPath();
      ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4. 遠くに佇む淡い輪を持つ惑星（右上/左上奥に控えめに）
    const px = w * 0.17;
    const py = h * 0.22;
    const pr = Math.min(w, h) * 0.028;
    ctx.save();
    ctx.globalAlpha = p.planetAlpha * 0.45;
    ctx.strokeStyle = '#9db8df';
    ctx.lineWidth = Math.max(1.2, pr * 0.16);
    ctx.beginPath();
    ctx.ellipse(px, py, pr * 2.1, pr * 0.52, -0.32, 0, Math.PI * 2);
    ctx.stroke();
    const pg = ctx.createRadialGradient(px - pr * 0.35, py - pr * 0.35, pr * 0.1, px, py, pr);
    pg.addColorStop(0, '#8ba4cc');
    pg.addColorStop(1, '#1a2744');
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 5. 漂う微細な星屑パーティクル
    const [dr, dg, db] = hexToRgb(p.dustColor);
    for (const d of this.dust) {
      if (!reduced) {
        d.x = (d.x + d.vx * dt + 1) % 1;
        d.y = d.y + d.vy * dt;
        if (d.y < 0.08) d.y = 0.88;
      }
      const pulse = 0.45 + 0.55 * Math.sin(this.elapsed * 1.1 + d.phase);
      ctx.globalAlpha = p.dustOpacity * 0.48 * pulse;
      ctx.fillStyle = `rgb(${dr},${dg},${db})`;
      ctx.beginPath();
      ctx.arc(d.x * w, d.y * h, d.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // 6. 控えめな流れ星（夜間・黄昏のみ）
    if (!reduced && sv > 0.48) {
      if (this.meteor) {
        this.meteor.t += dt;
        const u = this.meteor.t / this.meteor.dur;
        if (u >= 1) {
          this.meteor = null;
          this.meteorCooldown = 9 + Math.random() * 14;
        } else {
          const mx = (this.meteor.x + this.meteor.dx * u) * w;
          const my = (this.meteor.y + this.meteor.dy * u) * h;
          const tail = Math.min(w, h) * 0.12;
          const grad = ctx.createLinearGradient(mx, my, mx - this.meteor.dx * tail, my - this.meteor.dy * tail);
          const al = Math.sin(u * Math.PI) * 0.65 * sv;
          grad.addColorStop(0, `rgba(225,240,255,${al.toFixed(3)})`);
          grad.addColorStop(1, 'rgba(225,240,255,0)');
          ctx.globalAlpha = 1;
          ctx.strokeStyle = grad;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(mx, my);
          ctx.lineTo(mx - this.meteor.dx * tail, my - this.meteor.dy * tail);
          ctx.stroke();
        }
      } else {
        this.meteorCooldown -= dt;
        if (this.meteorCooldown <= 0) {
          this.meteor = {
            x: 0.25 + Math.random() * 0.65,
            y: 0.06 + Math.random() * 0.22,
            dx: -0.24 - Math.random() * 0.12,
            dy: 0.12 + Math.random() * 0.08,
            t: 0,
            dur: 0.95,
          };
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  destroy() {
    this.canvas.remove();
  }
}

// ---------- ハイブリッド統合コントローラ（案2プリレンダ＋案1リアルタイム3D） ----------

export class HomeDioramaGL {
  /**
   * @param {object} opts
   * @param {HTMLElement} opts.skyEl
   * @param {HTMLElement} opts.heroEl
   * @param {HTMLElement} opts.homeEl
   * @param {string} [opts.viewMode]   'factions' | 'overview'
   * @param {string} [opts.faction]    'kingdom' | 'forest' | 'demon' | 'dragon'
   * @param {string} [opts.skyMode]    'auto' | 'dawn' | 'day' | 'dusk' | 'night'
   * @param {boolean} [opts.use3D]     false=軽量Cyclesプリレンダ（デフォルト） / true=リアルタイム3D
   */
  constructor({ skyEl, heroEl, homeEl, viewMode = 'overview', faction = 'kingdom', skyMode = 'auto', use3D = true }) {
    this.skyEl = skyEl;
    this.heroEl = heroEl;
    this.homeEl = homeEl;
    this.viewMode = viewMode;
    this.faction = FACTION_ANGLE_DEG[faction] !== undefined ? faction : 'kingdom';
    this.skyMode = querySkyOverride() ?? (HOME_SKY_MODES.includes(skyMode) ? skyMode : 'auto');
    const q3d = queryHome3dOverride();
    this.use3D = q3d !== null ? q3d : Boolean(use3D);

    this.activeTab = 'battle';
    this.visible = false;
    this.destroyed = false;
    this.ready3D = false;
    this.initializing3D = false;
    this.failed3D = false;

    // カメラ軌道状態（3Dモード用）
    this.orbitAngleDeg = FACTION_ANGLE_DEG[this.faction] ?? 90;
    this.targetOrbitDeg = this.orbitAngleDeg;
    this.overviewAngleDeg = -20.0;
    this.dragYawDeg = 0;
    this.dragPitchDeg = 0;
    this.dragging = false;
    this.lastPointerX = 0;
    this.lastPointerY = 0;
    this.currentTargetY = FACTION_TARGET_Y[this.faction] ?? 5.25;

    this.meteorTimer = 6.0;
    this.meteorLife = -1;
    this.meteorDuration = 1.1;

    this.emissiveMats = [];
    this.factionLights = [];
    this.waterMats = [];
    this.bloomAuras = [];
    this.animatedDragons = [];
    this.animatedSpirits = [];
    this.windmillBlades = null;
    this.classicGroup = null;
    this.factionsGroup = null;
    this.loadingClassic = false;
    this.loadingFactions = false;
    this.GLTFLoader = null;
    this.lastClockSync = 0;
    this.rafId = 0;
    this.lastFrameTs = 0;
    this.elapsed = 0;

    if (isLiteMode()) {
      this.disabled = true;
      return;
    }

    // プリレンダ用クロスフェード画像スロットを .home-hero 内に用意
    this.setupPrerenderLayer();
    // 2D宇宙星空キャンバスを用意
    this.backdrop2D = new CosmicBackdrop2D(this.skyEl);
    this.bindEvents();
    this.applyRenderMode();
  }

  setupPrerenderLayer() {
    if (!this.heroEl) return;
    const wrap = document.createElement('div');
    wrap.className = 'home-cosmic-stage';
    wrap.setAttribute('aria-hidden', 'true');
    const imgA = new Image();
    imgA.className = 'home-cosmic-img is-active';
    imgA.decoding = 'async';
    imgA.draggable = false;
    const imgB = new Image();
    imgB.className = 'home-cosmic-img';
    imgB.decoding = 'async';
    imgB.draggable = false;
    wrap.append(imgA, imgB);
    this.heroEl.prepend(wrap);
    this.prerenderWrap = wrap;
    this.prerenderImgs = [imgA, imgB];
    this.prerenderFront = 0;
    this.currentImgSrc = '';
  }

  updatePrerenderImage(force = false) {
    if (!this.prerenderWrap || this.use3D) return;
    const phase = this.currentPhase?.key ?? resolveSkyPhase(this.skyMode).key;
    const nextSrc = cosmicImagePath(phase, this.viewMode, this.faction);
    if (!force && nextSrc === this.currentImgSrc) return;
    this.currentImgSrc = nextSrc;

    const backIdx = 1 - this.prerenderFront;
    const backImg = this.prerenderImgs[backIdx];
    const frontImg = this.prerenderImgs[this.prerenderFront];
    const commit = () => {
      if (this.destroyed || this.use3D || this.currentImgSrc !== nextSrc) return;
      backImg.classList.add('is-active');
      frontImg.classList.remove('is-active');
      this.prerenderFront = backIdx;
      this.homeEl.classList.add('diorama-3d-ready');
    };
    backImg.onload = commit;
    backImg.onerror = () => {
      // 画像が見つからない場合は既存の2Dアリーナ画像を維持
      if (!this.currentImgSrc) this.homeEl.classList.remove('diorama-3d-ready');
    };
    backImg.src = nextSrc;
    if (backImg.complete && backImg.naturalWidth > 0) commit();
  }

  applyRenderMode() {
    if (this.disabled || this.destroyed) return;
    this.homeEl.classList.add('has-3d-diorama');
    this.homeEl.dataset.dioramaMode = this.use3D ? '3d' : 'prerender';

    if (this.use3D && !this.failed3D) {
      if (this.prerenderWrap) this.prerenderWrap.hidden = true;
      if (this.ready3D && this.renderer) {
        this.skyEl.replaceChildren(this.renderer.domElement);
        this.homeEl.classList.add('diorama-3d-ready');
        this.applySkyPhase(true);
        this.resize();
        if (this.visible) this.startLoop();
      } else if (!this.initializing3D) {
        // 3D初回読み込み中（一瞬の間）も背景透過Cycles画像＋2D宇宙星空を出してシームレスに繋ぐ
        if (this.prerenderWrap) this.prerenderWrap.hidden = false;
        this.backdrop2D.mount();
        this.applySkyPhase(true);
        this.updatePrerenderImage(true);
        if (this.visible) this.startLoop();
        this.init3D().catch((err) => {
          console.warn('[HomeDioramaGL] 3D初期化に失敗したため省電力プリレンダへ切替えます:', err?.message ?? err);
          this.failed3D = true;
          this.use3D = false;
          this.applyRenderMode();
        });
      }
    } else {
      // デフォルト：超軽量・Cycles最高画質プリレンダ＋2D星空アニメ
      if (this.prerenderWrap) this.prerenderWrap.hidden = false;
      this.backdrop2D.mount();
      this.applySkyPhase(true);
      this.resize();
      if (this.visible) this.startLoop();
    }
  }

  async init3D() {
    this.initializing3D = true;
    const { THREE, GLTFLoader } = await loadLibs();
    if (this.destroyed) return;
    this.THREE = THREE;
    this.GLTFLoader = GLTFLoader;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.96;
    renderer.domElement.className = 'home-diorama-canvas';
    renderer.domElement.setAttribute('aria-hidden', 'true');
    this.renderer = renderer;

    const scene = new THREE.Scene();
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(45.5, 1, 0.5, 650);
    this.camera = camera;

    this.buildSkyDome(THREE, scene);
    this.buildCosmicElements(THREE, scene);
    this.buildLights(THREE, scene);

    // 動く水面・滝の専用GLSLマテリアルを作成（通常モード・4陣営モードで共用）
    const pInit = resolveSkyPhase(this.skyMode);
    const moatMat = new THREE.ShaderMaterial({
      vertexShader: WATER_MOAT_VERT,
      fragmentShader: WATER_MOAT_FRAG,
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uDeep: { value: new THREE.Color(pInit.waterDeep) },
        uShallow: { value: new THREE.Color(pInit.waterShallow) },
        uGlint: { value: new THREE.Color(pInit.waterGlint) },
      },
    });
    const fallMat = new THREE.ShaderMaterial({
      vertexShader: WATERFALL_VERT,
      fragmentShader: WATERFALL_FRAG,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uDeep: { value: new THREE.Color(pInit.waterDeep) },
        uShallow: { value: new THREE.Color(pInit.waterShallow) },
        uGlint: { value: new THREE.Color(pInit.waterGlint) },
      },
    });
    this.waterMats = [moatMat, fallMat];

    this.dioramaRoot = new THREE.Group();
    this.dioramaRoot.visible = (this.activeTab === 'battle');
    scene.add(this.dioramaRoot);

    await this.ensureDioramaLoaded(this.viewMode);
    if (this.destroyed) return;
    this.syncActiveDioramaGroup();

    this.ready3D = true;
    this.initializing3D = false;

    if (this.use3D) {
      if (this.prerenderWrap) this.prerenderWrap.hidden = true;
      this.skyEl.replaceChildren(renderer.domElement);
      this.homeEl.classList.add('diorama-3d-ready');
      this.applySkyPhase(true);
      this.resize();
      if (this.visible) {
        this.renderOnce3D();
        this.startLoop();
      }
    }
  }

  prepareModelMeshes(model) {
    const [moatMat, fallMat] = this.waterMats;
    const embeddedLights = [];
    model.traverse((obj) => {
      if (obj.isLight) {
        obj.intensity = 0;
        obj.visible = false;
        embeddedLights.push(obj);
        return;
      }
      if (!obj.isMesh) return;
      if (obj.name === 'Props_Floating_Cloud_Ring' || obj.name === 'Water_Waterfall_MistPlumes') {
        obj.visible = false;
        return;
      }
      if (obj.name === 'Water_Moat_Animated') {
        obj.material = moatMat;
        return;
      }
      if (obj.name === 'Water_Waterfalls_Animated') {
        obj.material = fallMat;
        return;
      }
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      const cloned = mats.map((mat) => {
        if (!mat) return mat;
        const m = mat.clone();
        const hasEmissive = Boolean(m.emissiveMap) || (m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.05);
        if (hasEmissive) {
          const baseInt = m.emissiveMap ? 0.95 : 1.2;
          m.emissiveIntensity = baseInt;
          this.emissiveMats.push({ mat: m, base: baseInt });
        }
        return m;
      });
      obj.material = Array.isArray(obj.material) ? cloned : cloned[0];
    });
    for (const l of embeddedLights) l.parent?.remove(l);
  }

  async ensureDioramaLoaded(mode) {
    if (!this.THREE || !this.GLTFLoader || !this.dioramaRoot || this.destroyed) return;
    const THREE = this.THREE;
    if (mode === 'factions') {
      if (this.factionsGroup || this.loadingFactions) return;
      this.loadingFactions = true;
      try {
        const [gltf, dragonGltf] = await Promise.all([
          loadGlbAsset(this.GLTFLoader, DIORAMA_GLB_PATH),
          loadGlbAsset(this.GLTFLoader, SKY_DRAGON_GLB_PATH).catch(() => null),
        ]);
        if (this.destroyed) return;
        const group = new THREE.Group();
        const model = gltf.scene.clone(true);
        this.prepareModelMeshes(model);
        group.add(model);
        this.buildWaterfallMistParticles(THREE, group);
        this.buildBloomAuras(THREE, group, 'factions');
        this.buildElementalSpirits(THREE, group, 'factions');
        if (dragonGltf) {
          this.buildSkyDragon(THREE, group, dragonGltf, {
            mode: 'factions',
            scale: 0.92,
            center: [0, 14.5, 0],
            rx: 25.5,
            rz: 23.5,
            bobAmp: 2.2,
            speed: 0.24,
            phase: 0.4,
            scaleColor: '#9c1b28',
            membraneColor: '#ff5228',
            membraneEmit: '#ff6620',
            eyeColor: '#ffdf44',
          });
        }
        this.factionsGroup = group;
        this.dioramaRoot.add(group);
        this.syncActiveDioramaGroup();
        this.applySkyPhase(true);
      } finally {
        this.loadingFactions = false;
      }
    } else {
      if (this.classicGroup || this.loadingClassic) return;
      this.loadingClassic = true;
      try {
        const [gltf, dragonGltf] = await Promise.all([
          loadGlbAsset(this.GLTFLoader, KINGDOM_TOWN_GLB_PATH),
          loadGlbAsset(this.GLTFLoader, SKY_DRAGON_GLB_PATH).catch(() => null),
        ]);
        if (this.destroyed) return;
        const group = new THREE.Group();
        const model = gltf.scene.clone(true);
        this.prepareModelMeshes(model);
        const blades = model.getObjectByName('Town_Windmill_Blades');
        if (blades) this.windmillBlades = blades;
        group.add(model);
        this.buildBloomAuras(THREE, group, 'classic');
        this.buildElementalSpirits(THREE, group, 'classic');
        if (dragonGltf) {
          this.buildSkyDragon(THREE, group, dragonGltf, {
            mode: 'classic',
            scale: 0.72,
            center: [0, 18.8, -3.0],
            rx: 21.0,
            rz: 18.5,
            bobAmp: 1.9,
            speed: 0.22,
            phase: 1.8,
            scaleColor: '#2d6be6',
            membraneColor: '#4cf2ff',
            membraneEmit: '#38d8ff',
            eyeColor: '#fff288',
          });
        }
        this.classicGroup = group;
        this.dioramaRoot.add(group);
        this.syncActiveDioramaGroup();
        this.applySkyPhase(true);
      } finally {
        this.loadingClassic = false;
      }
    }
  }

  syncActiveDioramaGroup() {
    const isFactions = this.viewMode === 'factions';
    if (this.classicGroup) this.classicGroup.visible = !isFactions;
    if (this.factionsGroup) this.factionsGroup.visible = isFactions;
  }

  buildSkyDragon(THREE, parent, dragonGltf, cfg) {
    const pivot = new THREE.Group();
    const model = dragonGltf.scene.clone(true);
    model.rotation.y = Math.PI; // Blender +Y forward -> glTF -Z -> rotate PI so head points along +Z for lookAt()!
    model.scale.setScalar(cfg.scale);

    model.traverse((obj) => {
      if (!obj.isMesh) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      const next = mats.map((m) => {
        if (!m) return m;
        const c = m.clone();
        if (c.name === 'Mat_Dragon_Scales') {
          c.color.set(cfg.scaleColor);
        } else if (c.name === 'Mat_Dragon_WingMembrane') {
          c.color.set(cfg.membraneColor);
          c.emissive.set(cfg.membraneEmit);
          c.emissiveIntensity = 0.65;
          c.side = THREE.DoubleSide;
          this.emissiveMats.push({ mat: c, base: 0.65 });
        } else if (c.name === 'Mat_Dragon_EyeGlow') {
          c.color.set(cfg.eyeColor);
          c.emissive.set(cfg.eyeColor);
          c.emissiveIntensity = 2.4;
          this.emissiveMats.push({ mat: c, base: 2.4 });
        }
        return c;
      });
      obj.material = Array.isArray(obj.material) ? next : next[0];
    });

    const wingL = model.getObjectByName('Dragon_Wing_L');
    const wingR = model.getObjectByName('Dragon_Wing_R');
    // Subtle glowing aura halo around the soaring dragon
    const auraMat = new THREE.SpriteMaterial({
      map: this.dotTex,
      color: cfg.membraneEmit,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const aura = new THREE.Sprite(auraMat);
    aura.scale.set(6.5, 6.5, 1);
    pivot.add(model, aura);
    parent.add(pivot);
    this.animatedDragons.push({ pivot, model, wingL, wingR, cfg, nextPos: new THREE.Vector3() });
  }

  buildElementalSpirits(THREE, parent, mode) {
    // 4属性の精霊（火・水・風・土）：輝くクリスタル核＋2重魔法陣リング＋オーラ＋軌跡パーティクル
    const specs = mode === 'classic'
      ? [
          { name: 'water', color: '#4cf2ff', core: '#e4ffff', cx: 0.0, cy: 4.8, cz: 5.8, rx: 4.4, rz: 4.4, speed: 0.72, phase: 0.0, bob: 0.75 },
          { name: 'fire',  color: '#ff7b3b', core: '#fff1b8', cx: 8.5, cy: 7.4, cz: -2.0, rx: 5.2, rz: 4.6, speed: 0.62, phase: 1.6, bob: 0.95 },
          { name: 'wind',  color: '#6effb8', core: '#eafff4', cx: -11.5, cy: 8.6, cz: -2.2, rx: 4.8, rz: 4.2, speed: 0.85, phase: 3.1, bob: 1.05 },
          { name: 'earth', color: '#ffd86b', core: '#fff8d6', cx: 0.0, cy: 11.8, cz: -9.0, rx: 6.4, rz: 5.4, speed: 0.48, phase: 4.7, bob: 0.85 },
        ]
      : [
          { name: 'water', color: '#4cf2ff', core: '#e4ffff', cx: 0.0, cy: 9.2, cz: -18.5, rx: 5.6, rz: 5.2, speed: 0.64, phase: 0.2, bob: 0.9 },
          { name: 'wind',  color: '#6effb8', core: '#eafff4', cx: -19.5, cy: 9.8, cz: 0.0, rx: 5.8, rz: 5.4, speed: 0.78, phase: 1.8, bob: 1.0 },
          { name: 'earth', color: '#c978ff', core: '#f6e4ff', cx: 19.5, cy: 11.2, cz: 0.0, rx: 5.2, rz: 5.2, speed: 0.56, phase: 3.3, bob: 0.85 },
          { name: 'fire',  color: '#ff7b3b', core: '#fff1b8', cx: 0.0, cy: 8.6, cz: 19.0, rx: 5.8, rz: 5.2, speed: 0.70, phase: 4.9, bob: 0.95 },
        ];

    const coreGeo = new THREE.OctahedronGeometry(0.42, 0);
    const ringGeoA = new THREE.TorusGeometry(0.76, 0.045, 8, 28);
    const ringGeoB = new THREE.TorusGeometry(1.02, 0.032, 8, 28);

    for (const s of specs) {
      const group = new THREE.Group();
      const coreMesh = new THREE.Mesh(
        coreGeo,
        new THREE.MeshBasicMaterial({ color: s.core }),
      );
      const ringA = new THREE.Mesh(
        ringGeoA,
        new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      const ringB = new THREE.Mesh(
        ringGeoB,
        new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      ringA.rotation.x = Math.PI * 0.35;
      ringB.rotation.y = Math.PI * 0.42;

      const auraSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.dotTex,
          color: s.color,
          transparent: true,
          opacity: 0.72,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      auraSprite.scale.set(3.4, 3.4, 1);
      group.add(coreMesh, ringA, ringB, auraSprite);
      parent.add(group);

      // 10粒のきらめく軌跡パーティクル
      const trailCount = 10;
      const trailPos = new Float32Array(trailCount * 3);
      const trailGeo = new THREE.BufferGeometry();
      trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
      const trailPts = new THREE.Points(
        trailGeo,
        new THREE.PointsMaterial({
          size: 0.88,
          map: this.dotTex,
          color: s.color,
          transparent: true,
          opacity: 0.72,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      parent.add(trailPts);

      this.animatedSpirits.push({ group, coreMesh, ringA, ringB, auraSprite, trailGeo, trailCount, spec: s });
    }
  }

  buildWaterfallMistParticles(THREE, parent) {
    // 4本の滝の下端（斜め45°/135°/225°/315°）から宇宙へ舞い散る霧の粒
    const count = 84;
    const pos = new Float32Array(count * 3);
    this.wfMistData = new Float32Array(count * 4); // x0, y0, z0, phase
    const diagAngles = [45, 135, 225, 315];
    let idx = 0;
    for (const deg of diagAngles) {
      const a = (deg * Math.PI) / 180;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      for (let k = 0; k < 21; k++) {
        const spread = ((k % 7) - 3) * 0.72;
        const rad = 28.4 + ((k * 13) % 5) * 0.35;
        // Three.js Y-up: x = x_bl, y = z_bl, z = -y_bl
        const x = ca * rad - sa * spread;
        const z = -(sa * rad + ca * spread);
        const y = -15.8 + ((k * 7) % 5) * 0.45;
        pos[idx * 3] = x;
        pos[idx * 3 + 1] = y;
        pos[idx * 3 + 2] = z;
        this.wfMistData[idx * 4] = x;
        this.wfMistData[idx * 4 + 1] = y;
        this.wfMistData[idx * 4 + 2] = z;
        this.wfMistData[idx * 4 + 3] = (k / 21) * Math.PI * 2 + deg;
        idx++;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.wfMistGeo = geo;
    this.wfMistMat = new THREE.PointsMaterial({
      size: 2.4,
      map: this.dotTex,
      color: '#bfe8ff',
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    parent.add(new THREE.Points(geo, this.wfMistMat));
  }

  buildBloomAuras(THREE, parent, mode = 'factions') {
    // 軽量ビルボード加算グロー（城の灯り＋街灯の暖かい光輪を60fps負荷ほぼゼロで再現！）
    const auraSpecs = mode === 'classic'
      ? [
          // 王国城トップ・正門・城下町広場＆街灯の暖かい光輪
          { pos: [0.0, 17.5, -9.2], color: '#ffe6a8', scale: 5.5, opacity: 0.34, kind: 'warm', phase: 0.2 },
          { pos: [0.0, 6.2, -3.5], color: '#ffd584', scale: 4.2, opacity: 0.30, kind: 'warm', phase: 1.1 },
          { pos: [-2.4, 5.4, -1.9], color: '#ffc96e', scale: 2.5, opacity: 0.42, kind: 'warm', phase: 0.4 },
          { pos: [2.4, 5.4, -1.9], color: '#ffc96e', scale: 2.5, opacity: 0.42, kind: 'warm', phase: 1.5 },
          { pos: [-2.5, 2.2, 1.9], color: '#ffc96e', scale: 2.6, opacity: 0.45, kind: 'warm', phase: 2.2 },
          { pos: [2.5, 2.2, 1.9], color: '#ffc96e', scale: 2.6, opacity: 0.45, kind: 'warm', phase: 3.1 },
          { pos: [-5.3, 2.2, 4.4], color: '#ffc96e', scale: 2.5, opacity: 0.42, kind: 'warm', phase: 0.9 },
          { pos: [5.3, 2.2, 4.4], color: '#ffc96e', scale: 2.5, opacity: 0.42, kind: 'warm', phase: 2.0 },
          { pos: [-5.4, 2.2, 7.2], color: '#ffc96e', scale: 2.5, opacity: 0.42, kind: 'warm', phase: 2.8 },
          { pos: [5.4, 2.2, 7.2], color: '#ffc96e', scale: 2.5, opacity: 0.42, kind: 'warm', phase: 3.9 },
          { pos: [-2.5, 2.2, 10.9], color: '#ffc96e', scale: 2.4, opacity: 0.40, kind: 'warm', phase: 1.4 },
          { pos: [2.5, 2.2, 10.9], color: '#ffc96e', scale: 2.4, opacity: 0.40, kind: 'warm', phase: 4.2 },
          { pos: [-3.5, 2.3, 17.6], color: '#ffc96e', scale: 2.6, opacity: 0.44, kind: 'warm', phase: 0.6 },
          { pos: [3.5, 2.3, 17.6], color: '#ffc96e', scale: 2.6, opacity: 0.44, kind: 'warm', phase: 2.6 },
          { pos: [13.4, 4.8, -4.6], color: '#ffe090', scale: 3.8, opacity: 0.36, kind: 'warm', phase: 1.7 },
          { pos: [0.0, 2.5, 5.8], color: '#78eeff', scale: 3.6, opacity: 0.32, kind: 'crystal', phase: 0.5 },
        ]
      : [
          // 魔族軍（東 +X）：大紫水晶コア＋門前ジオード＋紫街灯
          { pos: [20.6, 11.4, 0.0], color: '#d872ff', scale: 9.2, opacity: 0.46, kind: 'crystal', phase: 0.0 },
          { pos: [16.2, 2.3, -3.5], color: '#c45cff', scale: 4.4, opacity: 0.38, kind: 'crystal', phase: 1.4 },
          { pos: [16.2, 2.3, 3.5], color: '#c45cff', scale: 4.4, opacity: 0.38, kind: 'crystal', phase: 2.7 },
          // 竜族帝国（南 +Z）：屋上4隅の篝火＋溶鉱炉ゲート＋炎街灯
          { pos: [-4.2, 8.1, 17.6], color: '#ff8a38', scale: 5.2, opacity: 0.46, kind: 'flame', phase: 0.3 },
          { pos: [4.2, 8.1, 17.6], color: '#ff8a38', scale: 5.2, opacity: 0.46, kind: 'flame', phase: 1.9 },
          { pos: [-4.2, 8.0, 23.4], color: '#ff7a2e', scale: 4.8, opacity: 0.40, kind: 'flame', phase: 3.1 },
          { pos: [4.2, 8.0, 23.4], color: '#ff7a2e', scale: 4.8, opacity: 0.40, kind: 'flame', phase: 4.5 },
          { pos: [0.0, 2.5, 16.5], color: '#ff9642', scale: 5.6, opacity: 0.42, kind: 'flame', phase: 0.8 },
          // 王国（北 -Z）：金色尖塔トップ＋正門街灯
          { pos: [0.0, 14.2, -20.6], color: '#ffe09c', scale: 4.8, opacity: 0.30, kind: 'warm', phase: 0.5 },
          { pos: [-3.1, 2.4, -15.4], color: '#ffc96e', scale: 2.6, opacity: 0.40, kind: 'warm', phase: 1.3 },
          { pos: [3.1, 2.4, -15.4], color: '#ffc96e', scale: 2.6, opacity: 0.40, kind: 'warm', phase: 2.4 },
          // 森の同盟（西 -X）：聖域の暖炉門＋翠街灯
          { pos: [-16.2, 2.1, 0.0], color: '#ffcf74', scale: 4.4, opacity: 0.30, kind: 'warm', phase: 1.1 },
          { pos: [-15.4, 2.3, -3.1], color: '#8effb8', scale: 2.6, opacity: 0.38, kind: 'crystal', phase: 2.2 },
          { pos: [-15.4, 2.3, 3.1], color: '#8effb8', scale: 2.6, opacity: 0.38, kind: 'crystal', phase: 3.5 },
          // 中央広場リング街灯（4隅）
          { pos: [5.4, 2.2, 5.4], color: '#ffd07a', scale: 2.4, opacity: 0.38, kind: 'warm', phase: 0.7 },
          { pos: [-5.4, 2.2, 5.4], color: '#ffd07a', scale: 2.4, opacity: 0.38, kind: 'warm', phase: 1.8 },
          { pos: [5.4, 2.2, -5.4], color: '#ffd07a', scale: 2.4, opacity: 0.38, kind: 'warm', phase: 2.9 },
          { pos: [-5.4, 2.2, -5.4], color: '#ffd07a', scale: 2.4, opacity: 0.38, kind: 'warm', phase: 4.1 },
        ];
    for (const s of auraSpecs) {
      const mat = new THREE.SpriteMaterial({
        map: this.dotTex,
        color: s.color,
        transparent: true,
        opacity: s.opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const sp = new THREE.Sprite(mat);
      sp.position.set(...s.pos);
      sp.scale.set(s.scale, s.scale, 1);
      parent.add(sp);
      this.bloomAuras.push({ sprite: sp, mat, baseScale: s.scale, baseOpacity: s.opacity, kind: s.kind, phase: s.phase });
    }
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
        uTime: { value: 0.0 },
      },
    });
    this.skyMat = mat;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = -10;
    scene.add(mesh);
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
    this.planetMat = planetMat;
    this.ringMat = ringMat;
    scene.add(planetGroup);

    const dustCount = 180;
    const dustPos = new Float32Array(dustCount * 3);
    this.dustBase = new Float32Array(dustCount * 4);
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
    scene.add(new THREE.Points(dustGeo, this.dustMat));

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
    this.hemiLight = new THREE.HemisphereLight('#5874ad', '#0d1326', 0.56);
    scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight('#a6c2f5', 1.25);
    this.keyLight.position.set(-40, 60, -60);
    scene.add(this.keyLight);

    this.rimLight = new THREE.DirectionalLight('#5c7fd6', 0.76);
    this.rimLight.position.set(55, 36, 52);
    scene.add(this.rimLight);

    this.underLight = new THREE.DirectionalLight('#36508a', 0.42);
    this.underLight.position.set(12, -75, 24);
    scene.add(this.underLight);

    const pointSpecs = [
      { pos: [0, 4.8, 0], color: '#ffd894', intensity: 16, distance: 26 },
      { pos: [0, 6.2, -16.0], color: '#ffe0a8', intensity: 18, distance: 22 },
      { pos: [-16.0, 4.5, 0], color: '#a8ff90', intensity: 15, distance: 20 },
      { pos: [20.6, 11.0, 0], color: '#c464ff', intensity: 28, distance: 26 },
      { pos: [0, 4.8, 17.0], color: '#ff7030', intensity: 24, distance: 24 },
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
    const phaseChanged = this.currentPhase?.key !== p.key;
    this.currentPhase = p;
    if (this.homeEl) this.homeEl.dataset.skyPhase = p.key;

    this.backdrop2D?.setPhase(p);
    if (!this.use3D && (force || phaseChanged)) {
      this.updatePrerenderImage(force);
    }

    if (!this.skyMat || !this.THREE) {
      if (this.visible && isReducedMotion()) this.backdrop2D?.draw(0, true);
      return;
    }

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

    for (const sm of this.starMats ?? []) sm.opacity = Math.max(0.18, p.starVisibility * 0.92);
    this.dustMat.color.set(p.dustColor);
    this.dustMat.opacity = p.dustOpacity;
    this.planetMat.opacity = p.planetAlpha;
    this.ringMat.opacity = p.planetAlpha * 0.34;

    for (const wm of this.waterMats) {
      wm.uniforms.uDeep.value.set(p.waterDeep);
      wm.uniforms.uShallow.value.set(p.waterShallow);
      wm.uniforms.uGlint.value.set(p.waterGlint);
    }
    if (this.wfMistMat) this.wfMistMat.color.set(p.waterGlint);

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

    for (const item of this.factionLights) item.light.intensity = item.base * p.pointScale;
    for (const item of this.emissiveMats) item.mat.emissiveIntensity = item.base * p.emissiveScale;
    if (this.renderer) this.renderer.toneMappingExposure = p.exposure;
    if (this.visible && this.use3D && isReducedMotion()) this.renderOnce3D();
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

    if (this.heroEl) {
      this.onPointerDown = (e) => {
        if (!this.use3D || e.target.closest('button')) return;
        this.dragging = true;
        this.lastPointerX = e.clientX;
        this.lastPointerY = e.clientY;
        this.heroEl.setPointerCapture?.(e.pointerId);
      };
      this.onPointerMove = (e) => {
        if (!this.dragging || !this.use3D) return;
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
    this.backdrop2D?.resize();
    if (!this.renderer || !this.camera || !this.skyEl) return;
    const rect = this.skyEl.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width || window.innerWidth));
    const h = Math.max(1, Math.round(rect.height || window.innerHeight));
    this.viewW = w;
    this.viewH = h;
    this.renderer.setSize(w, h, false);

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

    if (this.activeTab === 'battle' && this.heroEl) {
      const hr = this.heroEl.getBoundingClientRect();
      if (hr.width > 40 && hr.height > 40) {
        const cx = hr.left - rect.left + hr.width * 0.5;
        const cy = hr.top - rect.top + hr.height * 0.5;
        this.heroW = hr.width;
        this.heroH = hr.height;
        this.camera.setViewOffset(w, h, w * 0.5 - cx, h * 0.5 - cy, w, h);
      } else {
        this.camera.clearViewOffset();
      }
    } else {
      this.camera.clearViewOffset();
    }
    this.camera.updateProjectionMatrix();
    if (this.visible && this.use3D && this.ready3D) this.renderOnce3D();
  }

  setVisible(on) {
    this.visible = Boolean(on);
    if (this.disabled) return;
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
    if (this.dioramaRoot) this.dioramaRoot.visible = (tab === 'battle');
    this.resize();
  }

  setViewMode(mode) {
    const next = mode === 'factions' ? 'factions' : 'overview';
    if (this.viewMode === next) return;
    this.viewMode = next;
    this.dragYawDeg = 0;
    this.dragPitchDeg = 0;
    this.updatePrerenderImage(true);
    if (this.use3D && this.ready3D) {
      this.syncActiveDioramaGroup();
      this.ensureDioramaLoaded(next).catch((err) => {
        console.warn('[HomeDioramaGL] ジオラマ切替ロードに失敗:', err?.message ?? err);
      });
    }
    this.resize();
  }

  setFaction(faction) {
    if (FACTION_ANGLE_DEG[faction] === undefined) return;
    this.faction = faction;
    this.targetOrbitDeg = FACTION_ANGLE_DEG[faction];
    this.dragYawDeg = 0;
    this.updatePrerenderImage(true);
    if (this.visible && this.use3D && this.ready3D && isReducedMotion()) {
      this.orbitAngleDeg = this.targetOrbitDeg;
      this.currentTargetY = FACTION_TARGET_Y[faction];
      this.renderOnce3D();
    }
  }

  setSkyMode(mode) {
    const next = HOME_SKY_MODES.includes(mode) ? mode : 'auto';
    this.skyMode = next;
    this.applySkyPhase(true);
    if (this.visible && this.use3D && this.ready3D) this.renderOnce3D();
  }

  set3DEnabled(enabled) {
    if (this.disabled) return;
    const next = Boolean(enabled);
    if (this.use3D === next) return;
    this.use3D = next;
    if (next) this.failed3D = false;
    this.applyRenderMode();
  }

  startLoop() {
    if (this.rafId || this.destroyed || this.disabled) return;
    this.lastFrameTs = performance.now();
    const tick = (ts) => {
      if (!this.visible || this.destroyed) {
        this.rafId = 0;
        return;
      }
      const dt = Math.min(0.05, Math.max(0.001, (ts - this.lastFrameTs) / 1000));
      this.lastFrameTs = ts;
      const reduced = isReducedMotion();
      if (this.skyMode === 'auto') this.applySkyPhase(false);

      if (this.use3D && this.ready3D && this.renderer) {
        this.update3D(dt, reduced);
        this.renderer.render(this.scene, this.camera);
      } else {
        this.backdrop2D?.draw(dt, reduced);
      }
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

  renderOnce3D() {
    if (!this.renderer || !this.scene || !this.camera) return;
    this.updateCamera(0.016, true);
    this.renderer.render(this.scene, this.camera);
  }

  update3D(dt, reduced) {
    if (!reduced) this.elapsed += dt;
    if (this.skyMat) this.skyMat.uniforms.uTime.value = this.elapsed;

    // 動く水面＆4本の滝シェーダーの時間を進める！
    for (const wm of this.waterMats) {
      wm.uniforms.uTime.value = this.elapsed;
    }

    // ビルボード擬似Bloomオーラ＆陣営ライトの「生きている炎・魔力・ランタンのゆらぎ」
    const pScale = this.currentPhase?.pointScale ?? 1.0;
    const auraMult = Math.max(0.45, Math.min(1.45, (this.currentPhase?.emissiveScale ?? 1.2) * 0.68));
    for (const a of this.bloomAuras) {
      if (reduced) {
        a.mat.opacity = a.baseOpacity * auraMult;
        a.sprite.scale.set(a.baseScale, a.baseScale, 1);
        continue;
      }
      let pulse = 1.0;
      if (a.kind === 'flame') {
        pulse = 0.88 + 0.14 * Math.sin(this.elapsed * 6.8 + a.phase) + 0.08 * Math.sin(this.elapsed * 13.4 + a.phase * 2.1);
      } else if (a.kind === 'crystal') {
        pulse = 0.90 + 0.14 * Math.sin(this.elapsed * 2.2 + a.phase);
      } else {
        pulse = 0.94 + 0.07 * Math.sin(this.elapsed * 3.1 + a.phase);
      }
      a.mat.opacity = a.baseOpacity * auraMult * pulse;
      const sc = a.baseScale * (0.94 + 0.09 * pulse);
      a.sprite.scale.set(sc, sc, 1);
    }
    if (!reduced && this.factionLights.length >= 5) {
      // [3]=Demon crystal pulse, [4]=Dragon fire flicker
      this.factionLights[3].light.intensity = this.factionLights[3].base * pScale * (0.92 + 0.12 * Math.sin(this.elapsed * 2.4));
      this.factionLights[4].light.intensity = this.factionLights[4].base * pScale * (0.90 + 0.12 * Math.sin(this.elapsed * 7.2) + 0.06 * Math.cos(this.elapsed * 14.1));
    }

    // 滝壺ミスト粒のふわふわ舞い散りアニメ
    if (this.wfMistGeo && !reduced) {
      const attr = this.wfMistGeo.getAttribute('position');
      const arr = attr.array;
      const d = this.wfMistData;
      const t = this.elapsed;
      for (let i = 0; i < arr.length / 3; i++) {
        const ph = d[i * 4 + 3];
        const cycle = ((t * 0.55 + ph) % 1 + 1) % 1;
        arr[i * 3] = d[i * 4] + Math.sin(t * 1.1 + ph) * 0.7;
        arr[i * 3 + 1] = d[i * 4 + 1] - cycle * 2.4 + Math.sin(cycle * Math.PI) * 1.1;
        arr[i * 3 + 2] = d[i * 4 + 2] + Math.cos(t * 0.9 + ph) * 0.7;
      }
      attr.needsUpdate = true;
    }

    // 風車の羽根のゆるやかな回転（通常モード：王国＋城下町）
    if (this.windmillBlades && !reduced) {
      this.windmillBlades.rotation.z -= dt * 0.58;
    }

    // 空を舞うドラゴン（羽ばたき＋滑らかな周回飛行＆バンク角）
    for (const d of this.animatedDragons) {
      const c = d.cfg;
      const t = reduced ? 0.8 : this.elapsed;
      const ang = t * c.speed + c.phase;
      const x = c.center[0] + Math.cos(ang) * c.rx;
      const z = c.center[2] + Math.sin(ang) * c.rz;
      const y = c.center[1] + Math.sin(ang * 2.0 + 0.5) * c.bobAmp;
      d.pivot.position.set(x, y, z);

      const ang2 = ang + 0.04;
      d.nextPos.set(
        c.center[0] + Math.cos(ang2) * c.rx,
        c.center[1] + Math.sin(ang2 * 2.0 + 0.5) * c.bobAmp,
        c.center[2] + Math.sin(ang2) * c.rz,
      );
      d.pivot.lookAt(d.nextPos);
      // 旋回内側への自然なロール傾き
      d.model.rotation.z = reduced ? 0 : 0.24 + Math.sin(t * 1.4 + c.phase) * 0.06;

      // 羽ばたきモーション（力強く羽ばたき、時おり優雅に滑空）
      const flapCycle = Math.sin(t * 3.6 + c.phase * 2.0);
      const flapAngle = reduced ? 0.14 : flapCycle * 0.42 + 0.06;
      if (d.wingL) d.wingL.rotation.z = flapAngle;
      if (d.wingR) d.wingR.rotation.z = -flapAngle;
    }

    // 4属性の精霊（周回浮遊＋2重魔法陣リング回転＋軌跡パーティクル）
    for (const sp of this.animatedSpirits) {
      const s = sp.spec;
      const t = reduced ? 0.5 : this.elapsed;
      const a = t * s.speed + s.phase;
      const sx = s.cx + Math.cos(a) * s.rx;
      const sz = s.cz + Math.sin(a) * s.rz;
      const sy = s.cy + Math.sin(t * 1.7 + s.phase) * s.bob;
      sp.group.position.set(sx, sy, sz);
      if (!reduced) {
        sp.coreMesh.rotation.y = t * 1.6 + s.phase;
        sp.ringA.rotation.z = t * 2.2;
        sp.ringB.rotation.x = -t * 1.8;
        const pulse = 0.88 + 0.18 * Math.sin(t * 3.4 + s.phase);
        sp.auraSprite.scale.set(3.4 * pulse, 3.4 * pulse, 1);
      }
      const attr = sp.trailGeo.getAttribute('position');
      const arr = attr.array;
      for (let i = 0; i < sp.trailCount; i++) {
        const lag = (i + 1) * 0.16;
        const ta = (t - lag) * s.speed + s.phase;
        arr[i * 3] = s.cx + Math.cos(ta) * s.rx;
        arr[i * 3 + 1] = s.cy + Math.sin((t - lag) * 1.7 + s.phase) * s.bob;
        arr[i * 3 + 2] = s.cz + Math.sin(ta) * s.rz;
      }
      attr.needsUpdate = true;
    }

    if (this.dioramaRoot) {
      this.dioramaRoot.position.y = reduced ? 0 : Math.sin(this.elapsed * 0.65) * 0.36;
    }
    if (this.starField && !reduced) {
      this.starField.rotation.y = this.elapsed * 0.004;
    }
    if (this.dustGeo && !reduced) {
      const attr = this.dustGeo.getAttribute('position');
      const arr = attr.array;
      const base = this.dustBase;
      const t = this.elapsed;
      for (let i = 0; i < arr.length / 3; i++) {
        const ph = base[i * 4 + 3];
        arr[i * 3] = base[i * 4] + Math.sin(t * 0.35 + ph) * 0.9;
        arr[i * 3 + 1] = base[i * 4 + 1] + Math.sin(t * 0.55 + ph * 1.7) * 1.1;
        arr[i * 3 + 2] = base[i * 4 + 2] + Math.cos(t * 0.32 + ph) * 0.9;
      }
      attr.needsUpdate = true;
    }

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
      const diff = shortestAngleDiff(this.orbitAngleDeg, this.targetOrbitDeg);
      this.orbitAngleDeg += diff * damp;
      if (!this.dragging) {
        this.dragYawDeg *= Math.exp(-4.5 * dt);
        this.dragPitchDeg *= Math.exp(-4.5 * dt);
      }
      const wantY = FACTION_TARGET_Y[this.faction] ?? 5.25;
      this.currentTargetY += (wantY - this.currentTargetY) * damp;

      const ang = ((this.orbitAngleDeg + this.dragYawDeg) * Math.PI) / 180;
      const dx = Math.cos(ang);
      const dz = -Math.sin(ang);
      const px = Math.sin(ang);
      const pz = Math.cos(ang);

      const rBack = 11.4;
      const rSide = 2.6;
      const camY = 8.4 + this.dragPitchDeg * 0.35;
      const targetDist = 16.0;
      const heroFrac = (this.heroH && this.viewH) ? (this.heroH / this.viewH) : 0.45;
      const pull = heroFrac < 0.48 ? (0.48 - heroFrac) * 18.0 : 0;

      this.camera.position.set(
        -dx * (rBack + pull) + px * rSide,
        camY + pull * 0.32,
        -dz * (rBack + pull) + pz * rSide,
      );
      this.camera.lookAt(dx * targetDist, this.currentTargetY + 0.55, dz * targetDist);
    } else {
      // 通常モード：王国＋城下町の浮遊島を迫力よく見せる3/4斜め俯瞰
      if (!this.dragging && !snap) this.overviewAngleDeg += dt * 1.65;
      const rad = (this.overviewAngleDeg * Math.PI) / 180;
      const heroFrac = (this.heroH && this.viewH) ? (this.heroH / this.viewH) : 0.42;
      const heroWFrac = (this.heroW && this.viewW) ? (this.heroW / this.viewW) : 0.85;
      const distByH = 44 / Math.max(0.24, heroFrac * 0.92);
      const distByW = 48 / Math.max(0.45, heroWFrac * 0.95);
      const dist = Math.max(70, Math.min(126, Math.max(distByH * 0.68, distByW * 0.78)));

      const pitchRad = ((24 + this.dragPitchDeg) * Math.PI) / 180;
      const horiz = dist * Math.cos(pitchRad);
      const camY = dist * Math.sin(pitchRad) + 1.5;

      this.camera.position.set(Math.sin(rad) * horiz, camY, Math.cos(rad) * horiz);
      this.camera.lookAt(0, -1.6, -0.5);
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
    this.backdrop2D?.destroy();
    this.prerenderWrap?.remove();
    this.dotTex?.dispose();
    this.renderer?.dispose();
    this.renderer?.domElement?.remove();
    this.homeEl?.classList.remove('has-3d-diorama', 'diorama-3d-ready');
  }
}
