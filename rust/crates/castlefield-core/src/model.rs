use std::collections::BTreeMap;

use crate::json::{obj, parse_json, JsonValue};

fn opt_jv_str(s: &Option<String>) -> JsonValue {
    match s {
        Some(v) => JsonValue::String(v.clone()),
        None => JsonValue::Null,
    }
}

#[derive(Debug, Clone)]
pub struct HandCard {
    pub card_id: String,
    pub card_type: String,
}

impl HandCard {
    pub fn to_json(&self) -> JsonValue {
        obj(vec![
            ("cardId", JsonValue::String(self.card_id.clone())),
            ("type", JsonValue::String(self.card_type.clone())),
        ])
    }
}

#[derive(Debug, Clone, Default)]
pub struct PoisonStatus {
    pub amount: i32,
    pub turns: i32,
}

impl PoisonStatus {
    pub fn to_json(&self) -> JsonValue {
        obj(vec![
            ("amount", JsonValue::Number(self.amount as f64)),
            ("turns", JsonValue::Number(self.turns as f64)),
        ])
    }
}

#[derive(Debug, Clone, Default)]
pub struct Statuses {
    pub poison: Option<PoisonStatus>,
    pub frozen: i32,
}

impl Statuses {
    pub fn to_json(&self) -> JsonValue {
        obj(vec![
            (
                "poison",
                self.poison.as_ref().map(|p| p.to_json()).unwrap_or(JsonValue::Null),
            ),
            ("frozen", JsonValue::Number(self.frozen as f64)),
        ])
    }
}

#[derive(Debug, Clone)]
pub struct Soldier {
    pub soldier_id: String,
    pub soldier_type: String,
    pub hp: i32,
    pub max_hp: i32,
    pub attack: i32,
    pub speed: i32,
    pub range: i32,
    pub role: Option<String>,
    pub stay_left: Option<i32>,
    pub position: usize,
    pub road_id: String,
    pub target_id: String,
    pub weapon: Option<String>,
    pub element: Option<String>,
    pub shield: i32,
    pub statuses: Statuses,
    pub name: String,
}

impl Soldier {
    pub fn to_json(&self) -> JsonValue {
        obj(vec![
            ("soldierId", JsonValue::String(self.soldier_id.clone())),
            ("type", JsonValue::String(self.soldier_type.clone())),
            ("hp", JsonValue::Number(self.hp as f64)),
            ("maxHp", JsonValue::Number(self.max_hp as f64)),
            ("attack", JsonValue::Number(self.attack as f64)),
            ("speed", JsonValue::Number(self.speed as f64)),
            ("range", JsonValue::Number(self.range as f64)),
            ("role", opt_jv_str(&self.role)),
            (
                "stayLeft",
                self.stay_left.map(|n| JsonValue::Number(n as f64)).unwrap_or(JsonValue::Null),
            ),
            ("position", JsonValue::Number(self.position as f64)),
            ("roadId", JsonValue::String(self.road_id.clone())),
            ("targetId", JsonValue::String(self.target_id.clone())),
            ("weapon", opt_jv_str(&self.weapon)),
            ("element", opt_jv_str(&self.element)),
            ("shield", JsonValue::Number(self.shield as f64)),
            ("statuses", self.statuses.to_json()),
            ("name", JsonValue::String(self.name.clone())),
        ])
    }
}

#[derive(Debug, Clone)]
pub struct Monster {
    pub monster_id: String,
    pub monster_type: String,
    pub road_id: String,
    pub square: usize,
    pub hp: i32,
    pub max_hp: i32,
    pub attack: i32,
    pub element: Option<String>,
    pub attack_in: u32,
    pub attack_every: u32,
    pub reward: i32,
    pub castle_attack: i32,
}

impl Monster {
    pub fn to_json(&self) -> JsonValue {
        obj(vec![
            ("monsterId", JsonValue::String(self.monster_id.clone())),
            ("type", JsonValue::String(self.monster_type.clone())),
            ("roadId", JsonValue::String(self.road_id.clone())),
            ("square", JsonValue::Number(self.square as f64)),
            ("hp", JsonValue::Number(self.hp as f64)),
            ("maxHp", JsonValue::Number(self.max_hp as f64)),
            ("attack", JsonValue::Number(self.attack as f64)),
            ("element", opt_jv_str(&self.element)),
            ("attackIn", JsonValue::Number(self.attack_in as f64)),
            ("attackEvery", JsonValue::Number(self.attack_every as f64)),
            ("reward", JsonValue::Number(self.reward as f64)),
            ("castleAttack", JsonValue::Number(self.castle_attack as f64)),
        ])
    }
}

