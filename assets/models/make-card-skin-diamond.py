"""ダイヤモンドランクカード（表・裏・背面紋章の完全3Dモデル）を Blender で作り、card-skin-diamond.glb に書き出す。

使い方（リポジトリのルートで）：
  blender --background --python assets/models/make-card-skin-diamond.py

元画像：
  表：assets/cards/frame-skin-diamond.png（512×768）
  裏：assets/skins/back-rank-diamond.png（512×768）

座標系：
  枠の絵の幅 512px = 1.0、高さ 768px = 1.5、原点は中心。
  Blender では X 右・Z 上・表が手前(-Y)・裏が奥(+Y)。glTF 書き出しの Y-up で +Z が表、-Z が裏。

マテリアル名（統合担当向け・Three.js 側で名前マッピング可能）：
  face           … 表の絵（絵の窓の奥・名前欄・下の欄・メダルの中・枠の地）
  back           … 裏の絵（背面のサファイアキルティング地・リボン。UV は back-rank-diamond.png の 0〜1）
  crystal_face   … 表の結晶翼・側面クリスタル群（元絵の結晶模様を活かしつつ硬質な結晶クリアコート）
  back_crystal   … 裏の四隅クリスタル群・背面紋章の結晶羽（裏の絵を活かしつつ硬質な結晶クリアコート）
  back_metal     … 裏の白銀メタリック外枠・紋章外輪（裏の絵を活かしつつクールな白銀金属反射）
  diamond_metal  … 純白銀サファイアメタリック（側面・宝石ベゼル・爪・背面紋章側面）
  gold           … ロイヤルゴールドの内縁（窓・名前欄・下の欄・メダル輪・背面金縁）
  foil           … 宝石・中央4芒星ダイヤ奥のファセット反射箔（白銀プリズム）
  diamond_gem    … 独立多面体カットのダイヤモンド（表3個＋裏8個＋中央4芒星ダイヤ。テーブル＋クラウン＋ガードル＋パビリオン、面ごとに法線分離・IOR 2.42）
"""
import math
from pathlib import Path

import bpy
import bmesh
import numpy as np
from mathutils import Vector

try:
    REPO = Path(__file__).resolve().parents[2]
except NameError:
    REPO = Path(globals().get('REPO', '.'))

FRONT_PNG = REPO / 'assets/cards/frame-skin-diamond.png'
BACK_PNG = REPO / 'assets/skins/back-rank-diamond.png'
OUT = REPO / 'assets/models/card-skin-diamond.glb'
PREVIEW_TEXTURES = globals().get('PREVIEW_TEXTURES', False)

PX = 512.0
IMG_H = 768

# ---- 厚み（手前が -Y、裏が +Y）----
SLAB_BACK = 0.0255
BACK_FRAME_Y = 0.0320
SLAB_FRONT = -0.0105
FRAME_TOP = -0.0275
PLATE_TOP = -0.0225
MEDAL_TOP = -0.0240

# ---- 実測座標（512×768 ピクセル）----
BODY = (21, 39, 491, 748, 16)
WINDOW = (78, 121, 433, 483, 8)
NAME = (75, 507, 436, 586, 12)
STAT = (75, 629, 436, 707, 12)
MEDAL = (92.0, 109.0, 35.5, 44.5)

# 表の独立多面体ダイヤモンド3個：(名前, (cx, cy), grx, gry, brx, bry, crown_h)
FRONT_GEMS = [
    ('f-top', (255.5, 64.0), 42.0, 48.0, 52.0, 58.0, 0.0275),
    ('f-mid', (255.5, 607.5), 16.0, 14.5, 24.0, 22.0, 0.0160),
    ('f-bot', (255.5, 727.5), 25.5, 25.0, 35.5, 34.5, 0.0205),
]

# 裏の金縁・独立多面体ダイヤモンド8個（外周4＋紋章上下2＋浮遊2）・中央4芒星ダイヤ
BACK_GOLD_RECT = (54, 95, 457, 696, 22)
BACK_GEMS = [
    ('b-top', (256.0, 64.5), 24.5, 33.5, 38.0, 49.0, 0.0210, True),
    ('b-bot', (256.0, 684.5), 24.5, 33.5, 38.0, 49.0, 0.0210, True),
    ('b-left', (47.0, 369.5), 18.5, 25.5, 31.0, 42.0, 0.0185, True),
    ('b-right', (465.0, 369.5), 18.5, 25.5, 31.0, 42.0, 0.0185, True),
    ('b-crest-t', (255.5, 209.5), 19.5, 29.5, 31.0, 43.0, 0.0200, True),
    ('b-crest-b', (255.5, 469.5), 19.0, 29.0, 30.5, 42.5, 0.0200, True),
    ('b-float-l', (159.5, 219.5), 11.5, 20.5, 0.0, 0.0, 0.0155, False),
    ('b-float-r', (350.5, 219.5), 11.5, 20.5, 0.0, 0.0, 0.0155, False),
]
BACK_STAR = (254.5, 343.5, 86.0, 80.0, 23.5)


