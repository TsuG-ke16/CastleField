// カードの枠の「凹凸」と「材質」の地図を作る：node js/ui/build-card-relief.js [--debug <出力先フォルダ>]
// ランタイムでは読み込まない（PWAの一覧からも外す）。Node標準ライブラリだけで PNG を読み書きする。
//
// 作るもの（assets/cards/relief/）
//   frame-<名前>-relief.png … 元の枠と同じ幅・2倍の高さ（RGB）。
//       上半分：R,G = 法線の x,y（0.5 が平ら）、B = 高さ（0〜1）
//       下半分：R = 金属らしさ、G = なめらかさ（つや）、B = 宝石
//   frame-<名前>-raised.png … いちばん高い部品（王冠・宝石など）だけの形（アルファ）。拡大表示でこの部品を手前に浮かせる
//
// 高さは「明るさ」から作らない（白い所が盛り上がる、を避けるため）。次の3つから組み立てる：
//   1. 枠の形（透明な所からの距離）… 枠の縁が丸く盛り上がる
//   2. 絵の太い輪郭線（暗い線）… 線を溝にして、線で囲まれた部品（葉・帯・宝石）を1つずつクッション状にふくらませる
//   3. 枠ごとに手で決めた領域 … 宝石・王冠・名前の帯・丸いメダル（下の FRAMES）
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync, deflateSync } from 'node:zlib';

const root = fileURLToPath(new URL('../../', import.meta.url));
const SRC = join(root, 'assets/cards');
const OUT = join(root, 'assets/cards/relief');

// ---------- 枠ごとの設定（座標は 512×768 の絵の上の px。ほかの大きさの絵は比で直す） ----------
// base：枠の地の材質。gold / silver：その色の所を金属にする。organic・cloth：その色相の所を、つやの少ない材質にする。
// gemHue：宝石の色相（度）。raised：手前に浮かせる部品のある範囲（輪郭線で区切られた部品のうち、ほとんどがこの中にあるもの）。
// paper：名前の帯・メダルの中（羊皮紙）。'name' と 'medals' は CSS の --name-y / --med-* と同じ位置。
const KIND_GEMS = [[66, 556, 154, 652], [358, 556, 446, 652]];
const SHARED_PARCHMENT = {
  name: [.14, .86, .73],
  stats: [.16, .84, .86, .97],
  medals: [[.17, .13], [.83, .13]],
};
const FRAMES = {
  common:    { base: { metal: 0, smooth: .22 }, silver: { metal: .8, smooth: .55 }, gemHue: null, raised: [[190, 4, 322, 77], [0, 0, 86, 96], [426, 0, 512, 96]], paper: SHARED_PARCHMENT },
  uncommon:  { base: { metal: .05, smooth: .3 }, gold: { metal: .65, smooth: .6 }, organic: [70, 170], gemHue: [80, 170], raised: [[145, 0, 367, 111]], paper: SHARED_PARCHMENT },
  rare:      { base: { metal: .8, smooth: .7 }, silver: { metal: .9, smooth: .82 }, gemHue: [180, 240], raised: [[145, 0, 367, 114]], paper: SHARED_PARCHMENT },
  epic:      { base: { metal: .65, smooth: .78 }, silver: { metal: .9, smooth: .86 }, gold: { metal: .9, smooth: .86 }, gemHue: [255, 310], raised: [[140, 0, 372, 114]], paper: SHARED_PARCHMENT },
  legendary: { base: { metal: .15, smooth: .35 }, gold: { metal: 1, smooth: .92 }, cloth: [330, 25], gemHue: [330, 25], raised: [[144, 0, 368, 114]], paper: SHARED_PARCHMENT },
  special:   { base: { metal: .55, smooth: .9 }, silver: { metal: .7, smooth: .92 }, gemHue: [190, 340], gemMinSat: .18, raised: [[145, 0, 367, 114]], paper: SHARED_PARCHMENT },
  soldier:   { base: { metal: 0, smooth: .25 }, silver: { metal: .85, smooth: .75 }, gold: { metal: .9, smooth: .8 }, gemHue: [195, 250], raised: [[180, 0, 372, 186], ...KIND_GEMS], paper: { name: [.14, .86, .78], medals: [] } },
  spell:     { base: { metal: .1, smooth: .45 }, gold: { metal: .9, smooth: .8 }, gemHue: [255, 300], raised: [[192, 12, 352, 194], ...KIND_GEMS], paper: { name: [.14, .86, .78], medals: [] } },
  weapon:    { base: { metal: .55, smooth: .6 }, gold: { metal: .9, smooth: .82 }, silver: { metal: .9, smooth: .85 }, gemHue: [340, 15], raised: [[164, 28, 362, 204], ...KIND_GEMS], paper: { name: [.14, .86, .78], medals: [] } },
  defense:   { base: { metal: .75, smooth: .72 }, gold: { metal: .9, smooth: .82 }, silver: { metal: .85, smooth: .8 }, gemHue: [195, 250], raised: [[184, 24, 334, 206], ...KIND_GEMS], paper: { name: [.14, .86, .78], medals: [] } },
  beast:     { base: { metal: .1, smooth: .6 }, gold: { metal: .9, smooth: .82 }, silver: { metal: .8, smooth: .7 }, gemHue: [335, 20], gemMinSat: .45, raised: [[170, 0, 342, 110], [0, 10, 60, 120], [452, 10, 512, 120]], paper: SHARED_PARCHMENT },
};

