// 拡大表示のカードを、Blender で作った板（assets/models/card-slab.glb）と three.js で描く。
// 板（角丸・厚み・縁）が glb、カードの絵（枠・イラスト・名前・マーク）は画面の DOM から canvas に写して、板の表に貼る。
// Card3D.js（CSS の 3D）と同じ使い方：render({ quaternion, tiltX, tiltY })・resize()・destroy()。
// 読み込めない・WebGL が使えないときは null を返すので、呼ぶ側は CSS の 3D のままにする。
import { CARD_LIGHT, RELIEF_FRAG, RELIEF_PRESETS, reliefPaths } from './CardRelief.js';
import { UI_CONFIG } from './config.js';
import { rankSkinBack } from './skinArt.js';
import { cardMotionReduced, cardAxes } from './Card3D.js';

const MODEL = 'assets/models/card-slab.glb';
const BACK = 'assets/ui/card-back.png';
const PX_PER_UNIT = 600;          // 表の絵の細かさ（カードの幅 1 あたりのピクセル）
const MARGIN = 0.25;              // 枠の飾り（王冠など）が板の外にはみ出すぶん。カードの幅に対する割合
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
  const params = new URLSearchParams(location.search);
  if (params.get('card3d') === 'css' || params.get('fx') === 'lite') throw new Error('CSSの3Dを使う設定です');
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
  const rects = {};
  const place = (el) => {
    const r = el.getBoundingClientRect();
    return { x: (r.left - box.left) * unit, y: (r.top - box.top) * unit, w: r.width * unit, h: r.height * unit };
  };

  // 絵（枠の窓の奥）
  const windowEl = card.querySelector('.mini-card-image');
  if (windowEl) {
    const win = place(windowEl);
    rects.win = win;
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
  if (frame) { const at = place(card.querySelector('.mini-card-frame')); rects.frame = at; ctx.drawImage(frame, at.x, at.y, at.w, at.h); }
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
  return { canvas, rects };
}


const blank = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const FACE_W = Math.round(PX_PER_UNIT * (1 + MARGIN * 2));
const FACE_H = Math.round(PX_PER_UNIT * (1.5 + MARGIN * 2));
const M = MARGIN * PX_PER_UNIT;

/** 凹凸の地図（上半分：法線と高さ／下半分：金属・つや・宝石）と、浮かせる部品の地図を、顔の canvas と同じ位置に並べる */
function reliefMaps(images, frameRect) {
  const [reliefImg, raisedImg] = images;
  const relief = blank(FACE_W, FACE_H * 2);
  const rc = relief.getContext('2d');
  rc.fillStyle = 'rgb(128,128,0)'; rc.fillRect(0, 0, FACE_W, FACE_H);   // 凹凸なし・高さ 0
  rc.fillStyle = 'rgb(0,0,0)'; rc.fillRect(0, FACE_H, FACE_W, FACE_H);  // 金属・つや・宝石なし
  const half = reliefImg.naturalHeight / 2;
  const { x, y, w, h } = frameRect;
  rc.drawImage(reliefImg, 0, 0, reliefImg.naturalWidth, half, M + x, M + y, w, h);
  rc.drawImage(reliefImg, 0, half, reliefImg.naturalWidth, half, M + x, FACE_H + M + y, w, h);
  const raised = blank(FACE_W, FACE_H);
  raised.getContext('2d').drawImage(raisedImg, M + x, M + y, w, h);
  return { relief, raised };
}

