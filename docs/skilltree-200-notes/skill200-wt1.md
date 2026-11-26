# 段階C 担当C1（worktree /tmp/skill200-wt1・branch skillC1）

担当：会心 C04/C06/C07/C08、魔法 M01〜M08、属性 E02/E03/E05/E07/E08、幸運 L04〜L07、横断 X01/X02/X03/X12/X13/X14/X15/X16/X19（X11・X17 は基盤の確認）

## ノード別の状況
| ID | 状況 | 実装・判断 |
|---|---|---|
| C04 | 実装 | onAttackResolve：自分の直接会心で生存した敵兵士に api.bleed（出血はスキル専用の最小定義） |
| C06 | 実装 | 直接会心・対象生存で 20%（幸運）→ spawnExtra('extraAttack') → 元の基礎威力の50%（最小1）を spellHit（属性なし）で。追加攻撃は会心判定できるが direct でないので再誘発しない |
| C07 | 実装 | 直接会心で撃破 → SP+1（各自ターン1回） |
| C08 | 実装 | 会心で敵兵士を撃破 → state.critForcedNext = true（消費は Crit.js）。すでに立っていれば何もしない（回数も使わない） |
| C01/02/03/05 | 基盤 | Crit.js |
| Q05 | 担当外 | 集中の状態（state.critFocus）を立てる任意アクションは系統 Q（handlers/Q.js）。消費は Crit.js にある。C08 との連携は critForcedNext で済み |
| M01 | 実装 | 攻撃魔法の直接命中（origin hand・追加由来でない）で撃破 → MP+1 |
| M02 | 実装 | 手札の単体攻撃魔法（singleDamage・randomElementDamage）の命中後、20%（M08 で50%）で同じ対象へ元の基礎威力の50%。echo.js で原魔法ごとの合計上限（M08なし2・あり3）。一時コピーは X22 があるときだけ最大1回 |
| M03 | 実装 | 手札の単体攻撃魔法の直接命中後 25% で、対象に隣接する別の敵兵士（安定順の先頭）へ同じ量の固定ダメージ（origin chain） |
| M04 | 実装 | 攻撃魔法で撃破したとき余剰（ev.amount − 実損失、最大3）を隣接の敵兵士へ固定ダメージ（各自ターン1回） |
| M05 | 実装 | onCardPlayed（魔法・コピー以外）5% → 捨て札から回収（捨て札にない・手札満杯なら判定しない） |
| M06 | 実装 | 手札の攻撃魔法で撃破 → 20% で1枚ドロー |
| M07 | 実装（実データでは実質発動しない） | 自ターンに手札の魔法2枚目で準備 → 次の手札の魔法の MP-1（最低1、減らせない魔法では準備を残す）。**クラシックの魔法はメインの枠で1ターン1枚**（checkPlayable）なので、通常のプレイでは2枚目が出せない。テストは playedThisTurn を戻して確認 |
| M08 | 実装 | M02 由来のやまびこの命中から echo>echo の例外で次のやまびこ（独立判定・上限3）。率 50% は M02 側で読む |
| E02 | 実装 | 自分が敵兵士に付けた付着の turns +1（onElementAttached）。既存の付着モデルに「消費回数」はないので持続だけ |
| E03 | 実装 | 手札由来（origin hand）の付着で 20% → 別の属性（elements.json の全属性からランダム。幸運の対象外）を elementHit で順に付ける（反応することもある） |
| E05 | 実装 | 自分の反応のあと、隣接の敵兵士（安定順の先頭）に「起こした側の属性」（elements のうち consumed に入っていないもの）を elementHit で（反応を1回誘発できる） |
| E07 | 実装 | 自分の反応のあと、消えた付着を1つ（付着の既定 turns で）戻す。elementHit を使わない＝即反応しない。対象が倒れたら不発で回数を使わない（＝その区間で最初に成立した反応） |
| E08 | 実装 | 自分の反応のあと、別の敵兵士1体（安定順からランダム）にランダムな属性を elementHit で |
| E01/04/06 | static | 段階A のまま |
| L04 | 実装 | onTurnStart 10% → 追加ドロー1（手札満杯なら判定しない） |
| L05 | 実装 | onCardPlayed で mpPaid > 0 のとき 5% → 払った MP を戻す |
| L06 | 実装（実データでは休眠） | Game.rollDice（基本のサイコロ）・rollGodDice に Runtime.diceValue のフック → mods "diceValue"。手札から使ったそのカードだけ、出目を2回生成して skillOptions.diceChoice（first/second/high/low）で選ぶ。指定なしは大きい方（CPU/headless の決定論的フォールバック）。**クラシックのカードにサイコロがない**ので実戦では発動しない。ランダムサイコロは対象外。2つの出目を見てから選ぶ2段階の UI は段階D の課題（今は事前の指定） |
| L07 | 実装 | mods luckFinalFail：自ターンの最終失敗（Luck.js の luckFailsThisTurn）が3に達したら MP+1 |
| L01/02/03/08 | 基盤 | Luck.js |
| X01 | 実装 | 手札の単体攻撃魔法の直接会心で 25% → やまびこ（echo.js で M02 と上限共有）。各自ターン1回 |
| X02 | 実装 | 自分のダメージ型反応 → 隣接の敵兵士へ反応ダメージの50%（切り捨て）の固定ダメージ（付着・反応なし） |
| X03 | 実装 | 自分の反応で MP+1 |
| X11 | 基盤（確認） | Crit.js：直接会心時 10% で倍率×2、上限3 |
| X12 | 実装 | M02/M08 のやまびこの命中が解決したとき 10% で原カードを捨て札から回収（M05 で戻っていれば不発）。evade されたやまびこは「成功」に数えない |
| X13 | 実装 | 自分のダメージ型反応で 10% → 同じ対象に反応ダメージの50% の固定ダメージ |
| X14 | 実装 | mods castleLethal order 10：敵由来の致死で 20%（宣言時判定なので遅延再試行なし）→ HP1。成功は試合中1回。D08（order 20）は `ctx.loss >= hp` を見ること |
| X15 | 実装 | mods beforeNormalDraw：山札が2枚以上で 20% → 先頭2枚から1枚を選んで引く（選ばなかったカードは先頭に残る）。選び方はフォールバック「MPコストの大きい方（同じなら先頭）」。選択UIは段階D |
| X16 | 実装 | coins の onResourceChange（増加・X16 自身の追加以外）で 20% → 同じ量を追加 |
| X17 | 基盤（確認） | Crit.js / Runtime.dotAmount |
| X19 | 実装 | 自分のスキルのトークン（skillToken）の onSummon で、上限・空き枠があれば 20% → spawnExtra('token', allow token>token) で同じ種類をもう1体 |

