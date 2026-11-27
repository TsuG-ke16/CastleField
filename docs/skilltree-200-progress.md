# 200ノードスキルツリー 進捗・未実装記録

作業場所: /tmp/skill200 (branch skill200, base 38287fc = 24ノード版の上)。仕様: docs/skilltree-200-spec.md
更新ルール: 各エージェントは作業の区切りごとにこのファイルを更新し commit する。中断しても再開できるよう「完了/未完/次にやること」を必ず最新に保つ。

## 全体状況（統合後）
対象: branch skill200（base 38287fc の上）。段階A〜Dを統合済み。最終確認は段階Eの記録を参照。

| 段階 | 内容 | 状態 |
|---|---|---|
| A | データ200ノード・取得検証・保存・旧24ノード置換・CPUビルド選択 | 完了 |
| B | 共通基盤（イベント・幸運・会心・資源・予約・連鎖制限） | 完了 |
| C | 系統別効果ハンドラ（5担当に分割→統合） | 完了（191/200にハンドラ、休眠9） |
| D1 | ツリー画面・戦闘中UI・クラシック入口（PR#200の見た目を流用） | 完了（実機/iOS未確認） |
| D2 | CPU任意行動・QA公開API・引継ぎ文書・X48修正 | 完了 |
| E | 最小確認 | 完了（下記） |

