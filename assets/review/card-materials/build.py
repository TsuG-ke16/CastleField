#!/usr/bin/env python3
"""カード枠の素材マップ生成 (numpy + Pillow のみ)。
リポジトリのルートで: python3 assets/review/card-materials/build.py
"""
import json, os
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

ROOT = os.path.dirname(os.path.abspath(__file__))
CARDS = os.path.join(ROOT, "..", "..", "cards")
NAMES = ["common", "uncommon", "rare", "epic", "legendary", "special",
         "beast", "soldier", "spell", "weapon", "defense"]

# ---- 閾値（全体ルール）。色相は度(0-360)、S/V は 0-1 ----
T = dict(
    outline_v=0.30,          # これより暗いものは輪郭線（どのチャンネルにも入れない）
    paper_h=(22, 56), paper_s=(0.08, 0.58), paper_v=0.74,
    metal_s=0.32, metal_v=(0.32, 1.0),       # 灰色の銀・鉄（鉄は暖かい灰色なので彩度0.32まで）
    gold_h=(38, 58), gold_s=0.45, gold_v=0.62,  # 金
    gem_s=0.50, gem_v=0.62,                  # 宝石（彩度・明度が高い）
    gem_min_area=60,         # これより小さい宝石の塊は捨てる
    gem_max_area=6000,       # これより大きい塊は宝石ではなく枠の色面（青い胴体など）
    gem_open_r=2,            # 幅 4px 未満の細い線（紫のうずまき・赤いカーテンの縁）を消す
    holo_s=0.22, holo_v=0.78,
)
# フレームごとの上書き（関数 (h,s,v,alpha, yy,xx) -> dict）。後で必要なものだけ使う
OVERRIDES = {}

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

def label_components(mask):
    """4近傍の連結成分ラベリング（BFS、純Python。小さな領域用）。"""
    lab = np.zeros(mask.shape, np.int32); n = 0
    H, W = mask.shape
    ys, xs = np.nonzero(mask)
    for y0, x0 in zip(ys, xs):
        if lab[y0, x0]: continue
        n += 1; lab[y0, x0] = n; st = [(y0, x0)]
        while st:
            y, x = st.pop()
            for yy, xx in ((y-1,x),(y+1,x),(y,x-1),(y,x+1)):
                if 0 <= yy < H and 0 <= xx < W and mask[yy, xx] and not lab[yy, xx]:
                    lab[yy, xx] = n; st.append((yy, xx))
    return lab, n

def drop_small(mask, min_area):
    lab, n = label_components(mask)
    if n == 0: return mask
    cnt = np.bincount(lab.ravel(), minlength=n + 1)
    keep = cnt >= min_area; keep[0] = False
    return keep[lab]

def _shift_reduce(m, r, fn):
    p = np.pad(m, r, constant_values=fn is np.logical_and)
    out = m.copy()
    H, W = m.shape
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            out = fn(out, p[r+dy:r+dy+H, r+dx:r+dx+W])
    return out

def close(m, r):  # 小さな穴・ノイズを埋める（膨張→収縮）
    return _shift_reduce(_shift_reduce(m, r, np.logical_or), r, np.logical_and)

def open_(m, r):  # 細い線を消す（収縮→膨張）
    return _shift_reduce(_shift_reduce(m, r, np.logical_and), r, np.logical_or)

def blur(a, r=1.0):
    im = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))
    return np.asarray(im.filter(ImageFilter.GaussianBlur(r)), np.float32) / 255

def dist_inside(alpha_mask, cap=40):
    """端からの距離（反復侵食。4近傍と8近傍を交互にして丸く）。"""
    d = np.zeros(alpha_mask.shape, np.float32)
    cur = alpha_mask.copy()
    for i in range(cap):
        if not cur.any(): break
        d += cur
        p = np.pad(cur, 1, constant_values=False)
        er = cur & p[:-2,1:-1] & p[2:,1:-1] & p[1:-1,:-2] & p[1:-1,2:]
        if i % 2:
            er &= p[:-2,:-2] & p[:-2,2:] & p[2:,:-2] & p[2:,2:]
        cur = er
    return d

