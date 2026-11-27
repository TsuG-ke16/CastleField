# カードの MP 新旧表（段階A1。数値は暫定）

段階A1（docs/skilltree-200-notes/a1-battle-tempo.md）で、クラシック（共通山札80枚）と4陣営（王国・森の同盟・魔族軍・竜族帝国）の全カードの MP（`mpCost`）を作り直した。
同時に MP の回復は 3→5／ターン（初期10・上限20は同じ）。

方針（人間の暫定仕様）：通常兵士1・特殊/大型兵士2・武器と通常防御は原則0・城壁1・回復1〜3・通常攻撃魔法2〜3・強力な攻撃魔法4〜5・特殊魔法は効果に応じて。強力な武器・防御は個別に調整。

この表にない例外の決め方：
- **+2 の武器は1**（+1 の武器は0）。凍結・吸命などの追加効果つきの +1 武器も1
- **4陣営の切り札（勇者・神剣・神盾）と天罰の光は5のまま**（人間の指示で決めた値。陣営の特徴）
- **4陣営の「1枚だけ」のカード（maxCopies 1）は MP3 以上**（既存の決まり：tests/new-cards.test.js「強さは威力でなく MP・枚数・使い切りで決める」）。樹人・薬草の湿布・竜翼の身代わり・聖鎖の剣は3、古木の根・古竜の障壁（強い城壁）は3
- **森の属性魔法4種は3のまま**（以前「いったん MP2 にしたが、人間の指示で3に戻した」。新しい範囲 2〜3 の中なので据え置き）
- **竜族は兵士を1段重くした**（幼炎竜・幼雷竜・竜術師・竜鱗兵は3。重くて強い陣営の特徴を残す）。ファイアボール（城に5）は2→3（通常攻撃魔法の範囲の上）
- クラシックの陣営カード表（data/classic/factions/forest.json・dragon.json。山札に入らず、テスト・sim だけが読む）は変えていない

## data/classic/cards.json（80枚。1枚あたりの平均 MP 1.96 → 1.60）

| カード | キー | 種類 | 枚数 | 旧MP | 新MP | 区分・理由 |
|---|---|---|---|---|---|---|
| 歩兵 | `classic_king_infantry` | 兵士 | 4 | 1 | 1 | 通常兵士 |
| 騎兵 | `classic_king_cavalry` | 兵士 | 3 | 2 | 1 ↓ | 通常兵士（速い） |
| 弓兵 | `classic_king_archer` | 兵士 | 3 | 2 | 2 | 特殊兵士（弓） |
| 重装兵 | `classic_king_heavy` | 兵士 | 2 | 2 | 2 | 大型兵士 |
| 聖術師 | `classic_king_priest` | 兵士 | 2 | 2 | 2 | 特殊兵士（術師） |
| 聖鉄の剣 | `classic_king_holy_sword` | 武器 | 2 | 2 | 1 ↓ | 強めの武器（+2） |
| ルミナスランス | `classic_king_lumina_lance` | 武器 | 2 | 1 | 0 ↓ | 通常武器（+1） |
| ルミナ | `classic_king_lumina` | 魔法 | 3 | 3 | 2 ↓ | 通常攻撃魔法（道に2） |
| 小回復 | `classic_king_minor_heal` | 魔法 | 3 | 1 | 1 | 回復（5） |
| ヒール | `classic_king_heal` | 魔法 | 2 | 3 | 3 | 回復（10） |
| 盾 | `classic_king_shield` | 防御 | 3 | 1 | 0 ↓ | 通常防御（盾） |
| 城壁 | `classic_king_wall` | 防御 | 3 | 2 | 1 ↓ | 城壁 |
| 浄化 | `classic_king_purify` | 魔法 | 2 | 2 | 2 | 特殊魔法（浄化） |
| ホーリーレイ | `classic_king_holy_ray` | 魔法 | 2 | 4 | 3 ↓ | 通常攻撃魔法（1体に5） |
| 聖なる火球 | `classic_king_holy_fireball` | 魔法 | 2 | 4 | 4 | 強力な攻撃魔法（城に6） |
| 聖壁の号砲 | `classic_king_rampart_volley` | 魔法 | 2 | 3 | 3 | 特殊魔法（城壁をぶつける） |
| 骸骨兵 | `classic_demon_skeleton` | 兵士 | 4 | 1 | 1 | 通常兵士 |
| 小悪魔 | `classic_demon_imp` | 兵士 | 3 | 2 | 1 ↓ | 通常兵士（速い） |
| 呪術師 | `classic_demon_curser` | 兵士 | 2 | 2 | 2 | 特殊兵士（術師） |
| シャドウサイズ | `classic_demon_shadow_scythe` | 武器 | 2 | 2 | 1 ↓ | 強めの武器（+2） |
| フロストブレード | `classic_demon_frost_blade` | 武器 | 2 | 1 | 0 ↓ | 通常武器（+1） |
| カオスロッド | `classic_demon_chaos_rod` | 武器 | 2 | 1 | 0 ↓ | 通常武器（+1） |
| 氷の息 | `classic_demon_frost_breath` | 魔法 | 2 | 2 | 2 | 通常攻撃魔法（道を凍結） |
| 毒の霧 | `classic_demon_poison_mist` | 魔法 | 3 | 1 | 2 ↑ | 通常攻撃魔法（永続の毒） |
| 魂の欠片 | `classic_demon_soul_shard` | 魔法 | 3 | 2 | 3 ↑ | 通常攻撃魔法（城に3・回復3） |
| 血の膜 | `classic_demon_blood_veil` | 防御 | 3 | 1 | 1 | 城壁 |
| 骨の盾 | `classic_demon_bone_shield` | 防御 | 3 | 1 | 0 ↓ | 通常防御（盾） |
| シャドウ | `classic_demon_shadow` | 魔法 | 3 | 3 | 2 ↓ | 通常攻撃魔法（1体に4） |
| 呪いの印 | `classic_demon_curse_mark` | 魔法 | 2 | 2 | 2 | 特殊魔法（呪い） |
| 闇の火球 | `classic_demon_dark_fireball` | 魔法 | 2 | 4 | 4 | 強力な攻撃魔法（城に6） |
| 残響の魂 | `classic_demon_echo_soul` | 魔法 | 2 | 3 | 3 | 特殊魔法（蘇生） |
| カオスパルス | `classic_demon_chaos_pulse` | 魔法 | 2 | 3 | 2 ↓ | 通常攻撃魔法（ランダム属性3） |

