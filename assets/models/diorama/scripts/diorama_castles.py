"""Four distinct Faction Castle builders for Castle Field 3D Diorama.

Local convention for every castle:
  Origin (0, 0, 0) = center of castle pad on top of its terrace.
  -Y local = FRONT entrance (faces Central Plaza after Root Empty rotation).
  +Y local = REAR (toward outer cliff rim).

Transformations placing local -Y toward (0, 0, 0):
  Kingdom (North, +Y): rot_z = 0 deg
  Forest  (West,  -X): rot_z = +90 deg
  Demon   (East,  +X): rot_z = -90 deg
  Dragon  (South, -Y): rot_z = 180 deg
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
from diorama_terrain import LAYOUT


# ---------------------------------------------------------------------------
# Reusable low-level solid 3D architectural geometry helpers (bmesh)
# ---------------------------------------------------------------------------

def add_box(bm, center, size, rot_z=0.0):
    m = Matrix.Translation(center) @ Matrix.Rotation(rot_z, 4, 'Z') @ Matrix.Diagonal((size[0], size[1], size[2], 1.0))
    bmesh.ops.create_cube(bm, size=1.0, matrix=m)


def add_cylinder(bm, base_center, r_bot, r_top, height, segs=12, rot_z=0.0):
    c = (base_center[0], base_center[1], base_center[2] + height * 0.5)
    m = Matrix.Translation(c) @ Matrix.Rotation(rot_z, 4, 'Z')
    bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=False, segments=segs,
        radius1=r_bot, radius2=r_top, depth=height, matrix=m,
    )


def add_pitched_roof(bm, center_base, width, depth, height, overhang=0.25, rot_z=0.0):
    """Solid gabled / hipped roof prism."""
    hw = width * 0.5 + overhang
    hd = depth * 0.5 + overhang
    z0 = center_base[2]
    z1 = z0 + height
    xform = Matrix.Translation((center_base[0], center_base[1], 0.0)) @ Matrix.Rotation(rot_z, 4, 'Z')
    v = [
        bm.verts.new(xform @ Vector((-hw, -hd, z0))),
        bm.verts.new(xform @ Vector((hw, -hd, z0))),
        bm.verts.new(xform @ Vector((hw, hd, z0))),
        bm.verts.new(xform @ Vector((-hw, hd, z0))),
        bm.verts.new(xform @ Vector((-hw * 0.65, 0.0, z1))),
        bm.verts.new(xform @ Vector((hw * 0.65, 0.0, z1))),
    ]
    bm.faces.new((v[0], v[3], v[2], v[1]))  # bottom
    bm.faces.new((v[0], v[1], v[5], v[4]))  # front slope
    bm.faces.new((v[2], v[3], v[4], v[5]))  # back slope
    bm.faces.new((v[3], v[0], v[4]))        # left hip
    bm.faces.new((v[1], v[2], v[5]))        # right hip


def add_crenellations_line(bm, p0, p1, z_base, merlon_w=0.52, merlon_d=0.48, merlon_h=0.52, gap=0.45):
    v0 = Vector((p0[0], p0[1], 0.0))
    v1 = Vector((p1[0], p1[1], 0.0))
    d = v1 - v0
    length = d.length
    if length < 0.2:
        return
    ang = math.atan2(d.y, d.x)
    step = merlon_w + gap
    n = max(1, int(length / step))
    for i in range(n):
        t = (i + 0.5) / n
        p = v0.lerp(v1, t)
        add_box(bm, (p.x, p.y, z_base + merlon_h * 0.5), (merlon_w, merlon_d, merlon_h), rot_z=ang)


def add_crenellations_ring(bm, cx, cy, z_base, radius, count=8, merlon_w=0.42, merlon_d=0.35, merlon_h=0.45):
    for i in range(count):
        a = 2.0 * math.pi * i / count
        mx = cx + radius * math.cos(a)
        my = cy + radius * math.sin(a)
        add_box(bm, (mx, my, z_base + merlon_h * 0.5), (merlon_d, merlon_w, merlon_h), rot_z=a)


def add_tube_along_curve(bm, points, radii, segs=10, cap_start=True, cap_end=True):
    """Sweep a smooth circular cross-section along a 3D polyline using parallel transport (zero twist!)."""
    rings = []
    n = len(points)
    prev_tang = None
    side = None
    up = None
    for i, (pt, rad) in enumerate(zip(points, radii)):
        p = Vector(pt)
        if i == 0:
            tang = (Vector(points[1]) - p).normalized()
        elif i == n - 1:
            tang = (p - Vector(points[i - 1])).normalized()
        else:
            tang = (Vector(points[i + 1]) - Vector(points[i - 1])).normalized()

        if prev_tang is None:
            up_ref = Vector((0, 0, 1)) if abs(tang.z) < 0.85 else Vector((1, 0, 0))
            side = tang.cross(up_ref).normalized()
            up = side.cross(tang).normalized()
        else:
            # Parallel transport previous frame onto new tangent -> completely eliminates twist/pinch!
            q = prev_tang.rotation_difference(tang)
            side = (q @ side)
            side = (side - tang * side.dot(tang)).normalized()
            up = side.cross(tang).normalized()
        prev_tang = tang

        ring = []
        for s in range(segs):
            a = 2.0 * math.pi * s / segs
            offset = (side * math.cos(a) + up * math.sin(a)) * rad
            ring.append(bm.verts.new(p + offset))
        rings.append(ring)

    for i in range(n - 1):
        r0, r1 = rings[i], rings[i + 1]
        for s in range(segs):
            sn = (s + 1) % segs
            bm.faces.new((r0[s], r0[sn], r1[sn], r1[s]))
    if cap_start:
        bm.faces.new(list(reversed(rings[0])))
    if cap_end:
        bm.faces.new(rings[-1])


def add_banner(bm, pos, width=0.85, height=2.1, rot_z=0.0, swallowtail=False):
    """Hanging cloth banner with subtle 3D wave thickness."""
    xform = Matrix.Translation(pos) @ Matrix.Rotation(rot_z, 4, 'Z')
    hw = width * 0.5
    thick = 0.05
    rows = 5
    front_grid = []
    back_grid = []
    for r in range(rows + 1):
        t = r / rows  # 0 top -> 1 bottom
        z = -height * t
        wave = 0.08 * math.sin(t * math.pi * 1.4)
        # Taper slightly toward bottom tip
        w_curr = hw * (1.0 - 0.15 * t)
        if r == rows and not swallowtail:
            # Pointed medieval shield banner tip
            w_curr = hw * 0.05
        f_l = bm.verts.new(xform @ Vector((-w_curr, wave - thick * 0.5, z)))
        f_m = bm.verts.new(xform @ Vector((0.0, wave - thick * 0.5, z + (0.35 if (r == rows and swallowtail) else 0.0))))
        f_r = bm.verts.new(xform @ Vector((w_curr, wave - thick * 0.5, z)))
        b_l = bm.verts.new(xform @ Vector((-w_curr, wave + thick * 0.5, z)))
        b_m = bm.verts.new(xform @ Vector((0.0, wave + thick * 0.5, z + (0.35 if (r == rows and swallowtail) else 0.0))))
        b_r = bm.verts.new(xform @ Vector((w_curr, wave + thick * 0.5, z)))
        front_grid.append((f_l, f_m, f_r))
        back_grid.append((b_l, b_m, b_r))

    for r in range(rows):
        for c in range(2):
            a0, a1 = front_grid[r][c], front_grid[r][c + 1]
            b0, b1 = front_grid[r + 1][c], front_grid[r + 1][c + 1]
            bm.faces.new((a0, b0, b1, a1))
            ba0, ba1 = back_grid[r][c], back_grid[r][c + 1]
            bb0, bb1 = back_grid[r + 1][c], back_grid[r + 1][c + 1]
            bm.faces.new((ba0, ba1, bb1, bb0))
        # Side edges
        bm.faces.new((front_grid[r][0], back_grid[r][0], back_grid[r + 1][0], front_grid[r + 1][0]))
        bm.faces.new((front_grid[r][2], front_grid[r + 1][2], back_grid[r + 1][2], back_grid[r][2]))


def add_flag_pennant(bm, pole_top, length=1.6, height=0.72, rot_z=0.3):
    """Fluttering flag attached to top of a spire flagpole."""
    xform = Matrix.Translation(pole_top) @ Matrix.Rotation(rot_z, 4, 'Z')
    segs = 5
    thick = 0.035
    pts_f = []
    pts_b = []
    for i in range(segs + 1):
        t = i / segs
        x = length * t
        y = 0.14 * math.sin(t * math.pi * 1.8)
        h_half = height * 0.5 * (1.0 - 0.72 * t)
        pts_f.append((
            bm.verts.new(xform @ Vector((x, y - thick * 0.5, -height * 0.5 + h_half))),
            bm.verts.new(xform @ Vector((x, y - thick * 0.5, -height * 0.5 - h_half))),
        ))
        pts_b.append((
            bm.verts.new(xform @ Vector((x, y + thick * 0.5, -height * 0.5 + h_half))),
            bm.verts.new(xform @ Vector((x, y + thick * 0.5, -height * 0.5 - h_half))),
        ))
    for i in range(segs):
        bm.faces.new((pts_f[i][0], pts_f[i][1], pts_f[i + 1][1], pts_f[i + 1][0]))
        bm.faces.new((pts_b[i][0], pts_b[i + 1][0], pts_b[i + 1][1], pts_b[i][1]))
        bm.faces.new((pts_f[i][0], pts_f[i + 1][0], pts_b[i + 1][0], pts_b[i][0]))
        bm.faces.new((pts_f[i][1], pts_b[i][1], pts_b[i + 1][1], pts_f[i + 1][1]))


def make_castle_root(name, faction_key, col):
    cfg = LAYOUT['castles'][faction_key]
    root = bpy.data.objects.new(name, None)
    root.empty_display_type = 'ARROWS'
    root.empty_display_size = 2.5
    root.location = cfg['center']
    # Align local -Y to face origin (0,0,0)
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


# ---------------------------------------------------------------------------
# 1. KINGDOM CASTLE (North, +Y) — Bright Limestone, Royal Blue Conical Spires, Gold Fleur-de-Lis
# ---------------------------------------------------------------------------

def build_castle_kingdom(col, mats):
    root = make_castle_root('Castle_Kingdom_Root', 'kingdom', col)
    bm_wall = bmesh.new()
    bm_trim = bmesh.new()
    bm_roof = bmesh.new()
    bm_gold = bmesh.new()
    bm_glow = bmesh.new()
    bm_door = bmesh.new()
    bm_banner = bmesh.new()

    # 1. Stepped Citadel Foundation Plinth (anchored deeply to Z=-1.8)
    add_box(bm_wall, (0.0, 0.2, -0.9), (12.6, 10.2, 1.85))
    add_box(bm_trim, (0.0, 0.2, 0.06), (12.85, 10.45, 0.22))

    # 2. Outer Curtain Walls (Front left/right leaving central gatehouse, plus Left, Right, Rear)
    wall_h = 3.35
    add_box(bm_wall, (-3.9, -4.1, wall_h * 0.5), (3.6, 0.95, wall_h))
    add_box(bm_wall, (3.9, -4.1, wall_h * 0.5), (3.6, 0.95, wall_h))
    add_box(bm_wall, (-5.5, 0.0, wall_h * 0.5), (0.95, 8.2, wall_h))
    add_box(bm_wall, (5.5, 0.0, wall_h * 0.5), (0.95, 8.2, wall_h))
    add_box(bm_wall, (0.0, 4.1, wall_h * 0.5), (11.2, 0.95, wall_h))

    # Wall top stringcourse & crenellations
    add_box(bm_trim, (-3.9, -4.1, wall_h + 0.1), (3.7, 1.12, 0.22))
    add_box(bm_trim, (3.9, -4.1, wall_h + 0.1), (3.7, 1.12, 0.22))
    add_box(bm_trim, (-5.5, 0.0, wall_h + 0.1), (1.12, 8.3, 0.22))
    add_box(bm_trim, (5.5, 0.0, wall_h + 0.1), (1.12, 8.3, 0.22))
    add_box(bm_trim, (0.0, 4.1, wall_h + 0.1), (11.4, 1.12, 0.22))

    add_crenellations_line(bm_wall, (-5.1, -4.25), (-2.6, -4.25), wall_h + 0.2)
    add_crenellations_line(bm_wall, (2.6, -4.25), (5.1, -4.25), wall_h + 0.2)
    add_crenellations_line(bm_wall, (-5.65, -3.5), (-5.65, 3.5), wall_h + 0.2)
    add_crenellations_line(bm_wall, (5.65, -3.5), (5.65, 3.5), wall_h + 0.2)
    add_crenellations_line(bm_wall, (-4.9, 4.25), (4.9, 4.25), wall_h + 0.2)

    # 3. Grand Front Gatehouse (centered at y = -4.4, facing -Y toward Central Plaza!)
    add_box(bm_wall, (0.0, -4.2, 2.35), (4.5, 1.85, 4.7))
    add_box(bm_trim, (0.0, -4.2, 4.75), (4.8, 2.05, 0.28))
    add_crenellations_line(bm_wall, (-2.1, -5.05), (2.1, -5.05), 4.9, merlon_w=0.45, gap=0.35)
    # Recessed glowing arched gateway + oak frame + golden portcullis grill bars!
    add_box(bm_door, (0.0, -5.06, 1.45), (2.30, 0.28, 2.88))
    add_box(bm_glow, (0.0, -5.14, 1.38), (1.76, 0.14, 2.38))
    # Portcullis lattice bars across upper doorway for rich architectural depth
    for px in (-0.52, 0.0, 0.52):
        add_box(bm_gold, (px, -5.21, 1.75), (0.09, 0.09, 1.85))
    for pz in (1.45, 2.05, 2.52):
        add_box(bm_gold, (0.0, -5.21, pz), (1.78, 0.09, 0.09))
    # Stone gate arch piers & stepped gothic lintel
    add_box(bm_trim, (-1.28, -5.18, 1.5), (0.44, 0.44, 3.0))
    add_box(bm_trim, (1.28, -5.18, 1.5), (0.44, 0.44, 3.0))
    add_box(bm_trim, (0.0, -5.20, 3.05), (3.05, 0.48, 0.42))
    # Golden Fleur-de-Lis Crest sculpted above gatehouse arch!
    crest_y = -5.26
    crest_z = 3.92
    # Shield backing (royal blue with gold border)
    add_box(bm_gold, (0.0, crest_y + 0.06, crest_z), (1.28, 0.12, 1.38))
    add_box(bm_roof, (0.0, crest_y + 0.02, crest_z), (1.12, 0.14, 1.22))
    # Central petal + curved side petals + crossbar in gold
    add_cylinder(bm_gold, (0.0, crest_y - 0.07, crest_z - 0.44), 0.16, 0.03, 0.94, segs=6)
    add_box(bm_gold, (0.0, crest_y - 0.07, crest_z - 0.06), (0.78, 0.12, 0.16))
    for sx in (-1.0, 1.0):
        m_p = Matrix.Translation((sx * 0.27, crest_y - 0.07, crest_z + 0.05)) @ Matrix.Rotation(sx * -0.45, 4, 'Y')
        bmesh.ops.create_cone(bm_gold, cap_ends=True, cap_tris=False, segments=6, radius1=0.14, radius2=0.03, depth=0.64, matrix=m_p)

    # Twin Front Gate Towers (flanking the gate at x = ±2.45, y = -4.2)
    for sx in (-1.0, 1.0):
        tx, ty = sx * 2.45, -4.2
        add_cylinder(bm_wall, (tx, ty, 0.0), 1.18, 1.08, 5.5, segs=12)
        add_cylinder(bm_trim, (tx, ty, 5.35), 1.25, 1.28, 0.35, segs=12)
        add_cylinder(bm_roof, (tx, ty, 5.65), 1.48, 0.06, 3.15, segs=12)
        add_cylinder(bm_gold, (tx, ty, 8.70), 0.08, 0.02, 0.95, segs=8)
        bmesh.ops.create_icosphere(bm_gold, subdivisions=1, radius=0.16, matrix=Matrix.Translation((tx, ty, 8.85)))
        # Glowing arched lancet windows facing front & side
        add_box(bm_glow, (tx, ty - 1.06, 3.65), (0.42, 0.14, 1.05))
        add_box(bm_glow, (tx + sx * 1.06, ty, 3.65), (0.14, 0.42, 1.05))
        # Hanging royal blue banner on front curtain wall beside tower
        add_banner(bm_banner, (sx * 3.9, -4.65, 3.1), width=0.92, height=2.15, rot_z=0.0)
        add_box(bm_gold, (sx * 3.9, -4.72, 2.25), (0.22, 0.06, 0.52))  # gold fleur bar on banner

    # 4. Four Outer Corner Turrets
    corner_towers = [
        (-5.55, -4.0, 4.9, 2.7),
        (5.55, -4.0, 4.9, 2.7),
        (-5.55, 4.0, 5.4, 2.9),
        (5.55, 4.0, 5.4, 2.9),
    ]
    for tx, ty, th, rh in corner_towers:
        add_cylinder(bm_wall, (tx, ty, -0.4), 1.38, 1.24, th + 0.4, segs=12)
        add_cylinder(bm_trim, (tx, ty, th - 0.15), 1.42, 1.46, 0.36, segs=12)
        add_crenellations_ring(bm_wall, tx, ty, th + 0.18, 1.32, count=8, merlon_w=0.35, merlon_d=0.25, merlon_h=0.35)
        add_cylinder(bm_roof, (tx, ty, th + 0.25), 1.52, 0.06, rh, segs=12)
        add_cylinder(bm_gold, (tx, ty, th + 0.25 + rh - 0.05), 0.07, 0.02, 0.85, segs=8)
        # Outward windows
        wy_dir = -1.0 if ty < 0 else 1.0
        wx_dir = -1.0 if tx < 0 else 1.0
        add_box(bm_glow, (tx, ty + wy_dir * 1.24, th * 0.68), (0.40, 0.14, 0.95))
        add_box(bm_glow, (tx + wx_dir * 1.24, ty, th * 0.68), (0.14, 0.40, 0.95))

    # 5. Elevated Inner Royal Palace Hall
    add_box(bm_wall, (0.0, 0.8, 3.15), (7.6, 5.4, 6.3))
    add_box(bm_trim, (0.0, 0.8, 6.28), (7.95, 5.75, 0.34))
    add_pitched_roof(bm_roof, (0.0, 0.8, 6.42), 7.7, 5.5, 2.55, overhang=0.32)
    # Cathedral arched glowing windows along front & back facades
    for wx in (-2.4, -1.1, 1.1, 2.4):
        add_box(bm_glow, (wx, -1.92, 4.75), (0.55, 0.14, 1.35))
        add_box(bm_glow, (wx, 3.52, 4.75), (0.55, 0.14, 1.35))
        add_box(bm_trim, (wx, -1.96, 4.02), (0.72, 0.22, 0.16))

    # Two Tall Mid-Keep Flanking Belfry Towers
    for sx in (-1.0, 1.0):
        tx, ty = sx * 3.55, 0.85
        add_cylinder(bm_wall, (tx, ty, 0.0), 1.48, 1.35, 7.6, segs=12)
        add_cylinder(bm_trim, (tx, ty, 7.42), 1.56, 1.62, 0.40, segs=12)
        add_cylinder(bm_roof, (tx, ty, 7.78), 1.78, 0.07, 3.65, segs=12)
        add_cylinder(bm_gold, (tx, ty, 11.35), 0.08, 0.02, 1.05, segs=8)
        add_flag_pennant(bm_banner, (tx, ty, 12.25), length=1.25, height=0.55, rot_z=0.35)
        add_box(bm_glow, (tx, ty - 1.35, 5.8), (0.44, 0.16, 1.15))
        add_box(bm_glow, (tx + sx * 1.35, ty, 5.8), (0.16, 0.44, 1.15))

    # 6. Soaring Central Royal Donjon Spire (Grand Peak -> local Z = 15.0, world Z = 18.0!)
    add_cylinder(bm_wall, (0.0, 1.05, 5.5), 2.35, 2.15, 4.2, segs=8, rot_z=math.pi / 8)
    add_cylinder(bm_trim, (0.0, 1.05, 9.55), 2.42, 2.52, 0.45, segs=8, rot_z=math.pi / 8)
    add_crenellations_ring(bm_wall, 0.0, 1.05, 9.95, 2.30, count=8, merlon_w=0.52, merlon_d=0.32, merlon_h=0.42)
    add_cylinder(bm_roof, (0.0, 1.05, 10.0), 2.58, 0.09, 4.35, segs=8, rot_z=math.pi / 8)
    # Golden ridge ribs & finial flagpole on central spire
    add_cylinder(bm_gold, (0.0, 1.05, 14.25), 0.10, 0.03, 1.45, segs=8)
    bmesh.ops.create_icosphere(bm_gold, subdivisions=2, radius=0.25, matrix=Matrix.Translation((0.0, 1.05, 14.42)))
    add_flag_pennant(bm_banner, (0.0, 1.05, 15.55), length=1.85, height=0.78, rot_z=0.25)
    # Royal glowing windows all around the central keep
    for wi in range(8):
        a = wi * (math.pi * 0.25)
        add_box(bm_glow, (2.12 * math.cos(a), 1.05 + 2.12 * math.sin(a), 7.85), (0.18, 0.56, 1.42), rot_z=a)

    # Vertex-color masonry subtle variation on Kingdom limestone walls
    c_w_hi = hex_rgba('#F4F0E7')
    c_w_lo = hex_rgba('#CFC6B6')
    wall_vcol = lambda co, n: lerp_rgba(
        c_w_lo, c_w_hi,
        min(1.0, max(0.0, 0.35 + 0.45 * (co.z / 10.0) + 0.25 * fbm_noise(co.x * 1.4, co.y * 1.4, co.z * 1.1))),
    )

    finalize_part(bm_wall, 'Kingdom_Walls_And_Towers', col, mats['kingdom_wall'], root, smooth=False, vcol_fn=wall_vcol)
    finalize_part(bm_trim, 'Kingdom_Stone_Trim', col, mats['kingdom_trim'], root, smooth=False)
    finalize_part(bm_roof, 'Kingdom_RoyalBlue_Roofs', col, mats['kingdom_roof'], root, smooth=False)
    finalize_part(bm_gold, 'Kingdom_Gold_Crest_Finials', col, mats['gold'], root, smooth=False)
    finalize_part(bm_glow, 'Kingdom_Glowing_Windows', col, mats['glow_warm'], root, smooth=False)
    finalize_part(bm_door, 'Kingdom_Gate_Doors', col, mats['kingdom_door'], root, smooth=False)
    finalize_part(bm_banner, 'Kingdom_Banners', col, mats['kingdom_banner'], root, smooth=False)
    return root


# ---------------------------------------------------------------------------
# 2. FOREST ALLIANCE CASTLE (West, -X) — Living Ancient Giant Tree + Organic Treehouses
# ---------------------------------------------------------------------------

def build_castle_forest(col, mats):
    root = make_castle_root('Castle_Forest_Root', 'forest', col)
    bm_bark = bmesh.new()
    bm_wood = bmesh.new()
    bm_stone = bmesh.new()
    bm_canopy = bmesh.new()
    bm_roof = bmesh.new()
    bm_glow = bmesh.new()
    bm_banner = bmesh.new()
    bm_gold = bmesh.new()

    # 1. Organic Mossy Stone Terrace Retaining Base (curved & rustic)
    add_cylinder(bm_stone, (0.0, 0.3, -1.8), 6.8, 6.2, 1.85, segs=14)
    # Low curved mossy parapet flanking the front entrance
    for sx in (-1.0, 1.0):
        add_box(bm_stone, (sx * 3.8, -3.9, 0.95), (3.6, 0.95, 1.9), rot_z=sx * 0.22)
        add_banner(bm_banner, (sx * 2.45, -4.65, 2.65), width=0.88, height=2.05, rot_z=0.0)
        add_box(bm_gold, (sx * 2.45, -4.72, 1.85), (0.20, 0.06, 0.55))

    # 2. Colossal Gnarled Ancient World-Tree Trunk (curved & organic!)
    trunk_pts = [
        (0.0, 0.5, -0.5),
        (-0.2, 0.4, 1.5),
        (-0.45, 0.55, 3.6),
        (-0.25, 0.75, 5.8),
        (0.15, 0.65, 7.9),
        (0.05, 0.6, 9.6),
    ]
    trunk_rads = [3.65, 3.05, 2.55, 2.25, 2.05, 1.55]
    add_tube_along_curve(bm_bark, trunk_pts, trunk_rads, segs=12)

    # 8 Sweeping Thick Root Buttresses gripping the terrace & curving down the cliff!
    root_angles = [-155, -120, -45, -20, 25, 65, 115, 155]
    for idx, deg in enumerate(root_angles):
        a = math.radians(deg)
        ca, sa = math.cos(a), math.sin(a)
        # Avoid blocking the front gate doorway directly at -90 deg (-Y)
        pts = [
            (ca * 1.4, 0.5 + sa * 1.4, 2.8 + (idx % 2) * 0.6),
            (ca * 3.4, 0.5 + sa * 3.4, 1.3),
            (ca * 5.2, 0.5 + sa * 5.2, 0.25),
            (ca * 6.4, 0.5 + sa * 6.4, -1.55),
        ]
        rads = [1.05, 0.82, 0.62, 0.34]
        add_tube_along_curve(bm_bark, pts, rads, segs=8)

    # 6 Sweeping Thick Upper Boughs spreading outward to cradle canopy & watchtowers
    bough_specs = [
        # (dx, dy, dz_mid, dz_end, reach)
        (-0.85, -0.45, 8.6, 10.2, 6.2),
        (0.88, -0.42, 8.8, 10.4, 6.1),
        (-0.92, 0.38, 9.2, 11.1, 6.6),
        (0.90, 0.42, 9.0, 10.8, 6.4),
        (-0.15, 0.95, 9.6, 11.6, 5.8),
        (0.10, -0.82, 8.5, 9.9, 5.2),
    ]
    for dx, dy, zm, ze, reach in bough_specs:
        pts = [
            (0.0, 0.6, 6.8),
            (dx * reach * 0.42, 0.6 + dy * reach * 0.42, zm),
            (dx * reach * 0.78, 0.6 + dy * reach * 0.78, (zm + ze) * 0.5 + 0.35),
            (dx * reach, 0.6 + dy * reach, ze),
        ]
        rads = [1.22, 0.88, 0.58, 0.28]
        add_tube_along_curve(bm_bark, pts, rads, segs=8)

    # 3. Living Trunk Elven Sanctuary Gatehouse (y = -3.8, facing -Y toward Plaza!)
    # Sculpted curved timber frame arch nestled into the ancient trunk
    add_box(bm_wood, (0.0, -3.55, 2.2), (3.8, 1.9, 4.4))
    add_pitched_roof(bm_roof, (0.0, -3.55, 4.35), 4.2, 2.4, 1.95, overhang=0.35)
    # Warm glowing elven arched portal doorway with carved timber mullions
    add_box(bm_glow, (0.0, -4.52, 1.50), (1.75, 0.18, 2.58))
    add_box(bm_wood, (0.0, -4.60, 1.52), (0.12, 0.12, 2.55))
    add_box(bm_wood, (0.0, -4.60, 1.65), (1.75, 0.12, 0.12))
    # Organic curved root/timber arch framing the doorway
    arch_pts = [
        (-1.45, -4.55, 0.0),
        (-1.35, -4.58, 2.1),
        (-0.75, -4.62, 3.25),
        (0.0, -4.65, 3.65),
        (0.75, -4.62, 3.25),
        (1.35, -4.58, 2.1),
        (1.45, -4.55, 0.0),
    ]
    add_tube_along_curve(bm_bark, arch_pts, [0.36, 0.32, 0.28, 0.26, 0.28, 0.32, 0.36], segs=7)
    # Golden carved leaf crest above portal
    add_cylinder(bm_gold, (0.0, -4.68, 3.72), 0.28, 0.04, 0.92, segs=6)

    # 4. Three Integrated Elven Treehouse Watchtowers & Suspended Timber Walkways
    tree_towers = [
        (-4.55, -2.15, 0.0, 5.4, 1.45, 2.55),  # Front-left watchtower
        (4.55, -2.05, 0.0, 5.8, 1.45, 2.65),   # Front-right watchtower
        (0.0, 0.6, 8.6, 3.2, 1.65, 2.85),      # High crown lookout sanctuary inside canopy!
        (-4.2, 3.2, 0.0, 5.2, 1.32, 2.35),     # Rear-left tower
        (4.2, 3.2, 0.0, 5.0, 1.32, 2.35),      # Rear-right tower
    ]
    for tx, ty, tz0, th, trad, rh in tree_towers:
        # Stone or living-wood base column
        if tz0 < 1.0:
            add_cylinder(bm_stone, (tx, ty, -0.5), trad * 1.12, trad * 0.96, th * 0.45 + 0.5, segs=10)
            add_cylinder(bm_wood, (tx, ty, th * 0.45), trad * 0.96, trad * 1.05, th * 0.55, segs=10)
        else:
            add_cylinder(bm_wood, (tx, ty, tz0), trad * 0.95, trad * 1.06, th, segs=10)
        # Cantilevered timber lookout balcony
        bal_z = tz0 + th
        add_cylinder(bm_wood, (tx, ty, bal_z - 0.15), trad * 1.35, trad * 1.42, 0.32, segs=10)
        # Flared curved emerald leaf-shingle roof (2-stage pagoda/elven flare!)
        add_cylinder(bm_roof, (tx, ty, bal_z + 0.15), trad * 1.72, trad * 0.82, rh * 0.45, segs=10)
        add_cylinder(bm_roof, (tx, ty, bal_z + 0.15 + rh * 0.42), trad * 0.86, 0.06, rh * 0.65, segs=10)
        add_cylinder(bm_gold, (tx, ty, bal_z + rh + 0.12), 0.08, 0.02, 0.72, segs=6)
        # Warm glowing amber windows facing outward
        for wi in range(4):
            a = wi * (math.pi * 0.5) - math.pi * 0.5
            add_box(bm_glow, (tx + trad * 0.98 * math.cos(a), ty + trad * 0.98 * math.sin(a), bal_z - 1.15), (0.16, 0.48, 0.95), rot_z=a)

    # Suspended curved timber walkways connecting central trunk to front flanking towers
    for sx in (-1.0, 1.0):
        add_box(bm_wood, (sx * 2.4, -2.85, 3.15), (3.1, 1.05, 0.32), rot_z=sx * -0.26)
        # Hanging golden fairy lanterns underneath walkways
        bmesh.ops.create_icosphere(bm_glow, subdivisions=2, radius=0.26, matrix=Matrix.Translation((sx * 2.5, -3.25, 2.55)))

    # 5. Lush Sculpted Multi-Cluster Ancient Tree Canopy Crown (iconic billowing silhouette!)
    canopy_blobs = [
        # (x, y, z, rx, ry, rz)
        (0.0, 0.6, 12.2, 4.4, 3.9, 2.45),       # central upper crown
        (-3.6, -1.6, 10.6, 3.4, 3.0, 2.15),     # front-left bough cluster
        (3.8, -1.5, 10.8, 3.5, 3.1, 2.2),       # front-right bough cluster
        (-4.6, 1.6, 11.4, 3.7, 3.4, 2.35),      # mid-left lush canopy
        (4.5, 1.8, 11.2, 3.6, 3.3, 2.3),        # mid-right lush canopy
        (-1.8, 3.8, 11.8, 3.6, 3.4, 2.4),       # rear-left crown
        (2.0, 3.6, 11.6, 3.5, 3.2, 2.3),        # rear-right crown
        (0.0, -2.4, 9.8, 3.0, 2.4, 1.85),       # front overhang above gate
        (-5.8, -0.2, 9.5, 2.6, 2.5, 1.85),      # outer-left drape
        (5.8, 0.2, 9.6, 2.7, 2.5, 1.85),        # outer-right drape
        (-2.2, -0.4, 13.0, 2.8, 2.6, 1.9),      # sunlit upper lobe L
        (2.2, 0.8, 13.2, 2.9, 2.7, 1.95),       # sunlit upper lobe R
        (0.0, 2.2, 13.5, 3.1, 2.8, 1.95),       # peak sunlit dome (local Z ~ 15.4 -> world 17.6!)
        (-4.8, -3.4, 8.2, 1.9, 1.8, 1.35),      # lower vine foliage L
        (4.8, -3.2, 8.5, 1.9, 1.8, 1.35),       # lower vine foliage R
    ]
    for cx, cy, cz, rx, ry, rz in canopy_blobs:
        ret = bmesh.ops.create_icosphere(
            bm_canopy, subdivisions=2, radius=1.0,
            matrix=Matrix.Translation((cx, cy, cz)) @ Matrix.Diagonal((rx, ry, rz, 1.0)),
        )
        for v in ret['verts']:
            nv = (fbm_noise(v.co.x * 0.55, v.co.y * 0.55, v.co.z * 0.55) - 0.5) * 0.72
            v.co += Vector((nv, nv * 0.8, nv * 0.55))

    # Hanging glowing lanterns dangling under canopy boughs
    for lx, ly, lz in [(-3.8, -2.8, 8.5), (3.8, -2.7, 8.6), (0.0, -3.9, 7.6), (-5.2, 0.6, 7.8), (5.2, 0.8, 7.9)]:
        bmesh.ops.create_icosphere(bm_glow, subdivisions=2, radius=0.25, matrix=Matrix.Translation((lx, ly, lz)))

    # Rich painterly vertex colors for bark, wood, stone, and sunlit foliage canopy!
    c_bark_hi = hex_rgba('#8C6240')
    c_bark_lo = hex_rgba('#4D311E')
    c_moss = hex_rgba('#437A32')
    bark_vcol = lambda co, n: lerp_rgba(
        lerp_rgba(c_bark_lo, c_bark_hi, 0.3 + 0.7 * fbm_noise(co.x * 0.9, co.y * 0.9, co.z * 0.6)),
        c_moss,
        max(0.0, n.z - 0.45) * 0.9,
    )

    c_leaf_sun = hex_rgba('#8ED143')
    c_leaf_mid = hex_rgba('#3C9438')
    c_leaf_shd = hex_rgba('#1D4D26')
    canopy_vcol = lambda co, n: lerp_rgba(
        lerp_rgba(c_leaf_shd, c_leaf_mid, max(0.0, min(1.0, 0.45 + 0.55 * n.z))),
        c_leaf_sun,
        max(0.0, min(1.0, (co.z - 10.0) / 5.2 * 0.65 + max(0.0, n.z) * 0.45)),
    )

    c_w_hi = hex_rgba('#A67144')
    c_w_lo = hex_rgba('#694123')
    wood_vcol = lambda co, n: lerp_rgba(c_w_lo, c_w_hi, 0.35 + 0.65 * fbm_noise(co.x * 1.3, co.y * 1.3, co.z))

    c_st_hi = hex_rgba('#9FA38E')
    c_st_lo = hex_rgba('#5F6E52')
    stone_vcol = lambda co, n: lerp_rgba(c_st_lo, c_st_hi, 0.35 + 0.65 * fbm_noise(co.x, co.y, co.z))

    finalize_part(bm_bark, 'Forest_Ancient_WorldTree', col, mats['forest_bark'], root, smooth=True, vcol_fn=bark_vcol)
    finalize_part(bm_wood, 'Forest_Elven_Timber', col, mats['forest_wood'], root, smooth=False, vcol_fn=wood_vcol)
    finalize_part(bm_stone, 'Forest_Mossy_StoneBase', col, mats['forest_stone'], root, smooth=False, vcol_fn=stone_vcol)
    finalize_part(bm_canopy, 'Forest_Canopy_Foliage', col, mats['forest_canopy'], root, smooth=False, vcol_fn=canopy_vcol)
    finalize_part(bm_roof, 'Forest_Leaf_Roofs', col, mats['forest_roof'], root, smooth=False)
    finalize_part(bm_glow, 'Forest_Amber_Glow', col, mats['glow_forest'], root, smooth=True)
    finalize_part(bm_banner, 'Forest_Banners', col, mats['forest_banner'], root, smooth=False)
    finalize_part(bm_gold, 'Forest_Gold_Emblems', col, mats['gold'], root, smooth=False)
    return root


# ---------------------------------------------------------------------------
# 3. DEMON ARMY CASTLE (East, +X) — Sharp Obsidian Spires, Floating Violet Mana Crystal
# ---------------------------------------------------------------------------

def add_obsidian_spire(bm_wall, bm_roof, bm_trim, bm_glow, x, y, base_z, r_base, h_shaft, h_needle, segs=6):
    """Sharp gothic hexagonal obsidian spire (completely distinct from cylindrical Kingdom towers!)."""
    add_cylinder(bm_wall, (x, y, base_z), r_base * 1.15, r_base * 0.78, h_shaft, segs=segs, rot_z=math.pi / segs)
    # Flared spiked gothic crown collar
    collar_z = base_z + h_shaft
    add_cylinder(bm_trim, (x, y, collar_z - 0.15), r_base * 0.85, r_base * 1.28, 0.55, segs=segs, rot_z=math.pi / segs)
    # Razor-sharp gothic spikes rising around collar
    for i in range(segs):
        a = 2.0 * math.pi * i / segs + math.pi / segs
        sx = x + r_base * 1.12 * math.cos(a)
        sy = y + r_base * 1.12 * math.sin(a)
        add_cylinder(bm_roof, (sx, sy, collar_z + 0.35), 0.24, 0.02, 1.25, segs=4, rot_z=a)
    # Tall acute needle spire
    add_cylinder(bm_roof, (x, y, collar_z + 0.35), r_base * 0.92, 0.03, h_needle, segs=segs, rot_z=math.pi / segs)
    # Vertical glowing violet rune-slit windows
    for i in range(0, segs, 2):
        a = 2.0 * math.pi * i / segs
        add_box(bm_glow, (x + r_base * 0.88 * math.cos(a), y + r_base * 0.88 * math.sin(a), base_z + h_shaft * 0.62), (0.14, 0.30, h_shaft * 0.42), rot_z=a)


def build_castle_demon(col, mats):
    root = make_castle_root('Castle_Demon_Root', 'demon', col)
    bm_wall = bmesh.new()
    bm_trim = bmesh.new()
    bm_roof = bmesh.new()
    bm_crys = bmesh.new()
    bm_glow = bmesh.new()
    bm_banner = bmesh.new()

    # 1. Angular Jagged Hexagonal Obsidian Crag Base
    add_cylinder(bm_wall, (0.0, 0.2, -1.8), 7.2, 6.4, 1.85, segs=6, rot_z=math.pi / 6)

    # 2. Spiked Angular Bastion Curtain Walls (hexagonal fortress silhouette!)
    wall_h = 3.4
    wall_segs = [
        ((-5.2, -3.3), (-2.3, -4.3)),
        ((2.3, -4.3), (5.2, -3.3)),
        ((-5.5, -3.1), (-5.8, 2.8)),
        ((5.5, -3.1), (5.8, 2.8)),
        ((-5.5, 2.9), (0.0, 5.2)),
        ((0.0, 5.2), (5.5, 2.9)),
    ]
    for p0, p1 in wall_segs:
        v0, v1 = Vector((p0[0], p0[1], 0.0)), Vector((p1[0], p1[1], 0.0))
        mid = (v0 + v1) * 0.5
        length = (v1 - v0).length
        ang = math.atan2(v1.y - v0.y, v1.x - v0.x)
        add_box(bm_wall, (mid.x, mid.y, wall_h * 0.5), (length, 0.95, wall_h), rot_z=ang)
        add_box(bm_trim, (mid.x, mid.y, wall_h + 0.1), (length + 0.1, 1.12, 0.24), rot_z=ang)
        # Razor obsidian spikes along curtain wall instead of flat merlons!
        n_sp = max(2, int(length / 1.1))
        for k in range(n_sp):
            t = (k + 0.5) / n_sp
            sp = v0.lerp(v1, t)
            add_cylinder(bm_roof, (sp.x, sp.y, wall_h + 0.2), 0.26, 0.02, 0.92, segs=4, rot_z=ang)

    # 3. Pointed Gothic Thorn Gatehouse (sleek spiked gothic arch framing the Giant Crystal behind!)
    add_box(bm_wall, (0.0, -4.3, 2.2), (4.1, 1.75, 4.4))
    # Sharp spiked obsidian parapet + twin gothic front pinnacles (keeps sightline open to the Giant Mana Crystal!)
    add_box(bm_trim, (0.0, -4.3, 4.48), (4.35, 1.95, 0.28))
    add_cylinder(bm_roof, (0.0, -4.45, 4.6), 1.35, 0.04, 2.65, segs=4, rot_z=math.pi / 4)
    for sx in (-1.0, 1.0):
        add_cylinder(bm_roof, (sx * 1.95, -4.45, 4.6), 0.55, 0.03, 2.25, segs=4, rot_z=math.pi / 4)
    # Glowing intense violet arcane portal gateway with obsidian vertical gothic bars
    add_box(bm_glow, (0.0, -5.20, 1.55), (1.72, 0.16, 2.75))
    add_cylinder(bm_glow, (0.0, -5.20, 2.88), 0.86, 0.05, 0.92, segs=4, rot_z=math.pi / 4)
    for gx in (-0.48, 0.0, 0.48):
        add_box(bm_trim, (gx, -5.28, 1.75), (0.09, 0.10, 2.65))
    # Sweeping obsidian blade horns flanking the gothic gate
    for sx in (-1.0, 1.0):
        blade_pts = [
            (sx * 1.95, -5.15, 0.0),
            (sx * 2.38, -5.25, 2.6),
            (sx * 2.08, -5.15, 4.9),
            (sx * 1.48, -5.00, 6.5),
        ]
        add_tube_along_curve(bm_roof, blade_pts, [0.46, 0.36, 0.24, 0.04], segs=5)
        # Hanging tattered swallowtail dark purple banners
        add_banner(bm_banner, (sx * 3.7, -4.15, 3.2), width=0.95, height=2.35, rot_z=sx * -0.25, swallowtail=True)

    # 4. Five Asymmetric Razor-Sharp Obsidian Needle Spires!
    spire_specs = [
        (-5.25, -3.15, 0.0, 1.25, 5.2, 4.4),  # Front-left spire (top 9.6)
        (5.25, -3.15, 0.0, 1.32, 5.8, 4.8),   # Front-right taller spire (top 10.6)
        (-5.55, 2.75, 0.0, 1.38, 6.4, 5.2),   # Rear-left tall spire (top 11.6)
        (5.55, 2.75, 0.0, 1.28, 5.6, 4.6),    # Rear-right spire (top 10.2)
        (0.0, 4.95, 0.0, 1.55, 7.6, 5.8),     # Rear-center towering dread spire (top 13.4 -> world 15.8!)
    ]
    for sx, sy, sz, sr, sh, sn in spire_specs:
        add_obsidian_spire(bm_wall, bm_roof, bm_trim, bm_glow, sx, sy, sz, sr, sh, sn, segs=6)

    # 5. Central Dark Cathedral Sanctum & Ritual Cradle for Levitating Giant Mana Crystal!
    add_cylinder(bm_wall, (0.0, 0.5, 0.0), 3.65, 3.15, 6.8, segs=6, rot_z=math.pi / 6)
    add_cylinder(bm_trim, (0.0, 0.5, 6.65), 3.25, 3.55, 0.45, segs=6, rot_z=math.pi / 6)
    # Glowing gothic cathedral lancet windows around central hall
    for wi in range(6):
        a = wi * (math.pi / 3.0)
        add_box(bm_glow, (3.25 * math.cos(a), 0.5 + 3.25 * math.sin(a), 4.25), (0.16, 0.62, 2.35), rot_z=a)

    # 4 Dramatic Curved Obsidian Ritual Claw-Arches cradling the Giant Crystal
    for i in range(4):
        a = math.radians(45 + 90 * i)
        ca, sa = math.cos(a), math.sin(a)
        claw_pts = [
            (ca * 3.1, 0.5 + sa * 3.1, 6.8),
            (ca * 3.5, 0.5 + sa * 3.5, 9.2),
            (ca * 2.5, 0.5 + sa * 2.5, 11.6),
            (ca * 1.45, 0.5 + sa * 1.45, 12.8),
        ]
        add_tube_along_curve(bm_roof, claw_pts, [0.58, 0.46, 0.30, 0.08], segs=5)

    # ICONIC CENTERPIECE: Giant Faceted Levitating Amethyst Mana Crystal! (local Z = 8.4..13.8 -> world 10.8..16.2!)
    add_cylinder(bm_crys, (0.0, 0.5, 10.6), 1.45, 0.04, 3.25, segs=6)   # upper pyramid
    add_cylinder(bm_crys, (0.0, 0.5, 8.2), 0.06, 1.45, 2.40, segs=6)    # lower inverted pyramid
    # Glowing levitating arcane halo ring tilted around the Giant Crystal
    halo_pts = []
    for s in range(25):
        a = 2.0 * math.pi * s / 24
        hx = 2.45 * math.cos(a)
        hy = 0.5 + 2.45 * math.sin(a) * math.cos(0.32)
        hz = 11.1 + 2.45 * math.sin(a) * math.sin(0.32)
        halo_pts.append((hx, hy, hz))
    add_tube_along_curve(bm_glow, halo_pts, [0.13] * len(halo_pts), segs=6, cap_start=False, cap_end=False)

    # 6 Orbiting & Base-Erupting Glowing Amethyst Crystal Clusters!
    base_crystals = [
        (-3.6, -4.6, 0.0, 0.48, 2.2, 0.25, -0.2),
        (3.6, -4.6, 0.0, 0.52, 2.4, -0.25, -0.2),
        (-6.2, -0.4, 0.0, 0.58, 2.8, 0.32, 0.1),
        (6.2, -0.2, 0.0, 0.55, 2.6, -0.30, 0.1),
        (-3.2, 4.4, 0.0, 0.55, 2.7, 0.20, 0.3),
        (3.2, 4.4, 0.0, 0.52, 2.5, -0.22, 0.3),
    ]
    for cx, cy, cz, cr, ch, rx, ry in base_crystals:
        m = Matrix.Translation((cx, cy, cz + ch * 0.45)) @ Matrix.Rotation(rx, 4, 'Y') @ Matrix.Rotation(ry, 4, 'X')
        bmesh.ops.create_cone(bm_crys, cap_ends=True, cap_tris=False, segments=5, radius1=cr, radius2=0.03, depth=ch, matrix=m)
        # Secondary smaller twin shard
        m2 = Matrix.Translation((cx + 0.35, cy - 0.2, cz + ch * 0.28)) @ Matrix.Rotation(-rx * 1.4, 4, 'Y')
        bmesh.ops.create_cone(bm_crys, cap_ends=True, cap_tris=False, segments=5, radius1=cr * 0.65, radius2=0.02, depth=ch * 0.68, matrix=m2)

    c_obs_hi = hex_rgba('#3A3152')
    c_obs_lo = hex_rgba('#171224')
    obs_vcol = lambda co, n: lerp_rgba(
        c_obs_lo, c_obs_hi,
        min(1.0, max(0.0, 0.25 + 0.5 * (co.z / 10.0) + 0.25 * fbm_noise(co.x * 1.2, co.y * 1.2, co.z))),
    )

    finalize_part(bm_wall, 'Demon_Obsidian_Citadel', col, mats['demon_obsidian'], root, smooth=False, vcol_fn=obs_vcol)
    finalize_part(bm_trim, 'Demon_VioletIron_Trim', col, mats['demon_trim'], root, smooth=False)
    finalize_part(bm_roof, 'Demon_Gothic_Spires', col, mats['demon_roof'], root, smooth=False)
    finalize_part(bm_crys, 'Demon_Mana_Crystals', col, mats['demon_crystal'], root, smooth=False)
    finalize_part(bm_glow, 'Demon_Arcane_Glow', col, mats['glow_demon'], root, smooth=False)
    finalize_part(bm_banner, 'Demon_Banners', col, mats['demon_banner'], root, smooth=False)
    return root


# ---------------------------------------------------------------------------
# 4. DRAGON EMPIRE CASTLE (South, -Y) — Volcanic Basalt, Sweeping Bone Dragon Horns, Fire & Crimson
# ---------------------------------------------------------------------------

def add_flame_brazier(bm_iron, bm_flame, pos, scale=1.0):
    """Iron bowl brazier + multi-tongued sculpted glowing flame."""
    x, y, z = pos
    add_cylinder(bm_iron, (x, y, z), 0.35 * scale, 0.62 * scale, 0.48 * scale, segs=8)
    # Sculpted licking fire tongues
    for dx, dy, r, h in ((0.0, 0.0, 0.42, 1.35), (0.18, 0.12, 0.26, 0.95), (-0.18, -0.10, 0.25, 0.88)):
        add_cylinder(bm_flame, (x + dx * scale, y + dy * scale, z + 0.38 * scale), r * scale, 0.02, h * scale, segs=6)


def build_castle_dragon(col, mats):
    root = make_castle_root('Castle_Dragon_Root', 'dragon', col)
    bm_wall = bmesh.new()
    bm_red = bmesh.new()
    bm_roof = bmesh.new()
    bm_horn = bmesh.new()
    bm_iron = bmesh.new()
    bm_bronze = bmesh.new()
    bm_flame = bmesh.new()
    bm_lava = bmesh.new()
    bm_banner = bmesh.new()

    # 1. Heavy Battered Volcanic Basalt Fortress Plinth + Glowing Magma Fissure Veins!
    add_cylinder(bm_wall, (0.0, 0.3, -1.8), 7.6, 6.7, 1.85, segs=8, rot_z=math.pi / 8)
    # Molten lava veins glowing across the outer volcanic apron
    lava_veins = [
        ((-4.2, -5.2, 0.06), (-6.3, -2.5, -0.05)),
        ((4.2, -5.2, 0.06), (6.3, -2.5, -0.05)),
        ((-6.2, 1.5, 0.05), (-5.0, 4.8, -0.05)),
        ((6.2, 1.5, 0.05), (5.0, 4.8, -0.05)),
    ]
    for p0, p1 in lava_veins:
        add_tube_along_curve(bm_lava, [p0, ((p0[0] + p1[0]) * 0.5, (p0[1] + p1[1]) * 0.5, 0.12), p1], [0.22, 0.38, 0.18], segs=6)

    # 2. Heavy Fortified Basalt Curtain Walls with Crimson Banding & Serrated Battlements
    wall_h = 3.5
    add_box(bm_wall, (-4.1, -3.9, wall_h * 0.5), (3.6, 1.2, wall_h))
    add_box(bm_wall, (4.1, -3.9, wall_h * 0.5), (3.6, 1.2, wall_h))
    add_box(bm_wall, (-5.7, 0.2, wall_h * 0.5), (1.2, 8.2, wall_h))
    add_box(bm_wall, (5.7, 0.2, wall_h * 0.5), (1.2, 8.2, wall_h))
    add_box(bm_wall, (0.0, 4.2, wall_h * 0.5), (11.6, 1.2, wall_h))

    # Red stone accent courses & dark iron trims
    add_box(bm_red, (-4.1, -3.9, wall_h - 0.1), (3.7, 1.32, 0.42))
    add_box(bm_red, (4.1, -3.9, wall_h - 0.1), (3.7, 1.32, 0.42))
    add_box(bm_red, (-5.7, 0.2, wall_h - 0.1), (1.32, 8.3, 0.42))
    add_box(bm_red, (5.7, 0.2, wall_h - 0.1), (1.32, 8.3, 0.42))
    add_box(bm_red, (0.0, 4.2, wall_h - 0.1), (11.7, 1.32, 0.42))

    add_crenellations_line(bm_wall, (-5.2, -4.15), (-2.8, -4.15), wall_h + 0.12, merlon_w=0.62, merlon_d=0.55, merlon_h=0.62)
    add_crenellations_line(bm_wall, (2.8, -4.15), (5.2, -4.15), wall_h + 0.12, merlon_w=0.62, merlon_d=0.55, merlon_h=0.62)
    add_crenellations_line(bm_wall, (-5.85, -3.3), (-5.85, 3.6), wall_h + 0.12, merlon_w=0.62, merlon_d=0.55, merlon_h=0.62)
    add_crenellations_line(bm_wall, (5.85, -3.3), (5.85, 3.6), wall_h + 0.12, merlon_w=0.62, merlon_d=0.55, merlon_h=0.62)
    add_crenellations_line(bm_wall, (-5.1, 4.35), (5.1, 4.35), wall_h + 0.12, merlon_w=0.62, merlon_d=0.55, merlon_h=0.62)

    # 3. Dragon-Maw Furnace Gatehouse (y = -4.3, facing -Y toward Plaza!)
    add_box(bm_wall, (0.0, -4.1, 2.5), (5.2, 2.1, 5.0))
    add_box(bm_red, (0.0, -4.1, 5.05), (5.5, 2.3, 0.45))
    # Blazing furnace-glow arched gate maw + dark iron portcullis bars + bone fangs along upper arch!
    add_box(bm_flame, (0.0, -5.16, 1.45), (2.25, 0.16, 2.70))
    for gx in (-0.65, 0.0, 0.65):
        add_box(bm_iron, (gx, -5.24, 1.35), (0.12, 0.12, 2.50))
    add_box(bm_iron, (0.0, -5.24, 2.95), (2.85, 0.35, 0.42))
    for fx in (-0.85, -0.30, 0.30, 0.85):
        add_cylinder(bm_horn, (fx, -5.24, 2.25), 0.03, 0.14, 0.55, segs=5)  # dragon teeth fangs along top arch!

    # Sculpted Stylized Dragon Skull / Crest Mounted Over the Gate Arch!
    add_box(bm_red, (0.0, -5.22, 4.05), (1.65, 0.22, 1.55))  # crimson heraldic plaque
    # Bone dragon snout & brow ridges
    add_box(bm_horn, (0.0, -5.36, 4.15), (0.85, 0.35, 0.72))
    add_cylinder(bm_horn, (0.0, -5.42, 3.45), 0.14, 0.36, 0.55, segs=6)
    for sx in (-1.0, 1.0):
        # Glowing fiery dragon eyes on the skull crest
        bmesh.ops.create_icosphere(bm_flame, subdivisions=1, radius=0.14, matrix=Matrix.Translation((sx * 0.26, -5.52, 4.25)))
        # Small crest horns curving up from skull
        add_tube_along_curve(bm_horn, [
            (sx * 0.36, -5.35, 4.45),
            (sx * 0.75, -5.35, 4.95),
            (sx * 0.95, -5.25, 5.55),
        ], [0.16, 0.11, 0.03], segs=6)

    # Bold Crimson War Banners flanking front gate & towers
    for sx in (-1.0, 1.0):
        add_banner(bm_banner, (sx * 4.1, -4.65, 3.35), width=1.05, height=2.25, rot_z=0.0)
        add_box(bm_bronze, (sx * 4.1, -4.72, 2.45), (0.38, 0.06, 0.55))

    # 4. ICONIC GIANT SWEPT DRAGON HORNS / TUSKS! (Unmistakable Dragon Silhouette!)
    # Pair A: Huge curved bone tusks sweeping up around the Front Gatehouse!
    for sx in (-1.0, 1.0):
        front_tusk = [
            (sx * 3.15, -4.95, 0.0),
            (sx * 3.75, -5.35, 1.9),
            (sx * 3.65, -5.25, 4.0),
            (sx * 2.95, -4.95, 5.8),
            (sx * 2.15, -4.65, 7.1),
        ]
        add_tube_along_curve(bm_horn, front_tusk, [0.68, 0.56, 0.42, 0.24, 0.05], segs=8)
        # Bronze ring bands around tusk base
        add_cylinder(bm_bronze, (sx * 3.25, -5.02, 0.5), 0.74, 0.70, 0.38, segs=8)

    # Pair B: COLOSSAL Crown Dragon Horns sweeping majestically outward & upward from the Central Keep!
    for sx in (-1.0, 1.0):
        crown_horn = [
            (sx * 2.4, 1.2, 5.8),
            (sx * 4.4, 1.5, 7.5),
            (sx * 5.6, 1.3, 9.6),
            (sx * 5.1, 0.9, 11.4),
            (sx * 3.8, 0.6, 12.6),
        ]
        add_tube_along_curve(bm_horn, crown_horn, [0.95, 0.76, 0.55, 0.32, 0.06], segs=9)
        # Secondary mid-swept rear spine horns
        back_horn = [
            (sx * 1.9, 2.8, 5.2),
            (sx * 3.4, 3.8, 7.0),
            (sx * 3.8, 4.4, 8.9),
            (sx * 3.0, 4.6, 10.3),
        ]
        add_tube_along_curve(bm_horn, back_horn, [0.62, 0.48, 0.28, 0.05], segs=7)

    # 5. Four Heavy Squat Iron-Banded War Bastion Towers + Roaring Flame Braziers!
    war_towers = [
        (-5.7, -3.7, 5.2, True),
        (5.7, -3.7, 5.2, True),
        (-5.7, 4.0, 5.8, True),
        (5.7, 4.0, 5.8, True),
    ]
    for tx, ty, th, has_brazier in war_towers:
        add_cylinder(bm_wall, (tx, ty, -0.4), 1.65, 1.42, th + 0.4, segs=8, rot_z=math.pi / 8)
        add_cylinder(bm_iron, (tx, ty, th * 0.45), 1.56, 1.54, 0.32, segs=8, rot_z=math.pi / 8)
        add_cylinder(bm_red, (tx, ty, th - 0.15), 1.58, 1.65, 0.45, segs=8, rot_z=math.pi / 8)
        add_crenellations_ring(bm_wall, tx, ty, th + 0.25, 1.48, count=8, merlon_w=0.45, merlon_d=0.35, merlon_h=0.52)
        if has_brazier:
            add_flame_brazier(bm_iron, bm_flame, (tx, ty, th + 0.25), scale=1.25)
        # Glowing furnace slit windows
        wy_dir = -1.0 if ty < 0 else 1.0
        wx_dir = -1.0 if tx < 0 else 1.0
        add_box(bm_flame, (tx, ty + wy_dir * 1.45, th * 0.65), (0.36, 0.14, 1.05))
        add_box(bm_flame, (tx + wx_dir * 1.45, ty, th * 0.65), (0.14, 0.36, 1.05))

    # Flanking gatehouse flame braziers right beside the entrance
    for sx in (-1.0, 1.0):
        add_flame_brazier(bm_iron, bm_flame, (sx * 2.15, -4.45, 5.25), scale=1.05)

    # 6. Broad Fortified Inner Volcanic Citadel Keep (Z up to ~11.8 local -> 14.0 world)
    add_box(bm_wall, (0.0, 0.9, 3.0), (8.2, 5.6, 6.0))
    add_box(bm_red, (0.0, 0.9, 6.0), (8.55, 5.95, 0.42))
    add_pitched_roof(bm_roof, (0.0, 0.9, 6.2), 8.2, 5.6, 2.2, overhang=0.35)
    # Central War Citadel Tower rising above inner keep
    add_cylinder(bm_wall, (0.0, 1.1, 6.0), 2.55, 2.15, 3.6, segs=8, rot_z=math.pi / 8)
    add_cylinder(bm_red, (0.0, 1.1, 9.45), 2.35, 2.52, 0.45, segs=8, rot_z=math.pi / 8)
    add_crenellations_ring(bm_wall, 0.0, 1.1, 9.85, 2.32, count=8, merlon_w=0.55, merlon_d=0.38, merlon_h=0.55)
    # Central Giant Roaring Eternal Flame Cauldron + War Standard at Keep Crown!
    add_flame_brazier(bm_iron, bm_flame, (0.0, 1.1, 9.85), scale=1.85)
    add_cylinder(bm_iron, (0.0, 2.4, 9.8), 0.10, 0.05, 2.8, segs=6)
    add_flag_pennant(bm_banner, (0.0, 2.4, 12.5), length=2.1, height=0.88, rot_z=0.32)

    # Fiery inner hall slit windows
    for wx in (-2.5, -1.0, 1.0, 2.5):
        add_box(bm_flame, (wx, -1.92, 4.4), (0.48, 0.15, 1.25))
        add_box(bm_flame, (wx, 3.72, 4.4), (0.48, 0.15, 1.25))

    # Vertex colors for basalt rock & aged ivory bone horns!
    c_bas_hi = hex_rgba('#4E3934')
    c_bas_lo = hex_rgba('#231817')
    bas_vcol = lambda co, n: lerp_rgba(
        c_bas_lo, c_bas_hi,
        min(1.0, max(0.0, 0.3 + 0.45 * (co.z / 9.0) + 0.25 * fbm_noise(co.x * 1.1, co.y * 1.1, co.z))),
    )

    c_bone_tip = hex_rgba('#F2E5C9')
    c_bone_base = hex_rgba('#755B45')
    horn_vcol = lambda co, n: lerp_rgba(
        c_bone_base, c_bone_tip,
        min(1.0, max(0.0, (co.z - 0.5) / 8.5 + 0.25)),
    )

    finalize_part(bm_wall, 'Dragon_Basalt_Fortress', col, mats['dragon_basalt'], root, smooth=False, vcol_fn=bas_vcol)
    finalize_part(bm_red, 'Dragon_Crimson_Stone', col, mats['dragon_redstone'], root, smooth=False)
    finalize_part(bm_roof, 'Dragon_Fortress_Roofs', col, mats['dragon_roof'], root, smooth=False)
    finalize_part(bm_horn, 'Dragon_Bone_Horns_Skull', col, mats['dragon_horn'], root, smooth=True, vcol_fn=horn_vcol)
    finalize_part(bm_iron, 'Dragon_Iron_Braziers', col, mats['iron_dark'], root, smooth=False)
    finalize_part(bm_bronze, 'Dragon_Bronze_Trim', col, mats['dragon_bronze'], root, smooth=False)
    finalize_part(bm_flame, 'Dragon_Roaring_Flames', col, mats['glow_dragon'], root, smooth=True)
    finalize_part(bm_lava, 'Dragon_Magma_Veins', col, mats['lava'], root, smooth=True)
    finalize_part(bm_banner, 'Dragon_Crimson_Banners', col, mats['dragon_banner'], root, smooth=False)
    return root
