use std::collections::BTreeMap;

use crate::data::{CardDef, GameConfig, RulesDef};
use crate::events::GameEvent;
use crate::model::{
    ActionResult, DefenseState, GameStateView, HandCard, Monster, PlayTarget, PlayerView,
    PoisonStatus, Road, Soldier, Statuses, WeatherView,
};
use crate::rng::Mulberry32;

#[derive(Debug, Clone)]
struct PendingDefense {
    defender_id: String,
    attacker_id: String,
    kind: String, // "castle" | "soldiers"
    amount: i32,
    source_kind: String,
    spell_type: Option<String>,
    attacker_soldier_id: Option<String>,
    soldier_ids: Vec<String>,
    can_reflect: bool,
    can_decoy: bool,
}

#[derive(Debug, Clone)]
struct SpiritSlot {
    spirit_type: String,
    spirit: String,
    amount: i32,
    turns_left: i32,
    target_id: Option<String>,
}

#[derive(Debug, Clone)]
struct InternalPlayer {
    castle_hp: i32,
    castle_max_hp: i32,
    hand: Vec<HandCard>,
    played_this_turn: bool,
    coin_cards_this_turn: i32,
    eliminated: bool,
    cards_played_this_turn: usize,
    armor: i32,
    coins: i32,
    mp: i32,
    max_mp: i32,
    castle_type: Option<String>,
    max_hand: usize,
    castle_poison: Option<PoisonStatus>,
    soldiers: Vec<Soldier>,
    deck: Vec<String>,
    discard: Vec<String>,
    exhausted: Vec<String>,
    upgrade_counts: BTreeMap<String, u32>,
    army_attack_bonus: i32,
    army_hp_bonus: i32,
    spirits: Vec<SpiritSlot>,
    overdrive: bool,
}

#[derive(Debug, Clone)]
pub struct Game {
    pub config: GameConfig,
    rng: Mulberry32,
    player_order: Vec<String>,
    players: BTreeMap<String, InternalPlayer>,
    roads: Vec<Road>,
    monsters: Vec<Monster>,
    shared_deck: Vec<String>,
    shared_discard: Vec<String>,
    shared_exhausted: Vec<String>,
    round: u32,
    turn: u32,
    current_idx: usize,
    phase: String,
    winner: Option<String>,
    stage: String,
    time: String,
    weather: Option<WeatherView>,
    pending_defense: Option<PendingDefense>,
    next_card_seq: u32,
    next_soldier_seq: u32,
    next_monster_seq: u32,
    monster_cooldown: u32,
    mulligan_done: Vec<String>,
    events: Vec<GameEvent>,
}

fn beats_element(a: &str, b: &str) -> bool {
    matches!(
        (a, b),
        ("water", "fire") | ("fire", "wind") | ("wind", "earth") | ("earth", "water")
    )
}

impl Game {
    pub fn new(config: GameConfig) -> Result<Self, String> {
        if config.cards.is_empty() {
            return Err("cards must not be empty".into());
        }
        let rules = &config.rules;
        let player_count = rules.player_count.max(2);
        let mut rng = Mulberry32::new(config.seed);

        let mut player_order = Vec::with_capacity(player_count);
        for i in 1..=player_count {
            player_order.push(format!("p{i}"));
        }

        // Rotate firstPlayer if specified
        if let Some(fp) = config.setup.as_ref().and_then(|s| s.first_player.as_ref()) {
            if let Some(pos) = player_order.iter().position(|id| id == fp) {
                player_order.rotate_left(pos);
            }
        }

        let stage = pick_stage(&config, &mut rng);
        let lane_count = rules.lane_count.max(1);
        let lane_length = rules.lane_length.max(1);

        let mut roads = Vec::new();
        for i in 0..player_order.len() {
            let j = (i + 1) % player_order.len();
            if player_order.len() == 2 && i > 0 {
                break;
            }
            let a = &player_order[i];
            let b = &player_order[j];
            for lane in 0..lane_count {
                let road_id = if lane_count == 1 {
                    format!("{a}-{b}")
                } else {
                    format!("{a}-{b}#{}", lane + 1)
                };
                roads.push(Road {
                    road_id,
                    players: [a.clone(), b.clone()],
                    length: lane_length,
                    lane,
                });
            }
        }

        let mut next_card_seq = 0u32;
        let mut shared_deck = Vec::new();
        if rules.deck_mode == "shared" {
            shared_deck = build_weighted_deck(&config.cards, rules.deck_size, &mut rng);
        }

        let mut players = BTreeMap::new();
        for (idx, pid) in player_order.iter().enumerate() {
            let castle_id = config
                .setup
                .as_ref()
                .and_then(|s| s.castles.as_ref())
                .and_then(|c| c.get(idx))
                .cloned()
                .unwrap_or_else(|| "standard".into());
            let castle_def = config
                .castles
                .as_ref()
                .and_then(|c| c.get(&castle_id));
            let hp_bonus = castle_def.map(|c| c.hp_bonus).unwrap_or(0);
            let hand_bonus = castle_def.map(|c| c.max_hand_bonus).unwrap_or(0);
            let second_hp = if idx > 0 { rules.second_player_castle_bonus } else { 0 };
            let max_hp = (rules.castle_max_hp + hp_bonus + second_hp).max(1);
            let max_hand = ((rules.max_hand as i32) + hand_bonus).max(2) as usize;

            let mut p_deck = Vec::new();
            if rules.deck_mode != "shared" {
                let deck_id = config
                    .setup
                    .as_ref()
                    .and_then(|s| s.decks.as_ref())
                    .and_then(|d| d.get(idx))
                    .cloned();
                if let Some(did) = deck_id {
                    if let Some(ddef) = config.decks.as_ref().and_then(|d| d.get(&did)) {
                        for (ct, cnt) in &ddef.cards {
                            if config.cards.contains_key(ct) {
                                for _ in 0..*cnt {
                                    p_deck.push(ct.clone());
                                }
                            }
                        }
                    }
                }
                if p_deck.is_empty() {
                    p_deck = build_weighted_deck(&config.cards, 40, &mut rng);
                }
                shuffle_vec(&mut p_deck, &mut rng);
            }

            let mut p = InternalPlayer {
                castle_hp: max_hp,
                castle_max_hp: max_hp,
                hand: Vec::new(),
                played_this_turn: false,
                coin_cards_this_turn: 0,
                eliminated: false,
                cards_played_this_turn: 0,
                armor: if idx > 0 { rules.second_player_armor } else { 0 },
                coins: rules.initial_coins,
                mp: rules.initial_mp,
                max_mp: rules.max_mp,
                castle_type: Some(castle_id),
                max_hand,
                castle_poison: None,
                soldiers: Vec::new(),
                deck: p_deck,
                discard: Vec::new(),
                exhausted: Vec::new(),
                upgrade_counts: BTreeMap::new(),
                army_attack_bonus: 0,
                army_hp_bonus: 0,
                spirits: Vec::new(),
                overdrive: false,
            };

            let init_count = rules.initial_hand + if idx > 0 { rules.second_player_hand_bonus } else { 0 };
            for _ in 0..init_count {
                let card_type = if rules.deck_mode == "shared" {
                    draw_from_piles(&mut shared_deck, &mut Vec::new(), &mut rng)
                } else {
                    draw_from_piles(&mut p.deck, &mut Vec::new(), &mut rng)
                };
                if let Some(ct) = card_type {
                    next_card_seq += 1;
                    p.hand.push(HandCard {
                        card_id: format!("c{next_card_seq:02}"),
                        card_type: ct,
                    });
                }
            }

            players.insert(pid.clone(), p);
        }

        Ok(Self {
            config,
            rng,
            player_order,
            players,
            roads,
            monsters: Vec::new(),
            shared_deck,
            shared_discard: Vec::new(),
            shared_exhausted: Vec::new(),
            round: 0,
            turn: 0,
            current_idx: 0,
            phase: "ready".into(),
            winner: None,
            stage,
            time: "day".into(),
            weather: None,
            pending_defense: None,
            next_card_seq,
            next_soldier_seq: 0,
            next_monster_seq: 0,
            monster_cooldown: 0,
            mulligan_done: Vec::new(),
            events: Vec::new(),
        })
    }

    pub fn drain_events(&mut self) -> Vec<GameEvent> {
        std::mem::take(&mut self.events)
    }

    pub fn current_player_id(&self) -> &str {
        &self.player_order[self.current_idx]
    }

    pub fn phase(&self) -> &str {
        &self.phase
    }

    pub fn start(&mut self) -> Vec<GameEvent> {
        if self.phase != "ready" {
            return Vec::new();
        }
        if self.config.rules.mulligan {
            self.phase = "mulligan".into();
            return self.drain_events();
        }
        self.begin_turn(true);
        self.drain_events()
    }

    pub fn get_state(&self, viewer_id: Option<&str>) -> GameStateView {
        let mut pviews = BTreeMap::new();
        for (pid, p) in &self.players {
            let show_hand = viewer_id == Some(pid.as_str());
            pviews.insert(
                pid.clone(),
                PlayerView {
                    castle_hp: p.castle_hp,
                    castle_max_hp: p.castle_max_hp,
                    hand: if show_hand { Some(p.hand.clone()) } else { None },
                    hand_count: p.hand.len(),
                    played_this_turn: p.played_this_turn,
                    eliminated: p.eliminated,
                    cards_played_this_turn: p.cards_played_this_turn,
                    armor: p.armor,
                    coins: p.coins,
                    mp: p.mp,
                    max_mp: p.max_mp,
                    castle_type: p.castle_type.clone(),
                    max_hand: p.max_hand,
                    soldiers: p.soldiers.clone(),
                },
            );
        }

        let (deck_count, discard_count, exhausted_count) = if self.config.rules.deck_mode == "shared" {
            (
                Some(self.shared_deck.len()),
                Some(self.shared_discard.len()),
                Some(self.shared_exhausted.len()),
            )
        } else if let Some(v) = viewer_id.and_then(|id| self.players.get(id)) {
            (Some(v.deck.len()), Some(v.discard.len()), Some(v.exhausted.len()))
        } else {
            (None, None, None)
        };

        GameStateView {
            deck_mode: self.config.rules.deck_mode.clone(),
            player_order: self.player_order.clone(),
            round: self.round,
            turn: self.turn,
            current_player: self.current_player_id().to_string(),
            phase: self.phase.clone(),
            defense: self.pending_defense.as_ref().map(|d| DefenseState {
                defender_id: d.defender_id.clone(),
                attacker_id: d.attacker_id.clone(),
                kind: d.kind.clone(),
                amount: d.amount,
                soldier_ids: if d.soldier_ids.is_empty() {
                    None
                } else {
                    Some(d.soldier_ids.clone())
                },
            }),
            winner: self.winner.clone(),
            deck_count,
            discard_count,
            exhausted_count,
            stage: self.stage.clone(),
            time: self.time.clone(),
            weather: self.weather.clone(),
            monsters: self.monsters.clone(),
            roads: self.roads.clone(),
            players: pviews,
        }
    }

