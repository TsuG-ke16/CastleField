// 盤面全体（フィールド・踏み石・城・兵士・魔物・シールド・精霊・魔法＆戦闘エフェクト）を
// Blender 製 GLB モデルと three.js でリアルタイム 3D 描画する。
// - カメラシステム：戦闘3D（標準）・俯瞰・鑑賞（低角度）の3モード、滑らかな回転・ズーム・パン、
//   任意対象へのフォーカス、即時リセット、地面・モデル内部へのめり込み防止境界制御
// - 3D空間ピッキング：THREE.Raycaster による兵士・城・魔物・15マス踏み石の正確な3D選択
// - 3D→スクリーン座標射影：カメラ回転・ズーム・低角度でも HP/ATK/状態異常 UI と DOM 当たり判定がモデルに完全追従
// - 階層リグ＆プロシージャル3Dアニメーション：待機・進軍・騎乗ギャロップ・近接攻撃・詠唱・被弾・撃破退場・落城演出
// WebGL 不可時や ?field3d=2d / ?fx=lite 指定時は既存の 2D 表示へ安全にフォールバックする。

import { UI_CONFIG } from './config.js';

const STAGE_SLUGS = {
  meadow: 'meadow',
  lava: 'lava',
  ice: 'ice',
  ruins: 'ruins',
  darkForest: 'dark-forest',
  desert: 'desert',
};

const STAGE_LOOK = {
  meadow:     { bg: '#8fa816', sun: '#fff7dc', sunInt: 2.55, hemiSky: '#e2f4ff', hemiGnd: '#6b8718', hemiInt: 1.32 },
  lava:       { bg: '#533a3e', sun: '#ffd8b8', sunInt: 2.25, hemiSky: '#b58a8c', hemiGnd: '#4d322e', hemiInt: 1.35 },
  ice:        { bg: '#80c9ec', sun: '#f5fbff', sunInt: 2.35, hemiSky: '#e8f7ff', hemiGnd: '#4e9ad4', hemiInt: 1.30 },
  ruins:      { bg: '#ecb25f', sun: '#fff2d0', sunInt: 2.45, hemiSky: '#fff0cc', hemiGnd: '#ad7c42', hemiInt: 1.25 },
  darkForest: { bg: '#15644d', sun: '#c4f0df', sunInt: 1.95, hemiSky: '#529c8c', hemiGnd: '#164236', hemiInt: 1.25 },
  desert:     { bg: '#f6a139', sun: '#fff2ca', sunInt: 2.55, hemiSky: '#ffe8be', hemiGnd: '#c46f2c', hemiInt: 1.25 },
};

export const TEAM_COLORS = {
  blue:   { main: '#2f95ff', roof: '#2b88f5', cape: '#1d6fe0', plume: '#38a6ff', glow: '#5cc2ff' },
  orange: { main: '#ff7a24', roof: '#f26815', cape: '#d95314', plume: '#ff9438', glow: '#ffaa44' },
  green:  { main: '#32b85c', roof: '#2ea852', cape: '#1d823c', plume: '#4ad674', glow: '#66ee88' },
  purple: { main: '#9b52ff', roof: '#8c42f5', cape: '#6824c4', plume: '#b374ff', glow: '#c488ff' },
};

const ELEMENT_COLORS = {
  fire:  '#ff5a1f',
  water: '#38c8ff',
  wind:  '#48e898',
  earth: '#e8a838',
  light: '#ffe666',
  dark:  '#a844ff',
};

const EMISSIVE_NAMES = new Set([
  'Mat_Lava_Glow', 'Mat_DF_Lantern', 'Mat_DF_MushCap', 'Mat_DF_Crystal',
  'Mat_Ice_Crystal', 'Mat_Ruins_Crystal', 'Castle_Window', 'Castle_Arcane',
  'Castle_Gem', 'Stone_Rune', 'Unit_GlowBlue', 'Unit_GlowGold', 'Unit_GlowRed',
  'Mon_GolemCore', 'Mon_DemonEye',
]);

/** カメラモード定義 */
export const CAMERA_MODES = {
  battle: {
    id: 'battle',
    label: '戦闘3D',
    pitchDeg: 47,
    yawDeg: 0,
    distFactor: 1.0,
    lookY: 0.35,
    minPitchDeg: 18,
    maxPitchDeg: 78,
  },
  overhead: {
    id: 'overhead',
    label: '俯瞰',
    pitchDeg: 63,
    yawDeg: 0,
    distFactor: 0.96,
    lookY: 0.15,
    minPitchDeg: 22,
    maxPitchDeg: 80,
  },
  appreciation: {
    id: 'appreciation',
    label: '鑑賞',
    pitchDeg: 21,
    yawDeg: 19,
    distFactor: 0.68,
    lookY: 0.95,
    minPitchDeg: 12,
    maxPitchDeg: 75,
  },
};

