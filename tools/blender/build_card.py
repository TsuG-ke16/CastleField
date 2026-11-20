"""
キャッスルフィールド用 3Dカードモデル生成スクリプト（Blender bpy / ヘッドレス実行用）。

実行例:
  blender -b -P tools/blender/build_card.py
  blender -b -P tools/blender/build_card.py -- --only legendary
  blender -b -P tools/blender/build_card.py -- --out assets/models

座標系:
  Blender 内では X=右, Y=奥行き(-Yが表, +Yが裏), Z=上 で作成する。
  glTF 2.0 書き出し（export_yup=True）により、three.js 側では
    +X=右, +Y=上, +Z=表（手前）, -Z=裏（奥）
  となる。カード本体は幅 2.0 × 高さ 3.0（512×768 と同じ 2:3）、中心は原点。

生成されるメッシュ名（three.js 側でテクスチャ・材質を張りかえる）:
  - CardBody      : 角丸＋面取り（ベベル）付きのカード本体（側面・土台）
  - FrontFrame    : 表の枠の面（絵の窓をくり抜き、奥へ凹む内壁付き。UV=0..1 → frame-*.png）
  - FrontWindow   : 絵の窓の背景面（UV=0..1 → window-*.png）
  - FrontArt      : 絵の窓の奥に一段へこんだ絵の面（UV=0..1 → card-*.png）
  - FrontRaised   : 表の浮き彫り飾り用の面（UV=0..1 → frame-*.png + *-raised.png マスク）
  - FrontBanner   : 名前の帯のわずかに浮いたプレート（立体感用）
  - FrontLabel    : 名前・種別アイコンを重ねる透明オーバーレイ面（UV=0..1）
  - FrontOrnament : レアリティごとの立体的な縁取り・コーナー装飾（common では省略）
  - BackFace      : 裏面（裏から見て正立・非反転の UV=0..1 → back-*.png / card-back.png）
  - BackRaised    : 裏面の浮き彫り飾り用の面（UV=0..1 → back-*-raised.png マスク）
"""

import argparse
import json
import math
import os
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector, Matrix


def parse_args():
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    else:
        argv = []
    parser = argparse.ArgumentParser(description="Build 3D card GLB models for Castle Field")
    parser.add_argument("--presets", default=None, help="Path to card_presets.json")
    parser.add_argument("--out", default=None, help="Output directory for .glb files")
    parser.add_argument("--only", nargs="*", default=None, help="Specific preset names to build")
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_material(name, color, metallic=0.2, roughness=0.5, alpha_blend=False):
    mat = bpy.data.materials.new(name=name)
    if bpy.app.version < (5, 0, 0):
        mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF") if mat.node_tree else None
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (color[0], color[1], color[2], 1.0)
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Roughness"].default_value = roughness
    if alpha_blend and hasattr(mat, "blend_method"):
        mat.blend_method = "BLEND"
    return mat


def rounded_rect_points(w, h, r, segs=6):
    """XY平面上の角丸長方形（反時計回り）の頂点リスト [(x, z), ...]。"""
    hw = w * 0.5
    hh = h * 0.5
    r = min(r, hw * 0.45, hh * 0.45)
    corners = [
        (hw - r, hh - r, 0.0, math.pi * 0.5),
        (-hw + r, hh - r, math.pi * 0.5, math.pi),
        (-hw + r, -hh + r, math.pi, math.pi * 1.5),
        (hw - r, -hh + r, math.pi * 1.5, math.pi * 2.0),
    ]
    pts = []
    for cx, cz, a0, a1 in corners:
        for i in range(segs + 1):
            a = a0 + (a1 - a0) * (i / segs)
            pts.append((cx + math.cos(a) * r, cz + math.sin(a) * r))
    return pts


def link_mesh_object(name, bm, material, smooth=True):
    mesh = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    if smooth:
        for poly in mesh.polygons:
            poly.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(material)
    return obj


