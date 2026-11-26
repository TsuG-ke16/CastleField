# Castle Field QA 導入検証（2026-11-26 UTC）

対象: `keisuke11163-afk/game` main `b97255f4ada5b616432980422ae5a62d7674bd5d`。
作業ブランチ: `feature/castle-field-qa`。Node.js v24.22.3、Chromium、環境提供のPlaywrightで検証。

## 変更と依存関係

- 添付v0.1を `tools/castle-qa/` に配置。`Game`、既存CPU、データローダーを直接再利用。
- QAコード自身の未コミット変更も検知し、誤ったコミット識別・再開を防ぐ。
- matrixに異常試合があれば終了コード1を返す。
- 実Game比較を4陣営まで拡張。19系統をデータで扱い、合法取得をアダプターに委譲する契約テストを追加。
- ゲーム本体（`js/`、`data/`、`server/`、既存 `tests/`）の変更なし。未実装スキル・新ルールは追加なし。
- 実行に追加npm依存なし。Node.js 22.13以上。ブラウザ検証だけ開発環境のPlaywright/Chromiumを使用。
- `/qa-results/` はgit管理から除外。測定ソースは先にコミットする。

## 実行コマンド

リポジトリルートで実行。出力先が既にある場合、新しいディレクトリを指定する。

```sh
node --test tools/castle-qa/core.test.mjs tools/castle-qa/integration.test.mjs
node --test
node tools/castle-qa/cli.mjs standard --config tools/castle-qa/examples/classic.json --out qa-results/classic
node tools/castle-qa/cli.mjs regression --games 100 --seed 99 --workers 2 --out qa-results/before
node tools/castle-qa/cli.mjs regression --games 100 --seed 99 --workers 1 --out qa-results/after --baseline qa-results/before
node tools/castle-qa/cli.mjs matrix --config tools/castle-qa/examples/matrix.json --games 20 --workers 2 --out qa-results/matrix
node tools/castle-qa/cli.mjs matrix --config tools/castle-qa/examples/factions.json --games 20 --workers 2 --out qa-results/factions
UI_TEST_CHROMIUM=/usr/bin/chromium node tools/castle-qa/dashboard-smoke.mjs
# HTTP表示（別ターミナル）
python3 -m http.server 3000 --bind 127.0.0.1 --directory qa-results
# http://localhost:3000/classic/report.html
QA_DASHBOARD_URL=http://127.0.0.1:3000 UI_TEST_CHROMIUM=/usr/bin/chromium node tools/castle-qa/dashboard-smoke.mjs
```

環境によってChromiumパスを調整、Playwright同梱ブラウザなら `UI_TEST_CHROMIUM` を省略できる。
本環境のサンドボックス内ではNode子プロセスがEPERMになるため、テスト・CLIは実行権限を拡張して実施した。ソフトウェアの依存不備ではない。

## 結果

| 検証 | 結果 |
|---|---|
| QA単体・統合テスト | 10成功、失敗0、SKIP 0 |
| 全テスト `node --test` | 768成功、失敗0、SKIP 0 |
| 実Game互換性 | 通常・クラシック・4陣営 × 両先攻 × 3シード、勝者・手番数・理由・イベント件数一致、各条件の再実行ハッシュ一致 |
| クラシック smart vs random | 1000戦、有効1000、異常0、A勝率75.7%、平均70.43手番 |
| 通常回帰基準 | 100戦、有効100、異常0、A勝率71%、平均39.57手番 |
| 通常回帰比較（worker 2→1） | 100戦、有効100、異常0、結果ハッシュ差分0/100 |
| クラシックCPU相性表 | 10組 × 20戦 = 200戦、異常0 |
| 4陣営相性表 | 10組 × 20戦 = 200戦、異常0 |
| ダッシュボード | 3レポート × 1280px/390px、HTTPと自己完結HTML直接読込の両方で全項目成功 |

合計1600戦、異常0。測定結果は `qa-results/`、スクリーンショット6枚は `qa-results/dashboard/`。
初回測定コミットは `65662f8`、回帰比較先は `0a783bc`（ブラウザ検証スクリプト追加のみ）。

ブラウザでは総対戦数、検索、異常フィルター、ソート反転、対戦選択に応じた計測値、ターン分布、4×4相性表、JavaScript例外なしを検証。管理Chromiumは `file://` を禁止しているため、実ファイルURLによる表示は未検証。直接HTML読込で外部リソース依存がないことと操作を検証し、HTTP配信でも確認した。スマートフォンでは表を横スクロールできる。

19系統テストはアダプター契約の検証用データであり、本番スキルの効果検証ではない。系統名・ノード・取得判定・適用は将来の本番アダプターから提供する。未接続の非空ビルドは引き続き拒否する。
100,000戦・長時間メモリ推移・未実装スキルの効果は検証対象外。勝率はこのCPUと条件の測定値。
