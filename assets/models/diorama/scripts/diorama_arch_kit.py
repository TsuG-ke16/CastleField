"""High-detail reusable 3D architectural geometry primitives (bmesh) for Castle Field Diorama.

Includes:
- Framed arched windows with sills, mullions, and recessed glowing glass
- Circular Gothic Rose Windows with radial stone/gold tracery
- Machicolated stone parapets & corbelled battlements
- Flared shingled spire roofs with 3D ridge ribs, roof dormers, and finials
- Sweeping Gothic flying buttresses
- Parallel-transport smooth & annulated (ring-ribbed) curved dragon horns
- Fluted organic ancient tree trunks & twisting branches
- Multi-layered roaring flame braziers (wrought iron claw bowl + outer orange-red flame + yellow-gold core)
"""

import math
import bmesh
from mathutils import Vector, Matrix


def add_box(bm, center, size, rot_z=0.0, rot_x=0.0, rot_y=0.0):
    m = (
        Matrix.Translation(center)
        @ Matrix.Rotation(rot_z, 4, 'Z')
        @ Matrix.Rotation(rot_y, 4, 'Y')
        @ Matrix.Rotation(rot_x, 4, 'X')
        @ Matrix.Diagonal((size[0], size[1], size[2], 1.0))
    )
    bmesh.ops.create_cube(bm, size=1.0, matrix=m)


def add_cylinder(bm, base_center, r_bot, r_top, height, segs=12, rot_z=0.0):
    c = (base_center[0], base_center[1], base_center[2] + height * 0.5)
    m = Matrix.Translation(c) @ Matrix.Rotation(rot_z, 4, 'Z')
    bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=False, segments=segs,
        radius1=r_bot, radius2=r_top, depth=height, matrix=m,
    )


def add_pitched_roof(bm, center_base, width, depth, height, overhang=0.28, rot_z=0.0):
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
        bm.verts.new(xform @ Vector((-hw * 0.68, 0.0, z1))),
        bm.verts.new(xform @ Vector((hw * 0.68, 0.0, z1))),
    ]
    bm.faces.new((v[0], v[3], v[2], v[1]))
    bm.faces.new((v[0], v[1], v[5], v[4]))
    bm.faces.new((v[2], v[3], v[4], v[5]))
    bm.faces.new((v[3], v[0], v[4]))
    bm.faces.new((v[1], v[2], v[5]))


def add_tube_along_curve(bm, points, radii, segs=10, cap_start=True, cap_end=True, ridge_amp=0.0, ridge_freq=0.0, flute_amp=0.0, flute_count=0):
    """Parallel-transport (Bishop frame) swept tube with optional keratin rings (ridge_amp) or bark flutes (flute_amp)."""
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
            q = prev_tang.rotation_difference(tang)
            side = q @ side
            side = (side - tang * side.dot(tang)).normalized()
            up = side.cross(tang).normalized()
        prev_tang = tang

        t_u = i / max(1, n - 1)
        # Optional annulated keratin horn rings along curve
        r_mod = rad * (1.0 + ridge_amp * math.sin(t_u * math.pi * ridge_freq)) if ridge_amp > 0.0 else rad

        ring = []
        for s in range(segs):
            a = 2.0 * math.pi * s / segs
            # Optional longitudinal organic bark flutes (twisted slightly along height!)
            r_local = r_mod
            if flute_amp > 0.0 and flute_count > 0:
                r_local *= (1.0 + flute_amp * math.sin(a * flute_count + t_u * 2.2))
            offset = (side * math.cos(a) + up * math.sin(a)) * r_local
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


def sample_catmull_rom(ctrl_pts, ctrl_rads, samples_per_seg=4):
    """Subdivide a control polyline smoothly for curved horns, arches, and gnarled tree boughs."""
    pts_out = []
    rads_out = []
    n = len(ctrl_pts)
    for i in range(n - 1):
        p0 = Vector(ctrl_pts[max(0, i - 1)])
        p1 = Vector(ctrl_pts[i])
        p2 = Vector(ctrl_pts[i + 1])
        p3 = Vector(ctrl_pts[min(n - 1, i + 2)])
        r1, r2 = ctrl_rads[i], ctrl_rads[i + 1]
        steps = samples_per_seg if i < n - 2 else samples_per_seg + 1
        for k in range(steps):
            t = k / samples_per_seg
            t2 = t * t
            t3 = t2 * t
            pos = 0.5 * (
                (2.0 * p1)
                + (-p0 + p2) * t
                + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2
                + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3
            )
            rad = r1 * (1.0 - t) + r2 * t
            pts_out.append(pos)
            rads_out.append(rad)
    return pts_out, rads_out


