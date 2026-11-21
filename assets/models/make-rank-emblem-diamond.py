"""ダイヤモンドランク紋章（単体3Dモデル）を Blender で作り、rank-emblem-diamond.glb に書き出す。

使い方（リポジトリのルートで）：
  blender --background --python assets/models/make-rank-emblem-diamond.py

元画像：
  assets/ranks/rank-diamond.png（256×256）

座標系：
  幅 256px = 1.0、高さ 256px = 1.0、原点は中心。表が手前(-Y)、裏が奥(+Y)。glTF 書き出しの Y-up で +Z が表。

マテリアル名（統合担当向け）：
  emblem_face   … 紋章の地（中央の深藍メダリオン盤・3本のリボン）。UV は rank-diamond.png の 0〜1
  crystal_face  … 結晶羽・外輪の表（元絵を活かしつつ硬質な結晶クリアコート）
  diamond_metal … 純白銀メタリック（側面・裏面・宝石台座）
  foil          … 宝石・中央4芒星ダイヤ奥のファセット反射箔
  diamond_gem   … 上下2個＋浮遊4個の多面体ダイヤモンド＋中央4芒星ダイヤ（面ごと法線分離・IOR 2.42）
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

EMBLEM_PNG = REPO / 'assets/ranks/rank-diamond.png'
OUT = REPO / 'assets/models/rank-emblem-diamond.glb'
PREVIEW_TEXTURES = globals().get('PREVIEW_TEXTURES', False)

PX = 256.0
IMG_H = 256
BACK_Y = 0.024
BASE_FRONT = -0.010
WING_FRONT = -0.036

# 実測座標（256×256 ピクセル）：(名前, (cx, cy), grx, gry, brx, bry, crown_h)
GEMS = [
    ('e-top', (127.5, 37.0), 11.5, 16.0, 21.0, 27.5, 0.034),
    ('e-bot', (127.5, 177.5), 11.5, 16.0, 21.0, 27.5, 0.034),
    ('e-fl-tl', (71.5, 57.5), 6.5, 12.5, 0.0, 0.0, 0.022),
    ('e-fl-tr', (184.0, 57.0), 6.5, 12.5, 0.0, 0.0, 0.022),
    ('e-fl-bl', (68.5, 194.5), 5.0, 10.0, 0.0, 0.0, 0.020),
    ('e-fl-br', (187.0, 195.5), 5.0, 10.0, 0.0, 0.0, 0.020),
]
STAR = (127.5, 108.5, 47.0, 44.0, 13.0)


def to_xz(px, py):
    return px / PX - 0.5, (IMG_H / 2 - py) / PX


def uv_of(x, z):
    return x + 0.5, z + 0.5


def fresh_scene():
    if bpy.app.background or not bpy.context.window:
        scene = bpy.context.scene
    else:
        scene = bpy.data.scenes.get('RankEmblemDiamond') or bpy.data.scenes.new('RankEmblemDiamond')
    old = bpy.data.objects.get('rank-emblem-diamond')
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
        'emblem_face': material('emblem_face', (0.14, 0.22, 0.52), roughness=0.46),
        'crystal_face': material('crystal_face', (0.58, 0.78, 1.00), metallic=0.14, roughness=0.09, **{'Coat Weight': 1.0, 'Coat Roughness': 0.02}),
        'diamond_metal': material('diamond_metal', (0.76, 0.81, 0.95), metallic=1.0, roughness=0.15, **{'Coat Weight': 0.40}),
        'foil': material('foil', (0.82, 0.93, 1.00), metallic=1.0, roughness=0.08),
        'diamond_gem': material('diamond_gem', (0.45, 0.84, 1.00), roughness=0.015, **{'Transmission Weight': 0.94, 'IOR': 2.42, 'Coat Weight': 1.0, 'Coat Roughness': 0.015}),
    }
    if PREVIEW_TEXTURES:
        for key in ('emblem_face', 'crystal_face'):
            mat = mats[key]
            nodes = mat.node_tree.nodes
            tex = nodes.new('ShaderNodeTexImage')
            tex.image = bpy.data.images.load(str(EMBLEM_PNG), check_existing=True)
            bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
            mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    return mats


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


def trace(mask, start, spacing=1.6, smooth=2, eps=0.40):
    h, w = mask.shape
    dirs = [(-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1)]
    pts, cur, back = [start], start, 6
    for _ in range(100000):
        for k8 in range(8):
            d = (back + 1 + k8) % 8
            ny, nx = cur[0] + dirs[d][0], cur[1] + dirs[d][1]
            if 0 <= ny < h and 0 <= nx < w and mask[ny, nx]:
                back, cur = (d + 4) % 8, (ny, nx)
                break
        if cur == start:
            break
        pts.append(cur)
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


def connected_loops(mask, min_pixels=40, spacing=1.8, smooth=2, eps=0.45):
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
        if len(loop) >= 6:
            loops.append(loop)
    return loops


def to_mesh(obj):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph))
    mesh.transform(obj.matrix_world)
    name = obj.name
    bpy.data.objects.remove(obj, do_unlink=True)
    new = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(new)
    return new


def slab_from_loops(name, loops, y0, y1, bevel, resolution=1):
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
            x, z = to_xz(px, py)
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


def assign(obj, mats, rule):
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
            loop[uv].uv = uv_of(c.x, c.z)
    mesh.materials.clear()
    for n in used:
        mesh.materials.append(mats[n])
    bm.to_mesh(mesh)
    bm.free()


def smooth_by_angle(obj, angle=32):
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


def build_emblem_gem(mats, gname, center_px, grx_px, gry_px, brx_px, bry_px, crown_h):
    cx, cz = to_xz(*center_px)
    rgx, rgy = grx_px / PX, gry_px / PX
    base_y = WING_FRONT - 0.002 if brx_px > 0 else BASE_FRONT - 0.008

    bezel = None
    if brx_px > 0:
        rox, roy = brx_px / PX, bry_px / PX
        rix, riy = rgx + 1.5 / PX, rgy + 1.5 / PX
        def d_ring(rx, ry, y):
            return [Vector((cx, y, cz + ry)), Vector((cx - rx, y, cz)), Vector((cx, y, cz - ry)), Vector((cx + rx, y, cz))]
        rim_h = 0.018
        profile = [
            (rox, roy, -0.003), (rox, roy, rim_h * 0.4), (rox * 0.85, roy * 0.85, rim_h * 0.9),
            (rox * 0.78, roy * 0.78, rim_h), (rix + 0.004, riy + 0.004, rim_h * 0.65),
            (rix, riy, rim_h * 0.45), (rgx + 0.002, rgy + 0.002, rim_h * 0.16),
        ]
        bezel = loft(f'bz-{gname}', [d_ring(rx, ry, base_y - h) for rx, ry, h in profile], closed=True)
        bezel.data.materials.append(mats['diamond_metal'])
        smooth_by_angle(bezel, 26)

    c45 = 0.5 ** 0.5
    corners = [90 + 90 * i for i in range(4)]
    mids = [a + 45 for a in corners]
    foil = None
    if brx_px > 0:
        def oct_ring(scale, y):
            ring = []
            for a, m in zip(corners, mids):
                ra, rm = math.radians(a), math.radians(m)
                ring.append(Vector((cx + rgx * scale * math.cos(ra), y, cz + rgy * scale * math.sin(ra))))
                ring.append(Vector((cx + rgx * scale * c45 * math.cos(rm), y, cz + rgy * scale * c45 * math.sin(rm))))
            return ring
        foil = loft(
            f'fl-{gname}',
            [oct_ring(1.01, base_y - 0.003), oct_ring(0.70, base_y + 0.012), oct_ring(0.35, base_y + 0.022)],
            closed=True, cap_center=Vector((cx, base_y + 0.028, cz)),
        )
        foil.data.materials.append(mats['foil'])
        for p in foil.data.polygons:
            p.use_smooth = False

    # Polyhedral brilliant-cut diamond (flat shaded per facet)
    rtx, rty = rgx * 0.38, rgy * 0.38
    g_low, g_high = base_y - 0.003, base_y - 0.007
    t_y, s_y, c_y = g_high - crown_h, g_high - crown_h * 0.54, g_low + crown_h * 1.0
    def at(deg, rx, ry, y):
        a = math.radians(deg)
        return Vector((cx + rx * math.cos(a), y, cz + ry * math.sin(a)))
    bm = bmesh.new()
    nv, nf = bm.verts.new, bm.faces.new
    table = [nv(at(a, rtx, rty, t_y)) for a in corners]
    stars = [nv(at(m, (rtx + rgx) * 0.5 * c45, (rty + rgy) * 0.5 * c45, s_y)) for m in mids]
    gt = [nv(at(v, rgx * (1 if k % 2 == 0 else c45), rgy * (1 if k % 2 == 0 else c45), g_high)) for k, v in enumerate([x for pair in zip(corners, mids) for x in pair])]
    gb = [nv(at(v, rgx * (1 if k % 2 == 0 else c45), rgy * (1 if k % 2 == 0 else c45), g_low)) for k, v in enumerate([x for pair in zip(corners, mids) for x in pair])]
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
    pm = [nv(at(m, rgx * c45 * 0.54, rgy * c45 * 0.54, g_low + crown_h * 0.55)) for m in mids]
    culet = nv(Vector((cx, c_y, cz)))
    for i in range(4):
        nf((gb[2 * i], gb[2 * i + 1], pm[i]))
        nf((gb[2 * i + 1], gb[(2 * i + 2) % 8], pm[i]))
        nf((gb[2 * i], pm[i], culet, pm[i - 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    gmesh = bpy.data.meshes.new(f'gem-{gname}')
    bm.to_mesh(gmesh)
    bm.free()
    gem = bpy.data.objects.new(f'gem-{gname}', gmesh)
    bpy.context.scene.collection.objects.link(gem)
    gem.data.materials.append(mats['diamond_gem'])
    for p in gem.data.polygons:
        p.use_smooth = False
    return bezel, foil, gem


def build_center_star_diamond(mats):
    cx, cz = to_xz(STAR[0], STAR[1])
    orx, ory, ir = STAR[2] / PX, STAR[3] / PX, STAR[4] / PX

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
    y_base, y_girdle, y_mid, y_peak, y_back = BASE_FRONT - 0.004, BASE_FRONT - 0.012, BASE_FRONT - 0.044, BASE_FRONT - 0.064, BASE_FRONT + 0.014
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
    mesh = bpy.data.meshes.new('emblem-star-diamond')
    bm.to_mesh(mesh)
    bm.free()
    star = bpy.data.objects.new('emblem-star-diamond', mesh)
    bpy.context.scene.collection.objects.link(star)
    star.data.materials.append(mats['diamond_gem'])
    for p in star.data.polygons:
        p.use_smooth = False

    bm2 = bmesh.new()
    vf = [bm2.verts.new(Vector((x * 0.94 + cx * 0.06, y_base + 0.002, z * 0.94 + cz * 0.06))) for x, z in outer_pts]
    vc = bm2.verts.new(Vector((cx, y_back - 0.002, cz)))
    for i in range(8):
        bm2.faces.new((vf[i], vf[(i + 1) % 8], vc))
    bmesh.ops.recalc_face_normals(bm2, faces=bm2.faces)
    fmesh = bpy.data.meshes.new('emblem-star-foil')
    bm2.to_mesh(fmesh)
    bm2.free()
    foil = bpy.data.objects.new('emblem-star-foil', fmesh)
    bpy.context.scene.collection.objects.link(foil)
    foil.data.materials.append(mats['foil'])
    for p in foil.data.polygons:
        p.use_smooth = False
    return star, foil


def build():
    scene = fresh_scene()
    mats = make_materials()
    rgba = load_rgba(EMBLEM_PNG)
    r, g, b, a = rgba[..., 0], rgba[..., 1], rgba[..., 2], rgba[..., 3]
    h, w = a.shape
    yy, xx = np.mgrid[0:h, 0:w]
    parts = []

    # 1) 本体シルエットベース板（4個の浮遊ダイヤは独立メッシュにするためベースから除外）
    sil = blur5(a) > 0.45
    for _, (gx, gy), grx, gry, brx, _, _ in GEMS:
        if brx == 0:
            sil &= (np.abs(xx - gx) / (grx + 4.0) + np.abs(yy - gy) / (gry + 4.0)) > 1.0
    # 最大連結成分（紋章本体）をトレース
    main_loops = connected_loops(sil, min_pixels=2000, spacing=1.8, smooth=2, eps=0.45)
    backing = slab_from_loops('emblem-backing', main_loops, BASE_FRONT, BACK_Y, 0.008, resolution=1)
    assign(backing, mats, lambda n, c: 'emblem_face' if n.y < -0.55 else 'diamond_metal')
    smooth_by_angle(backing, 38)
    parts.append(backing)

    # 2) 結晶羽・外輪
    excl = np.zeros((h, w), dtype=bool)
    for _, (gx, gy), grx, gry, brx, bry, _ in GEMS:
        rx = (brx + 1.0) if brx > 0 else (grx + 4.0)
        ry = (bry + 1.0) if bry > 0 else (gry + 4.0)
        excl |= (np.abs(xx - gx) / rx + np.abs(yy - gy) / ry) <= 1.0
    excl |= (np.abs(xx - STAR[0]) / (STAR[2] * 0.78) + np.abs(yy - STAR[1]) / (STAR[3] * 0.78)) <= 1.0
    ribbon_zone = (yy > 168) & (xx > 76) & (xx < 180)
    lum = (r + g + b) / 3.0
    is_wing = sil & (a > 0.6) & (b > 0.70) & (lum > 0.54) & (~excl) & (~ribbon_zone)
    wm = ~shift_or(~is_wing)
    wm = shift_or(wm)
    wing_objs = []
    for i, loop in enumerate(connected_loops(wm, min_pixels=50, spacing=1.8, smooth=2, eps=0.45)):
        wing_objs.append(slab_from_loops(f'w-{i}', [[tuple(q) for q in loop]], WING_FRONT, BASE_FRONT + 0.004, 0.008, resolution=1))
    if wing_objs:
        wings = join(wing_objs, 'emblem-wings')
        cull(wings, lambda n, c: n.y > 0.25)
        assign(wings, mats, lambda n, c: 'crystal_face' if n.y < -0.35 else 'diamond_metal')
        smooth_by_angle(wings, 28)
        parts.append(wings)

    # 3) 独立多面体ダイヤモンド（上下2＋浮遊4＋中央4芒星ダイヤ）
    bezels, foils, gems = [], [], []
    for gname, center_px, grx, gry, brx, bry, ch in GEMS:
        bz, fl, gm = build_emblem_gem(mats, gname, center_px, grx, gry, brx, bry, ch)
        if bz:
            bezels.append(bz)
        if fl:
            foils.append(fl)
        gems.append(gm)
    star, star_foil = build_center_star_diamond(mats)
    gems.append(star); foils.append(star_foil)

    bz_all = join(bezels, 'emblem-bezels')
    bz_all.data.materials.append(mats['diamond_metal'])
    smooth_by_angle(bz_all, 28)
    parts.append(bz_all)

    fl_all = join(foils, 'emblem-foils')
    fl_all.data.materials.append(mats['foil'])
    for p in fl_all.data.polygons:
        p.use_smooth = False
    parts.append(fl_all)

    gm_all = join(gems, 'diamond-gems')
    gm_all.data.materials.append(mats['diamond_gem'])
    for p in gm_all.data.polygons:
        p.use_smooth = False
    parts.append(gm_all)

    root = bpy.data.objects.new('rank-emblem-diamond', None)
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
    print('diamond emblem parts', len(parts), tris, 'tris')
