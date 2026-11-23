# Castle Field — 4陣営 3Dジオラマ制作・検証レポート（高精細版 v3）

Castle Field のホーム画面向けに、Blender 5.3（Cycles OPTIX / Compositor Bloom / Python再現スクリプト）で実制作した 4陣営の浮遊島 3Dジオラマアセット一式です。

---

## 1. 成果物一覧

| 種類 | ファイルパス | サイズ / 仕様 |
|---|---|---|
| 編集可能シーン | `assets/models/diorama/castle_field_diorama.blend` | 1,926.3 KB（13コレクション・89メッシュ・10カメラ・10ライト・52 PBRマテリアル・Compositor Bloom） |
| Web向け 3Dモデル | `assets/models/diorama/castle_field_diorama.glb` | 7,609.5 KB（約 7.43 MB、128,692 tris、Y-up、カメラ・ライト同梱） |
| 生成スクリプト | `assets/models/diorama/scripts/build_diorama.py` | ジオラマ全体の完全再生成 |
| モジュール群 | `scripts/diorama_materials.py`, `diorama_terrain.py`, `diorama_arch_kit.py`, `diorama_castles.py`, `diorama_nature_props.py` | PBR材質・地形/水路・高精細建築キット・4城・自然物/プロップ |
| レンダリングスクリプト | `assets/models/diorama/scripts/render_diorama.py` | 必須10視点（96 samples）+ モバイル9:16（64 samples）+ ターンテーブル一括出力 |
| 自動検証スクリプト | `assets/models/diorama/scripts/verify_diorama.py` | `.blend`/`.glb`・向き・法線・欠損チェック |
| カメラ設定 JSON | `assets/models/diorama/config/cameras.json` | Blender Z-up / Three.js Y-up 両座標系と共通軌道パラメータ |
| 座標一覧 JSON | `assets/models/diorama/config/coordinates.json` | 中央広場・水路・4陣営城の座標・正面ベクトル・バウンディングボックス |
| アセット・材質一覧 | `assets/models/diorama/config/assets_materials.json` | 全13コレクション・89メッシュ・52マテリアルの一覧 |
| 自動検証結果 JSON | `assets/models/diorama/config/verification_results.json` | `passed: true` |
| 必須10視点レンダリング | `assets/models/diorama/renders/01_overview.png` 〜 `10_home_dragon.png` | 1280×720 PNG（Cycles 96 samples / AgX / Bloom） |
| スマホ縦画面確認用 | `assets/models/diorama/renders/mobile_01_kingdom_9x16.png` 〜 `mobile_04_dragon_9x16.png` | 720×1280 PNG（9:16 縦画面 UIセーフ領域確認） |
| ターンテーブル画像 | `assets/models/diorama/renders/turntable_sheet.png` | 45°刻み8方向コンタクトシート（2×4） |
| ターンテーブル動画 | `assets/models/diorama/renders/turntable_4factions.mp4` | 960×540 / 24fps / 96フレーム（1,059.8 KB、4陣営ホームカメラの360°旋回） |

---

## 2. 3D空間構造と高精細ディテール

座標系規約：
- **Blender**：Z-up、1 unit = 1m、北 = `+Y`、南 = `-Y`、東 = `+X`、西 = `-X`
- **glTF / Three.js（`.glb`）**：Y-up（`export_yup=True`）、`(x, y, z)_three = (x, z, -y)_blender`

