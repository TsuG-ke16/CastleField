#!/usr/bin/env python3
"""カード枠の素材マップ生成 (numpy + Pillow のみ)。
リポジトリのルートで: python3 assets/review/card-materials/build.py

やり方（くわしくは README.md）
1. 色で素材の候補を出す（金属・宝石・紙・虹）。
2. 暗い輪郭線で区切られた「区画」ごとに多数決して、候補を区画の形にそろえる。
   宝石は確かな種から、輪郭線か大きな色の変化まで塗り広げる。細い切れ端は捨てる。
3. 高さは「輪郭線のあいだをふくらませる」：輪郭線と枠の外からの距離で、
   区画ごとに丸い山を作る（幅の広い面は台地になる）。宝石は高く、紙は少し低く、
   輪郭線は溝になる。外側のふちの面取りと、塗りの陰影（細かい凹凸）を足す。
4. 法線は高さ（小数のまま）から作る。lit.png で2つの光を当てて確かめる。
"""
import io, json, os
import numpy as np
from PIL import Image, ImageDraw

MAX_BYTES = 295_000   # PNG 1枚の上限（300KB）より少し小さく
ROOT = os.path.dirname(os.path.abspath(__file__))
CARDS = os.path.join(ROOT, "..", "..", "cards")
NAMES = ["common", "uncommon", "rare", "epic", "legendary", "special",
         "beast", "soldier", "spell", "weapon", "defense"]

# ---- 閾値（全体ルール）。色相は度(0-360)、S/V は 0-1 ----
T = dict(
    outline_v=0.30,          # これより暗いものは輪郭線（どのチャンネルにも入れない・高さでは溝）
    paper_h=(22, 56), paper_s=(0.08, 0.58), paper_v=0.74,
    metal_s=0.32, metal_v=0.32,              # 灰色の銀・鉄（鉄は暖かい灰色なので彩度0.32まで）
    gold_h=(38, 58), gold_s=0.45, gold_v=0.62,  # 金
    gem_s=0.50, gem_v=0.62,                  # 宝石（彩度・明度が高い）
    holo_s=0.22, holo_v=0.78,
    region_max=9000,         # これより大きい区画は多数決しない（地の色面）
    vote_in=0.50, vote_out=0.20,   # 区画の何割が候補なら区画ごと入れる／捨てる
    metal_min_area=60,       # これより小さい金属の粒は捨てる
    gem_min_area=40, gem_compact=dict(default=2.0, defense=4.0),  # 面積÷周長がこれ未満は細い切れ端（defense は青い胴の切れ端が太いので強め）
    gem_max_ratio=2.6,       # 外接矩形の長辺÷短辺がこれより大きい宝石は捨てる（細長い色面）
    gem_max_area=dict(default=6000, beast=900, defense=1600, uncommon=2500, epic=2500),
)

# ---- 高さ（ピクセル単位）。height.png は 0..255 に正規化、倍率は materials.json ----
HT = dict(
    groove_cap=7.0,      # 輪郭線からこの距離で山が平らになる（台地）
    outer_cap=14.0,      # 外側のふちの面取りの幅
    outer_amp=4.5,       # 面取りの高さ
    dome_amp=dict(wood=3.6, metal=4.4, gem=5.0, paper=1.0, holo=4.0),
    offset=dict(wood=0.0, metal=0.9, gem=2.5, paper=-1.8, holo=0.4),
    gem_cap=9.0,         # 宝石は中心まで丸くとがる
    paint=1.2,           # 塗りの陰影（ハイパス）の強さ
)


def rgb2hsv(rgb):
    r, g, b = [rgb[..., i].astype(np.float32) / 255 for i in range(3)]
    mx = np.maximum(np.maximum(r, g), b); mn = np.minimum(np.minimum(r, g), b)
    d = mx - mn
    h = np.zeros_like(mx)
    m = d > 1e-6
    rm = m & (mx == r); gm = m & (mx == g) & ~rm; bm = m & ~rm & ~gm
    h[rm] = ((g - b)[rm] / d[rm]) % 6
    h[gm] = (b - r)[gm] / d[gm] + 2
    h[bm] = (r - g)[bm] / d[bm] + 4
    s = np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0)
    return h * 60, s, mx


def inrange(h, lo, hi):
    return (h >= lo) & (h <= hi) if lo <= hi else (h >= lo) | (h <= hi)