def to_xz_front(px, py):
    return px / PX - 0.5, (IMG_H / 2 - py) / PX


def to_xz_back(px, py):
    return 0.5 - px / PX, (IMG_H / 2 - py) / PX


def front_uv(x, z):
    return x + 0.5, z * PX / IMG_H + 0.5


def back_uv(x, z):
    return 0.5 - x, z * PX / IMG_H + 0.5


# ---------------------------------------------------------------- 場面・マテリアル
def fresh_scene():
    if bpy.app.background or not bpy.context.window:
        scene = bpy.context.scene
    else:
        scene = bpy.data.scenes.get('CardSkinDiamond') or bpy.data.scenes.new('CardSkinDiamond')
    old = bpy.data.objects.get('card-skin-diamond')
    if old:
        for obj in [*old.children, old]:
            bpy.data.objects.remove(obj, do_unlink=True)
    if bpy.context.window:
        bpy.context.window.scene = scene
    return scene


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
        'face': material('face', (0.84, 0.86, 0.94), roughness=0.64),
        'back': material('back', (0.08, 0.28, 0.72), roughness=0.46),
        'crystal_face': material('crystal_face', (0.58, 0.78, 1.00), metallic=0.14, roughness=0.09, **{'Coat Weight': 1.0, 'Coat Roughness': 0.02}),
        'back_crystal': material('back_crystal', (0.58, 0.78, 1.00), metallic=0.14, roughness=0.09, **{'Coat Weight': 1.0, 'Coat Roughness': 0.02}),
        'back_metal': material('back_metal', (0.78, 0.82, 0.96), metallic=0.62, roughness=0.18, **{'Coat Weight': 0.50}),
        'diamond_metal': material('diamond_metal', (0.76, 0.81, 0.95), metallic=1.0, roughness=0.15, **{'Coat Weight': 0.40}),
        'gold': material('gold', (0.96, 0.72, 0.24), metallic=1.0, roughness=0.17),
        'foil': material('foil', (0.82, 0.93, 1.00), metallic=1.0, roughness=0.08),
        'diamond_gem': material('diamond_gem', (0.45, 0.84, 1.00), roughness=0.015, **{'Transmission Weight': 0.94, 'IOR': 2.42, 'Coat Weight': 1.0, 'Coat Roughness': 0.015}),
    }
    if PREVIEW_TEXTURES:
        for key, path, link_alpha in (
            ('face', FRONT_PNG, True),
            ('crystal_face', FRONT_PNG, True),
            ('back', BACK_PNG, False),
            ('back_metal', BACK_PNG, False),
            ('back_crystal', BACK_PNG, False),
        ):
            mat = mats[key]
            nodes = mat.node_tree.nodes
            tex = nodes.new('ShaderNodeTexImage')
            tex.image = bpy.data.images.load(str(path), check_existing=True)
            bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
            mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
            if link_alpha:
                mat.node_tree.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
    return mats


# ---------------------------------------------------------------- 輪郭トレース・2D図形
def load_rgba(path):
    img = bpy.data.images.load(str(path), check_existing=True)
    w, h = img.size
    return np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1].copy()


def blur5(a):
    k = np.array([1, 4, 6, 4, 1], dtype=np.float32) / 16
    a = np.apply_along_axis(lambda r: np.convolve(r, k, 'same'), 1, a)
    return np.apply_along_axis(lambda c: np.convolve(c, k, 'same'), 0, a)


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


def trace(mask, start, spacing=2.6, smooth=3, eps=0.65):
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


def shift_or(m):
    out = m.copy()
    out[1:] |= m[:-1]; out[:-1] |= m[1:]
    out[:, 1:] |= out[:, :-1].copy(); out[:, :-1] |= out[:, 1:].copy()
    return out


def connected_loops(mask, min_pixels=90, spacing=3.4, smooth=2, eps=0.90, min_pts=6):
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
        if size < min_pixels:
            continue
        loop = trace(label == count, (int(y0), int(x0)), spacing=spacing, smooth=smooth, eps=eps)
        if len(loop) >= min_pts:
            loops.append(loop)
    return loops


def rounded_rect(x0, y0, x1, y1, r, steps=5):
    pts = []
    for cx, cy, a0 in ((x1 - r, y0 + r, -90), (x1 - r, y1 - r, 0), (x0 + r, y1 - r, 90), (x0 + r, y0 + r, 180)):
        for i in range(steps + 1):
            a = math.radians(a0 + 90 * i / steps)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def circle(cx, cy, r, steps=36):
    return [(cx + r * math.cos(2 * math.pi * i / steps), cy + r * math.sin(2 * math.pi * i / steps)) for i in range(steps)]


def grow(rect, d):
    x0, y0, x1, y1, r = rect
    return (x0 - d, y0 - d, x1 + d, y1 + d, max(0.5, r + d))


