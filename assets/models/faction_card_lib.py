"""4陣営専用3Dカードフレームの共通ジオメトリ・マテリアルライブラリ。

assets/frames/factions.json の数値仕様（64×96×3.52mm, 角丸3mm, ベベル0.6mm）を
CardGL.js と 1:1 対応する Blender 単位系（1 unit = 512px = 68.2667mm, 1mm = 7.5/512）で厳密に構築する。

座標系（Blender）:
  X = 右 (+x_mm * MM)
  Z = 上 (+y_mm * MM)  ※ glTF export_yup=True で Three.js +Y になる
  Y = 奥 (-z_mm * MM)  ※ 表面は -Y（Three.js +Z）、裏面は +Y（Three.js -Z）
"""
import json
import math
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector, Matrix

REPO = Path(__file__).resolve().parents[2]
SPEC_PATH = REPO / 'assets/frames/factions.json'
SPEC = json.loads(SPEC_PATH.read_text(encoding='utf-8'))

PX = 512.0
IMG_H = 768.0
PX_PER_MM = float(SPEC['canvas']['pixelsPerMm'])   # 7.5
MM = PX_PER_MM / PX                                # 0.0146484375 Blender units / mm

GEOM = SPEC['geometry']
CARD_W_MM = float(GEOM['width'])                   # 64.0
CARD_H_MM = float(GEOM['height'])                  # 96.0
BODY_DEPTH_MM = float(GEOM['bodyDepth'])           # 3.52
CORNER_R_MM = float(GEOM['cornerRadius'])          # 3.0
BEVEL_MM = float(GEOM['bevel'])                    # 0.6
FRONT_Z_MM = float(GEOM['frontZ'])                 # 1.76
BACK_Z_MM = float(GEOM['backZ'])                   # -1.76

CLAMP_CENTERS_MM = [tuple(c) for c in GEOM['clamp']['centersXY']]
CLAMP_Z_MIN_MM, CLAMP_Z_MAX_MM = float(GEOM['clamp']['zRange'][0]), float(GEOM['clamp']['zRange'][1])

INSETS = GEOM['frontInsets']
ILLU_INSET = INSETS['illustration']
NAME_INSET = INSETS['namePanel']
DESC_INSET = INSETS['descriptionPanel']
MP_MEDAL = INSETS['mpMedallion']

# 各矩形をローカル mm 座標（中心原点、+X 右、+Y 上）に変換
def inset_rect_mm(d):
    x0 = -CARD_W_MM / 2.0 + float(d['left'])
    x1 = x0 + float(d['width'])
    y1 = CARD_H_MM / 2.0 - float(d['top'])
    y0 = y1 - float(d['height'])
    return (x0, y0, x1, y1)

ILLU_RECT_MM = inset_rect_mm(ILLU_INSET)           # (-21.0, -9.5, 21.0, 32.5)
NAME_RECT_MM = inset_rect_mm(NAME_INSET)           # (-21.333, -24.0, 21.6, -16.267)
DESC_RECT_MM = inset_rect_mm(DESC_INSET)           # (-21.333, -36.667, 21.6, -29.467)
MP_CENTER_MM = (
    (float(MP_MEDAL['centerPx'][0]) - PX / 2.0) / PX_PER_MM,
    (IMG_H / 2.0 - float(MP_MEDAL['centerPx'][1])) / PX_PER_MM,
)
MP_RADIUS_MM = float(MP_MEDAL['radiusPx']) / PX_PER_MM


def pt(x_mm, y_mm, z_mm):
    """仕様座標 (x_mm右, y_mm上, z_mm手前) → Blender Vector (X右, Y奥=-z, Z上=y)"""
    return Vector((x_mm * MM, -z_mm * MM, y_mm * MM))


def px_to_mm(px, py):
    """512×768 ピクセル座標（左上原点）→ ローカル mm 座標（中心原点・上+Y）"""
    return (px - PX / 2.0) / PX_PER_MM, (IMG_H / 2.0 - py) / PX_PER_MM


def front_uv_from_xz(x, z):
    """Blender (X, Z) → 表キャンバス UV（Blender の UV は上が1。glTF に書き出すと上が0になる。card_model_lib.face_uv と同じ）"""
    return x + 0.5, 0.5 + z * (PX / IMG_H)


def back_uv_from_xz(x, z):
    """Blender (X, Z) → 裏キャンバス UV（裏から見て右が-X。上下は front_uv_from_xz と同じ決まり）"""
    return 0.5 - x, 0.5 + z * (PX / IMG_H)