def build_card_body(w, h, cfg, mat):
    """角丸＋面取り（ベベル）付きのカード本体を作成する。
    枠 PNG の外周マージンからはみ出さないよう、わずかに内側に収める。"""
    t = cfg["thickness"]
    r = cfg["cornerRadius"]
    bw = min(cfg["bevelWidth"], t * 0.42)
    bsegs = int(cfg["bevelSegments"])

    body_w = w * 0.89
    body_h = h * 0.925
    z_shift = -0.025

    bm = bmesh.new()
    pts = rounded_rect_points(body_w, body_h, r, segs=6)
    half_t = t * 0.5

    # 表 (-half_t) と 裏 (+half_t) の輪郭リングを作り、側面と表裏の蓋を張る
    front_verts = [bm.verts.new((x, -half_t, z + z_shift)) for x, z in pts]
    back_verts = [bm.verts.new((x, half_t, z + z_shift)) for x, z in pts]

    # 表の蓋（法線が -Y を向くように時計回り）
    bm.faces.new(list(reversed(front_verts)))
    # 裏の蓋（法線が +Y を向くように反時計回り）
    bm.faces.new(back_verts)

    n = len(pts)
    for i in range(n):
        ni = (i + 1) % n
        bm.faces.new((front_verts[i], front_verts[ni], back_verts[ni], back_verts[i]))

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    # 表裏のふちエッジだけを面取り（ベベル）する
    ring_edges = [
        e for e in bm.edges
        if abs(e.verts[0].co.y - e.verts[1].co.y) < 1e-5
    ]
    bmesh.ops.bevel(
        bm,
        geom=ring_edges,
        offset=bw,
        offset_type="OFFSET",
        segments=bsegs,
        profile=0.55,
        affect="EDGES",
        clamp_overlap=True,
    )

    # 側面・本体に簡易 UV を付与
    uv_layer = bm.loops.layers.uv.verify()
    for face in bm.faces:
        for loop in face.loops:
            co = loop.vert.co
            u = (co.x / w) + 0.5
            v = (co.z / h) + 0.5
            loop[uv_layer].uv = (u, v)

    bmesh.ops.triangulate(bm, faces=bm.faces)
    return link_mesh_object("CardBody", bm, mat, smooth=True)


