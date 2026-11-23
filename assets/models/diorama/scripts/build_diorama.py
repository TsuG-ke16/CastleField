"""Master reproducible generator for the Castle Field 4-Faction 3D Diorama.

Usage (from repository root):
  "C:\\Program Files\\Blender Foundation\\Blender 5.3\\blender.exe" --background --python assets/models/diorama/scripts/build_diorama.py

Outputs under assets/models/diorama/:
  - castle_field_diorama.blend
  - castle_field_diorama.glb
  - config/cameras.json
  - config/coordinates.json
  - config/assets_materials.json
"""

import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

SCRIPT_DIR = Path(__file__).resolve().parent
DIORAMA_DIR = SCRIPT_DIR.parent
CONFIG_DIR = DIORAMA_DIR / 'config'
CONFIG_DIR.mkdir(parents=True, exist_ok=True)

if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from diorama_materials import (
    ensure_collection,
    hex_rgba,
    build_material_library,
)
from diorama_terrain import (
    LAYOUT,
    USE_TRIPO_ISLAND,
    build_tripo_island_scene,
    build_island_base,
    build_central_plaza,
    build_bridges,
    build_roads,
    build_water,
)
from diorama_castles import (
    build_castle_kingdom,
    build_castle_forest,
    build_castle_demon,
    build_castle_dragon,
)
from diorama_nature_props import (
    build_nature,
    build_props,
    build_tripo_props_only,
)


def setup_world(scene):
    """Painterly sky gradient + soft atmospheric cloud haze horizon."""
    w = bpy.data.worlds.new('World_CastleField_Sky')
    w.use_nodes = True
    nt = w.node_tree
    nodes = nt.nodes
    links = nt.links
    nodes.clear()

    out = nodes.new('ShaderNodeOutputWorld')
    out.location = (640, 0)

    bg = nodes.new('ShaderNodeBackground')
    bg.location = (380, 0)
    bg.inputs['Strength'].default_value = 1.15
    links.new(bg.outputs['Background'], out.inputs['Surface'])

    tc = nodes.new('ShaderNodeTexCoord')
    tc.location = (-560, 0)

    # Map world view-ray Z (-1..+1) -> rich fantasy sky gradient centered cleanly in camera view!
    sep = nodes.new('ShaderNodeSeparateXYZ')
    sep.location = (-380, 80)
    links.new(tc.outputs['Generated'], sep.inputs['Vector'])

    mrange = nodes.new('ShaderNodeMapRange')
    mrange.location = (-230, 80)
    mrange.inputs['From Min'].default_value = -0.35
    mrange.inputs['From Max'].default_value = 0.55
    mrange.inputs['To Min'].default_value = 0.0
    mrange.inputs['To Max'].default_value = 1.0
    links.new(sep.outputs['Z'], mrange.inputs['Value'])

    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.location = (-40, 120)
    cr = ramp.color_ramp
    cr.interpolation = 'B_SPLINE'
    cr.elements[0].position = 0.0
    cr.elements[0].color = hex_rgba('#355896')    # deep cloud-sea shadow below island
    cr.elements[1].position = 0.34
    cr.elements[1].color = hex_rgba('#9BC2EC')    # luminous lower sky mist
    e2 = cr.elements.new(0.46)
    e2.color = hex_rgba('#F9ECDC')                # soft warm golden-white cloud horizon
    e3 = cr.elements.new(0.62)
    e3.color = hex_rgba('#7BAFE8')                # airy mid fantasy sky
    e4 = cr.elements.new(0.84)
    e4.color = hex_rgba('#3D74C4')                # vibrant cerulean sky
    e5 = cr.elements.new(1.0)
    e5.color = hex_rgba('#1B3F87')                # regal deep azure zenith
    links.new(mrange.outputs['Result'], ramp.inputs['Fac'])

    # Subtle cloud wisps blended near horizon
    noise = nodes.new('ShaderNodeTexNoise')
    noise.location = (-340, -160)
    noise.inputs['Scale'].default_value = 4.2
    noise.inputs['Detail'].default_value = 6.0
    noise.inputs['Roughness'].default_value = 0.58
    links.new(tc.outputs['Generated'], noise.inputs['Vector'])

    mix = nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.location = (150, 40)
    mix.inputs['Factor'].default_value = 0.16
    links.new(ramp.outputs['Color'], mix.inputs['A'])
    links.new(noise.outputs['Fac'], mix.inputs['Factor'])
    mix.inputs['B'].default_value = hex_rgba('#F4F8FF')

    # Keep clouds gentle (multiply noise factor by 0.22)
    mul = nodes.new('ShaderNodeMath')
    mul.operation = 'MULTIPLY'
    mul.location = (-80, -140)
    mul.inputs[1].default_value = 0.22
    links.new(noise.outputs['Fac'], mul.inputs[0])
    links.new(mul.outputs['Value'], mix.inputs['Factor'])

    links.new(mix.outputs['Result'], bg.inputs['Color'])
    scene.world = w


