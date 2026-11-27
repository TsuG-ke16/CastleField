"""Build and export 5 distinct CastleField v2 3D stage biome battlefields (headless Blender 5.3):
- field-lava-v2.glb
- field-ice-v2.glb
- field-ruins-v2.glb
- field-darkForest-v2.glb
- field-desert-v2.glb

Each biome shares the exact aligned 3-lane x 5-square coordinate system with field-meadow-v2.glb.
"""
from pathlib import Path
import bpy
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
V2_MODELS = ROOT / "assets" / "v2" / "models"
V2_MODELS.mkdir(parents=True, exist_ok=True)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def s2l(hex_str, alpha=1.0):
    h = hex_str.lstrip("#")
    r, g, b = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    def conv(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (conv(r), conv(g), conv(b), alpha)


def make_mat(name, hex_col, roughness=0.72, metallic=0.0, emission_hex=None, emission_strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = s2l(hex_col)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.35
    if emission_hex and emission_strength > 0:
        bsdf.inputs["Emission Color"].default_value = s2l(emission_hex)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def link_mesh(col, name, bm, mat, loc=(0, 0, 0)):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = Vector(loc)
    obj.data.materials.append(mat)
    col.objects.link(obj)
    return obj


def build_base_board(col, mats):
    # Island slab
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= 13.0
        v.co.y *= 21.0
        v.co.z = -1.2 if v.co.z < 0 else 0.0
        if v.co.z < 0:
            v.co.x *= 0.90
            v.co.y *= 0.92
    link_mesh(col, "Island_Base", bm, mats["cliff"])

    # Top deck
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= 12.6
        v.co.y *= 20.6
        v.co.z = 0.0 if v.co.z < 0 else 0.16
    link_mesh(col, "Deck_Top", bm, mats["deck"])

    # 3 distinct lanes at X = -2.8, 0.0, +2.8
    for idx, lx in enumerate((-2.8, 0.0, 2.8)):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co.x *= 1.85
            v.co.y *= 14.2
            v.co.z = 0.12 if v.co.z < 0 else 0.21
        link_mesh(col, f"LaneCurb_{idx}", bm, mats["curb"], (lx, 0.0, 0.0))

        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co.x *= 1.48
            v.co.y *= 13.8
            v.co.z = 0.16 if v.co.z < 0 else 0.24
        link_mesh(col, f"LanePath_{idx}", bm, mats["path"], (lx, 0.0, 0.0))

        for s_idx, sy in enumerate((-5.0, -2.5, 0.0, 2.5, 5.0)):
            bm = bmesh.new()
            bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=14, radius1=0.58, radius2=0.52, depth=0.12)
            link_mesh(col, f"StepStone_{idx}_{s_idx}", bm, mats["stone"], (lx, sy, 0.26))

    # Center Monster Plaza
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=24, radius1=1.45, radius2=1.35, depth=0.11)
    link_mesh(col, "Monster_Plaza", bm, mats["plaza"], (0.0, 0.0, 0.24))

    # North & South Gate Pillars
    for side, gy, roof_mat in [("South_Me", -8.4, mats["gate_me"]), ("North_Opp", 8.4, mats["gate_opp"])]:
        for px in (-1.3, 1.3):
            bm = bmesh.new()
            bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=10, radius1=0.45, radius2=0.40, depth=1.2)
            link_mesh(col, f"GatePillar_{side}_{px}", bm, mats["gate_stone"], (px, gy, 0.72))
            bm = bmesh.new()
            bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=10, radius1=0.54, radius2=0.05, depth=0.75)
            link_mesh(col, f"GateRoof_{side}_{px}", bm, roof_mat, (px, gy, 1.68))


def export_stage(filename):
    out = V2_MODELS / filename
    bpy.ops.export_scene.gltf(
        filepath=str(out),
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_animations=False,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=7,
    )
    print(f"EXPORTED {out.name}: {out.stat().st_size / 1024:.1f} KB")


