"""Biome-matched Nature (trees, rocks, lava pools, crystals, waterfall cliffs) & Props builders.

All placements automatically query terrain_height(x, y) and respect exclusion zones for
the Central Plaza, Ring Moat, 4 Bridges, 4 Roads/Staircases, 4 Diagonal Rivers, and 4 Castles.
"""

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


def is_clear_for_nature(x, y, margin=0.0):
    """Return True if (x, y) is safely on island terrain outside plaza, rivers, roads, and castle pads."""
    r = math.hypot(x, y)
    th = math.atan2(y, x)
    rim_r = island_outer_radius(th)
    if r < 12.6 + margin or r > rim_r - (1.2 + margin):
        return False

    # Keep clear of the 4 diagonal river channels
    d_diag = abs(abs(x) - abs(y)) / math.sqrt(2.0)
    if d_diag < 3.4 + margin:
        return False

    # Keep clear of 4 cardinal approach roads & castle footprints
    for name, cfg in LAYOUT['castles'].items():
        dx, dy = cfg['dir']
        along = x * dx + y * dy
        perp = abs(-x * dy + y * dx)
        # Road & stair corridor
        if 11.5 <= along <= 18.0 and perp < 3.6 + margin:
            return False
        # Castle footprint
        if 16.0 <= along <= 27.5 and perp < 6.8 + margin:
            return False

    return True


def add_faceted_rock(bm, pos, radius, scale_xyz=(1.0, 1.0, 0.72), rot_z=0.0, seed=0.0):
    m = (
        Matrix.Translation(pos)
        @ Matrix.Rotation(rot_z, 4, 'Z')
        @ Matrix.Diagonal((scale_xyz[0] * radius, scale_xyz[1] * radius, scale_xyz[2] * radius, 1.0))
    )
    ret = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0, matrix=m)
    for v in ret['verts']:
        nv = (fbm_noise(v.co.x * 0.8 + seed, v.co.y * 0.8 - seed, v.co.z * 0.9) - 0.5) * 0.38 * radius
        v.co += Vector((nv, nv * 0.7, nv * 0.45))


def add_broadleaf_tree(bm_trunk, bm_fol, pos, scale=1.0, rot_z=0.0):
    x, y, z = pos
    th = 1.65 * scale
    bmesh.ops.create_cone(
        bm_trunk, cap_ends=True, cap_tris=False, segments=7,
        radius1=0.28 * scale, radius2=0.14 * scale, depth=th,
        matrix=Matrix.Translation((x, y, z + th * 0.42)),
    )
    # 3 overlapping sculpted canopy clusters
    blobs = [
        (0.0, 0.0, th + 0.85 * scale, 1.15 * scale, 1.12 * scale, 0.92 * scale),
        (0.55 * scale, 0.32 * scale, th + 0.45 * scale, 0.82 * scale, 0.80 * scale, 0.68 * scale),
        (-0.52 * scale, -0.35 * scale, th + 0.52 * scale, 0.85 * scale, 0.82 * scale, 0.70 * scale),
    ]
    rm = Matrix.Rotation(rot_z, 4, 'Z')
    for bx, by, bz, rx, ry, rz in blobs:
        off = rm @ Vector((bx, by, 0.0))
        ret = bmesh.ops.create_icosphere(
            bm_fol, subdivisions=1, radius=1.0,
            matrix=Matrix.Translation((x + off.x, y + off.y, z + bz)) @ Matrix.Diagonal((rx, ry, rz, 1.0)),
        )
        for v in ret['verts']:
            nv = (fbm_noise(v.co.x * 1.1, v.co.y * 1.1, v.co.z * 1.1) - 0.5) * 0.25 * scale
            v.co += Vector((nv, nv * 0.8, nv * 0.5))


