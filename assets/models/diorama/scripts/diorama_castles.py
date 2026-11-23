"""AAA-Detailed Four Faction Castle builders for Castle Field 3D Diorama.

Local space convention for every castle:
  (0, 0, 0) = center of castle pad on its terrace.
  -Y local  = FRONT entrance (faces Central Plaza after Root Empty rotation).
  +Y local  = REAR (toward outer cliff rim).
"""

import math
import random
from pathlib import Path
import bpy
import bmesh
from mathutils import Vector, Matrix

TRIPO_DIR = Path(__file__).resolve().parent.parent / 'tripo_castles'

from diorama_materials import (
    hex_rgba,
    lerp_rgba,
    fbm_noise,
    paint_vertex_colors,
    mesh_from_bmesh,
)
from diorama_terrain import LAYOUT, USE_TRIPO_ISLAND
from diorama_arch_kit import (
    add_box,
    add_cylinder,
    add_pitched_roof,
    add_tube_along_curve,
    sample_catmull_rom,
    add_ribbed_horn,
    add_framed_arched_window,
    add_rose_window,
    add_crenellations_line,
    add_crenellations_ring,
    add_flared_spire_roof,
    add_gothic_flying_buttress,
    add_layered_brazier,
    add_banner,
    add_flag_pennant,
)


def make_castle_root(name, faction_key, col):
    cfg = LAYOUT['castles'][faction_key]
    root = bpy.data.objects.new(name, None)
    root.empty_display_type = 'ARROWS'
    root.empty_display_size = 2.5
    root.location = cfg['center']
    rot_map = {
        'kingdom': 0.0,
        'forest': math.radians(90.0),
        'demon': math.radians(-90.0),
        'dragon': math.radians(180.0),
    }
    root.rotation_euler = (0.0, 0.0, rot_map[faction_key])
    col.objects.link(root)
    return root


def finalize_part(bm, name, col, mat, root, smooth=False, vcol_fn=None):
    bm.normal_update()
    if vcol_fn is not None:
        paint_vertex_colors(bm, vcol_fn)
    obj = mesh_from_bmesh(bm, name, col, mat, smooth=smooth)
    obj.parent = root
    return obj


def try_import_tripo_castle(faction_key, col, mats, root):
    """Import pre-optimized Tripo hero castle GLB if available, anchored solidly onto a terrace plinth."""
    glb_path = TRIPO_DIR / f'tripo_castle_{faction_key}.glb'
    if not glb_path.exists():
        return False

    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(glb_path))
    after = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in after if o.type == 'MESH']
    if not meshes:
        return False

    # Scale cleanly so each castle sits heroically dead-center on its circular Tripo stone pad!
    tripo_scale_map = {
        'kingdom': 0.90,
        'forest': 0.92,
        'demon': 0.90,
        'dragon': 0.94,
    }
    sc = tripo_scale_map[faction_key] if USE_TRIPO_ISLAND else 1.0

    # Move imported meshes cleanly into target faction collection & parent under castle root
    for o in after:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        if o.type == 'MESH':
            o.name = f'Castle_{faction_key.capitalize()}_Hero'
            # Reset local transform to origin of root (already normalized & grounded at Z=0, facing -Y!)
            o.parent = root
            o.matrix_parent_inverse = Matrix.Identity(4)
            o.location = (0.0, 0.0, -0.14 if USE_TRIPO_ISLAND else -0.05)  # embed cleanly into circular pad for airtight contact!
            o.rotation_euler = (0.0, 0.0, 0.0)
            o.scale = (sc, sc, sc)
            col.objects.link(o)
        else:
            bpy.data.objects.remove(o, do_unlink=True)

    # Solid sculpted masonry foundation skirt underneath so zero sliver gap appears from any oblique angle!
    bm_plinth = bmesh.new()
    plinth_h = 0.85 if USE_TRIPO_ISLAND else 2.12
    plinth_cfg = {
        'kingdom': ('kingdom_trim', 11.4 * sc, 10.8 * sc, 'box'),
        'forest': ('forest_stone', 5.5 * sc, 5.5 * sc, 'cyl'),
        'demon': ('demon_obsidian', 5.8 * sc, 5.8 * sc, 'hex'),
        'dragon': ('dragon_basalt', 6.1 * sc, 6.1 * sc, 'oct'),
    }[faction_key]
    mat_key, sx, sy, shape = plinth_cfg
    if shape == 'box':
        add_box(bm_plinth, (0.0, 0.0, -plinth_h * 0.5 - 0.04), (sx, sy, plinth_h))
    elif shape == 'cyl':
        add_cylinder(bm_plinth, (0.0, 0.0, -plinth_h - 0.04), sx * 1.04, sx * 0.96, plinth_h, segs=18)
    elif shape == 'hex':
        add_cylinder(bm_plinth, (0.0, 0.0, -plinth_h - 0.04), sx * 1.05, sx * 0.97, plinth_h, segs=6, rot_z=math.pi / 6)
    else:
        add_cylinder(bm_plinth, (0.0, 0.0, -plinth_h - 0.04), sx * 1.05, sx * 0.97, plinth_h, segs=8, rot_z=math.pi / 8)

    vcol_map = {
        'kingdom': lambda co, n: hex_rgba('#CFC6B5'),
        'forest': lambda co, n: lerp_rgba(hex_rgba('#56664B'), hex_rgba('#8C947C'), 0.4 + 0.5 * fbm_noise(co.x, co.y, co.z)),
        'demon': lambda co, n: lerp_rgba(hex_rgba('#191326'), hex_rgba('#352B4F'), 0.4 + 0.5 * fbm_noise(co.x, co.y, co.z)),
        'dragon': lambda co, n: lerp_rgba(hex_rgba('#241816'), hex_rgba('#4D322B'), 0.4 + 0.5 * fbm_noise(co.x, co.y, co.z)),
    }
    finalize_part(
        bm_plinth,
        f'Castle_{faction_key.capitalize()}_FoundationPlinth',
        col,
        mats[mat_key],
        root,
        smooth=False,
        vcol_fn=vcol_map[faction_key] if mat_key != 'kingdom_trim' else None,
    )
    return True


# ---------------------------------------------------------------------------
# 1. KINGDOM CASTLE (North, +Y) — Grand Fairytale Limestone Cathedral-Citadel
# ---------------------------------------------------------------------------

