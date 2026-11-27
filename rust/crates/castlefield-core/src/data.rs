use std::collections::BTreeMap;

use crate::json::{parse_json, JsonValue};

fn opt_str(v: &JsonValue, k: &str) -> Option<String> {
    v.get(k).and_then(|x| x.as_str()).map(|s| s.to_string())
}
fn opt_i32(v: &JsonValue, k: &str) -> Option<i32> {
    v.get(k).and_then(|x| x.as_i32())
}
fn opt_u32(v: &JsonValue, k: &str) -> Option<u32> {
    v.get(k).and_then(|x| x.as_u32())
}
fn opt_usize(v: &JsonValue, k: &str) -> Option<usize> {
    v.get(k).and_then(|x| x.as_usize())
}
fn opt_f64(v: &JsonValue, k: &str) -> Option<f64> {
    v.get(k).and_then(|x| x.as_f64())
}
fn opt_bool(v: &JsonValue, k: &str) -> Option<bool> {
    v.get(k).and_then(|x| x.as_bool())
}

#[derive(Debug, Clone)]
pub struct CardDef {
    pub name: String,
    pub kind: String,
    pub hp: Option<i32>,
    pub attack: Option<i32>,
    pub speed: Option<i32>,
    pub range: Option<i32>,
    pub stay: Option<i32>,
    pub role: Option<String>,
    pub rarity: Option<String>,
    pub cost: Option<i32>,
    pub mp_cost: Option<i32>,
    pub count: Option<u32>,
    pub weight: Option<f64>,
    pub effect: Option<String>,
    pub amount: Option<i32>,
    pub armor: Option<i32>,
    pub heal: Option<i32>,
    pub self_damage: Option<i32>,
    pub attack_bonus: Option<i32>,
    pub element: Option<String>,
    pub spirit: Option<String>,
    pub turns: Option<i32>,
    pub exhaust: Option<bool>,
    pub scope: Option<String>,
    pub fuse_to: Option<String>,
    pub dice: Option<String>,
    pub per: Option<f64>,
    pub time: Option<String>,
    pub monster: Option<String>,
    pub description: Option<String>,
}

impl CardDef {
    pub fn from_json(v: &JsonValue) -> Result<Self, String> {
        Ok(Self {
            name: opt_str(v, "name").ok_or("CardDef missing name")?,
            kind: opt_str(v, "kind").ok_or("CardDef missing kind")?,
            hp: opt_i32(v, "hp"),
            attack: opt_i32(v, "attack"),
            speed: opt_i32(v, "speed"),
            range: opt_i32(v, "range"),
            stay: opt_i32(v, "stay"),
            role: opt_str(v, "role"),
            rarity: opt_str(v, "rarity"),
            cost: opt_i32(v, "cost"),
            mp_cost: opt_i32(v, "mpCost"),
            count: opt_u32(v, "count"),
            weight: opt_f64(v, "weight"),
            effect: opt_str(v, "effect"),
            amount: opt_i32(v, "amount"),
            armor: opt_i32(v, "armor"),
            heal: opt_i32(v, "heal"),
            self_damage: opt_i32(v, "selfDamage"),
            attack_bonus: opt_i32(v, "attackBonus"),
            element: opt_str(v, "element"),
            spirit: opt_str(v, "spirit"),
            turns: opt_i32(v, "turns"),
            exhaust: opt_bool(v, "exhaust"),
            scope: opt_str(v, "scope"),
            fuse_to: opt_str(v, "fuseTo"),
            dice: opt_str(v, "dice"),
            per: opt_f64(v, "per"),
            time: opt_str(v, "time"),
            monster: opt_str(v, "monster"),
            description: opt_str(v, "description"),
        })
    }
}

