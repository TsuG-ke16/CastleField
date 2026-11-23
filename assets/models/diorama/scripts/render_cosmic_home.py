"""Render all 4 Cosmic Time-of-Day phases x 5 Hero Views (20 lightweight WebP images)
from castle_field_diorama.blend for Castle Field's Default High-Quality Lightweight Home Mode.

Usage:
  "C:\\Program Files\\Blender Foundation\\Blender 5.3\\blender.exe" --background assets/models/diorama/castle_field_diorama.blend --python assets/models/diorama/scripts/render_cosmic_home.py
"""

import math
from pathlib import Path
import bpy

SCRIPT_DIR = Path(__file__).resolve().parent
DIORAMA_DIR = SCRIPT_DIR.parent
OUT_DIR = DIORAMA_DIR / 'cosmic_home'
OUT_DIR.mkdir(parents=True, exist_ok=True)

COSMIC_PHASES = {
    'dawn': {
        'abyss': (0.005, 0.009, 0.022, 1.0),
        'horizon': (0.055, 0.052, 0.115, 1.0),
        'mid': (0.018, 0.032, 0.078, 1.0),
        'zenith': (0.006, 0.011, 0.032, 1.0),
        'nebula': (0.14, 0.095, 0.16, 1.0),
        'neb_fac': 0.58,
        'star_mul': 0.62,
        'sun_rot': (66.0, 14.0, -52.0),
        'sun_col': (1.0, 0.84, 0.72),
        'sun_energy': 2.15,
        'fill_col': (0.52, 0.68, 1.0),
        'fill_energy': 0.68,
        'bounce_col': (0.34, 0.48, 0.86),
        'bounce_energy': 0.44,
        'point_mul': 1.05,
        'emissive_mul': 1.25,
        'bloom_strength': 0.36,
        'exposure': 0.22,
    },
    'day': {
        'abyss': (0.006, 0.014, 0.036, 1.0),
        'horizon': (0.032, 0.088, 0.195, 1.0),
        'mid': (0.016, 0.048, 0.125, 1.0),
        'zenith': (0.007, 0.018, 0.055, 1.0),
        'nebula': (0.075, 0.145, 0.24, 1.0),
        'neb_fac': 0.46,
        'star_mul': 0.32,
        'sun_rot': (46.0, 12.0, -34.0),
        'sun_col': (0.96, 0.98, 1.0),
        'sun_energy': 3.35,
        'fill_col': (0.60, 0.80, 1.0),
        'fill_energy': 0.95,
        'bounce_col': (0.42, 0.64, 0.95),
        'bounce_energy': 0.58,
        'point_mul': 0.75,
        'emissive_mul': 0.95,
        'bloom_strength': 0.28,
        'exposure': 0.24,
    },
    'dusk': {
        'abyss': (0.005, 0.004, 0.014, 1.0),
        'horizon': (0.125, 0.038, 0.068, 1.0),
        'mid': (0.034, 0.018, 0.058, 1.0),
        'zenith': (0.007, 0.006, 0.022, 1.0),
        'nebula': (0.21, 0.072, 0.095, 1.0),
        'neb_fac': 0.68,
        'star_mul': 0.78,
        'sun_rot': (70.0, -16.0, 52.0),
        'sun_col': (1.0, 0.62, 0.38),
        'sun_energy': 2.25,
        'fill_col': (0.48, 0.42, 0.92),
        'fill_energy': 0.66,
        'bounce_col': (0.36, 0.24, 0.58),
        'bounce_energy': 0.42,
        'point_mul': 1.42,
        'emissive_mul': 1.55,
        'bloom_strength': 0.44,
        'exposure': 0.22,
    },
    'night': {
        'abyss': (0.002, 0.003, 0.010, 1.0),
        'horizon': (0.012, 0.024, 0.055, 1.0),
        'mid': (0.006, 0.012, 0.032, 1.0),
        'zenith': (0.002, 0.003, 0.009, 1.0),
        'nebula': (0.048, 0.078, 0.155, 1.0),
        'neb_fac': 0.64,
        'star_mul': 1.0,
        'sun_rot': (52.0, 18.0, -42.0),
        'sun_col': (0.68, 0.80, 1.0),
        'sun_energy': 1.38,
        'fill_col': (0.42, 0.56, 0.92),
        'fill_energy': 0.54,
        'bounce_col': (0.28, 0.44, 0.82),
        'bounce_energy': 0.38,
        'point_mul': 1.72,
        'emissive_mul': 1.80,
        'bloom_strength': 0.48,
        'exposure': 0.26,
    },
}

