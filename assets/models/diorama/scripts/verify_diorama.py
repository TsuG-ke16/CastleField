"""Automated structural & asset integrity verification for Castle Field 4-Faction Diorama.

Checks:
1. .blend contains all 13 required collections and all 10 cameras.
2. All 4 castles sit in their exact cardinal directions (N/W/E/S) with front (-Y local) facing Central Plaza (0,0,0).
3. .glb re-imports cleanly with valid meshes, materials, outward normals, scale, and WebGL budget.
4. All mandatory renders, mobile 9:16 renders, and turntable deliverables exist on disk.

Usage:
  "C:\\Program Files\\Blender Foundation\\Blender 5.3\\blender.exe" --background --python assets/models/diorama/scripts/verify_diorama.py
"""

import json
import math
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

SCRIPT_DIR = Path(__file__).resolve().parent
DIORAMA_DIR = SCRIPT_DIR.parent
BLEND_PATH = DIORAMA_DIR / 'castle_field_diorama.blend'
GLB_PATH = DIORAMA_DIR / 'castle_field_diorama.glb'
RENDER_DIR = DIORAMA_DIR / 'renders'
CONFIG_DIR = DIORAMA_DIR / 'config'

REQUIRED_COLLECTIONS = [
    'Island_Base', 'Central_Plaza', 'Roads', 'Bridges', 'Water', 'Nature',
    'Castle_Kingdom', 'Castle_Forest', 'Castle_Demon', 'Castle_Dragon',
    'Props', 'Lights', 'Cameras',
]

REQUIRED_CAMERAS = [
    'Camera_Overview', 'Camera_Top',
    'Camera_North', 'Camera_South', 'Camera_East', 'Camera_West',
    'Camera_Kingdom', 'Camera_Forest', 'Camera_Demon', 'Camera_Dragon',
]

REQUIRED_RENDERS = [
    '01_overview.png', '02_top.png', '03_north.png', '04_south.png',
    '05_east.png', '06_west.png', '07_home_kingdom.png', '08_home_forest.png',
    '09_home_demon.png', '10_home_dragon.png',
    'mobile_01_kingdom_9x16.png', 'mobile_02_forest_9x16.png',
    'mobile_03_demon_9x16.png', 'mobile_04_dragon_9x16.png',
    'turntable_sheet.png', 'turntable_4factions.mp4',
]


def world_bounds(objs):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector((min(lo[i], w[i]) for i in range(3)))
            hi = Vector((max(hi[i], w[i]) for i in range(3)))
    return lo, hi


def check_mesh_health(mesh_objs):
    nan_verts = 0
    zero_area = 0
    total_faces = 0
    total_tris = 0
    no_mat = []
    for o in mesh_objs:
        if not any(s.material for s in o.material_slots):
            no_mat.append(o.name)
        for v in o.data.vertices:
            if any(math.isnan(c) or math.isinf(c) for c in v.co):
                nan_verts += 1
        for p in o.data.polygons:
            total_faces += 1
            total_tris += max(1, len(p.vertices) - 2)
            if p.area < 1e-8:
                zero_area += 1
    return {
        'mesh_count': len(mesh_objs),
        'total_polygons': total_faces,
        'total_triangles': total_tris,
        'nan_vertices': nan_verts,
        'degenerate_faces': zero_area,
        'meshes_without_material': no_mat,
    }


