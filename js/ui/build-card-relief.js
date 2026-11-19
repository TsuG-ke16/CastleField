// カードの枠の「凹凸」と「材質」の地図を作る：node js/ui/build-card-relief.js [--debug <出力先フォルダ>]
// ランタイムでは読み込まない（PWAの一覧からも外す）。Node標準ライブラリだけで PNG を読み書きする。
//
// 作るもの（assets/cards/relief/）
//   frame-<名前>-relief.png … 元の枠と同じ幅・2倍の高さ（RGB）。
//       上半分：R,G = 法線の x,y（0.5 が平ら）、B = 高さ（0〜1）
//       下半分：R = 金属らしさ、G = なめらかさ（つや）、B = 宝石
//   frame-<名前>-raised.png … 手前に浮かせる部品（上の飾り・宝石）だけの形（アルファ）。拡大表示でこの部品を手前に浮かせる
//
// 枠の絵は「太いこげ茶の輪郭線で区切られた、塗りの部品」でできている。手で座標を決めず、絵から自動で読み取る：
//   1. 部品：輪郭線（暗い線）と透明な所で区切って、つながった部品に番号をふる
//   2. 高さ：輪郭線・透明な所からの距離で、部品ごとに丸くふくらませる（約7pxで平らになる）。輪郭線は溝、外の形は面取り。
//      宝石はとがらせ、紙（名前の帯・数値の板・メダルの中）は縁より少し下げる。塗りの陰影は細かい凹凸として少しだけ足す。
//      明るさそのものからは高さを作らない（白い所が盛り上がる、を避けるため）
//   3. 法線：高さの傾き（Sobel）から
//   4. 材質：部品ごとに色の多数決（灰色・金色の金属、宝石、紙、木・布・葉）。色だけで決まらない所は、枠ごとの色の手がかり（FRAMES）
//   5. 浮かせる部品：窓より上の、横の真ん中にある飾り（枠の上の辺より上にはみ出す部品と、その中の部品）と宝石。輪郭線ごと切り抜く
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync, deflateSync } from 'node:zlib';

const root = fileURLToPath(new URL('../../', import.meta.url));
const SRC = join(root, 'assets/cards');
const OUT = join(root, 'assets/cards/relief');

// ---------- 材質 ----------
// metal：金属らしさ、smooth：なめらかさ。kind は高さの扱い（paper は少し下げる、gem はとがらせる）
const M = {
  wood:    { metal: 0,   smooth: .22 },
  leaf:    { metal: 0,   smooth: .38 },
  cloth:   { metal: 0,   smooth: .28 },
  iron:    { metal: .8,  smooth: .55 },
  silver:  { metal: .9,  smooth: .82 },
  gold:    { metal: .95, smooth: .85 },
  enamel:  { metal: .45, smooth: .7 },    // 色を塗った金属（青・紫の地）
  pearl:   { metal: .6,  smooth: .9 },
  scroll:  { metal: 0,   smooth: .3 },
  paper:   { metal: 0,   smooth: .18, kind: 'paper' },
  gem:     { metal: 0,   smooth: 1, kind: 'gem' },
};
// 色の条件：h（色相の範囲。度）、s・v（彩度・明度の範囲）
const GREY = { s: [0, .22], v: [.38, 1] };
const GOLD = { h: [36, 62], s: [.42, 1], v: [.6, 1] };

