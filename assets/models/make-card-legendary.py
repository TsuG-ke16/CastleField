"""レジェンドのカードを、本物の立体（重厚な金枠・王冠・縦長ルビー宝石と台座・金の翼・赤いドレープ布・二段金縁の名前欄と数値欄・メダル）で作り、card-legendary.glb に書き出す。

使い方（リポジトリのルートで）：
  blender --background --python assets/models/make-card-legendary.py
  （Blender の「スクリプト」タブや Blender MCP から実行してもよい）

位置と大きさは、枠の絵 assets/cards/frame-legendary.png（512×768）を測って決めた。絵がデザインの正なので、形を変えるときは絵を測り直す。
単位：枠の絵の幅を 1 とする（1 = 512px）。Blender では X が右・Z が上・手前が -Y。書き出しの「Y up」で glTF の X 右・Y 上・手前 +Z になる。
厚み：裏 +0.0285 〜 金枠の表 -0.0285（0.057）。王冠・宝石・金具・翼・ドレープはそこから手前に出る。

マテリアル名（three.js 側は名前で材質を決める）：
  face      … 表の絵を貼る所（枠の表・絵の窓の奥・名前欄・数値欄・メダルの中・翼・ドレープ・王冠の表）。UV は枠の絵の 0〜1（上が 0）
  back      … 裏の絵。UV は本体の外形の 0〜1（裏から見て正しい向き）
  gold_dark … 枠の側面・段差の壁（重厚な燻し金）
  gold      … 輝く金の立体装飾（王冠の縁・オーブ・バンド・宝石の台座と爪・メダルの輪・窓と欄の二段金縁）
  crimson   … 左右の赤い布ドレープの側面（深紅ベルベット）
  foil      … 宝石の奥の器（光を返す反射箔。ルビーが中から燃えるように明るく見える）
  glow      … 控えめな発光アクセント（ルビー台座の内縁・王冠バンド中央）
  gem       … ルビー宝石（縦長ひし形ブリリアントカット・フラットファセット）
"""
import math
from pathlib import Path

import bpy
import bmesh
import numpy as np
from mathutils import Vector

# ---- 場所 ----
try:
    REPO = Path(__file__).resolve().parents[2]
except NameError:          # MCP などで exec したとき
    REPO = Path(globals().get('REPO', '.'))
FRAME_PNG = REPO / 'assets/cards/frame-legendary.png'
OUT = REPO / 'assets/models/card-legendary.glb'
PREVIEW_FACE = globals().get('PREVIEW_FACE')     # 確認用の表の絵（あれば face に貼る。書き出しには入れない）

PX = 512.0                 # 枠の絵の幅（ピクセル）= 1
IMG_H = 768

# ---- 厚み（手前が -Y）----
BACK_Y = 0.0285            # 裏
SLAB_FRONT = -0.0110       # 板の表（絵の窓の奥）
FRAME_TOP = -0.0285        # 金枠の表（厚み 0.057 でレジェンドらしい重厚感）
PLATE_TOP = -0.0220        # 名前欄・数値欄の表（金枠よりしっかり沈めて額縁の重厚感を出す）
MEDAL_TOP = -0.0245        # メダルの中の表
CROWN_LIFT = 0.0110        # 王冠の基準せり出し量
CROWN_CURVE = 0.0085       # 王冠の中央（x=256）の丸み膨らみ量

# ---- 測った位置（枠の絵のピクセル）----
BODY = (20, 46, 491, 749, 26)            # 本体の外形：左・上・右・下・角の丸み
WINDOW = (76, 118, 435, 485, 7)          # 絵の窓
NAME = (75, 511, 436, 592, 12)           # 名前欄
STAT = (74, 629, 437, 708, 12)           # 数値欄
MEDAL = (92.5, 105.0, 33.5, 43.0)        # メダル：中心 x・y、クリームの半径、金の輪の外の半径
GEM = (256.0, 49.0)                      # 王冠中央ルビーの中心
GEM_RX, GEM_RY = 17.5, 25.5              # ルビーのガードル半径（横・縦：縦長ひし形）
TABLE_RX, TABLE_RY = 8.8, 13.0           # ルビーのテーブル半径（横・縦）
SET_OUT_X, SET_OUT_Y = 22.0, 30.5        # ルビー台座の外半径（横・縦）
SET_IN_X, SET_IN_Y = 18.2, 26.2          # ルビー台座の内半径（横・縦）
ORB_L = (206.0, 30.0, 9.0)               # 王冠左の金玉 (cx, cy, r)
ORB_R = (306.0, 30.0, 9.0)               # 王冠右の金玉 (cx, cy, r)


def to_xz(px, py):
    """枠の絵のピクセル → Blender の (X, Z)"""
    return px / PX - 0.5, (IMG_H / 2 - py) / PX


def face_uv(x, z):
    """表の絵の UV（枠の絵の 0〜1。glTF に書くと上が 0 になる）"""
    return x + 0.5, z * PX / IMG_H + 0.5


def crown_arch_dy(x):
    """王冠の円筒カーブ：中央 (x=0) で最も手前 (-Y) に膨らむ"""
    half_w = 56.0 / PX
    t = max(-1.0, min(1.0, x / half_w))
    return -CROWN_CURVE * math.cos(t * math.pi * 0.5)


