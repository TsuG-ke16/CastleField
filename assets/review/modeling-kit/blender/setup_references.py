"""Blender 4.3+: add registered image references or a 3-lane field blockout.

Run from Blender's Text Editor, or use the CLI examples in ../README.md.
Existing objects are preserved unless --factory-empty is explicitly passed.
"""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Euler


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument('--asset', default='fac_king_infantry')
    parser.add_argument('--all', action='store_true')
    parser.add_argument('--field', action='store_true')
    parser.add_argument('--factory-empty', action='store_true')
    parser.add_argument('--save')
    parser.add_argument('--render')
    parser.add_argument('--export-field')
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    return parser.parse_args(argv)


def collection(name):
    result = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(result)
    return result


def move_to(obj, target):
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    target.objects.link(obj)


def reference(item, assets, target):
    """Images are square; alpha registration places feet on Z=0."""
    for view, path in item['views'].items():
        reg = item['registration'][view]
        width, height = reg['canvas']
        left, top, right, bottom = reg['bbox']
        pivot_x = reg.get('groundPivotPx', [(left + right) / 2, bottom])[0]
        if view == 'top':
            size = item['footprint'][0] * width / (right - left)
            x = -size * ((left + right) / (2 * width) - .5)
            y = -size * (.5 - (top + bottom) / (2 * height))
            location, rotation = (x, y, .02), (0, 0, 0)
        else:
            size = item['height'] * height / (bottom - top)
            u_offset = size * (pivot_x / width - .5)
            z = size * (bottom / height - .5)
            angle = 0 if view == 'front' else math.pi
            if view == 'right':
                angle = -math.pi / 2 if item['profileCamera'] == '-X' else math.pi / 2
            u = (math.cos(angle), math.sin(angle))
            # Image's normal is -Y after the X rotation, then rotated around Z.
            normal = (math.sin(angle), -math.cos(angle))
            location = (-u[0] * u_offset + normal[0] * .03,
                        -u[1] * u_offset + normal[1] * .03, z)
            rotation = (math.pi / 2, 0, angle)
        obj = bpy.data.objects.new(f'{item["id"]}__{view}', None)
        target.objects.link(obj)
        obj.empty_display_type = 'IMAGE'
        obj.data = bpy.data.images.load(str(assets / path), check_existing=True)
        obj.empty_display_size = size
        obj.empty_image_depth = 'BACK'
        obj.empty_image_side = 'FRONT'
        obj.color[3] = .65
        obj.location, obj.rotation_euler = location, rotation
        obj.hide_select = True
        obj['reference_view'] = view
        obj['source_asset'] = item['id']
        obj['height_m'] = item['height']
        obj['reference_only'] = True
    target['kind'] = 'modeling-reference'
    target['source_asset'] = item['id']


def material(name, color):
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*color, 1)
    return result


def cube(name, dimensions, location, target, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    obj['blockout_only'] = True
    move_to(obj, target)
    return obj


def field(layout):
    target = collection('CF_FIELD_BLOCKOUT')
    stone = material('CF_Blockout_Stone', (.46, .50, .52))
    grass = material('CF_Blockout_Ground', (.45, .56, .35))
    central = material('CF_Blockout_Center', (.80, .58, .24))
    blue = material('CF_Blockout_P1', (.18, .40, .72))
    orange = material('CF_Blockout_P2', (.85, .40, .16))
    cube('field-base', (layout['width'], layout['length'], .2), (0, 0, -.1), target, grass)
    for lane, x in enumerate(layout['laneX']):
        for step, y in enumerate(layout['stepY']):
            bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=layout['socketRadius'],
                                               depth=.08, location=(x, y, .04))
            obj = bpy.context.object
            obj.name = f'lane-{lane + 1}-step-{step + 1}'
            obj.data.materials.append(central if step == 2 else stone)
            obj['lane_index'], obj['step_index'] = lane, step
            obj['blockout_only'] = True
            move_to(obj, target)
    for seat, y in enumerate(layout['castleY']):
        obj = cube(f'castle-footprint-{seat + 1}', (*layout['castleFootprint'], 4.6),
                   (0, y, 2.3), target, blue if seat == 0 else orange)
        obj['front_direction'] = '+Y' if seat == 0 else '-Y'
    return target


def camera_and_lights():
    bpy.ops.object.camera_add(location=(6, -8, 65))
    cam = bpy.context.object
    cam.name = 'CF_Blockout_Camera'
    cam.rotation_euler = (-cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.type, cam.data.ortho_scale = 'ORTHO', 24
    bpy.context.scene.camera = cam
    bpy.ops.object.light_add(type='AREA', location=(2, -5, 13))
    light = bpy.context.object
    light.name = 'CF_Blockout_Key'
    light.data.energy, light.data.shape, light.data.size = 1800, 'DISK', 10
    light.rotation_euler = (-light.location).to_track_quat('-Z', 'Y').to_euler()
    scene = bpy.context.scene
    if scene.world is None:
        scene.world = bpy.data.worlds.new('CF_Blockout_World')
    scene.world.color = (.45, .45, .45)


def main():
    args = arguments()
    assets = Path(__file__).resolve().parents[3]
    catalog = json.loads((assets / 'review/modeling-kit/catalog.json').read_text())
    items = catalog['units'] + catalog['castles']
    chosen = items if args.all else [item for item in items if item['id'] == args.asset]
    if not chosen:
        raise ValueError('Unknown asset: ' + args.asset)
    if args.factory_empty:
        bpy.ops.wm.read_factory_settings(use_empty=True)
    # Preserve a running project's existing unit settings; numeric assets use meters.
    scene = bpy.context.scene
    if scene.unit_settings.scale_length != 1:
        raise ValueError('Set Unit Scale to 1 before importing meter-based references.')
    for index, item in enumerate(chosen):
        target = collection('CF_REF_' + item['id'])
        reference(item, assets, target)
        target.hide_viewport = args.field or index > 0
        target.hide_render = True
    blockout = field(catalog['field']) if args.field else None
    if args.field:
        camera_and_lights()
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == 'VIEW_3D':
                region = area.spaces.active.region_3d
                region.view_location = (0, 0, .8)
                region.view_distance = 4
                region.view_rotation = Euler((math.pi / 2, 0, 0)).to_quaternion()
                region.view_perspective = 'CAMERA' if args.field else 'ORTHO'
    if args.export_field:
        if blockout is None:
            raise ValueError('--export-field requires --field')
        bpy.ops.object.select_all(action='DESELECT')
        for obj in blockout.objects:
            obj.select_set(True)
        bpy.ops.export_scene.gltf(filepath=str(Path(args.export_field).resolve()),
                                  export_format='GLB', use_selection=True, export_extras=True)
    if args.save:
        # Pack references so moving the .blend does not break image paths.
        bpy.ops.file.pack_all()
        bpy.ops.wm.save_as_mainfile(filepath=str(Path(args.save).resolve()))
    if args.render:
        scene.render.engine = 'CYCLES'
        scene.cycles.samples = 64
        scene.cycles.use_denoising = False
        scene.render.resolution_x, scene.render.resolution_y = 1000, 1000
        scene.render.resolution_percentage = 100
        scene.render.image_settings.file_format = 'PNG'
        scene.render.filepath = str(Path(args.render).resolve())
        bpy.ops.render.render(write_still=True)
    print(json.dumps({'references':len(chosen), 'fieldSockets':15 if blockout else 0,
                      'existingObjectsPreserved':not args.factory_empty}))


if __name__ == '__main__':
    main()