#[derive(Debug, Clone)]
pub struct RulesDef {
    pub castle_max_hp: i32,
    pub second_player_castle_bonus: i32,
    pub initial_hand: usize,
    pub draw_per_turn: usize,
    pub first_turn_draw: usize,
    pub draw_until_hand: Option<usize>,
    pub max_hand: usize,
    pub lane_length: usize,
    pub lane_count: usize,
    pub defense_reaction: bool,
    pub advance_after_win: bool,
    pub soldier_castle_damage_multiplier: i32,
    pub element_bonus: i32,
    pub monster_first_round: u32,
    pub monster_cooldown_rounds: u32,
    pub monster_spawn_chance: f64,
    pub player_count: usize,
    pub max_rounds: u32,
    pub deck_mode: String,
    pub deck_size: usize,
    pub draw_per_played: bool,
    pub soldiers_per_turn: usize,
    pub initial_coins: i32,
    pub coin_per_turn: i32,
    pub monster_attack_growth: i32,
    pub initial_mp: i32,
    pub max_mp: i32,
    pub armor_max: i32,
    pub poison_turns: Option<i32>,
    pub poison_max: Option<i32>,
    pub coin_cards_per_turn: i32,
    pub second_player_hand_bonus: usize,
    pub second_player_armor: i32,
    pub mulligan: bool,
    pub overdrive_hp_ratio: Option<f64>,
    pub overdrive_attack: Option<i32>,
    pub mp_per_turn: Option<i32>,
    pub mp_all_cards: bool,
}

impl Default for RulesDef {
    fn default() -> Self {
        Self {
            castle_max_hp: 40,
            second_player_castle_bonus: 0,
            initial_hand: 5,
            draw_per_turn: 1,
            first_turn_draw: 1,
            draw_until_hand: None,
            max_hand: 8,
            lane_length: 3,
            lane_count: 1,
            defense_reaction: true,
            advance_after_win: false,
            soldier_castle_damage_multiplier: 1,
            element_bonus: 0,
            monster_first_round: 3,
            monster_cooldown_rounds: 0,
            monster_spawn_chance: 0.0,
            player_count: 2,
            max_rounds: 60,
            deck_mode: "shared".to_string(),
            deck_size: 100,
            draw_per_played: false,
            soldiers_per_turn: 3,
            initial_coins: 0,
            coin_per_turn: 1,
            monster_attack_growth: 0,
            initial_mp: 10,
            max_mp: 20,
            armor_max: 40,
            poison_turns: None,
            poison_max: None,
            coin_cards_per_turn: 1,
            second_player_hand_bonus: 0,
            second_player_armor: 0,
            mulligan: false,
            overdrive_hp_ratio: None,
            overdrive_attack: None,
            mp_per_turn: None,
            mp_all_cards: false,
        }
    }
}