# ---------------------------------------------------------------- 画像処理の道具
def label(mask, conn=4):
    """連結成分ラベリング（numpy の union-find）。0=背景、1..n。"""
    H, W = mask.shape; N = H * W
    idx = np.arange(N).reshape(H, W)
    pairs = [(mask[:, :-1] & mask[:, 1:], idx[:, :-1], idx[:, 1:]),
             (mask[:-1] & mask[1:], idx[:-1], idx[1:])]
    if conn == 8:
        pairs += [(mask[:-1, :-1] & mask[1:, 1:], idx[:-1, :-1], idx[1:, 1:]),
                  (mask[:-1, 1:] & mask[1:, :-1], idx[:-1, 1:], idx[1:, :-1])]
    u = np.concatenate([a[m] for m, a, b in pairs])
    v = np.concatenate([b[m] for m, a, b in pairs])
    parent = np.arange(N)
    while True:
        while True:
            p2 = parent[parent]
            if np.array_equal(p2, parent): break
            parent = p2
        ru, rv = parent[u], parent[v]
        d = ru != rv
        if not d.any(): break
        np.minimum.at(parent, np.maximum(ru[d], rv[d]), np.minimum(ru[d], rv[d]))
    r = np.where(mask.ravel(), parent, -1)
    uq, inv = np.unique(r, return_inverse=True)
    inv = inv.reshape(H, W)
    if uq[0] == -1: return inv, len(uq) - 1
    return inv + 1, len(uq)


def _shift_reduce(m, r, fn):
    p = np.pad(m, r, constant_values=fn is np.logical_and)
    out = m.copy(); H, W = m.shape
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx * dx + dy * dy <= r * r + r:   # 円に近い形
                out = fn(out, p[r+dy:r+dy+H, r+dx:r+dx+W])
    return out

def dilate(m, r): return _shift_reduce(m, r, np.logical_or)
def erode(m, r): return _shift_reduce(m, r, np.logical_and)
def close(m, r): return erode(dilate(m, r), r)   # 小さな穴・すきまを埋める
def open_(m, r): return dilate(erode(m, r), r)   # 粒・細い線を消す


def blur(a, r=1.0):
    """小数のままのガウスぼかし（縦横に分けた畳み込み。端はのばす）。"""
    a = np.asarray(a, np.float32)
    k = int(np.ceil(r * 3))
    x = np.arange(-k, k + 1, dtype=np.float32)
    g = np.exp(-x * x / (2 * r * r)); g /= g.sum()
    H, W = a.shape
    p = np.pad(a, ((0, 0), (k, k)), mode="edge")
    t = sum(g[i] * p[:, i:i + W] for i in range(2 * k + 1))
    p = np.pad(t, ((k, k), (0, 0)), mode="edge")
    return sum(g[i] * p[i:i + H] for i in range(2 * k + 1)).astype(np.float32)


def edt(barrier, cap):
    """barrier からのユークリッド距離（cap で頭打ち）。列ごとの距離→行ごとに最小。"""
    H, W = barrier.shape; big = cap + 2
    g = np.full((H, W), big, np.float32)
    prev = np.full(W, big, np.float32)
    for y in range(H):
        prev = np.where(barrier[y], 0, np.minimum(prev + 1, big)); g[y] = prev
    prev = np.full(W, big, np.float32)
    for y in range(H - 1, -1, -1):
        prev = np.where(barrier[y], 0, np.minimum(prev + 1, big)); g[y] = np.minimum(g[y], prev)
    c = int(np.ceil(cap)) + 1
    gp = np.pad(g, ((0, 0), (c, c)), constant_values=big)
    d2 = np.full((H, W), big * big, np.float32)
    for dx in range(-c, c + 1):
        d2 = np.minimum(d2, dx * dx + gp[:, c+dx:c+dx+W] ** 2)
    return np.minimum(np.sqrt(d2), cap)


def drop_small(mask, min_area):
    lab, n = label(mask)
    if n == 0: return mask
    cnt = np.bincount(lab.ravel(), minlength=n + 1)
    keep = cnt >= min_area; keep[0] = False
    return keep[lab]


def fill_holes(mask, max_area):
    """まわりを mask に囲まれた小さな穴（max_area 以下）を埋める。"""
    lab, n = label(~mask)
    if n == 0: return mask
    cnt = np.bincount(lab.ravel(), minlength=n + 1)
    border = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    hole = cnt <= max_area; hole[0] = False; hole[border] = False
    return mask | hole[lab]


def drop_slivers(mask, min_area, min_compact):
    """細い切れ端（面積÷周長が小さい）と小さい塊を捨てる。"""
    lab, n = label(mask)
    if n == 0: return mask
    area = np.bincount(lab.ravel(), minlength=n + 1).astype(np.float32)
    p = np.pad(mask, 1)
    edge = mask & ~(p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:])
    per = np.bincount(lab[edge], minlength=n + 1).astype(np.float32)
    keep = (area >= min_area) & (area / np.maximum(per, 1) >= min_compact)
    keep[0] = False
    return keep[lab]