def setup_lights(col):
    """Directional sunlit key + cool sky rim + localized faction atmosphere lights."""
    lights = []

    def add_sun(name, rot_deg, energy, rgb, angle_deg=2.8):
        ld = bpy.data.lights.new(name, 'SUN')
        ld.energy = energy
        ld.color = rgb
        ld.angle = math.radians(angle_deg)
        lo = bpy.data.objects.new(name, ld)
        lo.rotation_euler = tuple(math.radians(a) for a in rot_deg)
        col.objects.link(lo)
        lights.append(lo)
        return lo

    def add_point(name, loc, energy, rgb, radius=1.8):
        ld = bpy.data.lights.new(name, 'POINT')
        ld.energy = energy
        ld.color = rgb
        ld.shadow_soft_size = radius
        lo = bpy.data.objects.new(name, ld)
        lo.location = loc
        col.objects.link(lo)
        lights.append(lo)
        return lo

    # Warm golden sunlight casting crisp, appealing 3D shadows across all 4 castles
    add_sun('Light_Sun_Key', (44.0, 14.0, -34.0), energy=4.6, rgb=(1.0, 0.94, 0.84), angle_deg=2.6)
    # Cool cerulean sky fill from opposite azimuth so shadows stay vibrant & readable
    add_sun('Light_Sun_SkyFill', (52.0, -18.0, 142.0), energy=1.45, rgb=(0.66, 0.83, 1.0), angle_deg=8.0)
    # Soft upward cloud-sea bounce light so the sculpted floating island underside reads clearly
    add_sun('Light_Sun_CloudBounce', (155.0, 10.0, 25.0), energy=0.85, rgb=(0.76, 0.88, 1.0), angle_deg=18.0)

    # Neutral warm central plaza accent
    add_point('Light_Plaza_Warm', (0.0, 0.0, 5.2), energy=220.0, rgb=(1.0, 0.88, 0.66), radius=2.5)

    # Faction mood lights (matched cleanly to Tripo island pad heights!)
    tz_k = LAYOUT['castles']['kingdom']['terrace_z']
    tz_f = LAYOUT['castles']['forest']['terrace_z']
    tz_d = LAYOUT['castles']['demon']['terrace_z']
    tz_dr = LAYOUT['castles']['dragon']['terrace_z']
    ck = LAYOUT['castles']['kingdom']['center']
    cf = LAYOUT['castles']['forest']['center']
    cd = LAYOUT['castles']['demon']['center']
    cdr = LAYOUT['castles']['dragon']['center']

    add_point('Light_Kingdom_RoyalWarm', (0.0, ck[1] - 4.8, tz_k + 5.8), energy=480.0, rgb=(1.0, 0.92, 0.72), radius=2.2)
    add_point('Light_Kingdom_MeadowFill', (7.5, ck[1] + 2.2, tz_k + 6.8), energy=320.0, rgb=(1.0, 0.95, 0.80), radius=3.0)
    add_point('Light_Forest_Sanctuary', (cf[0] + 4.8, 0.0, tz_f + 2.6), energy=380.0, rgb=(1.0, 0.80, 0.42), radius=1.6)
    add_point('Light_Forest_CanopyWarm', (cf[0] + 3.2, 0.0, tz_f + 7.2), energy=320.0, rgb=(1.0, 0.92, 0.65), radius=2.6)
    add_point('Light_Demon_CrystalGlow', (cd[0], 0.0, tz_d + 11.8), energy=1550.0, rgb=(0.78, 0.28, 1.0), radius=1.8)
    add_point('Light_Demon_GateGlow', (cd[0] - 5.2, 0.0, tz_d + 3.4), energy=520.0, rgb=(0.74, 0.22, 1.0), radius=1.5)
    add_point('Light_Dragon_FurnaceGate', (0.0, cdr[1] + 5.2, tz_dr + 2.8), energy=950.0, rgb=(1.0, 0.44, 0.12), radius=1.6)
    add_point('Light_Dragon_KeepFlame', (0.0, cdr[1], tz_dr + 9.4), energy=780.0, rgb=(1.0, 0.50, 0.16), radius=2.2)

    return lights


