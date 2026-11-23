"""王国（kingdom）陣営専用 3Dカードフレーム生成スクリプト。

実行:
  blender --background --python assets/models/make-card-faction-kingdom.py

出力:
  assets/models/card-faction-kingdom.glb

仕様:
  assets/frames/factions.json（64×96×3.52mm, 角丸3mm, ベベル0.6mm）
  紺青のエナメル装甲、銀色の羽根装飾、金の縁、王冠、青いサファイア宝石。
  四隅金具・側面サファイアカラー・銀羽根レールが表・側面・裏へ切れ目なく連続する。
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import faction_card_lib as lib

OUT = lib.REPO / 'assets/models/card-faction-kingdom.glb'


def make_materials():
    return {
        'face': lib.make_material('face', (0.95, 0.88, 0.72), metallic=0.0, roughness=0.70),
        'cobalt_enamel': lib.make_material('cobalt_enamel', (0.015, 0.055, 0.28), metallic=0.20, roughness=0.20, **{'Coat Weight': 0.90, 'Coat Roughness': 0.06}),
        'gold': lib.make_material('gold', (0.94, 0.68, 0.16), metallic=1.0, roughness=0.17, **{'Coat Weight': 0.30}),
        'silver': lib.make_material('silver', (0.84, 0.86, 0.91), metallic=0.88, roughness=0.20, **{'Coat Weight': 0.28}),
        'silver_dark': lib.make_material('silver_dark', (0.46, 0.50, 0.58), metallic=0.84, roughness=0.30),
        'sapphire_gem': lib.make_material('sapphire_gem', (0.04, 0.22, 0.96), metallic=0.0, roughness=0.015, **{'Transmission Weight': 0.92, 'IOR': 1.77, 'Coat Weight': 1.0, 'Coat Roughness': 0.01}),
        'foil': lib.make_material('foil', (0.55, 0.80, 1.00), metallic=1.0, roughness=0.08, **{'Emission Color': (0.12, 0.36, 0.95, 1.0), 'Emission Strength': 0.35}),
    }


def build_fleur_de_lis(name, cx, cy, scale, z_base, z_dir, mat):
    """立体的なユリの紋章（フルール・ド・リス）"""
    parts = []
    # 中央の槍先ペタル
    c_pts = [
        (cx, cy - 2.6 * scale, z_base + z_dir * 0.2),
        (cx, cy + 0.2 * scale, z_base + z_dir * 0.95),
        (cx, cy + 3.2 * scale, z_base + z_dir * 0.65),
        (cx, cy + 4.8 * scale, z_base + z_dir * 0.20),
    ]
    parts.append(lib.sweep_path_mm(
        f'{name}-center', lib.catmull_rom_3d(c_pts, 5),
        lambda t: lib.blade_profile(max(0.18, (1.35 * math.sin(t * math.pi) ** 0.75) * scale),
                                    max(0.15, (0.72 * math.sin(t * math.pi) ** 0.6) * scale)),
        mat, smooth_angle=35.0
    ))
    # 左右に巻くペタル
    for sx in (-1.0, 1.0):
        s_pts = [
            (cx, cy - 1.2 * scale, z_base + z_dir * 0.35),
            (cx + sx * 1.8 * scale, cy + 1.4 * scale, z_base + z_dir * 0.85),
            (cx + sx * 3.5 * scale, cy + 1.2 * scale, z_base + z_dir * 0.65),
            (cx + sx * 3.8 * scale, cy - 0.5 * scale, z_base + z_dir * 0.35),
            (cx + sx * 2.5 * scale, cy - 1.3 * scale, z_base + z_dir * 0.22),
        ]
        parts.append(lib.sweep_path_mm(
            f'{name}-side-{int(sx)}', lib.catmull_rom_3d(s_pts, 5),
            lambda t: lib.blade_profile(max(0.16, (0.92 * (1.0 - 0.55 * t) * (0.5 + 0.5 * math.sin(t * math.pi))) * scale),
                                        max(0.14, (0.55 * (1.0 - 0.5 * t)) * scale)),
            mat, smooth_angle=38.0
        ))
    # 中央の横帯（結束バンド）
    b_pts = [(cx - 1.7 * scale, cy - 1.0 * scale, z_base + z_dir * 0.75),
             (cx + 1.7 * scale, cy - 1.0 * scale, z_base + z_dir * 0.75)]
    parts.append(lib.sweep_path_mm(
        f'{name}-band', b_pts,
        lambda t: lib.chamfer_rect_profile(0.95 * scale, 0.75 * scale, 0.3),
        mat, smooth_angle=35.0
    ))
    return parts


def build_royal_crown(name, cx, cy, scale, z_base, z_dir, mats):
    """本格的な立体王冠（金の台輪・紺青ベルベット帽・5本アーチ・十字宝珠・サファイア）"""
    parts = []
    # 1. 下部バンド（弧を描く金の台輪）
    band_pts = []
    for i in range(13):
        t = i / 12.0
        ang = math.radians(-55 + 110 * t)
        bx = cx + 6.4 * scale * math.sin(ang)
        by = cy - 2.6 * scale + 0.8 * scale * math.cos(ang)
        bz = z_base + z_dir * (0.45 + 0.75 * math.cos(ang))
        band_pts.append((bx, by, bz))
    parts.append(lib.sweep_path_mm(
        f'{name}-band', band_pts,
        lambda t: lib.chamfer_rect_profile(1.9 * scale, 1.05 * scale, 0.32),
        mats['gold'], smooth_angle=35.0
    ))

    # 2. 紺青ベルベットのドーム（王冠内部の膨らみ）
    dome_rings = []
    for lv, (rx, ry, z_off) in enumerate((
        (5.4, 2.4, 0.25),
        (5.6, 3.6, 0.75),
        (4.5, 4.4, 1.05),
        (2.5, 4.2, 1.12),
    )):
        ring = []
        for i in range(16):
            a = 2.0 * math.pi * i / 16
            ring.append(lib.pt(
                cx + rx * scale * math.cos(a),
                cy + (0.6 + ry * math.sin(a) * 0.65) * scale,
                z_base + z_dir * (z_off * scale)
            ))
        dome_rings.append(ring)
    parts.append(lib.loft_rings(
        f'{name}-velvet', dome_rings, mats['cobalt_enamel'], closed=True,
        cap_end=lib.pt(cx, cy + 1.2 * scale, z_base + z_dir * 1.18 * scale),
        smooth_angle=55.0
    ))

    # 3. 5本の黄金アーチ（中央＋左右2対）
    arch_specs = [
        (0.0, 0.0, 1.55),
        (-2.8, -3.9, 1.35), (2.8, 3.9, 1.35),
        (-5.2, -6.2, 1.05), (5.2, 6.2, 1.05),
    ]
    for idx, (x_bot, x_mid, z_peak) in enumerate(arch_specs):
        pts = [
            (cx + x_bot * scale, cy - 2.0 * scale, z_base + z_dir * 0.85 * scale),
            (cx + x_mid * scale, cy + 1.2 * scale, z_base + z_dir * z_peak * scale),
            (cx + x_mid * 0.55 * scale, cy + 4.1 * scale, z_base + z_dir * (z_peak * 0.92) * scale),
            (cx, cy + 4.3 * scale, z_base + z_dir * 1.15 * scale),
        ]
        parts.append(lib.sweep_path_mm(
            f'{name}-arch-{idx}', lib.catmull_rom_3d(pts, 6),
            lambda t: lib.chamfer_rect_profile(1.05 * scale, 0.85 * scale, 0.35),
            mats['gold'], smooth_angle=40.0
        ))

    # 4. 頂部の宝珠と小十字
    orb_pts = [
        (cx, cy + 4.2 * scale, z_base + z_dir * 1.05 * scale),
        (cx, cy + 5.8 * scale, z_base + z_dir * 1.15 * scale),
        (cx, cy + 7.2 * scale, z_base + z_dir * 0.70 * scale),
    ]
    parts.append(lib.sweep_path_mm(
        f'{name}-finial', orb_pts,
        lambda t: lib.oval_profile((0.95 if t < 0.6 else 0.55) * scale, 0.72 * scale, 10),
        mats['gold'], smooth_angle=45.0
    ))

    # 5. 王冠中央のファセット・サファイア
    parts.extend(lib.build_diamond_gem_mm(
        f'{name}-sapphire', (cx, cy - 1.1 * scale), 1.45 * scale, 1.85 * scale,
        z_base + z_dir * 0.92 * scale, z_dir,
        mats['sapphire_gem'], mats['gold'], mats['foil'],
        crown_mm=0.85 * scale, pavilion_mm=0.55 * scale, bezel_h_mm=0.45 * scale
    ))
    return parts


def build_side_feathers(name, sx, z_base, z_dir, mats):
    """左右の側面レールに沿った多層彫刻・銀の羽根列（中央宝石の上下）"""
    parts = []
    # 上段（MPメダル下〜中央宝石上）と下段（中央宝石下〜下隅上）
    y_upper = [26.0, 20.5, 15.0, 9.8]
    y_lower = [-6.5, -12.5, -18.5, -24.5, -30.5]
    for grp, ys, dy in (('up', y_upper, 7.2), ('lo', y_lower, -7.2)):
        for i, y0 in enumerate(ys):
            # 左上は MP メダル（x=-19.7, y=35.1, r=5mm）と干渉しないよう y<=26.5 に制限
            root = (sx * 27.6, y0, z_base + z_dir * 0.28)
            tip = (sx * 31.8, y0 + dy * 0.92, z_base + z_dir * 0.85)
            f_out = lib.build_sculpted_feather_mm(
                f'{name}-{grp}-out-{i}', root, tip, 2.35, 0.95, z_dir, mats['silver'], curve_mm=0.55
            )
            if f_out:
                parts.append(f_out)
            # 内側の重なり羽根
            root2 = (sx * 25.8, y0 - dy * 0.15, z_base + z_dir * 0.15)
            tip2 = (sx * 29.0, y0 + dy * 0.72, z_base + z_dir * 0.65)
            f_in = lib.build_sculpted_feather_mm(
                f'{name}-{grp}-in-{i}', root2, tip2, 1.85, 0.75, z_dir, mats['silver_dark'], curve_mm=0.45
            )
            if f_in:
                parts.append(f_in)
    return parts


def build_corner_wings(name, sx, sy, z_base, z_dir, mats):
    """四隅の宝石ブラケットから上下辺に沿って広がる銀の小翼"""
    parts = []
    for k, (len_x, dy_off, z_off) in enumerate(((12.5, 0.0, 0.52), (9.8, -sy * 2.1, 0.35), (7.2, -sy * 3.8, 0.22))):
        # 左上コーナーの3本目はMPメダルと干渉しないよう短縮
        if sx < 0 and sy > 0 and z_dir > 0 and k >= 1:
            len_x *= 0.62
        r = (sx * 26.5, sy * 43.8 + dy_off, z_base + z_dir * 0.25)
        t = (sx * (26.5 - len_x), sy * (44.8 + 0.6 * k) + dy_off * 0.75, z_base + z_dir * z_off)
        f = lib.build_sculpted_feather_mm(f'{name}-wing-{k}', r, t, 2.2 - 0.3 * k, 0.85, z_dir, mats['silver'], curve_mm=0.5)
        if f:
            parts.append(f)
    return parts


def build_back_crest(mats):
    """裏面の王国紋章（銀の盾＋浮き彫りフルール・ド・リス＋大翼＋王冠＋上下装飾）"""
    parts = []
    z_b = lib.BACK_Z_MM

    # 裏面内側ゴールド額縁
    in_rect = lib.resample_loop(lib.rounded_rect_mm(-24.8, -40.8, 24.8, 40.8, 2.8, steps=6), max_seg=2.2)
    parts.append(lib.sweep_path_mm(
        'back-inner-gold-frame', [(x, y, z_b - 0.15) for (x, y) in in_rect],
        lambda t: lib.chamfer_rect_profile(1.45, 0.95, 0.32),
        mats['gold'], closed=True, cap_ends=False, smooth_angle=38.0
    ))

    # 1. 左右の広がる銀の大翼（各11枚の重なり羽根）
    for sx in (-1.0, 1.0):
        # 上段プライマリ翼羽根（扇状に大きく広がる）
        for i in range(7):
            u = i / 6.0
            ang = math.radians(68 - 95 * u)
            length = 17.5 - 2.4 * u
            r = (sx * (5.8 + 1.2 * u), 2.5 - 8.5 * u, z_b - 0.25)
            t = (sx * (5.8 + length * math.cos(ang)), 2.5 - 7.5 * u + length * math.sin(ang), z_b - 0.85 - 0.12 * (1 - u))
            f = lib.build_sculpted_feather_mm(
                f'back-wing-p-{int(sx)}-{i}', r, t, 2.75 - 0.15 * u, 1.05, -1.0, mats['silver'], curve_mm=0.65
            )
            if f:
                parts.append(f)
        # 下段セカンダリ翼羽根
        for i in range(4):
            u = i / 3.0
            ang = math.radians(-42 - 38 * u)
            length = 11.5 - 1.5 * u
            r = (sx * (4.8 - 1.0 * u), -6.5 - 3.5 * u, z_b - 0.20)
            t = (sx * (4.8 + length * math.cos(ang)), -6.5 - 3.5 * u + length * math.sin(ang), z_b - 0.65)
            f = lib.build_sculpted_feather_mm(
                f'back-wing-s-{int(sx)}-{i}', r, t, 2.15, 0.85, -1.0, mats['silver_dark'], curve_mm=0.45
            )
            if f:
                parts.append(f)

    # 2. 中央の銀のヒーターシールド（立体ベベル＋縁取り）
    shield_poly = [
        (0.0, -18.5),
        (7.8, -11.5),
        (11.4, -2.0),
        (11.6, 8.2),
        (0.0, 10.6),
        (-11.6, 8.2),
        (-11.4, -2.0),
        (-7.8, -11.5),
    ]
    parts.append(lib.extrude_beveled_slab_mm(
        'back-shield-body', [shield_poly], z_b - 1.35, z_b + 0.15, 0.45, mats['silver'], resolution=2
    ))
    shield_rim = lib.resample_loop(shield_poly, max_seg=1.8)
    parts.append(lib.sweep_path_mm(
        'back-shield-rim', [(x, y, z_b - 1.28) for (x, y) in shield_rim],
        lambda t: lib.chamfer_rect_profile(1.35, 0.88, 0.35),
        mats['silver_dark'], closed=True, cap_ends=False, smooth_angle=35.0
    ))
    # 盾の中央に浮き彫りのフルール・ド・リス
    parts.extend(build_fleur_de_lis('back-shield-fleur', 0.0, -3.2, 1.75, z_b - 1.30, -1.0, mats['silver']))

    # 盾下部の金の尾飾り
    tail_pts = [(0.0, -17.5, z_b - 0.8), (0.0, -24.5, z_b - 0.35)]
    parts.append(lib.sweep_path_mm(
        'back-shield-tail', tail_pts,
        lambda t: lib.blade_profile(max(0.2, 1.5 * (1.0 - t)), max(0.2, 0.8 * (1.0 - t))),
        mats['gold'], smooth_angle=35.0
    ))

    # 3. 盾の上に戴く大きな3D王冠
    parts.extend(build_royal_crown('back-crown', 0.0, 16.5, 1.48, z_b - 0.25, -1.0, mats))

    # 4. 裏面の上部・下部の豪華な金フルール・ド・リス＆スクロール
    parts.extend(build_fleur_de_lis('back-top-fleur', 0.0, 38.2, 1.32, z_b - 0.20, -1.0, mats['gold']))
    parts.extend(build_fleur_de_lis('back-bot-fleur', 0.0, -36.8, 1.45, z_b - 0.20, -1.0, mats['gold']))
    for sx in (-1.0, 1.0):
        scroll = [
            (sx * 4.5, -36.5, z_b - 0.45),
            (sx * 12.5, -38.5, z_b - 0.72),
            (sx * 18.8, -35.5, z_b - 0.68),
            (sx * 16.5, -30.5, z_b - 0.45),
        ]
        parts.append(lib.sweep_path_mm(
            f'back-bot-scroll-{int(sx)}', lib.catmull_rom_3d(scroll, 6),
            lambda t: lib.blade_profile(max(0.25, 1.25 * (1.0 - 0.55 * t)), max(0.22, 0.72 * (1.0 - 0.5 * t))),
            mats['gold'], smooth_angle=40.0
        ))
    return parts


def build():
    scene, root = lib.fresh_scene('CardFactionKingdom', 'card-faction-kingdom')
    mats = make_materials()
    parts = []

    # 1. 本体コア（64×96×3.52mm, 角丸3mm, ベベル0.6mm）＋表裏金レール＋凹開口＋UVパネル
    parts.extend(lib.build_card_core_and_rails(mats['cobalt_enamel'], mats['gold'], mats['face'], 'kingdom'))
    parts.extend(lib.build_aperture_rims(mats['gold'], 'kingdom-rim', width_mm=1.35, height_mm=0.58))

    # 2. 四隅の表〜側面〜裏 連続ラップ金具＋四隅ファセット・サファイア＋コーナー銀翼
    for idx, (cx, cy) in enumerate(lib.CLAMP_CENTERS_MM):
        sx = 1.0 if cx > 0 else -1.0
        sy = 1.0 if cy > 0 else -1.0
        # 連続コーナーブラケット（z = -2.15 〜 +2.15 mm）
        parts.append(lib.build_corner_wrap_bracket_mm(
            f'corner-wrap-{idx}', sx, sy, mats['gold'],
            outer_x=32.4, outer_y=48.4, arm_x=9.2, arm_y=10.2, z_max=2.12, bevel_mm=0.42
        ))
        # コーナー側面の銀キャップ（edge-faction-kingdom.png 準拠）
        cap_pts = [(sx * 32.35, sy * 40.5, 0.0), (sx * 32.35, sy * 46.2, 0.0)]
        parts.append(lib.sweep_path_mm(
            f'corner-side-silver-{idx}', cap_pts,
            lambda t: lib.chamfer_rect_profile(1.0, 2.2, 0.35),
            mats['silver'], smooth_angle=35.0
        ))
        # 表裏のコーナー宝石（斜め45°配置のひし形サファイア）
        rot = -38.0 * sx * sy
        gx, gy = sx * 27.6, sy * 43.4
        parts.extend(lib.build_diamond_gem_mm(
            f'corner-gem-front-{idx}', (gx, gy), 1.95, 2.85, lib.FRONT_Z_MM + 0.38, +1.0,
            mats['sapphire_gem'], mats['gold'], mats['foil'], crown_mm=0.95, rot_deg=rot
        ))
        parts.extend(lib.build_diamond_gem_mm(
            f'corner-gem-back-{idx}', (gx, gy), 1.95, 2.85, lib.BACK_Z_MM - 0.38, -1.0,
            mats['sapphire_gem'], mats['gold'], mats['foil'], crown_mm=0.95, rot_deg=-rot
        ))
        # 表裏のコーナー銀小翼
        parts.extend(build_corner_wings(f'corner-f-{idx}', sx, sy, lib.FRONT_Z_MM, +1.0, mats))
        parts.extend(build_corner_wings(f'corner-b-{idx}', sx, sy, lib.BACK_Z_MM, -1.0, mats))

    # 3. 左右中央（y=2.0mm）の連続サファイアカラー（表・側面・裏が一体に連結！）
    mid_y = 2.0
    for sx in (-1.0, 1.0):
        # 表・側面・裏を貫く金のカラーバンド
        c_path = [
            (sx * 25.5, mid_y, lib.FRONT_Z_MM + 0.35),
            (sx * 32.3, mid_y, lib.FRONT_Z_MM + 0.25),
            (sx * 32.45, mid_y, 0.0),
            (sx * 32.3, mid_y, lib.BACK_Z_MM - 0.25),
            (sx * 25.5, mid_y, lib.BACK_Z_MM - 0.35),
        ]
        parts.append(lib.sweep_path_mm(
            f'mid-collar-{int(sx)}', lib.catmull_rom_3d(c_path, 4),
            lambda t: lib.chamfer_rect_profile(5.2, 1.15, 0.32),
            mats['gold'], smooth_angle=35.0
        ))
        # 表・裏・側面それぞれに本物のファセット・サファイア！
        parts.extend(lib.build_diamond_gem_mm(
            f'mid-gem-f-{int(sx)}', (sx * 28.4, mid_y), 2.35, 3.65, lib.FRONT_Z_MM + 0.42, +1.0,
            mats['sapphire_gem'], mats['gold'], mats['foil'], crown_mm=1.05
        ))
        parts.extend(lib.build_diamond_gem_mm(
            f'mid-gem-b-{int(sx)}', (sx * 28.4, mid_y), 2.35, 3.65, lib.BACK_Z_MM - 0.42, -1.0,
            mats['sapphire_gem'], mats['gold'], mats['foil'], crown_mm=1.05
        ))
        parts.extend(lib.build_side_gem_mm(
            f'mid-gem-side-{int(sx)}', sx * 32.25, mid_y, 1.15, 3.6, sx,
            mats['sapphire_gem'], mats['gold'], mats['foil'], crown_mm=0.65
        ))
        # 側面上・下段の金の槍先装飾（edge-faction-kingdom.png 準拠）
        for sy_e in (-1.0, 1.0):
            s_pts = [(sx * 32.15, sy_e * 17.0, 0.0), (sx * 32.35, sy_e * 26.0, 0.0), (sx * 32.15, sy_e * 33.5, 0.0)]
            parts.append(lib.sweep_path_mm(
                f'edge-spear-{int(sx)}-{int(sy_e)}', s_pts,
                lambda t: lib.blade_profile(max(0.18, 0.72 * math.sin(t * math.pi)), 0.55),
                mats['gold'], smooth_angle=35.0
            ))

        # 表・裏の側面銀羽根レール
        parts.extend(build_side_feathers(f'side-f-{int(sx)}', sx, lib.FRONT_Z_MM, +1.0, mats))
        parts.extend(build_side_feathers(f'side-b-{int(sx)}', sx, lib.BACK_Z_MM, -1.0, mats))

    # 4. 表面上部の立体王冠＋左右ゴールドスクロール
    parts.extend(lib.build_diamond_gem_mm(
        'front-crown-base-accent', (0.0, 41.0), 1.0, 1.0, lib.FRONT_Z_MM + 0.1, +1.0,
        mats['sapphire_gem'], None, None, crown_mm=0.3
    ))
    parts.extend(build_royal_crown('front-crown', 0.0, 42.6, 1.08, lib.FRONT_Z_MM + 0.05, +1.0, mats))
    for sx in (-1.0, 1.0):
        sc = [
            (sx * 7.2, 41.2, lib.FRONT_Z_MM + 0.35),
            (sx * 11.2, 43.2, lib.FRONT_Z_MM + 0.72),
            (sx * 14.5, 41.5, lib.FRONT_Z_MM + 0.55),
            (sx * 16.2, 39.8, lib.FRONT_Z_MM + 0.30),
        ]
        parts.append(lib.sweep_path_mm(
            f'front-top-scroll-{int(sx)}', lib.catmull_rom_3d(sc, 5),
            lambda t: lib.blade_profile(max(0.22, 1.05 * (1.0 - 0.5 * t)), max(0.20, 0.65 * (1.0 - 0.45 * t))),
            mats['gold'], smooth_angle=38.0
        ))

    # 5. 表面の中央区切り（名前欄・説明欄の間）＆下部フルール・ド・リス
    parts.extend(build_fleur_de_lis('front-mid-fleur', 0.0, -26.8, 0.72, lib.FRONT_Z_MM + 0.12, +1.0, mats['gold']))
    parts.extend(build_fleur_de_lis('front-bot-fleur', 0.0, -43.0, 1.15, lib.FRONT_Z_MM + 0.15, +1.0, mats['gold']))

    # 6. 裏面紋章（銀の盾＋大翼＋王冠）
    parts.extend(build_back_crest(mats))

    lib.finish_and_export(root, parts, OUT)
    print(f'Exported {OUT} ({OUT.stat().st_size:,} bytes, {len(parts)} parts)')


if __name__ == '__main__':
    build()