#[derive(Debug, Clone)]
pub struct Road {
    pub road_id: String,
    pub players: [String; 2],
    pub length: usize,
    pub lane: usize,
}

impl Road {
    pub fn to_json(&self) -> JsonValue {
        obj(vec![
            ("roadId", JsonValue::String(self.road_id.clone())),
            (
                "players",
                JsonValue::Array(vec![
                    JsonValue::String(self.players[0].clone()),
                    JsonValue::String(self.players[1].clone()),
                ]),
            ),
            ("length", JsonValue::Number(self.length as f64)),
            ("lane", JsonValue::Number(self.lane as f64)),
        ])
    }
}

#[derive(Debug, Clone)]
pub struct DefenseState {
    pub defender_id: String,
    pub attacker_id: String,
    pub kind: String,
    pub amount: i32,
    pub soldier_ids: Option<Vec<String>>,
}

impl DefenseState {
    pub fn to_json(&self) -> JsonValue {
        let mut pairs = vec![
            ("defenderId", JsonValue::String(self.defender_id.clone())),
            ("attackerId", JsonValue::String(self.attacker_id.clone())),
            ("kind", JsonValue::String(self.kind.clone())),
            ("amount", JsonValue::Number(self.amount as f64)),
        ];
        if let Some(ids) = &self.soldier_ids {
            pairs.push((
                "soldierIds",
                JsonValue::Array(ids.iter().cloned().map(JsonValue::String).collect()),
            ));
        }
        obj(pairs)
    }
}

#[derive(Debug, Clone)]
pub struct WeatherView {
    pub id: String,
    pub name: String,
    pub remaining: u32,
}

impl WeatherView {
    pub fn to_json(&self) -> JsonValue {
        obj(vec![
            ("id", JsonValue::String(self.id.clone())),
            ("name", JsonValue::String(self.name.clone())),
            ("remaining", JsonValue::Number(self.remaining as f64)),
        ])
    }
}

#[derive(Debug, Clone)]
pub struct PlayerView {
    pub castle_hp: i32,
    pub castle_max_hp: i32,
    pub hand: Option<Vec<HandCard>>,
    pub hand_count: usize,
    pub played_this_turn: bool,
    pub eliminated: bool,
    pub cards_played_this_turn: usize,
    pub armor: i32,
    pub coins: i32,
    pub mp: i32,
    pub max_mp: i32,
    pub castle_type: Option<String>,
    pub max_hand: usize,
    pub soldiers: Vec<Soldier>,
}

impl PlayerView {
    pub fn to_json(&self) -> JsonValue {
        obj(vec![
            ("castleHp", JsonValue::Number(self.castle_hp as f64)),
            ("castleMaxHp", JsonValue::Number(self.castle_max_hp as f64)),
            (
                "hand",
                match &self.hand {
                    Some(h) => JsonValue::Array(h.iter().map(|c| c.to_json()).collect()),
                    None => JsonValue::Null,
                },
            ),
            ("handCount", JsonValue::Number(self.hand_count as f64)),
            ("playedThisTurn", JsonValue::Bool(self.played_this_turn)),
            ("eliminated", JsonValue::Bool(self.eliminated)),
            ("cardsPlayedThisTurn", JsonValue::Number(self.cards_played_this_turn as f64)),
            ("armor", JsonValue::Number(self.armor as f64)),
            ("coins", JsonValue::Number(self.coins as f64)),
            ("mp", JsonValue::Number(self.mp as f64)),
            ("maxMp", JsonValue::Number(self.max_mp as f64)),
            ("castleType", opt_jv_str(&self.castle_type)),
            ("maxHand", JsonValue::Number(self.max_hand as f64)),
            ("soldiers", JsonValue::Array(self.soldiers.iter().map(|s| s.to_json()).collect())),
        ])
    }
}

#[derive(Debug, Clone)]
pub struct GameStateView {
    pub deck_mode: String,
    pub player_order: Vec<String>,
    pub round: u32,
    pub turn: u32,
    pub current_player: String,
    pub phase: String,
    pub defense: Option<DefenseState>,
    pub winner: Option<String>,
    pub deck_count: Option<usize>,
    pub discard_count: Option<usize>,
    pub exhausted_count: Option<usize>,
    pub stage: String,
    pub time: String,
    pub weather: Option<WeatherView>,
    pub monsters: Vec<Monster>,
    pub roads: Vec<Road>,
    pub players: BTreeMap<String, PlayerView>,
}

