"""カード3Dモデル（card-*.glb）の共通ビルダ。

座標系：
  枠の絵（512×768）の幅を 1 とする（1 = 512px）。
  Blender では X が右・Z が上・手前が -Y。
  glTF 書き出しの Y-up 変換で、three.js 側は X 右・Y 上・手前 +Z になる。
"""
import math
from pathlib import Path

import bpy
import bmesh
import numpy as np
from mathutils import Vector

PX = 512.0
IMG_H = 768


def to_xz(px, py):
    """枠の絵のピクセル → Blender の (X, Z)"""
    return px / PX - 0.5, (IMG_H / 2 - py) / PX


def face_uv(x, z):
    """表の絵の UV（枠の絵の 0〜1。glTF に書くと上が 0 になる）"""
    return x + 0.5, z * PX / IMG_H + 0.5


# ---------------------------------------------------------------- 場面・マテリアル
def fresh_scene(scene_name, root_name):
    if bpy.app.background or not bpy.context.window:
        scene = bpy.context.scene
    else:
        scene = bpy.data.scenes.get(scene_name) or bpy.data.scenes.new(scene_name)
    old = bpy.data.objects.get(root_name)
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


def attach_preview_textures(mats, face_keys, preview_face, back_path):
    """確認用：Blender ビューポートでのみ表・裏の絵を貼る（書き出しは画像なし）"""
    if not preview_face:
        return
    targets = [(k, preview_face, True) for k in face_keys if k in mats]
    if back_path and 'back' in mats:
        targets.append(('back', back_path, False))
    for key, path, link_alpha in targets:
        mat = mats[key]
        nodes = mat.node_tree.nodes
        tex = nodes.new('ShaderNodeTexImage')
        tex.image = bpy.data.images.load(str(path), check_existing=True)
        bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
        mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
        if link_alpha:
            mat.node_tree.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])


# ---------------------------------------------------------------- 画像・輪郭トレース
def load_rgba(path):
    """PNG を RGBA（0〜1、上が 0 の行）の numpy 配列で読む"""
    image = bpy.data.images.load(str(path), check_existing=True)
    w, h = image.size
    return np.array(image.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1].copy()


def blur5(a):
    k = np.array([1, 4, 6, 4, 1], dtype=np.float32) / 16
    a = np.apply_along_axis(lambda r: np.convolve(r, k, 'same'), 1, a)
    return np.apply_along_axis(lambda c: np.convolve(c, k, 'same'), 0, a)


def simplify(p, eps):
    """Ramer-Douglas-Peucker で直線上の中間点を間引く（閉じた輪）"""
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


def trace(mask, start, spacing=2.2, smooth=5, eps=0.5):
    """mask の塊の外周を start からたどり、なめらかにして間引く"""
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
        raise RuntimeError('輪郭が閉じませんでした（絵の形を確かめてください）')
    p = np.array([(x + 0.5, y + 0.5) for y, x in pts], dtype=np.float64)
    for _ in range(smooth):
        p = (np.roll(p, 1, 0) + 2 * p + np.roll(p, -1, 0)) / 4
    seg = np.hypot(*(np.roll(p, -1, 0) - p).T)
    total = np.concatenate([[0], np.cumsum(seg)])
    closed = np.vstack([p, p[:1]])
    at = np.arange(0, total[-1], spacing)
    return simplify(np.stack([np.interp(at, total, closed[:, 0]), np.interp(at, total, closed[:, 1])], 1), eps)


def frame_outline(rgba, spacing=2.4, eps=0.55):
    """枠の絵の不透明領域の外周"""
    mask = blur5(rgba[:, :, 3]) > 0.5
    ys, xs = np.nonzero(mask)
    return trace(mask, (int(ys.min()), int(xs[ys == ys.min()].min())), spacing=spacing, eps=eps)


def shift_or(m):
    """3×3 の膨張"""
    out = m.copy()
    out[1:] |= m[:-1]
    out[:-1] |= m[1:]
    out[:, 1:] |= out[:, :-1].copy()
    out[:, :-1] |= out[:, 1:].copy()
    return out


def connected_loops(mask, min_pixels=60, spacing=2.6, smooth=3, eps=0.70, min_pts=6):
    """2値マスクの連結成分ごとの外周を返す"""
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


# ---------------------------------------------------------------- 2D 図形
def rounded_rect(x0, y0, x1, y1, r, steps=5):
    """角の丸い四角（ピクセル・時計回り）"""
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
    """絵の窓とメダルの穴を1つの穴に合成する"""
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


