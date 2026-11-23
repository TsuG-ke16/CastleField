"""浮いている・沈んでいるGLBを、ルートノードの上下移動だけで地面（y=0）に接地させる。

形状・マテリアル・階層（FieldGL が探す Anim_* の名前）は一切変えない（GLBのJSONの translation を足し引きするだけで、
Blender で再エクスポートしないので劣化しない）。
測定は assets/models/qa-audit-glb.py（Blender）の min_z_ground。ここに書いた量は、その測定値を打ち消す量。

使い方：python assets/models/fix-ground-contact.py            （実行すると .glb を直接書き換える）
        python assets/models/fix-ground-contact.py --dry-run   （変える量だけ表示）
"""
import json
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent

# 名前 -> 上に動かす量(m)。Blender で測った「最下面の高さ」の符号を反対にしたもの
LIFT = {
    'monster-demon': -0.08,
    'monster-dragon': -0.178,
    'monster-goblin': -0.175,
    'monster-mimic': -0.06,
    'monster-slime': +0.03,
    'unit-dragon': -0.14,
}


def read_glb(path):
    data = path.read_bytes()
    magic, version, _length = struct.unpack_from('<4sII', data, 0)
    assert magic == b'glTF' and version == 2, path
    json_len, json_type = struct.unpack_from('<II', data, 12)
    assert json_type == 0x4E4F534A
    doc = json.loads(data[20:20 + json_len])
    rest = data[20 + json_len:]
    return doc, rest


def write_glb(path, doc, rest):
    body = json.dumps(doc, separators=(',', ':')).encode('utf-8')
    body += b' ' * ((4 - len(body) % 4) % 4)  # 4バイト境界にそろえる
    total = 12 + 8 + len(body) + len(rest)
    path.write_bytes(struct.pack('<4sII', b'glTF', 2, total) + struct.pack('<II', len(body), 0x4E4F534A) + body + rest)


def main():
    dry = '--dry-run' in sys.argv
    for name, dy in LIFT.items():
        path = ROOT / f'{name}.glb'
        doc, rest = read_glb(path)
        for idx in doc['scenes'][doc.get('scene', 0)]['nodes']:
            node = doc['nodes'][idx]
            if 'matrix' in node:
                node['matrix'][13] += dy
            else:
                t = node.setdefault('translation', [0.0, 0.0, 0.0])
                t[1] = round(t[1] + dy, 6)
        print(f'{name}: ルートを {dy:+.3f}m 動かす' + ('（dry-run）' if dry else ''))
        if not dry:
            write_glb(path, doc, rest)


if __name__ == '__main__':
    main()
