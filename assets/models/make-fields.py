"""PR #184 のフィールド設計（幅12m×奥行20m、外周 |X| >= 4.2 に構造物・植生を配置）に基づき、
3D フィールドモデル（field-*.glb）を生成・書き出しする Blender スクリプト。
草原ステージ（meadow）は STYLE.md と PR #184 原画（stage-meadow.png）に基づく本格造形版。

使い方（リポジトリのルートで）：
  # 既定では他の5ステージを上書きしないよう meadow のみ出力：
  blender --background --python assets/models/make-fields.py
  # 特定ステージのみ出力：
  blender --background --python assets/models/make-fields.py -- --stage meadow
  # 全6ステージを出力する場合のみ --all を明示：
  blender --background --python assets/models/make-fields.py -- --all

座標規約：
  Blender 制作時は Z-up・1 unit = 1m（-Y が手前）。
  GLB 書き出し時に export_yup=True で glTF 標準の Y-up へ変換する。
"""
import math
import sys
from pathlib import Path
import numpy as np

import bpy
import bmesh
from mathutils import Vector, Matrix, Euler

OUT_DIR = Path(__file__).resolve().parent


def hex_to_rgb(hex_str):
    h = hex_str.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


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


# =============================================================================
# 草原ステージ（meadow）専用：本格造形＆プロシージャル手描き風地面テクスチャ生成
# =============================================================================

def generate_meadow_ground_texture(tex_path: Path, width=768, height=1024):
    """Generates a 768x1024 hand-painted style meadow ground texture using NumPy.
    World mapping: U in [0,1] -> X in [-10.5, +10.5], V in [0,1] -> Y in [-15.5, +13.5].
    """
    u = np.linspace(0.0, 1.0, width, dtype=np.float32)
    v = np.linspace(0.0, 1.0, height, dtype=np.float32)
    uu, vv = np.meshgrid(u, v)

    wx = (uu - 0.5) * 21.0          # [-10.5, +10.5]
    wy = -15.5 + vv * 29.0          # [-15.5, +13.5]

    n1 = (np.sin(wx * 0.58 + wy * 0.44) * 0.45
          + np.cos(wx * 0.92 - wy * 0.75) * 0.35
          + np.sin((wx + wy) * 1.35) * 0.20)
    n2 = (np.sin(wx * 2.15 - wy * 1.85 + n1 * 1.4) * 0.5
          + np.cos(wx * 3.1 + wy * 2.6) * 0.5)
    n3 = (np.sin(wx * 6.8 + wy * 5.6 + n2 * 0.9) * 0.5
          + np.cos(wx * 8.9 - wy * 7.8) * 0.5)

    sx = wx * 11.5 + np.sin(wy * 3.6) * 1.4
    sy = wy * 7.2 + np.cos(wx * 4.0) * 1.0
    strokes = (np.sin(sx) * np.cos(sy) * 0.52
               + np.sin(sx * 1.65 - sy * 1.25) * 0.30
               + np.cos(sx * 2.3 + sy * 1.95) * 0.18)

    col_base = np.array(hex_to_rgb('#97b017'), dtype=np.float32)
    col_sunny = np.array(hex_to_rgb('#b8c924'), dtype=np.float32)
    col_lush = np.array(hex_to_rgb('#729410'), dtype=np.float32)
    col_deep = np.array(hex_to_rgb('#3b5d0c'), dtype=np.float32)
    col_dirt_edge = np.array(hex_to_rgb('#988b26'), dtype=np.float32)
    col_dirt = np.array(hex_to_rgb('#bfa24c'), dtype=np.float32)
    col_dirt_inner = np.array(hex_to_rgb('#d4b45c'), dtype=np.float32)

    t_sunny = np.clip(0.48 + 0.42 * n1 + 0.20 * n2, 0.0, 1.0)[..., None]
    rgb = col_base * (1.0 - t_sunny) + col_sunny * t_sunny

    center_mask = np.exp(-((wx / 3.4) ** 4) - ((wy / 6.0) ** 4))[..., None]
    rgb = rgb * (1.0 - 0.16 * center_mask) + (col_sunny * 1.02) * (0.16 * center_mask)

    lane_wear = (np.exp(-((wx + 2.27) / 0.68) ** 2)
                 + np.exp(-(wx / 0.74) ** 2)
                 + np.exp(-((wx - 2.27) / 0.68) ** 2))
    lane_wear *= np.clip(1.0 - (np.abs(wy) / 6.5) ** 4, 0.0, 1.0)
    lane_t = (np.clip(lane_wear * (0.16 + 0.08 * n2), 0.0, 0.22))[..., None]
    rgb = rgb * (1.0 - lane_t) + np.array(hex_to_rgb('#c2cd34'), dtype=np.float32) * lane_t

    tuft_bright = np.clip((strokes - 0.18) * 1.65, 0.0, 1.0) * (0.5 + 0.5 * n2)
    tuft_dark = np.clip((-strokes - 0.20) * 1.60, 0.0, 1.0) * (0.5 + 0.5 * n3)
    rgb = rgb * (1.0 - 0.28 * tuft_bright[..., None]) + np.array(hex_to_rgb('#c8d832'), dtype=np.float32) * (0.28 * tuft_bright[..., None])
    rgb = rgb * (1.0 - 0.35 * tuft_dark[..., None]) + col_lush * (0.35 * tuft_dark[..., None])

    dirt_spots = [
        (-2.85, 5.1, 1.05, 0.48, 0.74),
        (2.45, 4.3, 0.92, 0.42, 0.66),
        (3.15, 2.0, 0.95, 0.44, 0.70),
        (-3.20, 0.3, 0.92, 0.42, 0.68),
        (2.65, -0.5, 0.82, 0.38, 0.62),
        (-2.65, -2.5, 1.00, 0.45, 0.72),
        (1.55, -2.1, 0.72, 0.34, 0.56),
        (-2.55, -5.8, 1.05, 0.46, 0.70),
        (1.35, -6.2, 1.15, 0.52, 0.72),
    ]
    for dx, dy, rx, ry, strength in dirt_spots:
        dist_sq = ((wx - dx + 0.18 * n2) / rx) ** 2 + ((wy - dy + 0.14 * n3) / ry) ** 2
        spot_ring = np.clip(1.0 - dist_sq * 0.76, 0.0, 1.0) ** 1.5
        spot = np.clip(1.0 - dist_sq, 0.0, 1.0) ** 1.6
        spot_inner = np.clip(1.0 - dist_sq * 1.65, 0.0, 1.0) ** 1.8
        sr = (spot_ring * strength * 0.48)[..., None]
        st = (spot * strength)[..., None]
        st_in = (spot_inner * strength * 0.72)[..., None]
        rgb = rgb * (1.0 - sr) + col_dirt_edge * sr
        rgb = rgb * (1.0 - st) + col_dirt * st
        rgb = rgb * (1.0 - st_in) + col_dirt_inner * st_in

    wobble_x = 0.35 * n1 + 0.20 * n2
    edge_x = np.clip((np.abs(wx) - (4.05 + wobble_x)) / 1.65, 0.0, 1.0) ** 1.35
    y_wall_env = np.clip(1.0 - (np.abs(wy) / 9.8) ** 3.2, 0.18, 1.0)
    edge_top = np.clip((wy - (7.8 + 0.4 * n1)) / 4.2, 0.0, 1.0) ** 1.5
    edge_bot = np.clip((-wy - (9.2 + 0.4 * n1)) / 4.5, 0.0, 1.0) ** 1.5
    edge_ao = np.clip(edge_x * y_wall_env * 0.72 + edge_top * 0.45 + edge_bot * 0.32, 0.0, 0.80)[..., None]
    rgb = rgb * (1.0 - edge_ao) + col_deep * edge_ao

    rgb = np.clip(rgb, 0.0, 1.0)
    rgba = np.ones((height, width, 4), dtype=np.float32)
    rgba[:, :, :3] = rgb

    if "Meadow_Ground_Tex" in bpy.data.images:
        bpy.data.images.remove(bpy.data.images["Meadow_Ground_Tex"])
    img = bpy.data.images.new("Meadow_Ground_Tex", width=width, height=height, alpha=False)
    img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw = str(tex_path)
    img.file_format = 'PNG'
    img.save()
    img.pack()
    return img


