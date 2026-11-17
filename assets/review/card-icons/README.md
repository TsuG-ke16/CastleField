# カードの種類・レアリティアイコン

2026-11-17。Playwright同梱Chromium・390×844。

必須の適応・スペシャルと、任意の4種類・5レアリティをすべて生成。全11枚を128×128透過PNGとして導入。丸い台座は描かず、枠の無地の丸の中に置く。

原本：`/workspace/generated_images/exec-67e1373d-21c4-4973-858a-889c0c158b0b.png`。共通指示文と絵柄見本・既存ハート・炎を添付して生成。4列×3行の等間隔シートからPillowで切り出し、透明余白のトリミング・縦横比を保った縮小・約12%の透明余白配置・パレット圧縮のみ。描き足し・色替えなし。原本との対応は `assets/asset-manifest.json`。

| 原本の位置 | アイコン |
|---|---|
| 1行目左から | kind-wild / rarity-special / kind-soldier / kind-spell |
| 2行目左から | kind-weapon / kind-defense / rarity-common / rarity-uncommon |
| 3行目左から | rarity-rare / rarity-epic / rarity-legendary / 空欄 |

- [通常：13px・16px・48pxの一覧](normal.png)
- [ファイル欠落：SVG・文字への代替](missing.png)
- [通信切断：SVG・文字への代替](offline.png)
- [通常の手札](normal-hand.png) / [欠落時の手札](missing-hand.png) / [通信切断時の手札](offline-hand.png)
- [手札](../adapt-art/hand.png) / [タップ詳細](../adapt-art/detail.png) / [合成](../adapt-art/fusion.png) / [図鑑](../adapt-art/guide.png)
- [コモン〜レジェンド＋スペシャルの実カード比較](../adapt-art/rarities.png)

左上は兵士＝剣、魔法＝星の杖、武器＝ハンマー、防具＝丸い盾、適応＝虹色の宝石＋循環する矢印。右上は丸・ひし形・四角の星・六角の星・王冠・虹色の四角の星で判別する。

`kindIcon(def)` は effect=wild を優先。旧形式の文字列引数も維持し、既存テストは変更していない。各メダルに日本語の title・aria-label と role=img を付け、レアリティには元の記号もラベルに保持。

欠落はアイコンPNG全てに404を返す条件、通信切断はアイコンの通信エラーに加え、起動後のブラウザコンテキストをオフラインにする条件。各条件で33個（11種×3サイズ）の代替SVG・文字が見えること、実際の手札の各メダルに名前があり、アイコンがメダル内に収まることを検証。欠落時の404・通信切断のネットワークエラーは意図的なもので、ページのJavaScriptエラーは0。正常表示ではコンソールエラーも0。結果は `report.json`。
