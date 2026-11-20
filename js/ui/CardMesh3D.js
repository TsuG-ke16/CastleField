// Blender で作った 3D カードモデル（assets/models/card-*.glb）を three.js で読み込み、
// 枠・絵・窓・裏スキン・浮き彫りマスク・レアリティの偏光（ホロ）を張りかえて組み立てる共通モジュール。
// CardZoom3D（長押し拡大）・Hand3D（手札）・CardFx3D（出す・引く・合成の演出）で共有する。
// three.js と GLTFLoader は 3D カードを表示し始めるまで動的 import しない（ホーム画面を重くしない）。

import { UI_CONFIG } from './config.js';
import { frameAsset, kindIcon } from './cardFrame.js';
import { reliefPaths } from './CardRelief.js';
import { rankSkinBack } from './skinArt.js';

const MODEL_KEYS = new Set(['common', 'uncommon', 'rare', 'epic', 'legendary', 'special', 'beast']);
const RANK_MODEL_MAP = {
  iron: 'common', bronze: 'common', silver: 'uncommon', gold: 'rare',
  platinum: 'epic', diamond: 'legendary', master: 'legendary', champion: 'legendary',
};

/** レアリティごとの材質設定（明るいカートゥーン調を保ちつつ、高レアほど光沢・偏光・金縁を強める） */
const RARITY_MATERIAL = {
  common:    { edgeColor: 0x7b7066, metalness: 0.14, roughness: 0.56, clearcoat: 0.12, iridescence: 0.0,  ornamentIri: 0.0,  normalScale: 0.55 },
  uncommon:  { edgeColor: 0x3d8556, metalness: 0.30, roughness: 0.44, clearcoat: 0.25, iridescence: 0.05, ornamentIri: 0.05, normalScale: 0.70 },
  rare:      { edgeColor: 0x3873c2, metalness: 0.52, roughness: 0.32, clearcoat: 0.48, iridescence: 0.32, ornamentIri: 0.25, normalScale: 0.85 },
  epic:      { edgeColor: 0x753dad, metalness: 0.64, roughness: 0.26, clearcoat: 0.65, iridescence: 0.55, ornamentIri: 0.45, normalScale: 1.00 },
  legendary: { edgeColor: 0xd9a838, metalness: 0.82, roughness: 0.20, clearcoat: 0.88, iridescence: 0.42, ornamentIri: 0.35, normalScale: 1.15 },
  special:   { edgeColor: 0xd6ccf5, metalness: 0.72, roughness: 0.16, clearcoat: 0.95, iridescence: 1.00, ornamentIri: 1.00, normalScale: 0.95 },
  beast:     { edgeColor: 0xa51d34, metalness: 0.68, roughness: 0.24, clearcoat: 0.78, iridescence: 0.28, ornamentIri: 0.22, normalScale: 1.05 },
};

let webglChecked = null;
export function webglAvailable() {
  if (webglChecked !== null) return webglChecked;
  try {
    const c = document.createElement('canvas');
    webglChecked = Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    webglChecked = false;
  }
  return webglChecked;
}

/** 3D カードを表示してよいか（?flat=1・UI_CONFIG.card3d === false・WebGL 不可なら false） */
export function card3DWanted() {
  if (new URLSearchParams(location.search).get('flat') === '1') return false;
  if (UI_CONFIG.card3d === false) return false;
  return webglAvailable();
}

export function cardMotionReduced() {
  return Boolean(UI_CONFIG.reducedMotion)
    || document.documentElement.classList.contains('reduced-motion')
    || matchMedia('(prefers-reduced-motion: reduce)').matches;
}

let threeBundlePromise = null;
export function loadCardThree() {
  threeBundlePromise ??= Promise.all([
    import('./vendor/three.module.min.js'),
    import('./vendor/GLTFLoader.js'),
  ]).then(([THREE, { GLTFLoader }]) => ({ THREE, GLTFLoader }));
  return threeBundlePromise;
}

const kebab = (s) => String(s ?? '').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