def drop_elongated(mask, max_ratio):
    """細長い塊（外接矩形の長辺÷短辺が大きい）を捨てる。宝石はだいたい丸い・ひし形。"""
    lab, n = label(mask)
    if n == 0: return mask
    ys, xs = np.nonzero(lab); l = lab[ys, xs]
    y0 = np.full(n + 1, 1 << 30); y1 = np.full(n + 1, -1); x0 = y0.copy(); x1 = y1.copy()
    np.minimum.at(y0, l, ys); np.maximum.at(y1, l, ys); np.minimum.at(x0, l, xs); np.maximum.at(x1, l, xs)
    hgt = (y1 - y0 + 1).astype(np.float32); wid = (x1 - x0 + 1).astype(np.float32)
    ratio = np.maximum(hgt, wid) / np.maximum(np.minimum(hgt, wid), 1)
    keep = ratio <= max_ratio; keep[0] = False
    return keep[lab]


def region_vote(cand, regions, n, area, allow=None):
    """区画ごとの多数決。大きい区画は画素ごとの判定のまま。"""
    cnt = np.bincount(regions.ravel(), weights=cand.ravel().astype(np.float32), minlength=n + 1)
    frac = cnt / np.maximum(area, 1)
    small = area <= T["region_max"]
    full = small & (frac >= T["vote_in"])
    drop = small & (frac < T["vote_out"])
    if allow is not None: full &= allow
    full[0] = drop[0] = False
    return (cand & ~drop[regions]) | full[regions]


# ---------------------------------------------------------------- 素材の判定
def candidates(name, h, s, v, yy, xx):
    """色だけで決める候補（あとで区画と形で掃除する）。"""
    paper = inrange(h, *T["paper_h"]) & (s >= T["paper_s"][0]) & (s <= T["paper_s"][1]) & (v >= T["paper_v"])
    gold = inrange(h, *T["gold_h"]) & (s >= T["gold_s"]) & (v >= T["gold_v"])
    grey = (s < T["metal_s"]) & (v >= T["metal_v"])
    if name == "legendary":   # 金と紙は彩度で分ける
        paper &= (s < 0.50)
        gold = inrange(h, 30, 60) & (s >= 0.50) & (v >= 0.55)
    # 紙は「名前帯」と「上のメダルの中」だけ（銀や金の飾りが淡いクリーム色に見えて誤判定するため）
    if name in ("common", "uncommon", "rare", "epic", "legendary", "special"):
        paper &= ((yy > 0.64) & (yy < 0.86)) | ((yy < 0.27) & ((xx < 0.33) | (xx > 0.67)))
    elif name != "beast":
        paper &= (yy > 0.64)
    gemc = (s >= T["gem_s"]) & (v >= T["gem_v"])
    holo = np.zeros_like(paper)
    center = (xx > 0.38) & (xx < 0.62) & ((yy < 0.14) | (yy > 0.86))
    if name == "common":
        # 金具（四すみ・上下のひし形）は青みの灰色。木目の灰色の粒は区画の多数決で消す
        metal = (s < 0.30) & (v >= 0.35)   # 鉄は暖かい灰色。木目の粒は区画の多数決と開きで消す
        gem = np.zeros_like(paper)
    elif name == "uncommon":
        metal = (s < 0.40) & (v >= 0.35) & ~inrange(h, 70, 170)   # 鉄は暖かい灰色。ツタ（緑）は除く。木の粒は多数決と開きで消す
        gem = inrange(h, 95, 175) & (s >= 0.35) & (v >= 0.40) & center   # 葉（黄緑）は除く
    elif name == "rare":
        metal = ((s < 0.42) & (v >= 0.50) & inrange(h, 160, 270)) | (grey & (v >= 0.50))
        gem = gemc & inrange(h, 180, 235) & center
    elif name == "epic":
        # 紫の地は金属にしない。ベージュ金の飾り・銀だけ
        metal = (inrange(h, 18, 62) & (s >= 0.10) & (v >= 0.40)) | (grey & (v >= 0.55) & ~inrange(h, 240, 330))
        gem = gemc & inrange(h, 255, 310) & center & (xx > 0.42) & (xx < 0.58)
    elif name == "legendary":
        metal = gold | (grey & (v >= 0.45))
        gem = (inrange(h, 345, 360) | inrange(h, 0, 14)) & (s >= 0.55) & (v >= 0.45) & center
    elif name == "special":
        metal = (s < 0.12) & (v >= 0.80) & ~paper
        gem = inrange(h, 190, 300) & (s >= 0.16) & (v >= 0.8) & center
        holo = (s >= T["holo_s"]) & (v >= T["holo_v"]) & ~paper
    elif name == "beast":
        metal = grey | gold
        gem = inrange(h, 100, 175) & (s >= 0.35) & (v >= 0.30)   # 葉・旗（黄緑）は除く
    else:  # soldier spell weapon defense
        metal = grey | gold
        gem = gemc & ~inrange(h, 5, 60) & (yy > 0.70)
        if name == "spell":
            metal = ((s < 0.14) & (v >= 0.45)) | gold   # 薄紫の巻物は金属ではない
        if name == "weapon":           # 塗りのオレンジは金メッキ扱い。宝石は下のメダルの赤
            gem = (s >= 0.5) & (v >= 0.42) & (inrange(h, 340, 360) | inrange(h, 0, 12)) & (yy > 0.70) & (yy < 0.86)
            metal = metal | (inrange(h, 24, 50) & (s > 0.6) & (v > 0.6))
        if name == "defense":
            gem &= (v >= 0.75) & ((xx < 0.30) | (xx > 0.70)) & (yy > 0.745)   # 名前帯の両はしの丸だけ（上の青い胴は除く）
    gem &= ~paper
    return dict(metal=metal & ~paper, gem=gem, paper=paper, holo=holo)


