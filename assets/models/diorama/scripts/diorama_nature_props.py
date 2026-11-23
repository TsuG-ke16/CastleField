"""AAA-Detailed Biome Nature (trees, flowers, geodes, basalt columns, hanging cliff vines) & Props builders."""

import math
import random
import bpy
import bmesh
from mathutils import Vector, Matrix

from diorama_materials import (
    hex_rgba,
    lerp_rgba,
    fbm_noise,
    paint_vertex_colors,
    mesh_from_bmesh,
)
from diorama_terrain import (
    LAYOUT,
    island_outer_radius,
    terrain_height,
    faction_weights,
)
from diorama_arch_kit import add_tube_along_curve, sample_catmull_rom


def is_clear_for_nature(x, y, margin=0.0):
    r = math.hypot(x, y)
    th = math.atan2(y, x)
    rim_r = island_outer_radius(th)
    if r < 12.7 + margin or r > rim_r - (1.1 + margin):
        return False

    d_diag = abs(abs(x) - abs(y)) / math.sqrt(2.0)
    if d_diag < 3.45 + margin:
        return False

    for name, cfg in LAYOUT['castles'].items():
        dx, dy = cfg['dir']
        along = x * dx + y * dy
        perp = abs(-x * dy + y * dx)
        # Keep clear of Tripo castle footprints & approach staircase sightlines!
        if 11.5 <= along <= 18.8 and perp < 4.65 + margin:
            return False
        if 16.0 <= along <= 30.8 and perp < 8.0 + margin:
            return False
    return True


def add_faceted_rock(bm, pos, radius, scale_xyz=(1.0, 1.0, 0.72), rot_z=0.0, seed=0.0):
    m = (
        Matrix.Translation(pos)
        @ Matrix.Rotation(rot_z, 4, 'Z')
        @ Matrix.Diagonal((scale_xyz[0] * radius, scale_xyz[1] * radius, scale_xyz[2] * radius, 1.0))
    )
    ret = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0, matrix=m)
    for v in ret['verts']:
        nv = (fbm_noise(v.co.x * 0.85 + seed, v.co.y * 0.85 - seed, v.co.z * 0.95) - 0.5) * 0.42 * radius
        v.co += Vector((nv, nv * 0.72, nv * 0.48))


def add_broadleaf_tree(bm_trunk, bm_fol, pos, scale=1.0, rot_z=0.0):
    """Multi-lobe smooth organic stylized broadleaf tree with flared root trunk."""
    x, y, z = pos
    th = 1.75 * scale
    # Flared trunk + subtle lean
    bmesh.ops.create_cone(
        bm_trunk, cap_ends=True, cap_tris=False, segments=8,
        radius1=0.34 * scale, radius2=0.14 * scale, depth=th,
        matrix=Matrix.Translation((x, y, z + th * 0.44)) @ Matrix.Rotation(rot_z, 4, 'Z') @ Matrix.Rotation(0.06, 4, 'Y'),
    )
    # 6 overlapping sculpted smooth leafy clusters
    blobs = [
        (0.0, 0.0, th + 0.98 * scale, 1.05 * scale, 1.02 * scale, 0.85 * scale),
        (0.62 * scale, 0.25 * scale, th + 0.55 * scale, 0.78 * scale, 0.74 * scale, 0.62 * scale),
        (-0.58 * scale, -0.28 * scale, th + 0.58 * scale, 0.80 * scale, 0.76 * scale, 0.64 * scale),
        (-0.22 * scale, 0.60 * scale, th + 0.62 * scale, 0.72 * scale, 0.70 * scale, 0.58 * scale),
        (0.28 * scale, -0.58 * scale, th + 0.52 * scale, 0.70 * scale, 0.68 * scale, 0.56 * scale),
        (0.08 * scale, 0.06 * scale, th + 1.48 * scale, 0.74 * scale, 0.72 * scale, 0.58 * scale),
    ]
    rm = Matrix.Rotation(rot_z, 4, 'Z')
    for bx, by, bz, rx, ry, rz in blobs:
        off = rm @ Vector((bx, by, 0.0))
        ret = bmesh.ops.create_icosphere(
            bm_fol, subdivisions=2, radius=1.0,
            matrix=Matrix.Translation((x + off.x, y + off.y, z + bz)) @ Matrix.Diagonal((rx, ry, rz, 1.0)),
        )
        for v in ret['verts']:
            nv = (fbm_noise(v.co.x * 1.25, v.co.y * 1.25, v.co.z * 1.25) - 0.5) * 0.22 * scale
            v.co += Vector((nv, nv * 0.8, nv * 0.55))