// ---------- PNG（8bit・インターレースなし） ----------
const crcTable = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

export function decodePng(buf) {
  let pos = 8, width = 0, height = 0, type = 0, depth = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos); const name = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (name === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; type = data[9]; if (data[12]) throw new Error('interlaced PNG'); }
    else if (name === 'IDAT') idat.push(data);
    else if (name === 'IEND') break;
    pos += 12 + len;
  }
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[type];
  if (depth !== 8 || !channels) throw new Error(`unsupported PNG type ${type}/${depth}`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = new Uint8Array(width * height * channels);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? out[y * stride + i - channels] : 0;
      const b = y ? out[(y - 1) * stride + i] : 0;
      const c = y && i >= channels ? out[(y - 1) * stride + i - channels] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[y * stride + i] = v & 255;
    }
  }
  // いつも RGBA にそろえて返す
  if (channels === 4) return { width, height, data: out };
  const rgba = new Uint8Array(width * height * 4);
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
// 2回なめる距離変換（chamfer 1 / √2）。zero[i] が true の所から、ほかの各点までの距離
function distance(width, height, zero, cap = 1e9) {
  const d = new Float32Array(width * height);
  for (let i = 0; i < d.length; i++) d[i] = zero[i] ? 0 : cap;
  const D = Math.SQRT2;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x; let v = d[i]; if (!v) continue;
    if (x) v = Math.min(v, d[i - 1] + 1);
    if (y) { v = Math.min(v, d[i - width] + 1); if (x) v = Math.min(v, d[i - width - 1] + D); if (x < width - 1) v = Math.min(v, d[i - width + 1] + D); }
    d[i] = v;
  }
  for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
    const i = y * width + x; let v = d[i]; if (!v) continue;
    if (x < width - 1) v = Math.min(v, d[i + 1] + 1);
    if (y < height - 1) { v = Math.min(v, d[i + width] + 1); if (x < width - 1) v = Math.min(v, d[i + width + 1] + D); if (x) v = Math.min(v, d[i + width - 1] + D); }
    d[i] = v;
  }
  return d;
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
// 4方向につながった部品に番号をふる（mask が true の所だけ）
function label(width, height, mask, key = null) {
  const lab = new Int32Array(width * height).fill(-1);
  const parts = [];
  const stack = [];
  for (let i = 0; i < lab.length; i++) {
    if (!mask[i] || lab[i] >= 0) continue;
    const id = parts.length; const part = { pixels: [] }; parts.push(part);
    lab[i] = id; stack.push(i);
    while (stack.length) {
      const j = stack.pop(); part.pixels.push(j);
      const x = j % width, y = (j - x) / width;
      for (const k of [x > 0 ? j - 1 : -1, x < width - 1 ? j + 1 : -1, y > 0 ? j - width : -1, y < height - 1 ? j + width : -1]) {
        if (k >= 0 && mask[k] && lab[k] < 0 && (!key || key[k] === key[j])) { lab[k] = id; stack.push(k); }
      }
    }
  }
  return { lab, parts };
}
// 丸い面取り（0→1）。t=0 が縁、t=1 で平ら
const bevel = (t) => t >= 1 ? 1 : Math.sqrt(1 - (1 - t) * (1 - t));