// ---------- 枠ごとの手がかり（色だけ。座標は使わない） ----------
// base：どの色にも当たらない所の材質。rules：上から順に、最初に当たった色の材質にする
// gem：宝石の色（h, s, v）。宝石は、この色が大半を占めて、小さくまとまった丸い部品だけ
// paper：紙を探す所（7枠共通の型紙か、種類の枠の名前の帯）
// 共通の型紙（css/rarity-assets.css の --name-y / --med-* と、数値の板 86〜97%）。比で書く
const SHARED_PARCHMENT = {
  name: [.14, .86, .73],
  stats: [.16, .84, .86, .97],
  medals: [[.17, .13], [.83, .13]],
};
const KIND_PAPER = { name: [.1, .9, .8], halfH: .1, medals: [] };
export const FRAMES = {
  common:    { base: M.wood, rules: [[GREY, M.iron]], gem: null, paper: SHARED_PARCHMENT },
  uncommon:  { base: M.wood, rules: [[{ h: [55, 175], s: [.3, 1], v: [.3, 1] }, M.leaf], [GOLD, M.gold]], gem: { h: [70, 115], s: [.6, 1], v: [.45, 1] }, paper: SHARED_PARCHMENT },
  rare:      { base: M.enamel, rules: [[{ s: [0, .3], v: [.45, 1] }, M.silver], [{ h: [180, 250], s: [0, .45], v: [.55, 1] }, M.silver], [GOLD, M.gold]], gem: { h: [190, 240], s: [.5, 1], v: [.5, 1] }, paper: SHARED_PARCHMENT },
  epic:      { base: M.enamel, rules: [[GOLD, M.gold], [{ h: [20, 62], s: [.35, 1], v: [.45, 1] }, M.gold], [GREY, M.silver]], gem: { h: [265, 320], s: [.45, 1], v: [.55, 1] }, paper: SHARED_PARCHMENT },
  legendary: { base: M.gold, rules: [[{ h: [330, 15], s: [.5, 1], v: [.3, 1] }, M.cloth]], gem: { h: [340, 15], s: [.55, 1], v: [.5, 1] }, paper: SHARED_PARCHMENT },
  special:   { base: M.pearl, rules: [], gem: { h: [175, 320], s: [.12, 1], v: [.8, 1], avgSat: .25, minVStd: .04 }, gemMinArea: 120, paper: SHARED_PARCHMENT },
  beast:     { base: M.wood, rules: [[{ h: [55, 175], s: [.3, 1], v: [.3, 1] }, M.leaf], [{ h: [28, 50], s: [.55, 1], v: [.85, 1] }, M.gold, .2], [GREY, M.iron]], gem: { h: [95, 170], s: [.45, 1], v: [.35, 1] }, paper: SHARED_PARCHMENT },
  soldier:   { base: M.wood, rules: [[GREY, M.silver], [GOLD, M.gold], [{ h: [195, 260], s: [.3, 1], v: [.3, 1] }, M.cloth]], gem: { h: [195, 250], s: [.45, 1], v: [.45, 1] }, paper: KIND_PAPER },
  spell:     { base: M.scroll, rules: [[{ s: [0, .14], v: [.45, 1] }, M.silver], [GOLD, M.gold], [{ h: [210, 250], s: [.45, 1], v: [.3, 1] }, M.cloth]], gem: { h: [265, 320], s: [.4, 1], v: [.45, 1] }, paper: KIND_PAPER },
  weapon:    { base: M.gold, rules: [[GREY, M.silver], [{ h: [340, 15], s: [.5, 1], v: [.3, 1] }, M.cloth], [{ h: [15, 30], s: [.5, 1], v: [.3, .62] }, M.wood]], gem: { h: [345, 15], s: [.55, 1], v: [.55, 1] }, paper: KIND_PAPER },
  defense:   { base: M.enamel, rules: [[GREY, M.silver], [{ h: [190, 250], s: [0, .4], v: [.5, 1] }, M.silver], [GOLD, M.gold], [{ h: [15, 36], s: [.4, 1], v: [.3, 1] }, M.gold]], gem: { h: [195, 250], s: [.5, 1], v: [.6, 1] }, gemMaxArea: 1600, paper: KIND_PAPER },
};

// ---------- PNG（8bit・インターレースなし。パレットの PNG も読む） ----------
const crcTable = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

export function decodePng(buf) {
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let pos = 8, width = 0, height = 0, type = 0, depth = 0;
  const idat = [];
  let palette = null, trns = null;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos); const name = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (name === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; type = data[9]; if (data[12]) throw new Error('interlaced PNG'); }
    else if (name === 'PLTE') palette = data;
    else if (name === 'tRNS') trns = data;
    else if (name === 'IDAT') idat.push(data);
    else if (name === 'IEND') break;
    pos += 12 + len;
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (!channels || !width || !height) throw new Error(`unsupported PNG type ${type}/${depth}`);
  if (type === 3 ? ![1, 2, 4, 8].includes(depth) : depth !== 8) throw new Error(`unsupported PNG type ${type}/${depth}`);
  if (type === 3 && !palette) throw new Error('palette PNG without PLTE');
  const raw = inflateSync(Buffer.concat(idat));
  const stride = Math.ceil(width * channels * depth / 8);
  const bpp = Math.max(1, channels * depth / 8);
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[y * stride + i - bpp] : 0;
      const b = y ? out[(y - 1) * stride + i] : 0;
      const c = y && i >= bpp ? out[(y - 1) * stride + i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[y * stride + i] = v & 255;
    }
  }
  // いつも RGBA にそろえて返す
  if (channels === 4) return { width, height, data: out };
  const rgba = new Uint8Array(width * height * 4);
  if (type === 3) {
    const per = 8 / depth, mask = (1 << depth) - 1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const byte = out[y * stride + Math.floor(x / per)];
      const idx = depth === 8 ? byte : (byte >> ((per - 1 - x % per) * depth)) & mask;
      const o = (y * width + x) * 4;
      rgba[o] = palette[idx * 3] ?? 0; rgba[o + 1] = palette[idx * 3 + 1] ?? 0; rgba[o + 2] = palette[idx * 3 + 2] ?? 0;
      rgba[o + 3] = trns && idx < trns.length ? trns[idx] : 255;
    }
    return { width, height, data: rgba };
  }
  for (let i = 0; i < width * height; i++) {
    const s = i * channels;
    if (channels === 1) rgba.set([out[s], out[s], out[s], 255], i * 4);
    else if (channels === 2) rgba.set([out[s], out[s], out[s], out[s + 1]], i * 4);
    else rgba.set([out[s], out[s + 1], out[s + 2], 255], i * 4);
  }
  return { width, height, data: rgba };
}