休眠9ノード: K01 F02 F05 F06 F08 A06 X06 X23 X42（既存仕様に対象が無い。詳細は docs/skilltree-200-coverage.md・skilltree-200-handoff.md）
詳細な担当別メモ: docs/skilltree-200-notes/*.md ／ Codex向け: docs/skilltree-200-handoff.md

## 主な未完・制限
- オンライン対戦中の任意スキル（サーバーの操作一覧に無い）、同端末対戦は全員同ビルド
- L06の出目を見てから選ぶ2段階は不可（事前指定のみ）。X15の選択UI・X35オン/オフは feature/skill-choice-ui で対応（docs/skilltree-200-notes/skill-choice-ui.md）
- CPUが使わない任意アクション: H07 H08 U06 K05 V05 X29 X44。対象選択は単純規則
- Game全体の保存/復元は未対応（スキル状態のみ）
- 実機（指ピンチ・iOS）未確認。勝率は一切測っていない

## 段階別の詳細記録（A/Bほか）
## 段階A
### 完了
- `data/classic/skilltree.json` を version 3 で作り直した（`tools/build-skilltree.mjs` が仕様書 第3・4章の表を読んで生成。`--check` で一致確認）。200ノード（通常133・奥義19・横断48）・19系統・ID重複なし・全1pt・budget 12・共通辺10本テンプレート・個別必須9件・E04/X25 の config・params・リング配置の layout・第10章の4ビルドを presets に
- `js/game/SkillTree.js` を書き直し：`validateSkillTree / treeIndex / nodes / cost / canAcquire / validate / acquirableIds / checkSet / orderBuild / release / validateConfig / normalizeBuild / serializeBuild / deserializeBuild / migrateBuild / skillMods / skillTreeApi / STATIC_HANDLERS / isHandlerImplemented`
- `js/game/Game.js`：setup.skills に配列か `{ ids, config }`。開始時に再検証し不正なら空ビルド（`skillFallbacks`・`player.skillError`）。getState に `skills`・`skillConfig`・`maxMp`・`skillError`。クラシックでは城の種類の補正を無効化（標準城の値）。単純な初期値系10ノードだけ既存の適用処理に接続、旧キーの処理は休眠
- `js/game/strategies.js` の `chooseSkillBuild`（`{ ids, config }` を返す。random は安定順＋注入RNG、プリセット＝第10章の4ビルド）、`server/rooms.js` の `setSeat({ skills })`・CPU 席・`roomInfo` を新スキーマに
- テスト：`tests/classic-skilltree.test.js`（19件）・`tests/classic-skilltree-play.test.js`（3件）を新仕様に置き換え。`tests/sim/skills.js`・`tests/sim/run.js` の説明と `--tree` を追従
- 文書：`docs/classic-skilltree.md`（新仕様の要約）・CLAUDE.md の該当節・フォルダ構成（tools/）

### 確認した結果（段階A終了時）
- `node --test`：902件 pass / 0 fail（変更前 f7141b6 は 903件 pass。差の1件は24ノード版固有テスト20件→新19件の置き換え。他モードのテストは無変更）
- `node tests/sim/run.js --games 20 --seed 1 --json`（通常）・`--mode factions`・`--mode classic`（スキルなし 10試合）が変更前（f7141b6）と完全一致
- `node tests/sim/skills.js --games 2`（6ビルドの総当たり・12pt）が最後まで走る（勝率の測定ではない）

### 変更ファイル
tools/build-skilltree.mjs（新規）, data/classic/skilltree.json, js/game/SkillTree.js, js/game/Game.js, js/game/strategies.js, server/rooms.js, tests/classic-skilltree.test.js, tests/classic-skilltree-play.test.js, tests/sim/skills.js, tests/sim/run.js, docs/classic-skilltree.md, CLAUDE.md, docs/skilltree-200-progress.md

### 判断メモ（仕様に明記がなく、安全側で決めたもの）
- **城の基準値**：現行 `data/castles.json` の `standard`（ふつうの城）は補正なし（hpBonus/maxHandBonus/castleSpellBonus/soldierAttackBonus すべて0）。`data/classic/rules.json` の `defaultCastle` も `standard`。クラシックは「`rules.defaultCastle` の城の補正値」を全員に使う＝**補正0**（城HP 60・手札上限 6 はルールの値のまま）。`castleType`（見た目）は選んだものを残す。判定は「skillTree を渡したゲーム＝クラシック」
- **接続されている効果は10ノード**：P01 初期MP+2、P07 MP上限+2、D01 初期城壁+4、D05 城壁2未満なら2まで（ターン開始。旧 armorFloor）、U01 出撃枚数+1（旧 soldiersPerTurn）、U04 射程+1（旧 archerRange：射程のある兵士＝弓兵・魔法使い）、R01 回復魔法+1（旧 healBonus：クラシックの回復魔法は城回復 healOwnCastle のみ）、E01 ランダム付着（旧 randomAttach。付着の残りは reactions.json の randomAttach.turns=1）、E04 選んだ反応+4/+5（旧 反応別キー）、E06 反応ダメージ+2（旧 reactionDamage：クラシックの反応はすべてダメージ型）。P04 魔物狩りは「試合中2回まで」が旧 monsterCoins と違うので未接続（段階B/C）
- **不正なビルドは例外ではなく空ビルド**（指示どおり）。ただし `setup.skills` の形そのもの（人数より多い・配列でない）と skillTree なしの `setup.skills` は従来どおり例外
- **getState の形**：`skills` は従来どおり ID 配列のまま（UI・visibility の互換）にし、設定値は別キー `skillConfig` にした
- **chooseSkillBuild の戻り値**を `{ ids, config }` に変えた（プリセットや E04 の設定を運べるように）。Game・部屋はどちらの形も受ける
- **CPU の style 対応**：aggro→会心魔法幸運、rush→墓地兵士召喚、smart→属性魔力魔法、defensive・guard→血魔術回復防御（戦い方と効果の相性は未検証。効果ハンドラ未実装なので勝率は測っていない）
- **保存の旧版判定**：配列だけ・version なし・version<3 はすべて旧24ノード版として振り直し（空ビルド＋理由、`migrated: true`）。version 3 で検証に失敗したら空ビルド＋理由（`ok: false`）
- **解除後の順序**：集合として正しければ、元の順をできるだけ保って canAcquire で取れる順に並べ直して返す
- **layout**：会心を真上に時計回り、系統ごとに20°の扇、01→08 を半径方向に（02/04/06 が左・03/05/07 が右・08 が先端）。幸運は START の下に小さく。横断は端点の中点（近すぎる点は少しずらす）。見た目用で、取得判定には使わない
- **params の名前**は暫定（段階B/C のハンドラ実装時に必要なら生成スクリプトで直して再生成する）。X21 の光属性は `light`
- コミット末尾の Co-Authored-By はセッションのシステム指定（Claude Opus 5.5）に合わせた

### 未完（段階Aの範囲外・次段階へ）
- 190ノードの戦闘効果ハンドラ（段階B/C）。UI（ツリー画面）と QA の apply/observe/verify（段階D）

## 段階B（共通基盤）
### 完了
新規コードは `js/game/skills/` に分けた。Game.js にはフックの呼び出しだけを入れた（`this.skillRt` が null なら素通り）。
- `Runtime.js`：プレイヤー別の状態（取得ID・設定・回数 turn/match・会心蓄積・Q05 集中・C08 確定フラグ・L03 運命蓄積・魂/貯蔵MP/血気/余剰回復/SP・債務・予約・墓地・蘇生回数・トークン生成数・pub/vars・counts）、
  Game のイベント → スキルイベントの変換、原アクションごとの FIFO キュー、段階順の配送、派生の深度/件数上限、区間の成功上限、追加発動の規則（spawnExtra）、mods、任意アクション、getState の公開/非公開、serialize/restore、QA ログ
- `Events.js`（SKILL_EVENTS・ORIGINS・EXTRA_ORIGINS・STAGES・EXTRA_EXCEPTIONS・makeEvent）・`Limits.js`（深度8・派生128・区間成功128・資源上限・確率上限・倍率上限3・トークン上限・使い魔・蘇生回数）
- `Luck.js`（5.3 のパイプライン）・`Crit.js`（5.2。ratioAmount で丸め）・`Resources.js`（資源・城壁/シールドの新規生成上限・HP支払・債務）・`Scheduled.js`（予約）・`Units.js`（空き枠・トークン・使い魔・墓地・蘇生・生贄・送還）・`Cards.js`（追加ドロー・山札から種類で引く・回収・コピー・先頭確認）
- `handlers/index.js`（登録表）と系統別の空ファイル `handlers/{C,M,E,L,P,H,U,G,R,D,A,T,S,K,F,Q,V,I,B,X}.js`
- Game の新メソッド：`listSkillActions(playerId)`・`skillAction(playerId, actionId, args)`・`skillEvents`（getter）・`observeSkills(fn)`・`skillCounters(playerId)`。`playCard(cardId, target, skillOptions)` の第3引数（HP置換の量などスキルの任意の選択）
- 基盤が直接実装したノード（`CORE_IMPLEMENTED`）：L01・L02・L03・L08（幸運）、C01・C02・C03・C05（会心の解放・蓄積・倍率・処刑）、X11（豪運）、X17（持続ダメージの会心）、X48（SP20以上で会心率+10pt）。
  Q05 の「集中」と C08 の「次の会心確定」は、**消費**だけ Crit.js にある（`state.critFocus` / `state.critForcedNext` を立てるのは段階C のハンドラ）
- テスト `tests/classic-skills-core.test.js`（12件）

### フック一覧（Game.js のどこに何を入れたか）
| 場所 | 呼ぶもの | 内容 |
|---|---|---|
| constructor の最後 | `new SkillRuntime(this, seatSkills)` | だれかがノードを1つ以上取ったときだけ。公開メソッド（start・mulligan・playCard・endTurn・discard・defend・passDefense・surrender・skillAction）をこのインスタンスだけ包み、終わりにキューを処理 |
| emit の最後 | `skillRt.onGameEvent(type, payload)` | soldierDamaged→onDamageDealt/onStatusTick、statusApplied→onStatusApplied（付与元を記録）、castleHealed/soldierHealed→onHeal、cardDrawn→onDraw（kind）、mpChanged/coinsChanged→onResourceChange、soldierDeployed→onSummon（hand/resurrection/token）、monsterDefeated→onMonsterKill、spellCast→onSpellCast、attackMissed→onMiss、elementAttached→onElementAttached、weaponEquipped→onWeaponEquip。castleDamaged は使わない（damageCastle のフックで出す） |
| beginTurn：turnStarted の直後 | `turnBegin(player)` | 新しい原アクション、各自ターンの回数・区間の成功数・トークン生成数・幸運の失敗数をリセット |
| beginTurn：skillTurnStart の直後 | `turnStart(player)` | HP債務 → 予約効果 → 出血の tick → onTurnStart → キュー処理。決着したら return |
| beginTurn：毎ターンのドロー | `normalDraw(player, n, draw)` | mods beforeNormalDraw（X15 などが置き換えられる）、onDraw の kind "normal" |
| advanceSoldiers：毒・やけどの tick | `dotAmount` / `dotHold` | 付与元の mods dotAmount・X17 会心／mods dotHold（T02 の期限見送り） |
| damageCastle：身代わりのあと | `castleHit` | 城への直接攻撃（source soldier/spell）の hitBaseAdd → hitBasePct → 会心（X10）→ castlePierce（城壁を通らない量） |
| damageCastle：城HPを減らす直前 | `castleLoss` | 敵由来なら mods castleReduce（D04/D06/X38）→ 致死なら castleLethal（X14 → D08。order で並べる）。castleDamaged に prevented・pierce（0でなければ） |
| damageCastle：castleDamaged のあと | `castleDamaged` | onCastleDamage、城壁が攻撃で0になれば onWallBreak |
| spellHit（魔法の兵士への命中すべて） | `hit` / `afterHit` | 回避（hitEvade）→ hitBaseAdd → hitBasePct → 会心（C01）→ hitReduce → 既存の魔の血・盾・土の精霊 → onAttackResolve |
| fight（両方向）・shoot（兵士へ） | `hit` / `afterHit` | 同上（kind "fight"/"shot"、origin "normalAttack"）。回避は既存の外れ（missD/missA/miss）にまとめる |
| triggerReaction | `reactionDamage` / `reacted` | 起こした人の mods reactionDamage（E04・E06 は既存の skillBonus のまま）→ onReaction |
| removeSoldier | `unitRemoved` | トークンは onTokenGone だけ。killed の非トークンは墓地の記録（既存の lastFallen と結びつける）・撃破した人の SP+1・onUnitDeath（死亡時の攻撃力・位置・状態の付与元のスナップショット） |
| checkPlayable | `canAfford` | 乱数を使わない見積もりで MP 不足でも出せるか（HP置換など） |
| playCard | `beginCard` → `planCardCost` → `cardPaid` | 原アクション "hand"。mods mpCost（軽減）→ mpToHp（HP置換）。MP を払い cardPlayed のあと HP 支払と onCardPlayed（相手には onEnemyCardPlayed） |
| throwAway | `copyGone` | `card.skillCopy` のコピーは捨て札・使い切り置き場に入れずに消える |
| changeMp | `mpOverflow` | 上限を超えた回復量（P02 の貯蔵） |
| castSpell の healOwnCastle | `healAmount` / `healResult` | mods healAmount → 実回復と余剰 → mods healOverflow（X08 → R02 を order で）→ onHeal に overflow |
| endTurn の最初 | `turnEnd(player)` | mods turnEnd・onTurnEnd（T03・X44 など） |
| getState | `stateFor(id, viewerId)` | `players[id].skillState`（ノードを取った人だけ）。相手には resources・debt・tokens・scheduledCount・graveCount・public だけ。本人には uses・会心/幸運の蓄積・scheduled・grave・peek・counters・actions も |
| Card.toState | — | `skillCopy` のカードだけ `copy: true` |

### ハンドラ登録APIの書き方（段階C は `handlers/<系統>.js` だけを書く）
```js
// handlers/C.js の例（実際の効果の数値・回数は params から読む）
export default {
  C06: {
    on: {
      onAttackResolve: {
        stage: 'extra', // state → lethal → death → resource → extra の順。同じ段階はスキルID → 席の順
        fn(api, ev) {
          if (ev.ownerId !== api.playerId || !ev.crit || !ev.direct || ev.killed) return; // 追加由来の会心（ev.direct false）からは誘発しない
          if (!api.canUse()) return; // 各自ターン params.perTurn 回
          if (!api.roll(api.params.chance)) return; // 幸運の対象の判定（L01/L08/L02/L03 が自動でかかる）
          const extra = api.spawnExtra('extraAttack'); // 追加発動からの追加・上限はここで拒否される
          if (!extra.ok || !api.trigger({ targetId: ev.targetId })) return; // trigger：counters と区間の成功上限
          const found = api.findSoldier(ev.targetId);
          if (!found) return; // 対象不在は不発（回数を消費しない）
          api.as('extraAttack', () => api.game.spellHit(found.owner, found.soldier, Math.max(1, Math.floor(ev.amount * api.params.powerRatio)), { def: {} }));
          api.consume();
        },
      },
    },
  },
  C08: { on: { onUnitDeath(api, ev) { /* 会心で倒したら api.state.critForcedNext = true（消費は Crit.js） */ } } },
};
// 数値補正（同期）：mods: { hitBaseAdd(api, ctx) { return ctx.kind === 'spell' && ctx.direct ? 2 : 0; } }
// 致死防止の順：mods: { castleLethal: { order: 10, fn(api, ctx) { ctx.loss = ctx.owner.castle.hp - 1; } } }（X14 は order 10、D08 は 20）
// 任意アクション：actions: { P03: { list(api) => [{ args }], check(api, args) => ({ ok, reason, cost: { mp, sp, hp, soul, blood, storedMp, healStore, coins }, preview }), run(api, args, plan) } }
//   回数は scope（params に perMatch があれば 'match'、なければ 'turn'）と limit（params.perTurn/perMatch）。runAction が支払→run→consume→counters を原子的に行う
// 予約：api.schedule({ targetId, basePower, data }) → 所有者の次の自ターン開始に scheduled(api, item)
```
- `api` のメソッド：`params / config / state / player / owns / canUse / canUseMatch / consume / consumeMatch / used / roll / random / pick / trigger / spawnExtra / as / emit / gain / spend / mp / coins / addArmor / addShield / payHp / schedule / drawExtra / drawFirstMatching / recover / addCopy / summonToken / revive / fixedDamage / bleed / findSoldier / adjacentSoldiers`
- スキルイベントのフィールド：`eventId, type, rootActionId, parentEventId, ownerId, sourceSkillId, sourceCardId, targetId, origin, depth, amount, ok, reason, turn, isExtra, direct` ＋ 種類ごとの値（Runtime.js の enqueue の呼び出し）
- mods 名と ctx：hitEvade（ctx.evaded=true）、hitBaseAdd / hitBasePct / hitReduce / critChance / critMultiplier（数を返す）、castlePierce（ctx.pierce）、castleReduce / castleLethal（ctx.loss）、reactionDamage（ctx.damage）、dotAmount（ctx.amount）、dotHold（ctx.hold）、healAmount（ctx.amount）、healOverflow（ctx.remaining を減らして使う）、mpOverflow（ctx.overflow）、mpCost（ctx.cost。ctx.preview なら乱数を使わない）、mpToHp（ctx.cost / ctx.hp、ctx.options）、hpPayWaive（ctx.waived）、hpPayDefer（ctx.deferred）、luckFinalFail（ctx.entry・ctx.retry）、beforeNormalDraw（ctx.count・ctx.handled）、turnEnd

### 既存仕様に存在しないもの（調べた結果）
- **罠**：Game にもクラシックのカードにも罠はない（advanceSoldiers のコメントの「トラップ」は実装なし）。`onTrap` は名前だけ予約し、発行しない。F02・F05・F06・F08・X23・X42 は罠の新設が必要
- **固定兵器**：ない（クラシックの「武器」は兵士に装備するカード）。`onWeaponAttack` は発行しない。A02・F01・F03・F04・X25・X43 は対象がない
- **通常攻撃**：兵士の行動は進軍中の自動の戦い（fight）と、弓兵・魔法使いの射撃（shoot）だけ。別の「攻撃する」操作はない。どちらも origin "normalAttack"
- **出血**：ない → スキル専用の最小定義（`soldier.skillBleed`。対象の持ち主のターン開始に固定ダメージ、盾無視、同種は期限の大きい方、同じ付与元は加算しない。`api.bleed`）。毒・やけどは既存
- **SP**：クラシックにない → スキルを持つ試合だけの最小追加（`state.res.sp`、初期0・上限30、非トークンの敵兵士の撃破 +1。撃破した人は「最後にダメージを与えた人」）。**戦闘内コイン**は既存（player.coins・changeCoins）を使う
- **墓地**：既存は「最後に倒れた兵士1体」（player.lastFallen）だけ → スキルを持つ人には墓地の一覧（`state.grave`）を記録し、既存の lastFallen と結びつけて同じ死亡で2回生き返らないようにした。兵士カードは使った時点で捨て札にあるので、G04 の「手札に戻す」は捨て札の同じカード（`grave[].cardId`）を回収する想定（なければ不発）
- **空き枠**：盤面に枠の上限はない（同じマスに何体でも置ける）→ トークン・使い魔の「空き枠」は「自分の城の前（マス0）に自分の兵士がいない道」とした（安定したレーン順）

### 確認した結果（段階B終了時）
- `node --test`：914件 pass / 0 fail（段階A の902件＋新規12件）
- `node tests/sim/run.js --games 20 --seed 1 --json`（通常）・`--mode factions`・`--mode classic --games 10`（スキルなし）が変更前（90c2d8b）と完全一致
- スキルありクラシック：基盤が実装したノードを含まないビルド（bloodHealDefense・graveTroopsSummon・elementManaMagic）は変更前と完全一致。critMagicLuck は C01/C02/L01/L02 などが効くので結果が変わる（意図どおり）

### 判断メモ（段階B）
- **フックの入口は1つ**：`this.skillRt` は「skillTree を渡し、かつだれかがノードを取った」ゲームだけ。null のときは全フックが素通りで乱数を使わない。スキルのない人どうしの処理もそのまま（Runtime の中で人ごとに見る）
- **キューの区切り**：原アクション（手札の使用・ターン開始・ターン終了・任意アクション）を beginRoot で切り、前のキューは先に処理する。Game の公開メソッドの終わりでも処理（防御待ちの間は待つ）。進軍中の死亡に対する効果（G08 など）は、その公開メソッドの終わり（進軍が終わったあと）に解決される
- **会心の位置**：属性の相性ボーナスは既存の fightDamage の中で攻撃力と一緒に計算されるので、基礎威力補正・会心は fightDamage の結果に掛ける（属性ボーナスも会心倍率の対象になる。既存順序を優先）。魔法は spellHit の入口（ステージ・ドルイドの加算のあと）
- **回避**は既存の「外れ」にまとめる（fight・shoot）。魔法の回避は attackMissed に evaded: true
- **撃破の判定**：soldierDamaged の直前に最後にダメージを与えた人（hit・スキルの文脈・持続ダメージの付与元）を覚えておき、removeSoldier で使う
- **静的な10ノード**（P01 など）は段階A の skillMods のまま（載せ替えはしていない。挙動は不変）。counters は null（試合開始時の数値なので発動回数がない）
- **リソースの上限**：城壁は既存の armorMax（クラシックは40）を使い、armorMax がないゲームだけ暫定10。シールドは既存上限がないので、スキルによる新規生成だけ10まで（既存の値は削らない）
- **HP支払**は castleDamaged（source kind "hpCost"）を出す（画面の表示用）。スキルイベントは onHpPayment だけで、onCastleDamage にはしない
- **イベントの元**：ログ（skillEvents）は最大5000件で古いものから捨てる（counters は捨てない）。スキルの文脈で起きた実ダメージ・実回復・召喚・城壁・シールドは kind "effect" で記録

### 未完（段階C/D へ）
- 段階C：CORE 以外のノードのハンドラ（handlers/<系統>.js）。罠・固定兵器を使うノードは既存機能がないので、新設するか休眠のままにするかの判断が必要
- CPU の任意アクションの選択（strategies.js）と画面（段階D）。`playCard` の第3引数（HP置換の量）を CPU・画面から渡す
- H01（開始手札の選び直し）は試合開始時のフックが未整備（既存のマリガンとの関係を段階C で決める）
- QA adapter の apply/verify は段階D（observe は `game.observeSkills` / `game.skillEvents` / `game.skillCounters` で用意済み）

## ノード別状況（C段階で更新）
段階A時点：STATIC_HANDLERS の10ノード（P01・P07・D01・D05・U01・U04・R01・E01・E04・E06）だけ効果あり。ほか190ノードはデータのみ（新ハンドラ未実装）
段階B時点：上の10ノード（static）＋基盤が直接実装した11ノード（L01・L02・L03・L08・C01・C02・C03・C05・X11・X17・X48）。Q05・C08 は消費側だけ。ほか179ノードは休眠

## 未実装・既知の制限
- 効果ハンドラ未実装の190ノードは取得できるが戦闘で何も起きない（UI で未実装表示が必要）
- 旧24ノード版の効果キーのうち休眠中：castleHp・initialHand・maxHand・soldierAttack・castleSpell・mpPerTurn・coinPerTurn・spellDamage・castleRegen・soldierHp・monsterCoins・randomAttachTurns
