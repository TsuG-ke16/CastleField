# 第3版：仕上げ・最適化・検証

[変更内容・性能比較・未対応事項](../../../docs/kingdom-fantasy-v3.md)

- [PCツリー](after-tree-pc.png) / [スマホ](after-tree-mobile.png) / [横向き](after-tree-landscape.png)
- [PC詳細と接続先](after-detail-pc.png) / [スマホ詳細](after-detail-mobile.png)
- [第2版の配置](../kingdom-fantasy-v2/after-tree-pc.png)
- [200ノード実クリック・286辺・5サイズ検証](smoke.json)
- [PNG→WebP サイズ・透過・品質検証](optimization.json)
- [通信量・パン・フレーム比較](performance.json)
- [オフライン実行ログ](offline.json) / [オフライン画面](offline.png)
- [自然決着3Dログ](natural-3d/report.json) / [兵士配置](natural-3d/deployed.png) / [自然決着の結果](natural-3d/result.png)
- [カードの輪郭・顔・色・頭身と圧縮比較](card-comparison.png)
- [WebKit起動試行と不足ライブラリ](webkit.json)
- [既存テスト](unit-tests.txt) / [画像・配線テスト](art-tests.txt)

原画14PNGはsources/に保存。ゲーム配信はassets/ui/kingdom-v2/*.webp、原画はPWAキャッシュから除外。

## 全画面の再確認

| 画面 | PC | スマホ |
|---|---|---|
| home | [画像](screens/pc-home.png) | [画像](screens/mobile-home.png) |
| account | [画像](screens/pc-account.png) | [画像](screens/mobile-account.png) |
| deck | [画像](screens/pc-deck.png) | [画像](screens/mobile-deck.png) |
| shop | [画像](screens/pc-shop.png) | [画像](screens/mobile-shop.png) |
| settings | [画像](screens/pc-settings.png) | [画像](screens/mobile-settings.png) |
| mode-dialog | [画像](screens/pc-mode-dialog.png) | [画像](screens/mobile-mode-dialog.png) |
| cpu-preparation | [画像](screens/pc-cpu-preparation.png) | [画像](screens/mobile-cpu-preparation.png) |
| preparation-options | [画像](screens/pc-preparation-options.png) | [画像](screens/mobile-preparation-options.png) |
| deck-editor | [画像](screens/pc-deck-editor.png) | [画像](screens/mobile-deck-editor.png) |
| catalog | [画像](screens/pc-catalog.png) | [画像](screens/mobile-catalog.png) |
| account-dialog | [画像](screens/pc-account-dialog.png) | [画像](screens/mobile-account-dialog.png) |
| settings-dialog | [画像](screens/pc-settings-dialog.png) | [画像](screens/mobile-settings-dialog.png) |
| more-dialog | [画像](screens/pc-more-dialog.png) | [画像](screens/mobile-more-dialog.png) |
| gacha-dialog | [画像](screens/pc-gacha-dialog.png) | [画像](screens/mobile-gacha-dialog.png) |
| help-dialog | [画像](screens/pc-help-dialog.png) | [画像](screens/mobile-help-dialog.png) |

[撮影ログ](screens/screens.json)
