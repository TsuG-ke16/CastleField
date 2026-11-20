"""コモンのカードを、本物の立体（板・木枠・名前欄・下の欄・メダル・コーナー金具・上中央プレート・リベット）で作り、card-common.glb に書き出す。

使い方（リポジトリのルートで）：
  blender --background --python assets/models/make-card-common.py
  （Blender の「スクリプト」タブや Blender MCP で実行してもよい。そのときは書き出しのあと、確認用の場面が残る）

位置と大きさは、枠の絵 assets/cards/frame-common.png（512×768）を測って決めた。絵がデザインの正なので、形を変えるときは絵を測り直す。
単位：枠の絵の幅を 1 とする（1 = 512px）。Blender では X が右・Z が上・手前が -Y。書き出しの「Y up」で glTF の X 右・Y 上・手前 +Z になる。
厚み：裏 +0.0275 〜 木枠の表 -0.0275（0.055。js/ui/config.js の card3D.depth と同じ）。コーナー金具・上中央プレート・リベットはそこから手前に出る。

マテリアル名（three.js 側は名前で材質を決める）：
  face … 表の絵を貼る所（木枠の上・絵の窓の奥・名前欄・下の欄・メダル・木の縁取り）。UV は枠の絵の 0〜1（上が 0）
  back … 裏の絵。UV は本体の外形の 0〜1（裏から見て正しい向き）
  wood … 木の側面・段差の壁（コモンの木目に合わせた温かい茶色）
  iron … 小さな金属装飾（4隅のコーナー金具・上中央プレート。控えめなアンティーク鉄・ブロンズ質感）
  rivet … リベット（6個の丸鋲。金具より少し明るく滑らかにして丸いハイライトを出す）

宝石や過剰な発光は使わず、コモンらしい素朴な木枠の厚み・面取り・段差と、控えめな金属金具の立体感を重視している。
"""
import math
from pathlib import Path

import bpy
import bmesh
import numpy as np
from mathutils import Vector

# ---- 場所 ----
try:
    REPO = Path(__file__).resolve().parents[2]
except NameError:          # MCP などで exec したとき
    REPO = Path(globals().get('REPO', '.'))
FRAME_PNG = REPO / 'assets/cards/frame-common.png'
OUT = REPO / 'assets/models/card-common.glb'
PREVIEW_FACE = globals().get('PREVIEW_FACE')     # 確認用の表の絵（あれば face に貼る。書き出しには入れない）

PX = 512.0                 # 枠の絵の幅（ピクセル）= 1
IMG_H = 768

# ---- 厚み（手前が -Y）----
BACK_Y = 0.0275            # 裏
SLAB_FRONT = -0.0105       # 板の表（絵の窓の奥）
FRAME_TOP = -0.0275        # 木枠の表
PLATE_TOP = -0.0222        # 名前欄・下の欄の表（木枠より少し沈めて段差を出す）
MEDAL_TOP = -0.0242        # メダルの中の表
METAL_TOP = -0.0322        # コーナー金具・上中央プレートの表（木枠より少し手前に出す）
RIVET_HEIGHT = 0.0068      # リベットの丸い盛り上がり（金属プレートの表から手前へ）

# ---- 測った位置（枠の絵のピクセル）----
BODY = (22, 34, 489, 739, 18)             # 本体の外形：左・上・右・下・角の丸み
WINDOW = (76, 118, 435, 485, 7)           # 絵の窓
NAME = (73, 510, 439, 593, 12)            # 名前欄（クリームの帯と木の縁）
STAT = (72, 629, 440, 711, 12)            # 下の欄（クリームの帯と木の縁）
MEDAL = (94.0, 107.0, 34.0, 45.5)         # メダル：中心 x・y、クリームの半径、木の輪の外の半径
TOP_PLATE = (211.0, 45.0, 301.0, 69.0, 11.5)  # 上中央の金属プレート