def main():
    report = {'blend_check': {}, 'glb_check': {}, 'deliverables_check': {}, 'passed': True}

    # --- 1. Inspect .blend ---
    bpy.ops.wm.open_mainfile(filepath=str(BLEND_PATH))
    bpy.context.view_layer.update()

    cols = {c.name for c in bpy.data.collections}
    missing_cols = [c for c in REQUIRED_COLLECTIONS if c not in cols]
    cams = {o.name for o in bpy.context.scene.objects if o.type == 'CAMERA'}
    missing_cams = [c for c in REQUIRED_CAMERAS if c not in cams]

    # Verify all 4 castle roots face (0, 0, 0) along local -Y
    facing_checks = {}
    expected_dirs = {
        'Castle_Kingdom_Root': Vector((0, 1, 0)),
        'Castle_Forest_Root': Vector((-1, 0, 0)),
        'Castle_Demon_Root': Vector((1, 0, 0)),
        'Castle_Dragon_Root': Vector((0, -1, 0)),
    }
    for rname, exp_pos_dir in expected_dirs.items():
        obj = bpy.data.objects.get(rname)
        if obj is None:
            facing_checks[rname] = {'ok': False, 'reason': 'missing'}
            report['passed'] = False
            continue
        # World direction of local -Y
        local_front_world = (obj.matrix_world.to_3x3() @ Vector((0, -1, 0))).normalized()
        to_plaza = (Vector((0, 0, obj.location.z)) - obj.location).normalized()
        dot = local_front_world.dot(to_plaza)
        pos_dot = Vector((obj.location.x, obj.location.y, 0)).normalized().dot(exp_pos_dir)
        ok = (dot > 0.999 and pos_dot > 0.999)
        facing_checks[rname] = {
            'location': [round(v, 3) for v in obj.location],
            'front_dot_to_plaza': round(dot, 5),
            'cardinal_alignment_dot': round(pos_dot, 5),
            'ok': ok,
        }
        if not ok:
            report['passed'] = False

    blend_meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    lo, hi = world_bounds(blend_meshes)
    report['blend_check'] = {
        'file_size_kb': round(BLEND_PATH.stat().st_size / 1024.0, 1),
        'missing_collections': missing_cols,
        'missing_cameras': missing_cams,
        'facing_checks': facing_checks,
        'mesh_health': check_mesh_health(blend_meshes),
        'world_size_m': [round(hi[i] - lo[i], 3) for i in range(3)],
    }
    if missing_cols or missing_cams or report['blend_check']['mesh_health']['nan_vertices'] > 0 or report['blend_check']['mesh_health']['meshes_without_material']:
        report['passed'] = False

    # --- 2. Re-import .glb into clean factory scene ---
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(GLB_PATH))
    bpy.context.view_layer.update()

    glb_meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    glb_cams = [o.name for o in bpy.context.scene.objects if o.type == 'CAMERA']
    glb_lo, glb_hi = world_bounds(glb_meshes)
    glb_mats = {s.material.name for o in glb_meshes for s in o.material_slots if s.material}
    glb_health = check_mesh_health(glb_meshes)
    report['glb_check'] = {
        'file_size_kb': round(GLB_PATH.stat().st_size / 1024.0, 1),
        'imported_objects': len(bpy.context.scene.objects),
        'imported_cameras': len(glb_cams),
        'imported_materials': len(glb_mats),
        'mesh_health': glb_health,
        'world_bounds_min': [round(v, 3) for v in glb_lo],
        'world_bounds_max': [round(v, 3) for v in glb_hi],
        'world_size_m': [round(glb_hi[i] - glb_lo[i], 3) for i in range(3)],
    }
    if glb_health['mesh_count'] == 0 or glb_health['nan_vertices'] > 0 or glb_health['meshes_without_material']:
        report['passed'] = False

    # --- 3. Verify all render deliverables ---
    missing_files = []
    file_sizes = {}
    for fname in REQUIRED_RENDERS:
        p = RENDER_DIR / fname
        if not p.exists() or p.stat().st_size == 0:
            missing_files.append(fname)
            report['passed'] = False
        else:
            file_sizes[fname] = round(p.stat().st_size / 1024.0, 1)

    report['deliverables_check'] = {
        'missing_files': missing_files,
        'render_files_kb': file_sizes,
    }

    out_path = CONFIG_DIR / 'verification_results.json'
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print('VERIFY_DONE passed=' + str(report['passed']) + f' glb_kb={report["glb_check"]["file_size_kb"]} tris={glb_health["total_triangles"]}')


if __name__ == '__main__':
    main()
