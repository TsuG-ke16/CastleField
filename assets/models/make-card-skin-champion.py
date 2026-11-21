"""チャンピオンランクカード（表・裏・背面紋章の完全3Dモデル）を Blender で作り、card-skin-champion.glb に書き出す。

使い方（リポジトリのルートで）：
  blender --background --python assets/models/make-card-skin-champion.py

元画像：
  表：assets/cards/frame-skin-champion.png（512×768）
  裏：assets/skins/back-rank-champion.png（512×768）

座標系：
  枠の絵の幅 512px = 1.0、高さ 768px = 1.5、原点は中心。
  Blender では X 右・Z 上・表が手前(-Y)・裏が奥(+Y)。glTF 書き出しの Y-up で +Z が表、-Z が裏。

マテリアル名（統合担当向け・Three.js 側で名前マッピング可能）：
  face               … 表の絵（絵の窓の奥・名前欄・下の欄・メダルの中・深紅ベルベット地）
  back               … 裏の絵（背面の深紅キルティング地・3本の深紅リボン。UV は back-rank-champion.png の 0〜1）
  champ_gold_face    … 表の重厚ゴールド彫刻外枠・装飾（表の絵を活かしつつ高品位な黄金反射）
  back_gold_face     … 裏の重厚ゴールド外枠・背面紋章の太陽環と月桂樹（裏の絵を活かしつつ高品位な黄金反射）
  champ_wing_face    … 表の天使の白真珠羽（サテンパール質感）
  back_wing_face     … 裏の背面紋章の天使の白真珠羽（サテンパール質感）
  gold               … 純インペリアルゴールド（浮遊ヘイロー環・宝石台座・窓/欄/メダル内縁・背面金内縁・側面）
  foil               … 宝石・中央4芒星奥のファセット反射箔（白金プリズム）
  prism_gem          … 独立多面体カットのプリズムダイヤモンド（表7個＋裏5個＋中央4芒星ダイヤ。面ごと法線分離・IOR 2.42）
  ruby_gem           … 裏面上部クレストの4芒星ルビーゴールド宝石（面ごと法線分離・IOR 1.77）
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

FRONT_PNG = REPO / 'assets/cards/frame-skin-champion.png'
BACK_PNG = REPO / 'assets/skins/back-rank-champion.png'
OUT = REPO / 'assets/models/card-skin-champion.glb'
PREVIEW_TEXTURES = globals().get('PREVIEW_TEXTURES', False)

PX = 512.0
IMG_H = 768

# ---- 厚み（手前が -Y、裏が +Y）----
SLAB_BACK = 0.0260
BACK_FRAME_Y = 0.0335
SLAB_FRONT = -0.0105
FRAME_TOP = -0.0280
PLATE_TOP = -0.0225
MEDAL_TOP = -0.0240

# ---- 実測座標（512×768 ピクセル）----
BODY = (20, 46, 492, 748, 16)
WINDOW = (78, 121, 433, 483, 8)
NAME = (75, 508, 436, 588, 12)
STAT = (75, 628, 436, 706, 12)
MEDAL = (92.0, 109.5, 35.5, 44.5)

# 表：上部浮遊ヘイロー・上部4芒星・6個の多面体プリズム宝石
FRONT_HALO = (256.0, 26.0, 114.0, 14.5)
FRONT_TOP_STAR = (255.5, 74.0, 42.0, 44.0, 14.0)
FRONT_GEMS = [
    ('f-top-l', (172.5, 73.5), 14.5, 16.0, 22.0, 24.0, 0.0155),
    ('f-top-r', (338.5, 73.5), 14.5, 16.0, 22.0, 24.0, 0.0155),
    ('f-mid-l', (44.0, 357.5), 15.0, 19.5, 24.0, 29.0, 0.0165),
    ('f-mid-r', (467.5, 357.5), 15.0, 19.5, 24.0, 29.0, 0.0165),
    ('f-center', (255.5, 603.0), 19.5, 20.5, 29.0, 30.0, 0.0185),
    ('f-bot', (255.5, 727.5), 24.0, 25.0, 34.5, 35.5, 0.0205),
]

# 裏：金内縁・上部ルビー4芒星・浮遊ヘイロー・5個の多面体宝石・中央巨大4芒星
BACK_GOLD_RECT = (56, 95, 454, 675, 22)
BACK_TOP_STAR = (256.0, 58.0, 38.0, 44.0, 13.5)
BACK_HALO = (256.0, 171.0, 122.0, 24.0)
BACK_CENTER_STAR = (256.0, 327.5, 78.0, 75.0, 22.5)
BACK_GEMS = [
    ('b-left', (48.5, 381.5), 15.0, 18.0, 24.5, 28.0, 0.0170),
    ('b-right', (462.5, 381.5), 15.0, 18.0, 24.5, 28.0, 0.0170),
    ('b-bot', (255.5, 660.0), 18.0, 19.0, 28.5, 29.5, 0.0185),
    ('b-crest-t', (255.5, 217.0), 16.0, 20.5, 27.0, 33.0, 0.0185),
    ('b-crest-b', (255.5, 425.5), 16.0, 20.5, 27.0, 33.0, 0.0185),
]


def to_xz_front(px, py):
    return px / PX - 0.5, (IMG_H / 2 - py) / PX


def to_xz_back(px, py):
    return 0.5 - px / PX, (IMG_H / 2 - py) / PX


def front_uv(x, z):
    return x + 0.5, z * PX / IMG_H + 0.5


def back_uv(x, z):
    return 0.5 - x, z * PX / IMG_H + 0.5


def fresh_scene():
    if bpy.app.background or not bpy.context.window:
        scene = bpy.context.scene
    else:
        scene = bpy.data.scenes.get('CardSkinChampion') or bpy.data.scenes.new('CardSkinChampion')
    old = bpy.data.objects.get('card-skin-champion')
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
        'face': material('face', (0.62, 0.14, 0.18), roughness=0.66),
        'back': material('back', (0.48, 0.09, 0.14), roughness=0.56),
        'champ_gold_face': material('champ_gold_face', (0.98, 0.74, 0.24), metallic=0.66, roughness=0.18, **{'Coat Weight': 0.45}),
        'back_gold_face': material('back_gold_face', (0.98, 0.74, 0.24), metallic=0.66, roughness=0.18, **{'Coat Weight': 0.45}),
        'champ_wing_face': material('champ_wing_face', (0.94, 0.92, 0.98), metallic=0.10, roughness=0.28, **{'Coat Weight': 0.55}),
        'back_wing_face': material('back_wing_face', (0.94, 0.92, 0.98), metallic=0.10, roughness=0.28, **{'Coat Weight': 0.55}),
        'gold': material('gold', (0.98, 0.72, 0.20), metallic=1.0, roughness=0.15, **{'Coat Weight': 0.35}),
        'foil': material('foil', (0.92, 0.90, 1.00), metallic=1.0, roughness=0.08),
        'prism_gem': material('prism_gem', (0.68, 0.80, 1.00), roughness=0.015, **{'Transmission Weight': 0.94, 'IOR': 2.42, 'Coat Weight': 1.0, 'Coat Roughness': 0.015}),
        'ruby_gem': material('ruby_gem', (0.96, 0.14, 0.18), roughness=0.02, **{'Transmission Weight': 0.90, 'IOR': 1.77, 'Coat Weight': 1.0}),
    }
    if PREVIEW_TEXTURES:
        for key, path, link_alpha in (
            ('face', FRONT_PNG, True),
            ('champ_gold_face', FRONT_PNG, True),
            ('champ_wing_face', FRONT_PNG, True),
            ('back', BACK_PNG, False),
            ('back_gold_face', BACK_PNG, False),
            ('back_wing_face', BACK_PNG, False),
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


def connected_loops(mask, min_pixels=90, spacing=3.2, smooth=3, eps=0.85, min_pts=6):
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


# ---------------------------------------------------------------- 浮遊3Dゴールデンヘイロー（光輪）
def build_floating_halo(gold_mat, halo_spec, base_y, y_dir=-1.0, tube_r=0.0078, depth_r=0.022, name='halo'):
    """チャンピオンの象徴：クレストの上に立体的に浮かぶ楕円ゴールドヘイロー（奥行き方向にも丸みを持つ本物の3Dリング）"""
    cx_px, cy_px, rx_px, ry_px = halo_spec
    mapper = to_xz_front if y_dir < 0 else to_xz_back
    cx, cz = mapper(cx_px, cy_px)
    rx, rz = rx_px / PX, ry_px / PX

    segs, rsegs = 48, 8
    bm = bmesh.new()
    vrings = []
    for i in range(segs):
        t = 2.0 * math.pi * i / segs
        wx = cx + rx * math.cos(t)
        wz = cz + rz * math.sin(t)
        # 水平に傾いた3Dリング（下側が手前へ、上側が奥へ）
        wy = base_y + y_dir * (0.012 - depth_r * math.sin(t))
        t2 = t + 0.01
        wx2, wz2 = cx + rx * math.cos(t2), cz + rz * math.sin(t2)
        wy2 = base_y + y_dir * (0.012 - depth_r * math.sin(t2))
        tangent = Vector((wx2 - wx, wy2 - wy, wz2 - wz)).normalized()
        up = Vector((0, y_dir, 0))
        side = tangent.cross(up).normalized()
        up2 = side.cross(tangent).normalized()
        c = Vector((wx, wy, wz))
        vrings.append([bm.verts.new(c + side * math.cos(2 * math.pi * k / rsegs) * tube_r * 1.25 + up2 * math.sin(2 * math.pi * k / rsegs) * tube_r * 0.72) for k in range(rsegs)])
    for i in range(segs):
        a, b = vrings[i], vrings[(i + 1) % segs]
        for k in range(rsegs):
            k2 = (k + 1) % rsegs
            bm.faces.new((a[k], a[k2], b[k2], b[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(gold_mat)
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


# ---------------------------------------------------------------- 多面体宝石・4芒星ダイヤ
def build_diamond_polyhedron(mat, center_px, grx_px, gry_px, base_y, y_dir=-1.0,
                             table_ratio=0.38, crown_h=0.019, pavilion_d=0.021, name='gem'):
    mapper = to_xz_front if y_dir < 0 else to_xz_back
    cx, cz = mapper(*center_px)
    rgx, rgy = grx_px / PX, gry_px / PX
    rtx, rty = rgx * table_ratio, rgy * table_ratio
    g_low = base_y + y_dir * 0.0020
    g_high = g_low + y_dir * 0.0025
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
    stars = [nv(at(m, (rtx + rgx) * 0.5 * c45, (rty + rgy) * 0.5 * c45, star_y)) for m in mids]
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
    for p in obj.data.polygons:
        p.use_smooth = False
    return obj


def build_diamond_bezel_and_foil(metal_mat, foil_mat, center_px, out_rx_px, out_ry_px,
                                 grx_px, gry_px, base_y, y_dir=-1.0, rim_h=0.010, name='setting'):
    mapper = to_xz_front if y_dir < 0 else to_xz_back
    cx, cz = mapper(*center_px)
    rgx, rgy = grx_px / PX, gry_px / PX
    rox, roy = out_rx_px / PX, out_ry_px / PX
    rix, riy = rgx + 2.2 / PX, rgy + 2.2 / PX
    def d_ring(rx, ry, y):
        return [Vector((cx, y, cz + ry)), Vector((cx - rx, y, cz)), Vector((cx, y, cz - ry)), Vector((cx + rx, y, cz))]
    profile = [
        (rox, roy, -0.0015), (rox, roy, rim_h * 0.40), (rox * 0.86, roy * 0.86, rim_h * 0.90),
        (rox * 0.78, roy * 0.78, rim_h), (rix + 0.0020, riy + 0.0020, rim_h * 0.65),
        (rix, riy, rim_h * 0.45), (rgx + 0.0012, rgy + 0.0012, rim_h * 0.16),
    ]
    bezel = loft(name, [d_ring(rx, ry, base_y + y_dir * h) for rx, ry, h in profile], closed=True)
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
    foil = loft(f'{name}-foil', [oct_ring(1.01, base_y + y_dir * (rim_h * 0.16)), oct_ring(0.70, base_y - y_dir * 0.0065), oct_ring(0.35, base_y - y_dir * 0.0135)], closed=True, cap_center=Vector((cx, base_y - y_dir * 0.0170, cz)))
    foil.data.materials.append(foil_mat)
    for p in foil.data.polygons:
        p.use_smooth = False
    return bezel, foil


def build_star_gem_with_bezel(gem_mat, gold_mat, foil_mat, star_spec, base_y, y_dir=-1.0, peak_h=0.026, with_bezel=True, name='star'):
    cx_px, cy_px, orx_px, ory_px, ir_px = star_spec
    mapper = to_xz_front if y_dir < 0 else to_xz_back
    cx, cz = mapper(cx_px, cy_px)
    orx, ory, ir = orx_px / PX, ory_px / PX, ir_px / PX
    def s_ring(scale):
        pts = []
        for i in range(8):
            a = math.radians(90 + 45 * i)
            pts.append((cx + (orx if i % 2 == 0 else ir) * scale * math.cos(a),
                        cz + (ory if i % 2 == 0 else ir) * scale * math.sin(a)))
        return pts
    outer_pts, mid_pts = s_ring(1.0), s_ring(0.45)
    bm = bmesh.new()
    nv = bm.verts.new
    y_base = base_y + y_dir * 0.0015
    y_girdle = base_y + y_dir * 0.0050
    y_mid = base_y + y_dir * (peak_h * 0.72)
    y_peak = base_y + y_dir * peak_h
    y_back = base_y - y_dir * 0.0080
    vb = [nv(Vector((x, y_base, z))) for x, z in outer_pts]
    vg = [nv(Vector((x, y_girdle, z))) for x, z in outer_pts]
    vm = [nv(Vector((x, y_mid, z))) for x, z in mid_pts]
    vp = nv(Vector((cx, y_peak, cz)))
    vk = nv(Vector((cx, y_back, cz)))
    for i in range(8):
        j = (i + 1) % 8
        bm.faces.new((vm[i], vm[j], vp))
        bm.faces.new((vg[i], vg[j], vm[j], vm[i]))
        bm.faces.new((vb[i], vb[j], vg[j], vg[i]))
        bm.faces.new((vb[j], vb[i], vk))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    star = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(star)
    star.data.materials.append(gem_mat)
    for p in star.data.polygons:
        p.use_smooth = False

    bm2 = bmesh.new()
    vf = [bm2.verts.new(Vector((x * 0.94 + cx * 0.06, y_base - y_dir * 0.0005, z * 0.94 + cz * 0.06))) for x, z in outer_pts]
    vc = bm2.verts.new(Vector((cx, y_back + y_dir * 0.002, cz)))
    for i in range(8):
        bm2.faces.new((vf[i], vf[(i + 1) % 8], vc))
    bmesh.ops.recalc_face_normals(bm2, faces=bm2.faces)
    fmesh = bpy.data.meshes.new(f'{name}-foil')
    bm2.to_mesh(fmesh)
    bm2.free()
    foil = bpy.data.objects.new(f'{name}-foil', fmesh)
    bpy.context.scene.collection.objects.link(foil)
    foil.data.materials.append(foil_mat)
    for p in foil.data.polygons:
        p.use_smooth = False

    bezel = None
    if with_bezel:
        b_rings = [
            [Vector((x, base_y - y_dir * 0.0015, z)) for x, z in s_ring(1.22)],
            [Vector((x, base_y + y_dir * 0.0090, z)) for x, z in s_ring(1.14)],
            [Vector((x, base_y + y_dir * 0.0102, z)) for x, z in s_ring(1.06)],
            [Vector((x, base_y + y_dir * 0.0032, z)) for x, z in s_ring(1.00)],
        ]
        bezel = loft(f'{name}-bezel', b_rings, closed=True)
        bezel.data.materials.append(gold_mat)
        smooth_by_angle(bezel, 28)
    return star, foil, bezel


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
    excl |= (yy < 48)   # 浮遊ヘイロー領域は独立3Dリングにする
    excl |= (np.abs(xx - FRONT_TOP_STAR[0]) / 48.0 + np.abs(yy - FRONT_TOP_STAR[1]) / 50.0) <= 1.0
    for _, (gx, gy), _, _, brx, bry, _ in FRONT_GEMS:
        excl |= (np.abs(xx - gx) / (brx + 1.5) + np.abs(yy - gy) / (bry + 1.5)) <= 1.0

    # 天使の白真珠羽（明るく彩度の低い白〜薄紫）
    lum = (r + g + b) / 3.0
    is_wing = (a > 0.65) & (lum > 0.72) & (b > 0.72) & ((r - b) < 0.14) & (~excl)
    wm = ~shift_or(~is_wing)
    for _ in range(2):
        wm = shift_or(wm)
    wm &= shift_or(is_wing)
    wm = ~shift_or(~wm)

    # 重厚ゴールド彫刻（高彩度の金・橙）
    is_gold = (a > 0.65) & (r > 0.68) & (g > 0.44) & (r - b > 0.28) & (~excl) & (~wm)
    gm = ~shift_or(~is_gold)
    for _ in range(2):
        gm = shift_or(gm)
    gm &= shift_or(is_gold)
    gm = ~shift_or(~gm)
    return gm, wm


def back_masks(rgba):
    r, g, b, a = rgba[..., 0], rgba[..., 1], rgba[..., 2], rgba[..., 3]
    h, w = a.shape
    yy, xx = np.mgrid[0:h, 0:w]

    excl = (np.abs(xx - BACK_TOP_STAR[0]) / 46.0 + np.abs(yy - BACK_TOP_STAR[1]) / 50.0) <= 1.0
    excl |= (np.abs(xx - BACK_CENTER_STAR[0]) / 64.0 + np.abs(yy - BACK_CENTER_STAR[1]) / 64.0) <= 1.0
    for _, (gx, gy), _, _, brx, bry, _ in BACK_GEMS:
        excl |= (np.abs(xx - gx) / (brx + 1.0) + np.abs(yy - gy) / (bry + 1.0)) <= 1.0
    # 背面ヘイロー領域（y=138..200）は独立3Dリングにする
    excl |= (yy > 136) & (yy < 198) & (xx > 120) & (xx < 392)

    x0, y0, x1, y1, _ = BACK_GOLD_RECT
    inside = (xx > x0 + 6) & (xx < x1 - 6) & (yy > y0 + 6) & (yy < y1 - 6)

    # 天使の白真珠羽（パネル内の明るい白〜薄紫）
    lum = (r + g + b) / 3.0
    is_bwing = inside & (yy > 165) & (yy < 455) & (a > 0.7) & (lum > 0.66) & (b > 0.66) & ((r - b) < 0.16) & (~excl)
    bw = ~shift_or(~is_bwing)
    for _ in range(2):
        bw = shift_or(bw)
    bw &= shift_or(is_bwing)
    bw = ~shift_or(~bw)

    # 背面紋章の太陽環・スパイク・月桂樹（高彩度ゴールド）
    is_bgold = inside & (yy > 195) & (yy < 595) & (a > 0.7) & (r > 0.70) & (g > 0.45) & (r - b > 0.25) & (~excl) & (~bw)
    bg = ~shift_or(~is_bgold)
    for _ in range(2):
        bg = shift_or(bg)
    bg &= shift_or(is_bgold)
    bg = ~shift_or(~bg)

    # 下部3本の深紅リボン
    rib_zone = inside & (xx > 160) & (xx < 352) & (yy > 400) & (yy < 595) & (~bg) & (~bw) & (~excl)
    is_rib = rib_zone & (a > 0.8) & (r > 0.55) & (r - b > 0.25)
    rb = ~shift_or(~is_rib)
    rb = shift_or(rb)
    return bg, bw, rb


# ---------------------------------------------------------------- 組み立て
def build():
    scene = fresh_scene()
    mats = make_materials()
    f_rgba = load_rgba(FRONT_PNG)
    b_rgba = load_rgba(BACK_PNG)
    parts = []

    # 1) 本体板
    x0, y0, x1, y1, r = BODY
    slab = slab_from_loops('slab', [rounded_rect(x0, y0, x1, y1, r, 6)], SLAB_FRONT - 0.0010, SLAB_BACK, 0.0040, resolution=1)
    assign(
        slab, mats,
        lambda n, c: 'face' if n.y < -0.7 else 'back' if n.y > 0.7 else 'gold',
        lambda k, c: back_uv(c.x, c.z) if k == 'back' else front_uv(c.x, c.z),
    )
    smooth_by_angle(slab, 40)
    parts.append(slab)

    # 2) 表：外枠（浮遊ヘイロー部分は除いて本体シルエットのみ押し出し）＋彫刻ゴールド＋天使の白真珠羽＋浮遊3Dヘイロー
    f_mask = blur5(f_rgba[:, :, 3]) > 0.5
    f_mask[:42, :] = False   # 浮遊ヘイローを板で埋めない（本物の独立3Dリングにする）
    main_f_loops = connected_loops(f_mask, min_pixels=5000, spacing=2.6, smooth=3, eps=0.60)
    f_holes = [window_medal_hole(WINDOW, MEDAL), rounded_rect(*grow(NAME, -1.5), 5), rounded_rect(*grow(STAT, -1.5), 5)]
    front_frame = slab_from_loops('front-frame', [main_f_loops[0], *f_holes], FRAME_TOP, SLAB_FRONT + 0.0010, 0.0030, resolution=1)
    bx0, bz1 = to_xz_front(x0, y0); bx1, bz0 = to_xz_front(x1, y1)
    inner = (bx0 + 0.004, bz0 + 0.004, bx1 - 0.004, bz1 - 0.004)
    cull(front_frame, lambda n, c: n.y > 0.5 and inner[0] < c.x < inner[2] and inner[1] < c.z < inner[3])
    assign(front_frame, mats, lambda n, c: 'face' if n.y < -0.45 else 'gold')
    smooth_by_angle(front_frame, 38)
    parts.append(front_frame)

    fg_mask, fw_mask = front_masks(f_rgba)
    fg_objs = []
    for i, loop in enumerate(connected_loops(fg_mask, min_pixels=130, spacing=3.4, smooth=3, eps=0.90)):
        fg_objs.append(slab_from_loops(f'fg-{i}', [[tuple(q) for q in loop]], FRAME_TOP - 0.0076, FRAME_TOP + 0.0020, 0.0034, resolution=1))
    if fg_objs:
        fg = join(fg_objs, 'front-gold-sculpt')
        cull(fg, lambda n, c: n.y > 0.2)
        assign(fg, mats, lambda n, c: 'champ_gold_face' if n.y < -0.35 else 'gold')
        smooth_by_angle(fg, 44)
        parts.append(fg)

    fw_objs = []
    for i, loop in enumerate(connected_loops(fw_mask, min_pixels=120, spacing=3.2, smooth=3, eps=0.85)):
        fw_objs.append(slab_from_loops(f'fw-{i}', [[tuple(q) for q in loop]], FRAME_TOP - 0.0066, FRAME_TOP + 0.0020, 0.0030, resolution=1))
    if fw_objs:
        fw = join(fw_objs, 'front-angel-wings')
        cull(fw, lambda n, c: n.y > 0.2)
        assign(fw, mats, lambda n, c: 'champ_wing_face' if n.y < -0.35 else 'gold')
        smooth_by_angle(fw, 52)
        parts.append(fw)

    for pname, rect in (('name-plate', NAME), ('stat-plate', STAT)):
        plate = slab_from_loops(pname, [rounded_rect(*grow(rect, -1.0), 5)], PLATE_TOP, SLAB_FRONT, 0.0018, resolution=1)
        assign(plate, mats, lambda n, c: 'face' if n.y < -0.45 else 'gold')
        smooth_by_angle(plate, 40)
        parts.append(plate)
    medal = slab_from_loops('medal-disc', [circle(MEDAL[0], MEDAL[1], MEDAL[2] + 2.5, 36)], MEDAL_TOP, SLAB_FRONT, 0.0016, resolution=1)
    assign(medal, mats, lambda n, c: 'face' if n.y < -0.45 else 'gold')
    smooth_by_angle(medal, 40)
    parts.append(medal)

    rim_win = metal_rim('rim-window', rect_xz(grow(WINDOW, 1.5), spacing=16.0), mats['gold'], 0.0082, 0.0046, FRAME_TOP, y_dir=-1.0)
    mcx, mcz = to_xz_front(MEDAL[0], MEDAL[1])
    tcx, tcz = to_xz_front(FRONT_TOP_STAR[0], FRONT_TOP_STAR[1])
    cull(
        rim_win,
        lambda n, c: math.hypot(c.x - mcx, c.z - mcz) < (MEDAL[3] + 1.0) / PX
        or (abs(c.x - tcx) / (48.0 / PX) + abs(c.z - tcz) / (54.0 / PX)) < 1.0,
    )
    parts.append(rim_win)
    parts.append(metal_rim('rim-name', rect_xz(grow(NAME, -1.0), spacing=24.0), mats['gold'], 0.0074, 0.0040, FRAME_TOP + 0.0010, y_dir=-1.0))
    parts.append(metal_rim('rim-stat', rect_xz(grow(STAT, -1.0), spacing=24.0), mats['gold'], 0.0074, 0.0040, FRAME_TOP + 0.0010, y_dir=-1.0))
    mc = Vector(to_xz_front(MEDAL[0], MEDAL[1]))
    m_pts = [mc + Vector((math.cos(a), math.sin(a))) * ((MEDAL[2] + MEDAL[3]) / 2 / PX) for a in [-2 * math.pi * i / 44 for i in range(44)]]
    parts.append(metal_rim('rim-medal', m_pts, mats['gold'], (MEDAL[3] - MEDAL[2]) / PX, 0.0076, FRAME_TOP + 0.0005, y_dir=-1.0))

    # 表の上部浮遊3Dゴールデンヘイロー
    parts.append(build_floating_halo(mats['gold'], FRONT_HALO, FRAME_TOP, y_dir=-1.0, tube_r=0.0082, depth_r=0.022, name='front-halo'))

    # 3) 裏：重厚ゴールド外枠・金内縁・背面立体紋章（天使翼・太陽環＆月桂樹・深紅リボン・浮遊ヘイロー）
    b_mask = blur5(b_rgba[:, :, 3]) > 0.5
    ys, xs = np.nonzero(b_mask)
    b_outline = [tuple(p) for p in trace(b_mask, (int(ys.min()), int(xs[ys == ys.min()].min())), spacing=2.6, eps=0.60)]
    b_hole = rounded_rect(*grow(BACK_GOLD_RECT, -2.0), 5)
    back_frame = slab_from_loops('back-frame', [b_outline, b_hole], SLAB_BACK - 0.0015, BACK_FRAME_Y, 0.0032, resolution=1, mapper=to_xz_back)
    cull(back_frame, lambda n, c: n.y < -0.5 and inner[0] < c.x < inner[2] and inner[1] < c.z < inner[3])
    assign(back_frame, mats, lambda n, c: 'back_gold_face' if n.y > 0.45 else 'gold', lambda k, c: back_uv(c.x, c.z))
    smooth_by_angle(back_frame, 36)
    parts.append(back_frame)

    b_gold_rim = metal_rim('back-gold-rim', rect_xz(BACK_GOLD_RECT, spacing=16.0, mapper=to_xz_back), mats['gold'], 0.0086, 0.0052, SLAB_BACK, y_dir=1.0)
    b_top_c = to_xz_back(BACK_TOP_STAR[0], BACK_TOP_STAR[1])
    b_gem_zones = [(b_top_c, 46.0 / PX, 50.0 / PX)] + [(to_xz_back(*g[1]), g[4] / PX, g[5] / PX) for g in BACK_GEMS[:3]]
    cull(b_gold_rim, lambda n, c: any(abs(c.x - gx) / (rx + 0.005) + abs(c.z - gz) / (ry + 0.005) < 1.0 for (gx, gz), rx, ry in b_gem_zones))
    parts.append(b_gold_rim)

    bg_mask, bw_mask, rb_mask = back_masks(b_rgba)
    bw_objs = []
    for i, loop in enumerate(connected_loops(bw_mask, min_pixels=120, spacing=3.2, smooth=3, eps=0.85)):
        bw_objs.append(slab_from_loops(f'bw-{i}', [[tuple(q) for q in loop]], SLAB_BACK - 0.0010, SLAB_BACK + 0.0095, 0.0032, resolution=1, mapper=to_xz_back))
    if bw_objs:
        bw = join(bw_objs, 'back-emblem-wings')
        cull(bw, lambda n, c: n.y < -0.2)
        assign(bw, mats, lambda n, c: 'back_wing_face' if n.y > 0.35 else 'gold', lambda k, c: back_uv(c.x, c.z))
        smooth_by_angle(bw, 52)
        parts.append(bw)

    bg_objs = []
    for i, loop in enumerate(connected_loops(bg_mask, min_pixels=100, spacing=3.2, smooth=3, eps=0.85)):
        bg_objs.append(slab_from_loops(f'bg-{i}', [[tuple(q) for q in loop]], SLAB_BACK - 0.0015, SLAB_BACK + 0.0130, 0.0038, resolution=1, mapper=to_xz_back))
    if bg_objs:
        bg = join(bg_objs, 'back-emblem-gold')
        cull(bg, lambda n, c: n.y < -0.2)
        assign(bg, mats, lambda n, c: 'back_gold_face' if n.y > 0.35 else 'gold', lambda k, c: back_uv(c.x, c.z))
        smooth_by_angle(bg, 40)
        parts.append(bg)

    br_objs = []
    for i, loop in enumerate(connected_loops(rb_mask, min_pixels=90, spacing=2.8, smooth=2, eps=0.70)):
        br_objs.append(slab_from_loops(f'br-{i}', [[tuple(q) for q in loop]], SLAB_BACK - 0.0010, SLAB_BACK + 0.0052, 0.0020, resolution=1, mapper=to_xz_back))
    if br_objs:
        br = join(br_objs, 'back-emblem-banners')
        cull(br, lambda n, c: n.y < -0.2)
        assign(br, mats, lambda n, c: 'back' if n.y > 0.35 else 'gold', lambda k, c: back_uv(c.x, c.z))
        smooth_by_angle(br, 45)
        parts.append(br)

    # 裏の背面紋章 浮遊3Dヘイロー
    parts.append(build_floating_halo(mats['gold'], BACK_HALO, SLAB_BACK + 0.006, y_dir=1.0, tube_r=0.0085, depth_r=0.024, name='back-halo'))

    # 4) 独立多面体プリズム宝石（表7＋裏5＋中央巨大4芒星）＋裏上部ルビー4芒星＋台座＋ファセット箔
    bezels, foils, prism_gems = [], [], []
    # 表：上部4芒星
    st, fl, bz = build_star_gem_with_bezel(mats['prism_gem'], mats['gold'], mats['foil'], FRONT_TOP_STAR, FRAME_TOP - 0.0015, y_dir=-1.0, peak_h=0.025, with_bezel=True, name='front-top-star')
    prism_gems.append(st); foils.append(fl); bezels.append(bz)
    for gname, cpx, grx, gry, brx, bry, ch in FRONT_GEMS:
        bz, fl = build_diamond_bezel_and_foil(mats['gold'], mats['foil'], cpx, brx, bry, grx, gry, FRAME_TOP - 0.0015, y_dir=-1.0, rim_h=0.0098, name=f'bz-{gname}')
        bezels.append(bz); foils.append(fl)
        prism_gems.append(build_diamond_polyhedron(mats['prism_gem'], cpx, grx, gry, FRAME_TOP - 0.0015, y_dir=-1.0, crown_h=ch, pavilion_d=ch * 1.1, name=f'gem-{gname}'))

    # 裏：上部ルビー4芒星（独立 ruby_gem）
    rst, rfl, rbz = build_star_gem_with_bezel(mats['ruby_gem'], mats['gold'], mats['foil'], BACK_TOP_STAR, BACK_FRAME_Y, y_dir=1.0, peak_h=0.023, with_bezel=True, name='back-top-ruby-star')
    parts.append(rst); foils.append(rfl); bezels.append(rbz)

    # 裏：中央巨大4芒星プリズムダイヤ
    cst, cfl, _ = build_star_gem_with_bezel(mats['prism_gem'], mats['gold'], mats['foil'], BACK_CENTER_STAR, SLAB_BACK + 0.0035, y_dir=1.0, peak_h=0.028, with_bezel=False, name='back-center-star')
    prism_gems.append(cst); foils.append(cfl)

    # 裏：その他5個のプリズム宝石
    for gname, cpx, grx, gry, brx, bry, ch in BACK_GEMS:
        by = SLAB_BACK + 0.0080 if gname.startswith('b-crest') else BACK_FRAME_Y
        bz, fl = build_diamond_bezel_and_foil(mats['gold'], mats['foil'], cpx, brx, bry, grx, gry, by, y_dir=1.0, rim_h=0.0095, name=f'bz-{gname}')
        bezels.append(bz); foils.append(fl)
        prism_gems.append(build_diamond_polyhedron(mats['prism_gem'], cpx, grx, gry, by, y_dir=1.0, crown_h=ch, pavilion_d=ch * 1.1, name=f'gem-{gname}'))

    bz_all = join(bezels, 'gem-bezels')
    bz_all.data.materials.append(mats['gold'])
    smooth_by_angle(bz_all, 28)
    parts.append(bz_all)

    fl_all = join(foils, 'gem-foils')
    fl_all.data.materials.append(mats['foil'])
    for p in fl_all.data.polygons:
        p.use_smooth = False
    parts.append(fl_all)

    gm_all = join(prism_gems, 'prism-gems')
    gm_all.data.materials.append(mats['prism_gem'])
    for p in gm_all.data.polygons:
        p.use_smooth = False
    parts.append(gm_all)

    root = bpy.data.objects.new('card-skin-champion', None)
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
    print('champion card parts', len(parts), tris, 'tris')