    pub fn can_play_card(&self, card_id: &str, target: Option<&PlayTarget>) -> ActionResult {
        if self.phase == "defend" {
            return self.can_defend(card_id, target);
        }
        if self.phase != "main" {
            return ActionResult::err("いまはカードを出せません");
        }
        let pid = self.current_player_id().to_string();
        let Some(player) = self.players.get(&pid) else {
            return ActionResult::err("プレイヤーが見つかりません");
        };
        let Some(hc) = player.hand.iter().find(|c| c.card_id == card_id) else {
            return ActionResult::err("そのカードは手札にありません");
        };
        let Some(def) = self.config.cards.get(&hc.card_type) else {
            return ActionResult::err("不明なカードです");
        };

        let eff = def.effect.as_deref().unwrap_or("");
        if eff == "wild" {
            return ActionResult::err("適応は合成専用です");
        }
        if def.kind == "defense" {
            if eff == "reflectSpell" || eff == "nullifySoldier" {
                return ActionResult::err("この防御カードは攻撃を受けたときに使います");
            }
        }

        let is_free_action = self.is_free_action(def);
        if !is_free_action && player.played_this_turn {
            return ActionResult::err("このターンはもうメインのカードを出しました");
        }
        if def.kind == "soldier" {
            let max_s = self.config.rules.soldiers_per_turn;
            if player.soldiers.len() >= max_s * 3 {
                return ActionResult::err("盤面の兵士が上限です");
            }
        }
        if eff == "gainCoins" || def.dice.as_deref() == Some("coin") {
            if player.coin_cards_this_turn >= self.config.rules.coin_cards_per_turn {
                return ActionResult::err("コインのカードは1ターンに1枚までです");
            }
        }
        if eff == "setTime" {
            if def.time.as_deref() == Some("night") && self.time != "day" {
                return ActionResult::err("昼のときだけ出せます");
            }
            if def.time.as_deref() == Some("day") && self.time != "night" {
                return ActionResult::err("夜のときだけ出せます");
            }
        }
        if eff == "ignitionBurst" || eff == "sacrificeAttack" {
            let self_dmg = def.self_damage.unwrap_or(6);
            if player.castle_hp <= self_dmg {
                return ActionResult::err("城HPが足りません");
            }
        }
        if eff == "curePoison" {
            let has_poison = player.castle_poison.is_some()
                || player.soldiers.iter().any(|s| s.statuses.poison.is_some());
            if !has_poison {
                return ActionResult::err("毒状態の城・兵士がいません");
            }
        }
        if eff == "armorBlast" && player.armor <= 0 {
            return ActionResult::err("城壁がありません");
        }

        let mp_cost = self.mp_cost_of(def);
        if mp_cost > player.mp {
            return ActionResult::err(format!("MPが足りません（必要: {mp_cost}）"));
        }

        let targets = self.get_targets(card_id);
        if targets.is_empty() {
            return ActionResult::err("出せる対象がいません");
        }
        if target.is_none() && targets.len() > 1 {
            return ActionResult::needs_target("対象を選んでください");
        }
        if let Some(t) = target {
            if !targets.contains(t) {
                return ActionResult::err("その対象には出せません");
            }
        }
        ActionResult::ok()
    }

    pub fn get_targets(&self, card_id: &str) -> Vec<PlayTarget> {
        if self.phase == "defend" {
            return self.get_defense_targets(card_id);
        }
        if self.phase != "main" {
            return Vec::new();
        }
        let pid = self.current_player_id().to_string();
        let Some(player) = self.players.get(&pid) else {
            return Vec::new();
        };
        let Some(hc) = player.hand.iter().find(|c| c.card_id == card_id) else {
            return Vec::new();
        };
        let Some(def) = self.config.cards.get(&hc.card_type) else {
            return Vec::new();
        };
        let eff = def.effect.as_deref().unwrap_or("");
        let enemies: Vec<String> = self
            .player_order
            .iter()
            .filter(|id| *id != &pid && !self.players[*id].eliminated)
            .cloned()
            .collect();

        match def.kind.as_str() {
            "soldier" => {
                let mut out = Vec::new();
                for r in &self.roads {
                    if let Some(opp) = other_on_road(r, &pid) {
                        out.push(PlayTarget {
                            player_id: Some(opp),
                            road_id: Some(r.road_id.clone()),
                            ..Default::default()
                        });
                    }
                }
                out
            }
            "weapon" => player
                .soldiers
                .iter()
                .map(|s| PlayTarget {
                    soldier_id: Some(s.soldier_id.clone()),
                    ..Default::default()
                })
                .collect(),
            "defense" => {
                if eff == "shieldSoldier" {
                    player
                        .soldiers
                        .iter()
                        .map(|s| PlayTarget {
                            soldier_id: Some(s.soldier_id.clone()),
                            ..Default::default()
                        })
                        .collect()
                } else if eff == "armorCastle" {
                    vec![PlayTarget {
                        player_id: Some(pid),
                        ..Default::default()
                    }]
                } else {
                    Vec::new()
                }
            }
            "spell" => match eff {
                "wild" => Vec::new(),
                "healOwnCastle" | "redrawHand" | "gainCoins" | "gainMp" | "curePoison"
                | "setTime" | "changeWeather" | "healAndArmor" | "healCastleOrMp"
                | "damageAllSoldiers" => vec![PlayTarget {
                    player_id: Some(pid),
                    ..Default::default()
                }],
                "damageEnemyCastle" => {
                    let mut out: Vec<PlayTarget> = enemies
                        .iter()
                        .map(|e| PlayTarget {
                            player_id: Some(e.clone()),
                            ..Default::default()
                        })
                        .collect();
                    if hc.card_type == "fireball" {
                        for m in &self.monsters {
                            out.push(PlayTarget {
                                monster_id: Some(m.monster_id.clone()),
                                ..Default::default()
                            });
                        }
                    }
                    out
                }
                "damageEnemySoldiers" | "freezeEnemySoldiers" if def.scope.as_deref() == Some("lane") && self.config.rules.lane_count > 1 => {
                    self.roads
                        .iter()
                        .filter_map(|r| {
                            other_on_road(r, &pid).map(|opp| PlayTarget {
                                player_id: Some(opp),
                                road_id: Some(r.road_id.clone()),
                                ..Default::default()
                            })
                        })
                        .collect()
                }
                "chainBlast" => {
                    let mut out = Vec::new();
                    for eid in &enemies {
                        for s in &self.players[eid].soldiers {
                            out.push(PlayTarget {
                                soldier_id: Some(s.soldier_id.clone()),
                                ..Default::default()
                            });
                        }
                    }
                    out
                }
                "stealCoins" => enemies
                    .into_iter()
                    .filter(|e| self.players[e].coins > 0)
                    .map(|e| PlayTarget {
                        player_id: Some(e),
                        ..Default::default()
                    })
                    .collect(),
                "drainMp" => enemies
                    .into_iter()
                    .filter(|e| self.players[e].mp > 0)
                    .map(|e| PlayTarget {
                        player_id: Some(e),
                        ..Default::default()
                    })
                    .collect(),
                "dice" => {
                    if def.dice.as_deref() == Some("buff") {
                        player
                            .soldiers
                            .iter()
                            .map(|s| PlayTarget {
                                soldier_id: Some(s.soldier_id.clone()),
                                ..Default::default()
                            })
                            .collect()
                    } else if def.dice.as_deref() == Some("attack") {
                        enemies
                            .into_iter()
                            .map(|e| PlayTarget {
                                player_id: Some(e),
                                ..Default::default()
                            })
                            .collect()
                    } else {
                        vec![PlayTarget {
                            player_id: Some(pid),
                            ..Default::default()
                        }]
                    }
                }
                _ => enemies
                    .into_iter()
                    .map(|e| PlayTarget {
                        player_id: Some(e),
                        ..Default::default()
                    })
                    .collect(),
            },
            _ => Vec::new(),
        }
    }

    pub fn play_card(&mut self, card_id: &str, target: Option<&PlayTarget>) -> ActionResult {
        if self.phase == "defend" {
            return self.defend(card_id, target);
        }
        let check = self.can_play_card(card_id, target);
        if !check.ok {
            return check;
        }
        let targets = self.get_targets(card_id);
        let chosen = target.cloned().unwrap_or_else(|| targets[0].clone());
        let pid = self.current_player_id().to_string();

        let pos = self.players[&pid]
            .hand
            .iter()
            .position(|c| c.card_id == card_id)
            .unwrap();
        let hand_card = self.players.get_mut(&pid).unwrap().hand.remove(pos);
        let def = self.config.cards[&hand_card.card_type].clone();

        let mp_cost = self.mp_cost_of(&def);
        if mp_cost > 0 {
            let p = self.players.get_mut(&pid).unwrap();
            p.mp = (p.mp - mp_cost).max(0);
            let new_mp = p.mp;
            self.events.push(GameEvent::MpChanged {
                player_id: pid.clone(),
                delta: -mp_cost,
                mp: new_mp,
                reason: "cast".into(),
            });
        }

        if !self.is_free_action(&def) {
            self.players.get_mut(&pid).unwrap().played_this_turn = true;
        }
        self.players.get_mut(&pid).unwrap().cards_played_this_turn += 1;

        self.events.push(GameEvent::CardPlayed {
            player_id: pid.clone(),
            card_id: hand_card.card_id.clone(),
            card_type: hand_card.card_type.clone(),
        });

        // Move card to discard or exhausted
        if def.exhaust.unwrap_or(false) {
            if self.config.rules.deck_mode == "shared" {
                self.shared_exhausted.push(hand_card.card_type.clone());
            } else {
                self.players.get_mut(&pid).unwrap().exhausted.push(hand_card.card_type.clone());
            }
        } else if self.config.rules.deck_mode == "shared" {
            self.shared_discard.push(hand_card.card_type.clone());
        } else {
            self.players.get_mut(&pid).unwrap().discard.push(hand_card.card_type.clone());
        }

        self.resolve_card(&pid, &hand_card.card_type, &def, &chosen);
        self.check_game_over();
        ActionResult::ok()
    }

