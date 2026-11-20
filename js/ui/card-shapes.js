// カードの枠・ランクの裏の「凹凸」を、色ではなく形から組み立てる（js/ui/build-card-relief.js が使う。ランタイムでは読み込まない）。
//
// 高さは次の部品を足し合わせて作る（座標は 512×768 の絵の上の px。ほかの大きさの絵は比で直す）
//   ・枠の板：絵の外形（透明かどうか）からの距離で、ふちを丸める（絵の窓は透明なので、窓のふちも自然に面取りされる）
//   ・はみ出す飾り：外形のうち、本体の四角（外形の行・列の大部分が埋まっている範囲）の外にある所を持ち上げる（王冠・羽・角の飾り）
//   ・板（plate）：名前の帯・下の帯。ふちの立った板
//   ・メダル（medal / disc）：ふちのあるドーム
//   ・鋲（dome）：半球
//   ・宝石（gem）：カットした石。cut は diamond（ひし形）／round（丸）／star4（4つ角の星）／star8（8つ角の星）。
//       gem: false は金属の鋲（宝石の材質にしない）。rim は宝石を囲む台座の大きさ（[w, h]。ふちが盛り上がる）
//   ・輪（ring）：丸い管。弧（arc）：輪のまわりの葉・羽（角度は右が 0 度・下が 90 度）。天使の輪（halo）：細い楕円の管
//   ・地（field）：ランクの裏の内側。一段へこませる。帯（banner）：紋章の下の帯
// 位置は、絵を目盛りつきで拡大して1枚ずつ測った（宝石・鋲・紋章）。名前の帯・メダルは全枠でほぼ同じ位置（枠ごとに測った値）。

const PLATES = [[78, 512, 434, 590], [78, 632, 434, 706]];
const MEDAL = { x: 91, y: 108, r: 35 };
const mirror = (list) => list.flatMap((p) => [p, { ...p, x: 512 - p.x }]);

