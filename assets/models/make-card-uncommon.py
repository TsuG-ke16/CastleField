"""アンコモンのカードを、本物の立体（板・木枠・名前欄・メダル・金の縁・宝石の台座・宝石）で作り、card-uncommon.glb に書き出す。

使い方（リポジトリのルートで）：
  blender --background --python assets/models/make-card-uncommon.py
  （Blender の「スクリプト」タブで開いて実行してもよい。そのときは書き出しのあと、確認用の場面が残る）

位置と大きさは、枠の絵 assets/cards/frame-uncommon.png（512×768）を測って決めた。絵がデザインの正なので、形を変えるときは絵を測り直す。
単位：枠の絵の幅を 1 とする（1 = 512px）。Blender では X が右・Z が上・手前が -Y。書き出しの「Y up」で glTF の X 右・Y 上・手前 +Z になる。
厚み：裏 +0.0275 〜 木枠の表 -0.0275（0.055。js/ui/config.js の card3D.depth と同じ）。宝石と金具はそこから手前に出る。

マテリアル名（three.js 側は名前で材質を決める）：
  face … 表の絵を貼る所（木枠の上・絵の窓の奥・名前欄・下の欄・メダルの中）。UV は枠の絵の 0〜1（上が 0）
  back … 裏の絵。UV は本体の外形の 0〜1（裏から見て正しい向き）
  wood … 木の側面・段差の壁（濃い茶色）
  gold … 金具（宝石の台座・爪・メダルの輪・窓と欄の縁）
  foil … 宝石の奥の器（光を返す箔。宝石が中から明るく見える）
  gem  … 宝石（面ごとに向きの違うカット）

葉とつるは、枠の絵の緑の所を塊ごとに切り抜いて、木枠の上にふっくら盛り上げた部品（leaves）。
宝石・台座・金具の下の枠の絵は、立体の部品にすっかり隠れるので、絵と立体が二重に見えない。
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
FRAME_PNG = REPO / 'assets/cards/frame-uncommon.png'
OUT = REPO / 'assets/models/card-uncommon.glb'
PREVIEW_FACE = globals().get('PREVIEW_FACE')     # 確認用の表の絵（あれば face に貼る。書き出しには入れない）

PX = 512.0                 # 枠の絵の幅（ピクセル）= 1
IMG_H = 768

# ---- 厚み（手前が -Y）----
BACK_Y = 0.0275            # 裏
SLAB_FRONT = -0.0105       # 板の表（絵の窓の奥）
FRAME_TOP = -0.0275        # 木枠の表
PLATE_TOP = -0.0225        # 名前欄・下の欄の表（木枠より少し沈める）
MEDAL_TOP = -0.0240        # メダルの中の表

# ---- 測った位置（枠の絵のピクセル）----
BODY = (22, 41, 489, 754, 22)            # 本体の外形：左・上・右・下・角の丸み
WINDOW = (76, 118, 435, 485, 7)          # 絵の窓
NAME = (76, 514, 435, 590, 12)           # 名前欄（クリームの帯 80..431 × 518..586 と金の縁）
STAT = (75, 632, 437, 707, 12)           # 下の欄（79..433 × 636..703 と金の縁）
MEDAL = (96, 106, 33.5, 42.5)            # メダル：中心 x・y、クリームの半径、金の輪の外の半径
GEM = (256, 53)                          # 宝石の中心
SETTING_OUT, SETTING_IN = 47.0, 36.0     # 台座（ひし形）の外・内の半径（中心から角まで）
GIRDLE, TABLE = 33.5, 17.5               # 宝石の帯（いちばん太い所）・上の平らな面の半径（緑の部分 225..287 と、その縁の濃い線まで）


def to_xz(px, py):
    """枠の絵のピクセル → Blender の (X, Z)"""
    return px / PX - 0.5, (IMG_H / 2 - py) / PX


def face_uv(x, z):
    """表の絵の UV（枠の絵の 0〜1。glTF に書くと上が 0 になる）"""
    return x + 0.5, z * PX / IMG_H + 0.5


# ---------------------------------------------------------------- 場面
def fresh_scene():
    # コマンド（--background）では場面を切りかえられないので、今の場面に作る（部品・親・書き出しを同じ場面にそろえる）
    if bpy.app.background or not bpy.context.window:
        scene = bpy.context.scene
    else:
        scene = bpy.data.scenes.get('CardUncommon') or bpy.data.scenes.new('CardUncommon')
    # 前に作ったカード（親 card-uncommon とその子）だけを消す。確認用の光・カメラは残す
    old = bpy.data.objects.get('card-uncommon')
    if old:
        for obj in [*old.children, old]:
            bpy.data.objects.remove(obj, do_unlink=True)
    if bpy.context.window:
        bpy.context.window.scene = scene
    return scene


# ---------------------------------------------------------------- マテリアル
def material(name, color, metallic=0.0, roughness=0.5, **extra):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    for node in [n for n in nodes if n.type == 'TEX_IMAGE']:
        nodes.remove(node)
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    for key, value in extra.items():
        bsdf.inputs[key].default_value = value
    return mat


def make_materials():
    mats = {
        'face': material('face', (0.8, 0.7, 0.55), roughness=0.62),
        'back': material('back', (0.30, 0.17, 0.08), roughness=0.55),
        'wood': material('wood', (0.115, 0.047, 0.018), roughness=0.72),
        'gold': material('gold', (0.95, 0.62, 0.22), metallic=1.0, roughness=0.24),
        'gem': material('gem', (0.18, 0.85, 0.10), roughness=0.02, **{'Transmission Weight': 0.85, 'IOR': 1.57}),
        'foil': material('foil', (0.80, 0.95, 0.55), metallic=1.0, roughness=0.18),
    }
    # 確認用：表・裏の絵を貼る（書き出しは画像なしで行う。three.js 側が画面の絵を貼る）
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
    """ほとんど一直線に並んだ点を間引く（Ramer-Douglas-Peucker。閉じた輪を2つに分けて行う）"""
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
    """絵の窓とメダルの穴は重なっているので、1つの穴（2つを合わせた形）にする。細かい格子で塗ってから外周をたどる"""
    x0, y0, x1, y1, r = WINDOW
    mx, my, _, _ = MEDAL
    rm = MEDAL[2] + 2.0
    w, h = int(x1 + 2) * scale, int(y1 + 2) * scale
    yy, xx = (np.mgrid[0:h, 0:w] + 0.5) / scale
    # 角の丸い四角の内側
    cx = np.clip(xx, x0 + r, x1 - r)
    cy = np.clip(yy, y0 + r, y1 - r)
    rect = (xx >= x0) & (xx <= x1) & (yy >= y0) & (yy <= y1) & (np.hypot(xx - cx, yy - cy) <= r)
    mask = rect | (np.hypot(xx - mx, yy - my) <= rm)
    ys, xs = np.nonzero(mask)
    loop = trace(mask, (int(ys.min()), int(xs[ys == ys.min()].min())), spacing=1.0 * scale, smooth=2, eps=0.15 * scale)
    return [tuple(q / scale) for q in loop]


def shift_or(m):
    """3×3 のふくらませ"""
    out = m.copy()
    out[1:] |= m[:-1]; out[:-1] |= m[1:]; out[:, 1:] |= out[:, :-1].copy(); out[:, :-1] |= out[:, 1:].copy()
    return out


def leaf_outlines():
    """葉とつる（緑の所）の塊ごとの外周。細い線（金の線のふち・メダルの輪）は除く"""
    p = frame_pixels()
    r, g, b, a = p[..., 0], p[..., 1], p[..., 2], p[..., 3]
    mask = (a > 0.5) & (g > r * 0.95) & (g > b * 1.4) & (g > 0.27)
    h, w = mask.shape
    yy, xx = np.mgrid[0:h, 0:w]
    mask &= (np.abs(xx - GEM[0]) + np.abs(yy - GEM[1])) > SETTING_OUT + 2      # 宝石と台座の所は除く
    mask &= np.hypot(xx - MEDAL[0], yy - MEDAL[1]) > MEDAL[3] + 2               # メダルの輪も除く
    # 細い線を消す（2回ちぢめて2回ふくらませる）→ 小さな穴をふさぐ
    m = mask
    for _ in range(2):
        m = ~shift_or(~m)
    for _ in range(3):
        m = shift_or(m)
    m &= shift_or(mask)
    m = ~shift_or(~m)
    # 塊に分ける
    label = np.zeros((h, w), np.int32)
    loops, count = [], 0
    for y0, x0 in zip(*np.nonzero(m)):
        if label[y0, x0]:
            continue
        count += 1
        stack, size = [(y0, x0)], 0
        label[y0, x0] = count
        while stack:
            y, x = stack.pop()
            size += 1
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < h and 0 <= nx < w and m[ny, nx] and not label[ny, nx]:
                    label[ny, nx] = count
                    stack.append((ny, nx))
        if size < 60:
            continue
        loop = trace(label == count, (int(y0), int(x0)), spacing=1.5, smooth=3, eps=0.35)
        if len(loop) >= 8:
            loops.append(loop)
    return loops


def rounded_rect(x0, y0, x1, y1, r, steps=6):
    """角の丸い四角（ピクセル）。時計回り"""
    pts = []
    for cx, cy, a0 in ((x1 - r, y0 + r, -90), (x1 - r, y1 - r, 0), (x0 + r, y1 - r, 90), (x0 + r, y0 + r, 180)):
        for i in range(steps + 1):
            a = math.radians(a0 + 90 * i / steps)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
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
    curve.extrude = thickness / 2 - bevel
    curve.bevel_depth = bevel
    curve.bevel_resolution = resolution
    curve.offset = -bevel                              # 面取りで外形が大きくならないように
    for loop in loops:
        spline = curve.splines.new('POLY')
        spline.points.add(len(loop) - 1)
        for point, (px, py) in zip(spline.points, loop):
            x, z = to_xz(px, py)
            point.co = (x, z, 0, 1)
        spline.use_cyclic_u = True
    obj = bpy.data.objects.new(name, curve)
    bpy.context.scene.collection.objects.link(obj)
    obj.rotation_euler = (math.radians(90), 0, 0)     # 曲線の平面（XY）→ 立てる（XZ）。押し出しの +Z が手前（-Y）
    obj.location.y = (front_y + back_y) / 2
    return to_mesh(obj)


def to_mesh(obj):
    """曲線などをメッシュにして、回転・位置を形に焼き込む"""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph))
    mesh.transform(obj.matrix_world)
    name = obj.name
    bpy.data.objects.remove(obj, do_unlink=True)
    new = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(new)
    return new


def join(objs, name):
    """いくつかのメッシュを1つにまとめる"""
    bm = bmesh.new()
    for obj in objs:
        bm.from_mesh(obj.data)
        bpy.data.objects.remove(obj, do_unlink=True)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    out = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(out)
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
    """なめらかに見せつつ、angle 度より折れている所は角を立てる（書き出すと法線が分かれる）"""
    mesh = obj.data
    for poly in mesh.polygons:
        poly.use_smooth = True
    bm = bmesh.new()
    bm.from_mesh(mesh)
    for e in bm.edges:
        e.smooth = not (len(e.link_faces) == 2 and e.calc_face_angle(0) > math.radians(angle))
    bm.to_mesh(mesh)
    bm.free()


# ---------------------------------------------------------------- 回転体のように輪を重ねて作る（台座・メダルの輪・縁）
def loft(name, rings, closed=True, cap_center=None):
    """rings：同じ点数の輪（3D 座標の列）の並び。隣どうしを四角でつなぐ。cap_center があれば最後の輪をそこへ閉じる"""
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
    bpy.context.scene.collection.objects.link(obj)
    return obj


def diamond_ring(cx, cz, r, y):
    """ひし形（上・左・下・右が角）の4点。r は中心から角まで"""
    return [Vector((cx, y, cz + r)), Vector((cx - r, y, cz)), Vector((cx, y, cz - r)), Vector((cx + r, y, cz))]


def profile_ring(points, profile, base_y):
    """profile：(外へのずらし, 高さ) の列。points（XZ の輪）を法線方向にずらして、各段の輪を作る"""
    rings = []
    n = len(points)
    for offset, height in profile:
        ring = []
        for i in range(n):
            p0, p1, p2 = points[i - 1], points[i], points[(i + 1) % n]
            t = (Vector(p2) - Vector(p0)).normalized()
            normal = Vector((t.y, -t.x))               # 外向き（点の列が時計回りのとき）
            q = Vector(p1) + normal * offset
            ring.append(Vector((q.x, base_y - height, q.y)))
        rings.append(ring)
    return rings


def rect_xz(rect, steps=6, spacing=400.0):
    """角の丸い四角（ピクセル）→ XZ の点の列（Blender の単位）。まっすぐな辺も spacing ピクセルごとに点を置く（一部だけ切り取れるように）"""
    corners = rounded_rect(*rect, steps=steps)
    pts = []
    for (ax, ay), (bx, by) in zip(corners, corners[1:] + corners[:1]):
        n = max(1, int(math.hypot(bx - ax, by - ay) / spacing))
        pts.extend((ax + (bx - ax) * i / n, ay + (by - ay) * i / n) for i in range(n))
    return [Vector(to_xz(px, py)) for px, py in pts]


# ---------------------------------------------------------------- 宝石
def build_gem(mats):
    """カットした宝石：上の平らな面（テーブル）、星・凧・上の帯の面（クラウン 16 面）、帯（ガードル）、下の面（パビリオン 12 面）"""
    cx, cz = to_xz(*GEM)
    rg, rt = GIRDLE / PX, TABLE / PX
    girdle_low = FRAME_TOP - 0.0020                    # 帯の下（台座の受けの少し上）
    girdle_high = girdle_low - 0.0026                  # 帯の上
    table_y = girdle_high - 0.0175                     # テーブル（いちばん手前）
    star_y = girdle_high - 0.0105                      # 星の点の高さ
    culet_y = girdle_low + 0.0225                      # 下の先（奥）

    def at(angle_deg, r, y):
        a = math.radians(angle_deg)
        return Vector((cx + r * math.cos(a), y, cz + r * math.sin(a)))

    bm = bmesh.new()
    new_vert = bm.verts.new
    c45 = 0.5 ** 0.5
    corners = [90 + 90 * i for i in range(4)]          # 角：上・左・下・右（反時計回り）
    mids = [a + 45 for a in corners]                    # 角 i と角 i+1 の間の辺の中ほど
    table = [new_vert(at(a, rt, table_y)) for a in corners]                                   # テーブルの角
    stars = [new_vert(at(m, rt * c45 + (rg * c45 - rt * c45) * 0.55, star_y)) for m in mids]   # 星の点
    # 帯：角と辺の中点を交互に 8 点。上の段 girdle_top と下の段 girdle_bottom
    def girdle_ring(y):
        ring = []
        for a, m in zip(corners, mids):
            ring.append(new_vert(at(a, rg, y)))
            ring.append(new_vert(at(m, rg * c45, y)))
        return ring
    girdle_top, girdle_bottom = girdle_ring(girdle_high), girdle_ring(girdle_low)
    new_face = bm.faces.new
    new_face(table)                                               # テーブル
    for i in range(4):
        j = (i + 1) % 4
        new_face((table[i], table[j], stars[i]))                          # 星の面（テーブルの辺の外の三角）
        new_face((table[i], stars[i - 1], girdle_top[2 * i], stars[i]))           # 凧の面（テーブルの角から帯の角へ）
        new_face((stars[i], girdle_top[2 * i], girdle_top[2 * i + 1]))            # 上の帯の面（2枚）
        new_face((stars[i], girdle_top[2 * i + 1], girdle_top[(2 * i + 2) % 8]))
    for i in range(8):
        j = (i + 1) % 8
        new_face((girdle_top[i], girdle_bottom[i], girdle_bottom[j], girdle_top[j]))                # 帯の側面
    # パビリオン（奥の面）：辺の中ほどの下に点 pavilion_mid、いちばん奥の先 culet
    pavilion_mid = [new_vert(at(m, rg * c45 * 0.55, girdle_low + 0.0125)) for m in mids]
    culet = new_vert(Vector((cx, culet_y, cz)))
    for i in range(4):
        new_face((girdle_bottom[2 * i], girdle_bottom[2 * i + 1], pavilion_mid[i]))
        new_face((girdle_bottom[2 * i + 1], girdle_bottom[(2 * i + 2) % 8], pavilion_mid[i]))
        new_face((girdle_bottom[2 * i], pavilion_mid[i], culet, pavilion_mid[i - 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new('gem')
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new('gem', mesh)
    bpy.context.scene.collection.objects.link(obj)
    mesh.materials.append(mats['gem'])
    for poly in mesh.polygons:
        poly.use_smooth = False                        # 面ごとに法線が違う（カットの光り方）
    return obj


# ---------------------------------------------------------------- 台座と爪
def build_setting(mats):
    cx, cz = to_xz(*GEM)
    ro, ri, rg = SETTING_OUT / PX, SETTING_IN / PX, GIRDLE / PX
    base = FRAME_TOP + 0.0015                          # 木枠に少し埋める
    # (中心から角までの半径, 木枠の表からの高さ)。外の壁 → 外の斜面 → 稜線 → 内の斜面 → 受け → 奥の器
    profile = [
        (ro, -0.0015), (ro, 0.0030), (ro - 0.0055, 0.0072), (ro - 0.0105, 0.0084),
        (ri + 0.0020, 0.0062), (ri, 0.0050), (ri - 0.0012, 0.0024), (rg + 0.0012, 0.0016),
        (rg * 0.80, -0.0060), (rg * 0.35, -0.0150),
    ]
    rings = [diamond_ring(cx, cz, r, FRAME_TOP - h) for r, h in profile]
    obj = loft('setting', rings, cap_center=Vector((cx, FRAME_TOP + 0.0200, cz)))
    obj.data.materials.append(mats['gold'])
    obj.data.materials.append(mats['foil'])
    # 宝石の奥の器（受けより内側）は、光を返す箔にする（宝石が中から明るく見えるように）
    for poly in obj.data.polygons:
        c = poly.center
        if math.hypot(c.x - cx, c.z - cz) < rg - 0.0005 and c.y > FRAME_TOP - 0.0016:
            poly.material_index = 1
    smooth_by_angle(obj, 30)
    # 爪：宝石の4つの角を、外から押さえる小さな金具
    prongs = []
    for k, (dx, dz) in enumerate(((0, 1), (-1, 0), (0, -1), (1, 0))):
        d = Vector((dx, 0, dz))
        side = Vector((-dz, 0, dx))
        center = Vector((cx, 0, cz))
        root, tip = center + d * (ri + 0.0010), center + d * (rg - 0.0045)
        w_root, w_tip = 0.0062, 0.0036
        y_root, y_tip = FRAME_TOP - 0.0055, FRAME_TOP - 0.0072
        rings = []
        for t, w, y in ((0.0, w_root, y_root + 0.0040), (0.0, w_root, y_root), (0.55, (w_root + w_tip) / 2, y_tip - 0.0012), (1.0, w_tip, y_tip), (1.0, w_tip * 0.6, y_tip + 0.0030)):
            p = root.lerp(tip, t)
            # 断面：上が丸い山形の5点
            ring = [p + side * (w / 2) + Vector((0, y + 0.0012, 0)), p + side * (w / 2) + Vector((0, y - 0.0004, 0)),
                    p + Vector((0, y - 0.0016, 0)),
                    p - side * (w / 2) + Vector((0, y - 0.0004, 0)), p - side * (w / 2) + Vector((0, y + 0.0012, 0))]
            rings.append(ring)
        prong = loft(f'prong-{k}', rings, closed=True, cap_center=tip + Vector((0, y_tip + 0.0018, 0)))
        prong.data.materials.append(mats['gold'])
        smooth_by_angle(prong, 40)
        prongs.append(prong)
    return [obj, *prongs]


# ---------------------------------------------------------------- 縁取りの金具（窓・欄・メダル）
def gold_rim(name, points, mats, width, height, base_y):
    """points（XZ の輪）に沿った、断面がかまぼこ形の金の縁"""
    half = width / 2
    profile = [(-half, -0.0010), (-half, height * 0.45), (-half * 0.55, height * 0.92), (0, height),
               (half * 0.55, height * 0.92), (half, height * 0.45), (half, -0.0010)]
    rings = profile_ring(points, profile, base_y)
    obj = loft(name, rings, closed=True)
    obj.data.materials.append(mats['gold'])
    smooth_by_angle(obj, 50)
    return obj


# ---------------------------------------------------------------- 組み立て
def build():
    scene = fresh_scene()
    mats = make_materials()
    parts = []

    # 1) 板（本体の外形。裏に裏の絵）
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

    # 2) 木枠（絵の外形どおり。葉や台座のはみ出しも含む）。窓・2つの欄・メダルは穴
    outline = [tuple(p) for p in frame_outline()]
    holes = [window_medal_hole(), rounded_rect(*grow(NAME, -1.5), 6), rounded_rect(*grow(STAT, -1.5), 6)]
    frame = slab_from_loops('frame', [outline, *holes], FRAME_TOP, SLAB_FRONT + 0.0010, 0.0030)
    # 木枠の裏は板に埋もれている（はみ出した葉・台座の裏だけ残す）
    inner = (bx0 + 0.004, bz0 + 0.004, bx1 - 0.004, bz1 - 0.004)
    cull(frame, lambda n, c: n.y > 0.5 and inner[0] < c.x < inner[2] and inner[1] < c.z < inner[3])
    assign(frame, mats, lambda n, c: 'face' if n.y < -0.45 else 'wood')
    smooth_by_angle(frame, 40)
    parts.append(frame)

    # 2b) 葉とつる：木枠の上に、ふっくら盛り上がった部品として載せる（塊ごとの外周を押し出して丸く面取り）
    leaves = []
    for i, loop in enumerate(leaf_outlines()):
        leaves.append(slab_from_loops(f'leaf-{i}', [[tuple(q) for q in loop]], FRAME_TOP - 0.0048, FRAME_TOP + 0.0020, 0.0030, resolution=1))
    leaf = join(leaves, 'leaves')
    cull(leaf, lambda n, c: n.y > 0.2)                 # 葉の裏は木枠に埋もれている
    assign(leaf, mats, lambda n, c: 'face')
    smooth_by_angle(leaf, 60)
    parts.append(leaf)

    # 3) 名前欄・下の欄（木枠より少し沈んだクリームの板）・メダルの中
    for name, rect in (('name-plate', NAME), ('stat-plate', STAT)):
        plate = slab_from_loops(name, [rounded_rect(*grow(rect, -1.0), 6)], PLATE_TOP, SLAB_FRONT, 0.0018)
        assign(plate, mats, lambda n, c: 'face' if n.y < -0.45 else 'wood')
        smooth_by_angle(plate, 40)
        parts.append(plate)
    medal = slab_from_loops('medal-disc', [circle(MEDAL[0], MEDAL[1], MEDAL[2] + 2.5, 64)], MEDAL_TOP, SLAB_FRONT, 0.0016)
    assign(medal, mats, lambda n, c: 'face' if n.y < -0.45 else 'wood')
    smooth_by_angle(medal, 40)
    parts.append(medal)

    # 4) 金の縁：窓・名前欄・下の欄・メダル
    rim_window = gold_rim('rim-window', rect_xz(grow(WINDOW, 1.5), spacing=8.0), mats, 0.0080, 0.0042, FRAME_TOP)
    # 窓の左上の角はメダルの下にもぐる（絵でもメダルが上に重なっている）
    mcx, mcz = to_xz(MEDAL[0], MEDAL[1])
    cull(rim_window, lambda n, c: math.hypot(c.x - mcx, c.z - mcz) < (MEDAL[3] + 1.0) / PX)
    parts.append(rim_window)
    parts.append(gold_rim('rim-name', rect_xz(grow(NAME, -1.0)), mats, 0.0072, 0.0038, FRAME_TOP + 0.0012))
    parts.append(gold_rim('rim-stat', rect_xz(grow(STAT, -1.0)), mats, 0.0072, 0.0038, FRAME_TOP + 0.0012))
    mc = Vector(to_xz(MEDAL[0], MEDAL[1]))
    ring_pts = [mc + Vector((math.cos(a), math.sin(a))) * ((MEDAL[2] + MEDAL[3]) / 2 / PX) for a in [-2 * math.pi * i / 72 for i in range(72)]]
    parts.append(gold_rim('rim-medal', ring_pts, mats, (MEDAL[3] - MEDAL[2]) / PX, 0.0068, FRAME_TOP + 0.0010))

    # 5) 宝石の台座と爪、宝石
    parts.extend(build_setting(mats))
    parts.append(build_gem(mats))

    # まとめる（親の空オブジェクトの下に）
    root = bpy.data.objects.new('card-uncommon', None)
    scene.collection.objects.link(root)
    for p in parts:
        p.parent = root
    return root, parts


def export(root):
    for obj in bpy.context.scene.objects:
        obj.select_set(obj == root or obj.parent == root)
    bpy.ops.export_scene.gltf(
        filepath=str(OUT), export_format='GLB', use_selection=True, export_yup=True,
        export_apply=True, export_image_format='NONE', export_texcoords=True, export_normals=True,
        export_materials='EXPORT', export_cameras=False, export_lights=False,
    )


if __name__ == '__main__' or globals().get('RUN_BUILD'):
    if bpy.app.background and not globals().get('RUN_BUILD'):
        bpy.ops.wm.read_factory_settings(use_empty=True)   # コマンドで動かすときは、空の Blender から作る（名前がずれない）
    root, parts = build()
    if globals().get('DO_EXPORT', True):
        export(root)
    print('parts', len(parts), sum(len(p.data.polygons) for p in parts), 'faces')