## data/factions/cards/kingdom.json（35枚。1枚あたりの平均 MP 3.06 → 2.03）

| カード | キー | 種類 | 枚数 | 旧MP | 新MP | 区分・理由 |
|---|---|---|---|---|---|---|
| 歩兵 | `fac_king_infantry` | 兵士 | 2 | 2 | 1 ↓ | 通常兵士 |
| 騎兵 | `fac_king_cavalry` | 兵士 | 2 | 3 | 1 ↓ | 通常兵士（速い） |
| 弓兵 | `fac_king_archer` | 兵士 | 2 | 3 | 2 ↓ | 特殊兵士（弓） |
| 重装兵 | `fac_king_heavy` | 兵士 | 2 | 4 | 2 ↓ | 大型兵士 |
| 勇者 | `fac_king_hero` | 兵士 | 1 | 5 | 5 | 切り札（勇者。据え置き） |
| 聖術師 | `fac_king_priest` | 兵士 | 2 | 4 | 2 ↓ | 特殊兵士（術師） |
| 聖鉄の剣 | `fac_king_holy_sword` | 武器 | 2 | 2 | 1 ↓ | 強めの武器（+2） |
| ルミナスランス | `fac_king_lumina_lance` | 武器 | 2 | 2 | 0 ↓ | 通常武器（+1） |
| 神剣 | `fac_king_god_sword` | 武器 | 1 | 5 | 5 | 切り札（神剣。据え置き） |
| ルミナ | `fac_king_lumina` | 魔法 | 2 | 3 | 2 ↓ | 通常攻撃魔法（道に2） |
| ホーリーレイ | `fac_king_holy_ray` | 魔法 | 2 | 4 | 3 ↓ | 通常攻撃魔法（1体に5） |
| ヒール | `fac_king_heal` | 魔法 | 2 | 4 | 3 ↓ | 回復（10） |
| 盾 | `fac_king_shield` | 防御 | 2 | 1 | 0 ↓ | 通常防御（盾） |
| 神盾 | `fac_king_god_shield` | 防御 | 1 | 5 | 5 | 切り札（神盾。据え置き） |
| 城壁 | `fac_king_wall` | 防御 | 2 | 2 | 1 ↓ | 城壁 |
| 身代わり | `fac_king_decoy` | 防御 | 2 | 3 | 2 ↓ | 特殊防御（身代わり） |
| 浄化 | `fac_king_purify` | 魔法 | 2 | 2 | 2 | 特殊魔法（浄化・付着除去） |
| 攻城兵 | `fac_king_siege` | 兵士 | 2 | 3 | 2 ↓ | 特殊兵士（攻城兵） |
| 天罰の光 | `fac_king_judgement` | 魔法 | 1 | 5 | 5 | 強力な攻撃魔法（城に9・使い切り。据え置き） |
| 聖鎖の剣 | `fac_king_chain_sword` | 武器 | 1 | 3 | 3 | 特殊武器（+1・凍結。1枚制限のカードは MP3以上の決まり。据え置き） |

