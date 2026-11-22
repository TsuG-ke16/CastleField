"""PR #184 の軽量フィールド設計（幅12m×奥行20m、外周 |X| >= 4.2 に共通部品を配置）に基づき、
6ステージ分の 3D フィールドモデル（field-*.glb）を生成・書き出しする Blender スクリプト。

使い方（リポジトリのルートで）：
  blender --background --python assets/models/make-fields.py
  または Blender のスクリプトタブで実行。

座標規約：
  Blender 制作時は Z-up・1 unit = 1m（-Y が手前）。
  GLB 書き出し時に export_yup=True で glTF 標準の Y-up へ変換する。
"""
import math
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector, Matrix, Euler

OUT_DIR = Path(__file__).resolve().parent


def hex_to_srgb(hex_str):
    h = hex_str.lstrip('#')
    r, g, b = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return (r, g, b, 1.0)


def hex_to_linear(hex_str):
    h = hex_str.lstrip('#')
    r, g, b = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    def s2l(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (s2l(r), s2l(g), s2l(b), 1.0)


def lerp_col(ca, cb, t):
    t = max(0.0, min(1.0, t))
    return (ca[0] * (1 - t) + cb[0] * t, ca[1] * (1 - t) + cb[1] * t, ca[2] * (1 - t) + cb[2] * t, 1.0)


def hash_noise(x, y, z=0.0):
    v = (math.sin(x * 0.85 + y * 0.42 + z * 1.1) * 0.45
         + math.cos(x * 1.7 - y * 1.35 + z * 0.7) * 0.30
         + math.sin((x + y) * 2.6 + z * 2.1) * 0.25)
    return 0.5 + 0.5 * v


def finalize_mesh(bm, name, num_slots=1):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for _ in range(num_slots):
        mesh.materials.append(None)
    mesh.update()
    return mesh


def make_mat(name, base_hex, roughness=0.82, metallic=0.0, emission_hex=None, emission_strength=0.0, use_vcol=False):
    mat = bpy.data.materials.new(name)
    if not mat.use_nodes:
        mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    col = hex_to_linear(base_hex)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    mat.diffuse_color = col
    if use_vcol:
        vc = nt.nodes.new('ShaderNodeVertexColor')
        vc.layer_name = 'Col'
        nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
    else:
        bsdf.inputs['Base Color'].default_value = col
    if emission_hex and emission_strength > 0.0:
        bsdf.inputs['Emission Color'].default_value = hex_to_linear(emission_hex)
        bsdf.inputs['Emission Strength'].default_value = emission_strength
    return mat


def build_shared_kit():
    # Bank (2 slots: side, top)
    bm = bmesh.new()
    pts = [(-1.0, -1.5), (0.85, -1.45), (1.1, -0.7), (1.05, 0.75), (0.8, 1.48), (-1.0, 1.5), (-1.15, 0.0)]
    h = 1.2
    b_vs = [bm.verts.new((x * 1.08, y * 1.06, 0.0)) for x, y in pts]
    m_vs = [bm.verts.new((x, y, h * 0.82)) for x, y in pts]
    t_vs = [bm.verts.new((x * 0.92, y * 0.94, h)) for x, y in pts]
    for i in range(len(pts)):
        j = (i + 1) % len(pts)
        bm.faces.new((b_vs[i], b_vs[j], m_vs[j], m_vs[i])).material_index = 0
        bm.faces.new((m_vs[i], m_vs[j], t_vs[j], t_vs[i])).material_index = 1
    bm.faces.new(t_vs).material_index = 1
    bm.faces.new(list(reversed(b_vs))).material_index = 0
    finalize_mesh(bm, 'Kit_Bank', 2)

    # Boulders
    def make_boulder(name, subdiv, sc, two_mat=False):
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=0.75)
        for v in bm.verts:
            ang = math.atan2(v.co.y, v.co.x)
            warp = 1.0 + 0.16 * math.sin(ang * 3.0 + v.co.z * 2.5) + 0.10 * math.cos(v.co.x * 4.0 - v.co.y * 3.0)
            v.co.x *= sc[0] * warp
            v.co.y *= sc[1] * warp
            v.co.z = max(-0.15, v.co.z * sc[2] * warp) + 0.15
        if two_mat:
            for f in bm.faces:
                f.material_index = 1 if f.normal.z > 0.45 else 0
        finalize_mesh(bm, name, 2 if two_mat else 1)

    make_boulder('Kit_Boulder_A', 2, (1.1, 0.9, 0.75), False)
    make_boulder('Kit_Boulder_B', 1, (0.95, 1.15, 0.88), False)
    make_boulder('Kit_Boulder_Cap', 2, (1.15, 0.95, 0.78), True)

    # Stone wall
    bm = bmesh.new()
    res = bmesh.ops.create_cube(bm, size=1.0)
    for v in res['verts']:
        v.co.x *= 0.75; v.co.y *= 2.6; v.co.z = (v.co.z + 0.5) * 1.05
    for f in bm.faces:
        f.material_index = 0
    for iy in (-0.86, 0.0, 0.86):
        res = bmesh.ops.create_cube(bm, size=1.0)
        vset = set(res['verts'])
        for v in res['verts']:
            v.co.x *= 0.86; v.co.y = v.co.y * 0.82 + iy; v.co.z = (v.co.z + 0.5) * 0.24 + 1.05
        for f in bm.faces:
            if all(v in vset for v in f.verts):
                f.material_index = 1
    res = bmesh.ops.create_cube(bm, size=1.0)
    vset = set(res['verts'])
    for v in res['verts']:
        v.co.x *= 0.95; v.co.y = v.co.y * 0.65 + 1.35; v.co.z = (v.co.z + 0.5) * 1.48
    for f in bm.faces:
        if all(v in vset for v in f.verts):
            f.material_index = 1
    finalize_mesh(bm, 'Kit_StoneWall', 2)

    # Tree
    bm = bmesh.new()
    rings = [(0.0, 0.52, 0.0, 0.0), (0.45, 0.36, 0.05, 0.0), (1.25, 0.28, -0.05, 0.04), (2.15, 0.22, 0.04, -0.02)]
    rvs = []
    for z, r, ox, oy in rings:
        rv = []
        for i in range(7):
            a = 2 * math.pi * i / 7
            fl = 1.25 if (z == 0.0 and i % 2 == 0) else 1.0
            rv.append(bm.verts.new((math.cos(a) * r * fl + ox, math.sin(a) * r * fl + oy, z)))
        rvs.append(rv)
    for k in range(len(rvs) - 1):
        for i in range(7):
            j = (i + 1) % 7
            bm.faces.new((rvs[k][i], rvs[k][j], rvs[k + 1][j], rvs[k + 1][i])).material_index = 0
    bm.faces.new(rvs[-1]).material_index = 0
    bm.faces.new(list(reversed(rvs[0]))).material_index = 0
    for c, sc in ((Vector((0, 0, 2.75)), Vector((1.25, 1.2, 0.95))),
                  (Vector((0.65, 0.45, 2.25)), Vector((0.88, 0.85, 0.72))),
                  (Vector((-0.62, -0.35, 2.35)), Vector((0.92, 0.88, 0.75)))):
        res = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
        vset = set(res['verts'])
        for v in res['verts']:
            v.co = Vector((v.co.x * sc.x, v.co.y * sc.y, v.co.z * sc.z)) + c
        for f in bm.faces:
            if all(v in vset for v in f.verts):
                f.material_index = 1
    finalize_mesh(bm, 'Kit_Tree', 2)

    # Crystal
    bm = bmesh.new()
    for pos, rad, ht, rot in ((Vector((0, 0, 0)), 0.42, 2.35, Euler((0.04, -0.06, 0))),
                              (Vector((-0.48, -0.22, 0)), 0.28, 1.45, Euler((0.18, -0.25, 0.4))),
                              (Vector((0.42, 0.26, 0)), 0.26, 1.25, Euler((-0.15, 0.22, -0.5)))):
        mt = Matrix.Translation(pos) @ rot.to_matrix().to_4x4()
        bv = [bm.verts.new(mt @ Vector((math.cos(2 * math.pi * i / 6) * rad, math.sin(2 * math.pi * i / 6) * rad, 0))) for i in range(6)]
        mv = [bm.verts.new(mt @ Vector((math.cos(2 * math.pi * i / 6) * rad * 0.82, math.sin(2 * math.pi * i / 6) * rad * 0.82, ht * 0.74))) for i in range(6)]
        tv = bm.verts.new(mt @ Vector((0, 0, ht)))
        for i in range(6):
            j = (i + 1) % 6
            bm.faces.new((bv[i], bv[j], mv[j], mv[i]))
            bm.faces.new((mv[i], mv[j], tv))
        bm.faces.new(list(reversed(bv)))
    finalize_mesh(bm, 'Kit_Crystal', 1)

    # Column & Broken Column
    bm = bmesh.new()
    for v in bmesh.ops.create_cube(bm, size=1.0)['verts']:
        v.co.x *= 1.15; v.co.y *= 1.15; v.co.z = (v.co.z + 0.5) * 0.35
    for v in bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=10, radius1=0.44, radius2=0.39, depth=2.3)['verts']:
        v.co.z += 1.50
    for v in bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=10, radius1=0.40, radius2=0.56, depth=0.32)['verts']:
        v.co.z += 2.81
    for v in bmesh.ops.create_cube(bm, size=1.0)['verts']:
        v.co.x *= 1.12; v.co.y *= 1.12; v.co.z = (v.co.z + 0.5) * 0.22 + 2.97
    finalize_mesh(bm, 'Kit_Column', 1)

    bm = bmesh.new()
    for v in bmesh.ops.create_cube(bm, size=1.0)['verts']:
        v.co.x *= 1.12; v.co.y *= 1.12; v.co.z = (v.co.z + 0.5) * 0.32
    for v in bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=10, radius1=0.43, radius2=0.40, depth=1.35)['verts']:
        v.co.z += 0.995
        if v.co.z > 1.4:
            v.co.z += v.co.x * 0.45 + abs(v.co.y) * 0.18
    finalize_mesh(bm, 'Kit_Column_Broken', 1)

    # Arch
    bm = bmesh.new()
    for sy in (-1.05, 1.05):
        for v in bmesh.ops.create_cube(bm, size=1.0)['verts']:
            v.co.x *= 0.85; v.co.y = v.co.y * 0.72 + sy; v.co.z = (v.co.z + 0.5) * 1.95
        for v in bmesh.ops.create_cube(bm, size=1.0)['verts']:
            v.co.x *= 0.98; v.co.y = v.co.y * 0.86 + sy; v.co.z = (v.co.z + 0.5) * 0.24 + 1.95
    for k in range(7):
        ang = math.radians(15 + k * 25)
        rm = Matrix.Rotation(ang - math.pi / 2, 4, 'X')
        for v in bmesh.ops.create_cube(bm, size=1.0)['verts']:
            v.co = (rm @ Vector((v.co.x * 0.82, v.co.y * 0.50, v.co.z * 0.52))) + Vector((0, math.cos(ang) * 1.05, 2.15 + math.sin(ang) * 1.05))
    finalize_mesh(bm, 'Kit_Arch', 1)

    # Pine (3 slots)
    bm = bmesh.new()
    for v in bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=7, radius1=0.26, radius2=0.14, depth=1.0)['verts']:
        v.co.z += 0.5
    for f in bm.faces:
        f.material_index = 0
    for z0, rad, ht in ((0.85, 1.15, 1.25), (1.65, 0.90, 1.15), (2.35, 0.62, 1.05)):
        res = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=8, radius1=rad, radius2=0.05, depth=ht)
        vset = set(res['verts'])
        for v in res['verts']: v.co.z += z0 + ht * 0.5
        for f in bm.faces:
            if all(v in vset for v in f.verts): f.material_index = 1
        res = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=8, radius1=rad * 0.72, radius2=0.04, depth=ht * 0.62)
        vset = set(res['verts'])
        for v in res['verts']: v.co.z += z0 + ht * 0.73
        for f in bm.faces:
            if all(v in vset for v in f.verts): f.material_index = 2
    finalize_mesh(bm, 'Kit_Pine', 3)

    # Mushroom (2 slots)
    bm = bmesh.new()
    for pos, sc in ((Vector((0, 0, 0)), 1.0), (Vector((0.68, -0.35, 0)), 0.62)):
        res = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=8, radius1=0.22 * sc, radius2=0.14 * sc, depth=0.72 * sc)
        vset = set(res['verts'])
        for v in res['verts']: v.co += Vector((pos.x, pos.y, 0.36 * sc))
        for f in bm.faces:
            if all(v in vset for v in f.verts): f.material_index = 0
        res = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=0.58 * sc)
        vset = set(res['verts'])
        for v in res['verts']:
            v.co.z *= 0.25 if v.co.z < 0 else 0.68
            v.co += Vector((pos.x, pos.y, 0.70 * sc))
        for f in bm.faces:
            if all(v in vset for v in f.verts): f.material_index = 1
    finalize_mesh(bm, 'Kit_Mushroom', 2)

    # Lantern & BranchHook
    bm = bmesh.new()
    for r1, r2, d, zc, mi in ((0.38, 0.06, 0.26, 0.68, 0), (0.24, 0.30, 0.48, 0.34, 1), (0.12, 0.26, 0.14, 0.05, 0)):
        res = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=6, radius1=r1, radius2=r2, depth=d)
        vset = set(res['verts'])
        for v in res['verts']: v.co.z += zc
        for f in bm.faces:
            if all(v in vset for v in f.verts): f.material_index = mi
    finalize_mesh(bm, 'Kit_Lantern', 2)

    bm = bmesh.new()
    bpts = [(-5.35, 5.45, 2.15), (-4.95, 5.30, 2.65), (-4.55, 5.18, 2.88), (-4.38, 5.10, 2.68)]
    brings = []
    for idx, (bx, by, bz) in enumerate(bpts):
        r = 0.14 - idx * 0.025
        brings.append([bm.verts.new((bx, by + math.cos(2 * math.pi * i / 6) * r, bz + math.sin(2 * math.pi * i / 6) * r)) for i in range(6)])
    for k in range(len(brings) - 1):
        for i in range(6):
            j = (i + 1) % 6
            bm.faces.new((brings[k][i], brings[k][j], brings[k + 1][j], brings[k + 1][i]))
    bm.faces.new(brings[-1]); bm.faces.new(list(reversed(brings[0])))
    finalize_mesh(bm, 'Kit_BranchHook', 1)

    # Cactus
    bm = bmesh.new()
    for v in bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=8, radius1=0.28, radius2=0.26, depth=1.65)['verts']:
        v.co.z += 0.825
    for v in bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.26)['verts']:
        v.co.z += 1.65
    for side, za, ha in ((-1, 0.85, 0.58), (1, 1.02, 0.48)):
        for v in bmesh.ops.create_cube(bm, size=1.0)['verts']:
            v.co.x = v.co.x * 0.45 + side * 0.34; v.co.y *= 0.24; v.co.z = v.co.z * 0.24 + za
        for v in bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=8, radius1=0.16, radius2=0.15, depth=ha)['verts']:
            v.co.x += side * 0.52; v.co.z += za + ha * 0.5
    for f in bm.faces: f.material_index = 0
    res = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.18)
    vset = set(res['verts'])
    for v in res['verts']: v.co.z = v.co.z * 0.65 + 1.94
    for f in bm.faces:
        if all(v in vset for v in f.verts): f.material_index = 1
    finalize_mesh(bm, 'Kit_Cactus', 2)

    # Bush
    bm = bmesh.new()
    for pos, rad, mi in ((Vector((0, 0, 0.28)), 0.42, 0), (Vector((0.32, 0.14, 0.22)), 0.30, 0),
                         (Vector((-0.28, -0.15, 0.24)), 0.32, 0), (Vector((0.06, -0.18, 0.54)), 0.11, 1),
                         (Vector((-0.18, 0.16, 0.48)), 0.10, 1)):
        res = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=rad)
        vset = set(res['verts'])
        for v in res['verts']: v.co.z *= 0.78; v.co += pos
        for f in bm.faces:
            if all(v in vset for v in f.verts): f.material_index = mi
    finalize_mesh(bm, 'Kit_Bush', 2)

    # LavaStrip, Volcano, Stairs, GrassTuft, LavaCrack, SmokePuff, Fern, Vine, PebbleCluster
    bm = bmesh.new()
    pts = [(-5.05, -7.6, 0.04), (-4.75, -5.6, 0.04), (-4.60, -3.4, 0.04), (-4.90, -1.2, 0.04),
           (-4.55, 1.0, 0.04), (-4.75, 3.1, 0.04), (-4.85, 3.95, 0.05), (-4.95, 4.15, 1.36), (-5.45, 5.20, 1.36)]
    lvs = [bm.verts.new((x - 0.42, y, z)) for x, y, z in pts]
    rvs = [bm.verts.new((x + 0.42, y, z)) for x, y, z in pts]
    for i in range(len(pts) - 1):
        bm.faces.new((lvs[i], rvs[i], rvs[i + 1], lvs[i + 1]))
    finalize_mesh(bm, 'Kit_LavaStrip', 1)

    bm = bmesh.new()
    for v in bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=9, radius1=1.15, radius2=0.45, depth=0.95)['verts']:
        v.co.z += 0.475
    for f in bm.faces:
        f.material_index = 1 if f.normal.z > 0.9 else 0
    finalize_mesh(bm, 'Kit_Volcano', 2)

    bm = bmesh.new()
    for i in range(3):
        for v in bmesh.ops.create_cube(bm, size=1.0)['verts']:
            v.co.x *= 1.65; v.co.y = v.co.y * (1.2 - i * 0.35) + i * 0.175; v.co.z = (v.co.z + 0.5) * 0.26 + i * 0.26
    finalize_mesh(bm, 'Kit_Stairs', 1)

    bm = bmesh.new()
    for ang_deg, ht, w in ((-35, 0.55, 0.14), (10, 0.70, 0.16), (50, 0.48, 0.13)):
        rot = Matrix.Rotation(math.radians(ang_deg), 4, 'Z')
        v0, v1 = bm.verts.new(rot @ Vector((-w, 0, 0))), bm.verts.new(rot @ Vector((w, 0, 0)))
        v2, v3 = bm.verts.new(rot @ Vector((w * 0.5, 0.10, ht * 0.55))), bm.verts.new(rot @ Vector((-w * 0.5, 0.10, ht * 0.55)))
        vt = bm.verts.new(rot @ Vector((0, 0.24, ht)))
        bm.faces.new((v0, v1, v2, v3)); bm.faces.new((v3, v2, vt))
    finalize_mesh(bm, 'Kit_GrassTuft', 1)

    bm = bmesh.new()
    cpts = [(-0.15, -0.75, 0.03), (0.12, -0.25, 0.03), (-0.08, 0.25, 0.03), (0.16, 0.78, 0.03)]
    lvs = [bm.verts.new((cx - (0.22 if i in (1, 2) else 0.06), cy, cz)) for i, (cx, cy, cz) in enumerate(cpts)]
    rvs = [bm.verts.new((cx + (0.22 if i in (1, 2) else 0.06), cy, cz)) for i, (cx, cy, cz) in enumerate(cpts)]
    for i in range(len(cpts) - 1):
        bm.faces.new((lvs[i], rvs[i], rvs[i + 1], lvs[i + 1]))
    finalize_mesh(bm, 'Kit_LavaCrack', 1)

    bm = bmesh.new()
    for pos, r in ((Vector((0, 0, 1.25)), 0.30), (Vector((0.28, 0.18, 1.72)), 0.42), (Vector((0.55, 0.35, 2.25)), 0.50)):
        for v in bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r)['verts']:
            v.co.z *= 0.75; v.co += pos
    finalize_mesh(bm, 'Kit_SmokePuff', 1)

    bm = bmesh.new()
    for k in range(4):
        rot = Matrix.Rotation(math.radians(k * 78 - 35), 4, 'Z')
        p0, p1 = bm.verts.new(rot @ Vector((-0.14, 0, 0.04))), bm.verts.new(rot @ Vector((0.14, 0, 0.04)))
        p2, p3 = bm.verts.new(rot @ Vector((0.20, 0.48, 0.42))), bm.verts.new(rot @ Vector((-0.20, 0.48, 0.42)))
        p4, p5 = bm.verts.new(rot @ Vector((0.12, 0.92, 0.36))), bm.verts.new(rot @ Vector((-0.12, 0.92, 0.36)))
        pt = bm.verts.new(rot @ Vector((0, 1.22, 0.16)))
        bm.faces.new((p0, p1, p2, p3)); bm.faces.new((p3, p2, p4, p5)); bm.faces.new((p5, p4, pt))
    finalize_mesh(bm, 'Kit_Fern', 1)

    bm = bmesh.new()
    for k in range(5):
        ang, z = k * 0.95, 0.4 + k * 0.45
        pos = Vector((math.cos(ang) * 0.48, math.sin(ang) * 0.48, z))
        for v in bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.16)['verts']:
            v.co.z *= 0.65; v.co += pos
    finalize_mesh(bm, 'Kit_Vine', 1)

    bm = bmesh.new()
    for pos, r in ((Vector((0, 0, 0.06)), 0.16), (Vector((0.35, -0.22, 0.05)), 0.12), (Vector((-0.28, 0.25, 0.04)), 0.10)):
        for v in bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r)['verts']:
            v.co.z *= 0.6; v.co += pos
    finalize_mesh(bm, 'Kit_PebbleCluster', 1)