    pub fn can_defend(&self, card_id: &str, target: Option<&PlayTarget>) -> ActionResult {
        if self.phase != "defend" {
            return ActionResult::err("防御の場面ではありません");
        }
        let Some(def_state) = &self.pending_defense else {
            return ActionResult::err("防御待ちがありません");
        };
        let pid = def_state.defender_id.clone();
        let Some(hc) = self.players[&pid].hand.iter().find(|c| c.card_id == card_id) else {
            return ActionResult::err("手札にありません");
        };
        let Some(def) = self.config.cards.get(&hc.card_type) else {
            return ActionResult::err("不明なカード");
        };
        if def.kind != "defense" {
            return ActionResult::err("防御カードのみ出せます");
        }
        let eff = def.effect.as_deref().unwrap_or("");
        match eff {
            "reflectSpell" => {
                if !def_state.can_reflect {
                    return ActionResult::err("魔法の攻撃にだけ使えます");
                }
            }
            "nullifySoldier" => {
                if !def_state.can_decoy {
                    return ActionResult::err("兵士の攻撃にだけ使えます");
                }
            }
            "armorCastle" => {
                if def_state.kind != "castle" {
                    return ActionResult::err("城への攻撃にだけ使えます");
                }
            }
            "shieldSoldier" => {
                if def_state.kind != "soldiers" || def_state.soldier_ids.is_empty() {
                    return ActionResult::err("兵士への攻撃にだけ使えます");
                }
            }
            _ => return ActionResult::err("今は使えません"),
        }
        if let Some(t) = target {
            let valid = self.get_defense_targets(card_id);
            if !valid.contains(t) {
                return ActionResult::err("対象が正しくありません");
            }
        }
        ActionResult::ok()
    }

    pub fn get_defense_targets(&self, card_id: &str) -> Vec<PlayTarget> {
        if self.phase != "defend" {
            return Vec::new();
        }
        let Some(def_state) = &self.pending_defense else {
            return Vec::new();
        };
        let pid = &def_state.defender_id;
        let Some(hc) = self.players[pid].hand.iter().find(|c| c.card_id == card_id) else {
            return Vec::new();
        };
        let Some(def) = self.config.cards.get(&hc.card_type) else {
            return Vec::new();
        };
        let eff = def.effect.as_deref().unwrap_or("");
        match eff {
            "reflectSpell" | "nullifySoldier" | "armorCastle" => {
                if (eff == "reflectSpell" && !def_state.can_reflect)
                    || (eff == "nullifySoldier" && !def_state.can_decoy)
                    || (eff == "armorCastle" && def_state.kind != "castle")
                {
                    Vec::new()
                } else {
                    vec![PlayTarget {
                        player_id: Some(pid.clone()),
                        ..Default::default()
                    }]
                }
            }
            "shieldSoldier" => def_state
                .soldier_ids
                .iter()
                .map(|sid| PlayTarget {
                    soldier_id: Some(sid.clone()),
                    ..Default::default()
                })
                .collect(),
            _ => Vec::new(),
        }
    }

    pub fn defend(&mut self, card_id: &str, target: Option<&PlayTarget>) -> ActionResult {
        let check = self.can_defend(card_id, target);
        if !check.ok {
            return check;
        }
        let def_state = self.pending_defense.clone().unwrap();
        let pid = def_state.defender_id.clone();
        let pos = self.players[&pid]
            .hand
            .iter()
            .position(|c| c.card_id == card_id)
            .unwrap();
        let hc = self.players.get_mut(&pid).unwrap().hand.remove(pos);
        let def = self.config.cards[&hc.card_type].clone();
        let eff = def.effect.as_deref().unwrap_or("");

        if def.exhaust.unwrap_or(false) || eff == "nullifySoldier" {
            self.shared_exhausted.push(hc.card_type.clone());
        } else {
            self.shared_discard.push(hc.card_type.clone());
        }

        if eff == "reflectSpell" {
            self.pending_defense = None;
            self.phase = "main".into();
            self.events.push(GameEvent::DefenseEnded { defender_id: pid.clone() });
            self.events.push(GameEvent::SpellReflected {
                defender_id: pid,
                attacker_id: def_state.attacker_id.clone(),
                amount: def_state.amount,
            });
            self.damage_castle(&def_state.attacker_id, def_state.amount, "spell");
            self.check_game_over();
            return ActionResult::ok();
        }

        if eff == "nullifySoldier" {
            self.pending_defense = None;
            self.phase = "main".into();
            self.events.push(GameEvent::DefenseEnded { defender_id: pid.clone() });
            let sid = def_state.attacker_soldier_id.unwrap_or_default();
            self.events.push(GameEvent::SoldierDecoyed {
                defender_id: pid,
                attacker_id: def_state.attacker_id,
                soldier_id: sid,
            });
            self.check_game_over();
            return ActionResult::ok();
        }

        if eff == "armorCastle" {
            let amt = def.amount.unwrap_or(0);
            let max_arm = self.config.rules.armor_max;
            let p = self.players.get_mut(&pid).unwrap();
            p.armor = (p.armor + amt).min(max_arm);
            let armor = p.armor;
            self.events.push(GameEvent::CastleArmored { player_id: pid, armor });
        } else if eff == "shieldSoldier" {
            let amt = def.amount.unwrap_or(0);
            let sid = target
                .and_then(|t| t.soldier_id.clone())
                .or_else(|| def_state.soldier_ids.first().cloned())
                .unwrap_or_default();
            if let Some(s) = self.players.get_mut(&pid).unwrap().soldiers.iter_mut().find(|x| x.soldier_id == sid) {
                s.shield += amt;
                let sh = s.shield;
                self.events.push(GameEvent::ShieldAdded {
                    player_id: pid,
                    soldier_id: sid,
                    amount: amt,
                    shield: sh,
                });
            }
        }

        // If defender has no more usable defense cards, resolve automatically
        if !self.has_usable_defense(&def_state.defender_id) {
            return self.pass_defense();
        }
        ActionResult::ok()
    }

    pub fn pass_defense(&mut self) -> ActionResult {
        if self.phase != "defend" {
            return ActionResult::err("防御の場面ではありません");
        }
        let Some(def_state) = self.pending_defense.take() else {
            return ActionResult::err("防御待ちがありません");
        };
        self.phase = "main".into();
        self.events.push(GameEvent::DefenseEnded {
            defender_id: def_state.defender_id.clone(),
        });
        if def_state.kind == "castle" {
            self.damage_castle(&def_state.defender_id, def_state.amount, &def_state.source_kind);
        } else {
            for sid in &def_state.soldier_ids {
                self.damage_soldier(&def_state.defender_id, sid, def_state.amount, "spell");
            }
        }
        self.check_game_over();
        ActionResult::ok()
    }

    pub fn can_fuse(&self, card_a: &str, card_b: &str) -> ActionResult {
        if self.phase != "main" {
            return ActionResult::err("今は合成できません");
        }
        if card_a == card_b {
            return ActionResult::err("同じカード2枚を選んでください");
        }
        let pid = self.current_player_id();
        let hand = &self.players[pid].hand;
        let Some(ha) = hand.iter().find(|c| c.card_id == card_a) else {
            return ActionResult::err("1枚目が見つかりません");
        };
        let Some(hb) = hand.iter().find(|c| c.card_id == card_b) else {
            return ActionResult::err("2枚目が見つかりません");
        };
        let da = &self.config.cards[&ha.card_type];
        let db = &self.config.cards[&hb.card_type];
        if ha.card_type == hb.card_type {
            if da.fuse_to.is_none() {
                return ActionResult::err("これ以上合成できないカードです");
            }
            return ActionResult::ok();
        }
        if da.effect.as_deref() == Some("wild") && db.fuse_to.is_some() {
            return ActionResult::ok();
        }
        if db.effect.as_deref() == Some("wild") && da.fuse_to.is_some() {
            return ActionResult::ok();
        }
        ActionResult::err("同じ種類のカード2枚（または適応）で合成できます")
    }

    pub fn fuse(&mut self, card_a: &str, card_b: &str) -> ActionResult {
        let check = self.can_fuse(card_a, card_b);
        if !check.ok {
            return check;
        }
        let pid = self.current_player_id().to_string();
        let hand = &self.players[&pid].hand;
        let ha = hand.iter().find(|c| c.card_id == card_a).unwrap().clone();
        let hb = hand.iter().find(|c| c.card_id == card_b).unwrap().clone();

        let base_type = if self.config.cards[&ha.card_type].effect.as_deref() == Some("wild") {
            hb.card_type.clone()
        } else {
            ha.card_type.clone()
        };
        let to_type = self.config.cards[&base_type].fuse_to.clone().unwrap();

        let p = self.players.get_mut(&pid).unwrap();
        p.hand.retain(|c| c.card_id != card_a && c.card_id != card_b);
        self.next_card_seq += 1;
        let new_id = format!("c{:02}", self.next_card_seq);
        p.hand.push(HandCard {
            card_id: new_id.clone(),
            card_type: to_type.clone(),
        });

        self.events.push(GameEvent::CardsFused {
            player_id: pid,
            card_ids: [card_a.to_string(), card_b.to_string()],
            card_id: new_id,
            from: base_type,
            to: to_type,
        });
        ActionResult::ok()
    }

    pub fn can_buy_upgrade(&self, upgrade_id: &str) -> ActionResult {
        if self.phase != "main" {
            return ActionResult::err("メインの場面のみ購入できます");
        }
        let Some(up) = self.config.upgrades.as_ref().and_then(|u| u.get(upgrade_id)) else {
            return ActionResult::err("存在しない強化です");
        };
        let pid = self.current_player_id();
        let p = &self.players[pid];
        let used = *p.upgrade_counts.get(upgrade_id).unwrap_or(&0);
        if let Some(lim) = up.limit {
            if used >= lim {
                return ActionResult::err("購入上限に達しています");
            }
        }
        let cost = up
            .costs
            .as_ref()
            .and_then(|v| v.get(used as usize).copied())
            .unwrap_or(up.cost);
        if p.coins < cost {
            return ActionResult::err("コインが足りません");
        }
        ActionResult::ok()
    }