# 4隅のコーナー金具：角丸の三角形（外角, 横端, 縦端, 角の丸み）
CORNERS = (
    ('corner-tl', ((19.5, 29.5), (86.5, 30.5), (20.5, 90.5)), 8.5),
    ('corner-tr', ((492.5, 29.5), (491.5, 90.5), (425.5, 30.5)), 8.5),
    ('corner-bl', ((15.5, 739.5), (17.5, 675.5), (79.5, 738.5)), 8.5),
    ('corner-br', ((496.5, 739.5), (432.5, 738.5), (494.5, 675.5)), 8.5),
)

# リベット：(中心 x, 中心 y, 半径 px)
RIVETS = (
    (41.5, 48.0, 10.2),    # 左上コーナー
    (470.5, 48.0, 10.2),   # 右上コーナー
    (38.0, 718.0, 10.2),   # 左下コーナー
    (474.0, 718.0, 10.2),  # 右下コーナー
    (227.0, 56.5, 6.8),    # 上中央プレート左
    (285.0, 56.5, 6.8),    # 上中央プレート右
)


def to_xz(px, py):
    """枠の絵のピクセル → Blender の (X, Z)"""
    return px / PX - 0.5, (IMG_H / 2 - py) / PX


def face_uv(x, z):
    """表の絵の UV（枠の絵の 0〜1。glTF に書くと上が 0 になる）"""
    return x + 0.5, z * PX / IMG_H + 0.5


# ---------------------------------------------------------------- 場面
_scene = None


def fresh_scene():
    global _scene
    if bpy.app.background or not bpy.context.window:
        scene = bpy.context.scene
    else:
        scene = bpy.data.scenes.get('CardCommon') or bpy.data.scenes.new('CardCommon')
    old = bpy.data.objects.get('card-common')
    if old:
        for obj in [*old.children, old]:
            bpy.data.objects.remove(obj, do_unlink=True)
    if bpy.context.window:
        bpy.context.window.scene = scene
    _scene = scene
    return scene


# ---------------------------------------------------------------- マテリアル
def material(name, color, metallic=0.0, roughness=0.5, **extra):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    for node in [n for n in nodes if n != bsdf and n.type != 'OUTPUT_MATERIAL']:
        nodes.remove(node)
    for link in list(links):
        if link.to_node == bsdf:
            links.remove(link)
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    if 'Alpha' in bsdf.inputs:
        bsdf.inputs['Alpha'].default_value = 1.0
    for key, value in extra.items():
        bsdf.inputs[key].default_value = value
    return mat


def make_materials():
    mats = {
        'face': material('face', (0.85, 0.68, 0.45), roughness=0.62),
        'back': material('back', (0.30, 0.17, 0.08), roughness=0.55),
        # コモンの木目に合う温かみのある木の側面色（sRGB 約 #734723）
        'wood': material('wood', (0.172, 0.064, 0.017), roughness=0.72),
        # 控えめなアンティーク鉄・ブロンズ（元画像の渋い銅鉄金具の色味に合わせる）
        'iron': material('iron', (0.24, 0.14, 0.11), metallic=0.82, roughness=0.34),
        # リベット：金具より少し明るく滑らかにして、丸い鋲のハイライトを自然に見せる
        'rivet': material('rivet', (0.50, 0.35, 0.28), metallic=0.86, roughness=0.24),
    }
    for key, path in (('face', PREVIEW_FACE), ('back', REPO / 'assets/ui/card-back.png' if PREVIEW_FACE else None)):
        if not path:
            continue
        mat = mats[key]
        nodes = mat.node_tree.nodes
        tex = nodes.new('ShaderNodeTexImage')
        tex.image = bpy.data.images.load(str(path), check_existing=True)
        bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
        mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
        if key == 'face':
            mat.node_tree.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
    return mats


# ---------------------------------------------------------------- 枠の絵を読む・輪郭をたどる
_pixels = None


def frame_pixels():
    """枠の絵の RGBA（0〜1。上が 0 の行）"""
    global _pixels
    if _pixels is None:
        image = bpy.data.images.load(str(FRAME_PNG), check_existing=True)
        w, h = image.size
        _pixels = np.array(image.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1].copy()
    return _pixels