def make_ground_mesh(mname, hex_a, hex_b, hex_c, style):
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=12, y_segments=20, size=1.0)
    for v in bm.verts:
        v.co.x *= 6.0; v.co.y *= 10.0; v.co.z = 0.0
    col_layer = bm.loops.layers.color.new('Col')
    ca, cb, cc = hex_to_srgb(hex_a), hex_to_srgb(hex_b), hex_to_srgb(hex_c)
    for f in bm.faces:
        for loop in f.loops:
            x, y = loop.vert.co.x, loop.vert.co.y
            n1 = hash_noise(x * 0.55, y * 0.45)
            edge = max(0.0, (abs(x) - 3.8) / 2.2)
            if style == 'ruins':
                tile = ((int(math.floor(x * 0.6)) + int(math.floor(y * 0.5))) % 2) * 0.25
                c = lerp_col(ca, cb, n1 * 0.75 + tile)
            elif style == 'desert':
                rip = 0.5 + 0.5 * math.sin(x * 0.6 + y * 1.45)
                c = lerp_col(ca, cb, rip * 0.65 + n1 * 0.35)
            elif style == 'ice':
                streak = 0.5 + 0.5 * math.sin(x * 0.35 + y * 0.9 + n1 * 2.0)
                c = lerp_col(ca, cb, streak)
                if streak > 0.72:
                    c = lerp_col(c, cc, (streak - 0.72) * 2.5)
            else:
                c = lerp_col(ca, cb, n1)
            if edge > 0.0:
                c = lerp_col(c, cc, edge * 0.48)
            loop[col_layer] = c
    return finalize_mesh(bm, mname, 1)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0
    build_shared_kit()

    M = {
        'meadow_cliff': make_mat('Mat_Meadow_Cliff', '#ad6933', 0.86),
        'meadow_stone': make_mat('Mat_Meadow_Stone', '#d7c5a5', 0.80),
        'meadow_rock': make_mat('Mat_Meadow_Rock', '#9b9085', 0.82),
        'meadow_bark': make_mat('Mat_Meadow_Bark', '#88532a', 0.88),
        'meadow_leaf': make_mat('Mat_Meadow_Leaf', '#6cac23', 0.78),
        'meadow_grass': make_mat('Mat_Meadow_GrassTuft', '#5ca820', 0.80),
        'meadow_flower': make_mat('Mat_Meadow_Flower', '#fff8e8', 0.65),
        'meadow_top': make_mat('Mat_Meadow_Top', '#a6b119', 0.88),
        'lava_basalt': make_mat('Mat_Lava_Basalt', '#403138', 0.80),
        'lava_obsidian': make_mat('Mat_Lava_Obsidian', '#302a3d', 0.35, 0.15),
        'lava_glow': make_mat('Mat_Lava_Glow', '#ff9514', 0.25, 0.0, '#ff6a00', 5.5),
        'lava_fern': make_mat('Mat_Lava_Fern', '#ec5814', 0.70, 0.0, '#ff4400', 0.4),
        'lava_smoke': make_mat('Mat_Lava_Smoke', '#9c8284', 0.95),
        'ice_cliff': make_mat('Mat_Ice_Cliff', '#2b93d8', 0.22),
        'ice_snow': make_mat('Mat_Ice_Snow', '#e9f5ff', 0.68),
        'ice_rock': make_mat('Mat_Ice_Rock', '#7b7e87', 0.80),
        'ice_crystal': make_mat('Mat_Ice_Crystal', '#58d1ff', 0.12, 0.0, '#38c8ff', 1.2),
        'ice_pine': make_mat('Mat_Ice_Pine', '#3a7d33', 0.80),
        'ruins_stone': make_mat('Mat_Ruins_Stone', '#ddab68', 0.80),
        'ruins_moss': make_mat('Mat_Ruins_Moss', '#88af2a', 0.85),
        'ruins_vine': make_mat('Mat_Ruins_Vine', '#609622', 0.82),
        'ruins_crystal': make_mat('Mat_Ruins_Crystal', '#c294f4', 0.16, 0.0, '#b478ff', 1.6),
        'df_rock': make_mat('Mat_DF_Rock', '#49566d', 0.82),
        'df_moss': make_mat('Mat_DF_Moss', '#74a12d', 0.85),
        'df_bark': make_mat('Mat_DF_Bark', '#6c4023', 0.88),
        'df_leaf': make_mat('Mat_DF_Leaf', '#22664a', 0.82),
        'df_fern': make_mat('Mat_DF_Fern', '#1a9991', 0.72),
        'df_mush_stem': make_mat('Mat_DF_MushStem', '#e5a978', 0.75),
        'df_mush_cap': make_mat('Mat_DF_MushCap', '#aa4bec', 0.40, 0.0, '#a644ff', 2.2),
        'df_iron': make_mat('Mat_DF_Iron', '#2a262c', 0.45, 0.75),
        'df_lantern': make_mat('Mat_DF_Lantern', '#ffd24c', 0.20, 0.0, '#ffbe28', 6.5),
        'df_crystal': make_mat('Mat_DF_Crystal', '#face3f', 0.18, 0.0, '#ffc422', 3.2),
        'desert_cliff': make_mat('Mat_Desert_Cliff', '#d4712e', 0.84),
        'desert_top': make_mat('Mat_Desert_Top', '#f9b155', 0.82),
        'desert_column': make_mat('Mat_Desert_Column', '#e3c293', 0.82),
        'desert_cactus': make_mat('Mat_Desert_Cactus', '#5da42a', 0.75),
        'desert_flower': make_mat('Mat_Desert_Flower', '#ff6818', 0.60),
        'desert_scrub': make_mat('Mat_Desert_Scrub', '#b3a022', 0.85),
        'desert_pebble': make_mat('Mat_Desert_Pebble', '#c97d38', 0.85),
    }

    def spawn(parent, name, mesh_name, loc, rot_deg=(0, 0, 0), scale=(1, 1, 1), mats=()):
        obj = bpy.data.objects.new(name, bpy.data.meshes[mesh_name])
        obj.parent = parent
        obj.location = loc
        obj.rotation_euler = tuple(math.radians(a) for a in rot_deg)
        obj.scale = scale
        scene.collection.objects.link(obj)
        for i, m in enumerate(mats):
            obj.material_slots[i].link = 'OBJECT'
            obj.material_slots[i].material = m
        return obj

    def export_stage(slug, ground_cfg, parts):
        for o in list(scene.collection.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        root = bpy.data.objects.new(f'Root_{slug}', None)
        scene.collection.objects.link(root)
        gm = make_ground_mesh(f'Kit_Ground_{slug}', *ground_cfg[:3], ground_cfg[4])
        gmat = make_mat(f'Mat_GLTF_Ground_{slug}', ground_cfg[0], ground_cfg[3], use_vcol=True)
        spawn(root, f'{slug}_Ground', gm.name, (0, 0, 0), mats=(gmat,))
        for p in parts:
            spawn(root, *p)
        bpy.ops.object.select_all(action='SELECT')
        out = OUT_DIR / f'field-{slug}.glb'
        bpy.ops.export_scene.gltf(filepath=str(out), export_format='GLB', use_active_scene=True,
                                  use_selection=True, export_yup=True, export_apply=True, export_materials='EXPORT')
        print(f'Exported {out.name}: {out.stat().st_size:,} bytes')

    export_stage('meadow', ('#93a314', '#b8be1e', '#b5a042', 0.88, 'meadow'), [
        ('Meadow_Wall_L1', 'Kit_StoneWall', (-5.55, -5.2, 0), (0, 0, -4), (1.05, 1.15, 1.0), (M['meadow_stone'], M['meadow_stone'])),
        ('Meadow_Wall_L2', 'Kit_StoneWall', (-5.45, -1.6, 0), (0, 0, 5), (1.05, 1.25, 1.05), (M['meadow_stone'], M['meadow_stone'])),
        ('Meadow_Wall_L3', 'Kit_StoneWall', (-5.45, 2.2, 0), (0, 0, -3), (1.1, 1.3, 1.15), (M['meadow_stone'], M['meadow_stone'])),
        ('Meadow_Bank_LT', 'Kit_Bank', (-5.65, 5.2, 0), (0, 0, 10), (1.1, 1.35, 1.05), (M['meadow_cliff'], M['meadow_top'])),
        ('Meadow_Tree_L1', 'Kit_Tree', (-5.55, 5.6, 1.05), (0, 0, 22), (1.15, 1.15, 1.25), (M['meadow_bark'], M['meadow_leaf'])),
        ('Meadow_Bush_L1', 'Kit_Bush', (-4.68, 3.6, 0), (0, 0, 15), (1.15, 1.15, 1.0), (M['meadow_leaf'], M['meadow_flower'])),
        ('Meadow_Bush_L2', 'Kit_Bush', (-4.95, -0.2, 0), (0, 0, -40), (0.9, 0.9, 0.85), (M['meadow_leaf'], M['meadow_leaf'])),
        ('Meadow_Rock_BL1', 'Kit_Boulder_A', (-5.35, -8.8, 0), (0, 0, 25), (1.15, 1.0, 1.1), (M['meadow_rock'],)),
        ('Meadow_Rock_BL2', 'Kit_Boulder_B', (-4.65, -9.3, 0), (0, 0, -35), (0.75, 0.75, 0.75), (M['meadow_rock'],)),
        ('Meadow_Rock_TL1', 'Kit_Boulder_A', (-4.65, 9.2, 0), (0, 0, 60), (0.85, 0.85, 0.8), (M['meadow_rock'],)),
        ('Meadow_Bank_R1', 'Kit_Bank', (5.55, -5.8, 0), (0, 0, 175), (1.05, 1.25, 0.85), (M['meadow_cliff'], M['meadow_top'])),
        ('Meadow_Wall_R1', 'Kit_StoneWall', (5.45, -2.5, 0), (0, 0, 172), (1.0, 1.1, 0.95), (M['meadow_stone'], M['meadow_stone'])),
        ('Meadow_Bank_R2', 'Kit_Bank', (5.45, 0.8, 0), (0, 0, 184), (1.05, 1.35, 1.0), (M['meadow_cliff'], M['meadow_top'])),
        ('Meadow_Wall_R2', 'Kit_StoneWall', (5.45, 4.4, 0), (0, 0, 176), (1.0, 1.15, 0.95), (M['meadow_stone'], M['meadow_stone'])),
        ('Meadow_Bank_R3', 'Kit_Bank', (5.35, 8.2, 0), (0, 0, 168), (1.25, 1.45, 0.95), (M['meadow_cliff'], M['meadow_top'])),
        ('Meadow_Tree_R1', 'Kit_Tree', (4.95, 8.8, 0.95), (0, 0, -35), (0.95, 0.95, 0.98), (M['meadow_bark'], M['meadow_leaf'])),
        ('Meadow_Tree_R2', 'Kit_Tree', (5.75, 7.6, 0.95), (0, 0, 48), (1.05, 1.05, 1.08), (M['meadow_bark'], M['meadow_leaf'])),
        ('Meadow_Bush_R1', 'Kit_Bush', (4.65, -4.1, 0), (0, 0, 110), (1.18, 1.18, 1.0), (M['meadow_leaf'], M['meadow_flower'])),
        ('Meadow_Bush_R2', 'Kit_Bush', (4.65, 2.7, 0), (0, 0, 20), (1.18, 1.18, 1.0), (M['meadow_leaf'], M['meadow_flower'])),
        ('Meadow_Rock_R1', 'Kit_Boulder_B', (5.45, 1.1, 1.18), (0, 0, 40), (0.72, 0.72, 0.78), (M['meadow_rock'],)),
        ('Meadow_Rock_BR1', 'Kit_Boulder_A', (5.25, -8.8, 0), (0, 0, -25), (1.3, 1.15, 1.15), (M['meadow_rock'],)),
        ('Meadow_Tuft_1', 'Kit_GrassTuft', (-4.55, -8.2, 0), (0, 0, 20), (1.1, 1.1, 1.0), (M['meadow_grass'],)),
        ('Meadow_Tuft_2', 'Kit_GrassTuft', (4.45, -8.4, 0), (0, 0, -35), (1.2, 1.2, 1.1), (M['meadow_grass'],)),
        ('Meadow_Tuft_3', 'Kit_GrassTuft', (-4.55, 1.2, 0), (0, 0, 50), (0.9, 0.9, 0.9), (M['meadow_grass'],)),
    ])

    export_stage('lava', ('#442f34', '#5d4348', '#352428', 0.86, 'lava'), [
        ('Lava_River', 'Kit_LavaStrip', (0, 0, 0), (0, 0, 0), (1, 1, 1), (M['lava_glow'],)),
        ('Lava_Bank_L1', 'Kit_Bank', (-6.10, -5.0, 0), (0, 0, -5), (0.95, 1.2, 0.95), (M['lava_basalt'], M['lava_basalt'])),
        ('Lava_Bank_L2', 'Kit_Bank', (-6.05, -1.0, 0), (0, 0, 6), (0.9, 1.25, 1.05), (M['lava_basalt'], M['lava_basalt'])),
        ('Lava_Bank_L3', 'Kit_Bank', (-5.75, 5.45, 0), (0, 0, -4), (1.15, 1.25, 1.12), (M['lava_basalt'], M['lava_basalt'])),
        ('Lava_Volcano_L', 'Kit_Volcano', (-4.75, 8.8, 0), (0, 0, 15), (1.05, 1.05, 1.0), (M['lava_basalt'], M['lava_glow'])),
        ('Lava_Rock_BL', 'Kit_Boulder_A', (-5.35, -8.7, 0), (0, 0, 30), (1.2, 1.05, 1.2), (M['lava_basalt'],)),
        ('Lava_Fern_BL', 'Kit_Bush', (-4.85, -9.2, 0), (0, 0, 45), (0.85, 0.85, 0.85), (M['lava_fern'], M['lava_fern'])),
        ('Lava_Bank_R1', 'Kit_Bank', (5.55, -5.2, 0), (0, 0, 178), (1.05, 1.2, 0.9), (M['lava_basalt'], M['lava_basalt'])),
        ('Lava_Bank_R2', 'Kit_Bank', (5.45, 0.2, 0), (0, 0, 184), (1.1, 1.35, 1.05), (M['lava_basalt'], M['lava_basalt'])),
        ('Lava_Bank_R3', 'Kit_Bank', (5.55, 4.2, 0), (0, 0, 172), (1.05, 1.2, 0.95), (M['lava_basalt'], M['lava_basalt'])),
        ('Lava_Obsidian_R1', 'Kit_Crystal', (5.05, 6.2, 0), (0, 0, -25), (1.35, 1.35, 1.65), (M['lava_obsidian'],)),
        ('Lava_Obsidian_R2', 'Kit_Crystal', (5.05, 1.2, 0.95), (0, 0, 35), (1.05, 1.05, 1.25), (M['lava_obsidian'],)),
        ('Lava_Obsidian_R3', 'Kit_Crystal', (5.05, -3.6, 0.78), (0, 0, 12), (0.95, 0.95, 1.10), (M['lava_obsidian'],)),
        ('Lava_Volcano_R', 'Kit_Volcano', (4.65, 8.8, 0), (0, 0, -20), (0.98, 0.98, 0.95), (M['lava_basalt'], M['lava_glow'])),
        ('Lava_Fern_R1', 'Kit_Bush', (5.05, -1.6, 0), (0, 0, 80), (0.9, 0.9, 0.85), (M['lava_fern'], M['lava_fern'])),
        ('Lava_Fern_R2', 'Kit_Bush', (5.15, 4.8, 1.15), (0, 0, -30), (0.8, 0.8, 0.75), (M['lava_fern'], M['lava_fern'])),
        ('Lava_Rock_BR', 'Kit_Boulder_A', (5.25, -8.7, 0), (0, 0, -40), (1.25, 1.1, 1.15), (M['lava_basalt'],)),
        ('Lava_Crack_R1', 'Kit_LavaCrack', (4.55, 6.0, 0.02), (0, 0, 15), (1.1, 1.2, 1.0), (M['lava_glow'],)),
        ('Lava_Crack_R2', 'Kit_LavaCrack', (4.55, -3.5, 0.02), (0, 0, -20), (0.9, 1.0, 1.0), (M['lava_glow'],)),
        ('Lava_Smoke_L', 'Kit_SmokePuff', (-4.75, 8.8, 0), (0, 0, 15), (1.0, 1.0, 1.0), (M['lava_smoke'],)),
        ('Lava_Smoke_R', 'Kit_SmokePuff', (4.65, 8.8, 0), (0, 0, -35), (0.9, 0.9, 0.9), (M['lava_smoke'],)),
    ])

    export_stage('ice', ('#6bbbe3', '#9adbf7', '#cbeeff', 0.28, 'ice'), [
        ('Ice_Bank_L1', 'Kit_Bank', (-5.55, -5.5, 0), (0, 0, -6), (1.05, 1.35, 1.05), (M['ice_cliff'], M['ice_snow'])),
        ('Ice_Bank_L2', 'Kit_Bank', (-5.65, -1.2, 0), (0, 0, 5), (1.0, 1.3, 1.0), (M['ice_cliff'], M['ice_snow'])),
        ('Ice_Rock_LM', 'Kit_Boulder_Cap', (-5.25, 2.2, 0), (0, 0, 20), (1.25, 1.15, 1.35), (M['ice_rock'], M['ice_snow'])),
        ('Ice_Pine_L', 'Kit_Pine', (-5.35, 4.3, 0), (0, 0, 12), (1.25, 1.25, 1.3), (M['meadow_bark'], M['ice_pine'], M['ice_snow'])),
        ('Ice_Bank_L3', 'Kit_Bank', (-5.45, 7.8, 0), (0, 0, -8), (1.15, 1.35, 1.15), (M['ice_cliff'], M['ice_snow'])),
        ('Ice_Rock_BL', 'Kit_Boulder_Cap', (-5.15, -8.9, 0), (0, 0, -25), (1.2, 1.05, 1.0), (M['ice_rock'], M['ice_snow'])),
        ('Ice_Rock_TL', 'Kit_Boulder_Cap', (-4.35, 9.2, 0), (0, 0, 50), (0.95, 0.85, 0.8), (M['ice_rock'], M['ice_snow'])),
        ('Ice_Bank_R1', 'Kit_Bank', (5.55, -5.6, 0), (0, 0, 176), (1.05, 1.3, 1.05), (M['ice_cliff'], M['ice_snow'])),
        ('Ice_Bank_R2', 'Kit_Bank', (5.55, -1.6, 0), (0, 0, 186), (1.05, 1.25, 1.05), (M['ice_cliff'], M['ice_snow'])),
        ('Ice_Crystal_R', 'Kit_Crystal', (5.15, 2.5, 0), (0, 0, -18), (1.35, 1.35, 1.45), (M['ice_crystal'],)),
        ('Ice_Bank_R3', 'Kit_Bank', (5.55, 6.2, 0), (0, 0, 174), (1.1, 1.3, 1.1), (M['ice_cliff'], M['ice_snow'])),
        ('Ice_Bank_R4', 'Kit_Bank', (5.15, 9.0, 0), (0, 0, 162), (1.2, 1.0, 1.15), (M['ice_cliff'], M['ice_snow'])),
        ('Ice_Rock_R1', 'Kit_Boulder_Cap', (5.05, -3.5, 0), (0, 0, 110), (0.8, 0.8, 0.85), (M['ice_rock'], M['ice_snow'])),
        ('Ice_Rock_BR', 'Kit_Boulder_Cap', (5.25, -8.8, 0), (0, 0, 35), (1.3, 1.15, 1.1), (M['ice_rock'], M['ice_snow'])),
    ])

    export_stage('ruins', ('#dd9c49', '#f4c278', '#c58a3d', 0.84, 'ruins'), [
        ('Ruins_Stairs_BL', 'Kit_Stairs', (-4.85, -8.8, 0), (0, 0, -28), (1.05, 1.05, 1.0), (M['ruins_stone'],)),
        ('Ruins_Bank_L1', 'Kit_Bank', (-5.55, -4.2, 0), (0, 0, -4), (1.0, 1.35, 0.85), (M['ruins_stone'], M['ruins_stone'])),
        ('Ruins_Wall_L1', 'Kit_StoneWall', (-5.45, -0.5, 0), (0, 0, 4), (1.0, 1.2, 0.95), (M['ruins_stone'], M['ruins_stone'])),
        ('Ruins_Col_Broken', 'Kit_Column_Broken', (-5.15, 2.8, 0), (0, 0, 22), (1.05, 1.05, 1.05), (M['ruins_stone'],)),
        ('Ruins_Col_Tall', 'Kit_Column', (-5.15, 6.2, 0), (0, 0, -10), (1.05, 1.05, 1.15), (M['ruins_stone'],)),
        ('Ruins_Bush_L1', 'Kit_Bush', (-4.68, -2.2, 0), (0, 0, 30), (1.1, 1.1, 0.95), (M['ruins_moss'], M['meadow_flower'])),
        ('Ruins_Rock_TL', 'Kit_Boulder_A', (-4.55, 9.2, 0), (0, 0, 45), (0.85, 0.85, 0.8), (M['meadow_rock'],)),
        ('Ruins_Stairs_BR', 'Kit_Stairs', (4.85, -8.8, 0), (0, 0, 28), (1.05, 1.05, 1.0), (M['ruins_stone'],)),
        ('Ruins_Bank_R1', 'Kit_Bank', (5.45, -4.6, 0), (0, 0, 178), (1.0, 1.25, 0.85), (M['ruins_stone'], M['ruins_stone'])),
        ('Ruins_Bank_R2', 'Kit_Bank', (5.45, -0.6, 0), (0, 0, 184), (1.05, 1.35, 0.95), (M['ruins_stone'], M['ruins_stone'])),
        ('Ruins_Crystal_R', 'Kit_Crystal', (5.05, 2.2, 0), (0, 0, 18), (0.75, 0.75, 0.82), (M['ruins_crystal'],)),
        ('Ruins_Arch_R', 'Kit_Arch', (5.05, 5.2, 0), (0, 0, -26), (1.15, 1.2, 1.2), (M['ruins_stone'],)),
        ('Ruins_Stairs_TR', 'Kit_Stairs', (4.75, 9.0, 0), (0, 0, 155), (0.95, 0.95, 0.9), (M['ruins_stone'],)),
        ('Ruins_Bush_R1', 'Kit_Bush', (4.65, -2.6, 0), (0, 0, 120), (1.1, 1.1, 0.95), (M['ruins_moss'], M['meadow_flower'])),
        ('Ruins_Vine_Col', 'Kit_Vine', (-5.15, 6.2, 0), (0, 0, 10), (1.05, 1.05, 1.1), (M['ruins_vine'],)),
        ('Ruins_Vine_Arch', 'Kit_Vine', (5.05, 5.2, 0.4), (0, 0, 120), (1.3, 1.3, 1.2), (M['ruins_vine'],)),
    ])

    export_stage('dark-forest', ('#105240', '#1e7a5d', '#0c3d30', 0.88, 'df'), [
        ('DF_Mushroom_BL', 'Kit_Mushroom', (-5.05, -8.1, 0), (0, 0, 18), (1.15, 1.15, 1.15), (M['df_mush_stem'], M['df_mush_cap'])),
        ('DF_Bank_L1', 'Kit_Bank', (-5.65, -4.4, 0), (0, 0, -5), (1.0, 1.25, 0.95), (M['df_rock'], M['df_moss'])),
        ('DF_Bank_L2', 'Kit_Bank', (-5.65, -0.4, 0), (0, 0, 6), (1.0, 1.3, 1.0), (M['df_rock'], M['df_moss'])),
        ('DF_Tree_L1', 'Kit_Tree', (-5.45, 5.5, 0), (0, 0, 25), (1.25, 1.25, 1.45), (M['df_bark'], M['df_leaf'])),
        ('DF_Lantern_L1', 'Kit_Lantern', (-4.38, 5.10, 1.75), (0, 0, 0), (1.25, 1.25, 1.25), (M['df_iron'], M['df_lantern'])),
        ('DF_LanternBranch', 'Kit_BranchHook', (0, 0, 0), (0, 0, 0), (1, 1, 1), (M['df_bark'],)),
        ('DF_Fern_L1', 'Kit_Fern', (-4.95, -2.4, 0), (0, 0, 40), (0.95, 0.95, 0.85), (M['df_fern'],)),
        ('DF_Rock_TL', 'Kit_Boulder_Cap', (-4.35, 9.2, 0), (0, 0, 35), (0.95, 0.9, 0.85), (M['df_rock'], M['df_moss'])),
        ('DF_Rock_BR', 'Kit_Boulder_Cap', (5.25, -8.6, 0), (0, 0, -30), (1.25, 1.1, 1.15), (M['df_rock'], M['df_moss'])),
        ('DF_Bank_R1', 'Kit_Bank', (5.55, -4.6, 0), (0, 0, 178), (1.05, 1.25, 1.0), (M['df_rock'], M['df_moss'])),
        ('DF_Bank_R2', 'Kit_Bank', (5.55, -0.8, 0), (0, 0, 185), (1.05, 1.3, 1.05), (M['df_rock'], M['df_moss'])),
        ('DF_Fern_R1', 'Kit_Fern', (4.85, 2.2, 0), (0, 0, 150), (1.15, 1.15, 0.95), (M['df_fern'],)),
        ('DF_Fern_R2', 'Kit_Fern', (4.75, -6.5, 0), (0, 0, 145), (1.0, 1.0, 1.0), (M['df_fern'],)),
        ('DF_Rock_R1', 'Kit_Boulder_Cap', (5.35, 4.6, 0), (0, 0, -15), (1.15, 1.05, 1.0), (M['df_rock'], M['df_moss'])),
        ('DF_Crystal_R', 'Kit_Crystal', (5.05, 5.1, 0.72), (0, 0, -30), (0.72, 0.72, 0.72), (M['df_crystal'],)),
        ('DF_Tree_R1', 'Kit_Tree', (5.35, 8.4, 0), (0, 0, -40), (1.15, 1.15, 1.25), (M['df_bark'], M['df_leaf'])),
    ])

    export_stage('desert', ('#e88f28', '#fbb758', '#d67d20', 0.88, 'desert'), [
        ('Desert_Rock_BL', 'Kit_Boulder_A', (-5.25, -8.7, 0), (0, 0, 22), (1.25, 1.1, 1.05), (M['desert_top'],)),
        ('Desert_Bank_L1', 'Kit_Bank', (-5.55, -4.4, 0), (0, 0, -6), (1.1, 1.35, 0.95), (M['desert_cliff'], M['desert_top'])),
        ('Desert_Col_L', 'Kit_Column_Broken', (-5.05, 0.4, 0), (8, -12, 18), (1.05, 1.05, 1.05), (M['desert_column'],)),
        ('Desert_Bank_L2', 'Kit_Bank', (-5.45, 5.4, 0), (0, 0, 8), (1.2, 1.45, 1.28), (M['desert_cliff'], M['desert_top'])),
        ('Desert_Bank_L3', 'Kit_Bank', (-5.55, 8.6, 0), (0, 0, -10), (1.15, 1.1, 1.65), (M['desert_cliff'], M['desert_top'])),
        ('Desert_Scrub_L1', 'Kit_Bush', (-4.95, -6.5, 0), (0, 0, 35), (0.8, 0.8, 0.7), (M['desert_scrub'], M['desert_scrub'])),
        ('Desert_Scrub_L2', 'Kit_Bush', (-4.95, 3.2, 0), (0, 0, -45), (0.85, 0.85, 0.72), (M['desert_scrub'], M['desert_scrub'])),
        ('Desert_Rock_BR', 'Kit_Boulder_A', (5.25, -8.7, 0), (0, 0, -25), (1.3, 1.15, 1.1), (M['desert_top'],)),
        ('Desert_Bank_R1', 'Kit_Bank', (5.55, -5.0, 0), (0, 0, 174), (1.1, 1.3, 0.95), (M['desert_cliff'], M['desert_top'])),
        ('Desert_Bank_R2', 'Kit_Bank', (5.45, -1.0, 0), (0, 0, 185), (1.15, 1.35, 1.05), (M['desert_cliff'], M['desert_top'])),
        ('Desert_Bank_R3', 'Kit_Bank', (5.45, 3.0, 0), (0, 0, 172), (1.15, 1.3, 1.15), (M['desert_cliff'], M['desert_top'])),
        ('Desert_Cactus_R', 'Kit_Cactus', (5.08, 3.1, 1.36), (0, 0, -25), (1.05, 1.05, 1.05), (M['desert_cactus'], M['desert_flower'])),
        ('Desert_Bank_R4', 'Kit_Bank', (5.35, 7.6, 0), (0, 0, 165), (1.25, 1.4, 1.55), (M['desert_cliff'], M['desert_top'])),
        ('Desert_Scrub_R1', 'Kit_Bush', (4.95, 0.8, 0), (0, 0, 100), (0.9, 0.9, 0.72), (M['desert_scrub'], M['desert_scrub'])),
        ('Desert_Pebbles_L1', 'Kit_PebbleCluster', (-4.45, -2.0, 0), (0, 0, 15), (1.2, 1.2, 1.0), (M['desert_pebble'],)),
        ('Desert_Pebbles_R1', 'Kit_PebbleCluster', (4.45, -2.5, 0), (0, 0, -40), (1.2, 1.2, 1.0), (M['desert_pebble'],)),
        ('Desert_Pebbles_R2', 'Kit_PebbleCluster', (4.35, 4.8, 0), (0, 0, 75), (1.0, 1.0, 1.0), (M['desert_pebble'],)),
    ])


if __name__ == '__main__':
    main()