def grow_gem(seed, rgb, free, iters=40, tol=0.15):
    """宝石の種を、輪郭線か大きな色の変化に当たるまで広げる。"""
    lab, n = label(seed)
    if n == 0: return seed
    col = rgb.astype(np.float32) / 255
    out = np.zeros_like(seed)
    ys, xs = np.nonzero(lab)
    for k in range(1, n + 1):
        sel = lab[ys, xs] == k
        y0, y1 = ys[sel].min(), ys[sel].max(); x0, x1 = xs[sel].min(), xs[sel].max()
        pad = 30
        y0, x0 = max(0, y0 - pad), max(0, x0 - pad)
        y1, x1 = min(seed.shape[0], y1 + pad + 1), min(seed.shape[1], x1 + pad + 1)
        sub = lab[y0:y1, x0:x1] == k
        c = col[y0:y1, x0:x1]
        mean = c[sub].mean(0)
        # 色の近さ（明るさの差は大目に見る：宝石のハイライトや影）
        dc = c - mean
        lum = dc.mean(-1, keepdims=True)
        chroma = np.sqrt(((dc - lum) ** 2).sum(-1))
        ok = free[y0:y1, x0:x1] & (chroma < tol) & (np.abs(lum[..., 0]) < 0.45)
        cur = sub.copy()
        for _ in range(iters):
            p = np.pad(cur, 1)
            nxt = (cur | p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]) & ok
            nxt |= sub
            if np.array_equal(nxt, cur): break
            cur = nxt
        out[y0:y1, x0:x1] |= cur
    return out


def classify(name, rgb, a8):
    h, s, v = rgb2hsv(rgb)
    solid = a8 > 128
    outline = v <= T["outline_v"]
    free = solid & ~outline
    H, W = a8.shape
    yy, xx = np.mgrid[0:H, 0:W]; yy = yy / H; xx = xx / W
    c = candidates(name, h, s, v, yy, xx)
    for k in c: c[k] = c[k] & free

    regions, n = label(free)
    area = np.bincount(regions.ravel(), minlength=n + 1)

    # ---- 宝石：確かな種 → 区画/色で広げる → 穴埋め → 切れ端を捨てる
    seed = open_(close(c["gem"], 1), 1)
    seed = drop_small(seed, 12)
    gmax = T["gem_max_area"].get(name, T["gem_max_area"]["default"])
    gcomp = T["gem_compact"].get(name, T["gem_compact"]["default"])
    gem = grow_gem(seed, rgb, free & ~c["paper"])
    # 種が十分ある小さな区画（輪郭線で囲まれた宝石）は、区画ごと宝石にする
    sc = np.bincount(regions.ravel(), weights=seed.ravel().astype(np.float32), minlength=n + 1)
    whole = (sc / np.maximum(area, 1) >= 0.15) & (area <= min(gmax, 2500)); whole[0] = False
    gem |= whole[regions]
    gem = fill_holes(close(gem, 2) & solid, 250)
    gem = open_(gem, 1)
    gem = drop_slivers(gem, T["gem_min_area"], gcomp)
    lab, k = label(gem)
    if k:
        # 広がりすぎた塊（地の色面まで流れた）は、区画ごとの宝石と、種を閉じて穴を埋めたものに戻す
        cnt = np.bincount(lab.ravel(), minlength=k + 1)
        big = cnt > gmax; big[0] = False
        if big.any():
            back = whole[regions] | fill_holes(close(seed, 3) & solid, 250)
            gem = (gem & ~big[lab]) | (back & big[lab])
            gem = drop_slivers(open_(gem, 1), T["gem_min_area"], gcomp)

    gem = drop_elongated(gem, T["gem_max_ratio"])
    # 宝石と輪郭線に囲まれた小さなすき間（明るい面・ハイライト）も宝石にする
    lab, k = label(~(gem | outline) & solid)
    if k:
        cnt = np.bincount(lab.ravel(), minlength=k + 1)
        touch = np.zeros(k + 1, bool); touch[np.unique(lab[dilate(gem, 1)])] = True
        border = np.zeros(k + 1, bool); border[np.unique(lab[dilate(~solid, 1)])] = True
        add = (cnt <= 300) & touch & ~border; add[0] = False
        gem |= add[lab]
    # 宝石はだいたい凸（ひし形・丸）なので、へこみを閉じる（明るい面の欠け）
    gem |= close(gem, 4) & solid & ~c["paper"]
    # 最後に、輪郭線と金属の候補を越えずに 6px まで広げる。
    # 色の判定で取りこぼした淡い面（ハイライト）だけが入る
    near = free & ~c["paper"] & ~c["metal"] & dilate(gem, 6)   # 金の台座（金属の候補）には入らない
    for _ in range(6):
        p_ = np.pad(gem, 1)
        gem = gem | ((p_[:-2, 1:-1] | p_[2:, 1:-1] | p_[1:-1, :-2] | p_[1:-1, 2:]) & near)

    # ---- 紙：区画ごとの多数決 → 小さな穴を埋める
    paper = region_vote(c["paper"], regions, n, area) & ~gem
    paper = fill_holes(close(paper, 2), 120) & free & ~gem
    # 紙は名前帯・メダル・窓だけ。上半分は大きい面（メダル）だけ、下半分は帯の端（小さい）も残す
    paper = drop_slivers(paper, 2000, 3.0) | (drop_slivers(paper, 400, 3.0) & (yy > 0.5))

    # ---- 虹（special だけ）
    holo = c["holo"] & ~gem & ~paper
    if name == "special":
        holo = drop_small(open_(close(holo, 1), 1), 30)
    else:
        holo[:] = False

    # ---- 金属：粒を消す → 区画の多数決 → 飾りの切れ目をつなぐ → 小さい塊を捨てる
    metal = open_(c["metal"], 1)
    metal = region_vote(metal, regions, n, area)
    metal = close(metal, 2) & free
    metal = fill_holes(metal, 250) & solid   # 鋲（びょう）の穴も金属にする
    metal &= ~gem & ~paper & ~holo
    metal = drop_small(metal, T["metal_min_area"])
    return dict(metal=metal, gem=gem, paper=paper, holo=holo), outline