def classify(name, rgb, alpha):
    h, s, v = rgb2hsv(rgb)
    solid = alpha > 128
    nonoutline = v > T["outline_v"]
    H, W = alpha.shape
    yy, xx = np.mgrid[0:H, 0:W]; yy = yy / H; xx = xx / W

    paper = inrange(h, *T["paper_h"]) & (s >= T["paper_s"][0]) & (s <= T["paper_s"][1]) & (v >= T["paper_v"])
    gold = inrange(h, *T["gold_h"]) & (s >= T["gold_s"]) & (v >= T["gold_v"])
    if name == "legendary":   # 金と紙は彩度で分ける
        paper &= (s < 0.50)
        gold = inrange(h, 30, 60) & (s >= 0.50) & (v >= 0.55)
    # 紙は「名前帯」と「上のメダルの中」だけ（銀や金の飾りが淡いクリーム色に見えて誤判定するため）
    if name in ("common", "uncommon", "rare", "epic", "legendary", "special"):
        paper &= ((yy > 0.64) & (yy < 0.86)) | ((yy < 0.27) & ((xx < 0.33) | (xx > 0.67)))
    elif name != "beast":
        paper &= (yy > 0.64)
    paper = close(paper & nonoutline, 2)
    grey = (s < T["metal_s"]) & (v >= T["metal_v"][0]) & ~paper
    gem = (s >= T["gem_s"]) & (v >= T["gem_v"])
    holo = np.zeros_like(solid)
    metal = np.zeros_like(solid)
    # 金・ブドウの緑は別扱いのため、宝石の色相は種類ごとに限定
    gem_hue = np.zeros_like(solid)
    if name == "common":
        metal = grey
        gem = gem & False
    elif name == "uncommon":
        metal = grey
        gem_hue = inrange(h, 75, 170)
    elif name == "rare":
        metal = (s < 0.30) & (v >= 0.58) & inrange(h, 170, 260) | (grey & (v >= 0.58))
        gem_hue = inrange(h, 180, 230)
    elif name == "epic":
        metal = (s < 0.75) & (v >= 0.40) & inrange(h, 240, 330) | (grey & (v >= 0.5))
        gem_hue = inrange(h, 255, 310)
    elif name == "legendary":
        metal = gold | grey
        gem_hue = (inrange(h, 345, 360) | inrange(h, 0, 14)) & (v >= 0.58)
    elif name == "special":
        metal = (s < 0.12) & (v >= 0.80) & ~paper
        gem_hue = inrange(h, 190, 300) & (s >= 0.16) & (v >= 0.8) & (xx > 0.38) & (xx < 0.62) & ((yy < 0.13) | (yy > 0.87))
        gem_s_free = True
        holo = (s >= T["holo_s"]) & (v >= T["holo_v"]) & ~paper
    elif name == "beast":
        metal = grey | (gold)
        gem_hue = inrange(h, 75, 170)
    else:  # soldier spell weapon defense
        metal = grey | gold
        gem_hue = np.ones_like(solid, bool) & ~inrange(h, 5, 60)
        if name == "spell":
            metal = (s < 0.14) & (v >= 0.45) | gold   # 薄紫の巻物は金属ではない
            gem_hue &= (yy > 0.7)      # 本の表紙は宝石にしない。下のメダルだけ
        if name == "soldier":
            gem_hue &= (yy > 0.7)      # 兜の青い羽根は布
        if name == "weapon":           # 塗りのオレンジは金メッキ扱い
            gem = (s >= 0.5) & (v >= 0.42)
            metal = metal | (inrange(h, 24, 50) & (s > 0.6) & (v > 0.6))
        if name == "defense":
            gem_hue &= (v >= 0.8)
    if name in ("uncommon", "beast"):   # 黄緑の宝石は彩度が少し低い
        gem = inrange(h, 60, 175) & (s >= 0.30) & (v >= 0.50)
    if name == "special":
        gem = gem_hue            # 淡い宝石なので彩度条件を使わず位置で絞る
    else:
        gem = gem & gem_hue
    if name == "common": gem[:] = False
    if name in ("weapon", "soldier", "spell", "defense"):
        # 赤・青・紫・緑などの宝石は彩度が高い。木の茶色(h<45)は除く
        gem &= ~inrange(h, 5, 60)
    if name == "legendary":
        gem &= (s >= 0.6)
    if name == "special":
        gem &= ~holo | (s < 0.5)
    if name in ("uncommon", "rare", "epic", "legendary"):   # 宝石は上下の中央だけ（うずまき・カーテンを除く）
        gem &= (xx > 0.38) & (xx < 0.62) & ((yy < 0.14) | (yy > 0.86))
    if name == "weapon":
        gem &= (yy > 0.7) & (yy < 0.86)
    ov = OVERRIDES.get(name)
    m = dict(metal=metal, gem=gem, paper=paper, holo=holo)
    if ov: m = ov(m, h, s, v, yy, xx)
    v_, solid_ = v, solid
    for k in m: m[k] = m[k] & solid & nonoutline
    # 排他: 宝石 > 虹 > 紙 > 金属
    m["gem"] = close(m["gem"], 3)   # ハイライトの穴を先に埋める
    m["gem"] = open_(m["gem"], T["gem_open_r"]) if name != "special" else m["gem"]
    m["gem"] = close(m["gem"], 6) & (v_ > T["outline_v"]) & solid_
    m["gem"] = drop_small(m["gem"], T["gem_min_area"])
    lab, n = label_components(m["gem"])
    if n:
        cnt = np.bincount(lab.ravel(), minlength=n + 1)
        big = cnt > T["gem_max_area"]; big[0] = False
        m["gem"] = m["gem"] & ~big[lab]
    m["holo"] = m["holo"] & ~m["gem"]
    m["paper"] = m["paper"] & ~m["gem"] & ~m["holo"]
    m["metal"] = m["metal"] & ~m["gem"] & ~m["paper"] & ~m["holo"]
    if name != "special": m["holo"][:] = False
    m["metal"] = drop_small(m["metal"], 12)
    m["paper"] = drop_small(m["paper"], 400)
    return m

