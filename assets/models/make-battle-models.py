"""第3任務：城（王城・要塞）と主要兵士（歩兵・騎士・魔法使い）の高品質3Dモデル生成スクリプト。

対象モデル（他の未改修モデルやステージは上書きしない）：
  - assets/models/castle-standard.glb （王城）
  - assets/models/castle-fortress.glb （要塞）
  - assets/models/unit-infantry.glb   （歩兵）
  - assets/models/unit-knight.glb     （騎士）
  - assets/models/unit-mage.glb       （魔法使い）

特徴：
  - STYLE.md と modeling-kit 原画に準拠した明るいカートゥーンファンタジー造形
  - 頂点カラー（Col）による陰影・AO・石積み色ムラと、FieldGL.tintTeamMaterials によるチームカラー置換の両立
  - FieldGL.bindModelRig と連動する階層オブジェクト構造（Castle_Keep, Castle_Tower_*, Castle_Flag_Main,
    Anim_Body, Anim_Head, Anim_ArmR, Anim_ArmL, Anim_LegL, Anim_LegR, Anim_Cape, Anim_Plume,
    Anim_StaffOrb, Anim_MountBody, Anim_MountHead, Anim_MountLegFL/FR/BL/BR, Anim_MountTail）

使い方：
  "C:\\Program Files\\Blender Foundation\\Blender 5.3\\blender.exe" --background --python assets/models/make-battle-models.py
"""

import math
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector, Matrix, Euler

OUT_DIR = Path(__file__).resolve().parent


# ==============================================================================
# COLOR & MATERIAL UTILITIES
# ==============================================================================

def hex_to_srgb(hex_str):
    h = hex_str.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