def rect_xz(rect, steps=5, spacing=400.0, fine_near=None, fine_radius=0.0, fine_spacing=10.0):
    """角丸四角（ピクセル）→ XZ の点の列。fine_near の近くだけ細かく分割できる（直線部の頂点節約）"""
    corners = rounded_rect(*rect, steps=steps)
    pts = []
    for (ax, ay), (bx, by) in zip(corners, corners[1:] + corners[:1]):
        seg_len = math.hypot(bx - ax, by - ay)
        step = spacing
        if fine_near is not None:
            mx, my = (ax + bx) * 0.5, (ay + by) * 0.5
            # 端点または中点が fine_near に近ければ細かく分割
            if (min(math.hypot(ax - fine_near[0], ay - fine_near[1]),
                    math.hypot(bx - fine_near[0], by - fine_near[1]),
                    math.hypot(mx - fine_near[0], my - fine_near[1])) < fine_radius + seg_len * 0.5):
                step = fine_spacing
        n = max(1, int(seg_len / step))
        pts.extend((ax + (bx - ax) * i / n, ay + (by - ay) * i / n) for i in range(n))
    return [Vector(to_xz(px, py)) for px, py in pts]


# ---------------------------------------------------------------- メッシュ操作
def slab_from_loops(name, loops, front_y, back_y, bevel, resolution=1):
    """2D の輪を front_y〜back_y の厚みに押し出し、縁を面取りする"""
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '2D'
    curve.fill_mode = 'BOTH'
    thickness = abs(back_y - front_y)
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
    """面ごとにマテリアルと UV を決める。実際に使われたマテリアルだけをメッシュに付ける（無駄なスロット削減）"""
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
            loop[uv].uv = (uv_rule or (lambda k, c: face_uv(c.x, c.z)))(kind, co)
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


# ---------------------------------------------------------------- ロフト・縁取り金具
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


def diamond_ring(cx, cz, rx, rz, y):
    """ひし形（上・左・下・右が角）の4点。rx=横半径, rz=縦半径"""
    return [Vector((cx, y, cz + rz)), Vector((cx - rx, y, cz)), Vector((cx, y, cz - rz)), Vector((cx + rx, y, cz))]


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


def metal_rim(name, points, mat, width, height, base_y):
    """断面がかまぼこ形の金属の縁（5点断面で軽量化しつつ滑らかに）"""
    half = width / 2
    profile = [
        (-half, -0.0010),
        (-half * 0.88, height * 0.65),
        (0, height),
        (half * 0.88, height * 0.65),
        (half, -0.0010),
    ]
    rings = profile_ring(points, profile, base_y)
    obj = loft(name, rings, closed=True)
    obj.data.materials.append(mat)
    smooth_by_angle(obj, 55)
    return obj


# ---------------------------------------------------------------- ひし形ファセット宝石・台座・爪
def build_diamond_gem(mat, center_px, girdle_rx_px, girdle_ry_px, table_ratio, frame_top,
                      crown_height=0.0205, pavilion_depth=0.0235, name='gem'):
    """ひし形（縦横比自在）のブリリアント系カット宝石。
    テーブル＋クラウン16面（星4・凧4・上ガードル8）＋ガードル8面＋パビリオン12面。
    すべてフラットシェードにして、傾けたときに面ごとに光が切り替わるようにする。
    """
    cx, cz = to_xz(*center_px)
    rgx, rgy = girdle_rx_px / PX, girdle_ry_px / PX
    rtx, rty = rgx * table_ratio, rgy * table_ratio

    girdle_low = frame_top - 0.0022
    girdle_high = girdle_low - 0.0028
    table_y = girdle_high - crown_height
    star_y = girdle_high - crown_height * 0.56
    culet_y = girdle_low + pavilion_depth

    def at(angle_deg, rx, ry, y):
        a = math.radians(angle_deg)
        return Vector((cx + rx * math.cos(a), y, cz + ry * math.sin(a)))

    bm = bmesh.new()
    new_vert = bm.verts.new
    c45 = 0.5 ** 0.5
    corners = [90 + 90 * i for i in range(4)]
    mids = [a + 45 for a in corners]

    table = [new_vert(at(a, rtx, rty, table_y)) for a in corners]
    # 星の点：テーブル辺とガードル辺の中間よりやや外側にして、星面と凧面の角度差をくっきりさせる
    sx = rtx * c45 + (rgx * c45 - rtx * c45) * 0.52
    sy = rty * c45 + (rgy * c45 - rty * c45) * 0.52
    stars = [new_vert(at(m, sx, sy, star_y)) for m in mids]

    def girdle_ring(y):
        ring = []
        for a, m in zip(corners, mids):
            ring.append(new_vert(at(a, rgx, rgy, y)))
            ring.append(new_vert(at(m, rgx * c45, rgy * c45, y)))
        return ring

    girdle_top, girdle_bottom = girdle_ring(girdle_high), girdle_ring(girdle_low)
    new_face = bm.faces.new
    new_face(table)
    for i in range(4):
        j = (i + 1) % 4
        new_face((table[i], table[j], stars[i]))
        new_face((table[i], stars[i - 1], girdle_top[2 * i], stars[i]))
        new_face((stars[i], girdle_top[2 * i], girdle_top[2 * i + 1]))
        new_face((stars[i], girdle_top[2 * i + 1], girdle_top[(2 * i + 2) % 8]))
    for i in range(8):
        j = (i + 1) % 8
        new_face((girdle_top[i], girdle_bottom[i], girdle_bottom[j], girdle_top[j]))

    pavilion_mid = [new_vert(at(m, rgx * c45 * 0.54, rgy * c45 * 0.54, girdle_low + pavilion_depth * 0.56)) for m in mids]
    culet = new_vert(Vector((cx, culet_y, cz)))
    for i in range(4):
        new_face((girdle_bottom[2 * i], girdle_bottom[2 * i + 1], pavilion_mid[i]))
        new_face((girdle_bottom[2 * i + 1], girdle_bottom[(2 * i + 2) % 8], pavilion_mid[i]))
        new_face((girdle_bottom[2 * i], pavilion_mid[i], culet, pavilion_mid[i - 1]))

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