def make_camera(name, loc, target, lens, col, clip_end=500.0):
    cd = bpy.data.cameras.new(name)
    cd.lens = lens
    cd.sensor_width = 36.0
    cd.clip_start = 0.2
    cd.clip_end = clip_end
    co = bpy.data.objects.new(name, cd)
    co.location = loc
    direction = Vector(target) - Vector(loc)
    # Use +Y up for straight top-down camera, standard Z up otherwise
    if abs(direction.normalized().z) > 0.995:
        co.rotation_euler = (0.0, 0.0, 0.0)
    else:
        co.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    col.objects.link(co)
    return co


def setup_cameras(col):
    """Create all 10 required cameras + unified orbit metadata for Three.js / home screen."""
    # Unified Home Faction Hero Camera Orbit Rule:
    # Orbit center = Central Plaza (0, 0, 0).
    # For faction in direction d = (dx, dy) with right-perp p = (dy, -dx):
    #   camera_pos = -d * R_BACK + p * R_SIDE + (0, 0, Z_CAM)
    #   target_pos =  d * TARGET_DIST + (0, 0, TARGET_Z)
    # R_BACK = 11.2, R_SIDE = 2.6 -> orbit radius = 11.50m (strictly inside opposite gate at 17.6m -> ZERO occlusion!).
    # Smooth 90-deg circular orbit around (0, 0, 0) transitions cleanly between all 4 factions!
    if USE_TRIPO_ISLAND:
        orbit_rule = {
            'orbit_center': [0.0, 0.0, 0.0],
            'r_back': 10.6,
            'r_side': 2.6,
            'orbit_radius': round(math.hypot(10.6, 2.6), 3),
            'cam_z': 8.2,
            'target_dist': 16.0,
            'target_z': 4.4,
            'lens_mm': 24.0,
            'sensor_width_mm': 36.0,
            'fov_h_deg_16x9': round(math.degrees(2.0 * math.atan(36.0 / (2.0 * 24.0))), 2),
            'notes': (
                'All 4 home faction cameras share a unified circular orbit (radius 10.914m, Z=8.2m) '
                'around Central Plaza (0,0,0), strictly inside the 14.4m castle entrance ring to prevent occlusion. '
                'Generous headroom above spires/canopy and foreground plaza margin support both 9:16 mobile and 16:9 desktop UI overlays.'
            ),
        }
        cam_specs = [
            ('Camera_Overview', (11.5, -96.0, 48.0), (0.0, 0.0, -11.0), 34.0, '4陣営全体斜め俯瞰'),
            ('Camera_Top', (0.0, 0.0, 122.0), (0.0, 0.0, 0.0), 40.0, '真上配置確認（上が北・王国）'),
            ('Camera_North', (0.0, 102.0, 18.0), (0.0, 0.0, -12.0), 33.0, '北側からの外観確認'),
            ('Camera_South', (0.0, -102.0, 18.0), (0.0, 0.0, -12.0), 33.0, '南側からの外観確認'),
            ('Camera_East', (102.0, 0.0, 18.0), (0.0, 0.0, -12.0), 33.0, '東側からの外観確認'),
            ('Camera_West', (-102.0, 0.0, 18.0), (0.0, 0.0, -12.0), 33.0, '西側からの外観確認'),
        ]
        tz_bias_map = {'kingdom': 0.85, 'forest': 1.25, 'demon': 0.55, 'dragon': -1.35}
    else:
        orbit_rule = {
            'orbit_center': [0.0, 0.0, 0.0],
            'r_back': 12.8,
            'r_side': 3.2,
            'orbit_radius': round(math.hypot(12.8, 3.2), 3),
            'cam_z': 11.4,
            'target_dist': 16.5,
            'target_z': 7.2,
            'lens_mm': 23.2,
            'sensor_width_mm': 36.0,
            'fov_h_deg_16x9': round(math.degrees(2.0 * math.atan(36.0 / (2.0 * 23.2))), 2),
            'notes': (
                'All 4 home faction cameras share an identical circular orbit (radius 13.194m, Z=11.4m) '
                'around Central Plaza (0,0,0), strictly inside the 17.6m gate radius of opposite castles to prevent occlusion. '
                'Generous headroom above spires/canopy and foreground plaza margin support both 9:16 mobile and 16:9 desktop UI overlays.'
            ),
        }
        cam_specs = [
            ('Camera_Overview', (11.0, -76.0, 48.0), (0.0, 0.5, -1.0), 34.0, '4陣営全体斜め俯瞰'),
            ('Camera_Top', (0.0, 0.0, 126.0), (0.0, 0.0, 0.0), 40.0, '真上配置確認（上が北・王国）'),
            ('Camera_North', (0.0, 80.0, 24.0), (0.0, 0.0, -0.8), 34.0, '北側からの外観確認'),
            ('Camera_South', (0.0, -80.0, 24.0), (0.0, 0.0, -0.8), 34.0, '南側からの外観確認'),
            ('Camera_East', (80.0, 0.0, 24.0), (0.0, 0.0, -0.8), 34.0, '東側からの外観確認'),
            ('Camera_West', (-80.0, 0.0, 24.0), (0.0, 0.0, -0.8), 34.0, '西側からの外観確認'),
        ]
        tz_bias_map = {'kingdom': 0.85, 'forest': 1.05, 'demon': 0.55, 'dragon': -0.85}

    faction_labels = {
        'kingdom': ('Camera_Kingdom', '王国（北）ホーム主役カメラ'),
        'forest': ('Camera_Forest', '森の同盟（西）ホーム主役カメラ'),
        'demon': ('Camera_Demon', '魔族軍（東）ホーム主役カメラ'),
        'dragon': ('Camera_Dragon', '竜族帝国（南）ホーム主役カメラ'),
    }

    for key in ('kingdom', 'forest', 'demon', 'dragon'):
        dx, dy = LAYOUT['castles'][key]['dir']
        px, py = dy, -dx  # right perpendicular when facing d
        loc = (
            round(-dx * orbit_rule['r_back'] + px * orbit_rule['r_side'], 3),
            round(-dy * orbit_rule['r_back'] + py * orbit_rule['r_side'], 3),
            orbit_rule['cam_z'],
        )
        tz_bias = tz_bias_map[key]
        tgt = (
            round(dx * orbit_rule['target_dist'], 3),
            round(dy * orbit_rule['target_dist'], 3),
            round(orbit_rule['target_z'] + tz_bias, 3),
        )
        cname, desc = faction_labels[key]
        cam_specs.append((cname, loc, tgt, orbit_rule['lens_mm'], desc))

    created = {}
    cam_json = {'orbit_rule': orbit_rule, 'cameras': {}}

    for cname, loc, tgt, lens, desc in cam_specs:
        obj = make_camera(cname, loc, tgt, lens, col)
        created[cname] = obj
        # Also provide glTF / Three.js Y-up coordinates: (x, y, z)_three = (x, z, -y)_blender
        cam_json['cameras'][cname] = {
            'description': desc,
            'blender_z_up': {
                'location': list(loc),
                'target': list(tgt),
                'rotation_euler_deg': [round(math.degrees(a), 2) for a in obj.rotation_euler],
            },
            'threejs_y_up': {
                'position': [loc[0], loc[2], -loc[1]],
                'target': [tgt[0], tgt[2], -tgt[1]],
            },
            'lens_mm': lens,
            'sensor_width_mm': 36.0,
        }

    return created, cam_json


