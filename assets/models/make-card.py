"""カードの板（角丸・厚み・縁の丸み）を作って card-slab.glb に書き出す。
使い方（リポジトリのルートで）： python3 assets/models/make-card.py
  Blender を開かずに動かせる（pip install bpy。Python 3.13 で bpy 5.3 を確認）。
Blender で手直しするときは、このスクリプトを「スクリプト」タブで実行すると同じ板ができる。

寸法は、カードの幅を 1 として 幅1 × 高さ1.5 × 厚み0.055（js/ui/config.js の card3D.depth と同じ）。
glTF の向きは 幅=X・高さ=Y・厚み=Z（表が +Z）。マテリアル名：front（表の下地）・back（裏。絵は画面側で貼る）・edge（側面。色は画面側でレアリティに合わせる）。
UV：表も裏も、カード全体が 0〜1（裏は左右を反転して、裏から見て正しい向きになる）。
"""
import math
import sys
from pathlib import Path

import bpy
import bmesh  # bpy より先には読み込めない

W, H, T = 1.0, 1.5, 0.055
CORNER = 0.07     # 角の丸み（枠の絵の角に合わせる）
RIM = 0.006       # 表裏の縁の小さな面取り
OUT = Path(__file__).with_name('card-slab.glb')

bpy.ops.wm.read_factory_settings(use_empty=True)

# Blender は Z が上。厚みを Y、高さを Z にして作り、書き出し時の「Y up」で glTF の向きにそろえる
mesh = bpy.data.meshes.new('card-slab')
obj = bpy.data.objects.new('card-slab', mesh)
bpy.context.scene.collection.objects.link(obj)
bm = bmesh.new()
bmesh.ops.create_cube(bm, size=1.0)
bmesh.ops.scale(bm, verts=bm.verts, vec=(W, T, H))

# 1) 厚みの方向（Y）に走る4本の角を丸める
thick_edges = [e for e in bm.edges if abs(e.verts[0].co.x - e.verts[1].co.x) < 1e-6 and abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-6]
bmesh.ops.bevel(bm, geom=thick_edges, offset=CORNER, offset_type='OFFSET', segments=10, profile=0.5, affect='EDGES')

# 2) 表と裏の外周を小さく面取りする
def on_face_plane(e):
    return all(abs(abs(v.co.y) - T / 2) < 1e-6 for v in e.verts)
rim_edges = [e for e in bm.edges if on_face_plane(e)]
bmesh.ops.bevel(bm, geom=rim_edges, offset=RIM, offset_type='OFFSET', segments=2, profile=0.5, affect='EDGES')

# 3) マテリアルと UV
mats = {}
for name, color in (('front', (0.93, 0.88, 0.76, 1)), ('back', (0.45, 0.30, 0.18, 1)), ('edge', (0.60, 0.64, 0.68, 1))):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = color
    bsdf.inputs['Roughness'].default_value = 0.55
    mesh.materials.append(m)
    mats[name] = len(mesh.materials) - 1

uv = bm.loops.layers.uv.new('UVMap')
for f in bm.faces:
    n = f.normal
    if n.y < -0.999:      # 表（glTF の +Z）
        f.material_index, flat, flip = mats['front'], True, False
    elif n.y > 0.999:     # 裏
        f.material_index, flat, flip = mats['back'], True, True
    else:
        f.material_index, flat, flip = mats['edge'], False, False
    f.smooth = not flat
    for loop in f.loops:
        x, z = loop.vert.co.x, loop.vert.co.z
        u = (x / W + 0.5)
        loop[uv].uv = ((1 - u) if flip else u, z / H + 0.5)

bm.to_mesh(mesh)
bm.free()

bpy.ops.object.select_all(action='DESELECT')
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
bpy.ops.export_scene.gltf(filepath=str(OUT), export_format='GLB', use_selection=True, export_yup=True,
                          export_apply=True, export_texcoords=True, export_normals=True, export_materials='EXPORT')
print(f'書き出しました：{OUT}（{OUT.stat().st_size} バイト、面{len(mesh.polygons)}）')