def make_vcol_mat(name, roughness=0.78, metallic=0.0, specular=0.22):
    if name in bpy.data.materials:
        bpy.data.materials.remove(bpy.data.materials[name])
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    if 'Specular IOR Level' in bsdf.inputs:
        bsdf.inputs['Specular IOR Level'].default_value = specular
    vc = nt.nodes.new('ShaderNodeVertexColor')
    vc.layer_name = 'Col'
    nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
    return mat


def make_ground_mat(name, img):
    if name in bpy.data.materials:
        bpy.data.materials.remove(bpy.data.materials[name])
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Roughness'].default_value = 0.88
    bsdf.inputs['Metallic'].default_value = 0.0
    if 'Specular IOR Level' in bsdf.inputs:
        bsdf.inputs['Specular IOR Level'].default_value = 0.14
    tex_node = nt.nodes.new('ShaderNodeTexImage')
    tex_node.image = img
    tex_node.extension = 'EXTEND'
    nt.links.new(tex_node.outputs['Color'], bsdf.inputs['Base Color'])
    return mat


def finalize_meadow_mesh(bm, name, mats, smooth=True):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        f.smooth = smooth
    if name in bpy.data.meshes:
        bpy.data.meshes.remove(bpy.data.meshes[name])
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for m in mats:
        mesh.materials.append(m)
    mesh.update()
    return mesh


def build_meadow_ground_mesh(mat_ground):
    bm = bmesh.new()
    nx, ny = 42, 58
    bmesh.ops.create_grid(bm, x_segments=nx, y_segments=ny, size=1.0)
    uv_layer = bm.loops.layers.uv.new('UVMap')

    xs = [v.co.x for v in bm.verts]
    ys = [v.co.y for v in bm.verts]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)

    for v in bm.verts:
        u = (v.co.x - min_x) / (max_x - min_x)
        vn = (v.co.y - min_y) / (max_y - min_y)
        wx = (u - 0.5) * 21.0
        wy = -15.5 + vn * 29.0
        ax = abs(wx)
        if ax > 3.95:
            t_edge = min(1.0, (ax - 3.95) / 2.4)
            undul = 0.08 * math.sin(wy * 0.7 + wx * 0.5) + 0.05 * math.cos(wy * 1.3)
            wz = (t_edge ** 1.6) * 0.24 + max(0.0, undul * t_edge)
        else:
            wz = 0.0
        v.co = Vector((wx, wy, wz))

    for f in bm.faces:
        for loop in f.loops:
            co = loop.vert.co
            u = (co.x / 21.0) + 0.5
            vn = (co.y + 15.5) / 29.0
            loop[uv_layer].uv = (u, vn)

    return finalize_meadow_mesh(bm, 'Meadow_Ground_Mesh', [mat_ground], smooth=True)


def build_terrace_bank_mesh(name, length_y=3.2, width_x=2.2, height=1.18, curve_x=0.28, seed=0, mat=None):
    bm = bmesh.new()
    col_layer = bm.loops.layers.color.new('Col')

    c_soil_deep = hex_to_srgb('#4b240d')
    c_soil_mid = hex_to_srgb('#914d1f')
    c_soil_ochre = hex_to_srgb('#c87c38')
    c_grass_fringe = hex_to_srgb('#27590e')
    c_grass_rim = hex_to_srgb('#60a61c')
    c_grass_top = hex_to_srgb('#92c222')
    c_grass_outer = hex_to_srgb('#4d8715')

    n_seg_y = 16
    n_seg_x = 6
    pts = []
    for i in range(n_seg_y + 1):
        ty = -0.5 + i / n_seg_y
        y = ty * length_y
        wobble = (math.sin(ty * math.pi) * curve_x
                  + 0.12 * math.sin(ty * 9.5 + seed * 1.7)
                  + 0.07 * math.cos(ty * 15.0 - seed))
        x = width_x * 0.5 + wobble
        pts.append((x, y, True))
    for i in range(1, n_seg_x):
        tx = 0.5 - i / n_seg_x
        x = tx * width_x
        y = 0.5 * length_y + 0.14 * math.sin(tx * math.pi)
        pts.append((x, y, True))
    for i in range(n_seg_y + 1):
        ty = 0.5 - i / n_seg_y
        y = ty * length_y
        x = -width_x * 0.5 - 0.08 * math.sin(ty * math.pi)
        pts.append((x, y, False))
    for i in range(1, n_seg_x):
        tx = -0.5 + i / n_seg_x
        x = tx * width_x
        y = -0.5 * length_y - 0.14 * math.sin((tx + 0.5) * math.pi)
        pts.append((x, y, True))

    n_pts = len(pts)
    cliff_rings = []
    for rz, flare, col_a, col_b in (
        (-0.05, 1.20, c_soil_deep, c_soil_deep),
        (height * 0.32, 1.08, c_soil_deep, c_soil_mid),
        (height * 0.68, 0.97, c_soil_mid, c_soil_ochre),
        (height * 0.83, 0.92, c_soil_ochre, c_soil_deep),
    ):
        ring_v = []
        for idx, (px, py, is_vis) in enumerate(pts):
            gully = 0.09 * math.sin(idx * 2.1 + seed) if is_vis else 0.0
            vx = px * flare + gully * (1.0 - abs(rz / height - 0.45))
            vy = py * (1.0 + (flare - 1.0) * 0.35)
            v = bm.verts.new((vx, vy, rz))
            shade = 0.5 + 0.5 * math.sin(idx * 1.6 + seed)
            v_col = lerp_col(col_a, col_b, shade)
            ring_v.append((v, v_col))
        cliff_rings.append(ring_v)

    for r in range(len(cliff_rings) - 1):
        ra, rb = cliff_rings[r], cliff_rings[r + 1]
        for i in range(n_pts):
            j = (i + 1) % n_pts
            f = bm.faces.new((ra[i][0], ra[j][0], rb[j][0], rb[i][0]))
            for loop, vc in zip(f.loops, (ra[i][1], ra[j][1], rb[j][1], rb[i][1])):
                loop[col_layer] = vc

    grass_rings = []
    for rz, expand_x, expand_y, col_g, scallop_amp in (
        (height * 0.76, 0.93, 0.94, c_grass_fringe, 0.0),
        (height * 0.82, 1.11, 1.05, c_grass_fringe, -0.05),
        (height * 0.95, 1.12, 1.06, c_grass_rim, 0.02),
        (height * 1.03, 0.98, 0.98, c_grass_top, 0.0),
        (height * 1.06, 0.42, 0.70, c_grass_outer, 0.0),
    ):
        ring_v = []
        for idx, (px, py, is_vis) in enumerate(pts):
            puff = 1.0 + (0.05 * math.sin(idx * 2.6 + seed) if is_vis else 0.0)
            dz = scallop_amp * (0.5 + 0.5 * math.cos(idx * 3.0 + seed)) if is_vis else 0.0
            vx = px * expand_x * puff
            vy = py * expand_y
            v = bm.verts.new((vx, vy, rz + dz))
            inner_t = max(0.0, min(1.0, (px / max(0.1, width_x)) + 0.5))
            c = lerp_col(c_grass_outer, col_g, 0.35 + 0.65 * inner_t)
            ring_v.append((v, c))
        grass_rings.append(ring_v)

    for r in range(len(grass_rings) - 1):
        ra, rb = grass_rings[r], grass_rings[r + 1]
        for i in range(n_pts):
            j = (i + 1) % n_pts
            f = bm.faces.new((ra[i][0], ra[j][0], rb[j][0], rb[i][0]))
            for loop, vc in zip(f.loops, (ra[i][1], ra[j][1], rb[j][1], rb[i][1])):
                loop[col_layer] = vc

    top_center = bm.verts.new((-width_x * 0.12, 0.0, height * 1.07))
    inner_ring = grass_rings[-1]
    for i in range(n_pts):
        j = (i + 1) % n_pts
        f = bm.faces.new((inner_ring[i][0], inner_ring[j][0], top_center))
        f.loops[0][col_layer] = inner_ring[i][1]
        f.loops[1][col_layer] = inner_ring[j][1]
        f.loops[2][col_layer] = c_grass_outer

    return finalize_meadow_mesh(bm, name, [mat], smooth=True)


