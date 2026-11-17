# 適応・スペシャル枠の画像比較と確認

2026-11-17。Playwright同梱Chromium、390×844。

採用：宝石B + 枠A。宝石Bは大きな面と控えめな印で56pxでも虹色のひし形を判別しやすい。枠Aは真珠色の装飾が既存のレア・エピック・レジェンドと調和し、金を主役にせず別枠の特別感がある。枠・丸・帯はレアと同じ配置で、❖は無地の丸に紫色で表示。

不採用：宝石Aは剣・炎・盾の印が強く、小さい表示で宝石の面が細かく見える。枠Bは読みやすいが、直線的な太い虹色の帯が既存の装飾枠と並べて目立ちすぎる。

| 案 | 原本（/workspace/generated_images/ 内） |
|---|---|
| 宝石A | exec-18dbaa6e-1d73-4d6c-a28b-536c79f2d687.png |
| 宝石B（採用） | exec-ee9c9f4c-6e29-4917-b0af-9d4bfda4bf6a.png |
| 枠A（採用） | exec-1d773854-13ba-471d-b7cd-94d7b59ff8d6.png |
| 枠B | exec-bb3172ef-1aa5-44fb-ae1a-abf69cd5f208.png |

共通指示文と依頼の内容を用い、絵柄見本を毎回添付。枠はレア・レジェンドも添付して窓・帯・丸の位置を指定。生成後の加工はPillowのリサイズ・パレット圧縮だけ。

- [4通りの実カード比較（90px・56px）](comparison.png)
- [コモン〜レジェンドとスペシャル](rarities.png)
- [手札](hand.png) / [タップ詳細](detail.png)
- [適応＋○○の合成一覧](fusion.png)
- [図鑑](guide.png) / [図鑑詳細](guide-detail.png)
- [通常の動き](motion.png)

`?debug=1&cpu=hard&seed=8` で起動し、案内を完了済みにして、公開デバッグAPI `debugSetHand(viewerId, ['adapt','infantry','heal','goldCoin','meteor','hero'])` と `refresh()` を使用。以降はタップ操作で撮影。手札の適応は横スクロールの右側。

動きを減らす設定と通常の動きで専用枠の色が変わらず、窓から絵がはみ出さず、名前と❖が読めることを確認。コンソール・ページのエラーは `report.json` に記録。画像読み込み失敗時のSVG代替も保持。
