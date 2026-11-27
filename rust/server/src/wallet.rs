//! v2 のお財布（コイン・交換pt・所持品）をサーバーで持つ。数値は `data/v2/economy.json`。
//! - 端末からの移行（1回だけ）：見た目の品（スキン）だけ受け取る。コインは受け取らない（端末のデータは書きかえられるため）
//! - CPU対戦などの報酬：端末の申告なので、1日（UTC）の回数に上限をつける
//! - ランクマッチの報酬：サーバーが決着を確かめて渡す（ranked.rs の apply_match から呼ぶ）
//! - ミッション：サーバーが数えられるもの（試合数・勝利数・ガチャ回数・所持品の数）は確かめる。1アカウント1回

use std::fs;
use std::path::Path;
use std::sync::atomic::Ordering;
use std::sync::Arc;

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Json};
use redb::Database;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{load_profile, ranked, save_profile, AppState, EconomyProfile};

const DAY_MS: i64 = 24 * 60 * 60 * 1000;

#[derive(Debug, Clone, Deserialize)]
pub struct Reward {
    pub win: i32,
    pub loss: i32,
    #[serde(default, rename = "dailyLimit")]
    pub daily_limit: u32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Mission {
    pub id: String,
    #[serde(default)]
    pub title: String,
    /// always / matches / wins / gachaRolls / skins / skills（skills はサーバーが数えられないので、申告を信じる）
    pub kind: String,
    pub goal: u32,
    pub reward: i32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EconomyConfig {
    #[serde(rename = "matchReward")]
    pub match_reward: Reward,
    #[serde(rename = "rankedReward")]
    pub ranked_reward: Reward,
    pub missions: Vec<Mission>,
}

pub fn load_economy_config(data_dir: &Path) -> Result<EconomyConfig, String> {
    let path = data_dir.join("v2").join("economy.json");
    let text = fs::read_to_string(&path).map_err(|e| format!("v2/economy.json: {e}"))?;
    let cfg: EconomyConfig = serde_json::from_str(&text).map_err(|e| format!("v2/economy.json: {e}"))?;
    let known = ["always", "matches", "wins", "gachaRolls", "skins", "skills"];
    for m in &cfg.missions {
        if !known.contains(&m.kind.as_str()) {
            return Err(format!("v2/economy.json: ミッション {} の kind「{}」は使えません", m.id, m.kind));
        }
        if m.reward < 0 || m.goal == 0 {
            return Err(format!("v2/economy.json: ミッション {} の goal は1以上、reward は0以上にしてください", m.id));
        }
    }
    if cfg.match_reward.win < 0 || cfg.match_reward.loss < 0 || cfg.ranked_reward.win < 0 || cfg.ranked_reward.loss < 0 {
        return Err("v2/economy.json: 報酬は0以上にしてください".into());
    }
    Ok(cfg)
}

/// 画面に返すお財布（userId 以外）
pub fn wallet_value(state: &AppState, p: &EconomyProfile) -> Value {
    let today = (state.clock)().div_euclid(DAY_MS);
    let used = if p.match_reward_day == today { p.match_reward_count } else { 0 };
    json!({
        "coins": p.coins,
        "points": p.points,
        "pityCount": p.pity_count,
        "ownedSkins": p.owned_skins,
        "matches": p.matches,
        "wins": p.wins,
        "gachaRolls": p.gacha_rolls,
        "claimedMissions": p.claimed_missions,
        "migrated": p.migrated,
        "matchRewardsLeft": state.economy.match_reward.daily_limit.saturating_sub(used),
    })
}

/// ランクマッチの決着で、両方にコインを渡す（db の鍵を持ったまま呼ぶ）。渡したコイン
pub fn credit_ranked(state: &AppState, db: &Database, user_id: &str, won: bool) -> i32 {
    let mut p = load_profile(db, user_id);
    let r = &state.economy.ranked_reward;
    let amount = if won { r.win } else { r.loss };
    p.coins += amount;
    p.matches += 1;
    p.wins += u32::from(won);
    if let Err(e) = save_profile(db, &p) {
        eprintln!("wallet: ranked reward save failed: {e}");
        return 0;
    }
    amount
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthOnly {
    user_id: String,
    secret: String,
}

pub async fn api_wallet(State(state): State<Arc<AppState>>, Json(req): Json<AuthOnly>) -> impl IntoResponse {
    state.requests_total.fetch_add(1, Ordering::Relaxed);
    let acc = match ranked::authenticate(&state, &req.user_id, &req.secret) {
        Ok(a) => a,
        Err(e) => return e,
    };
    let db = state.db.lock().unwrap();
    let p = load_profile(&db, &acc.user_id);
    let mut v = wallet_value(&state, &p);
    v["ok"] = json!(true);
    (StatusCode::OK, Json(v))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrateReq {
    user_id: String,
    secret: String,
    #[serde(default)]
    owned_skins: Vec<String>,
}

/// 端末の所持品をサーバーに移す（1回だけ）。ショップにある品だけ受け取り、ランク報酬は受け取らない（シーズン報酬だけでもらえる）。
/// コイン・交換pt は移さない（サーバーの値のまま）
pub async fn api_migrate(State(state): State<Arc<AppState>>, Json(req): Json<MigrateReq>) -> impl IntoResponse {
    state.requests_total.fetch_add(1, Ordering::Relaxed);
    let acc = match ranked::authenticate(&state, &req.user_id, &req.secret) {
        Ok(a) => a,
        Err(e) => return e,
    };
    let db = state.db.lock().unwrap();
    let mut p = load_profile(&db, &acc.user_id);
    if p.migrated {
        return (StatusCode::OK, Json(json!({ "ok": false, "reason": "この端末の所持品は、もう移してあります" })));
    }
    let mut added = Vec::new();
    for id in req.owned_skins.iter().take(500) {
        let known = state.shop_items.iter().any(|x| &x.0 == id) || state.default_skins.contains(id);
        if known && !p.owned_skins.contains(id) {
            p.owned_skins.push(id.clone());
            added.push(id.clone());
        }
    }
    p.migrated = true;
    if let Err(e) = save_profile(&db, &p) {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "ok": false, "reason": e })));
    }
    let mut v = wallet_value(&state, &p);
    v["ok"] = json!(true);
    v["added"] = json!(added);
    (StatusCode::OK, Json(v))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchRewardReq {
    user_id: String,
    secret: String,
    won: bool,
}

/// CPU対戦・同じ端末・合言葉対戦の報酬（端末の申告）。1日の上限を超えたら、コインは増えない（試合数は数える）
pub async fn api_match_reward(State(state): State<Arc<AppState>>, Json(req): Json<MatchRewardReq>) -> impl IntoResponse {
    state.requests_total.fetch_add(1, Ordering::Relaxed);
    let acc = match ranked::authenticate(&state, &req.user_id, &req.secret) {
        Ok(a) => a,
        Err(e) => return e,
    };
    let today = (state.clock)().div_euclid(DAY_MS);
    let db = state.db.lock().unwrap();
    let mut p = load_profile(&db, &acc.user_id);
    if p.match_reward_day != today {
        p.match_reward_day = today;
        p.match_reward_count = 0;
    }
    let r = &state.economy.match_reward;
    let granted = if p.match_reward_count < r.daily_limit {
        p.match_reward_count += 1;
        if req.won { r.win } else { r.loss }
    } else {
        0
    };
    p.coins += granted;
    p.matches += 1;
    p.wins += u32::from(req.won);
    if let Err(e) = save_profile(&db, &p) {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "ok": false, "reason": e })));
    }
    let mut v = wallet_value(&state, &p);
    v["ok"] = json!(true);
    v["granted"] = json!(granted);
    (StatusCode::OK, Json(v))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MissionReq {
    user_id: String,
    secret: String,
    mission_id: String,
}