# ---------------------------------------------------------------- 高さ・法線
def height_px(rgb, a8, m, outline):
    solid = a8 > 128
    barrier = outline | ~solid
    d = edt(barrier, HT["gem_cap"])
    t = np.minimum(d / HT["groove_cap"], 1)
    dome = 1 - (1 - t) ** 2                      # 丸い肩、広い面は台地
    tg = np.minimum(d / HT["gem_cap"], 1)
    gdome = np.sqrt(np.clip(1 - (1 - tg) ** 2, 0, 1))   # 宝石は中心まで盛り上がる
    tp = np.minimum(d / 3.0, 1)
    pdome = 1 - (1 - tp) ** 2                    # 紙はすぐ平らになる
    mat = {k: blur(m[k].astype(np.float32), 1.2) for k in ("metal", "gem", "paper", "holo")}
    wood = np.clip(1 - mat["metal"] - mat["gem"] - mat["paper"] - mat["holo"], 0, 1)
    A, O = HT["dome_amp"], HT["offset"]
    amp = wood * A["wood"] + mat["metal"] * A["metal"] + mat["paper"] * A["paper"] + mat["holo"] * A["holo"]
    off = wood * O["wood"] + mat["metal"] * O["metal"] + mat["gem"] * O["gem"] + mat["paper"] * O["paper"] + mat["holo"] * O["holo"]
    shape = dome * (1 - mat["paper"]) + pdome * mat["paper"]
    ht = amp * shape + mat["gem"] * A["gem"] * gdome
    ht += off * dome                       # 段差は輪郭線のところで0にする（溝の底はそろう）
    # 外側のふちの面取り
    od = edt(~solid, HT["outer_cap"]) / HT["outer_cap"]
    ht += HT["outer_amp"] * (od * od * (3 - 2 * od))
    # 塗りの陰影（細かい凹凸）：明るさのハイパス
    lum = (0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]).astype(np.float32) / 255
    hp = blur(lum, 1.0) - blur(lum, 4.0)
    ht += HT["paint"] * np.clip(hp, -0.25, 0.25) * 4 * 0.5 * solid
    ht = blur(ht, 0.8)
    ht = np.where(a8 > 0, ht, 0)
    return np.maximum(ht, 0)


