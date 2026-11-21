"""レアのカードを、本物の立体（板・青い金属枠・銀の翼・銀の飾り帯・名前欄・メダル・銀の縁・宝石の台座・ファセットサファイア）で作り、card-rare.glb に書き出す。

使い方（リポジトリのルートで）：
  blender --background --python assets/models/make-card-rare.py

位置と大きさは、枠の絵 assets/cards/frame-rare.png（512×768）を測って決めた。
マテリアル名（three.js 側は名前で材質を決める）：
  face        … 表の絵（青い枠の表・絵の窓の奥・名前欄・下の欄・メダルの中）
  silver_face … 銀の翼・側面の銀の飾り帯（表の絵を活かしたまま、銀の金属反射と光沢を乗せる）
  back        … 裏の絵
  metal_blue  … 青い金属枠の側面・段差の壁（深いコバルトブルーの金属）
  silver      … 純銀の金具（宝石の台座・爪・メダルの輪・窓と欄の縁）
  foil        … 宝石の奥のファセット反射箔（氷銀色）
  gem         … 宝石（縦長ひし形ブリリアントカットのサファイア）
"""
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

try:
    REPO = Path(__file__).resolve().parents[2]
except NameError:
    REPO = Path(globals().get('REPO', '.'))

MODELS_DIR = REPO / 'assets/models'
if str(MODELS_DIR) not in sys.path:
    sys.path.insert(0, str(MODELS_DIR))

import card_model_lib as lib  # noqa: E402

FRAME_PNG = REPO / 'assets/cards/frame-rare.png'
OUT = REPO / 'assets/models/card-rare.glb'
PREVIEW_FACE = globals().get('PREVIEW_FACE')

# ---- 厚み（手前が -Y）----
BACK_Y = 0.0275
SLAB_FRONT = -0.0105
FRAME_TOP = -0.0275
PLATE_TOP = -0.0225
MEDAL_TOP = -0.0240

# ---- 測った位置（frame-rare.png 512×768 のピクセル）----
BODY = (28, 42, 483, 740, 12)
WINDOW = (76, 118, 434, 484, 7)
NAME = (75, 514, 435, 590, 12)
STAT = (74, 631, 437, 707, 12)
MEDAL = (96, 106, 33.5, 42.5)
GEM = (255.5, 70.5)
SETTING_OUT_RX, SETTING_OUT_RY = 49.0, 63.5
SETTING_IN_RX, SETTING_IN_RY = 33.5, 45.5
GIRDLE_RX, GIRDLE_RY = 31.0, 42.5


def make_materials():
    mats = {
        'face': lib.material('face', (0.75, 0.80, 0.90), roughness=0.58),
        'silver_face': lib.material('silver_face', (0.86, 0.89, 0.95), metallic=0.35, roughness=0.22, **{'Coat Weight': 0.6}),
        'back': lib.material('back', (0.15, 0.21, 0.33), roughness=0.52),
        'metal_blue': lib.material('metal_blue', (0.05, 0.16, 0.48), metallic=0.72, roughness=0.30),
        'silver': lib.material('silver', (0.84, 0.88, 0.96), metallic=1.0, roughness=0.16),
        'gem': lib.material('gem', (0.06, 0.36, 0.98), roughness=0.02, **{'Transmission Weight': 0.92, 'IOR': 1.77}),
        'foil': lib.material('foil', (0.72, 0.88, 1.00), metallic=1.0, roughness=0.10),
    }
    lib.attach_preview_textures(
        mats, ('face', 'silver_face'), PREVIEW_FACE,
        REPO / 'assets/ui/card-back.png' if PREVIEW_FACE else None,
    )
    return mats