# ---------------------------------------------------------------- シーン・マテリアル
def fresh_scene(scene_name, root_name):
    if bpy.app.background or not bpy.context.window:
        scene = bpy.context.scene
    else:
        scene = bpy.data.scenes.get(scene_name) or bpy.data.scenes.new(scene_name)
    for obj in list(scene.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    for mat in list(bpy.data.materials):
        if mat.users == 0:
            bpy.data.materials.remove(mat)
    root = bpy.data.objects.new(root_name, None)
    scene.collection.objects.link(root)
    return scene, root


def make_material(name, color, metallic=0.0, roughness=0.5, **extra):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*color, 1.0)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    for k, v in extra.items():
        if k in bsdf.inputs:
            bsdf.inputs[k].default_value = v
    return mat


def link_obj(name, mesh, mat=None, smooth_angle=35.0, flat=False):
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    if mat is not None:
        mesh.materials.append(mat)
    if flat:
        for p in mesh.polygons:
            p.use_smooth = False
    elif smooth_angle is not None:
        smooth_by_angle(obj, smooth_angle)
    return obj


def smooth_by_angle(obj, angle_deg=35.0):
    mesh = obj.data
    for poly in mesh.polygons:
        poly.use_smooth = True
    bm = bmesh.new()
    bm.from_mesh(mesh)
    rad = math.radians(angle_deg)
    for e in bm.edges:
        e.smooth = not (len(e.link_faces) == 2 and e.calc_face_angle(0) > rad)
    bm.to_mesh(mesh)
    bm.free()


def finish_and_export(root, parts, out_path):
    for p in parts:
        p.parent = root
    for obj in bpy.context.scene.objects:
        obj.select_set(obj == root or obj.parent == root)
    bpy.ops.export_scene.gltf(
        filepath=str(out_path),
        export_format='GLB',
        use_selection=True,
        use_active_scene=True,
        export_yup=True,
        export_apply=True,
        export_image_format='NONE',
        export_texcoords=True,
        export_normals=True,
        export_materials='EXPORT',
        export_cameras=False,
        export_lights=False,
    )


# ---------------------------------------------------------------- 2D 輪郭ヘルパー（mm 単位）
def rounded_rect_mm(x0, y0, x1, y1, r, steps=6):
    """反時計回り（XY平面）の角丸長方形 (mm)"""
    r = min(r, (x1 - x0) * 0.49, (y1 - y0) * 0.49)
    pts = []
    corners = [
        (x1 - r, y0 + r, -90, 0),
        (x1 - r, y1 - r, 0, 90),
        (x0 + r, y1 - r, 90, 180),
        (x0 + r, y0 + r, 180, 270),
    ]
    for cx, cy, a0, a1 in corners:
        for i in range(steps + 1):
            a = math.radians(a0 + (a1 - a0) * i / steps)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    # 近接重複除去
    out = []
    for p in pts:
        if not out or math.hypot(p[0] - out[-1][0], p[1] - out[-1][1]) > 1e-4:
            out.append(p)
    if len(out) > 1 and math.hypot(out[0][0] - out[-1][0], out[0][1] - out[-1][1]) < 1e-4:
        out.pop()
    return out


def resample_loop(loop, max_seg=2.5):
    out = []
    n = len(loop)
    for i in range(n):
        a = loop[i]
        b = loop[(i + 1) % n]
        d = math.hypot(b[0] - a[0], b[1] - a[1])
        k = max(1, int(math.ceil(d / max_seg)))
        for j in range(k):
            t = j / k
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return out


# ---------------------------------------------------------------- 汎用ロフト・押し出し・スウィープ
def loft_rings(name, rings, mat, closed=True, cap_start=None, cap_end=None, smooth_angle=40.0, flat=False):
    bm = bmesh.new()
    vrings = [[bm.verts.new(v) for v in ring] for ring in rings]
    n = len(rings[0])
    for a, b in zip(vrings, vrings[1:]):
        for i in range(n if closed else n - 1):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if cap_start is not None:
        c = bm.verts.new(cap_start)
        r0 = vrings[0]
        for i in range(n):
            bm.faces.new((r0[(i + 1) % n], r0[i], c))
    if cap_end is not None:
        c = bm.verts.new(cap_end)
        rl = vrings[-1]
        for i in range(n):
            bm.faces.new((rl[i], rl[(i + 1) % n], c))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    return link_obj(name, mesh, mat, smooth_angle=smooth_angle, flat=flat)