export function encodePng(width, height, channels, data) {
  const type = { 1: 0, 2: 4, 3: 2, 4: 6 }[channels];
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  const cand = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    let best = null, bestScore = Infinity, bestF = 0;
    for (let f = 0; f < 5; f++) {
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const x = data[y * stride + i];
        const a = i >= channels ? data[y * stride + i - channels] : 0;
        const b = y ? data[(y - 1) * stride + i] : 0;
        const c = y && i >= channels ? data[(y - 1) * stride + i - channels] : 0;
        let p = 0;
        if (f === 1) p = a; else if (f === 2) p = b; else if (f === 3) p = (a + b) >> 1;
        else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
        const v = (x - p) & 255; cand[i] = v; score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) { bestScore = score; bestF = f; best = Buffer.from(cand); }
    }
    raw[y * (stride + 1)] = bestF; best.copy(raw, y * (stride + 1) + 1);
  }
  const chunk = (name, body) => {
    const head = Buffer.alloc(8); head.writeUInt32BE(body.length, 0); head.write(name, 4, 'ascii');
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
    return Buffer.concat([head, body, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = type;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- 画像処理の部品 ----------
function hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, mx ? d / mx : 0, mx];
}
const inHue = (h, [a, b]) => a <= b ? h >= a && h <= b : h >= a || h <= b;
const match = (c, h, s, v) => (!c.h || inHue(h, c.h)) && (!c.s || (s >= c.s[0] && s <= c.s[1])) && (!c.v || (v >= c.v[0] && v <= c.v[1]));

// ユークリッド距離変換（Felzenszwalb の2回の1次元変換）。zero[i] が true の所から、各点までの距離
function distance(width, height, zero) {
  const INF = 1e12;
  const f = new Float64Array(Math.max(width, height));
  const d = new Float64Array(Math.max(width, height));
  const v = new Int32Array(Math.max(width, height));
  const z = new Float64Array(Math.max(width, height) + 1);
  const g = new Float64Array(width * height);
  const pass = (n) => {
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < n; q++) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
  };
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = zero[y * width + x] ? 0 : INF;
    pass(height);
    for (let y = 0; y < height; y++) g[y * width + x] = d[y];
  }
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) f[x] = g[y * width + x];
    pass(width);
    for (let x = 0; x < width; x++) out[y * width + x] = Math.sqrt(Math.min(d[x], 1e10));
  }
  return out;
}
function blur(width, height, src, radius) {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let s = 0, n = 0;
    for (let k = -radius; k <= radius; k++) { const xx = x + k; if (xx >= 0 && xx < width) { s += src[y * width + xx]; n++; } }
    tmp[y * width + x] = s / n;
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let s = 0, n = 0;
    for (let k = -radius; k <= radius; k++) { const yy = y + k; if (yy >= 0 && yy < height) { s += tmp[yy * width + x]; n++; } }
    out[y * width + x] = s / n;
  }
  return out;
}
// 4方向につながった部品に番号をふる（mask が true の所だけ）。部品ごとに面積・外接矩形・重心も数える
function label(width, height, mask) {
  const lab = new Int32Array(width * height).fill(-1);
  const parts = [];
  const stack = [];
  for (let i = 0; i < lab.length; i++) {
    if (!mask[i] || lab[i] >= 0) continue;
    const id = parts.length;
    const part = { pixels: [], x0: width, y0: height, x1: 0, y1: 0, cx: 0, cy: 0 };
    parts.push(part);
    lab[i] = id; stack.push(i);
    while (stack.length) {
      const j = stack.pop(); part.pixels.push(j);
      const x = j % width, y = (j - x) / width;
      part.cx += x; part.cy += y;
      if (x < part.x0) part.x0 = x; if (x > part.x1) part.x1 = x; if (y < part.y0) part.y0 = y; if (y > part.y1) part.y1 = y;
      if (x > 0 && mask[j - 1] && lab[j - 1] < 0) { lab[j - 1] = id; stack.push(j - 1); }
      if (x < width - 1 && mask[j + 1] && lab[j + 1] < 0) { lab[j + 1] = id; stack.push(j + 1); }
      if (y > 0 && mask[j - width] && lab[j - width] < 0) { lab[j - width] = id; stack.push(j - width); }
      if (y < height - 1 && mask[j + width] && lab[j + width] < 0) { lab[j + width] = id; stack.push(j + width); }
    }
    part.area = part.pixels.length; part.cx /= part.area; part.cy /= part.area;
  }
  return { lab, parts };
}
// 部品に番号をふる。輪郭線にすき間があって2つの部品が細い首（幅 2×neck 未満）でつながっているときは、首で切り分ける：
// 輪郭線から neck より離れた「芯」に番号をふり、残りの画素は、部品の中を通っていちばん近い芯に入れる
function splitParts(W, H, inner, dOut, neck) {
  const N = W * H;
  const core = new Uint8Array(N);
  for (let i = 0; i < N; i++) core[i] = inner[i] && dOut[i] > neck ? 1 : 0;
  const { lab: coreLab, parts: cores } = label(W, H, core);
  const lab = new Int32Array(N).fill(-1);
  let queue = [];
  let id = 0;
  const keep = new Int32Array(cores.length).fill(-1);
  cores.forEach((c, ci) => { if (c.area >= 4) keep[ci] = id++; });
  for (let i = 0; i < N; i++) if (coreLab[i] >= 0 && keep[coreLab[i]] >= 0) { lab[i] = keep[coreLab[i]]; queue.push(i); }
  // 幅優先で広げる（同じ順番なので結果は毎回同じ）
  while (queue.length) {
    const next = [];
    for (const j of queue) {
      const x = j % W;
      for (const q of [x > 0 ? j - 1 : -1, x < W - 1 ? j + 1 : -1, j >= W ? j - W : -1, j + W < N ? j + W : -1]) {
        if (q >= 0 && inner[q] && lab[q] < 0) { lab[q] = lab[j]; next.push(q); }
      }
    }
    queue = next;
  }
  // 芯のない小さな部品は、そのまま1つの部品にする
  const rest = Uint8Array.from(lab, (v, i) => inner[i] && v < 0 ? 1 : 0);
  const { lab: restLab } = label(W, H, rest);
  for (let i = 0; i < N; i++) if (restLab[i] >= 0) lab[i] = id + restLab[i];
  let count = 0; for (let i = 0; i < N; i++) if (lab[i] >= count) count = lab[i] + 1;
  const parts = Array.from({ length: count }, () => ({ pixels: [], x0: W, y0: H, x1: 0, y1: 0, cx: 0, cy: 0, inradius: 0 }));
  for (let i = 0; i < N; i++) {
    if (lab[i] < 0) continue;
    const p = parts[lab[i]], x = i % W, y = (i - x) / W;
    p.pixels.push(i); p.cx += x; p.cy += y;
    if (x < p.x0) p.x0 = x; if (x > p.x1) p.x1 = x; if (y < p.y0) p.y0 = y; if (y > p.y1) p.y1 = y;
    if (dOut[i] > p.inradius) p.inradius = dOut[i];
  }
  for (const p of parts) { p.area = p.pixels.length; p.cx /= p.area || 1; p.cy /= p.area || 1; }
  return { lab, parts };
}
// 丸い面取り（0→1）。t=0 が縁、t=1 で平ら
const dome = (t) => t >= 1 ? 1 : t <= 0 ? 0 : Math.sqrt(1 - (1 - t) * (1 - t));
// 半径 r の円で太らせる・やせさせる（距離変換で）
const dilate = (W, H, m, r) => { const d = distance(W, H, m); return Uint8Array.from(d, v => v <= r ? 1 : 0); };
const erode = (W, H, m, r) => { const d = distance(W, H, m.map(v => v ? 0 : 1)); return Uint8Array.from(d, v => v > r ? 1 : 0); };
const closeMask = (W, H, m, r) => erode(W, H, dilate(W, H, m, r), r);
// 外につながっていない穴を埋める（maxArea より大きい穴は残す）
function fillHoles(W, H, m, maxArea) {
  const out = Uint8Array.from(m);
  const { parts } = label(W, H, m.map(v => v ? 0 : 1));
  for (const p of parts) {
    if (p.area > maxArea || p.x0 === 0 || p.y0 === 0 || p.x1 === W - 1 || p.y1 === H - 1) continue;
    for (const j of p.pixels) out[j] = 1;
  }
  return out;
}