def add_pine_tree(bm_trunk, bm_pine, pos, scale=1.0):
    """4-tier sculpted fantasy conifer tree."""
    x, y, z = pos
    bmesh.ops.create_cone(
        bm_trunk, cap_ends=True, cap_tris=False, segments=7,
        radius1=0.25 * scale, radius2=0.10 * scale, depth=1.35 * scale,
        matrix=Matrix.Translation((x, y, z + 0.52 * scale)),
    )
    tiers = [
        (1.00, 1.32, 1.38),
        (1.75, 1.06, 1.28),
        (2.45, 0.80, 1.18),
        (3.08, 0.52, 1.05),
    ]
    for idx, (tz, rad, h) in enumerate(tiers):
        bmesh.ops.create_cone(
            bm_pine, cap_ends=True, cap_tris=False, segments=9,
            radius1=rad * scale, radius2=0.04 * scale, depth=h * scale,
            matrix=Matrix.Translation((x, y, z + tz * scale)) @ Matrix.Rotation(idx * 0.35, 4, 'Z'),
        )


def add_flowering_bush(bm_fol, bm_flower, pos, scale=1.0):
    x, y, z = pos
    for ox, oy, oz, r in ((0.0, 0.0, 0.32, 0.58), (0.35, 0.20, 0.24, 0.42), (-0.32, -0.18, 0.26, 0.44)):
        bmesh.ops.create_icosphere(
            bm_fol, subdivisions=1, radius=r * scale,
            matrix=Matrix.Translation((x + ox * scale, y + oy * scale, z + oz * scale)) @ Matrix.Diagonal((1.0, 1.0, 0.78, 1.0)),
        )
    # Tiny bright sunlit blossom pips dotted on bush crown
    for fx, fy, fz in ((0.18, 0.22, 0.68), (-0.22, 0.14, 0.62), (0.04, -0.26, 0.58), (0.38, -0.05, 0.50)):
        bmesh.ops.create_icosphere(
            bm_flower, subdivisions=1, radius=0.11 * scale,
            matrix=Matrix.Translation((x + fx * scale, y + fy * scale, z + fz * scale)),
        )


def add_crystal_geode(bm_rock, bm_crys, pos, scale=1.0, rot_z=0.0):
    """Natural obsidian rock cluster erupting with varied angled amethyst crystal shards."""
    x, y, z = pos
    add_faceted_rock(bm_rock, (x, y, z + 0.18 * scale), radius=0.82 * scale, scale_xyz=(1.1, 0.95, 0.65), rot_z=rot_z, seed=x + y)
    rm = Matrix.Rotation(rot_z, 4, 'Z')
    shards = [
        (0.0, 0.0, 0.34, 1.75, 0.14, -0.12),
        (0.32, -0.16, 0.24, 1.25, -0.32, -0.20),
        (-0.28, 0.22, 0.22, 1.05, 0.36, 0.24),
        (0.12, 0.30, 0.17, 0.82, -0.18, 0.35),
    ]
    for sx, sy, cr, ch, rx, ry in shards:
        off = rm @ Vector((sx * scale, sy * scale, 0.0))
        m = Matrix.Translation((x + off.x, y + off.y, z + (0.20 + ch * 0.42) * scale)) @ Matrix.Rotation(rx, 4, 'Y') @ Matrix.Rotation(ry, 4, 'X')
        bmesh.ops.create_cone(bm_crys, cap_ends=True, cap_tris=False, segments=5, radius1=cr * scale, radius2=0.02, depth=ch * scale, matrix=m)