def add_ribbed_horn(bm, ctrl_pts, ctrl_rads, segs=12, ridge_amp=0.11, ridge_freq=22.0):
    """Sculpted high-resolution annulated (ring-ribbed) curved dragon horn."""
    pts, rads = sample_catmull_rom(ctrl_pts, ctrl_rads, samples_per_seg=5)
    add_tube_along_curve(bm, pts, rads, segs=segs, ridge_amp=ridge_amp, ridge_freq=ridge_freq)


def add_framed_arched_window(bm_trim, bm_glow, pos, rot_z=0.0, width=0.58, height=1.25, pointed=False, mullions=True):
    """Recessed glowing arched window with 3D stone frame, projecting sill, arch crown, and cross mullions.
    Window faces local -Y before rot_z!
    """
    xform = Matrix.Translation(pos) @ Matrix.Rotation(rot_z, 4, 'Z')
    hw = width * 0.5
    hh = height * 0.5
    frame_t = 0.09
    frame_d = 0.16

    # Glowing interior glass plane + pointed/round arch top
    bmesh.ops.create_cube(
        bm_glow, size=1.0,
        matrix=xform @ Matrix.Translation((0.0, -0.02, -0.06)) @ Matrix.Diagonal((width * 0.86, 0.08, height * 0.78, 1.0)),
    )
    arch_h = width * (0.68 if pointed else 0.45)
    bmesh.ops.create_cone(
        bm_glow, cap_ends=True, cap_tris=False, segments=4 if pointed else 8,
        radius1=hw * 0.88, radius2=0.03 if pointed else hw * 0.25, depth=arch_h,
        matrix=xform @ Matrix.Translation((0.0, -0.02, hh * 0.65 + arch_h * 0.35)) @ Matrix.Rotation(math.pi * 0.25 if pointed else 0.0, 4, 'Z') @ Matrix.Diagonal((1.0, 0.25, 1.0, 1.0)),
    )

    # Left & right stone jambs + projecting bottom sill + top lintel/hood mold
    for sx in (-1.0, 1.0):
        bmesh.ops.create_cube(
            bm_trim, size=1.0,
            matrix=xform @ Matrix.Translation((sx * (hw + frame_t * 0.35), -0.06, -0.04)) @ Matrix.Diagonal((frame_t, frame_d, height * 0.86, 1.0)),
        )
    # Projecting stone sill
    bmesh.ops.create_cube(
        bm_trim, size=1.0,
        matrix=xform @ Matrix.Translation((0.0, -0.10, -hh + 0.02)) @ Matrix.Diagonal((width + 0.26, 0.24, 0.13, 1.0)),
    )
    # Stone arch hood
    for sx in (-1.0, 1.0):
        bmesh.ops.create_cube(
            bm_trim, size=1.0,
            matrix=xform @ Matrix.Translation((sx * hw * 0.52, -0.07, hh * 0.72 + arch_h * 0.32)) @ Matrix.Rotation(sx * (0.65 if pointed else 0.48), 4, 'Y') @ Matrix.Diagonal((width * 0.66, frame_d, frame_t * 1.15, 1.0)),
        )

    # Carved cross mullions
    if mullions:
        bmesh.ops.create_cube(
            bm_trim, size=1.0,
            matrix=xform @ Matrix.Translation((0.0, -0.07, 0.0)) @ Matrix.Diagonal((0.055, 0.07, height * 0.86, 1.0)),
        )
        bmesh.ops.create_cube(
            bm_trim, size=1.0,
            matrix=xform @ Matrix.Translation((0.0, -0.07, 0.04)) @ Matrix.Diagonal((width * 0.88, 0.07, 0.055, 1.0)),
        )