    pub fn buy_upgrade(&mut self, upgrade_id: &str) -> ActionResult {
        let check = self.can_buy_upgrade(upgrade_id);
        if !check.ok {
            return check;
        }
        let up = self.config.upgrades.as_ref().unwrap()[upgrade_id].clone();
        let pid = self.current_player_id().to_string();
        let used = *self.players[&pid].upgrade_counts.get(upgrade_id).unwrap_or(&0);
        let cost = up
            .costs
            .as_ref()
            .and_then(|v| v.get(used as usize).copied())
            .unwrap_or(up.cost);

        {
            let p = self.players.get_mut(&pid).unwrap();
            p.coins -= cost;
            *p.upgrade_counts.entry(upgrade_id.to_string()).or_insert(0) += 1;
        }
        let rem = self.players[&pid].coins;
        self.events.push(GameEvent::CoinsChanged {
            player_id: pid.clone(),
            delta: -cost,
            coins: rem,
            reason: "upgrade".into(),
        });
        self.events.push(GameEvent::UpgradeBought {
            player_id: pid.clone(),
            upgrade_id: upgrade_id.to_string(),
            cost,
        });

        match up.effect.as_str() {
            "repairCastle" => self.heal_castle(&pid, up.amount),
            "drawCards" => self.draw_cards(&pid, up.amount.max(0) as usize),
            "sharpenSoldiers" => {
                let mut buffed = Vec::new();
                for s in &mut self.players.get_mut(&pid).unwrap().soldiers {
                    s.attack += up.amount;
                    buffed.push((s.soldier_id.clone(), s.attack));
                }
                for (sid, atk) in buffed {
                    self.events.push(GameEvent::SoldierBuffed {
                        player_id: pid.clone(),
                        soldier_id: sid,
                        attack: atk,
                    });
                }
            }
            "trainArmy" => {
                let p = self.players.get_mut(&pid).unwrap();
                p.army_attack_bonus += up.amount;
                for s in &mut p.soldiers {
                    s.attack += up.amount;
                }
            }
            "fortifyArmy" => {
                let p = self.players.get_mut(&pid).unwrap();
                p.army_hp_bonus += up.amount;
                for s in &mut p.soldiers {
                    s.hp += up.amount;
                    s.max_hp += up.amount;
                }
            }
            _ => {}
        }
        ActionResult::ok()
    }

    pub fn discard(&mut self, card_ids: &[String]) -> ActionResult {
        if self.phase != "discard" {
            return ActionResult::err("捨てる場面ではありません");
        }
        let pid = self.current_player_id().to_string();
        let p = &self.players[&pid];
        let need = p.hand.len().saturating_sub(p.max_hand);
        if card_ids.len() != need {
            return ActionResult::err(format!("{need}枚ちょうど選んでください"));
        }
        let mut uniq = card_ids.to_vec();
        uniq.sort();
        uniq.dedup();
        if uniq.len() != card_ids.len() {
            return ActionResult::err("同じカードが重複しています");
        }
        if !card_ids.iter().all(|id| p.hand.iter().any(|h| &h.card_id == id)) {
            return ActionResult::err("手札にないカードが含まれています");
        }

        let mut removed = Vec::new();
        {
            let pm = self.players.get_mut(&pid).unwrap();
            pm.hand.retain(|h| {
                if card_ids.contains(&h.card_id) {
                    removed.push(h.card_type.clone());
                    false
                } else {
                    true
                }
            });
        }
        if self.config.rules.deck_mode == "shared" {
            self.shared_discard.extend(removed);
        } else {
            self.players.get_mut(&pid).unwrap().discard.extend(removed);
        }

        self.events.push(GameEvent::CardDiscarded {
            player_id: pid,
            card_ids: card_ids.to_vec(),
        });
        self.advance_to_next_player();
        ActionResult::ok()
    }

    pub fn end_turn(&mut self) -> ActionResult {
        if self.phase != "main" {
            return ActionResult::err("今はターンを終えられません");
        }
        let pid = self.current_player_id().to_string();
        let hand_len = self.players[&pid].hand.len();
        let max_hand = self.players[&pid].max_hand;
        if hand_len > max_hand {
            let need = hand_len - max_hand;
            self.phase = "discard".into();
            self.events.push(GameEvent::DiscardRequired {
                player_id: pid,
                count: need,
            });
            return ActionResult::err(format!("手札上限を超えています（{need}枚捨ててください）"));
        }
        self.advance_to_next_player();
        ActionResult::ok()
    }

    pub fn surrender(&mut self, player_id: &str) -> ActionResult {
        if self.phase == "gameOver" {
            return ActionResult::err("試合はすでに終了しています");
        }
        let winner = self
            .player_order
            .iter()
            .find(|id| id.as_str() != player_id && !self.players[*id].eliminated)
            .cloned();
        self.phase = "gameOver".into();
        self.winner = winner.clone();
        self.events.push(GameEvent::GameOver {
            winner,
            reason: "surrender".into(),
        });
        ActionResult::ok()
    }

    pub fn mulligan(&mut self, player_id: &str, card_ids: &[String]) -> ActionResult {
        if self.phase == "ready" {
            self.begin_turn(true);
            return ActionResult::ok();
        }
        if self.phase != "mulligan" {
            return ActionResult::err("マリガン中ではありません");
        }
        if !self.players.contains_key(player_id) {
            return ActionResult::err("プレイヤーが見つかりません");
        }
        if self.mulligan_done.iter().any(|p| p == player_id) {
            return ActionResult::err("すでにマリガンを完了しています");
        }

        let shared = self.config.rules.deck_mode == "shared";
        let mut swapped = 0usize;
        if !card_ids.is_empty() {
            let mut returned_types = Vec::new();
            if let Some(p) = self.players.get_mut(player_id) {
                for cid in card_ids {
                    if let Some(idx) = p.hand.iter().position(|c| &c.card_id == cid) {
                        let hc = p.hand.remove(idx);
                        returned_types.push(hc.card_type);
                        swapped += 1;
                    }
                }
                if !shared {
                    p.deck.extend(returned_types.drain(..));
                    shuffle_vec(&mut p.deck, &mut self.rng);
                }
            }
            if shared && !returned_types.is_empty() {
                self.shared_deck.extend(returned_types);
                shuffle_vec(&mut self.shared_deck, &mut self.rng);
            }
            if swapped > 0 {
                self.draw_cards(player_id, swapped);
            }
        }

        self.mulligan_done.push(player_id.to_string());
        if self.mulligan_done.len() >= self.player_order.len() {
            self.begin_turn(true);
        }
        ActionResult::ok()
    }

    // ---- Internal helpers ----

    fn advance_to_next_player(&mut self) {
        if self.phase == "gameOver" {
            return;
        }
        let total = self.player_order.len();
        for step in 1..=total {
            let nxt = (self.current_idx + step) % total;
            let pid = &self.player_order[nxt];
            if !self.players[pid].eliminated {
                let wrapped = nxt <= self.current_idx;
                self.current_idx = nxt;
                self.begin_turn(wrapped);
                return;
            }
        }
    }

    fn begin_turn(&mut self, new_round: bool) {
        self.turn += 1;
        if new_round {
            self.round += 1;
            if self.round > self.config.rules.max_rounds {
                self.resolve_round_limit();
                return;
            }
        }
        self.phase = "main".into();
        let pid = self.current_player_id().to_string();

        {
            let p = self.players.get_mut(&pid).unwrap();
            p.played_this_turn = false;
            p.coin_cards_this_turn = 0;
            p.cards_played_this_turn = 0;
            if p.armor > 0 && self.config.rules.armor_max == 0 {
                p.armor = 0;
            }
            if self.config.rules.coin_per_turn > 0 && self.turn > 1 {
                p.coins += self.config.rules.coin_per_turn;
            }
            let mp_gain = self.config.rules.mp_per_turn.unwrap_or(0);
            if mp_gain > 0 {
                p.mp = (p.mp + mp_gain).min(p.max_mp);
            }
        }

        self.events.push(GameEvent::TurnStarted {
            player_id: pid.clone(),
            turn: self.turn,
        });

        if new_round && self.round > 0 {
            self.events.push(GameEvent::RoundStarted { round: self.round });
            self.tick_monsters();
            if self.phase == "gameOver" {
                return;
            }
            self.maybe_spawn_monster();
        }

        // Trigger active spirits
        let spirits = std::mem::take(&mut self.players.get_mut(&pid).unwrap().spirits);
        let mut kept = Vec::new();
        for mut sp in spirits {
            if self.phase == "gameOver" {
                break;
            }
            self.events.push(GameEvent::SpiritTriggered {
                player_id: pid.clone(),
                spirit_type: sp.spirit_type.clone(),
                spirit: sp.spirit.clone(),
                amount: sp.amount,
            });
            match sp.spirit.as_str() {
                "fire" => {
                    if let Some(tid) = &sp.target_id {
                        self.damage_castle(tid, sp.amount, "spirit");
                    }
                }
                "water" => self.heal_castle(&pid, sp.amount),
                "earth" => {
                    let max_a = self.config.rules.armor_max;
                    let p = self.players.get_mut(&pid).unwrap();
                    p.armor = (p.armor + sp.amount).min(max_a);
                    let a = p.armor;
                    self.events.push(GameEvent::CastleArmored { player_id: pid.clone(), armor: a });
                }
                _ => {}
            }
            sp.turns_left -= 1;
            if sp.turns_left > 0 {
                kept.push(sp);
            }
        }
        if let Some(p) = self.players.get_mut(&pid) {
            p.spirits = kept;
        }
        self.check_game_over();
        if self.phase == "gameOver" {
            return;
        }

        // Draw cards
        let draw_cnt = if self.turn == 1 {
            self.config.rules.first_turn_draw
        } else {
            self.config.rules.draw_per_turn
        };
        let target_min = self.config.rules.draw_until_hand.unwrap_or(0);
        let cur_len = self.players[&pid].hand.len();
        let actual_draw = draw_cnt.max(target_min.saturating_sub(cur_len));
        self.draw_cards(&pid, actual_draw);

        // March and shoot soldiers
        self.march_soldiers(&pid);
        self.check_game_over();
    }

