"""
CastleField v2 - Phase 8 power-saver (Lite) prerenders.

Renders transparent WebP sprites from the exact same GLB files and camera
parameters that the Three.js scenes use, so the Lite (2D) mode looks like the
3D mode without starting WebGL or downloading three.js:

  assets/v2/renders/battle-<stage>.webp   1600x800  (battle camera: three pos (0,18.2,16.5) -> origin, vertical FOV 44)
  assets/v2/renders/home-portrait.webp     780x1300 (home diorama, portrait camera rig)
  assets/v2/renders/home-landscape.webp   1600x900  (home diorama, landscape camera rig)
  assets/v2/renders/chest-open-00..11.webp 400x400  (gacha chest ChestOpen animation, 12 frames)

Run:
  blender --background --python assets/v2/blender/render_power_saver_sprites.py
  cd web && node scripts/finalize-lite-renders.mjs   # 200% PNG -> 100% WebP

Coordinate note: glTF import converts three.js Y-up (x, y, z) into Blender
Z-up (x, -z, y). All camera positions below are written in three.js space and
converted with three_to_blender().
"""

import json
import math
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
MODELS = ROOT / "assets" / "v2" / "models"
RENDERS = ROOT / "assets" / "v2" / "renders"
RENDERS.mkdir(parents=True, exist_ok=True)
HIRES = RENDERS / "_hires"
HIRES.mkdir(parents=True, exist_ok=True)

STAGES = ["meadow", "lava", "ice", "ruins", "darkForest", "desert"]


def three_to_blender(v):
    x, y, z = v
    return Vector((x, -z, y))


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
    scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
    scene.render.film_transparent = True
    scene.render.resolution_percentage = 200  # supersampled; downscaled by web/scripts/finalize-lite-renders.mjs
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    try:
        scene.view_settings.view_transform = "Standard"
        scene.view_settings.look = "None"
    except Exception:
        pass

    world = bpy.data.worlds.new("LiteWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (1.0, 0.97, 0.9, 1.0)
        bg.inputs[1].default_value = 1.05
    return scene


def add_sun(three_dir, strength, color=(1.0, 0.96, 0.86)):
    data = bpy.data.lights.new("Sun", type="SUN")
    data.energy = strength
    data.color = color
    obj = bpy.data.objects.new("Sun", data)
    bpy.context.scene.collection.objects.link(obj)
    direction = -three_to_blender(three_dir).normalized()
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return obj


def add_camera(three_pos, three_target, fov_y_deg, res_x, res_y):
    scene = bpy.context.scene
    scene.render.resolution_x = res_x
    scene.render.resolution_y = res_y
    cam_data = bpy.data.cameras.new("LiteCam")
    cam_data.sensor_fit = "VERTICAL"
    cam_data.angle_y = math.radians(fov_y_deg)
    cam_data.clip_start = 0.1
    cam_data.clip_end = 200.0
    cam = bpy.data.objects.new("LiteCam", cam_data)
    scene.collection.objects.link(cam)
    loc = three_to_blender(three_pos)
    target = three_to_blender(three_target)
    cam.location = loc
    cam.rotation_euler = (target - loc).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    return cam


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    return [o for o in bpy.data.objects if o not in before]


def render_to(path):
    path = HIRES / (Path(path).stem + ".png")
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    print(f"[lite] wrote {path.name} ({path.stat().st_size} bytes)")


def render_battle_fields():
    for stage in STAGES:
        reset_scene()
        import_glb(MODELS / f"field-{stage}-v2.glb")
        # Matches BattleFieldScene.tsx lights: directional (8, 18, 10) + ambient/hemi via world
        add_sun((8, 18, 10), 3.2)
        add_camera((0, 18.2, 16.5), (0, 0, 0), 44, 1600, 800)
        render_to(RENDERS / f"battle-{stage}.webp")


def render_home():
    # HomeDioramaScene.tsx battle tab: pos (0, 12.5, 22.5) -> target (0, 3, 0), fov 40.
    # Portrait rig scales pos by (1.48, 1.18, 1.48) and lowers target by 0.6.
    variants = [
        ("home-portrait.webp", (0, 12.5 * 1.18, 22.5 * 1.48), (0, 2.4, 0), 780, 1300),
        ("home-landscape.webp", (0, 12.5, 22.5), (0, 3.0, 0), 1600, 900),
    ]
    for name, pos, target, rx, ry in variants:
        reset_scene()
        import_glb(MODELS / "home-diorama-v2.glb")
        add_sun((12, 22, 14), 3.0)
        add_sun((-10, 8, -12), 0.9, color=(0.6, 0.8, 1.0))
        add_camera(pos, target, 40, rx, ry)
        render_to(RENDERS / name)


def ensure_actions_assigned(objs):
    lo, hi = None, None
    for o in objs:
        ad = o.animation_data
        if ad is None:
            continue
        if ad.action is None and len(ad.nla_tracks) > 0 and len(ad.nla_tracks[0].strips) > 0:
            ad.action = ad.nla_tracks[0].strips[0].action
            try:
                if ad.action_slot is None and len(ad.action.slots) > 0:
                    ad.action_slot = ad.action.slots[0]
            except AttributeError:
                pass
        for track in ad.nla_tracks:
            track.mute = True
        if ad.action is not None:
            start, end = ad.action.frame_range
            lo = start if lo is None else min(lo, start)
            hi = end if hi is None else max(hi, end)
    return lo, hi


def render_chest():
    reset_scene()
    objs = import_glb(MODELS / "gacha-chest-v2.glb")
    roots = [o for o in objs if o.parent is None]
    pivot = bpy.data.objects.new("ChestPivot", None)
    bpy.context.scene.collection.objects.link(pivot)
    for o in roots:
        o.parent = pivot
    # GachaChestScene.tsx: group scale 0.86, position y -0.35, idle rotation y ~ -0.35
    pivot.scale = (0.86, 0.86, 0.86)
    pivot.location = three_to_blender((0, -0.35, 0))
    pivot.rotation_euler = (0.0, 0.0, -0.35)

    add_sun((4, 7, 5), 3.4)
    point = bpy.data.lights.new("Glow", type="POINT")
    point.energy = 260.0
    point.color = (1.0, 0.85, 0.4)
    glow = bpy.data.objects.new("Glow", point)
    glow.location = three_to_blender((0, 1.6, 0.5))
    bpy.context.scene.collection.objects.link(glow)
    add_camera((2.8, 2.4, 5.6), (0, 0, 0), 40, 400, 400)

    lo, hi = ensure_actions_assigned(objs)
    if lo is None:
        lo, hi = 1, 1
    frames = 12
    for i in range(frames):
        f = lo + (hi - lo) * (i / (frames - 1))
        bpy.context.scene.frame_set(int(math.floor(f)), subframe=f - math.floor(f))
        render_to(RENDERS / f"chest-open-{i:02d}.webp")


def main():
    render_battle_fields()
    render_home()
    render_chest()
    meta = {
        "battle": {"cameraThree": [0, 18.2, 16.5], "target": [0, 0, 0], "fovY": 44, "width": 1600, "height": 800},
        "homePortrait": {"width": 780, "height": 1300},
        "homeLandscape": {"width": 1600, "height": 900},
        "chestFrames": 12,
    }
    (RENDERS / "renders.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print("[lite] done")


main()
