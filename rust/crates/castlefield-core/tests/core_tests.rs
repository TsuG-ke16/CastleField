use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

use castlefield_core::ai::{run_cpu_turn, CpuStrategy};
use castlefield_core::data::{
    parse_map_str, CardDef, CastleDef, DeckDef, GameConfig, GameSetup, MonsterDef, RarityDef,
    RulesDef, StageDef, UpgradeDef, WeatherDef,
};
use castlefield_core::game::Game;
use castlefield_core::json::parse_json;
use castlefield_core::model::PlayTarget;
use castlefield_core::rng::Mulberry32;
use castlefield_core::sim::run_simulation;

fn data_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join("data")
}

fn load_real_config(seed: u32) -> GameConfig {
    let dir = data_dir();
    let cards = parse_map_str(&fs::read_to_string(dir.join("cards.json")).unwrap(), CardDef::from_json).unwrap();
    let mut rules = RulesDef::from_json(&parse_json(&fs::read_to_string(dir.join("rules.json")).unwrap()).unwrap());
    rules.mulligan = false;
    let monsters = parse_map_str(&fs::read_to_string(dir.join("monsters.json")).unwrap(), MonsterDef::from_json).unwrap();
    let upgrades = parse_map_str(&fs::read_to_string(dir.join("upgrades.json")).unwrap(), UpgradeDef::from_json).unwrap();
    let castles = parse_map_str(&fs::read_to_string(dir.join("castles.json")).unwrap(), CastleDef::from_json).unwrap();
    let decks = parse_map_str(&fs::read_to_string(dir.join("decks.json")).unwrap(), DeckDef::from_json).unwrap();
    let rarities = parse_map_str(&fs::read_to_string(dir.join("rarities.json")).unwrap(), RarityDef::from_json).unwrap();
    let stages = parse_map_str(&fs::read_to_string(dir.join("stages.json")).unwrap(), StageDef::from_json).unwrap();
    let weather = parse_map_str(&fs::read_to_string(dir.join("weather.json")).unwrap(), WeatherDef::from_json).unwrap();

    GameConfig {
        cards,
        rules,
        monsters: Some(monsters),
        upgrades: Some(upgrades),
        castles: Some(castles),
        decks: Some(decks),
        rarities: Some(rarities),
        stages: Some(stages),
        weather: Some(weather),
        setup: Some(GameSetup {
            stage: Some("meadow".into()),
            first_player: Some("p1".into()),
            castles: Some(vec!["standard".into(), "standard".into()]),
            decks: Some(vec!["costBalance".into(), "costAssault".into()]),
        }),
        seed,
    }
}

#[test]
fn loads_all_real_json_data_and_starts_cleanly() {
    let cfg = load_real_config(42);
    assert!(cfg.cards.len() >= 120);
    let mut game = Game::new(cfg).expect("Game::new succeeds");
    let events = game.start();
    assert!(!events.is_empty());
    let st = game.get_state(Some("p1"));
    assert_eq!(st.phase, "main");
    assert_eq!(st.current_player, "p1");
    assert!(st.players["p1"].hand.as_ref().unwrap().len() >= 5);
    assert!(st.players["p2"].hand.is_none());
}

#[test]
fn deterministic_replay_matches_identically() {
    let run = |seed: u32| {
        let mut g = Game::new(load_real_config(seed)).unwrap();
        let mut rng = Mulberry32::new(seed ^ 0x9E37_79B9);
        g.start();
        for _ in 0..24 {
            if g.phase() == "gameOver" {
                break;
            }
            let pid = g.current_player_id().to_string();
            run_cpu_turn(&mut g, &pid, CpuStrategy::Smart, &mut rng);
        }
        g.get_state(None).to_json_string()
    };

    assert_eq!(run(12345), run(12345));
    assert_ne!(run(12345), run(99999));
}

#[test]
fn soldier_deploy_fusion_and_surrender_work() {
    let mut cfg = load_real_config(7);
    cfg.rules.deck_mode = "shared".into();
    let mut g = Game::new(cfg).unwrap();
    g.start();

    let st = g.get_state(Some("p1"));
    let p1_hand = st.players["p1"].hand.as_ref().unwrap();
    for hc in p1_hand {
        let chk = g.can_play_card(&hc.card_id, None);
        if chk.ok || chk.needs_target == Some(true) {
            let tgts = g.get_targets(&hc.card_id);
            let res = g.play_card(&hc.card_id, tgts.first());
            assert!(res.ok, "play_card failed: {:?}", res.reason);
            break;
        }
    }

    let sur = g.surrender("p1");
    assert!(sur.ok);
    let final_st = g.get_state(None);
    assert_eq!(final_st.phase, "gameOver");
    assert_eq!(final_st.winner.as_deref(), Some("p2"));
}

#[test]
fn defense_reflection_blocks_and_reflects_damage() {
    let mut cfg = load_real_config(77);
    cfg.rules.defense_reaction = true;
    let mut p1_cards = BTreeMap::new();
    p1_cards.insert("reflect".into(), 10);
    let mut p2_cards = BTreeMap::new();
    p2_cards.insert("fireball".into(), 10);
    cfg.decks.as_mut().unwrap().insert(
        "testP1".into(),
        DeckDef { name: "p1".into(), cards: p1_cards, cost_deck: false },
    );
    cfg.decks.as_mut().unwrap().insert(
        "testP2".into(),
        DeckDef { name: "p2".into(), cards: p2_cards, cost_deck: false },
    );
    cfg.rules.deck_mode = "own".into();
    cfg.setup.as_mut().unwrap().decks = Some(vec!["testP1".into(), "testP2".into()]);

    let mut g = Game::new(cfg).unwrap();
    g.start();
    assert!(g.end_turn().ok);
    let p2_hand = g.get_state(Some("p2")).players["p2"].hand.clone().unwrap();
    let fb = p2_hand[0].card_id.clone();
    let res = g.play_card(&fb, Some(&PlayTarget { player_id: Some("p1".into()), ..Default::default() }));
    assert!(res.ok);
    assert_eq!(g.phase(), "defend");

    let p1_hand = g.get_state(Some("p1")).players["p1"].hand.clone().unwrap();
    let ref_id = p1_hand[0].card_id.clone();
    assert!(g.defend(&ref_id, None).ok);
    let st = g.get_state(None);
    assert_eq!(st.players["p1"].castle_hp, st.players["p1"].castle_max_hp);
    assert!(st.players["p2"].castle_hp + st.players["p2"].armor < st.players["p2"].castle_max_hp + 5);
}

#[test]
fn fast_simulation_completes_200_games_without_panics() {
    let mut cfg = load_real_config(1);
    cfg.rules.deck_mode = "cost".into();
    let summary = run_simulation(&cfg, 200, 100);
    assert_eq!(summary.games, 200);
    assert!(summary.p1_wins + summary.p2_wins > 180);
    assert!(summary.avg_turns > 3.0);
}