# ---------------------------------------------------------------- 場面
def fresh_scene():
    if bpy.app.background or not bpy.context.window:
        scene = bpy.context.scene
    else:
        scene = bpy.data.scenes.get('CardLegendary') or bpy.data.scenes.new('CardLegendary')
    old = bpy.data.objects.get('card-legendary')
    if old:
        for obj in [*old.children, old]:
            bpy.data.objects.remove(obj, do_unlink=True)
    if bpy.context.window:
        bpy.context.window.scene = scene
    return scene


# ---------------------------------------------------------------- マテリアル
def material(name, color, metallic=0.0, roughness=0.5, **extra):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    for node in [n for n in nodes if n.type == 'TEX_IMAGE']:
        nodes.remove(node)
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    for key, value in extra.items():
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = value
    return mat


def make_materials():
    mats = {
        'face': material('face', (0.88, 0.72, 0.35), metallic=0.08, roughness=0.45),
        'back': material('back', (0.35, 0.24, 0.10), roughness=0.52),
        'gold_dark': material('gold_dark', (0.58, 0.36, 0.08), metallic=0.92, roughness=0.30),
        'gold': material('gold', (0.98, 0.74, 0.20), metallic=1.0, roughness=0.18),
        'crimson': material('crimson', (0.38, 0.02, 0.03), metallic=0.05, roughness=0.82),
        'foil': material('foil', (1.0, 0.52, 0.48), metallic=1.0, roughness=0.10),
        'glow': material('glow', (1.0, 0.78, 0.35), metallic=0.6, roughness=0.2,
                         **{'Emission Color': (1.0, 0.28, 0.12, 1.0), 'Emission Strength': 1.4}),
        'gem': material('gem', (0.85, 0.03, 0.08), roughness=0.02,
                        **{'Transmission Weight': 0.90, 'IOR': 1.77}),
    }
    for key, path in (('face', PREVIEW_FACE), ('back', REPO / 'assets/ui/card-back.png' if PREVIEW_FACE else None)):
        if not path:
            continue
        mat = mats[key]
        nodes = mat.node_tree.nodes
        tex = nodes.new('ShaderNodeTexImage')
        tex.image = bpy.data.images.load(str(path), check_existing=True)
        bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
        mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
        if key == 'face':
            mat.node_tree.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
    return mats


# ---------------------------------------------------------------- 枠の絵を読む・輪郭をたどる
_pixels = None


def frame_pixels():
    """枠の絵の RGBA（0〜1。上が 0 の行）"""
    global _pixels
    if _pixels is None:
        image = bpy.data.images.load(str(FRAME_PNG), check_existing=True)
        w, h = image.size
        _pixels = np.array(image.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1].copy()
    return _pixels


def blur5(a):
    k = np.array([1, 4, 6, 4, 1], dtype=np.float32) / 16
    a = np.apply_along_axis(lambda r: np.convolve(r, k, 'same'), 1, a)
    return np.apply_along_axis(lambda c: np.convolve(c, k, 'same'), 0, a)


def shift_or(m):
    out = m.copy()
    out[1:] |= m[:-1]; out[:-1] |= m[1:]
    out[:, 1:] |= out[:, :-1].copy(); out[:, :-1] |= out[:, 1:].copy()
    return out


def simplify(p, eps):
    def rdp(q):
        if len(q) < 3:
            return q
        a, b = q[0], q[-1]
        ab = b - a
        length = math.hypot(*ab) or 1e-9
        d = np.abs(ab[0] * (q[:, 1] - a[1]) - ab[1] * (q[:, 0] - a[0])) / length
        i = int(np.argmax(d))
        if d[i] > eps:
            return np.vstack([rdp(q[:i + 1])[:-1], rdp(q[i:])])
        return np.array([a, b])
    half = len(p) // 2
    return np.vstack([rdp(p[:half + 1])[:-1], rdp(np.vstack([p[half:], p[:1]]))[:-1]])


def trace(mask, start, spacing=2.0, smooth=6, eps=0.25):
    h, w = mask.shape
    dirs = [(-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1)]
    pts, cur, back = [start], start, 6
    for _ in range(200000):
        for k8 in range(8):
            d = (back + 1 + k8) % 8
            ny, nx = cur[0] + dirs[d][0], cur[1] + dirs[d][1]
            if 0 <= ny < h and 0 <= nx < w and mask[ny, nx]:
                back, cur = (d + 4) % 8, (ny, nx)
                break
        if cur == start:
            break
        pts.append(cur)
    else:
        raise RuntimeError('輪郭が閉じませんでした')
    p = np.array([(x + 0.5, y + 0.5) for y, x in pts], dtype=np.float64)
    for _ in range(smooth):
        p = (np.roll(p, 1, 0) + 2 * p + np.roll(p, -1, 0)) / 4
    seg = np.hypot(*(np.roll(p, -1, 0) - p).T)
    total = np.concatenate([[0], np.cumsum(seg)])
    closed = np.vstack([p, p[:1]])
    at = np.arange(0, total[-1], spacing)
    return simplify(np.stack([np.interp(at, total, closed[:, 0]), np.interp(at, total, closed[:, 1])], 1), eps)