def add_twisted_demon_tree(bm_bark, bm_crys, pos, scale=1.0, rot_z=0.0):
    """Sinuous, gnarled crooked dark shadow-tree built with curved Catmull-Rom limbs & crystal buds."""
    x, y, z = pos
    rm = Matrix.Rotation(rot_z, 4, 'Z')
    # Crooked sinuous trunk
    tr_ctrl = [
        (0.0, 0.0, -0.1),
        (0.24 * scale, 0.08 * scale, 0.85 * scale),
        (-0.18 * scale, 0.22 * scale, 1.75 * scale),
        (0.12 * scale, -0.10 * scale, 2.45 * scale),
    ]
    tr_w = [Vector((x, y, z)) + (rm @ Vector(p)) for p in tr_ctrl]
    tp, tr = sample_catmull_rom(tr_w, [0.36 * scale, 0.25 * scale, 0.17 * scale, 0.08 * scale], samples_per_seg=3)
    add_tube_along_curve(bm_bark, tp, tr, segs=7)

    # 3 Curved gnarled twisting limbs branching organically off the trunk!
    limbs = [
        (0.2, [(0.05, 0.05, 1.65), (0.65, 0.35, 2.25), (1.18, 0.15, 2.75), (1.05, -0.22, 3.10)]),
        (2.4, [(-0.08, 0.10, 1.85), (-0.68, 0.42, 2.40), (-1.15, 0.18, 2.85), (-0.98, -0.20, 3.20)]),
        (4.5, [(0.08, -0.05, 2.05), (0.35, -0.68, 2.55), (0.12, -1.10, 2.95), (-0.18, -0.95, 3.30)]),
    ]
    for _, pts in limbs:
        lw = [Vector((x, y, z)) + (rm @ (Vector(p) * scale)) for p in pts]
        lp, lr = sample_catmull_rom(lw, [0.15 * scale, 0.10 * scale, 0.06 * scale, 0.02 * scale], samples_per_seg=3)
        add_tube_along_curve(bm_bark, lp, lr, segs=6)

    # Small glowing violet mana-crystal buds at root & crook!
    bmesh.ops.create_cone(
        bm_crys, cap_ends=True, cap_tris=False, segments=5,
        radius1=0.20 * scale, radius2=0.02, depth=0.82 * scale,
        matrix=Matrix.Translation((x + 0.34 * scale, y, z + 0.32 * scale)) @ Matrix.Rotation(0.28, 4, 'Y'),
    )
    bmesh.ops.create_cone(
        bm_crys, cap_ends=True, cap_tris=False, segments=5,
        radius1=0.14 * scale, radius2=0.02, depth=0.52 * scale,
        matrix=Matrix.Translation((x - 0.18 * scale, y + 0.24 * scale, z + 0.22 * scale)) @ Matrix.Rotation(-0.35, 4, 'X'),
    )


def add_basalt_column_cluster(bm_rock, pos, scale=1.0, rot_z=0.0):
    """Volcanic hexagonal Giant's Causeway basalt rock columns for Dragon Empire terrain!"""
    x, y, z = pos
    rm = Matrix.Rotation(rot_z, 4, 'Z')
    cols = [
        (0.0, 0.0, 0.56, 2.25),
        (0.58, 0.26, 0.46, 1.55),
        (-0.52, 0.32, 0.44, 1.72),
        (0.18, -0.58, 0.42, 1.18),
        (-0.46, -0.44, 0.38, 0.95),
    ]
    for cx, cy, rad, h in cols:
        off = rm @ Vector((cx * scale, cy * scale, 0.0))
        bmesh.ops.create_cone(
            bm_rock, cap_ends=True, cap_tris=False, segments=6,
            radius1=rad * scale, radius2=rad * 0.92 * scale, depth=h * scale,
            matrix=Matrix.Translation((x + off.x, y + off.y, z + h * 0.38 * scale)) @ rm,
        )