## data/factions/cards/forest.json（33枚。1枚あたりの平均 MP 2.64 → 1.61）

| カード | キー | 種類 | 枚数 | 旧MP | 新MP | 区分・理由 |
|---|---|---|---|---|---|---|
| 獣人 | `fac_forest_beastman` | 兵士 | 2 | 2 | 1 ↓ | 通常兵士 |
| エルフ | `fac_forest_elf` | 兵士 | 2 | 3 | 2 ↓ | 特殊兵士（弓） |
| ドルイド | `fac_forest_druid` | 兵士 | 2 | 4 | 2 ↓ | 特殊兵士（術師） |
| フレイムソード | `fac_forest_flame_sword` | 武器 | 2 | 2 | 0 ↓ | 通常武器（+1） |
| アクアスピア | `fac_forest_aqua_spear` | 武器 | 2 | 2 | 0 ↓ | 通常武器（+1） |
| ゲイルボウ | `fac_forest_gale_bow` | 武器 | 2 | 2 | 0 ↓ | 通常武器（+1） |
| アースハンマー | `fac_forest_earth_hammer` | 武器 | 2 | 2 | 0 ↓ | 通常武器（+1） |
| フレアシード | `fac_forest_flare_seed` | 魔法 | 2 | 3 | 3 | 通常攻撃魔法（1体に4。森の属性魔法は人間の指示で3。据え置き） |
| スプリングウェーブ | `fac_forest_spring_wave` | 魔法 | 2 | 3 | 3 | 通常攻撃魔法（1体に3・長い付着。据え置き） |
| リーフストーム | `fac_forest_leaf_storm` | 魔法 | 2 | 3 | 3 | 通常攻撃魔法（道に2。据え置き） |
| ルートバインド | `fac_forest_root_bind` | 魔法 | 2 | 3 | 3 | 通常攻撃魔法（1体に3・凍結。据え置き） |
| 生命の雫 | `fac_forest_life_drop` | 魔法 | 2 | 3 | 2 ↓ | 回復（城3・兵士2） |
| 茨の壁 | `fac_forest_thorn_wall` | 防御 | 2 | 2 | 1 ↓ | 城壁 |
| 樹皮の盾 | `fac_forest_bark_shield` | 防御 | 2 | 1 | 0 ↓ | 通常防御（盾） |
| 森の番人 | `fac_forest_warden` | 兵士 | 2 | 3 | 2 ↓ | 特殊兵士（番人） |
| 樹人 | `fac_forest_treant` | 兵士 | 1 | 4 | 3 ↓ | 大型兵士（1枚制限のカードは MP3以上の決まり） |
| 薬草の湿布 | `fac_forest_herb` | 魔法 | 1 | 3 | 3 | 回復（5。1枚制限のカードは MP3以上の決まり。据え置き） |
| 古木の根 | `fac_forest_old_root` | 防御 | 1 | 4 | 3 ↓ | 強い城壁（9） |

## data/factions/cards/demon.json（44枚。1枚あたりの平均 MP 2.59 → 1.73）