def extract_components(mask, min_size=120, spacing=1.8, smooth=4, eps=0.35):
    """二値マスクの連結成分をすべて輪郭ループのリストにして返す"""
    h, w = mask.shape
    label = np.zeros((h, w), np.int32)
    loops, count = [], 0
    for y0, x0 in zip(*np.nonzero(mask)):
        if label[y0, x0]:
            continue
        count += 1
        stack, size = [(y0, x0)], 0
        label[y0, x0] = count
        while stack:
            y, x = stack.pop()
            size += 1
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not label[ny, nx]:
                    label[ny, nx] = count
                    stack.append((ny, nx))
        if size < min_size:
            continue
        loop = trace(label == count, (int(y0), int(x0)), spacing=spacing, smooth=smooth, eps=eps)
        if len(loop) >= 8:
            loops.append(loop)
    return loops


def frame_outline():
    mask = blur5(frame_pixels()[:, :, 3]) > 0.5
    ys, xs = np.nonzero(mask)
    return trace(mask, (int(ys.min()), int(xs[ys == ys.min()].min())), spacing=1.5, eps=0.3)


def window_medal_hole(scale=4):
    x0, y0, x1, y1, r = WINDOW
    mx, my, rm_in, _ = MEDAL
    rm = rm_in + 2.0
    w, h = int(x1 + 2) * scale, int(y1 + 2) * scale
    yy, xx = (np.mgrid[0:h, 0:w] + 0.5) / scale
    cx = np.clip(xx, x0 + r, x1 - r)
    cy = np.clip(yy, y0 + r, y1 - r)
    rect = (xx >= x0) & (xx <= x1) & (yy >= y0) & (yy <= y1) & (np.hypot(xx - cx, yy - cy) <= r)
    mask = rect | (np.hypot(xx - mx, yy - my) <= rm)
    ys, xs = np.nonzero(mask)
    loop = trace(mask, (int(ys.min()), int(xs[ys == ys.min()].min())), spacing=1.0 * scale, smooth=2, eps=0.15 * scale)
    return [tuple(q / scale) for q in loop]


def drape_outlines():
    """左右の赤いベルベット・ドレープ布の輪郭を抽出"""
    p = frame_pixels()
    r, g, b, a = p[..., 0], p[..., 1], p[..., 2], p[..., 3]
    h, w = a.shape
    yy, xx = np.mgrid[0:h, 0:w]
    mask = (a > 0.5) & (r > 0.16) & (r > g * 2.5) & (r > b * 2.5) & (yy >= 315) & (yy <= 565) & ((xx < 85) | (xx > 427))
    # 少し穴埋めして滑らかに
    m = mask
    for _ in range(2):
        m = shift_or(m)
    for _ in range(2):
        m = ~shift_or(~m)
    return extract_components(m, min_size=400, spacing=2.0, smooth=4, eps=0.35)


def wing_and_pillar_outlines():
    """王冠の左右の黄金の翼と、左右サイドの編み込み柱・四隅スクロールを立体盛り上げ用に抽出"""
    p = frame_pixels()
    r, g, b, a = p[..., 0], p[..., 1], p[..., 2], p[..., 3]
    h, w = a.shape
    yy, xx = np.mgrid[0:h, 0:w]
    # 明るい黄金色（暗い背景茶・赤い布・クリーム欄を除外）
    bright_gold = (a > 0.5) & (r > 0.60) & (g > 0.34) & (b < 0.55) & ((r - b) > 0.25)

    # A) 王冠左右の黄金の翼 (y=10..112, x=112..208 および x=304..400)
    wing_zone = (yy >= 10) & (yy <= 112) & (((xx >= 110) & (xx <= 207)) | ((xx >= 305) & (xx <= 402)))
    # メダル領域を除外
    not_medal = np.hypot(xx - MEDAL[0], yy - MEDAL[1]) > MEDAL[3] + 2
    wing_mask = bright_gold & wing_zone & not_medal
    for _ in range(2):
        wing_mask = shift_or(wing_mask)
    for _ in range(2):
        wing_mask = ~shift_or(~wing_mask)
    wing_loops = extract_components(wing_mask, min_size=180, spacing=2.0, smooth=4, eps=0.35)

    # B) 左右サイドの編み込み柱＆四隅スクロール（窓・欄の外側で赤い布を除く）
    drape_zone = (r > 0.18) & (r > g * 2.4) & (r > b * 2.4) & (yy >= 315) & (yy <= 565)
    side_zone = ((xx <= 66) | (xx >= 446)) & (yy >= 42) & (yy <= 750)
    pillar_mask = bright_gold & side_zone & not_medal & (~shift_or(shift_or(drape_zone)))
    for _ in range(1):
        pillar_mask = ~shift_or(~pillar_mask)
    for _ in range(2):
        pillar_mask = shift_or(pillar_mask)
    pillar_mask &= (a > 0.5)
    pillar_loops = extract_components(pillar_mask, min_size=180, spacing=2.2, smooth=4, eps=0.40)

    return wing_loops, pillar_loops


def crown_outline():
    """王冠本体 (x=196..316, y=2..91) の実輪郭を抽出"""
    p = frame_pixels()
    a = p[..., 3]
    h, w = a.shape
    yy, xx = np.mgrid[0:h, 0:w]
    # 王冠の左右の境界は y に応じてわずかに内側に絞る（台形形状: 上 196..316 → 下 205..307）
    t = np.clip((yy - 25.0) / 65.0, 0.0, 1.0)
    x_left = 195.0 + 11.0 * t
    x_right = 317.0 - 11.0 * t
    # 下端は緩やかなアーチ (y=90 付近)
    y_bot = 91.0 - 4.0 * ((xx - 256.0) / 52.0) ** 2
    mask = (a > 0.5) & (xx >= x_left) & (xx <= x_right) & (yy >= 1) & (yy <= y_bot)
    ys, xs = np.nonzero(mask)
    return trace(mask, (int(ys.min()), int(xs[ys == ys.min()].min())), spacing=1.5, smooth=3, eps=0.25)


