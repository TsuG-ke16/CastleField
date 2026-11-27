# スキルの選択UI（feature/skill-choice-ui・base feature/online-skills 4106f4c）

X15（2枚から選ぶ）・L06（幸運の賽）・X35（遅延代償）の選択UI。ルールは Game 側だけ、画面は表示と受け渡しだけ。

## 実装状況
| ノード | 状況 | 内容 |
|---|---|---|
| X15 | 実装 | 設定「2枚からの選び方」：自動 MPコストの大きい方（既定）／**毎回選ぶ**／自動 1枚目／自動 2枚目。「毎回選ぶ」は発動したとき（自分のターン開始の通常ドロー・20%）に2枚を本人だけの選択待ちにして、メイン行動の始めにダイアログで選ぶ。「あとで選ぶ」で閉じてもパネルの「スキルを使う」から選べる。選ばずにほかの操作をすると既定（MPコストの大きい方）に決まる |
| L06 | 部分（事前指定のみ） | 設定「2つの出目からの選び方」（大きい方・小さい方・1回目・2回目）。カードごとのダイアログの既定もこの設定になる。**出目を見てから選ぶ2段階は不可**（下記） |
| X35 | 実装 | 設定「任意のHP支払を自動で延期する」（ON/OFF・既定 OFF）と、延期すると債務が残るあいだほかの任意HP支払が止まる説明。HPを払う選択（B01/B08 の置換・B03・X27）があるカードでは、カード使用前のダイアログでも「延期する」を聞く（既定は設定。false も送るので、ON のまま1枚だけ止められる） |

設定は端末（localStorage `cf-skill-prefs`）に覚え、次の試合の始め（自分がそのノードを取っているときだけ）に `setSkillPrefs` で送り直す。オンラインも同じ（`OnlineClient.setSkillPrefs` → サーバー → Game）。

## L06 の2段階が不可な理由
- Game の操作は1回の呼び出しで最後まで同期で解決する（playCard の途中で止めて人の入力を待つ仕組みがない）。出目を見せてから選ばせるには、サイコロの解決を「振る」「選ぶ」の2つの公開操作に分け、途中の状態（カードは出したが効果は未解決）を保存・同期・再接続・CPU に対応させる必要があり、「js/game は最小限」の範囲を超える
- そもそもクラシックの山札にサイコロのカードがない（handoff・skill200-wt1.md の記載どおり。data/cards.json のサイコロは通常モード用）ので、実戦では発動しない
- そのため事前指定（設定と、カードごとのダイアログ）だけを用意した

## 変更点となぜ
| ファイル | 内容 | なぜ |
|---|---|---|
| `js/game/skills/Runtime.js` | `SKILL_PREFS` に X15 `pick: "ask"`・L06 `diceChoice`。本人の選択待ち `state.choice`（getState は本人にだけ `skillState.choice`＝{ skillId, kind, options[{ index, cardId, type, mpCost }] }）。公開メソッドの前に残った選択待ちを既定で決める `resolveChoices`（選択の任意アクションだけは除く）。任意アクションの `hidden`（一覧に出さない）・`free`（回数・成功を数えない）・`choice` | X15 は通常ドロー（自分のターン開始）の中で起きるので、その場で人を待てない。保留にして任意アクションで選ぶと、既存の skillAction の経路（画面・サーバーの検証・CPU と同じ API）がそのまま使える。選ばずに進んでも山札の先頭が宙に浮かないよう、次の操作の前に決める |
| `js/game/skills/handlers/X_c1.js` | X15 の "ask"：2枚を山札から外して選択待ちに（発動・回数はこのとき数える）。任意アクション `X15pick { index }`、`resolveChoice`。選び方の計算を `x15Pick` にまとめた | 外しておくのは、選ぶ前の別のドロー（ターン開始の効果など）で引かれないように。選ばなかった方は山札の先頭へ戻す（仕様「元の位置へ戻す」） |
| `js/game/skills/handlers/L.js` | L06：`skillOptions.diceChoice` → 本人の設定 → 大きい方 | 事前指定を試合中ずっと使えるように |
| `js/ui/skillChoiceDialogs.js`（新規） | 設定の欄の HTML・入力から prefs を作る・端末への保存と読み出し・X15 のダイアログ | PR #202 とぶつからないよう、新しい画面は新規ファイルに寄せた |
| `js/ui/skillTreeModel.js` | `skillPrefRows`（取ったノードの設定の行・説明文）。`cardSkillQuestions` に `prefs`（L06 の既定・X35 の deferHp の質問） | DOM 非依存のロジックをテストできる場所に |
| `js/ui/SkillBattleView.js` | パネルに「スキルの設定」、変えたら `session.setSkillPrefs`、試合の始めに覚えた設定を送る、X15 の選択待ちでダイアログ（選ぶと `onRun('X15pick')`＝既存の skillAction の経路） | ローカル・オンラインで同じ呼び方 |
| `css/skilltree.css` | 設定の行・ダイアログの見た目（追記のみ） | |
| `js/ui/precache.js` | `node js/ui/build-precache.js` で作り直し | 新規ファイルをオフライン一覧に |
| `docs/skilltree-200-coverage.md` | `node tools/skilltree-coverage.mjs` で作り直し（X15 に任意アクション X15pick） | |
| `tests/skill-choice.test.js`（新規・7件） | X15 の選択待ち・自動決定・既定で作られないこと、L06 の設定、サーバーが新しい値を通すこと、設定の行・X35 のカードごとの質問、端末の保存 | |

サーバー（`server/rooms.js`）は変更なし：`cleanSkillPrefs` はもともと短い文字列・真偽値を通し、値の正しさは Game の `setPrefs`（SKILL_PREFS）が確かめる。X15pick は既存の `skillAction`（自分の番・`cleanActionArgs`）で届く。

## 確かめたこと
- `node --test`：1050件 pass / 0 fail（新規7件を含む）
- `tests/sim/run.js`（通常 20試合・`--mode factions` 20試合・`--mode classic` 10試合、seed 1、--json）：base（4106f4c）と出力が完全一致（cmp）。既定（"ask" を選ばない）では選択待ちを作らず、乱数の消費も変えていない
- Playwright（google-chrome・1280×800、`?mode=classic&debug=1&seed=3&cpu=normal`、B01/B02/X35 のビルド）：パネルの X35 のチェックを ON → Game の prefs が `autoDefer: true`、説明文が出る、端末に保存、読み直した次の試合で自動的に ON に戻る。ページエラーなし。スクリプトはリポジトリの外（一度だけの確認）

## 未確認・制限
- X15 のダイアログ・L06 の設定・カードごとの延期のチェックは実ブラウザで見ていない（ロジックはテスト済み）。オンラインの実ブラウザも未確認（サーバーの経路は既存の skillAction/setSkillPrefs のテストの範囲）
- X15 の選択待ちのあいだ、山札の枚数（自分にだけ見える deckCount）が2枚少なく見える
- `skillRt.serialize()` は選択待ちのカードを structuredClone するので、restore するとカードのクラスが失われる（Game 全体の保存・復元はもともと未対応）
- CPU は "ask" を使わない（既定の "cost" のまま）。CPU の席に "ask" を設定すると、次の操作で自動決定になるだけ
- 同じ端末の2人以上では、端末に覚えた設定は全員の席に（取っていれば）送られる
- 4人以上・チーム戦での X15 の選択待ちは試していない
