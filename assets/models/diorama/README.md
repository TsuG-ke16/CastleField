# Castle Field — 4陣営 3Dジオラマ制作・検証レポート（Tripo All-Star 完成版）

Castle Field のホーム画面向けに、**Tripo Studio 3DスカルプトPBRアセット**（4バイオーム浮遊島＋4陣営ヒーロー城）を Blender 5.3（Cycles OPTIX / AgX / Compositor Bloom / Python再現パイプライン）で最適化・発光テクスチャ合成・空間統合した 4陣営3Dジオラマアセット一式です。

---

## 1. 成果物一覧

| 種類 | ファイルパス | サイズ / 仕様 |
|---|---|---|
| 編集可能シーン | `assets/models/diorama/castle_field_diorama.blend` | 12,640.6 KB（テクスチャ同梱・13コレクション・19メッシュ・10カメラ・12ライト・14 PBR材質・Compositor Bloom） |
| Web向け 3Dモデル | `assets/models/diorama/castle_field_diorama.glb` | 10,909.9 KB（約 10.65 MB、199,160 tris、Y-up、JPEG圧縮PBR＋発光マップ、カメラ・ライト同梱） |
| 最適化済み Tripo 個別アセット | `assets/models/diorama/tripo_castles/*.glb` | 島本体 65k tris（2K PBR+Emissive）＋4城 各30k〜34k tris（1K PBR+Emissive） |
| 統合生成スクリプト | `assets/models/diorama/scripts/build_diorama.py` | `.blend` / `.glb` および `config/*.json` の完全再生成 |
| Tripo 最適化スクリプト | `scripts/prepare_tripo_castles.py`, `scripts/prepare_tripo_island.py` | デシメート・向き/接地正規化・窓/結晶/炎/溶岩の自動Emissive合成 |
| シーン構築モジュール群 | `scripts/diorama_materials.py`, `diorama_terrain.py`, `diorama_castles.py`, `diorama_arch_kit.py`, `diorama_nature_props.py` | PBR材質・島レイアウト＆レイキャスト接地・4城配置・街灯/雲/蛍プロップ（プロシージャルフォールバック実装も保持） |
| レンダリングスクリプト | `assets/models/diorama/scripts/render_diorama.py` | 必須10視点（96 samples）＋スマホ9:16（64 samples）＋ターンテーブル一括出力 |
| 自動検証スクリプト | `assets/models/diorama/scripts/verify_diorama.py` | `.blend`/`.glb`・向き・法線・欠損チェック |
| カメラ設定 JSON | `assets/models/diorama/config/cameras.json` | Blender Z-up / Three.js Y-up 両座標系と共通円軌道パラメータ |
| 座標一覧 JSON | `assets/models/diorama/config/coordinates.json` | 中央広場・水路・4陣営城の座標・正面ベクトル・バウンディングボックス |
| アセット・材質一覧 | `assets/models/diorama/config/assets_materials.json` | 全13コレクション・19メッシュ・14マテリアルの一覧 |
| 自動検証結果 JSON | `assets/models/diorama/config/verification_results.json` | `passed: true` |
| 必須10視点レンダリング | `assets/models/diorama/renders/01_overview.png` 〜 `10_home_dragon.png` | 1280×720 PNG（Cycles 96 samples / AgX / Bloom） |
| スマホ縦画面確認用 | `assets/models/diorama/renders/mobile_01_kingdom_9x16.png` 〜 `mobile_04_dragon_9x16.png` | 720×1280 PNG（9:16 縦画面 UIセーフ領域確認） |
| ターンテーブル画像 | `assets/models/diorama/renders/turntable_sheet.png` | 45°刻み8方向コンタクトシート（2×4） |
| ターンテーブル動画 | `assets/models/diorama/renders/turntable_4factions.mp4` | 960×540 / 24fps / 96フレーム（1,013.6 KB、4陣営ホームカメラの360°旋回） |

---

## 2. 3D空間構造とデザイン

座標系規約：
- **Blender**：Z-up、1 unit = 1m、北 = `+Y`、南 = `-Y`、東 = `+X`、西 = `-X`
- **glTF / Three.js（`.glb`）**：Y-up（`export_yup=True`）、`(x, y, z)_three = (x, z, -y)_blender`