def rounded_rect(x0, y0, x1, y1, r, steps=6):
    pts = []
    for cx, cy, a0 in ((x1 - r, y0 + r, -90), (x1 - r, y1 - r, 0), (x0 + r, y1 - r, 90), (x0 + r, y0 + r, 180)):
        for i in range(steps + 1):
            a = math.radians(a0 + 90 * i / steps)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def circle(cx, cy, r, steps=48):
    return [(cx + r * math.cos(2 * math.pi * i / steps), cy + r * math.sin(2 * math.pi * i / steps)) for i in range(steps)]


def grow(rect, d):
    x0, y0, x1, y1, r = rect
    return (x0 - d, y0 - d, x1 + d, y1 + d, max(0.5, r + d))


# ---------------------------------------------------------------- 押し出し・メッシュユーティリティ
def slab_from_loops(name, loops, front_y, back_y, bevel, resolution=2):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '2D'
    curve.fill_mode = 'BOTH'
    thickness = abs(back_y - front_y)
    curve.extrude = max(0.0002, thickness / 2 - bevel)
    curve.bevel_depth = bevel
    curve.bevel_resolution = resolution
    curve.offset = -bevel
    for loop in loops:
        spline = curve.splines.new('POLY')
        spline.points.add(len(loop) - 1)
        for point, (px, py) in zip(spline.points, loop):
            x, z = to_xz(px, py)
            point.co = (x, z, 0, 1)
        spline.use_cyclic_u = True
    obj = bpy.data.objects.new(name, curve)
    bpy.context.scene.collection.objects.link(obj)
    obj.rotation_euler = (math.radians(90), 0, 0)
    obj.location.y = (front_y + back_y) / 2
    return to_mesh(obj)


def to_mesh(obj):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph))
    mesh.transform(obj.matrix_world)
    name = obj.name
    bpy.data.objects.remove(obj, do_unlink=True)
    new = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(new)
    return new


def join(objs, name):
    bm = bmesh.new()
    for obj in objs:
        bm.from_mesh(obj.data)
        bpy.data.objects.remove(obj, do_unlink=True)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    out = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(out)
    return out


def cull(obj, hidden):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if hidden(f.normal, f.calc_center_median())], context='FACES')
    bm.to_mesh(obj.data)
    bm.free()


def assign(obj, mats, rule, uv_rule=None):
    mesh = obj.data
    names = sorted({m for m in mats})
    mesh.materials.clear()
    for n in names:
        mesh.materials.append(mats[n])
    bm = bmesh.new()
    bm.from_mesh(mesh)
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        kind = rule(f.normal, f.calc_center_median())
        f.material_index = names.index(kind)
        for loop in f.loops:
            co = loop.vert.co
            loop[uv].uv = (uv_rule or (lambda k, c: face_uv(c.x, c.z)))(kind, co)
    bm.to_mesh(mesh)
    bm.free()


def smooth_by_angle(obj, angle=35):
    mesh = obj.data
    for poly in mesh.polygons:
        poly.use_smooth = True
    bm = bmesh.new()
    bm.from_mesh(mesh)
    for e in bm.edges:
        e.smooth = not (len(e.link_faces) == 2 and e.calc_face_angle(0) > math.radians(angle))
    bm.to_mesh(mesh)
    bm.free()


def loft(name, rings, closed=True, cap_center=None):
    bm = bmesh.new()
    vrings = [[bm.verts.new(co) for co in ring] for ring in rings]
    n = len(rings[0])
    for a, b in zip(vrings, vrings[1:]):
        for i in range(n if closed else n - 1):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if cap_center is not None:
        c = bm.verts.new(cap_center)
        last = vrings[-1]
        for i in range(n):
            bm.faces.new((last[i], last[(i + 1) % n], c))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def profile_ring(points, profile, base_y):
    rings = []
    n = len(points)
    for offset, height in profile:
        ring = []
        for i in range(n):
            p0, p1, p2 = points[i - 1], points[i], points[(i + 1) % n]
            t = (Vector(p2) - Vector(p0)).normalized()
            normal = Vector((t.y, -t.x))
            q = Vector(p1) + normal * offset
            ring.append(Vector((q.x, base_y - height, q.y)))
        rings.append(ring)
    return rings


def rect_xz(rect, steps=6, spacing=400.0):
    corners = rounded_rect(*rect, steps=steps)
    pts = []
    for (ax, ay), (bx, by) in zip(corners, corners[1:] + corners[:1]):
        n = max(1, int(math.hypot(bx - ax, by - ay) / spacing))
        pts.extend((ax + (bx - ax) * i / n, ay + (by - ay) * i / n) for i in range(n))
    return [Vector(to_xz(px, py)) for px, py in pts]


def elongated_diamond_ring(cx, cz, rx, ry, y_fn):
    """縦長ひし形（上・左・下・右）の4点。y_fn(x) で王冠カーブに沿わせる"""
    return [
        Vector((cx, y_fn(cx), cz + ry)),
        Vector((cx - rx, y_fn(cx - rx), cz)),
        Vector((cx, y_fn(cx), cz - ry)),
        Vector((cx + rx, y_fn(cx + rx), cz)),
    ]


