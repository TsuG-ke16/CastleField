# 4陣営カード画像（PR #178）

対象: `feature/factions-slim-classic-style` の `ed3b9ab9b6f07dafbcc259195c17b50b90658dc3`。王国15・森14・魔族15・竜12の56種類。旧案（#163〜#166）の349種類ではない。

## 確認する方法

リポジトリのルートで `python3 -m http.server 8000` を起動し、`http://localhost:8000/assets/review/factions-card-art/gallery.html` を開く。ゲームの `cardArt` で全56種類、`unitArt` で兵士15種類（青・オレンジ両席）の画像を表示する。陣営名のリンクで絞り込める。

## 画像と表示

兵士15種は既存の兵士の絵柄を参照してOpenAI画像生成（ChatGPT）で作成。兵士以外の41種は、14種に既存カードの絵を再利用し、27種を対応する既存の道具・魔法カードを直接参照して修正。術者・竜や、陣営を示すためだけの紋章・装飾枠を加えず、道具・現象そのものを主役にした。精霊は既存の精霊カードを使う。透過PNG、512×512、各300KB以下。原本を保持したまま配信用に縮小・圧縮。画像ごとの原本ファイル名は `assets/asset-manifest.json`、出典は `assets/CREDITS.md`。

カードIDと画像の対応は `js/ui/factionArt.js` に明示し、`art.js` のカードと兵士の両方から参照する。色や構図は対応する既存カードに合わせ、陣営の違いを示すためだけに装飾を足さない。兵士はカードと同じ透過画像を使い、席の識別は既存のUIに従う。

## モード本体との接続

#178は4陣営の画面・サーバー接続が未実装で、モードもhidden/available:false。この画像追加ではプレイ可能化は行わない。接続担当は56種類の `fac_*` IDをそのまま `cardArt` / `unitArt` に渡せば専用画像が表示される。

## 王国（15種類）

| カード | ID | 画像 |
|---|---|---|
| 歩兵 | `fac_king_infantry` | [画像](../../cards/card-fac-king-infantry.png) |
| 騎兵 | `fac_king_cavalry` | [画像](../../cards/card-fac-king-cavalry.png) |
| 弓兵 | `fac_king_archer` | [画像](../../cards/card-fac-king-archer.png) |
| 重装兵 | `fac_king_heavy` | [画像](../../cards/card-fac-king-heavy.png) |
| 聖術師 | `fac_king_priest` | [画像](../../cards/card-fac-king-priest.png) |
| 聖鉄の剣 | `fac_king_holy_sword` | [画像](../../cards/card-fac-king-holy-sword.png) |
| ルミナスランス | `fac_king_lumina_lance` | [画像](../../cards/card-fac-king-lumina-lance.png) |
| ルミナ | `fac_king_lumina` | [画像](../../cards/card-fac-king-lumina.png) |
| ホーリーレイ | `fac_king_holy_ray` | [画像](../../cards/card-fac-king-holy-ray.png) |
| 小回復 | `fac_king_minor_heal` | [画像](../../cards/card-fac-king-minor-heal.png) |
| ヒール | `fac_king_heal` | [画像](../../cards/card-fac-king-heal.png) |
| 盾 | `fac_king_shield` | [画像](../../cards/card-fac-king-shield.png) |
| 城壁 | `fac_king_wall` | [画像](../../cards/card-fac-king-wall.png) |
| 身代わり | `fac_king_decoy` | [画像](../../cards/card-fac-king-decoy.png) |
| 浄化 | `fac_king_purify` | [画像](../../cards/card-fac-king-purify.png) |

## 森の同盟（14種類）

| カード | ID | 画像 |
|---|---|---|
| 獣人 | `fac_forest_beastman` | [画像](../../cards/card-fac-forest-beastman.png) |
| エルフ | `fac_forest_elf` | [画像](../../cards/card-fac-forest-elf.png) |
| ドルイド | `fac_forest_druid` | [画像](../../cards/card-fac-forest-druid.png) |
| 火炎弾 | `fac_forest_fire_bolt` | [画像](../../cards/card-fac-forest-fire-bolt.png) |
| 水流 | `fac_forest_water_stream` | [画像](../../cards/card-fac-forest-water-stream.png) |
| 突風 | `fac_forest_gust` | [画像](../../cards/card-fac-forest-gust.png) |
| 地割れ | `fac_forest_fissure` | [画像](../../cards/card-fac-forest-fissure.png) |
| 火の精霊 | `fac_forest_fire_spirit` | [画像](../../cards/card-fac-forest-fire-spirit.png) |
| 水の精霊 | `fac_forest_water_spirit` | [画像](../../cards/card-fac-forest-water-spirit.png) |
| 風の精霊 | `fac_forest_wind_spirit` | [画像](../../cards/card-fac-forest-wind-spirit.png) |
| 土の精霊 | `fac_forest_earth_spirit` | [画像](../../cards/card-fac-forest-earth-spirit.png) |
| 生命の雫 | `fac_forest_life_drop` | [画像](../../cards/card-fac-forest-life-drop.png) |
| 茨の壁 | `fac_forest_thorn_wall` | [画像](../../cards/card-fac-forest-thorn-wall.png) |
| 樹皮の盾 | `fac_forest_bark_shield` | [画像](../../cards/card-fac-forest-bark-shield.png) |