def extrude_beveled_slab_mm(name, loops_mm, z_back_mm, z_front_mm, bevel_mm, mat, resolution=2, uv_mode=None):
    """複数の2D閉ループ（外周＋穴）を z_back_mm〜z_front_mm に押し出し、ベベルを付ける"""
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '2D'
    curve.fill_mode = 'BOTH'
    thickness = abs(z_front_mm - z_back_mm) * MM
    bev = min(bevel_mm * MM, thickness * 0.45)
    curve.extrude = max(0.0, thickness / 2.0 - bev)
    curve.bevel_depth = bev
    curve.bevel_resolution = resolution
    curve.offset = -bev
    for loop in loops_mm:
        spline = curve.splines.new('POLY')
        spline.points.add(len(loop) - 1)
        for p, (xm, ym) in zip(spline.points, loop):
            p.co = (xm * MM, ym * MM, 0.0, 1.0)
        spline.use_cyclic_u = True
    obj = bpy.data.objects.new(name, curve)
    bpy.context.scene.collection.objects.link(obj)
    obj.rotation_euler = (math.radians(90), 0.0, 0.0)
    obj.location.y = -((z_front_mm + z_back_mm) / 2.0) * MM
    deps = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(deps))
    mesh.transform(obj.matrix_world)
    bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.curves.remove(curve)
    if uv_mode:
        bm = bmesh.new()
        bm.from_mesh(mesh)
        uv = bm.loops.layers.uv.verify()
        for f in bm.faces:
            for l in f.loops:
                c = l.vert.co
                l[uv].uv = front_uv_from_xz(c.x, c.z) if uv_mode == 'front' else back_uv_from_xz(c.x, c.z)
        bm.to_mesh(mesh)
        bm.free()
    return link_obj(name, mesh, mat, smooth_angle=38.0)


def sweep_path_mm(name, path_mm, profile_fn, mat, closed=False, cap_ends=True, smooth_angle=45.0, flat=False):
    """3D空間パス [(x,y,z), ...] (mm) に沿って断面 profile_fn(t) -> [(u,v), ...] をスウィープ。
    u は法線（パスに対してカード面内・外側向き）、v はカード厚み方向（+z_mm）。
    """
    pts = [pt(*p) for p in path_mm]
    m = len(pts)
    rings = []
    for i in range(m):
        t = i / max(1, m - 1)
        if closed:
            tangent = (pts[(i + 1) % m] - pts[(i - 1) % m]).normalized()
        elif i == 0:
            tangent = (pts[1] - pts[0]).normalized()
        elif i == m - 1:
            tangent = (pts[-1] - pts[-2]).normalized()
        else:
            tangent = (pts[i + 1] - pts[i - 1]).normalized()
        if tangent.length < 1e-6:
            tangent = Vector((1, 0, 0))
        # ローカル前方向（カード手前 = -Y）を基準に安定したフレームを作成
        ref = Vector((0, -1, 0))
        if abs(tangent.dot(ref)) > 0.92:
            ref = Vector((1, 0, 0))
        side = tangent.cross(ref).normalized()
        up = side.cross(tangent).normalized()
        prof = profile_fn(t)
        ring = [pts[i] + side * (u * MM) + up * (v * MM) for (u, v) in prof]
        rings.append(ring)
    cap_s = pts[0] if (cap_ends and not closed) else None
    cap_e = pts[-1] if (cap_ends and not closed) else None
    if closed:
        rings.append(rings[0])
    return loft_rings(name, rings, mat, closed=True, cap_start=cap_s, cap_end=cap_e, smooth_angle=smooth_angle, flat=flat)


def oval_profile(rx, ry, steps=10, roll=0.0):
    cr, sr = math.cos(roll), math.sin(roll)
    out = []
    for i in range(steps):
        a = 2.0 * math.pi * i / steps
        x, y = rx * math.cos(a), ry * math.sin(a)
        out.append((x * cr - y * sr, x * sr + y * cr))
    return out


def blade_profile(rx, ry, sharp=0.85):
    """鋭い稜線を持つ金属ブレード／角／翼の6角断面"""
    return [
        (rx, 0.0),
        (rx * 0.35, ry * sharp),
        (-rx * 0.35, ry),
        (-rx, 0.0),
        (-rx * 0.35, -ry),
        (rx * 0.35, -ry * sharp),
    ]


def chamfer_rect_profile(w, h, c=0.25):
    hw, hh = w / 2.0, h / 2.0
    cw, ch = hw * c, hh * c
    return [
        (hw, hh - ch), (hw - cw, hh), (-hw + cw, hh), (-hw, hh - ch),
        (-hw, -hh + ch), (-hw + cw, -hh), (hw - cw, -hh), (hw, -hh + ch),
    ]


def catmull_rom_3d(pts, samples_per_seg=8):
    """3D点列を滑らかに補間（端点重複あり）"""
    if len(pts) < 2:
        return pts
    p = [pts[0], *pts, pts[-1]]
    out = []
    for i in range(len(pts) - 1):
        p0, p1, p2, p3 = [Vector(v) for v in p[i:i + 4]]
        for s in range(samples_per_seg):
            t = s / samples_per_seg
            t2, t3 = t * t, t * t * t
            v = 0.5 * (
                (2 * p1)
                + (-p0 + p2) * t
                + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                + (-p0 + 3 * p1 - 3 * p2 + p3) * t3
            )
            out.append((v.x, v.y, v.z))
    out.append(pts[-1])
    return out