def add_rose_window(bm_trim, bm_gold, bm_glow, pos, radius=0.95, rot_z=0.0):
    """Circular Cathedral Rose Window with radial golden stone tracery spokes & warm glowing stained glass."""
    xform = Matrix.Translation(pos) @ Matrix.Rotation(rot_z, 4, 'Z')
    # Glowing circular glass backing
    bmesh.ops.create_cone(
        bm_glow, cap_ends=True, cap_tris=False, segments=20,
        radius1=radius * 0.92, radius2=radius * 0.92, depth=0.10,
        matrix=xform @ Matrix.Rotation(math.pi * 0.5, 4, 'X'),
    )
    # Outer molded stone ring (12 segmented blocks)
    segs = 16
    for i in range(segs):
        a = 2.0 * math.pi * i / segs
        bmesh.ops.create_cube(
            bm_trim, size=1.0,
            matrix=xform @ Matrix.Translation((radius * math.cos(a), -0.06, radius * math.sin(a))) @ Matrix.Rotation(a, 4, 'Y') @ Matrix.Diagonal((0.18, 0.22, (2.0 * math.pi * radius / segs) * 1.08, 1.0)),
        )
    # 8 Golden radial wheel tracery spokes + inner boss ring
    for i in range(8):
        a = i * (math.pi / 4.0)
        bmesh.ops.create_cube(
            bm_gold, size=1.0,
            matrix=xform @ Matrix.Translation((0.0, -0.08, 0.0)) @ Matrix.Rotation(a, 4, 'Y') @ Matrix.Diagonal((radius * 1.82, 0.08, 0.07, 1.0)),
        )
    bmesh.ops.create_cone(
        bm_gold, cap_ends=True, cap_tris=False, segments=12,
        radius1=radius * 0.28, radius2=radius * 0.24, depth=0.14,
        matrix=xform @ Matrix.Translation((0.0, -0.08, 0.0)) @ Matrix.Rotation(math.pi * 0.5, 4, 'X'),
    )


def add_crenellations_line(bm_wall, bm_trim, p0, p1, z_base, merlon_w=0.52, merlon_d=0.46, merlon_h=0.54, gap=0.42, machicolations=True):
    """Battlement merlons + optional overhanging stone corbel machicolations underneath."""
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
        add_box(bm_wall, (p.x, p.y, z_base + merlon_h * 0.5), (merlon_w, merlon_d, merlon_h), rot_z=ang)
        # Beveled coping cap on each merlon
        add_box(bm_trim, (p.x, p.y, z_base + merlon_h + 0.05), (merlon_w + 0.08, merlon_d + 0.08, 0.10), rot_z=ang)
        # Corbel bracket beneath wall walk (machicolation)
        if machicolations:
            add_box(bm_trim, (p.x, p.y, z_base - 0.30), (0.24, merlon_d + 0.24, 0.34), rot_z=ang)


def add_crenellations_ring(bm_wall, bm_trim, cx, cy, z_base, radius, count=10, merlon_w=0.40, merlon_d=0.32, merlon_h=0.44, machicolations=True):
    for i in range(count):
        a = 2.0 * math.pi * i / count
        mx = cx + radius * math.cos(a)
        my = cy + radius * math.sin(a)
        add_box(bm_wall, (mx, my, z_base + merlon_h * 0.5), (merlon_d, merlon_w, merlon_h), rot_z=a)
        add_box(bm_trim, (mx, my, z_base + merlon_h + 0.045), (merlon_d + 0.07, merlon_w + 0.07, 0.09), rot_z=a)
        if machicolations:
            cx_b = cx + (radius - 0.02) * math.cos(a)
            cy_b = cy + (radius - 0.02) * math.sin(a)
            add_box(bm_trim, (cx_b, cy_b, z_base - 0.30), (merlon_d + 0.16, 0.20, 0.32), rot_z=a)