    fn draw_cards(&mut self, pid: &str, count: usize) {
        if count == 0 {
            return;
        }
        let mut drawn_ids = Vec::new();
        let shared = self.config.rules.deck_mode == "shared";
        for _ in 0..count {
            let ct = if shared {
                let was_empty = self.shared_deck.is_empty();
                let res = draw_from_piles(&mut self.shared_deck, &mut self.shared_discard, &mut self.rng);
                if was_empty && res.is_some() {
                    self.events.push(GameEvent::DeckShuffled {
                        deck_count: self.shared_deck.len(),
                        player_id: None,
                    });
                }
                res
            } else {
                let p = self.players.get_mut(pid).unwrap();
                let was_empty = p.deck.is_empty();
                let res = draw_from_piles(&mut p.deck, &mut p.discard, &mut self.rng);
                if was_empty && res.is_some() {
                    let dc = p.deck.len();
                    self.events.push(GameEvent::DeckShuffled {
                        deck_count: dc,
                        player_id: Some(pid.to_string()),
                    });
                }
                res
            };
            if let Some(card_type) = ct {
                self.next_card_seq += 1;
                let cid = format!("c{:02}", self.next_card_seq);
                self.players.get_mut(pid).unwrap().hand.push(HandCard {
                    card_id: cid.clone(),
                    card_type,
                });
                drawn_ids.push(cid);
            }
        }
        if !drawn_ids.is_empty() {
            self.events.push(GameEvent::CardDrawn {
                player_id: pid.to_string(),
                card_ids: drawn_ids,
            });
        }
    }

    fn resolve_card(&mut self, pid: &str, card_type: &str, def: &CardDef, target: &PlayTarget) {
        let eff = def.effect.as_deref().unwrap_or("");
        match def.kind.as_str() {
            "soldier" => {
                let road_id = target
                    .road_id
                    .clone()
                    .or_else(|| self.roads.first().map(|r| r.road_id.clone()))
                    .unwrap_or_else(|| "p1-p2".into());
                let target_id = target
                    .player_id
                    .clone()
                    .or_else(|| self.roads.iter().find(|r| r.road_id == road_id).and_then(|r| other_on_road(r, pid)))
                    .unwrap_or_else(|| "p2".into());
                self.next_soldier_seq += 1;
                let sid = format!("s{:02}", self.next_soldier_seq);
                let p = &self.players[pid];
                let hp = (def.hp.unwrap_or(1) + p.army_hp_bonus).max(1);
                let atk = (def.attack.unwrap_or(1) + p.army_attack_bonus + if p.overdrive { self.config.rules.overdrive_attack.unwrap_or(0) } else { 0 }).max(1);
                let soldier = Soldier {
                    soldier_id: sid.clone(),
                    soldier_type: card_type.to_string(),
                    hp,
                    max_hp: hp,
                    attack: atk,
                    speed: def.speed.unwrap_or(1),
                    range: def.range.unwrap_or(1),
                    role: def.role.clone(),
                    stay_left: def.stay,
                    position: 0,
                    road_id: road_id.clone(),
                    target_id: target_id.clone(),
                    weapon: None,
                    element: def.element.clone(),
                    shield: 0,
                    statuses: Statuses::default(),
                    name: def.name.clone(),
                };
                self.players.get_mut(pid).unwrap().soldiers.push(soldier);
                self.events.push(GameEvent::SoldierDeployed {
                    player_id: pid.to_string(),
                    soldier_id: sid,
                    soldier_type: card_type.to_string(),
                    road_id,
                    target_id,
                    position: 0,
                    hp,
                    attack: atk,
                });
            }
            "weapon" => {
                let sid = target.soldier_id.clone().unwrap_or_default();
                let bonus = def.attack_bonus.unwrap_or(0);
                if let Some(s) = self.players.get_mut(pid).unwrap().soldiers.iter_mut().find(|x| x.soldier_id == sid) {
                    s.attack += bonus;
                    s.weapon = Some(card_type.to_string());
                    if def.element.is_some() {
                        s.element = def.element.clone();
                    }
                    let atk = s.attack;
                    let elem = s.element.clone();
                    self.events.push(GameEvent::WeaponEquipped {
                        player_id: pid.to_string(),
                        soldier_id: sid,
                        weapon_type: card_type.to_string(),
                        attack: atk,
                        element: elem,
                    });
                }
            }
            "defense" => {
                let amt = def.amount.unwrap_or(0);
                if eff == "shieldSoldier" {
                    let sid = target.soldier_id.clone().unwrap_or_default();
                    if let Some(s) = self.players.get_mut(pid).unwrap().soldiers.iter_mut().find(|x| x.soldier_id == sid) {
                        s.shield += amt;
                        let sh = s.shield;
                        self.events.push(GameEvent::ShieldAdded {
                            player_id: pid.to_string(),
                            soldier_id: sid,
                            amount: amt,
                            shield: sh,
                        });
                    }
                } else if eff == "armorCastle" {
                    let max_a = self.config.rules.armor_max;
                    let p = self.players.get_mut(pid).unwrap();
                    p.armor = (p.armor + amt).min(max_a);
                    let armor = p.armor;
                    self.events.push(GameEvent::CastleArmored {
                        player_id: pid.to_string(),
                        armor,
                    });
                }
            }
            "spell" => self.resolve_spell(pid, card_type, def, target),
            _ => {}
        }
    }