pub async fn api_mission(State(state): State<Arc<AppState>>, Json(req): Json<MissionReq>) -> impl IntoResponse {
    state.requests_total.fetch_add(1, Ordering::Relaxed);
    let acc = match ranked::authenticate(&state, &req.user_id, &req.secret) {
        Ok(a) => a,
        Err(e) => return e,
    };
    let Some(m) = state.economy.missions.iter().find(|m| m.id == req.mission_id).cloned() else {
        return (StatusCode::OK, Json(json!({ "ok": false, "reason": "そのミッションはありません" })));
    };
    let db = state.db.lock().unwrap();
    let mut p = load_profile(&db, &acc.user_id);
    if p.claimed_missions.contains(&m.id) {
        return (StatusCode::OK, Json(json!({ "ok": false, "reason": "もう受け取っています" })));
    }
    let progress = match m.kind.as_str() {
        "matches" => Some(p.matches),
        "wins" => Some(p.wins),
        "gachaRolls" => Some(p.gacha_rolls),
        "skins" => Some(p.owned_skins.len() as u32),
        _ => None, // always・skills はサーバーが数えられない
    };
    if let Some(cur) = progress {
        if cur < m.goal {
            return (
                StatusCode::OK,
                Json(json!({ "ok": false, "reason": format!("まだ達成していません（{}/{}）", cur, m.goal) })),
            );
        }
    }
    p.coins += m.reward;
    p.claimed_missions.push(m.id.clone());
    if let Err(e) = save_profile(&db, &p) {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "ok": false, "reason": e })));
    }
    let mut v = wallet_value(&state, &p);
    v["ok"] = json!(true);
    v["granted"] = json!(m.reward);
    (StatusCode::OK, Json(v))
}