### 地形・中央広場・橋・水系
- **4バイオーム浮遊島 (`Island_Base`)**：北（王国草原・針葉樹）、西（森の同盟・苔岩と垂れ下がる古木根）、東（魔族軍・暗紫黒曜石と発光紫水晶）、南（竜族帝国・火山玄武岩と発光溶岩亀裂）の4区画と、立体的に彫刻された地層岩盤の裏面（最下点 `Z = -41.50m`）。
- **中央広場 (`Central_Plaza`)**：完全中立地帯（陣営旗・紋章なし）。金色の8方位コンパスローズと彫刻石造バラスター手すりを備え、手すり天端へレイキャスト接地した鍛鉄製ファンタジー街灯8基を配置。
- **4方向アーチ橋＆アプローチ (`Bridges` / `Roads`)**：十字4方向にアーチ橋が中央広場と各城の円形石造パッドを途切れず接続。各橋の欄干天端ランタンと、城門手前の石造ボラード街灯で動線を演出。
- **水系・滝 (`Water`)**：中央広場を囲む環状堀から斜め4方向（45°/135°/225°/315°）へ河川と滝が落下し、滝壺付近に柔らかな水煙ミストを配置。

### 4陣営の建築デザイン（すべて正面入口が中央広場を向く）
- **北（`+Y`）王国 (`Castle_Kingdom`)**：明るい灰白色の石積み城郭、ロイヤルブルーの複数尖塔屋根、金色のフルール・ド・リス紋章と王室バナー、暖色に輝くアーチ窓。
- **西（`-X`）森の同盟 (`Castle_Forest`)**：巨大な古木と完全に一体化した多層ツリーハウス建築、緑の瓦屋根・木製見張り塔・吊り歩道、周囲に漂う淡い森の蛍（`Nature_Forest_Fireflies`）。
- **東（`+X`）魔族軍 (`Castle_Demon`)**：黒曜石の鋭利なゴシック尖塔と飛梁、爪状タワー頂部に浮かぶ高輝度パープル魔力結晶、紫光を放つステンドグラス窓と門前ジオード。
- **南（`-Y`）竜族帝国 (`Castle_Dragon`)**：重厚な赤黒火山岩の要塞、正面門を挟む巨大な湾曲竜角と竜頭骨レリーフ、赤い軍旗、屋上4隅の燃え盛る篝火と溶鉱炉ゲート。

### 座標一覧（Blender Z-up）

| 対象 | 方角 | コレクション | 中心座標 `(X, Y, Z)` | 正面入口座標 `(X, Y, Z)` | 正面向きベクトル | 敷地高さ `Z` |
|---|---|---|---|---|---|---|
| 中央広場（中立） | 中央 | `Central_Plaza` | `(0.0, 0.0, 0.0)` | 4方向開放 | 全方向対称 | `0.000 m` |
| 王国 | 北 (`+Y`) | `Castle_Kingdom` | `(0.0, 20.6, 0.188)` | `(0.0, 15.2, 0.188)` | `(0, -1, 0)` | `+0.188 m` |
| 森の同盟 | 西 (`-X`) | `Castle_Forest` | `(-20.6, 0.0, 0.136)` | `(-15.2, 0.0, 0.136)` | `(+1, 0, 0)` | `+0.136 m` |
| 魔族軍 | 東 (`+X`) | `Castle_Demon` | `(20.6, 0.0, 0.097)` | `(15.2, 0.0, 0.097)` | `(-1, 0, 0)` | `+0.097 m` |
| 竜族帝国 | 南 (`-Y`) | `Castle_Dragon` | `(0.0, -20.6, 0.138)` | `(0.0, -15.2, 0.138)` | `(0, +1, 0)` | `+0.138 m` |

---

## 3. カメラシステムとホーム画面回転ルール

4陣営ホームカメラ（`Camera_Kingdom`, `Camera_Forest`, `Camera_Demon`, `Camera_Dragon`）は中央広場 `(0, 0, 0)` 中心の共通円軌道（`R_orbit = 10.914 m`, `Z = 8.2 m`, `lens = 24.0 mm`）上に配置されており、城の正面入口リング半径 `15.2 m` より内側を旋回するため**他陣営による遮蔽ゼロ**で滑らかに360°切替可能です（詳細：`config/cameras.json`）。