def add_flared_spire_roof(bm_roof, bm_gold, bm_trim, bm_glow, cx, cy, z_base, radius, height, segs=12, rot_z=0.0, dormers=0, finial_h=1.0):
    """Multi-stage flared fairytale conical/octagonal spire roof with golden ribs, dormers, and finial."""
    # Flared eaves skirt (bottom 22% flares slightly outward!)
    h1 = height * 0.24
    h2 = height * 0.76
    add_cylinder(bm_roof, (cx, cy, z_base), radius * 1.14, radius * 0.80, h1, segs=segs, rot_z=rot_z)
    add_cylinder(bm_roof, (cx, cy, z_base + h1 - 0.04), radius * 0.82, 0.06, h2 + 0.04, segs=segs, rot_z=rot_z)
    # Golden eaves molding ring + crown finial orb & needle
    add_cylinder(bm_gold, (cx, cy, z_base - 0.04), radius * 1.16, radius * 1.12, 0.10, segs=segs, rot_z=rot_z)
    top_z = z_base + height
    add_cylinder(bm_gold, (cx, cy, top_z - 0.08), 0.14, 0.03, finial_h, segs=8)
    bmesh.ops.create_icosphere(bm_gold, subdivisions=2, radius=0.18 if radius > 1.8 else 0.13, matrix=Matrix.Translation((cx, cy, top_z + 0.12)))

    # 3D Roof Dormer Windows (gabled lucarnes!) protruding from the roof slope!
    if dormers > 0:
        for i in range(dormers):
            a = (2.0 * math.pi * i) / dormers - math.pi * 0.5
            r_d = radius * 0.72
            dx, dy = cx + r_d * math.cos(a), cy + r_d * math.sin(a)
            dz = z_base + height * 0.32
            # Dormer box + mini pitched roof + tiny glowing window
            add_box(bm_trim, (dx, dy, dz), (0.58, 0.44, 0.62), rot_z=a)
            add_pitched_roof(bm_roof, (dx, dy, dz + 0.30), 0.66, 0.50, 0.44, overhang=0.06, rot_z=a + math.pi * 0.5)
            add_box(bm_glow, (cx + (r_d + 0.29) * math.cos(a), cy + (r_d + 0.29) * math.sin(a), dz - 0.02), (0.08, 0.24, 0.38), rot_z=a)


def add_gothic_flying_buttress(bm_wall, bm_roof, p_outer, p_inner, z_bot, z_top_outer, z_top_inner):
    """True 3D Gothic flying buttress: outer stepped pinnacle pier + sweeping stone arch flyer."""
    ox, oy = p_outer
    ix, iy = p_inner
    ang = math.atan2(iy - oy, ix - ox)
    # Outer stepped pier + sharp gothic pinnacle
    add_box(bm_wall, (ox, oy, z_bot + (z_top_outer - z_bot) * 0.5), (0.82, 0.82, z_top_outer - z_bot), rot_z=ang)
    add_cylinder(bm_roof, (ox, oy, z_top_outer), 0.48, 0.03, 1.85, segs=4, rot_z=ang + math.pi * 0.25)
    # Curved arched flyer connecting outer pier to upper inner wall!
    mid_x = 0.5 * (ox + ix)
    mid_y = 0.5 * (oy + iy)
    mid_z = 0.5 * (z_top_outer + z_top_inner) + 0.55
    pts, rads = sample_catmull_rom(
        [(ox, oy, z_top_outer - 0.45), (mid_x, mid_y, mid_z), (ix, iy, z_top_inner)],
        [0.34, 0.26, 0.30],
        samples_per_seg=4,
    )
    add_tube_along_curve(bm_wall, pts, rads, segs=6)


