"""4陣営3Dカードフレーム（card-faction-*.glb）の4方向スタジオ検証レンダリング。

各陣営について以下4視点を1枚の連絡シート（または個別PNG）として出力する:
  1. 正面 (front)
  2. 斜め45° (oblique45)
  3. 側面 (side)
  4. 裏面 (back)

実行:
  blender --background --python assets/models/render-faction-cards.py -- <output_dir>
"""
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

REPO = Path(__file__).resolve().parents[2]
FACTIONS = ['kingdom', 'forest', 'demon', 'dragon']


def setup_studio(scene):
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = 640
    scene.render.resolution_y = 860
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'

    world = scene.world or bpy.data.worlds.new('StudioWorld')
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputWorld')
    bg = nt.nodes.new('ShaderNodeBackground')
    bg.inputs['Color'].default_value = (0.09, 0.10, 0.13, 1.0)
    bg.inputs['Strength'].default_value = 0.65
    nt.links.new(bg.outputs['Background'], out.inputs['Surface'])

    # 3点スタジオライティング（金属ハイライト＋宝石ファセット反射を明確に出す）
    lights = [
        ('KeyLight', 'AREA', (2.0, -3.2, 2.2), (62, 0, 32), 260, (1.0, 0.97, 0.92), 2.0),
        ('FillLight', 'AREA', (-2.4, -2.2, 1.2), (72, 0, -48), 110, (0.82, 0.90, 1.0), 2.5),
        ('RimLight', 'AREA', (1.8, 3.0, 2.4), (118, 0, 148), 220, (1.0, 0.95, 0.88), 2.0),
        ('BackKey', 'AREA', (-1.8, 3.2, 1.6), (110, 0, -150), 190, (0.95, 0.98, 1.0), 2.2),
    ]
    for name, kind, loc, rot, energy, color, size in lights:
        ld = bpy.data.lights.new(name, kind)
        ld.energy = energy
        ld.color = color
        ld.size = size
        lo = bpy.data.objects.new(name, ld)
        lo.location = loc
        lo.rotation_euler = tuple(math.radians(a) for a in rot)
        scene.collection.objects.link(lo)

    cam_d = bpy.data.cameras.new('StudioCam')
    cam_d.lens = 65.0
    cam = bpy.data.objects.new('StudioCam', cam_d)
    scene.collection.objects.link(cam)
    scene.camera = cam
    return cam


def aim_camera(cam, eye, target=(0.0, 0.0, 0.0)):
    cam.location = Vector(eye)
    direction = Vector(target) - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()


def render_faction(faction, out_dir):
    for obj in list(bpy.context.scene.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for m in list(bpy.data.meshes):
        if m.users == 0:
            bpy.data.meshes.remove(m)
    for mat in list(bpy.data.materials):
        if mat.users == 0:
            bpy.data.materials.remove(mat)

    scene = bpy.context.scene
    cam = setup_studio(scene)
    glb_path = REPO / f'assets/models/card-faction-{faction}.glb'
    bpy.ops.import_scene.gltf(filepath=str(glb_path))

    # glTF import restores Blender Z-up, front = -Y, back = +Y
    views = [
        ('front', (0.0, -3.55, 0.0)),
        ('oblique45', (2.35, -2.55, 0.55)),
        ('side', (3.15, -0.35, 0.0)),
        ('back', (0.0, 3.55, 0.0)),
    ]
    for vname, eye in views:
        aim_camera(cam, eye)
        out_file = out_dir / f'{faction}-{vname}.png'
        scene.render.filepath = str(out_file)
        bpy.ops.render.render(write_still=True)
        print(f'Rendered {out_file.name}')


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out_dir = Path(argv[0]) if argv else (REPO / 'ui-tests/artifacts/faction-renders')
    out_dir.mkdir(parents=True, exist_ok=True)
    targets = argv[1:] if len(argv) > 1 else FACTIONS
    for f in targets:
        render_faction(f, out_dir)


if __name__ == '__main__':
    main()