### 地形・中央広場・橋・階段・水系
- **浮遊島 (`Island_Base`)**：`192×26` 極座標メッシュによる4バイオーム地形＋段差のある地層岩盤裏面（最下点 `Z = -19.8m`）＋各城の石積み擁壁＋周囲の浮遊小岩14基。
- **中央広場 (`Central_Plaza`)**：中立地帯（陣営旗・紋章なし）。個別造形された放射状石畳3重リング、金・ブロンズ2層仕上げの8方位コンパスローズ、挽き物石造バラスター手すり、鍛鉄製ファンタジー街灯8基、対角アルコーブの石造ベンチ＆植栽プランター。
- **石造アーチ橋 (`Bridges`)**：4方向すべてに実際のアーチ石（迫石/ヴソワール＋要石）、橋脚の水切り（カットウォーター）、個別石畳デッキ、パネル装飾欄干、鍛鉄街灯を造形。
- **アプローチ＆大階段 (`Roads`)**：段鼻付き石段・階段手すり＋各陣営の門前専用ピラー（王国：金装飾街灯／森：木柱アンバー灯／魔族：浮遊紫水晶オベリスク／竜族：鉄製篝火）。
- **水系・滝 (`Water`)**：環状堀＋岸辺の白波カラー＋斜め4方向の湧水＆河川＋有機的な波紋と白波筋を備えた4箇所の滝カーテン。

### 4陣営の建築デザイン（すべて正面入口が中央広場を向く）
- **北（`+Y`）王国 (`Castle_Kingdom`)**：白石灰岩の石積み城壁・控え壁・持ち送り狭間（マシコレーション）、迫石アーチ＆金格子門、フルール・ド・リス紋章、正面中央の金色バラ窓、屋根ドーマー窓と8本金色棟リブを備えたロイヤルブルー尖塔屋根。
- **西（`-X`）森の同盟 (`Castle_Forest`)**：縦溝樹皮を持つ巨大な古木幹・10本の崖を掴む根・8本の曲がる大枝、115以上の滑らかな多層樹冠クラスタ、垂れ下がる蔦と妖精ランタン、5棟のハーフティンバー樹上見張り塔＆吊り木橋、生木アーチの聖域門。
- **東（`+X`）魔族軍 (`Castle_Demon`)**：六角黒曜石城壁・6本のゴシック飛梁（フライングバットレス）・5本の鋭利尖塔＆スパイク王冠ギャラリー、門前地面の発光召喚陣、6本の黒曜石爪アーチと二重回転アーケイン光輪・8個の周回結晶片に抱かれた大型両端尖頭アメジスト結晶（半透明外殻＋高輝度コア）、自然結晶ジオードと歪んだ闇樹。
- **南（`-Y`）竜族帝国 (`Castle_Dragon`)**：玄武岩の傾斜控え壁・鉄帯リベット装甲・溶岩亀裂、3対の節（輪状隆起）入り巨大湾曲竜角、光る瞳と牙を備えた3D竜頭骨ゲートハウス＆鉄格子溶鉱炉門、3層構造の燃え上がる鉄爪篝火7基、六角玄武岩柱状節理と溶岩溜まり。

### 座標一覧（Blender Z-up）

| 対象 | 方角 | コレクション | 中心座標 `(X, Y, Z)` | 正面入口座標 `(X, Y, Z)` | 正面向きベクトル | 敷地高さ `Z` |
|---|---|---|---|---|---|---|
| 中央広場（中立） | 中央 | `Central_Plaza` | `(0.0, 0.0, 0.0)` | 4方向開放 | 全方向対称 | `0.0 m` |
| 王国 | 北 (`+Y`) | `Castle_Kingdom` | `(0.0, 22.4, 3.0)` | `(0.0, 17.6, 3.0)` | `(0, -1, 0)` | `+3.0 m` |
| 森の同盟 | 西 (`-X`) | `Castle_Forest` | `(-22.2, 0.0, 2.2)` | `(-17.6, 0.0, 2.2)` | `(+1, 0, 0)` | `+2.2 m` |
| 魔族軍 | 東 (`+X`) | `Castle_Demon` | `(22.4, 0.0, 2.4)` | `(17.6, 0.0, 2.4)` | `(-1, 0, 0)` | `+2.4 m` |
| 竜族帝国 | 南 (`-Y`) | `Castle_Dragon` | `(0.0, -22.4, 2.2)` | `(0.0, -17.6, 2.2)` | `(0, +1, 0)` | `+2.2 m` |

---

## 3. カメラシステムとホーム画面回転ルール