VIEWS = [
    ('overview', 'Camera_Overview', 34.0),
    ('kingdom', 'Camera_Kingdom', 25.0),
    ('forest', 'Camera_Forest', 25.0),
    ('demon', 'Camera_Demon', 25.0),
    ('dragon', 'Camera_Dragon', 25.0),
]


def build_cosmic_world(cfg):
    w = bpy.data.worlds.new('World_Cosmic_Phase')
    w.use_nodes = True
    nt = w.node_tree
    nodes = nt.nodes
    links = nt.links
    nodes.clear()

    out = nodes.new('ShaderNodeOutputWorld')
    bg = nodes.new('ShaderNodeBackground')
    bg.inputs['Strength'].default_value = 1.0
    links.new(bg.outputs['Background'], out.inputs['Surface'])

    tc = nodes.new('ShaderNodeTexCoord')
    sep = nodes.new('ShaderNodeSeparateXYZ')
    links.new(tc.outputs['Generated'], sep.inputs['Vector'])

    mrange = nodes.new('ShaderNodeMapRange')
    mrange.inputs['From Min'].default_value = -0.55
    mrange.inputs['From Max'].default_value = 0.65
    links.new(sep.outputs['Z'], mrange.inputs['Value'])

    grad = nodes.new('ShaderNodeValToRGB')
    cr = grad.color_ramp
    cr.interpolation = 'B_SPLINE'
    cr.elements[0].position = 0.0
    cr.elements[0].color = cfg['abyss']
    cr.elements[1].position = 0.42
    cr.elements[1].color = cfg['horizon']
    e2 = cr.elements.new(0.72)
    e2.color = cfg['mid']
    e3 = cr.elements.new(1.0)
    e3.color = cfg['zenith']
    links.new(mrange.outputs['Result'], grad.inputs['Fac'])

    mapping_neb = nodes.new('ShaderNodeMapping')
    mapping_neb.inputs['Rotation'].default_value = (0.4, 0.35, 0.25)
    mapping_neb.inputs['Scale'].default_value = (1.6, 3.8, 1.8)
    links.new(tc.outputs['Generated'], mapping_neb.inputs['Vector'])

    neb_noise = nodes.new('ShaderNodeTexNoise')
    neb_noise.inputs['Scale'].default_value = 2.8
    neb_noise.inputs['Detail'].default_value = 7.0
    neb_noise.inputs['Roughness'].default_value = 0.62
    links.new(mapping_neb.outputs['Vector'], neb_noise.inputs['Vector'])

    neb_ramp = nodes.new('ShaderNodeValToRGB')
    neb_ramp.color_ramp.elements[0].position = 0.48
    neb_ramp.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
    neb_ramp.color_ramp.elements[1].position = 0.82
    neb_ramp.color_ramp.elements[1].color = cfg['nebula']
    links.new(neb_noise.outputs['Fac'], neb_ramp.inputs['Fac'])

    mix_neb = nodes.new('ShaderNodeMix')
    mix_neb.data_type = 'RGBA'
    mix_neb.blend_type = 'ADD'
    mix_neb.inputs['Factor'].default_value = cfg['neb_fac']
    links.new(grad.outputs['Color'], mix_neb.inputs['A'])
    links.new(neb_ramp.outputs['Color'], mix_neb.inputs['B'])

    # Subtle background pinpoint stars
    vor = nodes.new('ShaderNodeTexVoronoi')
    vor.inputs['Scale'].default_value = 140.0
    links.new(tc.outputs['Generated'], vor.inputs['Vector'])

    star_ramp = nodes.new('ShaderNodeValToRGB')
    sm = cfg['star_mul']
    star_ramp.color_ramp.elements[0].position = 0.0
    star_ramp.color_ramp.elements[0].color = (0.85 * sm, 0.92 * sm, 1.1 * sm, 1.0)
    star_ramp.color_ramp.elements[1].position = 0.045
    star_ramp.color_ramp.elements[1].color = (0.0, 0.0, 0.0, 1.0)
    links.new(vor.outputs['Distance'], star_ramp.inputs['Fac'])

    mix_st = nodes.new('ShaderNodeMix')
    mix_st.data_type = 'RGBA'
    mix_st.blend_type = 'ADD'
    mix_st.inputs['Factor'].default_value = 1.0
    links.new(mix_neb.outputs['Result'], mix_st.inputs['A'])
    links.new(star_ramp.outputs['Color'], mix_st.inputs['B'])

    links.new(mix_st.outputs['Result'], bg.inputs['Color'])
    return w