/** 偏光のフィルム（css/hologram.css の --foil と同じ色。CSS では背景が窓の 225%×200% で、位置が光で動く） */
const FOIL = {
  rare: { kind: 'linear', angle: 118, period: 0.66, stops: [[0, '#d8fbff00'], [0.38, '#d8fbff00'], [0.41, '#d8fbff15'], [0.45, '#c9edffbd'], [0.46, '#ffffff'], [0.53, '#ffffff00'], [0.66, '#ffffff00']], opacity: 0.44 },
  epic: { kind: 'conic', from: 42, at: [0.45, 0.5], stops: [[0, '#a184ff00'], [0.1625, '#a184ffb0'], [0.325, '#ff9fe4ae'], [0.4875, '#90d6ff87'], [0.65, '#90d6ff00'], [1, '#90d6ff00']], opacity: 0.44 },
  legendary: { kind: 'conic', from: 140, at: [0.5, 0.5], stops: [[0, '#ffdc7b30'], [1 / 6, '#ffe775de'], [2 / 6, '#fcab4466'], [3 / 6, '#b3fff5ad'], [4 / 6, '#f9b2eac9'], [5 / 6, '#fff4bd'], [1, '#ffdc7b30']], opacity: 0.44 },
  special: { kind: 'conic', from: 50, at: [0.4, 0.58], stops: [[0, '#ed9dee99'], [0.2, '#91c6ffb3'], [0.4, '#a6ffdfb5'], [0.6, '#ffed9bb0'], [0.8, '#ff8596c7'], [1, '#ed9dee99']], opacity: 0.58 },
};
function foilTexture(THREE, rarity, aspect) {
  const spec = FOIL[rarity];
  const w = 512, h = Math.round(512 / aspect);                 // 窓と同じ縦横比
  const W = Math.round(w * 2.25), H = Math.round(h * 2);        // 背景のぶんの大きさ
  const canvas = blank(W, H);
  const ctx = canvas.getContext('2d');
  let gradient;
  if (spec.kind === 'conic') {
    gradient = ctx.createConicGradient((spec.from - 90) * rad, spec.at[0] * W, spec.at[1] * H);
    for (const [at, color] of spec.stops) gradient.addColorStop(at, color);
  } else {
    // 角度 a の線（CSS は上が 0 度で時計まわり）の長さ L に沿って、period ごとに繰り返す
    const a = spec.angle * rad;
    const dx = Math.sin(a), dy = -Math.cos(a);
    const L = Math.abs(W * dx) + Math.abs(H * dy);
    const cx = W / 2, cy = H / 2;
    gradient = ctx.createLinearGradient(cx - dx * L / 2, cy - dy * L / 2, cx + dx * L / 2, cy + dy * L / 2);
    for (let rep = 0; rep * spec.period < 1; rep++) {
      for (const [at, color] of spec.stops) { const t = rep * spec.period + at; if (t <= 1) gradient.addColorStop(t, color); }
    }
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.repeat.set(1 / 2.25, 1 / 2);
  return { texture, opacity: spec.opacity };
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
    const { canvas: face, rects } = await paintFace(card);
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
    const rarity = card.dataset.rarity;
    const depth = 0.055;
    const faceSize = [1 + MARGIN * 2, 1.5 + MARGIN * 2];
    const faceTexture = own(new THREE.CanvasTexture(face));
    faceTexture.anisotropy = 8;
    const frameSrc = card.querySelector('.mini-card-frame')?.getAttribute('src');
    const paths = reliefPaths(frameSrc);
    const images = paths && rects.frame ? await Promise.all([loadImage(paths.relief), loadImage(paths.raised)]) : [];
    const shaders = [];       // 凹凸のシェーダー（表の下地と、浮かせる部品）
    let setLight = null;
    if (images[0] && images[1]) {
      // 凹凸・金属・宝石・キラキラは、CSS 版（CardRelief.js）と同じ式で光らせる
      const maps = reliefMaps(images, rects.frame);
      const raw = (canvas, premultiply = false) => {
        const t = own(new THREE.CanvasTexture(canvas));
        t.flipY = false; t.colorSpace = THREE.NoColorSpace; t.premultiplyAlpha = premultiply;
        t.generateMipmaps = false; t.minFilter = THREE.LinearFilter;
        return t;
      };
      const frameTex = raw(face, true);
      const reliefTex = raw(maps.relief), raisedTex = raw(maps.raised);
      const preset = RELIEF_PRESETS[card.dataset.skin ? `skin-${card.dataset.skin}` : rarity] ?? RELIEF_PRESETS.other;
      const fragment = RELIEF_FRAG.replace(/\bsmooth\b/g, 'smth');      // smooth は GLSL ES 3.0 の予約語
      const vertex = 'varying vec2 vUv; void main() { vUv = vec2(uv.x, 1. - uv.y); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }';
      const make = (layer, z, order) => {
        const material = own(new THREE.ShaderMaterial({
          vertexShader: vertex, fragmentShader: fragment, transparent: true, premultipliedAlpha: true, depthWrite: false,
          uniforms: {
            uFrame: { value: frameTex }, uRelief: { value: reliefTex }, uRaised: { value: raisedTex },
            uL: { value: new THREE.Vector3() }, uV: { value: new THREE.Vector3(0, 0, 1) }, uM: { value: new THREE.Matrix3() },
            uFlat: { value: CARD_LIGHT[2] }, uBump: { value: preset.bump }, uSpec: { value: preset.spec }, uEnv: { value: preset.env },
            uIri: { value: preset.iri }, uGem: { value: preset.gem }, uPar: { value: 0.018 }, uKd: { value: preset.kd },
            uLayer: { value: layer }, uShadow: { value: 0.012 }, uGlit: { value: preset.glit ?? 0 },
          },
        }));
        if (layer === 0) { material.polygonOffset = true; material.polygonOffsetFactor = -2; }
        const mesh = new THREE.Mesh(own(new THREE.PlaneGeometry(...faceSize)), material);
        mesh.position.z = z; mesh.renderOrder = order;
        group.add(mesh);
        shaders.push(material);
      };
      make(0, depth / 2 + 0.0015, 1);
      make(1, depth / 2 + UI_CONFIG.card3D.raisedDepth, 3);
      setLight = (axes) => {
        const L = axes.map(([x, y, z]) => x * CARD_LIGHT[0] + y * CARD_LIGHT[1] + z * CARD_LIGHT[2]);
        const V = axes.map((axis) => axis[2]);
        for (const m of shaders) { m.uniforms.uL.value.set(...L); m.uniforms.uV.value.set(...V); m.uniforms.uM.value.fromArray(axes.flat()); }
      };
    } else {
      // 凹凸の地図がない枠は、ふつうの材質で貼る
      faceTexture.colorSpace = THREE.SRGBColorSpace;
      const plain = own(new THREE.MeshStandardMaterial({ map: faceTexture, transparent: true, alphaTest: 0.04, roughness: 0.55 }));
      plain.polygonOffset = true; plain.polygonOffsetFactor = -2;
      const mesh = new THREE.Mesh(own(new THREE.PlaneGeometry(...faceSize)), plain);
      mesh.position.z = depth / 2 + 0.0015;
      group.add(mesh);
    }

    // 偏光のフィルム（レア以上・適応）：絵の窓の上に重ねて、光の向きで色が動く
    let foilTex = null;
    const foilKey = card.classList.contains('wild') ? 'special' : FOIL[rarity] ? rarity : null;
    if (foilKey && rects.win) {
      const win = rects.win;
      const { texture, opacity } = foilTexture(THREE, foilKey, win.w / win.h);
      foilTex = own(texture);
      const material = own(new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      const mesh = new THREE.Mesh(own(new THREE.PlaneGeometry(win.w / PX_PER_UNIT, win.h / PX_PER_UNIT)), material);
      mesh.position.set((win.x + win.w / 2) / PX_PER_UNIT - 0.5, 0.75 - (win.y + win.h / 2) / PX_PER_UNIT, depth / 2 + 0.004);
      mesh.renderOrder = 2;
      group.add(mesh);
    }

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
      const axes = cardAxes(last.quaternion, still ? 0 : last.tiltX, still ? 0 : last.tiltY);
      setLight?.(axes);
      if (foilTex) {
        // 光と視線の中間方向への傾きで、フィルムの位置を決める（Card3D.js と同じ式）
        const half = [CARD_LIGHT[0], CARD_LIGHT[1], CARD_LIGHT[2] + 1];
        const hx = axes[0][0] * half[0] + axes[0][1] * half[1] + axes[0][2] * half[2];
        const hy = axes[1][0] * half[0] + axes[1][1] * half[1] + axes[1][2] * half[2];
        const travel = UI_CONFIG.card3D.lightTravel;
        const pos = (v) => Math.min(100, Math.max(0, 50 + v * travel)) / 100;
        foilTex.offset.set((1 - 1 / 2.25) * pos(CARD_LIGHT[0] - hx), (1 - 1 / 2) * (1 - pos(CARD_LIGHT[1] - hy)));
      }
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