def window_medal_hole(window, medal, scale=4):
    x0, y0, x1, y1, r = window
    mx, my, rm_in, _ = medal
    rm = rm_in + 2.0
    w, h = int(x1 + 2) * scale, int(y1 + 2) * scale
    yy, xx = (np.mgrid[0:h, 0:w] + 0.5) / scale
    cx = np.clip(xx, x0 + r, x1 - r)
    cy = np.clip(yy, y0 + r, y1 - r)
    rect = (xx >= x0) & (xx <= x1) & (yy >= y0) & (yy <= y1) & (np.hypot(xx - cx, yy - cy) <= r)
    mask = rect | (np.hypot(xx - mx, yy - my) <= rm)
    ys, xs = np.nonzero(mask)
    loop = trace(mask, (int(ys.min()), int(xs[ys == ys.min()].min())), spacing=2.2 * scale, smooth=2, eps=0.35 * scale)
    return [tuple(q / scale) for q in loop]


# ---------------------------------------------------------------- メッシュ操作
def to_mesh(obj):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph))
    mesh.transform(obj.matrix_world)
    name = obj.name
    bpy.data.objects.remove(obj, do_unlink=True)
    new = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(new)
    return new


def slab_from_loops(name, loops, y0, y1, bevel, resolution=1, mapper=to_xz_front):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '2D'
    curve.fill_mode = 'BOTH'
    thickness = abs(y1 - y0)
    curve.extrude = max(0.0, thickness / 2 - bevel)
    curve.bevel_depth = bevel
    curve.bevel_resolution = resolution
    curve.offset = -bevel
    for loop in loops:
        spline = curve.splines.new('POLY')
        spline.points.add(len(loop) - 1)
        for point, (px, py) in zip(spline.points, loop):
            x, z = mapper(px, py)
            point.co = (x, z, 0, 1)
        spline.use_cyclic_u = True
    obj = bpy.data.objects.new(name, curve)
    bpy.context.scene.collection.objects.link(obj)
    obj.rotation_euler = (math.radians(90), 0, 0)
    obj.location.y = (y0 + y1) / 2
    return to_mesh(obj)


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
    bm = bmesh.new()
    bm.from_mesh(mesh)
    uv = bm.loops.layers.uv.verify()
    used, idx = [], {}
    for f in bm.faces:
        kind = rule(f.normal, f.calc_center_median())
        if kind not in idx:
            idx[kind] = len(used)
            used.append(kind)
        f.material_index = idx[kind]
        for loop in f.loops:
            c = loop.vert.co
            loop[uv].uv = (uv_rule or (lambda k, co: front_uv(co.x, co.z)))(kind, c)
    mesh.materials.clear()
    for n in used:
        mesh.materials.append(mats[n])
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


def rect_xz(rect, steps=5, spacing=18.0, mapper=to_xz_front):
    corners = rounded_rect(*rect, steps=steps)
    pts = []
    for (ax, ay), (bx, by) in zip(corners, corners[1:] + corners[:1]):
        seg_len = math.hypot(bx - ax, by - ay)
        n = max(1, int(seg_len / spacing))
        pts.extend((ax + (bx - ax) * i / n, ay + (by - ay) * i / n) for i in range(n))
    return [Vector(mapper(px, py)) for px, py in pts]


def metal_rim(name, points, mat, width, height, base_y, y_dir=-1.0):
    half = width / 2
    profile = [(-half, -0.0010), (-half * 0.88, height * 0.65), (0, height), (half * 0.88, height * 0.65), (half, -0.0010)]
    rings = []
    n = len(points)
    for offset, h in profile:
        ring = []
        for i in range(n):
            p0, p1, p2 = points[i - 1], points[i], points[(i + 1) % n]
            t = (Vector(p2) - Vector(p0)).normalized()
            normal = Vector((t.y, -t.x))
            q = Vector(p1) + normal * offset
            ring.append(Vector((q.x, base_y + y_dir * h, q.y)))
        rings.append(ring)
    obj = loft(name, rings, closed=True)
    obj.data.materials.append(mat)
    smooth_by_angle(obj, 55)
    return obj