def blur5(a):
    k = np.array([1, 4, 6, 4, 1], dtype=np.float32) / 16
    a = np.apply_along_axis(lambda r: np.convolve(r, k, 'same'), 1, a)
    return np.apply_along_axis(lambda c: np.convolve(c, k, 'same'), 0, a)


def simplify(p, eps):
    """ほとんど一直線に並んだ点を間引く（Ramer-Douglas-Peucker）"""
    def rdp(q):
        if len(q) < 3:
            return q
        a, b = q[0], q[-1]
        ab = b - a
        length = math.hypot(*ab) or 1e-9
        d = np.abs(ab[0] * (q[:, 1] - a[1]) - ab[1] * (q[:, 0] - a[0])) / length
        i = int(np.argmax(d))
        if d[i] > eps:
            return np.vstack([rdp(q[:i + 1])[:-1], rdp(q[i:])])
        return np.array([a, b])
    half = len(p) // 2
    return np.vstack([rdp(p[:half + 1])[:-1], rdp(np.vstack([p[half:], p[:1]]))[:-1]])


def trace(mask, start, spacing=2.0, smooth=6, eps=0.25):
    """mask の塊の外周を start からたどり、なめらかにして spacing ごとの点（ピクセル）にする"""
    h, w = mask.shape
    dirs = [(-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1)]
    pts, cur, back = [start], start, 6
    for _ in range(200000):
        for k8 in range(8):
            d = (back + 1 + k8) % 8
            ny, nx = cur[0] + dirs[d][0], cur[1] + dirs[d][1]
            if 0 <= ny < h and 0 <= nx < w and mask[ny, nx]:
                back, cur = (d + 4) % 8, (ny, nx)
                break
        if cur == start:
            break
        pts.append(cur)
    else:
        raise RuntimeError('輪郭が閉じませんでした（絵の形を確かめてください）')
    p = np.array([(x + 0.5, y + 0.5) for y, x in pts], dtype=np.float64)
    for _ in range(smooth):
        p = (np.roll(p, 1, 0) + 2 * p + np.roll(p, -1, 0)) / 4
    seg = np.hypot(*(np.roll(p, -1, 0) - p).T)
    total = np.concatenate([[0], np.cumsum(seg)])
    closed = np.vstack([p, p[:1]])
    at = np.arange(0, total[-1], spacing)
    return simplify(np.stack([np.interp(at, total, closed[:, 0]), np.interp(at, total, closed[:, 1])], 1), eps)


def frame_outline():
    """枠の絵の不透明な所の外周（ピクセルの点の列）"""
    mask = blur5(frame_pixels()[:, :, 3]) > 0.5
    ys, xs = np.nonzero(mask)
    return trace(mask, (int(ys.min()), int(xs[ys == ys.min()].min())), spacing=1.5, eps=0.3)


def window_medal_hole(scale=4):
    """絵の窓とメダルの穴は重なっているので、1つの穴（2つを合わせた形）にする"""
    x0, y0, x1, y1, r = WINDOW
    mx, my, _, _ = MEDAL
    rm = MEDAL[2] + 2.0
    w, h = int(x1 + 2) * scale, int(y1 + 2) * scale
    yy, xx = (np.mgrid[0:h, 0:w] + 0.5) / scale
    cx = np.clip(xx, x0 + r, x1 - r)
    cy = np.clip(yy, y0 + r, y1 - r)
    rect = (xx >= x0) & (xx <= x1) & (yy >= y0) & (yy <= y1) & (np.hypot(xx - cx, yy - cy) <= r)
    mask = rect | (np.hypot(xx - mx, yy - my) <= rm)
    ys, xs = np.nonzero(mask)
    loop = trace(mask, (int(ys.min()), int(xs[ys == ys.min()].min())), spacing=1.0 * scale, smooth=2, eps=0.15 * scale)
    return [tuple(q / scale) for q in loop]