def add_pine_tree(bm_trunk, bm_pine, pos, scale=1.0):
    x, y, z = pos
    bmesh.ops.create_cone(
        bm_trunk, cap_ends=True, cap_tris=False, segments=6,
        radius1=0.22 * scale, radius2=0.10 * scale, depth=1.2 * scale,
        matrix=Matrix.Translation((x, y, z + 0.5 * scale)),
    )
    tiers = [
        (1.05, 1.25, 1.45),
        (1.95, 0.96, 1.35),
        (2.75, 0.68, 1.25),
    ]
    for tz, rad, h in tiers:
        bmesh.ops.create_cone(
            bm_pine, cap_ends=True, cap_tris=False, segments=7,
            radius1=rad * scale, radius2=0.05 * scale, depth=h * scale,
            matrix=Matrix.Translation((x, y, z + tz * scale)),
        )


def add_twisted_demon_tree(bm_bark, bm_crys, pos, scale=1.0, rot_z=0.0):
    x, y, z = pos
    rm = Matrix.Rotation(rot_z, 4, 'Z')
    # Jagged crooked dead-wood silhouette + glowing purple crystal bud
    bmesh.ops.create_cone(
        bm_bark, cap_ends=True, cap_tris=False, segments=6,
        radius1=0.30 * scale, radius2=0.14 * scale, depth=2.1 * scale,
        matrix=Matrix.Translation((x, y, z + 0.9 * scale)) @ rm @ Matrix.Rotation(0.18, 4, 'Y'),
    )
    for ang, tilt in ((0.4, 0.65), (2.5, 0.58), (4.6, 0.72)):
        m = (
            Matrix.Translation((x, y, z + 1.95 * scale))
            @ Matrix.Rotation(rot_z + ang, 4, 'Z')
            @ Matrix.Rotation(tilt, 4, 'Y')
            @ Matrix.Translation((0.0, 0.0, 0.65 * scale))
        )
        bmesh.ops.create_cone(
            bm_bark, cap_ends=True, cap_tris=False, segments=5,
            radius1=0.14 * scale, radius2=0.03 * scale, depth=1.35 * scale, matrix=m,
        )
    # Small glowing violet crystal at base
    bmesh.ops.create_cone(
        bm_crys, cap_ends=True, cap_tris=False, segments=5,
        radius1=0.22 * scale, radius2=0.02, depth=0.95 * scale,
        matrix=Matrix.Translation((x + 0.35 * scale, y, z + 0.35 * scale)) @ Matrix.Rotation(0.28, 4, 'Y'),
    )