# ---------------------------------------------------------------- 多面体カット・ダイヤモンド（面ごと法線分離）
def build_diamond_polyhedron(mat, center_px, grx_px, gry_px, base_y, y_dir=-1.0,
                             table_ratio=0.38, crown_h=0.021, pavilion_d=0.023, name='diamond'):
    """独立した本物の多面体カット・ダイヤモンド：
    テーブル1面 ＋ クラウン16面（星4・凧4・上ガードル8）＋ ガードル側面8面 ＋ パビリオン12面 ＝ 計37面。
    すべて use_smooth=False で面ごとに法線を完全分離し、回転時にファセットごとの反射が切り替わる。
    """
    mapper = to_xz_front if y_dir < 0 else to_xz_back
    cx, cz = mapper(*center_px)
    rgx, rgy = grx_px / PX, gry_px / PX
    rtx, rty = rgx * table_ratio, rgy * table_ratio

    g_low = base_y + y_dir * 0.0020
    g_high = g_low + y_dir * 0.0026
    table_y = g_high + y_dir * crown_h
    star_y = g_high + y_dir * (crown_h * 0.55)
    culet_y = g_low - y_dir * pavilion_d

    def at(deg, rx, ry, y):
        a = math.radians(deg)
        return Vector((cx + rx * math.cos(a), y, cz + ry * math.sin(a)))

    bm = bmesh.new()
    nv, nf = bm.verts.new, bm.faces.new
    c45 = 0.5 ** 0.5
    corners = [90 + 90 * i for i in range(4)]
    mids = [a + 45 for a in corners]
    table = [nv(at(a, rtx, rty, table_y)) for a in corners]
    sx = rtx * c45 + (rgx * c45 - rtx * c45) * 0.50
    sy = rty * c45 + (rgy * c45 - rty * c45) * 0.50
    stars = [nv(at(m, sx, sy, star_y)) for m in mids]

    def g_ring(y):
        ring = []
        for a, m in zip(corners, mids):
            ring.append(nv(at(a, rgx, rgy, y)))
            ring.append(nv(at(m, rgx * c45, rgy * c45, y)))
        return ring

    gt, gb = g_ring(g_high), g_ring(g_low)
    nf(table)
    for i in range(4):
        j = (i + 1) % 4
        nf((table[i], table[j], stars[i]))
        nf((table[i], stars[i - 1], gt[2 * i], stars[i]))
        nf((stars[i], gt[2 * i], gt[2 * i + 1]))
        nf((stars[i], gt[2 * i + 1], gt[(2 * i + 2) % 8]))
    for i in range(8):
        j = (i + 1) % 8
        nf((gt[i], gb[i], gb[j], gt[j]))
    pm = [nv(at(m, rgx * c45 * 0.54, rgy * c45 * 0.54, g_low - y_dir * (pavilion_d * 0.55))) for m in mids]
    culet = nv(Vector((cx, culet_y, cz)))
    for i in range(4):
        nf((gb[2 * i], gb[2 * i + 1], pm[i]))
        nf((gb[2 * i + 1], gb[(2 * i + 2) % 8], pm[i]))
        nf((gb[2 * i], pm[i], culet, pm[i - 1]))

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.use_smooth = False
    return obj


def build_diamond_bezel_and_foil(metal_mat, foil_mat, center_px, out_rx_px, out_ry_px,
                                 grx_px, gry_px, base_y, y_dir=-1.0, rim_h=0.010, name='setting'):
    mapper = to_xz_front if y_dir < 0 else to_xz_back
    cx, cz = mapper(*center_px)
    rgx, rgy = grx_px / PX, gry_px / PX

    bezel = None
    if out_rx_px > 0 and out_ry_px > 0:
        rox, roy = out_rx_px / PX, out_ry_px / PX
        rix, riy = rgx + 2.4 / PX, rgy + 2.4 / PX

        def d_ring(rx, ry, y):
            return [Vector((cx, y, cz + ry)), Vector((cx - rx, y, cz)), Vector((cx, y, cz - ry)), Vector((cx + rx, y, cz))]

        profile = [
            (rox, roy, -0.0015), (rox, roy, rim_h * 0.40), (rox * 0.86, roy * 0.86, rim_h * 0.90),
            (rox * 0.78, roy * 0.78, rim_h), (rix + 0.0020, riy + 0.0020, rim_h * 0.65),
            (rix, riy, rim_h * 0.45), (rgx + 0.0012, rgy + 0.0012, rim_h * 0.16),
        ]
        bezel = loft(name, [d_ring(rx, ry, base_y + y_dir * h) for rx, ry, h in profile], closed=True)
        bezel.data.materials.append(metal_mat)
        smooth_by_angle(bezel, 26)

    c45 = 0.5 ** 0.5
    corners = [90 + 90 * i for i in range(4)]
    mids = [a + 45 for a in corners]
    def oct_ring(scale, y):
        ring = []
        for a, m in zip(corners, mids):
            ra, rm = math.radians(a), math.radians(m)
            ring.append(Vector((cx + rgx * scale * math.cos(ra), y, cz + rgy * scale * math.sin(ra))))
            ring.append(Vector((cx + rgx * scale * c45 * math.cos(rm), y, cz + rgy * scale * c45 * math.sin(rm))))
        return ring

    foil = loft(
        f'{name}-foil',
        [oct_ring(1.01, base_y + y_dir * (rim_h * 0.16)), oct_ring(0.70, base_y - y_dir * 0.0070), oct_ring(0.35, base_y - y_dir * 0.0145)],
        closed=True, cap_center=Vector((cx, base_y - y_dir * 0.0180, cz)),
    )
    foil.data.materials.append(foil_mat)
    for poly in foil.data.polygons:
        poly.use_smooth = False
    return bezel, foil


