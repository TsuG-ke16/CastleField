"""Optimize and calibrate the Tripo 4-biome floating island base GLB.

1. Imports raw Tripo floating island GLB (~1.88M tris).
2. Rotates +45 deg CCW around Z so:
     North (+Y) = Meadow/Pines (Kingdom)
     West  (-X) = Mossy Forest (Forest Alliance)
     East  (+X) = Obsidian/Purple Crystals (Demon Army)
     South (-Y) = Volcanic Lava (Dragon Empire)
     Rivers & Waterfalls = NE/NW/SE/SW (45/135/225/315 deg)
3. Scales cleanly to ~64m span and shifts Z so Central Plaza floor sits at Z = 0.000.
4. Raycasts down onto all 4 circular empty castle pads to measure exact pad Z heights & centers.
5. Decimates to 65,000 tris (preserving 2K Normal Map micro-sculpting!) and synthesizes a
   2K Emissive texture (glowing South lava fissures + East amethyst crystals).
6. Saves assets/models/diorama/tripo_castles/tripo_island_base.glb and island_pad_metrics.json.
"""

import json
import math
from pathlib import Path
import numpy as np
import bpy
from mathutils import Vector

SCRIPT_DIR = Path(__file__).resolve().parent
DIORAMA_DIR = SCRIPT_DIR.parent
OUT_DIR = DIORAMA_DIR / 'tripo_castles'
OUT_DIR.mkdir(parents=True, exist_ok=True)

SRC_GLB = Path(r'C:\Users\keisu\Downloads\991ae373-58a4-4a3f-b5b1-5d151e3d85c7.glb')
OUT_GLB = OUT_DIR / 'tripo_island_base.glb'
METRICS_JSON = OUT_DIR / 'island_pad_metrics.json'

TARGET_SPAN_M = 64.0   # ~64m diameter across the 4 biome lobes
Z_RATIO = 0.82         # slight vertical polish so tall rocky underside frames cleanly in 16:9 & 9:16
TARGET_TRIS = 65000
TEX_SIZE = 2048


def build_island_emissive(base_img):
    """Extract glowing volcanic lava fissures (orange-red) and amethyst crystals (bright violet) into a clean 2K emissive map."""
    w, h = base_img.size[0], base_img.size[1]
    px = np.array(base_img.pixels[:], dtype=np.float32).reshape((h, w, 4))
    r, g, b = px[:, :, 0], px[:, :, 1], px[:, :, 2]

    # 1. Molten lava fissures: intense vivid orange-red (very high R, low B, strong R-B contrast)
    lava_mask = (
        np.clip((r - 0.62) * 4.0, 0.0, 1.0)
        * np.clip((r - b - 0.48) * 5.0, 0.0, 1.0)
        * np.clip((0.55 - b) * 3.0, 0.0, 1.0)
        * np.clip((r - g - 0.12) * 4.5, 0.0, 1.0)
    )
    # 2. Glowing amethyst crystals on East cliff: bright saturated violet/magenta (high B & R, low G)
    crys_mask = (
        np.clip((b - 0.45) * 3.5, 0.0, 1.0)
        * np.clip((r - 0.35) * 3.5, 0.0, 1.0)
        * np.clip((np.minimum(r, b) - g - 0.16) * 5.5, 0.0, 1.0)
    )

    out_px = np.zeros((h, w, 4), dtype=np.float32)
    out_px[:, :, 0] = np.clip(lava_mask * 1.0 + crys_mask * 0.72, 0.0, 1.0)
    out_px[:, :, 1] = np.clip(lava_mask * 0.34 + crys_mask * 0.14, 0.0, 1.0)
    out_px[:, :, 2] = np.clip(lava_mask * 0.04 + crys_mask * 1.0, 0.0, 1.0)
    out_px[:, :, 3] = 1.0

    em_img = bpy.data.images.new('tripo_island_emissive', width=w, height=h, alpha=False)
    em_img.pixels.foreach_set(out_px.ravel())
    em_img.pack()
    return em_img


def raycast_z(obj, x, y):
    """Raycast straight down in world space from Z=+200 onto obj and return top-surface hit Z or None."""
    inv = obj.matrix_world.inverted()
    origin = inv @ Vector((x, y, 200.0))
    direction = (inv.to_3x3() @ Vector((0.0, 0.0, -1.0))).normalized()
    ok, loc, norm, idx = obj.ray_cast(origin, direction)
    if not ok:
        return None
    wloc = obj.matrix_world @ loc
    return wloc.z