## 共通補助（他担当も使う）
- `js/game/skills/echo.js`（commit e43f774・その後 originalBase を追加）：原魔法（原アクションID:実カードID）ごとの追加詠唱カウンタ（rt.root.echoByKey）、上限 M08なし2・あり params.maxExtra、`reserveEcho(api, { key, parent, allow, max })` は基盤の spawnExtra('echo') も通す。`originalBase` で元の基礎威力（やまびこのやまびこも元の50%）。`echoTarget` / `echoCard` / `castEcho`（origin "echo" の spellHit）。X27・X18・X22 はこれを使う（X18 は allow 'scheduled>echo'・max 1、X22 は M02 側で copy を max 1 にしてある）
- `js/game/skills/victims.js`：倒れた対象の位置のスナップショット（onUnitDeath/onTokenGone を原アクションの間だけ覚える）と `adjacentEnemies`

## 足した拡張点（基盤・Game.js）
- `handlers/index.js`：`import X_c1` と GROUPS に X_c1。系統の判定を「キーの先頭の英字」に（`const letter = group[0]`）。他担当の分割ファイルも同じ書き方で足せる
- `Game.js`：rollDice の基本のサイコロ・rollGodDice の出目の直後に `if (this.skillRt) value = this.skillRt.diceValue(...)`（2行。skillRt が null なら乱数・挙動とも不変）
- `Runtime.js`：`cardPaid` に `this.handPlan = plan ?? null` を1行、新メソッド `diceValue(player, card, value, reroll)`（mods "diceValue"・QA ログ kind "dice"）

## 確認
- `node --test`：929件 pass / 0 fail（基盤 914 ＋ 新規 tests/classic-skills-C1.test.js 15件）
- `node tests/sim/run.js --games 20 --seed 1 --json`（通常）・`--mode factions`・`--mode classic --games 10`（スキルなし）：基盤 commit f28199c と出力が一致
- `node tests/sim/skills.js --games 2`（critMagicLuck・elementManaMagic・none）が最後まで走り、ハンドラのエラーなし（勝率の測定ではない）