def build_front_frame(w, h, win, cfg, mat):
    """表の枠（絵の窓より一段手前に盛り上がり、奥へ凹む内壁付き）を作成する。"""
    half_t = cfg["thickness"] * 0.5
    recess = cfg["recess"]
    # 絵（FrontArt）は CardBody の表面 (-half_t) のすぐ手前。枠はそのさらに recess ぶん手前に盛る
    y_art = -(half_t + 0.008)
    y_front = y_art - recess
    y_wall_back = y_art + 0.002

    hw = w * 0.5
    hh = h * 0.5

    # 窓の座標（top は上端からの割合なので +hh から引く）
    wx0 = -hw + win["left"] * w
    wx1 = wx0 + win["width"] * w
    wz1 = hh - win["top"] * h
    wz0 = wz1 - win["height"] * h

    # 4枚の台形/長方形で窓の周囲を囲む（UVは 512x768 全体に厳密一致）
    # 外周は角丸にせず全面 0..1 で張り、frame-*.png のアルファ透過で装飾の輪郭まで完全再現する
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.verify()

    def add_front_quad(x0, z0, x1, z1, y_val):
        # 表は -Y 法線（glTF で +Z）。+X → +Z の外積は -Y なので (x0,z0)->(x1,z0)->(x1,z1)->(x0,z1)
        v0 = bm.verts.new((x0, y_val, z0))
        v1 = bm.verts.new((x1, y_val, z0))
        v2 = bm.verts.new((x1, y_val, z1))
        v3 = bm.verts.new((x0, y_val, z1))
        f = bm.faces.new((v0, v1, v2, v3))
        for loop in f.loops:
            co = loop.vert.co
            loop[uv_layer].uv = ((co.x + hw) / w, (co.z + hh) / h)
        return f

    # 上帯・下帯・左帯・右帯
    add_front_quad(-hw, wz1, hw, hh, y_front)
    add_front_quad(-hw, -hh, hw, wz0, y_front)
    add_front_quad(-hw, wz0, wx0, wz1, y_front)
    add_front_quad(wx1, wz0, hw, wz1, y_front)

    # 窓の凹みの内壁（4辺。わずかに内側へテーパーさせて斜めから見やすくする）
    taper = 0.012
    ix0, ix1 = wx0 + taper, wx1 - taper
    iz0, iz1 = wz0 + taper, wz1 - taper

    wall_quads = [
        # 左壁（内側=+X を向く）
        ((wx0, y_front, wz0), (wx0, y_front, wz1), (ix0, y_wall_back, iz1), (ix0, y_wall_back, iz0)),
        # 右壁（内側=-X を向く）
        ((wx1, y_front, wz1), (wx1, y_front, wz0), (ix1, y_wall_back, iz0), (ix1, y_wall_back, iz1)),
        # 上壁（内側=-Z を向く）
        ((wx0, y_front, wz1), (wx1, y_front, wz1), (ix1, y_wall_back, iz1), (ix0, y_wall_back, iz1)),
        # 下壁（内側=+Z を向く）
        ((wx1, y_front, wz0), (wx0, y_front, wz0), (ix0, y_wall_back, iz0), (ix1, y_wall_back, iz0)),
    ]
    for p0, p1, p2, p3 in wall_quads:
        verts = [bm.verts.new(p) for p in (p0, p1, p2, p3)]
        f = bm.faces.new(verts)
        for loop in f.loops:
            co = loop.vert.co
            # 壁の UV は枠の縁のピクセルを少し外側からサンプリングして透明にならないようにする
            cx = max(-hw, min(hw, co.x))
            cz = max(-hh, min(hh, co.z))
            u = (cx + hw) / w
            v = (cz + hh) / h
            # 窓の内側へわずかに寄っている分を外側へ押し戻す
            u = max(0.02, min(0.98, u + (-0.015 if co.x <= (wx0 + wx1) * 0.5 else 0.015)))
            v = max(0.02, min(0.98, v + (-0.015 if co.z <= (wz0 + wz1) * 0.5 else 0.015)))
            loop[uv_layer].uv = (u, v)

    bmesh.ops.triangulate(bm, faces=bm.faces)
    return link_mesh_object("FrontFrame", bm, mat, smooth=False)


def build_front_plane(name, x0, z0, x1, z1, y_val, mat, uv_mode="local"):
    """表向きの長方形メッシュ（法線 -Y → glTF で +Z）を作成する。"""
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.verify()
    v0 = bm.verts.new((x0, y_val, z0))
    v1 = bm.verts.new((x1, y_val, z0))
    v2 = bm.verts.new((x1, y_val, z1))
    v3 = bm.verts.new((x0, y_val, z1))
    f = bm.faces.new((v0, v1, v2, v3))
    uvs = [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)]
    for loop, uv in zip(f.loops, uvs):
        loop[uv_layer].uv = uv
    bmesh.ops.triangulate(bm, faces=bm.faces)
    return link_mesh_object(name, bm, mat, smooth=False)


def build_back_plane(name, w, h, y_val, mat, z_shift=-0.025):
    """裏向きの長方形メッシュ（法線 +Y → glTF で -Z）。裏から正立・非反転で見える UV を切る。"""
    hw = w * 0.5
    hh = h * 0.5
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.verify()
    # 法線 +Y にするため: (-hw,-hh) -> (-hw,+hh) -> (+hw,+hh) -> (+hw,-hh)
    v0 = bm.verts.new((-hw, y_val, -hh + z_shift))
    v1 = bm.verts.new((-hw, y_val, hh + z_shift))
    v2 = bm.verts.new((hw, y_val, hh + z_shift))
    v3 = bm.verts.new((hw, y_val, -hh + z_shift))
    f = bm.faces.new((v0, v1, v2, v3))
    # 裏から見て左端 (+hw) が u=0、右端 (-hw) が u=1
    uvs = [(1.0, 0.0), (1.0, 1.0), (0.0, 1.0), (0.0, 0.0)]
    for loop, uv in zip(f.loops, uvs):
        loop[uv_layer].uv = uv
    bmesh.ops.triangulate(bm, faces=bm.faces)
    return link_mesh_object(name, bm, mat, smooth=False)