/** カードの絵の PNG パス（js/ui/art.js の命名規則に合わせる） */
export function cardArtUrl(type) {
  if (!type) return null;
  if (typeof type === 'string' && type.startsWith('beast_')) {
    return `assets/cards/card-beast-${kebab(type.slice(6))}.png`;
  }
  return `assets/cards/card-${kebab(type)}.png`;
}

/** カードに使う GLB モデルのキー */
export function modelKeyOf(def, skin = null) {
  if (def?.monster) return 'beast';
  if (skin && RANK_MODEL_MAP[skin]) return RANK_MODEL_MAP[skin];
  if (def?.rarity && MODEL_KEYS.has(def.rarity)) return def.rarity;
  return 'common';
}

function windowUrlOf(def, skin = null) {
  if (def?.monster) return 'assets/cards/window-beast.png';
  if (skin) return 'assets/cards/window-common.png';
  const r = def?.rarity;
  if (r && ['common', 'uncommon', 'rare', 'epic', 'legendary', 'special'].includes(r)) {
    return `assets/cards/window-${r}.png`;
  }
  return 'assets/cards/window-common.png';
}

function extractCssUrl(value) {
  const m = /url\(\s*["']?([^"')]+)["']?\s*\)/.exec(String(value ?? ''));
  return m ? m[1] : null;
}

/** 装備中のカード裏スキン（またはランク報酬スキン）の画像と浮き彫りマスクの URL を返す */
export function resolveCardBack(skin = null) {
  if (skin) {
    const rb = rankSkinBack(skin);
    if (rb) return { art: rb.art, raised: rb.raised };
  }
  const app = document.getElementById('app');
  if (app?.hasAttribute('data-painted-back')) {
    const style = getComputedStyle(app);
    const art = extractCssUrl(style.getPropertyValue('--back-art'));
    const raised = app.hasAttribute('data-back-raised') ? extractCssUrl(style.getPropertyValue('--back-raised')) : null;
    if (art) return { art, raised };
  }
  return { art: 'assets/ui/card-back.png', raised: null };
}

// ---------- アセットのキャッシュ ----------

const modelCache = new Map();
const imageCache = new Map();
const textureCache = new Map();
const alphaMaskCache = new Map();
const normalMapCache = new Map();

function loadImage(url) {
  if (!url) return Promise.resolve(null);
  if (imageCache.has(url)) return imageCache.get(url);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
  imageCache.set(url, p);
  return p;
}

export async function loadCardTemplate(modelKey) {
  const key = MODEL_KEYS.has(modelKey) ? modelKey : 'common';
  if (modelCache.has(key)) return modelCache.get(key);
  const promise = (async () => {
    const { GLTFLoader } = await loadCardThree();
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(`assets/models/card-${key}.glb`);
    return gltf.scene;
  })();
  modelCache.set(key, promise);
  return promise;
}