# ---------------------------------------------------------------- 共通カード構造（本体・開口・縁・MPメダル）
def build_card_core_and_rails(core_mat, rail_mat, face_mat, name_prefix='card'):
    """factions.json 準拠の 64×96×3.52mm 実体カード本体。
    - 3層側面構造（backRail [-1.76..-1.36], core [-1.36..+1.36], frontRail [+1.36..+1.76]）
    - 表面3つの凹開口（イラスト窓 z=1.0mm, 名前欄 z=1.45mm, 説明欄 z=1.45mm）
    - UV 付き `face` パネル（イラスト・名前・説明・MPメダル内部）
    """
    parts = []
    hw, hh = CARD_W_MM / 2.0, CARD_H_MM / 2.0
    outer = rounded_rect_mm(-hw, -hh, hw, hh, CORNER_R_MM, steps=8)

    # 1. 裏面〜中央コア（backZ=-1.76mm からイラスト面直下 z=0.94mm まで完全ソリッド、角丸3mm・ベベル0.6mm）
    core_slab = extrude_beveled_slab_mm(
        f'{name_prefix}-core-body', [outer], BACK_Z_MM, 0.94, BEVEL_MM, core_mat, resolution=2
    )
    parts.append(core_slab)

    # 2. 表面フレーム層（z=0.94mm〜frontZ=1.76mm）：イラスト窓・名前欄・説明欄を実際にくり抜いた立体開口！
    illu_hole = rounded_rect_mm(*ILLU_RECT_MM, 1.4, steps=5)
    name_hole = rounded_rect_mm(*NAME_RECT_MM, 1.6, steps=4)
    desc_hole = rounded_rect_mm(*DESC_RECT_MM, 1.6, steps=4)
    front_shell = extrude_beveled_slab_mm(
        f'{name_prefix}-front-shell', [outer, illu_hole, name_hole, desc_hole],
        0.92, FRONT_Z_MM, 0.35, core_mat, resolution=2
    )
    parts.append(front_shell)

    # 3. 連続する表裏レール帯（factions.json edgeBands: frontRail [1.36..1.76], backRail [-1.76..-1.36]）
    # 外周に沿った立体レール（表側と裏側、側面の帯として連続）
    outer_r = resample_loop(outer, max_seg=2.2)
    for tag, z_mid in (('front-rail', 1.56), ('back-rail', -1.56)):
        path = [(x, y, z_mid) for (x, y) in outer_r]
        rail = sweep_path_mm(
            f'{name_prefix}-{tag}', path,
            lambda t: chamfer_rect_profile(0.95, 0.44, 0.32),
            rail_mat, closed=True, cap_ends=False, smooth_angle=35.0
        )
        parts.append(rail)

    # 4. 表面の開口内面パネル（CardGL.js でイラスト・名前・説明・MPメダルアイコンを貼る面）
    # イラスト窓は z=1.0mm（奥まって立体視差が出る）、名前欄・説明欄は z=1.42mm
    parts.append(build_uv_face_quad(f'{name_prefix}-face-illu', ILLU_RECT_MM, 1.00, face_mat, margin_mm=0.6))
    parts.append(build_uv_face_quad(f'{name_prefix}-face-name', NAME_RECT_MM, 1.42, face_mat, margin_mm=0.4))
    parts.append(build_uv_face_quad(f'{name_prefix}-face-desc', DESC_RECT_MM, 1.42, face_mat, margin_mm=0.4))

    # 5. MPメダル内面（円形、z=1.92mm）
    parts.append(build_uv_face_disc(f'{name_prefix}-face-mp', MP_CENTER_MM, MP_RADIUS_MM - 0.85, 1.92, face_mat))

    return parts


def build_uv_face_quad(name, rect_mm, z_mm, mat, margin_mm=0.0):
    x0, y0, x1, y1 = rect_mm
    x0 -= margin_mm; y0 -= margin_mm; x1 += margin_mm; y1 += margin_mm
    bm = bmesh.new()
    uv = bm.loops.layers.uv.verify()
    v0 = bm.verts.new(pt(x0, y0, z_mm))
    v1 = bm.verts.new(pt(x1, y0, z_mm))
    v2 = bm.verts.new(pt(x1, y1, z_mm))
    v3 = bm.verts.new(pt(x0, y1, z_mm))
    f = bm.faces.new((v0, v1, v2, v3))
    for l in f.loops:
        c = l.vert.co
        l[uv].uv = front_uv_from_xz(c.x, c.z)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    return link_obj(name, mesh, mat, flat=True)