export const FRONT_SHAPES = {
  common: {
    domes: [{ x: 225, y: 52, r: 8 }, { x: 287, y: 52, r: 8 }, ...mirror([{ x: 40, y: 44, r: 9 }, { x: 40, y: 712, r: 9 }])],
  },
  uncommon: { gems: [{ x: 256, y: 50, w: 35, h: 34, cut: 'diamond', rim: [46, 45] }] },
  rare: { gems: [{ x: 256, y: 64, w: 34, h: 44, cut: 'diamond', rim: [48, 58] }, { x: 256, y: 610, w: 16, h: 12, cut: 'diamond' }] },
  epic: { gems: [{ x: 256, y: 65, w: 30, h: 35, cut: 'diamond', rim: [40, 48] }] },
  legendary: {
    gems: [{ x: 256, y: 52, w: 12, h: 18, cut: 'diamond' }],
    domes: [{ x: 204, y: 31, r: 10 }, { x: 307, y: 31, r: 10 }],
  },
  special: { gems: [{ x: 256, y: 56, w: 30, h: 35, cut: 'diamond', rim: [42, 48] }] },
  beast: {
    plates: [[80, 540, 432, 618], [62, 648, 450, 700]],
    discs: [{ x: 256, y: 83, r: 40 }],
    gems: [
      { x: 256, y: 28, w: 24, h: 20, cut: 'round' },
      ...mirror([
        { x: 196, y: 41, w: 22, h: 20, cut: 'round' },
        { x: 176, y: 103, w: 12, h: 15, cut: 'diamond' },
        { x: 50, y: 352, w: 16, h: 18, cut: 'diamond' },
        { x: 46, y: 465, w: 26, h: 60, cut: 'diamond' },
        { x: 49, y: 572, w: 21, h: 27, cut: 'diamond', rim: [34, 40] },
        { x: 57, y: 697, w: 22, h: 22, cut: 'round' },
      ]),
      { x: 256, y: 497, w: 18, h: 22, cut: 'diamond' },
      { x: 256, y: 717, w: 20, h: 22, cut: 'diamond' },
    ],
  },
  'skin-iron': {
    gems: [{ x: 256, y: 53, w: 32, h: 35, cut: 'star4', gem: false }, { x: 256, y: 608, w: 16, h: 14, cut: 'diamond', gem: false }],
  },
  'skin-bronze': { gems: [{ x: 256, y: 50, w: 42, h: 43, cut: 'star4' }, { x: 256, y: 608, w: 16, h: 14, cut: 'diamond', gem: false }] },
  'skin-silver': { gems: [{ x: 256, y: 56, w: 34, h: 40, cut: 'star4' }, { x: 256, y: 608, w: 24, h: 20, cut: 'diamond' }] },
  'skin-gold': {
    gems: [{ x: 256, y: 67, w: 47, h: 50, cut: 'star4' }, ...mirror([{ x: 39, y: 327, w: 27, h: 27, cut: 'star4' }]), { x: 256, y: 606, w: 26, h: 24, cut: 'diamond' }],
  },
  'skin-platinum': {
    gems: [
      { x: 256, y: 60, w: 40, h: 52, cut: 'star4' },
      ...mirror([{ x: 49, y: 355, w: 22, h: 24, cut: 'diamond', rim: [34, 35] }]),
      { x: 256, y: 606, w: 24, h: 22, cut: 'diamond' },
      { x: 256, y: 729, w: 36, h: 35, cut: 'diamond' },
    ],
  },
  'skin-diamond': {
    gems: [{ x: 256, y: 72, w: 59, h: 64, cut: 'diamond' }, { x: 256, y: 606, w: 24, h: 22, cut: 'diamond' }, { x: 256, y: 733, w: 40, h: 40, cut: 'diamond' }],
  },
  'skin-master': {
    gems: [{ x: 256, y: 60, w: 35, h: 47, cut: 'star4' }, { x: 256, y: 606, w: 24, h: 22, cut: 'diamond' }],
    domes: [{ x: 321, y: 24, r: 10 }],
  },
  'skin-champion': {
    gems: [
      { x: 256, y: 70, w: 42, h: 57, cut: 'star4' },
      ...mirror([{ x: 167, y: 80, w: 12, h: 12, cut: 'diamond' }, { x: 39, y: 357, w: 17, h: 22, cut: 'star4' }, { x: 42, y: 707, w: 20, h: 14, cut: 'diamond' }]),
      { x: 256, y: 606, w: 24, h: 24, cut: 'star4' },
      { x: 256, y: 735, w: 36, h: 34, cut: 'star4' },
    ],
  },
};
for (const shape of Object.values(FRONT_SHAPES)) {
  shape.plates ??= PLATES;
  shape.medal ??= MEDAL;
}