def build_banner_plate(w, h, banner, cfg, mat):
    """名前の帯のわずかに浮いたプレートを作成する。"""
    half_t = cfg["thickness"] * 0.5
    y_base = -(half_t + 0.008 + cfg["recess"])
    lift = cfg["bannerLift"]
    hw = w * 0.5
    hh = h * 0.5

    bx0 = -hw + banner["left"] * w
    bx1 = bx0 + banner["width"] * w
    bz1 = hh - banner["top"] * h
    bz0 = bz1 - banner["height"] * h

    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.verify()
    # 薄い押し出しプレート（枠の帯のピクセルをそのまま貼る）
    bevel_in = 0.015
    front = [
        bm.verts.new((bx0 + bevel_in, y_base - lift, bz0 + bevel_in)),
        bm.verts.new((bx1 - bevel_in, y_base - lift, bz0 + bevel_in)),
        bm.verts.new((bx1 - bevel_in, y_base - lift, bz1 - bevel_in)),
        bm.verts.new((bx0 + bevel_in, y_base - lift, bz1 - bevel_in)),
    ]
    back = [
        bm.verts.new((bx0, y_base, bz0)),
        bm.verts.new((bx1, y_base, bz0)),
        bm.verts.new((bx1, y_base, bz1)),
        bm.verts.new((bx0, y_base, bz1)),
    ]
    bm.faces.new(front)
    for i in range(4):
        ni = (i + 1) % 4
        bm.faces.new((back[i], back[ni], front[ni], front[i]))

    for face in bm.faces:
        for loop in face.loops:
            co = loop.vert.co
            loop[uv_layer].uv = ((co.x + hw) / w, (co.z + hh) / h)

    bmesh.ops.triangulate(bm, faces=bm.faces)
    return link_mesh_object("FrontBanner", bm, mat, smooth=False)


def add_box(bm, cx, cy, cz, sx, sy, sz, rot_y=0.0):
    """中心 (cx,cy,cz)、サイズ (sx,sy,sz) の直方体を bmesh に追加する。"""
    mat = Matrix.Translation((cx, cy, cz)) @ Matrix.Rotation(rot_y, 4, "Y") @ Matrix.Diagonal((sx, sy, sz, 1.0))
    bmesh.ops.create_cube(bm, size=1.0, matrix=mat)


def add_prism_gem(bm, cx, cy, cz, rx, ry, rz):
    """宝石風の多面体（八面体ベース）を bmesh に追加する。"""
    res = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
    for v in res["verts"]:
        v.co.x = cx + v.co.x * rx
        v.co.y = cy + v.co.y * ry
        v.co.z = cz + v.co.z * rz