def build_diamond_setting(metal_mat, foil_mat, center_px, out_rx_px, out_ry_px, in_rx_px, in_ry_px,
                          girdle_rx_px, girdle_ry_px, frame_top, rim_height=0.0092, name='setting'):
    """ひし形台座＋奥のファセット反射箔＋4本の爪"""
    cx, cz = to_xz(*center_px)
    rox, roy = out_rx_px / PX, out_ry_px / PX
    rix, riy = in_rx_px / PX, in_ry_px / PX
    rgx, rgy = girdle_rx_px / PX, girdle_ry_px / PX
    # 外壁〜ベゼル稜線〜内斜面〜受け（金属部分）
    metal_profile = [
        (1.00, 1.00, -0.0015),
        (1.00, 1.00, rim_height * 0.38),
        (0.88, 0.88, rim_height * 0.86),
        (0.79, 0.79, rim_height),
        (rix / rox + 0.04, riy / roy + 0.04, rim_height * 0.72),
        (rix / rox, riy / roy, rim_height * 0.56),
        (rix / rox - 0.02, riy / roy - 0.02, rim_height * 0.25),
        ((rgx + 0.0012) / rox, (rgy + 0.0012) / roy, rim_height * 0.16),
    ]
    rings = [diamond_ring(cx, cz, rox * sx, roy * sy, frame_top - h) for sx, sy, h in metal_profile]
    bezel = loft(name, rings, closed=True)
    bezel.data.materials.append(metal_mat)
    smooth_by_angle(bezel, 28)

    # 奥の反射箔カップ：8角のファセット面（フラットシェード）にして、透過越しに面ごとの反射がきらめくようにする
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
        oct_ring(1.01, frame_top - rim_height * 0.16),
        oct_ring(0.72, frame_top + 0.0075),
        oct_ring(0.36, frame_top + 0.0155),
    ]
    foil = loft(f'{name}-foil', foil_rings, closed=True, cap_center=Vector((cx, frame_top + 0.0195, cz)))
    foil.data.materials.append(foil_mat)
    for poly in foil.data.polygons:
        poly.use_smooth = False

    # 4本の爪：宝石の4つの角を少ししっかり抱き込む形
    prongs = []
    for k, (dx, dz, ri, rg) in enumerate(((0, 1, riy, rgy), (-1, 0, rix, rgx), (0, -1, riy, rgy), (1, 0, rix, rgx))):
        d = Vector((dx, 0, dz))
        side = Vector((-dz, 0, dx))
        center = Vector((cx, 0, cz))
        root = center + d * (ri + 0.0012)
        tip = center + d * (rg - 0.0060)
        w_root, w_tip = 0.0074, 0.0044
        y_root, y_tip = frame_top - rim_height * 0.65, frame_top - rim_height * 0.96
        p_rings = []
        for t, w, y in (
            (0.0, w_root, y_root + 0.0042),
            (0.0, w_root, y_root),
            (0.55, (w_root + w_tip) / 2, y_tip - 0.0016),
            (1.0, w_tip, y_tip),
            (1.0, w_tip * 0.6, y_tip + 0.0032),
        ):
            p = root.lerp(tip, t)
            p_rings.append([
                p + side * (w / 2) + Vector((0, y + 0.0012, 0)),
                p + side * (w / 2) + Vector((0, y - 0.0004, 0)),
                p + Vector((0, y - 0.0018, 0)),
                p - side * (w / 2) + Vector((0, y - 0.0004, 0)),
                p - side * (w / 2) + Vector((0, y + 0.0012, 0)),
            ])
        prong = loft(f'prong-{k}', p_rings, closed=True, cap_center=tip + Vector((0, y_tip + 0.0020, 0)))
        prong.data.materials.append(metal_mat)
        smooth_by_angle(prong, 40)
        prongs.append(prong)
    return [bezel, foil, *prongs]


def export_glb(root, out_path):
    for obj in bpy.context.scene.objects:
        obj.select_set(obj == root or obj.parent == root)
    bpy.ops.export_scene.gltf(
        filepath=str(out_path), export_format='GLB', use_selection=True, use_active_scene=True,
        export_yup=True, export_apply=True, export_image_format='NONE', export_texcoords=True,
        export_normals=True, export_materials='EXPORT', export_cameras=False, export_lights=False,
    )
