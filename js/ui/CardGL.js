// 拡大表示のカードを、Blender で作った板（assets/models/card-slab.glb）と three.js で描く。
// 板（角丸・厚み・縁）が glb、カードの絵（枠・イラスト・名前・マーク）は画面の DOM から canvas に写して、板の表に貼る。
// Card3D.js（CSS の 3D）と同じ使い方：render({ quaternion, tiltX, tiltY })・resize()・destroy()。
// 読み込めない・WebGL が使えないときは null を返すので、呼ぶ側は CSS の 3D のままにする。
import { CARD_LIGHT, RELIEF_PRESETS, reliefPaths } from './CardRelief.js';
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
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
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
    ctx.fillStyle = '#fff4dc'; ctx.fillRect(win.x, win.y, win.w, win.h);   // 絵が透けるところの下地（CSS 版の .zoom-floor と同じ色）
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


/** 枠の外形（王冠・角の飾りを除いた本体）を求める。行・列ごとの不透明な点の数が、最大の6割を超える範囲 */
function bodyBounds(canvas) {
  const { width, height } = canvas;
  const data = canvas.getContext('2d').getImageData(0, 0, width, height).data;
  const rows = new Uint16Array(height), cols = new Uint16Array(width);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3] > 128) { rows[y]++; cols[x]++; }
  const range = (counts) => {
    const limit = Math.max(...counts) * 0.6;
    let a = 0, b = counts.length - 1;
    while (a < b && counts[a] < limit) a++;
    while (b > a && counts[b] < limit) b--;
    return [a, b + 1];
  };
  const [x0, x1] = range(cols), [y0, y1] = range(rows);
  return { x0, x1, y0, y1 };
}

const blank = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const FACE_W = Math.round(PX_PER_UNIT * (1 + MARGIN * 2));
const FACE_H = Math.round(PX_PER_UNIT * (1.5 + MARGIN * 2));
const M = MARGIN * PX_PER_UNIT;

/** 画像を canvas に写してピクセルを読む */
function pixels(image, w, h) {
  const c = blank(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, w, h);
  return { canvas: c, data: ctx.getImageData(0, 0, w, h).data };
}

const RELIEF_HEIGHT = 0.03;     // 凹凸の高さ（カードの幅を 1 として。地図の明るさ 1 のところ）
const RAISED_HEIGHT = 0.03;     // 浮かせる部品（王冠・宝石）のさらに手前への持ち上げ
const GRID = [256, 384];        // 凹凸のメッシュの分割数
const MAX_SPARKS = 2600;        // 1面あたりのキラキラの粒の数の上限

/** 決まった種から出す乱数（開くたびに粒の位置が変わらないように） */
function seeded(seed) {
  let t = seed >>> 0;
  return () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}

/**
 * 凹凸の地図（上半分 B＝高さ／下半分 R＝金属・G＝つや・B＝宝石）と、浮かせる部品の地図から、本物の高さのあるメッシュを作る。
 * place(u, v)：地図の (u, v)（0〜1。左上が 0）を置く位置 [x, y]。uvAt(u, v)：絵のテクスチャの UV。pick(u, v)：絵の色 [r, g, b, a]（0〜255）。
 * 絵が透けているところの面は作らない。宝石と金属の上には、キラキラの粒（sparks）を散らす。
 */