// ---------- 1枚の枠から地図を作る ----------
export function buildRelief(png, cfg) {
  const { width: W, height: H, data } = png;
  const N = W * H;
  const sx = W / 512, sy = H / 768;
  const px = (r) => [r[0] * sx, r[1] * sy, r[2] * sx, r[3] * sy];
  const alpha = new Float32Array(N), hue = new Float32Array(N), sat = new Float32Array(N), val = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    alpha[i] = data[i * 4 + 3] / 255;
    const [h, s, v] = hsv(data[i * 4] / 255, data[i * 4 + 1] / 255, data[i * 4 + 2] / 255);
    hue[i] = h; sat[i] = s; val[i] = v;
  }
  const solid = new Uint8Array(N), outline = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    solid[i] = alpha[i] > .5 ? 1 : 0;
    outline[i] = solid[i] && val[i] < .3 ? 1 : 0;
  }
  // 木目や汚しの小さな暗い点は輪郭線ではない（溝にすると表面がざらつく）ので外す
  {
    const { parts: specks } = label(W, H, outline);
    const minArea = 14 * sx * sx;
    for (const part of specks) if (part.pixels.length < minArea) for (const j of part.pixels) outline[j] = 0;
  }
  // 名前の帯・メダル（羊皮紙）
  const inPaper = (x, y) => {
    const u = x / W, v = y / H;
    const [l, r, ny] = cfg.paper.name;
    if (u >= l && u <= r && Math.abs(v - ny) <= .065) return true;
    const stats = cfg.paper.stats;
    if (stats && u >= stats[0] && u <= stats[1] && v >= stats[2] && v <= stats[3]) return true;
    return cfg.paper.medals.some(([mx, my]) => Math.hypot((u - mx) * W, (v - my) * H) <= .075 * W);
  };
  // 手前に浮かせる部品：輪郭線で区切った部品のうち、85% 以上が範囲の中にあるもの
  const inner = new Uint8Array(N);
  for (let i = 0; i < N; i++) inner[i] = solid[i] && !outline[i] ? 1 : 0;
  // 宝石の色とそれ以外は、輪郭線がうすくても別の部品として分ける（宝石が台座ごと枠につながらないように）
  const gemMinSat = cfg.gemMinSat ?? .35;
  const gemLike = new Uint8Array(N);
  if (cfg.gemHue) for (let i = 0; i < N; i++) gemLike[i] = inHue(hue[i], cfg.gemHue) && sat[i] >= gemMinSat && val[i] > .25 ? 1 : 0;
  const { lab, parts } = label(W, H, inner, gemLike);
  const rects = (cfg.raised ?? []).map(px);
  const inRects = (x, y) => rects.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
  const raisedPart = new Uint8Array(parts.length);
  parts.forEach((part, id) => {
    let inside = 0;
    for (const j of part.pixels) { const x = j % W; if (inRects(x, (j - x) / W)) inside++; }
    raisedPart[id] = part.pixels.length < N * .2 && inside / part.pixels.length >= .85 ? 1 : 0;
  });
  let raised = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (lab[i] >= 0 && raisedPart[lab[i]]) raised[i] = 1;
  // 浮かせた部品のまわりの輪郭線（4px まで）も、部品と一緒に浮かせる。部品の中の小さな輪郭線のすき間も埋まる
  {
    const toRaised = distance(W, H, raised, 99);
    for (let i = 0; i < N; i++) if (outline[i] && toRaised[i] <= 4.5 * sx) { const x = i % W; if (inRects(x, (i - x) / W)) raised[i] = 1; }
  }
  // 材質
  const metal = new Float32Array(N), smooth = new Float32Array(N), gem = new Float32Array(N), paper = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (!solid[i]) continue;
    const x = i % W, y = (i - x) / W;
    const h = hue[i], s = sat[i], v = val[i];
    let m = cfg.base.metal, g = cfg.base.smooth;
    if (outline[i]) { m *= .5; g = .2; }
    else if (raised[i] && gemLike[i]) { gem[i] = 1; m = 0; g = 1; }
    else if (inPaper(x, y) && s < .42 && v > .66 && h >= 18 && h <= 60) { paper[i] = 1; m = 0; g = .18; }
    else if (cfg.gold && h >= 30 && h <= 62 && s > .35 && v > .5) { m = cfg.gold.metal; g = cfg.gold.smooth; }
    else if (cfg.silver && s < .2 && v > .5) { m = cfg.silver.metal; g = cfg.silver.smooth; }
    else if (cfg.cloth && inHue(h, cfg.cloth) && s > .45) { m = 0; g = .25; }
    else if (cfg.organic && inHue(h, cfg.organic) && s > .25) { m = 0; g = .35; }
    metal[i] = m; smooth[i] = g;
  }
  // 宝石は輪郭線のすき間を埋めて、1つの丸い石にする
  {
    const gemMask = new Uint8Array(N); for (let i = 0; i < N; i++) gemMask[i] = gem[i] ? 1 : 0;
    const out = distance(W, H, gemMask, 99);
    const grown = new Uint8Array(N); for (let i = 0; i < N; i++) grown[i] = out[i] <= 2.5 * sx && raised[i] ? 1 : 0;
    const back = distance(W, H, grown.map(v => v ? 0 : 1), 99);
    for (let i = 0; i < N; i++) if (grown[i] && back[i] > 2.5 * sx) { gem[i] = 1; metal[i] = 0; smooth[i] = 1; }
  }
  // 高さ
  const transparent = solid.map(v => v ? 0 : 1);
  const big = distance(W, H, transparent, 999);
  const pillowZero = new Uint8Array(N); for (let i = 0; i < N; i++) pillowZero[i] = !solid[i] || outline[i] ? 1 : 0;
  const pillow = distance(W, H, pillowZero, 999);
  const paperDome = distance(W, H, paper.map(v => v ? 0 : 1), 999);
  const gemZero = new Uint8Array(N); for (let i = 0; i < N; i++) gemZero[i] = gem[i] ? 0 : 1;
  const gemDome = distance(W, H, gemZero, 999);
  const height = new Float32Array(N);
  const Rb = 22 * sx, Rp = 5 * sx, Rpaper = 16 * sx, Rg = 11 * sx;
  for (let i = 0; i < N; i++) {
    if (!solid[i]) continue;
    let h = .3 * bevel(big[i] / Rb) + .2 * bevel(pillow[i] / Rp);
    // 紙は、絵の汚しで凹凸を作らず、全体をゆるくふくらませるだけ（光は弱く広く）
    if (paper[i]) h = .3 * bevel(big[i] / Rb) + .16 * bevel(paperDome[i] / Rpaper);
    if (gem[i]) h += .26 * bevel(gemDome[i] / Rg);
    if (raised[i]) h += .14;
    height[i] = h;
  }
  const hs = blur(W, H, blur(W, H, height, 1), 1);
  for (let i = 0; i < N; i++) if (!solid[i]) hs[i] = 0;   // 透明な所はかならず0（元の絵と形をそろえる）
  // 法線（高さを px に直して、傾きから）
  const S = 9 * sx;
  const relief = new Uint8Array(W * H * 2 * 3);
  const at = (x, y) => hs[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, o = i * 3, o2 = (N + i) * 3;
    if (!solid[i]) { relief[o] = 128; relief[o + 1] = 128; relief[o + 2] = 0; continue; }
    const dx = (at(x + 1, y) - at(x - 1, y)) * .5 * S, dy = (at(x, y + 1) - at(x, y - 1)) * .5 * S;
    const l = Math.hypot(dx, dy, 1);
    relief[o] = Math.round((-dx / l * .5 + .5) * 255);
    relief[o + 1] = Math.round((-dy / l * .5 + .5) * 255);
    relief[o + 2] = Math.round(Math.min(1, hs[i]) * 255);
    relief[o2] = Math.round(metal[i] * 255);
    relief[o2 + 1] = Math.round(smooth[i] * 255);
    relief[o2 + 2] = Math.round(gem[i] * 255);
  }
  // 浮かせる部品の形（縁を1px ぼかす。元の絵の透明な所は必ず0）
  const soft = blur(W, H, Float32Array.from(raised), 1);
  const raisedOut = new Uint8Array(N * 2);
  for (let i = 0; i < N; i++) { raisedOut[i * 2] = 255; raisedOut[i * 2 + 1] = alpha[i] ? Math.round(Math.min(soft[i], alpha[i]) * 255) : 0; }
  return { width: W, height: H, relief, raised: raisedOut, debug: { hs, metal, smooth, gem, raised, paper } };
}

function writeDebug(dir, name, r) {
  const { width: W, height: H, debug } = r; const N = W * H;
  const img = new Uint8Array(N * 2 * 3);
  for (let i = 0; i < N; i++) {
    const h = Math.round(debug.hs[i] * 400); img.set([h, h, h], i * 3);
    const c = debug.gem[i] ? [255, 40, 200] : debug.paper[i] ? [240, 220, 160] : [debug.metal[i] * 255, debug.smooth[i] * 255, debug.raised[i] ? 255 : 40];
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
    console.log(`${name}: relief ${(a.length / 1024).toFixed(0)}KB, raised ${(b.length / 1024).toFixed(0)}KB`);
  }
}