def rounded_rect(x0, y0, x1, y1, r, steps=6):
    """角の丸い四角（ピクセル）。時計回り"""
    pts = []
    for cx, cy, a0 in ((x1 - r, y0 + r, -90), (x1 - r, y1 - r, 0), (x0 + r, y1 - r, 90), (x0 + r, y0 + r, 180)):
        for i in range(steps + 1):
            a = math.radians(a0 + 90 * i / steps)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def rounded_polygon(verts, radius, steps=6):
    """多角形の各頂点を radius で丸めた2Dの点の列（ピクセル）"""
    pts = []
    n = len(verts)
    for i in range(n):
        p_prev = Vector(verts[i - 1])
        p_cur = Vector(verts[i])
        p_next = Vector(verts[(i + 1) % n])
        v1 = (p_prev - p_cur).normalized()
        v2 = (p_next - p_cur).normalized()
        dot = max(-0.999, min(0.999, v1.dot(v2)))
        half_angle = math.acos(dot) / 2
        tan_half = math.tan(half_angle)
        # 鋭角では丸めが辺をはみ出さないように制限
        max_dist = min((p_prev - p_cur).length, (p_next - p_cur).length) * 0.38
        dist = min(radius / tan_half, max_dist)
        eff_r = dist * tan_half
        bisector = (v1 + v2).normalized()
        center = p_cur + bisector * (eff_r / math.sin(half_angle))
        t1 = p_cur + v1 * dist
        t2 = p_cur + v2 * dist
        a1 = math.atan2(t1.y - center.y, t1.x - center.x)
        a2 = math.atan2(t2.y - center.y, t2.x - center.x)
        da = (a2 - a1 + math.pi) % (2 * math.pi) - math.pi
        for s in range(steps + 1):
            a = a1 + da * s / steps
            pts.append((center.x + eff_r * math.cos(a), center.y + eff_r * math.sin(a)))
    return pts


def circle(cx, cy, r, steps=48):
    return [(cx + r * math.cos(2 * math.pi * i / steps), cy + r * math.sin(2 * math.pi * i / steps)) for i in range(steps)]


def grow(rect, d):
    x0, y0, x1, y1, r = rect
    return (x0 - d, y0 - d, x1 + d, y1 + d, max(0.5, r + d))


# ---------------------------------------------------------------- 押し出した板（穴あき）
def slab_from_loops(name, loops, front_y, back_y, bevel, resolution=2):
    """2D の輪（ピクセルの点の列。最初が外周、残りは穴）を、front_y〜back_y の厚みに押し出す。縁は丸く面取り"""
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '2D'
    curve.fill_mode = 'BOTH'
    thickness = abs(back_y - front_y)
    curve.extrude = max(0.0, thickness / 2 - bevel)
    curve.bevel_depth = bevel
    curve.bevel_resolution = resolution
    curve.offset = -bevel
    for loop in loops:
        spline = curve.splines.new('POLY')
        spline.points.add(len(loop) - 1)
        for point, (px, py) in zip(spline.points, loop):
            x, z = to_xz(px, py)
            point.co = (x, z, 0, 1)
        spline.use_cyclic_u = True
    obj = bpy.data.objects.new(name, curve)
    (_scene or bpy.context.scene).collection.objects.link(obj)
    obj.rotation_euler = (math.radians(90), 0, 0)
    obj.location.y = (front_y + back_y) / 2
    return to_mesh(obj)


def to_mesh(obj):
    scene = _scene or bpy.context.scene
    scene.view_layers[0].update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph))
    mesh.transform(obj.matrix_world)
    name = obj.name
    bpy.data.objects.remove(obj, do_unlink=True)
    new = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(new)
    return new


def join(objs, name):
    bm = bmesh.new()
    for obj in objs:
        bm.from_mesh(obj.data)
        bpy.data.objects.remove(obj, do_unlink=True)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    out = bpy.data.objects.new(name, mesh)
    (_scene or bpy.context.scene).collection.objects.link(out)
    return out