impl RulesDef {
    pub fn from_json(v: &JsonValue) -> Self {
        let d = Self::default();
        Self {
            castle_max_hp: opt_i32(v, "castleMaxHp").unwrap_or(d.castle_max_hp),
            second_player_castle_bonus: opt_i32(v, "secondPlayerCastleBonus").unwrap_or(d.second_player_castle_bonus),
            initial_hand: opt_usize(v, "initialHand").unwrap_or(d.initial_hand),
            draw_per_turn: opt_usize(v, "drawPerTurn").unwrap_or(d.draw_per_turn),
            first_turn_draw: opt_usize(v, "firstTurnDraw").unwrap_or(d.first_turn_draw),
            draw_until_hand: opt_usize(v, "drawUntilHand"),
            max_hand: opt_usize(v, "maxHand").unwrap_or(d.max_hand),
            lane_length: opt_usize(v, "laneLength").unwrap_or(d.lane_length),
            lane_count: opt_usize(v, "laneCount").unwrap_or(d.lane_count),
            defense_reaction: opt_bool(v, "defenseReaction").unwrap_or(d.defense_reaction),
            advance_after_win: opt_bool(v, "advanceAfterWin").unwrap_or(d.advance_after_win),
            soldier_castle_damage_multiplier: opt_i32(v, "soldierCastleDamageMultiplier").unwrap_or(d.soldier_castle_damage_multiplier),
            element_bonus: opt_i32(v, "elementBonus").unwrap_or(d.element_bonus),
            monster_first_round: opt_u32(v, "monsterFirstRound").unwrap_or(d.monster_first_round),
            monster_cooldown_rounds: opt_u32(v, "monsterCooldownRounds").unwrap_or(d.monster_cooldown_rounds),
            monster_spawn_chance: opt_f64(v, "monsterSpawnChance").unwrap_or(d.monster_spawn_chance),
            player_count: opt_usize(v, "playerCount").unwrap_or(d.player_count),
            max_rounds: opt_u32(v, "maxRounds").unwrap_or(d.max_rounds),
            deck_mode: opt_str(v, "deckMode").unwrap_or(d.deck_mode),
            deck_size: opt_usize(v, "deckSize").unwrap_or(d.deck_size),
            draw_per_played: opt_bool(v, "drawPerPlayed").unwrap_or(d.draw_per_played),
            soldiers_per_turn: opt_usize(v, "soldiersPerTurn").unwrap_or(d.soldiers_per_turn),
            initial_coins: opt_i32(v, "initialCoins").unwrap_or(d.initial_coins),
            coin_per_turn: opt_i32(v, "coinPerTurn").unwrap_or(d.coin_per_turn),
            monster_attack_growth: opt_i32(v, "monsterAttackGrowth").unwrap_or(d.monster_attack_growth),
            initial_mp: opt_i32(v, "initialMp").unwrap_or(d.initial_mp),
            max_mp: opt_i32(v, "maxMp").unwrap_or(d.max_mp),
            armor_max: opt_i32(v, "armorMax").unwrap_or(d.armor_max),
            poison_turns: opt_i32(v, "poisonTurns"),
            poison_max: opt_i32(v, "poisonMax"),
            coin_cards_per_turn: opt_i32(v, "coinCardsPerTurn").unwrap_or(d.coin_cards_per_turn),
            second_player_hand_bonus: opt_usize(v, "secondPlayerHandBonus").unwrap_or(d.second_player_hand_bonus),
            second_player_armor: opt_i32(v, "secondPlayerArmor").unwrap_or(d.second_player_armor),
            mulligan: opt_bool(v, "mulligan").unwrap_or(d.mulligan),
            overdrive_hp_ratio: opt_f64(v, "overdriveHpRatio"),
            overdrive_attack: opt_i32(v, "overdriveAttack"),
            mp_per_turn: opt_i32(v, "mpPerTurn"),
            mp_all_cards: opt_bool(v, "mpAllCards").unwrap_or(d.mp_all_cards),
        }
    }
}

#[derive(Debug, Clone)]
pub struct MonsterDef {
    pub name: String,
    pub hp: i32,
    pub attack: i32,
    pub element: Option<String>,
    pub castle_attack: i32,
    pub attack_every: u32,
    pub weight: Option<f64>,
    pub reward_rarity: Option<String>,
}

impl MonsterDef {
    pub fn from_json(v: &JsonValue) -> Result<Self, String> {
        Ok(Self {
            name: opt_str(v, "name").ok_or("MonsterDef missing name")?,
            hp: opt_i32(v, "hp").ok_or("MonsterDef missing hp")?,
            attack: opt_i32(v, "attack").ok_or("MonsterDef missing attack")?,
            element: opt_str(v, "element"),
            castle_attack: opt_i32(v, "castleAttack").unwrap_or(0),
            attack_every: opt_u32(v, "attackEvery").unwrap_or(1),
            weight: opt_f64(v, "weight"),
            reward_rarity: opt_str(v, "rewardRarity"),
        })
    }
}

#[derive(Debug, Clone)]
pub struct UpgradeDef {
    pub name: String,
    pub effect: String,
    pub amount: i32,
    pub cost: i32,
    pub costs: Option<Vec<i32>>,
    pub limit: Option<u32>,
    pub rarity: Option<String>,
    pub boost: Option<i32>,
    pub from_rarity: Option<String>,
    pub description: Option<String>,
}

