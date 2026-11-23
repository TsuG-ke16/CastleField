"""AAA-Detailed Island_Base, Central_Plaza, Bridges, Roads, and Water builders.

Coordinate system:
  Z-up, 1 unit = 1m.
  Origin (0, 0, 0) = center surface of Central Plaza (neutral zone).
  North = +Y (Kingdom, terrace Z = 3.0)
  West  = -X (Forest Alliance, terrace Z = 2.2)
  East  = +X (Demon Army, terrace Z = 2.4)
  South = -Y (Dragon Empire, terrace Z = 2.2)
  Water surface = Z = -1.65 (Ring Moat R=7.8..11.4 + 4 diagonal rivers -> 4 tiered waterfalls).
"""

import math
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

LAYOUT = {
    'plaza_radius': 7.5,
    'moat_inner': 7.8,
    'moat_outer': 11.4,
    'water_z': -1.65,
    'bridge_start': 7.35,
    'bridge_end': 12.35,
    'stair_start': 13.4,
    'stair_end': 17.2,
    'castles': {
        'kingdom': {
            'dir': (0, 1),
            'angle_deg': 90.0,
            'terrace_z': 3.0,
            'gate_pos': (0.0, 17.6, 3.0),
            'center': (0.0, 22.4, 3.0),
            'facing': (0.0, -1.0, 0.0),
        },
        'forest': {
            'dir': (-1, 0),
            'angle_deg': 180.0,
            'terrace_z': 2.2,
            'gate_pos': (-17.6, 0.0, 2.2),
            'center': (-22.2, 0.0, 2.2),
            'facing': (1.0, 0.0, 0.0),
        },
        'demon': {
            'dir': (1, 0),
            'angle_deg': 0.0,
            'terrace_z': 2.4,
            'gate_pos': (17.6, 0.0, 2.4),
            'center': (22.4, 0.0, 2.4),
            'facing': (-1.0, 0.0, 0.0),
        },
        'dragon': {
            'dir': (0, -1),
            'angle_deg': -90.0,
            'terrace_z': 2.2,
            'gate_pos': (0.0, -17.6, 2.2),
            'center': (0.0, -22.4, 2.2),
            'facing': (0.0, 1.0, 0.0),
        },
    },
}


def smoothstep(edge0, edge1, x):
    if edge1 == edge0:
        return 0.0 if x < edge0 else 1.0
    t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


def island_outer_radius(theta):
    """4-lobed clover floating island rim with organic rocky promontories & diagonal waterfall notches."""
    lobe = math.cos(4.0 * theta)
    base = 28.5 + 2.45 * lobe
    notch_damp = 0.25 + 0.75 * (0.5 + 0.5 * lobe)
    jitter = (
        (fbm_noise(math.cos(theta) * 3.8, math.sin(theta) * 3.8) - 0.5) * 2.1
        + math.sin(theta * 16.0) * 0.35
    ) * notch_damp
    return base + jitter


def faction_weights(x, y):
    r = math.hypot(x, y)
    if r < 1e-4:
        return (0.25, 0.25, 0.25, 0.25)
    nx, ny = x / r, y / r
    w_n = max(0.0, ny) ** 1.65
    w_s = max(0.0, -ny) ** 1.65
    w_e = max(0.0, nx) ** 1.65
    w_w = max(0.0, -nx) ** 1.65
    s = w_n + w_s + w_e + w_w + 1e-6
    return (w_n / s, w_w / s, w_e / s, w_s / s)


def terrain_height(x, y):
    """Continuous heightfield Z(x, y) with flat castle pads, stair clearance, moat, and river gorges."""
    r = math.hypot(x, y)
    theta = math.atan2(y, x)
    rim_r = island_outer_radius(theta)

    w_k, w_f, w_d, w_dr = faction_weights(x, y)
    biome_z = w_k * 3.0 + w_f * 2.2 + w_d * 2.4 + w_dr * 2.2
    hill = (fbm_noise(x * 0.17, y * 0.17) - 0.5) * 1.25

    pad_blend = 0.0
    pad_target_z = biome_z
    for name, cfg in LAYOUT['castles'].items():
        dx, dy = cfg['dir']
        along = x * dx + y * dy
        perp = abs(-x * dy + y * dx)
        tz = cfg['terrace_z']
        a_in = smoothstep(16.7, 17.7, along) * (1.0 - smoothstep(26.8, 29.2, along))
        p_in = 1.0 - smoothstep(6.2, 8.9, perp)
        w = a_in * p_in
        if w > pad_blend:
            pad_blend = w
            pad_target_z = tz

    outer_z = biome_z * 0.72 + 0.28 + hill
    outer_z = outer_z * (1.0 - pad_blend) + pad_target_z * pad_blend

    # Approach staircase ramp support cleanly 0.38m below stone stair treads
    ramp_blend = 0.0
    ramp_z = outer_z
    for name, cfg in LAYOUT['castles'].items():
        dx, dy = cfg['dir']
        along = x * dx + y * dy
        perp = abs(-x * dy + y * dx)
        if 10.8 < along < 18.6 and perp < 4.5:
            tz = cfg['terrace_z']
            t_along = smoothstep(13.3, 17.4, along)
            desired_z = -0.20 * (1.0 - t_along) + (tz - 0.42) * t_along
            w_p = 1.0 - smoothstep(2.2, 4.3, perp)
            w_a = smoothstep(11.0, 12.2, along) * (1.0 - smoothstep(17.5, 18.5, along))
            w = w_p * w_a
            if w > ramp_blend:
                ramp_blend = w
                ramp_z = desired_z
    z = outer_z * (1.0 - ramp_blend) + ramp_z * ramp_blend

    # Ring Moat & Plaza cutout
    if r < 12.9:
        plaza_w = 1.0 - smoothstep(7.35, 8.05, r)
        moat_w = smoothstep(7.55, 8.25, r) * (1.0 - smoothstep(10.85, 12.6, r))
        z = z * (1.0 - moat_w) + (-2.55) * moat_w
        z = z * (1.0 - plaza_w) + (-2.15) * plaza_w

    # 4 Diagonal river gorges
    if r > 10.0:
        d_diag = abs(abs(x) - abs(y)) / math.sqrt(2.0)
        river_half = 1.48 + 0.38 * smoothstep(20.0, 27.0, r)
        gorge_w = (1.0 - smoothstep(river_half, river_half + 2.5, d_diag)) * smoothstep(10.2, 11.8, r)
        z = z * (1.0 - gorge_w) + (-2.55) * gorge_w

    # Gentle rim overhang bevel (excluding river lips)
    rim_drop = smoothstep(rim_r - 2.1, rim_r, r) * 0.58
    d_diag = abs(abs(x) - abs(y)) / math.sqrt(2.0)
    in_river = 1.0 - smoothstep(1.5, 3.0, d_diag)
    z -= rim_drop * (1.0 - in_river)
    return z


def add_fantasy_lantern(bm_iron, bm_glow, pos, scale=1.0):
    """Ornate wrought-iron fantasy street lantern with cage ribs, tiered roof cap, and glowing amber core."""
    x, y, z = pos
    # Iron base collar
    bmesh.ops.create_cone(
        bm_iron, cap_ends=True, cap_tris=False, segments=6,
        radius1=0.22 * scale, radius2=0.16 * scale, depth=0.14 * scale,
        matrix=Matrix.Translation((x, y, z + 0.07 * scale)),
    )
    # Glowing lantern glass prism
    bmesh.ops.create_cone(
        bm_glow, cap_ends=True, cap_tris=False, segments=6,
        radius1=0.15 * scale, radius2=0.19 * scale, depth=0.40 * scale,
        matrix=Matrix.Translation((x, y, z + 0.34 * scale)),
    )
    # 4 Iron corner cage struts
    for i in range(4):
        a = i * math.pi * 0.5 + math.pi * 0.25
        sx = x + 0.19 * scale * math.cos(a)
        sy = y + 0.19 * scale * math.sin(a)
        bmesh.ops.create_cube(
            bm_iron, size=1.0,
            matrix=Matrix.Translation((sx, sy, z + 0.34 * scale)) @ Matrix.Diagonal((0.04 * scale, 0.04 * scale, 0.44 * scale, 1.0)),
        )
    # Flared eaves cap + finial spike
    bmesh.ops.create_cone(
        bm_iron, cap_ends=True, cap_tris=False, segments=6,
        radius1=0.31 * scale, radius2=0.04 * scale, depth=0.24 * scale,
        matrix=Matrix.Translation((x, y, z + 0.66 * scale)),
    )
    bmesh.ops.create_icosphere(
        bm_iron, subdivisions=1, radius=0.055 * scale,
        matrix=Matrix.Translation((x, y, z + 0.80 * scale)),
    )