def add_beveled_stone_block(bm, col_layer, center, size_xyz, rot_z, col_top, col_side, col_bot, bevel=0.18, batter_x=0.0):
    hx, hy, hz = size_xyz[0] * 0.5, size_xyz[1] * 0.5, size_xyz[2]
    c_pts = [
        (hx, hy * 0.76), (hx * 0.76, hy),
        (-hx * 0.76, hy), (-hx, hy * 0.76),
        (-hx, -hy * 0.76), (-hx * 0.76, -hy),
        (hx * 0.76, -hy), (hx, -hy * 0.76),
    ]
    rot_m = Matrix.Rotation(rot_z, 4, 'Z')
    trans_m = Matrix.Translation(center) @ rot_m

    rings = []
    for z_rel, sc_xy, shift_x, col_r in (
        (0.0, 0.94, batter_x, col_bot),
        (hz * 0.16, 1.00, batter_x * 0.85, col_side),
        (hz * (1.0 - bevel), 1.00, 0.0, col_side),
        (hz, 1.0 - bevel * 0.88, -batter_x * 0.15, col_top),
    ):
        rv = []
        for px, py in c_pts:
            p = trans_m @ Vector((px * sc_xy + shift_x, py * sc_xy, z_rel))
            rv.append((bm.verts.new(p), col_r))
        rings.append(rv)

    n = len(c_pts)
    for r in range(len(rings) - 1):
        ra, rb = rings[r], rings[r + 1]
        for i in range(n):
            j = (i + 1) % n
            f = bm.faces.new((ra[i][0], ra[j][0], rb[j][0], rb[i][0]))
            for loop, vc in zip(f.loops, (ra[i][1], ra[j][1], rb[j][1], rb[i][1])):
                loop[col_layer] = vc

    top_ring = rings[-1]
    f_top = bm.faces.new([v for v, _ in top_ring])
    for loop in f_top.loops:
        loop[col_layer] = col_top


def build_curved_stone_wall_mesh(name, length_y=3.5, curve_x=0.44, tiers=3, pillar_at=None, stepped_top=False, seed=0, mat=None):
    bm = bmesh.new()
    col_layer = bm.loops.layers.color.new('Col')

    c_mortar = hex_to_srgb('#543b22')
    c_stone_top = hex_to_srgb('#f7e4bf')
    c_stone_upper = hex_to_srgb('#e6c796')
    c_stone_mid = hex_to_srgb('#c9a16e')
    c_stone_low = hex_to_srgb('#8c6a42')
    c_moss = hex_to_srgb('#639c1e')

    def path_xy(ty):
        y = ty * length_y
        x = math.sin((ty + 0.5) * math.pi) * curve_x
        dx_dy = (math.pi / length_y) * math.cos((ty + 0.5) * math.pi) * curve_x
        ang = math.atan2(dx_dy, 1.0)
        return x, y, -ang

    core_segs = 10
    core_w = 0.40
    core_h = (tiers - 0.32) * 0.36
    core_rings = []
    for rz, shift_x in ((0.0, 0.12), (core_h, 0.02)):
        pts_l, pts_r = [], []
        for i in range(core_segs + 1):
            ty = -0.46 + 0.92 * (i / core_segs)
            cx, cy, _ = path_xy(ty)
            h_cur = rz * (1.0 - (0.22 * (ty + 0.5) if stepped_top else 0.0))
            pts_l.append(bm.verts.new((cx - core_w * 0.5 + shift_x, cy, h_cur)))
            pts_r.append(bm.verts.new((cx + core_w * 0.5 + shift_x, cy, h_cur)))
        ring = pts_r + list(reversed(pts_l))
        core_rings.append(ring)
    n_cr = len(core_rings[0])
    for i in range(n_cr):
        j = (i + 1) % n_cr
        f = bm.faces.new((core_rings[0][i], core_rings[0][j], core_rings[1][j], core_rings[1][i]))
        for loop in f.loops:
            loop[col_layer] = c_mortar

    course_h = 0.36
    for tier in range(tiers):
        z0 = tier * course_h
        is_coping = (tier == tiers - 1)
        num_blocks = 5 if not is_coping else 4
        step_t = 1.0 / num_blocks
        offset_t = (0.5 * step_t) if (tier % 2 == 1 and not is_coping) else 0.0
        tier_shift_x = (tiers - 1 - tier) * 0.12

        for b_idx in range(num_blocks + (1 if offset_t > 0 else 0)):
            t_start = -0.5 + b_idx * step_t - offset_t
            t_end = t_start + step_t
            t_start = max(-0.52, t_start)
            t_end = min(0.52, t_end)
            if t_end - t_start < 0.09:
                continue
            t_mid = 0.5 * (t_start + t_end)
            bx, by, bang = path_xy(t_mid)
            blen = (t_end - t_start) * length_y * 0.91
            bwidth = 0.78 if is_coping else (0.74 - tier * 0.02)
            step_drop = (0.12 * b_idx if (is_coping and stepped_top) else 0.0)
            bheight = course_h * (0.98 if is_coping else 0.92) - step_drop

            jitter = 0.5 + 0.5 * math.sin(b_idx * 2.9 + tier * 4.3 + seed)
            ct = lerp_col(c_stone_upper, c_stone_top, 0.35 + 0.65 * jitter) if is_coping else lerp_col(c_stone_mid, c_stone_upper, jitter)
            cs = lerp_col(c_stone_mid, c_stone_upper, 0.25 + 0.55 * jitter)
            cb = lerp_col(c_stone_low, c_moss if tier == 0 and jitter > 0.6 else c_stone_low, 0.4)

            add_beveled_stone_block(
                bm, col_layer,
                Vector((bx + tier_shift_x, by, z0)),
                (bwidth, blen, max(0.18, bheight)),
                bang,
                ct, cs, cb,
                bevel=0.24 if is_coping else 0.18,
                batter_x=0.06,
            )

    if pillar_at in ('pos_y', 'neg_y'):
        ty_p = 0.50 if pillar_at == 'pos_y' else -0.50
        px, py, pang = path_xy(ty_p)
        p_h = (tiers + 0.38) * course_h
        add_beveled_stone_block(
            bm, col_layer,
            Vector((px + 0.06, py, 0.0)),
            (0.84, 0.80, p_h * 0.76),
            pang,
            c_stone_upper, c_stone_mid, c_stone_low,
            bevel=0.18,
            batter_x=0.07,
        )
        add_beveled_stone_block(
            bm, col_layer,
            Vector((px + 0.03, py, p_h * 0.76)),
            (0.90, 0.86, p_h * 0.26),
            pang,
            c_stone_top, c_stone_upper, c_stone_mid,
            bevel=0.24,
            batter_x=0.03,
        )

    return finalize_meadow_mesh(bm, name, [mat], smooth=False)