// ---------- 1枚の枠から地図を作る ----------
export function buildRelief(png, cfg) {
  const { width: W, height: H, data } = png;
  const N = W * H;
  const k = W / 512;                     // 512 幅の絵を基準にした px の比
  const alpha = new Float32Array(N), hue = new Float32Array(N), sat = new Float32Array(N), val = new Float32Array(N), lum = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    alpha[i] = data[i * 4 + 3] / 255;
    const r = data[i * 4] / 255, g = data[i * 4 + 1] / 255, b = data[i * 4 + 2] / 255;
    const [h, s, v] = hsv(r, g, b);
    hue[i] = h; sat[i] = s; val[i] = v; lum[i] = .299 * r + .587 * g + .114 * b;
  }
  const solid = new Uint8Array(N), outline = new Uint8Array(N);
  // 輪郭線：とても暗い所と、まわりより暗い中くらいの茶色の線（金の飾りの線は少し明るい茶色で描かれている）
  const lumLocal = blur(W, H, lum, Math.max(1, Math.round(3 * k)));
  for (let i = 0; i < N; i++) {
    solid[i] = alpha[i] > .5 ? 1 : 0;
    outline[i] = solid[i] && (val[i] < .3 || (val[i] < (cfg.lineV ?? .5) && lum[i] < lumLocal[i] - .09)) ? 1 : 0;
  }
  // 木目や汚しの小さな暗い点は輪郭線ではない（溝にすると表面がざらつく）ので外す
  {
    const { parts: specks } = label(W, H, outline);
    for (const p of specks) if (p.area < 14 * k * k) for (const j of p.pixels) outline[j] = 0;
  }

  // 1. 部品（輪郭線と透明な所で区切る）
  const inner = new Uint8Array(N);
  for (let i = 0; i < N; i++) inner[i] = solid[i] && !outline[i] ? 1 : 0;
  const dOut = distance(W, H, inner.map(v => v ? 0 : 1));       // 輪郭線・透明な所からの距離
  const { lab, parts } = splitParts(W, H, inner, dOut, 2.5 * k);

  // 紙を探す所（型紙）
  const P = cfg.paper;
  const inMedal = (x, y) => P.medals.some(([mx, my]) => Math.hypot(x - mx * W, y - my * H) <= .085 * W);
  const inPaperZone = (x, y) => {
    const u = x / W, v = y / H;
    const [l, r, ny] = P.name;
    if (u >= l && u <= r && Math.abs(v - ny) <= (P.halfH ?? .065)) return true;
    const st = P.stats;
    if (st && u >= st[0] && u <= st[1] && v >= st[2] && v <= st[3]) return true;
    return inMedal(x, y);
  };

  // 2. 材質：画素ごとに色で決めて、部品ごとに多数決
  const MATS = [M.wood, M.leaf, M.cloth, M.iron, M.silver, M.gold, M.enamel, M.pearl, M.scroll, M.paper, M.gem];
  const pix = new Uint8Array(N);   // MATS の番号
  const baseIdx = MATS.indexOf(cfg.base);
  const rules = cfg.rules.map(([c, m, share]) => [c, MATS.indexOf(m), share]);
  const PAPER = MATS.indexOf(M.paper), GEM = MATS.indexOf(M.gem);
  for (let i = 0; i < N; i++) {
    if (!inner[i]) continue;
    const x = i % W, y = (i - x) / W, h = hue[i], s = sat[i], v = val[i];
    if (inPaperZone(x, y) && h >= 18 && h <= 62 && s >= .06 && s < .5 && v > .7) { pix[i] = PAPER; continue; }
    let m = baseIdx;
    for (const [c, idx] of rules) if (match(c, h, s, v)) { m = idx; break; }
    pix[i] = m;
  }
  const mat = new Uint8Array(N);
  const LARGE = 6000 * k * k;
  for (const p of parts) {
    if (p.area > LARGE) { for (const j of p.pixels) mat[j] = pix[j]; continue; }
    const votes = new Uint32Array(MATS.length);
    for (const j of p.pixels) votes[pix[j]]++;
    let best = 0; for (let m = 1; m < MATS.length; m++) if (votes[m] > votes[best]) best = m;
    // 光の当たった所だけがその色になる材質（陰の多い金など）は、部品の一部（share）がその色なら、部品全部をその材質にする
    for (const [, idx, share] of rules) if (share && best !== PAPER && votes[idx] >= p.area * share) { best = idx; break; }
    for (const j of p.pixels) mat[j] = best;
  }
  // 大きな部品の中の色の切れ目は、小さく散らばらないように2pxの多数決でならす
  {
    const counts = MATS.map((_, m) => blur(W, H, Float32Array.from(mat, v => v === m ? 1 : 0), 2));
    for (const p of parts) {
      if (p.area <= LARGE) continue;
      for (const j of p.pixels) { let best = mat[j], bv = -1; for (let m = 0; m < MATS.length; m++) if (counts[m][j] > bv) { bv = counts[m][j]; best = m; } mat[j] = best; }
    }
  }

  // 宝石：宝石の色の、はっきりした所を種にして、同じ系統の色の所へ広げる（輪郭線・ほかの色で止まる）。
  // 小さくまとまった丸い塊だけを残す（細い線・葉・大きな色面は宝石ではない）
  let gemMask = new Uint8Array(N);
  if (cfg.gem) {
    const G = cfg.gem;
    const strong = new Uint8Array(N), weak = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      if (!inner[i] || mat[i] === PAPER) continue;
      if (match(G, hue[i], sat[i], val[i])) strong[i] = 1;
      if ((inHue(hue[i], G.h) && sat[i] >= G.s[0] * .45 && val[i] >= .3) || (val[i] > .88 && sat[i] < .35)) weak[i] = 1;
    }
    // 切り子のすき間を埋めてから、細い線を消す
    let seed = closeMask(W, H, strong, 2 * k);
    seed = dilate(W, H, erode(W, H, seed, 1.5 * k), 1.5 * k);
    for (let i = 0; i < N; i++) seed[i] = seed[i] && solid[i] && val[i] >= .3 ? 1 : 0;
    // 同じ系統の色（とハイライトの白）の所へ、3pxまで広げる
    let grown = seed;
    for (let step = 0; step < 3 * k; step++) {
      const next = Uint8Array.from(grown);
      for (let i = 0; i < N; i++) {
        if (grown[i] || !weak[i]) continue;
        const x = i % W;
        if ((x > 0 && grown[i - 1]) || (x < W - 1 && grown[i + 1]) || (i >= W && grown[i - W]) || (i + W < N && grown[i + W])) next[i] = 1;
      }
      grown = next;
    }
    grown = fillHoles(W, H, grown, 400 * k * k);
    const minA = (G.minArea ?? cfg.gemMinArea ?? 50) * k * k, maxA = (cfg.gemMaxArea ?? 3200) * k * k;
    const { parts: blobs } = label(W, H, grown);
    const dIn = distance(W, H, grown.map(v => v ? 0 : 1));
    const dEdge = distance(W, H, solid.map(v => v ? 0 : 1));
    const cands = [];
    for (const p of blobs) {
      if (p.area < minA || p.area > maxA) continue;
      let inr = 0, minSil = 1e9, hi = 0, sv = 0, svv = 0, ss = 0;
      for (const j of p.pixels) {
        if (dIn[j] > inr) inr = dIn[j];
        if (dEdge[j] < minSil) minSil = dEdge[j];
        if (val[j] > .9 && sat[j] < .3) hi++;
        sv += val[j]; svv += val[j] * val[j]; ss += sat[j];
      }
      const bw = p.x1 - p.x0 + 1, bh = p.y1 - p.y0 + 1;
      const st = {
        fill: p.area / (bw * bh), round: inr / Math.sqrt(p.area), aspect: Math.max(bw, bh) / Math.min(bw, bh), inr, minSil,
        hi: hi / p.area, vStd: Math.sqrt(Math.max(0, svv / p.area - (sv / p.area) ** 2)), sat: ss / p.area,
      };
      // 宝石らしさ：丸くまとまっている・切り子の明暗がある・鮮やか・枠の外の形に接していない・ハイライトがある（大きな石は無くてもよい）
      p.ok = st.fill >= .3 && st.round >= .27 && st.aspect <= 2.4 && inr >= 7.5 * k && st.vStd >= (G.minVStd ?? .1) && st.sat >= (G.avgSat ?? .55)
        && minSil >= 6 * k && (st.hi >= .005 || inr >= 12 * k);
      p.st = st;
      cands.push(p);
    }
    // 宝石は、横の真ん中にあるか、左右対称の対がある（枠の飾りの宝石は、どれもこのどちらか）
    for (const p of cands) {
      if (!p.ok) continue;
      const centred = Math.abs(p.cx - W / 2) < .04 * W;
      const pair = cands.some(q => q !== p && q.ok && Math.abs(q.cx - (W - p.cx)) < .03 * W && Math.abs(q.cy - p.cy) < .03 * H && q.area < p.area * 1.6 && q.area * 1.6 > p.area);
      p.gem = centred || pair;
    }
    for (const p of cands) {
      if (p.gem) for (const j of p.pixels) gemMask[j] = 1;
    }
    for (let i = 0; i < N; i++) if (gemMask[i] && !solid[i]) gemMask[i] = 0;
  }
  for (let i = 0; i < N; i++) if (gemMask[i] && inner[i]) mat[i] = GEM;

  // 紙（部品ごとの多数決で決めた所）
  const paper = new Uint8Array(N);
  for (let i = 0; i < N; i++) paper[i] = mat[i] === PAPER ? 1 : 0;

  // 3. 浮かせる部品
  // 枠の上の辺の高さ：列ごとの「いちばん上の不透明な行」でいちばん多い値（飾りのない所の上の辺）
  const firstRow = new Int32Array(W).fill(-1);
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (solid[y * W + x]) { firstRow[x] = y; break; }
  let barTop = 0;
  {
    const hist = new Uint32Array(H);
    for (let x = 0; x < W; x++) if (firstRow[x] >= 0) hist[firstRow[x]]++;
    let best = -1;
    for (let y = 0; y < H; y++) { let s = 0; for (let d = -2; d <= 2; d++) s += hist[y + d] ?? 0; if (s > best) { best = s; barTop = y; } }
  }
  const crestBottom = barTop + .12 * H;
  const raisedPart = new Uint8Array(parts.length);
  parts.forEach((p, id) => {
    if (p.area > .05 * N || p.area < 12 * k * k) return;
    if (p.cx < .14 * W || p.cx > .86 * W || p.cy > crestBottom) return;
    let medal = 0, pap = 0, shiny = 0;
    for (const j of p.pixels) { const x = j % W; if (inMedal(x, (j - x) / W)) medal++; if (paper[j]) pap++; if (MATS[mat[j]].metal >= .6) shiny++; }
    if (medal > p.area * .4 || pap > p.area * .5) return;
    if (p.x1 - p.x0 > .7 * W) return;
    // 上の辺より上にはみ出す部品（王冠・翼・葉・兜など）。はみ出さない飾りは、真ん中の小さな金属の板だけ
    if (p.y0 < barTop - 3 * k) raisedPart[id] = 1;
    else if (shiny > p.area * .5 && p.cx > .3 * W && p.cx < .7 * W && p.cy < barTop + .08 * H && p.area < .01 * N) raisedPart[id] = 1;
  });
  // 枠の地と輪郭線がつながってしまった飾り（端や下まで広がる部品）は、上にはみ出した列の、上の辺の近くだけを使う
  const protrude = new Uint8Array(W);
  for (let x = 0; x < W; x++) for (let d = -Math.round(14 * k); d <= Math.round(14 * k); d++) { const xx = x + d; if (xx >= 0 && xx < W && firstRow[xx] >= 0 && firstRow[xx] < barTop - 3 * k) protrude[x] = 1; }
  const clipBottom = barTop + .1 * H;
  const merged = new Uint8Array(parts.length);
  parts.forEach((p, id) => { if (raisedPart[id] && (p.x0 < .1 * W || p.x1 > .9 * W || p.y1 > clipBottom)) merged[id] = 1; });
  let raised = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (lab[i] < 0 || !raisedPart[lab[i]]) continue;
    if (merged[lab[i]]) { const x = i % W; if (!protrude[x] || (i - x) / W > clipBottom) continue; }
    raised[i] = 1;
  }
  raised = Uint8Array.from(raised, (v, i) => v | gemMask[i]);
  // 浮かせた部品のあいだ・まわりの輪郭線（4pxまで）も一緒に浮かせる
  {
    const d = distance(W, H, raised);
    for (let i = 0; i < N; i++) if (outline[i] && d[i] <= 4 * k) raised[i] = 1;
  }
  // 飾りの中に囲まれた小さな部品・すき間も浮かせる
  raised = fillHoles(W, H, closeMask(W, H, raised, 2 * k), 900 * k * k);
  for (let i = 0; i < N; i++) if (!solid[i]) raised[i] = 0;
  // 囲まれた部品は、半分以上が浮いていれば全部浮かせる（輪郭線ごと）
  {
    const cnt = new Uint32Array(parts.length);
    for (let i = 0; i < N; i++) if (raised[i] && lab[i] >= 0) cnt[lab[i]]++;
    parts.forEach((p, id) => { if (!raisedPart[id] && cnt[id] > p.area * .6 && p.area < .01 * N) for (const j of p.pixels) raised[j] = 1; });
  }

  // 4. 高さ
  const dSil = distance(W, H, solid.map(v => v ? 0 : 1));
  const dGem = distance(W, H, gemMask.map(v => v ? 0 : 1));
  const gemTop = new Float32Array(N);       // 宝石ごとのいちばん内側の距離（そこを頂点にする）
  {
    const { parts: gp } = label(W, H, gemMask);
    for (const p of gp) { let m = 1; for (const j of p.pixels) if (dGem[j] > m) m = dGem[j]; for (const j of p.pixels) gemTop[j] = m; }
  }
  // 塗りの陰影（左上からの光）を、細かい凹凸として少しだけ使う（明るさの高い所を持ち上げるのではなく、変化だけ）
  const lumS = blur(W, H, lum, 1), lumB = blur(W, H, blur(W, H, lum, 4), 4);
  const height = new Float32Array(N);
  const Rsil = 16 * k, Rpart = 7 * k;
  for (let i = 0; i < N; i++) {
    if (!solid[i]) continue;
    const sil = .3 * dome(dSil[i] / Rsil);
    let h;
    if (paper[i]) {
      // 紙：縁の溝からゆるく上がるが、まわりの枠より低い
      h = sil + .1 + .06 * dome(dOut[i] / (12 * k));
    } else if (gemMask[i]) {
      // 宝石：縁から真ん中の頂点へとがる
      const t = dGem[i] / gemTop[i];
      h = sil + .22 + .3 * Math.pow(Math.min(1, t), .8);
    } else {
      // 部品は輪郭線から約7pxでふくらみ切る。輪郭線は溝（ただし底は紙より上。太い線ほど暗いので、深くしすぎない）
      h = sil + .12 + .2 * dome(dOut[i] / Rpart);
      const metal = MATS[mat[i]].metal;
      h += .03 * metal;                        // 金属の飾りは木の地より少しだけ上
      if (inner[i]) h += Math.max(-.035, Math.min(.035, (lumS[i] - lumB[i]) * .35));
    }
    if (raised[i]) h += .1;
    height[i] = h;
  }
  const hs = blur(W, H, height, 1);
  for (let i = 0; i < N; i++) hs[i] = solid[i] ? Math.min(1, Math.max(0, hs[i])) : 0;   // 透明な所はかならず0

  // 5. 法線（Sobel。高さを px に直して、傾きから）
  const S = 20 * k;
  const relief = new Uint8Array(W * H * 2 * 3);
  const at = (x, y) => hs[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
  const metalOut = new Float32Array(N), smoothOut = new Float32Array(N), gemOut = new Float32Array(N);
  // 輪郭線の材質は、まわりの部品の材質を半分に（線はつやを消す）
  {
    const near = MATS.map((_, m) => blur(W, H, Float32Array.from(mat, (v, i) => inner[i] && v === m ? 1 : 0), 3));
    for (let i = 0; i < N; i++) {
      if (!solid[i]) continue;
      if (inner[i]) { const m = MATS[mat[i]]; metalOut[i] = m.metal; smoothOut[i] = m.smooth; gemOut[i] = mat[i] === GEM ? 1 : 0; continue; }
      let best = 0, bv = -1; for (let m = 0; m < MATS.length; m++) if (m !== GEM && m !== PAPER && near[m][i] > bv) { bv = near[m][i]; best = m; }
      metalOut[i] = MATS[best].metal * .5; smoothOut[i] = .2;
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, o = i * 3, o2 = (N + i) * 3;
    if (!solid[i]) { relief[o] = 128; relief[o + 1] = 128; relief[o + 2] = 0; continue; }
    const dx = ((at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1))) / 8 * S;
    const dy = ((at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1))) / 8 * S;
    const l = Math.hypot(dx, dy, 1);
    relief[o] = Math.round((-dx / l * .5 + .5) * 255);
    relief[o + 1] = Math.round((-dy / l * .5 + .5) * 255);
    relief[o + 2] = Math.round(hs[i] * 255);
    relief[o2] = Math.round(metalOut[i] * 255);
    relief[o2 + 1] = Math.round(smoothOut[i] * 255);
    relief[o2 + 2] = Math.round(gemOut[i] * 255);
  }
  // 浮かせる部品の形（縁を1pxぼかす。元の絵の透明な所は必ず0）
  const soft = blur(W, H, Float32Array.from(raised), 1);
  const raisedOut = new Uint8Array(N * 2);
  for (let i = 0; i < N; i++) { raisedOut[i * 2] = 255; raisedOut[i * 2 + 1] = alpha[i] ? Math.round(Math.min(soft[i], alpha[i]) * 255) : 0; }
  return { width: W, height: H, relief, raised: raisedOut, debug: { hs, metal: metalOut, smooth: smoothOut, gem: gemOut, raised, paper, barTop } };
}