def build_castle_kingdom(col, mats):
    root = make_castle_root('Castle_Kingdom_Root', 'kingdom', col)
    if try_import_tripo_castle('kingdom', col, mats, root):
        return root
    bm_wall = bmesh.new()
    bm_trim = bmesh.new()
    bm_roof = bmesh.new()
    bm_gold = bmesh.new()
    bm_glow = bmesh.new()
    bm_door = bmesh.new()
    bm_banner = bmesh.new()

    # 1. Stepped Ashlar Citadel Plinth with Molded Base Course (anchored to Z=-1.9)
    add_box(bm_wall, (0.0, 0.2, -0.95), (12.8, 10.4, 1.95))
    add_box(bm_trim, (0.0, 0.2, 0.06), (13.1, 10.7, 0.24))

    # 2. Outer Curtain Walls with Chamfered Wall Buttresses & Machicolations!
    wall_h = 3.45
    add_box(bm_wall, (-3.95, -4.1, wall_h * 0.5), (3.55, 0.96, wall_h))
    add_box(bm_wall, (3.95, -4.1, wall_h * 0.5), (3.55, 0.96, wall_h))
    add_box(bm_wall, (-5.55, 0.0, wall_h * 0.5), (0.98, 8.2, wall_h))
    add_box(bm_wall, (5.55, 0.0, wall_h * 0.5), (0.98, 8.2, wall_h))
    add_box(bm_wall, (0.0, 4.1, wall_h * 0.5), (11.2, 0.98, wall_h))

    # Stepped chamfered masonry buttresses along sides & rear curtain walls
    for by in (-2.0, 0.0, 2.0):
        for sx in (-1.0, 1.0):
            add_box(bm_trim, (sx * 6.12, by, 1.15), (0.42, 0.54, 2.3))
            add_box(bm_trim, (sx * 6.06, by, 2.65), (0.30, 0.44, 0.95))
    for bx in (-3.0, -1.0, 1.0, 3.0):
        add_box(bm_trim, (bx, 4.68, 1.15), (0.54, 0.42, 2.3))
        add_box(bm_trim, (bx, 4.62, 2.65), (0.44, 0.30, 0.95))

    # Overhanging wall stringcourses & machicolated battlements
    add_box(bm_trim, (-3.95, -4.1, wall_h + 0.08), (3.7, 1.18, 0.22))
    add_box(bm_trim, (3.95, -4.1, wall_h + 0.08), (3.7, 1.18, 0.22))
    add_box(bm_trim, (-5.55, 0.0, wall_h + 0.08), (1.18, 8.3, 0.22))
    add_box(bm_trim, (5.55, 0.0, wall_h + 0.08), (1.18, 8.3, 0.22))
    add_box(bm_trim, (0.0, 4.1, wall_h + 0.08), (11.4, 1.18, 0.22))

    add_crenellations_line(bm_wall, bm_trim, (-5.1, -4.32), (-2.65, -4.32), wall_h + 0.20, machicolations=True)
    add_crenellations_line(bm_wall, bm_trim, (2.65, -4.32), (5.1, -4.32), wall_h + 0.20, machicolations=True)
    add_crenellations_line(bm_wall, bm_trim, (-5.75, -3.4), (-5.75, 3.4), wall_h + 0.20, machicolations=True)
    add_crenellations_line(bm_wall, bm_trim, (5.75, -3.4), (5.75, 3.4), wall_h + 0.20, machicolations=True)
    add_crenellations_line(bm_wall, bm_trim, (-4.9, 4.32), (4.9, 4.32), wall_h + 0.20, machicolations=True)

    # 3. Grand Multi-Order Gothic Arch Gatehouse (facing -Y toward Central Plaza!)
    add_box(bm_wall, (0.0, -4.25, 2.45), (4.55, 1.92, 4.9))
    add_box(bm_trim, (0.0, -4.25, 4.95), (4.88, 2.18, 0.26))
    add_crenellations_line(bm_wall, bm_trim, (-2.15, -5.12), (2.15, -5.12), 5.08, merlon_w=0.44, gap=0.34, machicolations=True)
    # Recessed glowing arched royal entrance + oak frame + golden portcullis lattice
    add_box(bm_door, (0.0, -5.12, 1.48), (2.38, 0.26, 2.95))
    add_box(bm_glow, (0.0, -5.20, 1.38), (1.82, 0.14, 2.38))
    add_cylinder(bm_glow, (0.0, -5.20, 2.52), 0.91, 0.04, 0.65, segs=8)
    for px in (-0.54, 0.0, 0.54):
        add_box(bm_gold, (px, -5.27, 1.72), (0.08, 0.08, 1.98))
    for pz in (1.35, 1.92, 2.46):
        add_box(bm_gold, (0.0, -5.27, pz), (1.84, 0.08, 0.08))
    # Sculpted stone piers + radiating arch voussoir stones framing the gate!
    for sx in (-1.0, 1.0):
        add_box(bm_trim, (sx * 1.30, -5.25, 1.25), (0.46, 0.48, 2.50))
        add_box(bm_trim, (sx * 1.30, -5.28, 2.55), (0.56, 0.54, 0.20))
    for vi in range(9):
        a = math.pi * (vi / 8.0)
        vx = 1.26 * math.cos(a)
        vz = 2.55 + 1.05 * math.sin(a)
        is_key = (vi == 4)
        add_box(bm_trim, (vx, -5.26, vz), (0.34 if is_key else 0.26, 0.44 if is_key else 0.36, 0.42 if is_key else 0.32), rot_y=a - math.pi * 0.5)

    # Ornate Sculpted Golden Fleur-de-Lis Shield Crest mounted above gate arch!
    cy, cz = -5.34, 4.18
    add_box(bm_gold, (0.0, cy + 0.06, cz), (1.36, 0.12, 1.44))
    add_box(bm_roof, (0.0, cy + 0.02, cz), (1.18, 0.14, 1.26))
    add_cylinder(bm_gold, (0.0, cy - 0.08, cz - 0.46), 0.17, 0.03, 0.98, segs=8)
    add_box(bm_gold, (0.0, cy - 0.08, cz - 0.06), (0.82, 0.12, 0.16))
    for sx in (-1.0, 1.0):
        m_p = Matrix.Translation((sx * 0.28, cy - 0.08, cz + 0.06)) @ Matrix.Rotation(sx * -0.46, 4, 'Y')
        bmesh.ops.create_cone(bm_gold, cap_ends=True, cap_tris=False, segments=8, radius1=0.14, radius2=0.03, depth=0.68, matrix=m_p)

    # Twin Front Gatehouse Towers (with machicolations, flared blue spires, dormers & framed windows!)
    for sx in (-1.0, 1.0):
        tx, ty = sx * 2.52, -4.25
        add_cylinder(bm_wall, (tx, ty, 0.0), 1.24, 1.12, 5.65, segs=16)
        add_cylinder(bm_trim, (tx, ty, 2.75), 1.24, 1.24, 0.16, segs=16)  # mid-tower belt course
        add_cylinder(bm_trim, (tx, ty, 5.45), 1.32, 1.36, 0.38, segs=16)
        add_crenellations_ring(bm_wall, bm_trim, tx, ty, 5.80, 1.26, count=8, merlon_w=0.34, merlon_d=0.22, merlon_h=0.32, machicolations=True)
        add_flared_spire_roof(bm_roof, bm_gold, bm_trim, bm_glow, tx, ty, 5.95, 1.34, 3.35, segs=16, dormers=2, finial_h=1.05)
        add_framed_arched_window(bm_trim, bm_glow, (tx, ty - 1.16, 3.80), rot_z=0.0, width=0.46, height=1.15, pointed=True)
        add_framed_arched_window(bm_trim, bm_glow, (tx + sx * 1.16, ty, 3.80), rot_z=sx * math.pi * 0.5, width=0.46, height=1.15, pointed=True)
        # Royal blue hanging banners on front curtain wall
        add_banner(bm_banner, (sx * 3.95, -4.72, 3.15), width=0.95, height=2.25, rot_z=0.0)
        add_box(bm_gold, (sx * 3.95, -4.79, 2.30), (0.24, 0.06, 0.56))
        add_box(bm_gold, (sx * 3.95, -4.78, 3.16), (1.06, 0.09, 0.10))  # gold banner hanger bar

    # 4. Four Outer Corner Machicolated Guard Turrets
    corner_towers = [
        (-5.65, -4.05, 5.05, 2.95),
        (5.65, -4.05, 5.05, 2.95),
        (-5.65, 4.05, 5.55, 3.15),
        (5.65, 4.05, 5.55, 3.15),
    ]
    for tx, ty, th, rh in corner_towers:
        add_cylinder(bm_wall, (tx, ty, -0.5), 1.44, 1.28, th + 0.5, segs=16)
        add_cylinder(bm_trim, (tx, ty, th * 0.48), 1.40, 1.40, 0.16, segs=16)
        add_cylinder(bm_trim, (tx, ty, th - 0.16), 1.46, 1.52, 0.36, segs=16)
        add_crenellations_ring(bm_wall, bm_trim, tx, ty, th + 0.18, 1.38, count=10, merlon_w=0.34, merlon_d=0.24, merlon_h=0.36, machicolations=True)
        add_flared_spire_roof(bm_roof, bm_gold, bm_trim, bm_glow, tx, ty, th + 0.32, 1.44, rh, segs=16, dormers=2, finial_h=0.90)
        wy_dir = -1.0 if ty < 0 else 1.0
        wx_dir = -1.0 if tx < 0 else 1.0
        add_framed_arched_window(bm_trim, bm_glow, (tx, ty + wy_dir * 1.30, th * 0.70), rot_z=0.0 if wy_dir < 0 else math.pi, width=0.44, height=1.05, pointed=True)
        add_framed_arched_window(bm_trim, bm_glow, (tx + wx_dir * 1.30, ty, th * 0.70), rot_z=wx_dir * math.pi * 0.5, width=0.44, height=1.05, pointed=True)

    # 5. Elevated Inner Royal Cathedral Palace Hall + Central Golden Rose Window!
    add_box(bm_wall, (0.0, 0.85, 3.25), (7.8, 5.5, 6.5))
    add_box(bm_trim, (0.0, 0.85, 6.45), (8.18, 5.88, 0.34))
    add_pitched_roof(bm_roof, (0.0, 0.85, 6.60), 7.9, 5.6, 2.75, overhang=0.36)
    # Golden ridge cresting along the palace roof spine
    add_box(bm_gold, (0.0, 0.85, 9.38), (5.5, 0.14, 0.22))
    # Cathedral Golden Rose Window prominently visible on front upper facade above gatehouse!
    add_rose_window(bm_trim, bm_gold, bm_glow, (0.0, -1.94, 5.15), radius=0.92, rot_z=0.0)
    # Framed arched cathedral windows flanking Rose Window & along rear facade
    for wx in (-2.55, 2.55):
        add_framed_arched_window(bm_trim, bm_glow, (wx, -1.92, 4.95), rot_z=0.0, width=0.64, height=1.45, pointed=True)
    for wx in (-2.55, -0.85, 0.85, 2.55):
        add_framed_arched_window(bm_trim, bm_glow, (wx, 3.62, 4.85), rot_z=math.pi, width=0.62, height=1.40, pointed=True)

    # Two Tall Mid-Keep Flanking Belfry Spires
    for sx in (-1.0, 1.0):
        tx, ty = sx * 3.65, 0.85
        add_cylinder(bm_wall, (tx, ty, 0.0), 1.52, 1.38, 7.85, segs=16)
        add_cylinder(bm_trim, (tx, ty, 4.4), 1.50, 1.50, 0.18, segs=16)
        add_cylinder(bm_trim, (tx, ty, 7.65), 1.60, 1.66, 0.40, segs=16)
        add_crenellations_ring(bm_wall, bm_trim, tx, ty, 8.02, 1.52, count=10, merlon_w=0.36, merlon_d=0.24, merlon_h=0.36, machicolations=True)
        add_flared_spire_roof(bm_roof, bm_gold, bm_trim, bm_glow, tx, ty, 8.18, 1.64, 3.85, segs=16, dormers=3, finial_h=1.20)
        add_flag_pennant(bm_banner, (tx, ty, 13.05), length=1.35, height=0.58, rot_z=0.35)
        add_framed_arched_window(bm_trim, bm_glow, (tx, ty - 1.40, 6.05), rot_z=0.0, width=0.50, height=1.25, pointed=True)
        add_framed_arched_window(bm_trim, bm_glow, (tx + sx * 1.40, ty, 6.05), rot_z=sx * math.pi * 0.5, width=0.50, height=1.25, pointed=True)

    # 6. Soaring Central Octagonal Royal Crown Donjon Spire (world peak Z ~ 18.8m)
    add_cylinder(bm_wall, (0.0, 1.05, 5.6), 2.42, 2.22, 4.35, segs=8, rot_z=math.pi / 8)
    add_cylinder(bm_trim, (0.0, 1.05, 9.75), 2.50, 2.62, 0.44, segs=8, rot_z=math.pi / 8)
    add_crenellations_ring(bm_wall, bm_trim, 0.0, 1.05, 10.16, 2.38, count=8, merlon_w=0.56, merlon_d=0.32, merlon_h=0.44, machicolations=True)
    add_flared_spire_roof(bm_roof, bm_gold, bm_trim, bm_glow, 0.0, 1.05, 10.32, 2.48, 4.65, segs=8, rot_z=math.pi / 8, dormers=4, finial_h=1.55)
    # 8 Golden roof hip ridge ribs climbing the octagonal central royal spire!
    for ri in range(8):
        a = (2.0 * math.pi * ri) / 8.0 + math.pi / 8.0
        p0 = (2.78 * math.cos(a), 1.05 + 2.78 * math.sin(a), 10.32)
        p1 = (1.96 * math.cos(a), 1.05 + 1.96 * math.sin(a), 11.45)
        p2 = (0.08 * math.cos(a), 1.05 + 0.08 * math.sin(a), 14.95)
        add_tube_along_curve(bm_gold, [p0, p1, p2], [0.06, 0.055, 0.03], segs=5)
    # Warm golden wall-sconce lanterns flanking the royal gate piers
    for sx in (-1.0, 1.0):
        add_box(bm_gold, (sx * 1.65, -5.28, 2.25), (0.14, 0.24, 0.14))
        bmesh.ops.create_icosphere(bm_glow, subdivisions=2, radius=0.16, matrix=Matrix.Translation((sx * 1.65, -5.42, 2.42)))
    add_flag_pennant(bm_banner, (0.0, 1.05, 16.35), length=1.95, height=0.82, rot_z=0.28)
    for wi in range(8):
        a = wi * (math.pi * 0.25)
        add_framed_arched_window(
            bm_trim, bm_glow,
            (2.26 * math.cos(a), 1.05 + 2.26 * math.sin(a), 8.05),
            rot_z=a + math.pi * 0.5, width=0.56, height=1.42, pointed=True,
        )

    c_w_hi = hex_rgba('#F6F2E9')
    c_w_lo = hex_rgba('#CEC4B3')
    wall_vcol = lambda co, n: lerp_rgba(
        c_w_lo, c_w_hi,
        min(1.0, max(0.0, 0.35 + 0.45 * (co.z / 10.5) + 0.24 * fbm_noise(co.x * 1.4, co.y * 1.4, co.z * 1.2))),
    )
    c_r_hi = hex_rgba('#286CE6')
    c_r_lo = hex_rgba('#13388A')
    roof_vcol = lambda co, n: lerp_rgba(c_r_lo, c_r_hi, min(1.0, max(0.0, 0.25 + 0.55 * max(0.0, n.z) + 0.20 * fbm_noise(co.x * 2.0, co.y * 2.0, co.z * 1.8))))

    finalize_part(bm_wall, 'Kingdom_Walls_And_Towers', col, mats['kingdom_wall'], root, smooth=False, vcol_fn=wall_vcol)
    finalize_part(bm_trim, 'Kingdom_Stone_Trim', col, mats['kingdom_trim'], root, smooth=False)
    finalize_part(bm_roof, 'Kingdom_RoyalBlue_Roofs', col, mats['kingdom_roof'], root, smooth=False, vcol_fn=roof_vcol)
    finalize_part(bm_gold, 'Kingdom_Gold_Crest_Finials', col, mats['gold'], root, smooth=False)
    finalize_part(bm_glow, 'Kingdom_Glowing_Windows', col, mats['glow_window_gold'], root, smooth=False)
    finalize_part(bm_door, 'Kingdom_Gate_Doors', col, mats['kingdom_door'], root, smooth=False)
    finalize_part(bm_banner, 'Kingdom_Banners', col, mats['kingdom_banner'], root, smooth=False)
    return root