impl UpgradeDef {
    pub fn from_json(v: &JsonValue) -> Result<Self, String> {
        let costs = v.get("costs").and_then(|x| x.as_array()).map(|arr| {
            arr.iter().filter_map(|e| e.as_i32()).collect()
        });
        Ok(Self {
            name: opt_str(v, "name").ok_or("UpgradeDef missing name")?,
            effect: opt_str(v, "effect").ok_or("UpgradeDef missing effect")?,
            amount: opt_i32(v, "amount").unwrap_or(0),
            cost: opt_i32(v, "cost").unwrap_or(0),
            costs,
            limit: opt_u32(v, "limit"),
            rarity: opt_str(v, "rarity"),
            boost: opt_i32(v, "boost"),
            from_rarity: opt_str(v, "fromRarity"),
            description: opt_str(v, "description"),
        })
    }
}

#[derive(Debug, Clone)]
pub struct CastleDef {
    pub name: String,
    pub hp_bonus: i32,
    pub max_hand_bonus: i32,
    pub castle_spell_bonus: i32,
    pub soldier_attack_bonus: i32,
}

impl CastleDef {
    pub fn from_json(v: &JsonValue) -> Result<Self, String> {
        Ok(Self {
            name: opt_str(v, "name").ok_or("CastleDef missing name")?,
            hp_bonus: opt_i32(v, "hpBonus").unwrap_or(0),
            max_hand_bonus: opt_i32(v, "maxHandBonus").unwrap_or(0),
            castle_spell_bonus: opt_i32(v, "castleSpellBonus").unwrap_or(0),
            soldier_attack_bonus: opt_i32(v, "soldierAttackBonus").unwrap_or(0),
        })
    }
}

#[derive(Debug, Clone)]
pub struct DeckDef {
    pub name: String,
    pub cards: BTreeMap<String, u32>,
    pub cost_deck: bool,
}

impl DeckDef {
    pub fn from_json(v: &JsonValue) -> Result<Self, String> {
        let mut cards = BTreeMap::new();
        if let Some(m) = v.get("cards").and_then(|x| x.as_object()) {
            for (k, cnt) in m {
                if let Some(n) = cnt.as_u32() {
                    cards.insert(k.clone(), n);
                }
            }
        }
        Ok(Self {
            name: opt_str(v, "name").ok_or("DeckDef missing name")?,
            cards,
            cost_deck: opt_bool(v, "costDeck").unwrap_or(false),
        })
    }
}

#[derive(Debug, Clone)]
pub struct RarityDef {
    pub name: String,
    pub drop_rate: Option<f64>,
    pub color: Option<String>,
    pub mp_cost: Option<i32>,
    pub deck_cost: Option<i32>,
}

impl RarityDef {
    pub fn from_json(v: &JsonValue) -> Result<Self, String> {
        Ok(Self {
            name: opt_str(v, "name").ok_or("RarityDef missing name")?,
            drop_rate: opt_f64(v, "dropRate"),
            color: opt_str(v, "color"),
            mp_cost: opt_i32(v, "mpCost"),
            deck_cost: opt_i32(v, "deckCost"),
        })
    }
}

#[derive(Debug, Clone)]
pub struct StageDef {
    pub name: String,
    pub element: Option<String>,
    pub element_multiplier: Option<f64>,
    pub mp_per_turn: Option<i32>,
}

impl StageDef {
    pub fn from_json(v: &JsonValue) -> Result<Self, String> {
        Ok(Self {
            name: opt_str(v, "name").ok_or("StageDef missing name")?,
            element: opt_str(v, "element"),
            element_multiplier: opt_f64(v, "elementMultiplier"),
            mp_per_turn: opt_i32(v, "mpPerTurn"),
        })
    }
}

#[derive(Debug, Clone)]
pub struct WeatherDef {
    pub name: String,
    pub weight: Option<f64>,
    pub rounds: Option<[u32; 2]>,
    pub miss_chance: Option<f64>,
    pub stop_march: Option<bool>,
    pub sand_damage: Option<i32>,
    pub coin_per_turn: Option<i32>,
}

impl WeatherDef {
    pub fn from_json(v: &JsonValue) -> Result<Self, String> {
        let rounds = v.get("rounds").and_then(|x| x.as_array()).and_then(|arr| {
            if arr.len() >= 2 {
                Some([arr[0].as_u32()?, arr[1].as_u32()?])
            } else {
                None
            }
        });
        Ok(Self {
            name: opt_str(v, "name").ok_or("WeatherDef missing name")?,
            weight: opt_f64(v, "weight"),
            rounds,
            miss_chance: opt_f64(v, "missChance"),
            stop_march: opt_bool(v, "stopMarch"),
            sand_damage: opt_i32(v, "sandDamage"),
            coin_per_turn: opt_i32(v, "coinPerTurn"),
        })
    }
}

