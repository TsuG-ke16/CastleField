"""竜族（dragon）陣営専用 3Dカードフレーム生成スクリプト。

実行:
  blender --background --python assets/models/make-card-faction-dragon.py

出力:
  assets/models/card-faction-dragon.glb

仕様:
  assets/frames/factions.json（64×96×3.52mm, 角丸3mm, ベベル0.6mm）
  黒い竜鋼コア、連続した深紅エナメル溝、青銅の装甲・翼桁・四隅の角装甲、深紅のルビー。
  鱗模様の反復は一切使わず、鋭く力強い鍛造シルエットと裏面の翼紋章＋紅玉槍先で構築。
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import faction_card_lib as lib

OUT = lib.REPO / 'assets/models/card-faction-dragon.glb'


def make_materials():
    return {
        'face': lib.make_material('face', (0.95, 0.88, 0.72), metallic=0.0, roughness=0.72),
        'dragonsteel': lib.make_material('dragonsteel', (0.042, 0.036, 0.046), metallic=0.82, roughness=0.30, **{'Coat Weight': 0.25}),
        'dragonsteel_dark': lib.make_material('dragonsteel_dark', (0.025, 0.020, 0.028), metallic=0.76, roughness=0.40),
        'bronze': lib.make_material('bronze', (0.82, 0.46, 0.14), metallic=0.94, roughness=0.20, **{'Coat Weight': 0.30}),
        'crimson_enamel': lib.make_material('crimson_enamel', (0.34, 0.015, 0.022), metallic=0.22, roughness=0.18, **{'Coat Weight': 0.90, 'Coat Roughness': 0.06}),
        'crimson_glow': lib.make_material('crimson_glow', (0.68, 0.02, 0.02), metallic=0.12, roughness=0.22, **{'Emission Color': (0.92, 0.04, 0.02, 1.0), 'Emission Strength': 0.85}),
        'ruby_gem': lib.make_material('ruby_gem', (0.86, 0.03, 0.06), metallic=0.0, roughness=0.015, **{'Transmission Weight': 0.90, 'IOR': 1.77, 'Coat Weight': 1.0, 'Coat Roughness': 0.01}),
        'ruby_foil': lib.make_material('ruby_foil', (1.00, 0.18, 0.12), metallic=1.0, roughness=0.08, **{'Emission Color': (0.75, 0.04, 0.04, 1.0), 'Emission Strength': 0.45}),
    }


def build_sharp_spar(name, pts_mm, w_base, w_tip, h_base, mat):
    """鋭い稜線と滑らかな根元テーパーを持つ青銅の竜翼桁・角ブレード"""
    sm = lib.catmull_rom_3d(pts_mm, 5)
    def prof(t):
        env = min(1.0, t / 0.14) ** 0.55 * ((1.0 - t) ** 0.70)
        return lib.blade_profile(
            max(0.20, w_base * env + w_tip * t),
            max(0.18, h_base * env + 0.20 * t),
            sharp=0.90
        )
    return lib.sweep_path_mm(name, sm, prof, mat, smooth_angle=26.0)


def build_ruby_spearhead(name, cx, cy, rx_mm, ry_up_mm, ry_dn_mm, z_base, z_dir, mats):
    """裏面中央の鋭利な多面体ルビー槍先（フラットシェード）＋青銅フレーム＋反射箔"""
    import bmesh
    import bpy

    def p(x, y, zr):
        return lib.pt(cx + x, cy + y, z_base + z_dir * zr)

    bm = bmesh.new()
    nv = bm.verts.new
    nf = bm.faces.new
    # 非対称の槍先ひし形（下が長く鋭く伸びる）
    g_lo, g_hi = 0.15, 0.45
    crest_z = 2.35
    # ガードル外周4点 + 中間稜線
    v_top = nv(p(0.0, ry_up_mm, g_hi))
    v_r = nv(p(rx_mm, 2.2, g_hi))
    v_bot = nv(p(0.0, -ry_dn_mm, g_hi))
    v_l = nv(p(-rx_mm, 2.2, g_hi))

    v_top_b = nv(p(0.0, ry_up_mm, g_lo))
    v_r_b = nv(p(rx_mm, 2.2, g_lo))
    v_bot_b = nv(p(0.0, -ry_dn_mm, g_lo))
    v_l_b = nv(p(-rx_mm, 2.2, g_lo))

    # テーブル／中央尾根（鋭い縦稜線）
    v_c_top = nv(p(0.0, ry_up_mm * 0.48, crest_z * 0.88))
    v_c_mid = nv(p(0.0, 2.0, crest_z))
    v_c_bot = nv(p(0.0, -ry_dn_mm * 0.58, crest_z * 0.72))
    v_cr = nv(p(rx_mm * 0.46, 2.1, crest_z * 0.78))
    v_cl = nv(p(-rx_mm * 0.46, 2.1, crest_z * 0.78))
    v_back = nv(p(0.0, 0.0, -1.10))

    # クラウンファセット（鋭く光を反射するフラット面）
    nf((v_c_top, v_cr, v_c_mid))
    nf((v_c_top, v_c_mid, v_cl))
    nf((v_c_mid, v_cr, v_c_bot))
    nf((v_c_mid, v_c_bot, v_cl))

    nf((v_top, v_r, v_cr, v_c_top))
    nf((v_top, v_c_top, v_cl, v_l))
    nf((v_r, v_bot, v_c_bot, v_cr))
    nf((v_l, v_cl, v_c_bot, v_bot))

    # ガードル側面
    nf((v_top, v_top_b, v_r_b, v_r))
    nf((v_r, v_r_b, v_bot_b, v_bot))
    nf((v_bot, v_bot_b, v_l_b, v_l))
    nf((v_l, v_l_b, v_top_b, v_top))
    # パビリオン
    nf((v_top_b, v_back, v_r_b))
    nf((v_r_b, v_back, v_bot_b))
    nf((v_bot_b, v_back, v_l_b))
    nf((v_l_b, v_back, v_top_b))

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    parts = [lib.link_obj(name, mesh, mats['ruby_gem'], flat=True)]

    # 青銅の槍先フレーム（外周ベゼル＋上下冠角）
    bez = [
        (cx, cy + ry_up_mm + 2.2, z_base + z_dir * 0.75),
        (cx + rx_mm + 1.5, cy + 2.2, z_base + z_dir * 0.95),
        (cx, cy - ry_dn_mm - 3.2, z_base + z_dir * 0.75),
        (cx - rx_mm - 1.5, cy + 2.2, z_base + z_dir * 0.95),
    ]
    parts.append(lib.sweep_path_mm(
        f'{name}-bezel', bez,
        lambda t: lib.chamfer_rect_profile(1.85, 1.35, 0.30),
        mats['bronze'], closed=True, cap_ends=False, smooth_angle=25.0
    ))
    # 反射箔カップ
    foil_rings = [
        [p(0.0, ry_up_mm * 0.92, 0.05), p(rx_mm * 0.92, 2.2, 0.05),
         p(0.0, -ry_dn_mm * 0.92, 0.05), p(-rx_mm * 0.92, 2.2, 0.05)],
        [p(0.0, ry_up_mm * 0.45, -0.65), p(rx_mm * 0.45, 2.2, -0.65),
         p(0.0, -ry_dn_mm * 0.45, -0.65), p(-rx_mm * 0.45, 2.2, -0.65)],
    ]
    parts.append(lib.loft_rings(f'{name}-foil', foil_rings, mats['ruby_foil'], closed=True, cap_end=p(0, 0, -1.15), flat=True))
    return parts


def build_corner_dragon_horn_armor(idx, sx, sy, mats):
    """四隅の表〜側面〜裏を一体で包み込む角型竜鋼＋青銅ブレード装甲"""
    parts = []
    # 1. 表〜側面〜裏を連続ラップする黒い竜鋼コーナー装甲本体
    parts.append(lib.build_corner_wrap_bracket_mm(
        f'dragon-corner-steel-{idx}', sx, sy, mats['dragonsteel'],
        outer_x=32.5, outer_y=48.5, arm_x=11.0, arm_y=11.5, z_max=2.18, bevel_mm=0.35
    ))
    # 2. コーナーから鋭く反り返る青銅の竜角ブレード（表・裏・側面が1つの鋭利な角としてつながる）
    for z_tag, z_val in (('f', lib.FRONT_Z_MM + 0.72), ('b', lib.BACK_Z_MM - 0.72)):
        horn_top = [
            (sx * 24.5, sy * 43.2, z_val),
            (sx * 31.2, sy * 45.8, z_val + (0.28 if z_tag == 'f' else -0.28)),
            (sx * 33.4, sy * 50.6, z_val * 0.45),
        ]
        parts.append(build_sharp_spar(f'corner-horn-a-{idx}-{z_tag}', horn_top, 2.45, 0.22, 1.15, mats['bronze']))
        # 側面に沿って切れ込む副ブレード
        horn_side = [
            (sx * 31.2, sy * 45.5, z_val),
            (sx * 33.0, sy * 39.2, z_val * 0.75),
            (sx * 30.2, sy * 33.8, z_val * 0.45),
        ]
        parts.append(build_sharp_spar(f'corner-horn-b-{idx}-{z_tag}', horn_side, 2.05, 0.25, 0.95, mats['bronze']))

    # 3. 側面コーナーの青銅V字カラー（edge-faction-dragon.png 準拠）
    v_collar = [
        (sx * 32.15, sy * 43.8, 1.35),
        (sx * 32.95, sy * 38.2, 0.0),
        (sx * 32.15, sy * 43.8, -1.35),
    ]
    parts.append(lib.sweep_path_mm(
        f'corner-edge-v-{idx}', v_collar,
        lambda t: lib.blade_profile(1.45, 0.78),
        mats['bronze'], smooth_angle=25.0
    ))
    return parts


def build_front_armor_and_wings(mats):
    """表面の竜鋼眉装甲、上部大ルビー、側面青銅翼桁、深紅エナメル溝"""
    parts = []
    z_f = lib.FRONT_Z_MM

    # 1. 上部中央の大きなファセット深紅ルビー＋鋭角青銅ベゼル
    parts.extend(lib.build_diamond_gem_mm(
        'front-top-ruby', (0.0, 44.2), 3.6, 5.8, z_f + 0.52, +1.0,
        mats['ruby_gem'], mats['bronze'], mats['ruby_foil'],
        crown_mm=1.55, pavilion_mm=0.95, bezel_expand=1.32, bezel_h_mm=0.88
    ))
    # 上部の左右竜鋼ブロー装甲＋深紅ライン
    for sx in (-1.0, 1.0):
        brow = [
            (sx * 5.2, 43.5, z_f + 0.65),
            (sx * 14.5, 45.2, z_f + 0.95),
            (sx * 23.2, 42.5, z_f + 0.72),
        ]
        parts.append(build_sharp_spar(f'front-top-brow-{int(sx)}', brow, 2.6, 1.1, 1.15, mats['dragonsteel']))
        # ブロー下の深紅発光アクセント（左上はMPメダル手前で止める）
        x_end = 22.0 if sx > 0 else 14.5
        red_top = [(sx * 5.5, 40.2, z_f + 0.20), (sx * x_end, 40.5, z_f + 0.20)]
        parts.append(lib.sweep_path_mm(
            f'front-red-top-{int(sx)}', red_top,
            lambda t: lib.chamfer_rect_profile(1.1, 0.30, 0.3),
            mats['crimson_glow'], smooth_angle=30.0
        ))

    # 2. 左右側面の鋭利な青銅翼桁（sweeping wing spars）＋深紅エナメル溝
    for sx in (-1.0, 1.0):
        # 表面側面を走る深紅エナメル溝
        ch = [(sx * 27.5, -35.0, z_f + 0.12), (sx * 27.5, 29.0, z_f + 0.12)]
        parts.append(lib.sweep_path_mm(
            f'front-crimson-ch-{int(sx)}', ch,
            lambda t: lib.chamfer_rect_profile(2.6, 0.32, 0.28),
            mats['crimson_enamel'], smooth_angle=30.0
        ))
        # 上段・中段・下段の3対の鋭い青銅ブレード翼桁
        spars = [
            [(sx * 26.2, 26.5, z_f + 0.45), (sx * 31.8, 17.5, z_f + 1.15), (sx * 28.0, 8.5, z_f + 0.65)],
            [(sx * 28.2, 11.5, z_f + 0.55), (sx * 32.0, 1.5, z_f + 1.15), (sx * 26.8, -9.5, z_f + 0.45)],
            [(sx * 26.5, -14.5, z_f + 0.40), (sx * 31.6, -24.5, z_f + 1.05), (sx * 28.2, -34.5, z_f + 0.55)],
        ]
        for si, spts in enumerate(spars):
            parts.append(build_sharp_spar(f'front-wing-spar-{int(sx)}-{si}', spts, 2.45, 0.35, 1.10, mats['bronze']))

    # 3. 名前欄・説明欄の間の青銅菱形＆下部中央の青銅槍先＋深紅ライン
    for tag, y_c, sc in (('mid', -26.8, 0.85), ('bot', -43.5, 1.25)):
        pts = [(0.0, y_c - 3.6 * sc, z_f + 0.35), (0.0, y_c, z_f + 1.05 * sc), (0.0, y_c + 3.6 * sc, z_f + 0.35)]
        parts.append(lib.sweep_path_mm(
            f'front-bronze-diamond-{tag}', pts,
            lambda t, sc=sc: lib.blade_profile(max(0.2, 2.2 * sc * math.sin(t * math.pi)), max(0.2, 0.9 * sc * math.sin(t * math.pi))),
            mats['bronze'], smooth_angle=24.0
        ))
    bot_red = [(-19.0, -42.5, z_f + 0.18), (19.0, -42.5, z_f + 0.18)]
    parts.append(lib.sweep_path_mm(
        'front-red-bot', bot_red,
        lambda t: lib.chamfer_rect_profile(1.15, 0.32, 0.3),
        mats['crimson_glow'], smooth_angle=30.0
    ))
    return parts


def build_back_dragon_crest(mats):
    """裏面の竜族紋章（中央の巨大ルビー槍先＋左右に広がる立体青銅竜翼＋深紅翼膜＋幾何学竜鋼パネル）"""
    parts = []
    z_b = lib.BACK_Z_MM

    # 1. 上部中央のファセットルビー（表と対称）＋下部青銅槍先
    parts.extend(lib.build_diamond_gem_mm(
        'back-top-ruby', (0.0, 44.2), 3.6, 5.8, z_b - 0.52, -1.0,
        mats['ruby_gem'], mats['bronze'], mats['ruby_foil'],
        crown_mm=1.55, pavilion_mm=0.95, bezel_expand=1.32, bezel_h_mm=0.88
    ))
    bot_pt = [(0.0, -47.5, z_b - 0.35), (0.0, -43.0, z_b - 1.05), (0.0, -38.5, z_b - 0.35)]
    parts.append(lib.sweep_path_mm(
        'back-bot-bronze-pt', bot_pt,
        lambda t: lib.blade_profile(max(0.2, 2.6 * math.sin(t * math.pi)), max(0.2, 0.95 * math.sin(t * math.pi))),
        mats['bronze'], smooth_angle=24.0
    ))

    # 2. 裏面の深紅エナメル内縁ライン（鱗なしのシャープな幾何学フレーム）
    in_red = lib.resample_loop(lib.rounded_rect_mm(-24.8, -40.2, 24.8, 39.2, 3.2, steps=5), max_seg=2.5)
    parts.append(lib.sweep_path_mm(
        'back-crimson-inner-line', [(x, y, z_b - 0.15) for (x, y) in in_red],
        lambda t: lib.chamfer_rect_profile(1.25, 0.38, 0.3),
        mats['crimson_glow'], closed=True, cap_ends=False, smooth_angle=30.0
    ))
    # 放射状の鋭い幾何学パネル溝（back-faction-dragon.png 準拠）
    for sx in (-1.0, 1.0):
        for p0, p1 in (
            ((sx * 4.5, 24.0), (sx * 18.0, 38.5)),
            ((sx * 6.5, -14.0), (sx * 22.5, -36.5)),
        ):
            parts.append(lib.sweep_path_mm(
                f'back-panel-line-{int(sx)}-{int(p0[1])}',
                [(p0[0], p0[1], z_b - 0.12), (p1[0], p1[1], z_b - 0.12)],
                lambda t: lib.chamfer_rect_profile(0.85, 0.26, 0.25),
                mats['crimson_enamel'], smooth_angle=28.0
            ))

    # 3. 中央の巨大ルビー槍先（back-faction-dragon.png の象徴！）
    parts.extend(build_ruby_spearhead('back-ruby-spearhead', 0.0, 1.5, 4.8, 12.2, 18.8, z_b - 0.35, -1.0, mats))
    # ルビー槍先の上部冠角
    for sx in (-1.0, 1.0):
        crown_arm = [
            (sx * 1.0, 15.5, z_b - 0.95),
            (sx * 4.8, 19.5, z_b - 1.15),
            (0.0, 26.5, z_b - 0.85),
        ]
        parts.append(build_sharp_spar(f'back-spear-crown-{int(sx)}', crown_arm, 1.45, 0.28, 0.85, mats['bronze']))

    # 4. 左右に大きく羽ばたく立体青銅の竜翼＋深紅エナメル翼膜
    for sx in (-1.0, 1.0):
        # 翼の主上縁桁（高く鋭く跳ね上がる竜翼の骨格）
        wing_top = [
            (sx * 4.8, 5.5, z_b - 0.95),
            (sx * 12.8, 13.5, z_b - 1.55),
            (sx * 22.8, 26.8, z_b - 1.15),
        ]
        parts.append(build_sharp_spar(f'back-wing-main-{int(sx)}', wing_top, 3.2, 0.35, 1.35, mats['bronze']))

        # 翼の3本の指骨（外側・中側・内側へ鋭く垂れ下がる青銅スパー）
        fingers = [
            [(sx * 12.5, 13.2, z_b - 1.45), (sx * 23.8, 9.5, z_b - 1.35), (sx * 29.5, -2.5, z_b - 0.85)],
            [(sx * 12.2, 12.0, z_b - 1.35), (sx * 20.5, 1.5, z_b - 1.25), (sx * 26.5, -14.5, z_b - 0.72)],
            [(sx * 9.5, 7.8, z_b - 1.15), (sx * 14.2, -3.5, z_b - 1.15), (sx * 12.5, -16.5, z_b - 0.65)],
        ]
        for fi, fpts in enumerate(fingers):
            parts.append(build_sharp_spar(f'back-wing-finger-{int(sx)}-{fi}', fpts, 2.35 - 0.25 * fi, 0.28, 1.10, mats['bronze']))

        # 深紅エナメルの立体翼膜（青銅指骨の内側にきっちり収まる光沢深紅パネル）
        mem_poly = [
            (sx * 6.2, 5.8),
            (sx * 12.6, 12.2),
            (sx * 22.5, 8.2),
            (sx * 26.8, -1.5),
            (sx * 21.8, -1.8),
            (sx * 24.5, -11.5),
            (sx * 16.5, -6.5),
            (sx * 12.2, -13.5),
            (sx * 8.2, -3.5),
        ]
        if sx < 0:
            mem_poly.reverse()
        parts.append(lib.extrude_beveled_slab_mm(
            f'back-wing-membrane-{int(sx)}', [mem_poly], z_b - 0.92, z_b + 0.05, 0.22, mats['crimson_enamel'], resolution=1
        ))

        # 裏面外枠の青銅翼桁（表と統一された側面シルエット）
        side_spars = [
            [(sx * 27.5, 25.0, z_b - 0.45), (sx * 31.8, 16.0, z_b - 1.05), (sx * 28.0, 7.5, z_b - 0.55)],
            [(sx * 27.5, -15.0, z_b - 0.45), (sx * 31.6, -24.5, z_b - 1.00), (sx * 28.2, -34.0, z_b - 0.50)],
        ]
        for si, spts in enumerate(side_spars):
            parts.append(build_sharp_spar(f'back-side-spar-{int(sx)}-{si}', spts, 2.25, 0.35, 1.05, mats['bronze']))
    return parts


def build():
    scene, root = lib.fresh_scene('CardFactionDragon', 'card-faction-dragon')
    mats = make_materials()
    parts = []

    # 1. 本体コア（黒竜鋼コア＋青銅レール＋凹開口＋UVパネル）
    parts.extend(lib.build_card_core_and_rails(mats['dragonsteel'], mats['bronze'], mats['face'], 'dragon'))
    parts.extend(lib.build_aperture_rims(mats['bronze'], 'dragon-rim', width_mm=1.35, height_mm=0.58))

    # 2. 四隅の表〜側面〜裏 連続竜角装甲
    for idx, (cx, cy) in enumerate(lib.CLAMP_CENTERS_MM):
        sx = 1.0 if cx > 0 else -1.0
        sy = 1.0 if cy > 0 else -1.0
        parts.extend(build_corner_dragon_horn_armor(idx, sx, sy, mats))

    # 3. 左右側面の連続深紅エナメル溝（factions.json: "Keep the red side channel continuous"）＋青銅Vシェブロン
    for sx in (-1.0, 1.0):
        red_side = [(sx * 32.02, -41.0, 0.0), (sx * 32.02, 41.0, 0.0)]
        parts.append(lib.sweep_path_mm(
            f'edge-crimson-channel-{int(sx)}', red_side,
            lambda t: lib.chamfer_rect_profile(0.48, 1.65, 0.25),
            mats['crimson_enamel'], smooth_angle=30.0
        ))
        # 中央を走る細い深紅ハイライト芯線
        red_core = [(sx * 32.22, -39.0, 0.0), (sx * 32.22, 39.0, 0.0)]
        parts.append(lib.sweep_path_mm(
            f'edge-crimson-core-{int(sx)}', red_core,
            lambda t: lib.chamfer_rect_profile(0.28, 0.55, 0.25),
            mats['crimson_glow'], smooth_angle=30.0
        ))
        # 側面の青銅V字シェブロン留め具（上下2箇所、edge-faction-dragon.png 準拠）
        for ci, cy_e in enumerate((16.5, -18.5)):
            chev = [
                (sx * 32.15, cy_e + 4.5, 1.25),
                (sx * 32.85, cy_e - 1.5, 0.0),
                (sx * 32.15, cy_e + 4.5, -1.25),
            ]
            parts.append(lib.sweep_path_mm(
                f'edge-bronze-chev-{int(sx)}-{ci}', chev,
                lambda t: lib.blade_profile(1.35, 0.72),
                mats['bronze'], smooth_angle=25.0
            ))

    # 4. 表面の竜鋼装甲・上部ルビー・青銅翼桁
    parts.extend(build_front_armor_and_wings(mats))

    # 5. 裏面の竜翼紋章＋巨大ルビー槍先
    parts.extend(build_back_dragon_crest(mats))

    lib.finish_and_export(root, parts, OUT)
    print(f'Exported {OUT} ({OUT.stat().st_size:,} bytes, {len(parts)} parts)')


if __name__ == '__main__':
    build()
