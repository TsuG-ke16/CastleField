# 01. アートディレクション・新ボタン・脱SVG＆アセット仕様書

対象：**Track A（2Dアート・画像生成担当AI）** / **Track B（Blender 3D担当AI）**

---

## 1. アートディレクションの唯一の基準

**すべてのUI・ボタン・アイコン・背景・3Dモデルは、現行の「ちびキャライラスト（歩兵・弓兵・城・宝箱など）」の絵柄に完全に寄せる。**

### コアスタイル定義
- **輪郭線**: 太くて均一感のある温かいこげ茶 `#4A2E1A`（真っ黒 `#000000` は使わない）。
- **塗り**: 明るい手塗りアニメ調（ソフトなセルシェーディング＋上辺のクリーンな光沢ハイライト）。
- **フォルム**: 角張った工業製品や細い線画を避け、丸み・ぷっくり感・おもちゃ箱のような親しみやすさを持たせる。
- **文字なし原則**: 画像素材の中に文字は一切描き込まない（すべてUI層で重ねる）。
- **基準リファレンス**: 既存 `assets/cards/card-infantry.png`, `assets/cards/card-archer.png`, `assets/castles/castle-blue.png`, `assets/STYLE.md` を参照すること。

### カラーパレット（キャラ絵基準）
| 役割 | 代表色（Hex目安） | 用途 |
|---|---|---|
| **輪郭・文字（主）** | `#4A2E1A` | すべての輪郭線、羊皮紙上の本文・見出し |
| **補助文字** | `#7A5638` | サブ説明・メタ情報（コントラスト4.5:1以上を確保） |
| **主操作ゴールド** | `#FFE37A` → `#FFB833` → `#E4881A` | 画面に1つの最優先CTA（出陣・10連・ターン終了・決定） |
| **通常プレート（丸石/生成り）** | `#FFFDF6` → `#F4E4C1`（影 `#C9AD7B`） | 通常ボタン・キャンセル・サブ操作 |
| **選択ロイヤルブルー** | `#5B8DF0` → `#3465CC` → `#234799` | 選択中タブ・選択中チップ・王国の旗・p1カラー |
| **危険ルビーレッド** | `#FF8C7A` → `#DE4F46` → `#A82A24` | 降参・削除・危険操作・HP警告 |
| **羊皮紙面** | `#FFF6E0` / `#F7E7C4` | 情報を読むシート・詳細パネル |
| **木枠（器）** | `#8A562D` → `#5E371B`（縁ハイライト `#C9955A`） | バトルHUD・大枠のボード・露店棚 |
| **プレイヤー色** | p1: 空色 `#4DA3E8` / p2: 夕焼けオレンジ `#F5923E` | 城・兵士・陣営識別（既存ルール維持） |

---

## 2. 【厳守】使用禁止の既存ボタン素材リスト

現行リポジトリに含まれる以下のボタン素材は **デザイン方針に合わないため全廃（新規UIで一切参照禁止）** とする：

- `assets/ui/btn-blue.png`
- `assets/ui/btn-cream.png`
- `assets/ui/btn-green.png`
- `assets/ui/btn-orange.png`
- `assets/ui/btn-red.png`
- `assets/ui/btn-round.png`
- `assets/ui/button-end-turn.png`
- `assets/ui/kingdom-primary.png`
- `assets/ui/kingdom-secondary.png`
- `assets/ui/tap-plate.png`
- `assets/ui/natural/primary-*.png`
- `assets/ui/natural/neutral-*.png`
- `assets/ui/natural/selected-*.png`
- `assets/ui/natural/danger-*.png`
- `assets/ui/natural/round-*.png`

> **禁止理由**: 四隅に鋲がついた重たい木板テイストや引き伸ばし感のある平たい板デザインが、キャライラストの可愛さ・現代スマホゲームの軽快さとズレているため。

---

## 3. 新ボタン設計仕様（ゼロから新規制作）

格納先：`assets/v2/ui/buttons/`（形式：透過 WebP、2倍解像度、9-slice対応）

### 共通造形ルール
- **鋲（リベット）なし・ゴツい木板なし**。
- キャラ絵と同じ **太いこげ茶輪郭（実描画 2〜2.5px 相当）**。
- **ぷっくりした丸みのある立体ベベル**＋上辺に手描き風の明るい光沢ライン＋底面にしっかりした厚み（押下時に下へ 3px 沈む演出と噛み合わせる）。
- 9-slice（CSS `border-image` / Canvas / 9分割コンポーネント）で縦横比が崩れないよう、**左右・上下の中央1px帯を均一な単色/縦グラデーション**に保ち、角の半径を固定する。

