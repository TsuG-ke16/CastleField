"""Optimize raw Tripo Studio 3D castle GLBs for WebGL/Three.js & Blender integration.

For each of the 4 Tripo castles:
1. Imports raw ~1.9M-triangle GLB from Downloads.
2. Applies Collapse Decimate preserving UVs -> ~30,000 tris (visually crisp via normal map!).
3. Normalizes placement: centered in XY, bottom grounded at Z=0.0, front gate facing -Y,
   scaled cleanly to fit its castle terrace footprint (~12.4..13.6m wide).
4. Downscales 4096x4096 PBR maps to 1024x1024 and synthesizes a clean Emissive texture map
   (warm windows for Kingdom/Forest, violet crystal & lancets for Demon, fire & lava for Dragon)
   so BOTH Cycles and Three.js (.glb) glow authentically!
5. Exports clean, lightweight (~2-3 MB) standalone GLB into assets/models/diorama/tripo_castles/.

Usage:
  "C:\\Program Files\\Blender Foundation\\Blender 5.3\\blender.exe" --background --python assets/models/diorama/scripts/prepare_tripo_castles.py
"""

import math
from pathlib import Path
import numpy as np
import bpy
from mathutils import Vector

SCRIPT_DIR = Path(__file__).resolve().parent
DIORAMA_DIR = SCRIPT_DIR.parent
OUT_DIR = DIORAMA_DIR / 'tripo_castles'
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Raw Tripo downloads verified via 8-angle inspection (all 4 already face -Y!)
TRIPO_SPECS = [
    {
        'key': 'kingdom',
        'src': Path(r'C:\Users\keisu\Downloads\fantasy castle 3d model.glb'),
        'out': OUT_DIR / 'tripo_castle_kingdom.glb',
        'target_width': 12.6,   # X width in meters (keeps height ~16.2m!)
        'target_tris': 30000,
        'rot_z_deg': 0.0,
        'emission_strength': 2.6,
        'tex_size': 1024,
    },
    {
        'key': 'forest',
        'src': Path(r'C:\Users\keisu\Downloads\treehouse village 3d model.glb'),
        'out': OUT_DIR / 'tripo_castle_forest.glb',
        'target_width': 13.4,   # X width in meters (grand ancient tree canopy!)
        'target_tris': 34000,
        'rot_z_deg': 0.0,
        'emission_strength': 2.8,
        'tex_size': 1024,
    },
    {
        'key': 'demon',
        'src': Path(r'C:\Users\keisu\Downloads\dark magic castle 3d model.glb'),
        'out': OUT_DIR / 'tripo_castle_demon.glb',
        'target_width': 12.6,   # X width in meters (soaring crystal & spires!)
        'target_tris': 30000,
        'rot_z_deg': 0.0,
        'emission_strength': 3.4,
        'tex_size': 1024,
    },
    {
        'key': 'dragon',
        'src': Path(r'C:\Users\keisu\Downloads\fantasy castle 3d model (1).glb'),
        'out': OUT_DIR / 'tripo_castle_dragon.glb',
        'target_width': 13.4,   # X width in meters (broad heavy volcanic fortress!)
        'target_tris': 30000,
        'rot_z_deg': 0.0,
        'emission_strength': 3.8,
        'tex_size': 1024,
    },
]


def build_emissive_image(base_img, key):
    """Synthesize a crisp emissive map from the BaseColor texture targeting faction glow hues."""
    w, h = base_img.size[0], base_img.size[1]
    px = np.array(base_img.pixels[:], dtype=np.float32).reshape((h, w, 4))
    r, g, b = px[:, :, 0], px[:, :, 1], px[:, :, 2]

    if key == 'kingdom':
        # Warm golden cathedral windows (high R, warm G, low B — excludes pale white limestone!)
        warmth = (r - b)
        mask = np.clip((r - 0.62) * 3.5, 0.0, 1.0) * np.clip((g - 0.42) * 3.0, 0.0, 1.0) * np.clip((warmth - 0.28) * 4.5, 0.0, 1.0)
        em_r = mask * 1.0
        em_g = mask * 0.68
        em_b = mask * 0.18
    elif key == 'forest':
        # Warm amber sanctuary doorway & fairy lanterns (warm orange-gold, excludes green leaves & brown bark)
        warmth = (r - b)
        mask = np.clip((r - 0.68) * 4.0, 0.0, 1.0) * np.clip((g - 0.40) * 3.2, 0.0, 1.0) * np.clip((warmth - 0.36) * 4.5, 0.0, 1.0) * np.clip((r - g + 0.05) * 4.0, 0.0, 1.0)
        em_r = mask * 1.0
        em_g = mask * 0.65
        em_b = mask * 0.16
    elif key == 'demon':
        # Glowing bright royal-violet / magenta amethyst crystal, arcane ring, & gothic windows!
        purple_sig = np.minimum(r, b) - g * 0.85
        bright = np.maximum(r, b)
        mask = np.clip((purple_sig - 0.14) * 5.0, 0.0, 1.0) * np.clip((bright - 0.42) * 3.2, 0.0, 1.0)
        em_r = mask * (0.65 + 0.35 * r)
        em_g = mask * (0.14 + 0.25 * g)
        em_b = mask * 1.0
    else:
        # Dragon: Blazing golden-orange fire braziers, glowing furnace gate, & molten lava veins!
        # Excludes darker crimson stone/banners by requiring strong bright orange/yellow luminance!
        warmth = r - b
        mask = np.clip((r - 0.65) * 3.8, 0.0, 1.0) * np.clip((g - 0.28) * 3.0, 0.0, 1.0) * np.clip((warmth - 0.35) * 4.5, 0.0, 1.0)
        em_r = mask * 1.0
        em_g = mask * np.clip(0.32 + 0.65 * g, 0.0, 1.0)
        em_b = mask * np.clip(0.05 + 0.20 * b, 0.0, 0.35)

    out_px = np.zeros((h, w, 4), dtype=np.float32)
    out_px[:, :, 0] = np.clip(em_r, 0.0, 1.0)
    out_px[:, :, 1] = np.clip(em_g, 0.0, 1.0)
    out_px[:, :, 2] = np.clip(em_b, 0.0, 1.0)
    out_px[:, :, 3] = 1.0

    em_img = bpy.data.images.new(f'tripo_{key}_emissive', width=w, height=h, alpha=False)
    em_img.pixels.foreach_set(out_px.ravel())
    em_img.pack()
    return em_img