| カード | キー | 種類 | 枚数 | 旧MP | 新MP | 区分・理由 |
|---|---|---|---|---|---|---|
| 骸骨兵 | `fac_demon_skeleton` | 兵士 | 2 | 2 | 1 ↓ | 通常兵士 |
| 小悪魔 | `fac_demon_imp` | 兵士 | 2 | 2 | 1 ↓ | 通常兵士（速い） |
| ゾンビ | `fac_demon_zombie` | 兵士 | 2 | 4 | 2 ↓ | 大型兵士 |
| 氷の亡者 | `fac_demon_ice_wraith` | 兵士 | 2 | 3 | 2 ↓ | 特殊兵士（氷） |
| 混沌の落とし子 | `fac_demon_chaos_spawn` | 兵士 | 2 | 3 | 2 ↓ | 特殊兵士（混沌） |
| 呪術師 | `fac_demon_curser` | 兵士 | 2 | 3 | 2 ↓ | 特殊兵士（術師） |
| シャドウサイズ | `fac_demon_shadow_scythe` | 武器 | 2 | 2 | 1 ↓ | 強めの武器（+2） |
| フロストブレード | `fac_demon_frost_blade` | 武器 | 2 | 2 | 1 ↓ | 特殊武器（+1・凍結） |
| カオスロッド | `fac_demon_chaos_rod` | 武器 | 2 | 2 | 0 ↓ | 通常武器（+1） |
| 吸命の剣 | `fac_demon_drain_blade` | 武器 | 2 | 2 | 1 ↓ | 特殊武器（+1・吸命） |
| シャドウ | `fac_demon_shadow` | 魔法 | 2 | 3 | 2 ↓ | 通常攻撃魔法（先頭に4） |
| 氷の息 | `fac_demon_frost_breath` | 魔法 | 2 | 3 | 2 ↓ | 通常攻撃魔法（道を凍結） |
| カオスパルス | `fac_demon_chaos_pulse` | 魔法 | 2 | 3 | 2 ↓ | 通常攻撃魔法（ランダム属性3） |
| 毒の霧 | `fac_demon_poison_mist` | 魔法 | 2 | 3 | 3 | 特殊魔法（城の毒） |
| 呪いの印 | `fac_demon_curse_mark` | 魔法 | 2 | 2 | 2 | 特殊魔法（呪い） |
| 脆弱 | `fac_demon_vulnerable` | 魔法 | 2 | 3 | 3 | 特殊魔法（脆弱） |
| 血の契約 | `fac_demon_blood_pact` | 魔法 | 2 | 3 | 2 ↓ | 特殊魔法（城HPを払う強化） |
| 封魔 | `fac_demon_mana_seal` | 魔法 | 2 | 2 | 2 | 特殊魔法（封魔） |
| 魂の欠片 | `fac_demon_soul_shard` | 魔法 | 2 | 3 | 3 | 通常攻撃魔法（城に3・回復3） |
| 残響の魂 | `fac_demon_echo_soul` | 魔法 | 2 | 4 | 3 ↓ | 特殊魔法（蘇生） |
| 血の膜 | `fac_demon_blood_veil` | 防御 | 2 | 2 | 1 ↓ | 城壁 |
| 骨の盾 | `fac_demon_bone_shield` | 防御 | 2 | 1 | 0 ↓ | 通常防御（盾） |

## data/factions/cards/dragon.json（29枚。1枚あたりの平均 MP 2.86 → 2.10）

| カード | キー | 種類 | 枚数 | 旧MP | 新MP | 区分・理由 |
|---|---|---|---|---|---|---|
| 竜人の新兵 | `fac_dragon_recruit` | 兵士 | 2 | 2 | 1 ↓ | 通常兵士 |
| 竜騎兵 | `fac_dragon_dragoon` | 兵士 | 2 | 3 | 2 ↓ | 特殊兵士（攻撃5・速い） |
| 幼炎竜 | `fac_dragon_flame_whelp` | 兵士 | 2 | 4 | 3 ↓ | 大型兵士（竜。重い陣営の特徴として+1） |
| 幼雷竜 | `fac_dragon_thunder_whelp` | 兵士 | 2 | 4 | 3 ↓ | 大型兵士（竜。重い陣営の特徴として+1） |
| 竜牙剣 | `fac_dragon_fang_sword` | 武器 | 2 | 2 | 1 ↓ | 強めの武器（+2） |
| 雷牙槍 | `fac_dragon_thunder_spear` | 武器 | 2 | 2 | 1 ↓ | 強めの武器（+2・射程） |
| ファイアボール | `fac_dragon_fireball` | 魔法 | 2 | 2 | 3 ↑ | 通常攻撃魔法（城に5） |
| 雷光 | `fac_dragon_bolt` | 魔法 | 2 | 4 | 3 ↓ | 通常攻撃魔法（道に3） |
| 火炎の吐息 | `fac_dragon_flame_breath` | 魔法 | 2 | 4 | 4 | 強力な攻撃魔法（道に4・城に4） |
| 竜血の雫 | `fac_dragon_blood_drop` | 魔法 | 2 | 2 | 1 ↓ | 回復（兵士4） |
| 火山灰の幕 | `fac_dragon_ash_veil` | 防御 | 2 | 2 | 1 ↓ | 城壁 |
| 幼竜の鱗 | `fac_dragon_whelp_scale` | 防御 | 2 | 1 | 0 ↓ | 通常防御（盾） |
| 竜術師 | `fac_dragon_mage` | 兵士 | 2 | 4 | 3 ↓ | 特殊兵士（竜術師。重い陣営の特徴として+1） |
| 竜鱗兵 | `fac_dragon_scale_guard` | 兵士 | 1 | 4 | 3 ↓ | 大型兵士（竜鱗兵。重い陣営の特徴として+1） |
| 古竜の障壁 | `fac_dragon_ancient_barrier` | 防御 | 1 | 4 | 3 ↓ | 強い城壁（8） |
| 竜翼の身代わり | `fac_dragon_wing_decoy` | 防御 | 1 | 3 | 3 | 特殊防御（身代わり。1枚制限のカードは MP3以上の決まり。据え置き） |

