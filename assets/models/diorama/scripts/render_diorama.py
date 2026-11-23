"""Render all 10 mandatory views, mobile 9:16 framing previews, and 4-faction orbit turntable
from the EXACT same castle_field_diorama.blend scene.

Usage:
  "C:\\Program Files\\Blender Foundation\\Blender 5.3\\blender.exe" --background assets/models/diorama/castle_field_diorama.blend --python assets/models/diorama/scripts/render_diorama.py -- [--preview] [--skip-turntable]
"""

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

SCRIPT_DIR = Path(__file__).resolve().parent
DIORAMA_DIR = SCRIPT_DIR.parent
RENDER_DIR = DIORAMA_DIR / 'renders'
RENDER_DIR.mkdir(parents=True, exist_ok=True)

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PREVIEW = '--preview' in argv
SKIP_TURNTABLE = '--skip-turntable' in argv
TURNTABLE_ONLY = '--turntable-only' in argv

MANDATORY_VIEWS = [
    ('01_overview.png', 'Camera_Overview'),
    ('02_top.png', 'Camera_Top'),
    ('03_north.png', 'Camera_North'),
    ('04_south.png', 'Camera_South'),
    ('05_east.png', 'Camera_East'),
    ('06_west.png', 'Camera_West'),
    ('07_home_kingdom.png', 'Camera_Kingdom'),
    ('08_home_forest.png', 'Camera_Forest'),
    ('09_home_demon.png', 'Camera_Demon'),
    ('10_home_dragon.png', 'Camera_Dragon'),
]


def setup_gpu(scene, samples):
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
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True


def render_mandatory_views(scene):
    scene.render.image_settings.file_format = 'PNG'
    if PREVIEW:
        scene.render.resolution_x = 960
        scene.render.resolution_y = 540
        setup_gpu(scene, samples=24)
    else:
        scene.render.resolution_x = 1280
        scene.render.resolution_y = 720
        setup_gpu(scene, samples=96)

    for fname, cam_name in MANDATORY_VIEWS:
        cam = bpy.data.objects.get(cam_name)
        if cam is None:
            raise RuntimeError(f'Missing required camera: {cam_name}')
        scene.camera = cam
        out_path = RENDER_DIR / fname
        scene.render.filepath = str(out_path)
        bpy.ops.render.render(write_still=True)
        print(f'RENDERED {fname} ({cam_name})')


def render_mobile_portrait_samples(scene):
    """Render 9:16 mobile portrait previews of the 4 faction home cameras to verify UI safe framing."""
    scene.render.image_settings.file_format = 'PNG'
    scene.render.resolution_x = 540 if PREVIEW else 720
    scene.render.resolution_y = 960 if PREVIEW else 1280
    setup_gpu(scene, samples=20 if PREVIEW else 64)

    for fname, cam_name in [
        ('mobile_01_kingdom_9x16.png', 'Camera_Kingdom'),
        ('mobile_02_forest_9x16.png', 'Camera_Forest'),
        ('mobile_03_demon_9x16.png', 'Camera_Demon'),
        ('mobile_04_dragon_9x16.png', 'Camera_Dragon'),
    ]:
        cam = bpy.data.objects[cam_name]
        orig_fit = cam.data.sensor_fit
        # Auto/Vertical fit keeps comfortable wide vertical framing on phone screens!
        cam.data.sensor_fit = 'VERTICAL'
        scene.camera = cam
        scene.render.filepath = str(RENDER_DIR / fname)
        bpy.ops.render.render(write_still=True)
        cam.data.sensor_fit = orig_fit
        print(f'RENDERED_MOBILE {fname}')