def cull(obj, hidden):
    """hidden(normal, center) が真の面（ほかの部品に埋もれて見えない面）を消して軽くする"""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if hidden(f.normal, f.calc_center_median())], context='FACES')
    bm.to_mesh(obj.data)
    bm.free()


def assign(obj, mats, rule, uv_rule=None):
    """面ごとにマテリアルと UV を決める。rule(normal, center) → マテリアル名"""
    mesh = obj.data
    names = sorted({m for m in mats})
    mesh.materials.clear()
    for n in names:
        mesh.materials.append(mats[n])
    bm = bmesh.new()
    bm.from_mesh(mesh)
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        kind = rule(f.normal, f.calc_center_median())
        f.material_index = names.index(kind)
        for loop in f.loops:
            co = loop.vert.co
            loop[uv].uv = (uv_rule or (lambda k, c: face_uv(c.x, c.z)))(kind, co)
    bm.to_mesh(mesh)
    bm.free()


def smooth_by_angle(obj, angle=35):
    mesh = obj.data
    for poly in mesh.polygons:
        poly.use_smooth = True
    bm = bmesh.new()
    bm.from_mesh(mesh)
    for e in bm.edges:
        e.smooth = not (len(e.link_faces) == 2 and e.calc_face_angle(0) > math.radians(angle))
    bm.to_mesh(mesh)
    bm.free()


# ---------------------------------------------------------------- 輪を重ねて作る（木の縁取り・リベット）
def loft(name, rings, closed=True, cap_center=None):
    bm = bmesh.new()
    vrings = [[bm.verts.new(co) for co in ring] for ring in rings]
    n = len(rings[0])
    for a, b in zip(vrings, vrings[1:]):
        for i in range(n if closed else n - 1):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if cap_center is not None:
        c = bm.verts.new(cap_center)
        last = vrings[-1]
        for i in range(n):
            bm.faces.new((last[i], last[(i + 1) % n], c))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    (_scene or bpy.context.scene).collection.objects.link(obj)
    return obj


def profile_ring(points, profile, base_y):
    rings = []
    n = len(points)
    for offset, height in profile:
        ring = []
        for i in range(n):
            p0, p1, p2 = points[i - 1], points[i], points[(i + 1) % n]
            t = (Vector(p2) - Vector(p0)).normalized()
            normal = Vector((t.y, -t.x))
            q = Vector(p1) + normal * offset
            ring.append(Vector((q.x, base_y - height, q.y)))
        rings.append(ring)
    return rings


def rect_xz(rect, steps=6, spacing=400.0):
    corners = rounded_rect(*rect, steps=steps)
    pts = []
    for (ax, ay), (bx, by) in zip(corners, corners[1:] + corners[:1]):
        n = max(1, int(math.hypot(bx - ax, by - ay) / spacing))
        pts.extend((ax + (bx - ax) * i / n, ay + (by - ay) * i / n) for i in range(n))
    return [Vector(to_xz(px, py)) for px, py in pts]


def wood_rim(name, points, mats, width, height, base_y):
    """points（XZ の輪）に沿った、断面が丸い木製の縁取り。表側は face（元画像の木縁）、側面は wood"""
    half = width / 2
    profile = [
        (-half, -0.0012), (-half, height * 0.45), (-half * 0.55, height * 0.92), (0, height),
        (half * 0.55, height * 0.92), (half, height * 0.45), (half, -0.0012),
    ]
    rings = profile_ring(points, profile, base_y)
    obj = loft(name, rings, closed=True)
    assign(obj, mats, lambda n, c: 'face' if n.y < -0.35 else 'wood')
    smooth_by_angle(obj, 50)
    return obj


