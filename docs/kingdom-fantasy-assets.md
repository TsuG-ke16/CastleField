# カード・UIアセット棚卸し（2026-11-26）

> 第1段階の記録です。追加実装・画像制作・現在の検証結果は [第2レビュー対応](kingdom-fantasy-v2.md) を参照してください。旧不足候補61件は現在、生成画像または意味の一致する既存絵へ対応済みです。

ファイルの存在と現行UIの対応を分けて確認。候補パスがないだけで生成を発注しない。既存流用で十分なカードは同じ絵を使う。

## 不足候補（定義からの機械照合）

| データ | ID / 名前 | 候補パス | 優先度・対応 |
|---|---|---|---|
| `data/classic/cards.json` | `classic_king_infantry` 歩兵 | `assets/cards/card-classic-king-infantry.png` | P1: クラシックの専用対応なし。既存絵との対応表を先に作る |
| `data/classic/cards.json` | `classic_king_cavalry` 騎兵 | `assets/cards/card-classic-king-cavalry.png` | P1: クラシックの専用対応なし。既存絵との対応表を先に作る |
| `data/classic/cards.json` | `classic_king_archer` 弓兵 | `assets/cards/card-classic-king-archer.png` | P1: クラシックの専用対応なし。既存絵との対応表を先に作る |
| `data/classic/cards.json` | `classic_king_heavy` 重装兵 | `assets/cards/card-classic-king-heavy.png` | P1: クラシックの専用対応なし。既存絵との対応表を先に作る |
| `data/classic/cards.json` | `classic_king_priest` 聖術師 | `assets/cards/card-classic-king-priest.png` | P1: クラシックの専用対応なし。既存絵との対応表を先に作る |
| `data/classic/cards.json` | `classic_king_holy_sword` 聖鉄の剣 | `assets/cards/card-classic-king-holy-sword.png` | P1: クラシックの専用対応なし。既存絵との対応表を先に作る |
| `data/classic/cards.json` | `classic_king_lumina_lance` ルミナスランス | `assets/cards/card-classic-king-lumina-lance.png` | P1: クラシックの専用対応なし。既存絵との対応表を先に作る |
| `data/classic/cards.json` | `classic_king_lumina` ルミナ | `assets/cards/card-classic-king-lumina.png` | P1: クラシックの専用対応なし。既存絵との対応表を先に作る |
| `data/classic/cards.json` | `classic_king_minor_heal` 小回復 | `assets/cards/card-classic-king-minor-heal.png` | P1: クラシックの専用対応なし。既存絵との対応表を先に作る |
| `data/classic/cards.json` | `classic_king_heal` ヒール | `assets/cards/card-classic-king-heal.png` | P1: クラシックの専用対応なし。既存絵との対応表を先に作る |
| `data/classic/cards.json` | `classic_king_shield` 盾 | `assets/cards/card-classic-king-shield.png` | P1: クラシックの専用対応なし。既存絵との対応表を先に作る |
| `data/classic/cards.json` | `classic_king_wall` 城壁 | `assets/cards/card-classic-king-wall.png` | P1: クラシックの専用対応なし。既存絵との対応表を先に作る |
| `data/classic/cards.json` | `classic_king_purify` 浄化 | `assets/cards/card-classic-king-purify.png` | P1: クラシックの専用対応なし。既存絵との対応表を先に作る |
| `data/classic/cards.json` | `classic_king_holy_ray` ホーリーレイ | `assets/cards/card-classic-king-holy-ray.png` | P1: クラシックの専用対応なし。既存絵との対応表を先に作る |
| `data/classic/cards.json` | `classic_king_holy_fireball` 聖なる火球 | `assets/cards/card-classic-king-holy-fireball.png` | P1: クラシックの専用対応なし。既存絵との対応表を先に作る |
| `data/classic/cards.json` | `classic_king_rampart_volley` 聖壁の号砲 | `assets/cards/card-classic-king-rampart-volley.png` | P1: クラシックの専用対応なし。既存絵との対応表を先に作る |
| `data/classic/cards.json` | `classic_demon_skeleton` 骸骨兵 | `assets/cards/card-classic-demon-skeleton.png` | P1: クラシックの専用対応なし。既存絵との対応表を先に作る |
| `data/classic/cards.json` | `classic_demon_imp` 小悪魔 | `assets/cards/card-classic-demon-imp.png` | P1: クラシックの専用対応なし。既存絵との対応表を先に作る |
| `data/classic/cards.json` | `classic_demon_curser` 呪術師 | `assets/cards/card-classic-demon-curser.png` | P1: クラシックの専用対応なし。既存絵との対応表を先に作る |
| `data/classic/cards.json` | `classic_demon_shadow_scythe` シャドウサイズ | `assets/cards/card-classic-demon-shadow-scythe.png` | P1: クラシックの専用対応なし。既存絵との対応表を先に作る |
| `data/classic/cards.json` | `classic_demon_frost_blade` フロストブレード | `assets/cards/card-classic-demon-frost-blade.png` | P1: クラシックの専用対応なし。既存絵との対応表を先に作る |
| `data/classic/cards.json` | `classic_demon_chaos_rod` カオスロッド | `assets/cards/card-classic-demon-chaos-rod.png` | P1: クラシックの専用対応なし。既存絵との対応表を先に作る |
| `data/classic/cards.json` | `classic_demon_frost_breath` 氷の息 | `assets/cards/card-classic-demon-frost-breath.png` | P1: クラシックの専用対応なし。既存絵との対応表を先に作る |
| `data/classic/cards.json` | `classic_demon_poison_mist` 毒の霧 | `assets/cards/card-classic-demon-poison-mist.png` | P1: クラシックの専用対応なし。既存絵との対応表を先に作る |
| `data/classic/cards.json` | `classic_demon_soul_shard` 魂の欠片 | `assets/cards/card-classic-demon-soul-shard.png` | P1: クラシックの専用対応なし。既存絵との対応表を先に作る |
| `data/classic/cards.json` | `classic_demon_blood_veil` 血の膜 | `assets/cards/card-classic-demon-blood-veil.png` | P1: クラシックの専用対応なし。既存絵との対応表を先に作る |
| `data/classic/cards.json` | `classic_demon_bone_shield` 骨の盾 | `assets/cards/card-classic-demon-bone-shield.png` | P1: クラシックの専用対応なし。既存絵との対応表を先に作る |
| `data/classic/cards.json` | `classic_demon_shadow` シャドウ | `assets/cards/card-classic-demon-shadow.png` | P1: クラシックの専用対応なし。既存絵との対応表を先に作る |
| `data/classic/cards.json` | `classic_demon_curse_mark` 呪いの印 | `assets/cards/card-classic-demon-curse-mark.png` | P1: クラシックの専用対応なし。既存絵との対応表を先に作る |
| `data/classic/cards.json` | `classic_demon_dark_fireball` 闇の火球 | `assets/cards/card-classic-demon-dark-fireball.png` | P1: クラシックの専用対応なし。既存絵との対応表を先に作る |
| `data/classic/cards.json` | `classic_demon_echo_soul` 残響の魂 | `assets/cards/card-classic-demon-echo-soul.png` | P1: クラシックの専用対応なし。既存絵との対応表を先に作る |
| `data/classic/cards.json` | `classic_demon_chaos_pulse` カオスパルス | `assets/cards/card-classic-demon-chaos-pulse.png` | P1: クラシックの専用対応なし。既存絵との対応表を先に作る |
| `data/factions/cards/dragon.json` | `fac_dragon_mage` 竜術師 | `assets/cards/card-fac-dragon-mage.png` | P1: factionArt.js / art.js の対応と代替絵を確認して制作 |
| `data/factions/cards/dragon.json` | `fac_dragon_scale_guard` 竜鱗兵 | `assets/cards/card-fac-dragon-scale-guard.png` | P1: factionArt.js / art.js の対応と代替絵を確認して制作 |
| `data/factions/cards/dragon.json` | `fac_dragon_ancient_barrier` 古竜の障壁 | `assets/cards/card-fac-dragon-ancient-barrier.png` | P1: factionArt.js / art.js の対応と代替絵を確認して制作 |
| `data/factions/cards/dragon.json` | `fac_dragon_wing_decoy` 竜翼の身代わり | `assets/cards/card-fac-dragon-wing-decoy.png` | P1: factionArt.js / art.js の対応と代替絵を確認して制作 |
| `data/factions/cards/kingdom.json` | `fac_king_hero` 勇者 | `assets/cards/card-fac-king-hero.png` | P1: factionArt.js / art.js の対応と代替絵を確認して制作 |
| `data/factions/cards/kingdom.json` | `fac_king_god_sword` 神剣 | `assets/cards/card-fac-king-god-sword.png` | P1: factionArt.js / art.js の対応と代替絵を確認して制作 |
| `data/factions/cards/kingdom.json` | `fac_king_god_shield` 神盾 | `assets/cards/card-fac-king-god-shield.png` | P1: factionArt.js / art.js の対応と代替絵を確認して制作 |
| `data/factions/cards/kingdom.json` | `fac_king_siege` 攻城兵 | `assets/cards/card-fac-king-siege.png` | P1: factionArt.js / art.js の対応と代替絵を確認して制作 |
| `data/factions/cards/kingdom.json` | `fac_king_judgement` 天罰の光 | `assets/cards/card-fac-king-judgement.png` | P1: factionArt.js / art.js の対応と代替絵を確認して制作 |
| `data/factions/cards/kingdom.json` | `fac_king_chain_sword` 聖鎖の剣 | `assets/cards/card-fac-king-chain-sword.png` | P1: factionArt.js / art.js の対応と代替絵を確認して制作 |
| `data/factions/cards/forest.json` | `fac_forest_flame_sword` フレイムソード | `assets/cards/card-fac-forest-flame-sword.png` | P1: factionArt.js / art.js の対応と代替絵を確認して制作 |
| `data/factions/cards/forest.json` | `fac_forest_aqua_spear` アクアスピア | `assets/cards/card-fac-forest-aqua-spear.png` | P1: factionArt.js / art.js の対応と代替絵を確認して制作 |
| `data/factions/cards/forest.json` | `fac_forest_gale_bow` ゲイルボウ | `assets/cards/card-fac-forest-gale-bow.png` | P1: factionArt.js / art.js の対応と代替絵を確認して制作 |
| `data/factions/cards/forest.json` | `fac_forest_earth_hammer` アースハンマー | `assets/cards/card-fac-forest-earth-hammer.png` | P1: factionArt.js / art.js の対応と代替絵を確認して制作 |
| `data/factions/cards/forest.json` | `fac_forest_flare_seed` フレアシード | `assets/cards/card-fac-forest-flare-seed.png` | P1: factionArt.js / art.js の対応と代替絵を確認して制作 |
| `data/factions/cards/forest.json` | `fac_forest_spring_wave` スプリングウェーブ | `assets/cards/card-fac-forest-spring-wave.png` | P1: factionArt.js / art.js の対応と代替絵を確認して制作 |
| `data/factions/cards/forest.json` | `fac_forest_leaf_storm` リーフストーム | `assets/cards/card-fac-forest-leaf-storm.png` | P1: factionArt.js / art.js の対応と代替絵を確認して制作 |
| `data/factions/cards/forest.json` | `fac_forest_root_bind` ルートバインド | `assets/cards/card-fac-forest-root-bind.png` | P1: factionArt.js / art.js の対応と代替絵を確認して制作 |
| `data/factions/cards/forest.json` | `fac_forest_warden` 森の番人 | `assets/cards/card-fac-forest-warden.png` | P1: factionArt.js / art.js の対応と代替絵を確認して制作 |
| `data/factions/cards/forest.json` | `fac_forest_treant` 樹人 | `assets/cards/card-fac-forest-treant.png` | P1: factionArt.js / art.js の対応と代替絵を確認して制作 |
| `data/factions/cards/forest.json` | `fac_forest_herb` 薬草の湿布 | `assets/cards/card-fac-forest-herb.png` | P1: factionArt.js / art.js の対応と代替絵を確認して制作 |
| `data/factions/cards/forest.json` | `fac_forest_old_root` 古木の根 | `assets/cards/card-fac-forest-old-root.png` | P1: factionArt.js / art.js の対応と代替絵を確認して制作 |
| `data/factions/cards/demon.json` | `fac_demon_zombie` ゾンビ | `assets/cards/card-fac-demon-zombie.png` | P1: factionArt.js / art.js の対応と代替絵を確認して制作 |
| `data/factions/cards/demon.json` | `fac_demon_ice_wraith` 氷の亡者 | `assets/cards/card-fac-demon-ice-wraith.png` | P1: factionArt.js / art.js の対応と代替絵を確認して制作 |
| `data/factions/cards/demon.json` | `fac_demon_chaos_spawn` 混沌の落とし子 | `assets/cards/card-fac-demon-chaos-spawn.png` | P1: factionArt.js / art.js の対応と代替絵を確認して制作 |
| `data/factions/cards/demon.json` | `fac_demon_drain_blade` 吸命の剣 | `assets/cards/card-fac-demon-drain-blade.png` | P1: factionArt.js / art.js の対応と代替絵を確認して制作 |
| `data/factions/cards/demon.json` | `fac_demon_vulnerable` 脆弱 | `assets/cards/card-fac-demon-vulnerable.png` | P1: factionArt.js / art.js の対応と代替絵を確認して制作 |
| `data/factions/cards/demon.json` | `fac_demon_blood_pact` 血の契約 | `assets/cards/card-fac-demon-blood-pact.png` | P1: factionArt.js / art.js の対応と代替絵を確認して制作 |
| `data/factions/cards/demon.json` | `fac_demon_mana_seal` 封魔 | `assets/cards/card-fac-demon-mana-seal.png` | P1: factionArt.js / art.js の対応と代替絵を確認して制作 |