def silver_ornament_masks(rgba):
    """枠の絵から「銀の翼（上部）」と「側面の銀の飾り帯・角金具」のマスクを抽出する。"""
    r, g, b, a = rgba[..., 0], rgba[..., 1], rgba[..., 2], rgba[..., 3]
    h, w = a.shape
    yy, xx = np.mgrid[0:h, 0:w]

    # 銀色：明るく、青すぎず（コバルト青を除外）、黄色すぎない（クリーム欄を除外）
    lum = (r + g + b) / 3.0
    is_silver = (a > 0.6) & (lum > 0.42) & ((b - r) < 0.24) & ((r - b) < 0.10)

    # 窓・名前欄・下の欄・メダル・宝石台座の内側は除外
    def in_rect(rect, pad=3.0):
        x0, y0, x1, y1, _ = rect
        return (xx >= x0 - pad) & (xx <= x1 + pad) & (yy >= y0 - pad) & (yy <= y1 + pad)

    exclude = in_rect(WINDOW, 4.0) | in_rect(NAME, 3.0) | in_rect(STAT, 3.0)
    exclude |= np.hypot(xx - MEDAL[0], yy - MEDAL[1]) <= MEDAL[3] + 3.0
    # ひし形の宝石台座の内側
    exclude |= (np.abs(xx - GEM[0]) / (SETTING_OUT_RX + 1.5) + np.abs(yy - GEM[1]) / (SETTING_OUT_RY + 1.5)) <= 1.0

    m = is_silver & (~exclude)
    # 細いノイズ線を除去して滑らかに
    m = ~lib.shift_or(~m)
    for _ in range(2):
        m = lib.shift_or(m)
    m &= lib.shift_or(is_silver & (~exclude))
    m = ~lib.shift_or(~m)

    # 上部の銀の翼（y < 132 かつ x が中央寄り 105..407）
    wings_mask = m & (yy < 132) & (xx > 105) & (xx < 407)
    # それ以外の側面・角の銀の飾り帯（外枠の細い直線縁を除くため面積閾値を少し上げる）
    clasps_mask = m & (~wings_mask)
    return wings_mask, clasps_mask