// ランクの裏：地（内側の四角）・紋章（輪・星・葉・帯）・上下左右の宝石
const laurels = (y, rIn, rOut) => [{ x: 256, y, rIn, rOut, from: 115, to: 205 }, { x: 256, y, rIn, rOut, from: -25, to: 65 }];
export const BACK_SHAPES = {
  iron: {
    gems: [{ x: 256, y: 322, w: 48, h: 60, cut: 'star4', gem: false }, { x: 256, y: 56, w: 22, h: 34, cut: 'star4', gem: false },
      ...mirror([{ x: 22, y: 384, w: 12, h: 20, cut: 'diamond', gem: false }]), { x: 256, y: 670, w: 18, h: 22, cut: 'diamond', gem: false }],
  },
  bronze: {
    gems: [{ x: 256, y: 330, w: 62, h: 78, cut: 'star4', gem: false }, { x: 256, y: 52, w: 22, h: 34, cut: 'star4' },
      ...mirror([{ x: 24, y: 370, w: 12, h: 18, cut: 'diamond', gem: false }]), { x: 256, y: 664, w: 16, h: 16, cut: 'diamond', gem: false }],
  },
  silver: {
    gems: [{ x: 256, y: 330, w: 75, h: 70, cut: 'star4', gem: false }, { x: 256, y: 212, w: 18, h: 30, cut: 'star4' }, { x: 256, y: 455, w: 18, h: 28, cut: 'star4' },
      { x: 256, y: 58, w: 20, h: 30, cut: 'star4' }, ...mirror([{ x: 28, y: 360, w: 16, h: 22, cut: 'diamond' }]), { x: 256, y: 670, w: 28, h: 34, cut: 'diamond' }],
  },
  gold: {
    gems: [{ x: 256, y: 335, w: 95, h: 85, cut: 'star8', gem: false }, { x: 256, y: 58, w: 22, h: 34, cut: 'star4' },
      ...mirror([{ x: 30, y: 365, w: 14, h: 20, cut: 'diamond' }]), { x: 256, y: 690, w: 30, h: 38, cut: 'star4' },
      { x: 256, y: 155, w: 14, h: 22, cut: 'star4', gem: false }, { x: 256, y: 575, w: 14, h: 22, cut: 'star4', gem: false }],
  },
  platinum: {
    gems: [{ x: 256, y: 330, w: 75, h: 70, cut: 'star4' }, { x: 256, y: 212, w: 16, h: 28, cut: 'star4' }, { x: 256, y: 440, w: 16, h: 28, cut: 'star4' },
      { x: 256, y: 58, w: 24, h: 36, cut: 'star4' }, ...mirror([{ x: 32, y: 360, w: 18, h: 24, cut: 'diamond' }]), { x: 256, y: 685, w: 28, h: 36, cut: 'star4' }],
  },
  diamond: {
    gems: [{ x: 256, y: 330, w: 95, h: 95, cut: 'star4' }, { x: 256, y: 210, w: 16, h: 30, cut: 'star4' }, { x: 256, y: 455, w: 18, h: 30, cut: 'star4' },
      ...mirror([{ x: 160, y: 215, w: 10, h: 18, cut: 'diamond' }, { x: 24, y: 355, w: 20, h: 30, cut: 'diamond' }]),
      { x: 256, y: 60, w: 26, h: 40, cut: 'star4' }, { x: 256, y: 690, w: 30, h: 40, cut: 'star4' }],
  },
  master: {
    gems: [{ x: 256, y: 300, w: 45, h: 48, cut: 'star4' }, { x: 256, y: 205, w: 14, h: 24, cut: 'star4' }, { x: 256, y: 425, w: 16, h: 26, cut: 'star4' },
      ...mirror([{ x: 146, y: 475, w: 8, h: 14, cut: 'diamond' }, { x: 30, y: 385, w: 14, h: 18, cut: 'diamond' }]),
      { x: 256, y: 58, w: 22, h: 34, cut: 'star4' }, { x: 256, y: 672, w: 18, h: 20, cut: 'diamond' }],
  },
  champion: {
    gems: [{ x: 256, y: 320, w: 90, h: 100, cut: 'star4' }, { x: 256, y: 55, w: 22, h: 34, cut: 'star4' },
      ...mirror([{ x: 30, y: 380, w: 14, h: 18, cut: 'diamond' }]), { x: 256, y: 660, w: 20, h: 24, cut: 'star4' }],
  },
};

const bevel = (t) => t >= 1 ? 1 : t <= 0 ? 0 : Math.sqrt(1 - (1 - t) * (1 - t));
const tube = (u) => u >= 1 ? 0 : Math.sqrt(1 - u * u);       // 丸い管の断面（u：中心からの距離 ÷ 半分の幅）