def build_hero_tree_mesh(name, height=3.9, canopy_scale=1.0, root_reach=0.82, canopy_offset=(0.0, 0.55), seed=0, mat=None):
    bm = bmesh.new()
    col_layer = bm.loops.layers.color.new('Col')

    c_bark_dark = hex_to_srgb('#45230d')
    c_bark_mid = hex_to_srgb('#824b22')
    c_bark_sun = hex_to_srgb('#b5713a')
    c_bark_moss = hex_to_srgb('#58841e')

    cx_off, cy_off = canopy_offset
    t_top = height * 0.56
    trunk_steps = 8
    n_sides = 10
    trunk_rings = []
    for k in range(trunk_steps + 1):
        tk = k / trunk_steps
        z = tk * t_top
        r_base = 0.42 * (1.0 - 0.40 * tk) + (0.16 * (1.0 - tk) ** 2.2)
        ox = cx_off * (tk ** 1.35) + 0.12 * math.sin(tk * math.pi * 1.1 + seed)
        oy = cy_off * (tk ** 1.35) + 0.07 * math.cos(tk * math.pi * 0.9 - seed)
        rv = []
        for i in range(n_sides):
            ang = 2.0 * math.pi * i / n_sides + tk * 0.28
            furrow = 1.0 + 0.14 * math.sin(i * 3.0 + tk * 4.0) + (0.20 * (1.0 - tk) ** 1.8 if i % 2 == 0 else 0.0)
            vx = math.cos(ang) * r_base * furrow + ox
            vy = math.sin(ang) * r_base * furrow + oy
            v = bm.verts.new((vx, vy, z))
            sun_dot = 0.5 + 0.38 * math.cos(ang + 0.7) + 0.12 * tk
            vc = lerp_col(c_bark_dark, c_bark_sun if furrow > 1.02 else c_bark_mid, sun_dot)
            if tk < 0.22 and i % 3 == 0:
                vc = lerp_col(vc, c_bark_moss, 0.35)
            rv.append((v, vc))
        trunk_rings.append(rv)

    for k in range(trunk_steps):
        ra, rb = trunk_rings[k], trunk_rings[k + 1]
        for i in range(n_sides):
            j = (i + 1) % n_sides
            f = bm.faces.new((ra[i][0], ra[j][0], rb[j][0], rb[i][0]))
            for loop, vc in zip(f.loops, (ra[i][1], ra[j][1], rb[j][1], rb[i][1])):
                loop[col_layer] = vc

    for r_idx in range(5):
        angles_deg = [-95, -55, -15, 75, 165]
        base_ang = math.radians(angles_deg[r_idx]) + seed * 0.12
        is_front_root = r_idx in (0, 1, 2)
        reach = root_reach * (0.95 if is_front_root else 0.65)
        drop_z = -0.85 if is_front_root else -0.18
        root_rings = []
        for s in range(7):
            ts = s / 6.0
            cur_ang = base_ang + 0.22 * math.sin(ts * math.pi + r_idx)
            radial_t = math.sin(ts * math.pi * 0.58)
            dist = 0.22 + radial_t * reach
            rz = t_top * 0.32 * ((1.0 - ts) ** 1.5) + drop_z * (ts ** 1.8)
            rr = 0.22 * (1.0 - 0.68 * ts)
            cx = math.cos(cur_ang) * dist
            cy = math.sin(cur_ang) * dist
            rv = []
            for i in range(6):
                a = 2.0 * math.pi * i / 6.0
                p = Vector((
                    cx + math.cos(a) * rr * 0.85,
                    cy + math.sin(a) * rr * 0.85,
                    rz + math.sin(a) * rr * 1.10,
                ))
                vc = lerp_col(c_bark_dark, c_bark_sun, 0.30 + 0.52 * math.sin(a) + 0.18 * (1.0 - ts))
                rv.append((bm.verts.new(p), vc))
            root_rings.append(rv)
        for s in range(6):
            ra, rb = root_rings[s], root_rings[s + 1]
            for i in range(6):
                j = (i + 1) % 6
                f = bm.faces.new((ra[i][0], ra[j][0], rb[j][0], rb[i][0]))
                for loop, vc in zip(f.loops, (ra[i][1], ra[j][1], rb[j][1], rb[i][1])):
                    loop[col_layer] = vc

    c_leaf_shadow = hex_to_srgb('#1b4a10')
    c_leaf_deep = hex_to_srgb('#347516')
    c_leaf_mid = hex_to_srgb('#63ab1e')
    c_leaf_bright = hex_to_srgb('#9ed126')
    c_leaf_gold = hex_to_srgb('#e4f042')

    c_base = Vector((cx_off, cy_off, t_top))
    puffs = [
        (c_base + Vector((0.0, 0.0, 0.15)), Vector((1.30, 1.24, 0.74)) * canopy_scale, 0.0),
        (c_base + Vector((0.84, 0.44, 0.05)), Vector((0.85, 0.82, 0.64)) * canopy_scale, 0.15),
        (c_base + Vector((-0.82, 0.50, 0.08)), Vector((0.88, 0.84, 0.66)) * canopy_scale, 0.12),
        (c_base + Vector((0.72, -0.52, 0.10)), Vector((0.84, 0.80, 0.62)) * canopy_scale, 0.18),
        (c_base + Vector((-0.74, -0.50, 0.12)), Vector((0.86, 0.82, 0.64)) * canopy_scale, 0.15),
        (c_base + Vector((0.05, -0.78, 0.14)), Vector((0.80, 0.76, 0.60)) * canopy_scale, 0.20),
        (c_base + Vector((-0.05, 0.88, 0.10)), Vector((0.86, 0.84, 0.66)) * canopy_scale, 0.12),
        (c_base + Vector((0.56, 0.34, 0.64)), Vector((0.90, 0.86, 0.74)) * canopy_scale, 0.48),
        (c_base + Vector((-0.58, 0.32, 0.62)), Vector((0.90, 0.86, 0.72)) * canopy_scale, 0.45),
        (c_base + Vector((0.46, -0.40, 0.60)), Vector((0.86, 0.82, 0.70)) * canopy_scale, 0.50),
        (c_base + Vector((-0.46, -0.38, 0.62)), Vector((0.86, 0.82, 0.70)) * canopy_scale, 0.45),
        (c_base + Vector((0.0, 0.0, 0.72)), Vector((1.16, 1.12, 0.84)) * canopy_scale, 0.52),
        (c_base + Vector((0.30, -0.18, 1.20)), Vector((0.84, 0.80, 0.66)) * canopy_scale, 0.82),
        (c_base + Vector((-0.26, 0.22, 1.16)), Vector((0.82, 0.78, 0.64)) * canopy_scale, 0.78),
        (c_base + Vector((0.05, -0.04, 1.44)), Vector((0.74, 0.70, 0.56)) * canopy_scale, 0.95),
    ]

    for p_idx, (p_pos, p_sc, tier_bias) in enumerate(puffs):
        res = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
        vset = set(res['verts'])
        vert_cols = {}
        for v in res['verts']:
            n_dir = v.co.normalized()
            lobe = 1.0 + 0.11 * math.sin(n_dir.x * 4.5 + p_idx) * math.cos(n_dir.y * 4.5 - p_idx) + 0.06 * math.sin(n_dir.z * 6.0)
            local_z = n_dir.z
            if v.co.z < 0:
                v.co.z *= 0.68
            v.co = Vector((v.co.x * p_sc.x * lobe, v.co.y * p_sc.y * lobe, v.co.z * p_sc.z * lobe)) + p_pos

            local_t = max(0.0, min(1.0, (local_z + 0.75) / 1.65))
            sun_t = max(0.0, min(1.0, 0.5 + 0.22 * n_dir.x - 0.22 * n_dir.y))
            t_col = max(0.0, min(1.0, tier_bias * 0.48 + local_t * 0.42 + sun_t * 0.10))
            if t_col < 0.24:
                c = lerp_col(c_leaf_shadow, c_leaf_deep, t_col / 0.24)
            elif t_col < 0.52:
                c = lerp_col(c_leaf_deep, c_leaf_mid, (t_col - 0.24) / 0.28)
            elif t_col < 0.78:
                c = lerp_col(c_leaf_mid, c_leaf_bright, (t_col - 0.52) / 0.26)
            else:
                c = lerp_col(c_leaf_bright, c_leaf_gold, (t_col - 0.78) / 0.22)
            vert_cols[v] = c

        for f in bm.faces:
            if all(v in vset for v in f.verts):
                for loop in f.loops:
                    loop[col_layer] = vert_cols[loop.vert]

    return finalize_meadow_mesh(bm, name, [mat], smooth=True)