4陣営ホームカメラは中央広場 `(0, 0, 0)` 中心の共通円軌道（`R_orbit = 13.194 m`, `Z = 11.4 m`, `lens = 24.5 mm`）上に配置されており、対岸城の正面門半径 `17.6 m` より内側を旋回するため**他陣営による遮蔽ゼロ**で滑らかに360°切替可能です（詳細：`config/cameras.json`）。

---

## 4. コレクション構成・ポリゴン数・材質一覧

外部アセットは一切未使用（**100% オリジナル Blender Python 造形＋PBR材質**）。

| コレクション | オブジェクト数 | メッシュ数 | 三角ポリゴン数 |
|---|---:|---:|---:|
| `Island_Base` | 4 | 4 | 15,528 |
| `Central_Plaza` | 6 | 6 | 7,288 |
| `Roads` | 12 | 12 | 3,128 |
| `Bridges` | 16 | 16 | 7,216 |
| `Water` | 3 | 3 | 10,512 |
| `Nature` | 11 | 11 | 24,512 |
| `Castle_Kingdom` | 8 | 7 | 14,160 |
| `Castle_Forest` | 11 | 10 | 20,160 |
| `Castle_Demon` | 8 | 7 | 7,808 |
| `Castle_Dragon` | 11 | 10 | 11,932 |
| `Props` | 3 | 3 | 6,448 |
| `Lights` | 10 | 0 | 0 |
| `Cameras` | 10 | 0 | 0 |
| **合計** | **113** | **89** | **128,692（52 PBR材質）** |

---

## 5. ホーム画面への実装方式の推奨

- **通常モード（リアルタイム 3D）**：`castle_field_diorama.glb`（約 7.43 MB / 128.7k tris）を Three.js で読み込み、`config/cameras.json` の円軌道で陣営切替アニメーションを実行。Three.js 側で Draco 圧縮または `UnrealBloomPass`・結晶浮遊/炎揺らぎを加えるとさらに高品質化できます。
- **軽量モード (`?fx=lite` / 低スペック端末)**：同一 `.blend` から出力した `renders/mobile_01〜04_*_9x16.png`（縦画面）または `renders/07〜10_home_*.png`（横画面）を背景画像としてフォールバック表示。

---

## 6. 検証結果と残課題

- [x] 真上から見た十字4方向配置（北:王国 / 西:森の同盟 / 東:魔族軍 / 南:竜族帝国）
- [x] 4城すべての正面入口が中央広場を向いている（自動検証 `front_dot_to_plaza = 1.00000`）
- [x] 中央広場は完全中立（陣営旗・紋章なし）
- [x] 橋・階段・道・水路・滝の接続に破綻・貫通・浮きなし
- [x] 4方向・8方向ターンテーブル・スマホ9:16表示すべてでシルエットと個性を明瞭に視認可能
- [x] `.blend` / `.glb` 再インポート自動検証合格（`verification_results.json: passed = true`, `nan_vertices = 0`, `degenerate_faces = 0`, 未割当材質ゼロ）
- **残課題**：本PRでは既存ファイル無断上書き禁止ルールに従い、`assets/CREDITS.md`・`js/ui/precache.js`・ホーム画面UI実装は未変更です。統合時に `CREDITS.md` 追記および `node js/ui/build-precache.js` 実行、必要に応じて Three.js 向け Draco 圧縮版 `.glb` の生成を検討してください。

---

## 7. 再生成・再レンダリング手順

```powershell
"C:\Program Files\Blender Foundation\Blender 5.3\blender.exe" --background --python assets/models/diorama/scripts/build_diorama.py
"C:\Program Files\Blender Foundation\Blender 5.3\blender.exe" --background assets/models/diorama/castle_field_diorama.blend --python assets/models/diorama/scripts/render_diorama.py
"C:\Program Files\Blender Foundation\Blender 5.3\blender.exe" --background --python assets/models/diorama/scripts/verify_diorama.py
```
