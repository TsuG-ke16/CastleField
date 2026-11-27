# 200ノード スキルツリー 引き継ぎ（Codex 向け）

仕様：docs/skilltree-200-spec.md ／ 進捗：docs/skilltree-200-progress.md ／ 担当別メモ：docs/skilltree-200-notes/*.md ／ ハンドラ有無の自動表：docs/skilltree-200-coverage.md

- 対象 branch：`skillD2`（worktree /tmp/skill200-wt7）。土台は `skill200` の HEAD `d486eb0`（段階A〜C 統合済み）。この文書は段階D2 のコミットに含まれる（最終 commit は `git log skillD2` で確認）
- **UI（ツリー画面・戦闘中のスキルボタン・血魔術の実費プレビュー・E04/X25/X35/X15 の選択UI）は別担当（D1）**。この文書の作成時点で UI は**未確認**。`js/ui/precache.js` には js/game/skills/ のファイルが入っていない（オフライン用一覧の更新は D1／統合時に `node js/ui/build-precache.js`）
- 勝率・バランスは**一切測っていない**。下の「実行した最小テスト」以外の検証はしていない

## 1. 変更ファイル（24ノード版の上 38287fc からの差分）

| 区分 | ファイル |
|---|---|
| データ・生成 | `data/classic/skilltree.json`（version 3・200ノード）、`tools/build-skilltree.mjs`（生成。`--check` で一致確認） |
| 取得・保存 | `js/game/SkillTree.js` |
| 本番 Game | `js/game/Game.js`（フックの呼び出しと公開メソッドだけ。`this.skillRt` が null なら素通り） |
| スキル基盤 | `js/game/skills/{Runtime,Events,Limits,Luck,Crit,Resources,Scheduled,Units,Cards,Tactics}.js`、補助 `{echo,victims,c2util,helpers-c4,blood}.js` |
| 効果ハンドラ | `js/game/skills/handlers/{C,M,E,L,P,H,U,G,R,D,A,T,S,K,F,Q,V,I,B,X,X_c1..X_c5}.js`、登録表 `handlers/index.js` |
| QA 公開API（D2） | `js/game/skills/qa.js` |
| CPU（A・D2） | `js/game/strategies.js`（ビルド選択 `chooseSkillBuild`・任意アクション `takeSkillActions`・手札の選択 `cpuSkillOptions`） |
| サーバー | `server/rooms.js`（席のビルド。**オンラインのスキル操作**：skillAction・listSkillActions・previewSkillCost・setSkillPrefs・playCard の skillOptions の検証・発動ログの配信。`docs/skilltree-200-notes/online-skills.md`） |
| ツール（D2） | `tools/skilltree-coverage.mjs`（カバレッジ表の生成・`--check`） |
| テスト | `tests/classic-skilltree*.test.js`、`tests/classic-skills-{core,C1,c2,c3,c4,blood,d2}.test.js`、`tests/sim/{skills,run}.js` |
| 文書 | `docs/classic-skilltree.md`、`docs/skilltree-200-*.md`、CLAUDE.md の該当節 |

D2 で触った既存ファイル：`Game.js`（`previewSkillCost`・`setSkillPrefs` を追加）、`Runtime.js`（仮ルールの選択 prefs・敵スキルの固定ダメージにも致死防止）、`Crit.js`（X48 の counters）、`Resources.js`（手札の skillOptions を HP支払の mods へ）、`handlers/X_c1.js`（X14 の敵由来判定・X15 の選び方）、`handlers/X_c5.js`（X35 既定 OFF）、`tools/build-skilltree.mjs`＋`skilltree.json`（X15.pick・X35.autoDefer の params）、`tests/classic-skills-blood.test.js`（X35 のテストに「ON にする」1行。期待値は不変）、`strategies.js`。

## 2. Game の初期化（実際のコード）

```js
import { Game } from './js/game/Game.js';
import { createSkillQa } from './js/game/skills/qa.js';
import { STRATEGIES, chooseSkillBuild } from './js/game/strategies.js';
import { buildData, loadOptionalData, seededRng } from './tests/helpers.js';

const { cards, rules } = buildData({ mode: 'classic' });
const opts = loadOptionalData('classic');           // skillTree（data/classic/skilltree.json）を含む
const qa = createSkillQa(opts.skillTree);

// 2人分の取得順ID配列（[] は空ビルド）。{ ids, config } も可（E04/X25 の選択）
const options = qa.apply({ ...opts, cards, rules, rng: seededRng(1), setup: { firstPlayer: 'p1' } },
  [['C01', 'C02', 'C04', 'X01', 'M02', 'M01', 'M04', 'M06', 'M08', 'L01', 'L02', 'X11'], []],
  12 /* 予算。省略でツリーの budget */);
