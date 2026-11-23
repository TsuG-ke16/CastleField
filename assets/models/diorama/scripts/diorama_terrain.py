"""Island_Base, Central_Plaza, Bridges, Roads, and Water builders for Castle Field Diorama.

Coordinate system:
  Z-up, 1 unit = 1m.
  Origin (0, 0, 0) = center surface of the Central Plaza.
  North = +Y (Kingdom, terrace Z = 3.0)
  West  = -X (Forest Alliance, terrace Z = 2.2)
  East  = +X (Demon Army, terrace Z = 2.4)
  South = -Y (Dragon Empire, terrace Z = 2.2)
  Water surface = Z = -1.65 (Ring Moat R=7.8..11.4 + 4 diagonal channels -> 4 waterfalls).
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

# Shared spatial constants exported for castles, nature, cameras, and JSON metadata
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
    """4-lobed clover floating island rim radius (promontories at N/S/E/W, waterfall notches at diagonals)."""
    lobe = math.cos(4.0 * theta)  # +1 at cardinal axes, -1 at diagonals
    base = 28.4 + 2.35 * lobe
    # Subtle organic rock variation that stays clean near waterfall notches
    notch_damp = 0.35 + 0.65 * (0.5 + 0.5 * lobe)
    jitter = (fbm_noise(math.cos(theta) * 3.2, math.sin(theta) * 3.2) - 0.5) * 1.6 * notch_damp
    return base + jitter


def faction_weights(x, y):
    """Smooth biome weights (kingdom_N, forest_W, demon_E, dragon_S) summing to 1."""
    r = math.hypot(x, y)
    if r < 1e-4:
        return (0.25, 0.25, 0.25, 0.25)
    nx, ny = x / r, y / r
    w_n = max(0.0, ny) ** 1.6
    w_s = max(0.0, -ny) ** 1.6
    w_e = max(0.0, nx) ** 1.6
    w_w = max(0.0, -nx) ** 1.6
    s = w_n + w_s + w_e + w_w + 1e-6
    return (w_n / s, w_w / s, w_e / s, w_s / s)


def terrain_height(x, y):
    """Continuous heightfield Z(x, y) for the island plateau, moat, rivers, ramps, and castle terraces."""
    r = math.hypot(x, y)
    theta = math.atan2(y, x)
    rim_r = island_outer_radius(theta)

    # 1. Base outer biome terrace height
    w_k, w_f, w_d, w_dr = faction_weights(x, y)
    biome_z = w_k * 3.0 + w_f * 2.2 + w_d * 2.4 + w_dr * 2.2

    # Natural gentle hills away from roads and terraces
    hill = (fbm_noise(x * 0.16, y * 0.16) - 0.5) * 1.15

    # Determine distance into each castle flat pad
    pad_blend = 0.0
    pad_target_z = biome_z
    for name, cfg in LAYOUT['castles'].items():
        dx, dy = cfg['dir']
        # Local coordinates: along (outward from center), perp (lateral)
        along = x * dx + y * dy
        perp = abs(-x * dy + y * dx)
        tz = cfg['terrace_z']
        # Flat terrace pad: along in [17.4, 27.6], perp <= 7.8 (starts past stair top to prevent grass poking through stairs!)
        a_in = smoothstep(16.6, 17.6, along) * (1.0 - smoothstep(26.8, 29.2, along))
        p_in = 1.0 - smoothstep(6.2, 8.8, perp)
        w = a_in * p_in
        if w > pad_blend:
            pad_blend = w
            pad_target_z = tz

    # Start with outer plateau
    outer_z = biome_z * 0.72 + 0.25 + hill
    outer_z = outer_z * (1.0 - pad_blend) + pad_target_z * pad_blend

    # 2. Approach staircase ramp support along cardinal axes (sits cleanly 0.35m BELOW stone stair treads!)
    ramp_blend = 0.0
    ramp_z = outer_z
    for name, cfg in LAYOUT['castles'].items():
        dx, dy = cfg['dir']
        along = x * dx + y * dy
        perp = abs(-x * dy + y * dx)
        if along > 10.8 and along < 18.6 and perp < 4.4:
            tz = cfg['terrace_z']
            t_along = smoothstep(13.3, 17.4, along)
            desired_z = -0.18 * (1.0 - t_along) + (tz - 0.38) * t_along
            w_p = 1.0 - smoothstep(2.2, 4.2, perp)
            w_a = smoothstep(11.0, 12.2, along) * (1.0 - smoothstep(17.5, 18.5, along))
            w = w_p * w_a
            if w > ramp_blend:
                ramp_blend = w
                ramp_z = desired_z
    z = outer_z * (1.0 - ramp_blend) + ramp_z * ramp_blend

    # 3. Ring Moat & Central Plaza pedestal cutout
    if r < 12.8:
        # Plaza pedestal recess inside r < 7.75
        plaza_w = 1.0 - smoothstep(7.35, 8.05, r)
        # Moat bed between 7.75 and 11.45
        moat_w = smoothstep(7.55, 8.25, r) * (1.0 - smoothstep(10.85, 12.6, r))
        z = z * (1.0 - moat_w) + (-2.55) * moat_w
        z = z * (1.0 - plaza_w) + (-2.15) * plaza_w

    # 4. Four diagonal river gorges (along |x| == |y|, r > 10.2)
    if r > 10.0:
        d_diag = abs(abs(x) - abs(y)) / math.sqrt(2.0)
        # River gorge widens slightly near waterfall lip
        river_half = 1.45 + 0.35 * smoothstep(20.0, 27.0, r)
        gorge_w = (1.0 - smoothstep(river_half, river_half + 2.6, d_diag)) * smoothstep(10.2, 11.8, r)
        z = z * (1.0 - gorge_w) + (-2.55) * gorge_w

    # 5. Subtle rim bevel down slightly right at cliff lip (except river notches which stay at bed)
    rim_drop = smoothstep(rim_r - 2.0, rim_r, r) * 0.55
    d_diag = abs(abs(x) - abs(y)) / math.sqrt(2.0)
    in_river = 1.0 - smoothstep(1.5, 3.0, d_diag)
    z -= rim_drop * (1.0 - in_river)

    return z


def build_island_base(col, mats):
    """Build manifold 3D floating island top terrain + sculpted craggy underside + floating islets."""
    objs = []

    # --- 1. Polar grid for seamless top plateau + waterfall gorges + craggy underside ---
    n_ang = 128
    # Radial rings from r=0 out to rim (t=1.0), then cliff skirt & underside tapering down to bottom tip
    top_radii_fracs = [
        0.0, 0.08, 0.16, 0.24, 0.275, 0.31, 0.36, 0.40, 0.44,
        0.49, 0.54, 0.60, 0.66, 0.72, 0.78, 0.84, 0.90, 0.955, 1.0
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

    # Center fan
    for ai in range(n_ang):
        a_next = (ai + 1) % n_ang
        bm_top.faces.new((center_v, rings[0][ai], rings[0][a_next]))

    # Concentric quad strips
    for ri in range(len(rings) - 1):
        r0 = rings[ri]
        r1 = rings[ri + 1]
        for ai in range(n_ang):
            a_next = (ai + 1) % n_ang
            bm_top.faces.new((r0[ai], r1[ai], r1[a_next], r0[a_next]))

    # Vertex color the top biomes cleanly (high contrast between all 4 biomes!)
    col_k_grass = hex_rgba('#6BB849')
    col_k_stone = hex_rgba('#D2CBB6')
    col_f_moss = hex_rgba('#358032')
    col_f_deep = hex_rgba('#1F5224')
    col_d_slate = hex_rgba('#433663')
    col_d_dark = hex_rgba('#251C3D')
    col_dr_rock = hex_rgba('#6B3424')
    col_dr_ash = hex_rgba('#42211B')
    col_bed = hex_rgba('#2A647A')
    col_bank = hex_rgba('#7C7466')

    def top_color(co, n):
        x, y, z = co.x, co.y, co.z
        w_k, w_f, w_d, w_dr = faction_weights(x, y)
        nv = fbm_noise(x * 0.28, y * 0.28, z * 0.2)
        c_k = lerp_rgba(col_k_grass, col_k_stone, smoothstep(2.75, 3.05, z) * 0.35 + nv * 0.18)
        c_f = lerp_rgba(col_f_deep, col_f_moss, 0.35 + nv * 0.65)
        c_d = lerp_rgba(col_d_dark, col_d_slate, 0.3 + nv * 0.7)
        c_dr = lerp_rgba(col_dr_ash, col_dr_rock, 0.3 + nv * 0.7)
        c = tuple(
            w_k * c_k[i] + w_f * c_f[i] + w_d * c_d[i] + w_dr * c_dr[i]
            for i in range(4)
        )
        # Water bed & wet rock transition
        if z < -1.15:
            wet_t = smoothstep(-1.15, -2.35, z)
            c = lerp_rgba(c, col_bed, wet_t * 0.85)
        elif abs(n.z) < 0.72:
            # Steep slope -> rock bank tint
            c = lerp_rgba(c, col_bank, (0.72 - abs(n.z)) * 1.1)
        return c

    bm_top.normal_update()
    paint_vertex_colors(bm_top, top_color)
    top_obj = mesh_from_bmesh(bm_top, 'Island_Top_Terrain', col, mats['island_top'], smooth=True)
    objs.append(top_obj)

    # --- 2. Sculpted Floating Island Cliff Rim & Craggy Underside (Closed manifold bottom!) ---
    bm_bot = bmesh.new()
    # Levels: (radial_scale, z_offset_or_target, rock_crag_amp)
    under_levels = [
        (1.00, 0.0, 0.0),      # exact rim lock with top terrain
        (1.02, -1.6, 0.65),    # overhanging rocky brow
        (0.95, -4.0, 1.35),    # upper cliff strata
        (0.82, -7.2, 1.85),    # jagged mid cliff ribs
        (0.62, -10.8, 1.75),   # narrowing rock cone
        (0.38, -14.2, 1.25),   # deep crag
        (0.16, -16.8, 0.65),   # lower spire
    ]
    bot_rings = []
    for li, (r_sc, z_lvl, crag) in enumerate(under_levels):
        ring = []
        for ai, (rx, ry, rz, th, rim_r) in enumerate(rim_coords):
            if li == 0:
                v = bm_bot.verts.new((rx, ry, rz))
            else:
                # Faceted vertical crag ridges + horizontal strata steps
                ridge = math.sin(th * 12.0 + li * 0.7) * 0.45 + math.cos(th * 7.0 - li * 0.5) * 0.55
                n_val = (fbm_noise(math.cos(th) * 4.5 + li, math.sin(th) * 4.5 - li) - 0.5) * 2.0
                r_curr = rim_r * r_sc + (ridge * 0.6 + n_val * 0.4) * crag
                z_curr = z_lvl + n_val * (crag * 0.45)
                if li == 1:
                    z_curr = min(rz - 0.8, z_curr)
                v = bm_bot.verts.new((r_curr * math.cos(th), r_curr * math.sin(th), z_curr))
            ring.append(v)
        bot_rings.append(ring)

    # Bottom tip vertex closing the manifold underside
    tip_v = bm_bot.verts.new((0.0, 0.0, -18.8))

    for li in range(len(bot_rings) - 1):
        r0 = bot_rings[li]
        r1 = bot_rings[li + 1]
        for ai in range(n_ang):
            a_next = (ai + 1) % n_ang
            # Outward winding for underside
            bm_bot.faces.new((r0[ai], r0[a_next], r1[a_next], r1[ai]))

    last_ring = bot_rings[-1]
    for ai in range(n_ang):
        a_next = (ai + 1) % n_ang
        bm_bot.faces.new((last_ring[ai], last_ring[a_next], tip_v))

    # Add sculpted craggy rock buttress spikes hanging under the 4 faction promontories
    for name, cfg in LAYOUT['castles'].items():
        dx, dy = cfg['dir']
        for side in (-1.0, 0.0, 1.0):
            px = dx * 21.0 + (-dy) * side * 6.5
            py = dy * 21.0 + dx * side * 6.5
            rad = 3.2 if side == 0.0 else 2.2
            depth = 10.5 if side == 0.0 else 7.8
            ret = bmesh.ops.create_cone(
                bm_bot,
                cap_ends=True,
                cap_tris=False,
                segments=7,
                radius1=0.25,
                radius2=rad,
                depth=depth,
                matrix=Matrix.Translation((px, py, -3.2 - depth * 0.5)),
            )
            for v in ret['verts']:
                nv = (fbm_noise(v.co.x * 0.4, v.co.y * 0.4, v.co.z * 0.4) - 0.5) * 0.8
                v.co.x += nv
                v.co.y -= nv * 0.8

    col_rock_top = hex_rgba('#8C877B')
    col_rock_mid = hex_rgba('#636A75')
    col_rock_deep = hex_rgba('#454D5C')
    col_moss_edge = hex_rgba('#4E873C')
    col_volcanic_edge = hex_rgba('#593129')
    col_demon_edge = hex_rgba('#3F3354')

    def bot_color(co, n):
        t = smoothstep(0.0, -17.5, co.z)
        nv = fbm_noise(co.x * 0.25, co.y * 0.25, co.z * 0.35)
        c = lerp_rgba(col_rock_top, col_rock_mid, smoothstep(0.0, 0.45, t))
        c = lerp_rgba(c, col_rock_deep, smoothstep(0.45, 1.0, t))
        # Biome tint near upper cliff brow
        if co.z > -4.5:
            w_k, w_f, w_d, w_dr = faction_weights(co.x, co.y)
            brow_t = (1.0 - smoothstep(-0.5, -4.5, co.z)) * 0.55
            tint = tuple(
                w_k * col_moss_edge[i] + w_f * col_moss_edge[i]
                + w_d * col_demon_edge[i] + w_dr * col_volcanic_edge[i]
                for i in range(4)
            )
            c = lerp_rgba(c, tint, brow_t)
        # Subtle strata variation
        c = lerp_rgba(c, col_rock_deep, (1.0 - nv) * 0.22)
        return c

    bm_bot.normal_update()
    paint_vertex_colors(bm_bot, bot_color)
    bot_obj = mesh_from_bmesh(bm_bot, 'Island_Cliff_Underside', col, mats['island_rock'], smooth=False)
    objs.append(bot_obj)

    # --- 3. Floating Satellite Rock Islets around the lower floating perimeter ---
    bm_iso = bmesh.new()
    islet_specs = [
        (33.5, 14.0, -6.5, 2.6, 5.2),
        (-33.0, 13.5, -7.2, 2.4, 4.8),
        (32.5, -15.5, -8.0, 2.5, 5.5),
        (-32.8, -14.8, -6.8, 2.7, 5.0),
        (16.0, 34.0, -7.8, 2.1, 4.5),
        (-15.5, 33.8, -9.2, 2.3, 4.8),
        (15.0, -33.5, -8.5, 2.2, 4.6),
        (-16.2, -33.2, -7.4, 2.5, 5.1),
        (24.5, 25.5, -11.5, 1.8, 3.8),
        (-25.0, -24.5, -12.0, 1.9, 4.0),
    ]
    for ix, iy, iz, irad, ih in islet_specs:
        # Upper cap + lower craggy cone
        ret_cone = bmesh.ops.create_cone(
            bm_iso, cap_ends=True, cap_tris=False, segments=7,
            radius1=0.22, radius2=irad, depth=ih,
            matrix=Matrix.Translation((ix, iy, iz - ih * 0.5)),
        )
        ret_cap = bmesh.ops.create_cone(
            bm_iso, cap_ends=True, cap_tris=False, segments=7,
            radius1=irad * 1.03, radius2=irad * 0.62, depth=ih * 0.22,
            matrix=Matrix.Translation((ix, iy, iz + ih * 0.11)),
        )
        for v in set(ret_cone['verts'] + ret_cap['verts']):
            nv = (fbm_noise(v.co.x * 0.6, v.co.y * 0.6, v.co.z * 0.6) - 0.5) * 0.55
            v.co.x += nv
            v.co.y += nv * 0.7

    bm_iso.normal_update()
    paint_vertex_colors(
        bm_iso,
        lambda co, n: lerp_rgba(col_rock_mid, col_moss_edge, smoothstep(0.55, 0.9, n.z) * 0.75),
    )
    iso_obj = mesh_from_bmesh(bm_iso, 'Island_Floating_Islets', col, mats['island_rock'], smooth=False)
    objs.append(iso_obj)

    return objs


def build_central_plaza(col, mats):
    """Build the neutral circular Central Plaza at (0, 0, 0) with golden Compass Rose & lanterns."""
    objs = []
    R = LAYOUT['plaza_radius']

    # --- 1. Main Cylindrical Stone Pedestal (extends down to Z=-2.7m into moat bed) ---
    bm = bmesh.new()
    # Lower submerged masonry footing
    bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=False, segments=48,
        radius1=R + 0.65, radius2=R + 0.35, depth=2.35,
        matrix=Matrix.Translation((0.0, 0.0, -1.525)),
    )
    # Upper plaza deck slab (Z = -0.35 to 0.0)
    bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=False, segments=48,
        radius1=R + 0.38, radius2=R + 0.15, depth=0.35,
        matrix=Matrix.Translation((0.0, 0.0, -0.175)),
    )
    # Subtle raised inner terrace ring
    bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=False, segments=48,
        radius1=4.85, radius2=4.65, depth=0.05,
        matrix=Matrix.Translation((0.0, 0.0, 0.025)),
    )

    c_sand_light = hex_rgba('#E3D7C3')
    c_sand_warm = hex_rgba('#C9B99F')
    c_foot = hex_rgba('#8E867A')

    def plaza_col(co, n):
        r = math.hypot(co.x, co.y)
        if co.z < -0.36:
            return lerp_rgba(c_foot, c_sand_warm, smoothstep(-2.6, -0.4, co.z) * 0.5)
        ring_pat = 0.5 + 0.5 * math.sin(r * 2.2)
        ang = math.atan2(co.y, co.x)
        spoke = 0.5 + 0.5 * math.cos(ang * 16.0)
        return lerp_rgba(c_sand_warm, c_sand_light, 0.45 + 0.35 * ring_pat + 0.2 * spoke)

    bm.normal_update()
    paint_vertex_colors(bm, plaza_col)
    objs.append(mesh_from_bmesh(bm, 'Plaza_Main_Deck', col, mats['plaza_stone'], smooth=False))

    # --- 2. Curved Perimeter Stone Curb Walls (4 quadrants, leaving wide 4.0m openings at N/S/E/W) ---
    bm_curb = bmesh.new()
    gap_half_rad = math.asin(2.15 / R)  # aligns cleanly with bridge parapet width
    for q in range(4):
        a0 = q * (math.pi * 0.5) + gap_half_rad
        a1 = (q + 1) * (math.pi * 0.5) - gap_half_rad
        segs = 10
        r_in, r_out = R - 0.38, R + 0.08
        h_curb = 0.56
        verts_ring = []
        for s in range(segs + 1):
            a = a0 + (a1 - a0) * (s / segs)
            ca, sa = math.cos(a), math.sin(a)
            v_bi = bm_curb.verts.new((r_in * ca, r_in * sa, 0.0))
            v_bo = bm_curb.verts.new((r_out * ca, r_out * sa, 0.0))
            v_to = bm_curb.verts.new((r_out * ca, r_out * sa, h_curb))
            v_ti = bm_curb.verts.new((r_in * ca, r_in * sa, h_curb))
            verts_ring.append((v_bi, v_bo, v_to, v_ti))
        for s in range(segs):
            a_v = verts_ring[s]
            b_v = verts_ring[s + 1]
            bm_curb.faces.new((a_v[0], b_v[0], b_v[3], a_v[3]))  # inner
            bm_curb.faces.new((a_v[1], a_v[2], b_v[2], b_v[1]))  # outer
            bm_curb.faces.new((a_v[3], b_v[3], b_v[2], a_v[2]))  # top
            bm_curb.faces.new((a_v[0], a_v[1], b_v[1], b_v[0]))  # bottom
        # End caps
        bm_curb.faces.new((verts_ring[0][0], verts_ring[0][3], verts_ring[0][2], verts_ring[0][1]))
        bm_curb.faces.new((verts_ring[-1][0], verts_ring[-1][1], verts_ring[-1][2], verts_ring[-1][3]))

    objs.append(mesh_from_bmesh(bm_curb, 'Plaza_Perimeter_Curb', col, mats['plaza_trim'], smooth=False))

    # --- 3. Neutral Golden 8-Point Compass Rose Medallion (strictly neutral, no faction symbols!) ---
    bm_gold = bmesh.new()
    # Outer & inner gold rings
    for r_mid, w_ring, h_ring in ((4.55, 0.24, 0.09), (3.45, 0.16, 0.08), (1.05, 0.18, 0.12)):
        segs = 36
        r0, r1 = r_mid - w_ring * 0.5, r_mid + w_ring * 0.5
        ring_v = []
        for s in range(segs):
            a = 2.0 * math.pi * s / segs
            ca, sa = math.cos(a), math.sin(a)
            ring_v.append((
                bm_gold.verts.new((r0 * ca, r0 * sa, 0.04)),
                bm_gold.verts.new((r1 * ca, r1 * sa, 0.04)),
                bm_gold.verts.new((r1 * ca, r1 * sa, 0.04 + h_ring)),
                bm_gold.verts.new((r0 * ca, r0 * sa, 0.04 + h_ring)),
            ))
        for s in range(segs):
            a_v = ring_v[s]
            b_v = ring_v[(s + 1) % segs]
            bm_gold.faces.new((a_v[3], b_v[3], b_v[2], a_v[2]))
            bm_gold.faces.new((a_v[1], a_v[2], b_v[2], b_v[1]))
            bm_gold.faces.new((a_v[0], b_v[0], b_v[3], a_v[3]))

    # 4 Major cardinal star points + 4 Minor diagonal star points
    for i in range(8):
        ang = i * (math.pi * 0.25)
        is_major = (i % 2 == 0)
        tip_r = 4.25 if is_major else 3.15
        side_w = 0.52 if is_major else 0.36
        crest_z = 0.20 if is_major else 0.15
        ca, sa = math.cos(ang), math.sin(ang)
        pa, psa = -sa, ca
        v_center = bm_gold.verts.new((0.0, 0.0, crest_z + 0.05))
        v_tip = bm_gold.verts.new((tip_r * ca, tip_r * sa, 0.07))
        v_l = bm_gold.verts.new((0.95 * ca + side_w * pa, 0.95 * sa + side_w * psa, 0.07))
        v_r = bm_gold.verts.new((0.95 * ca - side_w * pa, 0.95 * sa - side_w * psa, 0.07))
        bm_gold.faces.new((v_center, v_l, v_tip))
        bm_gold.faces.new((v_center, v_tip, v_r))
        bm_gold.faces.new((v_l, v_r, v_tip))

    # Central sculpted sun boss
    bmesh.ops.create_icosphere(
        bm_gold, subdivisions=2, radius=0.45,
        matrix=Matrix.Translation((0.0, 0.0, 0.14)) @ Matrix.Diagonal((1.0, 1.0, 0.45, 1.0)),
    )
    objs.append(mesh_from_bmesh(bm_gold, 'Plaza_Compass_Rose', col, mats['plaza_gold'], smooth=False))

    # --- 4. 8 Neutral Stone Lantern Pedestals on the Plaza Curb ---
    bm_post = bmesh.new()
    bm_glow = bmesh.new()
    lantern_angles_deg = [26, 64, 116, 154, 206, 244, 296, 334]
    for deg in lantern_angles_deg:
        a = math.radians(deg)
        lx = (R - 0.15) * math.cos(a)
        ly = (R - 0.15) * math.sin(a)
        # Stone plinth & pillar
        bmesh.ops.create_cube(
            bm_post, size=1.0,
            matrix=Matrix.Translation((lx, ly, 0.65)) @ Matrix.Diagonal((0.55, 0.55, 1.30, 1.0)),
        )
        # Lantern cap
        bmesh.ops.create_cone(
            bm_post, cap_ends=True, cap_tris=False, segments=4,
            radius1=0.42, radius2=0.06, depth=0.35,
            matrix=Matrix.Translation((lx, ly, 1.82)) @ Matrix.Rotation(math.pi * 0.25, 4, 'Z'),
        )
        # Warm glowing lantern glass
        bmesh.ops.create_cube(
            bm_glow, size=0.34,
            matrix=Matrix.Translation((lx, ly, 1.48)),
        )

    objs.append(mesh_from_bmesh(bm_post, 'Plaza_Lantern_Posts', col, mats['plaza_trim'], smooth=False))
    objs.append(mesh_from_bmesh(bm_glow, 'Plaza_Lantern_Glow', col, mats['glow_warm'], smooth=False))

    return objs


def build_bridges(col, mats):
    """Build 4 real arched stone bridges crossing the Ring Moat along N, W, E, S."""
    objs = []
    r0 = LAYOUT['bridge_start']   # 7.35
    r1 = LAYOUT['bridge_end']     # 12.35
    span = r1 - r0                # 5.0m
    road_half = 1.85              # 3.7m clear road width
    parapet_w = 0.36
    total_half = road_half + parapet_w  # 2.21m (total width 4.42m)

    for name, cfg in LAYOUT['castles'].items():
        dx, dy = cfg['dir']
        rot_z = math.atan2(dy, dx)  # +X=0, +Y=pi/2, -X=pi, -Y=-pi/2
        xform = Matrix.Rotation(rot_z, 4, 'Z')

        bm_stone = bmesh.new()
        bm_glow = bmesh.new()

        segs = 14
        # Build arched stone bridge deck + underside arch vault cleanly
        # Profile cross-section along u in [0, 1] (x_local from r0 to r1)
        sections = []
        for s in range(segs + 1):
            u = s / segs
            xl = r0 + span * u
            # Deck rises gently from 0.0 at plaza to +0.46 at center, down to +0.20 at outer landing
            z_deck = (0.0 * (1.0 - u) + 0.20 * u) + 0.36 * math.sin(math.pi * u)
            # Underside arch: deep abutments at ends (Z=-2.9), arching up to Z=-0.38 at center!
            arch_factor = math.sin(math.pi * u)
            if u <= 0.14 or u >= 0.86:
                z_bot = -2.95
            else:
                # Smooth semicircular arch opening above water (Z_water = -1.65 -> clear opening up to -0.38)
                ua = (u - 0.14) / 0.72
                z_bot = -2.65 + 2.27 * (math.sin(math.pi * ua) ** 0.72)

            v_bl = bm_stone.verts.new(xform @ Vector((xl, -total_half, z_bot)))
            v_br = bm_stone.verts.new(xform @ Vector((xl, total_half, z_bot)))
            v_tr = bm_stone.verts.new(xform @ Vector((xl, total_half, z_deck)))
            v_tl = bm_stone.verts.new(xform @ Vector((xl, -total_half, z_deck)))
            sections.append((v_bl, v_br, v_tr, v_tl, xl, z_deck))

        for s in range(segs):
            a = sections[s]
            b = sections[s + 1]
            # Top deck
            bm_stone.faces.new((a[3], a[2], b[2], b[3]))
            # Bottom arch soffit
            bm_stone.faces.new((a[0], b[0], b[1], a[1]))
            # Left & right spandrel walls
            bm_stone.faces.new((a[0], a[3], b[3], b[0]))
            bm_stone.faces.new((a[1], b[1], b[2], a[2]))
        # End caps
        bm_stone.faces.new((sections[0][0], sections[0][1], sections[0][2], sections[0][3]))
        bm_stone.faces.new((sections[-1][0], sections[-1][3], sections[-1][2], sections[-1][1]))

        # Left & right raised stone parapets following deck arch
        for side in (-1.0, 1.0):
            y_in = side * road_half
            y_out = side * total_half
            if side < 0:
                y_lo, y_hi = y_out, y_in
            else:
                y_lo, y_hi = y_in, y_out
            p_secs = []
            for s in range(segs + 1):
                _, _, _, _, xl, zd = sections[s]
                h_p = 0.68
                p_secs.append((
                    bm_stone.verts.new(xform @ Vector((xl, y_lo, zd - 0.04))),
                    bm_stone.verts.new(xform @ Vector((xl, y_hi, zd - 0.04))),
                    bm_stone.verts.new(xform @ Vector((xl, y_hi, zd + h_p))),
                    bm_stone.verts.new(xform @ Vector((xl, y_lo, zd + h_p))),
                ))
            for s in range(segs):
                a = p_secs[s]
                b = p_secs[s + 1]
                bm_stone.faces.new((a[3], a[2], b[2], b[3]))
                bm_stone.faces.new((a[0], a[3], b[3], b[0]))
                bm_stone.faces.new((a[1], b[1], b[2], a[2]))
            bm_stone.faces.new((p_secs[0][0], p_secs[0][1], p_secs[0][2], p_secs[0][3]))
            bm_stone.faces.new((p_secs[-1][0], p_secs[-1][3], p_secs[-1][2], p_secs[-1][1]))

            # Bridge end pillars + warm glowing lanterns at both ends
            for xl_p, zd_p in ((r0 + 0.25, 0.06), (r1 - 0.25, 0.24)):
                yc = side * (road_half + parapet_w * 0.5)
                bmesh.ops.create_cube(
                    bm_stone, size=1.0,
                    matrix=xform @ Matrix.Translation((xl_p, yc, zd_p + 0.55)) @ Matrix.Diagonal((0.56, 0.56, 1.15, 1.0)),
                )
                bmesh.ops.create_cone(
                    bm_stone, cap_ends=True, cap_tris=False, segments=4,
                    radius1=0.38, radius2=0.06, depth=0.30,
                    matrix=xform @ Matrix.Translation((xl_p, yc, zd_p + 1.56)) @ Matrix.Rotation(math.pi * 0.25, 4, 'Z'),
                )
                bmesh.ops.create_cube(
                    bm_glow, size=0.30,
                    matrix=xform @ Matrix.Translation((xl_p, yc, zd_p + 1.26)),
                )

        c_hi = hex_rgba('#DED4C2')
        c_lo = hex_rgba('#8E8577')
        bm_stone.normal_update()
        paint_vertex_colors(
            bm_stone,
            lambda co, n: lerp_rgba(
                c_lo, c_hi,
                smoothstep(-2.4, 0.6, co.z) * (0.75 + 0.25 * fbm_noise(co.x * 1.1, co.y * 1.1, co.z)),
            ),
        )
        objs.append(mesh_from_bmesh(bm_stone, f'Bridge_{name.capitalize()}', col, mats['bridge_stone'], smooth=False))
        objs.append(mesh_from_bmesh(bm_glow, f'Bridge_{name.capitalize()}_Lanterns', col, mats['glow_warm'], smooth=False))

    return objs


def build_roads(col, mats):
    """Build 4 paved approach causeways, solid grand staircases, and castle gate forecourts."""
    objs = []
    r_bridge_end = LAYOUT['bridge_end']   # 12.35
    r_stair_start = LAYOUT['stair_start'] # 13.4
    r_stair_end = LAYOUT['stair_end']     # 17.2

    faction_glow = {
        'kingdom': 'glow_warm',
        'forest': 'glow_forest',
        'demon': 'glow_demon',
        'dragon': 'glow_dragon',
    }
    faction_road_tint = {
        'kingdom': (hex_rgba('#EAE3D4'), hex_rgba('#BDB3A0')),
        'forest': (hex_rgba('#BEB9A0'), hex_rgba('#7A8762')),
        'demon': (hex_rgba('#61527D'), hex_rgba('#382E4C')),
        'dragon': (hex_rgba('#8C5C4E'), hex_rgba('#54342B')),
    }

    for name, cfg in LAYOUT['castles'].items():
        dx, dy = cfg['dir']
        tz = cfg['terrace_z']
        rot_z = math.atan2(dy, dx)
        xform = Matrix.Rotation(rot_z, 4, 'Z')

        bm_road = bmesh.new()
        bm_glow = bmesh.new()

        # 1. Level approach landing connecting bridge end (12.15) to stair foot (13.45)
        landing_len = (r_stair_start + 0.15) - (r_bridge_end - 0.25)
        landing_mid = 0.5 * ((r_bridge_end - 0.25) + (r_stair_start + 0.15))
        bmesh.ops.create_cube(
            bm_road, size=1.0,
            matrix=xform @ Matrix.Translation((landing_mid, 0.0, -0.35)) @ Matrix.Diagonal((landing_len, 4.1, 1.12, 1.0)),
        )

        # 2. Solid Grand Staircase (12-14 solid stone steps seated deeply into terrain slope)
        n_steps = 14 if name == 'kingdom' else 11
        stair_span = r_stair_end - r_stair_start
        step_d = stair_span / n_steps
        z0 = 0.20
        dz = tz - z0
        for i in range(n_steps):
            t0 = i / n_steps
            t1 = (i + 1) / n_steps
            xc = r_stair_start + (i + 0.5) * step_d
            z_top = z0 + dz * t1
            z_bot = z0 + dz * t0 - 1.45  # extends deeply into slope so zero floating gaps!
            h = z_top - z_bot
            bmesh.ops.create_cube(
                bm_road, size=1.0,
                matrix=xform @ Matrix.Translation((xc, 0.0, z_bot + h * 0.5)) @ Matrix.Diagonal((step_d * 1.12, 3.85, h, 1.0)),
            )

        # 3. Sloped Flanking Stone Balustrades & Newel Pillars along Staircase
        for side in (-1.0, 1.0):
            yc = side * 2.12
            # Continuous sloped stringer wall
            segs = 6
            b_secs = []
            for s in range(segs + 1):
                u = s / segs
                xl = (r_stair_start - 0.15) + (stair_span + 0.3) * u
                zl = z0 + dz * u
                b_secs.append((
                    bm_road.verts.new(xform @ Vector((xl, yc - 0.24, zl - 1.3))),
                    bm_road.verts.new(xform @ Vector((xl, yc + 0.24, zl - 1.3))),
                    bm_road.verts.new(xform @ Vector((xl, yc + 0.24, zl + 0.68))),
                    bm_road.verts.new(xform @ Vector((xl, yc - 0.24, zl + 0.68))),
                ))
            for s in range(segs):
                a, b = b_secs[s], b_secs[s + 1]
                bm_road.faces.new((a[3], a[2], b[2], b[3]))
                bm_road.faces.new((a[0], a[3], b[3], b[0]))
                bm_road.faces.new((a[1], b[1], b[2], a[2]))
            bm_road.faces.new((b_secs[0][0], b_secs[0][1], b_secs[0][2], b_secs[0][3]))
            bm_road.faces.new((b_secs[-1][0], b_secs[-1][3], b_secs[-1][2], b_secs[-1][1]))

            # Top newel pillar + faction glow lantern / brazier at castle gate threshold
            bmesh.ops.create_cube(
                bm_road, size=1.0,
                matrix=xform @ Matrix.Translation((r_stair_end + 0.1, yc, tz + 0.55)) @ Matrix.Diagonal((0.68, 0.68, 1.25, 1.0)),
            )
            bmesh.ops.create_icosphere(
                bm_glow, subdivisions=2, radius=0.28,
                matrix=xform @ Matrix.Translation((r_stair_end + 0.1, yc, tz + 1.38)),
            )

        # 4. Castle Gate Forecourt Paving (connects top of stairs cleanly into castle gatehouse)
        bmesh.ops.create_cube(
            bm_road, size=1.0,
            matrix=xform @ Matrix.Translation((r_stair_end + 1.4, 0.0, tz - 0.48)) @ Matrix.Diagonal((3.1, 6.4, 1.0, 1.0)),
        )

        c_hi, c_lo = faction_road_tint[name]
        bm_road.normal_update()
        paint_vertex_colors(
            bm_road,
            lambda co, n, hi=c_hi, lo=c_lo: lerp_rgba(
                lo, hi, 0.35 + 0.5 * fbm_noise(co.x * 1.4, co.y * 1.4, co.z * 0.9)
            ),
        )
        objs.append(mesh_from_bmesh(bm_road, f'Road_Stairs_{name.capitalize()}', col, mats['road_stone'], smooth=False))
        objs.append(mesh_from_bmesh(bm_glow, f'Road_Lanterns_{name.capitalize()}', col, mats[faction_glow[name]], smooth=True))

    return objs


def build_water(col, mats):
    """Build coherent hydrology: 4 spring inlets -> Ring Moat -> 4 diagonal rivers -> 4 waterfalls."""
    objs = []
    wz = LAYOUT['water_z']  # -1.65

    # --- 1. Ring Moat Surface (R = 7.35 to 11.85) ---
    bm_w = bmesh.new()
    n_ang = 96
    r_rings = [7.35, 8.3, 9.5, 10.7, 11.85]
    rings = []
    for r in r_rings:
        ring = []
        for ai in range(n_ang):
            a = 2.0 * math.pi * ai / n_ang
            x, y = r * math.cos(a), r * math.sin(a)
            ripple = 0.03 * math.sin(x * 1.8 + y * 1.5)
            ring.append(bm_w.verts.new((x, y, wz + ripple)))
        rings.append(ring)
    for ri in range(len(rings) - 1):
        for ai in range(n_ang):
            an = (ai + 1) % n_ang
            bm_w.faces.new((rings[ri][ai], rings[ri + 1][ai], rings[ri + 1][an], rings[ri][an]))

    # --- 2. Four Diagonal River Channels (flowing from Ring Moat R=11.0 out to cliff lip R=26.4) ---
    diag_angles = [math.pi * 0.25, math.pi * 0.75, -math.pi * 0.75, -math.pi * 0.25]
    bm_fall = bmesh.new()
    bm_foam = bmesh.new()

    for idx, ang in enumerate(diag_angles):
        xform = Matrix.Rotation(ang, 4, 'Z')
        rim_r = island_outer_radius(ang)  # ~26.05m at diagonal notches
        r_lip = rim_r - 0.15

        # River channel ribbon
        u_segs = 18
        v_segs = 5
        grid = []
        for ui in range(u_segs + 1):
            u = ui / u_segs
            xl = 11.2 + (r_lip - 11.2) * u
            half_w = 1.65 + 0.45 * u
            row = []
            for vi in range(v_segs + 1):
                v_t = (vi / v_segs) * 2.0 - 1.0
                yl = v_t * half_w
                ripple = 0.035 * math.sin(xl * 1.6 + yl * 2.2)
                row.append(bm_w.verts.new(xform @ Vector((xl, yl, wz + ripple))))
            grid.append(row)
        for ui in range(u_segs):
            for vi in range(v_segs):
                bm_w.faces.new((grid[ui][vi], grid[ui + 1][vi], grid[ui + 1][vi + 1], grid[ui][vi + 1]))

        # --- 3. Sculpted Rocky Spring Cascade feeding the Moat/River Junction (natural water source!) ---
        # Subtle whitewater riffles & spring ripples at the river head (natural boulders sit over this in Nature)
        for bank_sign in (-1.0, 1.0):
            # Thin foaming water trickle from uphill bank into river head
            bmesh.ops.create_cone(
                bm_foam, cap_ends=True, cap_tris=False, segments=8,
                radius1=0.38, radius2=0.14, depth=0.75,
                matrix=xform @ Matrix.Translation((12.8, bank_sign * 1.95, wz + 0.15)) @ Matrix.Rotation(bank_sign * 0.72, 4, 'X'),
            )
            # Flat subtle splash ring on water surface
            bmesh.ops.create_cone(
                bm_foam, cap_ends=True, cap_tris=False, segments=12,
                radius1=0.62, radius2=0.35, depth=0.06,
                matrix=xform @ Matrix.Translation((12.8, bank_sign * 1.55, wz + 0.03)),
            )

        # --- 4. Parabolic Waterfall Curtain pouring off the diagonal cliff edge ---
        wf_u = 18
        wf_v = 8
        wf_grid = []
        lip_w = 1.95
        fall_h = 13.8
        for ui in range(wf_u + 1):
            t = ui / wf_u  # 0 at lip, 1 at bottom mist
            xl = r_lip + 2.45 * (t ** 0.72)
            zl = wz - fall_h * (t ** 1.62)
            hw = lip_w * (1.0 + 0.28 * t)
            row = []
            for vi in range(wf_v + 1):
                vt = (vi / wf_v) * 2.0 - 1.0
                yl = vt * hw
                flute = 0.18 * math.sin(vt * math.pi * 3.0) * math.sin(t * math.pi)
                row.append(bm_fall.verts.new(xform @ Vector((xl + flute, yl, zl))))
            wf_grid.append(row)
        for ui in range(wf_u):
            for vi in range(wf_v):
                bm_fall.faces.new((wf_grid[ui][vi], wf_grid[ui + 1][vi], wf_grid[ui + 1][vi + 1], wf_grid[ui][vi + 1]))

        # Subtle sculpted foam crest & bottom mist plume (flattened organically, not lumpy balls)
        for k in range(7):
            yk = -1.65 + 0.55 * k
            bmesh.ops.create_icosphere(
                bm_foam, subdivisions=2, radius=0.32 + 0.07 * (k % 2),
                matrix=xform @ Matrix.Translation((r_lip + 0.22, yk, wz + 0.04)) @ Matrix.Diagonal((1.0, 1.35, 0.32, 1.0)),
            )
        for k in range(5):
            yk = -1.8 + 0.9 * k
            bmesh.ops.create_icosphere(
                bm_foam, subdivisions=2, radius=1.25 + 0.22 * (k % 2),
                matrix=xform @ Matrix.Translation((r_lip + 2.4, yk, wz - fall_h + 0.9)) @ Matrix.Diagonal((1.15, 1.25, 0.65, 1.0)),
            )

    objs.append(mesh_from_bmesh(bm_w, 'Water_Moat_And_Rivers', col, mats['water'], smooth=True))
    objs.append(mesh_from_bmesh(bm_fall, 'Water_Four_Waterfalls', col, mats['waterfall'], smooth=True))
    objs.append(mesh_from_bmesh(bm_foam, 'Water_Foam_And_Springs', col, mats['foam'], smooth=True))

    return objs