## 魔族軍（15種類）

| カード | ID | 画像 |
|---|---|---|
| 骸骨兵 | `fac_demon_skeleton` | [画像](../../cards/card-fac-demon-skeleton.png) |
| 小悪魔 | `fac_demon_imp` | [画像](../../cards/card-fac-demon-imp.png) |
| 呪術師 | `fac_demon_curser` | [画像](../../cards/card-fac-demon-curser.png) |
| シャドウサイズ | `fac_demon_shadow_scythe` | [画像](../../cards/card-fac-demon-shadow-scythe.png) |
| フロストブレード | `fac_demon_frost_blade` | [画像](../../cards/card-fac-demon-frost-blade.png) |
| カオスロッド | `fac_demon_chaos_rod` | [画像](../../cards/card-fac-demon-chaos-rod.png) |
| シャドウ | `fac_demon_shadow` | [画像](../../cards/card-fac-demon-shadow.png) |
| 氷の息 | `fac_demon_frost_breath` | [画像](../../cards/card-fac-demon-frost-breath.png) |
| カオスパルス | `fac_demon_chaos_pulse` | [画像](../../cards/card-fac-demon-chaos-pulse.png) |
| 毒の霧 | `fac_demon_poison_mist` | [画像](../../cards/card-fac-demon-poison-mist.png) |
| 呪いの印 | `fac_demon_curse_mark` | [画像](../../cards/card-fac-demon-curse-mark.png) |
| 魂の欠片 | `fac_demon_soul_shard` | [画像](../../cards/card-fac-demon-soul-shard.png) |
| 残響の魂 | `fac_demon_echo_soul` | [画像](../../cards/card-fac-demon-echo-soul.png) |
| 血の膜 | `fac_demon_blood_veil` | [画像](../../cards/card-fac-demon-blood-veil.png) |
| 骨の盾 | `fac_demon_bone_shield` | [画像](../../cards/card-fac-demon-bone-shield.png) |

## 竜族帝国（12種類）

| カード | ID | 画像 |
|---|---|---|
| 竜人の新兵 | `fac_dragon_recruit` | [画像](../../cards/card-fac-dragon-recruit.png) |
| 竜騎兵 | `fac_dragon_dragoon` | [画像](../../cards/card-fac-dragon-dragoon.png) |
| 幼炎竜 | `fac_dragon_flame_whelp` | [画像](../../cards/card-fac-dragon-flame-whelp.png) |
| 幼雷竜 | `fac_dragon_thunder_whelp` | [画像](../../cards/card-fac-dragon-thunder-whelp.png) |
| 竜牙剣 | `fac_dragon_fang_sword` | [画像](../../cards/card-fac-dragon-fang-sword.png) |
| 雷牙槍 | `fac_dragon_thunder_spear` | [画像](../../cards/card-fac-dragon-thunder-spear.png) |
| ファイアボール | `fac_dragon_fireball` | [画像](../../cards/card-fac-dragon-fireball.png) |
| 雷光 | `fac_dragon_bolt` | [画像](../../cards/card-fac-dragon-bolt.png) |
| 火炎の吐息 | `fac_dragon_flame_breath` | [画像](../../cards/card-fac-dragon-flame-breath.png) |
| 竜血の雫 | `fac_dragon_blood_drop` | [画像](../../cards/card-fac-dragon-blood-drop.png) |
| 火山灰の幕 | `fac_dragon_ash_veil` | [画像](../../cards/card-fac-dragon-ash-veil.png) |
| 幼竜の鱗 | `fac_dragon_whelp_scale` | [画像](../../cards/card-fac-dragon-whelp-scale.png) |

## デザインの基準

武器は武器、魔法は現象、防御は防御手段を主役にする。人物は兵士カード、精霊は精霊カードで描く。既存カードと新カードを同じ大きさで並べる比較は `gallery.html?compare=1` と `comparison.png`。

## 検証結果

- 全56カードのIDと画像参照、兵士15種の両席の参照、未知のIDが既存処理を使うことを確認。
- 全56画像: 正方形512×512、透明部分あり、1枚300KB以下、既存絵14種は元画像とバイト一致、manifest登録済み。
- Chromium: カード56＋兵士15×2席＝86画像を読み込み、画像エラーなし。1100pxで陣営別一覧、390×844で横はみ出しなし・陣営リンクの移動を確認。結果は `validation.json`。
- 通常モードの画面スモークテスト（`UI_TEST_CHROMIUM=/usr/bin/chromium node ui-tests/smoke.js`）: 兵士配置→51手番・41枚使用で決着→再戦。エラー・警告なし。
- `node --check js/ui/art.js`・`node --check js/ui/factionArt.js`・`git diff --check` 成功。

確認画像: [既存カードとの比較](comparison.png)・[王国](kingdom.png)・[森の同盟](forest.png)・[魔族軍](demon.png)・[竜族帝国](dragon.png)・[スマホ](mobile.png)。
