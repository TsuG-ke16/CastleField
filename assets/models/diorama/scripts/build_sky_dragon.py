"""Build a sleek, sculpted, wing-articulated Fantasy Sky Dragon (.glb) for Castle Field dioramas.

Outputs:
  - assets/models/diorama/sky_dragon.glb (wing meshes pivoted cleanly at shoulders for real-time flapping!)
  - Optional QA render when --render <path> is passed.
"""

import math
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector, Matrix

SCRIPT_DIR = Path(__file__).resolve().parent
DIORAMA_DIR = SCRIPT_DIR.parent


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_mat(name, base_color, roughness=0.42, metallic=0.18, emissive=None, emit_strength=0.0, double_sided=False):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = not double_sided
    nt = mat.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*base_color, 1.0)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    if emissive is not None and emit_strength > 0.0:
        bsdf.inputs['Emission Color'].default_value = (*emissive, 1.0)
        bsdf.inputs['Emission Strength'].default_value = emit_strength
    return mat


def catmull_rom(pts, samples_per_seg=8):
    out = []
    n = len(pts)
    for i in range(n - 1):
        p0 = pts[max(0, i - 1)]
        p1 = pts[i]
        p2 = pts[i + 1]
        p3 = pts[min(n - 1, i + 2)]
        steps = samples_per_seg if i < n - 2 else samples_per_seg + 1
        for s in range(steps):
            t = s / samples_per_seg
            t2 = t * t
            t3 = t2 * t
            p = 0.5 * (
                (2.0 * p1)
                + (-p0 + p2) * t
                + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2
                + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3
            )
            out.append(p)
    return out


def add_swept_tube(bm, spine_pts, radii_xy, segs=14, cap_start=True, cap_end=True):
    """Sweep an elliptical cross-section smoothly along a 3D spine curve."""
    n = len(spine_pts)
    rings = []
    up_hint = Vector((0.0, 0.0, 1.0))

    for i in range(n):
        p = spine_pts[i]
        if i == 0:
            tan = (spine_pts[1] - spine_pts[0]).normalized()
        elif i == n - 1:
            tan = (spine_pts[-1] - spine_pts[-2]).normalized()
        else:
            tan = (spine_pts[i + 1] - spine_pts[i - 1]).normalized()
        if tan.length < 1e-6:
            tan = Vector((0.0, 1.0, 0.0))

        side = tan.cross(up_hint)
        if side.length < 1e-4:
            side = Vector((1.0, 0.0, 0.0))
        else:
            side.normalize()
        up = side.cross(tan).normalized()

        rx, rz = radii_xy[i]
        ring = []
        for k in range(segs):
            ang = 2.0 * math.pi * k / segs
            ca, sa = math.cos(ang), math.sin(ang)
            # Slightly flatten belly & sharpen dorsal ridge for regal dragon anatomy
            z_mod = sa * rz * (0.86 if sa < 0 else 1.08)
            pt = p + side * (ca * rx) + up * z_mod
            ring.append(bm.verts.new(pt))
        rings.append(ring)

    for i in range(n - 1):
        r0, r1 = rings[i], rings[i + 1]
        for k in range(segs):
            kn = (k + 1) % segs
            bm.faces.new((r0[k], r0[kn], r1[kn], r1[k]))

    if cap_start:
        c0 = bm.verts.new(spine_pts[0])
        r0 = rings[0]
        for k in range(segs):
            bm.faces.new((r0[(k + 1) % segs], r0[k], c0))
    if cap_end:
        c1 = bm.verts.new(spine_pts[-1])
        r1 = rings[-1]
        for k in range(segs):
            bm.faces.new((r1[k], r1[(k + 1) % segs], c1))


def add_cone_between(bm, p0, p1, r0, r1, segs=8):
    v = p1 - p0
    length = v.length
    if length < 1e-5:
        return
    z_axis = v.normalized()
    q = Vector((0.0, 0.0, 1.0)).rotation_difference(z_axis)
    mid = (p0 + p1) * 0.5
    m = Matrix.Translation(mid) @ q.to_matrix().to_4x4()
    bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=False, segments=segs,
        radius1=r0, radius2=r1, depth=length, matrix=m,
    )


def create_mesh_obj(name, bm, mat, col, location=(0.0, 0.0, 0.0), subdiv=0):
    mesh = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    obj.location = location
    obj.data.materials.append(mat)
    col.objects.link(obj)
    if subdiv > 0:
        mod = obj.modifiers.new('Subsurf', 'SUBSURF')
        mod.levels = subdiv
        mod.render_levels = subdiv
    return obj