def normals(ht):
    p = np.pad(ht, 1, mode="edge")
    gx = ((p[:-2, 2:] + 2*p[1:-1, 2:] + p[2:, 2:]) - (p[:-2, :-2] + 2*p[1:-1, :-2] + p[2:, :-2])) / 8
    gy = ((p[2:, :-2] + 2*p[2:, 1:-1] + p[2:, 2:]) - (p[:-2, :-2] + 2*p[:-2, 1:-1] + p[:-2, 2:])) / 8
    nx = -gx; ny = gy                    # 画像のyは下向き → +Y(上)に反転
    nz = np.ones_like(nx)
    ln = np.sqrt(nx*nx + ny*ny + nz*nz)
    return np.stack([nx/ln, ny/ln, nz/ln], -1)


# ---------------------------------------------------------------- 確認用の光
def hsv2rgb(hh, ss, vv):
    i = np.floor(hh * 6) % 6; f = hh * 6 - np.floor(hh * 6)
    p = vv * (1 - ss); q = vv * (1 - f * ss); t = vv * (1 - (1 - f) * ss)
    r = np.choose(i.astype(int), [vv, q, p, p, t, vv])
    g = np.choose(i.astype(int), [t, vv, vv, q, p, p])
    b = np.choose(i.astype(int), [p, p, t, vv, vv, q])
    return np.stack([r, g, b], -1)


def shade(rgb, a8, n, mk, light, phase):
    alb = (rgb.astype(np.float32) / 255) ** 2.2
    L = np.array(light, np.float32); L /= np.linalg.norm(L)
    V = np.array([0, 0, 1], np.float32)
    Hv = (L + V) / np.linalg.norm(L + V)
    ndl = np.clip((n * L).sum(-1), 0, 1)
    ndh = np.clip((n * Hv).sum(-1), 0, 1)
    metal, gem, paper, holo = [mk[..., i] for i in range(4)]
    wood = np.clip(1 - metal - gem - paper - holo, 0, 1)
    flat = L[2]
    diff = 0.30 + 0.85 * ndl / max(flat, 0.3) * 0.75
    col = alb * diff[..., None] * (1 - 0.35 * metal[..., None])
    # 鏡面：金属は鋭く色つき、宝石はとても鋭く白、紙・木は弱く広い
    sp_m = metal * 1.6 * ndh ** 48
    sp_g = gem * 2.2 * ndh ** 90
    sp_w = (wood * 0.10 + paper * 0.05) * ndh ** 10
    col += sp_m[..., None] * (0.25 + 0.75 * alb) + (sp_g + sp_w)[..., None]
    # 金属のあたりの光（環境のにじみ）：光の方を向いた面ほど明るい
    col += (metal * 0.25 * ndl ** 4)[..., None] * alb
    # 宝石のきらめき：決まった乱数の点が、光の向きで入れ替わる
    H, W = a8.shape
    yy, xx = np.mgrid[0:H, 0:W]
    hsh = ((xx * 73856093) ^ (yy * 19349663) ^ int(phase * 83492791)) & 0xFFFF
    sp = (hsh < 300).astype(np.float32)
    sp = blur(sp, 0.8) * 6
    col += (gem * sp * ndh ** 8)[..., None] * np.array([1, 1, 1], np.float32)
    # 虹：光の向きで色相がずれる薄い膜
    hue = ((xx + yy) / 160.0 + phase * 0.37 + (n[..., 0] - n[..., 1]) * 0.6) % 1.0
    rb = hsv2rgb(hue, np.full_like(hue, 0.6), np.ones_like(hue))
    col += (holo * (0.25 + 0.55 * ndh ** 6))[..., None] * rb * 0.7
    col = np.clip(col, 0, 1) ** (1 / 2.2)
    a = (a8.astype(np.float32) / 255)[..., None]
    bg = np.array([22, 22, 28], np.float32) / 255
    return col * a + bg * (1 - a)


def save_png(img, path, colors=None):
    if colors:
        img = img.quantize(colors=colors, method=Image.MEDIANCUT, dither=Image.FLOYDSTEINBERG)
    img.save(path, optimize=True)