def build_island_base(col, mats):
    """High-res 4-biome terrain plateau, stratified craggy underside, terrace retaining walls, and 14 floating islets."""
    objs = []

    # --- 1. High-resolution polar terrain mesh (192 x 26) ---
    n_ang = 192
    top_radii_fracs = [
        0.0, 0.06, 0.12, 0.18, 0.24, 0.27, 0.30, 0.34, 0.38, 0.41, 0.44,
        0.48, 0.52, 0.56, 0.60, 0.64, 0.68, 0.72, 0.76, 0.80, 0.84, 0.88, 0.92, 0.96, 0.985, 1.0
    ]

    bm_top = bmesh.new()
    center_v = bm_top.verts.new((0.0, 0.0, terrain_height(0.0, 0.0)))
    rings = []
    rim_coords = []

    for ri, frac in enumerate(top_radii_fracs[1:]):
        ring = []
        for ai in range(n_ang):
            th = (2.0 * math.pi * ai) / n_ang
            rim_r = island_outer_radius(th)
            r = rim_r * frac
            x = r * math.cos(th)
            y = r * math.sin(th)
            z = terrain_height(x, y)
            v = bm_top.verts.new((x, y, z))
            ring.append(v)
            if ri == len(top_radii_fracs) - 2:
                rim_coords.append((x, y, z, th, rim_r))
        rings.append(ring)

    for ai in range(n_ang):
        an = (ai + 1) % n_ang
        bm_top.faces.new((center_v, rings[0][ai], rings[0][an]))
    for ri in range(len(rings) - 1):
        r0, r1 = rings[ri], rings[ri + 1]
        for ai in range(n_ang):
            an = (ai + 1) % n_ang
            bm_top.faces.new((r0[ai], r1[ai], r1[an], r0[an]))

    col_k_grass = hex_rgba('#6EC04A')
    col_k_sun = hex_rgba('#92D45A')
    col_k_stone = hex_rgba('#D4CBB6')
    col_f_moss = hex_rgba('#348432')
    col_f_deep = hex_rgba('#1D4F23')
    col_d_slate = hex_rgba('#433466')
    col_d_dark = hex_rgba('#22183A')
    col_dr_rock = hex_rgba('#753623')
    col_dr_ash = hex_rgba('#43211B')
    col_bed = hex_rgba('#1D586E')
    col_bank = hex_rgba('#7E7565')

    def top_color(co, n):
        x, y, z = co.x, co.y, co.z
        w_k, w_f, w_d, w_dr = faction_weights(x, y)
        nv = fbm_noise(x * 0.30, y * 0.30, z * 0.25)
        c_k = lerp_rgba(col_k_grass, col_k_sun, nv * 0.55)
        c_k = lerp_rgba(c_k, col_k_stone, smoothstep(2.72, 3.05, z) * 0.38)
        c_f = lerp_rgba(col_f_deep, col_f_moss, 0.30 + nv * 0.70)
        c_d = lerp_rgba(col_d_dark, col_d_slate, 0.28 + nv * 0.72)
        c_dr = lerp_rgba(col_dr_ash, col_dr_rock, 0.28 + nv * 0.72)
        c = tuple(w_k * c_k[i] + w_f * c_f[i] + w_d * c_d[i] + w_dr * c_dr[i] for i in range(4))
        if z < -1.10:
            c = lerp_rgba(c, col_bed, smoothstep(-1.10, -2.35, z) * 0.88)
        elif abs(n.z) < 0.74:
            c = lerp_rgba(c, col_bank, (0.74 - abs(n.z)) * 1.15)
        return c

    bm_top.normal_update()
    paint_vertex_colors(bm_top, top_color)
    objs.append(mesh_from_bmesh(bm_top, 'Island_Top_Terrain', col, mats['island_top'], smooth=True))

    # --- 2. Deeply Stratified Craggy Floating Island Underside (192 x 12 levels + sculpted rock columns!) ---
    bm_bot = bmesh.new()
    # (radial_scale, z_level, crag_amp, strata_step)
    under_levels = [
        (1.00, 0.0, 0.0, 0.0),       # Exact lock with top rim
        (1.035, -1.25, 0.75, 0.25),  # Dramatic overhanging rocky cliff brow
        (0.97, -2.85, 1.35, -0.35),  # Upper rock notch
        (0.99, -4.40, 1.65, 0.35),   # Mid-upper rock strata shelf!
        (0.89, -6.40, 2.05, -0.30),  # Deep fractured vertical cliff ribs
        (0.79, -8.60, 2.15, 0.25),   # Mid strata ledge
        (0.66, -10.85, 1.95, -0.25), # Narrowing craggy cone
        (0.51, -13.10, 1.60, 0.20),  # Deep rocky core
        (0.35, -15.20, 1.15, -0.15), # Lower crag
        (0.19, -17.10, 0.65, 0.10),  # Tapered rocky spire root
        (0.08, -18.50, 0.30, 0.0),   # Tip collar
    ]
    bot_rings = []
    for li, (r_sc, z_lvl, crag, s_step) in enumerate(under_levels):
        ring = []
        for ai, (rx, ry, rz, th, rim_r) in enumerate(rim_coords):
            if li == 0:
                v = bm_bot.verts.new((rx, ry, rz))
            else:
                # Multi-frequency vertical canyon flutes & blocky geological rock strata!
                rib = (
                    math.sin(th * 16.0 + li * 0.45) * 0.42
                    + math.cos(th * 9.0 - li * 0.35) * 0.38
                    + math.sin(th * 27.0 + li * 0.9) * 0.20
                )
                n_val = (fbm_noise(math.cos(th) * 5.2 + li * 0.8, math.sin(th) * 5.2 - li * 0.7) - 0.5) * 2.0
                r_curr = rim_r * r_sc + (rib * 0.62 + n_val * 0.38) * crag + s_step
                z_curr = z_lvl + n_val * (crag * 0.38)
                if li == 1:
                    z_curr = min(rz - 0.65, z_curr)
                v = bm_bot.verts.new((r_curr * math.cos(th), r_curr * math.sin(th), z_curr))
            ring.append(v)
        bot_rings.append(ring)

    tip_v = bm_bot.verts.new((0.0, 0.0, -19.8))
    for li in range(len(bot_rings) - 1):
        r0, r1 = bot_rings[li], bot_rings[li + 1]
        for ai in range(n_ang):
            an = (ai + 1) % n_ang
            bm_bot.faces.new((r0[ai], r0[an], r1[an], r1[ai]))
    last_ring = bot_rings[-1]
    for ai in range(n_ang):
        an = (ai + 1) % n_ang
        bm_bot.faces.new((last_ring[ai], last_ring[an], tip_v))

    # Sculpted irregular craggy rock buttress ribs & broad central stalactite mass (organic, never spiky!)
    buttress_specs = [
        (0, 17.5, -2.8, 5.2, 11.2, 0.08),
        (24, 20.5, -2.5, 3.8, 8.2, -0.06),
        (-24, 20.5, -2.5, 3.7, 8.6, 0.07),
        (90, 17.5, -2.7, 5.4, 11.5, 0.06),
        (66, 20.5, -2.4, 3.9, 8.0, -0.05),
        (114, 20.5, -2.4, 3.8, 8.4, 0.06),
        (180, 17.5, -2.8, 5.3, 11.4, -0.07),
        (156, 20.5, -2.5, 3.8, 8.1, 0.05),
        (204, 20.5, -2.5, 3.9, 8.8, -0.06),
        (270, 17.5, -2.8, 5.4, 11.6, 0.08),
        (246, 20.5, -2.5, 3.8, 8.3, -0.07),
        (294, 20.5, -2.5, 3.9, 8.5, 0.05),
        (45, 11.5, -6.5, 4.8, 10.5, 0.04),
        (135, 11.5, -6.5, 4.7, 10.2, -0.04),
        (225, 11.5, -6.5, 4.9, 10.8, 0.05),
        (315, 11.5, -6.5, 4.8, 10.4, -0.05),
    ]
    for deg, rad, bz, tr, dep, tilt in buttress_specs:
        a = math.radians(deg)
        px, py = rad * math.cos(a), rad * math.sin(a)
        m = Matrix.Translation((px, py, bz - dep * 0.5)) @ Matrix.Rotation(a, 4, 'Z') @ Matrix.Rotation(tilt, 4, 'Y')
        ret = bmesh.ops.create_cone(
            bm_bot, cap_ends=True, cap_tris=False, segments=8,
            radius1=0.75, radius2=tr, depth=dep, matrix=m,
        )
        for v in ret['verts']:
            nv = (fbm_noise(v.co.x * 0.45, v.co.y * 0.45, v.co.z * 0.45) - 0.5) * 1.05
            v.co.x += nv
            v.co.y -= nv * 0.8

    col_rock_top = hex_rgba('#938D7F')
    col_rock_mid = hex_rgba('#676E7A')
    col_rock_deep = hex_rgba('#434B5B')
    col_moss_edge = hex_rgba('#4C8A3C')
    col_volcanic_edge = hex_rgba('#693427')
    col_demon_edge = hex_rgba('#42335C')

    def bot_color(co, n):
        t = smoothstep(0.0, -18.5, co.z)
        nv = fbm_noise(co.x * 0.28, co.y * 0.28, co.z * 0.42)
        strata = 0.5 + 0.5 * math.sin(co.z * 1.45 + nv * 2.0)
        c = lerp_rgba(col_rock_top, col_rock_mid, smoothstep(0.0, 0.42, t))
        c = lerp_rgba(c, col_rock_deep, smoothstep(0.42, 1.0, t))
        c = lerp_rgba(c, col_rock_top, strata * 0.16)
        if co.z > -4.8:
            w_k, w_f, w_d, w_dr = faction_weights(co.x, co.y)
            brow_t = (1.0 - smoothstep(-0.4, -4.8, co.z)) * 0.58
            tint = tuple(
                w_k * col_moss_edge[i] + w_f * col_moss_edge[i]
                + w_d * col_demon_edge[i] + w_dr * col_volcanic_edge[i]
                for i in range(4)
            )
            c = lerp_rgba(c, tint, brow_t)
        return c

    bm_bot.normal_update()
    paint_vertex_colors(bm_bot, bot_color)
    objs.append(mesh_from_bmesh(bm_bot, 'Island_Cliff_Underside', col, mats['island_rock'], smooth=False))

    # --- 3. Sculpted Castle Terrace Retaining Embankment Walls (bridges terrain & architecture!) ---
    bm_ret = bmesh.new()
    for name, cfg in LAYOUT['castles'].items():
        dx, dy = cfg['dir']
        tz = cfg['terrace_z']
        rot_z = math.atan2(dy, dx)
        xform = Matrix.Rotation(rot_z, 4, 'Z')
        # Stepped masonry retaining wall along the inner moat-facing cliff edge on left & right of staircase
        for side in (-1.0, 1.0):
            for seg_i in range(4):
                yl = side * (3.15 + seg_i * 1.45)
                xl = 16.55 - seg_i * 0.18
                h_wall = tz + 1.85
                m = xform @ Matrix.Translation((xl, yl, tz - h_wall * 0.5 - 0.05)) @ Matrix.Rotation(side * -0.14, 4, 'Z')
                bmesh.ops.create_cube(bm_ret, size=1.0, matrix=m @ Matrix.Diagonal((1.35, 1.55, h_wall, 1.0)))
                # Protruding stone buttress pier every second segment
                if seg_i % 2 == 0:
                    mb = xform @ Matrix.Translation((xl - 0.55, yl, tz - h_wall * 0.5 - 0.25))
                    bmesh.ops.create_cube(bm_ret, size=1.0, matrix=mb @ Matrix.Diagonal((0.75, 0.65, h_wall - 0.35, 1.0)))

    ret_tints = {
        'k': hex_rgba('#CFC6B4'),
        'f': hex_rgba('#788068'),
        'd': hex_rgba('#392F4D'),
        'dr': hex_rgba('#54352E'),
    }

    def ret_col(co, n):
        w_k, w_f, w_d, w_dr = faction_weights(co.x, co.y)
        c = tuple(
            w_k * ret_tints['k'][i] + w_f * ret_tints['f'][i]
            + w_d * ret_tints['d'][i] + w_dr * ret_tints['dr'][i]
            for i in range(4)
        )
        nv = fbm_noise(co.x * 1.2, co.y * 1.2, co.z * 1.1)
        return lerp_rgba(hex_rgba('#282428'), c, 0.55 + 0.45 * nv)

    bm_ret.normal_update()
    paint_vertex_colors(bm_ret, ret_col)
    objs.append(mesh_from_bmesh(bm_ret, 'Island_Terrace_RetainingWalls', col, mats['retaining_stone'], smooth=False))

    # --- 4. 14 Detailed Floating Satellite Rock Islets (with stepped rock caps & hanging roots/crystals) ---
    bm_iso = bmesh.new()
    islet_specs = [
        (34.2, 13.5, -5.8, 2.9, 6.0),
        (-33.8, 13.2, -6.4, 2.8, 5.6),
        (33.5, -14.8, -7.2, 2.7, 5.8),
        (-33.6, -14.2, -6.2, 3.0, 5.5),
        (15.5, 34.8, -7.2, 2.4, 5.0),
        (-15.2, 34.5, -8.4, 2.5, 5.2),
        (14.8, -34.2, -7.8, 2.4, 5.1),
        (-15.8, -33.8, -6.8, 2.7, 5.4),
        (25.2, 26.2, -10.8, 2.0, 4.2),
        (-25.5, 25.8, -11.2, 1.9, 4.0),
        (25.0, -25.8, -11.5, 2.0, 4.3),
        (-25.4, -25.2, -10.6, 2.1, 4.4),
        (38.0, 1.5, -11.0, 1.7, 3.8),
        (-38.0, -1.5, -10.4, 1.8, 3.9),
    ]
    for ix, iy, iz, irad, ih in islet_specs:
        ret1 = bmesh.ops.create_cone(
            bm_iso, cap_ends=True, cap_tris=False, segments=8,
            radius1=0.22, radius2=irad, depth=ih,
            matrix=Matrix.Translation((ix, iy, iz - ih * 0.5)),
        )
        ret2 = bmesh.ops.create_cone(
            bm_iso, cap_ends=True, cap_tris=False, segments=8,
            radius1=irad * 1.06, radius2=irad * 0.72, depth=ih * 0.24,
            matrix=Matrix.Translation((ix, iy, iz + ih * 0.12)),
        )
        # Side rock shelf chunk
        ret3 = bmesh.ops.create_cone(
            bm_iso, cap_ends=True, cap_tris=False, segments=6,
            radius1=0.18, radius2=irad * 0.52, depth=ih * 0.55,
            matrix=Matrix.Translation((ix + irad * 0.55, iy - irad * 0.35, iz - ih * 0.38)),
        )
        for v in set(ret1['verts'] + ret2['verts'] + ret3['verts']):
            nv = (fbm_noise(v.co.x * 0.65, v.co.y * 0.65, v.co.z * 0.65) - 0.5) * 0.55
            v.co.x += nv
            v.co.y += nv * 0.75

    bm_iso.normal_update()
    paint_vertex_colors(
        bm_iso,
        lambda co, n: lerp_rgba(col_rock_mid, col_moss_edge, smoothstep(0.50, 0.88, n.z) * 0.80),
    )
    objs.append(mesh_from_bmesh(bm_iso, 'Island_Floating_Islets', col, mats['island_rock'], smooth=False))
    return objs


