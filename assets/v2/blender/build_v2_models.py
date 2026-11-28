"""Build and export CastleField v2 3D assets (headless Blender 5.3):
1. home-diorama-v2.glb + diorama-cameras.json (bright stylized diorama + floating clouds)
2. field-meadow-v2.glb (3 clear dirt/cobble lanes, 5 stepping stones/lane, central plaza, castle gates)
3. gacha-chest-v2.glb (royal blue & gold treasure chest with gems + ChestOpen animation)
Also renders 3 preview PNGs to assets/v2/blender/previews/ for visual QA.
"""
import json
import math
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector, Euler

ROOT = Path(__file__).resolve().parents[3]
V2_MODELS = ROOT / "assets" / "v2" / "models"
PREVIEWS = ROOT / "assets" / "v2" / "blender" / "previews"
V2_MODELS.mkdir(parents=True, exist_ok=True)
PREVIEWS.mkdir(parents=True, exist_ok=True)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def s2l(hex_str, alpha=1.0):
    h = hex_str.lstrip("#")
    r, g, b = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    def conv(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (conv(r), conv(g), conv(b), alpha)


def make_cartoon_mat(name, hex_col, roughness=0.58, metallic=0.0, emission_hex=None, emission_strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = s2l(hex_col)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.35
    if emission_hex and emission_strength > 0:
        bsdf.inputs["Emission Color"].default_value = s2l(emission_hex)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def setup_preview_studio(cam_loc, target_loc):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE"
    scene.render.resolution_x = 800
    scene.render.resolution_y = 600
    world = bpy.data.worlds.new("SkyWorld")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = s2l("#9fd7ff")
        bg.inputs[1].default_value = 1.15
    scene.world = world

    sun_data = bpy.data.lights.new("Sun", type="SUN")
    sun_data.energy = 3.2
    sun_data.color = (1.0, 0.96, 0.88)
    sun = bpy.data.objects.new("Sun", sun_data)
    sun.rotation_euler = Euler((math.radians(42), math.radians(15), math.radians(32)), "XYZ")
    scene.collection.objects.link(sun)

    cam_data = bpy.data.cameras.new("PreviewCam")
    cam_data.lens = 38
    cam = bpy.data.objects.new("PreviewCam", cam_data)
    cam.location = Vector(cam_loc)
    direction = Vector(target_loc) - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(cam)
    scene.camera = cam


def export_glb(filepath, export_animations=False, img_quality=78):
    bpy.ops.export_scene.gltf(
        filepath=str(filepath),
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_animations=export_animations,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=7,
        export_image_format="WEBP",
        export_image_quality=img_quality,
    )
    print(f"EXPORTED {filepath.name}: {filepath.stat().st_size / 1024:.1f} KB")


def render_preview(filename):
    bpy.context.scene.render.filepath = str(PREVIEWS / filename)
    bpy.ops.render.render(write_still=True)


# ---------------------------------------------------------------------------
# 1. Home Diorama v2 (Warm stylized bright pass + fluffy clouds + camera presets)
# ---------------------------------------------------------------------------
def build_home_diorama_v2():
    clear_scene()
    src_glb = ROOT / "assets" / "models" / "diorama" / "castle_field_diorama.glb"
    bpy.ops.import_scene.gltf(filepath=str(src_glb))

    # Brighten dark materials so they feel like an inviting storybook toy kingdom
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if not bsdf:
            continue
        # Lift very dark base colors and soften harsh mirror-like metallic
        if not bsdf.inputs["Base Color"].is_linked:
            c = list(bsdf.inputs["Base Color"].default_value)
            # Gentle lift in dark areas while keeping hues
            bsdf.inputs["Base Color"].default_value = (
                min(1.0, c[0] * 1.15 + 0.04),
                min(1.0, c[1] * 1.15 + 0.04),
                min(1.0, c[2] * 1.15 + 0.05),
                c[3],
            )
        bsdf.inputs["Roughness"].default_value = max(0.45, min(0.85, bsdf.inputs["Roughness"].default_value))
        bsdf.inputs["Metallic"].default_value = min(0.35, bsdf.inputs["Metallic"].default_value)

    # Scale down oversized textures to <= 512px so mobile outdoor PWA stays under 2.5 MB
    for img in bpy.data.images:
        if img.size[0] > 512 or img.size[1] > 512:
            w, h = img.size[0], img.size[1]
            scale = 512.0 / max(w, h)
            img.scale(max(64, int(w * scale)), max(64, int(h * scale)))

    # Add cute fluffy cartoon clouds around the floating island
    cloud_mat = make_cartoon_mat("V2_Cloud", "#FFFDF8", roughness=0.9)
    cloud_specs = [
        ((-11.5, -6.5, 1.8), (1.3, 1.0, 0.75)),
        ((12.0, -5.0, 2.5), (1.1, 0.9, 0.7)),
        ((-9.5, 9.5, 3.2), (1.4, 1.0, 0.8)),
        ((10.5, 8.5, 2.0), (1.0, 0.85, 0.65)),
    ]
    for idx, (pos, scale) in enumerate(cloud_specs):
        bm = bmesh.new()
        puffs = [(-0.8, 0.0, 0.0, 0.85), (0.0, 0.15, 0.25, 1.1), (0.85, -0.05, 0.05, 0.8), (0.25, -0.35, -0.05, 0.75)]
        for px, py, pz, pr in puffs:
            res = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=pr)
            for v in res["verts"]:
                v.co.x = (v.co.x + px) * scale[0]
                v.co.y = (v.co.y + py) * scale[1]
                v.co.z = (v.co.z + pz) * scale[2]
        mesh = bpy.data.meshes.new(f"CloudMesh_{idx}")
        bm.to_mesh(mesh)
        bm.free()
        obj = bpy.data.objects.new(f"V2_Cloud_{idx}", mesh)
        obj.location = Vector(pos)
        obj.data.materials.append(cloud_mat)
        bpy.context.scene.collection.objects.link(obj)

    # Compute bounding box center for clean camera presets
    min_v = Vector((1e9, 1e9, 1e9))
    max_v = Vector((-1e9, -1e9, -1e9))
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        for corner in obj.bound_box:
            w = obj.matrix_world @ Vector(corner)
            min_v.x = min(min_v.x, w.x)
            min_v.y = min(min_v.y, w.y)
            min_v.z = min(min_v.z, w.z)
            max_v.x = max(max_v.x, w.x)
            max_v.y = max(max_v.y, w.y)
            max_v.z = max(max_v.z, w.z)
    center = (min_v + max_v) * 0.5
    # Convert Blender Z-up center to Three.js Y-up: (x, z, -y)
    ty = center.z
    cameras = {
        "battle": {"position": [0.0, ty + 11.5, 22.5], "target": [0.0, ty + 0.5, 0.0], "fov": 40},
        "gacha": {"position": [-8.5, ty + 6.5, 13.5], "target": [-2.2, ty + 1.2, -1.8], "fov": 36},
        "shop": {"position": [10.0, ty + 7.2, 13.0], "target": [2.4, ty + 1.0, 1.5], "fov": 36},
        "deck": {"position": [0.0, ty + 14.5, 16.5], "target": [0.0, ty + 0.8, 0.0], "fov": 38},
    }
    (V2_MODELS / "diorama-cameras.json").write_text(json.dumps(cameras, indent=2), encoding="utf-8")

    export_glb(V2_MODELS / "home-diorama-v2.glb", export_animations=False, img_quality=68)
    setup_preview_studio((0, -28, 15), (0, 0, center.z))
    render_preview("home-diorama-v2.png")


# ---------------------------------------------------------------------------
# 2. Field Meadow v2 (3 clear dirt/cobble lanes + 5 stones each + gates)
# ---------------------------------------------------------------------------
def build_field_meadow_v2():
    clear_scene()
    col = bpy.context.scene.collection

    mat_grass = make_cartoon_mat("Meadow_Grass", "#77C64E", roughness=0.82)
    mat_grass_edge = make_cartoon_mat("Meadow_GrassDark", "#58A636", roughness=0.85)
    mat_cliff = make_cartoon_mat("Meadow_Cliff", "#A9784B", roughness=0.88)
    mat_lane_border = make_cartoon_mat("Lane_Curb", "#D4B684", roughness=0.78)
    mat_lane_dirt = make_cartoon_mat("Lane_Dirt", "#ECCE95", roughness=0.82)
    mat_stone = make_cartoon_mat("Stepping_Stone", "#F2EAD9", roughness=0.68)
    mat_plaza = make_cartoon_mat("Center_Plaza", "#E2D2B4", roughness=0.72)
    mat_wood = make_cartoon_mat("Tree_Trunk", "#8B582C", roughness=0.8)
    mat_leaf = make_cartoon_mat("Tree_Leaf", "#4EAD3B", roughness=0.76)
    mat_rock = make_cartoon_mat("Edge_Rock", "#9CA6B0", roughness=0.75)
    mat_gate_stone = make_cartoon_mat("Gate_Stone", "#EDE3CE", roughness=0.7)
    mat_gate_blue = make_cartoon_mat("Gate_Blue", "#3F8AE6", roughness=0.5)
    mat_gate_orange = make_cartoon_mat("Gate_Orange", "#F28B38", roughness=0.5)

    def link_mesh(name, bm, mat, loc=(0, 0, 0)):
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        mesh = bpy.data.meshes.new(name)
        bm.to_mesh(mesh)
        bm.free()
        obj = bpy.data.objects.new(name, mesh)
        obj.location = Vector(loc)
        obj.data.materials.append(mat)
        col.objects.link(obj)
        return obj

    # Base island slab (width 13, length 21)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= 13.0
        v.co.y *= 21.0
        v.co.z = -1.2 if v.co.z < 0 else 0.0
        if v.co.z < 0:
            v.co.x *= 0.90
            v.co.y *= 0.92
    link_mesh("Island_Base", bm, mat_cliff)

    # Top grass lawn
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= 12.6
        v.co.y *= 20.6
        v.co.z = 0.0 if v.co.z < 0 else 0.16
    link_mesh("Meadow_Top", bm, mat_grass)

    # Side grass mounds
    for sx in (-5.4, 5.4):
        for sy in (-7.0, 0.0, 7.0):
            bm = bmesh.new()
            bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.2)
            for v in bm.verts:
                v.co.z = max(0.0, v.co.z * 0.32) + 0.12
                v.co.y *= 1.9
            link_mesh(f"GrassMound_{sx}_{sy}", bm, mat_grass_edge, (sx, sy, 0.0))

    # 3 distinct raised lanes at X = -2.8, 0.0, +2.8
    lane_xs = (-2.8, 0.0, 2.8)
    for idx, lx in enumerate(lane_xs):
        # Curb bed
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co.x *= 1.85
            v.co.y *= 14.2
            v.co.z = 0.12 if v.co.z < 0 else 0.21
        link_mesh(f"LaneCurb_{idx}", bm, mat_lane_border, (lx, 0.0, 0.0))

        # Inner warm dirt path
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co.x *= 1.48
            v.co.y *= 13.8
            v.co.z = 0.16 if v.co.z < 0 else 0.24
        link_mesh(f"LaneDirt_{idx}", bm, mat_lane_dirt, (lx, 0.0, 0.0))

        # 5 stepping stones along Y = -5.0, -2.5, 0.0, 2.5, 5.0
        for s_idx, sy in enumerate((-5.0, -2.5, 0.0, 2.5, 5.0)):
            bm = bmesh.new()
            bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=16, radius1=0.58, radius2=0.52, depth=0.12)
            link_mesh(f"StepStone_{idx}_{s_idx}", bm, mat_stone, (lx, sy, 0.26))

    # Central monster plaza disc across center
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=28, radius1=1.45, radius2=1.35, depth=0.11)
    link_mesh("Monster_Plaza", bm, mat_plaza, (0.0, 0.0, 0.24))

    # Stylized north (p2 orange) and south (p1 blue) gate markers
    for side, gy, flag_mat in [("South_Me", -8.4, mat_gate_blue), ("North_Opp", 8.4, mat_gate_orange)]:
        for px in (-1.3, 1.3):
            bm = bmesh.new()
            bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=12, radius1=0.45, radius2=0.40, depth=1.2)
            link_mesh(f"GatePillar_{side}_{px}", bm, mat_gate_stone, (px, gy, 0.72))
            bm = bmesh.new()
            bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=12, radius1=0.54, radius2=0.05, depth=0.75)
            link_mesh(f"GateRoof_{side}_{px}", bm, flag_mat, (px, gy, 1.68))

    # Cute round cartoon trees & boulders on edges
    for idx, (tx, ty, sc) in enumerate([(-5.3, -4.5, 1.0), (5.2, -3.8, 0.9), (-5.1, 4.2, 0.95), (5.3, 4.8, 1.05)]):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=10, radius1=0.28 * sc, radius2=0.22 * sc, depth=1.1 * sc)
        link_mesh(f"Trunk_{idx}", bm, mat_wood, (tx, ty, 0.65 * sc))
        for p_idx, (ox, oy, oz, r) in enumerate([(0, 0, 1.45, 0.95), (-0.42, 0.18, 1.25, 0.65), (0.42, -0.18, 1.25, 0.65)]):
            bm = bmesh.new()
            bmesh.ops.create_icosphere(bm, subdivisions=2, radius=r * sc)
            link_mesh(f"Leaf_{idx}_{p_idx}", bm, mat_leaf, (tx + ox * sc, ty + oy * sc, oz * sc))

    for idx, (rx, ry, r) in enumerate([(-4.9, -7.8, 0.55), (4.8, -7.5, 0.45), (-4.7, 7.6, 0.5), (5.0, 7.9, 0.58)]):
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r)
        for v in bm.verts:
            v.co.z *= 0.65
        link_mesh(f"Rock_{idx}", bm, mat_rock, (rx, ry, 0.3))

    export_glb(V2_MODELS / "field-meadow-v2.glb", export_animations=False)
    setup_preview_studio((0, -16.5, 14.5), (0, 0, 0.4))
    render_preview("field-meadow-v2.png")


