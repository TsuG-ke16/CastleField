"""スペシャルカードを、本物の立体（板・虹結晶の重厚枠・真珠金の翼と渦巻リボン・名前欄・メダル・真珠金の縁・ひし形台座と爪・大型ファセット虹宝石）で作り、card-special.glb に書き出す。

使い方（リポジトリのルートで）：
  blender --background --python assets/models/make-card-special.py

位置と大きさは、枠の絵 assets/cards/frame-special.png（512×768）を測って決めた。
マテリアル名（three.js 側は名前で材質を決める）：
  face             … 表の絵（絵の窓の奥・名前欄・下の欄・メダルの中。読みやすさを保つマット寄り質感）
  prism_frame_face … 虹結晶の外枠表（元絵の虹グラデーションを活かしつつ、玉虫色の干渉光沢を乗せる）
  prism_metal_face … 上部の翼・側面リボン・角の羽飾り（元絵のパール金の陰影を活かしつつ、重厚なパール金＋玉虫反射）
  back             … 裏の絵
  prism_edge       … 枠の側面・段差の壁（深みのあるアメジスト・パール金属）
  pearl_gold       … 純パールシャンパンゴールドの金具（宝石の台座・爪・メダルの輪・窓と欄の縁）
  prism_foil       … 宝石奥のファセット虹反射箔（玉虫色に光を返す）
  prism_gem        … 大型ファセットカットのプリズムダイヤモンド（IOR 2.42・物理イリデッセンス＆分散）
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

FRAME_PNG = REPO / 'assets/cards/frame-special.png'
OUT = REPO / 'assets/models/card-special.glb'
PREVIEW_FACE = globals().get('PREVIEW_FACE')

# ---- 厚み（手前が -Y）----
BACK_Y = 0.0275
SLAB_FRONT = -0.0105
FRAME_TOP = -0.0275
PLATE_TOP = -0.0225
MEDAL_TOP = -0.0240

# ---- 測った位置（frame-special.png 512×768 のピクセル）----
BODY = (22, 42, 489, 746, 18)
WINDOW = (76, 118, 435, 484, 8)
NAME = (75, 514, 436, 590, 12)
STAT = (74, 632, 437, 707, 12)
MEDAL = (90.0, 106.0, 34.0, 43.0)
GEM = (256.0, 61.5)
SETTING_OUT_RX, SETTING_OUT_RY = 48.5, 55.0
SETTING_IN_RX, SETTING_IN_RY = 32.5, 36.5
GIRDLE_RX, GIRDLE_RY = 30.5, 34.5


def make_materials():
    mats = {
        'face': lib.material('face', (0.88, 0.84, 0.78), roughness=0.66),
        'prism_frame_face': lib.material('prism_frame_face', (0.82, 0.68, 0.94), metallic=0.28, roughness=0.18, **{'Coat Weight': 0.9, 'Coat Roughness': 0.06}),
        'prism_metal_face': lib.material('prism_metal_face', (0.95, 0.84, 0.86), metallic=0.52, roughness=0.16, **{'Coat Weight': 0.85, 'Coat Roughness': 0.06}),
        'back': lib.material('back', (0.28, 0.16, 0.36), roughness=0.50),
        'prism_edge': lib.material('prism_edge', (0.32, 0.18, 0.44), metallic=0.78, roughness=0.22, **{'Coat Weight': 0.6}),
        'pearl_gold': lib.material('pearl_gold', (0.96, 0.82, 0.72), metallic=1.0, roughness=0.14, **{'Coat Weight': 0.45}),
        'prism_foil': lib.material('prism_foil', (0.86, 0.92, 1.00), metallic=1.0, roughness=0.08),
        'prism_gem': lib.material('prism_gem', (0.76, 0.88, 1.00), roughness=0.015, **{'Transmission Weight': 0.95, 'IOR': 2.42, 'Coat Weight': 1.0}),
    }
    lib.attach_preview_textures(
        mats, ('face', 'prism_frame_face', 'prism_metal_face'), PREVIEW_FACE,
        REPO / 'assets/ui/card-back.png' if PREVIEW_FACE else None,
    )
    return mats


def special_ornament_masks(rgba):
    """枠の絵から「上部の真珠金の翼」と「側面の渦巻リボン・下角の羽飾り」を抽出する。"""
    r, g, b, a = rgba[..., 0], rgba[..., 1], rgba[..., 2], rgba[..., 3]
    h, w = a.shape
    yy, xx = np.mgrid[0:h, 0:w]

    def in_rect(rect, pad=3.0):
        x0, y0, x1, y1, _ = rect
        return (xx >= x0 - pad) & (xx <= x1 + pad) & (yy >= y0 - pad) & (yy <= y1 + pad)

    excl = in_rect(WINDOW, 4.0) | in_rect(NAME, 3.0) | in_rect(STAT, 3.0)
    excl |= np.hypot(xx - MEDAL[0], yy - MEDAL[1]) <= MEDAL[3] + 3.0
    excl |= (np.abs(xx - GEM[0]) / (SETTING_OUT_RX + 1.5) + np.abs(yy - GEM[1]) / (SETTING_OUT_RY + 1.5)) <= 1.0

    # パール・ローズゴールド装飾：明るく、赤み・白みが高い（彩度の強い紫・青・黄緑の結晶帯と区別）
    lum = (r + g + b) / 3.0
    is_pearl = (a > 0.65) & (lum > 0.64) & (r > 0.68) & ((r - g) < 0.34) & ((b - r) < 0.16) & (~excl)
    m = ~lib.shift_or(~is_pearl)
    for _ in range(2):
        m = lib.shift_or(m)
    m &= lib.shift_or(is_pearl)
    m = ~lib.shift_or(~m)

    # 上部の大きな翼（y < 145）
    wings_mask = m & (yy < 145)
    # 側面の螺旋リボン・下角の羽飾り（y >= 145）
    ribbons_mask = m & (yy >= 145)
    return wings_mask, ribbons_mask


def build():
    scene = lib.fresh_scene('CardSpecial', 'card-special')
    mats = make_materials()
    rgba = lib.load_rgba(FRAME_PNG)
    parts = []

    # 1) 板（本体の外形。裏に裏の絵、側面はアメジストパール金属）
    x0, y0, x1, y1, r = BODY
    slab = lib.slab_from_loops('slab', [lib.rounded_rect(x0, y0, x1, y1, r, 6)], SLAB_FRONT - 0.0010, BACK_Y, 0.0040, resolution=1)
    bx0, bz1 = lib.to_xz(x0, y0)
    bx1, bz0 = lib.to_xz(x1, y1)

    def slab_uv(kind, c):
        if kind == 'back':
            return 1 - (c.x - bx0) / (bx1 - bx0), (c.z - bz0) / (bz1 - bz0)
        return lib.face_uv(c.x, c.z)

    lib.assign(slab, mats, lambda n, c: 'face' if n.y < -0.7 else 'back' if n.y > 0.7 else 'prism_edge', slab_uv)
    lib.smooth_by_angle(slab, 40)
    parts.append(slab)

    # 2) 外枠（絵の外形どおり。虹結晶の柱・翼・宝石台座のはみ出しを含む）
    outline = [tuple(p) for p in lib.frame_outline(rgba, spacing=2.4, eps=0.55)]
    holes = [
        lib.window_medal_hole(WINDOW, MEDAL),
        lib.rounded_rect(*lib.grow(NAME, -1.5), 5),
        lib.rounded_rect(*lib.grow(STAT, -1.5), 5),
    ]
    frame = lib.slab_from_loops('frame', [outline, *holes], FRAME_TOP, SLAB_FRONT + 0.0010, 0.0030, resolution=1)
    inner = (bx0 + 0.004, bz0 + 0.004, bx1 - 0.004, bz1 - 0.004)
    lib.cull(frame, lambda n, c: n.y > 0.5 and inner[0] < c.x < inner[2] and inner[1] < c.z < inner[3])
    lib.assign(frame, mats, lambda n, c: 'prism_frame_face' if n.y < -0.45 else 'prism_edge')
    lib.smooth_by_angle(frame, 38)
    parts.append(frame)

    # 2b) 上部の大きな真珠金の翼（高めに立体盛り上げ）＆側面の螺旋リボン・下角の羽飾り
    wings_mask, ribbons_mask = special_ornament_masks(rgba)
    wing_objs = []
    for i, loop in enumerate(lib.connected_loops(wings_mask, min_pixels=120, spacing=2.8, smooth=3, eps=0.70, min_pts=6)):
        wing_objs.append(lib.slab_from_loops(f'wing-{i}', [[tuple(q) for q in loop]], FRAME_TOP - 0.0085, FRAME_TOP + 0.0020, 0.0036, resolution=1))
    if wing_objs:
        wings = lib.join(wing_objs, 'wings')
        lib.cull(wings, lambda n, c: n.y > 0.2)
        lib.assign(wings, mats, lambda n, c: 'prism_metal_face' if n.y < -0.35 else 'pearl_gold')
        lib.smooth_by_angle(wings, 55)
        parts.append(wings)

    rib_objs = []
    for i, loop in enumerate(lib.connected_loops(ribbons_mask, min_pixels=140, spacing=3.0, smooth=3, eps=0.80, min_pts=6)):
        rib_objs.append(lib.slab_from_loops(f'rib-{i}', [[tuple(q) for q in loop]], FRAME_TOP - 0.0056, FRAME_TOP + 0.0020, 0.0028, resolution=1))
    if rib_objs:
        ribbons = lib.join(rib_objs, 'ribbons')
        lib.cull(ribbons, lambda n, c: n.y > 0.2)
        lib.assign(ribbons, mats, lambda n, c: 'prism_metal_face' if n.y < -0.35 else 'pearl_gold')
        lib.smooth_by_angle(ribbons, 50)
        parts.append(ribbons)

    # 3) 名前欄・下の欄・メダルの中（テキスト可読性を守るため標準 face マテリアル）
    for name, rect in (('name-plate', NAME), ('stat-plate', STAT)):
        plate = lib.slab_from_loops(name, [lib.rounded_rect(*lib.grow(rect, -1.0), 5)], PLATE_TOP, SLAB_FRONT, 0.0018, resolution=1)
        lib.assign(plate, mats, lambda n, c: 'face' if n.y < -0.45 else 'prism_edge')
        lib.smooth_by_angle(plate, 40)
        parts.append(plate)
    medal = lib.slab_from_loops('medal-disc', [lib.circle(MEDAL[0], MEDAL[1], MEDAL[2] + 2.5, 36)], MEDAL_TOP, SLAB_FRONT, 0.0016, resolution=1)
    lib.assign(medal, mats, lambda n, c: 'face' if n.y < -0.45 else 'prism_edge')
    lib.smooth_by_angle(medal, 40)
    parts.append(medal)

    # 4) パールゴールドの縁：窓・名前欄・下の欄・メダル
    rim_window = lib.metal_rim(
        'rim-window',
        lib.rect_xz(lib.grow(WINDOW, 1.5), steps=5, spacing=18.0, fine_near=(MEDAL[0], MEDAL[1]), fine_radius=MEDAL[3] + 18.0, fine_spacing=8.0),
        mats['pearl_gold'], 0.0084, 0.0046, FRAME_TOP,
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
    parts.append(lib.metal_rim('rim-name', lib.rect_xz(lib.grow(NAME, -1.0), steps=5), mats['pearl_gold'], 0.0076, 0.0040, FRAME_TOP + 0.0012))
    parts.append(lib.metal_rim('rim-stat', lib.rect_xz(lib.grow(STAT, -1.0), steps=5), mats['pearl_gold'], 0.0076, 0.0040, FRAME_TOP + 0.0012))
    mc = Vector(lib.to_xz(MEDAL[0], MEDAL[1]))
    ring_pts = [mc + Vector((math.cos(a), math.sin(a))) * ((MEDAL[2] + MEDAL[3]) / 2 / lib.PX) for a in [-2 * math.pi * i / 44 for i in range(44)]]
    parts.append(lib.metal_rim('rim-medal', ring_pts, mats['pearl_gold'], (MEDAL[3] - MEDAL[2]) / lib.PX, 0.0074, FRAME_TOP + 0.0008))

    # 5) パールゴールドの重厚ひし形台座・爪・虹反射箔、大型プリズムダイヤモンド
    parts.extend(lib.build_diamond_setting(
        mats['pearl_gold'], mats['prism_foil'], GEM,
        SETTING_OUT_RX, SETTING_OUT_RY, SETTING_IN_RX, SETTING_IN_RY,
        GIRDLE_RX, GIRDLE_RY, FRAME_TOP - 0.0010, rim_height=0.0120,
    ))
    parts.append(lib.build_diamond_gem(
        mats['prism_gem'], GEM, GIRDLE_RX, GIRDLE_RY, table_ratio=0.42,
        frame_top=FRAME_TOP - 0.0010, crown_height=0.0250, pavilion_depth=0.0265,
        name='prism-gem',
    ))

    root = bpy.data.objects.new('card-special', None)
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
    print('special parts', len(parts), tris, 'tris')