def build_wing(side_sign, col, mat_scales, mat_mem, mat_horn):
    """Build articulated wing mesh with origin at shoulder (side_sign * 0.52, 0.45, 0.36).
    Facing +Y forward, wing extends along side_sign * +X.
    """
    s = float(side_sign)
    label = 'L' if s < 0 else 'R'
    pivot = Vector((s * 0.50, 0.42, 0.34))

    # Local coordinates relative to shoulder pivot!
    shoulder = Vector((0.0, 0.0, 0.0))
    elbow = Vector((s * 1.35, -0.35, 0.42))
    wrist = Vector((s * 2.85, 0.72, 1.05))
    thumb_tip = Vector((s * 3.05, 1.22, 1.32))

    # 4 elongated finger tips sweeping gracefully backward like a fantasy wyvern/dragon
    fingers = [
        [wrist, Vector((s * 4.35, 0.88, 1.38)), Vector((s * 5.65, 0.48, 1.05))],  # Leading wingtip spar
        [wrist, Vector((s * 4.10, -0.45, 0.86)), Vector((s * 5.05, -1.55, 0.38))],
        [wrist, Vector((s * 3.30, -1.25, 0.52)), Vector((s * 3.90, -2.45, 0.02))],
        [wrist, Vector((s * 2.15, -1.45, 0.28)), Vector((s * 2.35, -2.55, -0.22))],
    ]
    hip_anchor = Vector((s * 0.12, -1.95, -0.18))

    bm_bones = bmesh.new()
    # Wing upper arm & forearm
    add_cone_between(bm_bones, shoulder, elbow, 0.22, 0.17, segs=10)
    add_cone_between(bm_bones, elbow, wrist, 0.17, 0.13, segs=10)
    bmesh.ops.create_icosphere(bm_bones, subdivisions=2, radius=0.17, matrix=Matrix.Translation(elbow))
    bmesh.ops.create_icosphere(bm_bones, subdivisions=2, radius=0.14, matrix=Matrix.Translation(wrist))

    # Finger spars
    for fi, fpts in enumerate(fingers):
        r_base = 0.095 if fi == 0 else 0.068
        r_mid = 0.062 if fi == 0 else 0.044
        r_tip = 0.022
        add_cone_between(bm_bones, fpts[0], fpts[1], r_base, r_mid, segs=8)
        add_cone_between(bm_bones, fpts[1], fpts[2], r_mid, r_tip, segs=8)

    # Clawed thumb spur at wrist
    bm_claw = bmesh.new()
    add_cone_between(bm_claw, wrist, thumb_tip, 0.085, 0.015, segs=8)

    # Smooth scalloped membrane panels between fingers & body
    bm_mem = bmesh.new()

    def add_web_panel(p_root, a1, a2, b1, b2, scallop_depth=0.22):
        # 3-row curved grid from root -> mid -> scalloped trailing edge
        m_mid = (a1 + b1) * 0.5 + Vector((0.0, 0.0, 0.08))
        # Scalloped inward curve on trailing edge
        t_dir = ((p_root - (a2 + b2) * 0.5).normalized())
        t_mid = (a2 + b2) * 0.5 + t_dir * scallop_depth + Vector((0.0, 0.0, 0.06))

        vr = bm_mem.verts.new(p_root)
        va1 = bm_mem.verts.new(a1)
        vm = bm_mem.verts.new(m_mid)
        vb1 = bm_mem.verts.new(b1)
        va2 = bm_mem.verts.new(a2)
        vt = bm_mem.verts.new(t_mid)
        vb2 = bm_mem.verts.new(b2)

        if s > 0:
            bm_mem.faces.new((vr, va1, vm))
            bm_mem.faces.new((vr, vm, vb1))
            bm_mem.faces.new((va1, va2, vt, vm))
            bm_mem.faces.new((vm, vt, vb2, vb1))
        else:
            bm_mem.faces.new((vr, vm, va1))
            bm_mem.faces.new((vr, vb1, vm))
            bm_mem.faces.new((va1, vm, vt, va2))
            bm_mem.faces.new((vm, vb1, vb2, vt))

    for i in range(len(fingers) - 1):
        add_web_panel(wrist, fingers[i][1], fingers[i][2], fingers[i + 1][1], fingers[i + 1][2], scallop_depth=0.32)

    # Inner membrane from 4th finger back to elbow & hip
    e_mid = (elbow + hip_anchor) * 0.5 + Vector((s * 0.35, -0.2, -0.05))
    add_web_panel(wrist, fingers[3][1], fingers[3][2], elbow, hip_anchor, scallop_depth=0.45)

    # Small inner wing flap connecting shoulder -> elbow -> hip
    v_sh = bm_mem.verts.new(shoulder)
    v_el = bm_mem.verts.new(elbow)
    v_hp = bm_mem.verts.new(hip_anchor)
    v_em = bm_mem.verts.new(e_mid)
    if s > 0:
        bm_mem.faces.new((v_sh, v_el, v_em, v_hp))
    else:
        bm_mem.faces.new((v_sh, v_hp, v_em, v_el))

    # Build wing root group mesh (single pivot object per wing with 3 materials!)
    wing_mesh = bpy.data.meshes.new(f'Dragon_Wing_{label}')
    wing_obj = bpy.data.objects.new(f'Dragon_Wing_{label}', wing_mesh)
    wing_obj.location = pivot
    col.objects.link(wing_obj)

    wing_obj.data.materials.append(mat_scales)
    wing_obj.data.materials.append(mat_mem)
    wing_obj.data.materials.append(mat_horn)

    bm_all = bmesh.new()
    for mat_idx, sub_bm in ((0, bm_bones), (1, bm_mem), (2, bm_claw)):
        sub_bm.normal_update()
        sub_bm.verts.ensure_lookup_table()
        sub_bm.verts.index_update()
        vmap = {}
        for v in sub_bm.verts:
            vmap[v.index] = bm_all.verts.new(v.co)
        for f in sub_bm.faces:
            try:
                nf = bm_all.faces.new([vmap[v.index] for v in f.verts])
                nf.material_index = mat_idx
                nf.smooth = True
            except ValueError:
                pass
        sub_bm.free()

    bm_all.normal_update()
    bm_all.to_mesh(wing_mesh)
    bm_all.free()

    mod = wing_obj.modifiers.new('Subsurf', 'SUBSURF')
    mod.levels = 1
    mod.render_levels = 1
    return wing_obj