/** 宝石の形の中での位置 t（真ん中 1・ふち 0・外は負） */
function gemT(cut, dx, dy, w, h) {
  const ax = Math.abs(dx) / w, ay = Math.abs(dy) / h;
  if (cut === 'round') return 1 - Math.hypot(ax, ay);
  if (cut === 'diamond') return 1 - (ax + ay);
  const star = (x, y) => 1 - (Math.sqrt(x) + Math.sqrt(y));
  if (cut === 'star8') {
    const rx = (dx + dy) / Math.SQRT2, ry = (dy - dx) / Math.SQRT2;
    return Math.max(star(ax, ay), star(Math.abs(rx) / (w * .62), Math.abs(ry) / (h * .62)));
  }
  return star(ax, ay);   // star4
}

/**
 * 形の部品から高さ（0〜1）を作る。solid：不透明か（外形）、big：透明な所からの距離（px）。
 * 返すもの：height、gem（宝石の所 0/1）、raised（手前に浮かせる部品の所 0〜1）、paper（板の中）
 */
export function shapeHeight({ W, H, solid, big, shape, back }) {
  const N = W * H, sx = W / 512, sy = H / 768, s = (sx + sy) / 2;
  const height = new Float32Array(N), gem = new Uint8Array(N), raised = new Float32Array(N), paper = new Uint8Array(N);
  const claimed = new Uint8Array(N);   // 帯・メダル・宝石・鋲が形を決めた所（線画の部品のふくらみは足さない）
  // 本体の四角：外形の行・列のうち、6割以上が埋まっている範囲（はみ出す飾りは、この外）
  const rows = new Float32Array(H), cols = new Float32Array(W);
  for (let i = 0; i < N; i++) if (solid[i]) { rows[(i / W) | 0]++; cols[i % W]++; }
  const span = (a) => { const lim = Math.max(...a) * .6; let lo = 0, hi = a.length - 1; while (lo < hi && a[lo] < lim) lo++; while (hi > lo && a[hi] < lim) hi--; return [lo, hi]; };
  const [bx0, bx1] = span(cols), [by0, by1] = span(rows);
  const P = (x, y) => [x * sx, y * sy];
  const rectInside = ([x0, y0, x1, y1], x, y, r = 12) => {
    // 角の丸い四角の内側への距離（外なら負）
    const [X0, Y0] = P(x0, y0), [X1, Y1] = P(x1, y1), R = r * s;
    const qx = Math.max(X0 + R - x, x - (X1 - R), 0), qy = Math.max(Y0 + R - y, y - (Y1 - R), 0);
    if (qx > 0 && qy > 0) return R - Math.hypot(qx, qy);
    return Math.min(x - X0, X1 - x, y - Y0, Y1 - y);
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!solid[i]) continue;
      // 枠の板
      let h = .26 * (.35 + .65 * bevel(big[i] / (16 * s)));   // ふちも少し高さを残す（細い所が奥に沈まないように）
      // はみ出す飾り（王冠・羽）は、外形からの距離のふちの丸みだけで形になる。
      // 本体の四角を基準に持ち上げると、飾りの途中にまっすぐな段ができて、ふちが裂けて見えたのでやめた
      // 地（裏の内側）：一段へこませる
      if (shape.field) {
        const d = rectInside(shape.field, x, y, 16);
        if (d > 0) h -= .1 * bevel(d / (5 * s));
      }
      // 板（名前の帯・下の帯）：はめ込みの名札。ふち（幅 5px）が立ち、中は一段へこむ
      for (const plate of shape.plates ?? []) {
        const d = rectInside(plate, x, y, 12);
        if (d > 0) { claimed[i] = 1; h += d < 5 * s ? .07 * tube(Math.abs(d - 2.5 * s) / (2.5 * s)) : -.08 * bevel((d - 5 * s) / (4 * s)); paper[i] = d > 6 * s ? 1 : 0; }
      }
      for (const banner of shape.banners ?? []) {
        const d = rectInside(banner, x, y, 6);
        if (d > 0) h += .1 * bevel(d / (6 * s));
      }
      // メダル・円盤：ふちのあるドーム
      for (const m of [shape.medal, ...(shape.discs ?? [])].filter(Boolean)) {
        const [cx, cy] = P(m.x, m.y), r = m.r * s, d = Math.hypot(x - cx, y - cy);
        if (d < r) { claimed[i] = 1; const e = r - d; h += e < 5 * s ? .08 * tube(Math.abs(e - 2.5 * s) / (2.5 * s)) : -.06 * bevel((e - 5 * s) / (4 * s)); }   // ふちが立ち、中はへこむ
      }
      // 鋲：半球
      for (const dm of shape.domes ?? []) {
        const [cx, cy] = P(dm.x, dm.y), r = dm.r * s, d = Math.hypot(x - cx, y - cy);
        if (d < r) { claimed[i] = 1; h += .22 * tube(d / r); raised[i] = Math.max(raised[i], 1); }
      }
      // 輪・天使の輪：丸い管
      for (const ring of shape.rings ?? []) {
        const [cx, cy] = P(ring.x, ring.y), d = Math.hypot(x - cx, y - cy), u = Math.abs(d - ring.r * s) / (ring.w * s);
        if (u < 1) { h += .2 * tube(u); raised[i] = Math.max(raised[i], 1); }
      }
      for (const halo of shape.halos ?? []) {
        // tilt：傾き（度。右上がりが負）
        const [cx, cy] = P(halo.x, halo.y), ta = (halo.tilt ?? 0) * Math.PI / 180;
        const lx = (x - cx) * Math.cos(ta) + (y - cy) * Math.sin(ta), ly = -(x - cx) * Math.sin(ta) + (y - cy) * Math.cos(ta);
        const e = Math.hypot(lx / (halo.rx * sx), ly / (halo.ry * sy));
        const u = Math.abs(e - 1) * Math.min(halo.rx * sx, halo.ry * sy) / (halo.w * s);
        if (u < 1) { h += .2 * tube(u); raised[i] = Math.max(raised[i], 1); }
      }
      // 葉・羽：輪のまわりの弧（帯の断面は丸く、両はしは細くなる）
      for (const arc of shape.arcs ?? []) {
        const [cx, cy] = P(arc.x, arc.y), d = Math.hypot(x - cx, y - cy);
        const mid = (arc.rIn + arc.rOut) / 2 * s, half = (arc.rOut - arc.rIn) / 2 * s, u = Math.abs(d - mid) / half;
        if (u >= 1) continue;
        let a = Math.atan2(y - cy, x - cx) * 180 / Math.PI;
        while (a < arc.from) a += 360;
        if (a > arc.to) continue;
        const end = Math.min(a - arc.from, arc.to - a) / 12;   // 両はし 12 度で細くなる
        h += .14 * tube(u / Math.min(1, Math.max(.05, end)));
        raised[i] = Math.max(raised[i], .6);
      }
      // 宝石・金属の鋲：カットした石（ふちから真ん中へ高くなり、真ん中は平らなテーブル面）。台座は盛り上がったふち
      for (const g of shape.gems ?? []) {
        const [cx, cy] = P(g.x, g.y), dx = x - cx, dy = y - cy;
        const t = gemT(g.cut ?? 'diamond', dx, dy, g.w * sx, g.h * sy);
        if (t > 0) {
          claimed[i] = 1;
          h += .1 + .32 * Math.min(1, t / .55);
          if (g.gem !== false) gem[i] = 1;
          raised[i] = Math.max(raised[i], 1);
        } else if (g.rim) {
          const tr = gemT(g.cut ?? 'diamond', dx, dy, g.rim[0] * sx, g.rim[1] * sy);
          if (tr > 0) { h += .12 * tube(1 - Math.min(1, tr / .3)); raised[i] = Math.max(raised[i], 1); }
        }
      }
      height[i] = Math.max(0, Math.min(1, h));
    }
  }
  return { height, gem, raised, paper, claimed, body: [bx0, by0, bx1, by1] };
}