def configure_render_settings(scene):
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'GPU'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'OPTIX'
        prefs.get_devices()
        for d in prefs.devices:
            d.use = (d.type == 'OPTIX')
    except Exception:
        scene.cycles.device = 'CPU'
    scene.cycles.samples = 64
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 8
    scene.cycles.diffuse_bounces = 4
    scene.cycles.glossy_bounces = 4
    scene.cycles.transmission_bounces = 6
    scene.cycles.transparent_max_bounces = 8

    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'

    # AgX filmic tone mapping for crisp fantasy colors & clean glow highlights
    try:
        scene.view_settings.view_transform = 'AgX'
        scene.view_settings.look = 'AgX - Medium High Contrast'
    except Exception:
        pass
    scene.view_settings.exposure = 0.18

    # Subtle fantasy Bloom / Fog Glow in Blender 5.3 Compositor (does not affect .glb)
    try:
        nt = bpy.data.node_groups.new('Diorama_Compositor', 'CompositorNodeTree')
        nt.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
        scene.compositing_node_group = nt
        rl = nt.nodes.new('CompositorNodeRLayers')
        rl.location = (-280, 0)
        glare = nt.nodes.new('CompositorNodeGlare')
        glare.location = (60, 0)
        try:
            glare.inputs['Type'].default_value = 'Bloom'
        except Exception:
            glare.inputs['Type'].default_value = 'Fog Glow'
        glare.inputs['Quality'].default_value = 'High'
        glare.inputs['Threshold'].default_value = 1.45
        glare.inputs['Strength'].default_value = 0.28
        glare.inputs['Size'].default_value = 0.65
        out = nt.nodes.new('NodeGroupOutput')
        out.location = (380, 0)
        nt.links.new(rl.outputs['Image'], glare.inputs['Image'])
        nt.links.new(glare.outputs['Image'], out.inputs['Image'])
        print('Compositor Bloom enabled cleanly!')
    except Exception as e:
        print('Compositor bloom note:', e)