#[derive(Debug, Clone, Default)]
pub struct GameSetup {
    pub stage: Option<String>,
    pub first_player: Option<String>,
    pub castles: Option<Vec<String>>,
    pub decks: Option<Vec<String>>,
}

impl GameSetup {
    pub fn from_json(v: &JsonValue) -> Self {
        let str_list = |k: &str| {
            v.get(k).and_then(|x| x.as_array()).map(|arr| {
                arr.iter().filter_map(|e| e.as_str().map(|s| s.to_string())).collect()
            })
        };
        Self {
            stage: opt_str(v, "stage"),
            first_player: opt_str(v, "firstPlayer"),
            castles: str_list("castles"),
            decks: str_list("decks"),
        }
    }
}

#[derive(Debug, Clone)]
pub struct GameConfig {
    pub cards: BTreeMap<String, CardDef>,
    pub rules: RulesDef,
    pub monsters: Option<BTreeMap<String, MonsterDef>>,
    pub upgrades: Option<BTreeMap<String, UpgradeDef>>,
    pub castles: Option<BTreeMap<String, CastleDef>>,
    pub decks: Option<BTreeMap<String, DeckDef>>,
    pub rarities: Option<BTreeMap<String, RarityDef>>,
    pub stages: Option<BTreeMap<String, StageDef>>,
    pub weather: Option<BTreeMap<String, WeatherDef>>,
    pub setup: Option<GameSetup>,
    pub seed: u32,
}

pub fn parse_map<T>(
    v: &JsonValue,
    parse_item: impl Fn(&JsonValue) -> Result<T, String>,
) -> Result<BTreeMap<String, T>, String> {
    let map = v.as_object().ok_or("expected JSON object map")?;
    let mut out = BTreeMap::new();
    for (k, val) in map {
        out.insert(k.clone(), parse_item(val)?);
    }
    Ok(out)
}

pub fn parse_map_str<T>(
    json: &str,
    parse_item: impl Fn(&JsonValue) -> Result<T, String>,
) -> Result<BTreeMap<String, T>, String> {
    let val = parse_json(json)?;
    parse_map(&val, parse_item)
}

impl GameConfig {
    pub fn from_json_str(input: &str) -> Result<Self, String> {
        let v = parse_json(input)?;
        Self::from_json(&v)
    }

    pub fn from_json(v: &JsonValue) -> Result<Self, String> {
        let cards_val = v.get("cards").ok_or("GameConfig missing cards")?;
        let cards = parse_map(cards_val, CardDef::from_json)?;
        let rules = v.get("rules").map(RulesDef::from_json).unwrap_or_default();

        fn opt_map<T>(
            root: &JsonValue,
            k: &str,
            f: fn(&JsonValue) -> Result<T, String>,
        ) -> Result<Option<BTreeMap<String, T>>, String> {
            match root.get(k) {
                Some(sub) if !matches!(sub, JsonValue::Null) => Ok(Some(parse_map(sub, f)?)),
                _ => Ok(None),
            }
        }

        Ok(Self {
            cards,
            rules,
            monsters: opt_map(v, "monsters", MonsterDef::from_json)?,
            upgrades: opt_map(v, "upgrades", UpgradeDef::from_json)?,
            castles: opt_map(v, "castles", CastleDef::from_json)?,
            decks: opt_map(v, "decks", DeckDef::from_json)?,
            rarities: opt_map(v, "rarities", RarityDef::from_json)?,
            stages: opt_map(v, "stages", StageDef::from_json)?,
            weather: opt_map(v, "weather", WeatherDef::from_json)?,
            setup: v.get("setup").filter(|x| !matches!(x, JsonValue::Null)).map(GameSetup::from_json),
            seed: opt_u32(v, "seed").unwrap_or(1),
        })
    }
}