    fn resolve_spell(&mut self, pid: &str, card_type: &str, def: &CardDef, target: &PlayTarget) {
        let eff = def.effect.as_deref().unwrap_or("");
        let opp_id = target
            .player_id
            .clone()
            .unwrap_or_else(|| self.first_enemy_of(pid));

        match eff {
            "damageEnemyCastle" => {
                let amt = def.amount.unwrap_or(0);
                if let Some(mid) = &target.monster_id {
                    self.events.push(GameEvent::SpellCast {
                        player_id: pid.into(),
                        spell_type: card_type.into(),
                        target: mid.clone(),
                        target_kind: "monster".into(),
                        road_id: None,
                    });
                    self.damage_monster(mid, amt, pid);
                } else {
                    self.events.push(GameEvent::SpellCast {
                        player_id: pid.into(),
                        spell_type: card_type.into(),
                        target: opp_id.clone(),
                        target_kind: "player".into(),
                        road_id: None,
                    });
                    self.request_or_damage_castle(&opp_id, pid, amt, "spell", Some(card_type.into()), true);
                }
            }
            "damageEnemySoldiers" => {
                let amt = def.amount.unwrap_or(0);
                self.events.push(GameEvent::SpellCast {
                    player_id: pid.into(),
                    spell_type: card_type.into(),
                    target: opp_id.clone(),
                    target_kind: "player".into(),
                    road_id: target.road_id.clone(),
                });
                let sids: Vec<String> = self.players[&opp_id]
                    .soldiers
                    .iter()
                    .filter(|s| target.road_id.as_ref().map(|r| r == &s.road_id).unwrap_or(true))
                    .map(|s| s.soldier_id.clone())
                    .collect();
                for sid in sids {
                    self.damage_soldier(&opp_id, &sid, amt, "spell");
                }
            }
            "healOwnCastle" => {
                let amt = def.amount.unwrap_or(0);
                self.events.push(GameEvent::SpellCast {
                    player_id: pid.into(),
                    spell_type: card_type.into(),
                    target: pid.into(),
                    target_kind: "player".into(),
                    road_id: None,
                });
                self.heal_castle(pid, amt);
            }
            "poisonEnemy" => {
                let amt = def.amount.unwrap_or(1);
                let turns = self.config.rules.poison_turns.unwrap_or(5);
                let sids: Vec<String> = self.players[&opp_id].soldiers.iter().map(|s| s.soldier_id.clone()).collect();
                for sid in sids {
                    if let Some(s) = self.players.get_mut(&opp_id).unwrap().soldiers.iter_mut().find(|x| x.soldier_id == sid) {
                        let cur = s.statuses.poison.as_ref().map(|p| p.amount).unwrap_or(0);
                        let cap = self.config.rules.poison_max.unwrap_or(10);
                        s.statuses.poison = Some(PoisonStatus {
                            amount: (cur + amt).min(cap),
                            turns,
                        });
                        self.events.push(GameEvent::StatusApplied {
                            player_id: opp_id.clone(),
                            soldier_id: sid,
                            status: "poison".into(),
                            turns,
                        });
                    }
                }
            }
            "freezeEnemySoldiers" => {
                let turns = def.turns.unwrap_or(1);
                let sids: Vec<String> = self.players[&opp_id]
                    .soldiers
                    .iter()
                    .filter(|s| target.road_id.as_ref().map(|r| r == &s.road_id).unwrap_or(true))
                    .map(|s| s.soldier_id.clone())
                    .collect();
                for sid in sids {
                    if let Some(s) = self.players.get_mut(&opp_id).unwrap().soldiers.iter_mut().find(|x| x.soldier_id == sid) {
                        s.statuses.frozen += turns;
                        self.events.push(GameEvent::StatusApplied {
                            player_id: opp_id.clone(),
                            soldier_id: sid,
                            status: "frozen".into(),
                            turns,
                        });
                    }
                }
            }
            "summonSpirit" => {
                let spirit = def.spirit.clone().unwrap_or_else(|| "fire".into());
                let amt = def.amount.unwrap_or(1);
                let turns = def.turns.unwrap_or(3);
                self.players.get_mut(pid).unwrap().spirits.push(SpiritSlot {
                    spirit_type: card_type.into(),
                    spirit: spirit.clone(),
                    amount: amt,
                    turns_left: turns,
                    target_id: if spirit == "fire" { Some(opp_id) } else { None },
                });
                self.events.push(GameEvent::SpiritSummoned {
                    player_id: pid.into(),
                    spirit_type: card_type.into(),
                    spirit,
                    amount: amt,
                    turns,
                });
            }
            "gainCoins" => {
                let amt = def.amount.unwrap_or(0);
                let p = self.players.get_mut(pid).unwrap();
                p.coins += amt;
                p.coin_cards_this_turn += 1;
                let c = p.coins;
                self.events.push(GameEvent::CoinsChanged {
                    player_id: pid.into(),
                    delta: amt,
                    coins: c,
                    reason: "card".into(),
                });
            }
            "gainMp" => {
                let amt = def.amount.unwrap_or(0);
                let p = self.players.get_mut(pid).unwrap();
                let before = p.mp;
                p.mp = (p.mp + amt).min(p.max_mp);
                let delta = p.mp - before;
                let cur = p.mp;
                self.events.push(GameEvent::MpChanged {
                    player_id: pid.into(),
                    delta,
                    mp: cur,
                    reason: "card".into(),
                });
            }
            "redrawHand" => {
                let cnt = self.players[pid].hand.len();
                let removed: Vec<String> = self.players.get_mut(pid).unwrap().hand.drain(..).map(|h| h.card_type).collect();
                if self.config.rules.deck_mode == "shared" {
                    self.shared_discard.extend(removed);
                } else {
                    self.players.get_mut(pid).unwrap().discard.extend(removed);
                }
                self.draw_cards(pid, cnt);
            }
            "stealCard" => {
                let count = def.amount.unwrap_or(1) as usize;
                for _ in 0..count {
                    let opp_len = self.players[&opp_id].hand.len();
                    if opp_len == 0 {
                        break;
                    }
                    let idx = self.rng.next_usize(opp_len);
                    let stolen = self.players.get_mut(&opp_id).unwrap().hand.remove(idx);
                    let cid = stolen.card_id.clone();
                    self.players.get_mut(pid).unwrap().hand.push(stolen);
                    self.events.push(GameEvent::CardStolen {
                        player_id: pid.into(),
                        victim_id: opp_id.clone(),
                        card_id: cid,
                    });
                }
            }
            "stealCoins" => {
                let want = def.amount.unwrap_or(5);
                let take = self.players[&opp_id].coins.min(want);
                if take > 0 {
                    self.players.get_mut(&opp_id).unwrap().coins -= take;
                    self.players.get_mut(pid).unwrap().coins += take;
                    let c = self.players[pid].coins;
                    self.events.push(GameEvent::CoinsChanged {
                        player_id: pid.into(),
                        delta: take,
                        coins: c,
                        reason: "steal".into(),
                    });
                }
            }
            "drainMp" => {
                let want = def.amount.unwrap_or(4);
                let take = self.players[&opp_id].mp.min(want);
                if take > 0 {
                    self.players.get_mut(&opp_id).unwrap().mp -= take;
                    let p = self.players.get_mut(pid).unwrap();
                    p.mp = (p.mp + take).min(p.max_mp);
                }
            }
            "drainCastle" => {
                let amt = def.amount.unwrap_or(8);
                let before = self.players[&opp_id].castle_hp;
                self.damage_castle(&opp_id, amt, "spell");
                let actual = (before - self.players[&opp_id].castle_hp).max(0);
                if actual > 0 {
                    self.heal_castle(pid, actual);
                }
            }
            "sacrificeAttack" => {
                let self_dmg = def.self_damage.unwrap_or(6);
                let amt = def.amount.unwrap_or(20);
                let p = self.players.get_mut(pid).unwrap();
                p.castle_hp = (p.castle_hp - self_dmg).max(0);
                let hp = p.castle_hp;
                self.events.push(GameEvent::CastleDamaged {
                    player_id: pid.into(),
                    amount: self_dmg,
                    blocked: 0,
                    hp,
                    source_kind: "spell".into(),
                });
                self.request_or_damage_castle(&opp_id, pid, amt, "spell", Some(card_type.into()), true);
            }
            "ignitionBurst" => {
                let self_dmg = def.self_damage.unwrap_or(6);
                let amt = def.amount.unwrap_or(7);
                self.damage_castle(pid, self_dmg, "spell");
                let sids: Vec<String> = self.players[&opp_id].soldiers.iter().map(|s| s.soldier_id.clone()).collect();
                for sid in sids {
                    self.damage_soldier(&opp_id, &sid, amt, "spell");
                }
                self.damage_castle(&opp_id, amt, "spell");
            }
            "armorBlast" => {
                let amt = self.players[pid].armor;
                self.players.get_mut(pid).unwrap().armor = 0;
                self.damage_castle(&opp_id, amt, "spell");
            }
            "pushBackEnemySoldiers" => {
                let amt = def.amount.unwrap_or(2) as usize;
                let mut moves = Vec::new();
                for s in &mut self.players.get_mut(&opp_id).unwrap().soldiers {
                    let from = s.position;
                    s.position = s.position.saturating_sub(amt);
                    if s.position != from {
                        moves.push((s.soldier_id.clone(), s.road_id.clone(), from, s.position));
                    }
                }
                for (sid, rid, from, to) in moves {
                    self.events.push(GameEvent::SoldierMoved {
                        player_id: opp_id.clone(),
                        soldier_id: sid,
                        road_id: rid,
                        from,
                        to,
                        cause: Some("pushed".into()),
                    });
                }
            }
            "chainBlast" => {
                let amt = def.amount.unwrap_or(4);
                let sid = target.soldier_id.clone().unwrap_or_default();
                self.damage_soldier(&opp_id, &sid, amt, "spell");
            }
            "purifyFlare" => {
                for s in &mut self.players.get_mut(pid).unwrap().soldiers {
                    s.statuses.poison = None;
                    s.statuses.frozen = 0;
                }
                self.players.get_mut(pid).unwrap().castle_poison = None;
                let sids: Vec<String> = self.players[&opp_id].soldiers.iter().map(|s| s.soldier_id.clone()).collect();
                for sid in sids {
                    self.damage_soldier(&opp_id, &sid, def.amount.unwrap_or(1), "spell");
                }
            }
            "curePoison" => {
                self.players.get_mut(pid).unwrap().castle_poison = None;
                for s in &mut self.players.get_mut(pid).unwrap().soldiers {
                    s.statuses.poison = None;
                }
            }
            "setTime" => {
                self.time = def.time.clone().unwrap_or_else(|| "day".into());
            }
            "changeWeather" => {
                if let Some(weathers) = &self.config.weather {
                    let keys: Vec<String> = weathers.keys().cloned().collect();
                    if !keys.is_empty() {
                        let k = &keys[self.rng.next_usize(keys.len())];
                        let w = &weathers[k];
                        self.weather = Some(WeatherView {
                            id: k.clone(),
                            name: w.name.clone(),
                            remaining: 2,
                        });
                    }
                }
            }
            "damageAllSoldiers" => {
                let amt = def.amount.unwrap_or(8);
                let all_ids: Vec<(String, String)> = self
                    .player_order
                    .iter()
                    .flat_map(|id| {
                        self.players[id]
                            .soldiers
                            .iter()
                            .filter(|s| s.role.as_deref() != Some("ninja"))
                            .map(move |s| (id.clone(), s.soldier_id.clone()))
                    })
                    .collect();
                for (owner, sid) in all_ids {
                    self.damage_soldier(&owner, &sid, amt, "spell");
                }
            }
            "healAndArmor" => {
                self.heal_castle(pid, def.amount.unwrap_or(10));
                let add = def.armor.unwrap_or(5);
                let max_a = self.config.rules.armor_max;
                let p = self.players.get_mut(pid).unwrap();
                p.armor = (p.armor + add).min(max_a);
            }
            "healCastleOrMp" => {
                let amt = def.amount.unwrap_or(5);
                if self.players[pid].castle_hp < self.players[pid].castle_max_hp {
                    self.heal_castle(pid, amt);
                } else {
                    let p = self.players.get_mut(pid).unwrap();
                    p.mp = (p.mp + amt).min(p.max_mp);
                }
            }
            "damageCastleAndHeal" => {
                self.damage_castle(&opp_id, def.amount.unwrap_or(10), "spell");
                self.heal_castle(pid, def.heal.unwrap_or(10));
            }
            "damageEnemyAll" => {
                let amt = def.amount.unwrap_or(15);
                let sids: Vec<String> = self.players[&opp_id].soldiers.iter().map(|s| s.soldier_id.clone()).collect();
                for sid in sids {
                    self.damage_soldier(&opp_id, &sid, amt, "spell");
                }
                self.damage_castle(&opp_id, amt, "spell");
            }
            "dice" => {
                let roll = self.rng.roll_d6();
                let dtype = def.dice.as_deref().unwrap_or("attack");
                let per = def.per.unwrap_or(2.0);
                let amt = ((roll as f64) * per).ceil() as i32;
                self.events.push(GameEvent::DiceRolled {
                    player_id: pid.into(),
                    dice_type: dtype.into(),
                    value: roll,
                    amount: amt,
                });
                match dtype {
                    "attack" => self.damage_castle(&opp_id, amt, "spell"),
                    "heal" => self.heal_castle(pid, amt),
                    "mana" => {
                        let p = self.players.get_mut(pid).unwrap();
                        p.mp = (p.mp + amt).min(p.max_mp);
                    }
                    "coin" => {
                        let p = self.players.get_mut(pid).unwrap();
                        p.coins += amt;
                        p.coin_cards_this_turn += 1;
                    }
                    "shield" => {
                        let max_a = self.config.rules.armor_max;
                        let p = self.players.get_mut(pid).unwrap();
                        p.armor = (p.armor + amt).min(max_a);
                    }
                    "buff" => {
                        if let Some(sid) = &target.soldier_id {
                            if let Some(s) = self.players.get_mut(pid).unwrap().soldiers.iter_mut().find(|x| &x.soldier_id == sid) {
                                s.attack += amt;
                            }
                        }
                    }
                    "god" => {
                        let dmg = ((roll as f64) * 3.5).ceil() as i32;
                        self.damage_castle(&opp_id, dmg, "spell");
                        self.heal_castle(pid, (roll as i32) * 3);
                        let p = self.players.get_mut(pid).unwrap();
                        p.mp = (p.mp + (roll as i32) * 2).min(p.max_mp);
                        p.coins += (roll as i32) * 2;
                        p.armor = (p.armor + (roll as i32) * 3).min(self.config.rules.armor_max);
                    }
                    _ => {}
                }
            }
            _ => {}
        }
    }

