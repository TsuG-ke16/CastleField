// 拡大表示のカードを、Blender で作った板（assets/models/card-slab.glb）と three.js で描く。
// 板（角丸・厚み・縁）が glb、カードの絵（枠・イラスト・名前・マーク）は画面の DOM から canvas に写して、板の表に貼る。
// Card3D.js（CSS の 3D）と同じ使い方：render({ quaternion, tiltX, tiltY })・resize()・destroy()。
// 読み込めない・WebGL が使えないときは null を返すので、呼ぶ側は CSS の 3D のままにする。
import { CARD_LIGHT } from './CardRelief.js';
import { rankSkinBack } from './skinArt.js';
import { cardMotionReduced } from './Card3D.js';

const MODEL = 'assets/models/card-slab.glb';
const BACK = 'assets/ui/card-back.png';
const PX_PER_UNIT = 600;          // 表の絵の細かさ（カードの幅 1 あたりのピクセル）
const MARGIN = 0.25;              // 枠の飾り（王冠など）が板の外にはみ出すぶん。カードの幅に対する割合
const FOIL = new Set(['rare', 'epic', 'legendary', 'special']);
const rad = Math.PI / 180;

let libs;       // three.js と GLTFLoader（最初に使うときに読み込む）
let slab;       // 板のモデル（1回だけ読む）
const loadLibs = () => libs ??= Promise.all([
  import('../vendor/three/three.module.min.js'),
  import('../vendor/three/GLTFLoader.js'),
]).then(([THREE, { GLTFLoader }]) => ({ THREE, GLTFLoader }));
const loadSlab = ({ GLTFLoader }) => slab ??= new GLTFLoader().loadAsync(new URL(MODEL, document.baseURI).href).catch((error) => { slab = null; throw error; });