def build(name):
    im = Image.open(os.path.join(CARDS, f"frame-{name}.png")).convert("RGBA")
    arr = np.asarray(im); rgb = arr[..., :3]; a8 = arr[..., 3]
    alpha = a8.astype(np.float32) / 255
    m = classify(name, rgb, a8)
    out = os.path.join(ROOT, name); os.makedirs(out, exist_ok=True)

    # ---- mask ----
    ch = [blur(m[k].astype(np.float32), 1.0) * alpha for k in ("metal", "gem", "paper", "holo")]
    mask = np.stack([(c * 255 + .5).astype(np.uint8) for c in ch], -1)
    mask[a8 == 0] = 0
    Image.fromarray(mask, "RGBA").save(os.path.join(out, "mask.png"), optimize=True)

    # ---- height ----
    d = dist_inside(a8 > 128, 40)
    bevel = np.clip(d / 10.0, 0, 1)
    bevel = bevel * bevel * (3 - 2 * bevel)  # smoothstep
    lum = (0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]) / 255
    lum = blur(lum, 0.7)
    h_, s_, v_ = rgb2hsv(rgb)
    outline = (v_ <= T["outline_v"]).astype(np.float32)
    outline = blur(outline, 1.0)
    ht = 0.80 * bevel + 0.15 * (lum - 0.5) + 0.12 * blur(m["gem"].astype(np.float32), 1.5) \
         - 0.10 * outline
    ht = blur(ht, 0.8)
    inside = a8 > 0
    lo, hi = ht[inside].min(), ht[inside].max()
    ht = (ht - lo) / (hi - lo)
    ht8 = np.where(inside, 1 + ht * 254, 0)
    ht8 = (np.round(ht8 / 2) * 2).clip(0, 255)  # 128段階に量子化（容量のため）
    ht8[~inside] = 0
    Image.fromarray(ht8.astype(np.uint8), "L").save(os.path.join(out, "height.png"), optimize=True)

    # ---- normal ----
    hf = ht8 / 255.0
    p = np.pad(hf, 1, mode="edge")
    gx = (p[:-2,2:] + 2*p[1:-1,2:] + p[2:,2:]) - (p[:-2,:-2] + 2*p[1:-1,:-2] + p[2:,:-2])
    gy = (p[2:,:-2] + 2*p[2:,1:-1] + p[2:,2:]) - (p[:-2,:-2] + 2*p[:-2,1:-1] + p[:-2,2:])
    strength = 6.0
    nx = -gx * strength / 8; ny = gy * strength / 8  # 画像のyは下向き → +Y(上)に反転
    nz = np.ones_like(nx)
    ln = np.sqrt(nx*nx + ny*ny + nz*nz)
    n = np.stack([nx/ln, ny/ln, nz/ln], -1)
    rgbn = ((n * 0.5 + 0.5) * 255 + .5).astype(np.uint8)
    na = np.dstack([rgbn, a8])
    na[a8 == 0, :3] = (128, 128, 255)
    Image.fromarray(na, "RGBA").save(os.path.join(out, "normal.png"), optimize=True)

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
    hue = ((xx + yy) / 120.0) % 1.0
    rb = np.stack([np.clip(np.abs(((hue*6) % 6) - 3) - 1, 0, 1),
                   np.clip(2 - np.abs(((hue*6 + 2) % 6) - 3), 0, 1),
                   np.clip(2 - np.abs(((hue*6 + 4) % 6) - 3), 0, 1)], -1) * 0.6 + 0.4
    rb = rb * 255
    vis = vis * (1 - mf[..., 3:4]) + rb * mf[..., 3:4]
    visim = Image.fromarray(vis.astype(np.uint8))
    hgt = Image.fromarray(ht8.astype(np.uint8), "L").convert("RGB")
    nrm = Image.fromarray(na[..., :3], "RGB")
    strip = Image.new("RGB", (w * 4 + 30, PH + 10), (30, 30, 30))
    for i, g in enumerate((chk, visim, hgt, nrm)):
        strip.paste(sc(g), (5 + i * (w + 6), 5))
    strip.save(os.path.join(out, "preview.png"), optimize=True)
    return dict(size=[im.width, im.height],
                coverage={k: round(float(m[k].sum() / max(1, (a8 > 128).sum())), 4) for k in m})