def world_bbox(objs):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        if o.type != 'MESH':
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo.x, lo.y, lo.z = min(lo.x, w.x), min(lo.y, w.y), min(lo.z, w.z)
            hi.x, hi.y, hi.z = max(hi.x, w.x), max(hi.y, w.y), max(hi.z, w.z)
    return [round(lo.x, 3), round(lo.y, 3), round(lo.z, 3)], [round(hi.x, 3), round(hi.y, 3), round(hi.z, 3)]


def export_metadata(scene, cam_json, mats):
    bpy.context.view_layer.update()

    # 1. cameras.json
    (CONFIG_DIR / 'cameras.json').write_text(json.dumps(cam_json, ensure_ascii=False, indent=2), encoding='utf-8')

    # 2. coordinates.json
    coords = {
        'coordinate_system': {
            'blender': 'Z-up, 1 unit = 1m, North = +Y, South = -Y, East = +X, West = -X',
            'threejs_glb': 'Y-up (exported with export_yup=True): (x, y, z)_three = (x, z, -y)_blender',
        },
        'central_plaza': {
            'center': [0.0, 0.0, 0.0],
            'radius_m': LAYOUT['plaza_radius'],
            'status': 'Neutral zone (no faction flags or crests)',
        },
        'hydrology': {
            'water_level_z': LAYOUT['water_z'],
            'ring_moat_radius_m': [LAYOUT['moat_inner'], LAYOUT['moat_outer']],
            'diagonal_waterfalls_deg': [45, 135, 225, 315],
        },
        'factions': {},
    }

    col_map = {
        'kingdom': 'Castle_Kingdom',
        'forest': 'Castle_Forest',
        'demon': 'Castle_Demon',
        'dragon': 'Castle_Dragon',
    }
    cardinal_jp = {
        'kingdom': '北 (+Y) / 王国',
        'forest': '西 (-X) / 森の同盟',
        'demon': '東 (+X) / 魔族軍',
        'dragon': '南 (-Y) / 竜族帝国',
    }
    for key, cfg in LAYOUT['castles'].items():
        col_objs = list(bpy.data.collections[col_map[key]].objects)
        lo, hi = world_bbox(col_objs)
        coords['factions'][key] = {
            'label': cardinal_jp[key],
            'collection': col_map[key],
            'center': list(cfg['center']),
            'gate_entrance': list(cfg['gate_pos']),
            'facing_vector': list(cfg['facing']),
            'terrace_z': cfg['terrace_z'],
            'world_bbox_min': lo,
            'world_bbox_max': hi,
            'size_xyz_m': [round(hi[i] - lo[i], 3) for i in range(3)],
        }

    all_meshes = [o for o in scene.objects if o.type == 'MESH']
    lo_all, hi_all = world_bbox(all_meshes)
    coords['overall_diorama_bounds'] = {
        'min_xyz': lo_all,
        'max_xyz': hi_all,
        'size_xyz_m': [round(hi_all[i] - lo_all[i], 3) for i in range(3)],
    }
    (CONFIG_DIR / 'coordinates.json').write_text(json.dumps(coords, ensure_ascii=False, indent=2), encoding='utf-8')

    # 3. assets_materials.json
    collections_info = {}
    total_polys = 0
    total_tris = 0
    for col in bpy.data.collections:
        c_meshes = [o for o in col.objects if o.type == 'MESH']
        polys = sum(len(o.data.polygons) for o in c_meshes)
        tris = sum(sum(max(1, len(p.vertices) - 2) for p in o.data.polygons) for o in c_meshes)
        total_polys += polys
        total_tris += tris
        collections_info[col.name] = {
            'object_count': len(col.objects),
            'mesh_count': len(c_meshes),
            'polygons': polys,
            'triangles': tris,
            'objects': [o.name for o in col.objects],
        }

    used_mat_names = {s.material.name for o in all_meshes for s in o.material_slots if s.material}
    mats_info = {}
    for m in sorted(bpy.data.materials, key=lambda x: x.name):
        if m.name not in used_mat_names:
            continue
        bsdf = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None) if m.use_nodes else None
        has_vcol = any(n.type == 'VERTEX_COLOR' for n in m.node_tree.nodes) if m.use_nodes else False
        has_tex = any(n.type == 'TEX_IMAGE' for n in m.node_tree.nodes) if m.use_nodes else False
        mats_info[m.name] = {
            'source': 'Tripo Studio PBR (optimized + synthesized emissive)' if has_tex else 'Procedural Blender PBR',
            'uses_image_textures': has_tex,
            'uses_vertex_color': has_vcol,
            'metallic': round(bsdf.inputs['Metallic'].default_value, 3) if bsdf else 0.0,
            'roughness': round(bsdf.inputs['Roughness'].default_value, 3) if bsdf else 0.5,
            'emission_strength': round(bsdf.inputs['Emission Strength'].default_value, 3) if bsdf else 0.0,
            'alpha': round(bsdf.inputs['Alpha'].default_value, 3) if bsdf else 1.0,
        }

    inventory = {
        'summary': {
            'total_objects': len(scene.objects),
            'total_meshes': len(all_meshes),
            'total_polygons': total_polys,
            'total_triangles': total_tris,
            'total_materials': len(mats_info),
            'external_assets_used': (
                'Tripo Studio 3D sculpted PBR assets (4 faction hero castles + 4-biome floating island base, '
                'decimated & texture-baked with synthesized emissive maps via prepare_tripo_castles.py / prepare_tripo_island.py) '
                '+ procedural Blender lanterns, bollards, waterfall mist, fireflies, clouds, lighting & 10-camera rig.'
                if USE_TRIPO_ISLAND else
                'None (100% original procedural Blender Python meshes & PBR materials)'
            ),
        },
        'collections': collections_info,
        'materials': mats_info,
    }
    (CONFIG_DIR / 'assets_materials.json').write_text(json.dumps(inventory, ensure_ascii=False, indent=2), encoding='utf-8')
    return inventory