def build_lava():
    clear_scene()
    col = bpy.context.scene.collection
    mats = {
        "cliff": make_mat("Lava_Cliff", "#2E2226", roughness=0.9),
        "deck": make_mat("Lava_Basalt", "#473539", roughness=0.88),
        "curb": make_mat("Lava_Curb", "#6A433D", roughness=0.8),
        "path": make_mat("Lava_Path", "#785850", roughness=0.82),
        "stone": make_mat("Lava_Stone", "#DFB38C", roughness=0.7),
        "plaza": make_mat("Lava_Plaza", "#945E4C", roughness=0.75),
        "gate_stone": make_mat("Gate_Obsidian", "#3B2D32", roughness=0.75),
        "gate_me": make_mat("Gate_Blue", "#3F8AE6", roughness=0.5),
        "gate_opp": make_mat("Gate_Orange", "#F28B38", roughness=0.5),
    }
    build_base_board(col, mats)
    mat_magma = make_mat("Magma_Glow", "#FF681E", roughness=0.3, emission_hex="#FF5A14", emission_strength=1.6)
    mat_spire = make_mat("Obsidian_Spire", "#261C21", roughness=0.65, metallic=0.15)
    for idx, (mx, my, r) in enumerate([(-5.2, -3.5, 1.05), (5.1, -2.5, 1.15), (-5.1, 3.8, 1.0), (5.2, 4.5, 1.2)]):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=14, radius1=r, radius2=r * 0.85, depth=0.14)
        link_mesh(col, f"MagmaPool_{idx}", bm, mat_magma, (mx, my, 0.16))
    for idx, (sx, sy, h) in enumerate([(-5.3, -6.5, 1.9), (5.3, -6.2, 2.1), (-5.2, 6.4, 2.2), (5.2, 6.7, 1.7), (-5.4, 0.2, 1.6), (5.4, -0.3, 1.8)]):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=6, radius1=0.62, radius2=0.08, depth=h)
        link_mesh(col, f"Spire_{idx}", bm, mat_spire, (sx, sy, 0.16 + h * 0.5))
    export_stage("field-lava-v2.glb")


def build_ice():
    clear_scene()
    col = bpy.context.scene.collection
    mats = {
        "cliff": make_mat("Ice_Glacier", "#5D94B8", roughness=0.5),
        "deck": make_mat("Ice_Snow", "#E6F5FF", roughness=0.72),
        "curb": make_mat("Ice_Curb", "#A8D8F5", roughness=0.45),
        "path": make_mat("Ice_Path", "#CBE9FA", roughness=0.4),
        "stone": make_mat("Ice_Stone", "#F7FCFF", roughness=0.35),
        "plaza": make_mat("Ice_Plaza", "#B3E1FA", roughness=0.35),
        "gate_stone": make_mat("Gate_IceStone", "#D6EEFC", roughness=0.5),
        "gate_me": make_mat("Gate_Blue", "#3F8AE6", roughness=0.5),
        "gate_opp": make_mat("Gate_Orange", "#F28B38", roughness=0.5),
    }
    build_base_board(col, mats)
    mat_crystal = make_mat("Ice_Crystal", "#72E2FF", roughness=0.2, metallic=0.1, emission_hex="#60D4FF", emission_strength=0.9)
    for idx, (cx, cy, h) in enumerate([(-5.1, -5.0, 2.0), (5.2, -4.5, 1.8), (-5.2, 4.4, 2.1), (5.1, 4.9, 1.7), (-5.3, 0.0, 1.5), (5.3, 0.2, 1.6)]):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=6, radius1=0.56, radius2=0.05, depth=h)
        link_mesh(col, f"Crystal_{idx}", bm, mat_crystal, (cx, cy, 0.16 + h * 0.5))
    export_stage("field-ice-v2.glb")


def build_ruins():
    clear_scene()
    col = bpy.context.scene.collection
    mats = {
        "cliff": make_mat("Ruins_Base", "#677282", roughness=0.85),
        "deck": make_mat("Ruins_MossStone", "#7D8B7A", roughness=0.84),
        "curb": make_mat("Ruins_Trim", "#C7C2B2", roughness=0.75),
        "path": make_mat("Ruins_Tile", "#DDD7C7", roughness=0.72),
        "stone": make_mat("Ruins_Medallion", "#EFEADF", roughness=0.65),
        "plaza": make_mat("Ruins_Arcane", "#7CE0F5", roughness=0.35, emission_hex="#58D2F0", emission_strength=0.85),
        "gate_stone": make_mat("Gate_Marble", "#DFD9CA", roughness=0.68),
        "gate_me": make_mat("Gate_Blue", "#3F8AE6", roughness=0.5),
        "gate_opp": make_mat("Gate_Orange", "#F28B38", roughness=0.5),
    }
    build_base_board(col, mats)
    mat_col = make_mat("Column_Marble", "#D8D2C2", roughness=0.68)
    for idx, (rx, ry, h) in enumerate([(-5.2, -5.5, 2.0), (5.2, -4.8, 1.3), (-5.1, 4.8, 1.4), (5.2, 5.4, 2.1)]):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=12, radius1=0.45, radius2=0.42, depth=h)
        link_mesh(col, f"BrokenColumn_{idx}", bm, mat_col, (rx, ry, 0.16 + h * 0.5))
    export_stage("field-ruins-v2.glb")