    fn march_soldiers(&mut self, pid: &str) {
        if self.weather.as_ref().map(|w| w.id == "storm").unwrap_or(false) {
            return;
        }
        let lane_len = self.config.rules.lane_length.max(1);
        let sids: Vec<String> = self.players[pid].soldiers.iter().map(|s| s.soldier_id.clone()).collect();

        for sid in sids {
            if self.phase == "gameOver" {
                break;
            }
            let Some(mut s) = self.players[pid].soldiers.iter().find(|x| x.soldier_id == sid).cloned() else {
                continue;
            };

            // Poison tick
            if let Some(poison) = s.statuses.poison.clone() {
                self.damage_soldier(pid, &sid, poison.amount, "poison");
                if !self.players[pid].soldiers.iter().any(|x| x.soldier_id == sid) {
                    continue;
                }
            }

            // Frozen check
            if s.statuses.frozen > 0 {
                if let Some(sm) = self.players.get_mut(pid).unwrap().soldiers.iter_mut().find(|x| x.soldier_id == sid) {
                    sm.statuses.frozen -= 1;
                    if sm.statuses.frozen == 0 {
                        self.events.push(GameEvent::StatusCleared {
                            player_id: pid.into(),
                            soldier_id: sid.clone(),
                            status: "frozen".into(),
                        });
                    }
                }
                continue;
            }

            // Ranged archer / mage stays put and shoots
            if matches!(s.role.as_deref(), Some("archer") | Some("mage")) {
                self.resolve_ranged_shot(pid, &mut s);
                if let Some(left) = s.stay_left {
                    let nl = left - 1;
                    if nl <= 0 {
                        self.players.get_mut(pid).unwrap().soldiers.retain(|x| x.soldier_id != sid);
                        self.events.push(GameEvent::SoldierDestroyed {
                            player_id: pid.into(),
                            soldier_id: sid,
                            reason: "returned".into(),
                        });
                    } else if let Some(sm) = self.players.get_mut(pid).unwrap().soldiers.iter_mut().find(|x| x.soldier_id == sid) {
                        sm.stay_left = Some(nl);
                    }
                }
                continue;
            }

            // March step by step
            let steps = s.speed.max(0) as usize;
            for _ in 0..steps {
                if self.phase == "gameOver" {
                    break;
                }
                let Some(cur) = self.players[pid].soldiers.iter().find(|x| x.soldier_id == sid).cloned() else {
                    break;
                };
                let next_pos = cur.position + 1;
                if next_pos >= lane_len {
                    // Reached enemy castle
                    let from = cur.position;
                    self.events.push(GameEvent::SoldierMoved {
                        player_id: pid.into(),
                        soldier_id: sid.clone(),
                        road_id: cur.road_id.clone(),
                        from,
                        to: lane_len,
                        cause: None,
                    });
                    let dmg = cur.attack * self.config.rules.soldier_castle_damage_multiplier;
                    self.players.get_mut(pid).unwrap().soldiers.retain(|x| x.soldier_id != sid);
                    self.damage_castle(&cur.target_id, dmg, "soldier");
                    self.events.push(GameEvent::SoldierDestroyed {
                        player_id: pid.into(),
                        soldier_id: sid.clone(),
                        reason: "reachedCastle".into(),
                    });
                    break;
                }

                // Move 1 square
                if let Some(sm) = self.players.get_mut(pid).unwrap().soldiers.iter_mut().find(|x| x.soldier_id == sid) {
                    sm.position = next_pos;
                }
                self.events.push(GameEvent::SoldierMoved {
                    player_id: pid.into(),
                    soldier_id: sid.clone(),
                    road_id: cur.road_id.clone(),
                    from: cur.position,
                    to: next_pos,
                    cause: None,
                });

                // Check clash with enemy soldier on same road & opposite square (unless ninja)
                let road_sq = self.to_road_square(pid, &cur.road_id, next_pos);
                if cur.role.as_deref() != Some("ninja") {
                    if let Some((opp_id, opp_sid)) = self.find_enemy_soldier_at(&cur.target_id, &cur.road_id, road_sq) {
                        self.clash_soldiers(pid, &sid, &opp_id, &opp_sid, &cur.road_id, road_sq);
                        if !self.config.rules.advance_after_win || !self.players[pid].soldiers.iter().any(|x| x.soldier_id == sid) {
                            break;
                        }
                    }
                }

                // Check monster on this road & square
                if let Some(mid) = self.monsters.iter().find(|m| m.road_id == cur.road_id && m.square == road_sq).map(|m| m.monster_id.clone()) {
                    let atk = self.players[pid].soldiers.iter().find(|x| x.soldier_id == sid).map(|x| x.attack).unwrap_or(0);
                    let mon_atk = self.monsters.iter().find(|m| m.monster_id == mid).map(|m| m.attack).unwrap_or(0);
                    self.damage_monster(&mid, atk, pid);
                    self.damage_soldier(pid, &sid, mon_atk, "fight");
                    break;
                }
            }
        }
    }

    fn resolve_ranged_shot(&mut self, pid: &str, s: &Soldier) {
        let tid = &s.target_id;
        let opp_soldiers: Vec<String> = self.players[tid]
            .soldiers
            .iter()
            .filter(|e| e.road_id == s.road_id && e.role.as_deref() != Some("ninja"))
            .map(|e| e.soldier_id.clone())
            .collect();
        if let Some(target_sid) = opp_soldiers.first() {
            self.events.push(GameEvent::SoldierShot {
                player_id: pid.into(),
                soldier_id: s.soldier_id.clone(),
                amount: s.attack,
            });
            self.damage_soldier(tid, target_sid, s.attack, "shot");
        } else if let Some(mid) = self.monsters.iter().find(|m| m.road_id == s.road_id).map(|m| m.monster_id.clone()) {
            self.events.push(GameEvent::SoldierShot {
                player_id: pid.into(),
                soldier_id: s.soldier_id.clone(),
                amount: s.attack,
            });
            self.damage_monster(&mid, s.attack, pid);
        } else if s.role.as_deref() == Some("mage") {
            self.events.push(GameEvent::SoldierShot {
                player_id: pid.into(),
                soldier_id: s.soldier_id.clone(),
                amount: s.attack,
            });
            self.damage_castle(tid, s.attack, "soldier");
        }
    }

    fn clash_soldiers(&mut self, att_pid: &str, att_sid: &str, def_pid: &str, def_sid: &str, road_id: &str, square: usize) {
        self.events.push(GameEvent::SoldiersClashed {
            road_id: road_id.into(),
            square,
        });
        let att = self.players[att_pid].soldiers.iter().find(|x| x.soldier_id == att_sid).cloned();
        let def = self.players[def_pid].soldiers.iter().find(|x| x.soldier_id == def_sid).cloned();
        let (Some(a), Some(d)) = (att, def) else {
            return;
        };
        let bonus = self.config.rules.element_bonus;
        let a_dmg = a.attack + match (a.element.as_deref(), d.element.as_deref()) {
            (Some(ea), Some(ed)) if beats_element(ea, ed) => bonus,
            _ => 0,
        };
        let d_dmg = d.attack + match (d.element.as_deref(), a.element.as_deref()) {
            (Some(ed), Some(ea)) if beats_element(ed, ea) => bonus,
            _ => 0,
        };
        self.damage_soldier(def_pid, def_sid, a_dmg, "fight");
        self.damage_soldier(att_pid, att_sid, d_dmg, "fight");
    }

    fn request_or_damage_castle(
        &mut self,
        defender_id: &str,
        attacker_id: &str,
        amount: i32,
        source_kind: &str,
        spell_type: Option<String>,
        can_reflect: bool,
    ) {
        if self.config.rules.defense_reaction && defender_id == "p1" && self.has_usable_defense_for_kind(defender_id, "castle", can_reflect, false) {
            self.phase = "defend".into();
            self.pending_defense = Some(PendingDefense {
                defender_id: defender_id.into(),
                attacker_id: attacker_id.into(),
                kind: "castle".into(),
                amount,
                source_kind: source_kind.into(),
                spell_type,
                attacker_soldier_id: None,
                soldier_ids: Vec::new(),
                can_reflect,
                can_decoy: false,
            });
            self.events.push(GameEvent::DefenseRequested {
                defender_id: defender_id.into(),
                attacker_id: attacker_id.into(),
                kind: "castle".into(),
                amount,
            });
            return;
        }
        self.damage_castle(defender_id, amount, source_kind);
    }

    fn damage_castle(&mut self, pid: &str, amount: i32, source_kind: &str) {
        let p = self.players.get_mut(pid).unwrap();
        let blocked = p.armor.min(amount);
        p.armor -= blocked;
        let net = (amount - blocked).max(0);
        p.castle_hp = (p.castle_hp - net).max(0);
        let hp = p.castle_hp;
        let max_hp = p.castle_max_hp;
        let was_od = p.overdrive;
        let ratio = self.config.rules.overdrive_hp_ratio.unwrap_or(0.0);
        let is_od = ratio > 0.0 && hp > 0 && (hp as f64) <= (max_hp as f64) * ratio;
        p.overdrive = is_od;

        self.events.push(GameEvent::CastleDamaged {
            player_id: pid.into(),
            amount,
            blocked,
            hp,
            source_kind: source_kind.into(),
        });
        if is_od != was_od {
            self.events.push(GameEvent::OverdriveChanged {
                player_id: pid.into(),
                active: is_od,
            });
        }
        self.check_game_over();
    }

    fn heal_castle(&mut self, pid: &str, amount: i32) {
        let p = self.players.get_mut(pid).unwrap();
        let before = p.castle_hp;
        p.castle_hp = (p.castle_hp + amount).min(p.castle_max_hp);
        let gained = p.castle_hp - before;
        let hp = p.castle_hp;
        self.events.push(GameEvent::CastleHealed {
            player_id: pid.into(),
            amount: gained,
            hp,
        });
    }

    fn damage_soldier(&mut self, pid: &str, sid: &str, amount: i32, cause: &str) {
        let mut died = false;
        if let Some(s) = self.players.get_mut(pid).unwrap().soldiers.iter_mut().find(|x| x.soldier_id == sid) {
            let blocked = s.shield.min(amount);
            s.shield -= blocked;
            let net = (amount - blocked).max(0);
            s.hp -= net;
            let hp = s.hp.max(0);
            self.events.push(GameEvent::SoldierDamaged {
                player_id: pid.into(),
                soldier_id: sid.into(),
                amount,
                hp,
                cause: cause.into(),
                blocked,
            });
            if s.hp <= 0 {
                died = true;
            }
        }
        if died {
            self.players.get_mut(pid).unwrap().soldiers.retain(|x| x.soldier_id != sid);
            self.events.push(GameEvent::SoldierDestroyed {
                player_id: pid.into(),
                soldier_id: sid.into(),
                reason: "killed".into(),
            });
        }
    }

