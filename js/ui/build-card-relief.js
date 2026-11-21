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
import { FRONT_SHAPES, BACK_SHAPES, shapeHeight, gemT } from './card-shapes.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const SRC = join(root, 'assets/cards');
const OUT = join(root, 'assets/cards/relief');

// ---------- 枠ごとの設定（座標は 512×768 の絵の上の px。ほかの大きさの絵は比で直す） ----------
// base：枠の地の材質。gold / silver：その色の所を金属にする。organic・cloth：その色相の所を、つやの少ない材質にする。
// gemHue：宝石の色相（度）。raised：手前に浮かせる部品のある範囲（輪郭線で区切られた部品のうち、ほとんどがこの中にあるもの）。
// paper：名前の帯・メダルの中（羊皮紙）。'name' と 'medals' は CSS の --name-y / --med-* と同じ位置。
const KIND_GEMS = [[66, 556, 154, 652], [358, 556, 446, 652]];
const SHARED_PARCHMENT = {
  name: [.155, .845, .72],
  stats: [.154, .846, .828, .917],
  medals: [[.182, .139]],
};
const FRAMES = {
  common:    { base: { metal: 0, smooth: .22 }, silver: { metal: .8, smooth: .55 }, gemHue: null, raised: [[190, 4, 322, 77], [0, 0, 86, 96], [426, 0, 512, 96]], paper: SHARED_PARCHMENT },
  uncommon:  { base: { metal: .05, smooth: .3 }, gold: { metal: .65, smooth: .6 }, organic: [70, 170], gemHue: [80, 170], raised: [[150, 0, 362, 130]], paper: SHARED_PARCHMENT },
  rare:      { base: { metal: .8, smooth: .7 }, silver: { metal: .9, smooth: .82 }, gemHue: [180, 240], raised: [[150, 0, 362, 130]], paper: SHARED_PARCHMENT },
  epic:      { base: { metal: .65, smooth: .78 }, silver: { metal: .9, smooth: .86 }, gold: { metal: .9, smooth: .86 }, gemHue: [255, 310], raised: [[150, 0, 362, 130]], paper: SHARED_PARCHMENT },
  legendary: { base: { metal: .15, smooth: .35 }, gold: { metal: 1, smooth: .92 }, cloth: [330, 25], gemHue: [335, 10], raised: [[150, 0, 362, 130]], paper: SHARED_PARCHMENT },   // 宝石は赤だけ（金の影の濃いオレンジを宝石にしない）
  special:   { base: { metal: .55, smooth: .9 }, silver: { metal: .7, smooth: .92 }, gemHue: [190, 340], gemMinSat: .18, raised: [[150, 0, 362, 130]], paper: SHARED_PARCHMENT },
  beast:     { base: { metal: .45, smooth: .75 }, gold: { metal: .9, smooth: .82 }, silver: { metal: .8, smooth: .7 }, gemHue: [335, 15], gemMinSat: .45, raised: [[150, 0, 362, 150]], paper: { name: [.15, .85, .752], stats: [.12, .88, .852, .917], medals: [[.192, .141]] } },
};

