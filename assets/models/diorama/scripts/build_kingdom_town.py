"""Master reproducible generator for the Classic Mode 'Kingdom + Castle Town' 3D Floating Island Diorama.

Usage (from repository root):
  "C:\\Program Files\\Blender Foundation\\Blender 5.3\\blender.exe" --background --python assets/models/diorama/scripts/build_kingdom_town.py

Outputs under assets/models/diorama/:
  - kingdom_town_diorama.blend
  - kingdom_town_diorama.glb (iPhone 14+ optimized, <= 6.5 MB, no embedded Cycles lights)
  - cosmic_home/{dawn,day,dusk,night}_kingdom_town.webp (when --render-cosmic is passed)
"""

import math
import random
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector, Matrix

SCRIPT_DIR = Path(__file__).resolve().parent
DIORAMA_DIR = SCRIPT_DIR.parent
TRIPO_CASTLE_KINGDOM = DIORAMA_DIR / 'tripo_castles' / 'tripo_castle_kingdom.glb'

if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from diorama_materials import (
    ensure_collection,
    hex_rgba,
    lerp_rgba,
    fbm_noise,
    paint_vertex_colors,
    mesh_from_bmesh,
    build_material_library,
)
from diorama_nature_props import add_broadleaf_tree, add_pine_tree, add_flowering_bush