impl GameStateView {
    pub fn to_json(&self) -> JsonValue {
        let mut pmap = BTreeMap::new();
        for (pid, pv) in &self.players {
            pmap.insert(pid.clone(), pv.to_json());
        }
        obj(vec![
            ("deckMode", JsonValue::String(self.deck_mode.clone())),
            (
                "playerOrder",
                JsonValue::Array(self.player_order.iter().cloned().map(JsonValue::String).collect()),
            ),
            ("round", JsonValue::Number(self.round as f64)),
            ("turn", JsonValue::Number(self.turn as f64)),
            ("currentPlayer", JsonValue::String(self.current_player.clone())),
            ("phase", JsonValue::String(self.phase.clone())),
            (
                "defense",
                self.defense.as_ref().map(|d| d.to_json()).unwrap_or(JsonValue::Null),
            ),
            ("winner", opt_jv_str(&self.winner)),
            (
                "deckCount",
                self.deck_count.map(|n| JsonValue::Number(n as f64)).unwrap_or(JsonValue::Null),
            ),
            (
                "discardCount",
                self.discard_count.map(|n| JsonValue::Number(n as f64)).unwrap_or(JsonValue::Null),
            ),
            (
                "exhaustedCount",
                self.exhausted_count.map(|n| JsonValue::Number(n as f64)).unwrap_or(JsonValue::Null),
            ),
            ("stage", JsonValue::String(self.stage.clone())),
            ("time", JsonValue::String(self.time.clone())),
            (
                "weather",
                self.weather.as_ref().map(|w| w.to_json()).unwrap_or(JsonValue::Null),
            ),
            ("monsters", JsonValue::Array(self.monsters.iter().map(|m| m.to_json()).collect())),
            ("roads", JsonValue::Array(self.roads.iter().map(|r| r.to_json()).collect())),
            ("players", JsonValue::Object(pmap)),
        ])
    }

    pub fn to_json_string(&self) -> String {
        self.to_json().to_json_string()
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PlayTarget {
    pub player_id: Option<String>,
    pub road_id: Option<String>,
    pub soldier_id: Option<String>,
    pub monster_id: Option<String>,
}

impl PlayTarget {
    pub fn from_json_str(s: &str) -> Option<Self> {
        let v = parse_json(s).ok()?;
        if matches!(v, JsonValue::Null) {
            return None;
        }
        Some(Self {
            player_id: v.get("playerId").and_then(|x| x.as_str()).map(|x| x.to_string()),
            road_id: v.get("roadId").and_then(|x| x.as_str()).map(|x| x.to_string()),
            soldier_id: v.get("soldierId").and_then(|x| x.as_str()).map(|x| x.to_string()),
            monster_id: v.get("monsterId").and_then(|x| x.as_str()).map(|x| x.to_string()),
        })
    }

    pub fn to_json(&self) -> JsonValue {
        let mut pairs = Vec::new();
        if let Some(p) = &self.player_id {
            pairs.push(("playerId", JsonValue::String(p.clone())));
        }
        if let Some(r) = &self.road_id {
            pairs.push(("roadId", JsonValue::String(r.clone())));
        }
        if let Some(s) = &self.soldier_id {
            pairs.push(("soldierId", JsonValue::String(s.clone())));
        }
        if let Some(m) = &self.monster_id {
            pairs.push(("monsterId", JsonValue::String(m.clone())));
        }
        obj(pairs)
    }
}

#[derive(Debug, Clone)]
pub struct ActionResult {
    pub ok: bool,
    pub reason: Option<String>,
    pub needs_target: Option<bool>,
}

impl ActionResult {
    pub fn ok() -> Self {
        Self { ok: true, reason: None, needs_target: None }
    }

    pub fn err(msg: impl Into<String>) -> Self {
        Self { ok: false, reason: Some(msg.into()), needs_target: None }
    }

    pub fn needs_target(msg: impl Into<String>) -> Self {
        Self { ok: false, reason: Some(msg.into()), needs_target: Some(true) }
    }

    pub fn to_json(&self) -> JsonValue {
        let mut pairs = vec![("ok", JsonValue::Bool(self.ok))];
        if let Some(r) = &self.reason {
            pairs.push(("reason", JsonValue::String(r.clone())));
        }
        if let Some(n) = self.needs_target {
            pairs.push(("needsTarget", JsonValue::Bool(n)));
        }
        obj(pairs)
    }

    pub fn to_json_string(&self) -> String {
        self.to_json().to_json_string()
    }
}