function surfaceMesh(THREE, { reliefImg, raisedImg, place, uvAt, pick, glitter, rainbow, seed }) {
  const sw = reliefImg.naturalWidth, sh = reliefImg.naturalHeight / 2;
  const relief = pixels(reliefImg, sw, sh * 2).data;
  const raised = pixels(raisedImg, sw, sh).data;
  const [nx, ny] = GRID;
  const at = (u, v, row) => ((Math.min(sh - 1, Math.round(v * (sh - 1))) + row) * sw + Math.min(sw - 1, Math.round(u * (sw - 1)))) * 4;
  const count = (nx + 1) * (ny + 1);
  const positions = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const solid = new Uint8Array(count);
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const k = j * (nx + 1) + i;
      const u = i / nx, v = j / ny;
      const lift = relief[at(u, v, 0) + 2] / 255 * RELIEF_HEIGHT + raised[at(u, v, 0) + 3] / 255 * RAISED_HEIGHT;
      const [x, y] = place(u, v);
      positions.set([x, y, 0.0015 + lift], k * 3);
      uvs.set(uvAt(u, v), k * 2);
      solid[k] = pick(u, v)[3] > 8 ? 1 : 0;
    }
  }
  // 絵のない点の高さは、となりの絵のある点にそろえる。そうしないと、持ち上げた飾りの縁から外へ斜めの面ができ、
  // 縁の黒い線がその面に引き伸ばされて、飾りの上に浮いた線に見える
  const z = (k) => positions[k * 3 + 2];
  const lifted = new Float32Array(count);
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const k = j * (nx + 1) + i;
      if (solid[k]) continue;
      let best = -1;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii > nx || jj > ny) continue;
        const kk = jj * (nx + 1) + ii;
        if (solid[kk] && z(kk) > best) best = z(kk);
      }
      lifted[k] = best;
    }
  }
  for (let k = 0; k < count; k++) if (!solid[k] && lifted[k] >= 0) positions[k * 3 + 2] = lifted[k];
  const index = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      if (!(solid[a] || solid[b] || solid[c] || solid[d])) continue;      // 透けているところは面を作らない
      index.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();

  // キラキラの粒：宝石の上は大きく少なめ、金属のつやのある所は細かく。粒ごとに向き（facet）が少しずつ違うので、傾けると別の粒が光る
  const random = seeded(seed);
  const normals = geometry.getAttribute('normal').array;
  const out = { position: [], facet: [], tint: [], size: [], seed: [], sharp: [] };
  for (let k = 0; k < count && out.size.length < MAX_SPARKS; k++) {
    if (!solid[k]) continue;
    const i = k % (nx + 1), j = (k - i) / (nx + 1);
    const u = i / nx, v = j / ny;
    const o = at(u, v, sh);
    const metal = relief[o] / 255, smooth = relief[o + 1] / 255, gem = relief[o + 2] / 255;
    const isGem = gem > 0.5;
    const chance = isGem ? 0.07 : glitter * 0.02 * metal * smooth * smooth;
    if (random() >= chance) continue;
    const n = [normals[k * 3], normals[k * 3 + 1], normals[k * 3 + 2]];
    const spread = isGem ? 0.45 : 0.9;
    const f = [n[0] + (random() * 2 - 1) * spread, n[1] + (random() * 2 - 1) * spread, n[2] + random() * 0.2];
    const fl = Math.hypot(...f) || 1;
    out.position.push(positions[k * 3] + n[0] * 0.004, positions[k * 3 + 1] + n[1] * 0.004, positions[k * 3 + 2] + n[2] * 0.004);
    out.facet.push(f[0] / fl, f[1] / fl, f[2] / fl);
    if (isGem) {
      const [r, g, b] = pick(u, v);
      out.tint.push(0.35 + 0.65 * r / 255, 0.35 + 0.65 * g / 255, 0.35 + 0.65 * b / 255);   // 宝石の色を明るくした光
      out.size.push(0.07 + random() * 0.05);
      out.sharp.push(12);
    } else {
      const c = rainbow ? new THREE.Color().setHSL(random(), 0.7, 0.75) : new THREE.Color(1, 0.95, 0.82);
      out.tint.push(c.r, c.g, c.b);
      out.size.push(0.026 + random() * 0.022);
      out.sharp.push(32);
    }
    out.seed.push(random());
  }
  let sparks = null;
  if (out.size.length) {
    sparks = new THREE.BufferGeometry();
    sparks.setAttribute('position', new THREE.Float32BufferAttribute(out.position, 3));
    sparks.setAttribute('facet', new THREE.Float32BufferAttribute(out.facet, 3));
    sparks.setAttribute('tint', new THREE.Float32BufferAttribute(out.tint, 3));
    sparks.setAttribute('size', new THREE.Float32BufferAttribute(out.size, 1));
    sparks.setAttribute('seed', new THREE.Float32BufferAttribute(out.seed, 1));
    sparks.setAttribute('sharp', new THREE.Float32BufferAttribute(out.sharp, 1));
  }
  return { geometry, sparks };
}

/**
 * 材質の地図：絵と同じ大きさの canvas に、つや・金属（G=あらさ・B=金属）と、宝石の光（宝石の所だけ絵の色）を作る。
 * color：絵のピクセル { data, width, height }。rect：凹凸の地図を置く絵の中の範囲（px）
 */
