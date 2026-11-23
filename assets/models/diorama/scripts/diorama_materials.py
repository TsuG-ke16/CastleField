"""Procedural PBR materials and mesh helpers for Castle Field 4-Faction Diorama.

Designed for dual compatibility:
- Cycles (Blender 5.3 OPTIX): full procedural bump/roughness + vertex-color macro shading.
- glTF 2.0 (.glb / Three.js): clean Principled BSDF base color / vertex color / metallic /
  roughness / emission so WebGL renders match Blender renders closely without heavy textures.
"""

import math
import bpy
import bmesh
from mathutils import Vector, Matrix


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgba(hex_str, alpha=1.0):
    h = hex_str.lstrip('#')
    r, g, b = (int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), alpha)


def lerp_rgba(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(a[i] * (1.0 - t) + b[i] * t for i in range(4))


def fbm_noise(x, y, z=0.0):
    """Deterministic multi-octave trig noise in [0, 1]."""
    v = (
        math.sin(x * 0.43 + y * 0.29 + z * 0.51) * 0.40
        + math.cos(x * 0.91 - y * 0.77 + z * 0.37) * 0.28
        + math.sin((x - y) * 1.63 + z * 1.29) * 0.19
        + math.cos((x + y) * 2.85 - z * 2.13) * 0.13
    )
    return 0.5 + 0.5 * max(-1.0, min(1.0, v))


def ensure_collection(name, parent=None):
    if name in bpy.data.collections:
        col = bpy.data.collections[name]
    else:
        col = bpy.data.collections.new(name)
        target_parent = parent if parent is not None else bpy.context.scene.collection
        target_parent.children.link(col)
    return col


def link_to_collection(obj, col):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    col.objects.link(obj)
    return obj


def set_smooth(mesh, auto_angle_deg=None):
    """Set smooth shading cleanly on Blender 5.x meshes."""
    if not mesh.polygons:
        return
    mesh.polygons.foreach_set('use_smooth', [True] * len(mesh.polygons))
    mesh.update()


def set_flat(mesh):
    if not mesh.polygons:
        return
    mesh.polygons.foreach_set('use_smooth', [False] * len(mesh.polygons))
    mesh.update()


def paint_vertex_colors(bm, color_fn, layer_name='Col'):
    """Assign per-loop vertex colors using color_fn(co, normal) -> (r, g, b, a)."""
    cl = bm.loops.layers.color.get(layer_name)
    if cl is None:
        cl = bm.loops.layers.color.new(layer_name)
    for f in bm.faces:
        n = f.normal
        for loop in f.loops:
            loop[cl] = color_fn(loop.vert.co, n)


def mesh_from_bmesh(bm, name, col, mat=None, smooth=False, recalc_normals=True, location=(0, 0, 0)):
    if recalc_normals and len(bm.faces) > 0:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    if smooth:
        set_smooth(mesh)
    else:
        set_flat(mesh)
    if mat is not None:
        if isinstance(mat, (list, tuple)):
            for m in mat:
                mesh.materials.append(m)
        else:
            mesh.materials.append(mat)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = location
    col.objects.link(obj)
    return obj


def make_pbr_material(
    name,
    base_hex,
    roughness=0.78,
    metallic=0.0,
    emission_hex=None,
    emission_strength=0.0,
    use_vcol=False,
    bump_scale=0.0,
    bump_strength=0.0,
    coat_weight=0.0,
    alpha=1.0,
    transmission=0.0,
    subsurface=0.0,
    ior=1.45,
):
    if name in bpy.data.materials:
        mat = bpy.data.materials[name]
        mat.node_tree.nodes.clear()
    else:
        mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nodes = nt.nodes
    links = nt.links
    nodes.clear()

    out = nodes.new('ShaderNodeOutputMaterial')
    out.location = (500, 0)
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.location = (180, 0)
    links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])

    col = hex_rgba(base_hex, alpha)
    mat.diffuse_color = col

    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['IOR'].default_value = ior
    if 'Alpha' in bsdf.inputs:
        bsdf.inputs['Alpha'].default_value = alpha
    if 'Coat Weight' in bsdf.inputs and coat_weight > 0.0:
        bsdf.inputs['Coat Weight'].default_value = coat_weight
        bsdf.inputs['Coat Roughness'].default_value = 0.15
    if 'Transmission Weight' in bsdf.inputs and transmission > 0.0:
        bsdf.inputs['Transmission Weight'].default_value = transmission
    if 'Subsurface Weight' in bsdf.inputs and subsurface > 0.0:
        bsdf.inputs['Subsurface Weight'].default_value = subsurface
        if 'Subsurface Scale' in bsdf.inputs:
            bsdf.inputs['Subsurface Scale'].default_value = 0.12

    if use_vcol:
        vc = nodes.new('ShaderNodeVertexColor')
        vc.layer_name = 'Col'
        vc.location = (-220, 120)
        links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
    else:
        bsdf.inputs['Base Color'].default_value = col

    if emission_hex and emission_strength > 0.0:
        bsdf.inputs['Emission Color'].default_value = hex_rgba(emission_hex)
        bsdf.inputs['Emission Strength'].default_value = emission_strength

    if bump_scale > 0.0 and bump_strength > 0.0:
        tex_coord = nodes.new('ShaderNodeTexCoord')
        tex_coord.location = (-520, -200)
        noise = nodes.new('ShaderNodeTexNoise')
        noise.location = (-300, -200)
        noise.inputs['Scale'].default_value = bump_scale
        noise.inputs['Detail'].default_value = 5.0
        noise.inputs['Roughness'].default_value = 0.62
        links.new(tex_coord.outputs['Object'], noise.inputs['Vector'])

        bump = nodes.new('ShaderNodeBump')
        bump.location = (-60, -200)
        bump.inputs['Strength'].default_value = bump_strength
        bump.inputs['Distance'].default_value = 0.12
        links.new(noise.outputs['Fac'], bump.inputs['Height'])
        links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])

    if alpha < 0.99:
        mat.blend_method = 'BLEND' if hasattr(mat, 'blend_method') else 'HASHED'

    return mat