def hex_to_linear(hex_str):
    r, g, b = hex_to_srgb(hex_str)
    def s2l(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (s2l(r), s2l(g), s2l(b), 1.0)


def lerp_rgb(c1, c2, t):
    t = max(0.0, min(1.0, t))
    return (
        c1[0] * (1.0 - t) + c2[0] * t,
        c1[1] * (1.0 - t) + c2[1] * t,
        c1[2] * (1.0 - t) + c2[2] * t,
    )


def clear_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for m in list(bpy.data.meshes):
        bpy.data.meshes.remove(m, do_unlink=True)
    for mat in list(bpy.data.materials):
        bpy.data.materials.remove(mat, do_unlink=True)


def get_mat(name, base_hex='#ffffff', roughness=0.72, metallic=0.0,
            emission_hex=None, emission_strength=0.0, use_vcol=True, specular=0.25):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    if 'Specular IOR Level' in bsdf.inputs:
        bsdf.inputs['Specular IOR Level'].default_value = specular
    lin = hex_to_linear(base_hex)
    mat.diffuse_color = lin
    if use_vcol:
        vc = nt.nodes.new('ShaderNodeVertexColor')
        vc.layer_name = 'Col'
        nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
    else:
        bsdf.inputs['Base Color'].default_value = lin
    if emission_hex and emission_strength > 0.0:
        bsdf.inputs['Emission Color'].default_value = hex_to_linear(emission_hex)
        bsdf.inputs['Emission Strength'].default_value = emission_strength
    return mat


# ==============================================================================
# BMESH GEOMETRY BUILDER PRIMITIVES
# ==============================================================================

def paint_faces(bm, faces, col_fn):
    col_layer = bm.loops.layers.color.get('Col') or bm.loops.layers.color.new('Col')
    for f in faces:
        for loop in f.loops:
            c = col_fn(loop.vert.co, f.normal)
            loop[col_layer] = (
                max(0.0, min(1.0, c[0])),
                max(0.0, min(1.0, c[1])),
                max(0.0, min(1.0, c[2])),
                1.0,
            )


def add_cylinder_frustum(bm, r_bot, r_top, h, segs=16, center=(0, 0, 0),
                         rot_euler=(0, 0, 0), mat_idx=0, cap_bot=True, cap_top=True,
                         col_fn=None, bevel_rings=None):
    """Multi-ring profiled cylinder/cone with optional intermediate profile rings [(z_frac, r_scale), ...]."""
    rings_spec = bevel_rings if bevel_rings else [(0.0, r_bot), (1.0, r_top)]
    rot_m = Euler(rot_euler, 'XYZ').to_matrix().to_4x4()
    c_vec = Vector(center)

    ring_verts = []
    for zf, rad in rings_spec:
        z = zf * h
        rv = []
        for i in range(segs):
            a = (2.0 * math.pi * i) / segs
            p = Vector((math.cos(a) * rad, math.sin(a) * rad, z))
            p = (rot_m @ p) + c_vec
            rv.append(bm.verts.new(p))
        ring_verts.append(rv)

    new_faces = []
    for r_idx in range(len(ring_verts) - 1):
        r0 = ring_verts[r_idx]
        r1 = ring_verts[r_idx + 1]
        for i in range(segs):
            j = (i + 1) % segs
            f = bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
            f.material_index = mat_idx
            new_faces.append(f)

    if cap_bot and rings_spec[0][1] > 1e-4:
        f = bm.faces.new(list(reversed(ring_verts[0])))
        f.material_index = mat_idx
        new_faces.append(f)
    if cap_top and rings_spec[-1][1] > 1e-4:
        f = bm.faces.new(ring_verts[-1])
        f.material_index = mat_idx
        new_faces.append(f)

    bmesh.ops.recalc_face_normals(bm, faces=new_faces)
    if col_fn:
        paint_faces(bm, new_faces, col_fn)
    return new_faces


def add_beveled_box(bm, size_xyz, center=(0, 0, 0), rot_euler=(0, 0, 0),
                    bevel=0.04, mat_idx=0, col_fn=None, taper_top=1.0):
    """Beveled 3-tier box with top taper and smooth cartoon edges."""
    sx, sy, sz = size_xyz[0] * 0.5, size_xyz[1] * 0.5, size_xyz[2]
    b = min(bevel, sx * 0.35, sy * 0.35, sz * 0.35)
    rot_m = Euler(rot_euler, 'XYZ').to_matrix().to_4x4()
    c_vec = Vector(center)

    # 8-point rounded rectangle in XY
    def rect_pts(rx, ry, z, b_xy):
        ix = max(0.001, rx - b_xy)
        iy = max(0.001, ry - b_xy)
        pts = [
            ( ix, -ry), ( rx, -iy),
            ( rx,  iy), ( ix,  ry),
            (-ix,  ry), (-rx,  iy),
            (-rx, -iy), (-ix, -ry),
        ]
        out = []
        for x, y in pts:
            p = (rot_m @ Vector((x, y, z))) + c_vec
            out.append(bm.verts.new(p))
        return out

    levels = [
        (0.0, max(0.01, sx - b * 0.6), max(0.01, sy - b * 0.6), b * 1.1),
        (b, sx, sy, b),
        (max(b * 1.1, sz - b), sx * taper_top, sy * taper_top, b),
        (sz, max(0.01, sx * taper_top - b * 0.6), max(0.01, sy * taper_top - b * 0.6), b * 1.1),
    ]
    rings = [rect_pts(rx, ry, z, b_xy) for z, rx, ry, b_xy in levels]
    new_faces = []
    n = len(rings[0])
    for r_idx in range(len(rings) - 1):
        r0, r1 = rings[r_idx], rings[r_idx + 1]
        for i in range(n):
            j = (i + 1) % n
            f = bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
            f.material_index = mat_idx
            new_faces.append(f)
    f_bot = bm.faces.new(list(reversed(rings[0])))
    f_bot.material_index = mat_idx
    f_top = bm.faces.new(rings[-1])
    f_top.material_index = mat_idx
    new_faces.extend([f_bot, f_top])

    bmesh.ops.recalc_face_normals(bm, faces=new_faces)
    if col_fn:
        paint_faces(bm, new_faces, col_fn)
    return new_faces


def add_uv_sphere(bm, radius, scale_xyz=(1.0, 1.0, 1.0), center=(0, 0, 0),
                  rot_euler=(0, 0, 0), u_segs=16, v_segs=12, mat_idx=0, col_fn=None):
    res = bmesh.ops.create_uvsphere(bm, u_segments=u_segs, v_segments=v_segs, radius=radius)
    verts = res['verts']
    vset = set(verts)
    rot_m = Euler(rot_euler, 'XYZ').to_matrix().to_4x4()
    c_vec = Vector(center)
    for v in verts:
        p = Vector((v.co.x * scale_xyz[0], v.co.y * scale_xyz[1], v.co.z * scale_xyz[2]))
        v.co = (rot_m @ p) + c_vec
    faces = [f for f in bm.faces if all(v in vset for v in f.verts)]
    for f in faces:
        f.material_index = mat_idx
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    if col_fn:
        paint_faces(bm, faces, col_fn)
    return faces


def add_arch_portal(bm, width, height, depth, center=(0, 0, 0), rot_z=0.0,
                    arch_segs=9, mat_idx=0, col_fn=None):
    """Sculpted stone arch frame around a doorway or window."""
    hw = width * 0.5
    arch_r = hw
    leg_h = max(0.1, height - arch_r)
    thick = width * 0.22
    rot_m = Euler((0, 0, rot_z), 'XYZ').to_matrix().to_4x4()
    c_vec = Vector(center)

    # Build arch profile points in XZ plane (front at +Y/-Y depth)
    inner_pts = [(-hw, 0.0)]
    outer_pts = [(-(hw + thick), 0.0)]
    for i in range(arch_segs + 1):
        a = math.pi - (math.pi * i) / arch_segs
        ca, sa = math.cos(a), math.sin(a)
        inner_pts.append((ca * arch_r, leg_h + sa * arch_r))
        outer_pts.append((ca * (arch_r + thick), leg_h + sa * (arch_r + thick * 1.08)))
    inner_pts.append((hw, 0.0))
    outer_pts.append(((hw + thick), 0.0))

    n = len(inner_pts)
    hy = depth * 0.5
    f_in, f_out, b_in, b_out = [], [], [], []
    for i in range(n):
        ix, iz = inner_pts[i]
        ox, oz = outer_pts[i]
        f_in.append(bm.verts.new((rot_m @ Vector((ix,  hy, iz))) + c_vec))
        f_out.append(bm.verts.new((rot_m @ Vector((ox,  hy, oz))) + c_vec))
        b_in.append(bm.verts.new((rot_m @ Vector((ix, -hy, iz))) + c_vec))
        b_out.append(bm.verts.new((rot_m @ Vector((ox, -hy, oz))) + c_vec))

    faces = []
    for i in range(n - 1):
        # Front face (+Y)
        faces.append(bm.faces.new((f_in[i], f_out[i], f_out[i + 1], f_in[i + 1])))
        # Back face (-Y)
        faces.append(bm.faces.new((b_out[i], b_in[i], b_in[i + 1], b_out[i + 1])))
        # Inner soffit
        faces.append(bm.faces.new((b_in[i], f_in[i], f_in[i + 1], b_in[i + 1])))
        # Outer extrados
        faces.append(bm.faces.new((f_out[i], b_out[i], b_out[i + 1], f_out[i + 1])))
    for f in faces:
        f.material_index = mat_idx
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    if col_fn:
        paint_faces(bm, faces, col_fn)
    return faces


def add_wing_relief(bm, span, height, thickness, center=(0, 0, 0), rot_z=0.0,
                    mat_idx=0, col_fn=None):
    """Sculpted pair of royal angel/eagle wings in 3D relief."""
    faces = []
    for side in (-1, 1):
        for feather_i in range(4):
            frac = feather_i / 3.0
            fw = span * (0.48 - frac * 0.08)
            fh = height * (0.26 - frac * 0.03)
            fx = side * (0.14 + fw * 0.48 + frac * 0.06)
            fz = (0.35 - frac * 0.24) * height
            ang_y = side * (-0.28 + frac * 0.16)
            fs = add_beveled_box(
                bm,
                (fw, thickness, fh),
                center=(
                    center[0] + fx * math.cos(rot_z),
                    center[1] + fx * math.sin(rot_z),
                    center[2] + fz,
                ),
                rot_euler=(0.0, ang_y, rot_z),
                bevel=0.015,
                mat_idx=mat_idx,
                col_fn=col_fn,
            )
            faces.extend(fs)
    return faces


def add_helmet_dome(bm, radius, scale_xyz=(1.0, 1.0, 1.0), center=(0, 0, 0),
                    rot_euler=(0, 0, 0), u_segs=16, v_rings=7, mat_idx=0, col_fn=None):
    """Open-bottomed cartoon helmet bowl (only upper hemisphere above brow line) so chibi eyes & face stay visible."""
    rot_m = Euler(rot_euler, 'XYZ').to_matrix().to_4x4()
    c_vec = Vector(center)
    rings = []
    # Latitude from slightly below equator (-0.08 rad) up to near top pole (1.42 rad)
    for r_i in range(v_rings):
        lat = -0.06 + (r_i / (v_rings - 1)) * 1.48
        clat = math.cos(lat)
        slat = math.sin(lat)
        rv = []
        for i in range(u_segs):
            a = (2.0 * math.pi * i) / u_segs
            p = Vector((
                math.cos(a) * clat * radius * scale_xyz[0],
                math.sin(a) * clat * radius * scale_xyz[1],
                slat * radius * scale_xyz[2],
            ))
            rv.append(bm.verts.new((rot_m @ p) + c_vec))
        rings.append(rv)

    faces = []
    for r_i in range(len(rings) - 1):
        r0, r1 = rings[r_i], rings[r_i + 1]
        for i in range(u_segs):
            j = (i + 1) % u_segs
            f = bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
            f.material_index = mat_idx
            faces.append(f)
    f_top = bm.faces.new(rings[-1])
    f_top.material_index = mat_idx
    faces.append(f_top)
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    if col_fn:
        paint_faces(bm, faces, col_fn)
    return faces


def create_obj_from_bm(bm, name, mats, origin=(0, 0, 0), parent=None, smooth=True):
    """Bake bmesh into a Blender Object with pivot at `origin` in world space."""
    ox, oy, oz = origin
    if ox != 0 or oy != 0 or oz != 0:
        for v in bm.verts:
            v.co.x -= ox
            v.co.y -= oy
            v.co.z -= oz

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        f.smooth = smooth

    mesh = bpy.data.meshes.new(name + '_Mesh')
    bm.to_mesh(mesh)
    bm.free()
    for m in mats:
        mesh.materials.append(m)
    mesh.update()

    obj = bpy.data.objects.new(name, mesh)
    obj['world_origin'] = (float(ox), float(oy), float(oz))
    bpy.context.collection.objects.link(obj)
    if parent is not None:
        obj.parent = parent
        px, py, pz = parent.get('world_origin', (0.0, 0.0, 0.0))
        obj.location = (ox - px, oy - py, oz - pz)
    else:
        obj.location = (ox, oy, oz)
    return obj


def export_glb(filename):
    out_path = OUT_DIR / filename
    bpy.ops.export_scene.gltf(
        filepath=str(out_path),
        export_format='GLB',
        use_active_scene=True,
        export_yup=True,
        export_apply=True,
        export_materials='EXPORT',
    )
    size_kb = out_path.stat().st_size / 1024.0
    print(f"[Exported] {filename} ({size_kb:.1f} KB)")


# ==============================================================================
# VERTEX COLOR SHADERS (WARM CARTOON FANTASY PALETTES)
# ==============================================================================

def col_royal_stone(co, n):
    """Warm cream-sandstone masonry with height gradient, ashlar block variation & AO."""
    c_bot = hex_to_srgb('#9e896c')
    c_mid = hex_to_srgb('#dfd0b6')
    c_top = hex_to_srgb('#f6ebd4')
    h_t = max(0.0, min(1.0, co.z / 3.8))
    base = lerp_rgb(c_bot, c_mid, min(1.0, h_t * 1.6))
    base = lerp_rgb(base, c_top, max(0.0, (h_t - 0.35) * 1.4))
    # Subtle brick/block variation
    brick_n = 0.045 * math.sin(co.x * 5.5 + co.z * 7.0) * math.cos(co.y * 5.5 - co.z * 4.2)
    sun = 0.05 * max(0.0, n.z) + 0.03 * max(0.0, n.y)
    return (base[0] + brick_n + sun, base[1] + brick_n + sun, base[2] + brick_n * 0.8 + sun)


def col_royal_stone_trim(co, n):
    """Bright carved stone quoins, arches, and battlements."""
    c_lo = hex_to_srgb('#cbbba0')
    c_hi = hex_to_srgb('#fbf3e2')
    t = max(0.0, min(1.0, 0.45 + 0.35 * n.z + 0.2 * (co.z / 4.0)))
    return lerp_rgb(c_lo, c_hi, t)


def col_fortress_stone(co, n):
    """Heavy slate-granite fortress masonry with warm directional light and deep base AO."""
    c_bot = hex_to_srgb('#434754')
    c_mid = hex_to_srgb('#777e8f')
    c_top = hex_to_srgb('#a5aebe')
    h_t = max(0.0, min(1.0, co.z / 3.8))
    base = lerp_rgb(c_bot, c_mid, min(1.0, h_t * 1.5))
    base = lerp_rgb(base, c_top, max(0.0, (h_t - 0.4) * 1.3))
    block = 0.04 * math.sin(co.x * 4.8) * math.cos(co.z * 6.2 + co.y * 4.5)
    sun = 0.06 * max(0.0, n.z)
    return (base[0] + block + sun, base[1] + block + sun, base[2] + block + sun)


def col_dark_iron(co, n):
    """Forged dark gunmetal iron armor plates & bands."""
    c_lo = hex_to_srgb('#262a34')
    c_hi = hex_to_srgb('#525a6e')
    t = max(0.0, min(1.0, 0.35 + 0.45 * max(0.0, n.z) + 0.2 * max(0.0, n.y)))
    return lerp_rgb(c_lo, c_hi, t)


def col_polished_steel(co, n):
    """Heroic bright cartoon steel armor & blades."""
    c_lo = hex_to_srgb('#8ea0b8')
    c_hi = hex_to_srgb('#f2f7ff')
    t = max(0.0, min(1.0, 0.45 + 0.4 * max(0.0, n.z) + 0.15 * abs(n.y)))
    return lerp_rgb(c_lo, c_hi, t)


def col_royal_gold(co, n):
    """Warm saturated cartoon gold trim, crowns, finials & crests."""
    c_lo = hex_to_srgb('#c98718')
    c_mid = hex_to_srgb('#f5be36')
    c_hi = hex_to_srgb('#ffe98a')
    t = max(0.0, min(1.0, 0.4 + 0.45 * max(0.0, n.z) + 0.15 * abs(n.x)))
    base = lerp_rgb(c_lo, c_mid, min(1.0, t * 1.4))
    return lerp_rgb(base, c_hi, max(0.0, (t - 0.55) * 1.8))


def col_oak_wood(co, n):
    """Rich dark oak doors, lance shafts & mage staff wood."""
    c_lo = hex_to_srgb('#3d2210')
    c_hi = hex_to_srgb('#784722')
    grain = 0.5 + 0.5 * math.sin(co.z * 14.0 + co.x * 8.0)
    t = max(0.0, min(1.0, 0.35 + 0.35 * max(0.0, n.z) + 0.3 * grain))
    return lerp_rgb(c_lo, c_hi, t)


def col_bush_green(co, n):
    """Lush meadow bush & foliage green matching PR #186 meadow."""
    c_lo = hex_to_srgb('#2b610d')
    c_mid = hex_to_srgb('#5f9c16')
    c_hi = hex_to_srgb('#9ec924')
    t = max(0.0, min(1.0, 0.35 + 0.45 * max(0.0, n.z) + 0.25 * (co.z / 0.8)))
    base = lerp_rgb(c_lo, c_mid, min(1.0, t * 1.4))
    return lerp_rgb(base, c_hi, max(0.0, (t - 0.5) * 1.6))


def col_chibi_skin(co, n):
    """Warm peachy cartoon skin with soft rosy cheek blush."""
    c_lo = hex_to_srgb('#e6af8e')
    c_hi = hex_to_srgb('#ffe3CA')
    c_blush = hex_to_srgb('#f48b7b')
    t = max(0.0, min(1.0, 0.45 + 0.4 * max(0.0, n.z) + 0.2 * max(0.0, n.y)))
    base = lerp_rgb(c_lo, c_hi, t)
    # Cheek blush on front-left/right of face
    if co.y > 0.14 and abs(abs(co.x) - 0.17) < 0.11 and abs(co.z - 1.15) < 0.14:
        base = lerp_rgb(base, c_blush, 0.45)
    return base


def col_horse_coat(co, n):
    """Warm cream/palomino royal warhorse coat."""
    c_lo = hex_to_srgb('#d4bc98')
    c_hi = hex_to_srgb('#fff7e8')
    t = max(0.0, min(1.0, 0.38 + 0.42 * max(0.0, n.z) + 0.2 * (co.z / 1.4)))
    return lerp_rgb(c_lo, c_hi, t)


def col_cream_cloth(co, n):
    """Warm ivory/cream inner robe & lance stripes."""
    c_lo = hex_to_srgb('#cfc0a3')
    c_hi = hex_to_srgb('#fff9eb')
    t = max(0.0, min(1.0, 0.4 + 0.45 * max(0.0, n.z) + 0.15 * abs(n.y)))
    return lerp_rgb(c_lo, c_hi, t)


def col_team_shading(co, n):
    """Grayscale tonal shading (0.78..1.0) for Team* materials so Three.js team tinting preserves 3D depth."""
    ang = math.atan2(co.y, co.x)
    rib = 0.04 * math.cos(ang * 12.0)
    v = max(0.76, min(1.0, 0.84 + 0.14 * max(0.0, n.z) + 0.05 * abs(n.y) + rib))
    return (v, v, v)


# ==============================================================================
# 1. 王城 (castle-standard.glb)
# ==============================================================================

def build_castle_standard():
    clear_scene()
    m_stone = get_mat('Castle_Stone', '#dfd0b6', roughness=0.80, use_vcol=True)
    m_trim  = get_mat('Castle_StoneTrim', '#f5ebd6', roughness=0.72, use_vcol=True)
    m_gold  = get_mat('Castle_Gold', '#f5be36', roughness=0.32, metallic=0.78, use_vcol=True)
    m_silver = get_mat('Castle_Silver', '#e4eef8', roughness=0.28, metallic=0.82, use_vcol=True)
    m_wood  = get_mat('Castle_Wood', '#5b371a', roughness=0.82, use_vcol=True)
    m_foliage = get_mat('Castle_Foliage', '#5f9c16', roughness=0.82, use_vcol=True)
    m_win   = get_mat('Castle_Window', '#ffe28a', roughness=0.25, emission_hex='#ffcf56', emission_strength=2.2, use_vcol=False)
    m_gem   = get_mat('Castle_Gem', '#4ce8ff', roughness=0.15, emission_hex='#38d8ff', emission_strength=2.5, use_vcol=False)
    m_roof  = get_mat('TeamRoof', '#2b88f5', roughness=0.52, use_vcol=False)
    m_banner = get_mat('TeamBanner', '#2f95ff', roughness=0.62, use_vcol=False)
    m_accent = get_mat('TeamAccent', '#2f95ff', roughness=0.55, use_vcol=False)

    all_mats = [m_stone, m_trim, m_gold, m_silver, m_wood, m_foliage, m_win, m_gem, m_roof, m_banner, m_accent]
    root = bpy.data.objects.new('Castle_Standard_Root', None)
    bpy.context.collection.objects.link(root)

    # ---- 1. Castle_Base (Stepped stone plinth, stairs, perimeter bushes & boulders) ----
    bm = bmesh.new()
    add_beveled_box(bm, (5.25, 3.85, 0.28), center=(0, 0, 0.0), bevel=0.08, mat_idx=0, col_fn=col_royal_stone, taper_top=0.97)
    add_beveled_box(bm, (4.85, 3.45, 0.24), center=(0, 0, 0.24), bevel=0.06, mat_idx=1, col_fn=col_royal_stone_trim, taper_top=0.98)
    # Front and rear stepped stone causeways
    for sy_sign in (1, -1):
        for step_i in range(3):
            w = 1.65 - step_i * 0.12
            d = 0.55 - step_i * 0.12
            h = 0.14 + step_i * 0.12
            add_beveled_box(bm, (w, d, h), center=(0, sy_sign * (1.75 + (2 - step_i) * 0.14), 0.0),
                            bevel=0.03, mat_idx=1, col_fn=col_royal_stone_trim)
    # Perimeter lush bushes & stones at the base corners (matching castle-blue.png & kingdom-back.png)
    bush_spots = [
        (-2.35,  1.62, 0.36), (-1.95,  1.78, 0.28), ( 2.35,  1.62, 0.36), ( 1.95,  1.78, 0.28),
        (-2.38, -1.60, 0.38), (-1.88, -1.76, 0.30), ( 2.38, -1.60, 0.38), ( 1.88, -1.76, 0.30),
        (-2.55,  0.00, 0.34), ( 2.55,  0.00, 0.34),
    ]
    for bx, by, br in bush_spots:
        add_uv_sphere(bm, br, scale_xyz=(1.15, 0.95, 0.82), center=(bx, by, br * 0.65),
                      u_segs=10, v_segs=8, mat_idx=5, col_fn=col_bush_green)
    create_obj_from_bm(bm, 'Castle_Base', all_mats, origin=(0, 0, 0), parent=root)

    # ---- 2. Castle_Walls (Curtain walls, ashlar relief blocks, +Y Front Gate, -Y Rear Royal Wall) ----
    bm = bmesh.new()
    # Main curtain wall enclosure
    add_beveled_box(bm, (4.05, 2.72, 2.15), center=(0, 0, 0.42), bevel=0.07, mat_idx=0, col_fn=col_royal_stone, taper_top=0.95)
    # Golden heraldic frieze band wrapping all 4 walls
    add_beveled_box(bm, (4.16, 2.82, 0.16), center=(0, 0, 2.02), bevel=0.02, mat_idx=2, col_fn=col_royal_gold)
    # Overhanging stone parapetwalk cornice
    add_beveled_box(bm, (4.24, 2.90, 0.20), center=(0, 0, 2.45), bevel=0.03, mat_idx=1, col_fn=col_royal_stone_trim)

    # Crenellations (merlons) along front (+Y), back (-Y), left (-X), right (+X) walls
    for ix in (-1.25, -0.75, -0.25, 0.25, 0.75, 1.25):
        for sy_sign in (1, -1):
            add_beveled_box(bm, (0.34, 0.24, 0.32), center=(ix, sy_sign * 1.32, 2.62),
                            bevel=0.025, mat_idx=1, col_fn=col_royal_stone_trim)
    for iy in (-0.75, -0.25, 0.25, 0.75):
        for sx_sign in (-1, 1):
            add_beveled_box(bm, (0.24, 0.34, 0.32), center=(sx_sign * 1.98, iy, 2.62),
                            bevel=0.025, mat_idx=1, col_fn=col_royal_stone_trim)

    # Protruding 3D ashlar stone blocks on front, rear, and side walls
    ashlar_blocks = [
        (-1.35, 1.36, 0.85, 0.38, 0.10, 0.22), (1.35, 1.36, 1.15, 0.40, 0.10, 0.22),
        (-1.20, 1.36, 1.55, 0.35, 0.10, 0.20), (1.20, 1.36, 0.75, 0.36, 0.10, 0.20),
        (-1.38, -1.36, 0.82, 0.42, 0.10, 0.22), (1.38, -1.36, 1.18, 0.42, 0.10, 0.22),
        (-0.85, -1.36, 1.62, 0.36, 0.10, 0.20), (0.85, -1.36, 0.72, 0.36, 0.10, 0.20),
    ]
    for ax, ay, az, aw, ad, ah in ashlar_blocks:
        add_beveled_box(bm, (aw, ad, ah), center=(ax, ay, az), bevel=0.02, mat_idx=1, col_fn=col_royal_stone_trim)

    # === FRONT GATE (+Y = +1.36, seen on opponent castle) ===
    # Projecting gatehouse bastion
    add_beveled_box(bm, (1.68, 0.42, 2.28), center=(0, 1.38, 0.42), bevel=0.05, mat_idx=1, col_fn=col_royal_stone_trim, taper_top=0.96)
    # Recessed double oak doors
    add_beveled_box(bm, (1.06, 0.18, 1.38), center=(0, 1.50, 0.44), bevel=0.02, mat_idx=4, col_fn=col_oak_wood)
    # Center door seam & horizontal iron/gold straps + twin ring knockers
    add_beveled_box(bm, (0.06, 0.22, 1.36), center=(0, 1.52, 0.44), bevel=0.01, mat_idx=2, col_fn=col_royal_gold)
    for kz in (0.78, 1.24):
        add_beveled_box(bm, (1.04, 0.21, 0.07), center=(0, 1.52, kz), bevel=0.01, mat_idx=2, col_fn=col_royal_gold)
    for kx in (-0.24, 0.24):
        add_cylinder_frustum(bm, 0.10, 0.10, 0.05, segs=10, center=(kx, 1.58, 0.98),
                             rot_euler=(math.pi * 0.5, 0, 0), mat_idx=2, col_fn=col_royal_gold)
    # Sculpted stone arch portal around the front doors
    add_arch_portal(bm, width=1.10, height=1.48, depth=0.34, center=(0, 1.48, 0.42), mat_idx=1, col_fn=col_royal_stone_trim)
    # Royal Winged Shield & Crown Crest above the front gate
    add_wing_relief(bm, span=0.92, height=0.46, thickness=0.12, center=(0, 1.58, 2.02), mat_idx=3, col_fn=col_polished_steel)
    add_beveled_box(bm, (0.44, 0.16, 0.50), center=(0, 1.60, 1.98), bevel=0.04, mat_idx=2, col_fn=col_royal_gold)
    add_beveled_box(bm, (0.34, 0.18, 0.38), center=(0, 1.62, 2.04), bevel=0.03, mat_idx=10)  # TeamAccent shield center
    add_uv_sphere(bm, 0.11, scale_xyz=(0.8, 0.6, 1.2), center=(0, 1.66, 2.23), u_segs=8, v_segs=6, mat_idx=7)  # Glowing gem
    # Twin Front Hanging Team Banners (+Y)
    for bx in (-1.18, 1.18):
        add_beveled_box(bm, (0.46, 0.08, 0.06), center=(bx, 1.44, 1.92), bevel=0.01, mat_idx=2, col_fn=col_royal_gold)
        add_beveled_box(bm, (0.38, 0.06, 0.96), center=(bx, 1.45, 0.96), bevel=0.01, mat_idx=2, col_fn=col_royal_gold)
        add_beveled_box(bm, (0.30, 0.08, 0.88), center=(bx, 1.46, 1.00), bevel=0.01, mat_idx=9)  # TeamBanner

    # === REAR WALL (-Y = -1.36, seen on player's own castle from camera! Matches kingdom-back.png) ===
    # 3 Arched Royal Windows with stone frames & warm amber glow
    for wx in (-0.78, 0.0, 0.78):
        add_beveled_box(bm, (0.42, 0.14, 0.68), center=(wx, -1.34, 0.98), bevel=0.03, mat_idx=1, col_fn=col_royal_stone_trim)
        add_beveled_box(bm, (0.28, 0.16, 0.54), center=(wx, -1.36, 1.04), bevel=0.02, mat_idx=6)  # Castle_Window glow
    # Grand Silver Double-Wing & Blue Diamond Gem Emblem on the rear frieze (matching kingdom-back.png)
    add_wing_relief(bm, span=1.18, height=0.52, thickness=0.14, center=(0, -1.42, 1.98), mat_idx=3, col_fn=col_polished_steel)
    add_beveled_box(bm, (0.42, 0.16, 0.46), center=(0, -1.44, 1.96), rot_euler=(0, 0.785, 0), bevel=0.03, mat_idx=2, col_fn=col_royal_gold)
    add_uv_sphere(bm, 0.15, scale_xyz=(0.9, 0.6, 1.25), center=(0, -1.48, 2.18), u_segs=8, v_segs=6, mat_idx=7)  # Castle_Gem
    # Twin Rear Hanging Team Banners (-Y) so player castle team color is unmistakable from behind
    for bx in (-1.28, 1.28):
        add_beveled_box(bm, (0.44, 0.08, 0.06), center=(bx, -1.42, 1.92), bevel=0.01, mat_idx=2, col_fn=col_royal_gold)
        add_beveled_box(bm, (0.36, 0.06, 0.92), center=(bx, -1.43, 1.00), bevel=0.01, mat_idx=2, col_fn=col_royal_gold)
        add_beveled_box(bm, (0.28, 0.08, 0.84), center=(bx, -1.44, 1.04), bevel=0.01, mat_idx=9)  # TeamBanner

    create_obj_from_bm(bm, 'Castle_Walls', all_mats, origin=(0, 0, 0.42), parent=root)

    # ---- 3. 4 Corner Round Towers (Castle_Tower_FL, FR, BL, BR) ----
    tower_specs = [
        ('Castle_Tower_FL', -1.96,  1.28),
        ('Castle_Tower_FR',  1.96,  1.28),
        ('Castle_Tower_BL', -1.96, -1.28),
        ('Castle_Tower_BR',  1.96, -1.28),
    ]
    for t_name, tx, ty in tower_specs:
        bm = bmesh.new()
        # Profiled stone tower shaft with flared base and corbeled parapet
        add_cylinder_frustum(
            bm, 0.76, 0.66, 2.65, segs=16, center=(tx, ty, 0.35), mat_idx=0, col_fn=col_royal_stone,
            bevel_rings=[(0.0, 0.80), (0.14, 0.72), (0.82, 0.64), (0.90, 0.74), (1.0, 0.76)]
        )
        # Golden collar ring on tower
        add_cylinder_frustum(bm, 0.69, 0.69, 0.14, segs=16, center=(tx, ty, 2.02), mat_idx=2, col_fn=col_royal_gold)
        # Sculpted silver wing & glowing gem relief on both front and back of each corner tower
        face_y = ty + (0.68 if ty > 0 else -0.68)
        add_wing_relief(bm, span=0.68, height=0.34, thickness=0.10, center=(tx, face_y, 1.55), mat_idx=3, col_fn=col_polished_steel)
        add_uv_sphere(bm, 0.10, scale_xyz=(0.8, 0.6, 1.2), center=(tx, face_y + (0.04 if ty > 0 else -0.04), 1.70), u_segs=8, v_segs=6, mat_idx=7)
        # 8 Crenellation merlons around tower top rim
        for mi in range(8):
            ang = (2.0 * math.pi * mi) / 8.0
            mx = tx + math.cos(ang) * 0.67
            my = ty + math.sin(ang) * 0.67
            add_beveled_box(bm, (0.24, 0.17, 0.25), center=(mx, my, 2.94),
                            rot_euler=(0, 0, ang + math.pi * 0.5), bevel=0.02, mat_idx=1, col_fn=col_royal_stone_trim)
        # Golden eave trim ring
        add_cylinder_frustum(bm, 0.84, 0.80, 0.10, segs=16, center=(tx, ty, 3.16), mat_idx=2, col_fn=col_royal_gold)
        # Curved fantasy conical TeamRoof
        add_cylinder_frustum(
            bm, 0.82, 0.03, 1.28, segs=16, center=(tx, ty, 3.24), mat_idx=8, col_fn=col_team_shading,
            bevel_rings=[(0.0, 0.84), (0.25, 0.58), (0.55, 0.34), (0.85, 0.12), (1.0, 0.02)]
        )
        # Golden spire finial
        add_cylinder_frustum(bm, 0.05, 0.02, 0.42, segs=8, center=(tx, ty, 4.44), mat_idx=2, col_fn=col_royal_gold)
        add_uv_sphere(bm, 0.10, center=(tx, ty, 4.58), u_segs=8, v_segs=6, mat_idx=2, col_fn=col_royal_gold)
        create_obj_from_bm(bm, t_name, all_mats, origin=(tx, ty, 0.35), parent=root)

    # ---- 4. Castle_Keep (Grand central royal keep & roof with gem dormers) ----
    bm = bmesh.new()
    # Keep drum rising from courtyard
    add_cylinder_frustum(
        bm, 1.24, 1.12, 2.15, segs=16, center=(0, -0.04, 1.75), mat_idx=0, col_fn=col_royal_stone,
        bevel_rings=[(0.0, 1.26), (0.2, 1.16), (0.82, 1.10), (0.92, 1.24), (1.0, 1.26)]
    )
    # 4 vertical stone buttress pilasters & 4 glowing royal windows
    for i in range(4):
        ang = (math.pi * 0.5) * i + math.pi * 0.25
        bx = math.cos(ang) * 1.14
        by = -0.04 + math.sin(ang) * 1.14
        add_beveled_box(bm, (0.26, 0.26, 1.85), center=(bx, by, 1.80), rot_euler=(0, 0, ang), bevel=0.02, mat_idx=1, col_fn=col_royal_stone_trim)
        wang = (math.pi * 0.5) * i
        wx = math.cos(wang) * 1.13
        wy = -0.04 + math.sin(wang) * 1.13
        add_beveled_box(bm, (0.38, 0.16, 0.62), center=(wx, wy, 2.55), rot_euler=(0, 0, wang + math.pi * 0.5), bevel=0.025, mat_idx=1, col_fn=col_royal_stone_trim)
        add_beveled_box(bm, (0.24, 0.18, 0.48), center=(wx, wy, 2.60), rot_euler=(0, 0, wang + math.pi * 0.5), bevel=0.015, mat_idx=6)
    # Golden royal collar band around keep
    add_cylinder_frustum(bm, 1.20, 1.20, 0.16, segs=16, center=(0, -0.04, 3.35), mat_idx=2, col_fn=col_royal_gold)
    # Keep crenellations (10 merlons)
    for mi in range(10):
        ang = (2.0 * math.pi * mi) / 10.0
        mx = math.cos(ang) * 1.16
        my = -0.04 + math.sin(ang) * 1.16
        add_beveled_box(bm, (0.30, 0.20, 0.30), center=(mx, my, 3.85),
                        rot_euler=(0, 0, ang + math.pi * 0.5), bevel=0.02, mat_idx=1, col_fn=col_royal_stone_trim)
    # Grand central conical TeamRoof
    add_cylinder_frustum(bm, 1.28, 1.24, 0.12, segs=16, center=(0, -0.04, 3.98), mat_idx=2, col_fn=col_royal_gold)
    add_cylinder_frustum(
        bm, 1.24, 0.04, 1.42, segs=16, center=(0, -0.04, 4.08), mat_idx=8, col_fn=col_team_shading,
        bevel_rings=[(0.0, 1.26), (0.25, 0.90), (0.55, 0.52), (0.85, 0.18), (1.0, 0.03)]
    )
    # 4 Golden Gable Dormers with glowing cyan diamond gems on the keep roof
    for i in range(4):
        ang = (math.pi * 0.5) * i
        dx = math.cos(ang) * 0.78
        dy = -0.04 + math.sin(ang) * 0.78
        add_beveled_box(bm, (0.36, 0.32, 0.42), center=(dx, dy, 4.30), rot_euler=(0, 0, ang + math.pi * 0.5), bevel=0.025, mat_idx=2, col_fn=col_royal_gold)
        add_uv_sphere(bm, 0.11, scale_xyz=(0.8, 0.6, 1.25), center=(math.cos(ang) * 0.92, -0.04 + math.sin(ang) * 0.92, 4.50), u_segs=8, v_segs=6, mat_idx=7)
    # Central spire mast
    add_cylinder_frustum(bm, 0.07, 0.03, 0.62, segs=10, center=(0, -0.04, 5.42), mat_idx=2, col_fn=col_royal_gold)
    add_uv_sphere(bm, 0.13, center=(0, -0.04, 5.58), u_segs=10, v_segs=8, mat_idx=2, col_fn=col_royal_gold)
    create_obj_from_bm(bm, 'Castle_Keep', all_mats, origin=(0, -0.04, 1.75), parent=root)

    # ---- 5. Castle_Flag_Main (Waving royal swallowtail banner at peak) ----
    bm = bmesh.new()
    add_beveled_box(bm, (0.72, 0.06, 0.36), center=(0.36, -0.04, 5.62), bevel=0.01, mat_idx=9)  # TeamBanner
    add_beveled_box(bm, (0.74, 0.07, 0.06), center=(0.36, -0.04, 5.94), bevel=0.01, mat_idx=2, col_fn=col_royal_gold)
    add_beveled_box(bm, (0.74, 0.07, 0.06), center=(0.36, -0.04, 5.60), bevel=0.01, mat_idx=2, col_fn=col_royal_gold)
    create_obj_from_bm(bm, 'Castle_Flag_Main', all_mats, origin=(0, -0.04, 5.62), parent=root)

    export_glb('castle-standard.glb')


# ==============================================================================
# 2. 要塞 (castle-fortress.glb)
# ==============================================================================

def build_castle_fortress():
    clear_scene()
    m_stone = get_mat('Castle_Stone', '#777e8f', roughness=0.84, use_vcol=True)
    m_trim  = get_mat('Castle_StoneTrim', '#a5aebe', roughness=0.76, use_vcol=True)
    m_iron  = get_mat('Castle_Iron', '#353a47', roughness=0.42, metallic=0.85, use_vcol=True)
    m_gold  = get_mat('Castle_Gold', '#f0b830', roughness=0.35, metallic=0.80, use_vcol=True)
    m_wood  = get_mat('Castle_Wood', '#4a2b13', roughness=0.85, use_vcol=True)
    m_win   = get_mat('Castle_Window', '#ff8c38', roughness=0.25, emission_hex='#ff6a18', emission_strength=2.4, use_vcol=False)
    m_gem   = get_mat('Castle_Gem', '#ff4824', roughness=0.18, emission_hex='#ff3814', emission_strength=2.4, use_vcol=False)
    m_roof  = get_mat('TeamRoof', '#2b88f5', roughness=0.55, use_vcol=False)
    m_banner = get_mat('TeamBanner', '#2f95ff', roughness=0.62, use_vcol=False)
    m_accent = get_mat('TeamAccent', '#2f95ff', roughness=0.55, use_vcol=False)

    all_mats = [m_stone, m_trim, m_iron, m_gold, m_wood, m_win, m_gem, m_roof, m_banner, m_accent]
    root = bpy.data.objects.new('Castle_Fortress_Root', None)
    bpy.context.collection.objects.link(root)

    # ---- 1. Castle_Base (Heavy battered glacis armor bastion & crag stones) ----
    bm = bmesh.new()
    add_beveled_box(bm, (5.55, 4.10, 0.36), center=(0, 0, 0.0), bevel=0.10, mat_idx=0, col_fn=col_fortress_stone, taper_top=0.92)
    add_beveled_box(bm, (5.05, 3.65, 0.28), center=(0, 0, 0.32), bevel=0.06, mat_idx=2, col_fn=col_dark_iron, taper_top=0.95)
    # Iron corner cleats
    for sx in (-1, 1):
        for sy in (-1, 1):
            add_beveled_box(bm, (0.65, 0.65, 0.44), center=(sx * 2.45, sy * 1.75, 0.0), bevel=0.04, mat_idx=2, col_fn=col_dark_iron, taper_top=0.85)
    create_obj_from_bm(bm, 'Castle_Base', all_mats, origin=(0, 0, 0), parent=root)

    # ---- 2. Castle_Walls (Thick battered military curtain walls, iron armor bands, Front & Rear gates) ----
    bm = bmesh.new()
    add_beveled_box(bm, (4.35, 3.00, 2.25), center=(0, 0, 0.48), bevel=0.08, mat_idx=0, col_fn=col_fortress_stone, taper_top=0.88)
    # Twin horizontal dark iron armor bands with golden rivets
    for bz in (1.35, 2.15):
        add_beveled_box(bm, (4.32, 2.98, 0.16), center=(0, 0, bz), bevel=0.02, mat_idx=2, col_fn=col_dark_iron)
    for rx in (-1.45, -0.85, 0.85, 1.45):
        for sy in (-1, 1):
            add_uv_sphere(bm, 0.06, center=(rx, sy * 1.50, 2.22), u_segs=6, v_segs=6, mat_idx=3, col_fn=col_royal_gold)
    # Overhanging iron-reinforced machicolation parapet
    add_beveled_box(bm, (4.42, 3.08, 0.24), center=(0, 0, 2.58), bevel=0.03, mat_idx=1, col_fn=col_fortress_stone)
    # Heavy notched merlons
    for ix in (-1.35, -0.80, -0.26, 0.26, 0.80, 1.35):
        for sy in (-1, 1):
            add_beveled_box(bm, (0.40, 0.28, 0.36), center=(ix, sy * 1.42, 2.78), bevel=0.03, mat_idx=1, col_fn=col_fortress_stone, taper_top=0.92)

    # === FRONT GATE (+Y = +1.50): Iron-plated Barbican & Spiked Portcullis ===
    add_beveled_box(bm, (1.92, 0.56, 2.45), center=(0, 1.48, 0.48), bevel=0.06, mat_idx=0, col_fn=col_fortress_stone, taper_top=0.90)
    add_beveled_box(bm, (1.22, 0.18, 1.45), center=(0, 1.66, 0.52), bevel=0.02, mat_idx=5)  # Glowing forge interior
    # Iron portcullis bars (5 vertical + 3 horizontal)
    for px in (-0.42, -0.21, 0.0, 0.21, 0.42):
        add_beveled_box(bm, (0.07, 0.22, 1.42), center=(px, 1.70, 0.52), bevel=0.01, mat_idx=2, col_fn=col_dark_iron)
    for pz in (0.95, 1.35, 1.72):
        add_beveled_box(bm, (1.14, 0.22, 0.08), center=(0, 1.70, pz), bevel=0.01, mat_idx=2, col_fn=col_dark_iron)
    add_arch_portal(bm, width=1.22, height=1.55, depth=0.40, center=(0, 1.62, 0.48), mat_idx=2, col_fn=col_dark_iron)
    # War Shield & Crossed Blades Crest above front gate
    add_beveled_box(bm, (0.56, 0.18, 0.58), center=(0, 1.72, 2.15), bevel=0.04, mat_idx=3, col_fn=col_royal_gold)
    add_beveled_box(bm, (0.42, 0.20, 0.44), center=(0, 1.74, 2.22), bevel=0.03, mat_idx=9)  # TeamAccent
    for bx in (-1.28, 1.28):
        add_beveled_box(bm, (0.42, 0.08, 0.96), center=(bx, 1.56, 1.05), bevel=0.01, mat_idx=3, col_fn=col_royal_gold)
        add_beveled_box(bm, (0.34, 0.10, 0.88), center=(bx, 1.57, 1.09), bevel=0.01, mat_idx=8)  # TeamBanner

    # === REAR WALL (-Y = -1.50): Armored Citadel Rear with Forge Slits & War Crest ===
    for wx in (-0.88, 0.0, 0.88):
        add_beveled_box(bm, (0.46, 0.18, 0.78), center=(wx, -1.48, 0.96), bevel=0.03, mat_idx=2, col_fn=col_dark_iron)
        add_beveled_box(bm, (0.26, 0.20, 0.62), center=(wx, -1.50, 1.04), bevel=0.015, mat_idx=5)  # Forge glow
    # Crossed War-Blades & Team War-Crest on Rear Wall
    for ang_y in (-0.65, 0.65):
        add_beveled_box(bm, (1.15, 0.14, 0.14), center=(0, -1.52, 2.18), rot_euler=(0, ang_y, 0), bevel=0.02, mat_idx=3, col_fn=col_royal_gold)
    add_beveled_box(bm, (0.54, 0.18, 0.58), center=(0, -1.55, 1.98), bevel=0.04, mat_idx=2, col_fn=col_dark_iron)
    add_beveled_box(bm, (0.40, 0.20, 0.44), center=(0, -1.57, 2.05), bevel=0.03, mat_idx=9)  # TeamAccent
    for bx in (-1.34, 1.34):
        add_beveled_box(bm, (0.42, 0.08, 0.94), center=(bx, -1.52, 1.05), bevel=0.01, mat_idx=3, col_fn=col_royal_gold)
        add_beveled_box(bm, (0.34, 0.10, 0.86), center=(bx, -1.53, 1.09), bevel=0.01, mat_idx=8)  # TeamBanner

    create_obj_from_bm(bm, 'Castle_Walls', all_mats, origin=(0, 0, 0.48), parent=root)

    # ---- 3. 4 Heavy Octagonal Bastion Towers (Castle_Tower_FL, FR, BL, BR) ----
    tower_specs = [
        ('Castle_Tower_FL', -2.10,  1.36),
        ('Castle_Tower_FR',  2.10,  1.36),
        ('Castle_Tower_BL', -2.10, -1.36),
        ('Castle_Tower_BR',  2.10, -1.36),
    ]
    for t_name, tx, ty in tower_specs:
        bm = bmesh.new()
        # 8-sided heavy octagonal bastion shaft
        add_cylinder_frustum(
            bm, 0.90, 0.76, 2.65, segs=8, center=(tx, ty, 0.40), mat_idx=0, col_fn=col_fortress_stone,
            bevel_rings=[(0.0, 0.94), (0.18, 0.82), (0.80, 0.74), (0.90, 0.88), (1.0, 0.90)]
        )
        # Iron armor bands on octagonal tower
        for bz in (1.40, 2.25):
            add_cylinder_frustum(bm, 0.82, 0.82, 0.16, segs=8, center=(tx, ty, bz), mat_idx=2, col_fn=col_dark_iron)
        # 8 heavy battlements around top
        for mi in range(8):
            ang = (2.0 * math.pi * mi) / 8.0 + (math.pi / 8.0)
            mx = tx + math.cos(ang) * 0.78
            my = ty + math.sin(ang) * 0.78
            add_beveled_box(bm, (0.30, 0.22, 0.34), center=(mx, my, 3.00),
                            rot_euler=(0, 0, ang + math.pi * 0.5), bevel=0.025, mat_idx=2, col_fn=col_dark_iron)
        # Armored octagonal TeamRoof pavilion cap + iron spike finial
        add_cylinder_frustum(bm, 0.88, 0.36, 0.62, segs=8, center=(tx, ty, 3.22), mat_idx=7)  # TeamRoof lower tier
        add_cylinder_frustum(bm, 0.44, 0.40, 0.14, segs=8, center=(tx, ty, 3.82), mat_idx=2, col_fn=col_dark_iron)
        add_cylinder_frustum(bm, 0.42, 0.04, 0.55, segs=8, center=(tx, ty, 3.94), mat_idx=7)  # TeamRoof upper tier
        add_cylinder_frustum(bm, 0.07, 0.01, 0.38, segs=6, center=(tx, ty, 4.46), mat_idx=3, col_fn=col_royal_gold)
        create_obj_from_bm(bm, t_name, all_mats, origin=(tx, ty, 0.40), parent=root)

    # ---- 4. Castle_Keep (Two-Stage Octagonal Command Citadel) ----
    bm = bmesh.new()
    add_cylinder_frustum(
        bm, 1.48, 1.28, 2.15, segs=8, center=(0, -0.04, 1.85), mat_idx=0, col_fn=col_fortress_stone,
        bevel_rings=[(0.0, 1.50), (0.25, 1.36), (0.82, 1.28), (0.92, 1.42), (1.0, 1.44)]
    )
    add_cylinder_frustum(bm, 1.38, 1.38, 0.20, segs=8, center=(0, -0.04, 3.25), mat_idx=2, col_fn=col_dark_iron)
    # 4 heavy buttress piers & 4 glowing forge embrasures on central citadel
    for i in range(4):
        ang = (math.pi * 0.5) * i + math.pi * 0.25
        bx = math.cos(ang) * 1.32
        by = -0.04 + math.sin(ang) * 1.32
        add_beveled_box(bm, (0.36, 0.36, 1.95), center=(bx, by, 1.90), rot_euler=(0, 0, ang), bevel=0.03, mat_idx=2, col_fn=col_dark_iron)
        wang = (math.pi * 0.5) * i
        wx = math.cos(wang) * 1.30
        wy = -0.04 + math.sin(wang) * 1.30
        add_beveled_box(bm, (0.44, 0.20, 0.65), center=(wx, wy, 2.55), rot_euler=(0, 0, wang + math.pi * 0.5), bevel=0.025, mat_idx=2, col_fn=col_dark_iron)
        add_beveled_box(bm, (0.24, 0.22, 0.50), center=(wx, wy, 2.62), rot_euler=(0, 0, wang + math.pi * 0.5), bevel=0.015, mat_idx=5)
    # Keep octagonal tiered TeamRoof & war standard spire
    add_cylinder_frustum(bm, 1.42, 0.68, 0.68, segs=8, center=(0, -0.04, 3.96), mat_idx=7)
    add_cylinder_frustum(bm, 0.78, 0.74, 0.16, segs=8, center=(0, -0.04, 4.62), mat_idx=2, col_fn=col_dark_iron)
    add_cylinder_frustum(bm, 0.72, 0.05, 0.66, segs=8, center=(0, -0.04, 4.76), mat_idx=7)
    add_cylinder_frustum(bm, 0.08, 0.02, 0.58, segs=8, center=(0, -0.04, 5.38), mat_idx=3, col_fn=col_royal_gold)
    create_obj_from_bm(bm, 'Castle_Keep', all_mats, origin=(0, -0.04, 1.85), parent=root)

    # ---- 5. Castle_Flag_Main (Armored War Standard) ----
    bm = bmesh.new()
    add_beveled_box(bm, (0.76, 0.07, 0.38), center=(0.38, -0.04, 5.52), bevel=0.01, mat_idx=8)  # TeamBanner
    add_beveled_box(bm, (0.78, 0.08, 0.07), center=(0.38, -0.04, 5.86), bevel=0.01, mat_idx=3, col_fn=col_royal_gold)
    create_obj_from_bm(bm, 'Castle_Flag_Main', all_mats, origin=(0, -0.04, 5.52), parent=root)

    export_glb('castle-fortress.glb')


# ==============================================================================
# SHARED CHIBI FACE HELPER FOR SOLDIERS
# ==============================================================================

def add_chibi_face(bm, head_center, head_r, mat_skin, mat_eye, mat_gold=None):
    """Sculpted cartoon chibi head with eyes, white eye-sparkles, confident eyebrows & nose."""
    hx, hy, hz = head_center
    add_uv_sphere(bm, head_r, scale_xyz=(1.04, 0.98, 0.98), center=(hx, hy, hz),
                  u_segs=16, v_segs=12, mat_idx=mat_skin, col_fn=col_chibi_skin)
    # Nose button
    add_uv_sphere(bm, head_r * 0.14, scale_xyz=(0.9, 1.1, 0.85),
                  center=(hx, hy + head_r * 0.94, hz - head_r * 0.06),
                  u_segs=8, v_segs=6, mat_idx=mat_skin, col_fn=col_chibi_skin)
    # Expressive dark eyes + eyebrows on +Y front face
    for side in (-1, 1):
        ex = hx + side * head_r * 0.38
        ey = hy + head_r * 0.87
        ez = hz + head_r * 0.04
        add_uv_sphere(bm, head_r * 0.17, scale_xyz=(0.82, 0.45, 1.15),
                      center=(ex, ey, ez), u_segs=10, v_segs=8, mat_idx=mat_eye,
                      col_fn=lambda co, n: (0.10, 0.08, 0.12))
        # Eye highlight sparkle
        add_uv_sphere(bm, head_r * 0.065, scale_xyz=(0.8, 0.5, 0.8),
                      center=(ex - side * 0.025, ey + 0.035, ez + 0.035),
                      u_segs=6, v_segs=6, mat_idx=mat_skin,
                      col_fn=lambda co, n: (1.0, 1.0, 1.0))
        # Confident eyebrow
        add_beveled_box(bm, (head_r * 0.34, 0.05, 0.045),
                        center=(ex, ey + 0.01, ez + head_r * 0.22),
                        rot_euler=(0, side * 0.18, 0), bevel=0.01, mat_idx=mat_eye,
                        col_fn=lambda co, n: (0.28, 0.18, 0.10))


# ==============================================================================
# 3. 歩兵 (unit-infantry.glb)
# ==============================================================================

def build_unit_infantry():
    clear_scene()
    m_steel  = get_mat('Unit_Steel', '#dce6f2', roughness=0.32, metallic=0.72, use_vcol=True)
    m_gold   = get_mat('Unit_Gold', '#f5be36', roughness=0.30, metallic=0.80, use_vcol=True)
    m_skin   = get_mat('Unit_Skin', '#ffe0c4', roughness=0.75, use_vcol=True)
    m_leather = get_mat('Unit_Leather', '#633b1c', roughness=0.82, use_vcol=True)
    m_dark   = get_mat('Unit_Dark', '#18141c', roughness=0.45, use_vcol=True)
    m_gem    = get_mat('Unit_GlowBlue', '#4ce8ff', roughness=0.15, emission_hex='#38d8ff', emission_strength=2.2, use_vcol=False)
    m_accent = get_mat('TeamAccent', '#2f95ff', roughness=0.52, use_vcol=False)
    m_cape   = get_mat('TeamCape', '#1d6fe0', roughness=0.68, use_vcol=False)
    m_plume  = get_mat('TeamPlume', '#38a6ff', roughness=0.58, use_vcol=False)

    all_mats = [m_steel, m_gold, m_skin, m_leather, m_dark, m_gem, m_accent, m_cape, m_plume]
    root = bpy.data.objects.new('Unit_Infantry_Root', None)
    bpy.context.collection.objects.link(root)

    # ---- 1. Anim_Body (Tunic skirt, steel cuirass, belt & pauldrons; pivot at waist Z=0.46) ----
    bm = bmesh.new()
    # Team-colored pleated tunic skirt with gold bottom trim
    add_cylinder_frustum(bm, 0.34, 0.26, 0.24, segs=14, center=(0, 0, 0.34), mat_idx=6)  # TeamAccent
    add_cylinder_frustum(bm, 0.35, 0.34, 0.04, segs=14, center=(0, 0, 0.33), mat_idx=1, col_fn=col_royal_gold)
    # Leather belt & gold buckle
    add_cylinder_frustum(bm, 0.28, 0.28, 0.09, segs=14, center=(0, 0, 0.50), mat_idx=3, col_fn=col_oak_wood)
    add_beveled_box(bm, (0.14, 0.08, 0.11), center=(0, 0.26, 0.49), bevel=0.015, mat_idx=1, col_fn=col_royal_gold)
    # Sculpted steel breastplate cuirass
    add_cylinder_frustum(
        bm, 0.27, 0.31, 0.42, segs=14, center=(0, 0, 0.56), mat_idx=0, col_fn=col_polished_steel,
        bevel_rings=[(0.0, 0.26), (0.35, 0.31), (0.85, 0.30), (1.0, 0.24)]
    )
    # Golden collar rim & chest royal emblem
    add_cylinder_frustum(bm, 0.26, 0.23, 0.06, segs=14, center=(0, 0, 0.93), mat_idx=1, col_fn=col_royal_gold)
    add_beveled_box(bm, (0.16, 0.08, 0.18), center=(0, 0.28, 0.68), bevel=0.02, mat_idx=1, col_fn=col_royal_gold)
    # Left & Right layered steel pauldrons (shoulder armor) with gold trim
    for side in (-1, 1):
        add_uv_sphere(bm, 0.16, scale_xyz=(1.1, 1.0, 0.85), center=(side * 0.33, 0, 0.88),
                      u_segs=10, v_segs=8, mat_idx=0, col_fn=col_polished_steel)
        add_cylinder_frustum(bm, 0.17, 0.15, 0.04, segs=10, center=(side * 0.33, 0, 0.83),
                             rot_euler=(0, side * 0.35, 0), mat_idx=1, col_fn=col_royal_gold)
    body_obj = create_obj_from_bm(bm, 'Anim_Body', all_mats, origin=(0, 0, 0.46), parent=root)

    # ---- 2. Anim_Head (Chibi head, Kingdom open-face ridge helmet & cheek guards; pivot at neck Z=0.98) ----
    bm = bmesh.new()
    add_chibi_face(bm, (0, 0.02, 1.20), 0.27, mat_skin=2, mat_eye=4, mat_gold=1)
    # Open-bottomed steel helmet dome tilted back so eyes & eyebrows are 100% visible!
    add_helmet_dome(bm, 0.305, scale_xyz=(1.06, 1.06, 0.96), center=(0, -0.01, 1.30),
                    rot_euler=(0.18, 0, 0), u_segs=16, v_rings=7, mat_idx=0, col_fn=col_polished_steel)
    # Golden helmet brow band above the eyebrows & central crest ridge
    add_cylinder_frustum(bm, 0.32, 0.31, 0.065, segs=16, center=(0, -0.01, 1.29),
                         rot_euler=(0.18, 0, 0), mat_idx=1, col_fn=col_royal_gold)
    add_beveled_box(bm, (0.09, 0.44, 0.16), center=(0, -0.03, 1.48), rot_euler=(0.12, 0, 0),
                    bevel=0.025, mat_idx=1, col_fn=col_royal_gold)
    # Hinged steel cheek guards framing the sides of the chibi face
    for side in (-1, 1):
        add_beveled_box(bm, (0.07, 0.18, 0.23), center=(side * 0.27, 0.01, 1.07),
                        rot_euler=(0.10, -side * 0.15, 0), bevel=0.02, mat_idx=0, col_fn=col_polished_steel)
    head_obj = create_obj_from_bm(bm, 'Anim_Head', all_mats, origin=(0, 0, 0.98), parent=body_obj)

    # ---- 3. Anim_Plume (Sweeping team feather plume on helmet; pivot at Z=1.58) ----
    bm = bmesh.new()
    add_uv_sphere(bm, 0.15, scale_xyz=(0.55, 1.35, 0.95), center=(0, -0.10, 1.66),
                  rot_euler=(-0.35, 0, 0), u_segs=10, v_segs=8, mat_idx=8)  # TeamPlume
    add_uv_sphere(bm, 0.13, scale_xyz=(0.50, 1.25, 0.85), center=(0, -0.26, 1.56),
                  rot_euler=(-0.75, 0, 0), u_segs=10, v_segs=8, mat_idx=8)
    create_obj_from_bm(bm, 'Anim_Plume', all_mats, origin=(0, -0.04, 1.58), parent=head_obj)

    # ---- 4. Anim_ArmR (Right arm + Heroic Broad Short-Sword; pivot at shoulder X=+0.34, Z=0.86) ----
    bm = bmesh.new()
    # Upper arm & steel gauntlet cuff + hand
    add_cylinder_frustum(bm, 0.10, 0.11, 0.26, segs=10, center=(0.36, 0.10, 0.66),
                         rot_euler=(-0.55, 0, 0), mat_idx=0, col_fn=col_polished_steel)
    add_uv_sphere(bm, 0.10, center=(0.36, 0.22, 0.64), u_segs=8, v_segs=8, mat_idx=3, col_fn=col_oak_wood)
    # Broad Heroic Sword (pommel, grip, golden crossguard with blue gem, wide beveled steel blade)
    add_uv_sphere(bm, 0.075, center=(0.36, 0.22, 0.44), u_segs=8, v_segs=6, mat_idx=1, col_fn=col_royal_gold)
    add_cylinder_frustum(bm, 0.048, 0.052, 0.24, segs=8, center=(0.36, 0.22, 0.48), mat_idx=3, col_fn=col_oak_wood)
    add_beveled_box(bm, (0.36, 0.11, 0.09), center=(0.36, 0.22, 0.72), bevel=0.02, mat_idx=1, col_fn=col_royal_gold)
    add_uv_sphere(bm, 0.055, center=(0.36, 0.27, 0.76), u_segs=6, v_segs=6, mat_idx=5)  # Blue gem on crossguard
    # Thick beveled double-edged steel blade + tapered tip
    add_beveled_box(bm, (0.17, 0.055, 0.64), center=(0.36, 0.22, 0.80), bevel=0.015, mat_idx=0, col_fn=col_polished_steel, taper_top=0.72)
    add_cylinder_frustum(bm, 0.08, 0.005, 0.22, segs=4, center=(0.36, 0.22, 1.42),
                         rot_euler=(0, 0, math.pi * 0.25), mat_idx=0, col_fn=col_polished_steel)
    create_obj_from_bm(bm, 'Anim_ArmR', all_mats, origin=(0.34, 0.0, 0.86), parent=body_obj)

    # ---- 5. Anim_ArmL (Left arm + Gold-rimmed Kingdom Heater Shield; pivot at shoulder X=-0.34, Z=0.86) ----
    bm = bmesh.new()
    add_cylinder_frustum(bm, 0.10, 0.11, 0.24, segs=10, center=(-0.35, 0.12, 0.66),
                         rot_euler=(-0.65, 0, 0), mat_idx=0, col_fn=col_polished_steel)
    # Large Kingdom Heater Shield angled protectively in front-left
    sh_center = (-0.34, 0.28, 0.42)
    sh_rot = (0.12, -0.18, 0.28)
    add_beveled_box(bm, (0.56, 0.10, 0.66), center=sh_center, rot_euler=sh_rot,
                    bevel=0.04, mat_idx=1, col_fn=col_royal_gold, taper_top=1.08)
    add_beveled_box(bm, (0.44, 0.12, 0.54), center=(-0.34, 0.30, 0.48), rot_euler=sh_rot,
                    bevel=0.03, mat_idx=6, taper_top=1.08)  # TeamAccent shield field
    # Raised golden royal crest & diamond gem in center of shield
    add_beveled_box(bm, (0.20, 0.14, 0.24), center=(-0.34, 0.32, 0.62), rot_euler=sh_rot,
                    bevel=0.02, mat_idx=1, col_fn=col_royal_gold)
    add_uv_sphere(bm, 0.06, center=(-0.34, 0.37, 0.74), u_segs=6, v_segs=6, mat_idx=5)
    create_obj_from_bm(bm, 'Anim_ArmL', all_mats, origin=(-0.34, 0.0, 0.86), parent=body_obj)

    # ---- 6. Anim_LegL & Anim_LegR (Chibi legs & cuffed leather boots; pivots at Z=0.40) ----
    for side, l_name in ((-1, 'Anim_LegL'), (1, 'Anim_LegR')):
        bm = bmesh.new()
        lx = side * 0.14
        add_cylinder_frustum(bm, 0.115, 0.105, 0.24, segs=10, center=(lx, 0, 0.08), mat_idx=3, col_fn=col_oak_wood)
        add_cylinder_frustum(bm, 0.13, 0.12, 0.07, segs=10, center=(lx, 0, 0.24), mat_idx=1, col_fn=col_royal_gold)
        add_beveled_box(bm, (0.22, 0.30, 0.13), center=(lx, 0.04, 0.0), bevel=0.03, mat_idx=3, col_fn=col_oak_wood)
        create_obj_from_bm(bm, l_name, all_mats, origin=(lx, 0.0, 0.38), parent=root)

    # ---- 7. Anim_Cape (Billowing team cape flaring outward at bottom hem; pivot at Z=0.90) ----
    bm = bmesh.new()
    add_beveled_box(bm, (0.66, 0.09, 0.66), center=(0, -0.34, 0.24),
                    rot_euler=(-0.22, 0, 0), bevel=0.03, mat_idx=7, taper_top=0.66)  # TeamCape
    add_beveled_box(bm, (0.68, 0.11, 0.07), center=(0, -0.35, 0.23),
                    rot_euler=(-0.22, 0, 0), bevel=0.015, mat_idx=1, col_fn=col_royal_gold)
    create_obj_from_bm(bm, 'Anim_Cape', all_mats, origin=(0, -0.20, 0.90), parent=body_obj)

    export_glb('unit-infantry.glb')


# ==============================================================================
# 4. 騎士 (unit-knight.glb) — Sculpted Royal Warhorse + Armored Chibi Cavalier
# ==============================================================================

def build_unit_knight():
    clear_scene()
    m_steel   = get_mat('Unit_Steel', '#e2ebf5', roughness=0.28, metallic=0.78, use_vcol=True)
    m_gold    = get_mat('Unit_Gold', '#f5be36', roughness=0.30, metallic=0.82, use_vcol=True)
    m_skin    = get_mat('Unit_Skin', '#ffe0c4', roughness=0.75, use_vcol=True)
    m_horse   = get_mat('Unit_Horse', '#fff5e4', roughness=0.74, use_vcol=True)
    m_leather = get_mat('Unit_Leather', '#5e3618', roughness=0.82, use_vcol=True)
    m_dark    = get_mat('Unit_Dark', '#242028', roughness=0.50, use_vcol=True)
    m_cream   = get_mat('Unit_Cream', '#fff8eb', roughness=0.65, use_vcol=True)
    m_gem     = get_mat('Unit_GlowBlue', '#4ce8ff', roughness=0.15, emission_hex='#38d8ff', emission_strength=2.2, use_vcol=False)
    m_barding = get_mat('TeamRoof', '#2b88f5', roughness=0.55, use_vcol=False)
    m_accent  = get_mat('TeamAccent', '#2f95ff', roughness=0.52, use_vcol=False)
    m_cape    = get_mat('TeamCape', '#1d6fe0', roughness=0.65, use_vcol=False)
    m_plume   = get_mat('TeamPlume', '#38a6ff', roughness=0.55, use_vcol=False)

    all_mats = [m_steel, m_gold, m_skin, m_horse, m_leather, m_dark, m_cream, m_gem, m_barding, m_accent, m_cape, m_plume]
    root = bpy.data.objects.new('Unit_Knight_Root', None)
    bpy.context.collection.objects.link(root)

    # ---- 1. Anim_MountBody (Sculpted Warhorse Torso, Royal Caparison Barding & Saddle; pivot Z=0.65) ----
    bm = bmesh.new()
    # Sculpted organic horse chest, barrel, and hindquarters
    add_uv_sphere(bm, 0.36, scale_xyz=(0.92, 1.45, 0.90), center=(0, 0.0, 0.68),
                  u_segs=16, v_segs=12, mat_idx=3, col_fn=col_horse_coat)
    add_uv_sphere(bm, 0.33, scale_xyz=(0.94, 0.95, 0.92), center=(0, 0.34, 0.72),
                  u_segs=14, v_segs=10, mat_idx=3, col_fn=col_horse_coat)
    add_uv_sphere(bm, 0.34, scale_xyz=(0.94, 0.98, 0.92), center=(0, -0.34, 0.70),
                  u_segs=14, v_segs=10, mat_idx=3, col_fn=col_horse_coat)
    # Royal team-colored caparison (horse barding skirt) draped over flanks & hindquarters with gold trim
    add_beveled_box(bm, (0.74, 0.96, 0.38), center=(0, -0.04, 0.44),
                    bevel=0.06, mat_idx=8, taper_top=0.88)  # TeamRoof barding
    add_beveled_box(bm, (0.76, 0.98, 0.07), center=(0, -0.04, 0.42),
                    bevel=0.02, mat_idx=1, col_fn=col_royal_gold)
    # Golden breastcollar strap & front medallion on horse chest
    add_beveled_box(bm, (0.68, 0.24, 0.09), center=(0, 0.56, 0.70), bevel=0.02, mat_idx=1, col_fn=col_royal_gold)
    add_uv_sphere(bm, 0.11, scale_xyz=(1.0, 0.5, 1.0), center=(0, 0.68, 0.72), u_segs=8, v_segs=6, mat_idx=1, col_fn=col_royal_gold)
    add_uv_sphere(bm, 0.06, center=(0, 0.72, 0.72), u_segs=6, v_segs=6, mat_idx=7)
    # Leather saddle with high cantle & golden trim
    add_beveled_box(bm, (0.52, 0.48, 0.16), center=(0, -0.02, 0.88), bevel=0.03, mat_idx=4, col_fn=col_oak_wood)
    add_beveled_box(bm, (0.48, 0.12, 0.24), center=(0, -0.22, 0.92), rot_euler=(-0.25, 0, 0), bevel=0.02, mat_idx=1, col_fn=col_royal_gold)
    mount_body = create_obj_from_bm(bm, 'Anim_MountBody', all_mats, origin=(0, 0, 0.65), parent=root)

    # ---- 2. Anim_MountHead (Sculpted Horse Neck, Head, Golden Mane, Ears, Chanfron & Bridle; pivot Y=+0.36, Z=0.84) ----
    bm = bmesh.new()
    # Muscular arched horse neck
    add_cylinder_frustum(bm, 0.25, 0.19, 0.52, segs=12, center=(0, 0.34, 0.78),
                         rot_euler=(-0.52, 0, 0), mat_idx=3, col_fn=col_horse_coat)
    # Sculpted horse cranium & tapered muzzle
    add_uv_sphere(bm, 0.22, scale_xyz=(0.88, 1.10, 0.95), center=(0, 0.60, 1.18),
                  u_segs=12, v_segs=10, mat_idx=3, col_fn=col_horse_coat)
    add_cylinder_frustum(bm, 0.17, 0.125, 0.34, segs=12, center=(0, 0.66, 1.14),
                         rot_euler=(-1.12, 0, 0), mat_idx=3, col_fn=col_horse_coat)
    # Horse dark eyes & perked ears
    for side in (-1, 1):
        add_uv_sphere(bm, 0.055, center=(side * 0.17, 0.66, 1.22), u_segs=8, v_segs=6, mat_idx=5,
                      col_fn=lambda co, n: (0.10, 0.08, 0.12))
        add_uv_sphere(bm, 0.022, center=(side * 0.18, 0.68, 1.24), u_segs=6, v_segs=6, mat_idx=6,
                      col_fn=lambda co, n: (1.0, 1.0, 1.0))
        add_cylinder_frustum(bm, 0.055, 0.015, 0.18, segs=6, center=(side * 0.12, 0.52, 1.34),
                             rot_euler=(-0.2, side * 0.22, 0), mat_idx=3, col_fn=col_horse_coat)
    # Golden-blond wavy mane puffs along neck & forelock
    for mi in range(4):
        mz = 0.88 + mi * 0.12
        my = 0.24 + mi * 0.08
        add_uv_sphere(bm, 0.11, scale_xyz=(0.65, 1.1, 0.95), center=(0, my, mz),
                      u_segs=8, v_segs=6, mat_idx=1, col_fn=col_royal_gold)
    add_uv_sphere(bm, 0.10, scale_xyz=(0.75, 1.15, 0.75), center=(0, 0.66, 1.34),
                  u_segs=8, v_segs=6, mat_idx=1, col_fn=col_royal_gold)
    # Royal steel & gold forehead armor plate (chanfron) + golden noseband ring flush on horse muzzle
    add_beveled_box(bm, (0.17, 0.24, 0.06), center=(0, 0.72, 1.24), rot_euler=(-0.45, 0, 0),
                    bevel=0.015, mat_idx=0, col_fn=col_polished_steel)
    add_uv_sphere(bm, 0.045, center=(0, 0.75, 1.27), u_segs=6, v_segs=6, mat_idx=7)
    add_cylinder_frustum(bm, 0.148, 0.142, 0.045, segs=12, center=(0, 0.77, 1.09),
                         rot_euler=(-1.12, 0, 0), mat_idx=1, col_fn=col_royal_gold)
    create_obj_from_bm(bm, 'Anim_MountHead', all_mats, origin=(0, 0.36, 0.84), parent=mount_body)

    # ---- 3. 4 Articulated Horse Legs (Anim_MountLegFL, FR, BL, BR; pivots at Z=0.54) ----
    leg_specs = [
        ('Anim_MountLegFL', -0.22,  0.42),
        ('Anim_MountLegFR',  0.22,  0.42),
        ('Anim_MountLegBL', -0.22, -0.40),
        ('Anim_MountLegBR',  0.22, -0.40),
    ]
    for l_name, lx, ly in leg_specs:
        bm = bmesh.new()
        add_cylinder_frustum(bm, 0.095, 0.115, 0.42, segs=10, center=(lx, ly, 0.14), mat_idx=3, col_fn=col_horse_coat)
        add_cylinder_frustum(bm, 0.11, 0.095, 0.15, segs=10, center=(lx, ly, 0.0), mat_idx=5, col_fn=col_dark_iron)
        create_obj_from_bm(bm, l_name, all_mats, origin=(lx, ly, 0.54), parent=mount_body)

    # ---- 4. Anim_MountTail (Flowing cream-gold warhorse tail; pivot Y=-0.62, Z=0.76) ----
    bm = bmesh.new()
    add_uv_sphere(bm, 0.16, scale_xyz=(0.65, 1.45, 1.15), center=(0, -0.78, 0.62),
                  rot_euler=(0.65, 0, 0), u_segs=10, v_segs=8, mat_idx=1, col_fn=col_royal_gold)
    create_obj_from_bm(bm, 'Anim_MountTail', all_mats, origin=(0, -0.62, 0.76), parent=mount_body)

    # ---- 5. Rider Anim_Body (Seated Knight Torso, Plate Cuirass & Pauldrons; pivot Z=0.96) ----
    bm = bmesh.new()
    add_cylinder_frustum(
        bm, 0.25, 0.29, 0.44, segs=14, center=(0, -0.02, 0.96), mat_idx=0, col_fn=col_polished_steel,
        bevel_rings=[(0.0, 0.25), (0.4, 0.30), (0.85, 0.29), (1.0, 0.23)]
    )
    # Team tabard stripe & golden royal breast emblem
    add_beveled_box(bm, (0.24, 0.10, 0.36), center=(0, 0.23, 0.98), bevel=0.02, mat_idx=9)  # TeamAccent
    add_beveled_box(bm, (0.16, 0.12, 0.18), center=(0, 0.25, 1.10), bevel=0.02, mat_idx=1, col_fn=col_royal_gold)
    # Rider armored legs & golden stirrups gripping the saddle flanks
    for side in (-1, 1):
        add_beveled_box(bm, (0.14, 0.24, 0.32), center=(side * 0.32, 0.04, 0.66),
                        rot_euler=(0.35, 0, 0), bevel=0.02, mat_idx=0, col_fn=col_polished_steel)
        add_uv_sphere(bm, 0.16, scale_xyz=(1.15, 1.0, 0.85), center=(side * 0.32, -0.02, 1.30),
                      u_segs=10, v_segs=8, mat_idx=0, col_fn=col_polished_steel)
        add_cylinder_frustum(bm, 0.17, 0.15, 0.04, segs=10, center=(side * 0.32, -0.02, 1.25),
                             rot_euler=(0, side * 0.35, 0), mat_idx=1, col_fn=col_royal_gold)
    rider_body = create_obj_from_bm(bm, 'Anim_Body', all_mats, origin=(0, -0.02, 0.96), parent=root)

    # ---- 6. Rider Anim_Head (Chibi Cavalier Head & Crowned Visor Knight Helm; pivot Z=1.40) ----
    bm = bmesh.new()
    add_chibi_face(bm, (0, 0.0, 1.62), 0.25, mat_skin=2, mat_eye=5, mat_gold=1)
    add_helmet_dome(bm, 0.285, scale_xyz=(1.06, 1.06, 0.96), center=(0, -0.02, 1.71),
                    rot_euler=(0.18, 0, 0), u_segs=16, v_rings=7, mat_idx=0, col_fn=col_polished_steel)
    # Raised golden visor & crest ridge above the eyes
    add_beveled_box(bm, (0.44, 0.22, 0.11), center=(0, 0.16, 1.76), rot_euler=(-0.18, 0, 0),
                    bevel=0.02, mat_idx=1, col_fn=col_royal_gold)
    add_beveled_box(bm, (0.09, 0.42, 0.16), center=(0, -0.04, 1.88), rot_euler=(0.12, 0, 0),
                    bevel=0.02, mat_idx=1, col_fn=col_royal_gold)
    for side in (-1, 1):
        add_beveled_box(bm, (0.07, 0.18, 0.22), center=(side * 0.25, -0.01, 1.50),
                        rot_euler=(0.10, -side * 0.15, 0), bevel=0.02, mat_idx=0, col_fn=col_polished_steel)
    rider_head = create_obj_from_bm(bm, 'Anim_Head', all_mats, origin=(0, -0.02, 1.40), parent=rider_body)

    # ---- 7. Rider Anim_Plume (Flowing Cavalier Crest Plume; pivot Z=1.96) ----
    bm = bmesh.new()
    add_uv_sphere(bm, 0.16, scale_xyz=(0.55, 1.40, 0.95), center=(0, -0.12, 2.04),
                  rot_euler=(-0.38, 0, 0), u_segs=10, v_segs=8, mat_idx=11)  # TeamPlume
    add_uv_sphere(bm, 0.13, scale_xyz=(0.50, 1.30, 0.85), center=(0, -0.28, 1.94),
                  rot_euler=(-0.78, 0, 0), u_segs=10, v_segs=8, mat_idx=11)
    create_obj_from_bm(bm, 'Anim_Plume', all_mats, origin=(0, -0.06, 1.96), parent=rider_head)

    # ---- 8. Rider Anim_ArmR (Right Arm + Royal Tournament/War Lance; pivot X=+0.34, Z=1.28) ----
    bm = bmesh.new()
    add_cylinder_frustum(bm, 0.10, 0.11, 0.24, segs=10, center=(0.36, 0.08, 1.12),
                         rot_euler=(-0.75, 0, 0), mat_idx=0, col_fn=col_polished_steel)
    # Royal Lance angled forward (+Y) and slightly upward (+Z): grip, golden vamplate hand-cone, striped shaft, steel spearhead
    lance_rot = (-1.12, 0, 0)
    add_cylinder_frustum(bm, 0.06, 0.06, 0.38, segs=10, center=(0.38, -0.10, 0.98),
                         rot_euler=lance_rot, mat_idx=4, col_fn=col_oak_wood)
    # Golden conical vamplate guard
    add_cylinder_frustum(bm, 0.19, 0.07, 0.18, segs=12, center=(0.38, 0.22, 1.14),
                         rot_euler=lance_rot, mat_idx=1, col_fn=col_royal_gold)
    # Banded team & cream tapered lance shaft
    add_cylinder_frustum(bm, 0.11, 0.075, 0.42, segs=12, center=(0.38, 0.38, 1.22),
                         rot_euler=lance_rot, mat_idx=9)  # TeamAccent band 1
    add_cylinder_frustum(bm, 0.075, 0.050, 0.38, segs=12, center=(0.38, 0.76, 1.40),
                         rot_euler=lance_rot, mat_idx=6, col_fn=col_cream_cloth)  # Cream band
    add_cylinder_frustum(bm, 0.050, 0.032, 0.34, segs=12, center=(0.38, 1.10, 1.57),
                         rot_euler=lance_rot, mat_idx=9)  # TeamAccent band 2
    # Gleaming steel lance point with golden collar
    add_cylinder_frustum(bm, 0.065, 0.055, 0.08, segs=10, center=(0.38, 1.40, 1.72),
                         rot_euler=lance_rot, mat_idx=1, col_fn=col_royal_gold)
    add_cylinder_frustum(bm, 0.065, 0.004, 0.34, segs=6, center=(0.38, 1.47, 1.76),
                         rot_euler=lance_rot, mat_idx=0, col_fn=col_polished_steel)
    create_obj_from_bm(bm, 'Anim_ArmR', all_mats, origin=(0.34, -0.02, 1.28), parent=rider_body)

    # ---- 9. Rider Anim_ArmL (Left Arm + Cavalier Heraldic Shield; pivot X=-0.34, Z=1.28) ----
    bm = bmesh.new()
    add_cylinder_frustum(bm, 0.095, 0.105, 0.18, segs=10, center=(-0.34, 0.04, 1.14),
                         rot_euler=(-0.45, 0, 0), mat_idx=0, col_fn=col_polished_steel)
    sh_rot = (0.10, -0.22, 0.38)
    add_beveled_box(bm, (0.48, 0.09, 0.58), center=(-0.38, 0.24, 0.92), rot_euler=sh_rot,
                    bevel=0.035, mat_idx=1, col_fn=col_royal_gold, taper_top=1.08)
    add_beveled_box(bm, (0.38, 0.11, 0.46), center=(-0.39, 0.25, 0.98), rot_euler=sh_rot,
                    bevel=0.025, mat_idx=9, taper_top=1.08)
    add_beveled_box(bm, (0.16, 0.13, 0.20), center=(-0.40, 0.26, 1.10), rot_euler=sh_rot,
                    bevel=0.02, mat_idx=1, col_fn=col_royal_gold)
    create_obj_from_bm(bm, 'Anim_ArmL', all_mats, origin=(-0.34, -0.02, 1.28), parent=rider_body)

    # ---- 10. Rider Anim_Cape (Billowing cavalier cloak flaring at bottom hem; pivot Z=1.30) ----
    bm = bmesh.new()
    add_beveled_box(bm, (0.60, 0.09, 0.56), center=(0, -0.36, 0.78),
                    rot_euler=(-0.26, 0, 0), bevel=0.03, mat_idx=10, taper_top=0.66)  # TeamCape
    add_beveled_box(bm, (0.62, 0.10, 0.07), center=(0, -0.37, 0.77),
                    rot_euler=(-0.26, 0, 0), bevel=0.015, mat_idx=1, col_fn=col_royal_gold)
    create_obj_from_bm(bm, 'Anim_Cape', all_mats, origin=(0, -0.22, 1.30), parent=rider_body)

    export_glb('unit-knight.glb')


# ==============================================================================
# 5. 魔法使い (unit-mage.glb) — Chibi Arcane Wizard with Pointed Hat & Crystal Staff
# ==============================================================================

def build_unit_mage():
    clear_scene()
    m_gold    = get_mat('Unit_Gold', '#f5be36', roughness=0.30, metallic=0.80, use_vcol=True)
    m_skin    = get_mat('Unit_Skin', '#ffe0c4', roughness=0.75, use_vcol=True)
    m_cream   = get_mat('Unit_Cream', '#fff8eb', roughness=0.70, use_vcol=True)
    m_wood    = get_mat('Unit_Wood', '#5c3618', roughness=0.80, use_vcol=True)
    m_dark    = get_mat('Unit_Dark', '#18141c', roughness=0.45, use_vcol=True)
    m_orb     = get_mat('Unit_GlowBlue', '#4ce8ff', roughness=0.12, emission_hex='#38e0ff', emission_strength=2.8, use_vcol=False)
    m_hat     = get_mat('TeamRoof', '#2b88f5', roughness=0.58, use_vcol=False)
    m_accent  = get_mat('TeamAccent', '#2f95ff', roughness=0.55, use_vcol=False)
    m_cape    = get_mat('TeamCape', '#1d6fe0', roughness=0.65, use_vcol=False)

    all_mats = [m_gold, m_skin, m_cream, m_wood, m_dark, m_orb, m_hat, m_accent, m_cape]
    root = bpy.data.objects.new('Unit_Mage_Root', None)
    bpy.context.collection.objects.link(root)

    # ---- 1. Anim_Body (Flared Layered Arcane Robe, Gold Trim, Sun Belt & Collar Gem; pivot Z=0.44) ----
    bm = bmesh.new()
    # Inner pleated cream robe
    add_cylinder_frustum(bm, 0.34, 0.22, 0.56, segs=14, center=(0, 0, 0.18), mat_idx=2, col_fn=col_cream_cloth)
    # Outer flared team-colored wizard coat
    add_cylinder_frustum(
        bm, 0.42, 0.28, 0.72, segs=14, center=(0, 0, 0.22), mat_idx=7,
        bevel_rings=[(0.0, 0.44), (0.35, 0.34), (0.70, 0.27), (1.0, 0.29)]
    )
    # Golden bottom hem border & vertical front stole lapels
    add_cylinder_frustum(bm, 0.45, 0.43, 0.06, segs=14, center=(0, 0, 0.21), mat_idx=0, col_fn=col_royal_gold)
    for side in (-1, 1):
        add_beveled_box(bm, (0.08, 0.08, 0.68), center=(side * 0.11, 0.27, 0.24),
                        rot_euler=(0.14, 0, 0), bevel=0.015, mat_idx=0, col_fn=col_royal_gold)
    # Leather belt, golden sun buckle & glowing arcane collar gem
    add_cylinder_frustum(bm, 0.29, 0.29, 0.08, segs=14, center=(0, 0, 0.56), mat_idx=3, col_fn=col_oak_wood)
    add_uv_sphere(bm, 0.085, scale_xyz=(1.1, 0.5, 1.1), center=(0, 0.29, 0.60), u_segs=8, v_segs=6, mat_idx=0, col_fn=col_royal_gold)
    # High golden arcane mantle collar & glowing gem brooch
    add_cylinder_frustum(bm, 0.29, 0.34, 0.14, segs=14, center=(0, -0.02, 0.88), mat_idx=0, col_fn=col_royal_gold)
    add_uv_sphere(bm, 0.075, scale_xyz=(0.9, 0.6, 1.2), center=(0, 0.28, 0.88), u_segs=8, v_segs=6, mat_idx=5)  # Unit_GlowBlue
    body_obj = create_obj_from_bm(bm, 'Anim_Body', all_mats, origin=(0, 0, 0.44), parent=root)

    # ---- 2. Anim_Head (Chibi Face, Blond Hair & Curved Wide-Brimmed Wizard Hat; pivot Z=0.96) ----
    bm = bmesh.new()
    add_chibi_face(bm, (0, 0.02, 1.20), 0.27, mat_skin=1, mat_eye=4, mat_gold=0)
    # Golden-blond side locks AND back hair covering the back of the head under the hat brim
    for side in (-1, 1):
        add_uv_sphere(bm, 0.11, scale_xyz=(0.65, 0.85, 1.45), center=(side * 0.26, 0.08, 1.14),
                      rot_euler=(0.15, side * 0.18, 0), u_segs=8, v_segs=6, mat_idx=0, col_fn=col_royal_gold)
    add_uv_sphere(bm, 0.26, scale_xyz=(1.02, 0.75, 0.92), center=(0, -0.10, 1.20),
                  u_segs=12, v_segs=10, mat_idx=0, col_fn=col_royal_gold)
    # Oversized Wide Wizard Hat Brim with golden edge & hatband
    hat_tilt = (-0.14, 0.06, 0.0)
    add_cylinder_frustum(
        bm, 0.58, 0.32, 0.11, segs=16, center=(0, -0.01, 1.36), rot_euler=hat_tilt, mat_idx=6,
        bevel_rings=[(0.0, 0.56), (0.35, 0.58), (1.0, 0.33)]
    )
    add_cylinder_frustum(bm, 0.35, 0.33, 0.10, segs=16, center=(0, -0.02, 1.44), rot_euler=hat_tilt, mat_idx=0, col_fn=col_royal_gold)
    # Front golden diamond emblem & glowing gem on hatband
    add_beveled_box(bm, (0.16, 0.08, 0.18), center=(0, 0.32, 1.44), bevel=0.02, mat_idx=0, col_fn=col_royal_gold)
    add_uv_sphere(bm, 0.055, center=(0, 0.36, 1.52), u_segs=6, v_segs=6, mat_idx=5)
    # Curved 3-stage conical wizard hat crown curling backward/sideways with golden star finial
    add_cylinder_frustum(bm, 0.32, 0.20, 0.30, segs=14, center=(0, -0.03, 1.52),
                         rot_euler=(-0.24, 0.08, 0), mat_idx=6)
    add_cylinder_frustum(bm, 0.20, 0.10, 0.26, segs=12, center=(0.02, -0.10, 1.78),
                         rot_euler=(-0.55, 0.18, 0), mat_idx=6)
    add_cylinder_frustum(bm, 0.10, 0.02, 0.22, segs=10, center=(0.06, -0.22, 1.98),
                         rot_euler=(-0.95, 0.28, 0), mat_idx=6)
    add_uv_sphere(bm, 0.065, center=(0.11, -0.38, 2.08), u_segs=8, v_segs=6, mat_idx=0, col_fn=col_royal_gold)
    create_obj_from_bm(bm, 'Anim_Head', all_mats, origin=(0, 0, 0.96), parent=body_obj)

    # ---- 3. Anim_ArmR (Right Arm & Ornate Crescent Magic Staff; pivot X=+0.32, Z=0.84) ----
    bm = bmesh.new()
    # Flared wizard sleeve & gloved hand
    add_cylinder_frustum(bm, 0.15, 0.10, 0.26, segs=10, center=(0.35, 0.14, 0.66),
                         rot_euler=(-0.65, 0, 0), mat_idx=7)
    add_uv_sphere(bm, 0.09, center=(0.36, 0.24, 0.66), u_segs=8, v_segs=8, mat_idx=2, col_fn=col_cream_cloth)
    # Ornate wooden staff shaft with golden bands & Golden Crescent Cradle at top
    sx, sy = 0.40, 0.26
    add_cylinder_frustum(bm, 0.042, 0.054, 1.24, segs=10, center=(sx, sy, 0.10), mat_idx=3, col_fn=col_oak_wood)
    for gz in (0.45, 0.85, 1.26):
        add_cylinder_frustum(bm, 0.065, 0.065, 0.07, segs=10, center=(sx, sy, gz), mat_idx=0, col_fn=col_royal_gold)
    # Golden crescent & wing cradle holding the floating orb
    add_beveled_box(bm, (0.36, 0.10, 0.10), center=(sx, sy, 1.32), bevel=0.02, mat_idx=0, col_fn=col_royal_gold)
    for side in (-1, 1):
        add_beveled_box(bm, (0.09, 0.10, 0.28), center=(sx + side * 0.16, sy, 1.36),
                        rot_euler=(0, -side * 0.28, 0), bevel=0.02, mat_idx=0, col_fn=col_royal_gold)
    arm_r = create_obj_from_bm(bm, 'Anim_ArmR', all_mats, origin=(0.32, 0.0, 0.84), parent=body_obj)

    # ---- 4. Anim_StaffOrb (Floating Glowing Arcane Crystal & Astrolabe Ring; pivot at orb center) ----
    bm = bmesh.new()
    orb_center = (0.40, 0.26, 1.50)
    add_uv_sphere(bm, 0.13, scale_xyz=(0.95, 0.95, 1.18), center=orb_center, u_segs=10, v_segs=8, mat_idx=5)  # Unit_GlowBlue
    add_beveled_box(bm, (0.28, 0.04, 0.28), center=(0.40, 0.26, 1.36), rot_euler=(0, 0.785, 0),
                    bevel=0.01, mat_idx=0, col_fn=col_royal_gold)
    create_obj_from_bm(bm, 'Anim_StaffOrb', all_mats, origin=orb_center, parent=arm_r)

    # ---- 5. Anim_ArmL (Left Arm in Spellcasting Gesture with Golden Wrist Ring; pivot X=-0.32, Z=0.84) ----
    bm = bmesh.new()
    add_cylinder_frustum(bm, 0.15, 0.10, 0.26, segs=10, center=(-0.35, 0.16, 0.68),
                         rot_euler=(-0.78, 0, 0), mat_idx=7)
    add_cylinder_frustum(bm, 0.16, 0.15, 0.05, segs=10, center=(-0.35, 0.22, 0.64),
                         rot_euler=(-0.78, 0, 0), mat_idx=0, col_fn=col_royal_gold)
    add_uv_sphere(bm, 0.095, center=(-0.35, 0.28, 0.66), u_segs=8, v_segs=8, mat_idx=2, col_fn=col_cream_cloth)
    # Small floating arcane orb above left palm
    add_uv_sphere(bm, 0.065, center=(-0.35, 0.34, 0.78), u_segs=8, v_segs=6, mat_idx=5)
    create_obj_from_bm(bm, 'Anim_ArmL', all_mats, origin=(-0.32, 0.0, 0.84), parent=body_obj)

    # ---- 6. Anim_LegL & Anim_LegR (Mage Boots peeking below robe; pivots at Z=0.34) ----
    for side, l_name in ((-1, 'Anim_LegL'), (1, 'Anim_LegR')):
        bm = bmesh.new()
        lx = side * 0.13
        add_beveled_box(bm, (0.18, 0.26, 0.16), center=(lx, 0.04, 0.0), bevel=0.03, mat_idx=3, col_fn=col_oak_wood)
        create_obj_from_bm(bm, l_name, all_mats, origin=(lx, 0.0, 0.34), parent=root)

    # ---- 7. Anim_Cape (Flowing Arcane Mantle with Gold Trim; pivot Z=0.88) ----
    bm = bmesh.new()
    add_beveled_box(bm, (0.66, 0.09, 0.66), center=(0, -0.34, 0.22),
                    rot_euler=(-0.22, 0, 0), bevel=0.03, mat_idx=8, taper_top=0.66)  # TeamCape
    add_beveled_box(bm, (0.68, 0.11, 0.07), center=(0, -0.35, 0.21),
                    rot_euler=(-0.22, 0, 0), bevel=0.015, mat_idx=0, col_fn=col_royal_gold)
    create_obj_from_bm(bm, 'Anim_Cape', all_mats, origin=(0, -0.20, 0.88), parent=body_obj)

    export_glb('unit-mage.glb')


def main():
    print("=== Building Phase 3 High-Quality Castles & Key Soldiers ===")
    build_castle_standard()
    build_castle_fortress()
    build_unit_infantry()
    build_unit_knight()
    build_unit_mage()
    print("=== All 5 Priority Models Built & Exported Successfully ===")


if __name__ == '__main__':
    main()
