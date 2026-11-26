# Castle Field QA — 自動対戦・品質管理基盤 v0.1

調査基準: `keisuke11163-afk/game` main `b97255f4ada5b616432980422ae5a62d7674bd5d`。

この追加ツールはゲーム本体を編集しない。ゲーム本体の `Game` と CPU 戦略を import し、Node.js の Worker Threads で対戦を実行する。テスト用の別の戦闘ルールは存在しない。スキル効果・バランス調整は自動適用しない。

**導入状態:** 対象リポジトリの上記コミットに接続済み。本体の戦闘ルール・カード・CPUは変更していない。実Gameと既存シミュレータの通常・クラシック・4陣営、両先攻、3シードで勝者・手番数・終了理由・イベント件数と再現性を比較する。検証コマンドと実測結果は [VALIDATION.md](VALIDATION.md) を参照。

## 1. 導入

Node.js 22.13 以上（推奨22 LTS以降）、Git。追加 npm パッケージ・有料APIなし。ZIPを展開し、`tools/castle-qa/` を既存リポジトリの同じ場所に配置する。リポジトリのルートで次を実行する。

```sh
node --test tools/castle-qa/core.test.mjs tools/castle-qa/integration.test.mjs
node --test
node tools/castle-qa/cli.mjs quick --games 20 --workers 2 --out qa-results/first
```

最初のコマンドの `real Game` テストが SKIP になっていないかを確認する。そこで既存シミュレータと新ドライバの結果（通常・クラシック・4陣営、各先攻・後攻、3シード）を比較する。失敗や異常があった場合は Stress に進まない。`qa-results/` は `.git/info/exclude` かローカルの ignore に追加推奨。ゲーム本体の既存テストや期待値は変更していない。

## 2. コマンド

すべてリポジトリのルートから実行。`--root /path/to/game` で別のチェックアウトも指定可能。試合数は偶数。実行ごとに独立した `--out` を指定する。

```sh
# Quick (既定20戦)
node tools/castle-qa/cli.mjs quick --games 100 --workers 4 --out qa-results/quick
# Standard (既定1000戦)
node tools/castle-qa/cli.mjs standard --config tools/castle-qa/examples/classic.json --out qa-results/classic
# Stress (既定10000戦、ここでは100000戦)
node tools/castle-qa/cli.mjs stress --games 100000 --workers 8 --seed 20261126 --timeout 10000 --out qa-results/stress
# 同条件で再開（ワーカー数のみ変更可）
node tools/castle-qa/cli.mjs stress --games 100000 --workers 4 --seed 20261126 --timeout 10000 --out qa-results/stress --resume
# 通常モードの回帰基準を保存
node tools/castle-qa/cli.mjs regression --games 1000 --seed 99 --out qa-results/before
# 変更後のコミットで同じ条件を実行し、基準と比較
node tools/castle-qa/cli.mjs regression --games 1000 --seed 99 --out qa-results/after --baseline qa-results/before
# 異常試合を再現（例のファイル名とIDは実際のレポートの値に置換）
node tools/castle-qa/cli.mjs replay --file qa-results/stress/batches/0000000064.json --node 70
# CPU戦略の相性表
node tools/castle-qa/cli.mjs matrix --config tools/castle-qa/examples/matrix.json --out qa-results/matrix
# 陣営デッキの相性表
node tools/castle-qa/cli.mjs matrix --config tools/castle-qa/examples/factions.json --out qa-results/factions
```

オプション: `--mode classic|kingdom|factions`、`--a` / `--b`（単純戦略指定）、`--seed`、`--games`、`--workers`（1〜128）、`--max-turns`（通算手番数）、`--max-events`（1手番当たりの発行イベント数）、`--timeout`（1試合の壁時計ミリ秒）。`--allow-dirty` は試行用のみ。dirty の結果には明示的に印を付け、回帰比較・厳密な Replay・再開は拒否する。本体と `tools/castle-qa/` の未コミット変更を検出する。Git の監視対象外にある依存ファイルの変更は検知できないため、正式測定時は全ソースとツールをコミットすること。`--resume` は同一条件、同一コミットで使用。Ctrl+C 1回で現在バッチの終了後に停止、2回で強制停止。クラッシュ時の古い `.lock` は他プロセスが存在しないことを確認してから手動削除する。

各バッチは原子的なファイル置換で保存され、再開時に保存済み連続IDから集計を復元する。保持する対戦結果は1バッチ最大256件、ログの長さも制限。各workerは256MBのold-generation制限（プロセス全メモリ上限ではない）。無応答ワーカーは親がterminateして再生成する。壁時計制限の異常はPC負荷でも発生するため、再実行して区別する。速度・長時間メモリ安定性は実ゲームで別途測る必要がある。

## 3. 出力