# ---------------------------------------------------------------------------
# 3. Gacha Chest v2 (Royal Blue & Gold Cartoon Chest + Gems + Open Animation)
# ---------------------------------------------------------------------------
def build_gacha_chest_v2():
    clear_scene()
    scene = bpy.context.scene
    col = scene.collection

    mat_wood = make_cartoon_mat("Chest_Blue", "#3465CC", roughness=0.45)
    mat_gold = make_cartoon_mat("Chest_Gold", "#FFC338", roughness=0.28, metallic=0.2)
    mat_dark = make_cartoon_mat("Chest_Inside", "#4A2E1A", roughness=0.85)
    mat_gem_blue = make_cartoon_mat("Gem_Cyan", "#4EE0FF", roughness=0.15, emission_hex="#4EE0FF", emission_strength=1.4)
    mat_gem_ruby = make_cartoon_mat("Gem_Ruby", "#FF5470", roughness=0.15, emission_hex="#FF5470", emission_strength=1.2)
    mat_gem_emerald = make_cartoon_mat("Gem_Emerald", "#58EA7A", roughness=0.15, emission_hex="#58EA7A", emission_strength=1.2)

    def add_box(name, dims, loc, mat, parent=None):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co.x *= dims[0]
            v.co.y *= dims[1]
            v.co.z *= dims[2]
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=0.05, segments=2, affect="EDGES")
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        mesh = bpy.data.meshes.new(name)
        bm.to_mesh(mesh)
        bm.free()
        obj = bpy.data.objects.new(name, mesh)
        obj.location = Vector(loc)
        obj.data.materials.append(mat)
        col.objects.link(obj)
        if parent:
            obj.parent = parent
        return obj

    base_root = bpy.data.objects.new("Chest_Root", None)
    col.objects.link(base_root)

    # Lower chest box + gold bands + inner gold bed
    add_box("Chest_Body", (2.2, 1.5, 1.0), (0, 0, 0.5), mat_wood, base_root)
    add_box("Chest_BaseRim", (2.32, 1.62, 0.16), (0, 0, 0.1), mat_gold, base_root)
    add_box("Chest_MidRim", (2.32, 1.62, 0.16), (0, 0, 0.96), mat_gold, base_root)
    add_box("Chest_StrapL", (0.22, 1.64, 1.02), (-0.65, 0, 0.5), mat_gold, base_root)
    add_box("Chest_StrapR", (0.22, 1.64, 1.02), (0.65, 0, 0.5), mat_gold, base_root)
    add_box("Chest_InnerBed", (1.96, 1.26, 0.15), (0, 0, 0.92), mat_dark, base_root)
    add_box("Chest_LockPlate", (0.42, 0.14, 0.44), (0, -0.82, 0.94), mat_gold, base_root)

    # Pile of glowing faceted gems inside (tucked below rim height z<=1.08 so hidden when closed)
    gem_specs = [
        (0.0, 0.0, 1.02, 0.30, mat_gem_blue),
        (-0.52, -0.08, 0.98, 0.24, mat_gem_ruby),
        (0.52, 0.08, 0.98, 0.24, mat_gem_emerald),
        (-0.25, 0.22, 0.96, 0.21, mat_gem_emerald),
        (0.28, -0.22, 0.96, 0.22, mat_gem_ruby),
    ]
    for idx, (gx, gy, gz, gr, gmat) in enumerate(gem_specs):
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=1, radius=gr)
        mesh = bpy.data.meshes.new(f"GemMesh_{idx}")
        bm.to_mesh(mesh)
        bm.free()
        gobj = bpy.data.objects.new(f"Gem_{idx}", mesh)
        gobj.location = Vector((gx, gy, gz))
        gobj.data.materials.append(gmat)
        gobj.parent = base_root
        col.objects.link(gobj)

    # Hinged lid pivot at back edge (y = +0.75, z = 1.02)
    lid_pivot = bpy.data.objects.new("Lid_Pivot", None)
    lid_pivot.location = Vector((0, 0.75, 1.02))
    lid_pivot.parent = base_root
    col.objects.link(lid_pivot)

    # Rounded lid shell relative to pivot
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=16, radius1=0.76, radius2=0.76, depth=2.2)
    for v in bm.verts:
        # Rotate cylinder along X axis and keep top half + slight base
        nx, ny, nz = v.co.z, v.co.x, max(0.0, v.co.y)
        v.co = Vector((nx, ny, nz))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    lid_mesh = bpy.data.meshes.new("Chest_Lid")
    bm.to_mesh(lid_mesh)
    bm.free()
    lid_obj = bpy.data.objects.new("Chest_Lid", lid_mesh)
    lid_obj.location = Vector((0, -0.75, 0.0))
    lid_obj.data.materials.append(mat_wood)
    lid_obj.parent = lid_pivot
    col.objects.link(lid_obj)

    # Gold lid bands
    add_box("Lid_Rim", (2.34, 1.64, 0.14), (0, -0.75, 0.04), mat_gold, lid_pivot)
    add_box("Lid_TopArchL", (0.22, 1.56, 0.78), (-0.65, -0.75, 0.38), mat_gold, lid_pivot)
    add_box("Lid_TopArchR", (0.22, 1.56, 0.78), (0.65, -0.75, 0.38), mat_gold, lid_pivot)

    # Keyframe animation "ChestOpen": negative X rotation swings front (-Y) up and back!
    scene.frame_start = 1
    scene.frame_end = 30
    lid_pivot.rotation_mode = "XYZ"
    lid_pivot.rotation_euler = Euler((0.0, 0.0, 0.0), "XYZ")
    lid_pivot.keyframe_insert(data_path="rotation_euler", frame=1)
    lid_pivot.rotation_euler = Euler((-math.radians(74), 0.0, 0.0), "XYZ")
    lid_pivot.keyframe_insert(data_path="rotation_euler", frame=22)
    lid_pivot.rotation_euler = Euler((-math.radians(66), 0.0, 0.0), "XYZ")
    lid_pivot.keyframe_insert(data_path="rotation_euler", frame=30)
    if lid_pivot.animation_data and lid_pivot.animation_data.action:
        lid_pivot.animation_data.action.name = "ChestOpen"

    scene.frame_set(22)
    export_glb(V2_MODELS / "gacha-chest-v2.glb", export_animations=True)
    setup_preview_studio((2.8, -4.4, 2.6), (0, 0, 1.0))
    render_preview("gacha-chest-v2.png")


if __name__ == "__main__":
    build_home_diorama_v2()
    build_field_meadow_v2()
    build_gacha_chest_v2()