---

## 4. コレクション構成・ポリゴン数・使用アセット一覧

- **Tripo Studio 3DスカルプトPBRアセット（最適化＋Emissive合成済み）**：浮遊島ベース1点（65,000 tris）＋4陣営城4点（各30,000〜34,000 tris）
- **Blender プロシージャル追加要素**：基礎台座、広場・橋・門前ボラードの鍛鉄ランタン群、滝ミスト、森の蛍、外周雲リング、12ライト、10カメラリグ

| コレクション | オブジェクト数 | メッシュ数 | 三角ポリゴン数 |
|---|---:|---:|---:|
| `Island_Base` | 1 | 1 | 65,000 |
| `Central_Plaza` | 2 | 2 | 1,024 |
| `Roads` | 3 | 3 | 1,216 |
| `Bridges` | 2 | 2 | 512 |
| `Water` | 1 | 1 | 960 |
| `Nature` | 1 | 1 | 560 |
| `Castle_Kingdom` | 3 | 2 | 30,012 |
| `Castle_Forest` | 3 | 2 | 34,068 |
| `Castle_Demon` | 3 | 2 | 30,020 |
| `Castle_Dragon` | 3 | 2 | 30,028 |
| `Props` | 1 | 1 | 5,760 |
| `Lights` | 12 | 0 | 0 |
| `Cameras` | 10 | 0 | 0 |
| **合計** | **45** | **19** | **199,160（14 PBR材質）** |

---

## 5. ホーム画面への実装方式の推奨

- **通常モード（リアルタイム 3D）**：`castle_field_diorama.glb`（約 10.65 MB / 199.2k tris）を Three.js で読み込み、`config/cameras.json` の円軌道で陣営切替アニメーションを実行。Web配信時は Three.js 向け Draco 圧縮または KTX2 変換を適用するとさらに転送量を削減できます。
- **軽量モード (`?fx=lite` / 低スペック端末)**：同一 `.blend` から出力した `renders/mobile_01〜04_*_9x16.png`（縦画面）または `renders/07〜10_home_*.png`（横画面）を背景画像としてフォールバック表示。

---

## 6. 検証結果と残課題

- [x] 真上から見た十字4方向配置（北:王国 / 西:森の同盟 / 東:魔族軍 / 南:竜族帝国）
- [x] 4城すべての正面入口が中央広場を向いている（自動検証 `front_dot_to_plaza = 1.00000`, `cardinal_alignment_dot = 1.00000`）
- [x] 中央広場は完全中立（陣営旗・紋章なし）
- [x] 4つの橋・階段・円形パッド・水路・4本の滝・裏面岩盤に構造的破綻なし
- [x] 4方向・8方向ターンテーブル・スマホ9:16表示すべてでシルエットと個性を明瞭に視認可能
- [x] `.blend` / `.glb` 再インポート自動検証合格（`verification_results.json: passed = true`, `nan_vertices = 0`, `degenerate_faces = 0`, 未割当材質ゼロ）
- **残課題**：
  1. 本PRでは既存ファイル無断上書き禁止ルールに従い、`assets/CREDITS.md`・`js/ui/precache.js`・ホーム画面UI実装は未変更です。統合時に Tripo Studio アセットのクレジット追記および `node js/ui/build-precache.js` 実行を行ってください。
  2. モバイル回線での初回読み込み高速化を重視する場合は、Three.js 組み込み前に `castle_field_diorama.glb` へ Draco / Meshopt 圧縮または 512px テクスチャ軽量版バリアントの生成を検討してください。

---

## 7. 再生成・再レンダリング手順

```powershell
"C:\Program Files\Blender Foundation\Blender 5.3\blender.exe" --background --python assets/models/diorama/scripts/build_diorama.py
"C:\Program Files\Blender Foundation\Blender 5.3\blender.exe" --background assets/models/diorama/castle_field_diorama.blend --python assets/models/diorama/scripts/render_diorama.py
"C:\Program Files\Blender Foundation\Blender 5.3\blender.exe" --background --python assets/models/diorama/scripts/verify_diorama.py
```