def add_layered_brazier(bm_iron, bm_flame_outer, bm_flame_core, pos, scale=1.0):
    """Ornate wrought-iron dragon-claw brazier bowl + 3 nested glowing fire layers (outer red-orange + inner yellow-gold!)."""
    x, y, z = pos
    # Tripod iron pedestal & ribbed fire bowl
    add_cylinder(bm_iron, (x, y, z), 0.38 * scale, 0.26 * scale, 0.22 * scale, segs=8)
    add_cylinder(bm_iron, (x, y, z + 0.18 * scale), 0.30 * scale, 0.68 * scale, 0.38 * scale, segs=8)
    # 4 Forged iron claw prongs curving around bowl rim
    for i in range(4):
        a = i * math.pi * 0.5 + math.pi * 0.25
        cx, cy = x + 0.62 * scale * math.cos(a), y + 0.62 * scale * math.sin(a)
        add_cylinder(bm_iron, (cx, cy, z + 0.46 * scale), 0.09 * scale, 0.02 * scale, 0.42 * scale, segs=4, rot_z=a)

    # Outer roaring crimson-orange flame tongues (5 curved licking flames!)
    outer_tongues = [
        (0.0, 0.0, 0.46, 1.55, 0.0, 0.0),
        (0.24, 0.14, 0.28, 1.05, 0.18, -0.14),
        (-0.22, 0.18, 0.26, 0.98, -0.16, -0.15),
        (0.18, -0.22, 0.25, 0.92, 0.14, 0.18),
        (-0.20, -0.18, 0.27, 1.02, -0.18, 0.16),
    ]
    for dx, dy, r, h, rx, ry in outer_tongues:
        m = (
            Matrix.Translation((x + dx * scale, y + dy * scale, z + (0.45 + h * 0.45) * scale))
            @ Matrix.Rotation(rx, 4, 'Y')
            @ Matrix.Rotation(ry, 4, 'X')
        )
        bmesh.ops.create_cone(
            bm_flame_outer, cap_ends=True, cap_tris=False, segments=7,
            radius1=r * scale, radius2=0.02, depth=h * scale, matrix=m,
        )

    # Bright incandescent golden-yellow inner flame core!
    add_cylinder(bm_flame_core, (x, y, z + 0.46 * scale), 0.30 * scale, 0.02, 1.05 * scale, segs=7)
    bmesh.ops.create_icosphere(
        bm_flame_core, subdivisions=2, radius=0.34 * scale,
        matrix=Matrix.Translation((x, y, z + 0.62 * scale)) @ Matrix.Diagonal((1.0, 1.0, 1.25, 1.0)),
    )


def add_banner(bm, pos, width=0.88, height=2.15, rot_z=0.0, swallowtail=False):
    xform = Matrix.Translation(pos) @ Matrix.Rotation(rot_z, 4, 'Z')
    hw = width * 0.5
    thick = 0.05
    rows = 6
    front_grid, back_grid = [], []
    for r in range(rows + 1):
        t = r / rows
        z = -height * t
        wave = 0.09 * math.sin(t * math.pi * 1.6)
        w_curr = hw * (1.0 - 0.14 * t)
        if r == rows and not swallowtail:
            w_curr = hw * 0.05
        f_l = bm.verts.new(xform @ Vector((-w_curr, wave - thick * 0.5, z)))
        f_m = bm.verts.new(xform @ Vector((0.0, wave - thick * 0.5, z + (0.38 if (r == rows and swallowtail) else 0.0))))
        f_r = bm.verts.new(xform @ Vector((w_curr, wave - thick * 0.5, z)))
        b_l = bm.verts.new(xform @ Vector((-w_curr, wave + thick * 0.5, z)))
        b_m = bm.verts.new(xform @ Vector((0.0, wave + thick * 0.5, z + (0.38 if (r == rows and swallowtail) else 0.0))))
        b_r = bm.verts.new(xform @ Vector((w_curr, wave + thick * 0.5, z)))
        front_grid.append((f_l, f_m, f_r))
        back_grid.append((b_l, b_m, b_r))
    for r in range(rows):
        for c in range(2):
            bm.faces.new((front_grid[r][c], front_grid[r + 1][c], front_grid[r + 1][c + 1], front_grid[r][c + 1]))
            bm.faces.new((back_grid[r][c], back_grid[r][c + 1], back_grid[r + 1][c + 1], back_grid[r + 1][c]))
        bm.faces.new((front_grid[r][0], back_grid[r][0], back_grid[r + 1][0], front_grid[r + 1][0]))
        bm.faces.new((front_grid[r][2], front_grid[r + 1][2], back_grid[r + 1][2], back_grid[r][2]))


def add_flag_pennant(bm, pole_top, length=1.75, height=0.78, rot_z=0.3):
    xform = Matrix.Translation(pole_top) @ Matrix.Rotation(rot_z, 4, 'Z')
    segs = 7
    thick = 0.035
    pts_f, pts_b = [], []
    for i in range(segs + 1):
        t = i / segs
        x = length * t
        y = 0.16 * math.sin(t * math.pi * 2.1)
        h_half = height * 0.5 * (1.0 - 0.70 * t)
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