def build_four_point_star_diamond(gem_mat, foil_mat, center_px, outer_rx_px, outer_ry_px,
                                  inner_r_px, base_y, y_dir=1.0, peak_h=0.027, name='back-star-diamond'):
    """ダイヤモンド紋章の中央4芒星ダイヤ：テーブル付きの16面クラウン＋ガードル＋パビリオンを持つ多面体"""
    mapper = to_xz_front if y_dir < 0 else to_xz_back
    cx, cz = mapper(*center_px)
    orx, ory, ir = outer_rx_px / PX, outer_ry_px / PX, inner_r_px / PX

    def star_ring(scale):
        pts = []
        for i in range(8):
            a = math.radians(90 + 45 * i)
            if i % 2 == 0:
                pts.append((cx + orx * scale * math.cos(a), cz + ory * scale * math.sin(a)))
            else:
                pts.append((cx + ir * scale * math.cos(a), cz + ir * scale * math.sin(a)))
        return pts

    outer_pts = star_ring(1.0)
    mid_pts = star_ring(0.45)

    bm = bmesh.new()
    nv = bm.verts.new
    y_base = base_y + y_dir * 0.0015
    y_girdle = base_y + y_dir * 0.0050
    y_mid = base_y + y_dir * (peak_h * 0.72)
    y_peak = base_y + y_dir * peak_h
    y_back = base_y - y_dir * 0.0080

    v_base = [nv(Vector((x, y_base, z))) for x, z in outer_pts]
    v_girdle = [nv(Vector((x, y_girdle, z))) for x, z in outer_pts]
    v_mid = [nv(Vector((x, y_mid, z))) for x, z in mid_pts]
    v_peak = nv(Vector((cx, y_peak, cz)))
    v_back = nv(Vector((cx, y_back, cz)))

    for i in range(8):
        j = (i + 1) % 8
        bm.faces.new((v_mid[i], v_mid[j], v_peak))                       # 内側クラウン8面
        bm.faces.new((v_girdle[i], v_girdle[j], v_mid[j], v_mid[i]))     # 外側クラウン8面
        bm.faces.new((v_base[i], v_base[j], v_girdle[j], v_girdle[i]))   # ガードル側面8面
        bm.faces.new((v_base[j], v_base[i], v_back))                     # パビリオン8面

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    star = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(star)
    star.data.materials.append(gem_mat)
    for poly in star.data.polygons:
        poly.use_smooth = False

    bm2 = bmesh.new()
    v_f = [bm2.verts.new(Vector((x * 0.94 + cx * 0.06, base_y + y_dir * 0.0012, z * 0.94 + cz * 0.06))) for x, z in outer_pts]
    v_c = bm2.verts.new(Vector((cx, base_y - y_dir * 0.0055, cz)))
    for i in range(8):
        bm2.faces.new((v_f[i], v_f[(i + 1) % 8], v_c))
    bmesh.ops.recalc_face_normals(bm2, faces=bm2.faces)
    fmesh = bpy.data.meshes.new(f'{name}-foil')
    bm2.to_mesh(fmesh)
    bm2.free()
    foil = bpy.data.objects.new(f'{name}-foil', fmesh)
    bpy.context.scene.collection.objects.link(foil)
    foil.data.materials.append(foil_mat)
    for poly in foil.data.polygons:
        poly.use_smooth = False
    return star, foil


# ---------------------------------------------------------------- マスク抽出
def front_crystal_mask(rgba):
    r, g, b, a = rgba[..., 0], rgba[..., 1], rgba[..., 2], rgba[..., 3]
    h, w = a.shape
    yy, xx = np.mgrid[0:h, 0:w]

    def in_rect(rect, pad=3.0):
        x0, y0, x1, y1, _ = rect
        return (xx >= x0 - pad) & (xx <= x1 + pad) & (yy >= y0 - pad) & (yy <= y1 + pad)

    excl = in_rect(WINDOW, 4.0) | in_rect(NAME, 3.0) | in_rect(STAT, 3.0)
    excl |= np.hypot(xx - MEDAL[0], yy - MEDAL[1]) <= MEDAL[3] + 2.5
    for _, (gx, gy), _, _, brx, bry, _ in FRONT_GEMS:
        excl |= (np.abs(xx - gx) / (brx + 1.5) + np.abs(yy - gy) / (bry + 1.5)) <= 1.0

    # 明るい結晶翼・側面クリスタル群（青白〜白紫の高輝度部）
    lum = (r + g + b) / 3.0
    is_crys = (a > 0.65) & (b > 0.72) & (lum > 0.56) & (~excl)
    m = ~shift_or(~is_crys)
    for _ in range(2):
        m = shift_or(m)
    m &= shift_or(is_crys)
    m = ~shift_or(~m)
    return m


