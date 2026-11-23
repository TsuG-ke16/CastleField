# ホーム・共通UIのデザイン更新

既存のカードイラストを活かし、アイボリーの面・濃紺のナビ・金色の主要操作で画面を統一。ホームは対戦モード、使用デッキ、開始ボタンをまとめ、図鑑への入口も追加した。

PCでは左ナビと横並びの対戦準備、スマホでは下部ナビと縦並びに切り替える。タブレット・横画面・高さの低い端末にも対応。ナビの向きに合わせて矢印キーを切り替え、タブとパネルをARIAで関連付けた。

デッキ、アカウント、ガチャ、設定に加え、図鑑、デッキ編集、対戦中のメニュー・HUD・操作パネルも同じ配色へ変更。カード、陣営枠、3Dモデル、ゲームルールは既存のものを使う。

## 画面

| 対象 | 変更前 | 変更後 |
|---|---|---|
| スマホのホーム | [画像](before-home-390.webp) | [画像](after-home-390.webp) |
| PCのホーム | [画像](before-home-1440.webp) | [画像](after-home-1440.webp) |
| デッキ | [画像](before-deck-390.webp) | [画像](after-deck-390.webp) |
| アカウント | [画像](before-account-390.webp) | [画像](after-account-390.webp) |
| ガチャ | [画像](before-shop-390.webp) | [画像](after-shop-390.webp) |
| 設定 | [画像](before-settings-390.webp) | [画像](after-settings-390.webp) |
| 図鑑 | [画像](before-catalog-390.webp) | [画像](after-catalog-390.webp) |

[320px幅](after-home-320.webp)・[タブレット](after-home-768.webp)・[横画面](after-home-landscape.webp)・[デッキ編集](after-editor-390.webp)・[設定ダイアログ](after-settings-dialog-390.webp)・[3D対戦](after-battle-3d-390.webp)・[対戦中メニュー](after-menu-3d-390.webp)

## 新規画像

OpenAI画像生成による城の中庭2点と遊び方アイコン1点。実行用PNGは合計274,873バイト（約268KiB）、すべて1枚300KB以下。横長版を別に用意し、スマホでも城と旗が収まる構図にした。

生成原稿とサイズ・容量・実行用画像の対応は [assets.json](assets.json)、出典は [CREDITS](../../CREDITS.md) に記載。UIの面・ボタン・枠はCSSで描き、追加の枠テクスチャは不要にした。

## 検証

- `node ui-tests/interface.js`：320×568、360×640、390×844、768×1024、844×390、1440×1000で、横のはみ出し・開始ボタンとナビの重なり・矢印キー操作・5タブ・図鑑検索・編集・設定・遊び方を確認。[結果](layout-check.json)
- `UI_TEST_FIELD3D=2d node ui-tests/smoke.js`：兵士を出す→51手番で決着→結果→再戦。使用カード41枚、ページ・コンソールエラーと同期警告なし。[結果](smoke-check.json)
- `UI_TEST_FIELD3D=2d node ui-tests/deck-editor.js`：390×844と360×640で名前変更、保存、フィルター、拡大、ローカル設定、オンライン選択を確認。
- 3Dを有効にした別の確認で城2つのモデル読み込み、メニュー表示、ページエラーなしを確認。[結果](3d-check.json)
- 構文確認、`git diff --check`、`node js/ui/build-precache.js`。

Playwright/Chromiumを使用。通し試合はGPUのない検証環境で2D表示を指定した。3Dの記録はソフトウェア描画による表示確認で、実機の性能測定ではない。実行時は `UI_TEST_URL` と `UI_TEST_CHROMIUM` を環境に合わせて指定する。

土台のPR #188にあった城の初期化エラー（存在しない `sc` を未使用の `baseScale` へ代入）も修正。3Dの寸法やカメラ設定は変更していない。
