# キャッスルフィールド

手札から兵士・武器・魔法のカードを出して相手の城に送り込み、先に城を落とした人が勝つ、城攻めの対戦カードゲームです（ゴッドフィールドを参考にしています）。途中で中央に魔物が現れ、とどめを刺した人はごほうびのカードをもらえます。

## 遊ぶ

```sh
python3 -m http.server          # → http://localhost:8000（ひとりで遊ぶ・同じ端末で遊ぶ）
node server/server.js           # → http://localhost:8787（オンライン対戦。画面も同じサーバーが配る）
```

- タイトルの「ひとりで遊ぶ」で CPU と対戦（`?local=1&cpu=hard` ですぐ始まる）
- オンラインは同じ合言葉を入れた人が同じ部屋に入る（最大8人。CPU も追加できる）
- デバッグ：URL に `?debug=1`（城HP・手札・山札を変えられる）
- 盤面の地形は three.js（r170・MIT ライセンス）で立体に描く。`js/ui/vendor/` に同梱（ライセンスは `three.LICENSE.txt`）。URL に `?flat=1` で今までの 2D の盤面
- 外部パッケージなし。Node.js 22.7 以上が必要（アカウント・保存機能は `node:sqlite` を使うため 22.13 以上。設定は `docs/accounts.md`）

## 確かめる

```sh
node --test                     # ロジックの自動テスト（アカウント・認証のテストを含む）
node ui-tests/account.js        # アカウント画面のテスト（Playwright が必要）
node ui-tests/smoke.js          # 画面のスモークテスト（Playwright が必要）
node tests/sim/run.js           # バランスのシミュレーション
node js/ui/build-precache.js    # 配るファイルを変えたとき（オフライン用の一覧を作り直す）
```

## 読む順番

| ファイル | 内容 |
|---|---|
| `CLAUDE.md` | 仕様の正。ルール、カード、ロジックと画面の約束、チーム開発のルール |
| `assets/STYLE.md` | 絵柄の決まりと、画像生成AIに使う共通の指示文 |
| `assets/CREDITS.md` | 素材の出どころとライセンス |
| `docs/accounts.md` | アカウント・データベース・認証の仕様と設定（環境変数・API・バックアップ） |
| `docs/` | 設計メモ（`archive/` は終わった依頼） |

## 作り方

2人で開発しています。ロジック（`js/game/`・`data/`・`tests/`・`server/`）と画面（`index.html`・`css/`・`js/ui/`・`js/main.js`・`assets/`）で担当を分け、`main` へはPRと相手の承認で入れます。詳しくは `CLAUDE.md` の「チーム開発のルール」。