const loadImage = (src) => new Promise((resolve) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => resolve(null);
  image.src = src;
});
async function readyImage(img) {
  if (!img) return null;
  if (!img.complete) await new Promise((resolve) => { img.addEventListener('load', resolve, { once: true }); img.addEventListener('error', resolve, { once: true }); });
  return img.naturalWidth ? img : null;
}
/** インラインの SVG を画像にする（色は今の見た目に合わせて固定する） */
async function svgImage(svg, width, height) {
  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', Math.max(1, Math.round(width)));
  clone.setAttribute('height', Math.max(1, Math.round(height)));
  clone.style.color = getComputedStyle(svg).color;
  const text = new XMLSerializer().serializeToString(clone).replaceAll('currentColor', getComputedStyle(svg).color);
  return loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`);
}

/** img を、object-fit に合わせて枠（x, y, w, h）の中に描く */
function drawFitted(ctx, image, fit, x, y, w, h) {
  const iw = image.naturalWidth || image.width;
  const ih = image.naturalHeight || image.height;
  let scale = 1;
  if (fit === 'cover') scale = Math.max(w / iw, h / ih);
  else if (fit === 'contain' || fit === 'scale-down') scale = Math.min(w / iw, h / ih);
  else { ctx.drawImage(image, x, y, w, h); return; }
  const dw = iw * scale, dh = ih * scale;
  ctx.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

/** three.js と板のモデルを先に読む（読めなければ例外。CSSの3Dのままにする判断に使う） */
export async function preloadCardGL() {
  if (new URLSearchParams(location.search).get('card3d') === 'css') throw new Error('card3d=css');
  await loadSlab(await loadLibs());
}

/** 画面のカード（mountMiniCard）を、枠の飾りのはみ出しを含めて canvas に写す */
async function paintFace(card) {
  const box = card.getBoundingClientRect();
  const unit = PX_PER_UNIT / box.width;            // 画面のピクセル → canvas のピクセル
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(PX_PER_UNIT * (1 + MARGIN * 2));
  canvas.height = Math.round(PX_PER_UNIT * (1.5 + MARGIN * 2));
  const ctx = canvas.getContext('2d');
  ctx.translate(MARGIN * PX_PER_UNIT, MARGIN * PX_PER_UNIT);
  ctx.imageSmoothingQuality = 'high';
  const place = (el) => {
    const r = el.getBoundingClientRect();
    return { x: (r.left - box.left) * unit, y: (r.top - box.top) * unit, w: r.width * unit, h: r.height * unit };
  };

  // 絵（枠の窓の奥）
  const windowEl = card.querySelector('.mini-card-image');
  if (windowEl) {
    const win = place(windowEl);
    ctx.save();
    ctx.beginPath(); ctx.rect(win.x, win.y, win.w, win.h); ctx.clip();
    const img = await readyImage(windowEl.querySelector('img'));
    if (img) {
      const at = place(img);
      drawFitted(ctx, img, getComputedStyle(img).objectFit, at.x, at.y, at.w, at.h);
    } else {
      const svg = windowEl.querySelector('svg');
      const at = svg && place(svg);
      const drawn = svg && await svgImage(svg, at.w, at.h);
      if (drawn) ctx.drawImage(drawn, at.x, at.y, at.w, at.h);
    }
    ctx.restore();
  }
  // 枠
  const frame = await readyImage(card.querySelector('.mini-card-frame'));
  if (frame) { const at = place(card.querySelector('.mini-card-frame')); ctx.drawImage(frame, at.x, at.y, at.w, at.h); }
  // 名前
  const nameEl = card.querySelector('.mini-card-name');
  if (nameEl?.textContent) {
    const at = place(nameEl);
    const style = getComputedStyle(nameEl);
    ctx.font = `${style.fontWeight} ${parseFloat(style.fontSize) * unit}px ${style.fontFamily}`;
    ctx.fillStyle = style.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(nameEl.textContent, at.x + at.w / 2, at.y + at.h / 2, at.w);
  }
  // 種類・レアリティのマーク
  for (const el of card.querySelectorAll('.mini-card-kind, .mini-card-rarity')) {
    const at = place(el);
    const img = await readyImage(el.querySelector('img'));
    if (img) {
      const r = place(img);
      drawFitted(ctx, img, getComputedStyle(img).objectFit, r.x, r.y, r.w, r.h);
      continue;
    }
    const svg = el.querySelector('svg');
    if (svg) {
      const r = place(svg);
      const drawn = await svgImage(svg, r.w, r.h);
      if (drawn) { ctx.drawImage(drawn, r.x, r.y, r.w, r.h); continue; }
    }
    const text = el.textContent.trim();
    if (text) {
      const style = getComputedStyle(el);
      ctx.font = `900 ${parseFloat(style.fontSize) * unit}px ${style.fontFamily}`;
      ctx.fillStyle = style.color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, at.x + at.w / 2, at.y + at.h / 2);
    }
  }
  return canvas;
}

/**
 * card：mountMiniCard で作った、画面に置いてあるカード（大きさを測るので、表示してから呼ぶ）。
 * stage：カードの親（ここに canvas を足す）。rarityColor：側面の色。
 * 使えないときは null。
 */
export async function createCardGL(card, { stage, rarityColor = '#9aa3ad' } = {}) {
  let renderer;
  try {
    const { THREE, GLTFLoader } = await loadLibs();
    const gltf = await loadSlab({ GLTFLoader });
    const face = await paintFace(card);
    if (!card.isConnected) return null;
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    if (!renderer.getContext()) throw new Error('no webgl');

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
    const group = new THREE.Group();
    scene.add(group);

    // 光（CSS の 3D と同じ向き。y と z は three.js の向きに直す）
    const light = new THREE.DirectionalLight('#ffffff', 2.4);
    light.position.set(CARD_LIGHT[0] * 3, -CARD_LIGHT[1] * 3, CARD_LIGHT[2] * 3);
    scene.add(light, new THREE.AmbientLight('#fff4e0', 1.5));

    // 板（Blender 製）。マテリアルは名前で見つけて、色と裏の絵を付ける
    const model = gltf.scene.clone(true);
    const owned = [];
    const own = (value) => { owned.push(value); return value; };
    const backSource = card.dataset.skin ? rankSkinBack(card.dataset.skin)?.art : null;
    const backTexture = own(await new THREE.TextureLoader().loadAsync(new URL(backSource || BACK, document.baseURI).href));
    backTexture.flipY = false;                  // glTF の UV は上が 0
    backTexture.colorSpace = THREE.SRGBColorSpace;
    backTexture.anisotropy = 4;
    model.traverse((node) => {
      if (!node.isMesh) return;
      node.geometry = own(node.geometry.clone());
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      const next = mats.map((m) => {
        if (m.name === 'edge') return own(new THREE.MeshStandardMaterial({ color: rarityColor, metalness: 0.55, roughness: 0.38 }));
        if (m.name === 'back') return own(new THREE.MeshStandardMaterial({ map: backTexture, roughness: 0.5 }));
        return own(new THREE.MeshStandardMaterial({ color: '#efe6cf', roughness: 0.6 }));
      });
      node.material = Array.isArray(node.material) ? next : next[0];
    });
    group.add(model);

    // 表の絵（枠の飾りが板の外にはみ出すので、板より大きな板に貼って、透けるところは抜く）
    const faceTexture = own(new THREE.CanvasTexture(face));
    faceTexture.colorSpace = THREE.SRGBColorSpace;
    faceTexture.anisotropy = 8;
    const foil = FOIL.has(card.dataset.rarity) || card.classList.contains('wild');
    const faceMaterial = own(foil
      ? new THREE.MeshPhysicalMaterial({ map: faceTexture, transparent: true, alphaTest: 0.04, roughness: 0.4, iridescence: 0.55, iridescenceIOR: 1.6, clearcoat: 0.6, clearcoatRoughness: 0.25 })
      : new THREE.MeshStandardMaterial({ map: faceTexture, transparent: true, alphaTest: 0.04, roughness: 0.55 }));
    faceMaterial.polygonOffset = true;
    faceMaterial.polygonOffsetFactor = -2;
    const plane = new THREE.Mesh(own(new THREE.PlaneGeometry(1 + MARGIN * 2, 1.5 + MARGIN * 2)), faceMaterial);
    plane.position.z = 0.055 / 2 + 0.0015;
    group.add(plane);

    const canvas = renderer.domElement;
    canvas.className = 'zoom-gl-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    stage.append(canvas);
    const hidden = card.style.visibility;
    card.style.visibility = 'hidden';          // 絵の元として置いておくだけ（測るために場所は残す）

    const tiltQ = (tx, ty) => {
      // CSS は y が下・z が手前（左手系）。回転の軸は (x, y, z) → (-x, y, -z) に直す
      const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -tx * rad);
      const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ty * rad);
      return qx.multiply(qy);
    };
    let last = { quaternion: [1, 0, 0, 0], tiltX: 0, tiltY: 0 };
    let active = true;
    const draw = () => {
      if (!active) return;
      const still = cardMotionReduced();
      const [w, x, y, z] = last.quaternion;
      const q = tiltQ(still ? 0 : last.tiltX, still ? 0 : last.tiltY).multiply(new THREE.Quaternion(-x, y, -z, w));
      group.quaternion.copy(q);
      renderer.render(scene, camera);
    };
    const layout = () => {
      // canvas は stage より少し大きくして、回したときに角が切れないようにする
      const s = stage.getBoundingClientRect();
      const c = card.getBoundingClientRect();
      const extraX = c.width * 0.35, extraY = c.width * 0.35;
      const width = Math.round(s.width + extraX * 2), height = Math.round(s.height + extraY * 2);
      canvas.style.cssText = `position:absolute;left:${-extraX}px;top:${-extraY}px;width:${width}px;height:${height}px;pointer-events:none;`;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      // 板のところ（z = 0）で、カードの幅が画面のカードの幅と同じになる距離
      const distance = (height / c.width) / (2 * Math.tan(camera.fov * rad / 2));
      camera.position.set(0, 0, distance);
      camera.updateProjectionMatrix();
      const cx = c.left + c.width / 2 - (s.left - extraX + width / 2);
      const cy = c.top + c.height / 2 - (s.top - extraY + height / 2);
      group.position.set(cx / c.width, -cy / c.width, 0);
      draw();
    };
    const lost = (event) => { event.preventDefault(); };
    canvas.addEventListener('webglcontextlost', lost);

    layout();
    return {
      render(state) { last = { ...last, ...state }; draw(); },
      resize: layout,
      destroy() {
        if (!active) return;
        active = false;
        canvas.removeEventListener('webglcontextlost', lost);
        for (const item of owned) item.dispose?.();
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove();
        card.style.visibility = hidden;
      },
    };
  } catch (error) {
    console.warn('3Dのカードを使えないので、CSSの3Dで表示します', error);
    renderer?.dispose();
    return null;
  }
}