- `summary.json`: 集計、95%区間、測定条件、コミット、計測項目、異常サマリ。
- `summary.csv`: 対戦・ビルド評価の主要指標。
- `report.html`: オフラインで開けるダッシュボード。検索・ソート・異常フィルター・対戦詳細・ターン分布・matrix相性表。実行中は再読み込みで更新。実行設定のWeb変更機能なし。
- `report.md`: AIに渡せる短い集計。
- `batches/*.json`: 各試合の結果・イベントダイジェスト・状態ダイジェスト・異常時詳細。異常のファイル名とIDは `summary.json` に最新20件掲載、全件はバッチから確認可能。
- `config.json`: 再開用条件のフィンガープリント。

試合上限・イベント上限・例外・NaNなどは異常であり、ゲーム内の引き分けとしてカウントしない。ゲーム内の `gameOver` かつ `winner: null` のみ引き分け。現行エンジンは上限周回で勝者を選ぶ仕様。`p1`（A）の勝率を表示し、`firstPlayer` を同じシードで `p1/p2` と切り替えて先後を均等にする。席そのものは固定で、初期手札補正・先後による乱数消費は本番の仕様どおり。乱数の対応は「同じ初期シード」であり、ゲーム進行が変わると各イベントの乱数消費は一致しない。

勝率は有効試合を分母とし、引き分けは非勝利。先後ペア単位の平均と正規近似区間、保守的Hoeffding区間（独立なシードペアという前提）、単純Wilson区間（ペア依存を無視した参考値）を別々に出す。ペアの片方が異常ならペア統計から除外する。異常の偏りで勝率が歪むため、異常を伴う候補は探索評価から除外する。多数の候補を選択した時の選択バイアスは、別シード・別対戦相手の holdout で確認する。勝率の絶対的な最強判定・人間相手の勝率は保証しない。

計測: 城・兵士の被ダメージはイベント値から盾や城壁の吸収分を除いた値（オーバーキルを含む場合あり）。回復はイベントの実回復値。MP・コインは増減イベントの正負を別計数（初期値は含まない）。召喚、撃破された兵士、蘇生（`revived`）、カード使用、属性反応、毒・やけどの一部をイベントで集計する。全攻撃元への正確な与ダメージ帰属は現在のイベント情報だけでは不可能なので、帰属できた分だけ別項目にする。未計測は0として扱わない。

## 4. CPU・デッキ

`js/game/strategies.js` の `STRATEGIES` を直接利用する。調査時点の戦略: `smart`, `random`, `aggro`, `defensive`, `rush`, `guard`, `pass`。`smart` はMP回復・属性反応・兵士・防御等を考慮する既存CPU。会心・魔法やまびこ等を意図的に活用する新CPUは未実装。`pass` 同士などは決着しない可能性があるので注意。

通常・クラシックは現在 `deckMode: shared`、プレイヤー別デッキを指定できない。個別デッキを勝手に有効化しない。`factions` は `own` なので `deck` に陣営IDを渡せる。将来 `cost` のモードでは `deck` の値にカード種類→枚数の辞書を指定できる（本体の検証に従う）。`castle` は双方のIDを指定できる。既存データのID以外はエンジンが拒否する。

## 5. スキルツリーの接続（未接続）

調査対象 main にスキルツリーの取得ルール・戦闘適用インターフェースは確認できなかった。未実装効果をシミュレーション内で捏造しないため、空ビルド以外を拒否する。将来、ゲーム側が実装した取得・適用APIへつなぐ adapter モジュールを用意する。

adapter は以下の export を持つ（本番のルールに委譲すること。ここで独自ルールを定義しない）。

| export | 契約 |
|---|---|
| `nodes` | `[{id: string, group: string}, ...]`。本番のツリーデータから取得 |
| `canAcquire(picked, id, budget)` | 本番と同じ取得判定（ポイント・隣接・奥義等） |
| `validate(picked, budget)` | 任意。最終ビルドの全体検証 |
| `cost(picked)` | Ablateで必須。本番の実支払ポイント |
| `apply(gameOptions, builds, budget)` | 本番のGame初期化オプションに2人分のビルドを渡す。未取得でも同じ実ルールで動くこと |
| `observe(type, payload)` | 任意。実イベントを加算可能な数値辞書へ変換（例: `p1.skill.echo`）。既知の未発動と未計測の区別はadapterで定義 |
| `verify(game)` | 任意。本番ルールのSP上限・スキル状態などを検査。異常は例外で通知 |

`build` は取得順序を保ったノードID配列。`generate` は本番判定が許可する候補のみ順に取る。`--groups` で単一/混合系統、`--include`/`--exclude` で取得条件を指定。指定系統からルートに到達できないときはエラー（合法化のためのルート系統も指定する）。必須ノード生成は有限回のランダム試行であり、解がない証明ではない。空ビルドは `[]`。おすすめビルドはゲームが公開した合法な取得順序をconfigに記入する。