def build_central_plaza(col, mats):
    """Ornate neutral Central Plaza with individual radial flagstones, turned balustrade, gold compass rose & iron lanterns."""
    objs = []
    R = LAYOUT['plaza_radius']

    # --- 1. Stepped Stone Foundation & Individual Radial Flagstone Paving Rings ---
    bm_deck = bmesh.new()
    # Submerged foundation drum
    bmesh.ops.create_cone(
        bm_deck, cap_ends=True, cap_tris=False, segments=64,
        radius1=R + 0.72, radius2=R + 0.42, depth=2.35,
        matrix=Matrix.Translation((0.0, 0.0, -1.525)),
    )
    # Molded overhanging cornice ring around top of plaza drum
    bmesh.ops.create_cone(
        bm_deck, cap_ends=True, cap_tris=False, segments=64,
        radius1=R + 0.48, radius2=R + 0.22, depth=0.38,
        matrix=Matrix.Translation((0.0, 0.0, -0.19)),
    )
    # Recessed stone buttress pilasters around plaza base
    for i in range(16):
        a = (2.0 * math.pi * i) / 16.0
        px = (R + 0.42) * math.cos(a)
        py = (R + 0.42) * math.sin(a)
        bmesh.ops.create_cube(
            bm_deck, size=1.0,
            matrix=Matrix.Translation((px, py, -1.35)) @ Matrix.Rotation(a, 4, 'Z') @ Matrix.Diagonal((0.42, 0.55, 2.2, 1.0)),
        )

    # Individual sculpted radial paving flagstones (3 concentric rings!)
    paving_rings = [
        (4.85, 5.75, 24),
        (5.80, 6.62, 32),
        (6.67, 7.22, 36),
    ]
    for r_in, r_out, count in paving_rings:
        gap_a = 0.014
        for i in range(count):
            a0 = (2.0 * math.pi * i) / count + gap_a
            a1 = (2.0 * math.pi * (i + 1)) / count - gap_a
            am = 0.5 * (a0 + a1)
            rm = 0.5 * (r_in + r_out)
            h_tile = 0.045 + 0.015 * ((i * 7 + count) % 3)
            ca0, sa0 = math.cos(a0), math.sin(a0)
            ca1, sa1 = math.cos(a1), math.sin(a1)
            v0 = bm_deck.verts.new((r_in * ca0, r_in * sa0, 0.0))
            v1 = bm_deck.verts.new((r_out * ca0, r_out * sa0, 0.0))
            v2 = bm_deck.verts.new((r_out * ca1, r_out * sa1, 0.0))
            v3 = bm_deck.verts.new((r_in * ca1, r_in * sa1, 0.0))
            v4 = bm_deck.verts.new((r_in * ca0, r_in * sa0, h_tile))
            v5 = bm_deck.verts.new((r_out * ca0, r_out * sa0, h_tile))
            v6 = bm_deck.verts.new((r_out * ca1, r_out * sa1, h_tile))
            v7 = bm_deck.verts.new((r_in * ca1, r_in * sa1, h_tile))
            bm_deck.faces.new((v4, v5, v6, v7))
            bm_deck.faces.new((v0, v1, v5, v4))
            bm_deck.faces.new((v1, v2, v6, v5))
            bm_deck.faces.new((v2, v3, v7, v6))
            bm_deck.faces.new((v3, v0, v4, v7))

    # Inner circular medallion terrace slab
    bmesh.ops.create_cone(
        bm_deck, cap_ends=True, cap_tris=False, segments=48,
        radius1=4.82, radius2=4.74, depth=0.06,
        matrix=Matrix.Translation((0.0, 0.0, 0.03)),
    )

    c_sand_hi = hex_rgba('#EAE0CE')
    c_sand_mid = hex_rgba('#D3C5AD')
    c_sand_lo = hex_rgba('#9A9081')

    def plaza_col(co, n):
        if co.z < -0.36:
            return lerp_rgba(c_sand_lo, c_sand_mid, smoothstep(-2.6, -0.4, co.z) * 0.55)
        nv = fbm_noise(co.x * 1.35, co.y * 1.35, co.z * 5.0)
        return lerp_rgba(c_sand_mid, c_sand_hi, 0.30 + 0.70 * nv)

    bm_deck.normal_update()
    paint_vertex_colors(bm_deck, plaza_col)
    objs.append(mesh_from_bmesh(bm_deck, 'Plaza_Main_Deck', col, mats['plaza_stone'], smooth=False))

    # --- 2. Classical Turned-Baluster Stone Parapet around the 4 Plaza Quadrants ---
    bm_trim = bmesh.new()
    bm_iron = bmesh.new()
    bm_glow = bmesh.new()
    gap_half_rad = math.asin(2.18 / R)

    for q in range(4):
        a0 = q * (math.pi * 0.5) + gap_half_rad
        a1 = (q + 1) * (math.pi * 0.5) - gap_half_rad
        segs = 12
        r_in, r_out = R - 0.36, R + 0.08
        # Lower base curb (0.0 .. 0.24) + upper handrail coping (0.64 .. 0.78)
        for z_lo, z_hi in ((0.0, 0.24), (0.64, 0.78)):
            verts_ring = []
            for s in range(segs + 1):
                a = a0 + (a1 - a0) * (s / segs)
                ca, sa = math.cos(a), math.sin(a)
                verts_ring.append((
                    bm_trim.verts.new((r_in * ca, r_in * sa, z_lo)),
                    bm_trim.verts.new((r_out * ca, r_out * sa, z_lo)),
                    bm_trim.verts.new((r_out * ca, r_out * sa, z_hi)),
                    bm_trim.verts.new((r_in * ca, r_in * sa, z_hi)),
                ))
            for s in range(segs):
                av, bv = verts_ring[s], verts_ring[s + 1]
                bm_trim.faces.new((av[0], bv[0], bv[3], av[3]))
                bm_trim.faces.new((av[1], av[2], bv[2], bv[1]))
                bm_trim.faces.new((av[3], bv[3], bv[2], av[2]))
                bm_trim.faces.new((av[0], av[1], bv[1], bv[0]))
            bm_trim.faces.new((verts_ring[0][0], verts_ring[0][3], verts_ring[0][2], verts_ring[0][1]))
            bm_trim.faces.new((verts_ring[-1][0], verts_ring[-1][1], verts_ring[-1][2], verts_ring[-1][3]))

        # Individual turned stone balusters between curb and handrail!
        r_mid = 0.5 * (r_in + r_out)
        for bi in range(1, 10):
            a = a0 + (a1 - a0) * (bi / 10.0)
            bx, by = r_mid * math.cos(a), r_mid * math.sin(a)
            bmesh.ops.create_cone(
                bm_trim, cap_ends=True, cap_tris=False, segments=8,
                radius1=0.09, radius2=0.12, depth=0.22,
                matrix=Matrix.Translation((bx, by, 0.35)),
            )
            bmesh.ops.create_cone(
                bm_trim, cap_ends=True, cap_tris=False, segments=8,
                radius1=0.12, radius2=0.08, depth=0.20,
                matrix=Matrix.Translation((bx, by, 0.54)),
            )

        # Two carved lantern pedestals near ends of each quadrant (8 total, strictly neutral!)
        for end_t in (0.14, 0.86):
            a = a0 + (a1 - a0) * end_t
            lx, ly = r_mid * math.cos(a), r_mid * math.sin(a)
            bmesh.ops.create_cube(
                bm_trim, size=1.0,
                matrix=Matrix.Translation((lx, ly, 0.48)) @ Matrix.Rotation(a, 4, 'Z') @ Matrix.Diagonal((0.54, 0.54, 0.96, 1.0)),
            )
            bmesh.ops.create_cube(
                bm_trim, size=1.0,
                matrix=Matrix.Translation((lx, ly, 1.02)) @ Matrix.Rotation(a, 4, 'Z') @ Matrix.Diagonal((0.64, 0.64, 0.14, 1.0)),
            )
            add_fantasy_lantern(bm_iron, bm_glow, (lx, ly, 1.09), scale=1.18)

    objs.append(mesh_from_bmesh(bm_trim, 'Plaza_Balustrade_And_Piers', col, mats['plaza_trim'], smooth=False))
    objs.append(mesh_from_bmesh(bm_iron, 'Plaza_Lantern_Iron', col, mats['iron_dark'], smooth=False))
    objs.append(mesh_from_bmesh(bm_glow, 'Plaza_Lantern_Glow', col, mats['glow_warm'], smooth=True))

    # --- 3. Ornate Neutral Multi-Layer Golden & Bronze Compass Rose ---
    bm_gold = bmesh.new()
    bm_bronze = bmesh.new()

    def add_ring(bm, r_mid, w, z0, h, segs=48):
        r0, r1 = r_mid - w * 0.5, r_mid + w * 0.5
        rv = []
        for s in range(segs):
            a = 2.0 * math.pi * s / segs
            ca, sa = math.cos(a), math.sin(a)
            rv.append((
                bm.verts.new((r0 * ca, r0 * sa, z0)),
                bm.verts.new((r1 * ca, r1 * sa, z0)),
                bm.verts.new((r1 * ca, r1 * sa, z0 + h)),
                bm.verts.new((r0 * ca, r0 * sa, z0 + h)),
            ))
        for s in range(segs):
            av, bv = rv[s], rv[(s + 1) % segs]
            bm.faces.new((av[3], bv[3], bv[2], av[2]))
            bm.faces.new((av[1], av[2], bv[2], bv[1]))
            bm.faces.new((av[0], bv[0], bv[3], av[3]))

    add_ring(bm_gold, 4.62, 0.26, 0.05, 0.10, 48)
    add_ring(bm_bronze, 4.28, 0.18, 0.05, 0.08, 48)
    add_ring(bm_gold, 3.45, 0.18, 0.05, 0.09, 48)
    add_ring(bm_bronze, 1.45, 0.20, 0.06, 0.11, 36)

    # 16 Compass degree pips around outer bronze ring
    for i in range(16):
        a = (2.0 * math.pi * i) / 16.0
        bmesh.ops.create_cube(
            bm_gold, size=1.0,
            matrix=Matrix.Translation((4.28 * math.cos(a), 4.28 * math.sin(a), 0.13)) @ Matrix.Rotation(a, 4, 'Z') @ Matrix.Diagonal((0.32, 0.12, 0.09, 1.0)),
        )

    # 8 Sculpted beveled 3D Compass Rose star points + 8 fine intermediate bronze rays
    for i in range(8):
        ang = i * (math.pi * 0.25)
        is_major = (i % 2 == 0)
        tip_r = 4.35 if is_major else 3.25
        side_w = 0.56 if is_major else 0.38
        crest_z = 0.24 if is_major else 0.18
        ca, sa = math.cos(ang), math.sin(ang)
        pa, psa = -sa, ca
        vc = bm_gold.verts.new((0.0, 0.0, crest_z + 0.06))
        vt = bm_gold.verts.new((tip_r * ca, tip_r * sa, 0.08))
        vl = bm_gold.verts.new((1.05 * ca + side_w * pa, 1.05 * sa + side_w * psa, 0.08))
        vr = bm_gold.verts.new((1.05 * ca - side_w * pa, 1.05 * sa - side_w * psa, 0.08))
        bm_gold.faces.new((vc, vl, vt))
        bm_gold.faces.new((vc, vt, vr))
        bm_gold.faces.new((vl, vr, vt))

    for i in range(8):
        ang = (i + 0.5) * (math.pi * 0.25)
        ca, sa = math.cos(ang), math.sin(ang)
        pa, psa = -sa, ca
        vc = bm_bronze.verts.new((0.0, 0.0, 0.15))
        vt = bm_bronze.verts.new((2.25 * ca, 2.25 * sa, 0.07))
        vl = bm_bronze.verts.new((0.8 * ca + 0.20 * pa, 0.8 * sa + 0.20 * psa, 0.07))
        vr = bm_bronze.verts.new((0.8 * ca - 0.20 * pa, 0.8 * sa - 0.20 * psa, 0.07))
        bm_bronze.faces.new((vc, vl, vt))
        bm_bronze.faces.new((vc, vt, vr))

    # Central sculpted sun medallion boss
    bmesh.ops.create_cone(
        bm_bronze, cap_ends=True, cap_tris=False, segments=16,
        radius1=0.72, radius2=0.55, depth=0.14,
        matrix=Matrix.Translation((0.0, 0.0, 0.14)),
    )
    bmesh.ops.create_icosphere(
        bm_gold, subdivisions=2, radius=0.42,
        matrix=Matrix.Translation((0.0, 0.0, 0.22)) @ Matrix.Diagonal((1.0, 1.0, 0.45, 1.0)),
    )

    objs.append(mesh_from_bmesh(bm_gold, 'Plaza_Compass_Gold', col, mats['plaza_gold'], smooth=False))
    objs.append(mesh_from_bmesh(bm_bronze, 'Plaza_Compass_Bronze', col, mats['plaza_bronze'], smooth=False))
    return objs