function materialMaps(reliefImg, color, rect) {
  const sw = reliefImg.naturalWidth, sh = reliefImg.naturalHeight / 2;
  const orm = blank(color.width, color.height);
  const oc = orm.getContext('2d');
  oc.fillStyle = 'rgb(0,178,0)'; oc.fillRect(0, 0, color.width, color.height);   // 金属なし・あらさ 0.7
  const emissive = blank(color.width, color.height);
  const ec = emissive.getContext('2d');
  ec.fillStyle = '#000'; ec.fillRect(0, 0, color.width, color.height);
  const x0 = Math.round(rect.x), y0 = Math.round(rect.y);
  const mw = Math.max(1, Math.round(rect.w)), mh = Math.max(1, Math.round(rect.h));
  const mat = blank(mw, mh);
  const mc = mat.getContext('2d', { willReadFrequently: true });
  mc.drawImage(reliefImg, 0, sh, sw, sh, 0, 0, mw, mh);
  const m = mc.getImageData(0, 0, mw, mh);
  const glow = mc.createImageData(mw, mh);
  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      const q = (y * mw + x) * 4;
      const metal = m.data[q], smooth = m.data[q + 1], gem = m.data[q + 2] / 255;
      const cx = x0 + x, cy = y0 + y;
      const c = cx >= 0 && cy >= 0 && cx < color.width && cy < color.height ? (cy * color.width + cx) * 4 : -1;
      if (c >= 0) for (let ch = 0; ch < 3; ch++) glow.data[q + ch] = color.data[c + ch] * gem;
      glow.data[q + 3] = 255;
      m.data[q] = 0; m.data[q + 1] = 255 * (0.7 - 0.55 * smooth / 255); m.data[q + 2] = metal; m.data[q + 3] = 255;
    }
  }
  mc.putImageData(m, 0, 0);
  oc.drawImage(mat, x0, y0);
  mc.putImageData(glow, 0, 0);
  ec.drawImage(mat, x0, y0);
  return { orm, emissive };
}

/** キラキラの粒の材質：光を映す向き（facet）が目の方を向いた粒だけ、星の形に光る。少しずつ瞬く */
function sparkMaterial(THREE, lightDir) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uLight: { value: lightDir }, uScale: { value: 600 }, uTime: { value: 0 } },
    vertexShader: `
      attribute vec3 facet; attribute vec3 tint; attribute float size; attribute float seed; attribute float sharp;
      uniform vec3 uLight; uniform float uScale; uniform float uTime;
      varying vec3 vTint; varying float vI;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.);
        // 粒の向きを時間で少しずつ揺らす：止めていても、次々に別の粒が光をとらえて瞬く
        vec3 wobble = vec3(sin(uTime * (.7 + seed) + seed * 31.), cos(uTime * (.6 + seed * .8) + seed * 17.), 0.) * .22;
        vec3 n = normalize(mat3(modelMatrix) * normalize(facet + wobble));
        vec3 V = normalize(cameraPosition - world.xyz);
        float s = pow(max(dot(reflect(-uLight, n), V), 0.), sharp);
        float twinkle = .6 + .4 * sin(uTime * (1.6 + seed * 2.8) + seed * 60.);
        vI = dot(n, V) > 0. ? min(1.6, s * twinkle * 1.6) : 0.;
        vTint = tint;
        vec4 mv = viewMatrix * world;
        gl_Position = projectionMatrix * mv;
        gl_PointSize = vI < .015 ? 0. : size * uScale / -mv.z * (.45 + .75 * vI);
      }`,
    fragmentShader: `
      varying vec3 vTint; varying float vI;
      void main() {
        vec2 p = gl_PointCoord * 2. - 1.;
        float r2 = dot(p, p);
        float core = exp(-r2 * 26.);
        float halo = exp(-r2 * 5.) * .3;
        float rays = exp(-abs(p.x) * 18.) * exp(-abs(p.y) * 2.4) + exp(-abs(p.y) * 18.) * exp(-abs(p.x) * 2.4);
        float a = (core + halo + rays * .85) * vI;
        if (a < .01) discard;
        gl_FragColor = vec4(mix(vTint, vec3(1.), core) * a, 1.);
      }`,
  });
}

