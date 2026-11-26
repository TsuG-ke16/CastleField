# 段階C 担当 C5（worktree skill200-wt5 / branch skillC5）：血魔術 B・闘志 Q・横断 X26〜X35・X48

## ノード別状況
| ID | 状況 | 実装（ファイル・仕組み） |
|---|---|---|
| B01 | 実装 | handlers/B.js：mods mpToHp（手札の魔法の不足MP×2 を城HPへ。options.hpForMp が 0/false なら置換しない）。B08 所持時は何もしない（B08 が上書き）。counters は cardCost の onHpPayment |
| B02 | 実装 | 任意アクション B02：cost {hp:3} → 1枚ドロー。手札満杯なら拒否（支払も回数も消費しない） |
| B03 | 実装 | options.bloodBlade。mods hitBaseAdd：手札の攻撃魔法の最初の直接命中（兵士・城）の直前に payHp(2)（X32/X35 を通る）→ +4。外れ・回避なら払わない |
| B04 | 実装 | onAttackResolve（resource）：自分の直接命中（手札の攻撃魔法・兵士の戦い/射撃）×敵兵士×非トークン×dealt（実HP損失）の10%切り捨てを城HPへ。各自ターン実回復合計3 |
| B05 | 実装 | 宣言時（mpToHp の時点＝HP支払より前）の城HP≤最大30% なら、その手札の攻撃魔法の命中に hitBasePct +0.2 |
| B06 | 実装 | onHpPayment の実消費（ev.amount）だけ血気+（上限8）。任意アクション B06：血気3→MP1（MP満タンなら拒否） |
| B07 | 実装 | 任意アクション B07：血気1〜4→敵兵士1体に固定ダメージ（api.fixedDamage・会心不可） |
| B08 | 実装 | mods mpToHp：1:1、options.hpForMp の量（不足分以上・コスト以下）を置換。B01 の率を上書き |
| Q01 | 実装 | onAttackResolve：敵の命中で自分の兵士が実HP損失 → SP+1（各自ターン3回） |
| Q02 | 実装 | hitBaseAdd：SP≥15 で自分の兵士の通常攻撃（戦い・射撃・城への攻撃）+1 |
| Q03 | 実装 | 任意アクション：SP3 → シールド3（新規生成上限10） |
| Q04 | 実装 | onUnitDeath：自分が通常攻撃で非トークン敵兵士を撃破 → SP+1（各自ターン1回） |
| Q05 | 実装 | 任意アクション：SP3 → state.critFocus = 0.2（消費は Crit.js）。集中が残っている・会心未解放（C01/X10なし）なら拒否 |
| Q06 | 実装 | 任意アクション：SP5 → 今いる味方兵士全員に攻撃力+1（state.vars.q06、区間 state.interval が変わると失効）。hitBaseAdd で加算 |
| Q07 | 実装 | onResourceChange：SP が上限30未満→30 になったとき MP+2（各自ターン1回） |
| Q08 | 実装 | 任意アクション：SP10 → 兵士1体に攻撃力+3（次自ターン開始まで）・シールド3 |
| X26 | 実装 | handlers/X_c5.js：直接会心命中（敵兵士 onAttackResolve・城 onCastleDamage）で城HP+1、各自ターン2回 |
| X27 | 実装 | options.bloodEcho。onAttackResolve（extra）：手札の単体攻撃魔法（echo.js の SINGLE_ATTACK_EFFECTS）の直接命中後、対象生存を確認→HP2払える確認→reserveEcho（M02/X01 と合計上限を共有）→payHp→castEcho（50%）。模倣コピーには不可 |
| X28 | 実装 | onHpPayment 実消費のあと付与（非累積・各自ターン1回）→ mods healAmount：次の手札の回復魔法（healOwnCastle）+2 |
| X29 | 実装 | 任意アクション：非トークン兵士を Units.sacrifice（墓地・撃破報酬・死亡誘発なし）→ 城HP+2・MP+2 |
| X30 | 実装 | onStatusTick（bleed）：自分由来の出血による非トークン敵兵士の実HP損失（ev.loss）×25%切り捨て、各自ターン合計2 |
| X31 | 実装 | onHpPayment 実消費を累計（最大9）、5以上かつ各自ターン1回で使い魔召喚、成功時だけ -5。カウンタは state.pub.x31 にも表示 |
| X32 | 実装 | mods hpPayWaive：任意HP支払の宣言ごとに 20%（幸運の対象・deferrable:false）で全額免除、各自ターン1回。債務支払は対象外（基盤が mods を呼ばない） |
| X33 | 実装 | onHpPayment 実消費1につき SP+1、各自ターン3 |
| X34 | 実装 | onHpPayment 実消費1につき城壁+1（既存の armorMax）、各自ターン実増加3 |
| X35 | 実装（自動） | mods hpPayDefer：免除の残りから最大2を延期（債務）、各自ターン1回。債務の支払・繰越・新規支払の拒否は基盤（Resources.payDebt/payHp） |
| X48 | 基盤済み（確認のみ） | Crit.js：SP≥20 で会心率+10pt。ただし Crit.js は X48 の countSuccess を呼ばないので counters は常に0（段階Dで要検討） |