照合 230件、候補PNGあり 169件、なし 61件。PNGがあるカードすべての絵柄を個別に承認したという意味ではない。

## 調査した素材と判断

- `assets/ui/natural/`: 木枠・無地の羊皮紙・厚みのあるボタンは再利用可能。スキルツリー背景にも流用済み。
- `assets/ui/kingdom-crest.png`: START・見出しに流用。19系統の既存アイコンはすべて存在する。
- `icon-wind.png`: 横断ノードは現在風のアイコン。専用の「二つの道が交わる石橋」候補をP2とする。いまは六角形と横断ラベルで識別。
- 系統アイコン: 手札=`ui/home/deck.png`、情報=`icon-kind-wild.png`、墓地=`icon-rarity-epic.png`等は意味が間接的。P2で巻物・偵察の目・墓石に置き換える候補。
- 通常/横断/奥義枠・接続線: SVG/CSSで実装済み。追加PNGは不要。解像度や通信量を増やさない。
- `bg/home-arena-duel.png` / `home-arena-factions.png`: 可愛い城と地面が基準に合う。保持。
- `HomeDioramaGL.js`: 宇宙表現は画像不足ではなく描画側。惑星を非表示、星雲をゼロ、自然な空色へ修正済み。
- 代表素材の視覚確認: 解毒薬PNGは緑の薬びん、魔物枠はルビー赤で、STYLEの主役・配色の指示に合う。`card-fac-king-holy-sword.png` は翼と宝石付きの剣なので、STYLEの「陣営を示すためだけの紋章・宝石の枠を足さない」に照らし、カード固有の意味に必要な装飾か次回レビューする（絵柄そのものは同系統）。
- `assets/STYLE.md` の解毒薬・ルビー枠・ランク素材の記述は制作時点の課題を含む。現在のPNGの有無だけで「未制作」と断定しない。

## 次の制作優先度

1. P1: クラシック32種の描画対応表。`cardArt()` には classic_* の専用マッピングがなく、既存絵の再利用と新規絵の必要分を先に分ける。歩兵・騎兵・火球・回復等は既存絵を第一候補。ロジック側のカード定義は変更しない。
2. P1: 未対応カードの1文字代替を実画面で確認。画像と対応コードの両方が必要。
3. P2: 横断・情報・墓地・手札の専用UIアイコン。すべて無文字・単体・太いこげ茶線。
4. P3: ランクとスキンの装飾。魔法・レア演出以外の常時発光は増やさない。

## 絵柄ズレの視覚確認

`asset-contact.jpg` にカード・枠・既存アイコン・背景の代表例を並べた。カード主役を勝手に描き替えず、兵士は2頭身、武器は道具単体、魔法は現象単体というSTYLE.mdの規則を制作時に再確認する。全カードの個別審査は未完了。レビュー用原画やマスクは不足数に含めない。