export const CAM_BOUNDS = {
  minDist: 4.2,
  maxDist: 27.5,
  minPitch: (12 * Math.PI) / 180,
  maxPitch: (80 * Math.PI) / 180,
  maxLookX: 4.5,
  maxLookZ: 6.4,
  minLookY: 0.1,
  maxLookY: 3.5,
  maxCamX: 16.5,
  maxCamZ: 21.5,
  minCamY: 0.85,
  maxCamY: 30.0,
  castleRadius: 2.95,
  unitRadius: 1.10,
  monsterRadius: 1.30,
};

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
    if (UI_CONFIG?.reducedMotion) return true;
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  } catch {
    return Boolean(UI_CONFIG?.reducedMotion);
  }
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function lerpAngle(a, b, t) {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

const loadLibs = () => (libs ??= Promise.all([
  import('../vendor/three/three.module.min.js'),
  import('../vendor/three/GLTFLoader.js'),
]).then(([THREE, { GLTFLoader }]) => ({ THREE, GLTFLoader })));

function loadGlb(GLTFLoader, path) {
  if (!modelLoads.has(path)) {
    const url = typeof document !== 'undefined' ? new URL(path, document.baseURI).href : path;
    const p = new GLTFLoader()
      .loadAsync(url)
      .catch((err) => {
        modelLoads.delete(path);
        throw err;
      });
    modelLoads.set(path, p);
  }
  return modelLoads.get(path);
}

/** カード種類文字列から 3D 兵士アーキタイプを決める */
export function soldierModelKey(type = '') {
  const t = String(type).toLowerCase();
  if (/dragon|wyvern|drake|wyrm/.test(t)) return 'dragon';
  if (/hero|paladin|king|lord|champion|saint|valkyrie/.test(t)) return 'hero';
  if (/mage|wizard|sorcerer|archmage|sage|witch|druid|priest|shaman|necromancer|warlock/.test(t)) return 'mage';
  if (/archer|bow|sniper|ranger|elf|hunter|crossbow/.test(t)) return 'archer';
  if (/assassin|ninja|rogue|thief|shadow|imp/.test(t)) return 'assassin';
  if (/knight|cavalry|scout|rider|horse|lancer/.test(t)) return 'knight';
  if (/giant|heavy|golem|titan|ogre|troll|behemoth|guard|shield|tank|treant/.test(t)) return 'heavy';
  if (/spear|pike|halberd/.test(t)) return 'spearman';
  return 'infantry';
}

/** 魔物種類文字列から 3D 魔物モデルを決める */
export function monsterModelKey(type = '') {
  const t = String(type).toLowerCase();
  if (/dragon/.test(t)) return 'dragon';
  if (/golem|treant/.test(t)) return 'golem';
  if (/demon|vampire|bat/.test(t)) return 'demon';
  if (/mimic|ghost/.test(t)) return 'mimic';
  if (/goblin|skeleton/.test(t)) return 'goblin';
  return 'slime';
}

export function castleModelKey(type = '') {
  if (type === 'fortress' || type === 'tower' || type === 'barracks') return type;
  return 'standard';
}

export class FieldGL {
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
    this.GLTFLoader = null;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.raycaster = null;
    this.sun = null;
    this.hemi = null;
    this.fxLight = null;

    this.stageGroup = null;
    this.stoneGroup = null;
    this.entityGroup = null;
    this.fxGroup = null;

    this.swayNodes = [];
    this.smokeNodes = [];
    this.glowMats = [];

    // 3D Entities
    this.castleEntries = new Map();  // side ('me'|'opp') -> entry
    this.soldierEntries = new Map(); // soldierId -> entry
    this.monsterEntries = new Map(); // monsterId -> entry
    this.stoneMeshes = [];           // { mesh, ring, ringMat, hitMesh, lane, row, isMid }
    this.activeEffects = [];         // running 3D VFX & dying unit animations

    this.laneCount = 3;
    this.laneLength = 5;
    this.viewerId = 'p1';
    this.lastSync = null;

    // Camera System State
    this.cameraMode = 'battle';      // 'battle' | 'overhead' | 'appreciation'
    this.defaultDist = 17.8;
    this.defaultZShift = 1.25;
    this.camState = {
      yaw: 0,
      pitch: (47 * Math.PI) / 180,
      dist: 17.8,
      look: { x: 0, y: 0.35, z: 1.25 },
      targetYaw: 0,
      targetPitch: (47 * Math.PI) / 180,
      targetDist: 17.8,
      targetLook: { x: 0, y: 0.35, z: 1.25 },
      userCustomized: false,
      focusTarget: null,             // { kind, id, side, lane, row, label }
      focusIndex: -1,
      cinematic: null,               // { yaw, pitch, dist, look, age, dur, holdRatio }
    };

    this.shakeTime = 0;
    this.shakeAmp = 0;
    this.baseCamPos = { x: 0, y: 14, z: 13 };
    this.baseCamLook = { x: 0, y: 0.35, z: 1.25 };

    // Callbacks to Renderer
    this.onProjectOverlay = null;
    this.onCameraStateChange = null;

    // Performance & Adaptive Quality
    this.rafId = 0;
    this.startTime = performance.now();
    this.lastFrameTime = this.startTime;
    this.fpsFrames = 0;
    this.fpsWindowStart = this.startTime;
    this.currentFps = 60;
    this.currentFrameMs = 16.7;
    this.lastLoadMs = 0;
    this.qualityTier = 'high'; // 'high' | 'medium'
    this.lowFpsStreak = 0;

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
      this.raycaster = new THREE.Raycaster();

      const canvas = document.createElement('canvas');
      canvas.className = 'field-gl';
      canvas.setAttribute('aria-hidden', 'true');

      const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(34, 9 / 16, 0.4, 150);

      const hemi = new THREE.HemisphereLight('#ffffff', '#666666', 1.28);
      scene.add(hemi);

      const sun = new THREE.DirectionalLight('#fff6dd', 2.45);
      sun.position.set(10, 24, 12);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.camera.near = 2;
      sun.shadow.camera.far = 65;
      const d = 15;
      sun.shadow.camera.left = -d;
      sun.shadow.camera.right = d;
      sun.shadow.camera.top = d;
      sun.shadow.camera.bottom = -d;
      sun.shadow.bias = -0.0005;
      scene.add(sun);

      // Dynamic flash light for spells & impacts
      const fxLight = new THREE.PointLight('#ffaa44', 0, 18, 1.5);
      fxLight.position.set(0, 3, 0);
      scene.add(fxLight);

      this.stoneGroup = new THREE.Group();
      this.entityGroup = new THREE.Group();
      this.fxGroup = new THREE.Group();
      scene.add(this.stoneGroup);
      scene.add(this.entityGroup);
      scene.add(this.fxGroup);

      this.renderer = renderer;
      this.scene = scene;
      this.camera = camera;
      this.sun = sun;
      this.hemi = hemi;
      this.fxLight = fxLight;

      this.hostEl.prepend(canvas);
      window.addEventListener('resize', this._onResize);
      document.addEventListener('visibilitychange', this._onVisibility);
      this.resize({ snapCamera: true });
      return true;
    } catch {
      this.disabled = true;
      return false;
    }
  }

  /** レーン番号と行（0=相手城側, laneLength-1=自分城側）から 3D ワールド座標を返す */
  cellWorldPos(lane, row) {
    const lc = Math.max(1, this.laneCount);
    const ll = Math.max(2, this.laneLength);
    const x = lc === 1 ? 0 : ((lane + 0.5) / lc - 0.5) * 6.8;
    const t = clamp(row / (ll - 1), -0.35, 1.35);
    const z = -3.4 + t * 6.8;
    return { x, y: 0, z };
  }

  castleWorldPos(side) {
    return side === 'opp' ? { x: 0, y: 0, z: -5.55 } : { x: 0, y: 0, z: 5.85 };
  }

  // ===========================================================================
  // CAMERA SYSTEM (MODES, ORBIT, ZOOM, FOCUS, COLLISION & BOUNDARY CONTROL)
  // ===========================================================================

  getModeDefaults(modeId = this.cameraMode) {
    const def = CAMERA_MODES[modeId] ?? CAMERA_MODES.battle;
    const zShift = modeId === 'appreciation' ? 0.35 : this.defaultZShift;
    return {
      yaw: (def.yawDeg * Math.PI) / 180,
      pitch: (def.pitchDeg * Math.PI) / 180,
      dist: clamp(this.defaultDist * def.distFactor, CAM_BOUNDS.minDist, CAM_BOUNDS.maxDist),
      look: { x: 0, y: def.lookY, z: zShift },
    };
  }

  getCameraMode() {
    return this.cameraMode;
  }

  setCameraMode(modeId, { instant = false } = {}) {
    if (!CAMERA_MODES[modeId]) return;
    this.cameraMode = modeId;
    this.camState.focusTarget = null;
    this.camState.focusIndex = -1;
    this.camState.userCustomized = false;
    this.camState.cinematic = null;
    const d = this.getModeDefaults(modeId);
    this.camState.targetYaw = d.yaw;
    this.camState.targetPitch = d.pitch;
    this.camState.targetDist = d.dist;
    this.camState.targetLook = { ...d.look };
    if (instant || prefersReducedMotion()) {
      this.snapCameraToTarget();
    }
    if (this.appEl) this.appEl.dataset.camMode = modeId;
    this.notifyCameraState();
    this.maybeStartLoop();
    if (this.renderer && !this.hidden) this.renderFrame(performance.now());
  }

  resetCamera({ instant = false } = {}) {
    this.camState.focusTarget = null;
    this.camState.focusIndex = -1;
    this.camState.userCustomized = false;
    this.camState.cinematic = null;
    const d = this.getModeDefaults(this.cameraMode);
    this.camState.targetYaw = d.yaw;
    this.camState.targetPitch = d.pitch;
    this.camState.targetDist = d.dist;
    this.camState.targetLook = { ...d.look };
    if (instant || prefersReducedMotion()) {
      this.snapCameraToTarget();
    }
    this.notifyCameraState();
    this.maybeStartLoop();
    if (this.renderer && !this.hidden) this.renderFrame(performance.now());
  }

  snapCameraToTarget() {
    const cs = this.camState;
    cs.yaw = cs.targetYaw;
    cs.pitch = cs.targetPitch;
    cs.dist = cs.targetDist;
    cs.look.x = cs.targetLook.x;
    cs.look.y = cs.targetLook.y;
    cs.look.z = cs.targetLook.z;
    this.applyCameraTransform(0);
  }

  /** マウスドラッグ / タッチドラッグによる軌道回転 */
  orbitBy(deltaYawRad, deltaPitchRad) {
    const cs = this.camState;
    cs.cinematic = null;
    cs.userCustomized = true;
    const modeDef = CAMERA_MODES[this.cameraMode] ?? CAMERA_MODES.battle;
    const minP = (modeDef.minPitchDeg * Math.PI) / 180;
    const maxP = (modeDef.maxPitchDeg * Math.PI) / 180;
    cs.targetYaw += deltaYawRad;
    // Normalize targetYaw to [-PI, PI]
    cs.targetYaw = ((cs.targetYaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    cs.targetPitch = clamp(cs.targetPitch + deltaPitchRad, minP, maxP);
    this.notifyCameraState();
    this.maybeStartLoop();
  }

  /** ホイール / ピンチによるズーム */
  zoomBy(deltaFactor) {
    const cs = this.camState;
    cs.cinematic = null;
    cs.userCustomized = true;
    const minD = cs.focusTarget?.kind === 'castle' ? 5.8 : CAM_BOUNDS.minDist;
    cs.targetDist = clamp(cs.targetDist * deltaFactor, minD, CAM_BOUNDS.maxDist);
    this.notifyCameraState();
    this.maybeStartLoop();
  }

  /** 2本指ドラッグ / Shift+ドラッグによる視点移動（パン） */
  panBy(dxWorld, dzWorld) {
    const cs = this.camState;
    cs.cinematic = null;
    cs.focusTarget = null;
    cs.userCustomized = true;
    const cosY = Math.cos(cs.yaw);
    const sinY = Math.sin(cs.yaw);
    const wx = dxWorld * cosY + dzWorld * sinY;
    const wz = -dxWorld * sinY + dzWorld * cosY;
    cs.targetLook.x = clamp(cs.targetLook.x + wx, -CAM_BOUNDS.maxLookX, CAM_BOUNDS.maxLookX);
    cs.targetLook.z = clamp(cs.targetLook.z + wz, -CAM_BOUNDS.maxLookZ, CAM_BOUNDS.maxLookZ);
    this.notifyCameraState();
    this.maybeStartLoop();
  }

  /** 任意の対象（兵士・魔物・城・踏み石）へカメラをフォーカスする */
  focusOnTarget(spec, { instant = false } = {}) {
    if (!spec) {
      this.resetCamera({ instant });
      return false;
    }
    const cs = this.camState;
    cs.cinematic = null;
    cs.userCustomized = true;

    let pos = null;
    let dist = 7.4;
    let pitch = (25 * Math.PI) / 180;
    let yaw = cs.targetYaw;
    let label = '';

    if (spec.kind === 'soldier') {
      const entry = this.soldierEntries.get(spec.id || spec.soldierId);
      if (!entry) return false;
      pos = { x: entry.curPos.x, y: entry.curPos.y + 0.65, z: entry.curPos.z };
      dist = 6.8;
      pitch = (23 * Math.PI) / 180;
      yaw = entry.side === 'opp' ? -0.35 : 0.35;
      label = '兵士';
      cs.focusTarget = { kind: 'soldier', id: spec.id || spec.soldierId, label };
    } else if (spec.kind === 'monster') {
      const entry = this.monsterEntries.get(spec.id || spec.monsterId);
      if (!entry) return false;
      pos = { x: entry.targetPos.x, y: entry.targetPos.y + 0.85, z: entry.targetPos.z };
      dist = 7.6;
      pitch = (24 * Math.PI) / 180;
      yaw = 0.25;
      label = '魔物';
      cs.focusTarget = { kind: 'monster', id: spec.id || spec.monsterId, label };
    } else if (spec.kind === 'castle') {
      const side = spec.side || 'opp';
      const cPos = this.castleWorldPos(side);
      pos = { x: cPos.x, y: 1.75, z: cPos.z };
      dist = 9.2;
      pitch = (22 * Math.PI) / 180;
      // Look at the front or dramatic 3/4 of the castle
      yaw = side === 'opp' ? 0.22 : -0.28;
      label = side === 'me' ? '自軍の城' : '相手の城';
      cs.focusTarget = { kind: 'castle', side, label };
    } else if (spec.kind === 'stone' || spec.kind === 'cell') {
      const cPos = this.cellWorldPos(spec.lane ?? 1, spec.row ?? 2);
      pos = { x: cPos.x, y: 0.45, z: cPos.z };
      dist = 7.8;
      pitch = (28 * Math.PI) / 180;
      label = `道${(spec.lane ?? 0) + 1}`;
      cs.focusTarget = { kind: 'stone', lane: spec.lane ?? 1, row: spec.row ?? 2, label };
    } else {
      return false;
    }

    cs.targetLook = {
      x: clamp(pos.x, -CAM_BOUNDS.maxLookX, CAM_BOUNDS.maxLookX),
      y: clamp(pos.y, CAM_BOUNDS.minLookY, CAM_BOUNDS.maxLookY),
      z: clamp(pos.z, -CAM_BOUNDS.maxLookZ, CAM_BOUNDS.maxLookZ),
    };
    cs.targetDist = clamp(dist, CAM_BOUNDS.minDist, CAM_BOUNDS.maxDist);
    cs.targetPitch = clamp(pitch, CAM_BOUNDS.minPitch, CAM_BOUNDS.maxPitch);
    cs.targetYaw = yaw;

    if (instant || prefersReducedMotion()) {
      this.snapCameraToTarget();
    }
    this.notifyCameraState();
    this.maybeStartLoop();
    if (this.renderer && !this.hidden) this.renderFrame(performance.now());
    return true;
  }

  /** 盤面上の注目対象（兵士→魔物→相手城→自城→全体）を順番に切り替える */
  cycleFocusTarget() {
    const candidates = [];
    for (const [id] of this.soldierEntries) {
      candidates.push({ kind: 'soldier', id });
    }
    for (const [id] of this.monsterEntries) {
      candidates.push({ kind: 'monster', id });
    }
    candidates.push({ kind: 'castle', side: 'opp' });
    candidates.push({ kind: 'castle', side: 'me' });

    if (!candidates.length) {
      this.resetCamera();
      return null;
    }
    this.camState.focusIndex = (this.camState.focusIndex + 1) % (candidates.length + 1);
    if (this.camState.focusIndex === candidates.length) {
      this.resetCamera();
      return null;
    }
    const pick = candidates[this.camState.focusIndex];
    this.focusOnTarget(pick);
    return this.camState.focusTarget;
  }

  /** 地面や城・兵士モデルの内部へカメラが絶対に入り込まないよう座標を制約する */
  clampCameraWorldPosition(rawPos, lookPos) {
    let x = clamp(rawPos.x, -CAM_BOUNDS.maxCamX, CAM_BOUNDS.maxCamX);
    let y = clamp(rawPos.y, CAM_BOUNDS.minCamY, CAM_BOUNDS.maxCamY);
    let z = clamp(rawPos.z, -CAM_BOUNDS.maxCamZ, CAM_BOUNDS.maxCamZ);

    // 1. Ground & outer terrace bank height clearance
    const ax = Math.abs(x);
    const groundHeight = ax > 3.9 ? Math.min(1.42, (ax - 3.9) * 0.48) : 0.0;
    const minGroundClearY = groundHeight + CAM_BOUNDS.minCamY;
    if (y < minGroundClearY) y = minGroundClearY;

    // 2. Castle bounding spheres exclusion (me & opp castles at z = +-5.5)
    for (const side of ['me', 'opp']) {
      const c = this.castleWorldPos(side);
      const cy = 1.65;
      const dx = x - c.x;
      const dyUp = Math.max(0, y - cy);
      const dz = z - c.z;
      const d = Math.hypot(dx, dyUp, dz);
      const minR = CAM_BOUNDS.castleRadius;
      if (d < minR && d > 0.0001) {
        const push = minR / d;
        x = c.x + dx * push;
        y = Math.max(minGroundClearY, cy + dyUp * push);
        z = c.z + dz * push;
      } else if (d <= 0.0001) {
        z = c.z + (side === 'me' ? minR : -minR);
        y = cy + minR * 0.5;
      }
    }

    // 3. Soldier & Monster bounding spheres exclusion
    for (const s of this.soldierEntries.values()) {
      const sx = s.curPos.x;
      const sy = s.curPos.y + 0.7;
      const sz = s.curPos.z;
      const dx = x - sx;
      const dyUp = Math.max(0, y - sy);
      const dz = z - sz;
      const d = Math.hypot(dx, dyUp, dz);
      if (d < CAM_BOUNDS.unitRadius && d > 0.0001) {
        const push = CAM_BOUNDS.unitRadius / d;
        x = sx + dx * push;
        y = Math.max(minGroundClearY, sy + dyUp * push);
        z = sz + dz * push;
      }
    }
    for (const m of this.monsterEntries.values()) {
      const mx = m.targetPos.x;
      const my = m.targetPos.y + 0.85;
      const mz = m.targetPos.z;
      const dx = x - mx;
      const dyUp = Math.max(0, y - my);
      const dz = z - mz;
      const d = Math.hypot(dx, dyUp, dz);
      if (d < CAM_BOUNDS.monsterRadius && d > 0.0001) {
        const push = CAM_BOUNDS.monsterRadius / d;
        x = mx + dx * push;
        y = Math.max(minGroundClearY, my + dyUp * push);
        z = mz + dz * push;
      }
    }

    // Keep minimum distance from lookPos so lookAt never degenerates
    const ldx = x - lookPos.x;
    const ldy = y - lookPos.y;
    const ldz = z - lookPos.z;
    const ld = Math.hypot(ldx, ldy, ldz);
    if (ld < 2.2 && ld > 0.0001) {
      const s = 2.2 / ld;
      x = lookPos.x + ldx * s;
      y = Math.max(minGroundClearY, lookPos.y + ldy * s);
      z = lookPos.z + ldz * s;
    }

    return { x, y, z };
  }

  /** 毎フレームのカメラ補間・フォロー・シネマティック・シェイクの適用 */
  applyCameraTransform(dt) {
    if (!this.camera) return;
    const cs = this.camState;
    const reduced = prefersReducedMotion();

    // Update live focus target position if tracking a moving soldier or monster
    if (cs.focusTarget) {
      if (cs.focusTarget.kind === 'soldier') {
        const s = this.soldierEntries.get(cs.focusTarget.id);
        if (s) {
          cs.targetLook.x = clamp(s.curPos.x, -CAM_BOUNDS.maxLookX, CAM_BOUNDS.maxLookX);
          cs.targetLook.y = clamp(s.curPos.y + 0.65, CAM_BOUNDS.minLookY, CAM_BOUNDS.maxLookY);
          cs.targetLook.z = clamp(s.curPos.z, -CAM_BOUNDS.maxLookZ, CAM_BOUNDS.maxLookZ);
        } else {
          // Focused soldier was destroyed -> smoothly release focus back to mode default
          cs.focusTarget = null;
          const d = this.getModeDefaults(this.cameraMode);
          cs.targetLook = { ...d.look };
          cs.targetDist = d.dist;
          cs.targetPitch = d.pitch;
          cs.targetYaw = d.yaw;
          this.notifyCameraState();
        }
      } else if (cs.focusTarget.kind === 'monster') {
        const m = this.monsterEntries.get(cs.focusTarget.id);
        if (m) {
          cs.targetLook.x = clamp(m.targetPos.x, -CAM_BOUNDS.maxLookX, CAM_BOUNDS.maxLookX);
          cs.targetLook.y = clamp(m.targetPos.y + 0.85, CAM_BOUNDS.minLookY, CAM_BOUNDS.maxLookY);
          cs.targetLook.z = clamp(m.targetPos.z, -CAM_BOUNDS.maxLookZ, CAM_BOUNDS.maxLookZ);
        } else {
          cs.focusTarget = null;
          const d = this.getModeDefaults(this.cameraMode);
          cs.targetLook = { ...d.look };
          cs.targetDist = d.dist;
          cs.targetPitch = d.pitch;
          cs.targetYaw = d.yaw;
          this.notifyCameraState();
        }
      }
    }

    // Determine effective target (blending cinematic cue if active and not reduced motion)
    let effYaw = cs.targetYaw;
    let effPitch = cs.targetPitch;
    let effDist = cs.targetDist;
    let effLookX = cs.targetLook.x;
    let effLookY = cs.targetLook.y;
    let effLookZ = cs.targetLook.z;

    if (cs.cinematic && !reduced) {
      cs.cinematic.age += dt;
      const p = cs.cinematic.age / Math.max(0.05, cs.cinematic.dur);
      if (p >= 1) {
        cs.cinematic = null;
      } else {
        // Smooth envelope: ease-in -> hold -> ease-out back to base camera
        const holdEnd = cs.cinematic.holdRatio ?? 0.62;
        let w = 1;
        if (p < 0.22) {
          const k = p / 0.22;
          w = k * k * (3 - 2 * k);
        } else if (p > holdEnd) {
          const k = (p - holdEnd) / Math.max(0.05, 1 - holdEnd);
          w = 1 - k * k * (3 - 2 * k);
        }
        if (cs.cinematic.isIntro) {
          // Intro sweeps directly from start pose to target pose
          w = Math.pow(1 - p, 2.2);
        }
        effYaw = lerpAngle(effYaw, cs.cinematic.yaw, w);
        effPitch = effPitch + (cs.cinematic.pitch - effPitch) * w;
        effDist = effDist + (cs.cinematic.dist - effDist) * w;
        effLookX = effLookX + (cs.cinematic.look.x - effLookX) * w;
        effLookY = effLookY + (cs.cinematic.look.y - effLookY) * w;
        effLookZ = effLookZ + (cs.cinematic.look.z - effLookZ) * w;
      }
    } else if (cs.cinematic && reduced) {
      cs.cinematic = null;
    }

    const alpha = (dt <= 0 || reduced) ? 1.0 : Math.min(1.0, 1.0 - Math.exp(-dt * 11.5));
    cs.yaw = lerpAngle(cs.yaw, effYaw, alpha);
    cs.pitch += (effPitch - cs.pitch) * alpha;
    cs.dist += (effDist - cs.dist) * alpha;
    cs.look.x += (effLookX - cs.look.x) * alpha;
    cs.look.y += (effLookY - cs.look.y) * alpha;
    cs.look.z += (effLookZ - cs.look.z) * alpha;

    const horiz = Math.cos(cs.pitch) * cs.dist;
    const rawPos = {
      x: cs.look.x + Math.sin(cs.yaw) * horiz,
      y: cs.look.y + Math.sin(cs.pitch) * cs.dist,
      z: cs.look.z + Math.cos(cs.yaw) * horiz,
    };

    const clampedPos = this.clampCameraWorldPosition(rawPos, cs.look);
    this.baseCamPos = clampedPos;
    this.baseCamLook = { ...cs.look };

    // Apply trauma shake on top of clamped camera position
    let fx = clampedPos.x;
    let fy = clampedPos.y;
    let fz = clampedPos.z;
    if (this.shakeTime > 0 && !reduced) {
      this.shakeTime = Math.max(0, this.shakeTime - dt);
      const decay = this.shakeTime > 0 ? this.shakeAmp * Math.pow(this.shakeTime / 0.32, 1.3) : 0;
      fx += Math.sin(this.startTime + this.shakeTime * 75) * decay * 0.65;
      fy += Math.cos(this.startTime + this.shakeTime * 90) * decay * 0.45;
      fz += Math.sin(this.startTime + this.shakeTime * 60) * decay * 0.55;
      fy = Math.max(CAM_BOUNDS.minCamY, fy);
    }

    this.camera.position.set(fx, fy, fz);
    this.camera.lookAt(this.baseCamLook.x, this.baseCamLook.y, this.baseCamLook.z);
    this.camera.updateMatrixWorld();
  }

  /** 非ブロッキングのカメラ演出を発火する（戦闘開始・大魔法着弾・落城など） */
  playCinematicCue({ yaw, pitch, dist, look, dur = 0.78, holdRatio = 0.55, isIntro = false } = {}) {
    if (prefersReducedMotion() || UI_CONFIG?.speed === 0) return;
    // Do not override if player is actively focusing or in appreciation mode
    if (this.cameraMode === 'appreciation' && !isIntro) return;
    const cs = this.camState;
    cs.cinematic = {
      yaw: yaw ?? cs.targetYaw,
      pitch: clamp(pitch ?? cs.targetPitch, CAM_BOUNDS.minPitch, CAM_BOUNDS.maxPitch),
      dist: clamp(dist ?? cs.targetDist, CAM_BOUNDS.minDist, CAM_BOUNDS.maxDist),
      look: {
        x: clamp(look?.x ?? cs.targetLook.x, -CAM_BOUNDS.maxLookX, CAM_BOUNDS.maxLookX),
        y: clamp(look?.y ?? cs.targetLook.y, CAM_BOUNDS.minLookY, CAM_BOUNDS.maxLookY),
        z: clamp(look?.z ?? cs.targetLook.z, -CAM_BOUNDS.maxLookZ, CAM_BOUNDS.maxLookZ),
      },
      age: 0,
      dur: dur * Math.max(0.4, Math.min(1.5, UI_CONFIG?.speed ?? 1)),
      holdRatio,
      isIntro,
    };
    this.maybeStartLoop();
  }

  /** 戦闘開始時のカメラ移動演出（自城背後の低角度から戦場全体へ滑らかに俯瞰上昇） */
  playBattleIntro() {
    if (prefersReducedMotion() || UI_CONFIG?.speed === 0) return;
    this.playCinematicCue({
      yaw: 0.24,
      pitch: (22 * Math.PI) / 180,
      dist: 12.2,
      look: { x: 0, y: 1.0, z: 2.2 },
      dur: 1.15,
      isIntro: true,
    });
  }

  /** 演出スキップ時に3Dカメラ演出・シェイク・進行中のアクションを即時終了する */
  skipAnimations() {
    if (this.camState) {
      this.camState.cinematic = null;
    }
    this.shakeTime = 0;
    this.shakeAmp = 0;
    for (const s of this.soldierEntries.values()) {
      s.curPos.x = s.targetPos.x;
      s.curPos.y = s.targetPos.y;
      s.curPos.z = s.targetPos.z;
      s.action = null;
      s.hitFlash = 0;
    }
    for (const c of this.castleEntries.values()) {
      c.recoilTime = 0;
      c.hitFlash = 0;
      if (c.isCollapsed) c.collapseProgress = 1;
    }
  }

  notifyCameraState() {
    this.onCameraStateChange?.(this.getCameraState());
  }

  getCameraState() {
    const cs = this.camState;
    return {
      mode: this.cameraMode,
      yawDeg: Number(((cs.yaw * 180) / Math.PI).toFixed(1)),
      pitchDeg: Number(((cs.pitch * 180) / Math.PI).toFixed(1)),
      dist: Number(cs.dist.toFixed(2)),
      look: { ...cs.look },
      pos: { ...this.baseCamPos },
      userCustomized: cs.userCustomized,
      focusTarget: cs.focusTarget ? { ...cs.focusTarget } : null,
    };
  }

  // ===========================================================================
  // 3D RAYCASTING & 3D-TO-SCREEN COORDINATE PROJECTION
  // ===========================================================================

  /**
   * 3Dワールド座標を任意のDOMコンテナ矩形内のスクリーン座標 (px) に射影する
   * @param {{x:number, y:number, z:number}} worldPos
   * @param {{left:number, top:number, width:number, height:number}} [containerRect]
   */
  projectWorldToScreen(worldPos, containerRect = null) {
    if (!this.camera || !this.THREE) return null;
    const canvasRect = this.renderer?.domElement?.getBoundingClientRect?.()
      ?? containerRect
      ?? { left: 0, top: 0, width: 390, height: 844 };
    const targetRect = containerRect ?? canvasRect;

    const v = new this.THREE.Vector3(worldPos.x, worldPos.y, worldPos.z);
    const camDist = v.distanceTo(this.camera.position);
    v.project(this.camera);

    const screenX = canvasRect.left + (v.x * 0.5 + 0.5) * canvasRect.width;
    const screenY = canvasRect.top + (-v.y * 0.5 + 0.5) * canvasRect.height;
    const x = screenX - targetRect.left;
    const y = screenY - targetRect.top;
    const visible = v.z <= 1.0 && v.z >= -1.0;
    const scale = clamp(this.defaultDist / Math.max(3.5, camDist), 0.68, 1.48);

    return { x, y, screenX, screenY, ndcZ: v.z, camDist, scale, visible };
  }

  /**
   * スクリーン座標 (clientX, clientY) から THREE.Raycaster で 3D オブジェクトをピッキングする
   * @returns {{ hits: Array<object>, primary: object|null }}
   */
  pickAtScreen(clientX, clientY, canvasRectOverride = null) {
    if (!this.THREE || !this.camera || !this.raycaster || this.hidden || this.disabled) {
      return { hits: [], primary: null };
    }
    const rect = canvasRectOverride ?? this.renderer?.domElement?.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return { hits: [], primary: null };
    }
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
    return this.pickAtNDC(ndcX, ndcY);
  }

  /**
   * 正規化デバイス座標 (ndcX, ndcY in [-1, 1]) から 3D オブジェクトをピッキングする
   */
  pickAtNDC(ndcX, ndcY) {
    if (!this.THREE || !this.camera || !this.raycaster) {
      return { hits: [], primary: null };
    }
    this.camera.updateMatrixWorld();
    this.scene?.updateMatrixWorld();
    this.raycaster.setFromCamera(new this.THREE.Vector2(ndcX, ndcY), this.camera);

    const roots = [this.entityGroup, this.stoneGroup].filter(Boolean);
    const rawIntersects = this.raycaster.intersectObjects(roots, true);

    const hits = [];
    const seenKeys = new Set();

    for (const hit of rawIntersects) {
      let cur = hit.object;
      let info = null;
      while (cur) {
        if (cur.userData?.pickInfo) {
          info = cur.userData.pickInfo;
          break;
        }
        cur = cur.parent;
      }
      if (!info) continue;
      const key = `${info.kind}:${info.soldierId ?? info.monsterId ?? info.side ?? `${info.lane}_${info.row}`}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      hits.push({
        ...info,
        distance: hit.distance,
        point: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
      });
    }

    // Prioritize interactive units (soldier / monster) over castles/stones when overlapping along ray
    const priorityOrder = { soldier: 1, monster: 2, castle: 3, stone: 4 };
    const sorted = [...hits].sort((a, b) => {
      const pa = priorityOrder[a.kind] ?? 9;
      const pb = priorityOrder[b.kind] ?? 9;
      if (pa !== pb && (pa <= 2 || pb <= 2 || Math.abs(a.distance - b.distance) < 3.5)) return pa - pb;
      return a.distance - b.distance;
    });

    return {
      hits,
      primary: sorted[0] ?? null,
    };
  }

  // ===========================================================================
  // STAGE & ENTITY MANAGEMENT + HIERARCHICAL RIG BINDING
  // ===========================================================================

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
    const tLoad0 = performance.now();
    try {
      const gltf = await loadGlb(this.GLTFLoader, `assets/models/field-${slug}.glb`);
      if (seq !== this.loadSeq || this.disposed) return;
      this.mountFieldModel(gltf.scene, this.stageId);
      await this.rebuildStones();
      this.applyLighting();
      this.resize({ snapCamera: !this.camState.userCustomized });
      this.setVisible(!this.hidden);
      if (this.lastSync) this.syncBoard(this.lastSync);
      this.renderFrame(performance.now());
      this.lastLoadMs = Math.round(performance.now() - tLoad0);
      this.maybeStartLoop();
    } catch {
      if (seq === this.loadSeq) this.setVisible(false);
    }
  }

  setTime(timeOfDay) {
    this.timeOfDay = timeOfDay === 'night' ? 'night' : 'day';
    if (!this.renderer || !this.stageId) return;
    this.applyLighting();
    this.renderFrame(performance.now());
  }

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
      this.appEl.dataset.camMode = this.cameraMode;
    } else {
      delete this.appEl.dataset.stage3d;
      delete this.appEl.dataset.camMode;
      this.stopLoop();
    }
  }

  mountFieldModel(sourceScene, stageId) {
    if (this.stageGroup) this.scene.remove(this.stageGroup);
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
        this.swayNodes.push({ obj, baseRotZ: obj.rotation.z, phase: obj.position.x * 1.3 + obj.position.z * 0.7 });
      }
      if (/Smoke/i.test(obj.name)) {
        this.smokeNodes.push({ obj, baseY: obj.position.y, phase: obj.position.x * 0.9 });
      }

      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (!m || seenMats.has(m)) continue;
        seenMats.add(m);
        if (obj.geometry?.attributes?.color) m.vertexColors = true;
        if (EMISSIVE_NAMES.has(m.name) || (m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.05)) {
          this.glowMats.push({ mat: m, baseIntensity: m.emissiveIntensity ?? 1.0 });
        }
      }
    });

    this.stageGroup = group;
    this.scene.add(group);
    this.stageId = stageId;
  }

  async rebuildStones() {
    if (!this.THREE || !this.stoneGroup) return;
    const THREE = this.THREE;
    while (this.stoneGroup.children.length) this.stoneGroup.remove(this.stoneGroup.children[0]);
    this.stoneMeshes = [];

    let stoneProto = null;
    try {
      const gltf = await loadGlb(this.GLTFLoader, 'assets/models/field-stone.glb');
      stoneProto = gltf.scene;
    } catch {
      return;
    }

    const hitGeo = new THREE.CylinderGeometry(0.95, 0.95, 0.28, 12);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });

    const midRow = this.laneLength % 2 === 1 ? Math.floor(this.laneLength / 2) : -1;
    for (let lane = 0; lane < this.laneCount; lane++) {
      for (let row = 0; row < this.laneLength; row++) {
        const isMid = row === midRow;
        const pos = this.cellWorldPos(lane, row);
        const st = stoneProto.clone(true);
        const sc = isMid ? 1.24 : 0.88;
        st.scale.set(sc, sc, sc);
        st.position.set(pos.x, 0.01, pos.z);
        const pickInfo = { kind: 'stone', lane, row, isMid };
        st.userData.pickInfo = pickInfo;
        st.traverse((m) => {
          if (!m.isMesh) return;
          m.userData.pickInfo = pickInfo;
          m.receiveShadow = true;
          m.castShadow = false;
          if (m.material) {
            m.material = m.material.clone();
            if (m.geometry?.attributes?.color) m.material.vertexColors = true;
            if (m.material.name === 'Stone_Rune') {
              m.material.emissiveIntensity = isMid ? 1.35 : 0.15;
            }
          }
        });
        // Subtle glowing ring for targetable / mid highlight
        const ringGeo = new THREE.RingGeometry(0.72 * sc, 0.88 * sc, 24);
        ringGeo.rotateX(-Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({
          color: isMid ? '#ffd95a' : '#5ce8ff',
          transparent: true,
          opacity: isMid ? 0.35 : 0.0,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(pos.x, 0.05, pos.z);
        ring.userData.pickInfo = pickInfo;

        // Generous invisible raycast collider disc for each of the 15 stepping stones
        const hitMesh = new THREE.Mesh(hitGeo, hitMat);
        hitMesh.position.set(pos.x, 0.12, pos.z);
        hitMesh.userData.pickInfo = pickInfo;

        this.stoneGroup.add(st);
        this.stoneGroup.add(ring);
        this.stoneGroup.add(hitMesh);
        this.stoneMeshes.push({ mesh: st, ring, ringMat, hitMesh, lane, row, isMid });
      }
    }
  }

  /** Renderer から盤面全体の最新状態を受け取り、城・兵士・魔物を 3D 同期する */
  syncBoard(snapshot) {
    this.lastSync = snapshot;
    if (!this.renderer || !this.THREE || this.hidden || this.disabled) return;

    const lc = snapshot.laneCount ?? 3;
    const ll = snapshot.laneLength ?? 5;
    if (lc !== this.laneCount || ll !== this.laneLength) {
      this.laneCount = lc;
      this.laneLength = ll;
      this.rebuildStones();
    }

    // 1. Castles (me & opp)
    for (const side of ['me', 'opp']) {
      const info = snapshot.castles?.[side];
      if (info) this.syncCastle(side, info);
    }

    // 2. Soldiers
    const seenSoldiers = new Set();
    const stackCounts = new Map();
    for (const s of snapshot.soldiers ?? []) {
      const key = `${s.lane}:${s.row}:${s.side}`;
      const idx = stackCounts.get(key) ?? 0;
      stackCounts.set(key, idx + 1);
      seenSoldiers.add(s.id);
      this.syncSoldier(s, idx);
    }
    for (const [id, entry] of this.soldierEntries) {
      if (!seenSoldiers.has(id)) {
        this.entityGroup.remove(entry.group);
        this.soldierEntries.delete(id);
      }
    }

    // 3. Monsters
    const seenMonsters = new Set();
    for (const m of snapshot.monsters ?? []) {
      seenMonsters.add(m.id);
      this.syncMonster(m);
    }
    for (const [id, entry] of this.monsterEntries) {
      if (!seenMonsters.has(id)) {
        this.entityGroup.remove(entry.group);
        this.monsterEntries.delete(id);
      }
    }

    // 4. Targetable highlights (lanes, soldiers, monsters, castles)
    const targetLanes = new Set(snapshot.targetLanes ?? []);
    for (const st of this.stoneMeshes) {
      if (targetLanes.has(st.lane)) {
        st.ringMat.color.set('#5cf2ff');
        st.ringMat.opacity = 0.78;
      } else {
        st.ringMat.color.set(st.isMid ? '#ffd95a' : '#5ce8ff');
        st.ringMat.opacity = st.isMid ? 0.32 : 0.0;
      }
    }

    this.onProjectOverlay?.(this);
  }

  tintTeamMaterials(root, colorKey) {
    const pal = TEAM_COLORS[colorKey] ?? TEAM_COLORS.blue;
    const allMats = [];
    root.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      const cloned = mats.map((m) => {
        const c = m.clone();
        if (obj.geometry?.attributes?.color) c.vertexColors = true;
        if (c.name.startsWith('TeamRoof')) c.color.set(pal.roof);
        else if (c.name.startsWith('TeamBanner') || c.name.startsWith('TeamAccent')) c.color.set(pal.main);
        else if (c.name.startsWith('TeamCape')) c.color.set(pal.cape);
        else if (c.name.startsWith('TeamPlume')) c.color.set(pal.plume ?? pal.main);
        allMats.push(c);
        return c;
      });
      obj.material = Array.isArray(obj.material) ? cloned : cloned[0];
    });
    return allMats;
  }

  /** モデル内の階層ノードを走査し、アニメーション制御用のリグ参照をバインドする */
  bindModelRig(model) {
    const rig = {
      root: model,
      nodes: {},
      rest: new Map(),
    };
    model.traverse((obj) => {
      if (!obj.name) return;
      rig.nodes[obj.name] = obj;
      rig.rest.set(obj, {
        px: obj.position.x, py: obj.position.y, pz: obj.position.z,
        rx: obj.rotation.x, ry: obj.rotation.y, rz: obj.rotation.z,
        sx: obj.scale.x, sy: obj.scale.y, sz: obj.scale.z,
      });
    });
    return rig;
  }

  async syncCastle(side, info) {
    const THREE = this.THREE;
    const cType = castleModelKey(info.castleType);
    const colorKey = info.color || (side === 'me' ? 'blue' : 'orange');
    let entry = this.castleEntries.get(side);

    if (!entry || entry.type !== cType || entry.color !== colorKey) {
      if (entry) this.entityGroup.remove(entry.group);
      const group = new THREE.Group();
      const pos = this.castleWorldPos(side);
      group.position.set(pos.x, pos.y, pos.z);
      group.rotation.y = side === 'opp' ? Math.PI : 0;
      if (side === 'opp') {
        group.scale.set(0.88, 0.88, 0.88);
      } else {
        // 手前の自軍城は、手前マスの踏み石・兵士の視認性を遮らないよう高さを抑える
        group.scale.set(0.75, 0.64, 0.72);
      }

      const pickInfo = { kind: 'castle', side };
      group.userData.pickInfo = pickInfo;

      // Invisible pick collider for reliable raycasting without occluding battlefield rows behind castle-me
      const hitGeo = new THREE.CylinderGeometry(1.75, 2.1, 2.5, 14);
      const hitMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitMesh = new THREE.Mesh(hitGeo, hitMat);
      hitMesh.position.y = 1.25;
      hitMesh.userData.pickInfo = pickInfo;
      group.add(hitMesh);

      // 3D Energy Shield Dome (for armor > 0)
      const shieldGeo = new THREE.SphereGeometry(2.85, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.58);
      const shieldMat = new THREE.MeshStandardMaterial({
        color: '#4cd6ff',
        emissive: '#22aaff',
        emissiveIntensity: 0.9,
        transparent: true,
        opacity: 0.28,
        roughness: 0.12,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
      shieldMesh.position.y = 0.05;
      shieldMesh.visible = false;
      group.add(shieldMesh);

      // Overdrive fiery ring (背水の陣)
      const odGeo = new THREE.TorusGeometry(2.65, 0.14, 8, 28);
      odGeo.rotateX(Math.PI / 2);
      const odMat = new THREE.MeshStandardMaterial({
        color: '#ff4810',
        emissive: '#ff3200',
        emissiveIntensity: 2.2,
        transparent: true,
        opacity: 0.85,
      });
      const overdriveRing = new THREE.Mesh(odGeo, odMat);
      overdriveRing.position.y = 0.25;
      overdriveRing.visible = false;
      group.add(overdriveRing);

      // Orbiting Spirit Orb
      const spGeo = new THREE.OctahedronGeometry(0.45, 0);
      const spMat = new THREE.MeshStandardMaterial({
        color: '#ffffff',
        emissive: '#ffaa22',
        emissiveIntensity: 2.0,
        roughness: 0.15,
      });
      const spiritOrb = new THREE.Mesh(spGeo, spMat);
      spiritOrb.position.set(2.4, 3.6, 0);
      spiritOrb.visible = false;
      group.add(spiritOrb);

      entry = {
        group, model: null, rig: null, materials: [],
        type: cType, color: colorKey, side,
        shieldMesh, overdriveRing, spiritOrb,
        hitFlash: 0, recoilTime: 0, collapseProgress: 0, isCollapsed: false,
        hpRatio: 1,
      };
      this.castleEntries.set(side, entry);
      this.entityGroup.add(group);

      try {
        const gltf = await loadGlb(this.GLTFLoader, `assets/models/castle-${cType}.glb`);
        if (this.castleEntries.get(side) !== entry || this.disposed) return;
        const model = gltf.scene.clone(true);
        model.traverse((o) => { o.userData.pickInfo = pickInfo; });
        entry.materials = this.tintTeamMaterials(model, colorKey);
        entry.rig = this.bindModelRig(model);
        group.add(model);
        entry.model = model;
      } catch {
        return;
      }
    }

    // Update live visual states
    entry.shieldMesh.visible = (info.armor ?? 0) > 0;
    entry.overdriveRing.visible = Boolean(info.overdrive);
    if (info.spirit) {
      const scol = ELEMENT_COLORS[info.spirit] ?? '#ffd85a';
      entry.spiritOrb.material.color.set(scol);
      entry.spiritOrb.material.emissive.set(scol);
      entry.spiritOrb.visible = true;
    } else {
      entry.spiritOrb.visible = false;
    }

    const prevRatio = entry.hpRatio;
    const ratio = info.maxHp > 0 ? Math.max(0, info.hp / info.maxHp) : 1;
    entry.hpRatio = ratio;

    if (ratio <= 0 && !entry.isCollapsed) {
      entry.isCollapsed = true;
      if (prevRatio > 0) this.playCastleCollapse(side);
      else entry.collapseProgress = 1;
    } else if (ratio > 0 && entry.isCollapsed) {
      entry.isCollapsed = false;
      entry.collapseProgress = 0;
    }
  }

  async syncSoldier(s, stackIdx) {
    const THREE = this.THREE;
    const mKey = soldierModelKey(s.type);
    const colorKey = s.color || (s.side === 'me' ? 'blue' : 'orange');
    const base = this.cellWorldPos(s.lane, s.row);
    const sideOffset = s.side === 'me' ? 0.36 : -0.36;
    const stackOffX = (stackIdx % 2) * (s.side === 'me' ? 0.24 : -0.24);
    const stackOffZ = Math.floor(stackIdx / 2) * 0.32;
    const targetPos = { x: base.x + sideOffset + stackOffX, y: 0.16, z: base.z + stackOffZ };

    let entry = this.soldierEntries.get(s.id);
    if (!entry) {
      const group = new THREE.Group();
      group.position.set(targetPos.x, targetPos.y, targetPos.z);
      group.rotation.y = s.side === 'opp' ? Math.PI : 0;

      const pickInfo = { kind: 'soldier', soldierId: s.id, lane: s.lane, row: s.row, side: s.side };
      group.userData.pickInfo = pickInfo;

      // Invisible pick cylinder so tapping anywhere on the chibi character/horse hits reliably
      const hitGeo = new THREE.CylinderGeometry(0.68, 0.68, 1.9, 10);
      const hitMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitMesh = new THREE.Mesh(hitGeo, hitMat);
      hitMesh.position.y = 0.92;
      hitMesh.userData.pickInfo = pickInfo;
      group.add(hitMesh);

      // Team / Elemental base ring
      const pal = TEAM_COLORS[colorKey] ?? TEAM_COLORS.blue;
      const ringGeo = new THREE.RingGeometry(0.42, 0.58, 24);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({ color: pal.glow, transparent: true, opacity: 0.82, side: THREE.DoubleSide, depthWrite: false });
      const auraRing = new THREE.Mesh(ringGeo, ringMat);
      auraRing.position.y = 0.03;
      group.add(auraRing);

      // Frozen 3D ice crystal cage
      const iceGeo = new THREE.CylinderGeometry(0.52, 0.62, 1.45, 6);
      const iceMat = new THREE.MeshStandardMaterial({
        color: '#88eeff', emissive: '#22b8ff', emissiveIntensity: 0.8,
        transparent: true, opacity: 0.45, roughness: 0.1, depthWrite: false,
      });
      const iceCage = new THREE.Mesh(iceGeo, iceMat);
      iceCage.position.y = 0.72;
      iceCage.visible = false;
      group.add(iceCage);

      // Shield buckler aura
      const shGeo = new THREE.TorusGeometry(0.55, 0.06, 8, 20);
      const shMat = new THREE.MeshStandardMaterial({
        color: '#55d8ff', emissive: '#30b8ff', emissiveIntensity: 1.5, transparent: true, opacity: 0.75,
      });
      const shieldRing = new THREE.Mesh(shGeo, shMat);
      shieldRing.position.set(0, 0.75, -0.45);
      shieldRing.visible = false;
      group.add(shieldRing);

      entry = {
        id: s.id,
        group, model: null, rig: null, materials: [],
        type: mKey, rawType: s.type, color: colorKey, side: s.side,
        lane: s.lane, row: s.row,
        targetPos, curPos: { ...targetPos }, phase: Math.random() * Math.PI * 2,
        auraRing, iceCage, shieldRing,
        action: null, // { kind: 'attack'|'cast'|'shoot'|'hit'|'deploy', age: 0, dur: 0.45, dir: {x,z}, power: 1 }
        hitFlash: 0,
        dustTimer: 0,
      };
      this.soldierEntries.set(s.id, entry);
      this.entityGroup.add(group);

      try {
        const gltf = await loadGlb(this.GLTFLoader, `assets/models/unit-${mKey}.glb`);
        if (this.soldierEntries.get(s.id) !== entry || this.disposed) return;
        const model = gltf.scene.clone(true);
        const sc = 0.80;
        model.scale.set(sc, sc, sc);
        model.traverse((o) => { o.userData.pickInfo = pickInfo; });
        entry.materials = this.tintTeamMaterials(model, colorKey);
        entry.rig = this.bindModelRig(model);
        group.add(model);
        entry.model = model;
      } catch {
        return;
      }
    } else {
      entry.targetPos = targetPos;
      entry.lane = s.lane;
      entry.row = s.row;
      entry.group.rotation.y = s.side === 'opp' ? Math.PI : 0;
      const pickInfo = { kind: 'soldier', soldierId: s.id, lane: s.lane, row: s.row, side: s.side };
      entry.group.userData.pickInfo = pickInfo;
      entry.group.traverse((o) => { o.userData.pickInfo = pickInfo; });
    }

    // Live status visuals
    entry.iceCage.visible = (s.statuses?.frozen ?? 0) > 0;
    entry.shieldRing.visible = (s.shield ?? 0) > 0;
    if (s.element && ELEMENT_COLORS[s.element]) {
      entry.auraRing.material.color.set(ELEMENT_COLORS[s.element]);
    } else {
      entry.auraRing.material.color.set((TEAM_COLORS[colorKey] ?? TEAM_COLORS.blue).glow);
    }
  }

  async syncMonster(m) {
    const THREE = this.THREE;
    const mKey = monsterModelKey(m.type);
    const pos = this.cellWorldPos(m.lane, m.row);
    const targetPos = { x: pos.x, y: 0.22, z: pos.z };

    let entry = this.monsterEntries.get(m.id);
    if (!entry) {
      const group = new THREE.Group();
      group.position.set(targetPos.x, targetPos.y, targetPos.z);
      group.rotation.y = Math.PI; // Face toward player camera

      const pickInfo = { kind: 'monster', monsterId: m.id, lane: m.lane, row: m.row };
      group.userData.pickInfo = pickInfo;

      const hitGeo = new THREE.CylinderGeometry(0.9, 0.9, 2.2, 10);
      const hitMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitMesh = new THREE.Mesh(hitGeo, hitMat);
      hitMesh.position.y = 1.0;
      hitMesh.userData.pickInfo = pickInfo;
      group.add(hitMesh);

      // Menacing boss aura ring
      const ringGeo = new THREE.RingGeometry(0.75, 0.95, 24);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({ color: '#ff4466', transparent: true, opacity: 0.65, side: THREE.DoubleSide, depthWrite: false });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 0.03;
      group.add(ring);

      entry = {
        id: m.id,
        group, model: null, rig: null, materials: [],
        type: mKey, lane: m.lane, row: m.row,
        targetPos, curPos: { ...targetPos },
        phase: Math.random() * 6, hitFlash: 0, action: null,
      };
      this.monsterEntries.set(m.id, entry);
      this.entityGroup.add(group);

      try {
        const gltf = await loadGlb(this.GLTFLoader, `assets/models/monster-${mKey}.glb`);
        if (this.monsterEntries.get(m.id) !== entry || this.disposed) return;
        const model = gltf.scene.clone(true);
        const sc = 0.85;
        model.scale.set(sc, sc, sc);
        model.traverse((o) => {
          o.userData.pickInfo = pickInfo;
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
            if (o.material) {
              o.material = o.material.clone();
              entry.materials.push(o.material);
            }
          }
        });
        entry.rig = this.bindModelRig(model);
        group.add(model);
        entry.model = model;
      } catch {
        return;
      }
    } else {
      entry.targetPos = targetPos;
      entry.lane = m.lane;
      entry.row = m.row;
    }
  }

  // ===========================================================================
  // 3D CHARACTER & CASTLE ANIMATION ENGINE (IDLE, MARCH, ATTACK, CAST, HIT, KO)
  // ===========================================================================

  /**
   * 兵士や魔物の3Dアクション（攻撃・詠唱・射撃・被弾・撃破退場）を発火する
   * @param {string} unitId soldierId または monsterId
   * @param {'attack'|'cast'|'shoot'|'hit'|'defeat'} kind
   * @param {{ dir?: {x:number, z:number}, power?: number, poison?: boolean, reason?: string, isMonster?: boolean }} [opts]
   */
  playUnitAction(unitId, kind, opts = {}) {
    if (!this.renderer || !this.THREE || this.hidden || this.disabled) return;
    const entry = opts.isMonster ? this.monsterEntries.get(unitId) : (this.soldierEntries.get(unitId) ?? this.monsterEntries.get(unitId));
    if (!entry) return;

    if (kind === 'defeat') {
      this.spawnDefeatAnimation(entry, opts);
      return;
    }

    if (kind === 'hit') {
      entry.hitFlash = Math.min(1.0, 0.55 + (opts.power ?? 1) * 0.25);
      entry.action = {
        kind: 'hit',
        age: 0,
        dur: 0.36,
        dir: opts.dir ?? { x: 0, z: entry.side === 'me' ? 1 : -1 },
        power: opts.power ?? 1,
        poison: Boolean(opts.poison),
      };
      return;
    }

    const dur = kind === 'cast' ? 0.56 : kind === 'shoot' ? 0.44 : 0.46;
    entry.action = {
      kind,
      age: 0,
      dur,
      dir: opts.dir ?? { x: 0, z: entry.side === 'me' ? -1 : 1 },
      power: opts.power ?? 1,
    };

    if (kind === 'cast') {
      // Spawn glowing 3D magic rune ring under caster
      this.spawnRing(entry.curPos, '#b57cff', 1.85, 0.52, 0.08);
      this.spawnBurst(entry.curPos, '#d8a6ff', 10, 2.2, 0.45, 2.8);
    }
  }

  /** 撃破・退場時の3D吹き飛び／消滅アニメーションを fxGroup 上で再生する */
  spawnDefeatAnimation(entry, opts = {}) {
    if (!entry.model || prefersReducedMotion()) return;
    const THREE = this.THREE;
    const ghost = entry.model.clone(true);
    const startPos = { ...entry.group.position };
    ghost.position.set(startPos.x, startPos.y, startPos.z);
    ghost.rotation.copy(entry.group.rotation);
    const baseScale = entry.model.scale.x || 0.8;

    const mats = [];
    ghost.traverse((o) => {
      if (o.isMesh && o.material) {
        const list = Array.isArray(o.material) ? o.material : [o.material];
        const cloned = list.map((m) => {
          const c = m.clone();
          c.transparent = true;
          mats.push(c);
          return c;
        });
        o.material = Array.isArray(o.material) ? cloned : cloned[0];
      }
    });

    this.fxGroup.add(ghost);
    const isReturn = opts.reason === 'returned';
    const isPoison = Boolean(opts.poison);
    const backwardZ = entry.side === 'me' ? 1.8 : -1.8;
    const vx = (opts.dir?.x ?? (Math.random() - 0.5) * 0.8) * 2.2;
    const vz = (opts.dir?.z ?? backwardZ);

    if (!isReturn) {
      this.spawnBurst(startPos, isPoison ? '#9c44ff' : '#ffe066', 14, 3.6, 0.48, 3.0);
      this.spawnRing(startPos, isPoison ? '#8833ee' : '#ffffff', 1.6, 0.35, 0.08);
    }

    const dur = 0.52;
    this.activeEffects.push({
      age: 0,
      dur,
      update: (t) => {
        for (const m of mats) m.opacity = Math.max(0, 1 - t * 1.15);
        if (isReturn) {
          // Ascend in a beam of light back to castle
          ghost.position.y = startPos.y + t * 3.5;
          ghost.rotation.y += 0.25;
          const sc = baseScale * (1 - t * 0.7);
          ghost.scale.set(sc, baseScale * (1 + t * 0.6), sc);
        } else if (isPoison) {
          // Melt down into ground
          ghost.position.y = startPos.y * (1 - t);
          ghost.scale.set(baseScale * (1 + t * 0.5), baseScale * Math.max(0.08, 1 - t * 0.92), baseScale * (1 + t * 0.5));
        } else {
          // Knockback arc & tumble spin
          const arcY = Math.sin(t * Math.PI) * 1.35;
          ghost.position.set(
            startPos.x + vx * t,
            Math.max(0.05, startPos.y + arcY),
            startPos.z + vz * t,
          );
          ghost.rotation.x += 0.16 * (entry.side === 'me' ? 1 : -1);
          ghost.rotation.z += 0.11;
          const sc = baseScale * (1 - t * 0.45);
          ghost.scale.set(sc, sc, sc);
        }
      },
      cleanup: () => {
        this.fxGroup.remove(ghost);
        for (const m of mats) m.dispose();
      },
    });
  }

  /** 落城時の3D崩壊演出＆カメラフォーカス */
  playCastleCollapse(side) {
    if (!this.renderer || !this.THREE || this.hidden || this.disabled) return;
    const entry = this.castleEntries.get(side);
    if (!entry) return;
    entry.collapseProgress = 0.001;
    const pos = this.castleWorldPos(side);

    // Multi-stage explosion bursts & debris on the collapsing castle
    this.spawnRing(pos, '#ff5511', 4.6, 0.75, 0.3);
    this.spawnBurst({ x: pos.x, y: 1.5, z: pos.z }, '#ff7722', 32, 6.8, 0.95, 6.2);
    this.spawnBurst({ x: pos.x - 1.2, y: 2.2, z: pos.z + 0.6 }, '#e6c796', 22, 5.4, 0.88, 5.2);
    this.spawnBurst({ x: pos.x + 1.2, y: 2.0, z: pos.z - 0.5 }, '#ffd24c', 20, 5.2, 0.85, 5.0);
    this.flashLight('#ff4400', 11.0, pos, 0.75);
    this.addCameraShake(0.45, 0.55);

    // Dramatic non-blocking camera focus onto the collapsing castle
    this.playCinematicCue({
      yaw: side === 'opp' ? 0.22 : -0.25,
      pitch: (23 * Math.PI) / 180,
      dist: 10.5,
      look: { x: pos.x, y: 1.5, z: pos.z },
      dur: 1.25,
      holdRatio: 0.72,
    });
  }

  /** 1体の兵士の階層リグ＆ルート姿勢を毎フレーム更新する */
  updateSoldierAnimation(s, t, dt, reduced) {
    const lerpSpeed = Math.min(1, dt * 8.8);
    s.curPos.x += (s.targetPos.x - s.curPos.x) * lerpSpeed;
    s.curPos.z += (s.targetPos.z - s.curPos.z) * lerpSpeed;
    const dist = Math.hypot(s.targetPos.x - s.curPos.x, s.targetPos.z - s.curPos.z);
    const isMoving = dist > 0.035;
    const isFrozen = s.iceCage.visible;

    // Reset rig nodes to rest pose before applying procedural layer
    const rig = s.rig;
    if (rig) {
      for (const [node, r] of rig.rest) {
        node.position.set(r.px, r.py, r.pz);
        node.rotation.set(r.rx, r.ry, r.rz);
        node.scale.set(r.sx, r.sy, r.sz);
      }
    }

    let rootOffX = 0;
    let rootOffY = 0;
    let rootOffZ = 0;
    let rootPitch = 0;
    let rootRoll = 0;
    let rootYaw = s.side === 'opp' ? Math.PI : 0;

    if (!reduced && !isFrozen) {
      const ph = s.phase;
      const nodes = rig?.nodes ?? {};

      if (isMoving) {
        // ==================== MARCH / GALLOP ANIMATION ====================
        const freq = s.type === 'knight' ? 17.0 : 14.5;
        const cyc = t * freq + ph;
        const sinC = Math.sin(cyc);
        const cosC = Math.cos(cyc);

        if (s.type === 'knight') {
          // 騎士の騎乗ギャロップ移動
          rootOffY = Math.abs(sinC) * 0.24;
          rootPitch = sinC * 0.14;
          if (nodes.Anim_MountBody) {
            nodes.Anim_MountBody.rotation.x += sinC * 0.12;
          }
          if (nodes.Anim_MountHead) {
            nodes.Anim_MountHead.rotation.x += -cosC * 0.16;
          }
          if (nodes.Anim_MountLegFL) nodes.Anim_MountLegFL.rotation.x += sinC * 0.65;
          if (nodes.Anim_MountLegFR) nodes.Anim_MountLegFR.rotation.x += Math.sin(cyc + 0.7) * 0.65;
          if (nodes.Anim_MountLegBL) nodes.Anim_MountLegBL.rotation.x += -sinC * 0.58;
          if (nodes.Anim_MountLegBR) nodes.Anim_MountLegBR.rotation.x += -Math.sin(cyc + 0.7) * 0.58;
          if (nodes.Anim_MountTail) nodes.Anim_MountTail.rotation.x += 0.35 + Math.sin(cyc * 1.5) * 0.25;
          if (nodes.Anim_Body) {
            nodes.Anim_Body.position.y += Math.abs(cosC) * 0.06;
            nodes.Anim_Body.rotation.x += 0.10 - sinC * 0.08;
          }
          if (nodes.Anim_ArmR) nodes.Anim_ArmR.rotation.x += -0.25 + sinC * 0.12;
          if (nodes.Anim_Cape) nodes.Anim_Cape.rotation.x += 0.42 + Math.abs(sinC) * 0.25;
          if (nodes.Anim_Plume) nodes.Anim_Plume.rotation.x += -0.22 + cosC * 0.18;

          // Spawn 3D hoof dust trail particles periodically
          s.dustTimer += dt;
          if (s.dustTimer > 0.14) {
            s.dustTimer = 0;
            this.spawnRing({ x: s.curPos.x, y: 0.04, z: s.curPos.z }, '#d8c394', 0.75, 0.28, 0.04);
          }
        } else if (s.type === 'mage') {
          // 魔法使いの滑空進軍
          rootOffY = 0.14 + Math.sin(cyc * 0.8) * 0.08;
          rootPitch = 0.12;
          if (nodes.Anim_ArmR) nodes.Anim_ArmR.rotation.x += -0.35 + sinC * 0.15;
          if (nodes.Anim_ArmL) nodes.Anim_ArmL.rotation.x += 0.2 + cosC * 0.15;
          if (nodes.Anim_Cape) nodes.Anim_Cape.rotation.x += 0.38 + Math.abs(sinC) * 0.20;
          if (nodes.Anim_LegL) nodes.Anim_LegL.rotation.x += sinC * 0.28;
          if (nodes.Anim_LegR) nodes.Anim_LegR.rotation.x += -sinC * 0.28;
        } else {
          // 歩兵・一般兵士の力強い行進
          rootOffY = Math.abs(sinC) * 0.19;
          rootPitch = 0.09;
          rootRoll = cosC * 0.07;
          if (nodes.Anim_LegL) nodes.Anim_LegL.rotation.x += sinC * 0.62;
          if (nodes.Anim_LegR) nodes.Anim_LegR.rotation.x += -sinC * 0.62;
          if (nodes.Anim_ArmR) nodes.Anim_ArmR.rotation.x += -sinC * 0.45;
          if (nodes.Anim_ArmL) nodes.Anim_ArmL.rotation.x += sinC * 0.38;
          if (nodes.Anim_Head) nodes.Anim_Head.rotation.y += cosC * 0.08;
          if (nodes.Anim_Cape) nodes.Anim_Cape.rotation.x += 0.32 + Math.abs(sinC) * 0.22;
          if (nodes.Anim_Plume) nodes.Anim_Plume.rotation.x += -0.15 + cosC * 0.16;
        }
      } else {
        // ==================== IDLE ANIMATION ====================
        const cyc = t * 2.8 + ph;
        const sinC = Math.sin(cyc);
        const cosC = Math.cos(cyc * 0.7);

        if (s.type === 'knight') {
          rootOffY = Math.sin(t * 3.6 + ph) * 0.035;
          if (nodes.Anim_MountHead) {
            nodes.Anim_MountHead.rotation.x += sinC * 0.08;
            nodes.Anim_MountHead.rotation.y += Math.sin(t * 1.5 + ph) * 0.06;
          }
          if (nodes.Anim_MountTail) {
            nodes.Anim_MountTail.rotation.z += Math.sin(t * 3.2 + ph) * 0.16;
          }
          if (nodes.Anim_Body) {
            nodes.Anim_Body.scale.y *= 1 + sinC * 0.02;
          }
          if (nodes.Anim_ArmR) nodes.Anim_ArmR.rotation.x += sinC * 0.05;
          if (nodes.Anim_Cape) nodes.Anim_Cape.rotation.x += 0.08 + sinC * 0.06;
          if (nodes.Anim_Plume) nodes.Anim_Plume.rotation.z += cosC * 0.07;
        } else if (s.type === 'mage') {
          // 魔法使い：神秘的な浮遊＆杖の魔力脈動
          rootOffY = 0.06 + (0.5 + 0.5 * sinC) * 0.09;
          if (nodes.Anim_Head) nodes.Anim_Head.rotation.y += cosC * 0.08;
          if (nodes.Anim_ArmR) nodes.Anim_ArmR.rotation.x += -0.08 + sinC * 0.07;
          if (nodes.Anim_ArmL) nodes.Anim_ArmL.rotation.z += -0.12 - sinC * 0.06;
          if (nodes.Anim_StaffOrb) {
            nodes.Anim_StaffOrb.rotation.y += t * 2.2;
            const scOrb = 1 + Math.sin(t * 5.2 + ph) * 0.12;
            nodes.Anim_StaffOrb.scale.multiplyScalar(scOrb);
          }
          if (nodes.Anim_Cape) nodes.Anim_Cape.rotation.x += 0.10 + sinC * 0.07;
        } else {
          // 歩兵・一般兵士：呼吸・周囲警戒・剣の構え
          rootOffY = (0.5 + 0.5 * sinC) * 0.045;
          if (nodes.Anim_Body) {
            nodes.Anim_Body.scale.set(1 + sinC * 0.02, 1 - sinC * 0.02, 1 + sinC * 0.02);
          }
          if (nodes.Anim_Head) {
            nodes.Anim_Head.rotation.y += Math.sin(t * 1.4 + ph) * 0.10;
            nodes.Anim_Head.rotation.x += sinC * 0.04;
          }
          if (nodes.Anim_ArmR) {
            nodes.Anim_ArmR.rotation.x += -0.06 + sinC * 0.08;
            nodes.Anim_ArmR.rotation.z += Math.cos(cyc) * 0.04;
          }
          if (nodes.Anim_ArmL) {
            nodes.Anim_ArmL.rotation.x += -sinC * 0.04;
          }
          if (nodes.Anim_Cape) nodes.Anim_Cape.rotation.x += 0.08 + Math.sin(t * 2.4 + ph) * 0.06;
          if (nodes.Anim_Plume) nodes.Anim_Plume.rotation.x += Math.sin(t * 3.1 + ph) * 0.08;
        }
      }

      // ==================== ACTION OVERLAY (ATTACK / CAST / SHOOT / HIT) ====================
      if (s.action) {
        s.action.age += dt;
        const p = Math.min(1, s.action.age / s.action.dur);
        const forwardSign = s.side === 'me' ? -1 : 1;

        if (s.action.kind === 'attack') {
          // 0..0.32: windup back; 0.32..0.58: explosive lunge & weapon swing; 0.58..1.0: settle
          let lunge = 0;
          let swing = 0;
          if (p < 0.32) {
            const k = p / 0.32;
            lunge = -0.25 * k;
            swing = -0.95 * k;
          } else if (p < 0.58) {
            const k = (p - 0.32) / 0.26;
            lunge = -0.25 + 1.10 * k;
            swing = -0.95 + 2.25 * k;
          } else {
            const k = (p - 0.58) / 0.42;
            lunge = 0.85 * (1 - k);
            swing = 1.30 * (1 - k);
          }
          rootOffZ += forwardSign * lunge * 0.68;
          rootOffY += Math.max(0, lunge) * 0.18;
          rootPitch += lunge * 0.24;

          if (s.type === 'knight') {
            if (nodes.Anim_MountBody) nodes.Anim_MountBody.rotation.x += swing < 0 ? swing * 0.28 : lunge * 0.18;
            if (nodes.Anim_ArmR) nodes.Anim_ArmR.rotation.x += -swing * 0.85;
          } else {
            if (nodes.Anim_ArmR) nodes.Anim_ArmR.rotation.x += swing * 1.15;
            if (nodes.Anim_ArmL) nodes.Anim_ArmL.rotation.y += -swing * 0.35;
            if (nodes.Anim_Body) nodes.Anim_Body.rotation.y += -swing * 0.28;
          }
          if (nodes.Anim_Cape) nodes.Anim_Cape.rotation.x += Math.max(0, lunge) * 0.55;
        } else if (s.action.kind === 'cast' || s.action.kind === 'shoot') {
          // 魔法使いの詠唱モーション / 遠距離射撃
          const charge = p < 0.55 ? Math.sin((p / 0.55) * (Math.PI / 2)) : Math.cos(((p - 0.55) / 0.45) * (Math.PI / 2));
          const release = p >= 0.55 ? Math.sin(((p - 0.55) / 0.45) * Math.PI) : 0;
          rootOffY += charge * 0.32;
          rootOffZ += forwardSign * (release * 0.25 - charge * 0.12);
          rootPitch += release * 0.22 - charge * 0.14;
          if (nodes.Anim_ArmR) {
            nodes.Anim_ArmR.rotation.x += -charge * 1.25 + release * 0.65;
          }
          if (nodes.Anim_ArmL) {
            nodes.Anim_ArmL.rotation.x += -charge * 0.85;
            nodes.Anim_ArmL.rotation.z += -charge * 0.45;
          }
          if (nodes.Anim_StaffOrb) {
            const scOrb = 1 + charge * 0.85;
            nodes.Anim_StaffOrb.scale.multiplyScalar(scOrb);
          }
          if (nodes.Anim_Cape) nodes.Anim_Cape.rotation.x += charge * 0.48;
        } else if (s.action.kind === 'hit') {
          // 被弾ノックバック＆けぞり
          const env = Math.sin(p * Math.PI);
          const knock = env * 0.38 * Math.min(1.6, s.action.power ?? 1);
          const backSign = s.side === 'me' ? 1 : -1;
          rootOffZ += backSign * knock;
          rootPitch += -env * 0.32;
          rootRoll += Math.sin(p * Math.PI * 4) * 0.14 * (1 - p);
          if (nodes.Anim_Head) nodes.Anim_Head.rotation.x += -env * 0.28;
          if (nodes.Anim_ArmL) nodes.Anim_ArmL.rotation.x += -env * 0.45;
        }

        if (s.action.age >= s.action.dur) {
          s.action = null;
        }
      }
    }

    // Hit emissive flash decay
    if (s.hitFlash > 0) {
      s.hitFlash = Math.max(0, s.hitFlash - dt * 3.6);
      for (const m of s.materials) {
        if (!m.emissive) continue;
        if (s.hitFlash > 0.01) {
          m.emissive.set(s.action?.poison ? '#8822ff' : '#ff5533');
          m.emissiveIntensity = s.hitFlash * 2.2;
        } else {
          m.emissive.set('#000000');
          m.emissiveIntensity = 0;
        }
      }
    }

    s.group.position.set(s.curPos.x + rootOffX, s.targetPos.y + rootOffY, s.curPos.z + rootOffZ);
    s.group.rotation.set(rootPitch, rootYaw, rootRoll);
  }

  /** 城の旗の揺れ・被弾振動・落城崩壊アニメーションを毎フレーム更新する */
  updateCastleAnimation(c, t, dt, reduced) {
    if (c.spiritOrb.visible && !reduced) {
      c.spiritOrb.position.set(Math.cos(t * 1.8) * 2.5, 3.6 + Math.sin(t * 3.2) * 0.25, Math.sin(t * 1.8) * 2.5);
      c.spiritOrb.rotation.y += dt * 2.5;
    }
    if (c.overdriveRing.visible && !reduced) {
      const p = 1 + Math.sin(t * 5.0) * 0.05;
      c.overdriveRing.scale.set(p, p, 1);
    }

    if (!c.model) return;
    const rig = c.rig;
    if (rig) {
      for (const [node, r] of rig.rest) {
        node.position.set(r.px, r.py, r.pz);
        node.rotation.set(r.rx, r.ry, r.rz);
        node.scale.set(r.sx, r.sy, r.sz);
      }
    }

    // Waving flags
    if (rig && !reduced) {
      for (const [name, node] of Object.entries(rig.nodes)) {
        if (name.startsWith('Castle_Flag')) {
          node.rotation.y += Math.sin(t * 3.8 + node.position.x) * 0.14;
          node.rotation.z += Math.cos(t * 2.9 + node.position.z) * 0.06;
        }
      }
    }

    // Hit recoil shudder
    if (c.recoilTime > 0 && !reduced) {
      c.recoilTime = Math.max(0, c.recoilTime - dt);
      const env = c.recoilTime / 0.32;
      c.model.position.x = Math.sin(t * 65) * 0.14 * env;
      c.model.position.z = Math.cos(t * 55) * 0.12 * env;
      c.model.scale.set(1 + 0.06 * env, 1 - 0.08 * env, 1 + 0.06 * env);
    } else {
      c.model.position.set(0, 0, 0);
      c.model.scale.set(1, 1, 1);
      c.model.rotation.set(0, 0, 0);
    }

    // Hit emissive flash
    if (c.hitFlash > 0) {
      c.hitFlash = Math.max(0, c.hitFlash - dt * 3.4);
      for (const m of c.materials) {
        if (!m.emissive || EMISSIVE_NAMES.has(m.name)) continue;
        if (c.hitFlash > 0.01) {
          m.emissive.set('#ff6622');
          m.emissiveIntensity = c.hitFlash * 1.8;
        } else {
          m.emissive.set('#000000');
          m.emissiveIntensity = 0;
        }
      }
    }

    // Progressive damage & collapse animation
    if (c.isCollapsed || c.collapseProgress > 0) {
      c.collapseProgress = Math.min(1, c.collapseProgress + dt * 1.35);
      const k = c.collapseProgress;
      const ease = k * k * (3 - 2 * k);
      if (rig && (rig.nodes.Castle_Keep || rig.nodes.Castle_Tower_FL)) {
        // Animate individual architectural sub-parts collapsing outward!
        if (rig.nodes.Castle_Keep) {
          rig.nodes.Castle_Keep.position.y -= ease * 1.45;
          rig.nodes.Castle_Keep.rotation.z += ease * 0.22;
          rig.nodes.Castle_Keep.rotation.x += ease * 0.15;
        }
        const towerTilts = [
          ['Castle_Tower_FL', -0.35, 0.25, -1.1],
          ['Castle_Tower_FR', 0.38, 0.22, -1.25],
          ['Castle_Tower_BL', -0.28, -0.30, -0.95],
          ['Castle_Tower_BR', 0.32, -0.28, -1.15],
        ];
        for (const [tName, rz, rx, dy] of towerTilts) {
          const tn = rig.nodes[tName];
          if (tn) {
            tn.position.y += ease * dy;
            tn.rotation.z += ease * rz;
            tn.rotation.x += ease * rx;
          }
        }
        if (rig.nodes.Castle_Walls) {
          rig.nodes.Castle_Walls.position.y -= ease * 0.65;
          rig.nodes.Castle_Walls.scale.y = Math.max(0.35, 1 - ease * 0.55);
        }
      } else {
        c.model.scale.set(1 + ease * 0.08, Math.max(0.32, 1 - ease * 0.68), 1 + ease * 0.08);
        c.model.rotation.z = ease * 0.16;
      }
    } else if (c.hpRatio <= 0.35) {
      // Heavy damage state: slight structural tilt on towers
      if (rig?.nodes.Castle_Tower_FR) rig.nodes.Castle_Tower_FR.rotation.z += 0.06;
      if (rig?.nodes.Castle_Keep) rig.nodes.Castle_Keep.rotation.z -= 0.03;
    }
  }

  // ===========================================================================
  // 3D MAGIC & COMBAT VFX ENGINE
  // ===========================================================================
  addCameraShake(amp = 0.25, dur = 0.28) {
    if (prefersReducedMotion()) return;
    this.shakeAmp = Math.max(this.shakeAmp, amp);
    this.shakeTime = Math.max(this.shakeTime, dur);
  }

  flashLight(hex, intensity = 6.0, pos = { x: 0, y: 3, z: 0 }, dur = 0.35) {
    if (!this.fxLight) return;
    this.fxLight.color.set(hex);
    this.fxLight.position.set(pos.x, Math.max(2.0, (pos.y ?? 0) + 2.5), pos.z);
    this.activeEffects.push({
      age: 0,
      dur,
      update: (t) => {
        this.fxLight.intensity = intensity * Math.pow(1 - t, 1.8);
      },
      cleanup: () => {
        this.fxLight.intensity = 0;
      },
    });
  }

  spawnRing(pos, colorHex, maxScale = 2.6, dur = 0.42, y = 0.25) {
    const THREE = this.THREE;
    if (!THREE) return;
    const geo = new THREE.RingGeometry(0.35, 0.65, 24);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos.x, y, pos.z);
    this.fxGroup.add(mesh);
    this.activeEffects.push({
      age: 0,
      dur,
      update: (t) => {
        const s = 0.4 + t * maxScale;
        mesh.scale.set(s, s, s);
        mat.opacity = (1 - t) * 0.9;
      },
      cleanup: () => {
        this.fxGroup.remove(mesh);
        geo.dispose();
        mat.dispose();
      },
    });
  }

  spawnBurst(pos, colorHex, count = 18, speed = 4.5, dur = 0.55, upBias = 3.2) {
    const THREE = this.THREE;
    if (!THREE) return;
    const actualCount = this.qualityTier === 'medium' ? Math.max(6, Math.round(count * 0.6)) : count;
    const geo = new THREE.OctahedronGeometry(0.16, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: colorHex, emissive: colorHex, emissiveIntensity: 2.2, roughness: 0.2, transparent: true, opacity: 1,
    });
    const particles = [];
    for (let i = 0; i < actualCount; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(pos.x, (pos.y ?? 0) + 0.6, pos.z);
      const a = Math.random() * Math.PI * 2;
      const sp = (0.4 + Math.random() * 0.8) * speed;
      const vx = Math.cos(a) * sp;
      const vz = Math.sin(a) * sp;
      const vy = upBias * (0.5 + Math.random() * 0.9);
      this.fxGroup.add(m);
      particles.push({ m, vx, vy, vz });
    }
    this.activeEffects.push({
      age: 0,
      dur,
      update: (t, dt) => {
        mat.opacity = 1 - t;
        for (const p of particles) {
          p.vy -= 9.5 * dt;
          p.m.position.x += p.vx * dt;
          p.m.position.y = Math.max(0.1, p.m.position.y + p.vy * dt);
          p.m.position.z += p.vz * dt;
          p.m.rotation.x += 6 * dt;
          p.m.rotation.y += 5 * dt;
          const s = 1 - t * 0.7;
          p.m.scale.set(s, s, s);
        }
      },
      cleanup: () => {
        for (const p of particles) this.fxGroup.remove(p.m);
        geo.dispose();
        mat.dispose();
      },
    });
  }

  /**
   * 外部（Animations.js）から呼ばれる 3D エフェクト発火窓口
   * @param {'fire'|'lightning'|'ice'|'heal'|'poison'|'wind'|'shot'|'clash'|'eruption'|'castleHit'} kind
   * @param {{ from?: {x,y,z}, to?: {x,y,z}, side?: 'me'|'opp', fromSide?: 'me'|'opp', soldierId?: string, attackerId?: string, defenderId?: string, color?: string, power?: number }} opts
   */
  triggerEffect(kind, opts = {}) {
    if (!this.renderer || !this.THREE || this.hidden || this.disabled) return;
    const THREE = this.THREE;

    const to = opts.to
      ?? (opts.soldierId && this.soldierEntries.get(opts.soldierId)?.curPos)
      ?? (opts.defenderId && this.soldierEntries.get(opts.defenderId)?.curPos)
      ?? (opts.side ? this.castleWorldPos(opts.side) : { x: 0, y: 0.5, z: 0 });
    const from = opts.from
      ?? (opts.attackerId && this.soldierEntries.get(opts.attackerId)?.curPos)
      ?? (opts.fromSide ? this.castleWorldPos(opts.fromSide) : { x: 0, y: 1.5, z: to.z > 0 ? -6.5 : 6.5 });
    const power = opts.power ?? 6;

    if (kind === 'clash') {
      if (opts.attackerId) this.playUnitAction(opts.attackerId, 'attack');
      if (opts.defenderId) this.playUnitAction(opts.defenderId, 'attack');
      else if (opts.soldierId) this.playUnitAction(opts.soldierId, 'attack');
      const col = opts.color ?? '#ffd94a';
      this.spawnRing(to, col, 2.0, 0.34);
      this.spawnBurst(to, col, 16, 4.6, 0.42, 3.4);
      this.flashLight(col, 4.5, to, 0.25);
      return;
    }

    if (kind === 'fire') {
      // High-arc blazing 3D fireball -> explosion dome + shockwaves + camera cue
      const isHeavy = power >= 10;
      const geo = new THREE.IcosahedronGeometry(isHeavy ? 0.68 : 0.48, 1);
      const mat = new THREE.MeshStandardMaterial({ color: '#ff8818', emissive: '#ff4400', emissiveIntensity: 3.4, roughness: 0.2 });
      const orb = new THREE.Mesh(geo, mat);
      this.fxGroup.add(orb);
      const dur = isHeavy ? 0.44 : 0.36;

      if (isHeavy) {
        this.playCinematicCue({
          yaw: to.x * 0.06,
          pitch: (32 * Math.PI) / 180,
          dist: Math.max(11.5, this.camState.targetDist * 0.78),
          look: { x: to.x * 0.5, y: 1.0, z: to.z * 0.65 },
          dur: 0.85,
        });
      }

      this.activeEffects.push({
        age: 0,
        dur,
        update: (t) => {
          orb.position.set(
            from.x + (to.x - from.x) * t,
            1.4 + Math.sin(t * Math.PI) * (isHeavy ? 5.6 : 4.2),
            from.z + (to.z - from.z) * t,
          );
          orb.rotation.x += 0.25;
          orb.rotation.y += 0.3;
        },
        cleanup: () => {
          this.fxGroup.remove(orb);
          geo.dispose();
          mat.dispose();
          this.spawnRing(to, '#ff6a14', isHeavy ? 4.4 : 3.4, 0.48);
          if (isHeavy) this.spawnRing(to, '#ffe066', 3.0, 0.38, 0.45);
          this.spawnBurst(to, '#ff7a18', isHeavy ? 30 : 22, isHeavy ? 6.8 : 5.8, 0.65, 4.8);
          this.flashLight('#ff5a00', isHeavy ? 10.5 : 8.0, to, 0.45);
          this.addCameraShake(isHeavy ? 0.42 : 0.30, isHeavy ? 0.38 : 0.28);
        },
      });
      return;
    }

    if (kind === 'lightning') {
      const isHeavy = power >= 8;
      const pts = [];
      for (let i = 0; i <= 7; i++) {
        const f = i / 7;
        const jitter = i === 0 || i === 7 ? 0 : 0.68;
        pts.push(new THREE.Vector3(
          to.x + (Math.random() - 0.5) * jitter,
          12.5 * (1 - f) + 0.2,
          to.z + (Math.random() - 0.5) * jitter,
        ));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const geo = new THREE.TubeGeometry(curve, 18, isHeavy ? 0.20 : 0.14, 6, false);
      const mat = new THREE.MeshStandardMaterial({ color: '#e8fbff', emissive: '#66d8ff', emissiveIntensity: 4.5, transparent: true, opacity: 1 });
      const bolt = new THREE.Mesh(geo, mat);
      this.fxGroup.add(bolt);
      this.spawnRing(to, '#66e0ff', isHeavy ? 3.8 : 3.0, 0.40);
      this.spawnBurst(to, '#99eeff', isHeavy ? 24 : 18, 5.4, 0.48, 3.8);
      this.flashLight('#66ddff', isHeavy ? 11.0 : 9.0, to, 0.35);
      this.addCameraShake(isHeavy ? 0.36 : 0.28, 0.28);
      this.activeEffects.push({
        age: 0,
        dur: 0.30,
        update: (t) => { mat.opacity = 1 - t; },
        cleanup: () => { this.fxGroup.remove(bolt); geo.dispose(); mat.dispose(); },
      });
      return;
    }

    if (kind === 'ice') {
      const geo = new THREE.ConeGeometry(0.34, 1.85, 5);
      const mat = new THREE.MeshStandardMaterial({
        color: '#99eeff', emissive: '#22aaff', emissiveIntensity: 1.4, roughness: 0.1, transparent: true, opacity: 0.88,
      });
      const spikes = [];
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const m = new THREE.Mesh(geo, mat);
        m.position.set(to.x + Math.cos(a) * 1.15, -0.8, to.z + Math.sin(a) * 1.15);
        m.rotation.z = -Math.cos(a) * 0.28;
        m.rotation.x = Math.sin(a) * 0.28;
        this.fxGroup.add(m);
        spikes.push(m);
      }
      this.spawnRing(to, '#55d8ff', 2.8, 0.55);
      this.flashLight('#44ccff', 5.5, to, 0.45);
      this.activeEffects.push({
        age: 0,
        dur: 0.72,
        update: (t) => {
          const rise = t < 0.25 ? t / 0.25 : 1;
          const fade = t > 0.65 ? 1 - (t - 0.65) / 0.35 : 1;
          mat.opacity = 0.88 * fade;
          for (const m of spikes) m.position.y = -0.8 + rise * 1.55;
        },
        cleanup: () => { for (const m of spikes) this.fxGroup.remove(m); geo.dispose(); mat.dispose(); },
      });
      return;
    }

    if (kind === 'heal') {
      const geo = new THREE.CylinderGeometry(1.45, 1.65, 5.5, 18, 1, true);
      const mat = new THREE.MeshBasicMaterial({
        color: '#66ffaa', transparent: true, opacity: 0.48, side: THREE.DoubleSide, depthWrite: false,
      });
      const pillar = new THREE.Mesh(geo, mat);
      pillar.position.set(to.x, 2.75, to.z);
      this.fxGroup.add(pillar);
      this.spawnRing(to, '#77ffbb', 2.4, 0.55);
      this.spawnBurst(to, '#ffe877', 16, 2.2, 0.68, 5.5);
      this.flashLight('#55ff99', 5.0, to, 0.48);
      this.activeEffects.push({
        age: 0,
        dur: 0.62,
        update: (t) => {
          pillar.rotation.y += 0.08;
          mat.opacity = 0.48 * (1 - t);
          pillar.scale.set(1 + t * 0.3, 1 + t * 0.2, 1 + t * 0.3);
        },
        cleanup: () => { this.fxGroup.remove(pillar); geo.dispose(); mat.dispose(); },
      });
      return;
    }

    if (kind === 'poison') {
      this.spawnRing(to, '#9c44ff', 2.8, 0.60);
      this.spawnBurst(to, '#66dd44', 20, 3.0, 0.72, 3.8);
      this.flashLight('#9038ff', 4.5, to, 0.45);
      return;
    }

    if (kind === 'wind') {
      this.spawnRing(to, '#77ffdd', 3.4, 0.48, 0.8);
      this.spawnBurst(to, '#aaffee', 18, 6.0, 0.50, 2.5);
      return;
    }

    if (kind === 'shot') {
      if (opts.attackerId) {
        const sEntry = this.soldierEntries.get(opts.attackerId);
        this.playUnitAction(opts.attackerId, sEntry?.type === 'mage' ? 'cast' : 'shoot');
      }
      const col = opts.color ?? '#ffe066';
      const geo = new THREE.SphereGeometry(0.24, 10, 10);
      const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 3.2 });
      const proj = new THREE.Mesh(geo, mat);
      this.fxGroup.add(proj);
      this.activeEffects.push({
        age: 0,
        dur: 0.25,
        update: (t) => {
          proj.position.set(
            from.x + (to.x - from.x) * t,
            1.15 + Math.sin(t * Math.PI) * 1.85,
            from.z + (to.z - from.z) * t,
          );
        },
        cleanup: () => {
          this.fxGroup.remove(proj);
          geo.dispose();
          mat.dispose();
          this.spawnBurst(to, col, 12, 3.6, 0.35, 2.2);
          this.spawnRing(to, col, 1.6, 0.28);
        },
      });
      return;
    }

    if (kind === 'eruption') {
      this.spawnRing(to, '#ff4800', 3.5, 0.55);
      this.spawnBurst(to, '#ff6810', 26, 5.2, 0.72, 6.5);
      this.flashLight('#ff4400', 7.5, to, 0.5);
      this.addCameraShake(0.30, 0.30);
      return;
    }

    // CastleHit / Default
    const col = opts.color ?? '#ffd94a';
    this.spawnRing(to, col, kind === 'castleHit' ? 3.5 : 1.8, 0.38);
    this.spawnBurst(to, col, kind === 'castleHit' ? 22 : 14, 4.8, 0.45, 3.6);
    if (kind === 'castleHit') {
      if (opts.side) {
        const cEntry = this.castleEntries.get(opts.side);
        if (cEntry) {
          cEntry.hitFlash = 1.0;
          cEntry.recoilTime = 0.32;
        }
      }
      this.flashLight('#ff7733', 7.5, to, 0.35);
      this.addCameraShake(0.32, 0.30);
      if ((opts.power ?? 0) >= 8) {
        this.playCinematicCue({
          yaw: opts.side === 'opp' ? 0.14 : -0.14,
          pitch: (30 * Math.PI) / 180,
          dist: Math.max(11.8, this.camState.targetDist * 0.80),
          look: { x: to.x, y: 1.4, z: to.z * 0.75 },
          dur: 0.72,
        });
      }
    }
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

  resize({ snapCamera = false } = {}) {
    if (!this.renderer || !this.camera || !this.hostEl) return;
    const rect = this.hostEl.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width || window.innerWidth || 390));
    const h = Math.max(1, Math.round(rect.height || window.innerHeight || 844));
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.camera.aspect = aspect;

    const vFovRad = (this.camera.fov * Math.PI) / 180;
    const tanHalfV = Math.tan(vFovRad / 2);
    const targetHalfW = aspect < 0.78 ? 5.95 : 5.75;
    const distForWidth = targetHalfW / (tanHalfV * aspect);
    const distForHeight = 9.2 / tanHalfV;
    this.defaultDist = clamp(Math.max(15.2, Math.min(distForWidth, distForHeight * 1.24)), CAM_BOUNDS.minDist, CAM_BOUNDS.maxDist);

    // Measure vertical center offset of #board within #scenery so both castles fit inside #board
    const boardEl = typeof document !== 'undefined' ? document.getElementById('board') : null;
    const bRect = boardEl?.getBoundingClientRect?.();
    if (bRect && bRect.height > 100 && rect.height > 100) {
      const boardMidY = bRect.top + bRect.height * 0.5;
      const hostMidY = rect.top + rect.height * 0.5;
      const normOffset = (hostMidY - boardMidY) / rect.height; // > 0 when board is above host center
      this.defaultZShift = clamp(normOffset * 13.5, -0.4, 1.55);
    } else {
      this.defaultZShift = aspect < 0.78 ? 1.35 : 0.45;
    }

    if (!this.camState.userCustomized && !this.camState.focusTarget) {
      const d = this.getModeDefaults(this.cameraMode);
      this.camState.targetYaw = d.yaw;
      this.camState.targetPitch = d.pitch;
      this.camState.targetDist = d.dist;
      this.camState.targetLook = { ...d.look };
      if (snapCamera) this.snapCameraToTarget();
    }

    this.camera.updateProjectionMatrix();

    if (this.stageGroup && !this.hidden) {
      this.renderFrame(performance.now());
    }
  }

  maybeStartLoop() {
    if (typeof requestAnimationFrame === 'undefined') return;
    if (this.rafId || this.disposed || this.hidden || (typeof document !== 'undefined' && document.hidden) || !this.stageGroup) return;
    this.lastFrameTime = performance.now();
    const tick = (now) => {
      this.rafId = 0;
      if (this.disposed || this.hidden || (typeof document !== 'undefined' && document.hidden) || !this.stageGroup) return;
      this.renderFrame(now);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stopLoop() {
    if (this.rafId && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  renderFrame(now) {
    if (!this.renderer || !this.scene || !this.camera) return;
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrameTime) * 0.001));
    this.lastFrameTime = now;
    const t = (now - this.startTime) * 0.001;
    const reduced = prefersReducedMotion();

    // 1. Environment sway & glow pulse
    if (!reduced) {
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

    // 2. Hierarchical 3D soldier animations (idle, march, gallop, attack, cast, hit)
    for (const s of this.soldierEntries.values()) {
      this.updateSoldierAnimation(s, t, dt, reduced);
    }

    // 3. Monster idle breathing, hover & hit flash
    for (const m of this.monsterEntries.values()) {
      const bob = reduced ? 0 : Math.sin(t * 2.6 + m.phase) * 0.08;
      m.group.position.set(m.targetPos.x, m.targetPos.y + bob, m.targetPos.z);
      if (m.model && !reduced) {
        const s = 0.85 * (1 + Math.sin(t * 2.8 + m.phase) * 0.035);
        m.model.scale.set(0.85, s, 0.85);
      }
      if (m.hitFlash > 0) {
        m.hitFlash = Math.max(0, m.hitFlash - dt * 3.5);
        for (const mat of m.materials) {
          if (!mat.emissive) continue;
          mat.emissive.set(m.hitFlash > 0.01 ? '#ff4422' : '#000000');
          mat.emissiveIntensity = m.hitFlash * 2.0;
        }
      }
    }

    // 4. Castle banners, spirit orbits, hit shudder & collapse animation
    for (const c of this.castleEntries.values()) {
      this.updateCastleAnimation(c, t, dt, reduced);
    }

    // 5. Active 3D Magic, Combat VFX & Defeat Knockouts
    for (let i = this.activeEffects.length - 1; i >= 0; i--) {
      const fx = this.activeEffects[i];
      fx.age += dt;
      const progress = Math.min(1, fx.age / fx.dur);
      fx.update(progress, dt);
      if (fx.age >= fx.dur) {
        fx.cleanup();
        this.activeEffects.splice(i, 1);
      }
    }

    // 6. Camera System Update (orbit, zoom, focus, cinematic cues, collision bounds & trauma shake)
    this.applyCameraTransform(dt);

    // 7. Project 3D coordinates to 2D DOM UI badges & hit areas
    this.onProjectOverlay?.(this);

    // 8. Render WebGL Scene & Track Performance / Adaptive Quality
    this.renderer.render(this.scene, this.camera);
    this.fpsFrames++;
    const winElapsed = now - this.fpsWindowStart;
    if (winElapsed >= 500) {
      this.currentFps = Number(((this.fpsFrames * 1000) / winElapsed).toFixed(1));
      this.currentFrameMs = Number((winElapsed / this.fpsFrames).toFixed(2));
      this.fpsFrames = 0;
      this.fpsWindowStart = now;

      // Automatic quality fallback if sustained < 42 FPS
      if (this.currentFps < 42 && this.qualityTier === 'high') {
        this.lowFpsStreak++;
        if (this.lowFpsStreak >= 3) {
          this.qualityTier = 'medium';
          this.renderer.setPixelRatio(1);
        }
      } else {
        this.lowFpsStreak = 0;
      }
    }
  }

  getPerfStats() {
    const info = this.renderer?.info;
    const mem = typeof performance !== 'undefined' ? performance.memory : null;
    return {
      active3d: Boolean(this.renderer && !this.hidden && !this.disabled && this.stageGroup),
      stageId: this.stageId,
      cameraMode: this.cameraMode,
      qualityTier: this.qualityTier,
      fps: this.currentFps,
      frameMs: this.currentFrameMs,
      loadMs: this.lastLoadMs,
      drawCalls: info?.render?.calls ?? 0,
      triangles: info?.render?.triangles ?? 0,
      geometries: info?.memory?.geometries ?? 0,
      textures: info?.memory?.textures ?? 0,
      jsHeapMB: mem ? Number((mem.usedJSHeapSize / (1024 * 1024)).toFixed(1)) : null,
    };
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
    delete this.appEl.dataset.camMode;
  }
}