def main():
    info = {}
    for n in NAMES:
        info[n] = build(n); print(n, info[n]["coverage"])
    files = {"mask": "mask.png", "height": "height.png", "normal": "normal.png", "preview": "preview.png"}
    mats = {}
    for n in NAMES:
        mats[n] = dict(source=f"assets/cards/frame-{n}.png", size=info[n]["size"],
                       files={k: f"{n}/{v}" for k, v in files.items()},
                       coverage=info[n]["coverage"])
    doc = {
        "version": 1,
        "generator": "assets/review/card-materials/build.py",
        "channels": {
            "mask.R": "metal (金・銀・鉄・紫の金属。鏡面ハイライト)",
            "mask.G": "gem (宝石。キラキラ・屈折)",
            "mask.B": "paper (羊皮紙・名前帯・メダルの中。ざらざら・マット)",
            "mask.A": "holo (虹色の帯。frame-special だけ。ホログラム)",
            "none": "R=G=B=A=0 は木・革・ツタ・輪郭線（マット）",
            "height": "8bit グレー。0=枠の外。高いほど出っ張り。128段階に量子化",
            "normal": "OpenGL 規約 (緑=+Y 上)。RGB=n*0.5+0.5、アルファ=枠のアルファ",
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
        "cssRects": {
            "artWindow": {"left": "12%", "top": "13%", "width": "76%", "height": "50%"},
            "nameBanner": {"top": "68%", "height": "14%"},
        },
        "frames": mats,
    }
    with open(os.path.join(ROOT, "materials.json"), "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    main()
