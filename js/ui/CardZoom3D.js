// 長押し拡大表示（CardZoom.js）用の three.js 3D カードビューア。
// Card3D.js と同じ { render({ quaternion, tiltX, tiltY }), resize(), destroy() } インターフェースを提供し、
// 360度回転・裏面の浮き彫り・傾きによる光の変化・影の動き・動きを減らす設定をそのまま引き継ぐ。

import { UI_CONFIG } from './config.js';
import { CARD_LIGHT } from './CardRelief.js';
import { buildCardMesh3D, card3DWanted, cardMotionReduced, loadCardThree, setupCardStudio } from './CardMesh3D.js';

const config = UI_CONFIG.card3D;
const rad = Math.PI / 180;
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

function cardAxes([w, x, y, z], tiltX, tiltY) {
  const cx = Math.cos(tiltX * rad), sx = Math.sin(tiltX * rad);
  const cy = Math.cos(tiltY * rad), sy = Math.sin(tiltY * rad);
  const tilt = ([a, b, c]) => {
    const depth = -sy * a + cy * c;
    return [cy * a + sy * c, cx * b - sx * depth, sx * b + cx * depth];
  };
  return [
    tilt([1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)]),
    tilt([2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)]),
    tilt([2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)]),
  ];
}

function paintShadow(shadow, [right, down, normal]) {
  if (!shadow) return;
  const { minScale, heightRange, shift, opacity, softOpacity, floorSlope } = config.shadow;
  const footprint = (axis) => axis[2] - axis[1] * CARD_LIGHT[2] / CARD_LIGHT[1];
  const span = Math.hypot(
    right[0] - right[1] * CARD_LIGHT[0] / CARD_LIGHT[1],
    1.5 * (down[0] - down[1] * CARD_LIGHT[0] / CARD_LIGHT[1]),
  );
  const spread = Math.hypot(footprint(right), 1.5 * footprint(down)) * floorSlope;
  const width = minScale + (1 - minScale) * span;
  const height = 1 + (spread - 1) * heightRange;
  const slant = normal[0] * normal[2];
  shadow.style.transform = `translate3d(${(slant * shift).toFixed(1)}%, 0, 0) scale(${width.toFixed(3)}, ${height.toFixed(3)})`;
  shadow.style.opacity = clamp(opacity - spread * softOpacity, 0, 1).toFixed(3);
}

// 拡大表示用の WebGLRenderer は 1 つだけ使い回す（開くたびに WebGL コンテキストを増やさない）
let sharedGl = null;

function getZoomRenderer(THREE) {
  if (sharedGl && !sharedGl.getContext().isContextLost()) return sharedGl;
  const canvas = document.createElement('canvas');
  canvas.className = 'zoom-gl-card';
  canvas.setAttribute('aria-hidden', 'true');
  sharedGl = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  sharedGl.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  sharedGl.outputColorSpace = THREE.SRGBColorSpace;
  sharedGl.toneMapping = THREE.ACESFilmicToneMapping;
  sharedGl.toneMappingExposure = 1.08;
  return sharedGl;
}

const identity = [1, 0, 0, 0];

/**
 * 拡大表示のステージに Blender 3D カードをマウントする。
 * WebGL 不可・?flat=1・設定オフ・読み込み失敗時は null を返す（CardZoom.js が従来の CSS 3D に戻す）。
 */
export async function createCardZoom3D(stage, { type, def, rarities, skin, rarityColor, shadow, isCurrent = () => true }) {
  if (!card3DWanted()) return null;
  try {
    const { THREE } = await loadCardThree();
    if (!isCurrent()) return null;

    const gl = getZoomRenderer(THREE);
    const canvas = gl.domElement;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 2 / 3, 0.1, 40);
    camera.position.set(0, 0, 7.6);
    camera.lookAt(0, 0, 0);

    const studio = setupCardStudio(THREE, gl, scene);
    const built = await buildCardMesh3D(THREE, { type, def, rarities, skin, rarityColor, showLabel: true });
    if (!isCurrent()) {
      built.dispose();
      studio.envRT?.dispose();
      return null;
    }

    const pivot = new THREE.Group();
    pivot.add(built.group);
    scene.add(pivot);

    // stage の中に 3D カード用キャンバスを配置
    stage.classList.add('zoom-stage-gl');
    stage.append(canvas);

    let active = true;
    let lastState = null;
    let size = { w: 0, h: 0 };
    const qBase = new THREE.Quaternion();
    const qTilt = new THREE.Quaternion();
    const eTilt = new THREE.Euler(0, 0, 0, 'XYZ');

    const drawNow = () => {
      if (!active || document.hidden || !size.w || !size.h) return;
      gl.render(scene, camera);
    };

    const onVisibility = () => { if (!document.hidden) drawNow(); };
    document.addEventListener('visibilitychange', onVisibility);

    function resize() {
      if (!active) return;
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      if (w === size.w && h === size.h) return;
      size = { w, h };
      gl.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      gl.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (shadow) shadow.style.setProperty('--shadow-alpha', config.shadow.baseAlpha);
      lastState = null;
      drawNow();
    }

    function render({ quaternion = identity, tiltX = 0, tiltY = 0 } = {}) {
      if (!active) return;
      const still = cardMotionReduced();
      if (still) tiltX = tiltY = 0;
      const state = [...quaternion, tiltX, tiltY, still];
      if (lastState?.every((v, i) => v === state[i])) return;
      lastState = state;

      // CSS 座標系 [w, x, y, z]（x右・y下・z手前）→ three.js（x右・y上・z手前）
      // y 軸反転に伴い、軸ベクトルの y 成分と回転方向の符号を合わせる
      const [qw, qx, qy, qz] = quaternion;
      qBase.set(-qx, qy, -qz, qw).normalize();
      eTilt.set(-tiltX * rad, tiltY * rad, 0, 'XYZ');
      qTilt.setFromEuler(eTilt);
      pivot.quaternion.copy(qTilt).multiply(qBase);

      // 傾きに合わせてメインライトもわずかに動かし、金属・宝石の輝きを引き立てる
      if (studio.key) {
        studio.key.position.set(-2.2 + tiltY * 0.06, 3.2 - tiltX * 0.06, 4.2);
      }

      paintShadow(shadow, cardAxes(quaternion, tiltX, tiltY));
      drawNow();
    }

    function destroy() {
      if (!active) return;
      active = false;
      document.removeEventListener('visibilitychange', onVisibility);
      stage.classList.remove('zoom-stage-gl');
      if (canvas.parentElement === stage) canvas.remove();
      built.dispose();
      studio.envRT?.dispose();
      scene.clear();
      if (shadow) {
        shadow.style.removeProperty('transform');
        shadow.style.removeProperty('opacity');
        shadow.style.removeProperty('--shadow-alpha');
      }
    }

    return { render, resize, destroy };
  } catch (error) {
    console.warn('[card3d] 拡大表示の 3D モデルを使えないため、従来の表示に戻します', error);
    return null;
  }
}