// ランク報酬のカードスキン（assets/cards/frame-skin-<ランク>.png）。窓・文字枠・メダルの位置は、レアリティの枠と同じ共通の位置
const SKIN_PAPER = SHARED_PARCHMENT;
const SKINS = {
  iron:     { base: { metal: .55, smooth: .45 }, silver: { metal: .8, smooth: .6 }, gold: { metal: .9, smooth: .8 }, gemHue: null, raised: [[150, 0, 362, 130]] },
  bronze:   { base: { metal: .6, smooth: .6 }, gold: { metal: .9, smooth: .8 }, gemHue: [10, 40], raised: [[150, 0, 362, 130]] },
  silver:   { base: { metal: .85, smooth: .75 }, gold: { metal: .9, smooth: .8 }, gemHue: [180, 240], raised: [[150, 0, 362, 130]] },
  gold:     { base: { metal: .9, smooth: .82 }, gold: { metal: .95, smooth: .88 }, gemHue: [0, 40], raised: [[150, 0, 362, 130]] },
  platinum: { base: { metal: .75, smooth: .85 }, silver: { metal: .85, smooth: .85 }, gold: { metal: .9, smooth: .8 }, gemHue: [170, 220], raised: [[150, 0, 362, 130]] },
  diamond:  { base: { metal: .8, smooth: .92 }, silver: { metal: .7, smooth: .9 }, gold: { metal: .9, smooth: .8 }, gemHue: [190, 270], gemMinSat: .25, raised: [[150, 0, 362, 130]] },
  master:   { base: { metal: .75, smooth: .88 }, gold: { metal: .95, smooth: .88 }, gemHue: [270, 330], raised: [[150, 0, 362, 140]] },
  champion: { base: { metal: .7, smooth: .88 }, gold: { metal: 1, smooth: .92 }, silver: { metal: .7, smooth: .92 }, gemHue: [190, 340], gemMinSat: .18, raised: [[150, 0, 362, 140], [0, 120, 150, 470], [362, 120, 512, 470]] },
};
for (const [rank, cfg] of Object.entries(SKINS)) FRAMES[`skin-${rank}`] = { ...cfg, paper: SKIN_PAPER };
// 凹凸は形から（js/ui/card-shapes.js）
for (const [name, cfg] of Object.entries(FRAMES)) if (FRONT_SHAPES[name]) cfg.shape = FRONT_SHAPES[name];

// ランク報酬のカード裏（assets/skins/back-rank-<ランク>.png）。拡大表示で手前に浮かせる部分（上下の飾り・左右の宝石・真ん中の紋章）の地図
const BACK_RAISED = { top: [.18, 0, .82, .2], bottom: [.18, .8, .82, 1], sides: [[0, .4, .2, .56], [.8, .4, 1, .56]], emblem: [.5, .49, .36, .3] };
function buildBackRaised(png) {
  const { width: W, height: H, data } = png;
  const out = Buffer.alloc(W * H * 2);
  const inBox = (u, v, [x0, y0, x1, y1]) => u >= x0 && u <= x1 && v >= y0 && v <= y1;
  const [ex, ey, rx, ry] = BACK_RAISED.emblem;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H, i = y * W + x;
    const inside = inBox(u, v, BACK_RAISED.top) || inBox(u, v, BACK_RAISED.bottom) || BACK_RAISED.sides.some((b) => inBox(u, v, b))
      || ((u - ex) / rx) ** 2 + ((v - ey) / ry) ** 2 <= 1;
    out[i * 2] = 255; out[i * 2 + 1] = inside ? data[i * 4 + 3] : 0;
  }
  return out;
}

// ---------- PNG（8bit・インターレースなし） ----------

