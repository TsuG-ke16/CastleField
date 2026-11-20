"""魔物（ビースト）カードを、本物の立体（板・紅水晶のギザギザ枠・金の爪と角飾り・肉球紋章メダリオン・8個のファセット紅宝石と台座）で作り、card-beast.glb に書き出す。

使い方（リポジトリのルートで）：
  blender --background --python assets/models/make-card-beast.py

位置と大きさは、枠の絵 assets/cards/frame-beast.png（512×768）を測って決めた。
マテリアル名（three.js 側は名前で材質を決める）：
  face          … 表の絵（絵の窓の奥・名前欄・下の欄・メダルの中・枠の地）
  crystal_face  … 紅水晶の角・刃・結晶枠（表の絵を活かしたまま、鋭い紅水晶のクリアコート光沢を乗せる）
  gold_face     … 金の爪・角・肉球レリーフの表（表の絵の線画と陰影を活かしたまま、重厚な金の金属反射を乗せる）
  back          … 裏の絵
  obsidian_red  … 枠の側面・段差の壁（黒曜石のように暗い深紅の金属質）
  gold          … 純金の金具（肉球メダリオンの輪・メダル輪・窓と欄の縁・宝石の台座）
  foil          … 宝石の奥のファセット反射箔（紅金色）
  gem           … 8個のファセットカット紅宝石（ブラッドルビー・IOR 1.77）
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

FRAME_PNG = REPO / 'assets/cards/frame-beast.png'
OUT = REPO / 'assets/models/card-beast.glb'
PREVIEW_FACE = globals().get('PREVIEW_FACE')

# ---- 厚み（手前が -Y）----
BACK_Y = 0.0275
SLAB_FRONT = -0.0105
FRAME_TOP = -0.0275
PLATE_TOP = -0.0225
MEDAL_TOP = -0.0240

# ---- 測った位置（frame-beast.png 512×768 のピクセル）----
BODY = (28, 46, 483, 738, 16)
WINDOW = (80, 142, 431, 487, 14)
NAME = (66, 530, 445, 616, 18)
STAT = (58, 644, 453, 720, 18)
MEDAL = (97.5, 108.0, 33.5, 43.0)
PAW = (255.5, 101.0, 38.5, 49.0)   # 中央上部の肉球メダリオン：中心 x, y、内の半径、金の輪の外の半径

# 8個のファセット紅宝石：(名前, (cx, cy), girdle_rx, girdle_ry, bezel_out_rx, bezel_out_ry, crown_h)
GEMS = [
    ('center', (255.5, 509.5), 18.5, 19.5, 28.0, 26.5, 0.0195),
    ('lower-l', (47.5, 578.0), 17.5, 22.5, 27.0, 33.5, 0.0190),
    ('lower-r', (463.5, 578.0), 17.5, 22.5, 27.0, 33.5, 0.0190),
    ('top-l', (172.0, 102.5), 12.5, 13.0, 20.0, 20.0, 0.0155),
    ('top-r', (339.0, 102.5), 12.5, 13.0, 20.0, 20.0, 0.0155),
    ('mid-l', (46.5, 355.5), 11.5, 12.0, 19.0, 19.0, 0.0150),
    ('mid-r', (464.5, 355.5), 11.5, 12.0, 19.0, 19.0, 0.0150),
    ('bot-c', (255.5, 724.0), 12.5, 12.5, 21.0, 19.0, 0.0150),
]


def make_materials():
    mats = {
        'face': lib.material('face', (0.78, 0.68, 0.56), roughness=0.68),
        'crystal_face': lib.material('crystal_face', (0.88, 0.14, 0.24), metallic=0.12, roughness=0.14, **{'Coat Weight': 1.0}),
        'gold_face': lib.material('gold_face', (0.95, 0.68, 0.24), metallic=0.45, roughness=0.22, **{'Coat Weight': 0.5}),
        'back': lib.material('back', (0.24, 0.06, 0.08), roughness=0.52),
        'obsidian_red': lib.material('obsidian_red', (0.14, 0.025, 0.045), metallic=0.62, roughness=0.32),
        'gold': lib.material('gold', (0.96, 0.64, 0.18), metallic=1.0, roughness=0.18),
        'gem': lib.material('gem', (0.92, 0.05, 0.16), roughness=0.02, **{'Transmission Weight': 0.90, 'IOR': 1.77}),
        'foil': lib.material('foil', (1.00, 0.42, 0.34), metallic=1.0, roughness=0.10),
    }
    lib.attach_preview_textures(
        mats, ('face', 'crystal_face', 'gold_face'), PREVIEW_FACE,
        REPO / 'assets/ui/card-back.png' if PREVIEW_FACE else None,
    )
    return mats


def beast_ornament_masks(rgba):
    """枠の絵から「紅水晶の角・結晶刃」「金の爪・角飾り」「肉球レリーフ」のマスクを抽出する。"""
    r, g, b, a = rgba[..., 0], rgba[..., 1], rgba[..., 2], rgba[..., 3]
    h, w = a.shape
    yy, xx = np.mgrid[0:h, 0:w]

    def in_rect(rect, pad=2.0):
        x0, y0, x1, y1, _ = rect
        return (xx >= x0 - pad) & (xx <= x1 + pad) & (yy >= y0 - pad) & (yy <= y1 + pad)

    # 窓・名前欄・下の欄・メダル・肉球メダリオン・8個の宝石台座の内側は除外
    exclude = in_rect(WINDOW, 4.0) | in_rect(NAME, 2.0) | in_rect(STAT, 2.0)
    exclude |= np.hypot(xx - MEDAL[0], yy - MEDAL[1]) <= MEDAL[3] + 2.0
    exclude |= np.hypot(xx - PAW[0], yy - PAW[1]) <= PAW[3] + 1.5
    for _, (gx, gy), _, _, brx, bry, _ in GEMS:
        exclude |= (np.abs(xx - gx) / (brx + 1.5) + np.abs(yy - gy) / (bry + 1.5)) <= 1.0

    # 1) 紅水晶の角・結晶刃（鮮やかで赤みの強いピクセル）
    is_crimson = (a > 0.6) & (r > 0.42) & (r - g > 0.22) & (r > b * 1.15) & (~exclude)
    cm = ~lib.shift_or(~is_crimson)
    for _ in range(2):
        cm = lib.shift_or(cm)
    cm &= lib.shift_or(is_crimson)
    cm = ~lib.shift_or(~cm)

    # 2) 金の爪・角飾り（黄〜橙の高彩度ゴールド。クリーム欄より b が低い）
    is_gold = (a > 0.6) & (r > 0.60) & (g > 0.35) & (r - b > 0.28) & (g - b > 0.10) & (r - g < 0.45) & (~exclude)
    gm = ~lib.shift_or(~is_gold)
    for _ in range(2):
        gm = lib.shift_or(gm)
    gm &= lib.shift_or(is_gold)
    gm = ~lib.shift_or(~gm)

    # 3) 肉球メダリオン内部の肉球パッド（PAW 内側の明るい金色部分）
    in_paw = np.hypot(xx - PAW[0], yy - PAW[1]) <= (PAW[2] - 2.0)
    paw_mask = in_paw & (a > 0.8) & (r > 0.55) & (g > 0.32) & (r - b > 0.25)
    paw_mask = ~lib.shift_or(~paw_mask)
    paw_mask = lib.shift_or(paw_mask)

    return cm, gm, paw_mask


def build():
    scene = lib.fresh_scene('CardBeast', 'card-beast')
    mats = make_materials()
    rgba = lib.load_rgba(FRAME_PNG)
    parts = []

    # 1) 板（本体の外形。裏に裏の絵、側面は深紅黒曜石）
    x0, y0, x1, y1, r = BODY
    slab = lib.slab_from_loops('slab', [lib.rounded_rect(x0, y0, x1, y1, r, 6)], SLAB_FRONT - 0.0010, BACK_Y, 0.0040, resolution=1)
    bx0, bz1 = lib.to_xz(x0, y0)
    bx1, bz0 = lib.to_xz(x1, y1)

    def slab_uv(kind, c):
        if kind == 'back':
            return 1 - (c.x - bx0) / (bx1 - bx0), (c.z - bz0) / (bz1 - bz0)
        return lib.face_uv(c.x, c.z)

    lib.assign(slab, mats, lambda n, c: 'face' if n.y < -0.7 else 'back' if n.y > 0.7 else 'obsidian_red', slab_uv)
    lib.smooth_by_angle(slab, 40)
    parts.append(slab)

    # 2) 外枠（絵のギザギザな角・結晶の外形どおり）
    outline = [tuple(p) for p in lib.frame_outline(rgba, spacing=3.0, eps=0.75)]
    holes = [
        lib.window_medal_hole(WINDOW, MEDAL),
        lib.rounded_rect(*lib.grow(NAME, -2.0), 5),
        lib.rounded_rect(*lib.grow(STAT, -2.0), 5),
    ]
    frame = lib.slab_from_loops('frame', [outline, *holes], FRAME_TOP, SLAB_FRONT + 0.0010, 0.0028, resolution=1)
    inner = (bx0 + 0.004, bz0 + 0.004, bx1 - 0.004, bz1 - 0.004)
    lib.cull(frame, lambda n, c: n.y > 0.5 and inner[0] < c.x < inner[2] and inner[1] < c.z < inner[3])
    lib.assign(frame, mats, lambda n, c: 'face' if n.y < -0.45 else 'obsidian_red')
    lib.smooth_by_angle(frame, 36)
    parts.append(frame)

    # 2b) 紅水晶の角・刃・結晶（鋭い面取りで立体化）＆金の爪・角飾り（さらに手前に立体化）
    crimson_mask, gold_mask, paw_mask = beast_ornament_masks(rgba)

    crystal_objs = []
    for i, loop in enumerate(lib.connected_loops(crimson_mask, min_pixels=140, spacing=3.8, smooth=2, eps=1.05, min_pts=6)):
        crystal_objs.append(lib.slab_from_loops(f'crys-{i}', [[tuple(q) for q in loop]], FRAME_TOP - 0.0064, FRAME_TOP + 0.0020, 0.0032, resolution=1))
    if crystal_objs:
        crystals = lib.join(crystal_objs, 'crimson-crystals')
        lib.cull(crystals, lambda n, c: n.y > 0.2)
        lib.assign(crystals, mats, lambda n, c: 'crystal_face' if n.y < -0.30 else 'obsidian_red')
        lib.smooth_by_angle(crystals, 32)   # 結晶らしく角を立てたシャープな陰影
        parts.append(crystals)

    claw_objs = []
    for i, loop in enumerate(lib.connected_loops(gold_mask, min_pixels=160, spacing=3.6, smooth=3, eps=1.00, min_pts=6)):
        claw_objs.append(lib.slab_from_loops(f'claw-{i}', [[tuple(q) for q in loop]], FRAME_TOP - 0.0086, FRAME_TOP + 0.0020, 0.0034, resolution=1))
    if claw_objs:
        claws = lib.join(claw_objs, 'gold-claws')
        lib.cull(claws, lambda n, c: n.y > 0.2)
        lib.assign(claws, mats, lambda n, c: 'gold_face' if n.y < -0.35 else 'gold')
        lib.smooth_by_angle(claws, 48)
        parts.append(claws)

    # 3) 名前欄・下の欄・メダルの中
    for name, rect in (('name-plate', NAME), ('stat-plate', STAT)):
        plate = lib.slab_from_loops(name, [lib.rounded_rect(*lib.grow(rect, -1.5), 5)], PLATE_TOP, SLAB_FRONT, 0.0018, resolution=1)
        lib.assign(plate, mats, lambda n, c: 'face' if n.y < -0.45 else 'obsidian_red')
        lib.smooth_by_angle(plate, 40)
        parts.append(plate)
    medal = lib.slab_from_loops('medal-disc', [lib.circle(MEDAL[0], MEDAL[1], MEDAL[2] + 2.5, 36)], MEDAL_TOP, SLAB_FRONT, 0.0016, resolution=1)
    lib.assign(medal, mats, lambda n, c: 'face' if n.y < -0.45 else 'obsidian_red')
    lib.smooth_by_angle(medal, 40)
    parts.append(medal)

    # 4) 金の縁：窓・メダル・中央上部の肉球メダリオン＋立体肉球レリーフ
    rim_window = lib.metal_rim(
        'rim-window',
        lib.rect_xz(lib.grow(WINDOW, 1.5), steps=5, spacing=18.0, fine_near=(MEDAL[0], MEDAL[1]), fine_radius=MEDAL[3] + 18.0, fine_spacing=8.0),
        mats['gold'], 0.0078, 0.0044, FRAME_TOP,
    )
    mcx, mcz = lib.to_xz(MEDAL[0], MEDAL[1])
    pcx, pcz = lib.to_xz(PAW[0], PAW[1])
    cgx, cgz = lib.to_xz(*GEMS[0][1])
    lib.cull(
        rim_window,
        lambda n, c: math.hypot(c.x - mcx, c.z - mcz) < (MEDAL[3] + 1.0) / lib.PX
        or math.hypot(c.x - pcx, c.z - pcz) < (PAW[3] + 1.5) / lib.PX
        or (abs(c.x - cgx) / ((GEMS[0][4] + 2.0) / lib.PX) + abs(c.z - cgz) / ((GEMS[0][5] + 2.0) / lib.PX)) < 1.0,
    )
    parts.append(rim_window)

    # 左上メダルの金の輪
    mc = Vector(lib.to_xz(MEDAL[0], MEDAL[1]))
    medal_pts = [mc + Vector((math.cos(a), math.sin(a))) * ((MEDAL[2] + MEDAL[3]) / 2 / lib.PX) for a in [-2 * math.pi * i / 44 for i in range(44)]]
    parts.append(lib.metal_rim('rim-medal', medal_pts, mats['gold'], (MEDAL[3] - MEDAL[2]) / lib.PX, 0.0074, FRAME_TOP + 0.0005))

    # 中央上部の肉球メダリオン（外輪＋くぼみ盤＋立体肉球パッド）
    pc = Vector(lib.to_xz(PAW[0], PAW[1]))
    paw_ring_pts = [pc + Vector((math.cos(a), math.sin(a))) * ((PAW[2] + PAW[3]) / 2 / lib.PX) for a in [-2 * math.pi * i / 48 for i in range(48)]]
    parts.append(lib.metal_rim('paw-ring', paw_ring_pts, mats['gold'], (PAW[3] - PAW[2]) / lib.PX, 0.0115, FRAME_TOP))

    paw_well = lib.slab_from_loops('paw-well', [lib.circle(PAW[0], PAW[1], PAW[2] + 1.5, 36)], FRAME_TOP - 0.0020, FRAME_TOP + 0.0025, 0.0012, resolution=1)
    lib.cull(paw_well, lambda n, c: n.y > 0.2)
    lib.assign(paw_well, mats, lambda n, c: 'face')
    lib.smooth_by_angle(paw_well, 40)
    parts.append(paw_well)

    paw_pad_objs = []
    for i, loop in enumerate(lib.connected_loops(paw_mask, min_pixels=35, spacing=1.8, smooth=2, eps=0.40, min_pts=6)):
        paw_pad_objs.append(lib.slab_from_loops(f'paw-pad-{i}', [[tuple(q) for q in loop]], FRAME_TOP - 0.0085, FRAME_TOP - 0.0010, 0.0026, resolution=1))
    if paw_pad_objs:
        paw_pads = lib.join(paw_pad_objs, 'paw-pads')
        lib.cull(paw_pads, lambda n, c: n.y > 0.2)
        lib.assign(paw_pads, mats, lambda n, c: 'gold_face' if n.y < -0.35 else 'gold')
        lib.smooth_by_angle(paw_pads, 50)
        parts.append(paw_pads)

    # 5) 8個のファセット紅宝石＋金の台座＋ファセット箔（描画コール削減のため種類ごとに結合）
    bezel_objs, foil_objs, gem_objs = [], [], []
    for gname, center_px, grx, gry, brx, bry, ch in GEMS:
        in_rx = grx + 2.2
        in_ry = gry + 2.2
        setting_parts = lib.build_diamond_setting(
            mats['gold'], mats['foil'], center_px,
            brx, bry, in_rx, in_ry, grx, gry,
            FRAME_TOP - 0.0015, rim_height=0.0085, name=f'setting-{gname}',
        )
        # setting_parts = [bezel, foil, prong-0..3]
        bezel_objs.append(setting_parts[0])
        bezel_objs.extend(setting_parts[2:])
        foil_objs.append(setting_parts[1])
        gem_objs.append(lib.build_diamond_gem(
            mats['gem'], center_px, grx, gry, table_ratio=0.42,
            frame_top=FRAME_TOP - 0.0015, crown_height=ch, pavilion_depth=ch * 1.1,
            name=f'gem-{gname}',
        ))

    bezels = lib.join(bezel_objs, 'gem-bezels')
    bezels.data.materials.append(mats['gold'])
    lib.smooth_by_angle(bezels, 32)
    parts.append(bezels)

    foils = lib.join(foil_objs, 'gem-foils')
    foils.data.materials.append(mats['foil'])
    for poly in foils.data.polygons:
        poly.use_smooth = False
    parts.append(foils)

    gems = lib.join(gem_objs, 'gem')
    gems.data.materials.append(mats['gem'])
    for poly in gems.data.polygons:
        poly.use_smooth = False
    parts.append(gems)

    root = bpy.data.objects.new('card-beast', None)
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
    print('beast parts', len(parts), tris, 'tris')