def build_nature(col, mats):
    """Build rich biome-matched trees, wildflower bushes, forest spores, crystal geodes, basalt columns, lava pools & cliff vines."""
    objs = []
    rng = random.Random(4219)

    bm_trunk = bmesh.new()
    bm_broad = bmesh.new()
    bm_pine = bmesh.new()
    bm_flowers = bmesh.new()
    bm_vines = bmesh.new()
    bm_spore = bmesh.new()
    bm_rock_light = bmesh.new()
    bm_rock_dark = bmesh.new()
    bm_demon_bark = bmesh.new()
    bm_crys = bmesh.new()
    bm_lava = bmesh.new()

    # 1. Waterfall Cliff Jaw Boulders & Spring Head Rocks (anchors the 4 waterfalls & springs!)
    diag_angles = [math.pi * 0.25, math.pi * 0.75, -math.pi * 0.75, -math.pi * 0.25]
    for idx, ang in enumerate(diag_angles):
        xform = Matrix.Rotation(ang, 4, 'Z')
        rim_r = island_outer_radius(ang)
        is_dark = idx in (2, 3)
        bm_r = bm_rock_dark if is_dark else bm_rock_light
        for side in (-1.0, 1.0):
            p = xform @ Vector((rim_r - 0.45, side * 2.50, -1.25))
            add_faceted_rock(bm_r, p, radius=1.95, scale_xyz=(1.15, 1.0, 1.30), rot_z=ang + side * 0.4, seed=idx * 3.1 + side)
            p2 = xform @ Vector((rim_r - 2.3, side * 2.95, -0.70))
            add_faceted_rock(bm_r, p2, radius=1.42, scale_xyz=(1.2, 0.9, 0.95), rot_z=ang, seed=idx * 5.2)
            p3 = xform @ Vector((rim_r - 4.2, side * 2.85, -0.45))
            add_faceted_rock(bm_r, p3, radius=1.10, scale_xyz=(1.1, 0.95, 0.80), rot_z=ang - side * 0.3, seed=idx * 6.3)
            ps = xform @ Vector((12.95, side * 2.60, -0.55))
            add_faceted_rock(bm_r, ps, radius=1.18, scale_xyz=(1.18, 0.95, 1.05), rot_z=ang + side, seed=idx * 7.4)

    # 2. Outer Rim Cliff Boulders + Hanging Cliff Vines & Roots under Forest & Kingdom rims!
    for i in range(56):
        th = (2.0 * math.pi * i) / 56.0 + rng.uniform(-0.03, 0.03)
        if abs(abs(math.cos(th)) - abs(math.sin(th))) < 0.14:
            continue
        rim_r = island_outer_radius(th) - rng.uniform(0.35, 1.35)
        bx, by = rim_r * math.cos(th), rim_r * math.sin(th)
        bz = terrain_height(bx, by) - 0.28
        w_k, w_f, w_d, w_dr = faction_weights(bx, by)
        bm_r = bm_rock_dark if (w_d + w_dr) > 0.5 else bm_rock_light
        add_faceted_rock(bm_r, (bx, by, bz), radius=rng.uniform(0.85, 1.72), scale_xyz=(1.18, 0.95, 0.80), rot_z=rng.uniform(0, 6.28), seed=i * 1.7)
        # Hanging mossy cliff vines along Kingdom & Forest cliff lips!
        if (w_k + w_f) > 0.55 and i % 2 == 0:
            vlen = rng.uniform(2.6, 5.4)
            vx, vy = (rim_r + 0.45) * math.cos(th), (rim_r + 0.45) * math.sin(th)
            add_tube_along_curve(
                bm_vines,
                [(vx, vy, bz + 0.2), (vx + 0.2 * math.cos(th), vy + 0.2 * math.sin(th), bz - vlen * 0.45), (vx, vy, bz - vlen)],
                [0.18, 0.12, 0.03], segs=5,
            )

    # 3. Scatter Dense Biome-Specific Vegetation, Geodes, Basalt Columns & Volcanic Magma Pools!
    placed = []
    for attempt in range(580):
        th = rng.uniform(0.0, 2.0 * math.pi)
        rim_r = island_outer_radius(th)
        r = rng.uniform(13.0, rim_r - 1.3)
        x = r * math.cos(th)
        y = r * math.sin(th)
        if not is_clear_for_nature(x, y, margin=0.30):
            continue
        if any(math.hypot(x - px, y - py) < 2.05 for px, py in placed):
            continue
        z = terrain_height(x, y)
        if z < -0.15:
            continue

        w_k, w_f, w_d, w_dr = faction_weights(x, y)
        dominant = max((w_k, 'k'), (w_f, 'f'), (w_d, 'd'), (w_dr, 'dr'))[1]
        placed.append((x, y))

        if dominant == 'k':
            roll = rng.random()
            if roll < 0.42:
                add_broadleaf_tree(bm_trunk, bm_broad, (x, y, z - 0.14), scale=rng.uniform(0.95, 1.48), rot_z=rng.uniform(0, 6.28))
            elif roll < 0.72:
                add_pine_tree(bm_trunk, bm_pine, (x, y, z - 0.14), scale=rng.uniform(0.95, 1.45))
            elif roll < 0.90:
                add_flowering_bush(bm_broad, bm_flowers, (x, y, z - 0.08), scale=rng.uniform(0.85, 1.25))
            else:
                add_faceted_rock(bm_rock_light, (x, y, z + 0.1), radius=rng.uniform(0.65, 1.15), rot_z=rng.uniform(0, 6.28), seed=attempt)

        elif dominant == 'f':
            roll = rng.random()
            if roll < 0.56:
                add_broadleaf_tree(bm_trunk, bm_broad, (x, y, z - 0.16), scale=rng.uniform(1.15, 1.78), rot_z=rng.uniform(0, 6.28))
            elif roll < 0.76:
                add_pine_tree(bm_trunk, bm_pine, (x, y, z - 0.16), scale=rng.uniform(1.10, 1.55))
            elif roll < 0.90:
                add_flowering_bush(bm_broad, bm_spore, (x, y, z - 0.08), scale=rng.uniform(0.90, 1.35))
            else:
                add_faceted_rock(bm_rock_light, (x, y, z + 0.1), radius=rng.uniform(0.75, 1.32), rot_z=rng.uniform(0, 6.28), seed=attempt)

        elif dominant == 'd':
            roll = rng.random()
            if roll < 0.36:
                add_crystal_geode(bm_rock_dark, bm_crys, (x, y, z - 0.08), scale=rng.uniform(0.85, 1.45), rot_z=rng.uniform(0, 6.28))
            elif roll < 0.68:
                add_twisted_demon_tree(bm_demon_bark, bm_crys, (x, y, z - 0.12), scale=rng.uniform(0.95, 1.48), rot_z=rng.uniform(0, 6.28))
            else:
                add_faceted_rock(bm_rock_dark, (x, y, z + 0.16), radius=rng.uniform(0.85, 1.48), scale_xyz=(1.0, 0.9, 1.22), rot_z=rng.uniform(0, 6.28), seed=attempt)

        else:
            roll = rng.random()
            if roll < 0.45:
                add_basalt_column_cluster(bm_rock_dark, (x, y, z - 0.12), scale=rng.uniform(0.85, 1.38), rot_z=rng.uniform(0, 6.28))
            elif roll < 0.80:
                # Glowing molten lava pool rimmed with cooled dark basalt rocks!
                prad = rng.uniform(0.78, 1.30)
                bmesh.ops.create_cone(
                    bm_lava, cap_ends=True, cap_tris=False, segments=12,
                    radius1=prad, radius2=prad * 0.88, depth=0.18,
                    matrix=Matrix.Translation((x, y, z + 0.05)),
                )
                for ri in range(3):
                    ra = ri * 2.1 + rng.uniform(0, 0.6)
                    add_faceted_rock(bm_rock_dark, (x + prad * 0.92 * math.cos(ra), y + prad * 0.92 * math.sin(ra), z + 0.12), radius=0.48, scale_xyz=(1.1, 0.9, 0.68), seed=attempt + ri)
            else:
                add_faceted_rock(bm_rock_dark, (x, y, z + 0.15), radius=rng.uniform(0.75, 1.35), rot_z=rng.uniform(0, 6.28), seed=attempt)

    # Painterly vertex colors
    c_b_sun = hex_rgba('#97DC45')
    c_b_mid = hex_rgba('#3F9939')
    c_b_shd = hex_rgba('#1B4F24')
    paint_vertex_colors(
        bm_broad,
        lambda co, n: lerp_rgba(
            lerp_rgba(c_b_shd, c_b_mid, max(0.0, min(1.0, 0.42 + 0.58 * n.z))),
            c_b_sun,
            max(0.0, n.z) * (0.48 + 0.42 * fbm_noise(co.x * 0.45, co.y * 0.45, co.z)),
        ),
    )
    c_p_hi = hex_rgba('#43964A')
    c_p_lo = hex_rgba('#184225')
    paint_vertex_colors(bm_pine, lambda co, n: lerp_rgba(c_p_lo, c_p_hi, max(0.0, min(1.0, 0.32 + 0.68 * n.z))))
    c_tk_hi = hex_rgba('#785132')
    c_tk_lo = hex_rgba('#422918')
    paint_vertex_colors(bm_trunk, lambda co, n: lerp_rgba(c_tk_lo, c_tk_hi, 0.4 + 0.5 * fbm_noise(co.x, co.y, co.z)))
    c_dk_bark = hex_rgba('#332645')
    c_dk_bark_lo = hex_rgba('#181124')
    paint_vertex_colors(bm_demon_bark, lambda co, n: lerp_rgba(c_dk_bark_lo, c_dk_bark, 0.35 + 0.65 * max(0.0, n.z)))
    c_rl_hi = hex_rgba('#ADA899')
    c_rl_lo = hex_rgba('#646258')
    paint_vertex_colors(bm_rock_light, lambda co, n: lerp_rgba(c_rl_lo, c_rl_hi, max(0.0, min(1.0, 0.3 + 0.7 * n.z))))
    c_rd_hi = hex_rgba('#66423A')
    c_rd_lo = hex_rgba('#251A1C')
    paint_vertex_colors(bm_rock_dark, lambda co, n: lerp_rgba(c_rd_lo, c_rd_hi, max(0.0, min(1.0, 0.32 + 0.68 * n.z))))

    objs.append(mesh_from_bmesh(bm_trunk, 'Nature_Tree_Trunks', col, mats['forest_bark'], smooth=True))
    objs.append(mesh_from_bmesh(bm_broad, 'Nature_Broadleaf_Trees', col, mats['tree_broad'], smooth=True))
    objs.append(mesh_from_bmesh(bm_pine, 'Nature_Pine_Trees', col, mats['tree_pine'], smooth=False))
    objs.append(mesh_from_bmesh(bm_flowers, 'Nature_Meadow_Flowers', col, mats['flower_gold'], smooth=True))
    objs.append(mesh_from_bmesh(bm_vines, 'Nature_Cliff_Vines', col, mats['forest_vine'], smooth=True))
    objs.append(mesh_from_bmesh(bm_spore, 'Nature_Forest_Spores', col, mats['glow_forest_spore'], smooth=True))
    objs.append(mesh_from_bmesh(bm_demon_bark, 'Nature_Demon_ShadowTrees', col, mats['demon_obsidian'], smooth=False))
    objs.append(mesh_from_bmesh(bm_crys, 'Nature_Demon_Crystals', col, mats['demon_crystal'], smooth=False))
    objs.append(mesh_from_bmesh(bm_lava, 'Nature_Dragon_LavaPools', col, mats['lava'], smooth=True))
    objs.append(mesh_from_bmesh(bm_rock_light, 'Nature_Light_Boulders', col, mats['rock_light'], smooth=False))
    objs.append(mesh_from_bmesh(bm_rock_dark, 'Nature_Volcanic_Boulders', col, mats['rock_dark'], smooth=False))
    return objs