// 確認用：上が高さ（明るいほど高い。浮かせる部品は水色のふち）、下が材質（赤=金属、緑=なめらかさ、マゼンタ=宝石、クリーム=紙）
function writeDebug(dir, name, r) {
  const { width: W, height: H, debug } = r; const N = W * H;
  const img = new Uint8Array(N * 2 * 3);
  const edge = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (!debug.raised[i]) continue;
    const x = i % W;
    if ((x > 0 && !debug.raised[i - 1]) || (x < W - 1 && !debug.raised[i + 1]) || (i >= W && !debug.raised[i - W]) || (i + W < N && !debug.raised[i + W])) edge[i] = 1;
  }
  for (let i = 0; i < N; i++) {
    const h = Math.round(debug.hs[i] * 255);
    img.set(edge[i] ? [0, 230, 255] : [h, h, h], i * 3);
    const c = debug.gem[i] ? [255, 40, 200] : debug.paper[i] ? [240, 220, 160] : [debug.metal[i] * 255, debug.smooth[i] * 200, debug.raised[i] ? 120 : 30];
    img.set(c, (N + i) * 3);
  }
  writeFileSync(join(dir, `${name}-debug.png`), encodePng(W, H * 2, 3, img));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const debugAt = process.argv.indexOf('--debug');
  const debugDir = debugAt > 0 ? process.argv[debugAt + 1] : null;
  if (debugDir) mkdirSync(debugDir, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  for (const [name, cfg] of Object.entries(FRAMES)) {
    const png = decodePng(readFileSync(join(SRC, `frame-${name}.png`)));
    const r = buildRelief(png, cfg);
    const a = encodePng(r.width, r.height * 2, 3, r.relief);
    const b = encodePng(r.width, r.height, 2, r.raised);
    writeFileSync(join(OUT, `frame-${name}-relief.png`), a);
    writeFileSync(join(OUT, `frame-${name}-raised.png`), b);
    if (debugDir) writeDebug(debugDir, name, r);
    console.log(`${name}: relief ${(a.length / 1024).toFixed(0)}KB, raised ${(b.length / 1024).toFixed(0)}KB, barTop ${r.debug.barTop}`);
  }
}
