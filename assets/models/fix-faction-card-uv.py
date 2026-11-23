"""4陣営の3Dカード（card-faction-*.glb）の表の絵の UV を、上下正しい向きに直す。

faction_card_lib.py の front_uv_from_xz が「Blender の UV で上が0」で書いていたため、glTF に書き出すと上下が逆になり
（glTF の書き出しで V が 1 - V になる）、拡大表示で表の絵（イラスト・名前・説明・MP）が上下逆さまに貼られていた。
faction_card_lib.py は直したので、Blender で作り直せばこのスクリプトは要らない。Blender がない環境のために、
glb の中の face の材質の TEXCOORD_0 の V だけを 1 - V にする（形・材質・ほかの UV は変えない）。

何度実行しても同じ：イラストの枠（*-face-illu）の V がすでに上半分（中心が 0.5 未満）なら何もしない。
使い方：python3 assets/models/fix-faction-card-uv.py            （.glb を直接書き換える）
        python3 assets/models/fix-faction-card-uv.py --dry-run   （直すかどうかだけ表示）
"""
import json
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FACTIONS = ['kingdom', 'forest', 'demon', 'dragon']


def read_glb(data):
    magic, _version, _length = struct.unpack_from('<4sII', data, 0)
    assert magic == b'glTF', 'GLB ではありません'
    json_len, json_type = struct.unpack_from('<I4s', data, 12)
    assert json_type == b'JSON'
    gltf = json.loads(data[20:20 + json_len])
    bin_header = 20 + json_len
    bin_len, bin_type = struct.unpack_from('<I4s', data, bin_header)
    assert bin_type == b'BIN\x00'
    return gltf, bin_header + 8, bin_len


def face_accessors(gltf):
    """face の材質を使う primitive の TEXCOORD_0 アクセサ（メッシュ名つき）"""
    out = []
    for mesh in gltf['meshes']:
        for prim in mesh['primitives']:
            mat = gltf['materials'][prim['material']]['name'] if 'material' in prim else None
            if mat == 'face' and 'TEXCOORD_0' in prim['attributes']:
                out.append((mesh['name'], prim['attributes']['TEXCOORD_0']))
    return out


def v_values(data, gltf, bin_start, index):
    acc = gltf['accessors'][index]
    assert acc['componentType'] == 5126 and acc['type'] == 'VEC2', 'UV は float の VEC2 だけ扱う'
    view = gltf['bufferViews'][acc['bufferView']]
    stride = view.get('byteStride', 8)
    base = bin_start + view.get('byteOffset', 0) + acc.get('byteOffset', 0)
    return [(base + i * stride + 4, struct.unpack_from('<f', data, base + i * stride + 4)[0]) for i in range(acc['count'])]


def fix(path, dry_run):
    data = bytearray(path.read_bytes())
    gltf, bin_start, _ = read_glb(data)
    accs = face_accessors(gltf)
    shared = {i for _, i in accs}
    for mesh in gltf['meshes']:   # face 以外の primitive と同じアクセサを使っていたら、ほかの UV まで変わるので止める
        for prim in mesh['primitives']:
            mat = gltf['materials'][prim['material']]['name'] if 'material' in prim else None
            if mat != 'face' and prim['attributes'].get('TEXCOORD_0') in shared:
                raise SystemExit(f'{path.name}: face のUVがほかの部品と共有されています')
    illu = [i for name, i in accs if name.endswith('-face-illu')]
    assert illu, f'{path.name}: イラストの枠がありません'
    vs = [v for _, v in v_values(data, gltf, bin_start, illu[0])]
    center = (min(vs) + max(vs)) / 2
    if center < 0.5:
        print(f'{path.name}: もう正しい向き（イラストの中心 V={center:.3f}）')
        return
    print(f'{path.name}: 上下を直す（イラストの中心 V={center:.3f} → {1 - center:.3f}）')
    if dry_run:
        return
    for _, index in accs:
        for offset, v in v_values(data, gltf, bin_start, index):
            struct.pack_into('<f', data, offset, 1.0 - v)
        acc = gltf['accessors'][index]
        if 'min' in acc and 'max' in acc:
            acc['min'][1], acc['max'][1] = 1.0 - acc['max'][1], 1.0 - acc['min'][1]
    # min/max を直したときは JSON の長さが変わりうるので、書き直す
    json_bytes = json.dumps(gltf, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    json_bytes += b' ' * ((4 - len(json_bytes) % 4) % 4)
    bin_chunk = bytes(data[bin_start - 8:])
    out = struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(json_bytes) + len(bin_chunk))
    out += struct.pack('<I4s', len(json_bytes), b'JSON') + json_bytes + bin_chunk
    path.write_bytes(out)


if __name__ == '__main__':
    dry = '--dry-run' in sys.argv
    for faction in FACTIONS:
        fix(ROOT / f'card-faction-{faction}.glb', dry)