def process_castle(spec):
    key = spec['key']
    src = spec['src']
    if not src.exists():
        raise FileNotFoundError(f'Missing Tripo GLB: {src}')

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(src))
    bpy.context.view_layer.update()

    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if not meshes:
        raise RuntimeError(f'No meshes in {src}')

    # Apply transforms cleanly and join if multiple meshes exist
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = f'Tripo_Castle_{key.capitalize()}'
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # Compute current bounds
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for v in obj.data.vertices:
        for i in range(3):
            lo[i] = min(lo[i], v.co[i])
            hi[i] = max(hi[i], v.co[i])

    cur_size = hi - lo
    cx = 0.5 * (lo.x + hi.x)
    cy = 0.5 * (lo.y + hi.y)
    scale_f = spec['target_width'] / max(cur_size.x, 1e-4)

    # Center XY, ground min_z at 0.0, apply optional Z rotation & uniform scale
    obj.location = (-cx * scale_f, -cy * scale_f, -lo.z * scale_f)
    obj.scale = (scale_f, scale_f, scale_f)
    if abs(spec['rot_z_deg']) > 1e-3:
        obj.rotation_euler = (0.0, 0.0, math.radians(spec['rot_z_deg']))
    bpy.context.view_layer.update()
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # Collapse Decimate cleanly while preserving UVs and sculpted silhouettes (normal map retains micro-detail!)
    orig_tris = sum(max(1, len(p.vertices) - 2) for p in obj.data.polygons)
    ratio = min(1.0, spec['target_tris'] / max(1, orig_tris))
    mod = obj.modifiers.new('Decimate_Opt', 'DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.ratio = ratio
    mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=mod.name)

    # Smooth shading so baked Tripo normal maps shade seamlessly!
    if obj.data.polygons:
        obj.data.polygons.foreach_set('use_smooth', [True] * len(obj.data.polygons))
    obj.data.update()

    # Resize packed 4K textures cleanly to target tex_size (1024x1024) & synthesize emissive map!
    ts = spec['tex_size']
    base_img = None
    for img in list(bpy.data.images):
        if img.size[0] <= 0:
            continue
        if img.size[0] > ts or img.size[1] > ts:
            img.scale(ts, ts)
        img.pack()
        lname = img.name.lower()
        if 'base' in lname or 'albedo' in lname or 'color' in lname or 'diffuse' in lname:
            base_img = img

    # Wire synthesized emissive map directly into the material's Principled BSDF!
    if base_img is not None and obj.data.materials:
        em_img = build_emissive_image(base_img, key)
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
            bsdf.inputs['Emission Strength'].default_value = spec['emission_strength']

    # Recompute final bounds & polycount
    lo2 = Vector((1e9, 1e9, 1e9))
    hi2 = Vector((-1e9, -1e9, -1e9))
    for v in obj.data.vertices:
        for i in range(3):
            lo2[i] = min(lo2[i], v.co[i])
            hi2[i] = max(hi2[i], v.co[i])
    final_tris = sum(max(1, len(p.vertices) - 2) for p in obj.data.polygons)

    # Export clean standalone optimized GLB (with JPEG textures for super fast WebGL load!)
    bpy.ops.export_scene.gltf(
        filepath=str(spec['out']),
        export_format='GLB',
        export_yup=True,
        export_apply=True,
        export_materials='EXPORT',
        export_image_format='JPEG',
        export_image_quality=88,
    )
    kb = spec['out'].stat().st_size / 1024.0
    print(f'PREPARED {key}: {orig_tris} -> {final_tris} tris | size=({hi2.x-lo2.x:.2f}, {hi2.y-lo2.y:.2f}, {hi2.z-lo2.z:.2f})m | glb={kb:.1f} KB')


def main():
    for spec in TRIPO_SPECS:
        process_castle(spec)
    print('ALL_TRIPO_PREPARED')


if __name__ == '__main__':
    main()