# ---------------------------------------------------------------------------
# 2. FOREST ALLIANCE CASTLE (West, -X) — Living Fluted World-Tree & Organic Canopy
# ---------------------------------------------------------------------------

def build_castle_forest(col, mats):
    root = make_castle_root('Castle_Forest_Root', 'forest', col)
    if try_import_tripo_castle('forest', col, mats, root):
        return root
    bm_bark = bmesh.new()
    bm_wood = bmesh.new()
    bm_stone = bmesh.new()
    bm_canopy = bmesh.new()
    bm_roof = bmesh.new()
    bm_vines = bmesh.new()
    bm_glow = bmesh.new()
    bm_spore = bmesh.new()
    bm_banner = bmesh.new()
    bm_gold = bmesh.new()

    rng = random.Random(7731)

    # 1. Stepped Organic Mossy Stone Terrace Base + Curved Sanctuary Low Walls
    add_cylinder(bm_stone, (0.0, 0.3, -1.9), 7.1, 6.4, 1.95, segs=18)
    for sx in (-1.0, 1.0):
        add_box(bm_stone, (sx * 3.85, -3.95, 0.95), (3.65, 1.0, 1.95), rot_z=sx * 0.22)
        add_box(bm_wood, (sx * 3.85, -3.95, 1.96), (3.78, 1.12, 0.16), rot_z=sx * 0.22)
        add_banner(bm_banner, (sx * 2.52, -4.70, 2.75), width=0.90, height=2.12, rot_z=0.0)
        add_box(bm_gold, (sx * 2.52, -4.77, 1.92), (0.22, 0.06, 0.58))

    # 2. Colossal Fluted & Gnarled Ancient World-Tree Trunk (Catmull-Rom smooth + bark flutes!)
    trunk_ctrl = [
        (0.0, 0.5, -0.6),
        (-0.22, 0.42, 1.8),
        (-0.48, 0.58, 4.2),
        (-0.20, 0.78, 6.6),
        (0.18, 0.68, 8.6),
        (0.08, 0.62, 10.4),
    ]
    trunk_rads = [3.75, 3.05, 2.52, 2.22, 1.92, 1.38]
    t_pts, t_rads = sample_catmull_rom(trunk_ctrl, trunk_rads, samples_per_seg=4)
    add_tube_along_curve(bm_bark, t_pts, t_rads, segs=16, flute_amp=0.14, flute_count=9)

    # 10 Massive Twisting Root Buttresses gripping the terrace and curling down over the cliff!
    root_angles = [-162, -135, -112, -52, -28, 8, 42, 78, 118, 152]
    for idx, deg in enumerate(root_angles):
        a = math.radians(deg)
        ca, sa = math.cos(a), math.sin(a)
        twist = 0.22 if (idx % 2 == 0) else -0.22
        r_ctrl = [
            (ca * 1.4, 0.5 + sa * 1.4, 3.0 + (idx % 3) * 0.45),
            (ca * 3.1 - sa * twist * 2.5, 0.5 + sa * 3.1 + ca * twist * 2.5, 1.45),
            (ca * 5.0 + sa * twist * 1.5, 0.5 + sa * 5.0 - ca * twist * 1.5, 0.35),
            (ca * 6.5, 0.5 + sa * 6.5, -1.75),
        ]
        rp, rr = sample_catmull_rom(r_ctrl, [1.02, 0.78, 0.54, 0.26], samples_per_seg=3)
        add_tube_along_curve(bm_bark, rp, rr, segs=10, flute_amp=0.10, flute_count=5)

    # 8 Sprawling Primary & Secondary Gnarled Boughs cradling the canopy & watchtowers
    bough_specs = [
        (-0.88, -0.44, 8.6, 10.4, 6.4),
        (0.90, -0.42, 8.8, 10.6, 6.3),
        (-0.94, 0.36, 9.2, 11.4, 6.9),
        (0.92, 0.40, 9.0, 11.1, 6.7),
        (-0.35, 0.92, 9.6, 11.9, 6.2),
        (0.38, 0.90, 9.5, 11.7, 6.0),
        (0.08, -0.84, 8.5, 10.1, 5.4),
        (-0.12, 0.15, 10.8, 12.6, 2.8),
    ]
    bough_tips = []
    for dx, dy, zm, ze, reach in bough_specs:
        b_ctrl = [
            (0.0, 0.6, 7.0),
            (dx * reach * 0.38, 0.6 + dy * reach * 0.38, zm),
            (dx * reach * 0.74, 0.6 + dy * reach * 0.74, (zm + ze) * 0.5 + 0.42),
            (dx * reach, 0.6 + dy * reach, ze),
        ]
        bp, br = sample_catmull_rom(b_ctrl, [1.18, 0.84, 0.54, 0.24], samples_per_seg=3)
        add_tube_along_curve(bm_bark, bp, br, segs=10, flute_amp=0.08, flute_count=5)
        bough_tips.append((dx * reach, 0.6 + dy * reach, ze))

    # 3. Living-Root Elven Sanctuary Gatehouse (y = -3.6, facing -Y toward Central Plaza!)
    add_box(bm_wood, (0.0, -3.55, 2.25), (3.85, 1.95, 4.5))
    # Decorative diagonal half-timber framing beams on front sanctuary facade
    for sx in (-1.0, 1.0):
        add_box(bm_bark, (sx * 1.82, -4.52, 2.25), (0.24, 0.24, 4.4))
        add_box(bm_bark, (sx * 1.45, -4.55, 3.65), (0.95, 0.16, 0.18), rot_y=sx * 0.55)
    # Multi-tiered flared leaf-shingle sanctuary roof with golden crest ridge
    add_pitched_roof(bm_roof, (0.0, -3.55, 4.42), 4.45, 2.55, 2.15, overhang=0.38)
    add_box(bm_gold, (0.0, -3.55, 6.58), (2.9, 0.12, 0.18))
    # Warm glowing elven arched portal doorway with curved leaf-lattice mullions!
    add_box(bm_glow, (0.0, -4.54, 1.50), (1.76, 0.16, 2.55))
    add_cylinder(bm_glow, (0.0, -4.54, 2.72), 0.88, 0.04, 0.55, segs=8)
    add_box(bm_wood, (0.0, -4.62, 1.62), (0.11, 0.12, 2.90))
    for hz in (1.15, 1.95):
        add_box(bm_wood, (0.0, -4.62, hz), (1.78, 0.12, 0.11))
    # Intertwined living-root archway framing the doorway
    arch_ctrl = [
        (-1.48, -4.58, 0.0), (-1.40, -4.62, 2.15), (-0.78, -4.66, 3.30),
        (0.0, -4.70, 3.75), (0.78, -4.66, 3.30), (1.40, -4.62, 2.15), (1.48, -4.58, 0.0),
    ]
    ap, ar = sample_catmull_rom(arch_ctrl, [0.38, 0.34, 0.28, 0.26, 0.28, 0.34, 0.38], samples_per_seg=3)
    add_tube_along_curve(bm_bark, ap, ar, segs=8)
    # Sculpted Golden Elven Leaf Crest above portal
    add_cylinder(bm_gold, (0.0, -4.74, 3.80), 0.32, 0.03, 0.98, segs=6)
    for sx in (-1.0, 1.0):
        m_lf = Matrix.Translation((sx * 0.28, -4.74, 4.08)) @ Matrix.Rotation(sx * -0.52, 4, 'Y')
        bmesh.ops.create_cone(bm_gold, cap_ends=True, cap_tris=False, segments=6, radius1=0.16, radius2=0.02, depth=0.62, matrix=m_lf)

    # 4. Five Staggered Half-Timbered Treehouse Watchtowers with Balconies & Flared Leaf Roofs!
    tree_towers = [
        (-4.65, -2.15, 0.0, 5.55, 1.48, 2.75),
        (4.65, -2.05, 0.0, 5.95, 1.48, 2.85),
        (0.0, 0.65, 8.20, 2.85, 1.65, 2.45),   # High Crown Sanctuary nestled cleanly under canopy crown!
        (-4.35, 3.25, 0.0, 5.35, 1.36, 2.55),
        (4.35, 3.25, 0.0, 5.15, 1.36, 2.55),
    ]
    for tx, ty, tz0, th, trad, rh in tree_towers:
        if tz0 < 1.0:
            add_cylinder(bm_stone, (tx, ty, -0.5), trad * 1.14, trad * 0.98, th * 0.42 + 0.5, segs=12)
            add_cylinder(bm_wood, (tx, ty, th * 0.42), trad * 0.98, trad * 1.06, th * 0.58, segs=12)
        else:
            add_cylinder(bm_wood, (tx, ty, tz0), trad * 0.96, trad * 1.08, th, segs=12)
        bal_z = tz0 + th
        # Cantilevered timber balcony floor + carved railing posts + wooden handrail ring!
        add_cylinder(bm_wood, (tx, ty, bal_z - 0.18), trad * 1.36, trad * 1.44, 0.24, segs=12)
        for pi in range(10):
            a = 2.0 * math.pi * pi / 10.0
            px, py = tx + trad * 1.34 * math.cos(a), ty + trad * 1.34 * math.sin(a)
            add_box(bm_bark, (px, py, bal_z + 0.32), (0.10, 0.10, 0.58), rot_z=a)
        add_cylinder(bm_bark, (tx, ty, bal_z + 0.58), trad * 1.38, trad * 1.38, 0.10, segs=12)
        # 3-Tier Flared Emerald Leaf-Petal Roof + Golden Leaf Finial
        add_cylinder(bm_roof, (tx, ty, bal_z + 0.22), trad * 1.82, trad * 1.02, rh * 0.34, segs=12)
        add_cylinder(bm_roof, (tx, ty, bal_z + 0.22 + rh * 0.32), trad * 1.06, trad * 0.48, rh * 0.34, segs=12)
        add_cylinder(bm_roof, (tx, ty, bal_z + 0.22 + rh * 0.64), trad * 0.52, 0.05, rh * 0.42, segs=12)
        add_cylinder(bm_gold, (tx, ty, bal_z + rh + 0.22), 0.09, 0.02, 0.82, segs=6)
        # Framed glowing amber windows around watchtower
        for wi in range(4):
            a = wi * (math.pi * 0.5) - math.pi * 0.5
            add_framed_arched_window(
                bm_bark, bm_glow,
                (tx + trad * 1.02 * math.cos(a), ty + trad * 1.02 * math.sin(a), bal_z - 1.15),
                rot_z=a + math.pi * 0.5, width=0.48, height=1.02, pointed=True,
            )

    # Suspended curved timber walkways & rope-rail bridges connecting towers to central trunk
    for sx in (-1.0, 1.0):
        add_box(bm_wood, (sx * 2.45, -2.85, 3.15), (3.2, 1.12, 0.28), rot_z=sx * -0.26)
        add_box(bm_bark, (sx * 2.45, -3.38, 3.68), (3.1, 0.10, 0.10), rot_z=sx * -0.26)
        # Glowing fairy lanterns dangling below walkways
        bmesh.ops.create_icosphere(bm_glow, subdivisions=2, radius=0.25, matrix=Matrix.Translation((sx * 2.55, -3.35, 2.58)))
        bmesh.ops.create_icosphere(bm_spore, subdivisions=2, radius=0.18, matrix=Matrix.Translation((sx * 3.85, -3.55, 1.65)))

    # 5. LUSH ORGANIC MULTI-SCALE CANOPY TAPESTRY (115+ smooth sculpted leafy bough tufts — ZERO soccer-ball icospheres!)
    # Primary structural canopy domes + dozens of layered organic leaf-spray tufts around each bough!
    canopy_centers = [
        (0.0, 0.6, 12.6, 3.8, 3.4, 2.0),
        (-3.6, -1.6, 10.9, 3.0, 2.7, 1.8),
        (3.8, -1.5, 11.1, 3.1, 2.8, 1.85),
        (-4.8, 1.6, 11.6, 3.3, 3.0, 1.95),
        (4.7, 1.8, 11.5, 3.2, 2.9, 1.90),
        (-1.9, 4.0, 12.1, 3.3, 3.1, 2.0),
        (2.1, 3.8, 11.9, 3.2, 3.0, 1.95),
        (0.0, -2.5, 10.1, 2.7, 2.2, 1.55),
        (-6.0, -0.2, 9.8, 2.4, 2.3, 1.60),
        (6.0, 0.2, 9.9, 2.5, 2.3, 1.60),
        (-2.2, -0.3, 13.4, 2.6, 2.4, 1.65),
        (2.3, 0.9, 13.6, 2.7, 2.5, 1.70),
        (0.0, 2.2, 14.0, 2.9, 2.6, 1.75),
        (-4.9, -3.3, 8.6, 1.8, 1.7, 1.20),
        (4.9, -3.1, 8.8, 1.8, 1.7, 1.20),
    ]
    for cx, cy, cz, rx, ry, rz in canopy_centers:
        # Core organic foliage bough + 7 smaller billowing leaf-tuft sub-clusters around its perimeter!
        sub_clusters = [(0.0, 0.0, 0.0, 1.0, 1.0, 0.92)]
        for k in range(7):
            a = (2.0 * math.pi * k) / 7.0 + rng.uniform(-0.25, 0.25)
            d = rng.uniform(0.55, 0.92)
            sc = rng.uniform(0.42, 0.66)
            sub_clusters.append((
                math.cos(a) * rx * d,
                math.sin(a) * ry * d,
                rng.uniform(-0.35, 0.45) * rz,
                sc, sc * rng.uniform(0.88, 1.12), sc * rng.uniform(0.75, 1.05),
            ))
        for ox, oy, oz, sx_f, sy_f, sz_f in sub_clusters:
            ret = bmesh.ops.create_icosphere(
                bm_canopy, subdivisions=2, radius=1.0,
                matrix=Matrix.Translation((cx + ox, cy + oy, cz + oz)) @ Matrix.Diagonal((rx * sx_f, ry * sy_f, rz * sz_f, 1.0)),
            )
            for v in ret['verts']:
                nv = (fbm_noise(v.co.x * 0.85, v.co.y * 0.85, v.co.z * 0.85) - 0.5) * 0.45
                v.co += Vector((nv, nv * 0.8, nv * 0.55))

    # 6. Draping Hanging Vine Curtains & Glowing Amber Fairy Lanterns framing the boughs (clear of front roof gable!)
    vine_anchors = [
        (-3.9, -3.0, 9.2, 2.4), (3.9, -2.9, 9.4, 2.5),
        (-2.35, -3.55, 8.9, 1.85), (2.35, -3.55, 8.9, 1.85),
        (-5.6, -1.2, 8.9, 2.8), (5.6, -1.0, 9.0, 2.7), (-5.8, 1.8, 9.4, 3.0),
        (5.8, 2.0, 9.3, 2.9), (-2.6, 4.8, 9.8, 3.2), (2.6, 4.7, 9.7, 3.1),
    ]
    for vx, vy, vz, vlen in vine_anchors:
        v_pts = [
            (vx, vy, vz),
            (vx + 0.15, vy - 0.12, vz - vlen * 0.35),
            (vx - 0.10, vy + 0.10, vz - vlen * 0.72),
            (vx + 0.05, vy, vz - vlen),
        ]
        add_tube_along_curve(bm_vines, v_pts, [0.14, 0.11, 0.08, 0.03], segs=5)
        # Glowing fairy lantern orb dangling at tip of front-facing vines!
        if vy < 0.0:
            bmesh.ops.create_icosphere(bm_glow, subdivisions=2, radius=0.22, matrix=Matrix.Translation((vx + 0.05, vy, vz - vlen - 0.16)))

    # Rich painterly vertex colors
    c_bark_hi = hex_rgba('#916642')
    c_bark_lo = hex_rgba('#4B2F1C')
    c_moss = hex_rgba('#468534')
    bark_vcol = lambda co, n: lerp_rgba(
        lerp_rgba(c_bark_lo, c_bark_hi, 0.32 + 0.68 * fbm_noise(co.x * 0.95, co.y * 0.95, co.z * 0.65)),
        c_moss, max(0.0, n.z - 0.42) * 0.92,
    )
    c_leaf_sun = hex_rgba('#A3DE45')
    c_leaf_mid = hex_rgba('#3B9A38')
    c_leaf_shd = hex_rgba('#194A24')
    canopy_vcol = lambda co, n: lerp_rgba(
        lerp_rgba(c_leaf_shd, c_leaf_mid, max(0.0, min(1.0, 0.42 + 0.58 * n.z))),
        c_leaf_sun,
        max(0.0, min(1.0, (co.z - 9.8) / 5.4 * 0.68 + max(0.0, n.z) * 0.42 + 0.18 * fbm_noise(co.x * 0.7, co.y * 0.7, co.z))),
    )
    c_rf_hi = hex_rgba('#35A857')
    c_rf_lo = hex_rgba('#1B5E31')
    roof_vcol = lambda co, n: lerp_rgba(c_rf_lo, c_rf_hi, max(0.0, min(1.0, 0.3 + 0.7 * max(0.0, n.z))))
    c_w_hi = hex_rgba('#B07848')
    c_w_lo = hex_rgba('#6B4223')
    wood_vcol = lambda co, n: lerp_rgba(c_w_lo, c_w_hi, 0.35 + 0.65 * fbm_noise(co.x * 1.3, co.y * 1.3, co.z))
    c_st_hi = hex_rgba('#A4A890')
    c_st_lo = hex_rgba('#5C6E4E')
    stone_vcol = lambda co, n: lerp_rgba(c_st_lo, c_st_hi, 0.35 + 0.65 * fbm_noise(co.x, co.y, co.z))

    finalize_part(bm_bark, 'Forest_Ancient_WorldTree', col, mats['forest_bark'], root, smooth=True, vcol_fn=bark_vcol)
    finalize_part(bm_wood, 'Forest_Elven_Timber', col, mats['forest_wood'], root, smooth=False, vcol_fn=wood_vcol)
    finalize_part(bm_stone, 'Forest_Mossy_StoneBase', col, mats['forest_stone'], root, smooth=False, vcol_fn=stone_vcol)
    finalize_part(bm_canopy, 'Forest_Canopy_Foliage', col, mats['forest_canopy'], root, smooth=True, vcol_fn=canopy_vcol)
    finalize_part(bm_roof, 'Forest_Leaf_Roofs', col, mats['forest_roof'], root, smooth=False, vcol_fn=roof_vcol)
    finalize_part(bm_vines, 'Forest_Hanging_Vines', col, mats['forest_vine'], root, smooth=True)
    finalize_part(bm_glow, 'Forest_Amber_Glow', col, mats['glow_forest'], root, smooth=True)
    finalize_part(bm_spore, 'Forest_Spirit_Lights', col, mats['glow_forest_spore'], root, smooth=True)
    finalize_part(bm_banner, 'Forest_Banners', col, mats['forest_banner'], root, smooth=False)
    finalize_part(bm_gold, 'Forest_Gold_Emblems', col, mats['gold'], root, smooth=False)
    return root