def build_uv_face_disc(name, center_mm, radius_mm, z_mm, mat, steps=32):
    cx, cy = center_mm
    bm = bmesh.new()
    uv = bm.loops.layers.uv.verify()
    vc = bm.verts.new(pt(cx, cy, z_mm))
    ring = [
        bm.verts.new(pt(cx + radius_mm * math.cos(2 * math.pi * i / steps),
                        cy + radius_mm * math.sin(2 * math.pi * i / steps), z_mm))
        for i in range(steps)
    ]
    for i in range(steps):
        f = bm.faces.new((vc, ring[i], ring[(i + 1) % steps]))
        for l in f.loops:
            c = l.vert.co
            l[uv].uv = front_uv_from_xz(c.x, c.z)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    return link_obj(name, mesh, mat, flat=True)


def build_aperture_rims(rim_mat, name_prefix='rim', width_mm=1.35, height_mm=0.55):
    """イラスト窓・名前欄・説明欄・MPメダルの立体ベゼル枠"""
    parts = []
    # イラスト窓の内枠
    for tag, rect, r_mm, z_base, w, h in (
        ('illu-rim', ILLU_RECT_MM, 1.5, FRONT_Z_MM + 0.05, width_mm, height_mm),
        ('name-rim', NAME_RECT_MM, 1.7, FRONT_Z_MM + 0.02, width_mm * 0.85, height_mm * 0.85),
        ('desc-rim', DESC_RECT_MM, 1.7, FRONT_Z_MM + 0.02, width_mm * 0.85, height_mm * 0.85),
    ):
        loop = resample_loop(rounded_rect_mm(*rect, r_mm, steps=6), max_seg=2.0)
        path = [(x, y, z_base) for (x, y) in loop]
        parts.append(sweep_path_mm(
            f'{name_prefix}-{tag}', path,
            lambda t, w=w, h=h: chamfer_rect_profile(w, h * 2.0, 0.35),
            rim_mat, closed=True, cap_ends=False, smooth_angle=40.0
        ))

    # MPメダル立体ベゼル（左上の円形枠：内径 4.1mm, 外径 5.15mm, 奥行き z=1.55..2.32mm）
    cx, cy = MP_CENTER_MM
    r_mid = MP_RADIUS_MM - 0.35
    steps = 36
    mp_path = [
        (cx + r_mid * math.cos(2 * math.pi * i / steps),
         cy + r_mid * math.sin(2 * math.pi * i / steps),
         FRONT_Z_MM + 0.28)
        for i in range(steps)
    ]
    parts.append(sweep_path_mm(
        f'{name_prefix}-mp-bezel', mp_path,
        lambda t: chamfer_rect_profile(1.25, 0.92, 0.35),
        rim_mat, closed=True, cap_ends=False, smooth_angle=45.0
    ))
    # 内側の細いリング段差
    r_in = MP_RADIUS_MM - 0.95
    mp_in = [
        (cx + r_in * math.cos(2 * math.pi * i / steps),
         cy + r_in * math.sin(2 * math.pi * i / steps),
         FRONT_Z_MM + 0.14)
        for i in range(steps)
    ]
    parts.append(sweep_path_mm(
        f'{name_prefix}-mp-inner', mp_in,
        lambda t: chamfer_rect_profile(0.45, 0.45, 0.35),
        rim_mat, closed=True, cap_ends=False, smooth_angle=45.0
    ))
    return parts