def render_turntable_video(scene):
    """Render a smooth 360-degree 4-faction home-camera orbit transition MP4 video!"""
    import json
    cam_cfg = json.loads((DIORAMA_DIR / 'config' / 'cameras.json').read_text(encoding='utf-8'))
    orb = cam_cfg['orbit_rule']

    cd = bpy.data.cameras.new('Cam_Turntable_Temp')
    cd.lens = orb['lens_mm']
    cd.sensor_width = orb['sensor_width_mm']
    cd.clip_end = 500.0
    co = bpy.data.objects.new('Cam_Turntable_Temp', cd)
    bpy.context.scene.collection.objects.link(co)
    scene.camera = co

    n_frames = 96
    scene.frame_start = 1
    scene.frame_end = n_frames
    scene.render.fps = 24
    scene.render.resolution_x = 960
    scene.render.resolution_y = 540
    setup_gpu(scene, samples=24)

    r_back = orb['r_back']
    r_side = orb['r_side']
    cam_z = orb['cam_z']
    tgt_dist = orb['target_dist']
    base_tgt_z = orb['target_z']

    # Start at Kingdom (dir = +Y -> angle 90 deg), orbit CCW through West (180), South (270), East (360), back to North (450)
    for f in range(1, n_frames + 1):
        t = (f - 1) / n_frames
        ang = math.radians(90.0 + 360.0 * t)
        dx, dy = math.cos(ang), math.sin(ang)
        px, py = dy, -dx
        # Smooth C1 per-faction vertical framing match across all 4 hero castles
        tz_bias = (
            (max(0.0, dy) ** 2) * 0.85
            + (max(0.0, -dx) ** 2) * 1.25
            + (max(0.0, dx) ** 2) * 0.55
            + (max(0.0, -dy) ** 2) * (-1.35)
        )
        loc = Vector((-dx * r_back + px * r_side, -dy * r_back + py * r_side, cam_z))
        tgt = Vector((dx * tgt_dist, dy * tgt_dist, base_tgt_z + tz_bias))
        co.location = loc
        co.rotation_euler = (tgt - loc).to_track_quat('-Z', 'Y').to_euler()
        co.keyframe_insert(data_path='location', frame=f)
        co.keyframe_insert(data_path='rotation_euler', frame=f)

    # Configure FFMPEG MP4 output (Blender 5.3 requires media_type = 'VIDEO' first!)
    if hasattr(scene.render.image_settings, 'media_type'):
        scene.render.image_settings.media_type = 'VIDEO'
    scene.render.image_settings.file_format = 'FFMPEG'
    scene.render.ffmpeg.format = 'MPEG4'
    scene.render.ffmpeg.codec = 'H264'
    scene.render.ffmpeg.constant_rate_factor = 'MEDIUM'
    scene.render.ffmpeg.ffmpeg_preset = 'GOOD'
    mp4_path = RENDER_DIR / 'turntable_4factions.mp4'
    scene.render.filepath = str(mp4_path)

    bpy.ops.render.render(animation=True)
    print(f'RENDERED_TURNTABLE {mp4_path.name}')

    # Reset media_type back to IMAGE cleanly
    if hasattr(scene.render.image_settings, 'media_type'):
        scene.render.image_settings.media_type = 'IMAGE'
    scene.render.image_settings.file_format = 'PNG'

    # Cleanup temp camera (never save over .blend)
    bpy.data.objects.remove(co, do_unlink=True)
    bpy.data.cameras.remove(cd, do_unlink=True)


def render_turntable_contact_sheet(scene):
    """Render an 8-angle (every 45 deg) overview turntable contact sheet image (2x4 grid)."""
    import numpy as np

    cd = bpy.data.cameras.new('Cam_Sheet_Temp')
    cd.lens = 34.0
    cd.sensor_width = 36.0
    cd.clip_end = 500.0
    co = bpy.data.objects.new('Cam_Sheet_Temp', cd)
    bpy.context.scene.collection.objects.link(co)
    scene.camera = co

    tw, th = 480, 320
    scene.render.image_settings.file_format = 'PNG'
    scene.render.resolution_x = tw
    scene.render.resolution_y = th
    setup_gpu(scene, samples=24)

    tiles = []
    radius = 100.0
    cam_z = 36.0
    tgt = Vector((0.0, 0.0, -11.5))
    tmp_tile = RENDER_DIR / '_tmp_tile.png'

    for i in range(8):
        # Start from South (-90 deg) and step 45 deg CCW around the island
        ang = math.radians(-90.0 + 45.0 * i)
        loc = Vector((radius * math.cos(ang), radius * math.sin(ang), cam_z))
        co.location = loc
        co.rotation_euler = (tgt - loc).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = str(tmp_tile)
        bpy.ops.render.render(write_still=True)

        img = bpy.data.images.load(str(tmp_tile), check_existing=False)
        arr = np.array(img.pixels[:], dtype=np.float32).reshape((th, tw, 4))
        tiles.append(arr)
        bpy.data.images.remove(img)

    if tmp_tile.exists():
        tmp_tile.unlink()

    # Assemble 2 rows x 4 cols (Blender image origin is bottom-left!)
    row_top = np.concatenate(tiles[0:4], axis=1)
    row_bot = np.concatenate(tiles[4:8], axis=1)
    sheet_arr = np.concatenate([row_bot, row_top], axis=0)

    sheet_img = bpy.data.images.new('Turntable_Sheet', width=tw * 4, height=th * 2, alpha=True)
    sheet_img.pixels.foreach_set(sheet_arr.ravel())
    sheet_path = RENDER_DIR / 'turntable_sheet.png'
    sheet_img.filepath_raw = str(sheet_path)
    sheet_img.file_format = 'PNG'
    sheet_img.save()
    bpy.data.images.remove(sheet_img)
    print(f'RENDERED_SHEET {sheet_path.name}')

    bpy.data.objects.remove(co, do_unlink=True)
    bpy.data.cameras.remove(cd, do_unlink=True)


def main():
    scene = bpy.context.scene
    if TURNTABLE_ONLY:
        render_turntable_video(scene)
        print('ALL_RENDERS_DONE')
        return
    render_mandatory_views(scene)
    if not PREVIEW:
        render_mobile_portrait_samples(scene)
    if not SKIP_TURNTABLE and not PREVIEW:
        render_turntable_contact_sheet(scene)
        render_turntable_video(scene)
    print('ALL_RENDERS_DONE')


if __name__ == '__main__':
    main()