def build_rivet(name, cx_px, cy_px, r_px, base_y, height, mats, segs=24, rings_count=6):
    """金属プレートの上に打たれたドーム状の丸リベット（付け根をわずかに立ち上げて陰影をくっきり出す）"""
    cx, cz = to_xz(cx_px, cy_px)
    r = r_px / PX
    rings = []
    # 付け根をわずかにプレートに埋め、短い垂直の立ち上がりからドームへつなぐ
    rings.append([Vector((cx + r * math.cos(2 * math.pi * i / segs), base_y + 0.0012, cz + r * math.sin(2 * math.pi * i / segs))) for i in range(segs)])
    rings.append([Vector((cx + r * math.cos(2 * math.pi * i / segs), base_y - height * 0.18, cz + r * math.sin(2 * math.pi * i / segs))) for i in range(segs)])
    for k in range(1, rings_count):
        phi = (math.pi / 2) * (k / rings_count)
        rk = r * math.cos(phi)
        yk = base_y - height * (0.18 + 0.82 * math.sin(phi))
        rings.append([Vector((cx + rk * math.cos(2 * math.pi * i / segs), yk, cz + rk * math.sin(2 * math.pi * i / segs))) for i in range(segs)])
    obj = loft(name, rings, closed=True, cap_center=Vector((cx, base_y - height, cz)))
    assign(obj, mats, lambda n, c: 'rivet')
    smooth_by_angle(obj, 55)
    return obj