### 制作するボタン5種（各 `normal` と `pressed`、または立体影をCSS/Motion連動＋画像1枚で軽量化）
| ID | ファイル名 | サイズ（2x） | 9-slice目安 | デザイン詳細 |
|---|---|---|---|---|
| **主操作ゴールド** | `btn-primary-gold.webp` | `320×128` | `28px` | 艶のある手塗りゴールド〜ハニーオレンジ、上辺に白い光沢ハイライト、温かく濃い底面厚み。最重要ボタンのみ左右端または上部に別パーツ `ornament-crown.webp` を重ねられる余白設計 |
| **通常プレート** | `btn-normal-stone.webp` | `320×112` | `24px` | やわらかく丸く削ったアイボリー〜クリーム石プレート。太こげ茶輪郭＋淡い底面厚み。情報が見やすい無地中央 |
| **選択ブルー** | `btn-selected-royal.webp` | `320×112` | `24px` | 兵士のマントと同じ鮮やかなロイヤルブルー＋内側に細い金の光ライン。白・クリーム文字が映える明度 |
| **危険ルビー** | `btn-danger-ruby.webp` | `320×112` | `24px` | 温かみのあるルビー〜コーラルレッド。太こげ茶輪郭＋上辺ハイライト |
| **丸アイコンボタン** | `btn-round-stone.webp`, `btn-round-gold.webp` | `128×128` | 等比縮小 | 閉じる・設定・メニュー・絞り込み等の丸ボタン（実寸 44〜52 CSS px）。中央にアイコンを乗せるため無地 |

### 新ボタン用 画像生成プロンプト指針（Track A向け）
```text
Style reference: bright cartoon fantasy mobile game UI matching cute chibi soldier illustrations.
Thick dark-brown outline (#4A2E1A), soft hand-painted cel shading, plump rounded 3D bevel,
clean glossy highlight strip along top edge, sturdy shaded bottom lip for tactile button feel.
NO corner rivets, NO wooden planks, NO wood grain clutter, NO text, NO icons inside.
Centered horizontal pill-rounded rectangular button on transparent background,
clean uniform center suitable for 9-slice scaling.
Variant: [glossy honey-gold primary button / warm ivory smooth stone button / royal blue button with thin gold inner rim / warm ruby red button].
```

---

## 4. 新UIフレーム・バナー素材仕様

格納先：`assets/v2/ui/frames/`（すべて透過 WebP、テキストなし）

| ファイル名 | サイズ（2x） | 用途 | デザイン要件 |
|---|---|---|---|
| `frame-wood-board.webp` | `256×256` | バトルHUD・作戦ボード・露店の大枠（9-slice） | キャラ絵と同じ太こげ茶輪郭の温かい木枠。角は丸みのある金の留め具（細かい鋲は最小限）、中心は透過 |
| `frame-parchment.webp` | `256×256` | 詳細シート・モーダル・カード情報面（9-slice） | 生成り羊皮紙＋太こげ茶輪郭＋内側の淡い影。中央は完全無地で読みやすさ最優先 |
| `banner-flag-blue.webp` | `320×96` | モード切替・見出し用の王国の青い旗バナー | キャラ絵の城の旗と同系統。文字を中央に重ねる |
| `banner-victory-ribbon.webp` | `512×224` | リザルト画面の赤い勝利リボン＋金王冠 | 中央リボン帯（縦45〜78%付近）を文字用に広く確保（現行の空リボン問題を根本解決） |
| `banner-defeat-ribbon.webp` | `512×224` | リザルト画面の敗北リボン（落ち着いた青灰） | 勝利リボンと対になる構成 |
| `hud-topbar-royal.webp` | `320×120` | ホーム上部のプレイヤーバー（9-slice） | ロイヤルブルー＋下辺に細い金線＋太こげ茶輪郭 |
| `hud-bottombar-wood.webp` | `320×136` | スマホ下部の5タブナビバー（9-slice） | 温かみのある木または濃紺の受け皿＋上辺に金縁 |
| `panel-shelf-wood.webp` | `512×128` | ショップの商品が乗る木棚の板 | 露店の陳列棚。商品カードの下に敷いて「お店感」を出す |

---

## 5. SVG完全廃止に伴う置換マトリクス（Track A必須）

現行コードに残っているすべてのSVGを、以下の通り**手描きカラーWebP（またはWebGL描画）**へ置換する。

| 現行のSVG箇所 | 現行のアイコン/要素 | 置換後の格納先・方針 |
|---|---|---|
| `js/ui/HomeIcons.js`（線画SVG） | `shop`, `skin`, `friend`, `ranking`, `mission`, `solo`, `online`, `local`, `arrow`, `down`, `close`, `check`, `search`, `filter`, `bell` | `assets/v2/icons/ui-icons-atlas.webp` + `ui-icons-atlas.json`（または個別 `128×128` WebP）。既存の `assets/ui/home/*.png` と `navigation.webp` でキャラ絵品質を満たすものは統合し、線画SVGは100%撤去 |
| `js/ui/RankEmblem.js`（未認定のSVG盾） | ランク未確定（「？」の盾） | `assets/v2/icons/rank-unranked.webp`（`256×256`、既存 `rank-*.png` と同じ太輪郭＋丸みのある石盾） |
| `js/ui/KingdomArt.js`（SVGラッパー） | `<svg><clipPath><image>` でのアトラス切り抜き | HTML `<img>` または CSS `background-position` / PixiJS Spritesheet へ置換（`<svg>` 要素廃止） |
| `js/ui/art.js`（代替コードSVG） | 兵士・魔物・魔法のSVGフォールバック | 共通フォールバック画像 `assets/v2/cards/card-fallback.webp` 1枚に統合し、欠損カード自体は全数イラスト化 |
| `css/polish.css` / `css/home.css` | `data:image/svg+xml` による模様・装飾 | 廃止（WebPテクスチャまたはCSSグラデに置換） |
| `js/ui/SkillTreeView.js` | 200ノード＋286曲線の `<svg>` 盤面 | **PixiJS（WebGL 2D）** による羊皮紙マップ＋手描きインク調ライン描画へ移行（Track C） |