def build_bridges(col, mats):
    """Build 4 hero arched stone bridges with 3D radial arch voussoirs, keystones, cutwaters, and iron lanterns."""
    objs = []
    r0 = LAYOUT['bridge_start']
    r1 = LAYOUT['bridge_end']
    span = r1 - r0
    road_half = 1.85
    parapet_w = 0.38
    total_half = road_half + parapet_w

    for name, cfg in LAYOUT['castles'].items():
        dx, dy = cfg['dir']
        rot_z = math.atan2(dy, dx)
        xform = Matrix.Rotation(rot_z, 4, 'Z')

        bm_stone = bmesh.new()
        bm_trim = bmesh.new()
        bm_iron = bmesh.new()
        bm_glow = bmesh.new()

        segs = 18
        sections = []
        for s in range(segs + 1):
            u = s / segs
            xl = r0 + span * u
            z_deck = (0.0 * (1.0 - u) + 0.20 * u) + 0.40 * math.sin(math.pi * u)
            if u <= 0.13 or u >= 0.87:
                z_bot = -2.95
            else:
                ua = (u - 0.13) / 0.74
                z_bot = -2.65 + 2.30 * (math.sin(math.pi * ua) ** 0.72)
            sections.append((
                bm_stone.verts.new(xform @ Vector((xl, -total_half, z_bot))),
                bm_stone.verts.new(xform @ Vector((xl, total_half, z_bot))),
                bm_stone.verts.new(xform @ Vector((xl, total_half, z_deck))),
                bm_stone.verts.new(xform @ Vector((xl, -total_half, z_deck))),
                xl, z_deck, z_bot,
            ))

        for s in range(segs):
            a, b = sections[s], sections[s + 1]
            bm_stone.faces.new((a[3], a[2], b[2], b[3]))
            bm_stone.faces.new((a[0], b[0], b[1], a[1]))
            bm_stone.faces.new((a[0], a[3], b[3], b[0]))
            bm_stone.faces.new((a[1], b[1], b[2], a[2]))
        bm_stone.faces.new((sections[0][0], sections[0][1], sections[0][2], sections[0][3]))
        bm_stone.faces.new((sections[-1][0], sections[-1][3], sections[-1][2], sections[-1][1]))

        # Individual slightly raised cobblestone deck courses along the bridge arch
        for s in range(segs):
            xl_m = 0.5 * (sections[s][4] + sections[s + 1][4])
            zd_m = 0.5 * (sections[s][5] + sections[s + 1][5])
            slope = math.atan2(sections[s + 1][5] - sections[s][5], sections[s + 1][4] - sections[s][4])
            m_cob = xform @ Matrix.Translation((xl_m, 0.0, zd_m + 0.015)) @ Matrix.Rotation(-slope, 4, 'Y')
            bmesh.ops.create_cube(bm_stone, size=1.0, matrix=m_cob @ Matrix.Diagonal((span / segs * 0.88, road_half * 1.94, 0.05, 1.0)))

        # Pointed V-shaped masonry cutwater piers extending into the water at both abutments!
        for end_x in (r0 + 0.45, r1 - 0.45):
            for side in (-1.0, 1.0):
                mc = xform @ Matrix.Translation((end_x, side * (total_half + 0.25), -1.65)) @ Matrix.Rotation(math.pi * 0.25, 4, 'Z')
                bmesh.ops.create_cone(bm_stone, cap_ends=True, cap_tris=False, segments=4, radius1=0.68, radius2=0.52, depth=2.6, matrix=mc)

        # 3D Protruding Radial Arch Voussoirs + Prominent Central Keystone on BOTH sides of bridge!
        for side in (-1.0, 1.0):
            ys = side * (total_half + 0.06)
            for vi in range(3, segs - 2):
                xl_m = 0.5 * (sections[vi][4] + sections[vi + 1][4])
                zb_m = 0.5 * (sections[vi][6] + sections[vi + 1][6])
                ang_a = math.atan2(sections[vi + 1][6] - sections[vi][6], sections[vi + 1][4] - sections[vi][4])
                is_key = (vi == segs // 2 or vi == segs // 2 - 1)
                vh = 0.46 if is_key else 0.34
                vw = 0.34 if is_key else 0.24
                mv = xform @ Matrix.Translation((xl_m, ys, zb_m + vh * 0.45)) @ Matrix.Rotation(-ang_a, 4, 'Y')
                bmesh.ops.create_cube(bm_trim, size=1.0, matrix=mv @ Matrix.Diagonal((vw, 0.18 if is_key else 0.12, vh, 1.0)))

        # Panelled Stone Parapets with Beveled Coping & Ornate Corner Pedestals + Iron Lanterns
        for side in (-1.0, 1.0):
            y_in = side * road_half
            y_out = side * total_half
            y_lo, y_hi = (y_out, y_in) if side < 0 else (y_in, y_out)
            p_secs = []
            c_secs = []
            for s in range(segs + 1):
                xl, zd = sections[s][4], sections[s][5]
                h_p = 0.68
                p_secs.append((
                    bm_stone.verts.new(xform @ Vector((xl, y_lo, zd - 0.04))),
                    bm_stone.verts.new(xform @ Vector((xl, y_hi, zd - 0.04))),
                    bm_stone.verts.new(xform @ Vector((xl, y_hi, zd + h_p))),
                    bm_stone.verts.new(xform @ Vector((xl, y_lo, zd + h_p))),
                ))
                # Overhanging molded coping stone cap
                c_secs.append((
                    bm_trim.verts.new(xform @ Vector((xl, y_lo - 0.05, zd + h_p))),
                    bm_trim.verts.new(xform @ Vector((xl, y_hi + 0.05, zd + h_p))),
                    bm_trim.verts.new(xform @ Vector((xl, y_hi + 0.05, zd + h_p + 0.11))),
                    bm_trim.verts.new(xform @ Vector((xl, y_lo - 0.05, zd + h_p + 0.11))),
                ))
            for bm_target, sec_list in ((bm_stone, p_secs), (bm_trim, c_secs)):
                for s in range(segs):
                    a, b = sec_list[s], sec_list[s + 1]
                    bm_target.faces.new((a[3], a[2], b[2], b[3]))
                    bm_target.faces.new((a[0], a[3], b[3], b[0]))
                    bm_target.faces.new((a[1], b[1], b[2], a[2]))
                bm_target.faces.new((sec_list[0][0], sec_list[0][1], sec_list[0][2], sec_list[0][3]))
                bm_target.faces.new((sec_list[-1][0], sec_list[-1][3], sec_list[-1][2], sec_list[-1][1]))

            # Bridge center stone pilaster + end pedestals + ornate wrought-iron lanterns
            yc = side * (road_half + parapet_w * 0.5)
            bmesh.ops.create_cube(
                bm_trim, size=1.0,
                matrix=xform @ Matrix.Translation((0.5 * (r0 + r1), yc, 0.50 + 0.44)) @ Matrix.Diagonal((0.46, 0.54, 0.92, 1.0)),
            )
            for xl_p, zd_p in ((r0 + 0.25, 0.05), (r1 - 0.25, 0.24)):
                bmesh.ops.create_cube(
                    bm_trim, size=1.0,
                    matrix=xform @ Matrix.Translation((xl_p, yc, zd_p + 0.52)) @ Matrix.Diagonal((0.58, 0.58, 1.08, 1.0)),
                )
                bmesh.ops.create_cube(
                    bm_trim, size=1.0,
                    matrix=xform @ Matrix.Translation((xl_p, yc, zd_p + 1.12)) @ Matrix.Diagonal((0.68, 0.68, 0.14, 1.0)),
                )
                p_world = xform @ Vector((xl_p, yc, zd_p + 1.19))
                add_fantasy_lantern(bm_iron, bm_glow, p_world, scale=1.12)

        c_hi = hex_rgba('#E3D9C7')
        c_lo = hex_rgba('#8E8475')
        bm_stone.normal_update()
        paint_vertex_colors(
            bm_stone,
            lambda co, n: lerp_rgba(
                c_lo, c_hi,
                smoothstep(-2.4, 0.65, co.z) * (0.72 + 0.28 * fbm_noise(co.x * 1.25, co.y * 1.25, co.z)),
            ),
        )
        objs.append(mesh_from_bmesh(bm_stone, f'Bridge_{name.capitalize()}', col, mats['bridge_stone'], smooth=False))
        objs.append(mesh_from_bmesh(bm_trim, f'Bridge_{name.capitalize()}_Trim', col, mats['plaza_trim'], smooth=False))
        objs.append(mesh_from_bmesh(bm_iron, f'Bridge_{name.capitalize()}_Iron', col, mats['iron_dark'], smooth=False))
        objs.append(mesh_from_bmesh(bm_glow, f'Bridge_{name.capitalize()}_Lanterns', col, mats['glow_warm'], smooth=True))

    return objs


def build_roads(col, mats):
    """Build 4 cobblestone approach roads, beveled grand staircases, and unique faction threshold pillars."""
    objs = []
    r_bridge_end = LAYOUT['bridge_end']
    r_stair_start = LAYOUT['stair_start']
    r_stair_end = LAYOUT['stair_end']

    faction_glow = {
        'kingdom': 'glow_warm',
        'forest': 'glow_forest',
        'demon': 'glow_demon',
        'dragon': 'glow_dragon',
    }
    faction_road_tint = {
        'kingdom': (hex_rgba('#EFE8DA'), hex_rgba('#C2B8A5')),
        'forest': (hex_rgba('#C2BD9F'), hex_rgba('#798760')),
        'demon': (hex_rgba('#645385'), hex_rgba('#352B4A')),
        'dragon': (hex_rgba('#966253'), hex_rgba('#59352B')),
    }

    for name, cfg in LAYOUT['castles'].items():
        dx, dy = cfg['dir']
        tz = cfg['terrace_z']
        rot_z = math.atan2(dy, dx)
        xform = Matrix.Rotation(rot_z, 4, 'Z')

        bm_road = bmesh.new()
        bm_accent = bmesh.new()
        bm_glow = bmesh.new()

        # 1. Cobblestone approach landing connecting bridge end to stair foot
        landing_len = (r_stair_start + 0.15) - (r_bridge_end - 0.25)
        landing_mid = 0.5 * ((r_bridge_end - 0.25) + (r_stair_start + 0.15))
        bmesh.ops.create_cube(
            bm_road, size=1.0,
            matrix=xform @ Matrix.Translation((landing_mid, 0.0, -0.35)) @ Matrix.Diagonal((landing_len, 4.18, 1.12, 1.0)),
        )
        # Sculpted flagstone slabs on landing
        for row_i in range(3):
            rx = r_bridge_end + 0.15 + row_i * 0.36
            for col_i in range(4):
                ry = -1.35 + col_i * 0.90 + (0.15 if row_i % 2 else -0.15)
                bmesh.ops.create_cube(
                    bm_road, size=1.0,
                    matrix=xform @ Matrix.Translation((rx, ry, 0.22)) @ Matrix.Diagonal((0.31, 0.80, 0.05, 1.0)),
                )

        # 2. Solid Grand Stone Staircase with Overhanging Beveled Step Nosings
        n_steps = 14 if name == 'kingdom' else 12
        stair_span = r_stair_end - r_stair_start
        step_d = stair_span / n_steps
        z0 = 0.20
        dz = tz - z0
        for i in range(n_steps):
            t0 = i / n_steps
            t1 = (i + 1) / n_steps
            xc = r_stair_start + (i + 0.5) * step_d
            z_top = z0 + dz * t1
            z_bot = z0 + dz * t0 - 1.55
            h = z_top - z_bot
            bmesh.ops.create_cube(
                bm_road, size=1.0,
                matrix=xform @ Matrix.Translation((xc, 0.0, z_bot + h * 0.5)) @ Matrix.Diagonal((step_d * 1.10, 3.88, h, 1.0)),
            )
            # Subtle overhanging front nosing lip on each step
            bmesh.ops.create_cube(
                bm_road, size=1.0,
                matrix=xform @ Matrix.Translation((xc - step_d * 0.06, 0.0, z_top - 0.02)) @ Matrix.Diagonal((step_d * 1.06, 3.96, 0.06, 1.0)),
            )

        # 3. Stepped Flanking Balustrades + Unique Faction Threshold Gate Pillars at top of stairs!
        for side in (-1.0, 1.0):
            yc = side * 2.15
            segs = 8
            b_secs = []
            for s in range(segs + 1):
                u = s / segs
                xl = (r_stair_start - 0.15) + (stair_span + 0.35) * u
                zl = z0 + dz * u
                b_secs.append((
                    bm_road.verts.new(xform @ Vector((xl, yc - 0.26, zl - 1.4))),
                    bm_road.verts.new(xform @ Vector((xl, yc + 0.26, zl - 1.4))),
                    bm_road.verts.new(xform @ Vector((xl, yc + 0.26, zl + 0.72))),
                    bm_road.verts.new(xform @ Vector((xl, yc - 0.26, zl + 0.72))),
                ))
            for s in range(segs):
                a, b = b_secs[s], b_secs[s + 1]
                bm_road.faces.new((a[3], a[2], b[2], b[3]))
                bm_road.faces.new((a[0], a[3], b[3], b[0]))
                bm_road.faces.new((a[1], b[1], b[2], a[2]))
            bm_road.faces.new((b_secs[0][0], b_secs[0][1], b_secs[0][2], b_secs[0][3]))
            bm_road.faces.new((b_secs[-1][0], b_secs[-1][3], b_secs[-1][2], b_secs[-1][1]))

            # Mid-stair decorative stone newel block
            xm = r_stair_start + stair_span * 0.5
            zm = z0 + dz * 0.5
            bmesh.ops.create_cube(
                bm_road, size=1.0,
                matrix=xform @ Matrix.Translation((xm, yc, zm + 0.42)) @ Matrix.Diagonal((0.58, 0.62, 0.92, 1.0)),
            )

            # Top Threshold Pillar customized by faction!
            xt = r_stair_end + 0.12
            bmesh.ops.create_cube(
                bm_road, size=1.0,
                matrix=xform @ Matrix.Translation((xt, yc, tz + 0.62)) @ Matrix.Diagonal((0.72, 0.72, 1.32, 1.0)),
            )
            p_top = xform @ Vector((xt, yc, tz + 1.28))
            if name == 'kingdom':
                add_fantasy_lantern(bm_accent, bm_glow, p_top, scale=1.22)
            elif name == 'forest':
                # Curved wooden lantern bracket + warm glowing amber orb
                bmesh.ops.create_cone(bm_accent, cap_ends=True, cap_tris=False, segments=7, radius1=0.22, radius2=0.10, depth=0.75, matrix=Matrix.Translation((p_top.x, p_top.y, p_top.z + 0.35)))
                bmesh.ops.create_icosphere(bm_glow, subdivisions=2, radius=0.30, matrix=Matrix.Translation((p_top.x, p_top.y, p_top.z + 0.85)))
            elif name == 'demon':
                # Floating faceted amethyst crystal shard above obsidian obelisk!
                bmesh.ops.create_cone(bm_accent, cap_ends=True, cap_tris=False, segments=4, radius1=0.38, radius2=0.14, depth=0.55, matrix=Matrix.Translation((p_top.x, p_top.y, p_top.z + 0.25)))
                bmesh.ops.create_cone(bm_glow, cap_ends=True, cap_tris=False, segments=5, radius1=0.24, radius2=0.02, depth=0.75, matrix=Matrix.Translation((p_top.x, p_top.y, p_top.z + 1.15)))
                bmesh.ops.create_cone(bm_glow, cap_ends=True, cap_tris=False, segments=5, radius1=0.02, radius2=0.24, depth=0.45, matrix=Matrix.Translation((p_top.x, p_top.y, p_top.z + 0.55)))
            else:
                # Dragon: Iron fire bowl + sculpted roaring flame tongues!
                bmesh.ops.create_cone(bm_accent, cap_ends=True, cap_tris=False, segments=8, radius1=0.28, radius2=0.52, depth=0.38, matrix=Matrix.Translation((p_top.x, p_top.y, p_top.z + 0.19)))
                bmesh.ops.create_cone(bm_glow, cap_ends=True, cap_tris=False, segments=6, radius1=0.32, radius2=0.02, depth=0.95, matrix=Matrix.Translation((p_top.x, p_top.y, p_top.z + 0.72)))

        # 4. Castle Gate Forecourt Paving (connects top of stairs seamlessly into castle gatehouse)
        bmesh.ops.create_cube(
            bm_road, size=1.0,
            matrix=xform @ Matrix.Translation((r_stair_end + 1.45, 0.0, tz - 0.48)) @ Matrix.Diagonal((3.2, 6.6, 1.0, 1.0)),
        )

        c_hi, c_lo = faction_road_tint[name]
        bm_road.normal_update()
        paint_vertex_colors(
            bm_road,
            lambda co, n, hi=c_hi, lo=c_lo: lerp_rgba(
                lo, hi, 0.30 + 0.58 * fbm_noise(co.x * 1.45, co.y * 1.45, co.z * 0.95)
            ),
        )
        accent_mat = {
            'kingdom': mats['gold'],
            'forest': mats['forest_wood'],
            'demon': mats['demon_trim'],
            'dragon': mats['iron_dark'],
        }[name]
        objs.append(mesh_from_bmesh(bm_road, f'Road_Stairs_{name.capitalize()}', col, mats['road_stone'], smooth=False))
        objs.append(mesh_from_bmesh(bm_accent, f'Road_Pillars_{name.capitalize()}', col, accent_mat, smooth=False))
        objs.append(mesh_from_bmesh(bm_glow, f'Road_Lanterns_{name.capitalize()}', col, mats[faction_glow[name]], smooth=True))

    return objs


def build_water(col, mats):
    """Build coherent water system: Ring Moat, shoreline foam rings, 4 spring cascades, 4 diagonal rivers, 4 multi-curtain waterfalls."""
    objs = []
    wz = LAYOUT['water_z']

    # --- 1. High-resolution Ring Moat Surface ---
    bm_w = bmesh.new()
    bm_foam = bmesh.new()
    n_ang = 128
    r_rings = [7.35, 8.05, 8.85, 9.7, 10.6, 11.4, 11.95]
    rings = []
    for r in r_rings:
        ring = []
        for ai in range(n_ang):
            a = 2.0 * math.pi * ai / n_ang
            x, y = r * math.cos(a), r * math.sin(a)
            ripple = 0.03 * math.sin(x * 2.1 + y * 1.7) + 0.015 * math.cos(r * 3.5)
            ring.append(bm_w.verts.new((x, y, wz + ripple)))
        rings.append(ring)
    for ri in range(len(rings) - 1):
        for ai in range(n_ang):
            an = (ai + 1) % n_ang
            bm_w.faces.new((rings[ri][ai], rings[ri + 1][ai], rings[ri + 1][an], rings[ri][an]))

    # Subtle white shoreline ripple collar hugging the Central Plaza drum wall
    collar_r0, collar_r1 = 7.72, 8.05
    c_ring0, c_ring1 = [], []
    for ai in range(n_ang):
        a = 2.0 * math.pi * ai / n_ang
        wiggle = 0.08 * math.sin(a * 16.0)
        c_ring0.append(bm_foam.verts.new((collar_r0 * math.cos(a), collar_r0 * math.sin(a), wz + 0.035)))
        c_ring1.append(bm_foam.verts.new(((collar_r1 + wiggle) * math.cos(a), (collar_r1 + wiggle) * math.sin(a), wz + 0.02)))
    for ai in range(n_ang):
        an = (ai + 1) % n_ang
        bm_foam.faces.new((c_ring0[ai], c_ring1[ai], c_ring1[an], c_ring0[an]))

    # --- 2. Four Diagonal River Channels + Spring Inlets + Multi-Curtain Waterfalls ---
    diag_angles = [math.pi * 0.25, math.pi * 0.75, -math.pi * 0.75, -math.pi * 0.25]
    bm_fall = bmesh.new()

    for idx, ang in enumerate(diag_angles):
        xform = Matrix.Rotation(ang, 4, 'Z')
        rim_r = island_outer_radius(ang)
        r_lip = rim_r - 0.12

        # River channel water mesh
        u_segs = 24
        v_segs = 6
        grid = []
        for ui in range(u_segs + 1):
            u = ui / u_segs
            xl = 11.2 + (r_lip - 11.2) * u
            half_w = 1.65 + 0.48 * u
            row = []
            for vi in range(v_segs + 1):
                vt = (vi / v_segs) * 2.0 - 1.0
                yl = vt * half_w
                ripple = 0.035 * math.sin(xl * 1.9 + yl * 2.4)
                row.append(bm_w.verts.new(xform @ Vector((xl, yl, wz + ripple))))
            grid.append(row)
        for ui in range(u_segs):
            for vi in range(v_segs):
                bm_w.faces.new((grid[ui][vi], grid[ui + 1][vi], grid[ui + 1][vi + 1], grid[ui][vi + 1]))

        # Organic turbulent foam ripples accelerating gently into the waterfall lip (no straight bars!)
        for k, (rx_off, ry_off, rad_x, rad_y) in enumerate([
            (-1.2, -0.95, 0.72, 0.34), (-0.8, 0.15, 0.85, 0.42), (-1.4, 1.05, 0.68, 0.32),
            (-2.6, -0.45, 0.55, 0.24), (-2.3, 0.65, 0.58, 0.25),
        ]):
            bmesh.ops.create_icosphere(
                bm_foam, subdivisions=1, radius=1.0,
                matrix=xform @ Matrix.Translation((r_lip + rx_off, ry_off, wz + 0.02)) @ Matrix.Diagonal((rad_x, rad_y, 0.04, 1.0)),
            )

        # Tiered rocky spring inlets feeding the river head cleanly
        for bank_sign in (-1.0, 1.0):
            bmesh.ops.create_cone(
                bm_foam, cap_ends=True, cap_tris=False, segments=8,
                radius1=0.35, radius2=0.14, depth=0.72,
                matrix=xform @ Matrix.Translation((12.85, bank_sign * 1.92, wz + 0.16)) @ Matrix.Rotation(bank_sign * 0.72, 4, 'X'),
            )
            bmesh.ops.create_cone(
                bm_foam, cap_ends=True, cap_tris=False, segments=12,
                radius1=0.58, radius2=0.32, depth=0.05,
                matrix=xform @ Matrix.Translation((12.85, bank_sign * 1.52, wz + 0.03)),
            )

        # Main Parabolic Waterfall Curtain (rich turquoise core)
        wf_u, wf_v = 22, 10
        wf_grid = []
        lip_w = 2.05
        fall_h = 14.5
        for ui in range(wf_u + 1):
            t = ui / wf_u
            xl = r_lip + 2.55 * (t ** 0.72)
            zl = wz - fall_h * (t ** 1.60)
            hw = lip_w * (1.0 + 0.30 * t)
            row = []
            for vi in range(wf_v + 1):
                vt = (vi / wf_v) * 2.0 - 1.0
                yl = vt * hw
                flute = 0.22 * math.sin(vt * math.pi * 4.0) * math.sin(t * math.pi)
                row.append(bm_fall.verts.new(xform @ Vector((xl + flute, yl, zl))))
            wf_grid.append(row)
        for ui in range(wf_u):
            for vi in range(wf_v):
                bm_fall.faces.new((wf_grid[ui][vi], wf_grid[ui + 1][vi], wf_grid[ui + 1][vi + 1], wf_grid[ui][vi + 1]))

        # Organic wavy tapered foam wisps cascading down the waterfall (varied widths & waviness!)
        for s_idx, (streak_y, t_start, t_end, base_w) in enumerate([
            (-1.25, 0.0, 0.78, 0.14),
            (-0.42, 0.05, 0.92, 0.18),
            (0.38, 0.0, 0.85, 0.15),
            (1.18, 0.08, 0.72, 0.13),
        ]):
            st_grid = []
            for ui in range(12):
                u_s = ui / 11.0
                t = t_start + (t_end - t_start) * u_s
                xl = r_lip + 2.66 * (t ** 0.72) + 0.10
                zl = wz - fall_h * (t ** 1.60)
                wiggle = 0.14 * math.sin(u_s * math.pi * 2.5 + s_idx * 1.7)
                yc = streak_y * (1.0 + 0.22 * t) + wiggle
                # Taper smoothly to zero at top & bottom of wisp
                hw = base_w * (0.25 + 0.95 * math.sin(u_s * math.pi))
                st_grid.append((
                    bm_foam.verts.new(xform @ Vector((xl, yc - hw, zl))),
                    bm_foam.verts.new(xform @ Vector((xl, yc + hw, zl))),
                ))
            for ui in range(11):
                bm_foam.faces.new((st_grid[ui][0], st_grid[ui + 1][0], st_grid[ui + 1][1], st_grid[ui][1]))

        # Sculpted waterfall lip foam crest & layered bottom mist spray plumes
        for k in range(8):
            yk = -1.75 + 0.50 * k
            bmesh.ops.create_icosphere(
                bm_foam, subdivisions=2, radius=0.30 + 0.08 * (k % 2),
                matrix=xform @ Matrix.Translation((r_lip + 0.24, yk, wz + 0.05)) @ Matrix.Diagonal((1.0, 1.35, 0.34, 1.0)),
            )
        for k in range(6):
            yk = -2.0 + 0.80 * k
            bmesh.ops.create_icosphere(
                bm_foam, subdivisions=2, radius=1.25 + 0.28 * (k % 2),
                matrix=xform @ Matrix.Translation((r_lip + 2.55, yk, wz - fall_h + 0.95)) @ Matrix.Diagonal((1.2, 1.3, 0.68, 1.0)),
            )

    objs.append(mesh_from_bmesh(bm_w, 'Water_Moat_And_Rivers', col, mats['water'], smooth=True))
    objs.append(mesh_from_bmesh(bm_fall, 'Water_Four_Waterfalls', col, mats['waterfall'], smooth=True))
    objs.append(mesh_from_bmesh(bm_foam, 'Water_Foam_And_Springs', col, mats['foam'], smooth=True))
    return objs