def build_all():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = 'CastleField_Diorama'

    # Required 13 logical collections
    col_names = [
        'Island_Base',
        'Central_Plaza',
        'Roads',
        'Bridges',
        'Water',
        'Nature',
        'Castle_Kingdom',
        'Castle_Forest',
        'Castle_Demon',
        'Castle_Dragon',
        'Props',
        'Lights',
        'Cameras',
    ]
    cols = {n: ensure_collection(n) for n in col_names}

    mats = build_material_library()

    # Build terrain & infrastructure (Tripo sculpted floating island if available, else procedural!)
    if USE_TRIPO_ISLAND:
        build_tripo_island_scene(cols, mats)
    else:
        build_island_base(cols['Island_Base'], mats)
        build_central_plaza(cols['Central_Plaza'], mats)
        build_bridges(cols['Bridges'], mats)
        build_roads(cols['Roads'], mats)
        build_water(cols['Water'], mats)

    # Build 4 distinct faction castles (imports optimized Tripo PBR+Emissive castles!)
    build_castle_kingdom(cols['Castle_Kingdom'], mats)
    build_castle_forest(cols['Castle_Forest'], mats)
    build_castle_demon(cols['Castle_Demon'], mats)
    build_castle_dragon(cols['Castle_Dragon'], mats)

    # Build nature & props (harmonized with Tripo island!)
    if USE_TRIPO_ISLAND:
        build_tripo_props_only(cols['Props'], cols['Nature'], mats)
    else:
        build_nature(cols['Nature'], mats)
        build_props(cols['Props'], mats)

    # World, lighting, cameras & render settings
    setup_world(scene)
    setup_lights(cols['Lights'])
    cams, cam_json = setup_cameras(cols['Cameras'])
    scene.camera = cams['Camera_Overview']
    configure_render_settings(scene)

    # Metadata JSONs
    inventory = export_metadata(scene, cam_json, mats)

    # Save editable .blend (pack all Tripo PBR + Normal + Emissive textures inside .blend!)
    try:
        bpy.ops.file.pack_all()
    except Exception:
        pass
    blend_path = DIORAMA_DIR / 'castle_field_diorama.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))

    # Export WebGL-ready .glb (Y-up, JPEG compressed PBR textures for fast mobile web load!)
    glb_path = DIORAMA_DIR / 'castle_field_diorama.glb'
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path),
        export_format='GLB',
        export_yup=True,
        export_apply=True,
        export_cameras=True,
        export_lights=True,
        export_materials='EXPORT',
        export_image_format='JPEG',
        export_image_quality=88,
        export_draco_mesh_compression_enable=False,
    )

    glb_kb = glb_path.stat().st_size / 1024.0
    print(f'BUILD_DIORAMA_OK blend={blend_path.name} glb={glb_path.name} ({glb_kb:.1f} KB) '
          f'meshes={inventory["summary"]["total_meshes"]} tris={inventory["summary"]["total_triangles"]}')


if __name__ == '__main__':
    build_all()
