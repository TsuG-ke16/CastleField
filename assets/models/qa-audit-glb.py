"""戦闘用GLB（城・兵士・魔物・ステージ）の品質検査と、正面・斜め・側面のレンダリング。

検査項目：スケール・原点・回転・接地位置（最下面が地面 y=0 か）・マテリアル・法線（裏返し）・階層リグ（FieldGL が探す名前）
使い方（リポジトリのルートで）：
  "C:\\Program Files\\Blender Foundation\\Blender 5.3\\blender.exe" --background --python assets/models/qa-audit-glb.py -- OUT_DIR [glb名 ...]
OUT_DIR に report.json と <glb名>-front/three_quarter/side.png を出す。モデルは書き換えない（読むだけ）。
"""

import json
import math
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = Path(argv[0]) if argv else ROOT / 'qa-out'
OUT.mkdir(parents=True, exist_ok=True)
NAMES = argv[1:] or sorted(p.stem for p in ROOT.glob('*.glb') if p.stem.split('-')[0] in ('castle', 'unit', 'monster', 'field'))

# FieldGL.bindModelRig が探す階層オブジェクト名（無いとアニメしない）
RIG_EXPECT = {
    'castle': ['Castle_Keep', 'Castle_Flag_Main'],
    'unit': ['Anim_Body', 'Anim_Head', 'Anim_ArmR', 'Anim_ArmL'],
    'monster': [],
    'field': [],
}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def meshes():
    return [o for o in bpy.context.scene.objects if o.type == 'MESH']


def world_bounds(objs):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector((min(lo[i], w[i]) for i in range(3)))
            hi = Vector((max(hi[i], w[i]) for i in range(3)))
    return lo, hi


def flipped_ratio(objs):
    """法線が外向きか：面の重心→全体の重心の向きと法線の内積が負の面の割合（閉じた立体向けの目安）"""
    bad = total = 0
    for o in objs:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bm.faces.ensure_lookup_table()
        if not bm.faces:
            bm.free()
            continue
        center = sum((f.calc_center_median() for f in bm.faces), Vector()) / len(bm.faces)
        for f in bm.faces:
            total += 1
            if f.normal.dot(f.calc_center_median() - center) < -0.2 and f.calc_area() > 1e-4:
                bad += 1
        bm.free()
    return (bad / total) if total else 0.0


def audit(name):
    reset()
    bpy.ops.import_scene.gltf(filepath=str(ROOT / f'{name}.glb'))
    ms = meshes()
    lo, hi = world_bounds(ms)
    size = hi - lo
    kind = name.split('-')[0]
    names = {o.name for o in bpy.context.scene.objects}
    missing = [n for n in RIG_EXPECT.get(kind, []) if not any(x.startswith(n) for x in names)]
    mats = {s.material.name for o in ms for s in o.material_slots if s.material}
    no_mat = [o.name for o in ms if not any(s.material for s in o.material_slots)]
    roots = [o for o in bpy.context.scene.objects if o.parent is None]
    rot = [tuple(round(math.degrees(a), 1) for a in o.rotation_euler) for o in roots if o.type != 'MESH'][:3]
    scales = [tuple(round(v, 3) for v in o.scale) for o in roots][:3]
    tris = sum(len(o.data.polygons) for o in ms)
    # glTF(Y上) → Blender(Z上) に変換済みなので、接地は z の最小値
    return {
        'name': name, 'meshes': len(ms), 'objects': len(names), 'faces': tris,
        'size_xyz_m': [round(v, 3) for v in size],
        'min_z_ground': round(lo.z, 3), 'center_xy': [round((lo.x + hi.x) / 2, 3), round((lo.y + hi.y) / 2, 3)],
        'materials': len(mats), 'meshes_without_material': no_mat[:5],
        'root_rotation_deg': rot, 'root_scale': scales,
        'rig_missing': missing, 'flipped_face_ratio': round(flipped_ratio(ms), 4),
    }


def render(name):
    reset()
    bpy.ops.import_scene.gltf(filepath=str(ROOT / f'{name}.glb'))
    ms = meshes()
    lo, hi = world_bounds(ms)
    c = (lo + hi) / 2
    r = max((hi - lo).length, 0.5)
    sc = bpy.context.scene
    try:
        sc.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError:
        sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x = sc.render.resolution_y = 640
    sc.render.film_transparent = False
    world = bpy.data.worlds.new('w')
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs[0].default_value = (0.74, 0.86, 0.96, 1)
    bg.inputs[1].default_value = 1.1
    sc.world = world
    for loc, energy in (((4, -5, 8), 4.0), ((-5, 3, 4), 1.5)):
        ld = bpy.data.lights.new('sun', 'SUN')
        ld.energy = energy
        lo_ = bpy.data.objects.new('sun', ld)
        lo_.location = loc
        lo_.rotation_euler = (math.radians(50), 0, math.radians(30 if loc[0] > 0 else -140))
        sc.collection.objects.link(lo_)
    cam_d = bpy.data.cameras.new('cam')
    cam_d.lens = 50
    cam = bpy.data.objects.new('cam', cam_d)
    sc.collection.objects.link(cam)
    sc.camera = cam
    # ゲームの標準視点は斜め上から見下ろす。正面（やや上）・斜め・側面
    views = {'front': (0, -1, 0.25), 'three_quarter': (1, -1, 0.7), 'side': (1, 0, 0.2)}
    for vname, d in views.items():
        v = Vector(d).normalized() * r * 1.9
        cam.location = c + v
        cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = str(OUT / f'{name}-{vname}.png')
        bpy.ops.render.render(write_still=True)


report = []
for n in NAMES:
    try:
        report.append(audit(n))
    except Exception as e:  # noqa: BLE001
        report.append({'name': n, 'error': str(e)})
    try:
        render(n)
    except Exception as e:  # noqa: BLE001
        report[-1]['render_error'] = str(e)
(OUT / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding='utf-8')
print('QA_DONE', len(report))