def add_faceted_boulder_to_bm(bm, col_layer, center, scale_xyz, rot_deg, seed=0):
    c_rock_shadow = hex_to_srgb('#4e3f38')
    c_rock_mid = hex_to_srgb('#877568')
    c_rock_warm = hex_to_srgb('#bda693')
    c_rock_ridge = hex_to_srgb('#eee0d0')

    res = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=0.85)
    vset = list(res['verts'])
    rot_m = Euler(tuple(math.radians(a) for a in rot_deg)).to_matrix().to_4x4()

    planes = [
        (Vector((0.0, 0.0, 1.0)).normalized(), 0.58),
        (Vector((0.65, -0.55, 0.52)).normalized(), 0.60),
        (Vector((-0.68, -0.48, 0.55)).normalized(), 0.61),
        (Vector((0.55, 0.65, 0.52)).normalized(), 0.62),
        (Vector((-0.60, 0.62, 0.50)).normalized(), 0.60),
        (Vector((0.88, 0.12, 0.18)).normalized(), 0.66),
        (Vector((-0.86, -0.15, 0.20)).normalized(), 0.66),
    ]

    for v in vset:
        p = v.co.copy()
        p.x += 0.08 * math.sin(p.y * 3.0 + seed)
        p.y += 0.08 * math.cos(p.x * 3.0 - seed)
        for n_pl, d_pl in planes:
            dot = p.dot(n_pl)
            if dot > d_pl:
                p -= n_pl * ((dot - d_pl) * 0.76)
        if p.z < -0.25:
            p.z = -0.25 + (p.z + 0.25) * 0.2
        p.z += 0.22
        p = Vector((p.x * scale_xyz[0], p.y * scale_xyz[1], p.z * scale_xyz[2]))
        v.co = (rot_m @ p) + center

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        if all(v in vset for v in f.verts):
            fn = f.normal
            for loop in f.loops:
                v = loop.vert
                adj_normals = [af.normal for af in v.link_faces]
                avg_n = sum(adj_normals, Vector((0, 0, 0))) / max(1, len(adj_normals))
                curvature = max(0.0, min(1.0, (1.0 - avg_n.length) * 9.5))
                ht = max(0.0, min(1.0, (v.co.z - center.z) / max(0.2, 0.85 * scale_xyz[2])))
                sun_d = max(0.0, min(1.0, 0.45 + 0.38 * fn.z + 0.22 * fn.x - 0.18 * fn.y))
                c = lerp_col(c_rock_shadow, c_rock_mid, min(1.0, ht * 1.15))
                c = lerp_col(c, c_rock_warm, sun_d * 0.82)
                if ht > 0.18 and curvature > 0.09:
                    c = lerp_col(c, c_rock_ridge, min(0.92, curvature * 0.92 + (ht - 0.40) * 0.38))
                loop[col_layer] = c


def add_grass_blade_fan_to_bm(bm, col_layer, center, scale=1.0, rot_z_deg=0.0, count=7):
    c_base = hex_to_srgb('#204f0b')
    c_mid = hex_to_srgb('#5aa318')
    c_ridge = hex_to_srgb('#8ad022')
    c_tip = hex_to_srgb('#c9e836')

    rot_base = Matrix.Rotation(math.radians(rot_z_deg), 4, 'Z')
    for i in range(count):
        t_i = (i / max(1, count - 1)) - 0.5
        ang = t_i * 1.45 + (0.14 if i % 2 == 0 else -0.14)
        rot_m = Matrix.Translation(center) @ rot_base @ Matrix.Rotation(ang, 4, 'Z')
        h = (0.70 + 0.26 * math.cos(t_i * 2.1)) * scale
        w = 0.14 * scale
        th = 0.048 * scale
        bend = (0.28 + 0.18 * abs(t_i)) * scale

        rings = []
        for s_z, s_b, s_w, col_edge, col_sp in (
            (-0.02, 0.0, 1.0, c_base, c_base),
            (h * 0.45, bend * 0.34, 0.82, c_mid, c_ridge),
            (h * 0.78, bend * 0.74, 0.46, lerp_col(c_mid, c_tip, 0.55), c_tip),
        ):
            vl = bm.verts.new(rot_m @ Vector((-w * s_w, s_b, s_z)))
            vr = bm.verts.new(rot_m @ Vector((w * s_w, s_b, s_z)))
            vc = bm.verts.new(rot_m @ Vector((0.0, s_b - th * s_w, s_z + th * 0.5 * s_w)))
            rings.append(((vl, col_edge), (vr, col_edge), (vc, col_sp)))

        vt = bm.verts.new(rot_m @ Vector((0.0, bend, h)))

        for r in range(len(rings) - 1):
            ra, rb = rings[r], rings[r + 1]
            for k in range(3):
                m = (k + 1) % 3
                f = bm.faces.new((ra[k][0], ra[m][0], rb[m][0], rb[k][0]))
                for lp, vc_col in zip(f.loops, (ra[k][1], ra[m][1], rb[m][1], rb[k][1])):
                    lp[col_layer] = vc_col

        top_r = rings[-1]
        for k in range(3):
            m = (k + 1) % 3
            f = bm.faces.new((top_r[k][0], top_r[m][0], vt))
            for lp, vc_col in zip(f.loops, (top_r[k][1], top_r[m][1], c_tip)):
                lp[col_layer] = vc_col