def build_ornament(w, h, cfg, mat):
    """レアリティごとの立体的な縁取り・コーナー装飾を作成する。"""
    style = cfg.get("ornamentStyle", "none")
    rim_t = cfg.get("rimThickness", 0.0)
    rim_d = cfg.get("rimDepth", 0.0)
    if style == "none" and rim_t <= 0.0:
        return None

    # 枠の絵の外周に馴染むよう、CardBody の外周に合わせて配置
    hw = w * 0.445
    hh = h * 0.462
    z_shift = -0.025
    half_t = cfg["thickness"] * 0.5
    y_frame = -(half_t + 0.008 + cfg["recess"])
    y_front = y_frame + rim_d * 0.35

    bm = bmesh.new()

    # 外周の立体リム（4辺のベベル風フレーム。絵の窓・文字に被らない最外周のみ）
    if rim_t > 0.0 and rim_d > 0.0:
        margin = 0.01
        outer_x = hw - margin
        outer_z = hh - margin
        # 左右バー
        bar_h = (outer_z - rim_t) * 2.0
        add_box(bm, -outer_x + rim_t * 0.5, y_front, z_shift, rim_t, rim_d, bar_h)
        add_box(bm, outer_x - rim_t * 0.5, y_front, z_shift, rim_t, rim_d, bar_h)
        # 上下バー
        bar_w = outer_x * 2.0
        add_box(bm, 0.0, y_front, z_shift + outer_z - rim_t * 0.5, bar_w, rim_d, rim_t)
        add_box(bm, 0.0, y_front, z_shift - outer_z + rim_t * 0.5, bar_w, rim_d, rim_t)

    # 四隅の装飾位置
    cx_off = hw - 0.035
    cz_off = hh - 0.035
    corners = [(-cx_off, z_shift + cz_off), (cx_off, z_shift + cz_off), (-cx_off, z_shift - cz_off), (cx_off, z_shift - cz_off)]

    if style == "rivets":
        for cx, cz in corners:
            add_prism_gem(bm, cx, y_frame - 0.010, cz, 0.032, 0.014, 0.032)

    elif style == "corners":
        for cx, cz in corners:
            add_box(bm, cx, y_frame - 0.010, cz, 0.072, 0.020, 0.072, rot_y=math.pi / 4.0)

    elif style == "gems":
        for cx, cz in corners:
            add_box(bm, cx, y_frame - 0.008, cz, 0.084, 0.020, 0.084, rot_y=math.pi / 4.0)
            add_prism_gem(bm, cx, y_frame - 0.018, cz, 0.038, 0.018, 0.038)

    elif style == "royal":
        # レジェンド：豪華な二重コーナー＋左右中間の金鋲
        for cx, cz in corners:
            add_box(bm, cx, y_frame - 0.010, cz, 0.105, 0.024, 0.105, rot_y=math.pi / 4.0)
            add_prism_gem(bm, cx, y_frame - 0.022, cz, 0.044, 0.022, 0.044)
        add_prism_gem(bm, -hw + 0.022, y_frame - 0.016, z_shift, 0.032, 0.018, 0.062)
        add_prism_gem(bm, hw - 0.022, y_frame - 0.016, z_shift, 0.032, 0.018, 0.062)

    elif style == "prism":
        # スペシャル：多面カットのクリスタル装飾
        for cx, cz in corners:
            add_prism_gem(bm, cx, y_frame - 0.018, cz, 0.052, 0.022, 0.052)

    elif style == "claws":
        # 魔物（ルビー）：鋭い爪風の四隅飾り
        for sx in (-1, 1):
            for sz in (-1, 1):
                cx = sx * (hw - 0.030)
                cz = z_shift + sz * (hh - 0.030)
                angle = (math.pi / 4.0) * sx * sz
                add_box(bm, cx, y_frame - 0.012, cz, 0.11, 0.022, 0.042, rot_y=angle)
                add_prism_gem(bm, cx, y_frame - 0.020, cz, 0.038, 0.022, 0.038)

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    uv_layer = bm.loops.layers.uv.verify()
    for face in bm.faces:
        for loop in face.loops:
            co = loop.vert.co
            loop[uv_layer].uv = ((co.x + hw) / w, (co.z + hh) / h)

    bmesh.ops.triangulate(bm, faces=bm.faces)
    return link_mesh_object("FrontOrnament", bm, mat, smooth=False)