# ---------------------------------------------------------------- 立体ファセット宝石（表・裏・側面対応）
def build_diamond_gem_mm(name, center_mm, rx_mm, ry_mm, z_base_mm, z_dir,
                         gem_mat, bezel_mat, foil_mat,
                         crown_mm=1.15, pavilion_mm=0.95, table_ratio=0.50,
                         bezel_expand=1.28, bezel_h_mm=0.65, rot_deg=0.0):
    """本格的なひし形ブリリアントカット宝石＋金属台座＋ファセット反射箔カップ＋4本爪。
    z_dir = +1.0 で表面向き（+Z手前）、-1.0 で裏面向き（-Z奥）。
    """
    cx, cy = center_mm
    rot = math.radians(rot_deg)
    cr, sr = math.cos(rot), math.sin(rot)

    def xform(lx, ly, lz_rel):
        wx = cx + lx * cr - ly * sr
        wy = cy + lx * sr + ly * cr
        wz = z_base_mm + z_dir * lz_rel
        return pt(wx, wy, wz)

    c45 = 0.5 ** 0.5
    corners = [90 + 90 * i for i in range(4)]
    mids = [a + 45 for a in corners]
    rtx, rty = rx_mm * table_ratio, ry_mm * table_ratio

    def at(deg, sx, sy, z_rel):
        a = math.radians(deg)
        return xform(sx * math.cos(a), sy * math.sin(a), z_rel)

    bm = bmesh.new()
    nv = bm.verts.new
    g_lo = 0.12
    g_hi = 0.32
    t_z = g_hi + crown_mm
    s_z = g_hi + crown_mm * 0.55
    culet_z = g_lo - pavilion_mm

    table = [nv(at(a, rtx, rty, t_z)) for a in corners]
    sx = rtx * c45 + (rx_mm * c45 - rtx * c45) * 0.54
    sy = rty * c45 + (ry_mm * c45 - rty * c45) * 0.54
    stars = [nv(at(m, sx, sy, s_z)) for m in mids]

    def g_ring(z_rel):
        ring = []
        for a, m in zip(corners, mids):
            ring.append(nv(at(a, rx_mm, ry_mm, z_rel)))
            ring.append(nv(at(m, rx_mm * c45, ry_mm * c45, z_rel)))
        return ring

    gt, gb = g_ring(g_hi), g_ring(g_lo)
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
    pav = [nv(at(m, rx_mm * c45 * 0.55, ry_mm * c45 * 0.55, g_lo - pavilion_mm * 0.55)) for m in mids]
    culet = nv(xform(0, 0, culet_z))
    for i in range(4):
        nf((gb[2 * i], gb[2 * i + 1], pav[i]))
        nf((gb[2 * i + 1], gb[(2 * i + 2) % 8], pav[i]))
        nf((gb[2 * i], pav[i], culet, pav[i - 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    gmesh = bpy.data.meshes.new(name)
    bm.to_mesh(gmesh)
    bm.free()
    gem_obj = link_obj(name, gmesh, gem_mat, flat=True)

    parts = [gem_obj]

    # 金属ベゼル台座
    if bezel_mat is not None:
        ox, oy = rx_mm * bezel_expand, ry_mm * bezel_expand
        prof = [
            (1.04, -0.35),
            (1.04, bezel_h_mm * 0.45),
            (0.92, bezel_h_mm),
            (0.82, bezel_h_mm * 0.78),
            (0.76, bezel_h_mm * 0.15),
        ]
        rings = [[at(a, ox * s, oy * s, z) for a in corners] for s, z in prof]
        parts.append(loft_rings(f'{name}-bezel', rings, bezel_mat, closed=True, smooth_angle=25.0))

    # 奥のファセット反射箔カップ（透過宝石の内部反射を強く見せる）
    if foil_mat is not None:
        def oct_r(s, z):
            ring = []
            for a, m in zip(corners, mids):
                ring.append(at(a, rx_mm * s, ry_mm * s, z))
                ring.append(at(m, rx_mm * s * c45, ry_mm * s * c45, z))
            return ring
        f_rings = [oct_r(0.98, 0.08), oct_r(0.66, -pavilion_mm * 0.45), oct_r(0.32, -pavilion_mm * 0.85)]
        parts.append(loft_rings(f'{name}-foil', f_rings, foil_mat, closed=True, cap_end=xform(0, 0, -pavilion_mm * 1.02), flat=True))

    return parts


def build_side_gem_mm(name, x_mm, y_mm, rx_z_mm, ry_mm, x_dir, gem_mat, bezel_mat, foil_mat, crown_mm=0.65):
    """側面（±X）に埋め込むひし形ファセット宝石＋ベゼル（王国・魔族の側面宝石用）"""
    # x_dir = +1.0 (右側面), -1.0 (左側面)
    def xform(lz, ly, lx_rel):
        return pt(x_mm + x_dir * lx_rel, y_mm + ly, lz)

    c45 = 0.5 ** 0.5
    corners = [90 + 90 * i for i in range(4)]
    mids = [a + 45 for a in corners]
    rtx, rty = rx_z_mm * 0.45, ry_mm * 0.45

    def at(deg, sz, sy, x_rel):
        a = math.radians(deg)
        return xform(sz * math.cos(a), sy * math.sin(a), x_rel)

    bm = bmesh.new()
    nv = bm.verts.new
    table = [nv(at(a, rtx, rty, crown_mm)) for a in corners]
    stars = [nv(at(m, rx_z_mm * c45 * 0.72, ry_mm * c45 * 0.72, crown_mm * 0.52)) for m in mids]
    girdle = []
    for a, m in zip(corners, mids):
        girdle.append(nv(at(a, rx_z_mm, ry_mm, 0.1)))
        girdle.append(nv(at(m, rx_z_mm * c45, ry_mm * c45, 0.1)))
    back_c = nv(xform(0, 0, -0.4))
    nf = bm.faces.new
    nf(table)
    for i in range(4):
        j = (i + 1) % 4
        nf((table[i], table[j], stars[i]))
        nf((table[i], stars[i - 1], girdle[2 * i], stars[i]))
        nf((stars[i], girdle[2 * i], girdle[2 * i + 1]))
        nf((stars[i], girdle[2 * i + 1], girdle[(2 * i + 2) % 8]))
    for i in range(8):
        nf((girdle[i], girdle[(i + 1) % 8], back_c))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    parts = [link_obj(name, mesh, gem_mat, flat=True)]

    if bezel_mat is not None:
        rings = [
            [at(a, rx_z_mm * 1.35, ry_mm * 1.25, -0.25) for a in corners],
            [at(a, rx_z_mm * 1.30, ry_mm * 1.20, 0.38) for a in corners],
            [at(a, rx_z_mm * 1.05, ry_mm * 1.02, 0.25) for a in corners],
            [at(a, rx_z_mm * 0.95, ry_mm * 0.95, -0.20) for a in corners],
        ]
        parts.append(loft_rings(f'{name}-bezel', rings, bezel_mat, closed=True, smooth_angle=25.0))
    return parts


def build_cabochon_gem_mm(name, center_mm, rx_mm, ry_mm, z_base_mm, z_dir,
                          gem_mat, bezel_mat, foil_mat, dome_mm=1.25, rot_deg=0.0,
                          shape='oval', steps=20):
    """カボション／涙型／ハート型の立体宝石（森林の琥珀用）"""
    cx, cy = center_mm
    rot = math.radians(rot_deg)
    cr, sr = math.cos(rot), math.sin(rot)

    def shape_xy(t_rad, scale):
        if shape == 'teardrop':
            # 上が尖った涙型
            x = math.sin(t_rad) * (0.78 + 0.22 * math.cos(t_rad))
            y = math.cos(t_rad)
            if y > 0:
                x *= (1.0 - 0.28 * y)
            return x * rx_mm * scale, y * ry_mm * scale
        if shape == 'heart':
            # 生命樹の中央ハート琥珀
            s = math.sin(t_rad)
            c = math.cos(t_rad)
            hx = 16.0 * (s ** 3) / 16.0
            hy = (13.0 * c - 5.0 * math.cos(2 * t_rad) - 2.0 * math.cos(3 * t_rad) - math.cos(4 * t_rad)) / 15.0
            return hx * rx_mm * scale, hy * ry_mm * scale
        return math.cos(t_rad) * rx_mm * scale, math.sin(t_rad) * ry_mm * scale

    def xform(lx, ly, lz_rel):
        wx = cx + lx * cr - ly * sr
        wy = cy + lx * sr + ly * cr
        return pt(wx, wy, z_base_mm + z_dir * lz_rel)

    rings = []
    lat_levels = [
        (0.95, -0.35),
        (1.00, 0.12),
        (0.94, dome_mm * 0.42),
        (0.78, dome_mm * 0.74),
        (0.52, dome_mm * 0.92),
        (0.24, dome_mm * 0.99),
    ]
    for sc, zl in lat_levels:
        ring = []
        for i in range(steps):
            a = 2.0 * math.pi * i / steps
            lx, ly = shape_xy(a, sc)
            ring.append(xform(lx, ly, zl))
        rings.append(ring)
    parts = [loft_rings(name, rings, gem_mat, closed=True,
                        cap_start=xform(0, 0, -0.45),
                        cap_end=xform(0, 0, dome_mm * 1.02),
                        smooth_angle=60.0)]

    if bezel_mat is not None:
        b_rings = []
        for sc, zl in ((1.22, -0.35), (1.20, 0.45), (1.08, 0.62), (0.98, 0.20)):
            b_rings.append([xform(*shape_xy(2.0 * math.pi * i / steps, sc), zl) for i in range(steps)])
        parts.append(loft_rings(f'{name}-bezel', b_rings, bezel_mat, closed=True, smooth_angle=45.0))

    if foil_mat is not None:
        f_rings = [
            [xform(*shape_xy(2.0 * math.pi * i / steps, 0.92), 0.05) for i in range(steps)],
            [xform(*shape_xy(2.0 * math.pi * i / steps, 0.55), -0.35) for i in range(steps)],
        ]
        parts.append(loft_rings(f'{name}-foil', f_rings, foil_mat, closed=True, cap_end=xform(0, 0, -0.50), flat=True))
    return parts


def build_sculpted_feather_mm(name, root_mm, tip_mm, width_mm, thick_mm, z_dir, mat, curve_mm=0.8):
    """立体的な1枚の羽根（中央軸の稜線＋先端テーパー＋自然な反り）"""
    r = Vector(root_mm)
    t = Vector(tip_mm)
    axis = t - r
    length = axis.length
    if length < 1e-4:
        return None
    fwd = axis.normalized()
    side = Vector((-fwd.y, fwd.x, 0.0)).normalized()
    nrm = Vector((0.0, 0.0, z_dir))

    steps = 7
    rings = []
    for i in range(steps):
        u = i / (steps - 1)
        w = width_mm * math.sin(u * math.pi) ** 0.72 * (1.0 - 0.18 * u)
        w = max(w, 0.12)
        h = thick_mm * (1.0 - 0.65 * u)
        arch = curve_mm * math.sin(u * math.pi)
        c = r.lerp(t, u) + nrm * arch
        # 菱形に近い羽根断面（中央にクイル稜線）
        ring = [
            pt(*(c + side * w)),
            pt(*(c + side * (w * 0.35) + nrm * (h * 0.75))),
            pt(*(c + nrm * h)),
            pt(*(c - side * (w * 0.35) + nrm * (h * 0.75))),
            pt(*(c - side * w)),
            pt(*(c - nrm * (h * 0.35))),
        ]
        rings.append(ring)
    return loft_rings(name, rings, mat, closed=True, cap_start=pt(*r), cap_end=pt(*t), smooth_angle=42.0)


def build_sculpted_leaf_mm(name, root_mm, tip_mm, width_mm, thick_mm, z_dir, mat, arch_mm=0.95):
    """葉脈の谷と中央の膨らみがある立体的な木の葉"""
    r = Vector(root_mm)
    t = Vector(tip_mm)
    fwd = (t - r).normalized()
    side = Vector((-fwd.y, fwd.x, 0.0)).normalized()
    nrm = Vector((0.0, 0.0, z_dir))
    steps = 7
    rings = []
    for i in range(steps):
        u = i / (steps - 1)
        w = max(0.10, width_mm * math.sin(u * math.pi) ** 0.68)
        h = thick_mm * (1.0 - 0.5 * u)
        arch = arch_mm * math.sin(u * math.pi)
        c = r.lerp(t, u) + nrm * arch
        # 葉のV字カップ＋中央葉脈
        ring = [
            pt(*(c + side * w + nrm * (h * 0.55))),
            pt(*(c + side * (w * 0.42) + nrm * (h * 0.18))),
            pt(*(c + nrm * (h * 0.42))),
            pt(*(c - side * (w * 0.42) + nrm * (h * 0.18))),
            pt(*(c - side * w + nrm * (h * 0.55))),
            pt(*(c - nrm * (h * 0.35))),
        ]
        rings.append(ring)
    return loft_rings(name, rings, mat, closed=True, cap_start=pt(*r), cap_end=pt(*t), smooth_angle=48.0)


def build_corner_wrap_bracket_mm(name, sx, sy, mat,
                                 outer_x=32.3, outer_y=48.3,
                                 arm_x=9.5, arm_y=10.5,
                                 z_max=2.15, bevel_mm=0.45):
    """四隅を表(+z_max)→側面→裏(-z_max)まで切れ目なく包み込む連続コーナー金具。
    sx, sy ∈ {-1, +1} で四隅を指定。
    """
    # L字の角丸ブラケット輪郭を mm で定義し、-z_max 〜 +z_max まで1つのソリッドで押し出す！
    x_out = sx * outer_x
    y_out = sy * outer_y
    x_in = sx * (outer_x - arm_x)
    y_in = sy * (outer_y - arm_y)
    x_mid = sx * (outer_x - 3.6)
    y_mid = sy * (outer_y - 3.6)

    # コーナーの外側を丸めたL字ポリゴン
    r = CORNER_R_MM + 0.3
    cx = sx * (outer_x - r)
    cy = sy * (outer_y - r)
    # 象限に応じた開始角
    if sx > 0 and sy > 0:
        angles = [0, 22.5, 45, 67.5, 90]
    elif sx < 0 and sy > 0:
        angles = [90, 112.5, 135, 157.5, 180]
    elif sx < 0 and sy < 0:
        angles = [180, 202.5, 225, 247.5, 270]
    else:
        angles = [270, 292.5, 315, 337.5, 360]

    arc = [(cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a))) for a in angles]
    if sx * sy > 0:
        poly = [(x_out, y_in), *arc, (x_in, y_out), (x_in, y_mid), (x_mid, y_mid), (x_mid, y_in)]
    else:
        poly = [(x_in, y_out), *arc, (x_out, y_in), (x_mid, y_in), (x_mid, y_mid), (x_in, y_mid)]
    return extrude_beveled_slab_mm(name, [poly], -z_max, z_max, bevel_mm, mat, resolution=2)
