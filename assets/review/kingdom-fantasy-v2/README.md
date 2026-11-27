# 王国ファンタジー 第2レビュー資料

[変更と検証・未対応事項](../../../docs/kingdom-fantasy-v2.md) / [制作した素材一覧](../../ui/kingdom-v2/README.md)

## 全画面（実際のUI操作から撮影）

| 画面 | PC 1440×900 | スマホ 390×844 |
|---|---|---|
| ホーム | [画像](pc-home.png) | [画像](mobile-home.png) |
| アカウントタブ | [画像](pc-account.png) | [画像](mobile-account.png) |
| デッキタブ | [画像](pc-deck.png) | [画像](mobile-deck.png) |
| ガチャタブ | [画像](pc-shop.png) | [画像](mobile-shop.png) |
| 設定タブ | [画像](pc-settings.png) | [画像](mobile-settings.png) |
| 対戦形式 | [画像](pc-mode-dialog.png) | [画像](mobile-mode-dialog.png) |
| CPU難易度 | [画像](pc-cpu-preparation.png) | [画像](mobile-cpu-preparation.png) |
| 対戦準備・任意設定 | [画像](pc-preparation-options.png) | [画像](mobile-preparation-options.png) |
| デッキ編成 | [画像](pc-deck-editor.png) | [画像](mobile-deck-editor.png) |
| 図鑑 | [画像](pc-catalog.png) | [画像](mobile-catalog.png) |
| アカウント画面 | [画像](pc-account-dialog.png) | [画像](mobile-account-dialog.png) |
| 設定画面 | [画像](pc-settings-dialog.png) | [画像](mobile-settings-dialog.png) |
| その他ダイアログ | [画像](pc-more-dialog.png) | [画像](mobile-more-dialog.png) |
| ガチャ選択 | [画像](pc-gacha-dialog.png) | [画像](mobile-gacha-dialog.png) |
| ヘルプ | [画像](pc-help-dialog.png) | [画像](mobile-help-dialog.png) |

## スキルツリー

| 状態 | PC | スマホ |
|---|---|---|
| 初期表示 | [画像](after-tree-pc.png) | [画像](after-tree-mobile.png) |
| 実ノードから取得した詳細 | [画像](after-detail-pc.png) | [画像](after-detail-mobile.png) |
| 第1段階との比較 | [前](../kingdom-fantasy/after-tree-pc.png) | [前](../kingdom-fantasy/after-tree-mobile.png) |

[タブレット](after-tree-tablet.png) / [小型スマホ](after-tree-small.png) / [横向き](after-tree-landscape.png) / [操作テストJSON](smoke.json)

## 通常3Dの対戦（軽量表示への切り替えなし）

| 状態 | PC | スマホ |
|---|---|---|
| ホーム3D | [画像](battle-1440/home.png) | [画像](battle-390/home.png) |
| 兵士配置・手番 | [画像](battle-1440/deployed.png) | [画像](battle-390/deployed.png) |
| メニュー | [画像](battle-1440/battle-menu.png) | [画像](battle-390/battle-menu.png) |
| 降参の二段階確認 | [画像](battle-1440/surrender-dialog.png) | [画像](battle-390/surrender-dialog.png) |
| 勝敗結果 | [画像](battle-1440/result.png) | [画像](battle-390/result.png) |
| 検証ログ | [JSON](battle-1440/report.json) | [JSON](battle-390/report.json) |

[通常アニメーションありのスマホ3D検証ログ](battle-390-motion/report.json) / [カード詳細](battle-390-motion/card-detail.png) / [再戦](battle-390-motion/rematch.png)

結果は実際の降参操作によるもの。自然決着までの長時間試合は未通過。WebGLコンテキスト、実UIでの配置・手番・CPU行動・確認・結果・再戦をテストする。

## 画像の対応・検証

- [200スキルの実際の絵とID](art-review-skills.png)
- [230カードの実際の画像対応](art-review-cards.png)
- [カード画像の対応漏れゼロ・一覧](../../ui/kingdom-v2/card-coverage.json)
- [制作PNG14枚の寸法・サイズ・SHA256](../../ui/kingdom-v2/image-inventory.json)
- [既存テスト37件](unit-tests.txt) / [追加画像テスト5件](art-tests.txt) / [全画面撮影ログ](screens.json)

画像はPlaywright/Chromiumで撮影。review/ はPWA配信キャッシュには入らない。アカウントは一時DBの検証ゲストで、外部ユーザーのデータを使っていない。