def main():
    scene = bpy.context.scene

    # Hide daytime floating clouds in cosmic void
    clouds = bpy.data.objects.get('Props_Floating_Cloud_Ring')
    if clouds:
        clouds.hide_render = True

    # Snapshot baseline point-light energies & material emission strengths
    base_points = {}
    for o in scene.objects:
        if o.type == 'LIGHT' and o.data.type == 'POINT':
            base_points[o.name] = o.data.energy

    base_emissive = {}
    for m in bpy.data.materials:
        if not m.use_nodes:
            continue
        bsdf = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if bsdf and bsdf.inputs['Emission Strength'].default_value > 0.5:
            base_emissive[m.name] = bsdf.inputs['Emission Strength'].default_value

    # Configure GPU OPTIX + fast high-quality WebP output
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

    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.render.film_transparent = True
    scene.render.resolution_x = 960
    scene.render.resolution_y = 960
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'WEBP'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.quality = 86

    for phase, cfg in COSMIC_PHASES.items():
        old_w = scene.world
        scene.world = build_cosmic_world(cfg)
        if old_w and old_w.name.startswith('World_Cosmic_Phase'):
            bpy.data.worlds.remove(old_w)

        for o in scene.objects:
            if o.type != 'LIGHT':
                continue
            if o.name == 'Light_Sun_Key':
                o.data.energy = cfg['sun_energy']
                o.data.color = cfg['sun_col']
                o.rotation_euler = tuple(math.radians(a) for a in cfg['sun_rot'])
            elif o.name == 'Light_Sun_SkyFill':
                o.data.energy = cfg['fill_energy']
                o.data.color = cfg['fill_col']
            elif o.name == 'Light_Sun_CloudBounce':
                o.data.energy = cfg['bounce_energy']
                o.data.color = cfg['bounce_col']
            elif o.name in base_points:
                o.data.energy = base_points[o.name] * cfg['point_mul']

        for mname, bval in base_emissive.items():
            m = bpy.data.materials.get(mname)
            if m and m.use_nodes:
                bsdf = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
                if bsdf:
                    bsdf.inputs['Emission Strength'].default_value = bval * cfg['emissive_mul']

        if scene.compositing_node_group:
            for n in scene.compositing_node_group.nodes:
                if n.type == 'GLARE':
                    n.inputs['Threshold'].default_value = 1.05
                    n.inputs['Strength'].default_value = cfg['bloom_strength']
                    n.inputs['Size'].default_value = 0.74

        scene.view_settings.exposure = cfg['exposure']

        for vname, cam_name, lens_mm in VIEWS:
            cam = bpy.data.objects[cam_name]
            orig_lens = cam.data.lens
            cam.data.lens = lens_mm
            scene.camera = cam
            out_file = OUT_DIR / f'{phase}_{vname}.webp'
            scene.render.filepath = str(out_file)
            bpy.ops.render.render(write_still=True)
            cam.data.lens = orig_lens
            kb = out_file.stat().st_size / 1024.0
            print(f'COSMIC_HOME_OK {out_file.name} ({kb:.1f} KB)')

    print('ALL_COSMIC_HOME_DONE')


if __name__ == '__main__':
    main()