const game = new Game(options);
game.start();
```

- `apply` は gameOptions を書き換えない（新しいオブジェクト）。ビルドが不正なら例外（Game 自体は不正な席を黙って空ビルドにして `skillFallbacks`・`player.skillError` に理由を残すので、QA は apply 経由を推奨）
- 全員 `[]` なら `game.skillRt === null`：スキルの処理・乱数の消費はゼロ（無取得クラシック）。通常モード（skillTree を渡さない）も同じ
- 既存の seeded RNG（`rng`）・`setup.firstPlayer`・`strategies.js` はそのまま使える。CPU のビルドは `chooseSkillBuild(tree, rng, style)`（none / random / presets のID / 戦い方の名前 / `"C01+C02"`）

## 3. 取得API（本番の判定）

`js/game/SkillTree.js`：`nodes / cost / canAcquire / validate / acquirableIds / checkSet / orderBuild / release / validateConfig / normalizeBuild / serializeBuild / deserializeBuild / migrateBuild / skillTreeApi`。
QA 契約（`createSkillQa(tree)`）：

| export | 返り値 |
|---|---|
| `nodes` | `[{ id, group }]`（200件・データ順） |
| `canAcquire(picked, id, budget)` | `{ ok, reason? }`（取得順・接続・必須・奥義1個・実コスト・予算） |
| `validate(picked, budget)` | `{ ok, reason?, spent? }`（取得順で先頭から canAcquire） |
| `cost(picked)` | 実支払 pt（全ノード1pt。START 0） |
| `apply(gameOptions, builds, budget)` | new Game 用のオプション |
| `observe(type, payload)` | 数値化した metric の配列（下記）。知らない種類は `null`（未計測） |
| `verify(game)` | 違反の配列 `[{ code, severity: 'error'|'warning', playerId, message }]`（空なら問題なし） |
| `attach(game, sink?)` / `summarize(game)` | 試合の集計（下記）。`implementationOf(id)` も公開 |

canAcquire/validate は真偽値ではなく `{ ok, reason }`。QA adapter で `.ok` を取ること。選択肢付きビルド（E04/X25）を QA が表現できなければ、ID 配列だけで渡せばデータの初期値（E04=対消滅、X25=炎）で動く。選択肢の探索は adapter 側の追加課題。

## 4. イベント（観測）

### 4.1 ソース
- `game.skillEvents`：スキルのログ（最大5000件。古いものから捨てる。counters は捨てない）
- `game.observeSkills(fn)`：ログの購読（解除関数を返す）
- `game.skillCounters(pid)`：ノード別成功回数。**handler・core は 0 から、static・休眠は null**
- `game.on(type, fn)`：既存の Game イベント（mpChanged・coinsChanged・castleDamaged など）
- `game.getState(pid).players[id].skillState`：本人には uses・蓄積・予約・墓地・peek・counters・actions・prefs、相手には resources・debt・tokens・件数・public だけ

### 4.2 ログの kind（実際の出力のサンプル。seed 3・critMagicLuck vs bloodHealDefense）
```
{"turn":2,"kind":"hpPayment","playerId":"p2","amount":2,"waived":0,"deferred":0,"paid":2,"skillId":"B03","parent":null}
{"turn":2,"eventId":null,"rootActionId":8,"origin":null,"depth":0,"paid":2,"waived":0,"deferred":0,"kind":"trigger","playerId":"p2","skillId":"B03","count":1}
{"turn":4,"kind":"resource","playerId":"p2","resource":"sp","delta":1,"value":1,"skillId":null}
{"turn":4,"kind":"reaction","playerId":"p2","reaction":"annihilation","damage":8,"alive":false}
{"turn":5,"kind":"luck","playerId":"p2","skillId":"D03","rollKind":"other","base":0.1,"add":0,"stack":0,"multiplier":1,"cap":0.95,"p":0.1,"rolls":[false],"secondChance":null,"reroll":null,"result":false,"certain":false}
{"turn":5,"ownerId":"p1","category":"spellHit","before":5,"crit":false,"amount":5,"multiplier":1,"chance":0.165,"forced":false,"unlocked":true,"breakdown":{"unlock":"C01","base":0.15,"add":{},"multiplierAdd":{}},"direct":true,"kind":"crit"}
{"turn":5,"kind":"extra","playerId":"p1","skillId":"M04","extraKind":"chain","parentOrigin":"hand","parentEventId":114,"depth":1,"rootActionId":25}
{"turn":5,"kind":"effect","skillId":"M04","playerId":"p1","type":"soldierDamaged","amount":2,"origin":"chain","depth":1}
{"turn":15,"kind":"evade","playerId":"p2","attackerId":"p1","soldierId":"s09","hitKind":"fight"}
{"turn":17,"kind":"revive","playerId":"p1","skillId":null,"historyId":"s13","auto":false}
```
ほかの kind：`dice`（L06）・`copyGone`・`scheduled` / `scheduledResolved` / `scheduledExpired`・`diagnostic`（code：`handlerError`・`successLimit`・深度/派生の上限・`scheduledNoHandler` など）。
スキルイベント（ハンドラが購読する内部イベント）の一覧は `js/game/skills/Events.js` の `SKILL_EVENTS`、origin は `ORIGINS`（hand・normalAttack・echo・chain・reaction・dot・reflect・resurrection・token・copy・scheduled・sacrifice・hpCost・skillActive ほか）。

### 4.3 observe の metric
trigger・roll（p と成否）・crit（p・倍率・前後の量）・damage / heal / shield / summon（スキルの文脈の実量）・`resource:<soul|storedMp|blood|healStore|sp>`・hpPaid（paid / waived / deferred / debt）・extra（派生と深度）・revive・reactionBy・dice・evade・scheduled*・`diagnostic:<code>`、Game イベントの mp・coins・castleDamage / hpPaidCastle・castleHeal・soldierDamage・shield・reaction。
`castleArmored` は「今の城壁」しか出ないので value は **null（未計測）**。`summarize(game)` はログから集計するため MP・コインは null（`attach()` で最初から購読すれば数える）。ダミー値は返さない。

## 5. 乱数・状態保存
- 乱数は Game の注入 RNG（`game.rng`）だけ。確率判定は Luck.js の `roll`（すべて luck ログに記録）、ランダム対象は `api.pick`（安定ソートのあと一様）。スキルのないゲームは乱数を1つも増やさない（tests/sim/run.js の通常・4陣営・無取得クラシックが土台と完全一致）
- CPU のスキルの選択（strategies.js）は乱数を使わない（決定論的）
- 保存：`game.skillRt.serialize()` → JSON 可能なオブジェクト（version 1：プレイヤーごとの状態・回数・蓄積・資源・債務・予約・墓地・counters・prefs、付与元・最後の攻撃者）。`game.skillRt.restore(data)`。盤面側（兵士の skillToken・skillHistoryId・skillBleed など）は兵士に残る。Game 全体の serialize/restore は既存にない（未対応）。X24 の再試行の関数は保存できず restore で失われる
- ビルドの保存：`serializeBuild` / `deserializeBuild`（version 3。旧24ノード版は振り直し）

## 6. CPU（段階D2）
- 既存の戦い方（smart など）はそのまま。`STRATEGIES[name].takeTurn` の前後で `takeSkillActions(game, pid, 'pre' | 'post')` が `game.listSkillActions` の合法手だけを `game.skillAction` で使う（画面・headless と同じAPI）。pass は使わない
- 使う任意アクションは `CPU_SKILL_ACTIONS`（strategies.js）：pre＝P08・X04・B06・P03（コイン2以上）・H03・H04・H05・G04・T06・I01・B02（城HP条件）、post＝G06・I08・V07・X43・Q08・Q06・Q03・Q05・D07・T04・S08・T08・B07・K04・K08。選び方は一覧の先頭（安定順）か量の最大
- **使わない（未対応）**：H07（捨てる札の評価が要る）・H08（交換の評価）・U06・K05（移動の評価）・V05（トークンを失う）・X29（兵士を失う）・X44（順序の評価。既定のまま）
- 城HPを使う判断：債務がなく、払ったあとも最大HPの50%（`CPU_SKILL_SAFE_HP_RATIO`）以上残るときだけ（B02・HP置換・B03・X27）
- 手札の選択 `cpuSkillOptions`：`hpForMp`（MP で払えれば 0＝置換しない／足りなければ城HPに余裕があるときだけ不足分）、`bloodBlade`・`bloodEcho`（城HPに余裕があるとき true）、`diceChoice: 'high'`（L06）。`deferHp` は渡さない（本人設定に従う）。HP置換が要るのに余裕がないカードは「出せる」に数えない
- H01：`mulliganChoice` が H01 を持つときだけ「今のMPで撃てない重い非兵士カード」を重い順に最大2枚戻す。兵士が1枚もなければ従来どおり全部
- E04 / X25：ビルドの config（プリセットの config か、データの初期値）。CPU の探索はしない
- X15：本人設定 `pick`（"cost"＝MPコストの大きい方・既定／"first"／"second"）。CPU は既定
- **X35 の自動延期は既定 OFF**（`params.autoDefer: false`）。理由：延期すると債務が残る間は以後の任意HP支払（B01 置換・B03・X27・B02）がすべてできなくなり、CPU・人間とも意図せず手が止まるため安全側にした。切り替えは `game.setSkillPrefs(pid, { X35: { autoDefer: true } })`（人間・CPU 共通、相手には見えない）、手札1枚ごとは `playCard(id, target, { deferHp: true/false })`。UI の切り替えは D1 の担当
- 未対応の戦術：任意アクションの対象の評価（どの兵士を守る・動かすか）は先頭を選ぶだけ。K04/K08 の移動・T08 の対象・B07 の対象は改善の余地あり。勝率は測っていない

## 7. ノード別の状況（docs/skilltree-200-notes/*.md の集約）

区分：**実装**＝ハンドラあり、**基盤**＝Luck.js/Crit.js、**static**＝試合開始時の数値、**対応づけ**＝既存仕様に同名の仕組みがないので既存機能に読み替えて実装、**実データ休眠**＝実装はあるがクラシックの実カードでは条件が起きない、**休眠**＝ハンドラなし（効果なし・counters null）。自動表は docs/skilltree-200-coverage.md（handler 170・core 11・static 10・休眠 9）。

| 系統 | 状況 |
|---|---|
| C 会心 | C01/C02/C03/C05 基盤。C04（出血はスキル専用の最小定義）・C06・C07・C08 実装 |
| M 魔法 | M01〜M06・M08 実装。**M07 実データ休眠**（クラシックの魔法はメイン枠で1ターン1枚なので2枚目が出ない） |
| E 属性 | E01/E04/E06 static。E02（持続のみ。既存付着に「消費回数」がない）・E03・E05・E07・E08 実装 |
| L 幸運 | L01/L02/L03/L08 基盤。L04・L05・L07 実装。**L06 実データ休眠**（クラシックにサイコロカードがない。選択は skillOptions.diceChoice、既定は大きい方。2つの出目を見てから選ぶ2段階UIは未対応） |
| P 魔力 | P01/P07 static。P02〜P06・P08 実装 |
| H 手札 | H01（既存マリガンで戻す枚数1〜2のとき先に引く）・H02〜H08 実装 |
| U 兵士 | U01/U04 static。U02・U03・U05・U06・U07・U08 実装 |
| G 墓地 | G01（1回の爆発＝隣接の敵全員）〜G08 実装。墓地は既存の lastFallen と結びつけた記録 |
| R 回復 | R01 static。R02〜R06・R08 実装。**R07 実データ休眠**（兵士を回復する魔法が現行データにない。テストはテスト用カード） |
| D 防御 | D01/D05 static。D02・D03・D04・D06・D07・D08 実装 |
| A 攻城 | A01・A03（対応づけ：到達した区間）・A04・A05・A07・A08 実装。A02 対応づけ（武器を装備した兵士の射程+1）。**A06 休眠**（到達した兵士は攻撃後に消え、追撃主体が残らない） |
| T 時間 | T01〜T08 実装（T05＝水の精霊の継続回復、T07＝T01 の予約魔法のみ） |
| S 状態異常 | S01〜S08 実装（S04 は出血を付けるノード C04 などと組み合わせて発動） |
| K 戦術 | K02〜K08 実装。**K01 休眠**（通常攻撃は同じ道の敵にしか届かず「異なるレーンから同一敵」が成立しない。兵士防御の値もない） |
| F 兵器・罠 | F01・F03・F04・F07 対応づけ（固定兵器＝武器を装備した兵士、兵器＝武器カード）。**F02・F05・F06・F08 休眠**（罠が既存仕様にない。新設しない） |
| Q 闘志 | Q01〜Q08 実装（SP はスキルを持つ試合だけの最小追加：初期0・上限30・非トークン敵兵士の撃破+1） |
| V 召喚 | V01〜V07 実装。V08 実装（代替：安全リストの固有能力がないので攻撃力+1） |
| I 模倣 | I01〜I08 実装（I06 は城回復の healOwnCastle のみ） |
| B 血魔術 | B01〜B08 実装（任意の選択は skillOptions：hpForMp・bloodBlade・bloodEcho。B04 は10%切り捨てで0になりやすい） |
| X 横断 | X01〜X05・X07〜X22・X24〜X41・X43〜X48 実装（X10/X11/X17/X48 は基盤を含む。X25・X43 は武器に対応づけ。X38 は肩代わりの兵士を自動選択（HP最大）。X21・X37 は兵士回復が実データにないので実データ休眠。X24 の再試行は保存不可）。**X06 休眠**（固有能力・安全リストがない）、**X23・X42 休眠**（罠がない） |

休眠9ノード：K01・F02・F05・F06・F08・A06・X06・X23・X42（取得はできる。UI で未実装表示が必要）。

## 8. 段階D2 の判断メモ
- **D08 と A01/X39（敵スキルの固定ダメージ）**：以前は source kind "skill" が「敵由来」に入っておらず、A01・X39・D02 反射の固定ダメージの致死を X14・D08 が防げなかった。仕様の「敵由来の致死ダメージ」に当たると判断し、**致死防止（castleLethal）だけ**対象に加えた（`ctx.enemyOrigin`）。軽減（D04・D06・X38 の castleReduce）は直接攻撃が対象なので通さない。HP支払・自傷・強制終了は従来どおり対象外
- **X48 の counters**：SP20以上の加算が乗った判定で会心が出たときだけ1回数える（確定会心は確率補正を使わないので数えない）
- **X15/L06 の選択**：L06 は playCard の skillOptions.diceChoice で受けられる（確認済み）。X15 は通常ドロー（カード使用ではない）なので skillOptions ではなく本人設定 `setSkillPrefs(pid, { X15: { pick } })`
- **費用の見積もり**：`game.previewSkillCost(cardId, skillOptions)`（乱数なし）を追加。画面の実費プレビューと CPU が同じものを使える

## 9. 実行した最小テストと結果（段階D2 の時点）
- `node --test`：**1030件 pass / 0 fail**（新規 `tests/classic-skills-d2.test.js` 12件を含む）
- `node tests/sim/run.js --games 20 --seed 1 --json`（通常）・`--mode factions`・`--mode classic --games 10`（スキルなし）：`skill200` HEAD（d486eb0）と出力が完全一致（cmp）
- `node tests/sim/skills.js --games 2`：最後まで走り、ハンドラのエラー出力 0（勝率の測定ではない）
- 追加のスモーク：プリセット・random の 20試合（smart vs rush）で CPU の任意アクションの失敗 0・ハンドラのエラー 0（使われた任意アクションは D07・B02・P03・I01 の4種。プリセットに任意アクションのノードが少ないため。他のアクションの CPU 経路はテストの短い対戦と単体のみ）
- UI・画面のスモーク（ui-tests/）は**未実施**（D1 担当）

## 10. Codex の優先検証（仕様 9章）
1. 血魔術×回復×幸運の資源循環（B01/B08 の置換・X32 免除・X35 延期と債務・X28/X31/X33/X34 の実消費だけの生成・吸血上限）
2. 会心×やまびこ×幸運の追加発動（M02/M08/X01/X27/X18/X22 の合計上限・追加由来からの再誘発なし・L01/L02/L03/L08）
3. 蘇生×召喚×墓地の報酬重複（G06/G08/X46/X07/V01/X19・生贄 X29・トークンの報酬なし）
4. 城壁反射・貫通・致死回避の順序（D02・A05・A08・X10・X38・D04/D06・X14→D08。D2 で敵スキルの固定ダメージも致死防止の対象にした）
5. 共有山札の選択とコピー（X15・H08・I01・X44・I02/I03・H02。山札全体を公開しない）
6. 属性付着と状態異常（E02/E03/E05/E07/E08・S01〜S08・X17・X45・T02/T04）
7. 時間予約と債務（T01/T05/T06/T07/T08・R04・X07・I07・X35 の債務の優先支払）
8. 7/10/12/15pt の合法ビルド（`qa.apply(..., budget)`）
9. 無取得クラシックと通常モードの回帰（乱数消費ゼロ）
- 勝率は複数シード・先後入替・複数CPU戦略・未使用シードで再検証すること。CPU が未対応の任意アクション（H07・H08・U06・K05・V05・X29・X44）を含むビルドや、休眠・実データ休眠のノードを「弱い」と断定しないこと

## 11. 既知の制限
- **オンライン対戦（対応済み・feature/online-skills）**：任意スキル・カード使用前の選択・支払いの見積もり・発動ログ（本人の分だけ）・スキルの設定（setSkillPrefs）がサーバー経由で使える。未対応：設定（X35 の自動延期・X15 の選び方）を切り替える画面はない（API だけ）。相手の発動ログは送らない。相手の `skillState` の `resources`・`debt` は getState の決まりどおり公開のまま（貯蔵MPなどを隠すなら getState 側の変更が要る）。くわしくは `docs/skilltree-200-notes/online-skills.md`
- 休眠9ノード・実データ休眠（M07・L06・R07・X21・X37）・対応づけ（F01/F03/F04/F07/A02/A03/X25/X43・T05・T07・I06）は上の表のとおり
- 進軍中の死亡などに対する効果は、公開メソッドの終わり（進軍のあと）に解決される（基盤の決まり）
- 盤面に枠の上限がないので「空き枠」は「自分の城の前（マス0）に自分の兵士がいない道」
- Game 全体の保存・復元は未対応（スキルの状態だけ serialize/restore）
- QA ツール（tools/castle-qa/）はこのリポジトリにない。契約（js/game/skills/qa.js）だけ実装し、ツール本体・adapter は作っていない