def build_dragon():
    clear_scene()
    col = bpy.context.scene.collection

    # Rich PBR Crimson-Obsidian & Astral-Gold Fantasy Dragon palette (cleanly tintable in Three.js!)
    mat_scales = make_mat('Mat_Dragon_Scales', (0.48, 0.08, 0.12), roughness=0.38, metallic=0.28)
    mat_belly = make_mat('Mat_Dragon_Belly', (0.76, 0.56, 0.30), roughness=0.48, metallic=0.22)
    mat_mem = make_mat(
        'Mat_Dragon_WingMembrane', (0.68, 0.16, 0.10), roughness=0.42, metallic=0.10,
        emissive=(0.95, 0.34, 0.08), emit_strength=0.45, double_sided=True,
    )
    mat_horn = make_mat('Mat_Dragon_Horn', (0.86, 0.74, 0.46), roughness=0.32, metallic=0.35)
    mat_eye = make_mat(
        'Mat_Dragon_EyeGlow', (1.0, 0.85, 0.25), roughness=0.15, metallic=0.0,
        emissive=(1.0, 0.78, 0.18), emit_strength=4.0,
    )

    root = bpy.data.objects.new('Sky_Dragon_Root', None)
    col.objects.link(root)

    # 1. Main sinuous body + neck + tail (+Y is forward!)
    ctrl_pts = [
        Vector((0.0, -5.85, -0.32)),  # Tail tip
        Vector((0.0, -4.40, -0.15)),
        Vector((0.0, -2.85, -0.25)),
        Vector((0.0, -1.55, -0.10)),  # Hip
        Vector((0.0, -0.45, 0.05)),   # Waist
        Vector((0.0, 0.65, 0.18)),    # Broad chest
        Vector((0.0, 1.55, 0.52)),    # Neck base
        Vector((0.0, 2.35, 1.05)),    # Neck mid arch
        Vector((0.0, 3.05, 1.28)),    # Neck top
        Vector((0.0, 3.45, 1.18)),    # Skull base
    ]
    ctrl_rad = [
        (0.05, 0.05),
        (0.11, 0.12),
        (0.20, 0.22),
        (0.46, 0.44),
        (0.42, 0.40),
        (0.68, 0.62),
        (0.44, 0.46),
        (0.30, 0.34),
        (0.26, 0.29),
        (0.32, 0.30),
    ]
    spine = catmull_rom(ctrl_pts, samples_per_seg=6)
    # Interpolate radii smoothly along spine
    radii = []
    n_seg = len(ctrl_pts) - 1
    for i in range(len(spine)):
        u = (i / max(1, len(spine) - 1)) * n_seg
        idx = min(n_seg - 1, int(u))
        frac = u - idx
        rx = ctrl_rad[idx][0] * (1 - frac) + ctrl_rad[idx + 1][0] * frac
        rz = ctrl_rad[idx][1] * (1 - frac) + ctrl_rad[idx + 1][1] * frac
        radii.append((rx, rz))

    bm_body = bmesh.new()
    add_swept_tube(bm_body, spine, radii, segs=14, cap_start=True, cap_end=True)

    # Sculpted Head (upper skull + tapered snout + jaw)
    head_base = Vector((0.0, 3.42, 1.18))
    snout_pts = [
        head_base,
        Vector((0.0, 3.88, 1.24)),
        Vector((0.0, 4.48, 1.16)),
        Vector((0.0, 4.92, 1.08)),
    ]
    snout_rad = [(0.36, 0.32), (0.34, 0.28), (0.22, 0.19), (0.12, 0.11)]
    add_swept_tube(bm_body, snout_pts, snout_rad, segs=12, cap_start=True, cap_end=True)

    # Lower jaw slightly open for fierce silhouette
    jaw_pts = [
        Vector((0.0, 3.55, 1.00)),
        Vector((0.0, 4.18, 0.90)),
        Vector((0.0, 4.72, 0.88)),
    ]
    add_swept_tube(bm_body, jaw_pts, [(0.24, 0.14), (0.18, 0.11), (0.10, 0.08)], segs=10)

    # Tucked aerodynamic limbs built as continuous swept tubes from torso!
    for s in (-1.0, 1.0):
        fore_pts = catmull_rom([
            Vector((s * 0.42, 0.85, -0.02)),
            Vector((s * 0.62, 0.60, -0.45)),
            Vector((s * 0.54, 0.35, -0.82)),
            Vector((s * 0.48, 0.68, -1.02)),
        ], samples_per_seg=3)
        add_swept_tube(bm_body, fore_pts, [(0.24, 0.24)] * 3 + [(0.16, 0.16)] * 4 + [(0.10, 0.10)] * (len(fore_pts) - 7), segs=8)
        hind_pts = catmull_rom([
            Vector((s * 0.36, -1.25, -0.04)),
            Vector((s * 0.64, -1.75, -0.46)),
            Vector((s * 0.56, -2.30, -0.78)),
            Vector((s * 0.44, -2.85, -0.92)),
        ], samples_per_seg=3)
        add_swept_tube(bm_body, hind_pts, [(0.28, 0.28)] * 3 + [(0.18, 0.18)] * 4 + [(0.10, 0.10)] * (len(hind_pts) - 7), segs=8)

    body_obj = create_mesh_obj('Dragon_Body', bm_body, mat_scales, col, subdiv=1)
    body_obj.parent = root

    # 2. Golden plated belly keel & tail spade fin
    bm_belly = bmesh.new()
    belly_pts = [p + Vector((0.0, 0.0, -radii[i][1] * 0.78)) for i, p in enumerate(spine[6:-3:2])]
    belly_rad = [(radii[i][0] * 0.62, radii[i][1] * 0.22) for i in range(6, len(spine) - 3, 2)]
    if len(belly_pts) >= 2:
        add_swept_tube(bm_belly, belly_pts, belly_rad, segs=8)
    belly_obj = create_mesh_obj('Dragon_Belly', bm_belly, mat_belly, col, subdiv=1)
    belly_obj.parent = root

    # 3. Horns, Dorsal Crest Spines, Tail Spade & Claws
    bm_horn = bmesh.new()
    for s in (-1.0, 1.0):
        # Twin sweeping crown horns
        h_pts = catmull_rom([
            Vector((s * 0.22, 3.55, 1.38)),
            Vector((s * 0.42, 3.05, 1.72)),
            Vector((s * 0.58, 2.42, 1.98)),
            Vector((s * 0.68, 1.92, 2.08)),
        ], samples_per_seg=4)
        h_rad = [(0.105 * (1.0 - 0.85 * i / max(1, len(h_pts) - 1)), 0.105 * (1.0 - 0.85 * i / max(1, len(h_pts) - 1))) for i in range(len(h_pts))]
        add_swept_tube(bm_horn, h_pts, h_rad, segs=8)
        # Cheek spikes
        add_cone_between(bm_horn, Vector((s * 0.30, 3.50, 1.12)), Vector((s * 0.56, 3.02, 1.08)), 0.075, 0.012, segs=7)

    # Dorsal crest spines along neck, back, and tail
    for i in range(4, len(spine) - 2, 2):
        p = spine[i]
        rx, rz = radii[i]
        h_sp = 0.24 + 0.30 * min(1.0, rz / 0.55)
        base = p + Vector((0.0, 0.0, rz * 0.82))
        tip = base + Vector((0.0, -h_sp * 0.55, h_sp))
        add_cone_between(bm_horn, base, tip, 0.075 * min(1.1, rz / 0.35 + 0.35), 0.012, segs=6)

    # Diamond tail spade blade at tail tip
    t_tip = spine[0]
    for s in (-1.0, 1.0):
        add_cone_between(bm_horn, t_tip + Vector((0.0, 0.45, 0.0)), t_tip + Vector((s * 0.42, -0.05, 0.04)), 0.06, 0.015, segs=6)
        add_cone_between(bm_horn, t_tip + Vector((s * 0.42, -0.05, 0.04)), t_tip + Vector((0.0, -0.55, -0.02)), 0.04, 0.01, segs=6)

    horn_obj = create_mesh_obj('Dragon_Horns_Spines', bm_horn, mat_horn, col, subdiv=0)
    horn_obj.parent = root

    # 4. Glowing Dragon Eyes
    bm_eye = bmesh.new()
    for s in (-1.0, 1.0):
        bmesh.ops.create_icosphere(
            bm_eye, subdivisions=2, radius=0.075,
            matrix=Matrix.Translation((s * 0.28, 3.98, 1.28)) @ Matrix.Diagonal((0.8, 1.35, 0.9, 1.0)),
        )
    eye_obj = create_mesh_obj('Dragon_Eyes', bm_eye, mat_eye, col, subdiv=0)
    eye_obj.parent = root

    # 5. Articulated Left & Right Wings (pivoted cleanly at shoulders!)
    wing_l = build_wing(-1.0, col, mat_scales, mat_mem, mat_horn)
    wing_r = build_wing(1.0, col, mat_scales, mat_mem, mat_horn)
    wing_l.parent = root
    wing_r.parent = root

    # Export clean WebGL-ready GLB
    glb_path = DIORAMA_DIR / 'sky_dragon.glb'
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path),
        export_format='GLB',
        export_yup=True,
        export_apply=True,
        export_cameras=False,
        export_lights=False,
        export_materials='EXPORT',
    )
    kb = glb_path.stat().st_size / 1024.0
    print(f'SKY_DRAGON_OK path={glb_path} size={kb:.1f} KB')

    # Optional quick QA render
    if '--render' in sys.argv:
        rpath = sys.argv[sys.argv.index('--render') + 1]
        scene = bpy.context.scene
        scene.render.engine = 'CYCLES'
        scene.cycles.device = 'GPU'
        scene.cycles.samples = 32
        scene.render.resolution_x = 960
        scene.render.resolution_y = 640
        scene.render.filepath = rpath
        # Cosmic dark blue world
        w = bpy.data.worlds.new('QA_World')
        w.use_nodes = True
        w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.03, 0.05, 0.14, 1.0)
        scene.world = w
        # Studio 3-point lights
        for lname, pos, energy, col_l in [
            ('Key', (8, 8, 9), 800, (1.0, 0.92, 0.85)),
            ('Rim', (-8, -6, 6), 500, (0.45, 0.82, 1.0)),
            ('Fill', (-6, 6, -4), 250, (0.65, 0.55, 0.95)),
        ]:
            ld = bpy.data.lights.new(lname, type='POINT')
            ld.energy = energy
            ld.color = col_l
            lo = bpy.data.objects.new(lname, ld)
            lo.location = pos
            col.objects.link(lo)
        cd = bpy.data.cameras.new('QA_Cam')
        cd.lens = 45
        co = bpy.data.objects.new('QA_Cam', cd)
        co.location = (8.8, 7.6, 4.6)
        direction = Vector((0.0, 0.4, 0.45)) - co.location
        co.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
        col.objects.link(co)
        scene.camera = co
        bpy.ops.render.render(write_still=True)
        print(f'SKY_DRAGON_RENDER_OK path={rpath}')


if __name__ == '__main__':
    build_dragon()