def make_simple_mat(name, color_hex, roughness=0.68, metallic=0.04, emit_hex=None, emit_strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = hex_rgba(color_hex)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    if emit_hex and emit_strength > 0:
        bsdf.inputs['Emission Color'].default_value = hex_rgba(emit_hex)
        bsdf.inputs['Emission Strength'].default_value = emit_strength
    return mat


def add_streetlamp(bm_iron, bm_glow, pos, rot_z=0.0, height=2.05, scale=1.0):
    """Ornate tall fantasy wrought-iron curved streetlamp with warm glowing lantern."""
    x, y, z = pos
    h = height * scale
    xf = Matrix.Translation((x, y, z)) @ Matrix.Rotation(rot_z, 4, 'Z')

    # Stone/iron octagonal plinth + fluted lamp post
    bmesh.ops.create_cone(
        bm_iron, cap_ends=True, cap_tris=False, segments=8,
        radius1=0.22 * scale, radius2=0.14 * scale, depth=0.34 * scale,
        matrix=xf @ Matrix.Translation((0.0, 0.0, 0.17 * scale)),
    )
    bmesh.ops.create_cone(
        bm_iron, cap_ends=True, cap_tris=False, segments=8,
        radius1=0.09 * scale, radius2=0.055 * scale, depth=h,
        matrix=xf @ Matrix.Translation((0.0, 0.0, 0.28 * scale + h * 0.5)),
    )
    # Decorative curved swan-neck arm extending slightly toward the path (+X local)
    arm_z = 0.28 * scale + h
    bmesh.ops.create_cube(
        bm_iron, size=1.0,
        matrix=xf @ Matrix.Translation((0.18 * scale, 0.0, arm_z + 0.06 * scale))
        @ Matrix.Rotation(-0.22, 4, 'Y')
        @ Matrix.Diagonal((0.46 * scale, 0.07 * scale, 0.07 * scale, 1.0)),
    )
    # Finial spike on top of pole
    bmesh.ops.create_cone(
        bm_iron, cap_ends=True, cap_tris=False, segments=6,
        radius1=0.08 * scale, radius2=0.01 * scale, depth=0.22 * scale,
        matrix=xf @ Matrix.Translation((0.0, 0.0, arm_z + 0.14 * scale)),
    )

    # Hanging lantern housing + glowing warm crystal glass core
    lx = 0.36 * scale
    lz = arm_z - 0.14 * scale
    # Top cap
    bmesh.ops.create_cone(
        bm_iron, cap_ends=True, cap_tris=False, segments=6,
        radius1=0.22 * scale, radius2=0.03 * scale, depth=0.16 * scale,
        matrix=xf @ Matrix.Translation((lx, 0.0, lz + 0.22 * scale)),
    )
    # Bottom finial
    bmesh.ops.create_cone(
        bm_iron, cap_ends=True, cap_tris=False, segments=6,
        radius1=0.03 * scale, radius2=0.15 * scale, depth=0.10 * scale,
        matrix=xf @ Matrix.Translation((lx, 0.0, lz - 0.18 * scale)),
    )
    # Glowing lantern core
    bmesh.ops.create_cone(
        bm_glow, cap_ends=True, cap_tris=False, segments=6,
        radius1=0.12 * scale, radius2=0.16 * scale, depth=0.28 * scale,
        matrix=xf @ Matrix.Translation((lx, 0.0, lz)),
    )
    # Return world glow position for Three.js bloom aura matching
    glow_w = xf @ Vector((lx, 0.0, lz))
    return (round(glow_w.x, 2), round(glow_w.y, 2), round(glow_w.z, 2))


def island_radius(theta):
    """Organic scalloped floating island radius (~23.5)."""
    return (
        23.4
        + 1.35 * math.cos(2.0 * theta - 0.3)
        + 0.85 * math.sin(3.0 * theta + 0.7)
        + 0.55 * math.cos(5.0 * theta - 0.4)
    )


def build_floating_island(col, mats):
    """Sculpted lush meadow & limestone floating island with upper castle terrace and craggy cosmic underside."""
    bm = bmesh.new()
    n_ang = 72
    rings = [
        # (r_frac, z_base, rough_amp)
        (0.0, 0.02, 0.0),
        (0.22, 0.02, 0.02),
        (0.46, 0.02, 0.05),
        (0.70, 0.0, 0.12),
        (0.88, -0.05, 0.18),
        (1.00, -0.35, 0.35),
        (1.02, -1.65, 0.55),
        (0.92, -4.40, 1.05),
        (0.72, -8.50, 1.55),
        (0.46, -13.20, 1.40),
        (0.22, -17.60, 0.95),
        (0.05, -20.80, 0.40),
    ]

    center_top = bm.verts.new(Vector((0.0, 0.0, 0.02)))
    ring_verts = []

    for ri, (rf, zb, amp) in enumerate(rings[1:], start=1):
        rv = []
        for ai in range(n_ang):
            th = 2.0 * math.pi * ai / n_ang
            R = island_radius(th)
            r = R * rf
            x = r * math.cos(th)
            y = r * math.sin(th)
            n1 = fbm_noise(x * 0.11 + 3.1, y * 0.11 - 1.7, zb * 0.12) - 0.5
            n2 = fbm_noise(x * 0.24 - 5.2, y * 0.24 + 4.3, zb * 0.18) - 0.5
            if ri <= 4:
                # Gently undulating town ground; keep plaza & terrace flat
                z = zb + n1 * amp
                # Raise gentle hill on western windmill side (-X, +Y)
                d_mill = math.hypot(x + 14.5, y - 3.2)
                if d_mill < 7.0:
                    z += 1.55 * (0.5 + 0.5 * math.cos(math.pi * d_mill / 7.0))
                # Carve clear deep canal trough around south-west & south-east town rims + radial outlets to waterfall lips!
                ang_deg = math.degrees(th)
                in_outlet = (abs(ang_deg + 124.0) < 6.5 or abs(ang_deg + 56.0) < 6.5) and r > 13.5
                if in_outlet:
                    z -= 0.78
                elif 13.6 < r < 18.8 and y < 2.2 and abs(x) > 4.2:
                    canal_f = math.sin(math.pi * (r - 13.6) / 5.2)
                    z -= 0.85 * canal_f
            else:
                # Craggy sculpted floating-cliff underside
                rad_jitter = (n1 * 2.1 + n2 * 1.1) * amp
                x = max(0.2, r + rad_jitter) * math.cos(th)
                y = max(0.2, r + rad_jitter) * math.sin(th)
                z = zb + (n1 * 1.8 + n2 * 0.9) * amp
            rv.append(bm.verts.new(Vector((x, y, z))))
        ring_verts.append(rv)

    # Top fan
    for ai in range(n_ang):
        an = (ai + 1) % n_ang
        bm.faces.new((center_top, ring_verts[0][ai], ring_verts[0][an]))

    # Quad strips
    for ri in range(len(ring_verts) - 1):
        r0 = ring_verts[ri]
        r1 = ring_verts[ri + 1]
        for ai in range(n_ang):
            an = (ai + 1) % n_ang
            bm.faces.new((r0[ai], r1[ai], r1[an], r0[an]))

    # Bottom apex cap
    bot_tip = bm.verts.new(Vector((0.0, 0.0, -21.8)))
    last_r = ring_verts[-1]
    for ai in range(n_ang):
        an = (ai + 1) % n_ang
        bm.faces.new((last_r[an], last_r[ai], bot_tip))

    # Direct glTF-safe multi-material assignment (lush emerald meadow, sunlit cobblestone, sculpted cosmic slate cliff!)
    mat_grass = make_simple_mat('Mat_KT_MeadowGrass', '#438F46', roughness=0.84, metallic=0.02)
    mat_cliff = make_simple_mat('Mat_KT_CliffRock', '#555A70', roughness=0.88, metallic=0.06)
    mat_cobble = make_simple_mat('Mat_KT_TownCobble', '#C9BDA5', roughness=0.76, metallic=0.03)
    mat_canal_bed = make_simple_mat('Mat_KT_CanalBed', '#234F66', roughness=0.82, metallic=0.04)

    bm.normal_update()
    for f in bm.faces:
        c = f.calc_center_median()
        n = f.normal
        if c.z < -0.58 or n.z < 0.45:
            f.material_index = 1  # cliff rock
        elif c.z < -0.22:
            f.material_index = 3  # deep canal bed under water
        else:
            d_plaza = math.hypot(c.x, c.y + 5.2)
            if d_plaza < 6.8 or (abs(c.x) < 2.8 and -17.0 < c.y < 3.5):
                f.material_index = 2  # cobblestone
            else:
                f.material_index = 0  # lush emerald meadow

    mesh = bpy.data.meshes.new('Island_Kingdom_Town_Base')
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = True
    island = bpy.data.objects.new('Island_Kingdom_Town_Base', mesh)
    for m in (mat_grass, mat_cliff, mat_cobble, mat_canal_bed):
        island.data.materials.append(m)
    col.objects.link(island)

    # Upper Citadel Stone Terrace (elevated limestone bastion at Y = +8.6, Z = 0..+3.55)
    bm_ter = bmesh.new()
    ter_cx, ter_cy, ter_rx, ter_ry, ter_h = 0.0, 8.6, 10.6, 8.6, 3.55
    # Tapered stone bastion drum
    m_ter = Matrix.Translation((ter_cx, ter_cy, ter_h * 0.5 - 0.25)) @ Matrix.Diagonal((ter_rx, ter_ry, ter_h + 0.5, 1.0))
    bmesh.ops.create_cone(
        bm_ter, cap_ends=True, cap_tris=False, segments=32,
        radius1=1.06, radius2=0.98, depth=1.0, matrix=m_ter,
    )
    # Stone parapet coping rim + merlons around upper terrace (leaving wide front stairway opening!)
    n_par = 36
    for i in range(n_par):
        ang = 2.0 * math.pi * i / n_par
        # Skip front staircase opening around -Y (ang ~ 4.71 rad = 270 deg)
        if 4.18 < ang < 5.24:
            continue
        px = ter_cx + (ter_rx * 0.94) * math.cos(ang)
        py = ter_cy + (ter_ry * 0.94) * math.sin(ang)
        rot_z = ang + math.pi * 0.5
        bmesh.ops.create_cube(
            bm_ter, size=1.0,
            matrix=Matrix.Translation((px, py, ter_h + 0.34))
            @ Matrix.Rotation(rot_z, 4, 'Z')
            @ Matrix.Diagonal((1.45, 0.48, 0.72, 1.0)),
        )
        if i % 2 == 0:
            bmesh.ops.create_cube(
                bm_ter, size=1.0,
                matrix=Matrix.Translation((px, py, ter_h + 0.84))
                @ Matrix.Rotation(rot_z, 4, 'Z')
                @ Matrix.Diagonal((0.72, 0.50, 0.34, 1.0)),
            )

    mesh_from_bmesh(bm_ter, 'Kingdom_Citadel_Terrace', col, mats['plaza_trim'], smooth=False)
    return island


def import_kingdom_castle(col):
    """Import our high-detail Tripo Kingdom Castle perched on the upper citadel terrace."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(TRIPO_CASTLE_KINGDOM))
    after = [o for o in bpy.data.objects if o not in before]
    hero = None
    for o in after:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        if o.type == 'MESH':
            wm = o.matrix_world.copy()
            o.parent = None
            o.matrix_world = wm
            o.name = 'Castle_Kingdom_Town_Hero'
            col.objects.link(o)
            hero = o
        else:
            bpy.data.objects.remove(o, do_unlink=True)

    if hero is None:
        return None

    bpy.context.view_layer.update()
    # Normalize & place majestically on top of the upper citadel terrace (0, 8.8, 3.55), facing -Y (toward town!)
    bbox = [hero.matrix_world @ Vector(c) for c in hero.bound_box]
    min_x = min(v.x for v in bbox)
    max_x = max(v.x for v in bbox)
    min_y = min(v.y for v in bbox)
    max_y = max(v.y for v in bbox)
    min_z = min(v.z for v in bbox)
    cx = 0.5 * (min_x + max_x)
    cy = 0.5 * (min_y + max_y)
    span = max(max_x - min_x, max_y - min_y)
    target_span = 14.8
    sc = target_span / max(1e-4, span)

    # Rotate so castle's iconic arched main gate faces -Y (down the grand stairs toward the Town Square!)
    m_center = Matrix.Translation((-cx, -cy, -min_z))
    m_scale = Matrix.Diagonal((sc, sc, sc, 1.0))
    m_place = Matrix.Translation((0.0, 9.2, 3.45))
    hero.matrix_world = m_place @ m_scale @ m_center @ hero.matrix_world
    bpy.context.view_layer.update()
    return hero


def build_stairs_and_plaza(col, mats):
    """Grand carved stone staircase from castle terrace to cobblestone Town Fountain Square + south avenue."""
    bm_stone = bmesh.new()
    bm_trim = bmesh.new()

    # 1. Grand Staircase descending from Y=+1.6 (Z=3.55) to Y=-1.8 (Z=0.05)
    n_steps = 12
    y_top, y_bot = 1.6, -1.6
    z_top, z_bot = 3.55, 0.05
    width = 4.2
    for i in range(n_steps):
        t0 = i / n_steps
        t1 = (i + 1) / n_steps
        yc = y_bot + (y_top - y_bot) * (0.5 * (t0 + t1))
        step_d = (y_top - y_bot) / n_steps + 0.06
        step_z = z_bot + (z_top - z_bot) * t1
        bmesh.ops.create_cube(
            bm_stone, size=1.0,
            matrix=Matrix.Translation((0.0, yc, step_z * 0.5))
            @ Matrix.Diagonal((width, step_d, step_z, 1.0)),
        )
    # Sloped stone stair balustrades + newel pillars
    for sx in (-2.32, 2.32):
        # Top & bottom pillars
        bmesh.ops.create_cube(bm_trim, size=1.0, matrix=Matrix.Translation((sx, y_top + 0.1, z_top * 0.5 + 0.45)) @ Matrix.Diagonal((0.58, 0.58, z_top + 0.9, 1.0)))
        bmesh.ops.create_cube(bm_trim, size=1.0, matrix=Matrix.Translation((sx, y_bot - 0.1, 0.55)) @ Matrix.Diagonal((0.58, 0.58, 1.1, 1.0)))
        # Stepped ramp wall
        for i in range(n_steps):
            t = (i + 0.5) / n_steps
            yc = y_bot + (y_top - y_bot) * t
            zh = z_bot + (z_top - z_bot) * t + 0.85
            bmesh.ops.create_cube(bm_trim, size=1.0, matrix=Matrix.Translation((sx, yc, zh * 0.5)) @ Matrix.Diagonal((0.44, 0.34, zh, 1.0)))

    # 2. Circular Cobblestone Town Fountain Square at (0, -5.8)
    px, py = 0.0, -5.8
    bmesh.ops.create_cone(
        bm_stone, cap_ends=True, cap_tris=False, segments=36,
        radius1=5.65, radius2=5.55, depth=0.22,
        matrix=Matrix.Translation((px, py, 0.08)),
    )
    # Decorative raised curb ring
    bmesh.ops.create_cone(
        bm_trim, cap_ends=True, cap_tris=False, segments=36,
        radius1=5.85, radius2=5.80, depth=0.14,
        matrix=Matrix.Translation((px, py, 0.04)),
    )
    # Carved 3-Tier Marble Fountain in plaza center
    # Outer basin rim
    bmesh.ops.create_cone(bm_trim, cap_ends=True, cap_tris=False, segments=20, radius1=1.92, radius2=2.04, depth=0.58, matrix=Matrix.Translation((px, py, 0.42)))
    # Central pedestal + mid bowl + upper finial
    bmesh.ops.create_cone(bm_trim, cap_ends=True, cap_tris=False, segments=14, radius1=0.55, radius2=0.38, depth=1.35, matrix=Matrix.Translation((px, py, 1.05)))
    bmesh.ops.create_cone(bm_trim, cap_ends=True, cap_tris=False, segments=16, radius1=0.45, radius2=1.02, depth=0.32, matrix=Matrix.Translation((px, py, 1.62)))
    bmesh.ops.create_cone(bm_trim, cap_ends=True, cap_tris=False, segments=12, radius1=0.26, radius2=0.16, depth=0.82, matrix=Matrix.Translation((px, py, 2.10)))
    bmesh.ops.create_icosphere(bm_trim, subdivisions=2, radius=0.24, matrix=Matrix.Translation((px, py, 2.58)))

    # 3. Southern Cobblestone Avenue & Twin-Turret Town Gatehouse
    bmesh.ops.create_cube(bm_stone, size=1.0, matrix=Matrix.Translation((0.0, -14.2, 0.06)) @ Matrix.Diagonal((3.6, 8.6, 0.18, 1.0)))
    # Twin stone gate towers flanking the southern entry at Y = -16.8
    for sx in (-2.55, 2.55):
        bmesh.ops.create_cone(bm_trim, cap_ends=True, cap_tris=False, segments=12, radius1=1.05, radius2=0.92, depth=3.6, matrix=Matrix.Translation((sx, -16.8, 1.75)))
        bmesh.ops.create_cone(bm_trim, cap_ends=True, cap_tris=False, segments=12, radius1=1.18, radius2=1.12, depth=0.35, matrix=Matrix.Translation((sx, -16.8, 3.65)))
    # Arch lintel spanning between gate towers
    bmesh.ops.create_cube(bm_trim, size=1.0, matrix=Matrix.Translation((0.0, -16.8, 3.15)) @ Matrix.Diagonal((4.8, 1.15, 0.95, 1.0)))

    # 4. East & West Arched Canal Footbridges
    for bx, by, rz in [(-11.8, -9.8, 0.58), (11.8, -9.8, -0.58)]:
        xf = Matrix.Translation((bx, by, 0.0)) @ Matrix.Rotation(rz, 4, 'Z')
        for k in range(7):
            u = (k - 3) / 3.0
            arch_z = 0.58 * (1.0 - u * u)
            bmesh.ops.create_cube(bm_stone, size=1.0, matrix=xf @ Matrix.Translation((u * 2.1, 0.0, arch_z)) @ Matrix.Diagonal((0.82, 2.2, 0.34, 1.0)))
            for sy in (-1.02, 1.02):
                bmesh.ops.create_cube(bm_trim, size=1.0, matrix=xf @ Matrix.Translation((u * 2.1, sy, arch_z + 0.42)) @ Matrix.Diagonal((0.76, 0.22, 0.55, 1.0)))

    # Direct glTF-safe warm sandstone material for stairs, plaza & bridges!
    mat_kt_cobble = make_simple_mat('Mat_KT_PlazaSandstone', '#D6C9B2', roughness=0.70, metallic=0.03)
    mesh_from_bmesh(bm_stone, 'Town_Cobblestone_Stairs_Plaza', col, mat_kt_cobble, smooth=False)
    mesh_from_bmesh(bm_trim, 'Town_Marble_Fountain_Gate', col, mats['plaza_trim'], smooth=False)


def add_cottage(bm_wall, bm_timber, bm_roof, bm_win, pos, rot_z, w, d, h, roof_h, has_chimney=True):
    """Sculpted medieval-fantasy half-timbered cottage with steep gabled roof, timber beams & glowing warm windows."""
    x, y, z = pos
    xf = Matrix.Translation((x, y, z)) @ Matrix.Rotation(rot_z, 4, 'Z')

    # Stone base plinth + upper cream plaster body (slightly overhanging jetty!)
    bmesh.ops.create_cube(bm_timber, size=1.0, matrix=xf @ Matrix.Translation((0.0, 0.0, 0.22)) @ Matrix.Diagonal((w * 1.03, d * 1.03, 0.46, 1.0)))
    bmesh.ops.create_cube(bm_wall, size=1.0, matrix=xf @ Matrix.Translation((0.0, 0.0, 0.42 + h * 0.5)) @ Matrix.Diagonal((w, d, h, 1.0)))

    # Corner & mid half-timber wooden posts + horizontal timber belt
    for sx in (-w * 0.5, 0.0, w * 0.5):
        for sy in (-d * 0.5, d * 0.5):
            bmesh.ops.create_cube(bm_timber, size=1.0, matrix=xf @ Matrix.Translation((sx, sy, 0.42 + h * 0.5)) @ Matrix.Diagonal((0.14, 0.14, h + 0.05, 1.0)))
    bmesh.ops.create_cube(bm_timber, size=1.0, matrix=xf @ Matrix.Translation((0.0, 0.0, 0.42 + h * 0.55)) @ Matrix.Diagonal((w + 0.08, d + 0.08, 0.13, 1.0)))
    bmesh.ops.create_cube(bm_timber, size=1.0, matrix=xf @ Matrix.Translation((0.0, 0.0, 0.42 + h)) @ Matrix.Diagonal((w + 0.12, d + 0.12, 0.14, 1.0)))

    # Steep Gabled Roof (triangular prism with overhanging eaves!)
    rw = w * 0.62
    rd = d * 0.60
    ez = 0.42 + h
    v_fl = bm_roof.verts.new(xf @ Vector((-rw, -rd, ez - 0.12)))
    v_fr = bm_roof.verts.new(xf @ Vector((rw, -rd, ez - 0.12)))
    v_ft = bm_roof.verts.new(xf @ Vector((0.0, -rd, ez + roof_h)))
    v_bl = bm_roof.verts.new(xf @ Vector((-rw, rd, ez - 0.12)))
    v_br = bm_roof.verts.new(xf @ Vector((rw, rd, ez - 0.12)))
    v_bt = bm_roof.verts.new(xf @ Vector((0.0, rd, ez + roof_h)))
    bm_roof.faces.new((v_fl, v_fr, v_ft))
    bm_roof.faces.new((v_br, v_bl, v_bt))
    bm_roof.faces.new((v_fl, v_ft, v_bt, v_bl))
    bm_roof.faces.new((v_fr, v_br, v_bt, v_ft))
    bm_roof.faces.new((v_fl, v_bl, v_br, v_fr))

    # Gable triangle plaster infill on front & back
    for sy_sign in (-1.0, 1.0):
        gy = sy_sign * (d * 0.502)
        g1 = bm_wall.verts.new(xf @ Vector((-w * 0.49, gy, ez)))
        g2 = bm_wall.verts.new(xf @ Vector((w * 0.49, gy, ez)))
        g3 = bm_wall.verts.new(xf @ Vector((0.0, gy, ez + roof_h * 0.86)))
        if sy_sign < 0:
            bm_wall.faces.new((g1, g2, g3))
        else:
            bm_wall.faces.new((g2, g1, g3))

    # Chimney
    if has_chimney:
        bmesh.ops.create_cube(
            bm_timber, size=1.0,
            matrix=xf @ Matrix.Translation((w * 0.28, d * 0.16, ez + roof_h * 0.72))
            @ Matrix.Diagonal((0.42, 0.42, roof_h * 0.85, 1.0)),
        )

    # Cozy warm glowing amber windows on front & sides + arched timber door on front (-Y)
    bmesh.ops.create_cube(
        bm_timber, size=1.0,
        matrix=xf @ Matrix.Translation((0.0, -d * 0.51, 0.78))
        @ Matrix.Diagonal((0.52, 0.10, 0.86, 1.0)),
    )
    win_h = 0.42 + h * 0.74
    for wx in (-w * 0.25, w * 0.25):
        bmesh.ops.create_cube(bm_win, size=1.0, matrix=xf @ Matrix.Translation((wx, -d * 0.515, win_h)) @ Matrix.Diagonal((0.36, 0.08, 0.44, 1.0)))
        bmesh.ops.create_cube(bm_win, size=1.0, matrix=xf @ Matrix.Translation((wx, d * 0.515, win_h)) @ Matrix.Diagonal((0.36, 0.08, 0.44, 1.0)))
    for sy_w in (-d * 0.18, d * 0.18):
        bmesh.ops.create_cube(bm_win, size=1.0, matrix=xf @ Matrix.Translation((-w * 0.515, sy_w, win_h)) @ Matrix.Diagonal((0.08, 0.36, 0.44, 1.0)))
        bmesh.ops.create_cube(bm_win, size=1.0, matrix=xf @ Matrix.Translation((w * 0.515, sy_w, win_h)) @ Matrix.Diagonal((0.08, 0.36, 0.44, 1.0)))


def build_castle_town(col, mats):
    """Build 16 cozy half-timbered cottages, Clocktower, Windmill (with animated blades!), Market Stalls & 22 Streetlamps."""
    mat_plaster = make_simple_mat('Mat_Town_Plaster', '#EFE5D1', roughness=0.76, metallic=0.02)
    mat_timber = make_simple_mat('Mat_Town_Timber', '#5B3D28', roughness=0.72, metallic=0.05)
    mat_roof_blue = make_simple_mat('Mat_Town_Roof_Blue', '#2E569E', roughness=0.52, metallic=0.10)
    mat_roof_red = make_simple_mat('Mat_Town_Roof_Red', '#A84236', roughness=0.58, metallic=0.06)
    mat_roof_ochre = make_simple_mat('Mat_Town_Roof_Ochre', '#BD8638', roughness=0.58, metallic=0.08)
    mat_roof_teal = make_simple_mat('Mat_Town_Roof_Teal', '#2E7678', roughness=0.54, metallic=0.08)
    mat_win_glow = make_simple_mat('Mat_Town_WindowGlow', '#FFD980', roughness=0.22, metallic=0.0, emit_hex='#FFBE4D', emit_strength=3.6)
    mat_sail = make_simple_mat('Mat_Town_Sail', '#F6EBD4', roughness=0.72, metallic=0.02)
    mat_canopy_blue = make_simple_mat('Mat_Town_Canopy_Blue', '#3266C4', roughness=0.65, metallic=0.04)
    mat_canopy_red = make_simple_mat('Mat_Town_Canopy_Red', '#C8423E', roughness=0.65, metallic=0.04)

    bm_wall = bmesh.new()
    bm_timber = bmesh.new()
    bm_win = bmesh.new()
    bm_roofs = {
        'blue': bmesh.new(),
        'red': bmesh.new(),
        'ochre': bmesh.new(),
        'teal': bmesh.new(),
    }

    # 16 hand-curated medieval cottages curving organically around the Town Square & castle foothills
    cottages = [
        # West Town Quarter (facing plaza)
        ((-8.2, -3.2, 0.0), -1.35, 2.7, 2.3, 2.0, 1.75, 'blue'),
        ((-8.6, -7.2, 0.0), -1.85, 2.5, 2.2, 1.85, 1.65, 'red'),
        ((-6.4, -11.4, 0.0), -2.35, 2.6, 2.1, 1.95, 1.60, 'ochre'),
        ((-11.6, -4.8, 0.0), -1.15, 2.4, 2.2, 1.75, 1.55, 'teal'),
        ((-10.8, 0.4, 0.0), -0.92, 2.8, 2.3, 2.1, 1.85, 'red'),
        ((-7.4, 1.2, 0.0), -0.78, 2.3, 2.0, 1.8, 1.50, 'blue'),
        ((-5.2, -15.0, 0.0), -2.70, 2.2, 1.9, 1.65, 1.45, 'red'),
        # East Town Quarter (facing plaza)
        ((8.2, -3.2, 0.0), 1.35, 2.8, 2.3, 2.1, 1.80, 'red'),
        ((8.8, -7.2, 0.0), 1.82, 2.5, 2.2, 1.9, 1.65, 'blue'),
        ((6.4, -11.6, 0.0), 2.35, 2.7, 2.2, 2.0, 1.70, 'teal'),
        ((11.8, -4.6, 0.0), 1.18, 2.4, 2.1, 1.8, 1.60, 'ochre'),
        ((11.2, 0.6, 0.0), 0.90, 2.7, 2.3, 2.05, 1.80, 'blue'),
        ((7.6, 1.4, 0.0), 0.75, 2.3, 2.0, 1.85, 1.55, 'ochre'),
        ((5.2, -15.0, 0.0), 2.70, 2.2, 1.9, 1.65, 1.45, 'blue'),
        # Outer Cozy Hillside Cottages
        ((-15.4, -1.6, 0.35), -0.65, 2.2, 1.9, 1.65, 1.45, 'ochre'),
        ((15.4, -1.4, 0.15), 0.65, 2.3, 2.0, 1.75, 1.55, 'red'),
    ]
    for pos, rz, w, d, h, rh, rcol in cottages:
        add_cottage(bm_wall, bm_timber, bm_roofs[rcol], bm_win, pos, rz, w, d, h, rh, has_chimney=True)

    # Gatehouse conical blue roofs at Y = -16.8
    for sx in (-2.55, 2.55):
        bmesh.ops.create_cone(
            bm_roofs['blue'], cap_ends=True, cap_tris=False, segments=12,
            radius1=1.28, radius2=0.05, depth=2.15,
            matrix=Matrix.Translation((sx, -16.8, 4.88)),
        )

    # Landmark 1: East Market Clocktower at (13.4, 4.6, 0.0)
    cx, cy = 13.4, 4.6
    bmesh.ops.create_cube(bm_wall, size=1.0, matrix=Matrix.Translation((cx, cy, 2.8)) @ Matrix.Diagonal((2.5, 2.5, 5.6, 1.0)))
    bmesh.ops.create_cube(bm_timber, size=1.0, matrix=Matrix.Translation((cx, cy, 5.65)) @ Matrix.Diagonal((2.85, 2.85, 0.32, 1.0)))
    bmesh.ops.create_cone(bm_roofs['blue'], cap_ends=True, cap_tris=False, segments=4, radius1=2.15, radius2=0.06, depth=3.4, matrix=Matrix.Translation((cx, cy, 7.5)) @ Matrix.Rotation(math.radians(45), 4, 'Z'))
    # Glowing golden astral clock faces on all 4 sides!
    for rot_c in (0, 90, 180, 270):
        xf_c = Matrix.Translation((cx, cy, 4.55)) @ Matrix.Rotation(math.radians(rot_c), 4, 'Z')
        bmesh.ops.create_cone(bm_win, cap_ends=True, cap_tris=False, segments=16, radius1=0.62, radius2=0.62, depth=0.14, matrix=xf_c @ Matrix.Translation((0.0, -1.26, 0.0)) @ Matrix.Rotation(math.radians(90), 4, 'X'))

    # Landmark 2: West Hilltop Windmill at (-14.5, 3.2, 1.35) with SEPARATELY NAMED rotating blades!
    wx, wy, wz = -14.5, 3.2, 1.35
    bmesh.ops.create_cone(bm_wall, cap_ends=True, cap_tris=False, segments=14, radius1=1.75, radius2=1.22, depth=4.6, matrix=Matrix.Translation((wx, wy, wz + 2.3)))
    bmesh.ops.create_cone(bm_roofs['red'], cap_ends=True, cap_tris=False, segments=14, radius1=1.48, radius2=0.06, depth=1.95, matrix=Matrix.Translation((wx, wy, wz + 5.52)))
    bmesh.ops.create_cube(bm_win, size=1.0, matrix=Matrix.Translation((wx, wy - 1.48, wz + 2.4)) @ Matrix.Diagonal((0.46, 0.14, 0.56, 1.0)))

    # Windmill rotating blades object (pivoted at exact hub facing front-south-east!)
    hub_pos = Vector((wx + 0.52, wy - 1.25, wz + 4.05))
    mill_yaw = math.radians(22.0)
    bm_blades_wood = bmesh.new()
    bm_blades_sail = bmesh.new()
    bmesh.ops.create_cone(bm_blades_wood, cap_ends=True, cap_tris=False, segments=10, radius1=0.22, radius2=0.16, depth=0.55, matrix=Matrix.Rotation(math.radians(90), 4, 'X'))
    for bi in range(4):
        rot_b = Matrix.Rotation(bi * math.pi * 0.5 + 0.35, 4, 'Y')
        # Main spar extending along +Z in hub local plane (X-Z plane, axle along -Y)
        bmesh.ops.create_cube(bm_blades_wood, size=1.0, matrix=rot_b @ Matrix.Translation((0.0, -0.22, 1.55)) @ Matrix.Diagonal((0.12, 0.10, 3.1, 1.0)))
        # Canvas lattice sail panel offset to one side of spar
        bmesh.ops.create_cube(bm_blades_sail, size=1.0, matrix=rot_b @ Matrix.Translation((0.38, -0.24, 1.85)) @ Matrix.Diagonal((0.68, 0.04, 2.25, 1.0)))

    blades_mesh = bpy.data.meshes.new('Town_Windmill_Blades')
    blades_obj = bpy.data.objects.new('Town_Windmill_Blades', blades_mesh)
    blades_obj.location = hub_pos
    blades_obj.rotation_euler = (0.0, 0.0, mill_yaw)
    col.objects.link(blades_obj)
    blades_obj.data.materials.append(mat_timber)
    blades_obj.data.materials.append(mat_sail)

    bm_b_all = bmesh.new()
    for midx, sbm in ((0, bm_blades_wood), (1, bm_blades_sail)):
        sbm.verts.ensure_lookup_table()
        sbm.verts.index_update()
        vmap = {v.index: bm_b_all.verts.new(v.co) for v in sbm.verts}
        for f in sbm.faces:
            nf = bm_b_all.faces.new([vmap[v.index] for v in f.verts])
            nf.material_index = midx
        sbm.free()
    bm_b_all.normal_update()
    bm_b_all.to_mesh(blades_mesh)
    bm_b_all.free()

    # Landmark 3: 4 Cozy Striped Market Stalls around Town Square
    bm_can_b = bmesh.new()
    bm_can_r = bmesh.new()
    stalls = [
        ((-4.2, -3.4, 0.14), -0.65, bm_can_b),
        ((4.2, -3.4, 0.14), 0.65, bm_can_r),
        ((-4.4, -8.4, 0.14), -2.35, bm_can_r),
        ((4.4, -8.4, 0.14), 2.35, bm_can_b),
    ]
    for spos, srz, cbm in stalls:
        xf = Matrix.Translation(spos) @ Matrix.Rotation(srz, 4, 'Z')
        # Wooden counter + 4 corner posts
        bmesh.ops.create_cube(bm_timber, size=1.0, matrix=xf @ Matrix.Translation((0.0, 0.0, 0.36)) @ Matrix.Diagonal((1.65, 0.85, 0.72, 1.0)))
        for px_s in (-0.75, 0.75):
            for py_s in (-0.36, 0.36):
                bmesh.ops.create_cube(bm_timber, size=1.0, matrix=xf @ Matrix.Translation((px_s, py_s, 0.78)) @ Matrix.Diagonal((0.10, 0.10, 1.56, 1.0)))
        # Slanted cloth awning
        bmesh.ops.create_cube(cbm, size=1.0, matrix=xf @ Matrix.Translation((0.0, 0.0, 1.56)) @ Matrix.Rotation(0.18, 4, 'X') @ Matrix.Diagonal((1.88, 1.18, 0.14, 1.0)))

    mesh_from_bmesh(bm_wall, 'Town_Buildings_Plaster', col, mat_plaster, smooth=False)
    mesh_from_bmesh(bm_timber, 'Town_Buildings_Timber', col, mat_timber, smooth=False)
    mesh_from_bmesh(bm_win, 'Town_Windows_Glow', col, mat_win_glow, smooth=False)
    mesh_from_bmesh(bm_roofs['blue'], 'Town_Roofs_Blue', col, mat_roof_blue, smooth=False)
    mesh_from_bmesh(bm_roofs['red'], 'Town_Roofs_Red', col, mat_roof_red, smooth=False)
    mesh_from_bmesh(bm_roofs['ochre'], 'Town_Roofs_Ochre', col, mat_roof_ochre, smooth=False)
    mesh_from_bmesh(bm_roofs['teal'], 'Town_Roofs_Teal', col, mat_roof_teal, smooth=False)
    mesh_from_bmesh(bm_can_b, 'Town_Market_Canopy_Blue', col, mat_canopy_blue, smooth=False)
    mesh_from_bmesh(bm_can_r, 'Town_Market_Canopy_Red', col, mat_canopy_red, smooth=False)

    # 22 Ornate Glowing Streetlamps lining stairs, plaza, avenue, bridges & cottages!
    bm_lamp_iron = bmesh.new()
    bm_lamp_glow = bmesh.new()
    lamp_specs = [
        # Flanking Grand Castle Staircase (top & bottom)
        ((-2.45, 1.9, 3.55), 0.0, 1.95),
        ((2.45, 1.9, 3.55), math.pi, 1.95),
        ((-2.55, -1.9, 0.12), 0.0, 2.05),
        ((2.55, -1.9, 0.12), math.pi, 2.05),
        # Town Fountain Square ring (6 lamps)
        ((-5.4, -4.4, 0.14), 0.0, 1.95),
        ((5.4, -4.4, 0.14), math.pi, 1.95),
        ((-5.5, -7.2, 0.14), 0.15, 1.95),
        ((5.5, -7.2, 0.14), math.pi - 0.15, 1.95),
        ((-2.6, -10.9, 0.12), 0.4, 1.95),
        ((2.6, -10.9, 0.12), math.pi - 0.4, 1.95),
        # Southern Avenue & Gatehouse
        ((-2.2, -14.2, 0.12), 0.0, 1.95),
        ((2.2, -14.2, 0.12), math.pi, 1.95),
        ((-3.6, -17.6, 0.05), 0.3, 2.15),
        ((3.6, -17.6, 0.05), math.pi - 0.3, 2.15),
        # Town Lanes, Clocktower, Windmill & Bridges
        ((-10.2, -1.8, 0.08), -0.4, 1.85),
        ((10.2, -1.8, 0.08), math.pi + 0.4, 1.85),
        ((-12.4, -7.8, 0.08), -0.6, 1.85),
        ((12.4, -7.8, 0.08), math.pi + 0.6, 1.85),
        ((11.6, 3.2, 0.08), 2.4, 1.95),
        ((-12.2, 2.4, 0.95), -0.5, 1.95),
        # Upper Citadel Terrace flanking castle
        ((-6.8, 6.2, 3.55), -0.4, 2.05),
        ((6.8, 6.2, 3.55), math.pi + 0.4, 2.05),
    ]
    lamp_positions = []
    for pos, rz, lh in lamp_specs:
        gp = add_streetlamp(bm_lamp_iron, bm_lamp_glow, pos, rot_z=rz, height=lh, scale=0.88)
        lamp_positions.append(gp)

    mesh_from_bmesh(bm_lamp_iron, 'Town_Streetlamps_Iron', col, mats['iron_dark'], smooth=False)
    mesh_from_bmesh(bm_lamp_glow, 'Town_Streetlamps_Glow', col, mats['glow_warm'], smooth=True)
    return lamp_positions


def build_animated_water_and_waterfalls(col, mats):
    """Build UV-mapped animated fountain water, outer canal moat, and 2 cascading cosmic waterfalls!"""
    # 1. Animated Canal + Fountain Basin ('Water_Moat_Animated' -> auto-bound to GLSL flowing water in HomeDioramaGL!)
    bm_w = bmesh.new()
    uv_w = bm_w.loops.layers.uv.new('UVMap')

    # Fountain basin disk at (0, -5.8, 0.56)
    f_segs = 20
    fc = bm_w.verts.new(Vector((0.0, -5.8, 0.56)))
    f_ring = [bm_w.verts.new(Vector((1.72 * math.cos(2 * math.pi * i / f_segs), -5.8 + 1.72 * math.sin(2 * math.pi * i / f_segs), 0.56))) for i in range(f_segs)]
    for i in range(f_segs):
        face = bm_w.faces.new((fc, f_ring[i], f_ring[(i + 1) % f_segs]))
        face.loops[0][uv_w].uv = (0.5, 0.0)
        face.loops[1][uv_w].uv = (i / f_segs, 1.0)
        face.loops[2][uv_w].uv = ((i + 1) / f_segs, 1.0)

    # Curved West & East Canal Arcs flowing visibly toward the southern cliff edges
    for side in (-1.0, 1.0):
        n_arc = 22
        r_in, r_out = 14.2, 18.2
        a_start = math.radians(-168 if side < 0 else -12)
        a_end = math.radians(-118 if side < 0 else -62)
        prev_in = prev_out = None
        for i in range(n_arc + 1):
            u = i / n_arc
            ang = a_start + (a_end - a_start) * u
            vi = bm_w.verts.new(Vector((r_in * math.cos(ang), r_in * math.sin(ang), -0.14)))
            vo = bm_w.verts.new(Vector((r_out * math.cos(ang), r_out * math.sin(ang), -0.14)))
            if prev_in is not None:
                f = bm_w.faces.new((prev_in, prev_out, vo, vi)) if side > 0 else bm_w.faces.new((prev_in, vi, vo, prev_out))
                u0 = (i - 1) / n_arc * 3.0
                u1 = i / n_arc * 3.0
                for lp in f.loops:
                    if lp.vert in (prev_in, prev_out):
                        lp[uv_w].uv = (0.0 if lp.vert == prev_in else 1.0, u0)
                    else:
                        lp[uv_w].uv = (0.0 if lp.vert == vi else 1.0, u1)
            prev_in, prev_out = vi, vo

    # Radial outlet streams connecting the curved canal cleanly out to both waterfall cliff lips!
    for ang_deg in (-124.0, -56.0):
        ang = math.radians(ang_deg)
        ca, sa = math.cos(ang), math.sin(ang)
        tx, ty = -sa, ca
        lip_r = island_radius(ang) + 0.1
        half_w = 1.62
        prev_l = prev_r = None
        for step in range(7):
            u = step / 6.0
            r_cur = 15.8 + (lip_r - 15.8) * u
            z_cur = -0.14 - 0.14 * u
            vl = bm_w.verts.new(Vector((r_cur * ca - half_w * tx, r_cur * sa - half_w * ty, z_cur)))
            vr = bm_w.verts.new(Vector((r_cur * ca + half_w * tx, r_cur * sa + half_w * ty, z_cur)))
            if prev_l is not None:
                f = bm_w.faces.new((prev_l, prev_r, vr, vl))
                u0, u1 = (step - 1) / 6.0 * 1.5, step / 6.0 * 1.5
                f.loops[0][uv_w].uv = (0.0, u0)
                f.loops[1][uv_w].uv = (1.0, u0)
                f.loops[2][uv_w].uv = (1.0, u1)
                f.loops[3][uv_w].uv = (0.0, u1)
            prev_l, prev_r = vl, vr

    mesh_from_bmesh(bm_w, 'Water_Moat_Animated', col, mats['water'], smooth=True)

    # 2. Two Shimmering Cosmic Waterfalls spilling from the canal lips off the cliff ('Water_Waterfalls_Animated')
    bm_wf = bmesh.new()
    uv_wf = bm_wf.loops.layers.uv.new('UVMap')
    for ang_deg in (-124.0, -56.0):
        ang = math.radians(ang_deg)
        ca, sa = math.cos(ang), math.sin(ang)
        tx, ty = -sa, ca
        lip_r = island_radius(ang) - 0.15
        half_w = 1.65
        n_v = 14
        prev_row = None
        for iv in range(n_v + 1):
            v = iv / n_v
            # Parabolic waterfall drop into cosmic space
            r_cur = lip_r + 1.55 * (1.0 - (1.0 - v) ** 2)
            z_cur = -0.32 - 14.8 * (v ** 1.55)
            w_cur = half_w * (1.0 + 0.18 * v)
            row = []
            for iu in range(5):
                uf = iu / 4.0
                lat = (uf - 0.5) * 2.0 * w_cur
                bow = 0.25 * math.cos((uf - 0.5) * math.pi)
                px = (r_cur + bow) * ca + lat * tx
                py = (r_cur + bow) * sa + lat * ty
                row.append(bm_wf.verts.new(Vector((px, py, z_cur))))
            if prev_row is not None:
                v0 = (iv - 1) / n_v
                v1 = iv / n_v
                for iu in range(4):
                    f = bm_wf.faces.new((prev_row[iu], prev_row[iu + 1], row[iu + 1], row[iu]))
                    u0, u1 = iu / 4.0, (iu + 1) / 4.0
                    f.loops[0][uv_wf].uv = (u0, v0)
                    f.loops[1][uv_wf].uv = (u1, v0)
                    f.loops[2][uv_wf].uv = (u1, v1)
                    f.loops[3][uv_wf].uv = (u0, v1)
            prev_row = row

    mesh_from_bmesh(bm_wf, 'Water_Waterfalls_Animated', col, mats['waterfall'], smooth=True)


def build_nature_and_trees(col, mats):
    """Lush broadleaf oaks, conifers, and flower bushes framing the Castle Town and cliffs."""
    bm_trunk = bmesh.new()
    bm_broad = bmesh.new()
    bm_pine = bmesh.new()
    bm_flower = bmesh.new()

    broad_spots = [
        (-13.5, 9.2, 0.15, 1.35, 0.4),
        (-16.8, 6.4, 0.35, 1.25, 1.2),
        (-18.6, 1.2, 0.25, 1.15, 2.1),
        (-18.2, -5.2, 0.05, 1.10, 0.8),
        (13.8, 9.6, 0.10, 1.35, 1.8),
        (17.4, 5.4, 0.10, 1.25, 0.5),
        (18.6, 0.6, 0.10, 1.15, 2.6),
        (18.2, -5.6, 0.05, 1.10, 1.1),
        (-9.6, -15.4, 0.02, 1.05, 0.7),
        (9.6, -15.4, 0.02, 1.05, 2.2),
        (-3.6, 18.2, 0.10, 1.30, 1.5),
        (3.8, 18.4, 0.10, 1.25, 0.3),
        (0.0, 19.6, 0.08, 1.40, 2.8),
    ]
    for x, y, z, sc, rz in broad_spots:
        add_broadleaf_tree(bm_trunk, bm_broad, (x, y, z), scale=sc, rot_z=rz)

    pine_spots = [
        (-11.4, 13.8, 0.10, 1.35),
        (-15.6, 11.4, 0.10, 1.20),
        (-19.4, 4.2, 0.20, 1.10),
        (11.6, 13.8, 0.10, 1.35),
        (15.8, 11.2, 0.10, 1.20),
        (19.4, 3.8, 0.10, 1.10),
        (-7.4, 17.6, 0.10, 1.30),
        (7.6, 17.6, 0.10, 1.30),
    ]
    for x, y, z, sc in pine_spots:
        add_pine_tree(bm_trunk, bm_pine, (x, y, z), scale=sc)

    bush_spots = [
        (-4.5, -0.6, 0.08, 0.9), (4.5, -0.6, 0.08, 0.9),
        (-6.2, -5.8, 0.08, 0.85), (6.2, -5.8, 0.08, 0.85),
        (-4.2, -12.6, 0.08, 0.85), (4.2, -12.6, 0.08, 0.85),
        (-12.2, 5.4, 0.85, 0.9), (11.2, 6.2, 0.10, 0.9),
    ]
    for x, y, z, sc in bush_spots:
        add_flowering_bush(bm_broad, bm_flower, (x, y, z), scale=sc)

    # Direct glTF-safe PBR materials for lush green trees & warm oak trunks (no Mix-AO node dropped by glTF!)
    mat_kt_bark = make_simple_mat('Mat_KT_TreeBark', '#69442A', roughness=0.84, metallic=0.02)
    mat_kt_broad = make_simple_mat('Mat_KT_Broadleaf', '#429B44', roughness=0.72, metallic=0.02)
    mat_kt_pine = make_simple_mat('Mat_KT_PineLeaf', '#246B3C', roughness=0.74, metallic=0.02)

    mesh_from_bmesh(bm_trunk, 'Town_Tree_Trunks', col, mat_kt_bark, smooth=True)
    mesh_from_bmesh(bm_broad, 'Town_Broadleaf_Foliage', col, mat_kt_broad, smooth=True)
    mesh_from_bmesh(bm_pine, 'Town_Pine_Foliage', col, mat_kt_pine, smooth=True)
    mesh_from_bmesh(bm_flower, 'Town_Flowers', col, mats['flower_gold'], smooth=True)


def render_cosmic_variants(scene, col_lights):
    """Render 4 time-of-day transparent RGBA Cycles OPTIX WebP snapshots for power-save fallback + QA."""
    out_dir = DIORAMA_DIR / 'cosmic_home'
    out_dir.mkdir(parents=True, exist_ok=True)

    scene.render.engine = 'CYCLES'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'OPTIX'
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        scene.cycles.device = 'GPU'
    except Exception:
        scene.cycles.device = 'CPU'
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.render.film_transparent = True
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 768
    scene.render.image_settings.file_format = 'WEBP'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.quality = 88

    # Hero 3/4 front-south-west camera showing full floating cliff, waterfalls, Castle Town & Kingdom spire unclipped!
    cd = bpy.data.cameras.new('Cam_KingdomTown')
    cd.lens = 36.0
    co = bpy.data.objects.new('Cam_KingdomTown', cd)
    co.location = Vector((-24.0, -64.0, 30.0))
    direction = Vector((0.0, 0.2, 0.2)) - co.location
    co.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.collection.objects.link(co)
    scene.camera = co

    # Key sun + fill light + warm town glow light
    sun_d = bpy.data.lights.new('KT_Sun', type='SUN')
    sun_o = bpy.data.objects.new('KT_Sun', sun_d)
    col_lights.objects.link(sun_o)

    pl_d = bpy.data.lights.new('KT_TownGlow', type='POINT')
    pl_d.color = (1.0, 0.78, 0.42)
    pl_o = bpy.data.objects.new('KT_TownGlow', pl_d)
    pl_o.location = (0.0, -5.5, 5.2)
    col_lights.objects.link(pl_o)

    w = bpy.data.worlds.new('KT_World')
    w.use_nodes = True
    bg = w.node_tree.nodes['Background']
    scene.world = w

    phases = {
        'dawn':  ((1.0, 0.84, 0.72), 2.8, (0.55, 0.68, 0.95), 0.75, 420.0, (-0.55, 0.45, 0.7)),
        'day':   ((0.96, 0.98, 1.0), 3.4, (0.65, 0.82, 1.0), 0.95, 220.0, (0.45, 0.65, 0.8)),
        'dusk':  ((1.0, 0.62, 0.40), 2.5, (0.42, 0.34, 0.68), 0.60, 720.0, (-0.75, 0.35, 0.5)),
        'night': ((0.55, 0.72, 1.0), 1.4, (0.16, 0.24, 0.48), 0.45, 980.0, (-0.35, 0.55, 0.75)),
    }

    for key, (scol, seng, wcol, weng, peng, sdir) in phases.items():
        sun_d.color = scol
        sun_d.energy = seng
        sun_o.rotation_euler = Vector(sdir).to_track_quat('-Z', 'Y').to_euler()
        bg.inputs['Color'].default_value = (*wcol, 1.0)
        bg.inputs['Strength'].default_value = weng
        pl_d.energy = peng
        out_p = out_dir / f'{key}_kingdom_town.webp'
        scene.render.filepath = str(out_p)
        bpy.ops.render.render(write_still=True)
        print(f'KT_COSMIC_RENDER {out_p.name} ({out_p.stat().st_size / 1024:.1f} KB)')


def build_all():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene

    cols = {
        n: ensure_collection(n)
        for n in ('Island_Base', 'Castle_Kingdom', 'Town', 'Water', 'Nature', 'Lights')
    }
    mats = build_material_library()

    build_floating_island(cols['Island_Base'], mats)
    hero = import_kingdom_castle(cols['Castle_Kingdom'])
    build_stairs_and_plaza(cols['Town'], mats)
    lamp_positions = build_castle_town(cols['Town'], mats)
    build_animated_water_and_waterfalls(cols['Water'], mats)
    build_nature_and_trees(cols['Nature'], mats)

    # Pack textures & save master .blend
    try:
        bpy.ops.file.pack_all()
    except Exception:
        pass
    blend_path = DIORAMA_DIR / 'kingdom_town_diorama.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))

    # Optional 4-phase Cycles renders (before WebGL decimation!)
    if '--render-cosmic' in sys.argv:
        render_cosmic_variants(scene, cols['Lights'])

    # Remove any render lights/cameras before WebGL GLB export
    for o in list(bpy.data.objects):
        if o.type in ('LIGHT', 'CAMERA'):
            bpy.data.objects.remove(o, do_unlink=True)

    # Optimize dense Tripo kingdom castle mesh & textures cleanly for iPhone 14+ 60fps
    if hero is not None and len(hero.data.polygons) > 10000:
        mod = hero.modifiers.new('WebGL_Decimate', 'DECIMATE')
        mod.ratio = 0.56
        mod.use_collapse_triangulate = True
    for img in bpy.data.images:
        if img.size[0] >= 1024 or img.size[1] >= 1024:
            img.scale(768, 768)

    glb_path = DIORAMA_DIR / 'kingdom_town_diorama.glb'
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path),
        export_format='GLB',
        export_yup=True,
        export_apply=True,
        export_cameras=False,
        export_lights=False,
        export_materials='EXPORT',
        export_image_format='JPEG',
        export_image_quality=82,
        export_draco_mesh_compression_enable=False,
    )

    total_tris = sum(
        sum(max(1, len(p.vertices) - 2) for p in o.data.polygons)
        for o in bpy.data.objects if o.type == 'MESH'
    )
    print(f'KINGDOM_TOWN_OK glb={glb_path.name} ({glb_path.stat().st_size / 1024:.1f} KB) tris={total_tris} lamps={len(lamp_positions)}')


if __name__ == '__main__':
    build_all()
