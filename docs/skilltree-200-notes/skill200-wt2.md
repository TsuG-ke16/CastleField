# skill200-wt2（branch skillC2）担当ノードの状況

担当：魔力 P01〜P08、手札 H01〜H08、時間 T01〜T08、模倣 I01〜I08、横断 X04・X05・X18・X22・X24・X44・X47。
ハンドラ：`js/game/skills/handlers/{P,H,T,I}.js`、横断は `handlers/X_c2.js`（`handlers/index.js` が `Object.assign(X, XC2)` で合流）。補助：`js/game/skills/c2util.js`。テスト：`tests/classic-skills-c2.test.js`（32件）。

## ノード別

| ノード | 状態 | 実装メモ |
|---|---|---|
| P01・P07 | 接続済み（段階A の静的） | ハンドラなし（counters は null のまま） |
| P02 | 実装 | mods mpOverflow で貯蔵（最大5）。onTurnStart(resource) で1まで自動移送 |
| P03 | 実装（任意アクション） | コイン1→MP2。MPがいっぱい（P02の貯蔵にも空きなし）なら拒否 |
| P04 | 実装 | onMonsterKill で戦闘内コイン+1、試合中2回。魔物のとどめの人＝ev.ownerId |
| P05 | 実装 | mods mpCost：10%でMP-1（最低1）。見積もり（preview）は乱数を使わず、減らせない（コスト1以下）ときは判定もしない |
| P06 | 実装 | mpCost（宣言時のMPを記録）＋ hitBaseAdd。攻撃魔法（c2util.ATTACK_EFFECTS）の直接命中（origin hand）の各対象に+2 |
| P08 | 実装（任意アクション） | 貯蔵MPを1〜空き分まで任意量移送（list は量ごと）。P02 必須はデータ側 |
| H01 | 実装（Game 拡張あり） | Game.mulligan に `skillRt.mulliganHook` を足した。戻す枚数が1〜2なら先に引いてから戻したカードを混ぜる。0枚・3枚以上は通常のマリガン（乱数の消費も従来どおり） |
| H02 | 実装 | onDraw(kind normal)。10%で引いたカードの一時コピー。手札満杯なら判定しない |
| H03 | 実装（任意アクション・試合中1回） | 捨て札から（種類ごとに先頭1枚を候補に出す）。山札が共有なので相手が捨てた札も対象 |
| H04・H05 | 実装（任意アクション・試合中1回ずつ） | drawFirstMatching（シャッフルなし）。H05 の魔法は kind spell（wild を除く） |
| H06 | 実装 | onCardPlayed の cardNumberThisTurn が3 |
| H07 | 実装（任意アクション） | 捨てて1枚ドロー（cardDiscarded を出す）。コピーを捨てると消える |
| H08 | 実装（任意アクション） | 山札の上3枚の位置 index と手札1枚を交換（手札のカードがその位置に入る＝残りの順序は不変）。一時コピーは山札に入れられないので対象外。提示は本人の listActions の preview だけ |
| T01 | 実装 | onCardPlayed で「自ターン最初の単体攻撃魔法」を記録 → 命中（onAttackResolve・生存）で予約。解決は spellHit（origin scheduled、基礎威力×50%、最小1） |
| T02 | 実装 | mods dotHold。20%（api.roll）で見送り、状態ごと最大1回（onStatusApplied で記録を戻す） |
| T03 | 実装 | onTurnEnd でMP>=2を記録 → 次の onTurnStart で MP+1 |
| T04 | 実装（任意アクション・Runtime 拡張あり） | `soldier.skillTickSkip[status]`（armed → skipped）。Runtime.dotAmount が0を返し、dotHold が期限減算を見送る。毒・やけど・出血 |
| T05 | 実装（Runtime に印を追加） | 既存の「継続回復」＝水の精霊の毎ターンの城回復（`spiritTriggered`→`castleHealed`）に対応づけ、onHeal に `continuous` を足した。次の自ターン開始に城HP1回復を予約。予約由来の回復からは作らない |
| T06 | 実装（任意アクション・試合中2回） | 予約で追加ドロー1。手札がいっぱいなら不発 |
| T07 | 実装 | T01 の予約魔法の解決時に T01.scheduled が `runMods('scheduledSpell')` を呼ぶ。MP+1（各自ターン1回）。「予約魔法」は T01 だけ（R04・T05・T06 は予約効果であって予約魔法ではないと解釈） |
| T08 | 実装（任意アクション・試合中1回） | 前の自ターンの最初の手札由来の単体攻撃魔法の基礎威力（命中時の ev.base）を100%で再発動。対象は敵の見える兵士から再選択 |
| I01 | 実装（任意アクション） | 相手（先頭の敵）の山札の先頭1枚を `skillState.peek.I01` に（本人だけ）。山札が空なら拒否 |
| I02・I03 | 実装 | onEnemyCardPlayed。敵が使った単体攻撃魔法／兵士カード（コピーでないもの）の種類を一時コピー（skillCopy.skillId が I02/I03） |
| I04 | 実装 | mpCost：模倣由来（I02/I03 のコピー）−1（最低1）。見積もりにも効く（乱数なし） |
| I05 | 実装 | 敵の攻撃魔法の後、次の自分の攻撃魔法（その1枚の全命中）に+1。1枚で使い切り・各自ターン1回付与・非累積 |
| I06 | 実装 | 敵の回復魔法の後、次の自分の手札の回復魔法（healAmount）+2。healAmount が呼ばれるのは healOwnCastle だけ（兵士回復の healSoldier はまだ基盤にフックがない） |
| I07 | 実装 | 敵の使用カード3枚目（ev.cardNumberThisTurn）で予約、次の自ターン開始に追加ドロー |
| I08 | 実装（任意アクション・試合中1回） | 敵の見える（非トークン）兵士1体の弱体トークン（Units.summonToken kind weak）。空き枠・同時3体・各自ターン2体の上限は基盤どおり |
| X04 | 実装（任意アクション） | 貯蔵MP2→1枚ドロー |
| X05 | 実装 | onUnitDeath（非トークンの自軍）で drawFirstMatching(兵士) |
| X18 | 実装 | onAttackResolve（origin scheduled の単体攻撃魔法）で M02/M08 と同じ率・威力のやまびこを1回（`allow: 'scheduled>echo'`, max 1, echo.js の原魔法カウンタ） |
| X22 | 実装（判定の本体は M02 側） | 下記「統合時の注意」参照 |
| X24 | 実装（再試行の中身は呼び出し側） | mods luckFinalFail（ctx.retry）。自ターン中1件を Runtime ごとのメモリに保存、次の自ターン開始で `retry(api)` を1回。false を返せば破棄・数えない。再試行中の判定からは延期しない。関数は状態の保存に入れられないので serialize/restore では失われる |
| X44 | 実装（任意アクション併用） | 自ターン終了（onTurnEnd）に手札>=2なら山札の先頭2枚を `peek.X44` に（本人だけ）。順序は、メイン行動中の任意アクション `X44 {swap:true/false}` で予約（選ばなければそのまま）。任意アクションの実行も counters に数えられる（実行ごとに +1。X44 の key は order／上限99） |
| X47 | 実装 | onCardPlayed の `copySkillId` が I02/I03 → 1枚ドロー |

