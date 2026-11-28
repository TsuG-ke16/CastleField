use crate::game::Game;
use crate::model::PlayTarget;
use crate::rng::Mulberry32;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CpuStrategy {
    Defensive,
    Rush,
    Smart,
}

impl CpuStrategy {
    pub fn from_level(level: &str) -> Self {
        match level {
            "easy" | "defensive" => Self::Defensive,
            "hard" | "smart" => Self::Smart,
            _ => Self::Rush,
        }
    }
}

pub fn run_cpu_turn(game: &mut Game, pid: &str, strategy: CpuStrategy, rng: &mut Mulberry32) {
    if game.phase() == "defend" {
        let _ = game.pass_defense();
        return;
    }
    if game.phase() != "main" || game.current_player_id() != pid {
        return;
    }

    // Play up to 6 cards (free weapons/defenses/mp + 1 main card)
    for _ in 0..6 {
        if game.phase() != "main" || game.current_player_id() != pid {
            break;
        }
        let state = game.get_state(Some(pid));
        let Some(me) = state.players.get(pid) else {
            break;
        };
        let Some(hand) = &me.hand else {
            break;
        };

        // Pick best playable card by strategy
        let mut best: Option<(i32, String, PlayTarget)> = None;
        for hc in hand {
            let check = game.can_play_card(&hc.card_id, None);
            if !check.ok && check.needs_target != Some(true) {
                continue;
            }
            let targets = game.get_targets(&hc.card_id);
            if targets.is_empty() {
                continue;
            }
            let Some(def) = game.config.cards.get(&hc.card_type) else {
                continue;
            };
            let target = pick_best_target(&state, pid, def.kind.as_str(), &targets, rng);
            let mut score = match (strategy, def.kind.as_str()) {
                (CpuStrategy::Defensive, "defense") => 90,
                (CpuStrategy::Defensive, "spell") if def.effect.as_deref() == Some("healOwnCastle") => 85,
                (CpuStrategy::Rush, "spell") if def.effect.as_deref() == Some("damageEnemyCastle") => 95,
                (CpuStrategy::Rush, "soldier") => 80,
                (CpuStrategy::Smart, "weapon") => 95,
                (CpuStrategy::Smart, "spell") => 88,
                (CpuStrategy::Smart, "soldier") => 82,
                _ => 60,
            };
            if def.kind == "soldier" {
                score += def.attack.unwrap_or(0);
            }
            if best.as_ref().map(|b| score > b.0).unwrap_or(true) {
                best = Some((score, hc.card_id.clone(), target));
            }
        }

        let Some((_, cid, tgt)) = best else {
            break;
        };
        if !game.play_card(&cid, Some(&tgt)).ok {
            break;
        }
        if game.phase() == "defend" {
            // Leave defend pause for human p1 if needed, otherwise pass for AI
            let st = game.get_state(None);
            if st.defense.as_ref().map(|d| d.defender_id.as_str()) == Some(pid) {
                let _ = game.pass_defense();
            } else {
                return;
            }
        }
    }

    if game.phase() == "main" && game.current_player_id() == pid {
        let res = game.end_turn();
        if !res.ok && game.phase() == "discard" {
            let st = game.get_state(Some(pid));
            if let Some(me) = st.players.get(pid) {
                if let Some(hand) = &me.hand {
                    let need = hand.len().saturating_sub(me.max_hand);
                    let disc: Vec<String> = hand.iter().take(need).map(|c| c.card_id.clone()).collect();
                    let _ = game.discard(&disc);
                }
            }
        }
    }
}

fn pick_best_target(
    state: &crate::model::GameStateView,
    pid: &str,
    kind: &str,
    targets: &[PlayTarget],
    rng: &mut Mulberry32,
) -> PlayTarget {
    if kind == "soldier" {
        // Intercept incoming enemy soldier lane if any
        for t in targets {
            if let Some(rid) = &t.road_id {
                let has_enemy = state
                    .players
                    .iter()
                    .filter(|(id, _)| id.as_str() != pid)
                    .any(|(_, p)| p.soldiers.iter().any(|s| &s.road_id == rid));
                if has_enemy {
                    return t.clone();
                }
            }
        }
    }
    targets[rng.next_usize(targets.len())].clone()
}