def build_nature(col, mats):
    """Build stylized trees, shrubs, cliff boulders, waterfall jaws, volcanic vents, and crystals."""
    objs = []
    rng = random.Random(4217)

    bm_trunk = bmesh.new()
    bm_broad = bmesh.new()
    bm_pine = bmesh.new()
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
        is_dark = idx in (2, 3)  # SE & SW border Demon/Dragon
        bm_r = bm_rock_dark if is_dark else bm_rock_light
        # Flanking cliff jaw boulders at waterfall lip
        for side in (-1.0, 1.0):
            p = xform @ Vector((rim_r - 0.5, side * 2.45, -1.25))
            add_faceted_rock(bm_r, p, radius=1.85, scale_xyz=(1.1, 1.0, 1.25), rot_z=ang + side * 0.4, seed=idx * 3.1 + side)
            p2 = xform @ Vector((rim_r - 2.2, side * 2.85, -0.75))
            add_faceted_rock(bm_r, p2, radius=1.35, scale_xyz=(1.2, 0.9, 0.95), rot_z=ang, seed=idx * 5.2)
            # Spring head rocky outcrop beside river junction
            ps = xform @ Vector((12.9, side * 2.55, -0.55))
            add_faceted_rock(bm_r, ps, radius=1.15, scale_xyz=(1.15, 0.95, 1.05), rot_z=ang + side, seed=idx * 7.4)

    # 2. Outer Rim Accent Cliff Boulders (adds silhouette cragginess all around the island edge!)
    for i in range(44):
        th = (2.0 * math.pi * i) / 44.0 + rng.uniform(-0.04, 0.04)
        d_diag = abs(math.cos(th)) - abs(math.sin(th))
        if abs(d_diag) < 0.14:
            continue
        rim_r = island_outer_radius(th) - rng.uniform(0.4, 1.4)
        bx, by = rim_r * math.cos(th), rim_r * math.sin(th)
        bz = terrain_height(bx, by) - 0.25
        w_k, w_f, w_d, w_dr = faction_weights(bx, by)
        bm_r = bm_rock_dark if (w_d + w_dr) > 0.5 else bm_rock_light
        add_faceted_rock(bm_r, (bx, by, bz), radius=rng.uniform(0.85, 1.65), scale_xyz=(1.15, 0.95, 0.78), rot_z=rng.uniform(0, 6.28), seed=i * 1.7)

    # 3. Scatter Biome-Specific Trees, Shrubs, Obsidian Crystals, and Volcanic Magma Pools!
    placed = []
    for attempt in range(460):
        th = rng.uniform(0.0, 2.0 * math.pi)
        rim_r = island_outer_radius(th)
        r = rng.uniform(13.0, rim_r - 1.4)
        x = r * math.cos(th)
        y = r * math.sin(th)
        if not is_clear_for_nature(x, y, margin=0.35):
            continue
        if any(math.hypot(x - px, y - py) < 2.25 for px, py in placed):
            continue
        z = terrain_height(x, y)
        if z < -0.2:
            continue

        w_k, w_f, w_d, w_dr = faction_weights(x, y)
        dominant = max((w_k, 'k'), (w_f, 'f'), (w_d, 'd'), (w_dr, 'dr'))[1]
        placed.append((x, y))

        if dominant == 'k':
            # Kingdom: cheerful pines, rounded sunlit trees & clean limestone rocks
            roll = rng.random()
            if roll < 0.48:
                add_broadleaf_tree(bm_trunk, bm_broad, (x, y, z - 0.12), scale=rng.uniform(0.95, 1.45), rot_z=rng.uniform(0, 6.28))
            elif roll < 0.82:
                add_pine_tree(bm_trunk, bm_pine, (x, y, z - 0.12), scale=rng.uniform(0.95, 1.45))
            else:
                add_faceted_rock(bm_rock_light, (x, y, z + 0.1), radius=rng.uniform(0.65, 1.15), rot_z=rng.uniform(0, 6.28), seed=attempt)

        elif dominant == 'f':
            # Forest Alliance: lush dense fantasy oaks, deep pines & mossy boulders
            roll = rng.random()
            if roll < 0.68:
                add_broadleaf_tree(bm_trunk, bm_broad, (x, y, z - 0.15), scale=rng.uniform(1.15, 1.75), rot_z=rng.uniform(0, 6.28))
            elif roll < 0.88:
                add_pine_tree(bm_trunk, bm_pine, (x, y, z - 0.15), scale=rng.uniform(1.1, 1.55))
            else:
                add_faceted_rock(bm_rock_light, (x, y, z + 0.1), radius=rng.uniform(0.75, 1.3), rot_z=rng.uniform(0, 6.28), seed=attempt)

        elif dominant == 'd':
            # Demon Army: jagged amethyst crystal spires, gnarled dark shadow-trees, obsidian crags
            roll = rng.random()
            if roll < 0.42:
                # Glowing purple crystal cluster
                sc = rng.uniform(0.85, 1.55)
                bmesh.ops.create_cone(
                    bm_crys, cap_ends=True, cap_tris=False, segments=5,
                    radius1=0.36 * sc, radius2=0.02, depth=1.85 * sc,
                    matrix=Matrix.Translation((x, y, z + 0.72 * sc)) @ Matrix.Rotation(rng.uniform(-0.25, 0.25), 4, 'Y'),
                )
                bmesh.ops.create_cone(
                    bm_crys, cap_ends=True, cap_tris=False, segments=5,
                    radius1=0.24 * sc, radius2=0.02, depth=1.2 * sc,
                    matrix=Matrix.Translation((x + 0.32 * sc, y - 0.2 * sc, z + 0.45 * sc)) @ Matrix.Rotation(0.32, 4, 'X'),
                )
            elif roll < 0.74:
                add_twisted_demon_tree(bm_demon_bark, bm_crys, (x, y, z - 0.1), scale=rng.uniform(0.95, 1.45), rot_z=rng.uniform(0, 6.28))
            else:
                add_faceted_rock(bm_rock_dark, (x, y, z + 0.15), radius=rng.uniform(0.85, 1.45), scale_xyz=(1.0, 0.9, 1.15), rot_z=rng.uniform(0, 6.28), seed=attempt)

        else:
            # Dragon Empire: volcanic basalt crags, glowing molten lava vents/pools!
            roll = rng.random()
            if roll < 0.48:
                # Jagged dark basalt crag spire
                add_faceted_rock(bm_rock_dark, (x, y, z + 0.25), radius=rng.uniform(0.95, 1.65), scale_xyz=(1.05, 0.95, 1.35), rot_z=rng.uniform(0, 6.28), seed=attempt)
            elif roll < 0.85:
                # Glowing magma pool framed by volcanic rocks!
                bmesh.ops.create_cone(
                    bm_lava, cap_ends=True, cap_tris=False, segments=9,
                    radius1=rng.uniform(0.75, 1.25), radius2=rng.uniform(0.65, 1.05), depth=0.18,
                    matrix=Matrix.Translation((x, y, z + 0.06)),
                )
                add_faceted_rock(bm_rock_dark, (x + 0.7, y + 0.4, z + 0.1), radius=0.65, scale_xyz=(1.0, 0.9, 0.7), seed=attempt)
            else:
                add_faceted_rock(bm_rock_dark, (x, y, z + 0.15), radius=rng.uniform(0.7, 1.2), rot_z=rng.uniform(0, 6.28), seed=attempt)

    # Vertex color all nature meshes for painterly sunlit shading
    c_b_sun = hex_rgba('#87CF42')
    c_b_mid = hex_rgba('#3F9639')
    c_b_shd = hex_rgba('#1E5225')
    paint_vertex_colors(
        bm_broad,
        lambda co, n: lerp_rgba(
            lerp_rgba(c_b_shd, c_b_mid, max(0.0, min(1.0, 0.45 + 0.55 * n.z))),
            c_b_sun,
            max(0.0, n.z) * (0.45 + 0.4 * fbm_noise(co.x * 0.4, co.y * 0.4, co.z)),
        ),
    )

    c_p_hi = hex_rgba('#3F8C46')
    c_p_lo = hex_rgba('#194225')
    paint_vertex_colors(bm_pine, lambda co, n: lerp_rgba(c_p_lo, c_p_hi, max(0.0, min(1.0, 0.35 + 0.65 * n.z))))

    c_tk_hi = hex_rgba('#6E492D')
    c_tk_lo = hex_rgba('#3E2616')
    paint_vertex_colors(bm_trunk, lambda co, n: lerp_rgba(c_tk_lo, c_tk_hi, 0.4 + 0.5 * fbm_noise(co.x, co.y, co.z)))

    c_dk_bark = hex_rgba('#2D223B')
    c_dk_bark_lo = hex_rgba('#171122')
    paint_vertex_colors(bm_demon_bark, lambda co, n: lerp_rgba(c_dk_bark_lo, c_dk_bark, 0.4 + 0.6 * max(0.0, n.z)))

    c_rl_hi = hex_rgba('#A8A394')
    c_rl_lo = hex_rgba('#636158')
    paint_vertex_colors(bm_rock_light, lambda co, n: lerp_rgba(c_rl_lo, c_rl_hi, max(0.0, min(1.0, 0.3 + 0.7 * n.z))))

    c_rd_hi = hex_rgba('#5C3E38')
    c_rd_lo = hex_rgba('#251A1C')
    paint_vertex_colors(bm_rock_dark, lambda co, n: lerp_rgba(c_rd_lo, c_rd_hi, max(0.0, min(1.0, 0.3 + 0.7 * n.z))))

    objs.append(mesh_from_bmesh(bm_trunk, 'Nature_Tree_Trunks', col, mats['forest_bark'], smooth=False))
    objs.append(mesh_from_bmesh(bm_broad, 'Nature_Broadleaf_Trees', col, mats['tree_broad'], smooth=False))
    objs.append(mesh_from_bmesh(bm_pine, 'Nature_Pine_Trees', col, mats['tree_pine'], smooth=False))
    objs.append(mesh_from_bmesh(bm_demon_bark, 'Nature_Demon_ShadowTrees', col, mats['demon_obsidian'], smooth=False))
    objs.append(mesh_from_bmesh(bm_crys, 'Nature_Demon_Crystals', col, mats['demon_crystal'], smooth=False))
    objs.append(mesh_from_bmesh(bm_lava, 'Nature_Dragon_LavaPools', col, mats['lava'], smooth=True))
    objs.append(mesh_from_bmesh(bm_rock_light, 'Nature_Light_Boulders', col, mats['rock_light'], smooth=False))
    objs.append(mesh_from_bmesh(bm_rock_dark, 'Nature_Volcanic_Boulders', col, mats['rock_dark'], smooth=False))
    return objs


