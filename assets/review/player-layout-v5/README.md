# プレイヤー向け画面の仕上げ・第5版

基点 f09eae8。既存絵を使用し、ゲームの計算/価格/確率/効果は変更していない。Chromium、PC 1440×900 / スマホ 390×844（タッチエミュレーション）。実機iPhone/WebKitではない。

## 主な画面

| 画面 | PC | スマホ |
|---|---|---|
| 通常3Dホーム | [表示](pc-home-3d.png) | [表示](mobile-home-3d.png) |
| 軽量2Dホーム | [表示](pc-home.png) | [表示](mobile-home.png) |
| 難易度を変更するときだけ展開 | [表示](pc-difficulty.png) | [表示](mobile-difficulty.png) |
| 宝箱を主役にしたガチャ | [表示](pc-gacha.png) | [表示](mobile-gacha.png) |
| 抽選後の開封待ち | [表示](pc-chest.png) | [表示](mobile-chest.png) |
| 1回の獲得結果 | [表示](pc-reward.png) | [表示](mobile-reward.png) |
| 10連の獲得結果 | [表示](pc-ten-rewards.png) | [表示](mobile-ten-rewards.png) |
| 商品を探すショップ | [表示](pc-shop.png) | [表示](mobile-shop.png) |
| 名前で絞り込み | [表示](pc-shop-search.png) | [表示](mobile-shop-search.png) |
| ポイント交換 | [表示](pc-shop-exchange.png) | [表示](mobile-shop-exchange.png) |
| 現在の装備プレビュー | [表示](pc-skin.png) | [表示](mobile-skin.png) |
| メニュー | [表示](pc-menu.png) | [表示](mobile-menu.png) |
| 独立した設定 | [表示](pc-settings.png) | [表示](mobile-settings.png) |

通常3Dは実際にWebGLで表示。他の画面は軽量2Dホームを使用。商品検索/装備操作後は操作場所へスクロールした画面も含む。スキンは城/歩兵の装備を実APIで変更して撮影。テスト用メモリDBだけに通貨を投入した。

## 前版との比較

| 対象 | 前版 | 今回 |
|---|---|---|
| スマホの城・難易度 | [第4版](../navigation-v4/mobile-home.png) | [第5版](mobile-home.png) |
| PCホーム | [第4版](../navigation-v4/pc-home.png) | [第5版](pc-home.png) |
| ガチャ | [第4版](../navigation-v4/pc-gacha.png) | [宝箱を主役に](pc-gacha.png) |
| ショップ | [第4版](../navigation-v4/pc-shop.png) | [商品検索](pc-shop.png) |
| スキン | [第4版](../navigation-v4/pc-skin.png) | [装備プレビュー](pc-skin.png) |

## 3モードと画面サイズ

| サイズ | 通常 | 4陣営 | クラシック |
|---|---|---|---|
| 320×568 | [表示](small-kingdom-home.png) | [表示](small-factions-home.png) | [表示](small-classic-home.png) |
| 820×1180 | [表示](tablet-kingdom-home.png) | [表示](tablet-factions-home.png) | [表示](tablet-classic-home.png) |
| 844×390 | [表示](landscape-kingdom-home.png) | [表示](landscape-factions-home.png) | [表示](landscape-classic-home.png) |
| 1440×900 | [表示](pc-kingdom-home.png) | [表示](pc-factions-home.png) | [表示](pc-classic-home.png) |

見出しとモード選択の非重複、城領域210px以上、横はみ出しなし、開始操作へ到達できることを確認。低い横向きでは設定と開始へ縦スクロールする。

## 操作と回帰確認

- [関連既存Nodeテスト74件](node-tests.txt)：経済/スキン/ツリーUI/空/通常モードの周辺確認。
- [今回の操作・配置14ケース](player-layout.json)：検索、価格順、24件ずつの追加、実購入/交換、装備、現在値の復元、抽選の要求数/結果/Escape、3モードの配置。
- [通常3Dホーム](home-3d.json)：PC/スマホでWebGL有効、ページエラーなし。
- [従来導線17ケース](routes/report.json)：PC/スマホ×3モード×CPU/同じ端末の12経路、設定と実際のGameが一致、任意スキル編集/保存、オンライン入室等。
- [補助画面16ケース](routes/extras.json)：ランク/フレンドと戻り先、図鑑/ヘルプ/編成等。
- [実タッチなど6ケース](routes/edgecases.json)：入室再試行、山札/見本/保存枠、未編集クラシック、オフライン案内等。
- [対戦スモーク](smoke.json)：2D、51手番の自然決着と再戦、エラー/同期警告なし。[兵士配置](smoke-deployed.png)、[結果](smoke-result.png)。通常3Dの自然決着は[第4版の記録](../navigation-v4/README.md)を参照。
- [最終PWA](offline/report.json)：874件の新キャッシュ、配信WebP14枚/原画ゼロ、通信を切って設定/201ノード/4陣営で開始成功。[通信なしのホーム](offline/home.png)。

## その他の画面

PC: [deck](routes/pc-deck.png) / [deck-editor](routes/pc-deck-editor.png) / [catalog](routes/pc-catalog.png) / [settings](routes/pc-settings.png) / [profile](routes/pc-profile.png) / [account](routes/pc-account.png) / [menu](routes/pc-menu.png) / [online-home](routes/pc-online-home.png) / [room](routes/pc-room.png) / [rank](routes/pc-rank.png) / [rank-rewards](routes/pc-rank-rewards.png) / [ranking](routes/pc-ranking.png) / [friend](routes/pc-friend.png) / [mission](routes/pc-mission.png) / [help](routes/pc-help.png)

スマホ: [deck](routes/mobile-deck.png) / [deck-editor](routes/mobile-deck-editor.png) / [catalog](routes/mobile-catalog.png) / [settings](routes/mobile-settings.png) / [profile](routes/mobile-profile.png) / [account](routes/mobile-account.png) / [menu](routes/mobile-menu.png) / [online-home](routes/mobile-online-home.png) / [room](routes/mobile-room.png) / [rank](routes/mobile-rank.png) / [rank-rewards](routes/mobile-rank-rewards.png) / [ranking](routes/mobile-ranking.png) / [friend](routes/mobile-friend.png) / [mission](routes/mobile-mission.png) / [help](routes/mobile-help.png)

[変更内容・実行手順・未対応事項](../../../docs/player-layout-v5.md)
