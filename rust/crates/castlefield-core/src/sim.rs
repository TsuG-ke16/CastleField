use crate::ai::{run_cpu_turn, CpuStrategy};
use crate::data::GameConfig;
use crate::game::Game;
use crate::json::{obj, JsonValue};
use crate::rng::Mulberry32;

#[derive(Debug, Clone)]
pub struct SimSummary {
    pub games: u32,
    pub p1_wins: u32,
    pub p2_wins: u32,
    pub draws: u32,
    pub avg_turns: f64,
}

impl SimSummary {
    pub fn to_json(&self) -> JsonValue {
        obj(vec![
            ("games", JsonValue::Number(self.games as f64)),
            ("p1Wins", JsonValue::Number(self.p1_wins as f64)),
            ("p2Wins", JsonValue::Number(self.p2_wins as f64)),
            ("draws", JsonValue::Number(self.draws as f64)),
            ("avgTurns", JsonValue::Number(self.avg_turns)),
        ])
    }

    pub fn to_json_string(&self) -> String {
        self.to_json().to_json_string()
    }
}

pub fn run_simulation(base_config: &GameConfig, games: u32, base_seed: u32) -> SimSummary {
    let mut p1_wins = 0u32;
    let mut p2_wins = 0u32;
    let mut draws = 0u32;
    let mut total_turns = 0u64;

    for i in 0..games {
        let mut cfg = base_config.clone();
        cfg.seed = base_seed.wrapping_add(i.wrapping_mul(7919));
        cfg.rules.defense_reaction = false;
        cfg.rules.mulligan = false;

        let mut game = match Game::new(cfg) {
            Ok(g) => g,
            Err(_) => continue,
        };
        let mut ai_rng = Mulberry32::new(base_seed ^ i);
        game.start();

        for _ in 0..400 {
            if game.phase() == "gameOver" {
                break;
            }
            let cur = game.current_player_id().to_string();
            let strat = if cur == "p1" {
                CpuStrategy::Smart
            } else {
                CpuStrategy::Rush
            };
            run_cpu_turn(&mut game, &cur, strat, &mut ai_rng);
            let _ = game.drain_events();
        }

        let st = game.get_state(None);
        total_turns += st.turn as u64;
        match st.winner.as_deref() {
            Some("p1") => p1_wins += 1,
            Some("p2") => p2_wins += 1,
            _ => draws += 1,
        }
    }

    SimSummary {
        games,
        p1_wins,
        p2_wins,
        draws,
        avg_turns: if games > 0 {
            (total_turns as f64) / (games as f64)
        } else {
            0.0
        },
    }
}
