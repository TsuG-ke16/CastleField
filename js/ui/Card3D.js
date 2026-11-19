// mountMiniCard で作ったカードを CSS 3D にする。親に perspective を設定し、必要なら影の要素を渡す。
import { UI_CONFIG } from './config.js';
import { createRelief, reliefPaths, CARD_LIGHT } from './CardRelief.js';
import { hasCardFoil } from './Hologram.js';

const config = UI_CONFIG.card3D;
const rad = Math.PI / 180;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const halfLight = [CARD_LIGHT[0], CARD_LIGHT[1], CARD_LIGHT[2] + 1];
const halfLength = Math.hypot(...halfLight);

let reducedMotionQuery;
export function cardMotionReduced() {
  return document.documentElement.classList.contains('reduced-motion')
    || (reducedMotionQuery ??= matchMedia('(prefers-reduced-motion: reduce)')).matches;
}

function layer(className) {
  const element = document.createElement('span');
  element.className = className;
  element.setAttribute('aria-hidden', 'true');
  return element;
}

// CSS と同じ x 右・y 下・z 手前。列ベクトルは Rx(tiltX) · Ry(tiltY) · Q の各軸。
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

function rotationCss([w, x, y, z]) {
  const length = Math.hypot(x, y, z);
  if (length < 1e-5) return '';
  const angle = 2 * Math.atan2(length, Math.abs(w)) / rad * Math.sign(w || 1);
  const axes = [x, y, z].map(value => Number((value / length).toFixed(5)));
  return ` rotate3d(${axes.join(', ')}, ${angle.toFixed(3)}deg)`;
}

function paintShadow(shadow, [right, down, normal]) {
  if (!shadow) return;
  const { minScale, heightRange, shift, opacity, softOpacity, floorSlope } = config.shadow;
  // 光の方向に沿って床へ投影し、カードの縦横の軸から影の幅と奥行きの変化を求める。
  const footprint = axis => axis[2] - axis[1] * CARD_LIGHT[2] / CARD_LIGHT[1];
  const span = Math.hypot(right[0] - right[1] * CARD_LIGHT[0] / CARD_LIGHT[1],
    1.5 * (down[0] - down[1] * CARD_LIGHT[0] / CARD_LIGHT[1]));
  const spread = Math.hypot(footprint(right), 1.5 * footprint(down)) * floorSlope;
  const width = minScale + (1 - minScale) * span;
  const height = 1 + (spread - 1) * heightRange;
  // 表裏を入れ替えても、影には同じ向きのカードとして映る。
  const slant = normal[0] * normal[2];
  shadow.style.transform = `translate3d(${(slant * shift).toFixed(1)}%, 0, 0) scale(${width.toFixed(3)}, ${height.toFixed(3)})`;
  shadow.style.opacity = clamp(opacity - spread * softOpacity, 0, 1).toFixed(3);
}

let degraded = false;
const identity = [1, 0, 0, 0];

/**
 * 装着済みのカードを受け取り、render({ quaternion, tiltX, tiltY })、resize()、destroy() を返す。
 * quaternion は正規化済みの [w,x,y,z]、傾きは度。DOM に置いたあと resize() してから render()。
 * 端末・アプリの動きを減らす設定に従う。shadow はカードと同じ親に置く任意の要素。
 * quality は auto/full/lite。destroy() で凹凸を解放し、追加した DOM を取り除く。
 */