def build_boulder_cluster_mesh(name, mat, variant='A'):
    bm = bmesh.new()
    col_layer = bm.loops.layers.color.new('Col')

    if variant == 'A':
        add_faceted_boulder_to_bm(bm, col_layer, Vector((0.0, 0.0, 0.0)), (1.24, 1.06, 1.10), (4, -6, 18), seed=1)
        add_faceted_boulder_to_bm(bm, col_layer, Vector((0.70, -0.54, 0.0)), (0.78, 0.74, 0.70), (-5, 8, -32), seed=2)
        add_faceted_boulder_to_bm(bm, col_layer, Vector((-0.64, -0.46, 0.0)), (0.50, 0.46, 0.42), (6, 4, 45), seed=3)
        add_grass_blade_fan_to_bm(bm, col_layer, Vector((0.18, 0.58, 0.0)), scale=1.22, rot_z_deg=15, count=7)
        add_grass_blade_fan_to_bm(bm, col_layer, Vector((-0.65, 0.25, 0.0)), scale=1.00, rot_z_deg=65, count=6)
        add_grass_blade_fan_to_bm(bm, col_layer, Vector((0.88, -0.15, 0.0)), scale=0.92, rot_z_deg=-40, count=5)
    elif variant == 'B':
        add_faceted_boulder_to_bm(bm, col_layer, Vector((0.0, 0.0, 0.0)), (1.32, 1.14, 1.16), (-4, 6, -22), seed=4)
        add_faceted_boulder_to_bm(bm, col_layer, Vector((-0.76, -0.44, 0.0)), (0.70, 0.66, 0.60), (6, -5, 28), seed=5)
        add_faceted_boulder_to_bm(bm, col_layer, Vector((-1.18, -0.26, 0.0)), (0.44, 0.42, 0.38), (0, 8, -50), seed=6)
        add_grass_blade_fan_to_bm(bm, col_layer, Vector((0.15, -0.68, 0.0)), scale=1.28, rot_z_deg=175, count=8)
        add_grass_blade_fan_to_bm(bm, col_layer, Vector((-0.45, 0.55, 0.0)), scale=1.05, rot_z_deg=25, count=6)
    else:
        add_faceted_boulder_to_bm(bm, col_layer, Vector((0.0, 0.0, 0.0)), (0.88, 0.80, 0.76), (3, -4, 15), seed=7)
        add_grass_blade_fan_to_bm(bm, col_layer, Vector((0.35, -0.35, 0.0)), scale=0.86, rot_z_deg=-35, count=5)

    return finalize_meadow_mesh(bm, name, [mat], smooth=False)


def add_daisy_flower_to_bm(bm, col_layer, center, normal_dir, scale=1.0):
    c_petal_tip = hex_to_srgb('#ffffff')
    c_petal_mid = hex_to_srgb('#fdfbf2')
    c_petal_base = hex_to_srgb('#eadfc2')
    c_core_top = hex_to_srgb('#ffe64d')
    c_core_edge = hex_to_srgb('#f08c00')

    quat = normal_dir.normalized().to_track_quat('Z', 'Y')
    mat_t = Matrix.Translation(center) @ quat.to_matrix().to_4x4()

    for p_i in range(5):
        ang = (2.0 * math.pi * p_i / 5.0) + 0.2
        pm = mat_t @ Matrix.Rotation(ang, 4, 'Z')
        r_in = 0.072 * scale
        r_mid = 0.195 * scale
        r_out = 0.305 * scale
        w_mid = 0.135 * scale
        w_out = 0.085 * scale

        v0 = bm.verts.new(pm @ Vector((-w_mid * 0.45, r_in, 0.015 * scale)))
        v1 = bm.verts.new(pm @ Vector((w_mid * 0.45, r_in, 0.015 * scale)))
        v2 = bm.verts.new(pm @ Vector((w_mid, r_mid, 0.046 * scale)))
        v3 = bm.verts.new(pm @ Vector((-w_mid, r_mid, 0.046 * scale)))
        vc_mid = bm.verts.new(pm @ Vector((0.0, r_mid, 0.068 * scale)))
        v4 = bm.verts.new(pm @ Vector((w_out, r_out * 0.90, 0.036 * scale)))
        v5 = bm.verts.new(pm @ Vector((-w_out, r_out * 0.90, 0.036 * scale)))
        vt = bm.verts.new(pm @ Vector((0.0, r_out, 0.024 * scale)))

        for f_verts, cols in (
            ((v0, v1, vc_mid), (c_petal_base, c_petal_base, c_petal_tip)),
            ((v1, v2, vc_mid), (c_petal_base, c_petal_mid, c_petal_tip)),
            ((v0, vc_mid, v3), (c_petal_base, c_petal_tip, c_petal_mid)),
            ((v2, v4, vc_mid), (c_petal_mid, c_petal_tip, c_petal_tip)),
            ((vc_mid, v5, v3), (c_petal_tip, c_petal_tip, c_petal_mid)),
            ((vc_mid, v4, vt, v5), (c_petal_tip, c_petal_tip, c_petal_tip, c_petal_tip)),
        ):
            f = bm.faces.new(f_verts)
            for lp, vc_c in zip(f.loops, cols):
                lp[col_layer] = vc_c

    core_r = 0.110 * scale
    ring_b = []
    ring_t = []
    for i in range(8):
        a = 2.0 * math.pi * i / 8.0
        ring_b.append(bm.verts.new(mat_t @ Vector((math.cos(a) * core_r, math.sin(a) * core_r, 0.018 * scale))))
        ring_t.append(bm.verts.new(mat_t @ Vector((math.cos(a) * core_r * 0.65, math.sin(a) * core_r * 0.65, 0.080 * scale))))
    top_v = bm.verts.new(mat_t @ Vector((0.0, 0.0, 0.098 * scale)))
    for i in range(8):
        j = (i + 1) % 8
        f1 = bm.faces.new((ring_b[i], ring_b[j], ring_t[j], ring_t[i]))
        for lp, vc in zip(f1.loops, (c_core_edge, c_core_edge, c_core_top, c_core_top)):
            lp[col_layer] = vc
        f2 = bm.faces.new((ring_t[i], ring_t[j], top_v))
        for lp in f2.loops:
            lp[col_layer] = c_core_top