def build():
    scene = lib.fresh_scene('CardRare', 'card-rare')
    mats = make_materials()
    rgba = lib.load_rgba(FRAME_PNG)
    parts = []

    # 1) 板（本体の外形。裏に裏の絵）
    x0, y0, x1, y1, r = BODY
    slab = lib.slab_from_loops('slab', [lib.rounded_rect(x0, y0, x1, y1, r, 5)], SLAB_FRONT - 0.0010, BACK_Y, 0.0038, resolution=1)
    bx0, bz1 = lib.to_xz(x0, y0)
    bx1, bz0 = lib.to_xz(x1, y1)

    def slab_uv(kind, c):
        if kind == 'back':
            return 1 - (c.x - bx0) / (bx1 - bx0), (c.z - bz0) / (bz1 - bz0)
        return lib.face_uv(c.x, c.z)

    lib.assign(slab, mats, lambda n, c: 'face' if n.y < -0.7 else 'back' if n.y > 0.7 else 'metal_blue', slab_uv)
    lib.smooth_by_angle(slab, 40)
    parts.append(slab)

    # 2) 青い金属枠（絵の外形どおり。翼や台座のはみ出しも含む）
    outline = [tuple(p) for p in lib.frame_outline(rgba, spacing=2.4, eps=0.55)]
    holes = [
        lib.window_medal_hole(WINDOW, MEDAL),
        lib.rounded_rect(*lib.grow(NAME, -1.5), 5),
        lib.rounded_rect(*lib.grow(STAT, -1.5), 5),
    ]
    frame = lib.slab_from_loops('frame', [outline, *holes], FRAME_TOP, SLAB_FRONT + 0.0010, 0.0028, resolution=1)
    inner = (bx0 + 0.004, bz0 + 0.004, bx1 - 0.004, bz1 - 0.004)
    lib.cull(frame, lambda n, c: n.y > 0.5 and inner[0] < c.x < inner[2] and inner[1] < c.z < inner[3])
    lib.assign(frame, mats, lambda n, c: 'face' if n.y < -0.45 else 'metal_blue')
    lib.smooth_by_angle(frame, 38)
    parts.append(frame)

    # 2b) 銀の翼（上部・高めに立体盛り上げ）＆銀の飾り帯（側面・角）
    wings_mask, clasps_mask = silver_ornament_masks(rgba)
    wing_objs = []
    for i, loop in enumerate(lib.connected_loops(wings_mask, min_pixels=120, spacing=2.6, smooth=3, eps=0.65, min_pts=6)):
        wing_objs.append(lib.slab_from_loops(f'wing-{i}', [[tuple(q) for q in loop]], FRAME_TOP - 0.0072, FRAME_TOP + 0.0020, 0.0034, resolution=1))
    if wing_objs:
        wings = lib.join(wing_objs, 'wings')
        lib.cull(wings, lambda n, c: n.y > 0.2)
        lib.assign(wings, mats, lambda n, c: 'silver_face' if n.y < -0.35 else 'silver')
        lib.smooth_by_angle(wings, 55)
        parts.append(wings)

    clasp_objs = []
    for i, loop in enumerate(lib.connected_loops(clasps_mask, min_pixels=160, spacing=2.8, smooth=3, eps=0.75, min_pts=6)):
        clasp_objs.append(lib.slab_from_loops(f'clasp-{i}', [[tuple(q) for q in loop]], FRAME_TOP - 0.0042, FRAME_TOP + 0.0020, 0.0024, resolution=1))
    if clasp_objs:
        clasps = lib.join(clasp_objs, 'clasps')
        lib.cull(clasps, lambda n, c: n.y > 0.2)
        lib.assign(clasps, mats, lambda n, c: 'silver_face' if n.y < -0.35 else 'silver')
        lib.smooth_by_angle(clasps, 50)
        parts.append(clasps)

    # 3) 名前欄・下の欄・メダルの中
    for name, rect in (('name-plate', NAME), ('stat-plate', STAT)):
        plate = lib.slab_from_loops(name, [lib.rounded_rect(*lib.grow(rect, -1.0), 5)], PLATE_TOP, SLAB_FRONT, 0.0018, resolution=1)
        lib.assign(plate, mats, lambda n, c: 'face' if n.y < -0.45 else 'metal_blue')
        lib.smooth_by_angle(plate, 40)
        parts.append(plate)
    medal = lib.slab_from_loops('medal-disc', [lib.circle(MEDAL[0], MEDAL[1], MEDAL[2] + 2.5, 36)], MEDAL_TOP, SLAB_FRONT, 0.0016, resolution=1)
    lib.assign(medal, mats, lambda n, c: 'face' if n.y < -0.45 else 'metal_blue')
    lib.smooth_by_angle(medal, 40)
    parts.append(medal)

    # 4) 銀の縁：窓・名前欄・下の欄・メダル
    rim_window = lib.metal_rim(
        'rim-window',
        lib.rect_xz(lib.grow(WINDOW, 1.5), steps=5, spacing=18.0, fine_near=(MEDAL[0], MEDAL[1]), fine_radius=MEDAL[3] + 18.0, fine_spacing=8.0),
        mats['silver'], 0.0082, 0.0044, FRAME_TOP,
    )
    mcx, mcz = lib.to_xz(MEDAL[0], MEDAL[1])
    gcx, gcz = lib.to_xz(*GEM)
    grx, grz = (SETTING_OUT_RX + 1.5) / lib.PX, (SETTING_OUT_RY + 1.5) / lib.PX
    lib.cull(
        rim_window,
        lambda n, c: math.hypot(c.x - mcx, c.z - mcz) < (MEDAL[3] + 1.0) / lib.PX
        or (abs(c.x - gcx) / grx + abs(c.z - gcz) / grz) < 1.0,
    )
    parts.append(rim_window)
    parts.append(lib.metal_rim('rim-name', lib.rect_xz(lib.grow(NAME, -1.0), steps=5), mats['silver'], 0.0074, 0.0038, FRAME_TOP + 0.0012))
    parts.append(lib.metal_rim('rim-stat', lib.rect_xz(lib.grow(STAT, -1.0), steps=5), mats['silver'], 0.0074, 0.0038, FRAME_TOP + 0.0012))
    mc = Vector(lib.to_xz(MEDAL[0], MEDAL[1]))
    ring_pts = [mc + Vector((math.cos(a), math.sin(a))) * ((MEDAL[2] + MEDAL[3]) / 2 / lib.PX) for a in [-2 * math.pi * i / 44 for i in range(44)]]
    parts.append(lib.metal_rim('rim-medal', ring_pts, mats['silver'], (MEDAL[3] - MEDAL[2]) / lib.PX, 0.0068, FRAME_TOP + 0.0010))

    # 5) 銀のひし形台座・ファセット氷銀箔・爪、縦長サファイア宝石
    parts.extend(lib.build_diamond_setting(
        mats['silver'], mats['foil'], GEM,
        SETTING_OUT_RX, SETTING_OUT_RY, SETTING_IN_RX, SETTING_IN_RY,
        GIRDLE_RX, GIRDLE_RY, FRAME_TOP, rim_height=0.0110,
    ))
    parts.append(lib.build_diamond_gem(
        mats['gem'], GEM, GIRDLE_RX, GIRDLE_RY, table_ratio=0.44,
        frame_top=FRAME_TOP, crown_height=0.0230, pavilion_depth=0.0255,
    ))

    root = bpy.data.objects.new('card-rare', None)
    scene.collection.objects.link(root)
    for p in parts:
        p.parent = root
    return root, parts


if __name__ == '__main__' or globals().get('RUN_BUILD'):
    if bpy.app.background and not globals().get('RUN_BUILD'):
        bpy.ops.wm.read_factory_settings(use_empty=True)
    root, parts = build()
    if globals().get('DO_EXPORT', True):
        lib.export_glb(root, OUT)
    tris = sum(sum(len(poly.vertices) - 2 for poly in p.data.polygons) for p in parts)
    print('rare parts', len(parts), tris, 'tris')