## 基盤に足した拡張（すべて最小・局所）
- `Game.js`：`mulligan()` の引き直し部分を `if (!(this.skillRt && this.skillRt.mulliganHook(player, cards, drawn))) { 従来の処理 }` で囲んだ（H01。スキルなしなら従来と同じ）。
- `Runtime.js`：`implementation()` に `HANDLERS[id].mulligan` を追加／`mulliganHook()` を追加／`cardPaid` の onCardPlayed に `copySkillId`／`dotAmount`・`dotHold` の先頭に `soldier.skillTickSkip`（T04）／`onGameEvent` に `spiritTriggered`（水の精霊）と onHeal の `continuous`（T05）。`this.spiritHeal` を追加。
- `handlers/index.js`：`import XC2` と `Object.assign(X, XC2)` の2行。
- `js/game/skills/echo.js`：skillC1 ブランチ（/tmp/skill200-wt1）の作業ツリーにあった版をそのままコピーした（最初の commit 688baa8 は e43f774 の cherry-pick、その後の版を上書き）。統合時は C1 の最終版を採用すること。

## 統合時の注意
- **X22 の二重判定に注意**：C1 の `handlers/M.js`（M02）は、模倣由来のコピーの単体攻撃魔法に X22 があるときだけやまびこを判定する実装を持っている（params は `maxExtra` を読むが、データは `maxEcho`。未指定の既定1回で動く）。そのため X22 側は判定せず、模倣コピーからやまびこ（origin echo）が実際に起きたとき成功を数えるだけにした。M02 側のコピー分岐を外すなら、X22 に `tryEcho(max:1)` を戻す必要がある。
- **単体攻撃魔法の定義**：c2util.SINGLE_ATTACK_EFFECTS と echo.js の SINGLE_ATTACK_EFFECTS は同じ（singleDamage・randomElementDamage）。chainBlast（周囲にも当たる）は含めない。
- 「攻撃魔法」（P06・I05）は c2util.ATTACK_EFFECTS（ダメージを与える魔法の effect。サイコロ・精霊は含めない）、「回復魔法」（I06）は HEAL_EFFECTS。
- 追加ドロー・回収・コピーは手札上限（クラシックは6）に従う。ターン開始直後は手札が上限を超えていることが多く（初期5＋ドロー2）、そのときは任意取得が断られ、自動追加は不発になる（仕様どおり）。
- 試合開始時の H01 は、既存のマリガン画面（phase "mulligan"）で戻す枚数が0〜2のときに有効になる。段階D の UI では「H01 を持つときは先に引く」旨の表示が必要。CPU の mulliganChoice は変えていない。
- X44 の順序選択、H03/H07/H08 の対象選択は任意アクションの list/args に出している（段階D が UI・CPU を接続する）。

## 休眠・部分実装
- 休眠のノードはありません。ただし以下は既存仕様との対応づけ：T05（継続回復＝水の精霊）、T07（予約魔法＝T01 のみ）、I06（healOwnCastle のみ）。
- 罠・固定兵器を使うノードは担当外。

## 確認した結果
- `node --test tests/classic-skills-c2.test.js`：32件 pass
- `node --test`（全件）：946件 pass / 0 fail（基盤の914件＋本担当の32件）
- `tests/sim/run.js`（normal 20試合 seed1・--mode factions 20試合・--mode classic 10試合スキルなし）が基盤 commit f28199c と完全一致（--json の出力を cmp）