def build_tripo_props_only(col_props, col_nature, mats):
    """Add soft painterly floating cloud sea banks cleanly outside the Tripo island silhouette + delicate forest fireflies."""
    # Wide atmospheric cloud halo drifting around the floating island (zero overlap with the sculpted rocky underside!)
    bm_clouds = bmesh.new()
    cloud_banks = [
        (43.0, 32.0, -19.5, 6.4, 4.4, 2.2),
        (-43.5, 30.5, -20.0, 6.8, 4.6, 2.3),
        (42.5, -33.0, -19.8, 6.2, 4.3, 2.1),
        (-43.0, -31.5, -19.2, 6.6, 4.5, 2.2),
        (0.0, 52.0, -23.5, 7.6, 4.8, 2.4),
        (0.0, -52.5, -24.2, 7.2, 4.6, 2.3),
        (53.0, 0.0, -22.0, 5.2, 7.4, 2.3),
        (-53.0, 0.0, -21.8, 5.4, 7.6, 2.3),
        (34.0, 44.0, -32.5, 6.4, 4.6, 2.2),
        (-34.0, -44.0, -33.0, 6.6, 4.7, 2.2),
        (-35.0, 43.5, -33.5, 6.2, 4.5, 2.1),
        (35.0, -43.5, -32.2, 6.5, 4.6, 2.2),
    ]
    for cx, cy, cz, rx, ry, rz in cloud_banks:
        lobes = [
            (0.0, 0.0, 0.35, 0.96),
            (rx * 0.50, ry * 0.18, -0.15, 0.78),
            (-rx * 0.48, -ry * 0.20, -0.10, 0.74),
            (rx * 0.22, -ry * 0.44, -0.25, 0.68),
            (-rx * 0.25, ry * 0.42, -0.20, 0.70),
            (0.0, 0.0, 0.72, 0.64),
        ]
        for ox, oy, oz, sc in lobes:
            bmesh.ops.create_icosphere(
                bm_clouds, subdivisions=2, radius=1.0,
                matrix=Matrix.Translation((cx + ox, cy + oy, cz + oz)) @ Matrix.Diagonal((rx * sc, ry * sc, rz * sc, 1.0)),
            )
    c_cld_top = hex_rgba('#FFFDF8')
    c_cld_bot = hex_rgba('#A5BEE8')
    bm_clouds.normal_update()
    paint_vertex_colors(bm_clouds, lambda co, n: lerp_rgba(c_cld_bot, c_cld_top, max(0.0, min(1.0, 0.45 + 0.55 * n.z))))
    mesh_from_bmesh(bm_clouds, 'Props_Floating_Cloud_Ring', col_props, mats['cloud'], smooth=True)

    # Delicate glowing forest fireflies nestled softly around the mossy glade & ancient roots (Nature collection)
    bm_ff = bmesh.new()
    for fx, fy, fz in [(-24.2, 7.6, 1.8), (-25.8, 5.8, 2.4), (-23.6, -7.4, 2.0), (-26.0, -5.2, 2.5), (-26.8, 1.6, 2.8), (-19.2, 6.2, 3.4), (-19.5, -5.8, 3.1)]:
        bmesh.ops.create_icosphere(bm_ff, subdivisions=2, radius=0.075, matrix=Matrix.Translation((fx, fy, fz)))
    mesh_from_bmesh(bm_ff, 'Nature_Forest_Fireflies', col_nature, mats['glow_forest_spore'], smooth=True)


