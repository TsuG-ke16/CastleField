"""アンコモンのカードを、本物の立体（板・木枠・葉・名前欄・メダル・金の縁・宝石の台座・ファセット宝石）で作り、card-uncommon.glb に書き出す。

使い方（リポジトリのルートで）：
  blender --background --python assets/models/make-card-uncommon.py
  （Blender の「スクリプト」タブで開いて実行してもよい。そのときは書き出しのあと、確認用の場面が残る）

位置と大きさは、枠の絵 assets/cards/frame-uncommon.png（512×768）を測って決めた。
マテリアル名（three.js 側は名前で材質を決める）：
  face … 表の絵（木枠の上・絵の窓の奥・名前欄・下の欄・メダルの中）。マットな木・羊皮紙の質感
  leaf … 葉とつるの表（同じ表の絵を貼るが、木枠よりわずかに艶のある植物の質感）
  back … 裏の絵。UV は本体の外形の 0〜1（裏から見て正しい向き）
  wood … 木の側面・段差の壁（濃い茶色・マット）
  gold … 金具（宝石の台座・爪・メダルの輪・窓と欄の縁）
  foil … 宝石の奥のファセット反射箔（光を面ごとに返す）
  gem  … 宝石（エメラルド・フラットシェードのファセットカット）
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

FRAME_PNG = REPO / 'assets/cards/frame-uncommon.png'
OUT = REPO / 'assets/models/card-uncommon.glb'
PREVIEW_FACE = globals().get('PREVIEW_FACE')

# ---- 厚み（手前が -Y）----
BACK_Y = 0.0275
SLAB_FRONT = -0.0105
FRAME_TOP = -0.0275
PLATE_TOP = -0.0225
MEDAL_TOP = -0.0240

# ---- 測った位置（枠の絵のピクセル）----
BODY = (22, 41, 489, 754, 22)
WINDOW = (76, 118, 435, 485, 7)
NAME = (76, 514, 435, 590, 12)
STAT = (75, 632, 437, 707, 12)
MEDAL = (96, 106, 33.5, 42.5)
GEM = (256, 53)
SETTING_OUT, SETTING_IN = 47.0, 36.0
GIRDLE = 33.5


def make_materials():
    mats = {
        'face': lib.material('face', (0.8, 0.7, 0.55), roughness=0.72),
        'leaf': lib.material('leaf', (0.45, 0.75, 0.25), roughness=0.38, **{'Coat Weight': 0.25}),
        'back': lib.material('back', (0.30, 0.17, 0.08), roughness=0.55),
        'wood': lib.material('wood', (0.115, 0.047, 0.018), roughness=0.78),
        'gold': lib.material('gold', (0.96, 0.66, 0.22), metallic=1.0, roughness=0.18),
        'gem': lib.material('gem', (0.12, 0.84, 0.14), roughness=0.02, **{'Transmission Weight': 0.90, 'IOR': 1.57}),
        'foil': lib.material('foil', (0.76, 0.96, 0.48), metallic=1.0, roughness=0.12),
    }
    lib.attach_preview_textures(
        mats, ('face', 'leaf'), PREVIEW_FACE,
        REPO / 'assets/ui/card-back.png' if PREVIEW_FACE else None,
    )
    return mats


def leaf_outlines(rgba):
    """葉とつる（緑の所）の塊ごとの外周。細い線・宝石台座・メダル輪は除く"""
    r, g, b, a = rgba[..., 0], rgba[..., 1], rgba[..., 2], rgba[..., 3]
    mask = (a > 0.5) & (g > r * 0.95) & (g > b * 1.4) & (g > 0.27)
    h, w = mask.shape
    yy, xx = np.mgrid[0:h, 0:w]
    mask &= (np.abs(xx - GEM[0]) + np.abs(yy - GEM[1])) > SETTING_OUT + 2
    mask &= np.hypot(xx - MEDAL[0], yy - MEDAL[1]) > MEDAL[3] + 2
    m = mask
    for _ in range(2):
        m = ~lib.shift_or(~m)
    for _ in range(3):
        m = lib.shift_or(m)
    m &= lib.shift_or(mask)
    m = ~lib.shift_or(~m)
    return lib.connected_loops(m, min_pixels=60, spacing=2.6, smooth=3, eps=0.70, min_pts=6)


def build():
    scene = lib.fresh_scene('CardUncommon', 'card-uncommon')
    mats = make_materials()
    rgba = lib.load_rgba(FRAME_PNG)
    parts = []

    # 1) 板（本体の外形。裏に裏の絵）
    x0, y0, x1, y1, r = BODY
    slab = lib.slab_from_loops('slab', [lib.rounded_rect(x0, y0, x1, y1, r, 6)], SLAB_FRONT - 0.0010, BACK_Y, 0.0040, resolution=1)
    bx0, bz1 = lib.to_xz(x0, y0)
    bx1, bz0 = lib.to_xz(x1, y1)

    def slab_uv(kind, c):
        if kind == 'back':
            return 1 - (c.x - bx0) / (bx1 - bx0), (c.z - bz0) / (bz1 - bz0)
        return lib.face_uv(c.x, c.z)

    lib.assign(slab, mats, lambda n, c: 'face' if n.y < -0.7 else 'back' if n.y > 0.7 else 'wood', slab_uv)
    lib.smooth_by_angle(slab, 40)
    parts.append(slab)

    # 2) 木枠（絵の外形どおり。窓・2つの欄・メダルは穴）
    outline = [tuple(p) for p in lib.frame_outline(rgba, spacing=2.4, eps=0.55)]
    holes = [
        lib.window_medal_hole(WINDOW, MEDAL),
        lib.rounded_rect(*lib.grow(NAME, -1.5), 5),
        lib.rounded_rect(*lib.grow(STAT, -1.5), 5),
    ]
    frame = lib.slab_from_loops('frame', [outline, *holes], FRAME_TOP, SLAB_FRONT + 0.0010, 0.0030, resolution=1)
    inner = (bx0 + 0.004, bz0 + 0.004, bx1 - 0.004, bz1 - 0.004)
    lib.cull(frame, lambda n, c: n.y > 0.5 and inner[0] < c.x < inner[2] and inner[1] < c.z < inner[3])
    lib.assign(frame, mats, lambda n, c: 'face' if n.y < -0.45 else 'wood')
    lib.smooth_by_angle(frame, 40)
    parts.append(frame)

    # 2b) 葉とつる：木枠の上にふっくら盛り上げる（木と質感差を出すため leaf マテリアル）
    leaves = []
    for i, loop in enumerate(leaf_outlines(rgba)):
        leaves.append(lib.slab_from_loops(f'leaf-{i}', [[tuple(q) for q in loop]], FRAME_TOP - 0.0052, FRAME_TOP + 0.0020, 0.0030, resolution=1))
    leaf = lib.join(leaves, 'leaves')
    lib.cull(leaf, lambda n, c: n.y > 0.2)
    lib.assign(leaf, mats, lambda n, c: 'leaf')
    lib.smooth_by_angle(leaf, 60)
    parts.append(leaf)

    # 3) 名前欄・下の欄・メダルの中
    for name, rect in (('name-plate', NAME), ('stat-plate', STAT)):
        plate = lib.slab_from_loops(name, [lib.rounded_rect(*lib.grow(rect, -1.0), 5)], PLATE_TOP, SLAB_FRONT, 0.0018, resolution=1)
        lib.assign(plate, mats, lambda n, c: 'face' if n.y < -0.45 else 'wood')
        lib.smooth_by_angle(plate, 40)
        parts.append(plate)
    medal = lib.slab_from_loops('medal-disc', [lib.circle(MEDAL[0], MEDAL[1], MEDAL[2] + 2.5, 36)], MEDAL_TOP, SLAB_FRONT, 0.0016, resolution=1)
    lib.assign(medal, mats, lambda n, c: 'face' if n.y < -0.45 else 'wood')
    lib.smooth_by_angle(medal, 40)
    parts.append(medal)

    # 4) 金の縁：窓・名前欄・下の欄・メダル
    rim_window = lib.metal_rim(
        'rim-window',
        lib.rect_xz(lib.grow(WINDOW, 1.5), steps=5, spacing=120.0, fine_near=(MEDAL[0], MEDAL[1]), fine_radius=MEDAL[3] + 18.0, fine_spacing=8.0),
        mats['gold'], 0.0080, 0.0044, FRAME_TOP,
    )
    mcx, mcz = lib.to_xz(MEDAL[0], MEDAL[1])
    lib.cull(rim_window, lambda n, c: math.hypot(c.x - mcx, c.z - mcz) < (MEDAL[3] + 1.0) / lib.PX)
    parts.append(rim_window)
    parts.append(lib.metal_rim('rim-name', lib.rect_xz(lib.grow(NAME, -1.0), steps=5), mats['gold'], 0.0072, 0.0038, FRAME_TOP + 0.0012))
    parts.append(lib.metal_rim('rim-stat', lib.rect_xz(lib.grow(STAT, -1.0), steps=5), mats['gold'], 0.0072, 0.0038, FRAME_TOP + 0.0012))
    mc = Vector(lib.to_xz(MEDAL[0], MEDAL[1]))
    ring_pts = [mc + Vector((math.cos(a), math.sin(a))) * ((MEDAL[2] + MEDAL[3]) / 2 / lib.PX) for a in [-2 * math.pi * i / 44 for i in range(44)]]
    parts.append(lib.metal_rim('rim-medal', ring_pts, mats['gold'], (MEDAL[3] - MEDAL[2]) / lib.PX, 0.0068, FRAME_TOP + 0.0010))

    # 5) 宝石の台座・ファセット箔・爪、カット宝石
    parts.extend(lib.build_diamond_setting(
        mats['gold'], mats['foil'], GEM,
        SETTING_OUT, SETTING_OUT, SETTING_IN, SETTING_IN,
        GIRDLE, GIRDLE, FRAME_TOP, rim_height=0.0092,
    ))
    parts.append(lib.build_diamond_gem(
        mats['gem'], GEM, GIRDLE, GIRDLE, table_ratio=0.45,
        frame_top=FRAME_TOP, crown_height=0.0205, pavilion_depth=0.0235,
    ))

    root = bpy.data.objects.new('card-uncommon', None)
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
    print('uncommon parts', len(parts), tris, 'tris')
