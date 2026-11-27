# PR #202の既存ガチャ上での確認

基準: PR #202 `ba3b524d84bd30e88142eb5a60764dfd88f9567c`。
新しいガチャ画面は作らず、既存の主ナビ→ガチャタブ→抽選後のネイティブdialogで撮影。通貨はテスト専用のメモリDBにだけ投入。実抽選の結果のため、PC/スマホの景品は異なる。

| 状態 | PC 1440×900 | タッチスマホ 390×844 |
| --- | --- | --- |
| 既存ガチャトップ（#202と同一） | [PC](pc-top.png) | [スマホ](mobile-top.png) |
| 既存開封dialogの宝箱 | [PC](pc-chest.png) | [スマホ](mobile-chest.png) |
| 同じdialog内の3D観賞 | [PC](pc-inspect.png) | [スマホ](mobile-inspect.png) |
| カード裏面 | [PC](pc-back.png) | [スマホ](mobile-back.png) |
| 既存の2D 10連結果一覧 | [PC](pc-ten-results.png) | [スマホ](mobile-ten-results.png) |

[操作検証](report.json) / [#202既存配置14ケース](player-layout.log) / [#202既存導線17ケース](navigation.log) / [変更・素材・制限](../../../docs/gacha-presentation.md)

`node --test`は1,043件成功。ブラウザ確認はChromium、実機スマホやWebKitの検証ではない。