def build_material_library():
    """Create and return the full named PBR material dictionary for the diorama."""
    M = {}

    # Terrain & Island
    M['island_top'] = make_pbr_material(
        'Mat_Island_Top_Biomes', '#5F9A49', roughness=0.86, use_vcol=True,
        bump_scale=3.2, bump_strength=0.18
    )
    M['island_rock'] = make_pbr_material(
        'Mat_Island_Cliff_Rock', '#646B73', roughness=0.88, use_vcol=True,
        bump_scale=2.4, bump_strength=0.35
    )

    # Central Plaza & Roads & Bridges (Neutral warm stonework)
    M['plaza_stone'] = make_pbr_material(
        'Mat_Plaza_Sandstone', '#D9CDB8', roughness=0.72, use_vcol=True,
        bump_scale=6.5, bump_strength=0.14
    )
    M['plaza_trim'] = make_pbr_material(
        'Mat_Plaza_Trim_Marble', '#EAE2D2', roughness=0.58,
        bump_scale=8.0, bump_strength=0.08
    )
    M['plaza_gold'] = make_pbr_material(
        'Mat_Plaza_Compass_Gold', '#E5B84B', roughness=0.26, metallic=0.88,
        coat_weight=0.25
    )
    M['road_stone'] = make_pbr_material(
        'Mat_Road_Cobblestone', '#C6B9A3', roughness=0.78, use_vcol=True,
        bump_scale=9.0, bump_strength=0.22
    )
    M['bridge_stone'] = make_pbr_material(
        'Mat_Bridge_Ashlar', '#CFC4B0', roughness=0.74, use_vcol=True,
        bump_scale=7.0, bump_strength=0.18
    )

    # Water & Foam & Clouds
    M['water'] = make_pbr_material(
        'Mat_Water_Crystal', '#2CA8D8', roughness=0.08, metallic=0.02,
        coat_weight=0.75, alpha=0.86, transmission=0.28, ior=1.333,
        bump_scale=4.5, bump_strength=0.06
    )
    M['waterfall'] = make_pbr_material(
        'Mat_Waterfall_Stream', '#6BD4F2', roughness=0.18,
        emission_hex='#7CE3FF', emission_strength=0.35, alpha=0.88,
        coat_weight=0.5, bump_scale=5.5, bump_strength=0.12
    )
    M['foam'] = make_pbr_material(
        'Mat_Water_Foam', '#EAF9FF', roughness=0.55,
        emission_hex='#DDF6FF', emission_strength=0.28, alpha=0.90
    )
    M['cloud'] = make_pbr_material(
        'Mat_Cloud_Mist', '#F2F6FF', roughness=0.95,
        emission_hex='#DCE8FF', emission_strength=0.12, alpha=0.65
    )

    # Shared accents & emitters (tuned for rich AgX color saturation!)
    M['glow_warm'] = make_pbr_material(
        'Mat_Glow_Warm_Lantern', '#FFAE38', roughness=0.28,
        emission_hex='#FF951C', emission_strength=3.2
    )
    M['glow_forest'] = make_pbr_material(
        'Mat_Glow_Forest_Amber', '#FFC43D', roughness=0.30,
        emission_hex='#FFA820', emission_strength=3.1
    )
    M['glow_demon'] = make_pbr_material(
        'Mat_Glow_Demon_Violet', '#A826FF', roughness=0.16,
        emission_hex='#9412FF', emission_strength=4.2
    )
    M['glow_dragon'] = make_pbr_material(
        'Mat_Glow_Dragon_Flame', '#FF4D0A', roughness=0.22,
        emission_hex='#FF3B00', emission_strength=4.6
    )
    M['lava'] = make_pbr_material(
        'Mat_Volcanic_Lava', '#E62B00', roughness=0.30,
        emission_hex='#FF3800', emission_strength=4.0
    )
    M['iron_dark'] = make_pbr_material(
        'Mat_Dark_Iron', '#2A2D34', roughness=0.45, metallic=0.82
    )
    M['gold'] = make_pbr_material(
        'Mat_Royal_Gold', '#F0C042', roughness=0.24, metallic=0.92,
        coat_weight=0.2
    )

    # Kingdom (North)
    M['kingdom_wall'] = make_pbr_material(
        'Mat_Kingdom_Limestone', '#ECE8DE', roughness=0.68, use_vcol=True,
        bump_scale=8.5, bump_strength=0.14
    )
    M['kingdom_trim'] = make_pbr_material(
        'Mat_Kingdom_Trim', '#D5CBB8', roughness=0.65,
        bump_scale=7.0, bump_strength=0.10
    )
    M['kingdom_roof'] = make_pbr_material(
        'Mat_Kingdom_RoyalBlue_Roof', '#1B52C2', roughness=0.38, metallic=0.10,
        coat_weight=0.30, bump_scale=12.0, bump_strength=0.10
    )
    M['kingdom_banner'] = make_pbr_material(
        'Mat_Kingdom_Banner', '#1A4EB8', roughness=0.70
    )
    M['kingdom_door'] = make_pbr_material(
        'Mat_Kingdom_OakDoor', '#6B4226', roughness=0.74,
        bump_scale=10.0, bump_strength=0.15
    )

    # Forest Alliance (West)
    M['forest_bark'] = make_pbr_material(
        'Mat_Forest_AncientBark', '#6E492F', roughness=0.84, use_vcol=True,
        bump_scale=5.0, bump_strength=0.35
    )
    M['forest_wood'] = make_pbr_material(
        'Mat_Forest_CarvedTimber', '#99643B', roughness=0.74, use_vcol=True,
        bump_scale=8.0, bump_strength=0.18
    )
    M['forest_stone'] = make_pbr_material(
        'Mat_Forest_MossyStone', '#8A8D7B', roughness=0.82, use_vcol=True,
        bump_scale=6.0, bump_strength=0.22
    )
    M['forest_canopy'] = make_pbr_material(
        'Mat_Forest_CanopyLeaves', '#3D9136', roughness=0.70, use_vcol=True,
        subsurface=0.20, bump_scale=6.0, bump_strength=0.18
    )
    M['forest_roof'] = make_pbr_material(
        'Mat_Forest_LeafRoof', '#288246', roughness=0.52,
        coat_weight=0.18, bump_scale=10.0, bump_strength=0.14
    )
    M['forest_banner'] = make_pbr_material(
        'Mat_Forest_Banner', '#2C8040', roughness=0.74
    )

    # Demon Army (East)
    M['demon_obsidian'] = make_pbr_material(
        'Mat_Demon_ObsidianWall', '#2A233A', roughness=0.36, metallic=0.26,
        coat_weight=0.38, use_vcol=True, bump_scale=6.5, bump_strength=0.22
    )
    M['demon_trim'] = make_pbr_material(
        'Mat_Demon_SilverVioletTrim', '#584878', roughness=0.34, metallic=0.68
    )
    M['demon_roof'] = make_pbr_material(
        'Mat_Demon_SpireSlate', '#1E1730', roughness=0.30, metallic=0.34,
        coat_weight=0.45
    )
    M['demon_crystal'] = make_pbr_material(
        'Mat_Demon_ManaCrystal', '#8C1CFF', roughness=0.12, metallic=0.06,
        emission_hex='#8A14FF', emission_strength=3.4, coat_weight=0.90,
        transmission=0.18
    )
    M['demon_banner'] = make_pbr_material(
        'Mat_Demon_Banner', '#5E1B8A', roughness=0.68
    )

    # Dragon Empire (South)
    M['dragon_basalt'] = make_pbr_material(
        'Mat_Dragon_BasaltWall', '#3A2A27', roughness=0.80, metallic=0.08,
        use_vcol=True, bump_scale=6.0, bump_strength=0.28
    )
    M['dragon_redstone'] = make_pbr_material(
        'Mat_Dragon_CrimsonStone', '#7A2820', roughness=0.68,
        bump_scale=7.5, bump_strength=0.18
    )
    M['dragon_roof'] = make_pbr_material(
        'Mat_Dragon_ObsidianRoof', '#4C1E1B', roughness=0.45, metallic=0.28,
        coat_weight=0.20
    )
    M['dragon_horn'] = make_pbr_material(
        'Mat_Dragon_BoneHorn', '#DFCFAF', roughness=0.52, use_vcol=True,
        bump_scale=9.0, bump_strength=0.16
    )
    M['dragon_banner'] = make_pbr_material(
        'Mat_Dragon_CrimsonBanner', '#B51A1A', roughness=0.68
    )
    M['dragon_bronze'] = make_pbr_material(
        'Mat_Dragon_BronzeTrim', '#B87634', roughness=0.34, metallic=0.86
    )

    # Nature materials
    M['tree_pine'] = make_pbr_material(
        'Mat_Nature_PineFoliage', '#2F723B', roughness=0.76, use_vcol=True,
        subsurface=0.12
    )
    M['tree_broad'] = make_pbr_material(
        'Mat_Nature_Broadleaf', '#4FA340', roughness=0.72, use_vcol=True,
        subsurface=0.18
    )
    M['rock_light'] = make_pbr_material(
        'Mat_Nature_LimestoneRock', '#8E8A82', roughness=0.86, use_vcol=True,
        bump_scale=4.5, bump_strength=0.28
    )
    M['rock_dark'] = make_pbr_material(
        'Mat_Nature_VolcanicRock', '#383336', roughness=0.88, use_vcol=True,
        bump_scale=4.0, bump_strength=0.34
    )

    return M