# ---------------------------------------------------------------------------
# 3. DEMON ARMY CASTLE (East, +X) — Gothic Obsidian Cathedral, Flying Buttresses & Mana Orrery
# ---------------------------------------------------------------------------

def add_obsidian_gothic_spire(bm_wall, bm_roof, bm_trim, bm_glow, x, y, base_z, r_base, h_shaft, h_needle, segs=6):
    """Fluted gothic obsidian spire with tiered crown gallery, flying spurs, and lancet tracery windows."""
    add_cylinder(bm_wall, (x, y, base_z), r_base * 1.18, r_base * 0.80, h_shaft, segs=segs, rot_z=math.pi / segs)
    # Vertical obsidian fin ribs along tower corners!
    for i in range(segs):
        a = 2.0 * math.pi * i / segs + math.pi / segs
        rx, ry = x + r_base * 0.96 * math.cos(a), y + r_base * 0.96 * math.sin(a)
        add_box(bm_trim, (rx, ry, base_z + h_shaft * 0.5), (0.24, 0.14, h_shaft * 0.96), rot_z=a)
    collar_z = base_z + h_shaft
    add_cylinder(bm_trim, (x, y, collar_z - 0.16), r_base * 0.86, r_base * 1.32, 0.56, segs=segs, rot_z=math.pi / segs)
    # Spiked gothic crown gallery pinnacles
    for i in range(segs):
        a = 2.0 * math.pi * i / segs + math.pi / segs
        sx, sy = x + r_base * 1.18 * math.cos(a), y + r_base * 1.18 * math.sin(a)
        add_cylinder(bm_roof, (sx, sy, collar_z + 0.36), 0.26, 0.02, 1.55, segs=4, rot_z=a)
    # Razor-sharp needle spire + metallic spire finial
    add_cylinder(bm_roof, (x, y, collar_z + 0.36), r_base * 0.95, 0.03, h_needle, segs=segs, rot_z=math.pi / segs)
    add_cylinder(bm_trim, (x, y, collar_z + 0.36 + h_needle - 0.15), 0.09, 0.015, 0.95, segs=4)
    # Framed gothic pointed lancet windows glowing amethyst
    for i in range(0, segs, 2):
        a = 2.0 * math.pi * i / segs
        add_framed_arched_window(
            bm_trim, bm_glow,
            (x + r_base * 0.92 * math.cos(a), y + r_base * 0.92 * math.sin(a), base_z + h_shaft * 0.60),
            rot_z=a + math.pi * 0.5, width=0.36, height=h_shaft * 0.42, pointed=True, mullions=True,
        )


