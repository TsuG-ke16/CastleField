"""エピックのカードを、本物の立体（板・紫の枠・名前欄・数値欄・楕円メダル・金の縁・巻き付き金装飾・王冠の翼・発光ルーン・下端V字・宝石の台座と爪・縦長ひし形カット宝石）で作り、card-epic.glb に書き出す。

使い方（リポジトリのルートで）：
  blender --background --python assets/models/make-card-epic.py
  （Blender の「スクリプト」タブや Blender MCP で実行してもよい。そのときは書き出しのあと、確認用の場面が残る）

位置と大きさは、枠の絵 assets/cards/frame-epic.png（512×768）を実測して決めた。絵がデザインの正なので、形を変えるときは絵を測り直す。
単位：枠の絵の幅を 1 とする（1 = 512px）。Blender では X が右・Z が上・手前が -Y。書き出しの「Y up」で glTF の X 右・Y 上・手前 +Z になる。
厚み：裏 +0.0275 〜 紫枠の表 -0.0275（0.055。js/ui/config.js の card3D.depth と同じ）。装飾・金具・宝石はそこから手前に出る。

マテリアル名（three.js 側は名前で材質を決める）：
  face        … 表の絵を貼る所（紫枠の上・絵の窓の奥・名前欄・下の欄・メダルの中）。UV は枠の絵の 0〜1（上が 0）
  back        … 裏の絵。UV は本体の外形の 0〜1（裏から見て正しい向き）
  purple      … カード本体と紫枠の側面・段差の壁（深いロイヤルパープルの金属エナメル調）
  gold        … 完全立体金具（宝石の台座・爪・メダルの二重輪・窓と欄の縁・下端V字）
  gold_relief … 左右の巻き付き金装飾・上部王冠の金翼（表の絵のUV＋金属反射）
  glow        … サイドの発光ルーン（渦巻き・星）と上部の紫クリスタル羽（表の絵のUV＋自発光＋クリアコート）
  foil        … 宝石の奥の器（光を返すライラック銀箔。宝石が中から明るく見える）
  gem         … 縦長ひし形のアメジスト宝石（面ごとに向きの違う多面体カット）
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
FRAME_PNG = REPO / 'assets/cards/frame-epic.png'
OUT = REPO / 'assets/models/card-epic.glb'
PREVIEW_FACE = globals().get('PREVIEW_FACE')     # 確認用の表の絵（あれば face/gold_relief/glow に貼る。書き出しには入れない）

PX = 512.0                 # 枠の絵の幅（ピクセル）= 1
IMG_H = 768

# ---- 厚み（手前が -Y）----
BACK_Y = 0.0275            # 裏
SLAB_FRONT = -0.0105       # 板の表（絵の窓の奥）
FRAME_TOP = -0.0275        # 紫枠の表
PLATE_TOP = -0.0220        # 名前欄・下の欄の表（枠より少し沈めて彫り込み感を出す）
MEDAL_TOP = -0.0235        # メダルの中の表

# ---- 実測した位置（frame-epic.png のピクセル）----
BODY = (26, 43, 487, 741, 18)              # 本体の外形：左・上・右・下・角の丸み
WINDOW = (76, 118, 435, 485, 7)            # 絵の窓
NAME = (75, 514, 436, 591, 12)             # 名前欄（クリーム 80..431 × 519..586 と金の縁）
STAT = (74, 631, 437, 708, 12)             # 下の欄（クリーム 79..432 × 636..703 と金の縁）
MEDAL = (88.5, 108.5, 33.5, 36.5, 43.0, 46.5)  # 楕円メダル：cx, cy, 内rx, 内ry, 外rx, 外ry
GEM = (256.5, 65.5)                        # 宝石の中心
SETTING_OUT = (46.5, 59.5)                 # 縦長ひし形台座の外半径 (rx, ry)
SETTING_IN = (30.5, 41.0)                  # 縦長ひし形台座の内半径 (rx, ry)
GIRDLE = (28.0, 38.0)                      # 宝石の帯（いちばん太い所）の半径 (rx, ry)
TABLE = (14.2, 19.5)                       # 宝石の上の平らな面（テーブル）の半径 (rx, ry)


def to_xz(px, py):
    """枠の絵のピクセル → Blender の (X, Z)"""
    return px / PX - 0.5, (IMG_H / 2 - py) / PX


def face_uv(x, z):
    """表の絵の UV（枠の絵の 0〜1。glTF に書くと上が 0 になる）"""
    return x + 0.5, z * PX / IMG_H + 0.5


# ---------------------------------------------------------------- 場面
def fresh_scene():
    if bpy.app.background or not bpy.context.window:
        scene = bpy.context.scene
    else:
        scene = bpy.data.scenes.get('CardEpic') or bpy.data.scenes.new('CardEpic')
    old = bpy.data.objects.get('card-epic')
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
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = value
    return mat


def make_materials():
    mats = {
        'face': material('face', (0.36, 0.08, 0.48), roughness=0.55),
        'back': material('back', (0.18, 0.07, 0.25), roughness=0.55),
        'purple': material('purple', (0.14, 0.03, 0.22), metallic=0.45, roughness=0.35),
        'gold': material('gold', (0.96, 0.68, 0.22), metallic=1.0, roughness=0.20),
        'gold_relief': material('gold_relief', (0.96, 0.68, 0.22), metallic=0.65, roughness=0.24),
        'glow': material('glow', (0.85, 0.28, 1.00), roughness=0.15, **{
            'Emission Color': (0.85, 0.28, 1.00, 1.0),
            'Emission Strength': 1.2,
        }),
        'foil': material('foil', (0.90, 0.62, 1.00), metallic=1.0, roughness=0.12),
        'gem': material('gem', (0.78, 0.16, 0.98), roughness=0.02, **{
            'Transmission Weight': 0.90,
            'IOR': 1.58,
        }),
    }
    # 確認用：表・裏の絵を貼る（書き出しは画像なしで行う。three.js 側が画面の絵を貼る）
    for key, path in (
        ('face', PREVIEW_FACE),
        ('gold_relief', PREVIEW_FACE),
        ('glow', PREVIEW_FACE),
        ('back', REPO / 'assets/ui/card-back.png' if PREVIEW_FACE else None),
    ):
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
        if key == 'glow' and 'Emission Color' in bsdf.inputs:
            mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Emission Color'])
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
    return trace(mask, (int(ys.min()), int(xs[ys == ys.min()].min())), spacing=1.5, eps=0.28)


def window_medal_hole(scale=4):
    """絵の窓と楕円メダルの穴は重なっているので、1つの穴（2つを合わせた形）にする"""
    x0, y0, x1, y1, r = WINDOW
    mcx, mcy, mrx, mry, _, _ = MEDAL
    w, h = int(x1 + 2) * scale, int(y1 + 2) * scale
    yy, xx = (np.mgrid[0:h, 0:w] + 0.5) / scale
    cx = np.clip(xx, x0 + r, x1 - r)
    cy = np.clip(yy, y0 + r, y1 - r)
    rect = (xx >= x0) & (xx <= x1) & (yy >= y0) & (yy <= y1) & (np.hypot(xx - cx, yy - cy) <= r)
    medal_in = ((xx - mcx) / (mrx + 2.0)) ** 2 + ((yy - mcy) / (mry + 2.0)) ** 2 <= 1.0
    mask = rect | medal_in
    ys, xs = np.nonzero(mask)
    loop = trace(mask, (int(ys.min()), int(xs[ys == ys.min()].min())), spacing=1.0 * scale, smooth=2, eps=0.15 * scale)
    return [tuple(q / scale) for q in loop]


def shift_or(m):
    """3×3 のふくらませ"""
    out = m.copy()
    out[1:] |= m[:-1]; out[:-1] |= m[1:]; out[:, 1:] |= out[:, :-1].copy(); out[:, :-1] |= out[:, 1:].copy()
    return out


def extract_loops(mask, min_size=55, spacing=1.5, smooth=3, eps=0.30):
    """2値マスクの連結成分ごとの外周を返す"""
    h, w = mask.shape
    label = np.zeros((h, w), np.int32)
    loops, count = [], 0
    for y0, x0 in zip(*np.nonzero(mask)):
        if label[y0, x0]:
            continue
        count += 1
        stack, size = [(y0, x0)], 0
        label[y0, x0] = count
        while stack:
            y, x = stack.pop()
            size += 1
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not label[ny, nx]:
                    label[ny, nx] = count
                    stack.append((ny, nx))
        if size < min_size:
            continue
        loop = trace(label == count, (int(y0), int(x0)), spacing=spacing, smooth=smooth, eps=eps)
        if len(loop) >= 8:
            loops.append((loop, size, y0))
    return loops


def ornament_masks():
    """専用部品（宝石台座・メダル輪・窓/欄の縁・下端V字）を除いた、金装飾と発光ルーンのマスク"""
    p = frame_pixels()
    r, g, b, a = p[..., 0], p[..., 1], p[..., 2], p[..., 3]
    h, w = a.shape
    yy, xx = np.mgrid[0:h, 0:w]

    # 専用ソリッド部品で覆う領域は除く
    in_gem = (np.abs(xx - GEM[0]) / (SETTING_OUT[0] + 1.5) + np.abs(yy - GEM[1]) / (SETTING_OUT[1] + 1.5)) <= 1.0
    in_medal = ((xx - MEDAL[0]) / (MEDAL[4] + 1.5)) ** 2 + ((yy - MEDAL[1]) / (MEDAL[5] + 1.5)) ** 2 <= 1.0
    in_win = (xx >= WINDOW[0] - 8) & (xx <= WINDOW[2] + 8) & (yy >= WINDOW[1] - 8) & (yy <= WINDOW[3] + 8)
    in_name = (xx >= NAME[0] - 6) & (xx <= NAME[2] + 6) & (yy >= NAME[1] - 6) & (yy <= NAME[3] + 6)
    in_stat = (xx >= STAT[0] - 6) & (xx <= STAT[2] + 6) & (yy >= STAT[1] - 6) & (yy <= STAT[3] + 6)
    in_bottom_v = (xx >= 232) & (xx <= 281) & (yy >= 726)
    excluded = in_gem | in_medal | in_win | in_name | in_stat | in_bottom_v

    # 1) 金装飾（上部王冠の翼 + 左右の巻き付き金帯・ブレード）
    gold_raw = (a > 0.5) & (r > 0.38) & (g > 0.16) & (r > b * 1.60) & (~excluded)
    gm = gold_raw.copy()
    gm = ~shift_or(~gm)
    gm = shift_or(gm)
    gm = shift_or(gm) & shift_or(gold_raw)
    gm = ~shift_or(~gm)

    # 2) 発光ルーン & 上部紫クリスタル羽（下端の細いハイライト帯 y>=726 は除外）
    glow_raw = (a > 0.5) & (b > 0.72) & (r > 0.52) & (r < b * 1.25) & (~excluded) & (~gm) & (yy < 726)
    lm = glow_raw.copy()
    lm = shift_or(lm)
    lm = ~shift_or(~lm)
    return gm, lm


def rounded_rect(x0, y0, x1, y1, r, steps=6):
    """角の丸い四角（ピクセル）。時計回り"""
    pts = []
    for cx, cy, a0 in ((x1 - r, y0 + r, -90), (x1 - r, y1 - r, 0), (x0 + r, y1 - r, 90), (x0 + r, y0 + r, 180)):
        for i in range(steps + 1):
            a = math.radians(a0 + 90 * i / steps)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def ellipse(cx, cy, rx, ry, steps=64):
    return [(cx + rx * math.cos(2 * math.pi * i / steps), cy + ry * math.sin(2 * math.pi * i / steps)) for i in range(steps)]


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
    bevel = min(bevel, thickness * 0.48)
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
    bpy.context.scene.collection.objects.link(obj)
    obj.rotation_euler = (math.radians(90), 0, 0)
    obj.location.y = (front_y + back_y) / 2
    return to_mesh(obj)


def to_mesh(obj):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph))
    mesh.transform(obj.matrix_world)
    name = obj.name
    bpy.data.objects.remove(obj, do_unlink=True)
    new = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(new)
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
    bpy.context.scene.collection.objects.link(out)
    return out


def cull(obj, hidden):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if hidden(f.normal, f.calc_center_median())], context='FACES')
    bm.to_mesh(obj.data)
    bm.free()


def assign(obj, mats, rule, uv_rule=None):
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


# ---------------------------------------------------------------- ロフト造形（台座・リム・爪・V字）
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
    bpy.context.scene.collection.objects.link(obj)
    return obj


def diamond_ring_xy(cx, cz, rx, ry, y):
    """縦長ひし形（上・左・下・右が角）の4点"""
    return [
        Vector((cx, y, cz + ry)),
        Vector((cx - rx, y, cz)),
        Vector((cx, y, cz - ry)),
        Vector((cx + rx, y, cz)),
    ]


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


# ---------------------------------------------------------------- 縦長ひし形アメジスト宝石
def build_gem(mats):
    """縦長ひし形ロゼンジカットの宝石：テーブル・星(4)・凧(4)・上帯(8)・ガードル(8)・パビリオン(12)"""
    cx, cz = to_xz(*GEM)
    rgx, rgy = GIRDLE[0] / PX, GIRDLE[1] / PX
    rtx, rty = TABLE[0] / PX, TABLE[1] / PX

    girdle_low = FRAME_TOP - 0.0025
    girdle_high = girdle_low - 0.0030
    table_y = girdle_high - 0.0205           # しっかり存在感のあるクラウン高さ
    star_y = girdle_high - 0.0120
    culet_y = girdle_low + 0.0250

    def at(angle_deg, rx, ry, y):
        a = math.radians(angle_deg)
        return Vector((cx + rx * math.cos(a), y, cz + ry * math.sin(a)))

    bm = bmesh.new()
    new_vert = bm.verts.new
    c45 = 0.5 ** 0.5
    corners = [90 + 90 * i for i in range(4)]    # 上・左・下・右
    mids = [a + 45 for a in corners]

    table = [new_vert(at(a, rtx, rty, table_y)) for a in corners]
    stars = [
        new_vert(at(
            m,
            rtx * c45 + (rgx * c45 - rtx * c45) * 0.54,
            rty * c45 + (rgy * c45 - rty * c45) * 0.54,
            star_y,
        ))
        for m in mids
    ]

    def girdle_ring(y):
        ring = []
        for a, m in zip(corners, mids):
            ring.append(new_vert(at(a, rgx, rgy, y)))
            ring.append(new_vert(at(m, rgx * c45, rgy * c45, y)))
        return ring

    girdle_top = girdle_ring(girdle_high)
    girdle_bottom = girdle_ring(girdle_low)

    new_face = bm.faces.new
    new_face(table)
    for i in range(4):
        j = (i + 1) % 4
        new_face((table[i], table[j], stars[i]))
        new_face((table[i], stars[i - 1], girdle_top[2 * i], stars[i]))
        new_face((stars[i], girdle_top[2 * i], girdle_top[2 * i + 1]))
        new_face((stars[i], girdle_top[2 * i + 1], girdle_top[(2 * i + 2) % 8]))
    for i in range(8):
        j = (i + 1) % 8
        new_face((girdle_top[i], girdle_bottom[i], girdle_bottom[j], girdle_top[j]))

    pavilion_mid = [new_vert(at(m, rgx * c45 * 0.55, rgy * c45 * 0.55, girdle_low + 0.0140)) for m in mids]
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
        poly.use_smooth = False              # カット面ごとに法線を分ける
    return obj


# ---------------------------------------------------------------- 縦長ひし形台座と4本の爪
def build_setting(mats):
    cx, cz = to_xz(*GEM)
    rox, roy = SETTING_OUT[0] / PX, SETTING_OUT[1] / PX
    rix, riy = SETTING_IN[0] / PX, SETTING_IN[1] / PX
    rgx, rgy = GIRDLE[0] / PX, GIRDLE[1] / PX

    # (scale_x, scale_y, height) で外周から内側の箔器まで滑らかかつ稜線のある多段ベゼルを作る
    def lerp_r(t):
        return rix + (rox - rix) * t, riy + (roy - riy) * t

    profile = [
        (*lerp_r(1.00), -0.0020),
        (*lerp_r(1.00),  0.0038),
        (*lerp_r(0.76),  0.0092),
        (*lerp_r(0.52),  0.0112),   # 稜線（もっとも高い光の筋）
        (*lerp_r(0.24),  0.0085),
        (*lerp_r(0.05),  0.0062),
        (rix - 0.0010, riy - 0.0012, 0.0030),
        (rgx + 0.0010, rgy + 0.0012, 0.0018),
        (rgx * 0.78, rgy * 0.78, -0.0065),
        (rgx * 0.34, rgy * 0.34, -0.0165),
    ]
    rings = [diamond_ring_xy(cx, cz, rx, ry, FRAME_TOP - h) for rx, ry, h in profile]
    obj = loft('setting', rings, cap_center=Vector((cx, FRAME_TOP + 0.0220, cz)))
    obj.data.materials.append(mats['gold'])
    obj.data.materials.append(mats['foil'])
    for poly in obj.data.polygons:
        c = poly.center
        # 縦長ひし形の内側（宝石の奥の器）は光を返す箔
        d_norm = abs(c.x - cx) / max(rgx, 1e-6) + abs(c.z - cz) / max(rgy, 1e-6)
        if d_norm < 1.02 and c.y > FRAME_TOP - 0.0018:
            poly.material_index = 1
    smooth_by_angle(obj, 28)

    # 4本の爪（上・左・下・右の角を押さえる立体金具）
    prongs = []
    for k, (dx, dz, r_in, r_gem) in enumerate((
        (0, 1, riy, rgy),
        (-1, 0, rix, rgx),
        (0, -1, riy, rgy),
        (1, 0, rix, rgx),
    )):
        d = Vector((dx, 0, dz))
        side = Vector((-dz, 0, dx))
        center = Vector((cx, 0, cz))
        root = center + d * (r_in + 0.0015)
        tip = center + d * (r_gem - 0.0050)
        w_root, w_tip = 0.0068, 0.0038
        y_root, y_tip = FRAME_TOP - 0.0070, FRAME_TOP - 0.0092
        p_rings = []
        for t, w, y in (
            (0.0, w_root, y_root + 0.0045),
            (0.0, w_root, y_root),
            (0.55, (w_root + w_tip) / 2, y_tip - 0.0015),
            (1.0, w_tip, y_tip),
            (1.0, w_tip * 0.6, y_tip + 0.0032),
        ):
            p = root.lerp(tip, t)
            ring = [
                p + side * (w / 2) + Vector((0, y + 0.0012, 0)),
                p + side * (w / 2) + Vector((0, y - 0.0005, 0)),
                p + Vector((0, y - 0.0018, 0)),
                p - side * (w / 2) + Vector((0, y - 0.0005, 0)),
                p - side * (w / 2) + Vector((0, y + 0.0012, 0)),
            ]
            p_rings.append(ring)
        prong = loft(f'prong-{k}', p_rings, closed=True, cap_center=tip + Vector((0, y_tip + 0.0020, 0)))
        prong.data.materials.append(mats['gold'])
        smooth_by_angle(prong, 40)
        prongs.append(prong)
    return [obj, *prongs]


# ---------------------------------------------------------------- 下端中央のV字金飾り
def build_bottom_chevron(mats):
    """下端中央のV字エンブレム：中央に鋭い稜線を持つ立体金飾り"""
    pts_px = [
        (256.5, 747.5),   # 下の先端
        (234.0, 734.5),   # 左端
        (239.5, 729.5),   # 左上
        (256.5, 738.5),   # 内側中央の谷
        (273.5, 729.5),   # 右上
        (279.0, 734.5),   # 右端
    ]
    base_y = FRAME_TOP + 0.0020
    top_y = FRAME_TOP - 0.0068
    ridge_y = FRAME_TOP - 0.0092

    bm = bmesh.new()
    outer_back = [bm.verts.new(Vector((to_xz(px, py)[0], base_y, to_xz(px, py)[1]))) for px, py in pts_px]
    # 少し内側に寄せて面取りした上面
    center_px = (256.5, 742.0)
    outer_top = []
    for px, py in pts_px:
        qx = px + (center_px[0] - px) * 0.14
        qy = py + (center_px[1] - py) * 0.14
        x, z = to_xz(qx, qy)
        outer_top.append(bm.verts.new(Vector((x, top_y, z))))

    # 中央の稜線3点（左翼中点・下中央・右翼中点）
    ridge_px = [(245.0, 735.5), (256.5, 743.0), (268.0, 735.5)]
    ridge = [bm.verts.new(Vector((to_xz(px, py)[0], ridge_y, to_xz(px, py)[1]))) for px, py in ridge_px]

    n = len(pts_px)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((outer_back[i], outer_back[j], outer_top[j], outer_top[i]))
    # 上面を稜線へつなぐ
    bm.faces.new((outer_top[0], outer_top[1], ridge[0], ridge[1]))
    bm.faces.new((outer_top[1], outer_top[2], ridge[0]))
    bm.faces.new((outer_top[2], outer_top[3], ridge[1], ridge[0]))
    bm.faces.new((outer_top[3], outer_top[4], ridge[2], ridge[1]))
    bm.faces.new((outer_top[4], outer_top[5], ridge[2]))
    bm.faces.new((outer_top[5], outer_top[0], ridge[1], ridge[2]))
    bm.faces.new(list(reversed(outer_back)))

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new('bottom-chevron')
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new('bottom-chevron', mesh)
    bpy.context.scene.collection.objects.link(obj)
    mesh.materials.append(mats['gold'])
    smooth_by_angle(obj, 30)
    return obj


# ---------------------------------------------------------------- 縁取りの金具（窓・欄・二重楕円メダル）
def gold_rim(name, points, mats, width, height, base_y, double_ridge=False):
    """points（XZ の輪）に沿った立体的な金の縁。double_ridge=True で二重の峰（高級メダル輪）"""
    half = width / 2
    if double_ridge:
        profile = [
            (-half, -0.0012),
            (-half, height * 0.50),
            (-half * 0.62, height * 0.96),
            (-half * 0.25, height * 0.68),
            (0.0, height * 0.55),
            (half * 0.28, height * 0.85),
            (half * 0.68, height * 1.00),
            (half, height * 0.50),
            (half, -0.0012),
        ]
    else:
        profile = [
            (-half, -0.0010),
            (-half, height * 0.45),
            (-half * 0.55, height * 0.92),
            (0.0, height),
            (half * 0.55, height * 0.92),
            (half, height * 0.45),
            (half, -0.0010),
        ]
    rings = profile_ring(points, profile, base_y)
    obj = loft(name, rings, closed=True)
    obj.data.materials.append(mats['gold'])
    smooth_by_angle(obj, 45)
    return obj


# ---------------------------------------------------------------- 組み立て
def build():
    scene = fresh_scene()
    mats = make_materials()
    parts = []

    # 1) 板（本体の外形。裏に裏の絵、側面は深いロイヤルパープル）
    x0, y0, x1, y1, r = BODY
    slab = slab_from_loops('slab', [rounded_rect(x0, y0, x1, y1, r, 8)], SLAB_FRONT - 0.0010, BACK_Y, 0.0040)
    bx0, bz1 = to_xz(x0, y0)
    bx1, bz0 = to_xz(x1, y1)

    def slab_uv(kind, c):
        if kind == 'back':
            return 1 - (c.x - bx0) / (bx1 - bx0), (c.z - bz0) / (bz1 - bz0)
        return face_uv(c.x, c.z)

    assign(slab, mats, lambda n, c: 'face' if n.y < -0.7 else 'back' if n.y > 0.7 else 'purple', slab_uv)
    smooth_by_angle(slab, 40)
    parts.append(slab)

    # 2) 紫の本体枠（絵の外形どおり。上部王冠・宝石台座・下端V字のはみ出しも含む）。窓・メダル・名前欄・下の欄は穴
    outline = [tuple(p) for p in frame_outline()]
    holes = [window_medal_hole(), rounded_rect(*grow(NAME, -1.5), 6), rounded_rect(*grow(STAT, -1.5), 6)]
    frame = slab_from_loops('frame', [outline, *holes], FRAME_TOP, SLAB_FRONT + 0.0010, 0.0030)
    inner = (bx0 + 0.004, bz0 + 0.004, bx1 - 0.004, bz1 - 0.004)
    cull(frame, lambda n, c: n.y > 0.5 and inner[0] < c.x < inner[2] and inner[1] < c.z < inner[3])
    assign(frame, mats, lambda n, c: 'face' if n.y < -0.45 else 'purple')
    smooth_by_angle(frame, 40)
    parts.append(frame)

    # 2b) 左右の巻き付き金装飾・上部王冠の金翼（枠からしっかり立体的に盛り上がる金属レリーフ）
    gm, lm = ornament_masks()
    gold_objs = []
    for i, (loop, size, y0_px) in enumerate(extract_loops(gm, min_size=55, spacing=1.5, smooth=3, eps=0.30)):
        # 上部王冠の大きな翼はさらに高く重厚に盛り上げる
        lift = 0.0085 if y0_px < 120 else 0.0068
        bev = 0.0042 if y0_px < 120 else 0.0034
        gold_objs.append(slab_from_loops(f'gold-orn-{i}', [[tuple(q) for q in loop]], FRAME_TOP - lift, FRAME_TOP + 0.0020, bev, resolution=2))
    if gold_objs:
        gold_relief = join(gold_objs, 'gold-ornaments')
        cull(gold_relief, lambda n, c: n.y > 0.25)
        assign(gold_relief, mats, lambda n, c: 'gold_relief' if n.y < -0.25 else 'gold')
        smooth_by_angle(gold_relief, 55)
        parts.append(gold_relief)

    # 2c) 発光ルーン & 上部紫クリスタル羽（枠から浮き上がる発光立体装飾）
    glow_objs = []
    for i, (loop, size, y0_px) in enumerate(extract_loops(lm, min_size=40, spacing=1.5, smooth=3, eps=0.30)):
        # 上部の紫クリスタル羽は高めに、サイドの渦巻きルーンは繊細に浮き上がらせる
        is_wing = y0_px < 130
        lift = 0.0062 if is_wing else 0.0032
        bev = 0.0030 if is_wing else 0.0016
        glow_objs.append(slab_from_loops(f'glow-{i}', [[tuple(q) for q in loop]], FRAME_TOP - lift, FRAME_TOP + 0.0018, bev, resolution=1))
    if glow_objs:
        glow_mesh = join(glow_objs, 'glow-runes')
        cull(glow_mesh, lambda n, c: n.y > 0.25)
        assign(glow_mesh, mats, lambda n, c: 'glow')
        smooth_by_angle(glow_mesh, 55)
        parts.append(glow_mesh)

    # 3) 名前欄・下の欄（枠より少し沈んだクリームの板）・楕円メダルの中
    for name, rect in (('name-plate', NAME), ('stat-plate', STAT)):
        plate = slab_from_loops(name, [rounded_rect(*grow(rect, -1.0), 6)], PLATE_TOP, SLAB_FRONT, 0.0018)
        assign(plate, mats, lambda n, c: 'face' if n.y < -0.45 else 'purple')
        smooth_by_angle(plate, 40)
        parts.append(plate)
    medal = slab_from_loops('medal-disc', [ellipse(MEDAL[0], MEDAL[1], MEDAL[2] + 2.5, MEDAL[3] + 2.5, 64)], MEDAL_TOP, SLAB_FRONT, 0.0016)
    assign(medal, mats, lambda n, c: 'face' if n.y < -0.45 else 'purple')
    smooth_by_angle(medal, 40)
    parts.append(medal)

    # 4) 金の縁：窓・名前欄・下の欄・二重楕円メダル・下端V字
    rim_window = gold_rim('rim-window', rect_xz(grow(WINDOW, 1.5), spacing=8.0), mats, 0.0085, 0.0046, FRAME_TOP)
    mcx, mcz = to_xz(MEDAL[0], MEDAL[1])
    # 窓の左上角はメダルの下に潜る
    cull(rim_window, lambda n, c: ((c.x - mcx) / ((MEDAL[4] + 1.5) / PX)) ** 2 + ((c.z - mcz) / ((MEDAL[5] + 1.5) / PX)) ** 2 < 1.0)
    parts.append(rim_window)
    parts.append(gold_rim('rim-name', rect_xz(grow(NAME, -1.0)), mats, 0.0076, 0.0042, FRAME_TOP + 0.0010))
    parts.append(gold_rim('rim-stat', rect_xz(grow(STAT, -1.0)), mats, 0.0076, 0.0042, FRAME_TOP + 0.0010))

    # 楕円メダルの二重金輪
    rx_mid = (MEDAL[2] + MEDAL[4]) / 2 / PX
    ry_mid = (MEDAL[3] + MEDAL[5]) / 2 / PX
    ring_w = ((MEDAL[4] - MEDAL[2]) + (MEDAL[5] - MEDAL[3])) / 2 / PX
    ring_pts = [
        Vector((mcx + rx_mid * math.cos(a), mcz + ry_mid * math.sin(a)))
        for a in [-2 * math.pi * i / 72 for i in range(72)]
    ]
    parts.append(gold_rim('rim-medal', ring_pts, mats, ring_w, 0.0086, FRAME_TOP + 0.0010, double_ridge=True))
    parts.append(build_bottom_chevron(mats))

    # 5) 縦長ひし形宝石の台座と爪、アメジスト宝石
    parts.extend(build_setting(mats))
    parts.append(build_gem(mats))

    # まとめる（親の空オブジェクトの下に）
    root = bpy.data.objects.new('card-epic', None)
    scene.collection.objects.link(root)
    for p in parts:
        p.parent = root
    return root, parts


def export(root):
    for obj in bpy.context.scene.objects:
        obj.select_set(obj == root or obj.parent == root)
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