    fn damage_monster(&mut self, mid: &str, amount: i32, killer_pid: &str) {
        let mut reward_info = None;
        if let Some(m) = self.monsters.iter_mut().find(|x| x.monster_id == mid) {
            m.hp -= amount;
            let hp = m.hp.max(0);
            self.events.push(GameEvent::MonsterDamaged {
                monster_id: mid.into(),
                amount,
                hp,
            });
            if m.hp <= 0 {
                reward_info = Some((m.monster_type.clone(), m.reward));
            }
        }
        if let Some((mtype, reward)) = reward_info {
            self.monsters.retain(|x| x.monster_id != mid);
            self.monster_cooldown = self.config.rules.monster_cooldown_rounds;
            let p = self.players.get_mut(killer_pid).unwrap();
            p.coins += reward;
            let coins = p.coins;
            let beast_key = format!("beast_{mtype}");
            if self.config.cards.contains_key(&beast_key) {
                self.next_card_seq += 1;
                p.hand.push(HandCard {
                    card_id: format!("c{:02}", self.next_card_seq),
                    card_type: beast_key,
                });
            }
            self.events.push(GameEvent::MonsterDefeated {
                monster_id: mid.into(),
                player_id: killer_pid.into(),
                reward,
            });
            self.events.push(GameEvent::CoinsChanged {
                player_id: killer_pid.into(),
                delta: reward,
                coins,
                reason: "reward".into(),
            });
        }
    }

    fn tick_monsters(&mut self) {
        let mut attacks = Vec::new();
        for m in &mut self.monsters {
            if m.attack_in <= 1 {
                m.attack_in = m.attack_every.max(1);
                attacks.push((m.monster_id.clone(), m.road_id.clone(), m.castle_attack));
            } else {
                m.attack_in -= 1;
            }
        }
        for (mid, rid, dmg) in attacks {
            let targets = self
                .roads
                .iter()
                .find(|r| r.road_id == rid)
                .map(|r| r.players.clone())
                .unwrap_or_else(|| ["p1".into(), "p2".into()]);
            for pid in targets {
                self.damage_castle(&pid, dmg, "monster");
                let hp = self.players[&pid].castle_hp;
                self.events.push(GameEvent::MonsterAttackedCastle {
                    monster_id: mid.clone(),
                    player_id: pid,
                    amount: dmg,
                    hp,
                });
            }
        }
    }

    fn maybe_spawn_monster(&mut self) {
        if self.round < self.config.rules.monster_first_round || !self.monsters.is_empty() {
            return;
        }
        if self.monster_cooldown > 0 {
            self.monster_cooldown -= 1;
            return;
        }
        if self.rng.next_f64() > self.config.rules.monster_spawn_chance {
            return;
        }
        let Some(monsters) = &self.config.monsters else {
            return;
        };
        let keys: Vec<String> = monsters.keys().cloned().collect();
        if keys.is_empty() || self.roads.is_empty() {
            return;
        }
        let mkey = &keys[self.rng.next_usize(keys.len())];
        let mdef = &monsters[mkey];
        let road = &self.roads[self.rng.next_usize(self.roads.len())];
        let sq = road.length / 2;
        self.next_monster_seq += 1;
        let mid = format!("m{:02}", self.next_monster_seq);
        let mon = Monster {
            monster_id: mid.clone(),
            monster_type: mkey.clone(),
            road_id: road.road_id.clone(),
            square: sq,
            hp: mdef.hp,
            max_hp: mdef.hp,
            attack: mdef.attack,
            element: mdef.element.clone(),
            attack_in: mdef.attack_every.max(1),
            attack_every: mdef.attack_every.max(1),
            reward: 2,
            castle_attack: mdef.castle_attack,
        };
        self.events.push(GameEvent::MonsterAppeared {
            monster_id: mid,
            monster_type: mkey.clone(),
            road_id: road.road_id.clone(),
            square: sq,
            hp: mdef.hp,
            attack: mdef.attack,
        });
        self.monsters.push(mon);
    }

    fn to_road_square(&self, pid: &str, road_id: &str, pos: usize) -> usize {
        let Some(r) = self.roads.iter().find(|x| x.road_id == road_id) else {
            return pos;
        };
        if r.players[0] == pid {
            pos
        } else {
            r.length.saturating_sub(1).saturating_sub(pos)
        }
    }

    fn find_enemy_soldier_at(&self, opp_id: &str, road_id: &str, road_sq: usize) -> Option<(String, String)> {
        let r = self.roads.iter().find(|x| x.road_id == road_id)?;
        for s in &self.players[opp_id].soldiers {
            if s.road_id == road_id && s.role.as_deref() != Some("ninja") {
                let sq = if r.players[0] == opp_id {
                    s.position
                } else {
                    r.length.saturating_sub(1).saturating_sub(s.position)
                };
                if sq == road_sq {
                    return Some((opp_id.to_string(), s.soldier_id.clone()));
                }
            }
        }
        None
    }

    fn first_enemy_of(&self, pid: &str) -> String {
        self.player_order
            .iter()
            .find(|id| id.as_str() != pid && !self.players[*id].eliminated)
            .cloned()
            .unwrap_or_else(|| "p2".into())
    }

    fn is_free_action(&self, def: &CardDef) -> bool {
        if def.kind == "weapon" || def.kind == "defense" {
            return true;
        }
        matches!(
            def.effect.as_deref(),
            Some("gainMp") | Some("curePoison")
        ) || matches!(def.dice.as_deref(), Some("mana") | Some("shield") | Some("buff"))
    }

    fn mp_cost_of(&self, def: &CardDef) -> i32 {
        if let Some(c) = def.mp_cost {
            return c;
        }
        if !self.config.rules.mp_all_cards {
            let eff = def.effect.as_deref().unwrap_or("");
            let needs_mp = matches!(
                eff,
                "damageEnemyCastle"
                    | "damageEnemySoldiers"
                    | "poisonEnemy"
                    | "freezeEnemySoldiers"
                    | "summonSpirit"
                    | "chainBlast"
                    | "ignitionBurst"
                    | "armorBlast"
                    | "drainCastle"
                    | "sacrificeAttack"
                    | "damageAllSoldiers"
                    | "pushBackEnemySoldiers"
            );
            if !needs_mp {
                return 0;
            }
        }
        if let Some(r) = def.rarity.as_deref().and_then(|rk| self.config.rarities.as_ref()?.get(rk)) {
            if let Some(cost) = r.mp_cost {
                return cost;
            }
        }
        0
    }

    fn has_usable_defense(&self, pid: &str) -> bool {
        let Some(d) = &self.pending_defense else {
            return false;
        };
        self.has_usable_defense_for_kind(pid, &d.kind, d.can_reflect, d.can_decoy)
    }

    fn has_usable_defense_for_kind(&self, pid: &str, kind: &str, can_reflect: bool, can_decoy: bool) -> bool {
        self.players[pid].hand.iter().any(|hc| {
            let Some(def) = self.config.cards.get(&hc.card_type) else {
                return false;
            };
            if def.kind != "defense" {
                return false;
            }
            match def.effect.as_deref() {
                Some("reflectSpell") => can_reflect,
                Some("nullifySoldier") => can_decoy,
                Some("armorCastle") => kind == "castle",
                Some("shieldSoldier") => kind == "soldiers",
                _ => false,
            }
        })
    }

    fn check_game_over(&mut self) {
        if self.phase == "gameOver" {
            return;
        }
        let alive: Vec<String> = self
            .player_order
            .iter()
            .filter(|id| self.players[*id].castle_hp > 0 && !self.players[*id].eliminated)
            .cloned()
            .collect();
        if alive.len() <= 1 {
            self.phase = "gameOver".into();
            self.winner = alive.first().cloned();
            self.events.push(GameEvent::GameOver {
                winner: self.winner.clone(),
                reason: "castleDestroyed".into(),
            });
        }
    }

    fn resolve_round_limit(&mut self) {
        let best = self
            .player_order
            .iter()
            .max_by_key(|id| self.players[*id].castle_hp)
            .cloned();
        self.phase = "gameOver".into();
        self.winner = best.clone();
        self.events.push(GameEvent::GameOver {
            winner: best,
            reason: "roundLimit".into(),
        });
    }
}

fn other_on_road(road: &Road, pid: &str) -> Option<String> {
    if road.players[0] == pid {
        Some(road.players[1].clone())
    } else if road.players[1] == pid {
        Some(road.players[0].clone())
    } else {
        None
    }
}

fn pick_stage(config: &GameConfig, rng: &mut Mulberry32) -> String {
    let want = config
        .setup
        .as_ref()
        .and_then(|s| s.stage.as_deref())
        .unwrap_or("random");
    if want != "random" {
        return want.to_string();
    }
    if let Some(stages) = &config.stages {
        let keys: Vec<String> = stages.keys().cloned().collect();
        if !keys.is_empty() {
            return keys[rng.next_usize(keys.len())].clone();
        }
    }
    "meadow".to_string()
}

fn build_weighted_deck(cards: &BTreeMap<String, CardDef>, deck_size: usize, rng: &mut Mulberry32) -> Vec<String> {
    let mut pool = Vec::new();
    for (k, def) in cards {
        let cnt = def.count.unwrap_or(0);
        for _ in 0..cnt {
            pool.push(k.clone());
        }
    }
    if pool.is_empty() {
        pool = cards.keys().cloned().collect();
    }
    let mut out = Vec::with_capacity(deck_size);
    while out.len() < deck_size {
        let mut chunk = pool.clone();
        shuffle_vec(&mut chunk, rng);
        for item in chunk {
            if out.len() >= deck_size {
                break;
            }
            out.push(item);
        }
    }
    out
}

fn shuffle_vec<T>(v: &mut [T], rng: &mut Mulberry32) {
    for i in (1..v.len()).rev() {
        let j = rng.next_usize(i + 1);
        v.swap(i, j);
    }
}

fn draw_from_piles(deck: &mut Vec<String>, discard: &mut Vec<String>, rng: &mut Mulberry32) -> Option<String> {
    if deck.is_empty() && !discard.is_empty() {
        deck.append(discard);
        shuffle_vec(deck, rng);
    }
    deck.pop()
}

impl RulesDef {
    pub fn default_test_rules() -> Self {
        Self::default()
    }
}