```sh
# adapter実装後のみ実行可能（ファイル名は例）
node tools/castle-qa/cli.mjs generate --adapter tools/castle-qa/production-skills.mjs --budget 40 --seed 1 --groups magic,luck --include echo
node tools/castle-qa/cli.mjs search --config my-search.json --population 24 --generations 10 --holdout 1000 --out qa-results/search
node tools/castle-qa/cli.mjs ablate --config my-ablate.json --node echo --out qa-results/echo
```

Search config は `skillAdapter`, `budget`, `sides[0]`（候補のデッキ、CPUなど）、`opponents`（2件以上）、`holdoutOpponents`（学習と異なる1件以上）、`games`（各相手あたり、偶数）を設定する。生成→既存戦闘で評価→上位1/4を選ぶ→親のノード集合の一部を優先候補として交叉・突然変異→合法な順序で再取得。各世代の候補・得点・最終上位3候補のholdoutを保存。同一評価条件で再計算を避ける。探索全体の再開・高度な局所探索・全世代の最良候補のアーカイブ・自動シナジー推定は未対応。

Ablate config は A の `build` に対象を含め、`replacementBuild` に対象なし・同じコストの合法ビルドを指定。相手、シード、デッキ、CPUを固定し、ペア内の勝率差を比較する。他ノードも変わるので、1ノードの純粋因果効果と断定しない。複数の合法な代替・複数の相手で繰り返す。スキルごとの取得率ランキング、自動的な必須スキル判定、相乗効果ランキングは今後の追加。

## 6. 異常検出と回帰

イベントディスパッチをテスト時だけ監視し、イベントの順番、アクションID、同期dispatch深度を記録。本物の発動因果鎖（skill id, parent event id）は将来の本番イベントAPIで公開すること。現在の同期dispatch深度はスキルの連鎖深度と同じではない。非yieldingループは親workerが打ち切る。正常なゲーム状態チェックはアクション境界で実施。異常時はシード・対戦条件・コミット、直近120アクション・80イベント、可能な範囲の状態（公開・個別視点・山札）を保存する。強制停止の場合は最後に受信したサンプルトレースのみで、完全な状態は取得できない。再現コマンドは同じコミットで実行する。完全な行動履歴や因果グラフは未実装。

Regression は通常モードを同じ設定で実行して、イベントの順序付きダイジェスト、最終状態ダイジェスト、集計等の一致を比較する。回帰の検出は差の存在であり、差がバグか仕様変更かは開発者が判断する。通常モードのテストではスキルadapterのapplyを呼ばない。カードデータ全体の差分と個別のダメージ式の差分検査は既存 `node --test` に委ね、今後専用スナップショットを追加する。

## 7. 実装・検証一覧

| 項目 | 状態 |
|---|---|
| 実ゲーム利用ドライバ、CPU再利用 | 実ゲームで検証済み |
| Worker並列、シード、先後、上限、再開 | 実ゲーム・フィクスチャで検証済み |
| 正規試合、異常、95%区間、レポート | コード実装 / 集計テスト済み |
| ローカルHTML検索・ソート・相性ヒートマップ | Chromiumで検証（VALIDATION.md参照） |
| 既存モード比較、異常Replay | 実ゲームの回帰比較・フィクスチャで検証 |
| 合法生成、遺伝的探索、等コストAblate | コード実装 / 本番スキルadapter未接続。生成の単体検証のみ |
| SP・会心・再発動・技能別発動など | 未計測、adapterで拡張可能 |
| 全攻撃帰属、個別因果連鎖、全スキル相乗効果 | 未実装 |
| スキル専用の追加CPU戦略 | 未実装 |
| 100000戦実測、メモリ使用量の経時実測 | 未実行 |
| 既存ゲームの全テストと実戦互換性テスト | 実行済み（VALIDATION.md参照） |

## 8. 調査メモ

- `js/game/Game.js`: DOM非依存の戦闘、ターン、イベント、勝敗。`rng` 注入、`setup.firstPlayer`、カード使用、リアクション防御、蘇生、属性反応等。
- `js/game/strategies.js`: 既存CPU。ゲーム・AIの乱数は分離可能。
- `tests/helpers.js`: `buildData`, `loadOptionalData`, `seededRng` (mulberry32)。モード別の読み込みを本ツールでも再利用。
- `tests/sim/sim.js`: 既存 `runMatch` は単発・`runMany` は結果配列を保持する方式。新ドライバは同じ戦闘とAIを利用し、対戦駆動部分だけに監視を追加。
- `data/modes.json`: 通常 `kingdom`、クラシック `classic`、4陣営 `factions`。クラシックはレアリティなし、属性・反応データあり、手札上限6・ドロー2・MP全カード・崩壊の刻。通常は手札上限8、ドロー補充、周回上限60等。
- `tests/sim.test.js`, `tests/classic-*.test.js`: 既存の決着、乱数再現、カード、モード差分、属性、蘇生などを検証。

コード参照: https://github.com/keisuke11163-afk/game/tree/b97255f4ada5b616432980422ae5a62d7674bd5d
