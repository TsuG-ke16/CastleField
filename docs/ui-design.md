# キャッスルフィールドの UI デザイン

明るいファンタジーの絵を、こげ茶の輪郭と羊皮紙の面でまとめる。絵の作り方と素材の記録方法は [assets/STYLE.md](../assets/STYLE.md) と [assets/CREDITS.md](../assets/CREDITS.md) を参照する。

## 色・文字・余白

| 用途 | CSS 変数 | 値 |
|---|---|---|
| 本文・補足 | `--ink` / `--ink-muted` | `#3f2511` / `#6b4a2e` |
| 羊皮紙・一覧の内側 | `--parch` / `--surface-inset` | `#fff8e0` / `#fffdf4` |
| 枠・強調 | `--wood` / `--accent` | `#8f5a2a` / `#f6a52e` |
| ゲージの正常・危険 | `--status-ok` / `--status-danger` | `#57c75a` / `#e2574c` |
| エラーの文字 | `--ink-danger` | `#b0291f` |
| 本文・見出しの書体 | `--font` / `--head` | 丸ゴシック優先の端末フォント |
| 小さな部品の間隔・内側の余白・画面端 | `--space-1` / `--space-2` / `--space-3` | 4 / 8 / 12px |
| ゲージ・操作部品・パネルの角丸 | `--radius-meter` / `--radius-control` / `--radius-panel` | 4 / 8 / 12px |
| 浮くパネルの影 | `--shadow-panel` | 下へ 6px、ぼかし 18px |
| タップできる領域 | `--touch-target` | 新しい操作部品は縦横とも 44px 以上 |

色は [css/tokens.css](../css/tokens.css) で管理する。状態を伝える場合は数値、短い文、または記号を添える。キーボードのフォーカスには [css/accessibility.css](../css/accessibility.css) の表示を使う。新しい画面は 390×844 と 360×640 の縦画面で確認する。

## 共通部品

| 部品 | 使い方 |
|---|---|
| ボタン | 主要操作に `.plank-btn`、補助操作に `.small-btn`、アイコン操作に `.round-btn` をネイティブの `button` に付ける。アイコンだけのボタンには操作名を付ける |
| パネル | 重ねて開く画面は `.screen` 内の `.screen-box.parchment`、盤面内の操作は `.panel`。一覧の面には [css/components.css](../css/components.css) の `.inset-panel` を使う |
| バッジ | 盤面で手札枚数やコインなどを短く示すときは `.chip`。アイコンと数字だけで意味が伝わりにくい場合は、読み上げ用のラベルを付ける |
| ゲージ | トラックに `.meter`、塗りや遅れて追う影に `.meter-fill`。高さや塗り幅は用途に合わせ、ゲージに名前と現在値を付ける。既存例はデッキコストと兵士の HP |

## ホーム（js/ui/Home.js・css/home.css・css/home-tabs.css）

上から「プレイヤーの帯（木目）→ ページ → 画面下のタブ（木目）」。面は役割ごとに分ける：紙（ふつうの情報）、緑のフェルト（デッキ＝カードを置く卓）、夜空（ガチャ）。

| ページ | 主役 |
|---|---|
| バトル | 城の絵（太陽の光・ゆっくり寄る・光の筋）→ シーズンとランク → モード（絵つき3択）→ デッキ → 対戦開始（金〜オレンジ、太い輪郭、底面つき、押すと沈む） |
| デッキ | 使うデッキの名前・枚数・コスト・代表5枚（扇形。タップで拡大）・編成ボタン・デッキ枠の切りかえ、全カードの一覧 |
| アカウント | ランク・レベルと経験値・戦績の4マス・メニュー（説明つきの行） |
| ガチャ | 目玉の景品（data/shop.json の gacha 景品の絵）・所持コイン・「ガチャを引く」 |
| 設定 | 設定・遊び方の行と、絵つきの「遊び方のポイント」 |

- 選択中は緑（`--selected` / `--selected-hi`）＋印で示す。金色は「大事なボタン」とバトルのタブの台だけに使い、選択中の意味には使わない
- 共通の値は tokens.css の `--space-4/5`・`--radius-card/hero`・`--outline-w`・`--shadow-raised/soft`・`--text-xs〜xl`・`--motion-tap/page`
- ボタンは components.css の `.cf-btn`（`.cf-btn-primary` / `-secondary` / `-danger`、`.cf-btn-sm`、`:disabled`）。素材キット（assets/ui/natural/）の3分割画像を使うので、自動の割り当て（MaterialSkin）のボタンと同じ見た目になる
- 城の絵は1枚絵なので、旗・雲・木を動かすには、それぞれを透明PNGに分けた素材が要る（`assets/bg/home-castle-*.png`：空・雲2〜3枚・城と旗竿・旗（揺らす）・手前の木。768×512 の同じ位置合わせ）。素材ができるまでは、絵全体を変形させる動きは入れない

## 動き

| 用途 | 時間・イージング |
|---|---|
| ボタンを押す・離す | 50 / 220ms。離すときは `--ease-button-release` |
| フィルター・背景などの反応 | 180ms、`ease` |
| バッジの数字が変わる | 360ms、`--ease-badge` |
| パネルを開く | 260ms、`--ease-panel` |
| 画面の切り替え | 280ms、`--ease-enter`。内容は 50ms 遅れて 420ms、`--ease-panel` |
| HP の減少を追う影 | 250ms 待って 600ms で追いつく |

UI 部品の短い反応には CSS の `--motion-*` を使う。カードや戦闘の演出は [js/ui/config.js](../js/ui/config.js) の `UI_CONFIG.timing`（ms）と `UI_CONFIG.easing` を使い、`Animations.animate()` を通す。速度設定、タップによるスキップ、「動きを減らす」が反映される。演出は 1 回 2 秒以内を目安とし、動きを減らしても結果を読めるようにする。
