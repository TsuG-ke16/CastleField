"""プラチナランクカード（表・裏・背面紋章の完全3Dモデル）を Blender で作り、card-skin-platinum.glb に書き出す。

使い方（リポジトリのルートで）：
  blender --background --python assets/models/make-card-skin-platinum.py

元画像：
  表：assets/cards/frame-skin-platinum.png（512×768）
  裏：assets/skins/back-rank-platinum.png（512×768）

座標系：
  枠の絵の幅 512px = 1.0、高さ 768px = 1.5、原点は中心。
  Blender では X 右・Z 上・表が手前(-Y)・裏が奥(+Y)。glTF 書き出しの Y-up 変換で +Z が表、-Z が裏になる。

マテリアル名（統合担当向け・Three.js 側で名前マッピング可能）：
  face           … 表の絵（窓の奥・名前欄・下の欄・メダルの中・枠の地）
  back           … 裏の絵（背面のキルティング地・リボン・紋章内円など。UV は back-rank-platinum.png の 0〜1）
  platinum_face  … 表のプラチナ翼・角飾り（表の絵を活かしつつプラチナ金属光沢を乗せる）
  back_platinum  … 裏のプラチナ外枠・背面紋章の翼と輪（裏の絵を活かしつつプラチナ金属光沢を乗せる）
  crystal_face   … 表の氷晶シャード（表の絵を活かしつつ高クリアコートの氷晶光沢）
  back_crystal   … 裏の四隅の氷晶シャード（裏の絵を活かしつつ高クリアコートの氷晶光沢）
  platinum       … 純プラチナ金具（側面・ベゼル・背面紋章の輪と側面。銀より深みのある青白メタリック）
  gold           … シャンパンゴールドの内縁・側面宝石台座・メダル輪・背面金縁
  foil           … 宝石奥のファセット反射箔（氷プラチナ色）
  gem            … ファセットカットのアクアマリン宝石＋背面中央の立体4芒星クリスタル（IOR 1.62）
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

FRONT_PNG = REPO / 'assets/cards/frame-skin-platinum.png'
BACK_PNG = REPO / 'assets/skins/back-rank-platinum.png'
OUT = REPO / 'assets/models/card-skin-platinum.glb'
PREVIEW_TEXTURES = globals().get('PREVIEW_TEXTURES', False)

PX = 512.0
IMG_H = 768

# ---- 厚み（手前が -Y、裏が +Y）----
SLAB_BACK = 0.0255          # 裏のくぼみ盤（キルティング地）
BACK_FRAME_Y = 0.0320       # 裏のプラチナ外枠の表
SLAB_FRONT = -0.0105        # 表の窓の奥
FRAME_TOP = -0.0275         # 表のプラチナ枠の表
PLATE_TOP = -0.0225         # 名前欄・下の欄
MEDAL_TOP = -0.0240         # 左上メダルの中

# ---- 実測座標（512×768 ピクセル）----
BODY = (18, 39, 493, 738, 16)
WINDOW = (78, 121, 432, 482, 8)
NAME = (74, 506, 436, 582, 12)
STAT = (74, 622, 437, 695, 12)
MEDAL = (89.0, 109.0, 36.5, 45.5)

# 表の5個のファセット宝石：(名前, (cx, cy), grx, gry, brx, bry, bezel_mat, crown_h)
FRONT_GEMS = [
    ('f-top', (255.5, 57.5), 27.5, 32.5, 42.0, 48.0, 'platinum', 0.0215),
    ('f-left', (47.5, 360.0), 17.5, 24.5, 29.5, 37.5, 'gold', 0.0175),
    ('f-right', (464.0, 359.5), 17.5, 24.5, 29.5, 37.5, 'gold', 0.0175),
    ('f-mid', (256.0, 602.0), 13.5, 13.5, 24.0, 23.0, 'platinum', 0.0145),
    ('f-bot', (255.5, 725.0), 21.5, 23.5, 34.0, 36.0, 'platinum', 0.0175),
]

# 裏の金縁・6個のファセット宝石・中央4芒星クリスタル
BACK_GOLD_RECT = (55, 95, 456, 696, 22)
BACK_GEMS = [
    ('b-top', (256.0, 65.5), 22.0, 31.0, 36.0, 47.0, 0.0190),
    ('b-bot', (256.0, 681.0), 22.0, 31.0, 36.0, 47.0, 0.0190),
    ('b-left', (47.0, 367.5), 17.5, 23.0, 29.5, 36.5, 0.0165),
    ('b-right', (465.0, 366.5), 17.5, 23.0, 29.5, 36.5, 0.0165),
    ('b-crest-t', (256.0, 205.5), 17.0, 24.0, 29.0, 38.0, 0.0170),
    ('b-crest-b', (256.0, 460.0), 15.0, 22.5, 27.0, 36.0, 0.0170),
]
BACK_STAR = (255.5, 340.0, 76.0, 72.0, 21.0)   # cx, cy, outer_rx, outer_ry, inner_r


def to_xz_front(px, py):
    return px / PX - 0.5, (IMG_H / 2 - py) / PX


def to_xz_back(px, py):
    """裏から見たときの左→右が +X→-X になるように反転"""
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
        scene = bpy.data.scenes.get('CardSkinPlatinum') or bpy.data.scenes.new('CardSkinPlatinum')
    old = bpy.data.objects.get('card-skin-platinum')
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
    # プラチナは銀よりやや重厚でクールな青白い金属反射（暗部が締まりハイライトが鋭い）
    mats = {
        'face': material('face', (0.82, 0.84, 0.88), roughness=0.62),
        'back': material('back', (0.14, 0.36, 0.52), roughness=0.48),
        'platinum_face': material('platinum_face', (0.76, 0.81, 0.88), metallic=0.58, roughness=0.18, **{'Coat Weight': 0.55, 'Coat Roughness': 0.08}),
        'back_platinum': material('back_platinum', (0.76, 0.81, 0.88), metallic=0.58, roughness=0.18, **{'Coat Weight': 0.55, 'Coat Roughness': 0.08}),
        'crystal_face': material('crystal_face', (0.36, 0.82, 0.98), metallic=0.15, roughness=0.10, **{'Coat Weight': 1.0, 'Coat Roughness': 0.03}),
        'back_crystal': material('back_crystal', (0.36, 0.82, 0.98), metallic=0.15, roughness=0.10, **{'Coat Weight': 1.0, 'Coat Roughness': 0.03}),
        'platinum': material('platinum', (0.75, 0.80, 0.87), metallic=1.0, roughness=0.15, **{'Coat Weight': 0.35, 'Coat Roughness': 0.06}),
        'gold': material('gold', (0.95, 0.72, 0.28), metallic=1.0, roughness=0.17),
        'foil': material('foil', (0.78, 0.95, 1.00), metallic=1.0, roughness=0.09),
        'gem': material('gem', (0.18, 0.84, 1.00), roughness=0.02, **{'Transmission Weight': 0.92, 'IOR': 1.62, 'Coat Weight': 1.0, 'Coat Roughness': 0.02}),
    }
    if PREVIEW_TEXTURES:
        for key, path, link_alpha in (
            ('face', FRONT_PNG, True),
            ('platinum_face', FRONT_PNG, True),
            ('crystal_face', FRONT_PNG, True),
            ('back', BACK_PNG, False),
            ('back_platinum', BACK_PNG, False),
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


def trace(mask, start, spacing=2.5, smooth=4, eps=0.6):
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


def connected_loops(mask, min_pixels=80, spacing=2.8, smooth=3, eps=0.75, min_pts=6):
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
    """2D の輪を y0〜y1 の厚みに押し出す。mapper=to_xz_back で裏側座標にも対応"""
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
    used_names = []
    index_of = {}
    for f in bm.faces:
        kind = rule(f.normal, f.calc_center_median())
        if kind not in index_of:
            index_of[kind] = len(used_names)
            used_names.append(kind)
        f.material_index = index_of[kind]
        for loop in f.loops:
            co = loop.vert.co
            loop[uv].uv = (uv_rule or (lambda k, c: front_uv(c.x, c.z)))(kind, co)
    mesh.materials.clear()
    for n in used_names:
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
    """y_dir=-1.0 で表側(-Y)、+1.0 で裏側(+Y)に盛り上がる金属縁"""
    half = width / 2
    profile = [
        (-half, -0.0010),
        (-half * 0.88, height * 0.65),
        (0, height),
        (half * 0.88, height * 0.65),
        (half, -0.0010),
    ]
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


# ---------------------------------------------------------------- ひし形ファセット宝石・台座（表裏両対応）
def build_diamond_gem(mat, center_px, grx_px, gry_px, base_y, y_dir=-1.0,
                      table_ratio=0.40, crown_h=0.019, pavilion_d=0.020, name='gem'):
    mapper = to_xz_front if y_dir < 0 else to_xz_back
    cx, cz = mapper(*center_px)
    rgx, rgy = grx_px / PX, gry_px / PX
    rtx, rty = rgx * table_ratio, rgy * table_ratio

    girdle_low = base_y + y_dir * 0.0020
    girdle_high = girdle_low + y_dir * 0.0024
    table_y = girdle_high + y_dir * crown_h
    star_y = girdle_high + y_dir * (crown_h * 0.54)
    culet_y = girdle_low - y_dir * pavilion_d

    def at(angle_deg, rx, ry, y):
        a = math.radians(angle_deg)
        return Vector((cx + rx * math.cos(a), y, cz + ry * math.sin(a)))

    bm = bmesh.new()
    nv = bm.verts.new
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

    gt, gb = g_ring(girdle_high), g_ring(girdle_low)
    nf = bm.faces.new
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

    pm = [nv(at(m, rgx * c45 * 0.54, rgy * c45 * 0.54, girdle_low - y_dir * (pavilion_d * 0.55))) for m in mids]
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
    mesh.materials.append(mat)
    for poly in mesh.polygons:
        poly.use_smooth = False
    return obj


def build_diamond_bezel_and_foil(metal_mat, foil_mat, center_px, out_rx_px, out_ry_px,
                                 grx_px, gry_px, base_y, y_dir=-1.0, rim_h=0.0095, name='setting'):
    mapper = to_xz_front if y_dir < 0 else to_xz_back
    cx, cz = mapper(*center_px)
    rox, roy = out_rx_px / PX, out_ry_px / PX
    rgx, rgy = grx_px / PX, gry_px / PX
    rix, riy = rgx + 2.5 / PX, rgy + 2.5 / PX

    def d_ring(rx, ry, y):
        return [Vector((cx, y, cz + ry)), Vector((cx - rx, y, cz)), Vector((cx, y, cz - ry)), Vector((cx + rx, y, cz))]

    profile = [
        (rox, roy, -0.0015),
        (rox, roy, rim_h * 0.40),
        (rox * 0.86, roy * 0.86, rim_h * 0.90),
        (rox * 0.78, roy * 0.78, rim_h),
        (rix + 0.0020, riy + 0.0020, rim_h * 0.65),
        (rix, riy, rim_h * 0.45),
        (rgx + 0.0012, rgy + 0.0012, rim_h * 0.16),
    ]
    rings = [d_ring(rx, ry, base_y + y_dir * h) for rx, ry, h in profile]
    bezel = loft(name, rings, closed=True)
    bezel.data.materials.append(metal_mat)
    smooth_by_angle(bezel, 28)

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

    foil_rings = [
        oct_ring(1.01, base_y + y_dir * (rim_h * 0.16)),
        oct_ring(0.70, base_y - y_dir * 0.0065),
        oct_ring(0.35, base_y - y_dir * 0.0135),
    ]
    foil = loft(f'{name}-foil', foil_rings, closed=True, cap_center=Vector((cx, base_y - y_dir * 0.0170, cz)))
    foil.data.materials.append(foil_mat)
    for poly in foil.data.polygons:
        poly.use_smooth = False
    return bezel, foil


def build_four_point_star_crystal(gem_mat, foil_mat, center_px, outer_rx_px, outer_ry_px,
                                  inner_r_px, base_y, y_dir=1.0, peak_h=0.024, name='back-star'):
    """プラチナ紋章の中央4芒星クリスタル：鋭い8面ファセットの立体星結晶＋奥の反射箔"""
    mapper = to_xz_front if y_dir < 0 else to_xz_back
    cx, cz = mapper(*center_px)
    orx, ory, ir = outer_rx_px / PX, outer_ry_px / PX, inner_r_px / PX

    # 8点（上・左上くびれ・左・左下くびれ・下・右下くびれ・右・右上くびれ）
    ring_pts = []
    for i in range(8):
        a = math.radians(90 + 45 * i)
        if i % 2 == 0:
            ring_pts.append((cx + orx * math.cos(a), cz + ory * math.sin(a)))
        else:
            ring_pts.append((cx + ir * math.cos(a), cz + ir * math.sin(a)))

    bm = bmesh.new()
    nv = bm.verts.new
    y_base = base_y + y_dir * 0.0015
    y_edge = base_y + y_dir * 0.0045
    y_peak = base_y + y_dir * peak_h
    y_back = base_y - y_dir * 0.0060

    v_edge = [nv(Vector((x, y_edge, z))) for x, z in ring_pts]
    v_base = [nv(Vector((x, y_base, z))) for x, z in ring_pts]
    v_peak = nv(Vector((cx, y_peak, cz)))
    v_back = nv(Vector((cx, y_back, cz)))

    for i in range(8):
        j = (i + 1) % 8
        bm.faces.new((v_edge[i], v_edge[j], v_peak))
        bm.faces.new((v_base[i], v_base[j], v_edge[j], v_edge[i]))
        bm.faces.new((v_base[j], v_base[i], v_back))

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    star = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(star)
    star.data.materials.append(gem_mat)
    for poly in star.data.polygons:
        poly.use_smooth = False

    # 奥のファセット反射箔（星と同じ8角輪郭）
    bm2 = bmesh.new()
    v_f = [bm2.verts.new(Vector((x * 0.94 + cx * 0.06, base_y + y_dir * 0.0012, z * 0.94 + cz * 0.06))) for x, z in ring_pts]
    v_c = bm2.verts.new(Vector((cx, base_y - y_dir * 0.0040, cz)))
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
def front_masks(rgba):
    r, g, b, a = rgba[..., 0], rgba[..., 1], rgba[..., 2], rgba[..., 3]
    h, w = a.shape
    yy, xx = np.mgrid[0:h, 0:w]

    def in_rect(rect, pad=3.0):
        x0, y0, x1, y1, _ = rect
        return (xx >= x0 - pad) & (xx <= x1 + pad) & (yy >= y0 - pad) & (yy <= y1 + pad)

    excl = in_rect(WINDOW, 4.0) | in_rect(NAME, 3.0) | in_rect(STAT, 3.0)
    excl |= np.hypot(xx - MEDAL[0], yy - MEDAL[1]) <= MEDAL[3] + 2.5
    for _, (gx, gy), _, _, brx, bry, _, _ in FRONT_GEMS:
        excl |= (np.abs(xx - gx) / (brx + 1.5) + np.abs(yy - gy) / (bry + 1.5)) <= 1.0

    # 氷晶シャード（明るいシアン・水色）
    is_ice = (a > 0.6) & (b > 0.72) & (g > 0.55) & (b - r > 0.22) & (~excl)
    ice = ~shift_or(~is_ice)
    for _ in range(2):
        ice = shift_or(ice)
    ice &= shift_or(is_ice)
    ice = ~shift_or(~ice)

    # プラチナの翼・装飾パーツ（明るく彩度の低い青白金属。クリーム・金・シアンを除く）
    lum = (r + g + b) / 3.0
    is_plat = (a > 0.6) & (lum > 0.48) & ((b - r) < 0.22) & ((r - b) < 0.08) & (~excl) & (~ice)
    plat = ~shift_or(~is_plat)
    for _ in range(2):
        plat = shift_or(plat)
    plat &= shift_or(is_plat)
    plat = ~shift_or(~plat)
    return plat, ice


def back_masks(rgba):
    """裏面の絵から「プラチナ外枠＋背面紋章の翼・輪」「四隅の氷晶シャード」「垂れリボン」を抽出"""
    r, g, b, a = rgba[..., 0], rgba[..., 1], rgba[..., 2], rgba[..., 3]
    h, w = a.shape
    yy, xx = np.mgrid[0:h, 0:w]

    # 宝石台座と中央星の内側は除外
    excl = np.zeros((h, w), dtype=bool)
    for _, (gx, gy), _, _, brx, bry, _ in BACK_GEMS:
        excl |= (np.abs(xx - gx) / (brx + 1.0) + np.abs(yy - gy) / (bry + 1.0)) <= 1.0
    sx, sy, srx, sry, _ = BACK_STAR
    excl |= (np.abs(xx - sx) / (srx * 0.75) + np.abs(yy - sy) / (sry * 0.75)) <= 1.0

    # 内側のキルティング盤の範囲（金縁の内側）
    x0, y0, x1, y1, _ = BACK_GOLD_RECT
    inside_panel = (xx > x0 + 6) & (xx < x1 - 6) & (yy > y0 + 6) & (yy < y1 - 6)

    # 背面紋章のプラチナ翼・輪（パネル内部の明るいプラチナ金属）
    lum = (r + g + b) / 3.0
    is_emblem_plat = inside_panel & (a > 0.7) & (lum > 0.50) & ((b - r) < 0.22) & ((r - b) < 0.10) & (~excl)
    em_plat = ~shift_or(~is_emblem_plat)
    for _ in range(2):
        em_plat = shift_or(em_plat)
    em_plat &= shift_or(is_emblem_plat)
    em_plat = ~shift_or(~em_plat)

    # 四隅の氷晶シャード（パネルの4隅付近にある明るい水色）
    near_corners = inside_panel & ((xx < 150) | (xx > 362)) & ((yy < 205) | (yy > 540))
    is_corner_ice = near_corners & (a > 0.7) & (b > 0.74) & (g > 0.58) & (b - r > 0.14)
    c_ice = ~shift_or(~is_corner_ice)
    c_ice = shift_or(c_ice)

    # 背面紋章下部の2本のリボン（x=155..355, y=430..545 の明るい水色）
    ribbon_zone = (xx > 155) & (xx < 355) & (yy > 430) & (yy < 545) & (~em_plat) & (~excl)
    is_ribbon = ribbon_zone & (a > 0.8) & (b > 0.65) & (g > 0.45) & (r > 0.20)
    rib = ~shift_or(~is_ribbon)
    rib = shift_or(rib)
    return em_plat, c_ice, rib


# ---------------------------------------------------------------- 組み立て
def build():
    scene = fresh_scene()
    mats = make_materials()
    f_rgba = load_rgba(FRONT_PNG)
    b_rgba = load_rgba(BACK_PNG)
    parts = []

    # ==================== 1) 本体板（表の窓奥 〜 裏のキルティング盤） ====================
    x0, y0, x1, y1, r = BODY
    slab = slab_from_loops('slab', [rounded_rect(x0, y0, x1, y1, r, 6)], SLAB_FRONT - 0.0010, SLAB_BACK, 0.0038, resolution=1)
    assign(
        slab, mats,
        lambda n, c: 'face' if n.y < -0.7 else 'back' if n.y > 0.7 else 'platinum',
        lambda k, c: back_uv(c.x, c.z) if k == 'back' else front_uv(c.x, c.z),
    )
    smooth_by_angle(slab, 40)
    parts.append(slab)

    # ==================== 2) 表：プラチナ外枠・翼・氷晶シャード・欄・金縁・5宝石 ====================
    f_mask = blur5(f_rgba[:, :, 3]) > 0.5
    ys, xs = np.nonzero(f_mask)
    f_outline = [tuple(p) for p in trace(f_mask, (int(ys.min()), int(xs[ys == ys.min()].min())), spacing=2.4, eps=0.55)]
    f_holes = [
        window_medal_hole(WINDOW, MEDAL),
        rounded_rect(*grow(NAME, -1.5), 5),
        rounded_rect(*grow(STAT, -1.5), 5),
    ]
    front_frame = slab_from_loops('front-frame', [f_outline, *f_holes], FRAME_TOP, SLAB_FRONT + 0.0010, 0.0028, resolution=1)
    bx0, bz1 = to_xz_front(x0, y0)
    bx1, bz0 = to_xz_front(x1, y1)
    inner = (bx0 + 0.004, bz0 + 0.004, bx1 - 0.004, bz1 - 0.004)
    cull(front_frame, lambda n, c: n.y > 0.5 and inner[0] < c.x < inner[2] and inner[1] < c.z < inner[3])
    assign(front_frame, mats, lambda n, c: 'platinum_face' if n.y < -0.45 else 'platinum')
    smooth_by_angle(front_frame, 36)
    parts.append(front_frame)

    f_plat_mask, f_ice_mask = front_masks(f_rgba)
    fp_objs = []
    for i, loop in enumerate(connected_loops(f_plat_mask, min_pixels=150, spacing=3.8, smooth=3, eps=1.05)):
        fp_objs.append(slab_from_loops(f'fp-{i}', [[tuple(q) for q in loop]], FRAME_TOP - 0.0066, FRAME_TOP + 0.0020, 0.0030, resolution=1))
    if fp_objs:
        fp = join(fp_objs, 'front-platinum-wings')
        cull(fp, lambda n, c: n.y > 0.2)
        assign(fp, mats, lambda n, c: 'platinum_face' if n.y < -0.35 else 'platinum')
        smooth_by_angle(fp, 48)
        parts.append(fp)

    fi_objs = []
    for i, loop in enumerate(connected_loops(f_ice_mask, min_pixels=100, spacing=3.8, smooth=2, eps=1.00)):
        fi_objs.append(slab_from_loops(f'fi-{i}', [[tuple(q) for q in loop]], FRAME_TOP - 0.0056, FRAME_TOP + 0.0020, 0.0026, resolution=1))
    if fi_objs:
        fi = join(fi_objs, 'front-ice-shards')
        cull(fi, lambda n, c: n.y > 0.2)
        assign(fi, mats, lambda n, c: 'crystal_face' if n.y < -0.30 else 'platinum')
        smooth_by_angle(fi, 30)
        parts.append(fi)

    # 表のプレート（名前欄・下の欄・メダルの中）
    for pname, rect in (('name-plate', NAME), ('stat-plate', STAT)):
        plate = slab_from_loops(pname, [rounded_rect(*grow(rect, -1.0), 5)], PLATE_TOP, SLAB_FRONT, 0.0018, resolution=1)
        assign(plate, mats, lambda n, c: 'face' if n.y < -0.45 else 'platinum')
        smooth_by_angle(plate, 40)
        parts.append(plate)
    medal = slab_from_loops('medal-disc', [circle(MEDAL[0], MEDAL[1], MEDAL[2] + 2.5, 36)], MEDAL_TOP, SLAB_FRONT, 0.0016, resolution=1)
    assign(medal, mats, lambda n, c: 'face' if n.y < -0.45 else 'platinum')
    smooth_by_angle(medal, 40)
    parts.append(medal)

    # 表のシャンパンゴールド内縁（窓・名前欄・下の欄・メダル）
    rim_win = metal_rim('rim-window', rect_xz(grow(WINDOW, 1.5), spacing=16.0), mats['gold'], 0.0080, 0.0044, FRAME_TOP, y_dir=-1.0)
    mcx, mcz = to_xz_front(MEDAL[0], MEDAL[1])
    tcx, tcz = to_xz_front(*FRONT_GEMS[0][1])
    cull(
        rim_win,
        lambda n, c: math.hypot(c.x - mcx, c.z - mcz) < (MEDAL[3] + 1.0) / PX
        or (abs(c.x - tcx) / (46.0 / PX) + abs(c.z - tcz) / (52.0 / PX)) < 1.0,
    )
    parts.append(rim_win)
    parts.append(metal_rim('rim-name', rect_xz(grow(NAME, -1.0), spacing=24.0), mats['gold'], 0.0072, 0.0038, FRAME_TOP + 0.0010, y_dir=-1.0))
    parts.append(metal_rim('rim-stat', rect_xz(grow(STAT, -1.0), spacing=24.0), mats['gold'], 0.0072, 0.0038, FRAME_TOP + 0.0010, y_dir=-1.0))
    mc = Vector(to_xz_front(MEDAL[0], MEDAL[1]))
    m_pts = [mc + Vector((math.cos(a), math.sin(a))) * ((MEDAL[2] + MEDAL[3]) / 2 / PX) for a in [-2 * math.pi * i / 44 for i in range(44)]]
    parts.append(metal_rim('rim-medal', m_pts, mats['gold'], (MEDAL[3] - MEDAL[2]) / PX, 0.0072, FRAME_TOP + 0.0005, y_dir=-1.0))

    # ==================== 3) 裏：プラチナ外枠・金内縁・背面立体紋章・四隅氷晶・中央4芒星 ====================
    b_mask = blur5(b_rgba[:, :, 3]) > 0.5
    ys, xs = np.nonzero(b_mask)
    b_outline = [tuple(p) for p in trace(b_mask, (int(ys.min()), int(xs[ys == ys.min()].min())), spacing=2.5, eps=0.60)]
    b_hole = rounded_rect(*grow(BACK_GOLD_RECT, -2.0), 5)
    back_frame = slab_from_loops('back-frame', [b_outline, b_hole], SLAB_BACK - 0.0015, BACK_FRAME_Y, 0.0030, resolution=1, mapper=to_xz_back)
    cull(back_frame, lambda n, c: n.y < -0.5 and inner[0] < c.x < inner[2] and inner[1] < c.z < inner[3])
    assign(back_frame, mats, lambda n, c: 'back_platinum' if n.y > 0.45 else 'platinum', lambda k, c: back_uv(c.x, c.z))
    smooth_by_angle(back_frame, 36)
    parts.append(back_frame)

    # 裏の金内縁（4辺の宝石台座の下は切り抜く）
    b_gold_rim = metal_rim('back-gold-rim', rect_xz(BACK_GOLD_RECT, spacing=16.0, mapper=to_xz_back), mats['gold'], 0.0085, 0.0050, SLAB_BACK, y_dir=1.0)
    b_gem_zones = [(to_xz_back(*g[1]), g[4] / PX, g[5] / PX) for g in BACK_GEMS[:4]]
    cull(b_gold_rim, lambda n, c: any(abs(c.x - gx) / (rx + 0.005) + abs(c.z - gz) / (ry + 0.005) < 1.0 for (gx, gz), rx, ry in b_gem_zones))
    parts.append(b_gold_rim)

    # 裏の背面紋章（プラチナ翼と輪）・四隅の氷晶・下部リボン
    em_plat_mask, c_ice_mask, rib_mask = back_masks(b_rgba)

    bp_objs = []
    for i, loop in enumerate(connected_loops(em_plat_mask, min_pixels=130, spacing=3.6, smooth=3, eps=0.95)):
        bp_objs.append(slab_from_loops(f'bp-{i}', [[tuple(q) for q in loop]], SLAB_BACK - 0.0015, SLAB_BACK + 0.0110, 0.0036, resolution=1, mapper=to_xz_back))
    if bp_objs:
        bp = join(bp_objs, 'back-emblem-platinum')
        cull(bp, lambda n, c: n.y < -0.2)
        assign(bp, mats, lambda n, c: 'back_platinum' if n.y > 0.35 else 'platinum', lambda k, c: back_uv(c.x, c.z))
        smooth_by_angle(bp, 48)
        parts.append(bp)

    bi_objs = []
    for i, loop in enumerate(connected_loops(c_ice_mask, min_pixels=70, spacing=2.4, smooth=2, eps=0.60)):
        bi_objs.append(slab_from_loops(f'bi-{i}', [[tuple(q) for q in loop]], SLAB_BACK - 0.0010, SLAB_BACK + 0.0075, 0.0026, resolution=1, mapper=to_xz_back))
    if bi_objs:
        bi = join(bi_objs, 'back-corner-ice')
        cull(bi, lambda n, c: n.y < -0.2)
        assign(bi, mats, lambda n, c: 'back_crystal' if n.y > 0.30 else 'platinum', lambda k, c: back_uv(c.x, c.z))
        smooth_by_angle(bi, 30)
        parts.append(bi)

    br_objs = []
    for i, loop in enumerate(connected_loops(rib_mask, min_pixels=90, spacing=2.6, smooth=2, eps=0.65)):
        br_objs.append(slab_from_loops(f'br-{i}', [[tuple(q) for q in loop]], SLAB_BACK - 0.0010, SLAB_BACK + 0.0045, 0.0018, resolution=1, mapper=to_xz_back))
    if br_objs:
        br = join(br_objs, 'back-emblem-ribbons')
        cull(br, lambda n, c: n.y < -0.2)
        assign(br, mats, lambda n, c: 'back' if n.y > 0.35 else 'platinum', lambda k, c: back_uv(c.x, c.z))
        smooth_by_angle(br, 45)
        parts.append(br)

    # ==================== 4) 表5個＋裏6個のファセット宝石＋中央4芒星クリスタル ====================
    plat_bezels, gold_bezels, foil_objs, gem_objs = [], [], [], []
    for gname, center_px, grx, gry, brx, bry, bmat, ch in FRONT_GEMS:
        bz, fl = build_diamond_bezel_and_foil(
            mats[bmat], mats['foil'], center_px, brx, bry, grx, gry,
            FRAME_TOP - 0.0015, y_dir=-1.0, rim_h=0.0095, name=f'bz-{gname}',
        )
        (gold_bezels if bmat == 'gold' else plat_bezels).append(bz)
        foil_objs.append(fl)
        gem_objs.append(build_diamond_gem(
            mats['gem'], center_px, grx, gry, FRAME_TOP - 0.0015, y_dir=-1.0,
            crown_h=ch, pavilion_d=ch * 1.05, name=f'gem-{gname}',
        ))

    for gname, center_px, grx, gry, brx, bry, ch in BACK_GEMS:
        by = SLAB_BACK + 0.0065 if gname.startswith('b-crest') else BACK_FRAME_Y
        bz, fl = build_diamond_bezel_and_foil(
            mats['platinum'], mats['foil'], center_px, brx, bry, grx, gry,
            by, y_dir=1.0, rim_h=0.0090, name=f'bz-{gname}',
        )
        plat_bezels.append(bz)
        foil_objs.append(fl)
        gem_objs.append(build_diamond_gem(
            mats['gem'], center_px, grx, gry, by, y_dir=1.0,
            crown_h=ch, pavilion_d=ch * 1.05, name=f'gem-{gname}',
        ))

    # 裏の中央4芒星クリスタル
    star, star_foil = build_four_point_star_crystal(
        mats['gem'], mats['foil'], (BACK_STAR[0], BACK_STAR[1]),
        BACK_STAR[2], BACK_STAR[3], BACK_STAR[4], SLAB_BACK + 0.0020, y_dir=1.0, peak_h=0.022,
    )
    gem_objs.append(star)
    foil_objs.append(star_foil)

    pbz = join(plat_bezels, 'gem-bezels-platinum')
    pbz.data.materials.append(mats['platinum'])
    smooth_by_angle(pbz, 30)
    parts.append(pbz)

    gbz = join(gold_bezels, 'gem-bezels-gold')
    gbz.data.materials.append(mats['gold'])
    smooth_by_angle(gbz, 30)
    parts.append(gbz)

    foils = join(foil_objs, 'gem-foils')
    foils.data.materials.append(mats['foil'])
    for poly in foils.data.polygons:
        poly.use_smooth = False
    parts.append(foils)

    gems = join(gem_objs, 'gem')
    gems.data.materials.append(mats['gem'])
    for poly in gems.data.polygons:
        poly.use_smooth = False
    parts.append(gems)

    root = bpy.data.objects.new('card-skin-platinum', None)
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
    print('platinum card parts', len(parts), tris, 'tris')