### 欠損・要修正カード絵リスト（Track A）
- 現行デッキ編集モーダルで空白表示になっていた **サイコロ系カード全種**（`coinDice`, `godDice`, `shieldDice`, `buffDice`, `healDice`, `manaDice`, `randomDice`, `attackDice` 等、`data/cards.json` を全件照合して未作成・未割当の絵を0件にする）。
- 新規カード絵は `assets/STYLE.md` の正方形512×512基準に従い、`assets/v2/cards/`（または規約通り `assets/cards/`）に配置し、`assets/CREDITS.md` に記録する。

---

## 6. Blender 3D × プリレンダ2D ハイブリッド仕様（Track B）

「外でスマホでも軽く・電池を食わず・でも本物のゲームに見える」ため、3Dを**リアルタイム用**と**プリレンダ2D用**に明確に分離する。

### A. リアルタイム3D（`.glb` → `assets/v2/models/`）
既存 `assets/models/` の資産をベースに、Blenderで以下を統一修正する：
1. **ライティング＆シェーダーのキャラ絵統一**
   - 現行3D浮島（`castle_field_diorama.glb`）の暗いリアル陰影を改め、**明るい暖色キーライト＋空色リムライト＋彩度高めのトゥーン/スタイライズド質感**へ調整。
   - 必要に応じ軽量なアウトライン（ダークブラウン `#4A2E1A`）または輪郭が立つベイク陰影を適用し、2Dちびキャラと並べても違和感ゼロにする。
2. **スマホ外遊び向けの軽量化バジェット（厳守）**
   - すべての `.glb` は **Draco圧縮（またはメッシュ最適化）＋ テクスチャ WebP / 512〜1024px 上限** とする。
   - 容量目安：
     - ホーム浮島ジオラマ：`≤ 2.5 MB`（ポリゴン数目安 `≤ 40k tris`）
     - 戦場フィールド（3レーンの土道・石畳・城門を明確化）：各 `≤ 1.2 MB`
     - 城モデル：各 `≤ 400 KB`
     - 兵士／魔物ユニット：各 `≤ 250 KB`
     - ガチャ3D宝箱（開閉アニメ付き）：`≤ 500 KB`
3. **カメラプリセット定義（`assets/v2/models/diorama-cameras.json`）**
   - ホーム浮島ジオラマに以下のカメラ位置・注視点（JSON座標）を定義し、タブ切替で滑らかにカメラ移動できるようにする：
     - `battle`: 城と戦場が映える正面俯瞰
     - `gacha`: 城内・宝物庫エリアへの寄り
     - `shop`: 城下町・市場エリアへの寄り
     - `deck`: 作戦室・旗の広場への寄り
4. **バトル盤面3D（`field-meadow.glb` 優先）の視認性改修**
   - 草原に溶けていた3レーンを、**はっきり識別できる3本の土道／石畳＋丸いステップ石（5マス）＋中央の魔物広場＋上下の城門**として立体造形する。

### B. Blender プリレンダリング2D素材（`assets/v2/renders/`）
スマホGPUを節約しつつ「本物の3D質感」を出すため、以下をBlenderで統一ライティング＋透過PNG→WebP書き出しする：
- **バトル／ガチャ演出小物**: コイン回転スプライトシート、6面ダイス回転連番（サイコロカード用）、宝箱の簡易2D連番（低電力モード用）。
- **ステージ背景（2D軽量モード兼用）**: 草原・溶岩・氷・古代遺跡・闇の森・砂漠の6種について、3レーンの道が明確に見える `9:16` 縦長背景（`≤ 150 KB` WebP）。
- **ホーム空＆雲レイヤー**: 昼／夕／夜の空背景＋パララックス用の透過雲パーツ（WebP）。

---

## 7. アセット検証チェックリスト（Track A / B 完了条件）
- [ ] `assets/v2/` 内に `.svg` ファイルが **0件**。
- [ ] 禁止リストの旧ボタン素材を参照していない。
- [ ] 新ボタン全5種を実際の文字（「出陣」「10連」「ターン終了」「キャンセル」「ショップ」）と重ねて、コントラスト比 **4.5:1 以上** を満たす。
- [ ] すべての新アイコンが `24px` 縮小表示でもシルエットだけで意味が読める。
- [ ] 全 `.glb` が容量バジェット内であり、Three.js（R3F）でマテリアル欠け・法線反転・接地ズレがない。
- [ ] 追加・更新素材の出どころを `assets/CREDITS.md` に記載済み。