def build_castle_demon(col, mats):
    root = make_castle_root('Castle_Demon_Root', 'demon', col)
    if try_import_tripo_castle('demon', col, mats, root):
        return root
    bm_wall = bmesh.new()
    bm_trim = bmesh.new()
    bm_roof = bmesh.new()
    bm_crys = bmesh.new()
    bm_core = bmesh.new()
    bm_glow = bmesh.new()
    bm_banner = bmesh.new()

    # 1. Angular Hexagonal Obsidian Crag Base + Glowing Arcane Sigil Circle on Forecourt!
    add_cylinder(bm_wall, (0.0, 0.2, -1.9), 7.4, 6.5, 1.95, segs=6, rot_z=math.pi / 6)
    # Glowing arcane summoning ring inlaid in forecourt right before the gothic gate
    sig_pts = [(1.65 * math.cos(2 * math.pi * s / 24), -5.85 + 1.65 * math.sin(2 * math.pi * s / 24), 0.07) for s in range(25)]
    add_tube_along_curve(bm_glow, sig_pts, [0.06] * len(sig_pts), segs=5, cap_start=False, cap_end=False)

    # 2. Spiked Angular Bastion Curtain Walls + Vertical Obsidian Buttresses
    wall_h = 3.55
    wall_segs = [
        ((-5.25, -3.3), (-2.25, -4.35)),
        ((2.25, -4.35), (5.25, -3.3)),
        ((-5.55, -3.1), (-5.85, 2.8)),
        ((5.55, -3.1), (5.85, 2.8)),
        ((-5.55, 2.9), (0.0, 5.25)),
        ((0.0, 5.25), (5.55, 2.9)),
    ]
    for p0, p1 in wall_segs:
        v0, v1 = Vector((p0[0], p0[1], 0.0)), Vector((p1[0], p1[1], 0.0))
        mid = (v0 + v1) * 0.5
        length = (v1 - v0).length
        ang = math.atan2(v1.y - v0.y, v1.x - v0.x)
        add_box(bm_wall, (mid.x, mid.y, wall_h * 0.5), (length, 0.98, wall_h), rot_z=ang)
        add_box(bm_trim, (mid.x, mid.y, wall_h + 0.10), (length + 0.12, 1.18, 0.24), rot_z=ang)
        n_sp = max(3, int(length / 0.95))
        for k in range(n_sp):
            t = (k + 0.5) / n_sp
            sp = v0.lerp(v1, t)
            add_cylinder(bm_roof, (sp.x, sp.y, wall_h + 0.22), 0.24, 0.02, 1.05, segs=4, rot_z=ang)

    # 3. Ornate Gothic Thorn Gatehouse (sleek spiked archway framing the Giant Mana Crystal!)
    add_box(bm_wall, (0.0, -4.3, 2.25), (4.2, 1.80, 4.5))
    add_box(bm_trim, (0.0, -4.3, 4.55), (4.48, 2.02, 0.28))
    add_cylinder(bm_roof, (0.0, -4.45, 4.68), 1.42, 0.04, 2.85, segs=4, rot_z=math.pi / 4)
    for sx in (-1.0, 1.0):
        add_cylinder(bm_roof, (sx * 2.0, -4.45, 4.68), 0.58, 0.03, 2.45, segs=4, rot_z=math.pi / 4)
    # Glowing intense violet gothic portal + pointed arch voussoirs + obsidian wrought-iron bars
    add_box(bm_glow, (0.0, -5.22, 1.55), (1.76, 0.14, 2.75))
    add_cylinder(bm_glow, (0.0, -5.22, 2.88), 0.88, 0.04, 0.98, segs=4, rot_z=math.pi / 4)
    for gx in (-0.52, 0.0, 0.52):
        add_box(bm_trim, (gx, -5.30, 1.80), (0.09, 0.10, 2.80))
    for gz in (1.30, 2.25):
        add_box(bm_trim, (0.0, -5.30, gz), (1.78, 0.10, 0.09))
    # Sweeping obsidian blade horns flanking the gothic gate (smooth Catmull-Rom curve!)
    for sx in (-1.0, 1.0):
        bp, br = sample_catmull_rom(
            [(sx * 1.98, -5.18, 0.0), (sx * 2.45, -5.30, 2.6), (sx * 2.12, -5.18, 5.0), (sx * 1.48, -5.00, 6.75)],
            [0.48, 0.36, 0.24, 0.04], samples_per_seg=4,
        )
        add_tube_along_curve(bm_roof, bp, br, segs=6)
        add_banner(bm_banner, (sx * 3.75, -4.18, 3.25), width=0.98, height=2.45, rot_z=sx * -0.25, swallowtail=True)

    # 4. Five Asymmetric Fluted Gothic Obsidian Needle Spires!
    spire_specs = [
        (-5.30, -3.15, 0.0, 1.28, 5.35, 4.65),
        (5.30, -3.15, 0.0, 1.36, 5.95, 5.05),
        (-5.60, 2.75, 0.0, 1.42, 6.55, 5.45),
        (5.60, 2.75, 0.0, 1.32, 5.75, 4.85),
        (0.0, 5.00, 0.0, 1.58, 7.80, 6.05),
    ]
    for sx, sy, sz, sr, sh, sn in spire_specs:
        add_obsidian_gothic_spire(bm_wall, bm_roof, bm_trim, bm_glow, sx, sy, sz, sr, sh, sn, segs=6)

    # 5. Central Dark Cathedral Sanctum + 6 Sweeping Gothic Flying Buttresses!
    add_cylinder(bm_wall, (0.0, 0.5, 0.0), 3.72, 3.22, 6.95, segs=6, rot_z=math.pi / 6)
    add_cylinder(bm_trim, (0.0, 0.5, 6.80), 3.32, 3.65, 0.46, segs=6, rot_z=math.pi / 6)
    for wi in range(6):
        a = wi * (math.pi / 3.0)
        add_framed_arched_window(
            bm_trim, bm_glow,
            (3.36 * math.cos(a), 0.5 + 3.36 * math.sin(a), 4.35),
            rot_z=a + math.pi * 0.5, width=0.68, height=2.45, pointed=True, mullions=True,
        )
        # True 3D Gothic Flying Buttress arching from outer obsidian pier up to central sanctum!
        if wi not in (4,):  # leave front gatehouse clear
            ba = a + math.pi / 6.0
            p_out = (5.05 * math.cos(ba), 0.5 + 5.05 * math.sin(ba))
            p_in = (3.25 * math.cos(ba), 0.5 + 3.25 * math.sin(ba))
            add_gothic_flying_buttress(bm_wall, bm_roof, p_out, p_in, 0.0, 4.65, 6.45)

    # 6. Six Clawed Obsidian Ritual Arches Cradling the Giant Doubly-Terminated Mana Crystal!
    for i in range(6):
        a = math.radians(30 + 60 * i)
        ca, sa = math.cos(a), math.sin(a)
        cp, cr = sample_catmull_rom(
            [(ca * 3.25, 0.5 + sa * 3.25, 6.9), (ca * 3.72, 0.5 + sa * 3.72, 9.4),
             (ca * 2.55, 0.5 + sa * 2.55, 11.8), (ca * 1.48, 0.5 + sa * 1.48, 13.1)],
            [0.54, 0.42, 0.26, 0.06], samples_per_seg=4,
        )
        add_tube_along_curve(bm_roof, cp, cr, segs=6)

    # HERO CENTERPIECE: Layered Translucent Amethyst Outer Shell + Intense Magenta Glowing Inner Core!
    add_cylinder(bm_crys, (0.0, 0.5, 10.65), 1.52, 0.04, 3.45, segs=6)
    add_cylinder(bm_crys, (0.0, 0.5, 8.15), 0.05, 1.52, 2.50, segs=6)
    add_cylinder(bm_core, (0.0, 0.5, 10.65), 0.85, 0.03, 2.15, segs=6)
    add_cylinder(bm_core, (0.0, 0.5, 9.05), 0.03, 0.85, 1.60, segs=6)

    # Two Counter-Tilted Metallic-Violet & Glowing Arcane Orrery Rings!
    for tilt, rad, bm_ring, thick in ((0.36, 2.58, bm_glow, 0.11), (-0.42, 2.95, bm_trim, 0.10)):
        r_pts = []
        for s in range(33):
            a = 2.0 * math.pi * s / 32
            r_pts.append((rad * math.cos(a), 0.5 + rad * math.sin(a) * math.cos(tilt), 11.15 + rad * math.sin(a) * math.sin(tilt)))
        add_tube_along_curve(bm_ring, r_pts, [thick] * len(r_pts), segs=6, cap_start=False, cap_end=False)

    # 8 Orbiting Faceted Crystal Shards hovering around the Ritual Cradle!
    for i in range(8):
        a = 2.0 * math.pi * i / 8.0
        ox = 3.15 * math.cos(a)
        oy = 0.5 + 3.15 * math.sin(a)
        oz = 10.6 + 0.85 * math.sin(i * 1.7)
        add_cylinder(bm_crys, (ox, oy, oz), 0.24, 0.02, 0.92, segs=5)
        add_cylinder(bm_crys, (ox, oy, oz - 0.52), 0.02, 0.24, 0.52, segs=5)

    # Natural Clustered Obsidian-Base Amethyst Geode Outcrops around fortress base!
    geode_locs = [
        (-3.6, -4.75, 0.0), (3.6, -4.75, 0.0), (-6.35, -0.4, 0.0),
        (6.35, -0.2, 0.0), (-3.4, 4.55, 0.0), (3.4, 4.55, 0.0),
    ]
    for gx, gy, gz in geode_locs:
        add_cylinder(bm_wall, (gx, gy, gz - 0.2), 0.95, 0.65, 0.65, segs=6)
        for dx, dy, ch, cr, tx, ty in (
            (0.0, 0.0, 2.15, 0.42, 0.16, -0.14),
            (0.38, -0.18, 1.45, 0.28, -0.28, -0.22),
            (-0.34, 0.24, 1.25, 0.25, 0.34, 0.18),
        ):
            m = Matrix.Translation((gx + dx, gy + dy, gz + ch * 0.42)) @ Matrix.Rotation(tx, 4, 'Y') @ Matrix.Rotation(ty, 4, 'X')
            bmesh.ops.create_cone(bm_crys, cap_ends=True, cap_tris=False, segments=5, radius1=cr, radius2=0.02, depth=ch, matrix=m)

    c_obs_hi = hex_rgba('#433663')
    c_obs_lo = hex_rgba('#171126')
    obs_vcol = lambda co, n: lerp_rgba(
        c_obs_lo, c_obs_hi,
        min(1.0, max(0.0, 0.28 + 0.50 * (co.z / 10.5) + 0.24 * fbm_noise(co.x * 1.2, co.y * 1.2, co.z))),
    )

    finalize_part(bm_wall, 'Demon_Obsidian_Citadel', col, mats['demon_obsidian'], root, smooth=False, vcol_fn=obs_vcol)
    finalize_part(bm_trim, 'Demon_VioletIron_Trim', col, mats['demon_trim'], root, smooth=False)
    finalize_part(bm_roof, 'Demon_Gothic_Spires', col, mats['demon_roof'], root, smooth=False)
    finalize_part(bm_crys, 'Demon_Mana_Crystals', col, mats['demon_crystal'], root, smooth=False)
    finalize_part(bm_core, 'Demon_Crystal_Core', col, mats['glow_demon_core'], root, smooth=False)
    finalize_part(bm_glow, 'Demon_Arcane_Glow', col, mats['glow_demon'], root, smooth=False)
    finalize_part(bm_banner, 'Demon_Banners', col, mats['demon_banner'], root, smooth=False)
    return root