def build_flowering_bush_mesh(name, mat, with_flowers=True):
    bm = bmesh.new()
    col_layer = bm.loops.layers.color.new('Col')

    c_bush_shadow = hex_to_srgb('#1d4f0f')
    c_bush_mid = hex_to_srgb('#4e9418')
    c_bush_bright = hex_to_srgb('#84c422')
    c_bush_gold = hex_to_srgb('#c2df32')

    lobes = [
        (Vector((0.0, 0.0, 0.32)), Vector((0.58, 0.50, 0.38)), 0.25),
        (Vector((0.42, 0.16, 0.24)), Vector((0.44, 0.38, 0.30)), 0.15),
        (Vector((-0.42, 0.14, 0.26)), Vector((0.45, 0.39, 0.31)), 0.15),
        (Vector((0.32, -0.26, 0.22)), Vector((0.42, 0.37, 0.28)), 0.12),
        (Vector((-0.30, -0.24, 0.23)), Vector((0.42, 0.36, 0.28)), 0.12),
        (Vector((0.0, 0.28, 0.38)), Vector((0.45, 0.40, 0.34)), 0.40),
        (Vector((0.04, -0.04, 0.48)), Vector((0.42, 0.38, 0.30)), 0.55),
    ]

    for l_idx, (l_pos, l_sc, t_bias) in enumerate(lobes):
        res = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
        vset = set(res['verts'])
        vert_cols = {}
        for v in res['verts']:
            n_dir = v.co.normalized()
            if v.co.z < 0:
                v.co.z *= 0.65
            v.co = Vector((v.co.x * l_sc.x, v.co.y * l_sc.y, v.co.z * l_sc.z)) + l_pos
            ht = max(0.0, min(1.0, (n_dir.z + 0.7) / 1.6 * 0.65 + t_bias * 0.35))
            if ht < 0.34:
                c = lerp_col(c_bush_shadow, c_bush_mid, ht / 0.34)
            elif ht < 0.74:
                c = lerp_col(c_bush_mid, c_bush_bright, (ht - 0.34) / 0.40)
            else:
                c = lerp_col(c_bush_bright, c_bush_gold, (ht - 0.74) / 0.26)
            vert_cols[v] = c
        for f in bm.faces:
            if all(v in vset for v in f.verts):
                for loop in f.loops:
                    loop[col_layer] = vert_cols[loop.vert]

    add_grass_blade_fan_to_bm(bm, col_layer, Vector((0.0, 0.14, 0.44)), scale=0.75, rot_z_deg=0, count=5)

    if with_flowers:
        flower_spots = [
            (Vector((-0.34, -0.24, 0.68)), Vector((-0.32, -0.45, 0.83)), 0.95),
            (Vector((0.08, 0.06, 0.82)), Vector((-0.18, -0.42, 0.89)), 1.05),
            (Vector((0.34, -0.26, 0.64)), Vector((0.08, -0.48, 0.87)), 0.90),
        ]
        for f_pos, f_dir, f_sc in flower_spots:
            add_daisy_flower_to_bm(bm, col_layer, f_pos, f_dir, scale=f_sc)

    return finalize_meadow_mesh(bm, name, [mat], smooth=True)


def build_grass_tuft_mesh(name, mat):
    bm = bmesh.new()
    col_layer = bm.loops.layers.color.new('Col')
    add_grass_blade_fan_to_bm(bm, col_layer, Vector((0.0, 0.0, 0.0)), scale=1.02, rot_z_deg=0, count=7)
    add_daisy_flower_to_bm(bm, col_layer, Vector((0.08, -0.14, 0.34)), Vector((0.0, -0.50, 0.86)), scale=0.72)
    return finalize_meadow_mesh(bm, name, [mat], smooth=False)


