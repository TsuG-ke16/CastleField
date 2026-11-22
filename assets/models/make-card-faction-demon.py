"""魔族（demon）陣営専用 3Dカードフレーム生成スクリプト。

実行:
  blender --background --python assets/models/make-card-faction-demon.py

出力:
  assets/models/card-faction-demon.glb

仕様:
  assets/frames/factions.json（64×96×3.52mm, 角丸3mm, ベベル0.6mm）
  黒鉄コア、黒曜石の四隅連続ブラケット、湾曲した象牙色の骨の肋骨と角、紫水晶（アメジスト）。
  禍々しさと重厚感を重視しつつ、イラスト窓・文字欄・MPメダルの視認性を維持。
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import faction_card_lib as lib

OUT = lib.REPO / 'assets/models/card-faction-demon.glb'


def make_materials():
    return {
        'face': lib.make_material('face', (0.94, 0.87, 0.72), metallic=0.0, roughness=0.72),
        'dark_iron': lib.make_material('dark_iron', (0.048, 0.028, 0.078), metallic=0.76, roughness=0.34),
        'obsidian': lib.make_material('obsidian', (0.022, 0.014, 0.036), metallic=0.28, roughness=0.10, **{'Coat Weight': 0.98, 'Coat Roughness': 0.04}),
        'bone_ivory': lib.make_material('bone_ivory', (0.82, 0.74, 0.59), metallic=0.0, roughness=0.54),
        'bone_dark': lib.make_material('bone_dark', (0.54, 0.45, 0.34), metallic=0.0, roughness=0.66),
        'demon_gold': lib.make_material('demon_gold', (0.74, 0.50, 0.18), metallic=0.92, roughness=0.24, **{'Coat Weight': 0.22}),
        'purple_glow': lib.make_material('purple_glow', (0.38, 0.04, 0.85), metallic=0.10, roughness=0.25, **{'Emission Color': (0.55, 0.08, 1.00, 1.0), 'Emission Strength': 0.90}),
        'amethyst_gem': lib.make_material('amethyst_gem', (0.62, 0.08, 0.98), metallic=0.0, roughness=0.015, **{'Transmission Weight': 0.90, 'IOR': 1.55, 'Coat Weight': 1.0, 'Coat Roughness': 0.01}),
        'amethyst_foil': lib.make_material('amethyst_foil', (0.82, 0.32, 1.00), metallic=1.0, roughness=0.08, **{'Emission Color': (0.52, 0.08, 0.92, 1.0), 'Emission Strength': 0.55}),
    }


def build_curved_bone_horn(name, pts_mm, r_base, r_tip, mat):
    """稜線と両端の自然なテーパーを持つ湾曲した骨の角・肋骨"""
    smooth = lib.catmull_rom_3d(pts_mm, 6)
    def prof(t):
        # 根元も滑らかに収束させつつ先端を鋭く絞る
        env = min(1.0, t / 0.12) ** 0.5 * ((1.0 - t) ** 0.72)
        w = max(0.20, r_base * env + r_tip * t)
        h = max(0.18, (r_base * 0.62) * env + r_tip * t)
        return lib.blade_profile(w, h, sharp=0.82)
    return lib.sweep_path_mm(name, smooth, prof, mat, smooth_angle=42.0)


def build_front_bone_ribs(mats):
    """表面左右の3対の湾曲骨肋骨＋上部悪魔の角＋下部骨牙"""
    parts = []
    z_f = lib.FRONT_Z_MM

    # 1. 左右側面の3対の湾曲骨肋骨（外レールから内側へ弧を描いて終端）
    rib_ys = [15.5, -0.5, -17.5]
    for sx in (-1.0, 1.0):
        for i, y0 in enumerate(rib_ys):
            # 主肋骨カーブ
            pts = [
                (sx * 26.8, y0 + 8.5, z_f + 0.35),
                (sx * 31.8, y0 + 2.8, z_f + 1.15),
                (sx * 31.6, y0 - 2.5, z_f + 1.05),
                (sx * 27.2, y0 - 7.8, z_f + 0.32),
            ]
            parts.append(build_curved_bone_horn(f'front-rib-{int(sx)}-{i}', pts, 2.35, 0.35, mats['bone_ivory']))
            # 肋骨の根元から鋭く飛び出す副棘
            spur = [
                (sx * 30.8, y0 + 1.0, z_f + 0.85),
                (sx * 28.8, y0 - 3.8, z_f + 0.65),
                (sx * 27.6, y0 - 6.8, z_f + 0.25),
            ]
            parts.append(build_curved_bone_horn(f'front-rib-spur-{int(sx)}-{i}', spur, 1.35, 0.22, mats['bone_dark']))

    # 2. 上部中央の湾曲した双角（中央アメジストを挟んで左右に大きく反り返る）
    for sx in (-1.0, 1.0):
        # 上向きの主悪魔角
        horn_up = [
            (sx * 4.5, 41.0, z_f + 0.75),
            (sx * 11.2, 43.2, z_f + 1.25),
            (sx * 12.6, 47.2, z_f + 1.05),
            (sx * 9.5, 50.2, z_f + 0.55),
        ]
        parts.append(build_curved_bone_horn(f'front-top-horn-u-{int(sx)}', horn_up, 2.65, 0.25, mats['bone_ivory']))
        # 横に張り出す副角（左上はMPメダルと干渉しないよう x=-15 付近で止める）
        outer_x = 18.5 if sx > 0 else 15.2
        horn_out = [
            (sx * 5.2, 40.2, z_f + 0.68),
            (sx * 12.2, 41.2, z_f + 0.95),
            (sx * outer_x, 38.8, z_f + 0.45),
        ]
        parts.append(build_curved_bone_horn(f'front-top-horn-o-{int(sx)}', horn_out, 2.1, 0.25, mats['bone_ivory']))

    # 3. 下部中央の骨牙＋鋭角ゴールドスパイク
    for sx in (-1.0, 1.0):
        bot_tusk = [
            (sx * 18.8, -42.5, z_f + 0.35),
            (sx * 11.5, -42.2, z_f + 0.95),
            (sx * 4.2, -45.2, z_f + 0.65),
        ]
        parts.append(build_curved_bone_horn(f'front-bot-tusk-{int(sx)}', bot_tusk, 1.95, 0.28, mats['bone_ivory']))
    bot_spike = [
        (0.0, -39.5, z_f + 0.35),
        (0.0, -43.5, z_f + 1.05),
        (0.0, -48.5, z_f + 0.35),
    ]
    parts.append(lib.sweep_path_mm(
        'front-bot-gold-spike', bot_spike,
        lambda t: lib.blade_profile(max(0.25, 2.8 * math.sin(t * math.pi)), max(0.25, 0.95 * math.sin(t * math.pi))),
        mats['demon_gold'], smooth_angle=28.0
    ))

    # 4. 表面の控えめな紫ルーン発光溝（左右チャネル・名前/説明欄の間）
    for sx in (-1.0, 1.0):
        ch = [(sx * 26.8, -32.0, z_f + 0.08), (sx * 26.8, 25.0, z_f + 0.08)]
        parts.append(lib.sweep_path_mm(
            f'front-glow-ch-{int(sx)}', ch,
            lambda t: lib.chamfer_rect_profile(1.05, 0.28, 0.3),
            mats['purple_glow'], smooth_angle=35.0
        ))
    # 名前欄と説明欄の間の小アメジスト＋金装飾
    parts.extend(lib.build_diamond_gem_mm(
        'front-mid-amethyst', (0.0, -26.8), 1.65, 2.0, z_f + 0.22, +1.0,
        mats['amethyst_gem'], mats['demon_gold'], mats['amethyst_foil'], crown_mm=0.72
    ))
    return parts


def build_back_demon_crest(mats):
    """裏面の禍々しい魔族紋章（巨大な中央ファセット紫水晶＋広がる象牙骨の肋骨籠＋黒曜石ゴシック装甲）"""
    parts = []
    z_b = lib.BACK_Z_MM

    # 1. 中央の巨大な縦長ファセット紫水晶（back-faction-demon.png の象徴！）
    parts.extend(lib.build_diamond_gem_mm(
        'back-center-amethyst', (0.0, 2.5), 7.2, 14.8, z_b - 0.55, -1.0,
        mats['amethyst_gem'], mats['demon_gold'], mats['amethyst_foil'],
        crown_mm=2.15, pavilion_mm=1.20, bezel_expand=1.22, bezel_h_mm=0.95
    ))

    # 2. 紫水晶の上下を貫く中央の骨の背骨スパイク
    top_spine = [(0.0, 17.5, z_b - 0.95), (0.0, 29.0, z_b - 1.20), (0.0, 36.8, z_b - 0.45)]
    parts.append(build_curved_bone_horn('back-spine-top', top_spine, 2.6, 0.25, mats['bone_ivory']))
    bot_spine = [(0.0, -12.5, z_b - 0.95), (0.0, -27.0, z_b - 1.05), (0.0, -37.5, z_b - 0.55)]
    parts.append(build_curved_bone_horn('back-spine-bot', bot_spine, 2.2, 0.30, mats['bone_ivory']))

    # 3. 中央から左右の外枠へ大きく弧を描いて抱き込む象牙色の骨の肋骨（左右対称）
    for sx in (-1.0, 1.0):
        # 主肋骨アーチ（背骨から滑らかに分岐し側面レールまで届く）
        main_rib = [
            (sx * 0.4, 24.0, z_b - 0.92),
            (sx * 11.5, 11.5, z_b - 1.38),
            (sx * 22.5, 2.0, z_b - 1.25),
            (sx * 30.8, -8.5, z_b - 0.95),
            (sx * 27.5, -20.5, z_b - 0.55),
        ]
        parts.append(build_curved_bone_horn(f'back-rib-main-{int(sx)}', main_rib, 3.2, 0.45, mats['bone_ivory']))
        # 上段の副肋骨
        up_rib = [
            (sx * 7.5, 13.5, z_b - 1.10),
            (sx * 17.5, 21.5, z_b - 0.98),
            (sx * 29.5, 16.5, z_b - 0.85),
            (sx * 30.2, 6.5, z_b - 0.55),
        ]
        parts.append(build_curved_bone_horn(f'back-rib-up-{int(sx)}', up_rib, 2.15, 0.35, mats['bone_ivory']))
        # 下段の副肋骨（水晶の下の背骨から分岐）
        lo_rib = [
            (sx * 0.4, -16.5, z_b - 0.90),
            (sx * 11.5, -10.5, z_b - 1.08),
            (sx * 16.5, -13.5, z_b - 0.80),
        ]
        parts.append(build_curved_bone_horn(f'back-rib-lo-{int(sx)}', lo_rib, 1.95, 0.30, mats['bone_ivory']))
        # 下側面の骨牙
        side_lo = [
            (sx * 30.5, -22.5, z_b - 0.85),
            (sx * 27.5, -29.5, z_b - 0.72),
            (sx * 23.5, -35.5, z_b - 0.40),
        ]
        parts.append(build_curved_bone_horn(f'back-rib-side-{int(sx)}', side_lo, 1.85, 0.25, mats['bone_ivory']))
        # 上部の双角（表と同じく上部シルエットを鋭く統一）
        top_horn = [
            (sx * 6.5, 42.5, z_b - 0.75),
            (sx * 13.5, 44.5, z_b - 1.15),
            (sx * 10.5, 49.5, z_b - 0.55),
        ]
        parts.append(build_curved_bone_horn(f'back-top-horn-{int(sx)}', top_horn, 2.4, 0.28, mats['bone_ivory']))

        # 背景のゴシック黒曜石ウェブ＋控えめな紫ルーン発光ライン
        for gy in (28.0, -24.0):
            gl = [(sx * 5.0, gy, z_b - 0.22), (sx * 19.5, gy + (4.5 if gy > 0 else -5.5), z_b - 0.22)]
            parts.append(lib.sweep_path_mm(
                f'back-glow-{int(sx)}-{int(gy)}', gl,
                lambda t: lib.chamfer_rect_profile(1.15, 0.35, 0.3),
                mats['purple_glow'], smooth_angle=35.0
            ))

    # 上部中央・下部中央のゴールドダイヤモンド頂点
    for tag, y_pos in (('top', 45.5), ('bot', -42.5)):
        pts = [(0.0, y_pos - 4.0, z_b - 0.35), (0.0, y_pos, z_b - 1.05), (0.0, y_pos + 4.0, z_b - 0.35)]
        parts.append(lib.sweep_path_mm(
            f'back-gold-point-{tag}', pts,
            lambda t: lib.blade_profile(max(0.25, 2.6 * math.sin(t * math.pi)), max(0.25, 0.85 * math.sin(t * math.pi))),
            mats['demon_gold'], smooth_angle=25.0
        ))
    return parts


def build():
    scene, root = lib.fresh_scene('CardFactionDemon', 'card-faction-demon')
    mats = make_materials()
    parts = []

    # 1. 本体コア（黒鉄コア＋古金レール＋凹開口＋UVパネル）
    parts.extend(lib.build_card_core_and_rails(mats['dark_iron'], mats['demon_gold'], mats['face'], 'demon'))
    parts.extend(lib.build_aperture_rims(mats['demon_gold'], 'demon-rim', width_mm=1.35, height_mm=0.55))

    # 2. 四隅の表〜側面〜裏 連続黒曜石ブラケット＋四隅ファセット紫水晶（表・裏・側面）
    for idx, (cx, cy) in enumerate(lib.CLAMP_CENTERS_MM):
        sx = 1.0 if cx > 0 else -1.0
        sy = 1.0 if cy > 0 else -1.0
        parts.append(lib.build_corner_wrap_bracket_mm(
            f'obsidian-corner-{idx}', sx, sy, mats['obsidian'],
            outer_x=32.5, outer_y=48.5, arm_x=10.2, arm_y=11.0, z_max=2.18, bevel_mm=0.38
        ))
        # 黒曜石ブラケットの外縁ゴールドトリム（表・裏）
        gx, gy = sx * 27.6, sy * 43.2
        rot = -40.0 * sx * sy
        parts.extend(lib.build_diamond_gem_mm(
            f'corner-amethyst-f-{idx}', (gx, gy), 2.15, 3.05, lib.FRONT_Z_MM + 0.42, +1.0,
            mats['amethyst_gem'], mats['demon_gold'], mats['amethyst_foil'], crown_mm=0.98, rot_deg=rot
        ))
        parts.extend(lib.build_diamond_gem_mm(
            f'corner-amethyst-b-{idx}', (gx, gy), 2.15, 3.05, lib.BACK_Z_MM - 0.42, -1.0,
            mats['amethyst_gem'], mats['demon_gold'], mats['amethyst_foil'], crown_mm=0.98, rot_deg=-rot
        ))
        # 側面コーナーの縦型ファセット紫水晶（edge-faction-demon.png 準拠）
        parts.extend(lib.build_side_gem_mm(
            f'corner-amethyst-edge-{idx}', sx * 32.35, sy * 41.2, 1.05, 4.2, sx,
            mats['amethyst_gem'], mats['demon_gold'], mats['amethyst_foil'], crown_mm=0.62
        ))

    # 3. 左右側面の紫鉄コア溝＋骨のシェブロン留め具（edge-faction-demon.png 準拠）
    for sx in (-1.0, 1.0):
        edge_glow = [(sx * 32.02, -34.0, 0.0), (sx * 32.02, 34.0, 0.0)]
        parts.append(lib.sweep_path_mm(
            f'edge-purple-core-{int(sx)}', edge_glow,
            lambda t: lib.chamfer_rect_profile(0.45, 1.65, 0.25),
            mats['purple_glow'], smooth_angle=35.0
        ))
        # 上中段の2つの骨のV字シェブロン留め具
        for ci, cy_e in enumerate((15.5, -1.5)):
            chev = [
                (sx * 32.15, cy_e + 4.2, 1.15),
                (sx * 32.75, cy_e - 1.2, 0.0),
                (sx * 32.15, cy_e + 4.2, -1.15),
            ]
            parts.append(lib.sweep_path_mm(
                f'edge-bone-chev-{int(sx)}-{ci}', chev,
                lambda t: lib.chamfer_rect_profile(1.45, 0.72, 0.3),
                mats['bone_ivory'], smooth_angle=30.0
            ))
        # 下段のゴールドV字シェブロン
        gchev = [
            (sx * 32.15, -24.5, 1.15),
            (sx * 32.70, -19.5, 0.0),
            (sx * 32.15, -24.5, -1.15),
        ]
        parts.append(lib.sweep_path_mm(
            f'edge-gold-chev-{int(sx)}', gchev,
            lambda t: lib.chamfer_rect_profile(1.25, 0.65, 0.3),
            mats['demon_gold'], smooth_angle=30.0
        ))

    # 4. 表面上部中央の大きなファセット紫水晶＋金属ベゼル
    parts.extend(lib.build_diamond_gem_mm(
        'front-top-amethyst', (0.0, 44.0), 3.25, 4.95, lib.FRONT_Z_MM + 0.55, +1.0,
        mats['amethyst_gem'], mats['demon_gold'], mats['amethyst_foil'],
        crown_mm=1.45, pavilion_mm=0.95, bezel_expand=1.34, bezel_h_mm=0.85
    ))

    # 5. 表面の骨肋骨・双角・下部牙
    parts.extend(build_front_bone_ribs(mats))

    # 6. 裏面の魔族紋章（中央大紫水晶＋骨の肋骨籠）
    parts.extend(build_back_demon_crest(mats))

    lib.finish_and_export(root, parts, OUT)
    print(f'Exported {OUT} ({OUT.stat().st_size:,} bytes, {len(parts)} parts)')


if __name__ == '__main__':
    build()