/** 反射に映す部屋（世界に固定）：上の細長い照明と、右のうすい照明。金属の映り込みになる */
function roomEnvironment(THREE, renderer) {
  const room = new THREE.Scene();
  room.add(new THREE.Mesh(new THREE.BoxGeometry(12, 12, 12), new THREE.MeshBasicMaterial({ color: '#9aa1ad', side: THREE.BackSide })));
  const panel = (w, h, color, position, look) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    mesh.position.set(...position); mesh.lookAt(...look); room.add(mesh);
  };
  panel(7, 1.2, new THREE.Color(9, 9, 9), [0, 5.5, 1], [0, 0, 0]);
  panel(1.6, 5, new THREE.Color(3.2, 3.2, 3.2), [5.5, 0, 1], [0, 0, 0]);
  panel(5, 1.2, new THREE.Color(1.4, 1.3, 1.1), [-1, -5.5, 3], [0, 0, 0]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(room, 0.03);
  pmrem.dispose();
  return target;
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
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
    const group = new THREE.Group();
    scene.add(group);

    // 光（CSS の 3D と同じ向き。y と z は three.js の向きに直す）
    const light = new THREE.DirectionalLight('#ffffff', 2.2);
    light.position.set(CARD_LIGHT[0] * 3, -CARD_LIGHT[1] * 3, CARD_LIGHT[2] * 3);
    light.castShadow = true;                       // 王冠や縁の影が、枠の上に落ちる
    light.shadow.mapSize.set(2048, 2048);
    Object.assign(light.shadow.camera, { left: -1.3, right: 1.3, top: 1.3, bottom: -1.3, near: 0.5, far: 8 });
    light.shadow.bias = -0.0004; light.shadow.normalBias = 0.003; light.shadow.radius = 3;
    light.shadow.autoUpdate = false;               // 影はカードが動いたときだけ描き直す（キラキラだけのコマでは描かない）
    scene.add(light, new THREE.AmbientLight('#fff4e0', 0.9));
    const environment = roomEnvironment(THREE, renderer);
    scene.environment = environment.texture;

    // 板（Blender 製）。マテリアルは名前で見つけて、色と裏の絵を付ける
    const model = gltf.scene.clone(true);
    const owned = [];
    const own = (value) => { owned.push(value); return value; };
    const backSource = card.dataset.skin ? rankSkinBack(card.dataset.skin)?.art : null;
    const backTexture = own(await new THREE.TextureLoader().loadAsync(new URL(backSource || BACK, document.baseURI).href));
    backTexture.flipY = false;                  // glTF の UV は上が 0
    backTexture.colorSpace = THREE.SRGBColorSpace;
    backTexture.anisotropy = 4;
    let slabBack = null;
    model.traverse((node) => {
      if (!node.isMesh) return;
      node.geometry = own(node.geometry.clone());
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      const next = mats.map((m) => {
        if (m.name === 'edge') return own(new THREE.MeshStandardMaterial({ color: rarityColor, metalness: 0.55, roughness: 0.38 }));
        if (m.name === 'back') return (slabBack = own(new THREE.MeshStandardMaterial({ map: backTexture, roughness: 0.5 })));
        return own(new THREE.MeshStandardMaterial({ color: rarityColor, metalness: 0.55, roughness: 0.38 }));   // 枠の外にのぞく下地は、側面と同じ色（白く見せない）
      });
      node.material = Array.isArray(node.material) ? next : next[0];
    });
    group.add(model);
    // 板は、枠の外形に合わせて縮める（枠の外に板の色がはみ出して見えないように）。厚みはそのまま
    if (rects.frame) {
      const { x0, x1, y0, y1 } = bodyBounds(face);
      const left = (x0 - M) / PX_PER_UNIT, right = (x1 - M) / PX_PER_UNIT, top = (y0 - M) / PX_PER_UNIT, bottom = (y1 - M) / PX_PER_UNIT;
      model.scale.set(Math.min(1.1, right - left), Math.min(1.65, bottom - top) / 1.5, 1);   // 板の元の大きさは 1 × 1.5
      model.position.set((left + right) / 2 - 0.5, 0.75 - (top + bottom) / 2, 0);
    }

    // 表の絵（枠の飾りが板の外にはみ出すので、板より大きな板に貼って、透けるところは抜く）
    const rarity = card.dataset.rarity;
    const depth = 0.055;
    const faceSize = [1 + MARGIN * 2, 1.5 + MARGIN * 2];
    const faceTexture = own(new THREE.CanvasTexture(face));
    faceTexture.anisotropy = 8;
    const frameSrc = card.querySelector('.mini-card-frame')?.getAttribute('src');
    const paths = reliefPaths(frameSrc);
    const images = paths && rects.frame ? await Promise.all([loadImage(paths.relief), loadImage(paths.raised)]) : [];
    const light3 = light.position.clone().normalize();
    const sparkMat = own(sparkMaterial(THREE, light3));
    let hasSparks = false;
    let frontSide = null, backSideGroup = null;   // 表・裏の凹凸（見えていない側は描かない）
    /** 凹凸のメッシュと、その上のキラキラを parent に置く */
    const addSurface = (parent, { reliefImg, raisedImg, map, color, rect, place, uvAt, pick, preset, seed }) => {
      const { geometry, sparks } = surfaceMesh(THREE, { reliefImg, raisedImg, place, uvAt, pick, glitter: preset.glit ?? 0.15, rainbow: preset.iri > 0.2, seed });
      own(geometry);
      const maps = materialMaps(reliefImg, color, rect);
      const ormTexture = own(new THREE.CanvasTexture(maps.orm));
      const glowTexture = own(new THREE.CanvasTexture(maps.emissive));
      glowTexture.colorSpace = THREE.SRGBColorSpace;
      if (map.flipY === false) { ormTexture.flipY = false; glowTexture.flipY = false; }
      const material = own(new THREE.MeshPhysicalMaterial({
        map, metalnessMap: ormTexture, roughnessMap: ormTexture, metalness: 0.7, roughness: 1,
        envMapIntensity: 0.6 + preset.env * 0.5, alphaTest: 0.4,
        emissive: '#ffffff', emissiveMap: glowTexture, emissiveIntensity: 0.35 + 0.3 * preset.gem,   // 宝石は内側から光る
        iridescence: Math.min(1, preset.iri * 1.4), iridescenceIOR: 1.6, iridescenceThicknessRange: [200, 600],
        clearcoat: preset.gem > 1 ? 0.4 : 0, clearcoatRoughness: 0.2,
      }));
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = mesh.receiveShadow = true;
      parent.add(mesh);
      if (sparks) {
        own(sparks);
        const points = new THREE.Points(sparks, sparkMat);
        points.renderOrder = 4;
        points.frustumCulled = false;
        parent.add(points);
        hasSparks = true;
      }
    };
    const preset = RELIEF_PRESETS[card.dataset.skin ? `skin-${card.dataset.skin}` : rarity] ?? RELIEF_PRESETS.other;
    if (images[0] && images[1]) {
      // 凹凸は、枠の高さの地図から作った本物のメッシュ。光と影・金属の映り込みは three.js の材質に任せる
      faceTexture.colorSpace = THREE.SRGBColorSpace;
      const faceData = face.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, FACE_W, FACE_H);
      const { x, y, w, h } = rects.frame;
      const front = (frontSide = new THREE.Group());
      front.position.z = depth / 2;
      group.add(front);
      addSurface(front, {
        reliefImg: images[0], raisedImg: images[1], map: faceTexture, preset, seed: 7,
        color: faceData, rect: { x: M + x, y: M + y, w, h },
        place: (u, v) => [(M + x + u * w) / PX_PER_UNIT - 0.5 - MARGIN, 0.75 + MARGIN - (M + y + v * h) / PX_PER_UNIT],
        uvAt: (u, v) => [(M + x + u * w) / FACE_W, 1 - (M + y + v * h) / FACE_H],
        pick: (u, v) => {
          const px = Math.min(FACE_W - 1, Math.round(M + x + u * w)), py = Math.min(FACE_H - 1, Math.round(M + y + v * h));
          const o = (py * FACE_W + px) * 4;
          return [faceData.data[o], faceData.data[o + 1], faceData.data[o + 2], faceData.data[o + 3]];
        },
      });
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

    // ランク報酬の裏：裏の絵も、高さの地図から作った本物の凹凸のメッシュにする（板の裏の上に重ねる）
    if (card.dataset.skin && backSource) {
      const backReliefSrc = backSource.replace(/\.png$/, '-relief.png');
      const backRaisedSrc = rankSkinBack(card.dataset.skin)?.raised;
      const [backImg, backRelief, backRaised] = await Promise.all([loadImage(new URL(backSource, document.baseURI).href), loadImage(backReliefSrc), backRaisedSrc ? loadImage(backRaisedSrc) : null]);
      if (backImg && backRelief && backRaised) {
        const bw = backImg.naturalWidth, bh = backImg.naturalHeight;
        const backData = pixels(backImg, bw, bh);
        const body = bodyBounds(backData.canvas);
        const backMap = own(new THREE.CanvasTexture(backData.canvas));
        backMap.colorSpace = THREE.SRGBColorSpace;
        backMap.anisotropy = 8;
        // 板の大きさ・位置（枠に合わせて縮めたあと）に合わせる。裏から見ると左右が逆なので、群れごと半回転する
        const sw = model.scale.x, sh = model.scale.y * 1.5, cx = model.position.x, cy = model.position.y;
        const backSide = (backSideGroup = new THREE.Group());
        backSide.rotation.y = Math.PI;
        backSide.position.z = -depth / 2;
        group.add(backSide);
        const backPreset = RELIEF_PRESETS[`skin-${card.dataset.skin}`] ?? RELIEF_PRESETS.other;
        addSurface(backSide, {
          reliefImg: backRelief, raisedImg: backRaised, map: backMap, preset: backPreset, seed: 11,
          color: { data: backData.data, width: bw, height: bh }, rect: { x: 0, y: 0, w: bw, h: bh },
          // 裏の絵の本体（飾りを除いた外形）を板にぴったり合わせる。飾りは板の外にはみ出す
          place: (u, v) => [-cx + ((u * bw - body.x0) / (body.x1 - body.x0) - 0.5) * sw, cy + (0.5 - (v * bh - body.y0) / (body.y1 - body.y0)) * sh],
          uvAt: (u, v) => [u, 1 - v],
          pick: (u, v) => {
            const o = (Math.min(bh - 1, Math.round(v * (bh - 1))) * bw + Math.min(bw - 1, Math.round(u * (bw - 1)))) * 4;
            return [backData.data[o], backData.data[o + 1], backData.data[o + 2], backData.data[o + 3]];
          },
        });
        // 裏の絵の透けている所（飾りのまわり）から、板の裏が黒くのぞかないように、板の裏は側面と同じ色にする
        if (slabBack) { slabBack.map = null; slabBack.color.set(rarityColor); slabBack.metalness = 0.55; slabBack.roughness = 0.38; slabBack.needsUpdate = true; }
      }
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
      if (!group.quaternion.equals(q)) light.shadow.needsUpdate = true;
      group.quaternion.copy(q);
      const axes = cardAxes(last.quaternion, still ? 0 : last.tiltX, still ? 0 : last.tiltY);
      // 見えていない側の凹凸は描かない（裏の飾りの急な縁の面が、斜めから見ると表の上にはみ出して見えるため）。真横に近いときは両方
      const facing = axes[2][2];
      if (frontSide) frontSide.visible = facing > -0.2;
      if (backSideGroup) backSideGroup.visible = facing < 0.2;
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
      sparkMat.uniforms.uScale.value = height * renderer.getPixelRatio() / (2 * Math.tan(camera.fov * rad / 2));
      light.shadow.needsUpdate = true;
      draw();
    };
    const lost = (event) => { event.preventDefault(); };
    canvas.addEventListener('webglcontextlost', lost);

    layout();
    // キラキラが瞬くように、開いているあいだは少しずつ描き直す（動きを減らす設定のときは、回したときだけ）
    let loop = 0, lastTick = 0;
    const tick = (time) => {
      loop = 0;
      if (!active) return;
      if (!cardMotionReduced() && time - lastTick > 33) {
        lastTick = time;
        sparkMat.uniforms.uTime.value = time / 1000;
        draw();
      }
      loop = requestAnimationFrame(tick);
    };
    if (hasSparks) loop = requestAnimationFrame(tick);
    return {
      render(state) { last = { ...last, ...state }; draw(); },
      resize: layout,
      destroy() {
        if (!active) return;
        active = false;
        if (loop) cancelAnimationFrame(loop);
        canvas.removeEventListener('webglcontextlost', lost);
        for (const item of owned) item.dispose?.();
        environment.dispose();
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