## 資源循環の決まり（仕様 5.6）
- 支払由来（B06・X28・X31・X33・X34）は onHpPayment の `amount`（実消費）だけ。免除（waived）・延期中（deferred）は0扱い。延期分は次の自ターン開始の債務支払（ev.debt）で実消費になった時に1回だけ数える
- 吸血（B04・X26・X30）は自分の城HPの実回復量で上限を数える。トークン・自分の兵士・城/城壁・持続ダメージ（B04）・固定ダメージ・追加由来（echo 等。ev.direct false）からは得ない
- HP置換の支払（cardCost）・B03・X27 はそれぞれ別の payHp（別の宣言＝X32 の判定も別）

## 基盤に足した拡張点（追加のみ）
- js/game/skills/Runtime.js：afterHit の onAttackResolve に `victimToken`。onStatusTick に `victimToken`・`loss`（payload.hpBefore がある時の実HP損失）。tickBleed の soldierDamaged に `hpBefore`（出血はスキル専用なので他モードに影響なし）
- js/game/skills/handlers/index.js：`import X_c5` と登録1行（GROUPS の系統文字チェックの代わりに X 始まり・重複を検査）
- 新規 js/game/skills/blood.js（宣言の記録・攻撃魔法の判定・城回復・自分/敵兵士の安定順）。js/game/skills/echo.js は skillC1 ブランチ（e43f774）と同一内容をコピー（統合時は同一ファイル）

## 判断メモ
- 任意の選択は playCard の第3引数：`hpForMp`（B08 の量。B01 は不足分を自動置換＝MP不足で出すこと自体が宣言、0/false で拒否）、`bloodBlade`（B03）、`bloodEcho`（X27）。UI/CPU の接続は段階D
- B03 の支払は「最初の直接命中の直前」（使用宣言と命中の間。外れ・回避・対象なしなら払わず効果もなし）。費用計画（mpToHp）で払うと、その後の MP 不足判定で不成立になったとき原子性が崩れるため
- B05「使用宣言時」は費用計画の時点（HP置換の支払より前）の城HPで判定
- X35 は自動（各自ターン最初の任意HP支払で最大2延期）。延期すると債務が残るためそのターンは以後の任意HP支払（B01置換・B03・X27・B02）ができない。オン/オフの選択は段階Dで要検討
- Q06/Q08 の攻撃力は兵士の値を書き換えず hitBaseAdd で加算（表示上の攻撃力は変わらない）。Q06 は使用時にいた兵士だけ
- Q07「初めて到達」は「上限未満から上限になったとき（各自ターン1回）」と解釈
- B04 はクラシックの1命中ダメージ（多くは9以下）では 10% 切り捨てで0になりやすい（仕様どおり）

## 確認
- node --test：922 pass / 0 fail（基盤914＋新規 tests/classic-skills-blood.test.js 8件）
- tests/sim/run.js（通常 20・factions 20・スキルなし classic 10、seed 1、--json）が f28199c と完全一致
- B/Q ビルドどうしの classic 4試合（任意アクション・bloodBlade/bloodEcho を常に使う簡易ループ）で handlerError 0
