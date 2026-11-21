<!-- 自動生成（node docs/four-factions/import/build.mjs）。中身は mapping.mjs を直す -->
# 台帳 → cards.json の対応（取り込み済みの範囲）

| 陣営 | 区分 | 台帳の名前 | 状態 | ID | 種類 | 効果・数値 | 属性 | 合成先 | implemented | 理由 |
|---|---|---|---|---|---|---|---|---|---|---|
| 王国軍 | 兵士 | 歩兵 | 既存 | `infantry` | soldier | melee HP5/攻5/速2 | — | spearman | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 兵士 | 槍兵 | 既存 | `spearman` | soldier | melee HP4/攻7/速2 | — | heavy | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 兵士 | 重装兵 | 既存 | `heavy` | soldier | melee HP11/攻6/速2 | — | giant | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 兵士 | 巨人 | 既存 | `giant` | soldier | melee HP13/攻9/速2 | — | hero | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 兵士 | 勇者 | 既存 | `hero` | soldier | melee HP16/攻12/速3 | — | — | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 兵士 | 斥候騎兵 | 既存 | `scout` | soldier | melee HP3/攻4/速4 | — | cavalry | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 兵士 | 騎兵 | 既存 | `cavalry` | soldier | melee HP4/攻5/速3 | — | knight | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 兵士 | 騎士 | 既存 | `knight` | soldier | melee HP5/攻7/速5 | — | paladin | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 兵士 | 聖騎士 | 既存 | `paladin` | soldier | melee HP8/攻8/速5 | — | king_cavalry_legendary | true | 既存カード（効果・数値・IDは今のまま）。合成先を台帳どおりグランドパラディンにつないだ（人間の決定。PR-A では null） |
| 王国軍 | 兵士 | グランドパラディン | 新規案 | `king_cavalry_legendary` | soldier | melee HP10/攻10/速5 | — | — | true | ふつうの進む兵士（melee）として実際に進軍・戦闘・城攻撃する。騎兵系の最上位（竜騎士の置き換え）なので、竜騎士と同格の HP10・攻撃10・速さ5（仮） |
| 王国軍 | 兵士 | 見習い弓兵 | 既存 | `apprenticeArcher` | soldier | archer HP3/攻3/射2/2T | — | archer | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 兵士 | 弓兵 | 既存 | `archer` | soldier | archer HP4/攻5/射2/2T | — | longbowman | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 兵士 | 長弓兵 | 既存 | `longbowman` | soldier | archer HP5/攻7/射2/2T | — | sniper | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 兵士 | 狙撃手 | 既存 | `sniper` | soldier | archer HP6/攻9/射2/2T | — | skyArcher | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 兵士 | 天弓の射手 | 既存 | `skyArcher` | soldier | archer HP8/攻12/射2/2T | — | — | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 兵士 | 見習い聖術師 | 新規案 | `king_priest_common` | soldier | mage HP4/攻2/射2/2T | 光 | king_priest_uncommon | **false** | 浄化・守護の効果がまだない。兵士に属性（光）を持たせるスキーマもない（今の兵士の属性は武器で決まる）。ふつうの魔法使いとして出すと「既存効果の代用で実装済み」になるので false（仕様 PR-B） |
| 王国軍 | 兵士 | 聖術師 | 新規案 | `king_priest_uncommon` | soldier | mage HP5/攻3/射2/2T | 光 | king_priest_rare | **false** | 浄化・守護の効果がまだない。兵士に属性（光）を持たせるスキーマもない（今の兵士の属性は武器で決まる）。ふつうの魔法使いとして出すと「既存効果の代用で実装済み」になるので false（仕様 PR-B） |
| 王国軍 | 兵士 | 神官 | 新規案 | `king_priest_rare` | soldier | mage HP6/攻5/射2/2T | 光 | king_priest_epic | **false** | 浄化・守護の効果がまだない。兵士に属性（光）を持たせるスキーマもない（今の兵士の属性は武器で決まる）。ふつうの魔法使いとして出すと「既存効果の代用で実装済み」になるので false（仕様 PR-B） |
| 王国軍 | 兵士 | 大神官 | 新規案 | `king_priest_epic` | soldier | mage HP8/攻7/射2/2T | 光 | king_priest_legendary | **false** | 浄化・守護の効果がまだない。兵士に属性（光）を持たせるスキーマもない（今の兵士の属性は武器で決まる）。ふつうの魔法使いとして出すと「既存効果の代用で実装済み」になるので false（仕様 PR-B） |
| 王国軍 | 兵士 | セラフィム | 新規案 | `king_priest_legendary` | soldier | mage HP10/攻9/射2/2T | 光 | — | **false** | 浄化・守護の効果がまだない。兵士に属性（光）を持たせるスキーマもない（今の兵士の属性は武器で決まる）。ふつうの魔法使いとして出すと「既存効果の代用で実装済み」になるので false（仕様 PR-B） |
| 王国軍 | 武器 | ルミナスランス | 新規案 | `king_light_lance_common` | weapon | 攻撃+1 | light | king_light_lance_uncommon | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+1は仕様書の値 |
| 王国軍 | 武器 | ホーリーランス | 新規案 | `king_light_lance_uncommon` | weapon | 攻撃+2 | light | king_light_lance_rare | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+2は仕様書の値 |
| 王国軍 | 武器 | セイクリッドランス | 新規案 | `king_light_lance_rare` | weapon | 攻撃+4 | light | king_light_lance_epic | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+4は仕様書の値 |
| 王国軍 | 武器 | セラフィムランス | 新規案 | `king_light_lance_epic` | weapon | 攻撃+6 | light | king_light_lance_legendary | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+6は仕様書の値 |
| 王国軍 | 武器 | ディヴァインランス | 新規案 | `king_light_lance_legendary` | weapon | 攻撃+9 | light | — | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+9は仕様書の値 |
| 王国軍 | 武器 | 聖鉄の剣 | 新規案 | `king_light_sword_common` | weapon | 攻撃+1 | light | king_light_sword_uncommon | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+1は仕様書の値 |
| 王国軍 | 武器 | 祝福の剣 | 新規案 | `king_light_sword_uncommon` | weapon | 攻撃+2 | light | king_light_sword_rare | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+2は仕様書の値 |
| 王国軍 | 武器 | 光輝の剣 | 新規案 | `king_light_sword_rare` | weapon | 攻撃+4 | light | holySword | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+4は仕様書の値 |
| 王国軍 | 武器 | 聖剣 | 既存 | `holySword` | weapon | 攻撃+6 | light | godSword | true | 既存カード（効果・数値・IDは今のまま）。台帳は光の剣系（光）。人間の決定で、光属性を付けた（攻撃+6は変えない） |
| 王国軍 | 武器 | 神剣 | 既存 | `godSword` | weapon | 攻撃+9 | light | — | true | 既存カード（効果・数値・IDは今のまま）。台帳は光の剣系（光）。人間の決定で、光属性を付けた（攻撃+9は変えない） |
| 王国軍 | 攻撃魔法 | ルミナ | 新規案 | `king_light_spell_common` | spell | damageEnemySoldiers amount 2 scope lane | light | king_light_spell_uncommon | true | 既存の damageEnemySoldiers（兵士へのダメージ）に光属性を付けたもの。光の付着・反応（今の実装）まで実際に効く。選んだ1レーン・2ダメージは仕様書の仮値 |
| 王国軍 | 攻撃魔法 | ホーリーレイ | 新規案 | `king_light_spell_uncommon` | spell | damageEnemySoldiers amount 3 scope lane | light | king_light_spell_rare | true | 既存の damageEnemySoldiers（兵士へのダメージ）に光属性を付けたもの。光の付着・反応（今の実装）まで実際に効く。選んだ1レーン・3ダメージは仕様書の仮値 |
| 王国軍 | 攻撃魔法 | プリズムバースト | 新規案 | `king_light_spell_rare` | spell | damageEnemySoldiers amount 5 scope lane | light | king_light_spell_epic | true | 既存の damageEnemySoldiers（兵士へのダメージ）に光属性を付けたもの。光の付着・反応（今の実装）まで実際に効く。選んだ1レーン・5ダメージは仕様書の仮値 |
| 王国軍 | 攻撃魔法 | セラフィックレイ | 新規案 | `king_light_spell_epic` | spell | damageEnemySoldiers amount 7 | light | king_light_spell_legendary | true | 既存の damageEnemySoldiers（兵士へのダメージ）に光属性を付けたもの。光の付着・反応（今の実装）まで実際に効く。全レーン・7ダメージは仕様書の仮値 |
| 王国軍 | 攻撃魔法 | ディヴァインノヴァ | 新規案 | `king_light_spell_legendary` | spell | damageEnemySoldiers amount 12 | light | — | true | 既存の damageEnemySoldiers（兵士へのダメージ）に光属性を付けたもの。光の付着・反応（今の実装）まで実際に効く。全レーン・12ダメージは仕様書の仮値 |
| 王国軍 | 回復魔法 | 小回復 | 既存 | `minorHeal` | spell | healOwnCastle amount 5 | — | heal | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 回復魔法 | ヒール | 既存 | `heal` | spell | healOwnCastle amount 10 | — | greatHeal | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 回復魔法 | 大回復 | 既存 | `greatHeal` | spell | healOwnCastle amount 18 | — | holyLight | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 回復魔法 | 聖なる光 | 既存 | `holyLight` | spell | healOwnCastle amount 30 | — | goddess | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 回復魔法 | 女神の祝福 | 既存 | `goddess` | spell | healOwnCastle amount 50 | — | — | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 兵士防御 | 盾 | 既存 | `shield` | defense | shieldSoldier amount 3 | — | bigShield | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 兵士防御 | 大盾 | 既存 | `bigShield` | defense | shieldSoldier amount 6 | — | steelShield | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 兵士防御 | 鋼の盾 | 既存 | `steelShield` | defense | shieldSoldier amount 10 | — | holyShield | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 兵士防御 | 聖盾 | 既存 | `holyShield` | defense | shieldSoldier amount 16 | — | godShield | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 兵士防御 | 神盾 | 既存 | `godShield` | defense | shieldSoldier amount 30 | — | — | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 城防御 | 土嚢 | 既存 | `sandbag` | defense | armorCastle amount 3 | — | wall | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 城防御 | 城壁 | 既存 | `wall` | defense | armorCastle amount 5 | — | stoneWall | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 城防御 | 石壁 | 既存 | `stoneWall` | defense | armorCastle amount 9 | — | gate | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 城防御 | 城門 | 既存 | `gate` | defense | armorCastle amount 15 | — | barrier | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 城防御 | 神の結界 | 既存 | `barrier` | defense | armorCastle amount 25 | — | — | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 特殊防御・浄化 | 身代わり | 既存 | `decoy` | defense | nullifySoldier | — | reflect | true | 既存カード（効果・数値・IDは今のまま）。台帳は合成先なしだが、今の合成先（反射）は同じ王国なので今のまま |
| 王国軍 | 特殊防御・浄化 | 反射 | 既存 | `reflect` | defense | reflectSpell | — | — | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 特殊防御・浄化 | ピュリファイ・フレア | 既存 | `purifyFlare` | spell | purifyFlare amount 1 | — | greatHeal | true | 既存カード（効果・数値・IDは今のまま）。台帳は合成先なしだが、今の合成先（大回復）は同じ王国なので今のまま |
| 王国軍 | 特殊防御・浄化 | シールド・ブラスト | 既存 | `shieldBlast` | spell | armorBlast | — | （合成しない） | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | カウンター | パリィ | 新規案 | `king_counter_common` | defense | （効果なし） | — | king_counter_uncommon | **false** | 防御の場面で、ダメージを減らす・無効にする・攻撃者へ反撃するしくみがまだない（今の防御は城壁・盾・反射・身代わりだけ）。PR-C で作る |
| 王国軍 | カウンター | リポスト | 新規案 | `king_counter_uncommon` | defense | （効果なし） | — | king_counter_rare | **false** | 防御の場面で、ダメージを減らす・無効にする・攻撃者へ反撃するしくみがまだない（今の防御は城壁・盾・反射・身代わりだけ）。PR-C で作る |
| 王国軍 | カウンター | アーケインガード | 新規案 | `king_counter_rare` | defense | （効果なし） | — | king_counter_epic | **false** | 防御の場面で、ダメージを減らす・無効にする・攻撃者へ反撃するしくみがまだない（今の防御は城壁・盾・反射・身代わりだけ）。PR-C で作る |
| 王国軍 | カウンター | セイクリッドカウンター | 新規案 | `king_counter_epic` | defense | （効果なし） | — | king_counter_legendary | **false** | 防御の場面で、ダメージを減らす・無効にする・攻撃者へ反撃するしくみがまだない（今の防御は城壁・盾・反射・身代わりだけ）。PR-C で作る |
| 王国軍 | カウンター | ディヴァインリベンジ | 新規案 | `king_counter_legendary` | defense | （効果なし） | — | — | **false** | 防御の場面で、ダメージを減らす・無効にする・攻撃者へ反撃するしくみがまだない（今の防御は城壁・盾・反射・身代わりだけ）。PR-C で作る |
| 森の同盟 | 兵士 | 森の獣兵 | 新規案 | `forest_beast_common` | soldier | melee HP4/攻5/速3 | — | forest_beast_uncommon | true | ふつうの進む兵士（melee）として実際に進軍・戦闘・城攻撃する。HP・攻撃・速さは仮の値（普通の兵士と騎兵の中間） |
| 森の同盟 | 兵士 | ウルフファイター | 新規案 | `forest_beast_uncommon` | soldier | melee HP4/攻6/速3 | — | forest_beast_rare | true | ふつうの進む兵士（melee）として実際に進軍・戦闘・城攻撃する。HP・攻撃・速さは仮の値（普通の兵士と騎兵の中間） |
| 森の同盟 | 兵士 | ビーストウォリアー | 新規案 | `forest_beast_rare` | soldier | melee HP8/攻7/速3 | — | forest_beast_epic | true | ふつうの進む兵士（melee）として実際に進軍・戦闘・城攻撃する。HP・攻撃・速さは仮の値（普通の兵士と騎兵の中間） |
| 森の同盟 | 兵士 | フェンリルナイト | 新規案 | `forest_beast_epic` | soldier | melee HP9/攻10/速3 | — | forest_beast_legendary | true | ふつうの進む兵士（melee）として実際に進軍・戦闘・城攻撃する。HP・攻撃・速さは仮の値（普通の兵士と騎兵の中間） |
| 森の同盟 | 兵士 | フェンリルロード | 新規案 | `forest_beast_legendary` | soldier | melee HP12/攻12/速3 | — | — | true | ふつうの進む兵士（melee）として実際に進軍・戦闘・城攻撃する。HP・攻撃・速さは仮の値（普通の兵士と騎兵の中間） |
| 森の同盟 | 兵士 | エルフの斥候 | 新規案 | `forest_elf_common` | soldier | archer HP3/攻3/射2/2T | — | forest_elf_uncommon | true | 既存の弓兵（archer）として実際に動かずに撃つ（射程2・2ターンで帰る）。仕様「エルフ＝遠距離支援」。数値は王国の弓兵系と同じ仮の値 |
| 森の同盟 | 兵士 | エルフの射手 | 新規案 | `forest_elf_uncommon` | soldier | archer HP4/攻5/射2/2T | — | forest_elf_rare | true | 既存の弓兵（archer）として実際に動かずに撃つ（射程2・2ターンで帰る）。仕様「エルフ＝遠距離支援」。数値は王国の弓兵系と同じ仮の値 |
| 森の同盟 | 兵士 | エルフの狙撃手 | 新規案 | `forest_elf_rare` | soldier | archer HP5/攻7/射2/2T | — | forest_elf_epic | true | 既存の弓兵（archer）として実際に動かずに撃つ（射程2・2ターンで帰る）。仕様「エルフ＝遠距離支援」。数値は王国の弓兵系と同じ仮の値 |
| 森の同盟 | 兵士 | ハイエルフ | 新規案 | `forest_elf_epic` | soldier | archer HP6/攻9/射2/2T | — | forest_elf_legendary | true | 既存の弓兵（archer）として実際に動かずに撃つ（射程2・2ターンで帰る）。仕様「エルフ＝遠距離支援」。数値は王国の弓兵系と同じ仮の値 |
| 森の同盟 | 兵士 | 森の守護者 | 新規案 | `forest_elf_legendary` | soldier | archer HP8/攻12/射2/2T | — | — | true | 既存の弓兵（archer）として実際に動かずに撃つ（射程2・2ターンで帰る）。仕様「エルフ＝遠距離支援」。数値は王国の弓兵系と同じ仮の値 |
| 森の同盟 | 兵士 | ドルイド見習い | 新規案 | `forest_druid_common` | soldier | mage HP4/攻2/射2/2T | 火・水・風・土 | forest_druid_uncommon | **false** | 精霊を起点にした属性反応（召喚中の精霊と別属性の魔法で追加反応）のしくみがまだない。兵士に属性を持たせるスキーマもない（台帳の属性は「火・水・風・土」の4つ）。ふつうの魔法使いとして出すと「既存効果の代用で実装済み」になるので false（仕様 PR-B） |
| 森の同盟 | 兵士 | ドルイド | 新規案 | `forest_druid_uncommon` | soldier | mage HP4/攻4/射2/2T | 火・水・風・土 | forest_druid_rare | **false** | 精霊を起点にした属性反応（召喚中の精霊と別属性の魔法で追加反応）のしくみがまだない。兵士に属性を持たせるスキーマもない（台帳の属性は「火・水・風・土」の4つ）。ふつうの魔法使いとして出すと「既存効果の代用で実装済み」になるので false（仕様 PR-B） |
| 森の同盟 | 兵士 | エレメンタリスト | 新規案 | `forest_druid_rare` | soldier | mage HP5/攻5/射2/2T | 火・水・風・土 | forest_druid_epic | **false** | 精霊を起点にした属性反応（召喚中の精霊と別属性の魔法で追加反応）のしくみがまだない。兵士に属性を持たせるスキーマもない（台帳の属性は「火・水・風・土」の4つ）。ふつうの魔法使いとして出すと「既存効果の代用で実装済み」になるので false（仕様 PR-B） |
| 森の同盟 | 兵士 | アークドルイド | 新規案 | `forest_druid_epic` | soldier | mage HP7/攻7/射2/2T | 火・水・風・土 | forest_druid_legendary | **false** | 精霊を起点にした属性反応（召喚中の精霊と別属性の魔法で追加反応）のしくみがまだない。兵士に属性を持たせるスキーマもない（台帳の属性は「火・水・風・土」の4つ）。ふつうの魔法使いとして出すと「既存効果の代用で実装済み」になるので false（仕様 PR-B） |
| 森の同盟 | 兵士 | 世界樹の賢者 | 新規案 | `forest_druid_legendary` | soldier | mage HP9/攻9/射2/2T | 火・水・風・土 | — | **false** | 精霊を起点にした属性反応（召喚中の精霊と別属性の魔法で追加反応）のしくみがまだない。兵士に属性を持たせるスキーマもない（台帳の属性は「火・水・風・土」の4つ）。ふつうの魔法使いとして出すと「既存効果の代用で実装済み」になるので false（仕様 PR-B） |
| 森の同盟 | 武器 | フレイムソード | 改名（既存カードを継承） | `flameSword` | weapon | 攻撃+1 | fire | forest_fire_sword_uncommon | true | 既存カード（効果・数値・IDは今のまま）。名前を台帳の名前に変え（旧名：炎の剣）、合成先を鉄の剣からブレイズソードへ付けかえた（人間の決定） |
| 森の同盟 | 武器 | ブレイズソード | 新規案 | `forest_fire_sword_uncommon` | weapon | 攻撃+2 | fire | forest_fire_sword_rare | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+2は仕様書の値 |
| 森の同盟 | 武器 | インフェルノセイバー | 新規案 | `forest_fire_sword_rare` | weapon | 攻撃+4 | fire | forest_fire_sword_epic | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+4は仕様書の値 |
| 森の同盟 | 武器 | フェニックスブレード | 新規案 | `forest_fire_sword_epic` | weapon | 攻撃+6 | fire | forest_fire_sword_legendary | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+6は仕様書の値 |
| 森の同盟 | 武器 | イグニスレガリア | 新規案 | `forest_fire_sword_legendary` | weapon | 攻撃+9 | fire | — | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+9は仕様書の値 |
| 森の同盟 | 武器 | アクアスピア | 改名（既存カードを継承） | `waterSpear` | weapon | 攻撃+1 | water | forest_water_lance_uncommon | true | 既存カード（効果・数値・IDは今のまま）。名前を台帳の名前に変え（旧名：水の槍）、合成先を鉄の剣からタイドスピアへ付けかえた（人間の決定） |
| 森の同盟 | 武器 | タイドスピア | 新規案 | `forest_water_lance_uncommon` | weapon | 攻撃+2 | water | forest_water_lance_rare | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+2は仕様書の値 |
| 森の同盟 | 武器 | タイダルランス | 新規案 | `forest_water_lance_rare` | weapon | 攻撃+4 | water | forest_water_lance_epic | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+4は仕様書の値 |
| 森の同盟 | 武器 | オーシャンランス | 新規案 | `forest_water_lance_epic` | weapon | 攻撃+6 | water | forest_water_lance_legendary | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+6は仕様書の値 |
| 森の同盟 | 武器 | リヴァイアサンランス | 新規案 | `forest_water_lance_legendary` | weapon | 攻撃+9 | water | — | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+9は仕様書の値 |
| 森の同盟 | 武器 | ゲイルボウ | 改名（既存カードを継承） | `windBow` | weapon | 攻撃+1 | wind | forest_wind_bow_uncommon | true | 既存カード（効果・数値・IDは今のまま）。名前を台帳の名前に変え（旧名：風の弓）、合成先を鉄の剣からストームボウへ付けかえた（人間の決定） |
| 森の同盟 | 武器 | ストームボウ | 新規案 | `forest_wind_bow_uncommon` | weapon | 攻撃+2 | wind | forest_wind_bow_rare | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+2は仕様書の値 |
| 森の同盟 | 武器 | サイクロンボウ | 新規案 | `forest_wind_bow_rare` | weapon | 攻撃+4 | wind | forest_wind_bow_epic | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+4は仕様書の値 |
| 森の同盟 | 武器 | シルフィードボウ | 新規案 | `forest_wind_bow_epic` | weapon | 攻撃+6 | wind | forest_wind_bow_legendary | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+6は仕様書の値 |
| 森の同盟 | 武器 | テンペストボウ | 新規案 | `forest_wind_bow_legendary` | weapon | 攻撃+9 | wind | — | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+9は仕様書の値 |
| 森の同盟 | 武器 | アースハンマー | 改名（既存カードを継承） | `earthHammer` | weapon | 攻撃+1 | earth | forest_earth_hammer_uncommon | true | 既存カード（効果・数値・IDは今のまま）。名前を台帳の名前に変え（旧名：土の槌）、合成先を鉄の剣からグラナイトハンマーへ付けかえた（人間の決定） |
| 森の同盟 | 武器 | グラナイトハンマー | 新規案 | `forest_earth_hammer_uncommon` | weapon | 攻撃+2 | earth | forest_earth_hammer_rare | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+2は仕様書の値 |
| 森の同盟 | 武器 | クエイクハンマー | 新規案 | `forest_earth_hammer_rare` | weapon | 攻撃+4 | earth | forest_earth_hammer_epic | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+4は仕様書の値 |
| 森の同盟 | 武器 | テラブレイカー | 新規案 | `forest_earth_hammer_epic` | weapon | 攻撃+6 | earth | forest_earth_hammer_legendary | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+6は仕様書の値 |
| 森の同盟 | 武器 | ガイアクラッシャー | 新規案 | `forest_earth_hammer_legendary` | weapon | 攻撃+9 | earth | — | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+9は仕様書の値 |
| 森の同盟 | 攻撃魔法 | フレイム | 新規案 | `forest_fire_magic_common` | spell | damageEnemySoldiers amount 2 scope lane | fire | forest_fire_magic_uncommon | true | 既存の damageEnemySoldiers（兵士へのダメージ）に火属性を付けたもの。仕様の火は「直接火力」（追加効果なし）なので、今のしくみで仕様どおりに効く。属性の付着・反応も実際に効く。選んだ1レーン・2ダメージは仕様書の仮値 |
| 森の同盟 | 攻撃魔法 | ブレイズ | 新規案 | `forest_fire_magic_uncommon` | spell | damageEnemySoldiers amount 3 scope lane | fire | forest_fire_magic_rare | true | 既存の damageEnemySoldiers（兵士へのダメージ）に火属性を付けたもの。仕様の火は「直接火力」（追加効果なし）なので、今のしくみで仕様どおりに効く。属性の付着・反応も実際に効く。選んだ1レーン・3ダメージは仕様書の仮値 |
| 森の同盟 | 攻撃魔法 | フレアバースト | 新規案 | `forest_fire_magic_rare` | spell | damageEnemySoldiers amount 5 scope lane | fire | forest_fire_magic_epic | true | 既存の damageEnemySoldiers（兵士へのダメージ）に火属性を付けたもの。仕様の火は「直接火力」（追加効果なし）なので、今のしくみで仕様どおりに効く。属性の付着・反応も実際に効く。選んだ1レーン・5ダメージは仕様書の仮値 |
| 森の同盟 | 攻撃魔法 | ヘルフレイム | 新規案 | `forest_fire_magic_epic` | spell | damageEnemySoldiers amount 7 | fire | forest_fire_magic_legendary | true | 既存の damageEnemySoldiers（兵士へのダメージ）に火属性を付けたもの。仕様の火は「直接火力」（追加効果なし）なので、今のしくみで仕様どおりに効く。属性の付着・反応も実際に効く。全レーン・7ダメージは仕様書の仮値 |
| 森の同盟 | 攻撃魔法 | プロミネンス | 新規案 | `forest_fire_magic_legendary` | spell | damageEnemySoldiers amount 12 | fire | — | true | 既存の damageEnemySoldiers（兵士へのダメージ）に火属性を付けたもの。仕様の火は「直接火力」（追加効果なし）なので、今のしくみで仕様どおりに効く。属性の付着・反応も実際に効く。全レーン・12ダメージは仕様書の仮値 |
| 森の同盟 | 攻撃魔法 | アクア | 新規案 | `forest_water_magic_common` | spell | （効果なし） | water | forest_water_magic_uncommon | **false** | 仕様の追加効果（属性連鎖）を起こすしくみがまだなく、ダメージと属性だけで出すと追加効果がなく火より弱いだけになるため false（既存効果の代用にしない。仕様 PR-B）。PR-C で作る |
| 森の同盟 | 攻撃魔法 | スプラッシュ | 新規案 | `forest_water_magic_uncommon` | spell | （効果なし） | water | forest_water_magic_rare | **false** | 仕様の追加効果（属性連鎖）を起こすしくみがまだなく、ダメージと属性だけで出すと追加効果がなく火より弱いだけになるため false（既存効果の代用にしない。仕様 PR-B）。PR-C で作る |
| 森の同盟 | 攻撃魔法 | タイダルウェーブ | 新規案 | `forest_water_magic_rare` | spell | （効果なし） | water | forest_water_magic_epic | **false** | 仕様の追加効果（属性連鎖）を起こすしくみがまだなく、ダメージと属性だけで出すと追加効果がなく火より弱いだけになるため false（既存効果の代用にしない。仕様 PR-B）。PR-C で作る |
| 森の同盟 | 攻撃魔法 | メイルストローム | 新規案 | `forest_water_magic_epic` | spell | （効果なし） | water | forest_water_magic_legendary | **false** | 仕様の追加効果（属性連鎖）を起こすしくみがまだなく、ダメージと属性だけで出すと追加効果がなく火より弱いだけになるため false（既存効果の代用にしない。仕様 PR-B）。PR-C で作る |
| 森の同盟 | 攻撃魔法 | アビサルタイド | 新規案 | `forest_water_magic_legendary` | spell | （効果なし） | water | — | **false** | 仕様の追加効果（属性連鎖）を起こすしくみがまだなく、ダメージと属性だけで出すと追加効果がなく火より弱いだけになるため false（既存効果の代用にしない。仕様 PR-B）。PR-C で作る |
| 森の同盟 | 攻撃魔法 | エアカッター | 新規案 | `forest_wind_magic_common` | spell | （効果なし） | wind | forest_wind_magic_uncommon | **false** | 仕様の追加効果（拡散）を起こすしくみがまだなく、ダメージと属性だけで出すと追加効果がなく火より弱いだけになるため false（既存効果の代用にしない。仕様 PR-B）。PR-C で作る |
| 森の同盟 | 攻撃魔法 | ウィンドエッジ | 新規案 | `forest_wind_magic_uncommon` | spell | （効果なし） | wind | forest_wind_magic_rare | **false** | 仕様の追加効果（拡散）を起こすしくみがまだなく、ダメージと属性だけで出すと追加効果がなく火より弱いだけになるため false（既存効果の代用にしない。仕様 PR-B）。PR-C で作る |
| 森の同盟 | 攻撃魔法 | サイクロン | 新規案 | `forest_wind_magic_rare` | spell | （効果なし） | wind | forest_wind_magic_epic | **false** | 仕様の追加効果（拡散）を起こすしくみがまだなく、ダメージと属性だけで出すと追加効果がなく火より弱いだけになるため false（既存効果の代用にしない。仕様 PR-B）。PR-C で作る |
| 森の同盟 | 攻撃魔法 | テンペスト | 新規案 | `forest_wind_magic_epic` | spell | （効果なし） | wind | forest_wind_magic_legendary | **false** | 仕様の追加効果（拡散）を起こすしくみがまだなく、ダメージと属性だけで出すと追加効果がなく火より弱いだけになるため false（既存効果の代用にしない。仕様 PR-B）。PR-C で作る |
| 森の同盟 | 攻撃魔法 | エターナルストーム | 新規案 | `forest_wind_magic_legendary` | spell | （効果なし） | wind | — | **false** | 仕様の追加効果（拡散）を起こすしくみがまだなく、ダメージと属性だけで出すと追加効果がなく火より弱いだけになるため false（既存効果の代用にしない。仕様 PR-B）。PR-C で作る |
| 森の同盟 | 攻撃魔法 | ロックブラスト | 新規案 | `forest_earth_magic_common` | spell | （効果なし） | earth | forest_earth_magic_uncommon | **false** | 仕様の追加効果（拘束）を起こすしくみがまだなく、ダメージと属性だけで出すと追加効果がなく火より弱いだけになるため false（既存効果の代用にしない。仕様 PR-B）。PR-C で作る |
| 森の同盟 | 攻撃魔法 | ストーンスパイク | 新規案 | `forest_earth_magic_uncommon` | spell | （効果なし） | earth | forest_earth_magic_rare | **false** | 仕様の追加効果（拘束）を起こすしくみがまだなく、ダメージと属性だけで出すと追加効果がなく火より弱いだけになるため false（既存効果の代用にしない。仕様 PR-B）。PR-C で作る |
| 森の同盟 | 攻撃魔法 | アースクエイク | 新規案 | `forest_earth_magic_rare` | spell | （効果なし） | earth | forest_earth_magic_epic | **false** | 仕様の追加効果（拘束）を起こすしくみがまだなく、ダメージと属性だけで出すと追加効果がなく火より弱いだけになるため false（既存効果の代用にしない。仕様 PR-B）。PR-C で作る |
| 森の同盟 | 攻撃魔法 | テラブレイク | 新規案 | `forest_earth_magic_epic` | spell | （効果なし） | earth | forest_earth_magic_legendary | **false** | 仕様の追加効果（拘束）を起こすしくみがまだなく、ダメージと属性だけで出すと追加効果がなく火より弱いだけになるため false（既存効果の代用にしない。仕様 PR-B）。PR-C で作る |
| 森の同盟 | 攻撃魔法 | ガイアインパクト | 新規案 | `forest_earth_magic_legendary` | spell | （効果なし） | earth | — | **false** | 仕様の追加効果（拘束）を起こすしくみがまだなく、ダメージと属性だけで出すと追加効果がなく火より弱いだけになるため false（既存効果の代用にしない。仕様 PR-B）。PR-C で作る |
| 森の同盟 | 精霊召喚 | 火の精霊 | 既存 | `fireSpirit` | spell | summonSpirit amount 3 | 火 | greatFireSpirit | true | 既存カード（効果・数値・IDは今のまま） |
| 森の同盟 | 精霊召喚 | 火の大精霊 | 既存 | `greatFireSpirit` | spell | summonSpirit amount 5 | 火 | fireKing | true | 既存カード（効果・数値・IDは今のまま） |
| 森の同盟 | 精霊召喚 | 火の精霊王 | 既存 | `fireKing` | spell | summonSpirit amount 9 | 火 | — | true | 既存カード（効果・数値・IDは今のまま） |
| 森の同盟 | 精霊召喚 | 水の精霊 | 既存 | `waterSpirit` | spell | summonSpirit amount 2 | 水 | greatWaterSpirit | true | 既存カード（効果・数値・IDは今のまま） |
| 森の同盟 | 精霊召喚 | 水の大精霊 | 既存 | `greatWaterSpirit` | spell | summonSpirit amount 3 | 水 | waterKing | true | 既存カード（効果・数値・IDは今のまま） |
| 森の同盟 | 精霊召喚 | 水の精霊王 | 既存 | `waterKing` | spell | summonSpirit amount 5 | 水 | — | true | 既存カード（効果・数値・IDは今のまま） |
| 森の同盟 | 精霊召喚 | 風の精霊 | 既存 | `windSpirit` | spell | summonSpirit amount 2 | 風 | greatWindSpirit | true | 既存カード（効果・数値・IDは今のまま） |
| 森の同盟 | 精霊召喚 | 風の大精霊 | 既存 | `greatWindSpirit` | spell | summonSpirit amount 3 | 風 | windKing | true | 既存カード（効果・数値・IDは今のまま） |
| 森の同盟 | 精霊召喚 | 風の精霊王 | 既存 | `windKing` | spell | summonSpirit amount 5 | 風 | — | true | 既存カード（効果・数値・IDは今のまま） |
| 森の同盟 | 精霊召喚 | 土の精霊 | 既存 | `earthSpirit` | spell | summonSpirit amount 1 | 土 | greatEarthSpirit | true | 既存カード（効果・数値・IDは今のまま） |
| 森の同盟 | 精霊召喚 | 土の大精霊 | 既存 | `greatEarthSpirit` | spell | summonSpirit amount 2 | 土 | earthKing | true | 既存カード（効果・数値・IDは今のまま） |
| 森の同盟 | 精霊召喚 | 土の精霊王 | 既存 | `earthKing` | spell | summonSpirit amount 3 | 土 | — | true | 既存カード（効果・数値・IDは今のまま） |
| 森の同盟 | 自然補助魔法 | ゲイルフォース | 既存 | `galeForce` | spell | pushBackEnemySoldiers amount 2 | 風 | （合成しない） | true | 既存カード（効果・数値・IDは今のまま） |
| 森の同盟 | 回復魔法 | 若葉の癒やし | 新規案 | `forest_life_heal_common` | spell | healCastleAndSoldier amount 4 | 水・生命 | forest_life_heal_uncommon | true | healCastleAndSoldier（城と、傷ついた自分の兵士のうちHPの割合がいちばん低い1体を同時に回復。値は仕様書の仮値 城4・兵士2）として実際に効く |
| 森の同盟 | 回復魔法 | 生命の雫 | 新規案 | `forest_life_heal_uncommon` | spell | healCastleAndSoldier amount 8 | 水・生命 | forest_life_heal_rare | true | healCastleAndSoldier（城と、傷ついた自分の兵士のうちHPの割合がいちばん低い1体を同時に回復。値は仕様書の仮値 城8・兵士3）として実際に効く |
| 森の同盟 | 回復魔法 | 癒やしの泉 | 新規案 | `forest_life_heal_rare` | spell | healCastleAndSoldier amount 14 | 水・生命 | forest_life_heal_epic | true | healCastleAndSoldier（城と、傷ついた自分の兵士のうちHPの割合がいちばん低い1体を同時に回復。値は仕様書の仮値 城14・兵士5）として実際に効く |
| 森の同盟 | 回復魔法 | 大樹の祝福 | 新規案 | `forest_life_heal_epic` | spell | healCastleAndSoldier amount 24 | 水・生命 | forest_life_heal_legendary | true | healCastleAndSoldier（城と、傷ついた自分の兵士のうちHPの割合がいちばん低い1体を同時に回復。値は仕様書の仮値 城24・兵士8）として実際に効く |
| 森の同盟 | 回復魔法 | 世界樹の息吹 | 新規案 | `forest_life_heal_legendary` | spell | healCastleAndSoldier amount 40 | 水・生命 | — | true | healCastleAndSoldier（城と、傷ついた自分の兵士のうちHPの割合がいちばん低い1体を同時に回復。値は仕様書の仮値 城40・兵士12）として実際に効く |
| 森の同盟 | 城防御 | 蔦の防壁 | 新規案 | `forest_plant_wall_common` | defense | armorCastle amount 3 | 土・植物 | forest_plant_wall_uncommon | true | 既存の armorCastle（城壁。足し算で積む・上限あり・ダメージを先に受ける）として実際に効く。城壁の値 3 は仕様書の値 |
| 森の同盟 | 城防御 | 根の城柵 | 新規案 | `forest_plant_wall_uncommon` | defense | armorCastle amount 5 | 土・植物 | forest_plant_wall_rare | true | 既存の armorCastle（城壁。足し算で積む・上限あり・ダメージを先に受ける）として実際に効く。城壁の値 5 は仕様書の値 |
| 森の同盟 | 城防御 | 森の結界 | 新規案 | `forest_plant_wall_rare` | defense | armorCastle amount 9 | 土・植物 | forest_plant_wall_epic | true | 既存の armorCastle（城壁。足し算で積む・上限あり・ダメージを先に受ける）として実際に効く。城壁の値 9 は仕様書の値 |
| 森の同盟 | 城防御 | 古樹の守護壁 | 新規案 | `forest_plant_wall_epic` | defense | armorCastle amount 15 | 土・植物 | forest_plant_wall_legendary | true | 既存の armorCastle（城壁。足し算で積む・上限あり・ダメージを先に受ける）として実際に効く。城壁の値 15 は仕様書の値 |
| 森の同盟 | 城防御 | 世界樹の庇護 | 新規案 | `forest_plant_wall_legendary` | defense | armorCastle amount 25 | 土・植物 | — | true | 既存の armorCastle（城壁。足し算で積む・上限あり・ダメージを先に受ける）として実際に効く。城壁の値 25 は仕様書の値 |
| 森の同盟 | 兵士防御 | 葉の衣 | 新規案 | `forest_plant_armor_common` | defense | shieldSoldier amount 3 | 土・植物 | forest_plant_armor_uncommon | true | 既存の shieldSoldier（兵士の盾。先にダメージを受ける）として実際に効く。盾の値 3 は仕様書の案。コモン・アンコモンは「棘の反撃」を持たない |
| 森の同盟 | 兵士防御 | 樹皮の鎧 | 新規案 | `forest_plant_armor_uncommon` | defense | shieldSoldier amount 5 | 土・植物 | forest_plant_armor_rare | true | 既存の shieldSoldier（兵士の盾。先にダメージを受ける）として実際に効く。盾の値 5 は仕様書の案。コモン・アンコモンは「棘の反撃」を持たない |
| 森の同盟 | 兵士防御 | 棘の鎧 | 新規案 | `forest_plant_armor_rare` | defense | （効果なし） | 土・植物 | forest_plant_armor_epic | **false** | 仕様の「近接防御成功時の棘の反撃」を起こすしくみがまだない（反撃量も未決定）。盾だけで出すと棘のないただの盾（代用）になるため false。PR-C で作る |
| 森の同盟 | 兵士防御 | 古樹の鎧 | 新規案 | `forest_plant_armor_epic` | defense | （効果なし） | 土・植物 | forest_plant_armor_legendary | **false** | 仕様の「近接防御成功時の棘の反撃」を起こすしくみがまだない（反撃量も未決定）。盾だけで出すと棘のないただの盾（代用）になるため false。PR-C で作る |
| 森の同盟 | 兵士防御 | 森神の守護 | 新規案 | `forest_plant_armor_legendary` | defense | （効果なし） | 土・植物 | — | **false** | 仕様の「近接防御成功時の棘の反撃」を起こすしくみがまだない（反撃量も未決定）。盾だけで出すと棘のないただの盾（代用）になるため false。PR-C で作る |
| 魔族軍 | 兵士 | 骸骨兵 | 新規案 | `demon_undead_common` | soldier | melee HP7/攻3/速1 | 闇 | demon_undead_uncommon | true | ふつうの進む兵士（melee）として実際に進軍・戦闘・城攻撃する。仕様「不死者は前衛」の部分。硬くて遅い壁（王国の同レアの兵士より HP が高く、攻撃が低く、遅い） |
| 魔族軍 | 兵士 | 亡者騎士 | 新規案 | `demon_undead_uncommon` | soldier | melee HP8/攻5/速1 | 闇 | demon_undead_rare | true | ふつうの進む兵士（melee）として実際に進軍・戦闘・城攻撃する。仕様「不死者は前衛」の部分。硬くて遅い壁（王国の同レアの兵士より HP が高く、攻撃が低く、遅い） |
| 魔族軍 | 兵士 | 黒騎士 | 新規案 | `demon_undead_rare` | soldier | melee HP14/攻5/速1 | 闇 | demon_undead_epic | true | ふつうの進む兵士（melee）として実際に進軍・戦闘・城攻撃する。仕様「不死者は前衛」の部分。硬くて遅い壁（王国の同レアの兵士より HP が高く、攻撃が低く、遅い） |
| 魔族軍 | 兵士 | デスナイト | 新規案 | `demon_undead_epic` | soldier | melee HP16/攻7/速1 | 闇 | demon_undead_legendary | true | ふつうの進む兵士（melee）として実際に進軍・戦闘・城攻撃する。仕様「不死者は前衛」の部分。硬くて遅い壁（王国の同レアの兵士より HP が高く、攻撃が低く、遅い） |
| 魔族軍 | 兵士 | 不死王 | 新規案 | `demon_undead_legendary` | soldier | melee HP20/攻10/速2 | 闇 | — | true | ふつうの進む兵士（melee）として実際に進軍・戦闘・城攻撃する。仕様「不死者は前衛」の部分。硬くて遅い壁（王国の同レアの兵士より HP が高く、攻撃が低く、遅い） |
| 魔族軍 | 兵士 | 小悪魔 | 新規案 | `demon_warrior_common` | soldier | melee HP3/攻6/速4 | 闇 | demon_warrior_uncommon | **false** | 仕様「HP/MPを代償にした攻勢」の、代償を払って攻撃力を上げる仕組みがない。代償なしの高攻撃・低HP の兵士として出すと、代償で釣り合わせる前提の数値が意味を持たず、騎兵系（速くて脆い）の複製になるため false（仕様 PR-B）。PR-C で作る |
| 魔族軍 | 兵士 | 魔族戦士 | 新規案 | `demon_warrior_uncommon` | soldier | melee HP3/攻8/速4 | 闇 | demon_warrior_rare | **false** | 仕様「HP/MPを代償にした攻勢」の、代償を払って攻撃力を上げる仕組みがない。代償なしの高攻撃・低HP の兵士として出すと、代償で釣り合わせる前提の数値が意味を持たず、騎兵系（速くて脆い）の複製になるため false（仕様 PR-B）。PR-C で作る |
| 魔族軍 | 兵士 | 魔界騎士 | 新規案 | `demon_warrior_rare` | soldier | melee HP4/攻10/速4 | 闇 | demon_warrior_epic | **false** | 仕様「HP/MPを代償にした攻勢」の、代償を払って攻撃力を上げる仕組みがない。代償なしの高攻撃・低HP の兵士として出すと、代償で釣り合わせる前提の数値が意味を持たず、騎兵系（速くて脆い）の複製になるため false（仕様 PR-B）。PR-C で作る |
| 魔族軍 | 兵士 | アビスロード | 新規案 | `demon_warrior_epic` | soldier | melee HP6/攻12/速4 | 闇 | demon_warrior_legendary | **false** | 仕様「HP/MPを代償にした攻勢」の、代償を払って攻撃力を上げる仕組みがない。代償なしの高攻撃・低HP の兵士として出すと、代償で釣り合わせる前提の数値が意味を持たず、騎兵系（速くて脆い）の複製になるため false（仕様 PR-B）。PR-C で作る |
| 魔族軍 | 兵士 | 魔神の将軍 | 新規案 | `demon_warrior_legendary` | soldier | melee HP8/攻15/速4 | 闇 | — | **false** | 仕様「HP/MPを代償にした攻勢」の、代償を払って攻撃力を上げる仕組みがない。代償なしの高攻撃・低HP の兵士として出すと、代償で釣り合わせる前提の数値が意味を持たず、騎兵系（速くて脆い）の複製になるため false（仕様 PR-B）。PR-C で作る |
| 魔族軍 | 兵士 | 見習い呪術師 | 新規案 | `demon_caster_common` | soldier | mage HP3/攻2/射2/2T | 闇・氷・混沌 | demon_caster_uncommon | **false** | 仕様「闇・氷・混沌による妨害・吸収」を起こすしくみがない。兵士に属性を持たせるスキーマもない（台帳の属性は「闇・氷・混沌」の3つ）。仕様は「共通魔法使いは使わない」としており、ふつうの魔法使いとして出すと旧カードの魔法使い系の複製（既存効果の代用）になるため false（仕様 PR-B） |
| 魔族軍 | 兵士 | 呪術師 | 新規案 | `demon_caster_uncommon` | soldier | mage HP3/攻4/射2/2T | 闇・氷・混沌 | demon_caster_rare | **false** | 仕様「闇・氷・混沌による妨害・吸収」を起こすしくみがない。兵士に属性を持たせるスキーマもない（台帳の属性は「闇・氷・混沌」の3つ）。仕様は「共通魔法使いは使わない」としており、ふつうの魔法使いとして出すと旧カードの魔法使い系の複製（既存効果の代用）になるため false（仕様 PR-B） |
| 魔族軍 | 兵士 | ウォーロック | 新規案 | `demon_caster_rare` | soldier | mage HP4/攻6/射2/2T | 闇・氷・混沌 | demon_caster_epic | **false** | 仕様「闇・氷・混沌による妨害・吸収」を起こすしくみがない。兵士に属性を持たせるスキーマもない（台帳の属性は「闇・氷・混沌」の3つ）。仕様は「共通魔法使いは使わない」としており、ふつうの魔法使いとして出すと旧カードの魔法使い系の複製（既存効果の代用）になるため false（仕様 PR-B） |
| 魔族軍 | 兵士 | ネクロマンサー | 新規案 | `demon_caster_epic` | soldier | mage HP5/攻8/射2/2T | 闇・氷・混沌 | demon_caster_legendary | **false** | 仕様「闇・氷・混沌による妨害・吸収」を起こすしくみがない。兵士に属性を持たせるスキーマもない（台帳の属性は「闇・氷・混沌」の3つ）。仕様は「共通魔法使いは使わない」としており、ふつうの魔法使いとして出すと旧カードの魔法使い系の複製（既存効果の代用）になるため false（仕様 PR-B） |
| 魔族軍 | 兵士 | 冥府の大賢者 | 新規案 | `demon_caster_legendary` | soldier | mage HP7/攻11/射2/2T | 闇・氷・混沌 | — | **false** | 仕様「闇・氷・混沌による妨害・吸収」を起こすしくみがない。兵士に属性を持たせるスキーマもない（台帳の属性は「闇・氷・混沌」の3つ）。仕様は「共通魔法使いは使わない」としており、ふつうの魔法使いとして出すと旧カードの魔法使い系の複製（既存効果の代用）になるため false（仕様 PR-B） |
| 魔族軍 | 武器 | シャドウサイズ | 新規案 | `demon_dark_scythe_common` | weapon | 攻撃+1 | dark | demon_dark_scythe_uncommon | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+1は仕様書の値 |
| 魔族軍 | 武器 | ダークサイズ | 新規案 | `demon_dark_scythe_uncommon` | weapon | 攻撃+2 | dark | demon_dark_scythe_rare | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+2は仕様書の値 |
| 魔族軍 | 武器 | ブラッドサイズ | 新規案 | `demon_dark_scythe_rare` | weapon | 攻撃+4 | dark | demon_dark_scythe_epic | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+4は仕様書の値 |
| 魔族軍 | 武器 | アビスサイズ | 新規案 | `demon_dark_scythe_epic` | weapon | 攻撃+6 | dark | demon_dark_scythe_legendary | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+6は仕様書の値 |
| 魔族軍 | 武器 | エクリプスサイズ | 新規案 | `demon_dark_scythe_legendary` | weapon | 攻撃+9 | dark | — | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+9は仕様書の値 |
| 魔族軍 | 武器 | フロストブレード | 新規案 | `demon_ice_blade_common` | weapon | 攻撃+1 | ice | demon_ice_blade_uncommon | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+1は仕様書の値 |
| 魔族軍 | 武器 | アイスセイバー | 新規案 | `demon_ice_blade_uncommon` | weapon | 攻撃+2 | ice | demon_ice_blade_rare | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+2は仕様書の値 |
| 魔族軍 | 武器 | グレイシャルブレード | 新規案 | `demon_ice_blade_rare` | weapon | 攻撃+4 | ice | demon_ice_blade_epic | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+4は仕様書の値 |
| 魔族軍 | 武器 | 永劫凍刃 | 新規案 | `demon_ice_blade_epic` | weapon | 攻撃+6 | ice | demon_ice_blade_legendary | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+6は仕様書の値 |
| 魔族軍 | 武器 | 絶氷剣 | 新規案 | `demon_ice_blade_legendary` | weapon | 攻撃+9 | ice | — | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+9は仕様書の値 |
| 魔族軍 | 武器 | カオスロッド | 新規案 | `demon_chaos_staff_common` | weapon | 攻撃+1 | chaos | demon_chaos_staff_uncommon | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+1は仕様書の値 |
| 魔族軍 | 武器 | ワープロッド | 新規案 | `demon_chaos_staff_uncommon` | weapon | 攻撃+2 | chaos | demon_chaos_staff_rare | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+2は仕様書の値 |
| 魔族軍 | 武器 | ヴォイドスタッフ | 新規案 | `demon_chaos_staff_rare` | weapon | 攻撃+4 | chaos | demon_chaos_staff_epic | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+4は仕様書の値 |
| 魔族軍 | 武器 | アビスロッド | 新規案 | `demon_chaos_staff_epic` | weapon | 攻撃+6 | chaos | demon_chaos_staff_legendary | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+6は仕様書の値 |
| 魔族軍 | 武器 | 原初の混沌杖 | 新規案 | `demon_chaos_staff_legendary` | weapon | 攻撃+9 | chaos | — | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+9は仕様書の値 |
| 魔族軍 | 攻撃魔法 | シャドウ | 新規案 | `demon_dark_spell_common` | spell | （効果なし） | dark | demon_dark_spell_uncommon | **false** | 仕様の追加効果（侵食）を起こすしくみがまだなく、ダメージと属性だけで出すと追加効果がなく同レアの火の魔法より弱いだけになるため false（既存効果の代用にしない。仕様 PR-B）。PR-C で作る |
| 魔族軍 | 攻撃魔法 | ダークボルト | 新規案 | `demon_dark_spell_uncommon` | spell | （効果なし） | dark | demon_dark_spell_rare | **false** | 仕様の追加効果（侵食）を起こすしくみがまだなく、ダメージと属性だけで出すと追加効果がなく同レアの火の魔法より弱いだけになるため false（既存効果の代用にしない。仕様 PR-B）。PR-C で作る |
| 魔族軍 | 攻撃魔法 | ナイトメア | 新規案 | `demon_dark_spell_rare` | spell | （効果なし） | dark | demon_dark_spell_epic | **false** | 仕様の追加効果（侵食）を起こすしくみがまだなく、ダメージと属性だけで出すと追加効果がなく同レアの火の魔法より弱いだけになるため false（既存効果の代用にしない。仕様 PR-B）。PR-C で作る |
| 魔族軍 | 攻撃魔法 | アビスバースト | 新規案 | `demon_dark_spell_epic` | spell | （効果なし） | dark | demon_dark_spell_legendary | **false** | 仕様の追加効果（侵食）を起こすしくみがまだなく、ダメージと属性だけで出すと追加効果がなく同レアの火の魔法より弱いだけになるため false（既存効果の代用にしない。仕様 PR-B）。PR-C で作る |
| 魔族軍 | 攻撃魔法 | エクリプス | 新規案 | `demon_dark_spell_legendary` | spell | （効果なし） | dark | — | **false** | 仕様の追加効果（侵食）を起こすしくみがまだなく、ダメージと属性だけで出すと追加効果がなく同レアの火の魔法より弱いだけになるため false（既存効果の代用にしない。仕様 PR-B）。PR-C で作る |
| 魔族軍 | 攻撃魔法 | 氷の息 | 既存 | `frostBreath` | spell | freezeEnemySoldiers scope lane | 氷 | deepFreeze | true | 既存カード（効果・数値・IDは今のまま） |
| 魔族軍 | 攻撃魔法 | 大氷結 | 既存 | `deepFreeze` | spell | freezeEnemySoldiers | 氷 | glacier | true | 既存カード（効果・数値・IDは今のまま） |
| 魔族軍 | 攻撃魔法 | 氷河 | 既存 | `glacier` | spell | freezeEnemySoldiers scope lane | 氷 | absoluteZero | true | 既存カード（効果・数値・IDは今のまま） |
| 魔族軍 | 攻撃魔法 | 絶対零度 | 既存 | `absoluteZero` | spell | freezeEnemySoldiers | 氷 | frozenWorld | true | 既存カード（効果・数値・IDは今のまま） |
| 魔族軍 | 攻撃魔法 | 氷結世界 | 既存 | `frozenWorld` | spell | freezeEnemySoldiers | 氷 | — | true | 既存カード（効果・数値・IDは今のまま） |
| 魔族軍 | 攻撃魔法 | カオスパルス | 新規案 | `demon_chaos_spell_common` | spell | （効果なし） | chaos | demon_chaos_spell_uncommon | **false** | 仕様の追加効果（状態異常の転換と追加ダメージ）を起こすしくみがまだなく、ダメージと属性だけで出すと追加効果がなく同レアの火の魔法より弱いだけになるため false（既存効果の代用にしない。仕様 PR-B）。PR-C で作る |
| 魔族軍 | 攻撃魔法 | カオススフィア | 新規案 | `demon_chaos_spell_uncommon` | spell | （効果なし） | chaos | demon_chaos_spell_rare | **false** | 仕様の追加効果（状態異常の転換と追加ダメージ）を起こすしくみがまだなく、ダメージと属性だけで出すと追加効果がなく同レアの火の魔法より弱いだけになるため false（既存効果の代用にしない。仕様 PR-B）。PR-C で作る |
| 魔族軍 | 攻撃魔法 | ディストーション | 新規案 | `demon_chaos_spell_rare` | spell | （効果なし） | chaos | demon_chaos_spell_epic | **false** | 仕様の追加効果（状態異常の転換と追加ダメージ）を起こすしくみがまだなく、ダメージと属性だけで出すと追加効果がなく同レアの火の魔法より弱いだけになるため false（既存効果の代用にしない。仕様 PR-B）。PR-C で作る |
| 魔族軍 | 攻撃魔法 | カオスストーム | 新規案 | `demon_chaos_spell_epic` | spell | （効果なし） | chaos | demon_chaos_spell_legendary | **false** | 仕様の追加効果（状態異常の転換と追加ダメージ）を起こすしくみがまだなく、ダメージと属性だけで出すと追加効果がなく同レアの火の魔法より弱いだけになるため false（既存効果の代用にしない。仕様 PR-B）。PR-C で作る |
| 魔族軍 | 攻撃魔法 | 原初の崩壊 | 新規案 | `demon_chaos_spell_legendary` | spell | （効果なし） | chaos | — | **false** | 仕様の追加効果（状態異常の転換と追加ダメージ）を起こすしくみがまだなく、ダメージと属性だけで出すと追加効果がなく同レアの火の魔法より弱いだけになるため false（既存効果の代用にしない。仕様 PR-B）。PR-C で作る |
| 魔族軍 | 毒魔法 | 毒の霧 | 既存 | `poisonMist` | spell | poisonEnemy amount 1 | 闇・毒 | venom | true | 既存カード（効果・数値・IDは今のまま） |
| 魔族軍 | 毒魔法 | 猛毒 | 既存 | `venom` | spell | poisonEnemy amount 2 | 闇・毒 | toxicRain | true | 既存カード（効果・数値・IDは今のまま） |
| 魔族軍 | 毒魔法 | 毒の雨 | 既存 | `toxicRain` | spell | poisonEnemy amount 3 | 闇・毒 | deathMist | true | 既存カード（効果・数値・IDは今のまま） |
| 魔族軍 | 毒魔法 | 死の霧 | 既存 | `deathMist` | spell | poisonEnemy amount 4 | 闇・毒 | plague | true | 既存カード（効果・数値・IDは今のまま） |
| 魔族軍 | 毒魔法 | 疫病 | 既存 | `plague` | spell | poisonEnemy amount 5 | 闇・毒 | — | true | 既存カード（効果・数値・IDは今のまま） |
| 魔族軍 | 呪い魔法 | 呪いの印 | 新規案 | `demon_curse_common` | spell | （効果なし） | dark | demon_curse_uncommon | **false** | 呪い（攻撃力低下・回復力低下・進軍妨害・継続弱体）の状態がまだない。呪い重複上限と持続も未決定。毒や凍結で代用すると別の効果になるため false（仕様 PR-B）。PR-C で作る |
| 魔族軍 | 呪い魔法 | 衰弱 | 新規案 | `demon_curse_uncommon` | spell | （効果なし） | dark | demon_curse_rare | **false** | 呪い（攻撃力低下・回復力低下・進軍妨害・継続弱体）の状態がまだない。呪い重複上限と持続も未決定。毒や凍結で代用すると別の効果になるため false（仕様 PR-B）。PR-C で作る |
| 魔族軍 | 呪い魔法 | 呪縛 | 新規案 | `demon_curse_rare` | spell | （効果なし） | dark | demon_curse_epic | **false** | 呪い（攻撃力低下・回復力低下・進軍妨害・継続弱体）の状態がまだない。呪い重複上限と持続も未決定。毒や凍結で代用すると別の効果になるため false（仕様 PR-B）。PR-C で作る |
| 魔族軍 | 呪い魔法 | 死の宣告 | 新規案 | `demon_curse_epic` | spell | （効果なし） | dark | demon_curse_legendary | **false** | 呪い（攻撃力低下・回復力低下・進軍妨害・継続弱体）の状態がまだない。呪い重複上限と持続も未決定。毒や凍結で代用すると別の効果になるため false（仕様 PR-B）。PR-C で作る |
| 魔族軍 | 呪い魔法 | 永劫の呪い | 新規案 | `demon_curse_legendary` | spell | （効果なし） | dark | — | **false** | 呪い（攻撃力低下・回復力低下・進軍妨害・継続弱体）の状態がまだない。呪い重複上限と持続も未決定。毒や凍結で代用すると別の効果になるため false（仕様 PR-B）。PR-C で作る |
| 魔族軍 | 生命吸収 | 魂の欠片 | 新規案 | `demon_drain_common` | spell | drainCastle amount 3 | dark | demon_drain_uncommon | true | 既存の drainCastle（相手の城に 3 ダメージ。城HPを実際に減らしたぶんだけ自分の城を回復。城壁が受けたぶんは回復しない）が仕様どおり。基準ダメージ 3 は仕様書の値（命の簒奪＝レアの 8 と同じ系統） |
| 魔族軍 | 生命吸収 | 生命吸収 | 新規案 | `demon_drain_uncommon` | spell | drainCastle amount 5 | dark | lifeSteal | true | 既存の drainCastle（相手の城に 5 ダメージ。城HPを実際に減らしたぶんだけ自分の城を回復。城壁が受けたぶんは回復しない）が仕様どおり。基準ダメージ 5 は仕様書の値（命の簒奪＝レアの 8 と同じ系統） |
| 魔族軍 | 生命吸収 | 命の簒奪 | 既存 | `lifeSteal` | spell | drainCastle amount 8 | 闇 | demon_drain_epic | true | 既存カード（効果・数値・IDは今のまま）。台帳の合成先は魂喰らい（同じ魔族）。人間の決定で付けかえた |
| 魔族軍 | 生命吸収 | 魂喰らい | 新規案 | `demon_drain_epic` | spell | drainCastle amount 12 | dark | demon_drain_legendary | true | 既存の drainCastle（相手の城に 12 ダメージ。城HPを実際に減らしたぶんだけ自分の城を回復。城壁が受けたぶんは回復しない）が仕様どおり。基準ダメージ 12 は仕様書の値（命の簒奪＝レアの 8 と同じ系統） |
| 魔族軍 | 生命吸収 | 冥府の収穫 | 新規案 | `demon_drain_legendary` | spell | drainCastle amount 18 | dark | — | true | 既存の drainCastle（相手の城に 18 ダメージ。城HPを実際に減らしたぶんだけ自分の城を回復。城壁が受けたぶんは回復しない）が仕様どおり。基準ダメージ 18 は仕様書の値（命の簒奪＝レアの 8 と同じ系統） |
| 魔族軍 | 死者蘇生 | 残響の魂 | 新規案 | `demon_revive_common` | spell | （効果なし） | dark | demon_revive_uncommon | **false** | その試合で倒れた自軍兵士の履歴（墓地・死亡履歴）がなく、倒れた兵士を戻すしくみがない。復活ターンの攻撃禁止・同じ兵士の無限蘇生の禁止も要る。代用できる既存効果はないため false（仕様 PR-B）。PR-C で作る |
| 魔族軍 | 死者蘇生 | 亡者の呼び声 | 新規案 | `demon_revive_uncommon` | spell | （効果なし） | dark | demon_revive_rare | **false** | その試合で倒れた自軍兵士の履歴（墓地・死亡履歴）がなく、倒れた兵士を戻すしくみがない。復活ターンの攻撃禁止・同じ兵士の無限蘇生の禁止も要る。代用できる既存効果はないため false（仕様 PR-B）。PR-C で作る |
| 魔族軍 | 死者蘇生 | 死者の帰還 | 新規案 | `demon_revive_rare` | spell | （効果なし） | dark | demon_revive_epic | **false** | その試合で倒れた自軍兵士の履歴（墓地・死亡履歴）がなく、倒れた兵士を戻すしくみがない。復活ターンの攻撃禁止・同じ兵士の無限蘇生の禁止も要る。代用できる既存効果はないため false（仕様 PR-B）。PR-C で作る |
| 魔族軍 | 死者蘇生 | 禁忌の蘇生 | 新規案 | `demon_revive_epic` | spell | （効果なし） | dark | demon_revive_legendary | **false** | その試合で倒れた自軍兵士の履歴（墓地・死亡履歴）がなく、倒れた兵士を戻すしくみがない。復活ターンの攻撃禁止・同じ兵士の無限蘇生の禁止も要る。代用できる既存効果はないため false（仕様 PR-B）。PR-C で作る |
| 魔族軍 | 死者蘇生 | 冥界の門 | 新規案 | `demon_revive_legendary` | spell | （効果なし） | dark | — | **false** | その試合で倒れた自軍兵士の履歴（墓地・死亡履歴）がなく、倒れた兵士を戻すしくみがない。復活ターンの攻撃禁止・同じ兵士の無限蘇生の禁止も要る。代用できる既存効果はないため false（仕様 PR-B）。PR-C で作る |
| 魔族軍 | 城防御 | 血の膜 | 新規案 | `demon_wall_common` | defense | （効果なし） | 闇 | demon_wall_uncommon | **false** | 仕様「自城HPを代償に高効率の防御」の、城HPを払って城壁を置くしくみがない。代償も防御値も仕様が「後で決める」としている。城壁だけで出すと王国・森の城壁と同じ効果の複製になる（代償が個性）ため false（仕様 PR-B）。PR-C で作る |
| 魔族軍 | 城防御 | 血の障壁 | 新規案 | `demon_wall_uncommon` | defense | （効果なし） | 闇 | demon_wall_rare | **false** | 仕様「自城HPを代償に高効率の防御」の、城HPを払って城壁を置くしくみがない。代償も防御値も仕様が「後で決める」としている。城壁だけで出すと王国・森の城壁と同じ効果の複製になる（代償が個性）ため false（仕様 PR-B）。PR-C で作る |
| 魔族軍 | 城防御 | 深紅の結界 | 新規案 | `demon_wall_rare` | defense | （効果なし） | 闇 | demon_wall_epic | **false** | 仕様「自城HPを代償に高効率の防御」の、城HPを払って城壁を置くしくみがない。代償も防御値も仕様が「後で決める」としている。城壁だけで出すと王国・森の城壁と同じ効果の複製になる（代償が個性）ため false（仕様 PR-B）。PR-C で作る |
| 魔族軍 | 城防御 | 魔界の防壁 | 新規案 | `demon_wall_epic` | defense | （効果なし） | 闇 | demon_wall_legendary | **false** | 仕様「自城HPを代償に高効率の防御」の、城HPを払って城壁を置くしくみがない。代償も防御値も仕様が「後で決める」としている。城壁だけで出すと王国・森の城壁と同じ効果の複製になる（代償が個性）ため false（仕様 PR-B）。PR-C で作る |
| 魔族軍 | 城防御 | 冥王の障壁 | 新規案 | `demon_wall_legendary` | defense | （効果なし） | 闇 | — | **false** | 仕様「自城HPを代償に高効率の防御」の、城HPを払って城壁を置くしくみがない。代償も防御値も仕様が「後で決める」としている。城壁だけで出すと王国・森の城壁と同じ効果の複製になる（代償が個性）ため false（仕様 PR-B）。PR-C で作る |
| 魔族軍 | 兵士防御 | 骨の盾 | 新規案 | `demon_armor_common` | defense | （効果なし） | 闇 | demon_armor_uncommon | **false** | 仕様の防御値と代償が未決定（「代償と防御値は後で決める」）で、盾だけで出すと王国の盾・森の植物防具と同じ効果の複製になるため false。PR-C で作る |
| 魔族軍 | 兵士防御 | 亡者の鎧 | 新規案 | `demon_armor_uncommon` | defense | （効果なし） | 闇 | demon_armor_rare | **false** | 仕様の防御値と代償が未決定（「代償と防御値は後で決める」）で、盾だけで出すと王国の盾・森の植物防具と同じ効果の複製になるため false。PR-C で作る |
| 魔族軍 | 兵士防御 | 呪骨の鎧 | 新規案 | `demon_armor_rare` | defense | （効果なし） | 闇 | demon_armor_epic | **false** | 仕様の防御値と代償が未決定（「代償と防御値は後で決める」）で、盾だけで出すと王国の盾・森の植物防具と同じ効果の複製になるため false。レア以上は「攻撃者に呪いを付与」（呪い状態がまだない）。PR-C で作る |
| 魔族軍 | 兵士防御 | 死霊の甲冑 | 新規案 | `demon_armor_epic` | defense | （効果なし） | 闇 | demon_armor_legendary | **false** | 仕様の防御値と代償が未決定（「代償と防御値は後で決める」）で、盾だけで出すと王国の盾・森の植物防具と同じ効果の複製になるため false。レア以上は「攻撃者に呪いを付与」（呪い状態がまだない）。PR-C で作る |
| 魔族軍 | 兵士防御 | 不滅の鎧 | 新規案 | `demon_armor_legendary` | defense | （効果なし） | 闇 | — | **false** | 仕様の防御値と代償が未決定（「代償と防御値は後で決める」）で、盾だけで出すと王国の盾・森の植物防具と同じ効果の複製になるため false。レア以上は「攻撃者に呪いを付与」（呪い状態がまだない）。PR-C で作る |
| 魔族軍 | 魔力操作 | 魔力強奪 | 既存 | `manaRaid` | spell | drainMp amount 4 | 闇 | （合成しない） | true | 既存カード（効果・数値・IDは今のまま） |
| 竜族帝国 | 兵士 | 竜人の新兵 | 新規案 | `dragonborn_common` | soldier | melee HP6/攻4/速2 | 火・雷 | dragonborn_uncommon | true | ふつうの進む兵士（melee）として実際に進軍・戦闘・城攻撃する。仕様「竜人は重装前衛」の部分。王国の同レアの兵士（と魔族の不死者）とは、HP・攻撃・速さの差し引きがちがう（低レアは耐久寄り、高レアは攻め寄り） |
| 竜族帝国 | 兵士 | 竜鱗戦士 | 新規案 | `dragonborn_uncommon` | soldier | melee HP6/攻6/速2 | 火・雷 | dragonborn_rare | true | ふつうの進む兵士（melee）として実際に進軍・戦闘・城攻撃する。仕様「竜人は重装前衛」の部分。王国の同レアの兵士（と魔族の不死者）とは、HP・攻撃・速さの差し引きがちがう（低レアは耐久寄り、高レアは攻め寄り） |
| 竜族帝国 | 兵士 | 竜槍兵 | 新規案 | `dragonborn_rare` | soldier | melee HP10/攻7/速2 | 火・雷 | dragonborn_epic | true | ふつうの進む兵士（melee）として実際に進軍・戦闘・城攻撃する。仕様「竜人は重装前衛」の部分。王国の同レアの兵士（と魔族の不死者）とは、HP・攻撃・速さの差し引きがちがう（低レアは耐久寄り、高レアは攻め寄り） |
| 竜族帝国 | 兵士 | 竜将 | 新規案 | `dragonborn_epic` | soldier | melee HP12/攻10/速2 | 火・雷 | dragonborn_legendary | true | ふつうの進む兵士（melee）として実際に進軍・戦闘・城攻撃する。仕様「竜人は重装前衛」の部分。王国の同レアの兵士（と魔族の不死者）とは、HP・攻撃・速さの差し引きがちがう（低レアは耐久寄り、高レアは攻め寄り） |
| 竜族帝国 | 兵士 | 竜帝近衛 | 新規案 | `dragonborn_legendary` | soldier | melee HP15/攻13/速3 | 火・雷 | — | true | ふつうの進む兵士（melee）として実際に進軍・戦闘・城攻撃する。仕様「竜人は重装前衛」の部分。王国の同レアの兵士（と魔族の不死者）とは、HP・攻撃・速さの差し引きがちがう（低レアは耐久寄り、高レアは攻め寄り） |
| 竜族帝国 | 兵士 | 竜騎兵見習い | 新規案 | `dragon_rider_common` | soldier | melee HP2/攻5/速5 | 火・雷 | dragon_rider_uncommon | **false** | 仕様「竜騎兵は飛行突破」の、飛行（敵の兵士に止められずに進む）を起こすしくみがない。兵士に属性（火・雷）を持たせるスキーマもない。飛行なしの速い兵士として出すと、王国の騎兵系（斥候騎兵〜聖騎士）と同じ役割の複製（既存効果の代用）になるため false（仕様 PR-B） |
| 竜族帝国 | 兵士 | 竜騎兵 | 新規案 | `dragon_rider_uncommon` | soldier | melee HP3/攻6/速5 | 火・雷 | dragon_rider_rare | **false** | 仕様「竜騎兵は飛行突破」の、飛行（敵の兵士に止められずに進む）を起こすしくみがない。兵士に属性（火・雷）を持たせるスキーマもない。飛行なしの速い兵士として出すと、王国の騎兵系（斥候騎兵〜聖騎士）と同じ役割の複製（既存効果の代用）になるため false（仕様 PR-B） |
| 竜族帝国 | 兵士 | 飛竜騎兵 | 新規案 | `dragon_rider_rare` | soldier | melee HP4/攻8/速5 | 火・雷 | dragon_rider_epic | **false** | 仕様「竜騎兵は飛行突破」の、飛行（敵の兵士に止められずに進む）を起こすしくみがない。兵士に属性（火・雷）を持たせるスキーマもない。飛行なしの速い兵士として出すと、王国の騎兵系（斥候騎兵〜聖騎士）と同じ役割の複製（既存効果の代用）になるため false（仕様 PR-B） |
| 竜族帝国 | 兵士 | 竜騎将 | 新規案 | `dragon_rider_epic` | soldier | melee HP6/攻10/速5 | 火・雷 | dragonKnight | **false** | 仕様「竜騎兵は飛行突破」の、飛行（敵の兵士に止められずに進む）を起こすしくみがない。兵士に属性（火・雷）を持たせるスキーマもない。飛行なしの速い兵士として出すと、王国の騎兵系（斥候騎兵〜聖騎士）と同じ役割の複製（既存効果の代用）になるため false（仕様 PR-B） |
| 竜族帝国 | 兵士 | 竜騎士 | 既存 | `dragonKnight` | soldier | melee HP10/攻10/速5 | 火・雷 | — | true | 既存カード（効果・数値・IDは今のまま）。台帳は竜騎兵系の最上位（竜騎士）で、王国から竜族へ移管（今の faction はすでに dragon）。合成してくる前の段は台帳の竜騎将（B4 の新規） |
| 竜族帝国 | 兵士 | 見習い竜術師 | 新規案 | `dragon_mage_common` | soldier | mage HP3/攻3/射2/2T | 火・雷 | dragon_mage_uncommon | **false** | 仕様「竜術師は火・雷支援」の、火・雷の支援（火雷の付着・轟雷爆炎への橋渡し）を起こすしくみがない。兵士に属性（火・雷）を持たせるスキーマもない。ふつうの魔法使いとして出すと旧カードの魔法使い系の複製（既存効果の代用）になるため false（仕様 PR-B） |
| 竜族帝国 | 兵士 | 竜術師 | 新規案 | `dragon_mage_uncommon` | soldier | mage HP3/攻5/射2/2T | 火・雷 | dragon_mage_rare | **false** | 仕様「竜術師は火・雷支援」の、火・雷の支援（火雷の付着・轟雷爆炎への橋渡し）を起こすしくみがない。兵士に属性（火・雷）を持たせるスキーマもない。ふつうの魔法使いとして出すと旧カードの魔法使い系の複製（既存効果の代用）になるため false（仕様 PR-B） |
| 竜族帝国 | 兵士 | ドラゴンメイジ | 新規案 | `dragon_mage_rare` | soldier | mage HP4/攻7/射2/2T | 火・雷 | dragon_mage_epic | **false** | 仕様「竜術師は火・雷支援」の、火・雷の支援（火雷の付着・轟雷爆炎への橋渡し）を起こすしくみがない。兵士に属性（火・雷）を持たせるスキーマもない。ふつうの魔法使いとして出すと旧カードの魔法使い系の複製（既存効果の代用）になるため false（仕様 PR-B） |
| 竜族帝国 | 兵士 | 竜王術師 | 新規案 | `dragon_mage_epic` | soldier | mage HP5/攻9/射2/2T | 火・雷 | dragon_mage_legendary | **false** | 仕様「竜術師は火・雷支援」の、火・雷の支援（火雷の付着・轟雷爆炎への橋渡し）を起こすしくみがない。兵士に属性（火・雷）を持たせるスキーマもない。ふつうの魔法使いとして出すと旧カードの魔法使い系の複製（既存効果の代用）になるため false（仕様 PR-B） |
| 竜族帝国 | 兵士 | 竜帝の賢者 | 新規案 | `dragon_mage_legendary` | soldier | mage HP7/攻12/射2/2T | 火・雷 | — | **false** | 仕様「竜術師は火・雷支援」の、火・雷の支援（火雷の付着・轟雷爆炎への橋渡し）を起こすしくみがない。兵士に属性（火・雷）を持たせるスキーマもない。ふつうの魔法使いとして出すと旧カードの魔法使い系の複製（既存効果の代用）になるため false（仕様 PR-B） |
| 竜族帝国 | 兵士 | 幼炎竜 | 新規案 | `fire_dragon_common` | soldier | melee HP6/攻5/速3 | 火 | fire_dragon_uncommon | **false** | 仕様「純竜は人型の武器を装備できない（その代わり素ステータスが高い）」の、装備できない制限を起こすしくみがない。制限なしの高ステータスの兵士として出すと、短所のない王国・魔族の兵士の上位互換になるため false（仕様 PR-B）。飛行もまだない |
| 竜族帝国 | 兵士 | 若炎竜 | 新規案 | `fire_dragon_uncommon` | soldier | melee HP8/攻7/速3 | 火 | fire_dragon_rare | **false** | 仕様「純竜は人型の武器を装備できない（その代わり素ステータスが高い）」の、装備できない制限を起こすしくみがない。制限なしの高ステータスの兵士として出すと、短所のない王国・魔族の兵士の上位互換になるため false（仕様 PR-B）。飛行もまだない |
| 竜族帝国 | 兵士 | 業炎竜 | 新規案 | `fire_dragon_rare` | soldier | melee HP12/攻9/速3 | 火 | fire_dragon_epic | **false** | 仕様「純竜は人型の武器を装備できない（その代わり素ステータスが高い）」の、装備できない制限を起こすしくみがない。制限なしの高ステータスの兵士として出すと、短所のない王国・魔族の兵士の上位互換になるため false（仕様 PR-B）。飛行もまだない |
| 竜族帝国 | 兵士 | 古炎竜 | 新規案 | `fire_dragon_epic` | soldier | melee HP16/攻12/速3 | 火 | fire_dragon_legendary | **false** | 仕様「純竜は人型の武器を装備できない（その代わり素ステータスが高い）」の、装備できない制限を起こすしくみがない。制限なしの高ステータスの兵士として出すと、短所のない王国・魔族の兵士の上位互換になるため false（仕様 PR-B）。飛行もまだない |
| 竜族帝国 | 兵士 | 紅蓮竜王 | 新規案 | `fire_dragon_legendary` | soldier | melee HP22/攻16/速3 | 火 | — | **false** | 仕様「純竜は人型の武器を装備できない（その代わり素ステータスが高い）」の、装備できない制限を起こすしくみがない。制限なしの高ステータスの兵士として出すと、短所のない王国・魔族の兵士の上位互換になるため false（仕様 PR-B）。飛行もまだない |
| 竜族帝国 | 兵士 | 幼雷竜 | 新規案 | `lightning_dragon_common` | soldier | melee HP5/攻5/速4 | 雷 | lightning_dragon_uncommon | **false** | 仕様「純竜は人型の武器を装備できない（その代わり素ステータスが高い）」の、装備できない制限を起こすしくみがない。制限なしの高ステータスの兵士として出すと、短所のない王国・魔族の兵士の上位互換になるため false（仕様 PR-B）。飛行もまだない |
| 竜族帝国 | 兵士 | 若雷竜 | 新規案 | `lightning_dragon_uncommon` | soldier | melee HP6/攻7/速4 | 雷 | lightning_dragon_rare | **false** | 仕様「純竜は人型の武器を装備できない（その代わり素ステータスが高い）」の、装備できない制限を起こすしくみがない。制限なしの高ステータスの兵士として出すと、短所のない王国・魔族の兵士の上位互換になるため false（仕様 PR-B）。飛行もまだない |
| 竜族帝国 | 兵士 | 雷鳴竜 | 新規案 | `lightning_dragon_rare` | soldier | melee HP10/攻9/速4 | 雷 | lightning_dragon_epic | **false** | 仕様「純竜は人型の武器を装備できない（その代わり素ステータスが高い）」の、装備できない制限を起こすしくみがない。制限なしの高ステータスの兵士として出すと、短所のない王国・魔族の兵士の上位互換になるため false（仕様 PR-B）。飛行もまだない |
| 竜族帝国 | 兵士 | 古雷竜 | 新規案 | `lightning_dragon_epic` | soldier | melee HP13/攻12/速4 | 雷 | lightning_dragon_legendary | **false** | 仕様「純竜は人型の武器を装備できない（その代わり素ステータスが高い）」の、装備できない制限を起こすしくみがない。制限なしの高ステータスの兵士として出すと、短所のない王国・魔族の兵士の上位互換になるため false（仕様 PR-B）。飛行もまだない |
| 竜族帝国 | 兵士 | 雷霆竜王 | 新規案 | `lightning_dragon_legendary` | soldier | melee HP18/攻16/速4 | 雷 | — | **false** | 仕様「純竜は人型の武器を装備できない（その代わり素ステータスが高い）」の、装備できない制限を起こすしくみがない。制限なしの高ステータスの兵士として出すと、短所のない王国・魔族の兵士の上位互換になるため false（仕様 PR-B）。飛行もまだない |
| 竜族帝国 | 武器 | 竜牙剣 | 新規案 | `dragon_fire_weapon_common` | weapon | 攻撃+1 | fire | dragon_fire_weapon_uncommon | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+1は仕様書の値 |
| 竜族帝国 | 武器 | 紅蓮の竜剣 | 新規案 | `dragon_fire_weapon_uncommon` | weapon | 攻撃+2 | fire | dragon_fire_weapon_rare | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+2は仕様書の値 |
| 竜族帝国 | 武器 | 灼竜剣 | 新規案 | `dragon_fire_weapon_rare` | weapon | 攻撃+4 | fire | dragon_fire_weapon_epic | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+4は仕様書の値 |
| 竜族帝国 | 武器 | 古竜の大剣 | 新規案 | `dragon_fire_weapon_epic` | weapon | 攻撃+6 | fire | dragon_fire_weapon_legendary | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+6は仕様書の値 |
| 竜族帝国 | 武器 | 竜帝の覇剣 | 新規案 | `dragon_fire_weapon_legendary` | weapon | 攻撃+9 | fire | — | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+9は仕様書の値 |
| 竜族帝国 | 武器 | 雷牙槍 | 新規案 | `dragon_lightning_weapon_common` | weapon | 攻撃+1 | thunder | dragon_lightning_weapon_uncommon | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+1は仕様書の値 |
| 竜族帝国 | 武器 | 迅雷の槍 | 新規案 | `dragon_lightning_weapon_uncommon` | weapon | 攻撃+2 | thunder | dragon_lightning_weapon_rare | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+2は仕様書の値 |
| 竜族帝国 | 武器 | 轟雷竜槍 | 新規案 | `dragon_lightning_weapon_rare` | weapon | 攻撃+4 | thunder | dragon_lightning_weapon_epic | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+4は仕様書の値 |
| 竜族帝国 | 武器 | 雷帝の槍 | 新規案 | `dragon_lightning_weapon_epic` | weapon | 攻撃+6 | thunder | dragon_lightning_weapon_legendary | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+6は仕様書の値 |
| 竜族帝国 | 武器 | 天竜雷槍 | 新規案 | `dragon_lightning_weapon_legendary` | weapon | 攻撃+9 | thunder | — | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+9は仕様書の値 |
| 竜族帝国 | 攻撃魔法 | ファイアボール | 既存 | `fireball` | spell | damageEnemyCastle amount 5 | 火 | inferno | true | 既存カード（効果・数値・IDは今のまま） |
| 竜族帝国 | 攻撃魔法 | 業火 | 既存 | `inferno` | spell | damageEnemyCastle amount 9 | 火 | meteor | true | 既存カード（効果・数値・IDは今のまま） |
| 竜族帝国 | 攻撃魔法 | 隕石 | 既存 | `meteor` | spell | damageEnemyCastle amount 14 | 火 | starfall | true | 既存カード（効果・数値・IDは今のまま） |
| 竜族帝国 | 攻撃魔法 | 星降り | 既存 | `starfall` | spell | damageEnemyCastle amount 19 | 火 | apocalypse | true | 既存カード（効果・数値・IDは今のまま） |
| 竜族帝国 | 攻撃魔法 | 終末の炎 | 既存 | `apocalypse` | spell | damageEnemyCastle amount 25 | 火 | — | true | 既存カード（効果・数値・IDは今のまま） |
| 竜族帝国 | 攻撃魔法 | 雷光 | 既存 | `bolt` | spell | damageEnemySoldiers amount 2 | 雷 | thunder | true | 既存カード（効果・数値・IDは今のまま） |
| 竜族帝国 | 攻撃魔法 | サンダー | 既存 | `thunder` | spell | damageEnemySoldiers amount 3 scope lane | 雷 | bigThunder | true | 既存カード（効果・数値・IDは今のまま） |
| 竜族帝国 | 攻撃魔法 | 大雷 | 既存 | `bigThunder` | spell | damageEnemySoldiers amount 5 | 雷 | raijin | true | 既存カード（効果・数値・IDは今のまま） |
| 竜族帝国 | 攻撃魔法 | 雷神の怒り | 既存 | `raijin` | spell | damageEnemySoldiers amount 8 | 雷 | judgment | true | 既存カード（効果・数値・IDは今のまま） |
| 竜族帝国 | 攻撃魔法 | 天罰 | 既存 | `judgment` | spell | damageEnemySoldiers amount 14 | 雷 | — | true | 既存カード（効果・数値・IDは今のまま） |
| 竜族帝国 | 竜のブレス | 火炎の吐息 | 新規案 | `dragon_breath_common` | spell | （効果なし） | fire | dragon_breath_uncommon | **false** | 仕様「城と兵士を同時に攻撃・レアから範囲増加・高MP消費」を起こすしくみがない。城と兵士に同時に当てる既存効果の damageEnemyAll（魔王のカード）は、レーンを選べず、MP を使わない（魔物のカードは MP 0）ので、代用するとレアリティごとの範囲・高MP の個性が消える。ダメージも仕様が未確定のため false（仕様 PR-B）。PR-C で作る |
| 竜族帝国 | 竜のブレス | 灼熱の息吹 | 新規案 | `dragon_breath_uncommon` | spell | （効果なし） | fire | dragon_breath_rare | **false** | 仕様「城と兵士を同時に攻撃・レアから範囲増加・高MP消費」を起こすしくみがない。城と兵士に同時に当てる既存効果の damageEnemyAll（魔王のカード）は、レーンを選べず、MP を使わない（魔物のカードは MP 0）ので、代用するとレアリティごとの範囲・高MP の個性が消える。ダメージも仕様が未確定のため false（仕様 PR-B）。PR-C で作る |
| 竜族帝国 | 竜のブレス | 竜炎の咆哮 | 新規案 | `dragon_breath_rare` | spell | （効果なし） | fire | dragon_breath_epic | **false** | 仕様「城と兵士を同時に攻撃・レアから範囲増加・高MP消費」を起こすしくみがない。城と兵士に同時に当てる既存効果の damageEnemyAll（魔王のカード）は、レーンを選べず、MP を使わない（魔物のカードは MP 0）ので、代用するとレアリティごとの範囲・高MP の個性が消える。ダメージも仕様が未確定のため false（仕様 PR-B）。PR-C で作る |
| 竜族帝国 | 竜のブレス | 天焦がすブレス | 新規案 | `dragon_breath_epic` | spell | （効果なし） | fire | dragon_breath_legendary | **false** | 仕様「城と兵士を同時に攻撃・レアから範囲増加・高MP消費」を起こすしくみがない。城と兵士に同時に当てる既存効果の damageEnemyAll（魔王のカード）は、レーンを選べず、MP を使わない（魔物のカードは MP 0）ので、代用するとレアリティごとの範囲・高MP の個性が消える。ダメージも仕様が未確定のため false（仕様 PR-B）。PR-C で作る |
| 竜族帝国 | 竜のブレス | 終焉の竜息 | 新規案 | `dragon_breath_legendary` | spell | （効果なし） | fire | — | **false** | 仕様「城と兵士を同時に攻撃・レアから範囲増加・高MP消費」を起こすしくみがない。城と兵士に同時に当てる既存効果の damageEnemyAll（魔王のカード）は、レーンを選べず、MP を使わない（魔物のカードは MP 0）ので、代用するとレアリティごとの範囲・高MP の個性が消える。ダメージも仕様が未確定のため false（仕様 PR-B）。PR-C で作る |
| 竜族帝国 | 竜威・覚醒 | 竜の鼓動 | 新規案 | `dragon_awakening_common` | spell | （効果なし） | 火・雷 | dragon_awakening_uncommon | **false** | 竜威ゲージ（陣営奥義のゲージ。1ターン最大+1・上限3）がまだない（PR-D）。覚醒カードは「蓄積補助」なので、ゲージなしで兵士の強化だけを出すと別のカードになる（仕様：別ゲージ・2回目の奥義を作らない） |
| 竜族帝国 | 竜威・覚醒 | 竜血の鼓舞 | 新規案 | `dragon_awakening_uncommon` | spell | （効果なし） | 火・雷 | dragon_awakening_rare | **false** | 竜威ゲージ（陣営奥義のゲージ。1ターン最大+1・上限3）がまだない（PR-D）。覚醒カードは「蓄積補助」なので、ゲージなしで兵士の強化だけを出すと別のカードになる（仕様：別ゲージ・2回目の奥義を作らない） |
| 竜族帝国 | 竜威・覚醒 | 竜血覚醒 | 新規案 | `dragon_awakening_rare` | spell | （効果なし） | 火・雷 | dragon_awakening_epic | **false** | 竜威ゲージ（陣営奥義のゲージ。1ターン最大+1・上限3）がまだない（PR-D）。覚醒カードは「蓄積補助」なので、ゲージなしで兵士の強化だけを出すと別のカードになる（仕様：別ゲージ・2回目の奥義を作らない） |
| 竜族帝国 | 竜威・覚醒 | 竜王の号令 | 新規案 | `dragon_awakening_epic` | spell | （効果なし） | 火・雷 | dragon_awakening_legendary | **false** | 竜威ゲージ（陣営奥義のゲージ。1ターン最大+1・上限3）がまだない（PR-D）。覚醒カードは「蓄積補助」なので、ゲージなしで兵士の強化だけを出すと別のカードになる（仕様：別ゲージ・2回目の奥義を作らない） |
| 竜族帝国 | 竜威・覚醒 | 竜帝の勅令 | 新規案 | `dragon_awakening_legendary` | spell | （効果なし） | 火・雷 | — | **false** | 竜威ゲージ（陣営奥義のゲージ。1ターン最大+1・上限3）がまだない（PR-D）。覚醒カードは「蓄積補助」なので、ゲージなしで兵士の強化だけを出すと別のカードになる（仕様：別ゲージ・2回目の奥義を作らない） |
| 竜族帝国 | 城防御 | 火山灰の幕 | 新規案 | `dragon_wall_common` | defense | （効果なし） | 火 | dragon_wall_uncommon | **false** | 仕様に防御値がなく、個性（溶岩の城壁：低レアに個性はない）を起こすしくみもない。armorCastle の城壁だけで出すと王国・森の城壁系（3/5/9/15/25）と同じ効果の複製になり、数値を弱くすると「ただ弱いだけ」のカードになるため false（仕様 PR-B）。PR-C で作る |
| 竜族帝国 | 城防御 | 溶岩の城柵 | 新規案 | `dragon_wall_uncommon` | defense | （効果なし） | 火 | dragon_wall_rare | **false** | 仕様に防御値がなく、個性（溶岩の城壁：低レアに個性はない）を起こすしくみもない。armorCastle の城壁だけで出すと王国・森の城壁系（3/5/9/15/25）と同じ効果の複製になり、数値を弱くすると「ただ弱いだけ」のカードになるため false（仕様 PR-B）。PR-C で作る |
| 竜族帝国 | 城防御 | 溶岩の城壁 | 新規案 | `dragon_wall_rare` | defense | （効果なし） | 火 | dragon_wall_epic | **false** | 仕様に防御値がなく、個性（溶岩の城壁：低レアに個性はない）を起こすしくみもない。armorCastle の城壁だけで出すと王国・森の城壁系（3/5/9/15/25）と同じ効果の複製になり、数値を弱くすると「ただ弱いだけ」のカードになるため false（仕様 PR-B）。PR-C で作る |
| 竜族帝国 | 城防御 | 赤熱の障壁 | 新規案 | `dragon_wall_epic` | defense | （効果なし） | 火 | dragon_wall_legendary | **false** | 仕様に防御値がなく、個性（溶岩の城壁：上位は火傷・前進阻害への耐性の案）を起こすしくみもない。armorCastle の城壁だけで出すと王国・森の城壁系（3/5/9/15/25）と同じ効果の複製になり、数値を弱くすると「ただ弱いだけ」のカードになるため false（仕様 PR-B）。PR-C で作る |
| 竜族帝国 | 城防御 | 竜帝の要塞 | 新規案 | `dragon_wall_legendary` | defense | （効果なし） | 火 | — | **false** | 仕様に防御値がなく、個性（溶岩の城壁：上位は火傷・前進阻害への耐性の案）を起こすしくみもない。armorCastle の城壁だけで出すと王国・森の城壁系（3/5/9/15/25）と同じ効果の複製になり、数値を弱くすると「ただ弱いだけ」のカードになるため false（仕様 PR-B）。PR-C で作る |
| 竜族帝国 | 兵士防御 | 幼竜の鱗 | 新規案 | `dragon_armor_common` | defense | （効果なし） | 火・雷 | dragon_armor_uncommon | **false** | 仕様に防御値がなく、個性（竜鱗の防具：低レアに個性はない）を起こすしくみもない。shieldSoldier の盾だけで出すと王国の盾系・森の植物防具と同じ効果の複製になるため false（仕様 PR-B）。PR-C で作る |
| 竜族帝国 | 兵士防御 | 竜鱗の鎧 | 新規案 | `dragon_armor_uncommon` | defense | （効果なし） | 火・雷 | dragon_armor_rare | **false** | 仕様に防御値がなく、個性（竜鱗の防具：低レアに個性はない）を起こすしくみもない。shieldSoldier の盾だけで出すと王国の盾系・森の植物防具と同じ効果の複製になるため false（仕様 PR-B）。PR-C で作る |
| 竜族帝国 | 兵士防御 | 黒曜竜鎧 | 新規案 | `dragon_armor_rare` | defense | （効果なし） | 火・雷 | dragon_armor_epic | **false** | 仕様に防御値がなく、個性（竜鱗の防具：低レアに個性はない）を起こすしくみもない。shieldSoldier の盾だけで出すと王国の盾系・森の植物防具と同じ効果の複製になるため false（仕様 PR-B）。PR-C で作る |
| 竜族帝国 | 兵士防御 | 古竜の甲殻 | 新規案 | `dragon_armor_epic` | defense | （効果なし） | 火・雷 | dragon_armor_legendary | **false** | 仕様に防御値がなく、個性（竜鱗の防具：上位は火傷・前進阻害への耐性の案）を起こすしくみもない。shieldSoldier の盾だけで出すと王国の盾系・森の植物防具と同じ効果の複製になるため false（仕様 PR-B）。PR-C で作る |
| 竜族帝国 | 兵士防御 | 竜帝の逆鱗 | 新規案 | `dragon_armor_legendary` | defense | （効果なし） | 火・雷 | — | **false** | 仕様に防御値がなく、個性（竜鱗の防具：上位は火傷・前進阻害への耐性の案）を起こすしくみもない。shieldSoldier の盾だけで出すと王国の盾系・森の植物防具と同じ効果の複製になるため false（仕様 PR-B）。PR-C で作る |
| 竜族帝国 | 回復魔法 | 竜血の雫 | 新規案 | `dragon_regen_common` | spell | （効果なし） | 火・生命 | dragon_regen_uncommon | **false** | 仕様に回復の量・効き方の記述がない（台帳の属性は「火・生命」）。名前（竜血の再生・不滅の竜心）は継続回復（再生）を思わせるが、再生のしくみがない。城を回復する既存効果の healOwnCastle だけで出すと、王国の回復系（小回復〜女神の祝福）の複製になるため false（仕様 PR-B）。「火力は高いが防御は薄い」竜族の個性とあわせて、人間に決めてもらう |
| 竜族帝国 | 回復魔法 | 竜血の再生 | 新規案 | `dragon_regen_uncommon` | spell | （効果なし） | 火・生命 | dragon_regen_rare | **false** | 仕様に回復の量・効き方の記述がない（台帳の属性は「火・生命」）。名前（竜血の再生・不滅の竜心）は継続回復（再生）を思わせるが、再生のしくみがない。城を回復する既存効果の healOwnCastle だけで出すと、王国の回復系（小回復〜女神の祝福）の複製になるため false（仕様 PR-B）。「火力は高いが防御は薄い」竜族の個性とあわせて、人間に決めてもらう |
| 竜族帝国 | 回復魔法 | 竜骨の活力 | 新規案 | `dragon_regen_rare` | spell | （効果なし） | 火・生命 | dragon_regen_epic | **false** | 仕様に回復の量・効き方の記述がない（台帳の属性は「火・生命」）。名前（竜血の再生・不滅の竜心）は継続回復（再生）を思わせるが、再生のしくみがない。城を回復する既存効果の healOwnCastle だけで出すと、王国の回復系（小回復〜女神の祝福）の複製になるため false（仕様 PR-B）。「火力は高いが防御は薄い」竜族の個性とあわせて、人間に決めてもらう |
| 竜族帝国 | 回復魔法 | 古竜の生命 | 新規案 | `dragon_regen_epic` | spell | （効果なし） | 火・生命 | dragon_regen_legendary | **false** | 仕様に回復の量・効き方の記述がない（台帳の属性は「火・生命」）。名前（竜血の再生・不滅の竜心）は継続回復（再生）を思わせるが、再生のしくみがない。城を回復する既存効果の healOwnCastle だけで出すと、王国の回復系（小回復〜女神の祝福）の複製になるため false（仕様 PR-B）。「火力は高いが防御は薄い」竜族の個性とあわせて、人間に決めてもらう |
| 竜族帝国 | 回復魔法 | 不滅の竜心 | 新規案 | `dragon_regen_legendary` | spell | （効果なし） | 火・生命 | — | **false** | 仕様に回復の量・効き方の記述がない（台帳の属性は「火・生命」）。名前（竜血の再生・不滅の竜心）は継続回復（再生）を思わせるが、再生のしくみがない。城を回復する既存効果の healOwnCastle だけで出すと、王国の回復系（小回復〜女神の祝福）の複製になるため false（仕様 PR-B）。「火力は高いが防御は薄い」竜族の個性とあわせて、人間に決めてもらう |
| 全陣営共通 | MP回復 | 魔力のかけら | 既存 | `manaShard` | spell | gainMp amount 1 | 無 | manaDrop | true | 既存カード（効果・数値・IDは今のまま） |
| 全陣営共通 | MP回復 | 魔力のしずく | 既存 | `manaDrop` | spell | gainMp amount 2 | 無 | manaCrystal | true | 既存カード（効果・数値・IDは今のまま） |
| 全陣営共通 | MP回復 | 魔力の水晶 | 既存 | `manaCrystal` | spell | gainMp amount 5 | 無 | manaSpring | true | 既存カード（効果・数値・IDは今のまま） |
| 全陣営共通 | MP回復 | 魔力の泉 | 既存 | `manaSpring` | spell | gainMp amount 10 | 無 | worldTreeDew | true | 既存カード（効果・数値・IDは今のまま） |
| 全陣営共通 | MP回復 | 世界樹のしずく | 既存 | `worldTreeDew` | spell | gainMp amount 20 | 無 | — | true | 既存カード（効果・数値・IDは今のまま） |
| 全陣営共通 | 合成補助 | 適応 | 既存 | `adapt` | spell | wild | 無 | — | true | 既存カード（効果・数値・IDは今のまま） |
| 全陣営共通 | 手札操作 | 天の恵み | 既存 | `blessing` | spell | redrawHand | 無 | （合成しない） | true | 既存カード（効果・数値・IDは今のまま） |