def build_single_card(name, dims, cfg, out_path):
    clear_scene()
    w = dims["width"]
    h = dims["height"]
    win = dims["window"]
    banner = dims["nameBanner"]
    hw = w * 0.5
    hh = h * 0.5
    half_t = cfg["thickness"] * 0.5

    # マテリアル作成（three.js 側でテクスチャや PBR パラメータを張りかえる）
    mat_edge = make_material("CardEdgeMat", cfg["edgeColor"], cfg["metallic"], cfg["roughness"])
    mat_frame = make_material("FrontFrameMat", (1.0, 1.0, 1.0), cfg["metallic"] * 0.5, 0.45, alpha_blend=True)
    mat_win = make_material("FrontWindowMat", (1.0, 0.96, 0.86), 0.0, 0.65)
    mat_art = make_material("FrontArtMat", (1.0, 1.0, 1.0), 0.05, 0.35, alpha_blend=True)
    mat_raised = make_material("FrontRaisedMat", (1.0, 1.0, 1.0), cfg["metallic"], max(0.15, cfg["roughness"] - 0.1), alpha_blend=True)
    mat_banner = make_material("FrontBannerMat", (1.0, 1.0, 1.0), 0.1, 0.55, alpha_blend=True)
    mat_label = make_material("FrontLabelMat", (1.0, 1.0, 1.0), 0.0, 0.5, alpha_blend=True)
    mat_ornament = make_material("FrontOrnamentMat", cfg["ornamentColor"], min(1.0, cfg["metallic"] + 0.12), max(0.12, cfg["roughness"] - 0.08))
    mat_back = make_material("BackFaceMat", (1.0, 1.0, 1.0), 0.15, 0.42, alpha_blend=True)
    mat_back_raised = make_material("BackRaisedMat", (1.0, 1.0, 1.0), 0.75, 0.25, alpha_blend=True)

    # 1. 本体（角丸・面取り）
    build_card_body(w, h, cfg, mat_edge)

    # 2. 表の枠（窓くり抜き＋内壁）
    build_front_frame(w, h, win, cfg, mat_frame)

    # 3. 絵の窓の背景 & 絵の面（CardBody の表のすぐ手前。枠はそのさらに recess 分手前に盛り上がる）
    margin = 0.028
    wx0 = -hw + win["left"] * w - margin
    wx1 = -hw + (win["left"] + win["width"]) * w + margin
    wz1 = hh - win["top"] * h + margin
    wz0 = hh - (win["top"] + win["height"]) * h - margin
    y_art = -(half_t + 0.008)
    y_frame = y_art - cfg["recess"]
    build_front_plane("FrontWindow", wx0, wz0, wx1, wz1, y_art + 0.004, mat_win)
    build_front_plane("FrontArt", wx0, wz0, wx1, wz1, y_art, mat_art)

    # 4. 表の浮き彫り飾り（*-raised.png マスク用）
    y_raised = y_frame - cfg["raisedLift"]
    build_front_plane("FrontRaised", -hw, -hh, hw, hh, y_raised, mat_raised)

    # 5. 名前の帯プレート & テキストオーバーレイ面（浮き彫りより手前に配置して斜めでも消えないように）
    build_banner_plate(w, h, banner, cfg, mat_banner)
    y_label = y_raised - 0.008
    build_front_plane("FrontLabel", -hw, -hh, hw, hh, y_label, mat_label)

    # 6. レアリティごとの立体装飾
    build_ornament(w, h, cfg, mat_ornament)

    # 7. 裏面 & 裏面の浮き彫り飾り（CardBody の外周に合わせて綺麗に収める）
    y_back = half_t + 0.003
    build_back_plane("BackFace", w * 0.89, h * 0.925, y_back, mat_back)
    y_back_raised = half_t + cfg["backRaisedLift"]
    build_back_plane("BackRaised", w * 0.89, h * 0.925, y_back_raised, mat_back_raised)

    # GLB 書き出し
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
    )
    size_kb = os.path.getsize(out_path) / 1024.0
    print(f"[build_card] {name}: {out_path} ({size_kb:.1f} KB)")


def main():
    args = parse_args()
    script_dir = Path(__file__).resolve().parent
    repo_root = script_dir.parent.parent
    presets_path = Path(args.presets) if args.presets else script_dir / "card_presets.json"
    out_dir = Path(args.out) if args.out else repo_root / "assets" / "models"

    with open(presets_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    dims = data["dimensions"]
    presets = data["presets"]
    targets = args.only if args.only else list(presets.keys())

    for name in targets:
        if name not in presets:
            print(f"[build_card] Unknown preset: {name}", file=sys.stderr)
            sys.exit(1)
        out_path = str(out_dir / f"card-{name}.glb")
        build_single_card(name, dims, presets[name], out_path)


if __name__ == "__main__":
    main()