def build_meadow_scene(scene, out_dir: Path, export_glb=True):
    for o in list(scene.collection.objects):
        bpy.data.objects.remove(o, do_unlink=True)

    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0

    tex_path = out_dir / '_meadow_ground_tex.png'
    ground_img = generate_meadow_ground_texture(tex_path, width=768, height=1024)
    mat_ground = make_ground_mat('Mat_Meadow_Ground_HD', ground_img)
    mat_env = make_vcol_mat('Mat_Meadow_Stylized_Env', roughness=0.78, metallic=0.0, specular=0.22)
    mat_stone = make_vcol_mat('Mat_Meadow_Stylized_Stone', roughness=0.74, metallic=0.0, specular=0.28)
    mat_foliage = make_vcol_mat('Mat_Meadow_Stylized_Foliage', roughness=0.72, metallic=0.0, specular=0.20)

    m_ground = build_meadow_ground_mesh(mat_ground)
    m_bank_a = build_terrace_bank_mesh('Meadow_Mesh_BankA', length_y=2.8, width_x=2.2, height=1.16, curve_x=0.28, seed=1, mat=mat_env)
    m_bank_b = build_terrace_bank_mesh('Meadow_Mesh_BankB', length_y=2.5, width_x=2.1, height=1.00, curve_x=-0.22, seed=2, mat=mat_env)
    m_wall_curve = build_curved_stone_wall_mesh('Meadow_Mesh_CurvedWall', length_y=3.45, curve_x=0.46, tiers=3, pillar_at=None, stepped_top=False, seed=1, mat=mat_stone)
    m_wall_right = build_curved_stone_wall_mesh('Meadow_Mesh_RightWall', length_y=2.45, curve_x=0.14, tiers=3, pillar_at='neg_y', stepped_top=True, seed=3, mat=mat_stone)
    m_tree_hero_l = build_hero_tree_mesh('Meadow_Mesh_HeroTreeL', height=3.95, canopy_scale=1.12, root_reach=0.82, canopy_offset=(-0.20, 0.72), seed=1, mat=mat_foliage)
    m_tree_hero_r = build_hero_tree_mesh('Meadow_Mesh_HeroTreeR', height=3.65, canopy_scale=0.98, root_reach=0.62, canopy_offset=(0.15, 0.62), seed=4, mat=mat_foliage)
    m_boulder_a = build_boulder_cluster_mesh('Meadow_Mesh_BoulderClusterA', mat_stone, variant='A')
    m_boulder_b = build_boulder_cluster_mesh('Meadow_Mesh_BoulderClusterB', mat_stone, variant='B')
    m_boulder_s = build_boulder_cluster_mesh('Meadow_Mesh_BoulderSingle', mat_stone, variant='S')
    m_bush_flw = build_flowering_bush_mesh('Meadow_Mesh_FlowerBush', mat_foliage, with_flowers=True)
    m_bush_grn = build_flowering_bush_mesh('Meadow_Mesh_GreenBush', mat_foliage, with_flowers=False)
    m_tuft = build_grass_tuft_mesh('Meadow_Mesh_GrassTuft', mat_foliage)

    root = bpy.data.objects.new('Root_meadow', None)
    scene.collection.objects.link(root)

    def spawn(name, mesh, loc, rot_deg=(0, 0, 0), scale=(1, 1, 1)):
        obj = bpy.data.objects.new(name, mesh)
        obj.parent = root
        obj.location = loc
        obj.rotation_euler = tuple(math.radians(a) for a in rot_deg)
        obj.scale = scale
        scene.collection.objects.link(obj)
        return obj

    spawn('meadow_Ground', m_ground, (0.0, 0.0, 0.0))

    # Left side (X < -4.2m)
    spawn('Meadow_Rock_TL1', m_boulder_a, (-3.65, 8.15, 0.0), (0, 0, -18), (0.94, 0.94, 0.94))
    spawn('Meadow_Bush_TL1', m_bush_grn, (-4.85, 8.35, 0.15), (0, 0, 15), (1.20, 1.20, 1.10))

    spawn('Meadow_Bank_L_Top', m_bank_a, (-6.25, 3.85, 0.0), (0, 0, -4), (1.10, 1.15, 1.02))
    spawn('Meadow_Wall_L1', m_wall_curve, (-4.95, 3.15, 0.0), (0, 0, -6), (1.0, 1.02, 1.06))
    spawn('Meadow_Tree_L1', m_tree_hero_l, (-5.28, 3.55, 1.05), (0, 0, 5), (1.08, 1.08, 1.08))
    spawn('Meadow_Tree_L2_Back', m_tree_hero_r, (-6.05, 6.45, 1.08), (0, 0, -15), (1.06, 1.06, 1.06))
    spawn('Meadow_Bush_L_Root1', m_bush_grn, (-5.18, 2.25, 0.94), (0, 0, 18), (1.02, 1.02, 0.92))

    spawn('Meadow_Bank_L_Mid', m_bank_b, (-6.78, -0.65, 0.0), (0, 0, 3), (1.05, 1.15, 0.88))
    spawn('Meadow_Wall_L2', m_wall_curve, (-5.05, -0.55, 0.0), (0, 0, 5), (1.0, 0.98, 1.02))
    spawn('Meadow_Bush_L_Mid1', m_bush_grn, (-5.35, 0.95, 0.88), (0, 0, -20), (1.15, 1.15, 1.05))
    spawn('Meadow_Bush_L_Mid2', m_bush_grn, (-5.45, -1.85, 0.85), (0, 0, 25), (1.18, 1.18, 1.05))
    spawn('Meadow_Tuft_L1', m_tuft, (-4.55, -0.35, 0.0), (0, 0, 35), (1.08, 1.08, 1.08))

    spawn('Meadow_Bank_L_Low', m_bank_a, (-6.85, -4.45, 0.0), (0, 0, -5), (1.05, 1.08, 0.85))
    spawn('Meadow_Wall_L3', m_wall_curve, (-5.12, -4.35, 0.0), (0, 0, -6), (1.0, 0.95, 0.96))
    spawn('Meadow_Tuft_L2', m_tuft, (-4.58, -2.55, 0.0), (0, 0, 22), (1.02, 1.02, 1.02))
    spawn('Meadow_Tuft_L3', m_tuft, (-4.60, -5.65, 0.0), (0, 0, 48), (1.12, 1.12, 1.12))

    spawn('Meadow_Rock_BL1', m_boulder_a, (-5.08, -7.55, 0.0), (0, 0, 22), (1.25, 1.25, 1.25))
    spawn('Meadow_Bank_L_Bot', m_bank_b, (-6.55, -9.80, 0.0), (0, 0, 8), (1.15, 1.35, 0.92))
    spawn('Meadow_Rock_BL2', m_boulder_s, (-5.35, -10.5, 0.0), (0, 0, -35), (1.15, 1.15, 1.10))

    # Right side (X > +4.2m)
    spawn('Meadow_Bank_R_Top1', m_bank_a, (5.80, 5.75, 0.0), (0, 0, 165), (1.18, 1.18, 1.05))
    spawn('Meadow_Bank_R_Top2', m_bank_b, (6.45, 4.35, 0.35), (0, 0, 172), (1.05, 1.05, 0.92))
    spawn('Meadow_Tree_R1', m_tree_hero_r, (5.05, 5.95, 1.10), (0, 0, -12), (0.94, 0.94, 0.94))
    spawn('Meadow_Tree_R2', m_tree_hero_r, (5.88, 4.65, 1.25), (0, 0, -25), (1.00, 1.00, 1.02))
    spawn('Meadow_Rock_TR1', m_boulder_s, (5.12, 5.10, 1.18), (0, 0, 30), (0.82, 0.82, 0.82))

    spawn('Meadow_Wall_R1', m_wall_right, (5.38, 2.80, 0.0), (0, 0, -148), (1.02, 1.02, 1.06))
    spawn('Meadow_Bush_R1', m_bush_flw, (4.72, 1.50, 0.0), (0, 0, -15), (1.12, 1.12, 1.10))
    spawn('Meadow_Bush_R1_Side', m_bush_grn, (6.15, 3.05, 0.75), (0, 0, 140), (1.05, 1.05, 1.00))

    spawn('Meadow_Bank_R_Mid', m_bank_a, (5.72, -0.18, 0.0), (0, 0, 182), (1.10, 0.82, 1.02))
    spawn('Meadow_Rock_R_Mid', m_boulder_s, (5.15, -0.05, 1.14), (0, 0, -40), (0.98, 0.98, 1.00))

    spawn('Meadow_Wall_R2', m_wall_right, (5.35, -2.72, 0.0), (0, 0, -150), (1.02, 1.02, 1.05))
    spawn('Meadow_Bush_R2', m_bush_flw, (4.72, -3.88, 0.0), (0, 0, -20), (1.14, 1.14, 1.12))
    spawn('Meadow_Bush_R2_Side', m_bush_grn, (6.12, -2.35, 0.75), (0, 0, 160), (1.02, 1.02, 0.96))

    spawn('Meadow_Bank_R_Low', m_bank_b, (5.72, -5.65, 0.0), (0, 0, 174), (1.10, 0.95, 0.92))
    spawn('Meadow_Rock_R_Low', m_boulder_s, (5.20, -5.45, 0.98), (0, 0, 25), (0.78, 0.78, 0.78))
    spawn('Meadow_Rock_BR1', m_boulder_b, (5.08, -7.65, 0.0), (0, 0, -18), (1.28, 1.28, 1.26))
    spawn('Meadow_Bank_R_Bot', m_bank_a, (6.40, -9.85, 0.0), (0, 0, 176), (1.18, 1.35, 0.92))
    spawn('Meadow_Tuft_R1', m_tuft, (4.62, -6.35, 0.0), (0, 0, -45), (1.14, 1.14, 1.14))

    if export_glb:
        bpy.ops.object.select_all(action='DESELECT')
        root.select_set(True)
        for child in root.children_recursive:
            child.select_set(True)
        out_glb = out_dir / 'field-meadow.glb'
        bpy.ops.export_scene.gltf(
            filepath=str(out_glb),
            export_format='GLB',
            use_active_scene=True,
            use_selection=True,
            export_yup=True,
            export_apply=True,
            export_materials='EXPORT',
            export_image_format='JPEG',
            export_jpeg_quality=92,
        )
        print(f"Exported {out_glb.name}: {out_glb.stat().st_size:,} bytes")
    if tex_path.exists():
        try:
            tex_path.unlink()
        except OSError:
            pass
    return root


def parse_target_stages():
    all_stages = {'meadow', 'lava', 'ice', 'ruins', 'dark-forest', 'desert'}
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if '--all' in argv:
        return all_stages
    selected = set()
    for i, arg in enumerate(argv):
        if arg == '--stage' and i + 1 < len(argv):
            selected.add(argv[i + 1])
    return selected if selected else {'meadow'}


def main():
    targets = parse_target_stages()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0

    if 'meadow' in targets:
        build_meadow_scene(scene, OUT_DIR, export_glb=True)

    other_targets = targets - {'meadow'}
    if not other_targets:
        return

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
        if slug not in other_targets:
            return
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