async function loadTexture(THREE, url, { srgb = true } = {}) {
  if (!url) return null;
  const cacheKey = `${srgb ? 's' : 'l'}:${url}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);
  const promise = (async () => {
    const img = await loadImage(url);
    if (!img) return null;
    const tex = new THREE.Texture(img);
    tex.flipY = false; // glTF の UV に合わせる
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  })();
  textureCache.set(cacheKey, promise);
  return promise;
}

/** *-raised.png のアルファ値を alphaMap（輝度）に変換したテクスチャを返す */
async function loadAlphaMaskTexture(THREE, url) {
  if (!url) return null;
  if (alphaMaskCache.has(url)) return alphaMaskCache.get(url);
  const promise = (async () => {
    const img = await loadImage(url);
    if (!img) return null;
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return null;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      const a = px[i + 3];
      px[i] = a;
      px[i + 1] = a;
      px[i + 2] = a;
      px[i + 3] = 255;
    }
    ctx.putImageData(data, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.flipY = false;
    tex.colorSpace = THREE.NoColorSpace;
    tex.needsUpdate = true;
    return tex;
  })();
  alphaMaskCache.set(url, promise);
  return promise;
}

/** assets/cards/relief/*-relief.png の上半分（法線 XY）を normalMap テクスチャに変換する */
async function loadReliefNormalTexture(THREE, url) {
  if (!url) return null;
  if (normalMapCache.has(url)) return normalMapCache.get(url);
  const promise = (async () => {
    const img = await loadImage(url);
    if (!img) return null;
    const w = img.naturalWidth || img.width;
    const h = Math.floor((img.naturalHeight || img.height) / 2);
    if (!w || !h) return null;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h);
    const px = data.data;
    // R, G が法線 XY（0..255）。B に高さが入っているので、法線 Z を再計算して標準タンジェント法線マップにする
    for (let i = 0; i < px.length; i += 4) {
      const nx = (px[i] / 255) * 2 - 1;
      const ny = (px[i + 1] / 255) * 2 - 1;
      const nz = Math.sqrt(Math.max(0.04, 1 - nx * nx - ny * ny));
      px[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      px[i + 3] = 255;
    }
    ctx.putImageData(data, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.flipY = false;
    tex.colorSpace = THREE.NoColorSpace;
    tex.needsUpdate = true;
    return tex;
  })();
  normalMapCache.set(url, promise);
  return promise;
}

/** 拡大表示・演出用：カード名と左上種別アイコンを 512x768 透明 Canvas に描く */
async function buildLabelTexture(THREE, def) {
  const w = 512, h = 768;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);

  // 左上の種別メダル（css/rarity-assets.css の --med-l: 18.2%, --med-y: 13.9%）
  const kIcon = kindIcon(def);
  if (kIcon) {
    const iconImg = await loadImage(`assets/ui/icon-${kIcon}.png`);
    if (iconImg) {
      const size = 62;
      ctx.drawImage(iconImg, w * 0.182 - size / 2, h * 0.139 - size / 2, size, size);
    }
  }

  // カード名（--name-y: 72%, left/right 14% → 幅 72% = 368px）
  const name = String(def?.name ?? '');
  if (name) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const maxWidth = w * 0.68;
    let fontSize = name.length >= 8 ? 36 : name.length >= 6 ? 42 : 48;
    ctx.font = `900 ${fontSize}px "Hiragino Maru Gothic ProN", "Yu Gothic", "Meiryo", sans-serif`;
    while (fontSize > 22 && ctx.measureText(name).width > maxWidth) {
      fontSize -= 2;
      ctx.font = `900 ${fontSize}px "Hiragino Maru Gothic ProN", "Yu Gothic", "Meiryo", sans-serif`;
    }
    // カートゥーン調のくっきりした読みやすさ（薄いクリームの縁取り＋こげ茶の文字）
    const nameY = def?.monster ? h * 0.755 : h * 0.72;
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255, 248, 232, 0.72)';
    ctx.strokeText(name, w * 0.5, nameY);
    ctx.fillStyle = '#513820';
    ctx.fillText(name, w * 0.5, nameY);
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/** 明るいカートゥーン調に合うスタジオ環境マップとライト（写実すぎず、金・宝石・ホロが映える） */
export function setupCardStudio(THREE, renderer, scene) {
  const hemi = new THREE.HemisphereLight(0xfffaf0, 0x7c6858, 1.45);
  const key = new THREE.DirectionalLight(0xfff6e5, 1.85);
  key.position.set(-2.2, 3.2, 4.2);
  const fill = new THREE.DirectionalLight(0xdcebff, 0.85);
  fill.position.set(2.8, -1.2, 2.8);
  const rim = new THREE.DirectionalLight(0xffe4b5, 0.75);
  rim.position.set(0.5, 2.2, -3.5);
  scene.add(hemi, key, fill, rim);

  // 軽量なプロシージャル環境マップ（金属と偏光のハイライト用）
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0x52463c);
    const topPanel = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 4),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
    );
    topPanel.position.set(-1.5, 4.2, 3.5);
    topPanel.lookAt(0, 0, 0);
    const sidePanel = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 6),
      new THREE.MeshBasicMaterial({ color: 0xffe8c2, side: THREE.DoubleSide }),
    );
    sidePanel.position.set(4.5, 0.5, 2.0);
    sidePanel.lookAt(0, 0, 0);
    const coolPanel = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 5),
      new THREE.MeshBasicMaterial({ color: 0xbfe2ff, side: THREE.DoubleSide }),
    );
    coolPanel.position.set(-4.5, -1.5, 1.5);
    coolPanel.lookAt(0, 0, 0);
    envScene.add(topPanel, sidePanel, coolPanel);
    const envRT = pmrem.fromScene(envScene, 0.04);
    scene.environment = envRT.texture;
    pmrem.dispose();
    topPanel.geometry.dispose(); topPanel.material.dispose();
    sidePanel.geometry.dispose(); sidePanel.material.dispose();
    coolPanel.geometry.dispose(); coolPanel.material.dispose();
    return { envRT, key, hemi };
  } catch {
    return { envRT: null, key, hemi };
  }
}

/**
 * 1枚の 3D カードオブジェクト（THREE.Group）を組み立てて返す。
 * @param {object} THREE
 * @param {{ type: string, def: object, rarities?: object, skin?: string|null, rarityColor?: string|null, showLabel?: boolean, dim?: boolean }} spec
 */
export async function buildCardMesh3D(THREE, spec) {
  const { type, def = {}, rarities = null, skin = null, rarityColor = null, showLabel = true, dim = false } = spec;
  const modelKey = modelKeyOf(def, skin);
  const preset = RARITY_MATERIAL[modelKey] ?? RARITY_MATERIAL.common;
  const frameRel = frameAsset(def, rarities, skin);
  const frameUrl = frameRel ? `assets/${frameRel}` : 'assets/cards/frame-common.png';
  const artUrl = cardArtUrl(type);
  const winUrl = windowUrlOf(def, skin);
  const rPaths = reliefPaths(frameUrl);
  const backInfo = resolveCardBack(skin);

  const [template, frameTex, artTex, winTex, raisedMaskTex, reliefNormalTex, backTex, backRaisedMaskTex, labelTex] = await Promise.all([
    loadCardTemplate(modelKey),
    loadTexture(THREE, frameUrl, { srgb: true }),
    loadTexture(THREE, artUrl, { srgb: true }),
    loadTexture(THREE, winUrl, { srgb: true }),
    rPaths ? loadAlphaMaskTexture(THREE, rPaths.raised) : Promise.resolve(null),
    rPaths ? loadReliefNormalTexture(THREE, rPaths.relief) : Promise.resolve(null),
    loadTexture(THREE, backInfo.art, { srgb: true }),
    backInfo.raised ? loadAlphaMaskTexture(THREE, backInfo.raised) : Promise.resolve(null),
    showLabel ? buildLabelTexture(THREE, def) : Promise.resolve(null),
  ]);

  const group = template.clone(true);
  const ownMaterials = [];
  const ownTextures = [];
  if (labelTex) ownTextures.push(labelTex);

  const edgeTint = new THREE.Color(rarityColor || preset.edgeColor);
  const dimTint = dim && def.rarity !== 'special' ? new THREE.Color(0x9a958d) : new THREE.Color(0xffffff);

  const trackMat = (mat) => { ownMaterials.push(mat); return mat; };

  group.traverse((obj) => {
    if (!obj.isMesh) return;
    switch (obj.name) {
      case 'CardBody':
        obj.material = trackMat(new THREE.MeshPhysicalMaterial({
          color: edgeTint,
          metalness: preset.metalness,
          roughness: preset.roughness,
          clearcoat: preset.clearcoat,
          clearcoatRoughness: 0.22,
          iridescence: preset.ornamentIri,
          iridescenceIOR: 1.45,
        }));
        break;

      case 'FrontFrame':
        obj.material = trackMat(new THREE.MeshPhysicalMaterial({
          color: dimTint,
          map: frameTex,
          normalMap: reliefNormalTex,
          normalScale: new THREE.Vector2(preset.normalScale, preset.normalScale),
          alphaTest: 0.25,
          metalness: preset.metalness * 0.42,
          roughness: preset.roughness + 0.08,
          clearcoat: preset.clearcoat * 0.85,
          clearcoatRoughness: 0.25,
          iridescence: preset.iridescence * 0.8,
          iridescenceIOR: 1.38,
        }));
        break;

      case 'FrontWindow':
        obj.material = trackMat(new THREE.MeshStandardMaterial({
          color: dimTint,
          map: winTex,
          roughness: 0.65,
          metalness: 0.04,
        }));
        break;

      case 'FrontArt':
        obj.material = trackMat(new THREE.MeshPhysicalMaterial({
          color: dimTint,
          map: artTex,
          transparent: true,
          alphaTest: 0.04,
          roughness: 0.34,
          metalness: 0.05,
          clearcoat: preset.clearcoat * 0.7,
          clearcoatRoughness: 0.22,
          iridescence: preset.iridescence,
          iridescenceIOR: 1.42,
        }));
        break;

      case 'FrontRaised':
        if (raisedMaskTex && frameTex) {
          obj.visible = true;
          obj.material = trackMat(new THREE.MeshPhysicalMaterial({
            color: dimTint,
            map: frameTex,
            alphaMap: raisedMaskTex,
            normalMap: reliefNormalTex,
            normalScale: new THREE.Vector2(preset.normalScale * 1.1, preset.normalScale * 1.1),
            alphaTest: 0.25,
            metalness: Math.min(0.95, preset.metalness + 0.15),
            roughness: Math.max(0.14, preset.roughness - 0.08),
            clearcoat: 1.0,
            clearcoatRoughness: 0.14,
            iridescence: Math.min(1.0, preset.iridescence + 0.15),
            iridescenceIOR: 1.48,
          }));
        } else {
          obj.visible = false;
        }
        break;

      case 'FrontBanner':
        obj.material = trackMat(new THREE.MeshPhysicalMaterial({
          color: dimTint,
          map: frameTex,
          alphaTest: 0.25,
          roughness: 0.48,
          metalness: 0.12,
          clearcoat: preset.clearcoat * 0.4,
        }));
        break;

      case 'FrontLabel':
        if (labelTex) {
          obj.visible = true;
          obj.renderOrder = 20;
          obj.material = trackMat(new THREE.MeshBasicMaterial({
            map: labelTex,
            transparent: true,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -2,
          }));
        } else {
          obj.visible = false;
        }
        break;

      case 'FrontOrnament':
        obj.material = trackMat(new THREE.MeshPhysicalMaterial({
          color: edgeTint.clone().lerp(new THREE.Color(0xfff4d6), 0.28),
          metalness: Math.min(0.95, preset.metalness + 0.16),
          roughness: Math.max(0.12, preset.roughness - 0.08),
          clearcoat: 0.95,
          clearcoatRoughness: 0.15,
          iridescence: preset.ornamentIri,
          iridescenceIOR: 1.5,
        }));
        break;

      case 'BackFace':
        obj.material = trackMat(new THREE.MeshPhysicalMaterial({
          color: 0xffffff,
          map: backTex,
          transparent: Boolean(backInfo.raised),
          alphaTest: 0.05,
          metalness: 0.22,
          roughness: 0.36,
          clearcoat: 0.45,
          clearcoatRoughness: 0.22,
          iridescence: 0.18,
          iridescenceIOR: 1.35,
        }));
        break;

      case 'BackRaised':
        if (backRaisedMaskTex && backTex) {
          obj.visible = true;
          obj.material = trackMat(new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            map: backTex,
            alphaMap: backRaisedMaskTex,
            transparent: true,
            alphaTest: 0.12,
            metalness: 0.78,
            roughness: 0.20,
            clearcoat: 1.0,
            clearcoatRoughness: 0.14,
            iridescence: 0.35,
            iridescenceIOR: 1.45,
          }));
        } else {
          obj.visible = false;
        }
        break;
    }
  });

  const dispose = () => {
    for (const m of ownMaterials) m.dispose();
    for (const t of ownTextures) t.dispose();
  };

  return { group, dispose, modelKey };
}