def build_dark_forest():
    clear_scene()
    col = bpy.context.scene.collection
    mats = {
        "cliff": make_mat("DF_Cliff", "#403126", roughness=0.9),
        "deck": make_mat("DF_Turf", "#2D593E", roughness=0.85),
        "curb": make_mat("DF_Curb", "#7A6A4E", roughness=0.82),
        "path": make_mat("DF_Dirt", "#9E8B6C", roughness=0.82),
        "stone": make_mat("DF_Stone", "#D8CFB8", roughness=0.72),
        "plaza": make_mat("DF_Plaza", "#7C7462", roughness=0.75),
        "gate_stone": make_mat("Gate_Bark", "#6A5440", roughness=0.8),
        "gate_me": make_mat("Gate_Blue", "#3F8AE6", roughness=0.5),
        "gate_opp": make_mat("Gate_Orange", "#F28B38", roughness=0.5),
    }
    build_base_board(col, mats)
    mat_trunk = make_mat("DF_Trunk", "#4E3422", roughness=0.85)
    mat_pine = make_mat("DF_Pine", "#1E4B34", roughness=0.78)
    mat_shroom = make_mat("DF_GlowShroom", "#78FFA8", roughness=0.4, emission_hex="#68FF9A", emission_strength=1.2)
    for idx, (tx, ty) in enumerate([(-5.3, -5.0), (5.3, -4.4), (-5.2, 4.4), (5.2, 5.1)]):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=8, radius1=0.25, radius2=0.20, depth=1.2)
        link_mesh(col, f"PineTrunk_{idx}", bm, mat_trunk, (tx, ty, 0.72))
        for tier, (z_off, rad, hh) in enumerate([(1.35, 1.0, 1.1), (1.95, 0.78, 1.0)]):
            bm = bmesh.new()
            bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=8, radius1=rad, radius2=0.08, depth=hh)
            link_mesh(col, f"PineCrown_{idx}_{tier}", bm, mat_pine, (tx, ty, z_off))
    for idx, (mx, my) in enumerate([(-5.0, -1.2), (5.0, 1.4), (-4.9, 1.8), (5.0, -1.6)]):
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.35)
        for v in bm.verts:
            v.co.z = max(0.0, v.co.z * 0.65)
        link_mesh(col, f"GlowShroom_{idx}", bm, mat_shroom, (mx, my, 0.28))
    export_stage("field-darkForest-v2.glb")


def build_desert():
    clear_scene()
    col = bpy.context.scene.collection
    mats = {
        "cliff": make_mat("Desert_Cliff", "#A86636", roughness=0.88),
        "deck": make_mat("Desert_Sand", "#F0C978", roughness=0.84),
        "curb": make_mat("Desert_Curb", "#D49B4E", roughness=0.78),
        "path": make_mat("Desert_Road", "#F8E5B0", roughness=0.76),
        "stone": make_mat("Desert_Tile", "#FFF5D6", roughness=0.68),
        "plaza": make_mat("Desert_Plaza", "#E8BE6E", roughness=0.72),
        "gate_stone": make_mat("Gate_Sandstone", "#DFB36B", roughness=0.72),
        "gate_me": make_mat("Gate_Blue", "#3F8AE6", roughness=0.5),
        "gate_opp": make_mat("Gate_Orange", "#F28B38", roughness=0.5),
    }
    build_base_board(col, mats)
    mat_obelisk = make_mat("Desert_Obelisk", "#C98C47", roughness=0.74)
    mat_dune = make_mat("Desert_Dune", "#F6D485", roughness=0.86)
    for idx, (dx, dy) in enumerate([(-5.2, -2.5), (5.2, 2.2)]):
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.2)
        for v in bm.verts:
            v.co.z = max(0.0, v.co.z * 0.4) + 0.12
            v.co.y *= 1.8
        link_mesh(col, f"SandDune_{idx}", bm, mat_dune, (dx, dy, 0.0))
    for idx, (ox, oy, h) in enumerate([(-5.2, -6.0, 2.0), (5.2, 5.8, 2.0), (-5.2, 5.6, 1.6), (5.2, -5.8, 1.6)]):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=4, radius1=0.48, radius2=0.18, depth=h)
        link_mesh(col, f"Obelisk_{idx}", bm, mat_obelisk, (ox, oy, 0.16 + h * 0.5))
    export_stage("field-desert-v2.glb")


if __name__ == "__main__":
    build_lava()
    build_ice()
    build_ruins()
    build_dark_forest()
    build_desert()