def back_masks(rgba):
    r, g, b, a = rgba[..., 0], rgba[..., 1], rgba[..., 2], rgba[..., 3]
    h, w = a.shape
    yy, xx = np.mgrid[0:h, 0:w]

    excl = np.zeros((h, w), dtype=bool)
    for _, (gx, gy), grx, gry, brx, bry, _, has_bz in BACK_GEMS:
        rx = (brx + 1.5) if has_bz else (grx + 2.5)
        ry = (bry + 1.5) if has_bz else (gry + 2.5)
        excl |= (np.abs(xx - gx) / rx + np.abs(yy - gy) / ry) <= 1.0
    sx, sy, srx, sry, _ = BACK_STAR
    excl |= (np.abs(xx - sx) / (srx * 0.75) + np.abs(yy - sy) / (sry * 0.75)) <= 1.0

    x0, y0, x1, y1, _ = BACK_GOLD_RECT
    inside = (xx > x0 + 6) & (xx < x1 - 6) & (yy > y0 + 6) & (yy < y1 - 6)

    # 背面紋章の白銀輪・結晶羽（パネル内の高輝度な白青〜青白パーツ）
    lum = (r + g + b) / 3.0
    near_corners = inside & ((xx < 155) | (xx > 357)) & ((yy < 210) | (yy > 540))
    emblem_zone = inside & (~near_corners) & (yy < 515)
    is_emblem = emblem_zone & (a > 0.7) & (b > 0.72) & (lum > 0.56) & (~excl)
    em = ~shift_or(~is_emblem)
    for _ in range(2):
        em = shift_or(em)
    em &= shift_or(is_emblem)
    em = ~shift_or(~em)

    # 四隅の結晶群
    is_corner = near_corners & (a > 0.7) & (b > 0.74) & (lum > 0.52)
    cm = ~shift_or(~is_corner)
    cm = shift_or(cm)

    # 下部リボン（2本）
    rib_zone = inside & (xx > 150) & (xx < 360) & (yy > 435) & (yy < 548) & (~em) & (~excl)
    is_rib = rib_zone & (a > 0.8) & (b > 0.66) & (lum > 0.44)
    rb = ~shift_or(~is_rib)
    rb = shift_or(rb)
    return em, cm, rb