# ---------------------------------------------------------------- 王冠・ルビー宝石・台座・発光アクセント
def build_crown_assembly(mats):
    """レジェンドの象徴である王冠：丸みのある立体シェル＋下部ゴールドバンド＋左右オーブ＋縦長ルビー＆台座＆爪＋発光アクセント"""
    parts = []
    crown_base_y = FRAME_TOP - CROWN_LIFT

    # 1) 王冠本体シェル（実輪郭を押し出し、中央に向かって円筒状に膨らませる）
    c_loop = [tuple(p) for p in crown_outline()]
    crown = slab_from_loops('crown-body', [c_loop], crown_base_y, FRAME_TOP + 0.0020, 0.0032, resolution=2)
    bm = bmesh.new()
    bm.from_mesh(crown.data)
    for v in bm.verts:
        # 手前側の頂点ほど王冠の円筒カーブを強くかける（裏は枠にぴったり接続）
        front_factor = max(0.0, min(1.0, (FRAME_TOP - v.co.y) / (CROWN_LIFT + 0.002)))
        v.co.y += crown_arch_dy(v.co.x) * (0.35 + 0.65 * front_factor)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(crown.data)
    bm.free()
    cull(crown, lambda n, c: n.y > 0.65 and c.y > FRAME_TOP - 0.001)
    assign(crown, mats, lambda n, c: 'face' if n.y < -0.45 else 'gold')
    smooth_by_angle(crown, 42)
    parts.append(crown)

    # 2) 王冠の下部ゴールドバンド（鉢巻状の二重モール付きアーチ帯）
    band_steps = 28
    band_profile = [
        (-0.010, -0.0010), (-0.010, 0.0030), (-0.007, 0.0052),
        (-0.004, 0.0040), (0.000, 0.0058), (0.004, 0.0040),
        (0.007, 0.0052), (0.010, 0.0030), (0.010, -0.0010),
    ]
    bm = bmesh.new()
    vrings = []
    for i in range(band_steps + 1):
        t = i / band_steps
        px = 205.0 + 102.0 * t
        # 緩やかな下向きアーチ
        u = (t - 0.5) * 2.0
        py = 82.5 - 3.5 * (u * u)
        x, z = to_xz(px, py)
        y0 = crown_base_y + crown_arch_dy(x)
        ring = []
        for dz_off, dy_h in band_profile:
            ring.append(bm.verts.new(Vector((x, y0 - dy_h, z + dz_off))))
        vrings.append(ring)
    m_len = len(band_profile)
    for a, b in zip(vrings, vrings[1:]):
        for j in range(m_len - 1):
            bm.faces.new((a[j], a[j + 1], b[j + 1], b[j]))
    # 両端のキャップ
    bm.faces.new(vrings[0][::-1])
    bm.faces.new(vrings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    band_mesh = bpy.data.meshes.new('crown-band')
    bm.to_mesh(band_mesh)
    bm.free()
    band_obj = bpy.data.objects.new('crown-band', band_mesh)
    bpy.context.scene.collection.objects.link(band_obj)
    band_obj.data.materials.append(mats['gold'])
    smooth_by_angle(band_obj, 45)
    parts.append(band_obj)

    # 3) 王冠の左右オーブ（立体的な金の球体）
    for name, (ox, oy, orad) in (('crown-orb-l', ORB_L), ('crown-orb-r', ORB_R)):
        cx, cz = to_xz(ox, oy)
        cy = crown_base_y + crown_arch_dy(cx) - 0.0025
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=14, radius=orad / PX)
        for v in bm.verts:
            v.co.y *= 0.90
            v.co += Vector((cx, cy, cz))
        mesh = bpy.data.meshes.new(name)
        bm.to_mesh(mesh)
        bm.free()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        obj.data.materials.append(mats['gold'])
        smooth_by_angle(obj, 60)
        parts.append(obj)

    # 4) ルビー台座（縦長ひし形ベゼル）＋奥の反射箔＋4本の金の爪
    gx, gz = to_xz(*GEM)
    g_base = crown_base_y + crown_arch_dy(gx)
    ro_x, ro_y = SET_OUT_X / PX, SET_OUT_Y / PX
    ri_x, ri_y = SET_IN_X / PX, SET_IN_Y / PX
    rg_x, rg_y = GEM_RX / PX, GEM_RY / PX

    # (横半径, 縦半径, 王冠表面からの高さ)
    setting_profile = [
        (ro_x, ro_y, -0.0035),
        (ro_x, ro_y, 0.0025),
        (ro_x - 0.0040, ro_y - 0.0052, 0.0075),
        (ro_x - 0.0070, ro_y - 0.0090, 0.0088),
        (ri_x + 0.0018, ri_y + 0.0022, 0.0068),
        (ri_x, ri_y, 0.0052),
        (ri_x - 0.0010, ri_y - 0.0012, 0.0025),
        (rg_x + 0.0008, rg_y + 0.0010, 0.0015),
        (rg_x * 0.78, rg_y * 0.78, -0.0055),
        (rg_x * 0.35, rg_y * 0.35, -0.0135),
    ]
    rings = [elongated_diamond_ring(gx, gz, rx, ry, lambda _x, h=h: g_base - h) for rx, ry, h in setting_profile]
    setting = loft('ruby-setting', rings, cap_center=Vector((gx, g_base + 0.0180, gz)))
    setting.data.materials.append(mats['gold'])
    setting.data.materials.append(mats['foil'])
    for poly in setting.data.polygons:
        c = poly.center
        # 縦長ひし形の正規化距離で奥の反射箔を判定
        nd = abs(c.x - gx) / rg_x + abs(c.z - gz) / rg_y
        if nd < 0.98 and c.y > g_base - 0.0018:
            poly.material_index = 1
    smooth_by_angle(setting, 30)
    parts.append(setting)

    # ルビーの4本の爪（上下左右の頂点）
    for k, (dx, dz, r_out, r_in) in enumerate((
        (0, 1, ri_y + 0.0012, rg_y - 0.0045),
        (-1, 0, ri_x + 0.0012, rg_x - 0.0038),
        (0, -1, ri_y + 0.0012, rg_y - 0.0045),
        (1, 0, ri_x + 0.0012, rg_x - 0.0038),
    )):
        d = Vector((dx, 0, dz))
        side = Vector((-dz, 0, dx))
        center = Vector((gx, 0, gz))
        root, tip = center + d * r_out, center + d * r_in
        w_root, w_tip = 0.0056, 0.0032
        y_root, y_tip = g_base - 0.0060, g_base - 0.0085
        p_rings = []
        for t, w, y in (
            (0.0, w_root, y_root + 0.0042),
            (0.0, w_root, y_root),
            (0.55, (w_root + w_tip) / 2, y_tip - 0.0012),
            (1.0, w_tip, y_tip),
            (1.0, w_tip * 0.6, y_tip + 0.0030),
        ):
            p = root.lerp(tip, t)
            p_rings.append([
                p + side * (w / 2) + Vector((0, y + 0.0012, 0)),
                p + side * (w / 2) + Vector((0, y - 0.0004, 0)),
                p + Vector((0, y - 0.0016, 0)),
                p - side * (w / 2) + Vector((0, y - 0.0004, 0)),
                p - side * (w / 2) + Vector((0, y + 0.0012, 0)),
            ])
        prong = loft(f'ruby-prong-{k}', p_rings, closed=True, cap_center=tip + Vector((0, y_tip + 0.0018, 0)))
        prong.data.materials.append(mats['gold'])
        smooth_by_angle(prong, 40)
        parts.append(prong)

    # 5) 発光アクセント（ルビー台座の内縁にそっと光る極細リング＋王冠バンド中央の発光エンブレム）
    glow_in_x, glow_in_y = rg_x + 0.0004, rg_y + 0.0006
    glow_out_x, glow_out_y = ri_x + 0.0006, ri_y + 0.0008
    glow_rings = [
        elongated_diamond_ring(gx, gz, glow_out_x, glow_out_y, lambda _x: g_base - 0.0030),
        elongated_diamond_ring(gx, gz, (glow_out_x + glow_in_x) / 2, (glow_out_y + glow_in_y) / 2, lambda _x: g_base - 0.0048),
        elongated_diamond_ring(gx, gz, glow_in_x, glow_in_y, lambda _x: g_base - 0.0022),
    ]
    glow_ring = loft('glow-accent', glow_rings, closed=True)
    glow_ring.data.materials.append(mats['glow'])
    smooth_by_angle(glow_ring, 45)
    parts.append(glow_ring)

    # 6) 縦長ひし形ブリリアントカット・ルビー宝石（37面フラットファセット）
    rt_x, rt_y = TABLE_RX / PX, TABLE_RY / PX
    girdle_low = g_base - 0.0022
    girdle_high = girdle_low - 0.0026
    table_y = girdle_high - 0.0175
    star_y = girdle_high - 0.0102
    culet_y = girdle_low + 0.0195

    def at_ell(angle_deg, rx, ry, y):
        a = math.radians(angle_deg)
        return Vector((gx + rx * math.cos(a), y, gz + ry * math.sin(a)))

    bm = bmesh.new()
    new_v = bm.verts.new
    c45 = 0.5 ** 0.5
    corners = [90, 180, 270, 0]       # 上・左・下・右（反時計回り）
    mids = [135, 225, 315, 45]
    table = [new_v(at_ell(a, rt_x, rt_y, table_y)) for a in corners]
    stars = [new_v(at_ell(m, (rt_x * c45 + (rg_x * c45 - rt_x * c45) * 0.56),
                             (rt_y * c45 + (rg_y * c45 - rt_y * c45) * 0.56), star_y)) for m in mids]

    def girdle_ring(y):
        ring = []
        for a, m in zip(corners, mids):
            ring.append(new_v(at_ell(a, rg_x, rg_y, y)))
            ring.append(new_v(at_ell(m, rg_x * c45, rg_y * c45, y)))
        return ring

    g_top, g_bot = girdle_ring(girdle_high), girdle_ring(girdle_low)
    nf = bm.faces.new
    nf(table)
    for i in range(4):
        j = (i + 1) % 4
        nf((table[i], table[j], stars[i]))
        nf((table[i], stars[i - 1], g_top[2 * i], stars[i]))
        nf((stars[i], g_top[2 * i], g_top[2 * i + 1]))
        nf((stars[i], g_top[2 * i + 1], g_top[(2 * i + 2) % 8]))
    for i in range(8):
        j = (i + 1) % 8
        nf((g_top[i], g_bot[i], g_bot[j], g_top[j]))
    pav_mid = [new_v(at_ell(m, rg_x * c45 * 0.54, rg_y * c45 * 0.54, girdle_low + 0.0110)) for m in mids]
    culet = new_v(Vector((gx, culet_y, gz)))
    for i in range(4):
        nf((g_bot[2 * i], g_bot[2 * i + 1], pav_mid[i]))
        nf((g_bot[2 * i + 1], g_bot[(2 * i + 2) % 8], pav_mid[i]))
        nf((g_bot[2 * i], pav_mid[i], culet, pav_mid[i - 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    gem_mesh = bpy.data.meshes.new('gem')
    bm.to_mesh(gem_mesh)
    bm.free()
    gem_obj = bpy.data.objects.new('gem', gem_mesh)
    bpy.context.scene.collection.objects.link(gem_obj)
    gem_obj.data.materials.append(mats['gem'])
    for poly in gem_mesh.polygons:
        poly.use_smooth = False       # 各ファセットの法線をシャープに分離
    parts.append(gem_obj)

    return parts


# ---------------------------------------------------------------- 重厚な金縁（窓・二段欄・二重メダル）
def gold_rim(name, points, mats, width, height, base_y, stepped=False):
    """points（XZ の輪）に沿った金の縁。stepped=True で名前欄・数値欄用の重厚な二段ベベルにする"""
    half = width / 2
    if stepped:
        # 内側ステップ → 谷 → 外側の重厚な盛り上がりモール
        profile = [
            (-half, -0.0015),
            (-half, height * 0.52),
            (-half * 0.68, height * 0.62),
            (-half * 0.42, height * 0.48),
            (-half * 0.15, height * 0.94),
            (half * 0.20, height * 1.00),
            (half * 0.65, height * 0.88),
            (half, height * 0.45),
            (half, -0.0015),
        ]
    else:
        profile = [
            (-half, -0.0012), (-half, height * 0.48), (-half * 0.55, height * 0.94),
            (0, height), (half * 0.55, height * 0.94), (half, height * 0.48), (half, -0.0012),
        ]
    rings = profile_ring(points, profile, base_y)
    obj = loft(name, rings, closed=True)
    obj.data.materials.append(mats['gold'])
    smooth_by_angle(obj, 48)
    return obj


# ---------------------------------------------------------------- 組み立て
def build():
    scene = fresh_scene()
    mats = make_materials()
    parts = []

    # 1) 板（本体の外形。裏に裏の絵、側面は重厚な燻し金）
    x0, y0, x1, y1, r = BODY
    slab = slab_from_loops('slab', [rounded_rect(x0, y0, x1, y1, r, 8)], SLAB_FRONT - 0.0010, BACK_Y, 0.0045)
    bx0, bz1 = to_xz(x0, y0)
    bx1, bz0 = to_xz(x1, y1)

    def slab_uv(kind, c):
        if kind == 'back':
            return 1 - (c.x - bx0) / (bx1 - bx0), (c.z - bz0) / (bz1 - bz0)
        return face_uv(c.x, c.z)

    assign(slab, mats, lambda n, c: 'face' if n.y < -0.7 else 'back' if n.y > 0.7 else 'gold_dark', slab_uv)
    smooth_by_angle(slab, 40)
    parts.append(slab)

    # 2) 外枠本体（絵の外形どおり。王冠・翼・ドレープ・四隅スクロールを含む）
    outline = [tuple(p) for p in frame_outline()]
    holes = [window_medal_hole(), rounded_rect(*grow(NAME, -1.5), 6), rounded_rect(*grow(STAT, -1.5), 6)]
    frame = slab_from_loops('frame', [outline, *holes], FRAME_TOP, SLAB_FRONT + 0.0010, 0.0032)
    inner = (bx0 + 0.004, bz0 + 0.004, bx1 - 0.004, bz1 - 0.004)
    cull(frame, lambda n, c: n.y > 0.5 and inner[0] < c.x < inner[2] and inner[1] < c.z < inner[3])
    # 赤い布の外側面は crimson、それ以外の側面は gold_dark
    drape_z_top = to_xz(0, 330)[1]
    drape_z_bot = to_xz(0, 545)[1]
    drape_x_in = 0.36

    def frame_mat(n, c):
        if n.y < -0.45:
            return 'face'
        if drape_z_bot < c.z < drape_z_top and abs(c.x) > drape_x_in:
            return 'crimson'
        return 'gold_dark'

    assign(frame, mats, frame_mat)
    smooth_by_angle(frame, 40)
    parts.append(frame)

    # 3) 王冠の左右の黄金の翼 & 両サイドの編み込み柱・四隅スクロール（ふっくら立体盛り上げ）
    wing_loops, pillar_loops = wing_and_pillar_outlines()
    wing_objs = [
        slab_from_loops(f'wing-{i}', [[tuple(q) for q in loop]], FRAME_TOP - 0.0072, FRAME_TOP + 0.0020, 0.0036, resolution=1)
        for i, loop in enumerate(wing_loops)
    ]
    if wing_objs:
        wings = join(wing_objs, 'wings')
        cull(wings, lambda n, c: n.y > 0.2)
        assign(wings, mats, lambda n, c: 'face' if n.y < -0.35 else 'gold')
        smooth_by_angle(wings, 55)
        parts.append(wings)

    pillar_objs = [
        slab_from_loops(f'pillar-{i}', [[tuple(q) for q in loop]], FRAME_TOP - 0.0052, FRAME_TOP + 0.0020, 0.0028, resolution=1)
        for i, loop in enumerate(pillar_loops)
    ]
    if pillar_objs:
        pillars = join(pillar_objs, 'pillars')
        cull(pillars, lambda n, c: n.y > 0.2)
        assign(pillars, mats, lambda n, c: 'face' if n.y < -0.35 else 'gold_dark')
        smooth_by_angle(pillars, 55)
        parts.append(pillars)

    # 4) 左右の深紅ベルベット・ドレープ布（緩やかな縦ヒダの波打ちを付けた立体ドレープ）
    drape_objs = []
    for i, loop in enumerate(drape_outlines()):
        d_obj = slab_from_loops(f'drape-{i}', [[tuple(q) for q in loop]], FRAME_TOP - 0.0068, FRAME_TOP + 0.0020, 0.0032, resolution=1)
        bm = bmesh.new()
        bm.from_mesh(d_obj.data)
        for v in bm.verts:
            if v.co.y < FRAME_TOP:
                # 布のヒダ：X座標に沿って緩やかに波打たせる
                fold = 0.0022 * math.sin((abs(v.co.x) - 0.42) * 140.0 + v.co.z * 10.0)
                v.co.y -= max(0.0, fold)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(d_obj.data)
        bm.free()
        drape_objs.append(d_obj)
    if drape_objs:
        drapes = join(drape_objs, 'drapes')
        cull(drapes, lambda n, c: n.y > 0.25)
        assign(drapes, mats, lambda n, c: 'face' if n.y < -0.35 else 'crimson')
        smooth_by_angle(drapes, 55)
        parts.append(drapes)

    # 5) 名前欄・数値欄（枠よりしっかり沈んだクリームの板）・メダルの中
    for name, rect in (('name-plate', NAME), ('stat-plate', STAT)):
        plate = slab_from_loops(name, [rounded_rect(*grow(rect, -1.0), 6)], PLATE_TOP, SLAB_FRONT, 0.0018)
        assign(plate, mats, lambda n, c: 'face' if n.y < -0.45 else 'gold_dark')
        smooth_by_angle(plate, 40)
        parts.append(plate)
    medal = slab_from_loops('medal-disc', [circle(MEDAL[0], MEDAL[1], MEDAL[2] + 2.5, 64)], MEDAL_TOP, SLAB_FRONT, 0.0016)
    assign(medal, mats, lambda n, c: 'face' if n.y < -0.45 else 'gold_dark')
    smooth_by_angle(medal, 40)
    parts.append(medal)

    # 6) 重厚な金の縁：窓・二段ベベルの名前欄と数値欄・二重リングのメダル
    rim_window = gold_rim('rim-window', rect_xz(grow(WINDOW, 2.0), spacing=8.0), mats, 0.0110, 0.0056, FRAME_TOP)
    mcx, mcz = to_xz(MEDAL[0], MEDAL[1])
    cull(rim_window, lambda n, c: math.hypot(c.x - mcx, c.z - mcz) < (MEDAL[3] + 1.5) / PX)
    parts.append(rim_window)
    parts.append(gold_rim('rim-name', rect_xz(grow(NAME, -0.5)), mats, 0.0115, 0.0056, FRAME_TOP + 0.0010, stepped=True))
    parts.append(gold_rim('rim-stat', rect_xz(grow(STAT, -0.5)), mats, 0.0115, 0.0056, FRAME_TOP + 0.0010, stepped=True))
    mc = Vector(to_xz(MEDAL[0], MEDAL[1]))
    ring_pts = [mc + Vector((math.cos(a), math.sin(a))) * ((MEDAL[2] + MEDAL[3]) / 2 / PX) for a in [-2 * math.pi * i / 72 for i in range(72)]]
    parts.append(gold_rim('rim-medal', ring_pts, mats, (MEDAL[3] - MEDAL[2]) / PX * 1.10, 0.0082, FRAME_TOP + 0.0008, stepped=True))

    # 7) 王冠アセンブリ（王冠本体・下部バンド・オーブ・ルビー台座と爪・発光アクセント・縦長ルビー宝石）
    parts.extend(build_crown_assembly(mats))

    # 親オブジェクトにまとめる
    root = bpy.data.objects.new('card-legendary', None)
    scene.collection.objects.link(root)
    for p in parts:
        p.parent = root
    return root, parts


def export(root, scene=None):
    target_scene = scene or bpy.context.scene
    if bpy.context.window:
        bpy.context.window.scene = target_scene
    for obj in target_scene.objects:
        obj.select_set(obj == root or obj.parent == root)
    bpy.ops.export_scene.gltf(
        filepath=str(OUT), export_format='GLB', use_selection=True, use_active_scene=True,
        export_yup=True, export_apply=True, export_image_format='NONE',
        export_texcoords=True, export_normals=True,
        export_materials='EXPORT', export_cameras=False, export_lights=False,
    )


if __name__ == '__main__' or globals().get('RUN_BUILD'):
    if bpy.app.background and not globals().get('RUN_BUILD'):
        bpy.ops.wm.read_factory_settings(use_empty=True)
    root, parts = build()
    if globals().get('DO_EXPORT', True):
        export(root, root.users_scene[0] if root.users_scene else bpy.context.scene)
    print('parts', len(parts), sum(len(p.data.polygons) for p in parts), 'faces')
