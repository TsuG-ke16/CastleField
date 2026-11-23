"""Upgraded AAA Procedural PBR materials and mesh helpers for Castle Field 4-Faction Diorama.

Dual-pipeline quality:
- Cycles (Blender 5.3 OPTIX): multi-layered procedural stone/bark/roof/water/crystal shaders
  with Voronoi + Noise micro-bump, roughness modulation, subtle AO/cavity vertex colors, and
  compositor bloom-friendly calibrated AgX emissions.
- glTF 2.0 (.glb / Three.js): clean Principled BSDF base/vertex colors, metallic, roughness,
  emission, and transparency exported cleanly with zero broken external texture dependencies.
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
        math.sin(x * 0.43 + y * 0.29 + z * 0.51) * 0.38
        + math.cos(x * 0.91 - y * 0.77 + z * 0.37) * 0.27
        + math.sin((x - y) * 1.63 + z * 1.29) * 0.19
        + math.cos((x + y) * 2.85 - z * 2.13) * 0.11
        + math.sin(x * 4.71 + y * 3.89 - z * 4.13) * 0.05
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


def set_smooth(mesh):
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
    voronoi_scale=0.0,
    voronoi_strength=0.0,
    roughness_var=0.0,
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
    out.location = (640, 0)
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.location = (300, 0)
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
        bsdf.inputs['Coat Roughness'].default_value = 0.14
    if 'Transmission Weight' in bsdf.inputs and transmission > 0.0:
        bsdf.inputs['Transmission Weight'].default_value = transmission
    if 'Subsurface Weight' in bsdf.inputs and subsurface > 0.0:
        bsdf.inputs['Subsurface Weight'].default_value = subsurface
        if 'Subsurface Scale' in bsdf.inputs:
            bsdf.inputs['Subsurface Scale'].default_value = 0.14

    if use_vcol:
        vc = nodes.new('ShaderNodeVertexColor')
        vc.layer_name = 'Col'
        vc.location = (-400, 180)
        # Multiply subtle procedural Ambient Occlusion into Base Color for rich painterly crevice depth matching Tripo PBR!
        ao = nodes.new('ShaderNodeAmbientOcclusion')
        ao.location = (-400, 20)
        ao.samples = 8
        ao.inputs['Distance'].default_value = 1.6
        links.new(vc.outputs['Color'], ao.inputs['Color'])

        mix_ao = nodes.new('ShaderNodeMix')
        mix_ao.data_type = 'RGBA'
        mix_ao.blend_type = 'MULTIPLY'
        mix_ao.location = (-120, 140)
        mix_ao.inputs['Factor'].default_value = 0.55
        links.new(vc.outputs['Color'], mix_ao.inputs['A'])
        links.new(ao.outputs['AO'], mix_ao.inputs['B'])
        links.new(mix_ao.outputs['Result'], bsdf.inputs['Base Color'])
    else:
        bsdf.inputs['Base Color'].default_value = col

    if emission_hex and emission_strength > 0.0:
        bsdf.inputs['Emission Color'].default_value = hex_rgba(emission_hex)
        bsdf.inputs['Emission Strength'].default_value = emission_strength

    tex_coord = None
    if bump_scale > 0.0 or voronoi_scale > 0.0 or roughness_var > 0.0:
        tex_coord = nodes.new('ShaderNodeTexCoord')
        tex_coord.location = (-720, -180)

    noise_node = None
    if bump_scale > 0.0 or roughness_var > 0.0:
        noise_node = nodes.new('ShaderNodeTexNoise')
        noise_node.location = (-460, -120)
        noise_node.inputs['Scale'].default_value = bump_scale if bump_scale > 0.0 else 6.0
        noise_node.inputs['Detail'].default_value = 7.0
        noise_node.inputs['Roughness'].default_value = 0.65
        links.new(tex_coord.outputs['Object'], noise_node.inputs['Vector'])

    if roughness_var > 0.0 and noise_node is not None:
        rmap = nodes.new('ShaderNodeMapRange')
        rmap.location = (-160, -40)
        rmap.inputs['From Min'].default_value = 0.25
        rmap.inputs['From Max'].default_value = 0.75
        rmap.inputs['To Min'].default_value = max(0.05, roughness - roughness_var)
        rmap.inputs['To Max'].default_value = min(0.98, roughness + roughness_var)
        links.new(noise_node.outputs['Fac'], rmap.inputs['Value'])
        links.new(rmap.outputs['Result'], bsdf.inputs['Roughness'])

    # Combine Voronoi stone/masonry pattern + Noise micro-grain into Normal bump
    last_normal = None
    if voronoi_scale > 0.0 and voronoi_strength > 0.0:
        vor = nodes.new('ShaderNodeTexVoronoi')
        vor.location = (-460, -340)
        vor.feature = 'DISTANCE_TO_EDGE'
        vor.inputs['Scale'].default_value = voronoi_scale
        links.new(tex_coord.outputs['Object'], vor.inputs['Vector'])

        vbump = nodes.new('ShaderNodeBump')
        vbump.location = (-160, -340)
        vbump.inputs['Strength'].default_value = voronoi_strength
        vbump.inputs['Distance'].default_value = 0.08
        links.new(vor.outputs['Distance'], vbump.inputs['Height'])
        last_normal = vbump.outputs['Normal']

    if bump_scale > 0.0 and bump_strength > 0.0 and noise_node is not None:
        nbump = nodes.new('ShaderNodeBump')
        nbump.location = (60, -220)
        nbump.inputs['Strength'].default_value = bump_strength
        nbump.inputs['Distance'].default_value = 0.10
        links.new(noise_node.outputs['Fac'], nbump.inputs['Height'])
        if last_normal is not None:
            links.new(last_normal, nbump.inputs['Normal'])
        last_normal = nbump.outputs['Normal']

    if last_normal is not None:
        links.new(last_normal, bsdf.inputs['Normal'])

    if alpha < 0.99 and hasattr(mat, 'blend_method'):
        mat.blend_method = 'BLEND'

    return mat


def build_material_library():
    """Create and return the upgraded rich PBR material dictionary."""
    M = {}

    # Terrain & Island
    M['island_top'] = make_pbr_material(
        'Mat_Island_Top_Biomes', '#5F9A49', roughness=0.86, use_vcol=True,
        bump_scale=3.8, bump_strength=0.22, roughness_var=0.08
    )
    M['island_rock'] = make_pbr_material(
        'Mat_Island_Cliff_Rock', '#6C7078', roughness=0.88, use_vcol=True,
        bump_scale=2.8, bump_strength=0.42, voronoi_scale=1.6, voronoi_strength=0.25, roughness_var=0.08
    )
    M['retaining_stone'] = make_pbr_material(
        'Mat_Terrace_RetainingStone', '#9B9488', roughness=0.80, use_vcol=True,
        bump_scale=6.5, bump_strength=0.25, voronoi_scale=3.5, voronoi_strength=0.22
    )

    # Central Plaza & Roads & Bridges (Neutral warm sculpted stonework)
    M['plaza_stone'] = make_pbr_material(
        'Mat_Plaza_Sandstone', '#DDD1BC', roughness=0.68, use_vcol=True,
        bump_scale=7.5, bump_strength=0.16, voronoi_scale=4.2, voronoi_strength=0.12, roughness_var=0.08
    )
    M['plaza_trim'] = make_pbr_material(
        'Mat_Plaza_Trim_Marble', '#EFE8DA', roughness=0.50,
        bump_scale=9.0, bump_strength=0.08, coat_weight=0.12
    )
    M['plaza_gold'] = make_pbr_material(
        'Mat_Plaza_Compass_Gold', '#EBBD48', roughness=0.22, metallic=0.92,
        coat_weight=0.30, roughness_var=0.05
    )
    M['plaza_bronze'] = make_pbr_material(
        'Mat_Plaza_Compass_Bronze', '#9C6F36', roughness=0.34, metallic=0.86
    )
    M['road_stone'] = make_pbr_material(
        'Mat_Road_Cobblestone', '#CBBFA9', roughness=0.76, use_vcol=True,
        bump_scale=9.5, bump_strength=0.24, voronoi_scale=6.0, voronoi_strength=0.18, roughness_var=0.08
    )
    M['bridge_stone'] = make_pbr_material(
        'Mat_Bridge_Ashlar', '#D4C8B4', roughness=0.72, use_vcol=True,
        bump_scale=8.0, bump_strength=0.20, voronoi_scale=4.5, voronoi_strength=0.18, roughness_var=0.07
    )

    # Water, Waterfalls, Foam & Soft Clouds
    M['water'] = make_pbr_material(
        'Mat_Water_Crystal', '#1FA3D4', roughness=0.06, metallic=0.03,
        coat_weight=0.85, alpha=0.84, transmission=0.35, ior=1.333,
        bump_scale=5.2, bump_strength=0.08
    )
    M['waterfall'] = make_pbr_material(
        'Mat_Waterfall_Stream', '#5CCEEB', roughness=0.14,
        emission_hex='#6ADFFF', emission_strength=0.42, alpha=0.86,
        coat_weight=0.65, bump_scale=6.5, bump_strength=0.16
    )
    M['foam'] = make_pbr_material(
        'Mat_Water_Foam', '#EEF9FF', roughness=0.48,
        emission_hex='#DCF6FF', emission_strength=0.36, alpha=0.92
    )
    M['cloud'] = make_pbr_material(
        'Mat_Cloud_Mist', '#F4F7FF', roughness=0.96,
        use_vcol=True, emission_hex='#DDE9FF', emission_strength=0.16, alpha=0.78
    )

    # Calibrated Rich AgX Emitters & Multi-Layer Fire / Glow
    M['glow_warm'] = make_pbr_material(
        'Mat_Glow_Warm_Lantern', '#FFB03B', roughness=0.24,
        emission_hex='#FF9A1F', emission_strength=3.6
    )
    M['glow_window_gold'] = make_pbr_material(
        'Mat_Glow_Cathedral_Gold', '#FFC65C', roughness=0.22,
        emission_hex='#FFAD33', emission_strength=3.2
    )
    M['glow_forest'] = make_pbr_material(
        'Mat_Glow_Forest_Amber', '#FFCC42', roughness=0.26,
        emission_hex='#FFAA1E', emission_strength=3.5
    )
    M['glow_forest_spore'] = make_pbr_material(
        'Mat_Glow_Forest_Emerald', '#7BFF8E', roughness=0.25,
        emission_hex='#44FF77', emission_strength=3.0
    )
    M['glow_demon'] = make_pbr_material(
        'Mat_Glow_Demon_Violet', '#8F19FF', roughness=0.14,
        emission_hex='#7F0FFF', emission_strength=3.4
    )
    M['glow_demon_core'] = make_pbr_material(
        'Mat_Glow_Demon_MagentaCore', '#C93BFF', roughness=0.10,
        emission_hex='#BA24FF', emission_strength=4.6
    )
    M['glow_dragon'] = make_pbr_material(
        'Mat_Glow_Dragon_FlameOuter', '#FF6A00', roughness=0.22,
        emission_hex='#FF5500', emission_strength=3.3
    )
    M['glow_dragon_core'] = make_pbr_material(
        'Mat_Glow_Dragon_FlameCore', '#FFE438', roughness=0.16,
        emission_hex='#FFCA14', emission_strength=5.8
    )
    M['lava'] = make_pbr_material(
        'Mat_Volcanic_Lava', '#FF5200', roughness=0.28,
        emission_hex='#FF4400', emission_strength=3.2
    )

    # Metals
    M['iron_dark'] = make_pbr_material(
        'Mat_Dark_Iron', '#262930', roughness=0.40, metallic=0.86, roughness_var=0.08
    )
    M['gold'] = make_pbr_material(
        'Mat_Royal_Gold', '#F2C244', roughness=0.20, metallic=0.94,
        coat_weight=0.25, roughness_var=0.05
    )

    # Kingdom (North)
    M['kingdom_wall'] = make_pbr_material(
        'Mat_Kingdom_Limestone', '#F0ECE2', roughness=0.66, use_vcol=True,
        bump_scale=9.0, bump_strength=0.16, voronoi_scale=5.2, voronoi_strength=0.14, roughness_var=0.07
    )
    M['kingdom_trim'] = make_pbr_material(
        'Mat_Kingdom_Trim', '#D8CEBA', roughness=0.60,
        bump_scale=8.0, bump_strength=0.10, coat_weight=0.08
    )
    M['kingdom_roof'] = make_pbr_material(
        'Mat_Kingdom_RoyalBlue_Roof', '#1B53C8', roughness=0.34, metallic=0.12,
        use_vcol=True, coat_weight=0.35, bump_scale=14.0, bump_strength=0.14, voronoi_scale=8.5, voronoi_strength=0.14
    )
    M['kingdom_banner'] = make_pbr_material(
        'Mat_Kingdom_Banner', '#184BB8', roughness=0.68
    )
    M['kingdom_door'] = make_pbr_material(
        'Mat_Kingdom_OakDoor', '#663D22', roughness=0.72,
        bump_scale=12.0, bump_strength=0.20
    )

    # Forest Alliance (West)
    M['forest_bark'] = make_pbr_material(
        'Mat_Forest_AncientBark', '#734E32', roughness=0.84, use_vcol=True,
        bump_scale=5.5, bump_strength=0.42, voronoi_scale=3.8, voronoi_strength=0.22, roughness_var=0.08
    )
    M['forest_wood'] = make_pbr_material(
        'Mat_Forest_CarvedTimber', '#9C663B', roughness=0.72, use_vcol=True,
        bump_scale=9.0, bump_strength=0.20, roughness_var=0.07
    )
    M['forest_stone'] = make_pbr_material(
        'Mat_Forest_MossyStone', '#8B907A', roughness=0.80, use_vcol=True,
        bump_scale=6.5, bump_strength=0.26, voronoi_scale=4.0, voronoi_strength=0.20
    )
    M['forest_canopy'] = make_pbr_material(
        'Mat_Forest_CanopyLeaves', '#3E9636', roughness=0.68, use_vcol=True,
        subsurface=0.22, bump_scale=8.0, bump_strength=0.22, roughness_var=0.08
    )
    M['forest_roof'] = make_pbr_material(
        'Mat_Forest_LeafRoof', '#258746', roughness=0.48, use_vcol=True,
        coat_weight=0.22, bump_scale=12.0, bump_strength=0.16, voronoi_scale=7.5, voronoi_strength=0.12
    )
    M['forest_banner'] = make_pbr_material(
        'Mat_Forest_Banner', '#298240', roughness=0.70
    )
    M['forest_vine'] = make_pbr_material(
        'Mat_Forest_HangingVines', '#377E32', roughness=0.74, subsurface=0.18
    )

    # Demon Army (East)
    M['demon_obsidian'] = make_pbr_material(
        'Mat_Demon_ObsidianWall', '#29223B', roughness=0.34, metallic=0.28,
        coat_weight=0.42, use_vcol=True, bump_scale=7.0, bump_strength=0.24, voronoi_scale=4.5, voronoi_strength=0.18
    )
    M['demon_trim'] = make_pbr_material(
        'Mat_Demon_SilverVioletTrim', '#5E4D82', roughness=0.30, metallic=0.74, coat_weight=0.22
    )
    M['demon_roof'] = make_pbr_material(
        'Mat_Demon_SpireSlate', '#1C162E', roughness=0.28, metallic=0.38,
        coat_weight=0.50, bump_scale=11.0, bump_strength=0.12
    )
    M['demon_crystal'] = make_pbr_material(
        'Mat_Demon_ManaCrystal', '#7810FF', roughness=0.07, metallic=0.06,
        emission_hex='#7208FF', emission_strength=2.3, coat_weight=0.95,
        transmission=0.32, ior=1.55
    )
    M['demon_banner'] = make_pbr_material(
        'Mat_Demon_Banner', '#5E188C', roughness=0.66
    )

    # Dragon Empire (South)
    M['dragon_basalt'] = make_pbr_material(
        'Mat_Dragon_BasaltWall', '#432E29', roughness=0.76, metallic=0.12,
        use_vcol=True, bump_scale=6.5, bump_strength=0.32, voronoi_scale=4.2, voronoi_strength=0.24, roughness_var=0.08
    )
    M['dragon_redstone'] = make_pbr_material(
        'Mat_Dragon_CrimsonStone', '#87291E', roughness=0.62,
        bump_scale=8.0, bump_strength=0.20, voronoi_scale=5.0, voronoi_strength=0.14
    )
    M['dragon_roof'] = make_pbr_material(
        'Mat_Dragon_ObsidianRoof', '#541E1A', roughness=0.40, metallic=0.32,
        coat_weight=0.28, bump_scale=12.0, bump_strength=0.14
    )
    M['dragon_horn'] = make_pbr_material(
        'Mat_Dragon_BoneHorn', '#E3D3B3', roughness=0.46, use_vcol=True,
        coat_weight=0.16, bump_scale=11.0, bump_strength=0.22, roughness_var=0.07
    )
    M['dragon_banner'] = make_pbr_material(
        'Mat_Dragon_CrimsonBanner', '#BD1919', roughness=0.65
    )
    M['dragon_bronze'] = make_pbr_material(
        'Mat_Dragon_BronzeTrim', '#C47D34', roughness=0.30, metallic=0.88, coat_weight=0.20
    )

    # Nature materials
    M['tree_pine'] = make_pbr_material(
        'Mat_Nature_PineFoliage', '#2E753A', roughness=0.74, use_vcol=True,
        subsurface=0.15, bump_scale=7.0, bump_strength=0.18
    )
    M['tree_broad'] = make_pbr_material(
        'Mat_Nature_Broadleaf', '#4FA840', roughness=0.70, use_vcol=True,
        subsurface=0.20, bump_scale=7.5, bump_strength=0.20
    )
    M['flower_gold'] = make_pbr_material(
        'Mat_Nature_Flowers', '#FFE052', roughness=0.55,
        emission_hex='#FFD240', emission_strength=0.35
    )
    M['rock_light'] = make_pbr_material(
        'Mat_Nature_LimestoneRock', '#969186', roughness=0.84, use_vcol=True,
        bump_scale=5.0, bump_strength=0.34, voronoi_scale=2.8, voronoi_strength=0.22
    )
    M['rock_dark'] = make_pbr_material(
        'Mat_Nature_VolcanicRock', '#3F3436', roughness=0.86, use_vcol=True,
        bump_scale=4.5, bump_strength=0.38, voronoi_scale=2.6, voronoi_strength=0.25
    )

    return M