# ---------------------------------------------------------------- 組み立て
def build():
    scene = fresh_scene()
    mats = make_materials()
    f_rgba = load_rgba(FRONT_PNG)
    b_rgba = load_rgba(BACK_PNG)
    parts = []

    # 1) 本体板
    x0, y0, x1, y1, r = BODY
    slab = slab_from_loops('slab', [rounded_rect(x0, y0, x1, y1, r, 6)], SLAB_FRONT - 0.0010, SLAB_BACK, 0.0038, resolution=1)
    assign(
        slab, mats,
        lambda n, c: 'face' if n.y < -0.7 else 'back' if n.y > 0.7 else 'diamond_metal',
        lambda k, c: back_uv(c.x, c.z) if k == 'back' else front_uv(c.x, c.z),
    )
    smooth_by_angle(slab, 40)
    parts.append(slab)

    # 2) 表：外枠＋結晶群＋欄＋金内縁
    f_mask = blur5(f_rgba[:, :, 3]) > 0.5
    ys, xs = np.nonzero(f_mask)
    f_outline = [tuple(p) for p in trace(f_mask, (int(ys.min()), int(xs[ys == ys.min()].min())), spacing=2.5, eps=0.55)]
    f_holes = [window_medal_hole(WINDOW, MEDAL), rounded_rect(*grow(NAME, -1.5), 5), rounded_rect(*grow(STAT, -1.5), 5)]
    front_frame = slab_from_loops('front-frame', [f_outline, *f_holes], FRAME_TOP, SLAB_FRONT + 0.0010, 0.0028, resolution=1)
    bx0, bz1 = to_xz_front(x0, y0); bx1, bz0 = to_xz_front(x1, y1)
    inner = (bx0 + 0.004, bz0 + 0.004, bx1 - 0.004, bz1 - 0.004)
    cull(front_frame, lambda n, c: n.y > 0.5 and inner[0] < c.x < inner[2] and inner[1] < c.z < inner[3])
    assign(front_frame, mats, lambda n, c: 'crystal_face' if n.y < -0.45 else 'diamond_metal')
    smooth_by_angle(front_frame, 30)
    parts.append(front_frame)

    fc_objs = []
    for i, loop in enumerate(connected_loops(front_crystal_mask(f_rgba), min_pixels=120, spacing=3.6, smooth=2, eps=0.95)):
        fc_objs.append(slab_from_loops(f'fc-{i}', [[tuple(q) for q in loop]], FRAME_TOP - 0.0068, FRAME_TOP + 0.0020, 0.0032, resolution=1))
    if fc_objs:
        fc = join(fc_objs, 'front-crystal-shards')
        cull(fc, lambda n, c: n.y > 0.2)
        assign(fc, mats, lambda n, c: 'crystal_face' if n.y < -0.30 else 'diamond_metal')
        smooth_by_angle(fc, 24)   # 結晶らしくエッジを鋭く立てる
        parts.append(fc)

    for pname, rect in (('name-plate', NAME), ('stat-plate', STAT)):
        plate = slab_from_loops(pname, [rounded_rect(*grow(rect, -1.0), 5)], PLATE_TOP, SLAB_FRONT, 0.0018, resolution=1)
        assign(plate, mats, lambda n, c: 'face' if n.y < -0.45 else 'diamond_metal')
        smooth_by_angle(plate, 40)
        parts.append(plate)
    medal = slab_from_loops('medal-disc', [circle(MEDAL[0], MEDAL[1], MEDAL[2] + 2.5, 36)], MEDAL_TOP, SLAB_FRONT, 0.0016, resolution=1)
    assign(medal, mats, lambda n, c: 'face' if n.y < -0.45 else 'diamond_metal')
    smooth_by_angle(medal, 40)
    parts.append(medal)

    rim_win = metal_rim('rim-window', rect_xz(grow(WINDOW, 1.5), spacing=16.0), mats['gold'], 0.0080, 0.0044, FRAME_TOP, y_dir=-1.0)
    mcx, mcz = to_xz_front(MEDAL[0], MEDAL[1])
    tcx, tcz = to_xz_front(*FRONT_GEMS[0][1])
    cull(
        rim_win,
        lambda n, c: math.hypot(c.x - mcx, c.z - mcz) < (MEDAL[3] + 1.0) / PX
        or (abs(c.x - tcx) / (54.0 / PX) + abs(c.z - tcz) / (60.0 / PX)) < 1.0,
    )
    parts.append(rim_win)
    parts.append(metal_rim('rim-name', rect_xz(grow(NAME, -1.0), spacing=24.0), mats['gold'], 0.0072, 0.0038, FRAME_TOP + 0.0010, y_dir=-1.0))
    parts.append(metal_rim('rim-stat', rect_xz(grow(STAT, -1.0), spacing=24.0), mats['gold'], 0.0072, 0.0038, FRAME_TOP + 0.0010, y_dir=-1.0))
    mc = Vector(to_xz_front(MEDAL[0], MEDAL[1]))
    m_pts = [mc + Vector((math.cos(a), math.sin(a))) * ((MEDAL[2] + MEDAL[3]) / 2 / PX) for a in [-2 * math.pi * i / 44 for i in range(44)]]
    parts.append(metal_rim('rim-medal', m_pts, mats['gold'], (MEDAL[3] - MEDAL[2]) / PX, 0.0074, FRAME_TOP + 0.0005, y_dir=-1.0))

    # 3) 裏：白銀外枠＋金内縁＋背面立体紋章＋四隅クリスタル＋リボン
    b_mask = blur5(b_rgba[:, :, 3]) > 0.5
    ys, xs = np.nonzero(b_mask)
    b_outline = [tuple(p) for p in trace(b_mask, (int(ys.min()), int(xs[ys == ys.min()].min())), spacing=2.6, eps=0.60)]
    b_hole = rounded_rect(*grow(BACK_GOLD_RECT, -2.0), 5)
    back_frame = slab_from_loops('back-frame', [b_outline, b_hole], SLAB_BACK - 0.0015, BACK_FRAME_Y, 0.0030, resolution=1, mapper=to_xz_back)
    cull(back_frame, lambda n, c: n.y < -0.5 and inner[0] < c.x < inner[2] and inner[1] < c.z < inner[3])
    assign(back_frame, mats, lambda n, c: 'back_metal' if n.y > 0.45 else 'diamond_metal', lambda k, c: back_uv(c.x, c.z))
    smooth_by_angle(back_frame, 32)
    parts.append(back_frame)

    b_gold_rim = metal_rim('back-gold-rim', rect_xz(BACK_GOLD_RECT, spacing=16.0, mapper=to_xz_back), mats['gold'], 0.0085, 0.0050, SLAB_BACK, y_dir=1.0)
    b_gem_zones = [(to_xz_back(*g[1]), g[4] / PX, g[5] / PX) for g in BACK_GEMS[:4]]
    cull(b_gold_rim, lambda n, c: any(abs(c.x - gx) / (rx + 0.005) + abs(c.z - gz) / (ry + 0.005) < 1.0 for (gx, gz), rx, ry in b_gem_zones))
    parts.append(b_gold_rim)

    em_mask, corner_mask, rib_mask = back_masks(b_rgba)
    be_objs = []
    for i, loop in enumerate(connected_loops(em_mask, min_pixels=120, spacing=3.4, smooth=2, eps=0.90)):
        be_objs.append(slab_from_loops(f'be-{i}', [[tuple(q) for q in loop]], SLAB_BACK - 0.0015, SLAB_BACK + 0.0115, 0.0036, resolution=1, mapper=to_xz_back))
    if be_objs:
        be = join(be_objs, 'back-emblem-crystals')
        cull(be, lambda n, c: n.y < -0.2)
        assign(be, mats, lambda n, c: 'back_crystal' if n.y > 0.30 else 'diamond_metal', lambda k, c: back_uv(c.x, c.z))
        smooth_by_angle(be, 26)
        parts.append(be)

    bc_objs = []
    for i, loop in enumerate(connected_loops(corner_mask, min_pixels=80, spacing=2.8, smooth=2, eps=0.70)):
        bc_objs.append(slab_from_loops(f'bc-{i}', [[tuple(q) for q in loop]], SLAB_BACK - 0.0010, SLAB_BACK + 0.0085, 0.0028, resolution=1, mapper=to_xz_back))
    if bc_objs:
        bc = join(bc_objs, 'back-corner-crystals')
        cull(bc, lambda n, c: n.y < -0.2)
        assign(bc, mats, lambda n, c: 'back_crystal' if n.y > 0.30 else 'diamond_metal', lambda k, c: back_uv(c.x, c.z))
        smooth_by_angle(bc, 24)
        parts.append(bc)

    br_objs = []
    for i, loop in enumerate(connected_loops(rib_mask, min_pixels=80, spacing=2.8, smooth=2, eps=0.70)):
        br_objs.append(slab_from_loops(f'br-{i}', [[tuple(q) for q in loop]], SLAB_BACK - 0.0010, SLAB_BACK + 0.0045, 0.0018, resolution=1, mapper=to_xz_back))
    if br_objs:
        br = join(br_objs, 'back-emblem-ribbons')
        cull(br, lambda n, c: n.y < -0.2)
        assign(br, mats, lambda n, c: 'back' if n.y > 0.35 else 'diamond_metal', lambda k, c: back_uv(c.x, c.z))
        smooth_by_angle(br, 45)
        parts.append(br)

    # 4) 独立多面体ダイヤモンド（表3個＋裏8個＋中央4芒星ダイヤ）＋台座＋ファセット箔
    bezel_objs, foil_objs, gem_objs = [], [], []
    for gname, center_px, grx, gry, brx, bry, ch in FRONT_GEMS:
        bz, fl = build_diamond_bezel_and_foil(
            mats['diamond_metal'], mats['foil'], center_px, brx, bry, grx, gry,
            FRAME_TOP - 0.0015, y_dir=-1.0, rim_h=0.0105, name=f'bz-{gname}',
        )
        if bz:
            bezel_objs.append(bz)
        foil_objs.append(fl)
        gem_objs.append(build_diamond_polyhedron(
            mats['diamond_gem'], center_px, grx, gry, FRAME_TOP - 0.0015, y_dir=-1.0,
            crown_h=ch, pavilion_d=ch * 1.1, name=f'gem-{gname}',
        ))

    for gname, center_px, grx, gry, brx, bry, ch, has_bz in BACK_GEMS:
        by = SLAB_BACK + 0.0070 if (gname.startswith('b-crest') or not has_bz) else BACK_FRAME_Y
        bz, fl = build_diamond_bezel_and_foil(
            mats['diamond_metal'], mats['foil'], center_px, brx, bry, grx, gry,
            by, y_dir=1.0, rim_h=0.0095, name=f'bz-{gname}',
        )
        if bz:
            bezel_objs.append(bz)
        foil_objs.append(fl)
        gem_objs.append(build_diamond_polyhedron(
            mats['diamond_gem'], center_px, grx, gry, by, y_dir=1.0,
            crown_h=ch, pavilion_d=ch * 1.1, name=f'gem-{gname}',
        ))

    star, star_foil = build_four_point_star_diamond(
        mats['diamond_gem'], mats['foil'], (BACK_STAR[0], BACK_STAR[1]),
        BACK_STAR[2], BACK_STAR[3], BACK_STAR[4], SLAB_BACK + 0.0025, y_dir=1.0, peak_h=0.027,
    )
    gem_objs.append(star)
    foil_objs.append(star_foil)

    bz_all = join(bezel_objs, 'gem-bezels')
    bz_all.data.materials.append(mats['diamond_metal'])
    smooth_by_angle(bz_all, 28)
    parts.append(bz_all)

    fl_all = join(foil_objs, 'gem-foils')
    fl_all.data.materials.append(mats['foil'])
    for poly in fl_all.data.polygons:
        poly.use_smooth = False
    parts.append(fl_all)

    gm_all = join(gem_objs, 'diamond-gems')
    gm_all.data.materials.append(mats['diamond_gem'])
    for poly in gm_all.data.polygons:
        poly.use_smooth = False
    parts.append(gm_all)

    root = bpy.data.objects.new('card-skin-diamond', None)
    scene.collection.objects.link(root)
    for p in parts:
        p.parent = root
    return root, parts


def export(root):
    for obj in bpy.context.scene.objects:
        obj.select_set(obj == root or obj.parent == root)
    bpy.ops.export_scene.gltf(
        filepath=str(OUT), export_format='GLB', use_selection=True, use_active_scene=True,
        export_yup=True, export_apply=True, export_image_format='NONE', export_texcoords=True,
        export_normals=True, export_materials='EXPORT', export_cameras=False, export_lights=False,
    )


if __name__ == '__main__' or globals().get('RUN_BUILD'):
    if bpy.app.background and not globals().get('RUN_BUILD'):
        bpy.ops.wm.read_factory_settings(use_empty=True)
    root, parts = build()
    if globals().get('DO_EXPORT', True):
        export(root)
    tris = sum(sum(len(poly.vertices) - 2 for poly in p.data.polygons) for p in parts)
    print('diamond card parts', len(parts), tris, 'tris')
