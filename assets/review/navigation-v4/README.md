# PR #202 第4版：画面構成と操作導線

[遷移図・重複監査・実装内容・確認手順・限界](../../../docs/navigation-redesign.md)

王国の素材を維持し、ガチャ/ショップ/装備を独立させ、設定とプロフィールを直接操作するページに変更。CPU/同じ端末はホームで設定して直接開始。スキルはクラシックの任意編集。

## 主な画面

| 画面 | PC | スマホ |
|---|---|---|
| バトル・ホーム | [画像](pc-home.png) | [画像](mobile-home.png) |
| ホーム内の対戦設定 | [画像](pc-home-options.png) | [画像](mobile-home-options.png) |
| デッキ | [画像](pc-deck.png) | [画像](mobile-deck.png) |
| ガチャ | [画像](pc-gacha.png) | [画像](mobile-gacha.png) |
| ショップ | [画像](pc-shop.png) | [画像](mobile-shop.png) |
| スキン装備 | [画像](pc-skin.png) | [画像](mobile-skin.png) |
| プロフィール | [画像](pc-profile.png) | [画像](mobile-profile.png) |
| アカウント管理 | [画像](pc-account.png) | [画像](mobile-account.png) |
| 設定 | [画像](pc-settings.png) | [画像](mobile-settings.png) |
| メニュー | [画像](pc-menu.png) | [画像](mobile-menu.png) |
| 合言葉をホームで入力 | [画像](pc-online-home.png) | [画像](mobile-online-home.png) |
| 既存のオンライン待機室 | [画像](pc-room.png) | [画像](mobile-room.png) |

## 維持した補助画面

| 画面 | PC | スマホ |
|---|---|---|
| ランク | [画像](pc-rank.png) | [画像](mobile-rank.png) |
| ランク報酬 | [画像](pc-rank-rewards.png) | [画像](mobile-rank-rewards.png) |
| ランキング | [画像](pc-ranking.png) | [画像](mobile-ranking.png) |
| フレンド | [画像](pc-friend.png) | [画像](mobile-friend.png) |
| ミッション | [画像](pc-mission.png) | [画像](mobile-mission.png) |
| ヘルプ | [画像](pc-help.png) | [画像](mobile-help.png) |
| 編成ダイアログ | [画像](pc-deck-editor.png) | [画像](mobile-deck-editor.png) |
| 図鑑 | [画像](pc-catalog.png) | [画像](mobile-catalog.png) |

## モード別のホーム

| モード | PC CPU / 同じ端末 | スマホ CPU / 同じ端末 |
|---|---|---|
| 通常 | [CPU](pc-kingdom-solo-home.png) / [同じ端末](pc-kingdom-local-home.png) | [CPU](mobile-kingdom-solo-home.png) / [同じ端末](mobile-kingdom-local-home.png) |
| 4陣営 | [CPU](pc-factions-solo-home.png) / [同じ端末](pc-factions-local-home.png) | [CPU](mobile-factions-solo-home.png) / [同じ端末](mobile-factions-local-home.png) |
| クラシック | [CPU](pc-classic-solo-home.png) / [同じ端末](pc-classic-local-home.png) | [CPU](mobile-classic-solo-home.png) / [同じ端末](mobile-classic-local-home.png) |

[見本/保存枠を一か所で選択](mobile-deck-choices.png) / [小型320px](small-home.png) / [タブレット](tablet-home.png) / [横向き・開始位置までスクロール](landscape-home.png) / [オフラインのローカル名](offline-profile.png)

## 検証

- [全導線17ケース](report.json) / [実行ログ](navigation-run.txt)。PC/スマホの実APIによる抽選・購入・装備・名前変更・設定保存・オンライン入室と、3モード×2形式の直接開始。
- [4幅の配置・44px・キーボード・実デッキ一致](home-lobby.json) / [ログ](home-lobby-run.txt)。無効デッキのコピー/削除も維持。
- [実タップ・接続失敗から再試行・共通/個別山札・ローカル名](edgecases.json) / [ログ](edgecases-run.txt)。
- [既存アカウントの通し検証](account-run.txt)。登録/ログイン/同期等を検証用DBで実行。
- [オフライン設定・任意スキル・モード切替・直接開始](offline.json) / [画面](offline-home.png) / [ログ](offline-run.txt)。原画/レビュー画像はキャッシュしない。
- [通常3D・ホームからの自然決着](natural-3d/report.json) / [兵士配置](natural-3d/deployed.png) / [勝利](natural-3d/result.png) / [実行ログ](natural-3d-run.txt)。11手番、城の破壊で勝利、降参なし、結果と再戦まで成功。
- [補助画面16ケース](extras.json) / [ログ](extras-run.txt)。ランク報酬を開くと親画面が前面に残る不具合も修正。
- [既存Nodeテスト73件](unit-tests.txt)。別途、既存の画像/配線6件とモード読み込み/URL切替も成功。

ガチャ等の検証用コインは専用のメモリDBにだけ投入し、実際のHTTP APIを操作した。ルール/カード/スキルの値やGameの状態をテストから書き換えていない。通常3Dは演出短縮と「動きを減らす」を使用。多画面のレイアウト/アカウント検証は2Dホーム素材を使用する。

実機iOS/Android、WebKit、長時間GPU・電池、音や指の感触は未検証。[第3版の画面](../kingdom-fantasy-v3/README.md)も比較用に保持。
