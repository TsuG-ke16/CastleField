"""森林（forest）陣営専用 3Dカードフレーム生成スクリプト。

実行:
  blender --background --python assets/models/make-card-faction-forest.py

出力:
  assets/models/card-faction-forest.glb

仕様:
  assets/frames/factions.json（64×96×3.52mm, 角丸3mm, ベベル0.6mm）
  編み込まれた木の根、枝葉、真鍮の補強カラー、琥珀の宝石、裏面の生命樹とハート琥珀。
  2本の木の根ストランドが表・側面・裏へ連続して編み込まれる自然造形。
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import faction_card_lib as lib

OUT = lib.REPO / 'assets/models/card-faction-forest.glb'


def make_materials():
    return {
        'face': lib.make_material('face', (0.95, 0.89, 0.72), metallic=0.0, roughness=0.72),
        'forest_bg': lib.make_material('forest_bg', (0.075, 0.135, 0.028), metallic=0.0, roughness=0.86),
        'wood_bark': lib.make_material('wood_bark', (0.17, 0.068, 0.020), metallic=0.0, roughness=0.78),
        'wood_light': lib.make_material('wood_light', (0.35, 0.165, 0.042), metallic=0.0, roughness=0.68),
        'leaf_green': lib.make_material('leaf_green', (0.24, 0.39, 0.045), metallic=0.0, roughness=0.38, **{'Coat Weight': 0.25}),
        'moss_dark': lib.make_material('moss_dark', (0.12, 0.22, 0.03), metallic=0.0, roughness=0.94),
        'brass': lib.make_material('brass', (0.76, 0.50, 0.13), metallic=0.90, roughness=0.25, **{'Coat Weight': 0.22}),
        'amber_gem': lib.make_material('amber_gem', (0.98, 0.48, 0.02), metallic=0.0, roughness=0.03, **{'Transmission Weight': 0.88, 'IOR': 1.54, 'Coat Weight': 1.0, 'Coat Roughness': 0.015}),
        'amber_foil': lib.make_material('amber_foil', (1.00, 0.65, 0.08), metallic=1.0, roughness=0.10, **{'Emission Color': (1.00, 0.52, 0.04, 1.0), 'Emission Strength': 0.65}),
    }


def build_braided_root_edge(name, sx, mats):
    """左右側面（±X）を表〜側面〜裏にわたって編み込む2本螺旋の木の根ストランド＋絡む葉"""
    parts = []
    # 2本の主ストランド（位相πずれ）が側面 X=±31.0mm 付近を螺旋状に上下する
    y_start, y_end = -41.5, 41.5
    steps = 44
    turns = 3.5
    for strand in range(2):
        phase = strand * math.pi
        pts_side = []
        pts_front = []
        pts_back = []
        for i in range(steps + 1):
            t = i / steps
            y = y_start + (y_end - y_start) * t
            ang = t * turns * 2.0 * math.pi + phase
            # 側面をうねる螺旋（Z方向とX方向にうねる）
            xs = sx * (31.0 + 1.05 * math.cos(ang))
            zs = 1.15 * math.sin(ang)
            pts_side.append((xs, y, zs))
            # 表面側の編み根
            xf = sx * (27.6 + 1.65 * math.sin(ang))
            zf = lib.FRONT_Z_MM + 0.52 + 0.42 * math.cos(ang)
            pts_front.append((xf, y, zf))
            # 裏面側の編み根
            xb = sx * (27.6 + 1.65 * math.sin(ang + 0.6))
            zb = lib.BACK_Z_MM - 0.52 - 0.42 * math.cos(ang + 0.6)
            pts_back.append((xb, y, zb))
        mat = mats['wood_bark'] if strand == 0 else mats['wood_light']
        parts.append(lib.sweep_path_mm(
            f'{name}-side-s{strand}', pts_side,
            lambda t: lib.oval_profile(1.22, 1.05, 8, roll=t * 4.0),
            mat, smooth_angle=55.0
        ))
        parts.append(lib.sweep_path_mm(
            f'{name}-front-s{strand}', pts_front,
            lambda t: lib.oval_profile(1.45, 0.95, 8, roll=t * 4.0),
            mat, smooth_angle=55.0
        ))
        parts.append(lib.sweep_path_mm(
            f'{name}-back-s{strand}', pts_back,
            lambda t: lib.oval_profile(1.45, 0.95, 8, roll=t * 4.0),
            mat, smooth_angle=55.0
        ))

    # 側面の編み根の間に挟まる立体葉（edge-faction-forest.png 準拠）
    for idx, (yl, dy) in enumerate(((21.0, 7.5), (9.5, -6.5), (-13.5, 7.5), (-26.5, -6.5))):
        r = (sx * 32.0, yl, 0.0)
        t = (sx * 32.3, yl + dy, 0.45 * (1 if idx % 2 == 0 else -1))
        # 側面方向に少し膨らむ葉を3Dパスで生成
        l_pts = [
            (sx * 31.8, yl, 0.0),
            (sx * 32.6, yl + dy * 0.45, 0.35),
            (sx * 32.1, yl + dy, 0.0),
        ]
        parts.append(lib.sweep_path_mm(
            f'{name}-edge-leaf-{idx}', l_pts,
            lambda u: lib.blade_profile(max(0.15, 0.65 * math.sin(u * math.pi)), max(0.15, 1.35 * math.sin(u * math.pi))),
            mats['leaf_green'], smooth_angle=45.0
        ))

    # 表・裏の側面から生える立体的な葉
    leaf_ys = [24.0, 12.5, -13.0, -25.5]
    for i, ly in enumerate(leaf_ys):
        dy = 7.5 if i % 2 == 0 else -7.5
        # 表（左上のMPメダル領域 y>27 は避ける）
        f_leaf = lib.build_sculpted_leaf_mm(
            f'{name}-f-leaf-{i}',
            (sx * 26.8, ly, lib.FRONT_Z_MM + 0.55),
            (sx * 31.6, ly + dy, lib.FRONT_Z_MM + 1.15),
            2.4, 0.95, +1.0, mats['leaf_green'], arch_mm=0.75
        )
        b_leaf = lib.build_sculpted_leaf_mm(
            f'{name}-b-leaf-{i}',
            (sx * 26.8, ly, lib.BACK_Z_MM - 0.55),
            (sx * 31.6, ly + dy, lib.BACK_Z_MM - 1.15),
            2.4, 0.95, -1.0, mats['leaf_green'], arch_mm=0.75
        )
        parts.extend([f_leaf, b_leaf])
    return parts


def build_braided_horizontal_roots(name, sy, z_base, z_dir, mats):
    """上下辺（±Y）の編み込まれた木の根"""
    parts = []
    steps = 28
    for strand in range(2):
        phase = strand * math.pi
        pts = []
        for i in range(steps + 1):
            t = i / steps
            x = -24.5 + 49.0 * t
            ang = t * 2.5 * 2.0 * math.pi + phase
            y = sy * (43.2 + 1.45 * math.sin(ang))
            z = z_base + z_dir * (0.50 + 0.38 * math.cos(ang))
            pts.append((x, y, z))
        mat = mats['wood_bark'] if strand == 0 else mats['wood_light']
        parts.append(lib.sweep_path_mm(
            f'{name}-hroot-{strand}', pts,
            lambda t: lib.oval_profile(1.38, 0.92, 8, roll=t * 3.0),
            mat, smooth_angle=55.0
        ))
    return parts


def build_brass_mid_collar(name, sx, mats):
    """左右中央（Y=0）で表・側面・裏を一体に束ねる真鍮カラー（葉レリーフ＋リベット付き）"""
    parts = []
    y0 = 0.0
    # 本体リング（表→側面→裏）
    c_path = [
        (sx * 25.0, y0, lib.FRONT_Z_MM + 0.92),
        (sx * 32.3, y0, lib.FRONT_Z_MM + 0.65),
        (sx * 32.65, y0, 0.0),
        (sx * 32.3, y0, lib.BACK_Z_MM - 0.65),
        (sx * 25.0, y0, lib.BACK_Z_MM - 0.92),
    ]
    smooth_c = lib.catmull_rom_3d(c_path, 5)
    parts.append(lib.sweep_path_mm(
        f'{name}-band', smooth_c,
        lambda t: lib.chamfer_rect_profile(7.4, 1.35, 0.28),
        mats['brass'], smooth_angle=38.0
    ))
    # 上下の段差フチリング
    for dy in (-3.8, 3.8):
        rim_path = [(p[0], y0 + dy, p[2]) for p in smooth_c]
        parts.append(lib.sweep_path_mm(
            f'{name}-rim-{int(dy)}', rim_path,
            lambda t: lib.oval_profile(0.95, 1.05, 8),
            mats['brass'], smooth_angle=45.0
        ))
    # 表・裏の真鍮葉レリーフ
    parts.append(lib.build_sculpted_leaf_mm(
        f'{name}-leaf-f', (sx * 26.8, -1.6, lib.FRONT_Z_MM + 1.35), (sx * 30.8, 2.0, lib.FRONT_Z_MM + 1.45),
        1.7, 0.65, +1.0, mats['brass'], arch_mm=0.4
    ))
    parts.append(lib.build_sculpted_leaf_mm(
        f'{name}-leaf-b', (sx * 26.8, -1.6, lib.BACK_Z_MM - 1.35), (sx * 30.8, 2.0, lib.BACK_Z_MM - 1.45),
        1.7, 0.65, -1.0, mats['brass'], arch_mm=0.4
    ))
    # 側面の真鍮リベット
    for rz in (-1.2, 1.2):
        r_pts = [(sx * 32.5, y0, rz), (sx * 33.3, y0, rz)]
        parts.append(lib.sweep_path_mm(
            f'{name}-rivet-{int(rz*10)}', r_pts,
            lambda t: lib.oval_profile(max(0.2, 0.65 * (1.0 - 0.5 * t)), max(0.2, 0.65 * (1.0 - 0.5 * t)), 8),
            mats['brass'], smooth_angle=45.0
        ))
    return parts


def build_top_amber_crest(name, z_base, z_dir, mats):
    """上部中央の大きな涙型琥珀＋左右6枚の立体葉クラスター（編み根の前面に美しく配置）"""
    parts = []
    # 中央の大きな涙型琥珀（編み根 z+0.9 より手前に配置して貫通を防ぐ）
    parts.extend(lib.build_cabochon_gem_mm(
        f'{name}-amber', (0.0, 44.2), 3.6, 5.2, z_base + z_dir * 0.92, z_dir,
        mats['amber_gem'], mats['brass'], mats['amber_foil'], dome_mm=1.65, shape='teardrop', steps=22
    ))
    # 左右の3対の立体葉
    for sx in (-1.0, 1.0):
        for k, (rx, ry, tx, ty, w) in enumerate((
            (sx * 2.4, 40.5, sx * 8.6, 43.2, 2.4),
            (sx * 4.5, 42.8, sx * 12.8, 46.8, 2.6),
            (sx * 6.8, 41.0, sx * 14.5, 42.0, 2.2),
        )):
            parts.append(lib.build_sculpted_leaf_mm(
                f'{name}-leaf-{int(sx)}-{k}',
                (rx, ry, z_base + z_dir * 0.95),
                (tx, ty, z_base + z_dir * (1.35 - 0.12 * k)),
                w, 0.92, z_dir, mats['leaf_green'], arch_mm=0.65
            ))
    return parts


def build_three_leaf_cluster(name, cx, cy, scale, z_base, z_dir, mats):
    """中央・下部の三つ葉オーナメント"""
    parts = []
    parts.append(lib.build_sculpted_leaf_mm(
        f'{name}-mid', (cx, cy - 1.5 * scale, z_base + z_dir * 0.35),
        (cx, cy + 3.2 * scale, z_base + z_dir * 0.95),
        1.9 * scale, 0.8 * scale, z_dir, mats['leaf_green'], arch_mm=0.55 * scale
    ))
    for sx in (-1.0, 1.0):
        parts.append(lib.build_sculpted_leaf_mm(
            f'{name}-s-{int(sx)}', (cx + sx * 0.6 * scale, cy - 1.0 * scale, z_base + z_dir * 0.30),
            (cx + sx * 6.2 * scale, cy + 1.2 * scale, z_base + z_dir * 0.78),
            2.1 * scale, 0.78 * scale, z_dir, mats['leaf_green'], arch_mm=0.55 * scale
        ))
    return parts


def build_back_tree_of_life(mats):
    """裏面の生命樹（絡み合う立体幹・根・枝・多数の葉・中央のハート型琥珀）"""
    parts = []
    z_b = lib.BACK_Z_MM

    # 裏面の真鍮内枠
    in_rect = lib.resample_loop(lib.rounded_rect_mm(-24.2, -40.2, 24.2, 40.2, 2.8, steps=6), max_seg=2.2)
    parts.append(lib.sweep_path_mm(
        'back-brass-border', [(x, y, z_b - 0.15) for (x, y) in in_rect],
        lambda t: lib.chamfer_rect_profile(1.25, 0.85, 0.32),
        mats['brass'], closed=True, cap_ends=False, smooth_angle=38.0
    ))

    # 1. 中央の大きなハート型琥珀（生命樹の心臓）
    parts.extend(lib.build_cabochon_gem_mm(
        'back-heart-amber', (0.0, 6.2), 6.8, 6.6, z_b - 0.35, -1.0,
        mats['amber_gem'], mats['wood_light'], mats['amber_foil'],
        dome_mm=2.1, shape='heart', steps=28
    ))

    # 2. ハートを抱きかかえて上下へ広がる絡み合う幹と大枝・大根（左右対称）
    for sx in (-1.0, 1.0):
        # 幹の左右主柱（中央で交差・一体化してハートを包む連続曲線）
        trunk = [
            (-sx * 2.2, -13.5, z_b - 0.78),
            (0.0, -9.0, z_b - 1.05),
            (sx * 4.8, -1.5, z_b - 1.15),
            (sx * 8.2, 6.5, z_b - 1.18),
            (sx * 4.5, 14.5, z_b - 1.05),
            (0.0, 20.5, z_b - 0.92),
        ]
        parts.append(lib.sweep_path_mm(
            f'tree-trunk-{int(sx)}', lib.catmull_rom_3d(trunk, 6),
            lambda t: lib.oval_profile(1.45 * (1.0 - 0.25 * t), 0.95, 8),
            mats['wood_light'], smooth_angle=50.0
        ))
        # 上部へ広がる3本の枝＋葉
        branches = [
            [(sx * 2.0, 19.0, z_b - 0.85), (sx * 7.5, 25.5, z_b - 0.92), (sx * 15.0, 31.0, z_b - 0.65)],
            [(sx * 6.8, 12.5, z_b - 0.95), (sx * 13.5, 18.0, z_b - 0.85), (sx * 19.5, 23.0, z_b - 0.55)],
            [(sx * 7.8, 6.5, z_b - 0.95), (sx * 14.5, 8.5, z_b - 0.82), (sx * 19.8, 11.5, z_b - 0.50)],
        ]
        for bi, bpts in enumerate(branches):
            sm = lib.catmull_rom_3d(bpts, 5)
            parts.append(lib.sweep_path_mm(
                f'tree-branch-{int(sx)}-{bi}', sm,
                lambda t: lib.oval_profile(max(0.32, 1.05 * (1.0 - 0.62 * t)), max(0.28, 0.72 * (1.0 - 0.55 * t)), 7),
                mats['wood_light'], smooth_angle=48.0
            ))
            # 各枝に立体葉を3枚ずつ配置
            for li, u in enumerate((0.45, 0.72, 0.95)):
                idx = min(len(sm) - 1, int(u * (len(sm) - 1)))
                bx, by, bz = sm[idx]
                ang = math.radians(35 + 25 * li - 22 * bi)
                tx = bx + sx * 4.8 * math.cos(ang)
                ty = by + 4.8 * math.sin(ang)
                parts.append(lib.build_sculpted_leaf_mm(
                    f'tree-leaf-{int(sx)}-{bi}-{li}',
                    (bx, by, bz), (tx, ty, bz - 0.45),
                    2.0, 0.72, -1.0, mats['leaf_green'], arch_mm=0.55
                ))

        # 下部へ絡み合いながら広がる3本の根
        roots = [
            [(sx * 2.0, -9.0, z_b - 0.95), (sx * 9.5, -15.5, z_b - 0.95), (sx * 18.5, -24.0, z_b - 0.60), (sx * 14.0, -34.5, z_b - 0.45)],
            [(sx * 1.5, -10.5, z_b - 0.88), (sx * 6.5, -19.5, z_b - 0.88), (sx * 2.5, -28.0, z_b - 0.72), (-sx * 3.5, -35.0, z_b - 0.50)],
            [(sx * 3.5, -11.5, z_b - 0.85), (sx * 14.5, -13.0, z_b - 0.78), (sx * 20.5, -19.5, z_b - 0.55)],
        ]
        for ri, rpts in enumerate(roots):
            parts.append(lib.sweep_path_mm(
                f'tree-root-{int(sx)}-{ri}', lib.catmull_rom_3d(rpts, 6),
                lambda t: lib.oval_profile(max(0.35, 1.25 * (1.0 - 0.58 * t)), max(0.30, 0.82 * (1.0 - 0.52 * t)), 7),
                mats['wood_light'], smooth_angle=48.0
            ))

    # 頂部の中央の枝と葉
    top_b = [(0.0, 19.5, z_b - 0.85), (0.0, 29.5, z_b - 0.75)]
    parts.append(lib.sweep_path_mm(
        'tree-top-stem', top_b,
        lambda t: lib.oval_profile(max(0.35, 0.95 * (1.0 - 0.55 * t)), 0.65, 7),
        mats['wood_light'], smooth_angle=48.0
    ))
    parts.append(lib.build_sculpted_leaf_mm(
        'tree-top-leaf', (0.0, 28.5, z_b - 0.75), (0.0, 35.2, z_b - 1.05),
        2.3, 0.78, -1.0, mats['leaf_green'], arch_mm=0.55
    ))
    return parts


def build():
    scene, root = lib.fresh_scene('CardFactionForest', 'card-faction-forest')
    mats = make_materials()
    parts = []

    # 1. 本体コア（深森の濃緑木質コア＋真鍮レール＋凹開口＋UVパネル）
    parts.extend(lib.build_card_core_and_rails(mats['forest_bg'], mats['wood_bark'], mats['face'], 'forest'))
    parts.extend(lib.build_aperture_rims(mats['brass'], 'forest-rim', width_mm=1.40, height_mm=0.58))

    # 2. 左右の編み込み木の根（表・側面・裏へ連続）＋上下辺の編み込み根
    for sx in (-1.0, 1.0):
        parts.extend(build_braided_root_edge(f'braid-{int(sx)}', sx, mats))
        parts.extend(build_brass_mid_collar(f'brass-collar-{int(sx)}', sx, mats))
    for sy in (-1.0, 1.0):
        parts.extend(build_braided_horizontal_roots(f'hroot-f-{int(sy)}', sy, lib.FRONT_Z_MM, +1.0, mats))
        parts.extend(build_braided_horizontal_roots(f'hroot-b-{int(sy)}', sy, lib.BACK_Z_MM, -1.0, mats))

    # 3. 四隅の表〜側面〜裏を包み込む木の根ノット＋琥珀宝石（表・裏・側面）
    for idx, (cx, cy) in enumerate(lib.CLAMP_CENTERS_MM):
        sx = 1.0 if cx > 0 else -1.0
        sy = 1.0 if cy > 0 else -1.0
        # 連続する木の根の角ノット（表〜側面〜裏）
        parts.append(lib.build_corner_wrap_bracket_mm(
            f'root-knot-{idx}', sx, sy, mats['wood_bark'],
            outer_x=32.5, outer_y=48.5, arm_x=9.8, arm_y=10.5, z_max=2.15, bevel_mm=0.65
        ))
        # 表・裏の琥珀カボション
        gx, gy = sx * 27.6, sy * 43.2
        rot = -42.0 * sx * sy
        parts.extend(lib.build_cabochon_gem_mm(
            f'corner-amber-f-{idx}', (gx, gy), 2.8, 2.2, lib.FRONT_Z_MM + 0.45, +1.0,
            mats['amber_gem'], mats['wood_light'], mats['amber_foil'], dome_mm=1.25, rot_deg=rot
        ))
        parts.extend(lib.build_cabochon_gem_mm(
            f'corner-amber-b-{idx}', (gx, gy), 2.8, 2.2, lib.BACK_Z_MM - 0.45, -1.0,
            mats['amber_gem'], mats['wood_light'], mats['amber_foil'], dome_mm=1.25, rot_deg=-rot
        ))
        # 側面コーナーの縦型琥珀カボション（edge-faction-forest.png 準拠）
        side_pts = [(sx * 32.35, sy * 38.5, 0.0), (sx * 32.55, sy * 42.5, 0.0), (sx * 32.35, sy * 46.5, 0.0)]
        parts.append(lib.sweep_path_mm(
            f'corner-edge-amber-{idx}', side_pts,
            lambda t: lib.oval_profile(max(0.25, 0.85 * math.sin(t * math.pi)), max(0.35, 1.35 * math.sin(t * math.pi)), 10),
            mats['amber_gem'], smooth_angle=55.0
        ))
        # コーナー内側の苔クッション
        moss_pts = [(sx * 21.8, sy * 38.8, lib.FRONT_Z_MM + 0.25), (sx * 25.0, sy * 36.2, lib.FRONT_Z_MM + 0.35)]
        if not (sx < 0 and sy > 0):  # 左上はMPメダルを避ける
            parts.append(lib.sweep_path_mm(
                f'moss-f-{idx}', moss_pts,
                lambda t: lib.oval_profile(1.4, 0.72, 8),
                mats['moss_dark'], smooth_angle=60.0
            ))

    # 4. 表・裏の上部琥珀クレスト＋葉、下部三つ葉
    parts.extend(build_top_amber_crest('front-top', lib.FRONT_Z_MM, +1.0, mats))
    parts.extend(build_top_amber_crest('back-top', lib.BACK_Z_MM, -1.0, mats))
    parts.extend(build_three_leaf_cluster('front-mid-leaf', 0.0, -11.5, 0.92, lib.FRONT_Z_MM + 0.15, +1.0, mats))
    parts.extend(build_three_leaf_cluster('front-bot-leaf', 0.0, -43.8, 1.15, lib.FRONT_Z_MM + 0.15, +1.0, mats))
    parts.extend(build_three_leaf_cluster('back-bot-leaf', 0.0, -43.8, 1.15, lib.BACK_Z_MM - 0.15, -1.0, mats))

    # 5. 裏面の生命樹＋ハート琥珀
    parts.extend(build_back_tree_of_life(mats))

    lib.finish_and_export(root, parts, OUT)
    print(f'Exported {OUT} ({OUT.stat().st_size:,} bytes, {len(parts)} parts)')


if __name__ == '__main__':
    build()