def build_props(col, mats):
    """Build ornate neutral plaza benches & planters + multi-lobe painterly floating cloud banks."""
    objs = []

    # 1. Four Ornate Neutral Carved Stone Benches & Classical Stone Flower Urns at Plaza Diagonals
    bm_bench = bmesh.new()
    bm_fol = bmesh.new()
    for deg in (45, 135, 225, 315):
        a = math.radians(deg)
        r = 5.95
        bx, by = r * math.cos(a), r * math.sin(a)
        rot_z = a + math.pi * 0.5
        # Molded curved-lip stone seat + carved scroll armrests + fluted legs
        bmesh.ops.create_cube(bm_bench, size=1.0, matrix=Matrix.Translation((bx, by, 0.42)) @ Matrix.Rotation(rot_z, 4, 'Z') @ Matrix.Diagonal((1.88, 0.64, 0.14, 1.0)))
        for sx in (-0.72, 0.72):
            off = Matrix.Rotation(rot_z, 4, 'Z') @ Vector((sx, 0.0, 0.0))
            bmesh.ops.create_cube(bm_bench, size=1.0, matrix=Matrix.Translation((bx + off.x, by + off.y, 0.20)) @ Matrix.Rotation(rot_z, 4, 'Z') @ Matrix.Diagonal((0.26, 0.56, 0.40, 1.0)))
            bmesh.ops.create_cube(bm_bench, size=1.0, matrix=Matrix.Translation((bx + off.x, by + off.y, 0.58)) @ Matrix.Rotation(rot_z, 4, 'Z') @ Matrix.Diagonal((0.18, 0.54, 0.22, 1.0)))
        # Flanking classical stone planter urns with neutral greenery!
        for sx in (-1.35, 1.35):
            off = Matrix.Rotation(rot_z, 4, 'Z') @ Vector((sx, 0.15, 0.0))
            ux, uy = bx + off.x, by + off.y
            bmesh.ops.create_cone(bm_bench, cap_ends=True, cap_tris=False, segments=10, radius1=0.28, radius2=0.36, depth=0.52, matrix=Matrix.Translation((ux, uy, 0.26)))
            bmesh.ops.create_icosphere(bm_fol, subdivisions=1, radius=0.34, matrix=Matrix.Translation((ux, uy, 0.65)))

    paint_vertex_colors(bm_fol, lambda co, n: lerp_rgba(hex_rgba('#29662E'), hex_rgba('#75C445'), max(0.0, min(1.0, 0.4 + 0.6 * n.z))))
    objs.append(mesh_from_bmesh(bm_bench, 'Props_Plaza_Neutral_Benches', col, mats['plaza_trim'], smooth=False))
    objs.append(mesh_from_bmesh(bm_fol, 'Props_Plaza_Planter_Greenery', col, mats['tree_broad'], smooth=True))

    # 2. Painterly Multi-Lobe Floating Cloud Sea Banks drifting gently around & below the floating island
    bm_clouds = bmesh.new()
    rng = random.Random(909)
    cloud_banks = [
        (36.5, 26.5, -11.5, 5.4, 3.8, 1.9),
        (-37.2, 24.5, -12.0, 5.8, 4.0, 2.0),
        (35.8, -27.2, -11.8, 5.2, 3.6, 1.8),
        (-36.4, -25.4, -11.2, 5.6, 3.9, 1.9),
        (0.0, 42.5, -13.5, 6.4, 4.2, 2.1),
        (0.0, -42.5, -14.2, 6.0, 4.0, 2.0),
        (43.5, 0.0, -13.0, 4.6, 6.2, 2.0),
        (-43.5, 0.0, -12.8, 4.7, 6.4, 2.0),
        (24.0, 38.0, -15.5, 4.8, 3.5, 1.7),
        (-24.0, -38.0, -15.8, 5.0, 3.6, 1.7),
        (-25.0, 37.5, -16.0, 4.6, 3.4, 1.6),
        (25.0, -37.5, -15.2, 4.9, 3.5, 1.7),
    ]
    for cx, cy, cz, rx, ry, rz in cloud_banks:
        # 6 billowing overlapping soft lobes per cloud bank!
        lobes = [
            (0.0, 0.0, 0.3, 0.95),
            (rx * 0.48, ry * 0.18, -0.15, 0.76),
            (-rx * 0.46, -ry * 0.20, -0.10, 0.72),
            (rx * 0.20, -ry * 0.42, -0.25, 0.65),
            (-rx * 0.24, ry * 0.40, -0.20, 0.68),
            (0.0, 0.0, 0.65, 0.62),
        ]
        for ox, oy, oz, sc in lobes:
            bmesh.ops.create_icosphere(
                bm_clouds, subdivisions=2, radius=1.0,
                matrix=Matrix.Translation((cx + ox, cy + oy, cz + oz)) @ Matrix.Diagonal((rx * sc, ry * sc, rz * sc, 1.0)),
            )

    c_cld_top = hex_rgba('#FFFDF8')
    c_cld_bot = hex_rgba('#A5BEE8')
    bm_clouds.normal_update()
    paint_vertex_colors(bm_clouds, lambda co, n: lerp_rgba(c_cld_bot, c_cld_top, max(0.0, min(1.0, 0.45 + 0.55 * n.z))))
    objs.append(mesh_from_bmesh(bm_clouds, 'Props_Floating_Cloud_Ring', col, mats['cloud'], smooth=True))

    return objs