// ランク報酬のカード裏の凹凸：材質（金・銀・宝石の色）は同じランクの表の設定を使い、地（真ん中の模様）は金属にしない。
// 浮かせる部品は、上下の飾り・左右の宝石・真ん中の紋章（BACK_RAISED と同じ範囲）。羊皮紙はない
// 裏の宝石の色：金・銅の裏は、オレンジがかった金の飾りを宝石にしないよう、赤みの強い色だけにする
const BACK_GEMS = { gold: { gemHue: [345, 24], gemMinSat: .55 }, bronze: { gemHue: null }, iron: { groundTolerance: .045 } };   // アイアンは紋章も地も灰色なので、地の判定を厳しく
function backReliefConfig(rank) {
  const box = ([x0, y0, x1, y1]) => [x0 * 512, y0 * 768, x1 * 512, y1 * 768];
  const [ex, ey, rx, ry] = BACK_RAISED.emblem;
  return {
    ...SKINS[rank], base: { metal: .25, smooth: .45 }, maxRaisedPart: .05,
    // 地の模様だけが写っている小さな範囲（紋章・飾りのない、四すみ寄りの内側）。ここの色に近い部品は地として浮かせない
    groundSamples: [[.14, .17, .2, .21], [.22, .17, .28, .21], [.72, .17, .78, .21], [.8, .17, .86, .21],
      [.14, .27, .2, .31], [.8, .27, .86, .31], [.14, .69, .2, .73], [.8, .69, .86, .73],
      [.14, .79, .2, .83], [.22, .79, .28, .83], [.72, .79, .78, .83], [.8, .79, .86, .83]],
    raised: [box(BACK_RAISED.top), box(BACK_RAISED.bottom), ...BACK_RAISED.sides.map(box), box([ex - rx, ey - ry, ex + rx, ey + ry])],
    paper: { name: [0, 0, -1], medals: [] },
    colorEdges: .09, groundAmp: .3,                    // 地の模様は低く（紋章・飾りを浮き上がらせる）                                   // 輪郭線のない光る水晶の星も、1つの部品としてふくらませる
    goldMinVal: .68, maxGemPart: .0025,               // 宝石は小さな石だけ（地の格子模様は宝石にしない）                                   // 地の茶色は金属にしない（明るい金の飾りだけ）
    ...BACK_GEMS[rank],
    shape: BACK_SHAPES[rank],                          // 凹凸は形から（js/ui/card-shapes.js）
  };
}

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
  // 輪郭線は細い線だけ。太い暗い面（暗い色で塗った部品）は輪郭線にしない（溝にすると、暗い所ほど低くなってしまう）
  {
    const notLine = new Uint8Array(N); for (let i = 0; i < N; i++) notLine[i] = outline[i] ? 0 : 1;
    const thick = distance(W, H, notLine, 99);
    const { parts: lines } = label(W, H, outline);
    for (const part of lines) {
      let wide = 0;
      for (const j of part.pixels) if (thick[j] > 3.5 * sx) wide++;
      if (wide > part.pixels.length * .25) for (const j of part.pixels) outline[j] = 0;
    }
  }
  // 色の強い境目（cfg.colorEdges：明るさの差の閾値）：黒い輪郭線のない絵（光る水晶の星と暗い地など）でも、部品を分けるのに使う。
  // 溝の材質にはしない（輪郭線ではないので）。小さな点は外す
  const cut = Uint8Array.from(outline);
  if (cfg.colorEdges) {
    const lum = new Float32Array(N);
    for (let i = 0; i < N; i++) lum[i] = (data[i * 4] * .3 + data[i * 4 + 1] * .59 + data[i * 4 + 2] * .11) / 255;
    const L = blur(W, H, lum, 1);
    const at = (x, y) => L[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
    const edge = new Uint8Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!solid[i]) continue;
      const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
      const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
      edge[i] = Math.hypot(gx, gy) / 4 > cfg.colorEdges ? 1 : 0;
    }
    const { parts: bits } = label(W, H, edge);
    for (const part of bits) if (part.pixels.length >= 14 * sx * sx) for (const j of part.pixels) cut[j] = 1;
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
  for (let i = 0; i < N; i++) inner[i] = solid[i] && !cut[i] ? 1 : 0;
  // 宝石の色とそれ以外は、輪郭線がうすくても別の部品として分ける（宝石が台座ごと枠につながらないように）
  const gemMinSat = cfg.gemMinSat ?? .35;
  const gemLike = new Uint8Array(N);
  if (cfg.gemHue) for (let i = 0; i < N; i++) gemLike[i] = inHue(hue[i], cfg.gemHue) && sat[i] >= gemMinSat && val[i] > .25 ? 1 : 0;
  const { lab, parts } = label(W, H, inner, gemLike);
  const rects = (cfg.raised ?? []).map(px);
  const inRects = (x, y) => rects.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
  const raisedPart = new Uint8Array(parts.length);
  const insideFrac = new Float32Array(parts.length);   // 浮かせる範囲の中にある割合
  // 地の色（cfg.groundSamples：地の模様だけが写っている小さな範囲の一覧。割合）。どれかの色に近い部品は「地」で、浮かせない
  // （格子の明るいマス・暗いマスのように、地が何色かあっても拾えるよう、あちこちで測る）
  const groundColors = [];
  for (const [gx0, gy0, gx1, gy1] of cfg.groundSamples ?? []) {
    const sum = [0, 0, 0]; let n = 0;
    for (let y = Math.round(gy0 * H); y < gy1 * H; y++) for (let x = Math.round(gx0 * W); x < gx1 * W; x++) {
      const i = y * W + x;
      if (!solid[i] || cut[i]) continue;
      for (let c = 0; c < 3; c++) sum[c] += data[i * 4 + c];
      n++;
    }
    if (n) groundColors.push(sum.map((v) => v / n / 255));
  }
  const groundPart = new Uint8Array(parts.length);
  parts.forEach((part, id) => {
    let inside = 0;
    for (const j of part.pixels) { const x = j % W; if (inRects(x, (j - x) / W)) inside++; }
    insideFrac[id] = inside / part.pixels.length;
    if (groundColors.length) {
      const mean = [0, 0, 0];
      for (const j of part.pixels) for (let c = 0; c < 3; c++) mean[c] += data[j * 4 + c] / 255 / part.pixels.length;
      groundPart[id] = groundColors.some((g) => Math.hypot(...mean.map((v, c) => v - g[c])) < (cfg.groundTolerance ?? .09)) ? 1 : 0;
    }
    raisedPart[id] = !groundPart[id] && part.pixels.length < N * (cfg.maxRaisedPart ?? .2) && inside / part.pixels.length >= .85 ? 1 : 0;
  });
  let raised = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (lab[i] >= 0 && raisedPart[lab[i]]) raised[i] = 1;
  // 浮かせた部品のまわりの輪郭線（4px まで）も、部品と一緒に浮かせる。部品の中の小さな輪郭線のすき間も埋まる
  {
    const toRaised = distance(W, H, raised, 99);
    for (let i = 0; i < N; i++) if (outline[i] && toRaised[i] <= 4.5 * sx) { const x = i % W; if (inRects(x, (i - x) / W)) raised[i] = 1; }
  }
  // 部品の中の、輪郭線・透明な所からの距離（部品をふくらませる・宝石の大きさを測るのに使う）
  const pillowZero = new Uint8Array(N); for (let i = 0; i < N; i++) pillowZero[i] = !solid[i] || cut[i] ? 1 : 0;
  const pillow = distance(W, H, pillowZero, 999);
  const partMax = new Float32Array(parts.length);
  for (let i = 0; i < N; i++) if (lab[i] >= 0 && pillow[i] > partMax[lab[i]]) partMax[lab[i]] = pillow[i];
  // 宝石：部品ごとに決める。部品の 6 割以上が宝石の色なら、白いハイライトも含めて部品全体を宝石にする
  // （色だけで決めると、ハイライトが穴になって石の形が崩れ、金の影の赤い筋が宝石の破片になる）。細い筋・小さな破片は宝石にしない
  const gemPart = new Uint8Array(parts.length);
  if (cfg.gemHue) parts.forEach((part, id) => {
    let colored = 0;
    for (const j of part.pixels) colored += gemLike[j];
    gemPart[id] = colored / part.pixels.length >= .6 && partMax[id] >= 2.5 * sx && part.pixels.length >= 40 * sx * sx && part.pixels.length <= N * .02 ? 1 : 0;
  });
  // 宝石のまわりの小さなハイライトの部品（宝石にかこまれた白い所）も宝石にする：宝石を 5px ふくらませて縮め直す（穴埋め）
  const gemSeed = new Uint8Array(N);
  for (let i = 0; i < N; i++) gemSeed[i] = lab[i] >= 0 && gemPart[lab[i]] ? 1 : 0;
  const gemReach = distance(W, H, gemSeed, 99);
  const grownGem = new Uint8Array(N); for (let i = 0; i < N; i++) grownGem[i] = gemReach[i] <= 5 * sx ? 1 : 0;
  const gemBack = distance(W, H, grownGem.map((v) => v ? 0 : 1), 99);
  const isGem = new Uint8Array(N); for (let i = 0; i < N; i++) isGem[i] = solid[i] && grownGem[i] && gemBack[i] > 5 * sx ? 1 : 0;
  // 材質
  const metal = new Float32Array(N), smooth = new Float32Array(N), gem = new Float32Array(N), paper = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (!solid[i]) continue;
    const x = i % W, y = (i - x) / W;
    const h = hue[i], s = sat[i], v = val[i];
    let m = cfg.base.metal, g = cfg.base.smooth;
    if (isGem[i]) { gem[i] = 1; m = 0; g = 1; }
    else if (outline[i]) { m *= .5; g = .2; }
    else if (inPaper(x, y) && s < .42 && v > .66 && h >= 18 && h <= 60) { paper[i] = 1; m = 0; g = .18; }
    else if (cfg.gold && h >= 30 && h <= 62 && s > .35 && v > (cfg.goldMinVal ?? .5)) { m = cfg.gold.metal; g = cfg.gold.smooth; }
    else if (cfg.silver && s < .2 && v > .5) { m = cfg.silver.metal; g = cfg.silver.smooth; }
    else if (cfg.cloth && inHue(h, cfg.cloth) && s > .45) { m = 0; g = .25; }
    else if (cfg.organic && inHue(h, cfg.organic) && s > .25) { m = 0; g = .35; }
    metal[i] = m; smooth[i] = g;
  }
  // 大きすぎる宝石の色の面（地の模様など）は宝石にしない（cfg.maxGemPart：全体に対する割合）
  if (cfg.maxGemPart) {
    const mask = new Uint8Array(N); for (let i = 0; i < N; i++) mask[i] = gem[i] ? 1 : 0;
    for (const part of label(W, H, mask).parts) if (part.pixels.length > N * cfg.maxGemPart) for (const j of part.pixels) { gem[j] = 0; metal[j] = cfg.base.metal; smooth[j] = cfg.base.smooth; }
  }
  // 高さ
  //   枠の形の丸み ＋ 部品ごとのふくらみ（部品の大きさに合わせる。大きい部品ほど高く、まんじゅうのように丸く）
  //   ＋ 宝石（ふちから真ん中へとがる、カットした石の形）＋ 浮かせる部品
  const transparent = solid.map(v => v ? 0 : 1);
  const big = distance(W, H, transparent, 999);
  const paperDome = distance(W, H, paper.map(v => v ? 0 : 1), 999);
  const gemZero = new Uint8Array(N); for (let i = 0; i < N; i++) gemZero[i] = gem[i] ? 0 : 1;
  const gemDome = distance(W, H, gemZero, 999);
  const gemLab = label(W, H, gem.map((v) => v ? 1 : 0));
  const gemMax = new Float32Array(gemLab.parts.length);
  for (let i = 0; i < N; i++) if (gemLab.lab[i] >= 0 && gemDome[i] > gemMax[gemLab.lab[i]]) gemMax[gemLab.lab[i]] = gemDome[i];
  const partAmp = new Float32Array(parts.length);
  parts.forEach((part, id) => {
    let amp = Math.min(.42, Math.max(.07, partMax[id] / (34 * sx)));
    // 地の大きな面は、ゆるくふくらませるだけ。ただし紋章・王冠など浮かせる範囲の中の部品は、大きくてもしっかりふくらませる
    if (part.pixels.length > N * .03 && insideFrac[id] < .85) amp = Math.min(amp, .2);
    // 浮かせない部品（地の模様など）は低く（cfg.groundAmp 倍）。紋章・飾りが地からはっきり浮き上がるように
    if (cfg.groundAmp != null && !raisedPart[id]) amp *= cfg.groundAmp;
    partAmp[id] = amp;
  });
  const height = new Float32Array(N);
  const Rb = 22 * sx, Rpaper = 16 * sx;
  for (let i = 0; i < N; i++) {
    if (!solid[i]) continue;
    let h = .22 * bevel(big[i] / Rb);
    const id = lab[i];
    if (id >= 0 && partMax[id] > 0) h += partAmp[id] * bevel(pillow[i] / partMax[id]);
    // 紙は、絵の汚しで凹凸を作らず、全体をゆるくふくらませるだけ（光は弱く広く）
    if (paper[i]) h = .22 * bevel(big[i] / Rb) + .16 * bevel(paperDome[i] / Rpaper);
    if (gem[i]) {
      const g = gemLab.lab[i] >= 0 ? gemMax[gemLab.lab[i]] : 0;
      h = .22 * bevel(big[i] / Rb) + .12 + (g > 0 ? .34 * Math.min(1, gemDome[i] / g) : 0);   // ふちから真ん中へ、まっすぐ高くなる（カット面）
    }
    if (raised[i]) h += .1;
    height[i] = h;
  }
  // 輪郭線の溝は浅めにする（となりの部品の低い方の高さの半分まで上げる）。深い溝にすると「暗い所ほど低い」になり、
  // 明るさがそのまま高さに見えてしまう（ui-tests/card-relief.test.js の「高さが明るさと相関しすぎない」）
  {
    const next = Float32Array.from(height);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!solid[i] || !outline[i] || gem[i]) continue;
      let low = Infinity;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (solid[j] && !cut[j] && height[j] < low) low = height[j];
      }
      if (low < Infinity && low > height[i]) next[i] = height[i] + (low - height[i]) * .5;
    }
    height.set(next);
  }
  // 色の境目（輪郭線ではない区切り）は溝にしない：となりの部品の低い方の高さにそろえて、段差にする
  if (cfg.colorEdges) {
    for (let pass = 0; pass < 3; pass++) {
      const next = Float32Array.from(height);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!solid[i] || !cut[i] || outline[i] || gem[i]) continue;
        let low = Infinity;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = yy * W + xx;
          if (solid[j] && (!cut[j] || pass > 0) && height[j] > 0 && height[j] < low) low = height[j];
        }
        if (low < Infinity && low > height[i]) next[i] = low;
      }
      height.set(next);
    }
  }
  // 形の部品（js/ui/card-shapes.js）があれば、凹凸は色ではなく形だけで作る：高さ・宝石・浮かせる部品を置きかえる
  // （色から決めるのは、金属・つやの材質だけ）
  if (cfg.shape) {
    const sh = shapeHeight({ W, H, solid, big, shape: cfg.shape });
    height.set(sh.height);
    const gemFound = new Set();   // 絵の輪郭線から形を取れた宝石
    const stoneAll = new Uint8Array(N);   // 絵から取った宝石の形
    // 羽・葉・飾りの1枚1枚：絵の線画（太いこげ茶の輪郭線。STYLE.md の決まり）で区切った部品ごとに、
    // 輪郭線からの距離でまんじゅうのように丸くふくらませる。色の濃さ・明るさは高さに使わない（区切りに使うのは線だけ）
    {
      // 線画：まわり（半径4px）より明るさが一段低い細い筋（線は真っ黒ではなく茶色なので、決まった暗さでは拾えない）。小さな点は外す
      const lum = new Float32Array(N);
      for (let i = 0; i < N; i++) lum[i] = (data[i * 4] * .3 + data[i * 4 + 1] * .59 + data[i * 4 + 2] * .11) / 255;
      const R = Math.max(2, Math.round(4 * sx));
      const sum = new Float64Array((W + 1) * (H + 1)), cnt = new Float64Array((W + 1) * (H + 1));
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, k = (y + 1) * (W + 1) + x + 1;
        sum[k] = (solid[i] ? lum[i] : 0) + sum[k - 1] + sum[k - W - 1] - sum[k - W - 2];
        cnt[k] = (solid[i] ? 1 : 0) + cnt[k - 1] + cnt[k - W - 1] - cnt[k - W - 2];
      }
      const area = (tbl, x0, y0, x1, y1) => tbl[y1 * (W + 1) + x1] - tbl[y0 * (W + 1) + x1] - tbl[y1 * (W + 1) + x0] + tbl[y0 * (W + 1) + x0];
      const line = new Uint8Array(N);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!solid[i]) continue;
        const x0 = Math.max(0, x - R), y0 = Math.max(0, y - R), x1 = Math.min(W, x + R + 1), y1 = Math.min(H, y + R + 1);
        const n = area(cnt, x0, y0, x1, y1);
        if (n && lum[i] < area(sum, x0, y0, x1, y1) / n - .08) line[i] = 1;
      }
      // 短い筋（地に描いたキラキラ✦・木目・模様の線）は部品の区切りではない。長くつながった輪郭線だけを残す
      for (const part of label(W, H, line).parts) if (part.pixels.length < 70 * sx * sx) for (const j of part.pixels) line[j] = 0;
      const inside = new Uint8Array(N);
      for (let i = 0; i < N; i++) inside[i] = solid[i] && !line[i] ? 1 : 0;
      const seg = label(W, H, inside);
      const lineZero = new Uint8Array(N); for (let i = 0; i < N; i++) lineZero[i] = inside[i] ? 0 : 1;
      const toLine = distance(W, H, lineZero, 999);
      const reach = new Float32Array(seg.parts.length);
      for (let i = 0; i < N; i++) if (seg.lab[i] >= 0 && toLine[i] > reach[seg.lab[i]]) reach[seg.lab[i]] = toLine[i];
      for (let i = 0; i < N; i++) {
        const id = seg.lab[i];
        if (id < 0 || sh.claimed[i] || reach[id] < 1.5 * sx) continue;
        const part = seg.parts[id];
        // 大きい部品ほど高く（ただし地や窓まわりのような広い面は、ゆるく）
        // 小さな部品（羽根・葉・水晶）だけをふくらませる。地・枠の広い面は、線で区切られていてもふくらませない（レンズのように盛り上がった）
        if (part.pixels.length > N * .006) continue;
        const amp = .08 + Math.min(.14, reach[id] / (40 * sx));
        height[i] += amp * bevel(toLine[i] / reach[id]);
      }
      // 宝石：測った位置は「どの宝石か」の目印だけに使い、形は絵の輪郭線で囲まれた部品から取る。
      // 目印の形を少し広げた範囲に6割以上入る小さな部品（宝石の面）を集め、輪郭線のすき間も埋めて1つの石にする。
      // 高さは、まわり（4px 外側）のいちばん高い所の上に、石のふちからの距離で真ん中へ高くなる形（へこむ所はない）
      for (const [gi, g] of (cfg.shape.gems ?? []).entries()) {
        const cx = g.x * sx, cy = g.y * (H / 768), gw = g.w * sx * 1.12, gh = g.h * (H / 768) * 1.12;
        const x0 = Math.max(0, Math.floor(cx - gw - 6)), x1 = Math.min(W - 1, Math.ceil(cx + gw + 6));
        const y0 = Math.max(0, Math.floor(cy - gh - 6)), y1 = Math.min(H - 1, Math.ceil(cy + gh + 6));
        const inArea = (x, y) => gemT(g.cut ?? 'diamond', x - cx, y - cy, gw, gh) > 0;
        const count = new Map(), hit = new Map();
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const id = seg.lab[y * W + x];
          if (id < 0) continue;
          hit.set(id, (hit.get(id) ?? 0) + (inArea(x, y) ? 1 : 0));
        }
        const mask = new Uint8Array(N);
        let any = false;
        for (const [id, n] of hit) {
          const part = seg.parts[id];
          if (part.pixels.length > N * .02 || n < part.pixels.length * .8) continue;   // 8割以上が目印の形の中にある部品だけ
          for (const j of part.pixels) mask[j] = 1;
          any = true;
        }
        if (!any) continue;
        // 輪郭線のすき間（面と面のあいだの線）を埋める：3px ふくらませて縮め直す
        const grown = distance(W, H, mask, 99);   // distance(…, src) は src が 1 の所からの距離
        const closed = new Uint8Array(N); for (let i = 0; i < N; i++) closed[i] = grown[i] <= 3 * sx && solid[i] ? 1 : 0;
        const back = distance(W, H, closed.map((v) => v ? 0 : 1), 99);
        const stone = new Uint8Array(N); for (let i = 0; i < N; i++) stone[i] = closed[i] && back[i] > 3 * sx ? 1 : 0;
        // 見つけた形が目印から大きく外れていたら（となりの部品まで拾った）、使わない
        let area = 0; for (let i = 0; i < N; i++) area += stone[i];
        // 目印の形の面積（ひし形 2wh・丸 πwh・星 約0.7wh）と比べて、大きすぎ・小さすぎ（となりまで拾った／一部しか取れない）なら使わない
        const w0 = g.w * sx, h0 = g.h * (H / 768);
        const expect = g.cut === 'round' ? Math.PI * w0 * h0 : g.cut === 'diamond' || !g.cut ? 2 * w0 * h0 : .7 * w0 * h0;
        if (area > expect * 1.5 || area < expect * .35) continue;
        const toEdge = distance(W, H, stone.map((v) => v ? 0 : 1), 999);
        let top = 0, ringTop = 0;
        for (let i = 0; i < N; i++) if (stone[i] && toEdge[i] > top) top = toEdge[i];
        const fromStone = distance(W, H, stone, 99);
        for (let i = 0; i < N; i++) if (!stone[i] && solid[i] && fromStone[i] <= 4 * sx && height[i] > ringTop) ringTop = height[i];
        for (let i = 0; i < N; i++) {
          if (!stone[i]) continue;
          height[i] = ringTop + .04 + .3 * Math.min(1, toEdge[i] / Math.max(1, top));
          sh.claimed[i] = 1;
          stoneAll[i] = g.gem !== false ? 2 : 1;
        }
        gemFound.add(gi);
      }
      // 絵から形を取れなかった宝石は、測った形のまま、まわりのいちばん高い所の上に載せる
      {
        const ring = new Map(), R = Math.round(4 * sx);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const id = sh.gemId[y * W + x];
          if (!id || gemFound.has(id - 1)) continue;
          for (let dy = -R; dy <= R; dy += R) for (let dx = -R; dx <= R; dx += R) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const j = yy * W + xx;
            if (sh.gemId[j] || !solid[j]) continue;
            if (height[j] > (ring.get(id) ?? 0)) ring.set(id, height[j]);
          }
        }
        for (let i = 0; i < N; i++) {
          const id = sh.gemId[i];
          if (id && !gemFound.has(id - 1) && !stoneAll[i]) height[i] = (ring.get(id) ?? height[i]) + .04 + .3 * sh.gemProfile[i];
        }
      }
      // 輪郭線そのものは、両どなりの部品の低い方にそろえた浅い溝（深い溝にすると、暗い線ほど低い＝色が高さに出る）
      for (let pass = 0; pass < 2; pass++) {
        const next = Float32Array.from(height);
        for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
          const i = y * W + x;
          if (!line[i] || sh.claimed[i]) continue;
          let low = Infinity;
          for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const j = yy * W + xx;
            if (inside[j] && height[j] < low) low = height[j];
          }
          if (low < Infinity) next[i] = Math.max(height[i], low - .02);
        }
        height.set(next);
      }
    }
    for (let i = 0; i < N; i++) {
      const measured = sh.gemId[i] && !gemFound.has(sh.gemId[i] - 1);
      const isStone = stoneAll[i] === 2 || (measured && sh.gem[i]);
      if (isStone) { gem[i] = 1; metal[i] = 0; smooth[i] = 1; }
      else if (gem[i]) { gem[i] = 0; metal[i] = cfg.base.metal; smooth[i] = cfg.base.smooth; }
      raised[i] = solid[i] && (stoneAll[i] || (sh.raised[i] > .5 && (!sh.gemId[i] || measured))) ? 1 : 0;
    }
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
  for (const rank of Object.keys(SKINS)) {
    const back = decodePng(readFileSync(join(root, `assets/skins/back-rank-${rank}.png`)));
    const out = encodePng(back.width, back.height, 2, buildBackRaised(back));
    writeFileSync(join(root, `assets/skins/back-rank-${rank}-raised.png`), out);
    // 3D の拡大表示（CardGL.js）で、裏も本物の凹凸のメッシュにするための地図（枠と同じ作り方。地の模様は金属にしない）
    const r = buildRelief(back, backReliefConfig(rank));
    const relief = encodePng(r.width, r.height * 2, 3, r.relief);
    writeFileSync(join(root, `assets/skins/back-rank-${rank}-relief.png`), relief);
    console.log(`back-rank-${rank}: raised ${(out.length / 1024).toFixed(0)}KB, relief ${(relief.length / 1024).toFixed(0)}KB`);
  }
}