export function createCard3D(card, { rarityColor, shadow, quality = 'auto' } = {}) {
  const frame = card.querySelector('.mini-card-frame');
  const image = card.querySelector('.mini-card-image');
  const source = frame?.getAttribute('src');
  const paths = reliefPaths(source);
  const rarity = card.dataset.rarity;
  const beast = card.hasAttribute('data-beast');
  const added = [];
  const initialStyles = new Map();
  const initialTransform = card.style.transform;
  const setStyle = (name, value) => {
    if (!initialStyles.has(name)) initialStyles.set(name, card.style.getPropertyValue(name));
    card.style.setProperty(name, value);
  };
  const add = (parent, className) => {
    const el = layer(className);
    added.push(el);
    parent.append(el);
    return el;
  };
  const abs = path => `url("${new URL(path, document.baseURI).href}")`;
  card.classList.add('card-3d');
  setStyle('--card-depth', config.depth);
  setStyle('--edge-shade-base', config.edgeShade);
  setStyle('--card-edge-color', rarityColor || config.fallbackColor);
  for (const side of ['left', 'right', 'top', 'bottom']) add(card, `zoom-edge zoom-edge-${side}`);

  const back = add(card, 'zoom-back');
  const backImg = document.createElement('img');
  backImg.className = 'zoom-back-img';
  backImg.src = 'assets/ui/card-back.png';
  backImg.alt = '';
  backImg.draggable = false;
  back.append(backImg);
  add(back, 'zoom-back-shade');
  // 裏面の金の飾り・紋章：裏のスキンに地図があるときだけ、別の層にして手前に浮かせる（css/card-zoom.css）
  add(card, 'zoom-back-raised');
  add(back, 'zoom-sheen');
  add(back, 'foil-sheet zoom-foil');
  let raised = null;
  const walls = [];
  if (source && image) {
    card.classList.add('zoom-3d');
    setStyle('--frame-url', abs(source));
    setStyle('--card-recess', config.recess);
    setStyle('--card-name-depth', config.nameDepth);
    setStyle('--card-medal-depth', config.medalDepth);
    setStyle('--card-raised-depth', config.raisedDepth);
    if (!beast) {
      add(card, 'zoom-floor');
      for (let i = 0; i < config.wallLayers; i++) walls.push(add(card, 'zoom-wall'));
      add(image, 'zoom-recess');
    }
    add(image, 'zoom-sheen');
    if (hasCardFoil(rarity)) add(image, 'foil-sheet zoom-foil');
    if (paths) {
      setStyle('--raised-url', abs(paths.raised));
      add(card, 'zoom-raised-shade');
      raised = add(card, 'zoom-raised');
      const img = frame.cloneNode();
      img.className = 'zoom-raised-img';
      raised.append(img);
    }
  }

  let active = true;
  let relief;
  let loading = false;
  let previous;
  let motion;
  let wallCount;
  let lastDraw = 0;
  let slowFrames = 0;
  const canUseRelief = () => paths && quality !== 'lite' && (quality === 'full' || (!degraded
    && !(navigator.deviceMemory && navigator.deviceMemory <= 2)
    && !(navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2)));
  const updateWalls = () => {
    const count = motion ? config.reducedWallLayers : relief ? config.wallLayers : config.liteWallLayers;
    if (count === wallCount) return;
    wallCount = count;
    walls.forEach((wall, i) => {
      wall.hidden = i >= count;
      if (!wall.hidden) wall.style.setProperty('--wall-depth', config.recess * (i + 1) / (count + 1));
    });
  };
  const dropRelief = () => {
    relief?.destroy();
    relief = null;
    card.classList.remove('zoom-gl');
    card.classList.add('zoom-lite');
    if (active) updateWalls();
    lastDraw = slowFrames = 0;
  };

  function render({ quaternion = identity, tiltX = 0, tiltY = 0 } = {}) {
    if (!active) return;
    const still = cardMotionReduced();
    if (still) tiltX = tiltY = 0;
    const state = [...quaternion, tiltX, tiltY, still];
    if (previous?.every((value, i) => value === state[i])) return;
    previous = state;
    if (motion !== still) {
      motion = still;
      if (still) dropRelief();
      else updateWalls();
    }
    const tilt = still ? '' : ` rotateX(${tiltX.toFixed(2)}deg) rotateY(${tiltY.toFixed(2)}deg)`;
    card.style.transform = `translate3d(0,0,0)${tilt}${rotationCss(quaternion)}`;

    const axes = cardAxes(quaternion, tiltX, tiltY);
    const [right, down, normal] = axes;
    const front = normal[2] >= 0;
    card.classList.toggle('zoom-flipped', !front);
    // 裏は表を Y 軸で半回転した座標。見えている面に光と視線の中間方向を投影する。
    const hx = dot(right, halfLight) * (front ? 1 : -1);
    const hy = dot(down, halfLight);
    const facing = dot(normal, halfLight) * (front ? 1 : -1) / halfLength;
    const position = v => `${clamp(50 + v * config.lightTravel, 0, 100).toFixed(1)}%`;
    // 背景画像は面より大きいので、background-position と光点の移動方向は逆。
    setStyle('--foil-x', position(CARD_LIGHT[0] - hx));
    setStyle('--foil-y', position(CARD_LIGHT[1] - hy));
    setStyle('--gloss-x', position(hx));
    setStyle('--gloss-y', position(hy));
    setStyle('--face-shade', (config.faceShade * (1 - Math.max(0, facing))).toFixed(3));
    setStyle('--recess-x', (dot(right, CARD_LIGHT) * -config.recessShadow).toFixed(4));
    setStyle('--recess-y', (dot(down, CARD_LIGHT) * -config.recessShadow).toFixed(4));
    setStyle('--edge-light-x', (dot(right, CARD_LIGHT) * config.edgeShade).toFixed(3));
    setStyle('--edge-light-y', (dot(down, CARD_LIGHT) * config.edgeShade).toFixed(3));
    setStyle('--edge-hue-angle', `${Math.atan2(hy, hx) / rad}deg`);
    paintShadow(shadow, axes);

    if (still || !canUseRelief()) {
      if (!card.classList.contains('zoom-lite')) dropRelief();
      return;
    }
    if (relief && front) {
      const start = performance.now();
      if (!relief.draw(axes)) { dropRelief(); return; }
      const { drawBudget, frameGap, slowLimit } = config;
      const slow = performance.now() - start > drawBudget || (lastDraw && start - lastDraw > frameGap);
      slowFrames = slow ? slowFrames + 1 : Math.max(0, slowFrames - 1);
      lastDraw = start;
      if (slowFrames > slowLimit && quality !== 'full') { degraded = true; dropRelief(); }
    } else {
      lastDraw = slowFrames = 0;
    }
  }

  const prepareRelief = async () => {
    if (relief || loading || !canUseRelief() || cardMotionReduced()) return;
    loading = true;
    const current = () => active && card.isConnected && !cardMotionReduced();
    const result = await createRelief({ frameSrc: source, preset: rarity, isCurrent: current,
      pixelRatioLimit: quality === 'full' ? 2 : config.reliefPixelRatio,
      onLost: () => { if (active) dropRelief(); } }).catch(() => null);
    loading = false;
    if (!current()) { result?.destroy(); return; }
    if (!result) { dropRelief(); return; }
    relief = result;
    updateWalls();
    frame.after(result.base);
    raised.after(result.raised);
    result.resize();
    card.classList.remove('zoom-lite');
    card.classList.add('zoom-gl');
    if (previous) {
      const [w, x, y, z, tiltX, tiltY] = previous;
      previous = null;
      render({ quaternion: [w, x, y, z], tiltX, tiltY });
    }
  };

  return {
    render,
    resize() {
      setStyle('--card-unit', `${card.clientWidth}px`);
      if (shadow) shadow.style.setProperty('--shadow-alpha', config.shadow.baseAlpha);
      relief?.resize();
      previous = null;
      void prepareRelief();
    },
    destroy() {
      if (!active) return;
      active = false;
      dropRelief();
      for (const el of added) el.remove();
      card.classList.remove('card-3d', 'zoom-3d', 'zoom-lite', 'zoom-flipped');
      for (const [name, value] of initialStyles) card.style.setProperty(name, value);
      card.style.transform = initialTransform;
      if (shadow) {
        shadow.style.removeProperty('transform');
        shadow.style.removeProperty('opacity');
        shadow.style.removeProperty('--shadow-alpha');
      }
    },
  };
}