# ---------------------------------------------------------------- 組み立て
def build():
    scene = fresh_scene()
    mats = make_materials()
    parts = []

    # 1) 板（本体の外形。表は絵の窓の奥、裏に裏の絵、側面は木）
    x0, y0, x1, y1, r = BODY
    slab = slab_from_loops('slab', [rounded_rect(x0, y0, x1, y1, r, 8)], SLAB_FRONT - 0.0010, BACK_Y, 0.0040)
    bx0, bz1 = to_xz(x0, y0)
    bx1, bz0 = to_xz(x1, y1)

    def slab_uv(kind, c):
        if kind == 'back':
            return 1 - (c.x - bx0) / (bx1 - bx0), (c.z - bz0) / (bz1 - bz0)
        return face_uv(c.x, c.z)
    assign(slab, mats, lambda n, c: 'face' if n.y < -0.7 else 'back' if n.y > 0.7 else 'wood', slab_uv)
    smooth_by_angle(slab, 40)
    parts.append(slab)

    # 2) 木枠（絵の外形どおり。窓・2つの欄・メダルは穴にして段差を作る）
    outline = [tuple(p) for p in frame_outline()]
    holes = [window_medal_hole(), rounded_rect(*grow(NAME, -2.5), 6), rounded_rect(*grow(STAT, -2.5), 6)]
    frame = slab_from_loops('frame', [outline, *holes], FRAME_TOP, SLAB_FRONT + 0.0010, 0.0034)
    inner = (bx0 + 0.004, bz0 + 0.004, bx1 - 0.004, bz1 - 0.004)
    cull(frame, lambda n, c: n.y > 0.5 and inner[0] < c.x < inner[2] and inner[1] < c.z < inner[3])
    assign(frame, mats, lambda n, c: 'face' if n.y < -0.45 else 'wood')
    smooth_by_angle(frame, 40)
    parts.append(frame)

    # 3) 名前欄・下の欄（木枠より少し沈んだクリームの板）・メダルの中
    for name, rect in (('name-plate', NAME), ('stat-plate', STAT)):
        plate = slab_from_loops(name, [rounded_rect(*grow(rect, -1.5), 6)], PLATE_TOP, SLAB_FRONT, 0.0018)
        cull(plate, lambda n, c: n.y > 0.5)
        assign(plate, mats, lambda n, c: 'face' if n.y < -0.45 else 'wood')
        smooth_by_angle(plate, 40)
        parts.append(plate)
    medal = slab_from_loops('medal-disc', [circle(MEDAL[0], MEDAL[1], MEDAL[2] + 2.5, 64)], MEDAL_TOP, SLAB_FRONT, 0.0016)
    cull(medal, lambda n, c: n.y > 0.5)
    assign(medal, mats, lambda n, c: 'face' if n.y < -0.45 else 'wood')
    smooth_by_angle(medal, 40)
    parts.append(medal)

    # 4) 木製の立体縁取り（窓・名前欄・下の欄・メダル）：元画像の明るい木縁をそのまま立体化
    rim_window = wood_rim('rim-window', rect_xz(grow(WINDOW, 1.5), spacing=8.0), mats, 0.0090, 0.0034, FRAME_TOP + 0.0004)
    mcx, mcz = to_xz(MEDAL[0], MEDAL[1])
    cull(rim_window, lambda n, c: math.hypot(c.x - mcx, c.z - mcz) < (MEDAL[3] + 1.0) / PX)
    parts.append(rim_window)
    parts.append(wood_rim('rim-name', rect_xz(grow(NAME, -2.5)), mats, 0.0085, 0.0032, FRAME_TOP + 0.0012))
    parts.append(wood_rim('rim-stat', rect_xz(grow(STAT, -2.5)), mats, 0.0085, 0.0032, FRAME_TOP + 0.0012))
    mc = Vector(to_xz(MEDAL[0], MEDAL[1]))
    ring_pts = [mc + Vector((math.cos(a), math.sin(a))) * ((MEDAL[2] + MEDAL[3]) / 2 / PX) for a in [-2 * math.pi * i / 72 for i in range(72)]]
    parts.append(wood_rim('rim-medal', ring_pts, mats, (MEDAL[3] - MEDAL[2]) / PX, 0.0062, FRAME_TOP + 0.0010))

    # 5) 小さな金属装飾：4隅のコーナー金具・上中央プレート（iron）と、リベット6個（rivet）
    plate_parts = []
    for name, verts, cr in CORNERS:
        loop = rounded_polygon(verts, cr, steps=6)
        plate = slab_from_loops(name, [loop], METAL_TOP, FRAME_TOP + 0.0022, 0.0020, resolution=2)
        cull(plate, lambda n, c: n.y > 0.5)
        plate_parts.append(plate)

    top_plate = slab_from_loops('top-plate', [rounded_rect(*TOP_PLATE, steps=8)], METAL_TOP, FRAME_TOP + 0.0022, 0.0020, resolution=2)
    cull(top_plate, lambda n, c: n.y > 0.5)
    plate_parts.append(top_plate)

    plates_joined = join(plate_parts, 'metal-plates')
    assign(plates_joined, mats, lambda n, c: 'iron')
    smooth_by_angle(plates_joined, 45)
    parts.append(plates_joined)

    rivet_parts = [build_rivet(f'rivet-{i}', rx, ry, rr, METAL_TOP, RIVET_HEIGHT, mats) for i, (rx, ry, rr) in enumerate(RIVETS)]
    rivets_joined = join(rivet_parts, 'metal-rivets')
    assign(rivets_joined, mats, lambda n, c: 'rivet')
    smooth_by_angle(rivets_joined, 55)
    parts.append(rivets_joined)

    # まとめる（親の空オブジェクトの下に）
    root = bpy.data.objects.new('card-common', None)
    scene.collection.objects.link(root)
    for p in parts:
        p.parent = root
    return root, parts


def export(root):
    scene = _scene or bpy.context.scene
    for obj in scene.objects:
        obj.select_set(obj == root or obj.parent == root)
    with bpy.context.temp_override(scene=scene, view_layer=scene.view_layers[0]):
        bpy.ops.export_scene.gltf(
            filepath=str(OUT), export_format='GLB', use_selection=True, use_active_scene=True, export_yup=True,
            export_apply=True, export_image_format='NONE', export_texcoords=True, export_normals=True,
            export_materials='EXPORT', export_cameras=False, export_lights=False,
        )


if __name__ == '__main__' or globals().get('RUN_BUILD'):
    if bpy.app.background and not globals().get('RUN_BUILD'):
        bpy.ops.wm.read_factory_settings(use_empty=True)
    root, parts = build()
    if globals().get('DO_EXPORT', True):
        export(root)
    print('parts', len(parts), sum(len(p.data.polygons) for p in parts), 'faces')