# ---------------------------------------------------------------------------
# 4. DRAGON EMPIRE CASTLE (South, -Y) — Volcanic Basalt, Annulated Dragon Horns, 3D Skull Gate & Fire
# ---------------------------------------------------------------------------

def build_castle_dragon(col, mats):
    root = make_castle_root('Castle_Dragon_Root', 'dragon', col)
    if try_import_tripo_castle('dragon', col, mats, root):
        return root
    bm_wall = bmesh.new()
    bm_red = bmesh.new()
    bm_roof = bmesh.new()
    bm_horn = bmesh.new()
    bm_iron = bmesh.new()
    bm_bronze = bmesh.new()
    bm_flame_out = bmesh.new()
    bm_flame_core = bmesh.new()
    bm_lava = bmesh.new()
    bm_banner = bmesh.new()

    # 1. Heavy Battered Volcanic Basalt Fortress Plinth + Glowing Magma Fissure Channels!
    add_cylinder(bm_wall, (0.0, 0.3, -1.9), 7.8, 6.8, 1.95, segs=8, rot_z=math.pi / 8)
    lava_veins = [
        [(-4.1, -5.2, 0.08), (-5.6, -4.0, 0.14), (-6.6, -2.2, -0.04)],
        [(4.1, -5.2, 0.08), (5.6, -4.0, 0.14), (6.6, -2.2, -0.04)],
        [(-6.4, 1.2, 0.08), (-5.8, 3.2, 0.12), (-4.9, 5.0, -0.04)],
        [(6.4, 1.2, 0.08), (5.8, 3.2, 0.12), (4.9, 5.0, -0.04)],
    ]
    for pts in lava_veins:
        lp, lr = sample_catmull_rom(pts, [0.24, 0.42, 0.20], samples_per_seg=3)
        add_tube_along_curve(bm_lava, lp, lr, segs=6)

    # 2. Heavy Fortified Basalt Curtain Walls + Battered Buttresses + Riveted Iron Armor Bands
    wall_h = 3.55
    add_box(bm_wall, (-4.1, -3.9, wall_h * 0.5), (3.65, 1.25, wall_h))
    add_box(bm_wall, (4.1, -3.9, wall_h * 0.5), (3.65, 1.25, wall_h))
    add_box(bm_wall, (-5.75, 0.2, wall_h * 0.5), (1.25, 8.2, wall_h))
    add_box(bm_wall, (5.75, 0.2, wall_h * 0.5), (1.25, 8.2, wall_h))
    add_box(bm_wall, (0.0, 4.25, wall_h * 0.5), (11.6, 1.25, wall_h))

    # Battered volcanic buttresses & bronze-riveted iron armor bands!
    for by in (-1.6, 0.5, 2.6):
        for sx in (-1.0, 1.0):
            add_box(bm_wall, (sx * 6.45, by, 1.35), (0.65, 0.72, 2.75), rot_y=sx * 0.14)
            add_box(bm_iron, (sx * 6.45, by, 1.85), (0.72, 0.80, 0.24), rot_y=sx * 0.14)
    for bx in (-3.2, -1.1, 1.1, 3.2):
        add_box(bm_wall, (bx, 4.95, 1.35), (0.72, 0.65, 2.75), rot_x=-0.14)
        add_box(bm_iron, (bx, 4.95, 1.85), (0.80, 0.72, 0.24), rot_x=-0.14)

    # Crimson stone stringcourse & forged-iron wall ribs
    add_box(bm_red, (-4.1, -3.9, wall_h - 0.12), (3.78, 1.38, 0.44))
    add_box(bm_red, (4.1, -3.9, wall_h - 0.12), (3.78, 1.38, 0.44))
    add_box(bm_red, (-5.75, 0.2, wall_h - 0.12), (1.38, 8.3, 0.44))
    add_box(bm_red, (5.75, 0.2, wall_h - 0.12), (1.38, 8.3, 0.44))
    add_box(bm_red, (0.0, 4.25, wall_h - 0.12), (11.7, 1.38, 0.44))

    add_crenellations_line(bm_wall, bm_red, (-5.2, -4.18), (-2.8, -4.18), wall_h + 0.12, merlon_w=0.62, merlon_d=0.55, merlon_h=0.62, machicolations=True)
    add_crenellations_line(bm_wall, bm_red, (2.8, -4.18), (5.2, -4.18), wall_h + 0.12, merlon_w=0.62, merlon_d=0.55, merlon_h=0.62, machicolations=True)
    add_crenellations_line(bm_wall, bm_red, (-5.92, -3.2), (-5.92, 3.6), wall_h + 0.12, merlon_w=0.62, merlon_d=0.55, merlon_h=0.62, machicolations=True)
    add_crenellations_line(bm_wall, bm_red, (5.92, -3.2), (5.92, 3.6), wall_h + 0.12, merlon_w=0.62, merlon_d=0.55, merlon_h=0.62, machicolations=True)
    add_crenellations_line(bm_wall, bm_red, (-5.1, 4.42), (5.1, 4.42), wall_h + 0.12, merlon_w=0.62, merlon_d=0.55, merlon_h=0.62, machicolations=True)

    # 3. HERO DRAGON-MAW FURNACE GATEHOUSE + SCULPTED 3D ARMORED DRAGON SKULL CREST!
    add_box(bm_wall, (0.0, -4.15, 2.55), (5.3, 2.15, 5.1))
    add_box(bm_red, (0.0, -4.15, 5.12), (5.65, 2.38, 0.48))
    add_box(bm_bronze, (0.0, -5.24, 3.12), (3.15, 0.38, 0.24))
    # Layered Furnace Hearth Glow (outer orange-red + inner golden-yellow core) + Forged-Iron Portcullis + Bone Fangs!
    add_box(bm_flame_out, (0.0, -5.18, 1.48), (2.30, 0.14, 2.75))
    add_box(bm_flame_core, (0.0, -5.22, 1.25), (1.45, 0.10, 1.95))
    for gx in (-0.72, -0.24, 0.24, 0.72):
        add_box(bm_iron, (gx, -5.28, 1.40), (0.11, 0.12, 2.60))
    for gz in (1.15, 1.95):
        add_box(bm_iron, (0.0, -5.28, gz), (2.30, 0.12, 0.11))
    # Row of curved ivory dragon fangs hanging across top of gate maw!
    for fx, fz_len in ((-0.92, 0.65), (-0.42, 0.48), (0.42, 0.48), (0.92, 0.65)):
        add_cylinder(bm_horn, (fx, -5.32, 2.85 - fz_len), 0.025, 0.15, fz_len, segs=6)

    # Sculpted 3D Dragon Skull / Armored Head Crest directly over the gatehouse!
    add_box(bm_red, (0.0, -5.24, 4.18), (1.95, 0.24, 1.72))
    add_box(bm_bronze, (0.0, -5.28, 4.18), (2.08, 0.14, 1.84))
    # Cranium, brow armor ridges, tapered dragon snout, cheek-plates
    add_box(bm_horn, (0.0, -5.42, 4.42), (1.12, 0.48, 0.62))
    add_cylinder(bm_horn, (0.0, -5.58, 3.48), 0.22, 0.48, 0.85, segs=6)  # sculpted snout
    add_box(bm_horn, (0.0, -5.62, 4.62), (1.28, 0.36, 0.24))             # fierce brow ridge
    for sx in (-1.0, 1.0):
        # Blazing golden-yellow dragon eyes recessed under brow!
        bmesh.ops.create_icosphere(bm_flame_core, subdivisions=2, radius=0.16, matrix=Matrix.Translation((sx * 0.34, -5.66, 4.38)))
        # Sweeping sculpted crest horns & cheek spikes on dragon skull
        add_ribbed_horn(bm_horn, [
            (sx * 0.42, -5.42, 4.65), (sx * 0.92, -5.46, 5.18), (sx * 1.22, -5.25, 5.95),
        ], [0.20, 0.13, 0.03], segs=8, ridge_amp=0.10, ridge_freq=10.0)
        add_cylinder(bm_horn, (sx * 0.65, -5.42, 3.92), 0.14, 0.02, 0.52, segs=5, rot_z=sx * 0.6)

    # Bold Crimson War Banners with Bronze Dragon-Claw Emblems
    for sx in (-1.0, 1.0):
        add_banner(bm_banner, (sx * 4.1, -4.68, 3.40), width=1.10, height=2.35, rot_z=0.0, swallowtail=True)
        add_box(bm_bronze, (sx * 4.1, -4.76, 2.52), (0.42, 0.06, 0.62))
        add_box(bm_bronze, (sx * 4.1, -4.74, 3.42), (1.22, 0.10, 0.10))

    # 4. THREE PAIRS OF HIGH-DETAIL ANNULATED (RING-RIBBED!) CURVED IVORY DRAGON HORNS!
    for sx in (-1.0, 1.0):
        # Pair A: Huge swept tusks curving up around Front Gatehouse!
        add_ribbed_horn(bm_horn, [
            (sx * 3.22, -4.98, 0.0),
            (sx * 3.85, -5.42, 2.0),
            (sx * 3.72, -5.32, 4.1),
            (sx * 3.00, -5.00, 5.9),
            (sx * 2.15, -4.65, 7.25),
        ], [0.72, 0.58, 0.42, 0.24, 0.045], segs=12, ridge_amp=0.10, ridge_freq=22.0)
        # Bronze armored collar cuff gripping tusk base
        add_cylinder(bm_bronze, (sx * 3.30, -5.06, 0.35), 0.80, 0.74, 0.52, segs=10)

        # Pair B: COLOSSAL Crown Dragon Horns soaring majestically from Central War Keep!
        add_ribbed_horn(bm_horn, [
            (sx * 2.45, 1.2, 5.8),
            (sx * 4.55, 1.5, 7.5),
            (sx * 5.75, 1.3, 9.7),
            (sx * 5.20, 0.9, 11.6),
            (sx * 3.85, 0.6, 12.9),
        ], [0.98, 0.78, 0.55, 0.32, 0.055], segs=14, ridge_amp=0.11, ridge_freq=26.0)
        add_cylinder(bm_bronze, (sx * 2.85, 1.28, 5.85), 1.04, 0.96, 0.52, segs=10)

        # Pair C: Fierce Rear Spine Horns framing back silhouette!
        add_ribbed_horn(bm_horn, [
            (sx * 1.95, 2.85, 5.2),
            (sx * 3.55, 3.85, 7.1),
            (sx * 3.95, 4.45, 9.05),
            (sx * 3.10, 4.65, 10.5),
        ], [0.64, 0.48, 0.28, 0.045], segs=10, ridge_amp=0.10, ridge_freq=18.0)

    # 5. Four Heavy Iron-Banded War Bastion Towers + Multi-Layered Roaring Fire Braziers!
    war_towers = [
        (-5.75, -3.75, 5.3),
        (5.75, -3.75, 5.3),
        (-5.75, 4.05, 5.9),
        (5.75, 4.05, 5.9),
    ]
    for tx, ty, th in war_towers:
        add_cylinder(bm_wall, (tx, ty, -0.5), 1.72, 1.46, th + 0.5, segs=8, rot_z=math.pi / 8)
        add_cylinder(bm_iron, (tx, ty, th * 0.42), 1.64, 1.62, 0.34, segs=8, rot_z=math.pi / 8)
        add_cylinder(bm_bronze, (tx, ty, th * 0.42 + 0.34), 1.65, 1.65, 0.10, segs=8, rot_z=math.pi / 8)
        add_cylinder(bm_red, (tx, ty, th - 0.16), 1.62, 1.72, 0.46, segs=8, rot_z=math.pi / 8)
        add_crenellations_ring(bm_wall, bm_red, tx, ty, th + 0.26, 1.54, count=8, merlon_w=0.46, merlon_d=0.35, merlon_h=0.54, machicolations=True)
        add_layered_brazier(bm_iron, bm_flame_out, bm_flame_core, (tx, ty, th + 0.26), scale=1.28)
        wy_dir = -1.0 if ty < 0 else 1.0
        wx_dir = -1.0 if tx < 0 else 1.0
        add_framed_arched_window(bm_iron, bm_flame_out, (tx, ty + wy_dir * 1.48, th * 0.65), rot_z=0.0 if wy_dir < 0 else math.pi, width=0.42, height=1.08, pointed=False, mullions=True)
        add_framed_arched_window(bm_iron, bm_flame_out, (tx + wx_dir * 1.48, ty, th * 0.65), rot_z=wx_dir * math.pi * 0.5, width=0.42, height=1.08, pointed=False, mullions=True)

    # Flanking gatehouse fire braziers
    for sx in (-1.0, 1.0):
        add_layered_brazier(bm_iron, bm_flame_out, bm_flame_core, (sx * 2.18, -4.48, 5.32), scale=1.08)

    # 6. Broad Fortified Inner Volcanic Citadel Keep + Eternal Flame Cauldron + War Standard!
    add_box(bm_wall, (0.0, 0.9, 3.05), (8.3, 5.7, 6.1))
    add_box(bm_red, (0.0, 0.9, 6.08), (8.68, 6.08, 0.44))
    add_pitched_roof(bm_roof, (0.0, 0.9, 6.28), 8.3, 5.7, 2.30, overhang=0.38)
    add_box(bm_bronze, (0.0, 0.9, 8.60), (5.8, 0.16, 0.24))

    add_cylinder(bm_wall, (0.0, 1.1, 6.0), 2.62, 2.22, 3.7, segs=8, rot_z=math.pi / 8)
    add_cylinder(bm_iron, (0.0, 1.1, 7.75), 2.48, 2.45, 0.28, segs=8, rot_z=math.pi / 8)
    add_cylinder(bm_red, (0.0, 1.1, 9.55), 2.40, 2.58, 0.46, segs=8, rot_z=math.pi / 8)
    add_crenellations_ring(bm_wall, bm_red, 0.0, 1.1, 9.96, 2.38, count=8, merlon_w=0.56, merlon_d=0.38, merlon_h=0.58, machicolations=True)
    add_layered_brazier(bm_iron, bm_flame_out, bm_flame_core, (0.0, 1.1, 9.96), scale=1.92)
    add_cylinder(bm_iron, (0.0, 2.45, 9.9), 0.11, 0.05, 3.0, segs=6)
    add_flag_pennant(bm_banner, (0.0, 2.45, 12.82), length=2.25, height=0.92, rot_z=0.32)

    for wx in (-2.55, -1.0, 1.0, 2.55):
        add_framed_arched_window(bm_iron, bm_flame_out, (wx, -1.96, 4.45), rot_z=0.0, width=0.52, height=1.28, pointed=False, mullions=True)
        add_framed_arched_window(bm_iron, bm_flame_out, (wx, 3.76, 4.45), rot_z=math.pi, width=0.52, height=1.28, pointed=False, mullions=True)

    c_bas_hi = hex_rgba('#5A3D36')
    c_bas_lo = hex_rgba('#251817')
    bas_vcol = lambda co, n: lerp_rgba(
        c_bas_lo, c_bas_hi,
        min(1.0, max(0.0, 0.34 + 0.44 * (co.z / 9.2) + 0.24 * fbm_noise(co.x * 1.1, co.y * 1.1, co.z))),
    )
    c_bone_tip = hex_rgba('#F6E9CC')
    c_bone_base = hex_rgba('#6B4F39')
    horn_vcol = lambda co, n: lerp_rgba(
        c_bone_base, c_bone_tip,
        min(1.0, max(0.0, (co.z - 0.4) / 8.5 + 0.25 + 0.12 * fbm_noise(co.x * 2.0, co.y * 2.0, co.z * 2.0))),
    )

    finalize_part(bm_wall, 'Dragon_Basalt_Fortress', col, mats['dragon_basalt'], root, smooth=False, vcol_fn=bas_vcol)
    finalize_part(bm_red, 'Dragon_Crimson_Stone', col, mats['dragon_redstone'], root, smooth=False)
    finalize_part(bm_roof, 'Dragon_Fortress_Roofs', col, mats['dragon_roof'], root, smooth=False)
    finalize_part(bm_horn, 'Dragon_Bone_Horns_Skull', col, mats['dragon_horn'], root, smooth=True, vcol_fn=horn_vcol)
    finalize_part(bm_iron, 'Dragon_Iron_Braziers', col, mats['iron_dark'], root, smooth=False)
    finalize_part(bm_bronze, 'Dragon_Bronze_Trim', col, mats['dragon_bronze'], root, smooth=False)
    finalize_part(bm_flame_out, 'Dragon_Roaring_Flames', col, mats['glow_dragon'], root, smooth=True)
    finalize_part(bm_flame_core, 'Dragon_Flame_Cores', col, mats['glow_dragon_core'], root, smooth=True)
    finalize_part(bm_lava, 'Dragon_Magma_Veins', col, mats['lava'], root, smooth=True)
    finalize_part(bm_banner, 'Dragon_Crimson_Banners', col, mats['dragon_banner'], root, smooth=False)
    return root