def build_props(col, mats):
    """Build neutral plaza benches/planters and soft stylized lower floating clouds framing the island."""
    objs = []

    # 1. Four Neutral Carved Stone Benches around Central Plaza (strictly neutral, off-axis at diagonals!)
    bm_bench = bmesh.new()
    for deg in (45, 135, 225, 315):
        a = math.radians(deg)
        r = 5.85
        bx, by = r * math.cos(a), r * math.sin(a)
        rot_z = a + math.pi * 0.5
        m_seat = Matrix.Translation((bx, by, 0.38)) @ Matrix.Rotation(rot_z, 4, 'Z') @ Matrix.Diagonal((1.75, 0.58, 0.16, 1.0))
        bmesh.ops.create_cube(bm_bench, size=1.0, matrix=m_seat)
        for sx in (-0.65, 0.65):
            leg_off = Matrix.Rotation(rot_z, 4, 'Z') @ Vector((sx, 0.0, 0.0))
            m_leg = Matrix.Translation((bx + leg_off.x, by + leg_off.y, 0.18)) @ Matrix.Rotation(rot_z, 4, 'Z') @ Matrix.Diagonal((0.24, 0.50, 0.36, 1.0))
            bmesh.ops.create_cube(bm_bench, size=1.0, matrix=m_leg)
    objs.append(mesh_from_bmesh(bm_bench, 'Props_Plaza_Neutral_Benches', col, mats['plaza_trim'], smooth=False))

    # 2. Stylized Soft Floating Cloud Puffs drifting gently below the floating island (Z = -16 .. -10)
    # Positioned strictly outside/below the island rim so they add fantasy floating depth without blocking any camera!
    bm_clouds = bmesh.new()
    cloud_specs = [
        (36.0, 26.0, -11.5, 5.2, 3.6, 1.8),
        (-37.0, 24.0, -12.0, 5.6, 3.8, 1.9),
        (35.0, -27.0, -11.8, 5.0, 3.5, 1.7),
        (-36.0, -25.0, -11.2, 5.4, 3.7, 1.8),
        (0.0, 42.0, -13.5, 6.2, 4.0, 2.0),
        (0.0, -42.0, -14.2, 5.8, 3.8, 1.9),
        (43.0, 0.0, -13.0, 4.4, 6.0, 1.9),
        (-43.0, 0.0, -12.8, 4.5, 6.2, 1.9),
    ]
    for cx, cy, cz, rx, ry, rz in cloud_specs:
        # 3 overlapping soft cloud lobes per bank
        for ox, oy, oz, sc in ((0.0, 0.0, 0.0, 1.0), (rx * 0.48, ry * 0.2, -0.3, 0.72), (-rx * 0.45, -ry * 0.22, -0.25, 0.68)):
            bmesh.ops.create_icosphere(
                bm_clouds, subdivisions=2, radius=1.0,
                matrix=Matrix.Translation((cx + ox, cy + oy, cz + oz)) @ Matrix.Diagonal((rx * sc, ry * sc, rz * sc, 1.0)),
            )
    objs.append(mesh_from_bmesh(bm_clouds, 'Props_Floating_Cloud_Ring', col, mats['cloud'], smooth=True))

    return objs