def main():
    if not SRC_GLB.exists():
        raise FileNotFoundError(f'Missing Tripo island GLB: {SRC_GLB}')

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(SRC_GLB))
    bpy.context.view_layer.update()

    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = 'Tripo_Floating_Island_Base'
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # 1. Rotate +45 deg CCW around Z to align the 4 biomes & bridges strictly onto N/W/E/S!
    obj.rotation_euler = (0.0, 0.0, math.radians(45.0))
    bpy.context.view_layer.update()
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # 2. Compute bounds and scale uniformly to TARGET_SPAN_M across X/Y
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for v in obj.data.vertices:
        for i in range(3):
            lo[i] = min(lo[i], v.co[i])
            hi[i] = max(hi[i], v.co[i])
    cur_span = max(hi.x - lo.x, hi.y - lo.y)
    cx = 0.5 * (lo.x + hi.x)
    cy = 0.5 * (lo.y + hi.y)
    sc = TARGET_SPAN_M / max(cur_span, 1e-4)

    obj.location = (-cx * sc, -cy * sc, 0.0)
    obj.scale = (sc, sc, sc * Z_RATIO)
    bpy.context.view_layer.update()
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # 3. Raycast Central Plaza at (0,0) and shift Z so Central Plaza floor = 0.000!
    plaza_z_samples = [raycast_z(obj, dx, dy) for dx in (-2.0, 0.0, 2.0) for dy in (-2.0, 0.0, 2.0)]
    plaza_z_samples = [z for z in plaza_z_samples if z is not None]
    plaza_z = float(np.median(plaza_z_samples)) if plaza_z_samples else 0.0
    print(f'PLAZA_TOP_RAW_Z = {plaza_z:.3f}')
    obj.location.z = -plaza_z
    bpy.context.view_layer.update()
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # 4. Probe radial Z profile along N (+Y), W (-X), E (+X), S (-Y) to measure exact castle pad centers & elevations!
    dirs = {
        'kingdom': (0, 1),
        'forest': (-1, 0),
        'demon': (1, 0),
        'dragon': (0, -1),
    }
    metrics = {'plaza_z': 0.0, 'factions': {}, 'island_bounds': {}}
    for key, (dx, dy) in dirs.items():
        profile = []
        for r in range(10, 32):
            z = raycast_z(obj, dx * r, dy * r)
            profile.append((r, round(z, 3) if z is not None else None))
        # Circular empty pads sit cleanly around r = 17..25m; sample median across r = 18..23
        pad_zs = [raycast_z(obj, dx * r + (-dy) * p, dy * r + dx * p) for r in (18.5, 20.0, 21.5, 23.0) for p in (-2.0, 0.0, 2.0)]
        pad_zs = [z for z in pad_zs if z is not None]
        pad_z = round(float(np.median(pad_zs)), 3) if pad_zs else 0.0
        metrics['factions'][key] = {
            'pad_z': pad_z,
            'radial_profile': profile,
        }
        print(f'PAD_PROBE {key}: pad_z={pad_z:.3f} | r15..26={[ (r, z) for r, z in profile if 15 <= r <= 26 ]}')

    # 5. Decimate cleanly to 65,000 tris preserving UVs & 2K Normal Map detail!
    orig_tris = sum(max(1, len(p.vertices) - 2) for p in obj.data.polygons)
    mod = obj.modifiers.new('Decimate_Island', 'DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.ratio = min(1.0, TARGET_TRIS / max(1, orig_tris))
    mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=mod.name)

    if obj.data.polygons:
        obj.data.polygons.foreach_set('use_smooth', [True] * len(obj.data.polygons))
    obj.data.update()

    # 6. Downscale packed 4K maps to 2K (2048x2048) & wire synthesized lava+crystal emissive map!
    base_img = None
    for img in list(bpy.data.images):
        if img.size[0] <= 0:
            continue
        if img.size[0] > TEX_SIZE or img.size[1] > TEX_SIZE:
            img.scale(TEX_SIZE, TEX_SIZE)
        img.pack()
        lname = img.name.lower()
        if 'base' in lname or 'albedo' in lname or 'color' in lname or 'diffuse' in lname:
            base_img = img

    if base_img is not None and obj.data.materials:
        em_img = build_island_emissive(base_img)
        for mat in obj.data.materials:
            if not mat or not mat.use_nodes:
                continue
            nt = mat.node_tree
            bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
            if bsdf is None:
                continue
            em_tex = nt.nodes.new('ShaderNodeTexImage')
            em_tex.image = em_img
            em_tex.location = (-360, -340)
            nt.links.new(em_tex.outputs['Color'], bsdf.inputs['Emission Color'])
            bsdf.inputs['Emission Strength'].default_value = 3.2

    # Final bounds
    lo2 = Vector((1e9, 1e9, 1e9))
    hi2 = Vector((-1e9, -1e9, -1e9))
    for v in obj.data.vertices:
        for i in range(3):
            lo2[i] = min(lo2[i], v.co[i])
            hi2[i] = max(hi2[i], v.co[i])
    metrics['island_bounds'] = {
        'min_xyz': [round(v, 3) for v in lo2],
        'max_xyz': [round(v, 3) for v in hi2],
        'size_xyz': [round(hi2[i] - lo2[i], 3) for i in range(3)],
    }
    METRICS_JSON.write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding='utf-8')

    final_tris = sum(max(1, len(p.vertices) - 2) for p in obj.data.polygons)
    bpy.ops.export_scene.gltf(
        filepath=str(OUT_GLB),
        export_format='GLB',
        export_yup=True,
        export_apply=True,
        export_materials='EXPORT',
        export_image_format='JPEG',
        export_image_quality=88,
    )
    kb = OUT_GLB.stat().st_size / 1024.0
    print(f'ISLAND_PREPARED: {orig_tris} -> {final_tris} tris | size={metrics["island_bounds"]["size_xyz"]} | z_min={lo2.z:.2f} | glb={kb:.1f} KB')


if __name__ == '__main__':
    main()