def build(name):
    im = Image.open(os.path.join(CARDS, f"frame-{name}.png")).convert("RGBA")
    arr = np.asarray(im); rgb = arr[..., :3]; a8 = arr[..., 3]
    alpha = a8.astype(np.float32) / 255
    m, outline = classify(name, rgb, a8)
    out = os.path.join(ROOT, name); os.makedirs(out, exist_ok=True)

    # ---- mask（ふちを約1pxぼかす）----
    ch = [np.clip(blur(m[k].astype(np.float32), 0.8), 0, 1) * alpha for k in ("metal", "gem", "paper", "holo")]
    mask = np.stack([(c * 255 + .5).astype(np.uint8) for c in ch], -1)
    mask[a8 == 0] = 0
    save_png(Image.fromarray(mask, "RGBA"), os.path.join(out, "mask.png"))

    # ---- height ----
    ht = height_px(rgb, a8, m, outline)
    inside = a8 > 0
    hmax = float(ht[inside].max())
    ht8 = np.where(inside, 1 + np.round(ht / hmax * 254), 0).astype(np.uint8)
    save_png(Image.fromarray(ht8, "L"), os.path.join(out, "height.png"))

    # ---- normal（小数の高さから）----
    # 容量（300KB 以下）のため X・Y を q 段ごとに丸め、Z は丸めた X・Y から計算し直す。
    # q は 2 から始めて、収まるまで 3, 4 … と上げる（同じ入力なら同じ q になる）
    n = normals(ht)
    for nq_step in (2, 3, 4, 5, 6):
        xy = np.round((n[..., :2] * 0.5 + 0.5) * 255 / nq_step) * nq_step
        xy = np.clip(xy, 0, 255)
        fx = xy / 255 * 2 - 1
        fz = np.sqrt(np.clip(1 - (fx ** 2).sum(-1), 0, 1))
        z8 = np.clip(np.round((fz * 0.5 + 0.5) * 255), 0, 255)
        na = np.dstack([xy[..., 0], xy[..., 1], z8, a8]).astype(np.uint8)
        na[a8 == 0, :3] = (128, 128, 255)
        buf = io.BytesIO(); Image.fromarray(na, "RGBA").save(buf, "PNG", optimize=True)
        if buf.tell() <= MAX_BYTES: break
    if buf.tell() > 300_000:
        raise SystemExit(f"{name}/normal.png が 300KB を超えます ({buf.tell()} B)")
    with open(os.path.join(out, "normal.png"), "wb") as f:
        f.write(buf.getvalue())

    # ---- lit（左上の光｜右の光）----
    nq = (na[..., :3].astype(np.float32) / 255) * 2 - 1
    nq /= np.linalg.norm(nq, axis=-1, keepdims=True)
    mk = mask.astype(np.float32) / 255
    left = shade(rgb, a8, nq, mk, (-0.55, 0.55, 0.62), 0.0)
    right = shade(rgb, a8, nq, mk, (0.80, 0.05, 0.60), 1.0)
    LH = 600; lw = int(round(im.width * LH / im.height))
    def toim(f): return Image.fromarray((f * 255 + .5).astype(np.uint8)).resize((lw, LH), Image.LANCZOS)
    lit = Image.new("RGB", (lw * 2 + 18, LH + 12), (22, 22, 28))
    lit.paste(toim(left), (6, 6)); lit.paste(toim(right), (lw + 12, 6))
    save_png(lit, os.path.join(out, "lit.png"), colors=256)

    # ---- preview ----
    PH = 256; w = int(round(im.width * PH / im.height))
    def sc(img): return img.resize((w, PH), Image.LANCZOS)
    chk = Image.new("RGB", im.size)
    cd = ImageDraw.Draw(chk)
    for y in range(0, im.height, 16):
        for x in range(0, im.width, 16):
            cd.rectangle([x, y, x+15, y+15], fill=(200,200,200) if (x//16+y//16) % 2 else (140,140,140))
    chk.paste(im, (0, 0), im)
    mf = mask.astype(np.float32) / 255
    vis = np.full(im.size[::-1] + (3,), 50, np.float32)
    for c, col in ((0, (255, 200, 40)), (1, (255, 0, 220)), (2, (0, 230, 230))):
        vis = vis * (1 - mf[..., c:c+1]) + np.array(col, np.float32) * mf[..., c:c+1]
    yy, xx = np.mgrid[0:im.height, 0:im.width]
    rb = hsv2rgb(((xx + yy) / 120.0) % 1.0, np.full(xx.shape, 0.6), np.ones(xx.shape)) * 255
    vis = vis * (1 - mf[..., 3:4]) + rb * mf[..., 3:4]
    visim = Image.fromarray(vis.astype(np.uint8))
    hgt = Image.fromarray(ht8, "L").convert("RGB")
    nrm = Image.fromarray(na[..., :3], "RGB")
    strip = Image.new("RGB", (w * 4 + 30, PH + 10), (30, 30, 30))
    for i, g in enumerate((chk, visim, hgt, nrm)):
        strip.paste(sc(g), (5 + i * (w + 6), 5))
    save_png(strip, os.path.join(out, "preview.png"))
    return dict(size=[im.width, im.height], heightScalePx=round(hmax / 254, 5), normalStep=nq_step,
                coverage={k: round(float(m[k].sum() / max(1, (a8 > 128).sum())), 4) for k in m})


def main():
    info = {}
    for n in NAMES:
        info[n] = build(n); print(n, info[n]["coverage"])
    files = {"mask": "mask.png", "height": "height.png", "normal": "normal.png",
             "preview": "preview.png", "lit": "lit.png"}
    mats = {}
    for n in NAMES:
        mats[n] = dict(source=f"assets/cards/frame-{n}.png", size=info[n]["size"],
                       files={k: f"{n}/{v}" for k, v in files.items()},
                       heightScalePx=info[n]["heightScalePx"], normalStep=info[n]["normalStep"],
                       coverage=info[n]["coverage"])
    doc = {
        "version": 2,
        "generator": "assets/review/card-materials/build.py",
        "channels": {
            "mask.R": "metal (金・銀・鉄・金色の飾り。鏡面ハイライト)",
            "mask.G": "gem (宝石。キラキラ・屈折)",
            "mask.B": "paper (羊皮紙・名前帯・メダルの中。ざらざら・マット)",
            "mask.A": "holo (虹色の帯。frame-special だけ。ホログラム)",
            "none": "R=G=B=A=0 は木・革・ツタ・輪郭線（マット）",
            "height": "8bit グレー。0=枠の外、1..255=枠の中。高いほど出っ張り。1段 = heightScalePx ピクセル",
            "normal": "OpenGL 規約 (緑=+Y 上)。RGB=n*0.5+0.5（X・Y は normalStep 段ごとに丸め、Z は計算し直し）、アルファ=枠のアルファ。高さ(小数)から Sobel で作成",
            "lit": "確認用。左=左上からの光、右=右からの光（Lambert + Blinn-Phong、マスクで鏡面の強さを変える）",
        },
        "heightMethod": {
            "summary": "inflate between outlines: 輪郭線(V<=0.30)と枠の外からの距離で区画ごとに丸い山（groove_cap で台地）、宝石は高く紙は低く、外のふちの面取りと塗りのハイパスを足す",
            "params": HT,
        },
        "materials": {
            "metal": {"metalness": 0.9, "roughness": 0.3, "specular": 1.0, "envMapIntensity": 1.0},
            "gem": {"metalness": 0.1, "roughness": 0.08, "sparkle": {"intensity": 1.4, "density": 0.6, "speed": 1.0}, "tintBoost": 1.2},
            "paper": {"metalness": 0.0, "roughness": 0.85, "specular": 0.1, "grain": 0.15},
            "wood": {"metalness": 0.0, "roughness": 0.7, "specular": 0.2, "note": "マスクのどのチャンネルも0の所（輪郭線・ツタ・革も同じ）"},
            "holo": {"metalness": 0.6, "roughness": 0.2, "iridescence": 1.0, "hueShiftByTilt": 360, "note": "frame-special のみ"},
        },
        "layers": [
            {"name": "windowBackground", "desc": "parchment/cream fill behind art, CSS", "depth": 0.0},
            {"name": "art", "desc": "assets/cards/card-<type>.png, transparent subject", "depth": 0.6},
            {"name": "frame", "desc": "assets/cards/frame-<rarity>.png (+ review maps)", "depth": 1.0},
            {"name": "text/icons", "desc": "HTML", "depth": 1.1},
        ],
        "layerOrder": ["windowBackground (parchment/cream fill behind art, CSS)",
                       "art (assets/cards/card-<type>.png, transparent subject)",
                       "frame (assets/cards/frame-<rarity>.png)",
                       "text/icons (HTML)"],
        # 窓・丸・名前の位置は css/rarity-assets.css の --win-* / --med-* / --name-y が正。
        # ここは 2026-11-18 時点の写し（CSSを変えたらここも直す）。
        "cssRects": {
            "source": "css/rarity-assets.css (--win-l/t/w/h, --med-y/l/r, --name-y). The CSS is authoritative.",
            "byRarity": {
                "default":   {"winL": "16%", "winT": "17%", "winW": "71%", "winH": "46%", "medY": "14%", "medL": "19%", "medR": "84%", "nameY": "74%"},
                "uncommon":  {"winL": "13%", "winT": "20%", "winW": "72%", "winH": "45%", "medY": "16%", "medL": "16%", "medR": "83%", "nameY": "75%"},
                "rare":      {"winL": "15%", "winT": "21%", "winW": "72%", "winH": "44%", "medY": "18%", "medL": "17%", "medR": "84%", "nameY": "76%"},
                "special":   {"winL": "15%", "winT": "21%", "winW": "72%", "winH": "44%", "medY": "18%", "medL": "17%", "medR": "84%", "nameY": "76%"},
                "epic":      {"winL": "14%", "winT": "24%", "winW": "72%", "winH": "42%", "medY": "21%", "medL": "15%", "medR": "84%", "nameY": "75%"},
                "legendary": {"winL": "16%", "winT": "26%", "winW": "67%", "winH": "40%", "medY": "23%", "medL": "17%", "medR": "82%", "nameY": "76%"},
                "beast":     {"winL": "12%", "winT": "20%", "winW": "76%", "winH": "46%", "note": "css/beast.css"},
            },
        },
        "frames": mats,
    }
    with open(os.path.join(ROOT, "materials.json"), "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
        f.write("\n")


if __name__ == "__main__":
    main()
