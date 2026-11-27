#![forbid(unsafe_code)]

use std::collections::{HashMap, VecDeque};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::time::{Duration, Instant};

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::sse::{Event as SseEvent, KeepAlive, Sse};
use axum::response::{IntoResponse, Json};
use axum::routing::{get, post};
use axum::Router;
use futures_util::{SinkExt, StreamExt};
use redb::{Database, TableDefinition};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::sync::broadcast;
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;

use castlefield_core::ai::{run_cpu_turn, CpuStrategy};
use castlefield_core::data::{
    parse_map_str, CardDef, CastleDef, DeckDef, GameConfig, GameSetup, MonsterDef, RarityDef,
    RulesDef, StageDef, UpgradeDef, WeatherDef,
};
use castlefield_core::events::GameEvent;
use castlefield_core::game::Game;
use castlefield_core::json::parse_json;
use castlefield_core::model::{GameStateView, PlayTarget};
use castlefield_core::rng::Mulberry32;

const PROFILES_TABLE: TableDefinition<&str, &str> = TableDefinition::new("profiles");
const RING_CAP: usize = 200;

fn state_to_value(view: &GameStateView) -> Value {
    serde_json::from_str(&view.to_json_string()).unwrap_or(Value::Null)
}

fn event_to_value(ev: &GameEvent) -> Value {
    serde_json::from_str(&ev.to_json().to_json_string()).unwrap_or(Value::Null)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SequencedMsg {
    pub seq: u64,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EconomyProfile {
    pub user_id: String,
    pub coins: i32,
    pub points: i32,
    pub pity_count: u32,
    pub owned_skins: Vec<String>,
}

impl Default for EconomyProfile {
    fn default() -> Self {
        Self {
            user_id: "guest".into(),
            coins: 2400,
            points: 350,
            pity_count: 0,
            owned_skins: vec!["castle-blue".into(), "infantry-blue".into(), "card-back".into()],
        }
    }
}

pub struct Room {
    pub game: Game,
    pub seats: HashMap<String, String>,
    pub cpu_seats: Vec<String>,
    pub seq: u64,
    pub ring: VecDeque<SequencedMsg>,
    pub tx: broadcast::Sender<SequencedMsg>,
    pub ai_rng: Mulberry32,
}

impl Room {
    fn push_event(&mut self, event: GameEvent) {
        self.seq += 1;
        let msg = SequencedMsg {
            seq: self.seq,
            kind: "event".into(),
            event: Some(event_to_value(&event)),
            state: None,
        };
        if self.ring.len() >= RING_CAP {
            self.ring.pop_front();
        }
        self.ring.push_back(msg.clone());
        let _ = self.tx.send(msg);
    }

    fn push_events(&mut self, events: Vec<GameEvent>) {
        for e in events {
            self.push_event(e);
        }
    }
}

pub struct AppState {
    pub started_at: Instant,
    pub base_config: GameConfig,
    pub shop_items: Vec<(String, String, String, i32)>,
    pub rooms: RwLock<HashMap<String, Arc<Mutex<Room>>>>,
    pub tokens: RwLock<HashMap<String, (String, String)>>,
    pub db: Mutex<Database>,
    pub next_token_seq: AtomicU64,
    pub requests_total: AtomicU64,
}

pub fn load_config_from_dir(data_dir: &Path) -> Result<(GameConfig, Vec<(String, String, String, i32)>), String> {
    let read = |f: &str| fs::read_to_string(data_dir.join(f)).map_err(|e| format!("{f}: {e}"));
    let cards = parse_map_str(&read("cards.json")?, CardDef::from_json)?;
    let rules_json = parse_json(&read("rules.json")?)?;
    let mut rules = RulesDef::from_json(&rules_json);
    rules.mulligan = false;
    let monsters = parse_map_str(&read("monsters.json")?, MonsterDef::from_json)?;
    let upgrades = parse_map_str(&read("upgrades.json")?, UpgradeDef::from_json)?;
    let castles = parse_map_str(&read("castles.json")?, CastleDef::from_json)?;
    let decks = parse_map_str(&read("decks.json")?, DeckDef::from_json)?;
    let rarities = parse_map_str(&read("rarities.json")?, RarityDef::from_json)?;
    let stages = parse_map_str(&read("stages.json")?, StageDef::from_json)?;
    let weather = parse_map_str(&read("weather.json")?, WeatherDef::from_json)?;

    let shop_val: Value = serde_json::from_str(&read("shop.json")?).unwrap_or(json!({}));
    let mut shop_items = Vec::new();
    if let Some(map) = shop_val.get("items").and_then(|v| v.as_object()) {
        for (id, item) in map {
            let name = item.get("name").and_then(|v| v.as_str()).unwrap_or(id).to_string();
            let rarity = item.get("rarity").and_then(|v| v.as_str()).unwrap_or("common").to_string();
            let price = item.get("price").and_then(|v| v.as_i64()).unwrap_or(300) as i32;
            shop_items.push((id.clone(), name, rarity, price));
        }
    }

    let cfg = GameConfig {
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
        seed: 20261127,
    };
    Ok((cfg, shop_items))
}

pub fn create_state(data_dir: &Path, db_path: &Path) -> Result<Arc<AppState>, String> {
    if let Some(parent) = db_path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let db = Database::create(db_path).map_err(|e| format!("redb open failed: {e}"))?;
    {
        let write_txn = db.begin_write().map_err(|e| e.to_string())?;
        {
            let _ = write_txn.open_table(PROFILES_TABLE).map_err(|e| e.to_string())?;
        }
        write_txn.commit().map_err(|e| e.to_string())?;
    }
    let (base_config, shop_items) = load_config_from_dir(data_dir)?;
    Ok(Arc::new(AppState {
        started_at: Instant::now(),
        base_config,
        shop_items,
        rooms: RwLock::new(HashMap::new()),
        tokens: RwLock::new(HashMap::new()),
        db: Mutex::new(db),
        next_token_seq: AtomicU64::new(1),
        requests_total: AtomicU64::new(0),
    }))
}

pub fn build_router(state: Arc<AppState>, repo_root: Option<PathBuf>) -> Router {
    let mut router = Router::new()
        .route("/healthz", get(healthz))
        .route("/readyz", get(readyz))
        .route("/metrics", get(metrics))
        .route("/api/join", post(api_join))
        .route("/api/action", post(api_action))
        .route("/api/stream", get(api_stream))
        .route("/api/ws", get(api_ws))
        .route("/api/economy/profile", get(api_economy_profile))
        .route("/api/economy/gacha", post(api_economy_gacha))
        .route("/api/economy/buy", post(api_economy_buy))
        .layer(CorsLayer::permissive())
        .with_state(state);

    if let Some(root) = repo_root {
        let data_dir = root.join("data");
        let assets_dir = root.join("assets");
        let dist_dir = root.join("web").join("dist");
        if data_dir.exists() {
            router = router.nest_service("/data", ServeDir::new(data_dir));
        }
        if assets_dir.exists() {
            router = router.nest_service("/assets", ServeDir::new(assets_dir));
        }
        if dist_dir.exists() {
            router = router.fallback_service(ServeDir::new(dist_dir));
        }
    }
    router
}

async fn healthz(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    state.requests_total.fetch_add(1, Ordering::Relaxed);
    Json(json!({ "ok": true, "uptimeSec": state.started_at.elapsed().as_secs() }))
}

async fn readyz(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    state.requests_total.fetch_add(1, Ordering::Relaxed);
    let db_ok = state.db.lock().map(|db| db.begin_read().is_ok()).unwrap_or(false);
    let status = if db_ok { StatusCode::OK } else { StatusCode::SERVICE_UNAVAILABLE };
    (status, Json(json!({ "ok": db_ok })))
}

async fn metrics(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let rooms_count = state.rooms.read().map(|r| r.len()).unwrap_or(0);
    let reqs = state.requests_total.load(Ordering::Relaxed);
    format!("castlefield_rooms {rooms_count}\ncastlefield_requests_total {reqs}\n")
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct JoinReq {
    passphrase: String,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    cpu: Option<bool>,
}

async fn api_join(State(state): State<Arc<AppState>>, Json(req): Json<JoinReq>) -> impl IntoResponse {
    state.requests_total.fetch_add(1, Ordering::Relaxed);
    let pass = req.passphrase.trim().to_string();
    if pass.is_empty() {
        return (StatusCode::BAD_REQUEST, Json(json!({ "ok": false, "reason": "合言葉を入力してください" })));
    }

    let room_arc = {
        let mut rooms = state.rooms.write().unwrap();
        if let Some(existing) = rooms.get(&pass) {
            existing.clone()
        } else {
            let mut cfg = state.base_config.clone();
            let seq = state.next_token_seq.load(Ordering::Relaxed) as u32;
            cfg.seed = cfg.seed.wrapping_add(seq.wrapping_mul(97));
            cfg.rules.deck_mode = "cost".into();
            let game = match Game::new(cfg) {
                Ok(g) => g,
                Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "ok": false, "reason": e }))),
            };
            let (tx, _) = broadcast::channel(64);
            let r = Arc::new(Mutex::new(Room {
                game,
                seats: HashMap::new(),
                cpu_seats: Vec::new(),
                seq: 0,
                ring: VecDeque::with_capacity(RING_CAP),
                tx,
                ai_rng: Mulberry32::new(777 ^ seq),
            }));
            rooms.insert(pass.clone(), r.clone());
            r
        }
    };

    let (seat_id, view_val, started) = {
        let mut room = room_arc.lock().unwrap();
        let seat_id = if !room.seats.contains_key("p1") {
            "p1".to_string()
        } else if !room.seats.contains_key("p2") {
            "p2".to_string()
        } else {
            return (StatusCode::OK, Json(json!({ "ok": false, "reason": "部屋が満員です" })));
        };
        let pname = req.name.clone().unwrap_or_else(|| format!("プレイヤー{}", &seat_id[1..]));
        room.seats.insert(seat_id.clone(), pname);

        if req.cpu.unwrap_or(false) && !room.seats.contains_key("p2") {
            room.seats.insert("p2".into(), "CPU".into());
            room.cpu_seats.push("p2".into());
        }

        let mut started = false;
        if room.seats.len() >= 2 && room.game.phase() == "ready" {
            let evs = room.game.start();
            room.push_events(evs);
            started = true;
        }
        let view = state_to_value(&room.game.get_state(Some(&seat_id)));
        (seat_id, view, started)
    };

    let tok_num = state.next_token_seq.fetch_add(1, Ordering::Relaxed);
    let token = format!("cf_tok_{tok_num}_{seat_id}");
    state.tokens.write().unwrap().insert(token.clone(), (pass, seat_id.clone()));

    (
        StatusCode::OK,
        Json(json!({
            "ok": true,
            "token": token,
            "playerId": seat_id,
            "started": started,
            "state": view_val,
        })),
    )
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ActionReq {
    token: String,
    method: String,
    #[serde(default)]
    args: Vec<Value>,
}

fn action_to_value(r: castlefield_core::model::ActionResult) -> Value {
    serde_json::from_str(&r.to_json_string()).unwrap_or(json!({ "ok": false }))
}

fn parse_target_opt(v: Option<&Value>) -> Option<PlayTarget> {
    v.and_then(|x| PlayTarget::from_json_str(&x.to_string()))
}

async fn api_action(State(state): State<Arc<AppState>>, Json(req): Json<ActionReq>) -> impl IntoResponse {
    state.requests_total.fetch_add(1, Ordering::Relaxed);
    let Some((pass, seat_id)) = state.tokens.read().unwrap().get(&req.token).cloned() else {
        return (StatusCode::FORBIDDEN, Json(json!({ "ok": false, "reason": "部屋に入っていません" })));
    };
    let Some(room_arc) = state.rooms.read().unwrap().get(&pass).cloned() else {
        return (StatusCode::NOT_FOUND, Json(json!({ "ok": false, "reason": "部屋が見つかりません" })));
    };

    let mut room = room_arc.lock().unwrap();
    let result = match req.method.as_str() {
        "start" => {
            let evs = room.game.start();
            room.push_events(evs);
            json!({ "ok": true })
        }
        "playCard" => {
            if room.game.current_player_id() != seat_id {
                return (StatusCode::OK, Json(json!({ "ok": false, "reason": "あなたの番ではありません" })));
            }
            let cid = req.args.first().and_then(|v| v.as_str()).unwrap_or("");
            let tgt = parse_target_opt(req.args.get(1));
            let r = room.game.play_card(cid, tgt.as_ref());
            let evs = room.game.drain_events();
            room.push_events(evs);
            action_to_value(r)
        }
        "defend" => {
            let cid = req.args.first().and_then(|v| v.as_str()).unwrap_or("");
            let tgt = parse_target_opt(req.args.get(1));
            let r = room.game.defend(cid, tgt.as_ref());
            let evs = room.game.drain_events();
            room.push_events(evs);
            action_to_value(r)
        }
        "passDefense" => {
            let r = room.game.pass_defense();
            let evs = room.game.drain_events();
            room.push_events(evs);
            action_to_value(r)
        }
        "fuse" => {
            if room.game.current_player_id() != seat_id {
                return (StatusCode::OK, Json(json!({ "ok": false, "reason": "あなたの番ではありません" })));
            }
            let a = req.args.first().and_then(|v| v.as_str()).unwrap_or("");
            let b = req.args.get(1).and_then(|v| v.as_str()).unwrap_or("");
            let r = room.game.fuse(a, b);
            let evs = room.game.drain_events();
            room.push_events(evs);
            action_to_value(r)
        }
        "buyUpgrade" => {
            if room.game.current_player_id() != seat_id {
                return (StatusCode::OK, Json(json!({ "ok": false, "reason": "あなたの番ではありません" })));
            }
            let uid = req.args.first().and_then(|v| v.as_str()).unwrap_or("");
            let r = room.game.buy_upgrade(uid);
            let evs = room.game.drain_events();
            room.push_events(evs);
            action_to_value(r)
        }
        "discard" => {
            if room.game.current_player_id() != seat_id {
                return (StatusCode::OK, Json(json!({ "ok": false, "reason": "あなたの番ではありません" })));
            }
            let ids: Vec<String> = req.args.first().and_then(|v| serde_json::from_value(v.clone()).ok()).unwrap_or_default();
            let r = room.game.discard(&ids);
            let evs = room.game.drain_events();
            room.push_events(evs);
            action_to_value(r)
        }
        "endTurn" => {
            if room.game.current_player_id() != seat_id {
                return (StatusCode::OK, Json(json!({ "ok": false, "reason": "あなたの番ではありません" })));
            }
            let r = room.game.end_turn();
            let evs = room.game.drain_events();
            room.push_events(evs);
            action_to_value(r)
        }
        "surrender" => {
            let r = room.game.surrender(&seat_id);
            let evs = room.game.drain_events();
            room.push_events(evs);
            action_to_value(r)
        }
        _ => json!({ "ok": false, "reason": "未対応の操作です" }),
    };

    let cpu_list = room.cpu_seats.clone();
    for _ in 0..4 {
        let cur = room.game.current_player_id().to_string();
        if room.game.phase() == "gameOver" || !cpu_list.contains(&cur) {
            break;
        }
        let mut rng = room.ai_rng.clone();
        run_cpu_turn(&mut room.game, &cur, CpuStrategy::Smart, &mut rng);
        room.ai_rng = rng;
        let evs = room.game.drain_events();
        room.push_events(evs);
    }

    let state_view = state_to_value(&room.game.get_state(Some(&seat_id)));
    (StatusCode::OK, Json(json!({ "result": result, "state": state_view, "seq": room.seq })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StreamQuery {
    token: String,
    #[serde(default)]
    last_seq: u64,
}

async fn api_stream(State(state): State<Arc<AppState>>, Query(q): Query<StreamQuery>) -> impl IntoResponse {
    let Some((pass, seat_id)) = state.tokens.read().unwrap().get(&q.token).cloned() else {
        return (StatusCode::FORBIDDEN, "invalid token").into_response();
    };
    let Some(room_arc) = state.rooms.read().unwrap().get(&pass).cloned() else {
        return (StatusCode::NOT_FOUND, "room missing").into_response();
    };

    let (init_view, mut rx) = {
        let room = room_arc.lock().unwrap();
        (state_to_value(&room.game.get_state(Some(&seat_id))), room.tx.subscribe())
    };

    let stream = async_stream_sse(init_view, &mut rx);
    Sse::new(stream)
        .keep_alive(KeepAlive::new().interval(Duration::from_secs(15)).text("ping"))
        .into_response()
}

fn async_stream_sse(
    init_view: Value,
    rx: &mut broadcast::Receiver<SequencedMsg>,
) -> impl futures_util::Stream<Item = Result<SseEvent, std::convert::Infallible>> {
    let rx_owned = rx.resubscribe();
    let init_payload = json!({ "kind": "state", "state": init_view }).to_string();
    futures_util::stream::once(async move {
        Ok(SseEvent::default().data(init_payload))
    })
    .chain(futures_util::stream::unfold(rx_owned, |mut r| async move {
        match r.recv().await {
            Ok(msg) => {
                let data = serde_json::to_string(&msg).unwrap_or_default();
                Some((Ok(SseEvent::default().data(data)), r))
            }
            Err(_) => None,
        }
    }))
}

async fn api_ws(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
    Query(q): Query<StreamQuery>,
) -> impl IntoResponse {
    let Some((pass, seat_id)) = state.tokens.read().unwrap().get(&q.token).cloned() else {
        return (StatusCode::FORBIDDEN, "invalid token").into_response();
    };
    let Some(room_arc) = state.rooms.read().unwrap().get(&pass).cloned() else {
        return (StatusCode::NOT_FOUND, "room missing").into_response();
    };
    ws.on_upgrade(move |socket| handle_ws(socket, room_arc, seat_id, q.last_seq))
}

async fn handle_ws(mut socket: WebSocket, room_arc: Arc<Mutex<Room>>, seat_id: String, last_seq: u64) {
    let (missed, snapshot_msg, mut rx) = {
        let room = room_arc.lock().unwrap();
        let oldest_seq = room.ring.front().map(|m| m.seq).unwrap_or(room.seq + 1);
        let missed: Vec<SequencedMsg> = if last_seq > 0 && last_seq + 1 >= oldest_seq {
            room.ring.iter().filter(|m| m.seq > last_seq).cloned().collect()
        } else {
            Vec::new()
        };
        let snap = SequencedMsg {
            seq: room.seq,
            kind: "state".into(),
            event: None,
            state: Some(state_to_value(&room.game.get_state(Some(&seat_id)))),
        };
        (missed, snap, room.tx.subscribe())
    };

    if last_seq == 0 || missed.is_empty() {
        let txt = serde_json::to_string(&snapshot_msg).unwrap_or_default();
        if socket.send(Message::Text(txt.into())).await.is_err() {
            return;
        }
    }
    for m in missed {
        let txt = serde_json::to_string(&m).unwrap_or_default();
        if socket.send(Message::Text(txt.into())).await.is_err() {
            return;
        }
    }

    let mut ping_iv = tokio::time::interval(Duration::from_secs(15));
    loop {
        tokio::select! {
            _ = ping_iv.tick() => {
                if socket.send(Message::Ping(vec![1, 2, 3].into())).await.is_err() {
                    break;
                }
            }
            recv = rx.recv() => {
                match recv {
                    Ok(msg) => {
                        let txt = serde_json::to_string(&msg).unwrap_or_default();
                        if socket.send(Message::Text(txt.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => {
                        let snap = {
                            let room = room_arc.lock().unwrap();
                            SequencedMsg {
                                seq: room.seq,
                                kind: "state".into(),
                                event: None,
                                state: Some(state_to_value(&room.game.get_state(Some(&seat_id)))),
                            }
                        };
                        let txt = serde_json::to_string(&snap).unwrap_or_default();
                        if socket.send(Message::Text(txt.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
            incoming = socket.next() => {
                match incoming {
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(Message::Pong(_))) => {}
                    Some(Ok(_)) => {}
                    Some(Err(_)) => break,
                }
            }
        }
    }
}

fn load_profile(db: &Database, user_id: &str) -> EconomyProfile {
    let Ok(read_txn) = db.begin_read() else {
        return EconomyProfile { user_id: user_id.into(), ..Default::default() };
    };
    let Ok(table) = read_txn.open_table(PROFILES_TABLE) else {
        return EconomyProfile { user_id: user_id.into(), ..Default::default() };
    };
    if let Ok(Some(val)) = table.get(user_id) {
        if let Ok(p) = serde_json::from_str::<EconomyProfile>(val.value()) {
            return p;
        }
    }
    EconomyProfile { user_id: user_id.into(), ..Default::default() }
}

fn save_profile(db: &Database, profile: &EconomyProfile) -> Result<(), String> {
    let write_txn = db.begin_write().map_err(|e| e.to_string())?;
    {
        let mut table = write_txn.open_table(PROFILES_TABLE).map_err(|e| e.to_string())?;
        let json_str = serde_json::to_string(profile).map_err(|e| e.to_string())?;
        table.insert(profile.user_id.as_str(), json_str.as_str()).map_err(|e| e.to_string())?;
    }
    write_txn.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UserQuery {
    #[serde(default = "default_guest")]
    user: String,
}
fn default_guest() -> String { "guest".into() }

async fn api_economy_profile(State(state): State<Arc<AppState>>, Query(q): Query<UserQuery>) -> impl IntoResponse {
    let db = state.db.lock().unwrap();
    let prof = load_profile(&db, &q.user);
    Json(json!({ "ok": true, "profile": prof }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GachaReq {
    #[serde(default = "default_guest")]
    user: String,
    count: u32,
}

async fn api_economy_gacha(State(state): State<Arc<AppState>>, Json(req): Json<GachaReq>) -> impl IntoResponse {
    let count = if req.count == 10 { 10 } else { 1 };
    let cost = if count == 10 { 900 } else { 100 };
    let db = state.db.lock().unwrap();
    let mut prof = load_profile(&db, &req.user);
    if prof.coins < cost {
        return (StatusCode::OK, Json(json!({ "ok": false, "reason": "コインが足りません" })));
    }
    prof.coins -= cost;
    let mut rng = Mulberry32::new((state.started_at.elapsed().as_nanos() as u32) ^ (prof.pity_count + 1));
    let mut results = Vec::new();
    for i in 0..count {
        prof.pity_count += 1;
        let force_epic = prof.pity_count >= 40;
        let force_rare = count == 10 && i == 9;
        let mut candidates: Vec<&(String, String, String, i32)> = state.shop_items.iter().collect();
        if force_epic {
            let epics: Vec<_> = candidates.iter().copied().filter(|x| x.2 == "epic" || x.2 == "legendary").collect();
            if !epics.is_empty() {
                candidates = epics;
            }
            prof.pity_count = 0;
        } else if force_rare {
            let rares: Vec<_> = candidates.iter().copied().filter(|x| x.2 != "common").collect();
            if !rares.is_empty() {
                candidates = rares;
            }
        }
        let picked = if candidates.is_empty() {
            ("unit_crimson".into(), "紅蓮の兵".into(), "uncommon".into(), 300)
        } else {
            candidates[rng.next_usize(candidates.len())].clone()
        };
        if picked.2 == "epic" || picked.2 == "legendary" {
            prof.pity_count = 0;
        }
        let is_new = !prof.owned_skins.contains(&picked.0);
        if is_new {
            prof.owned_skins.push(picked.0.clone());
        } else {
            prof.points += 25;
        }
        results.push(json!({
            "id": picked.0,
            "name": picked.1,
            "rarity": picked.2,
            "isNew": is_new,
        }));
    }
    let _ = save_profile(&db, &prof);
    (StatusCode::OK, Json(json!({ "ok": true, "results": results, "profile": prof })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BuyReq {
    #[serde(default = "default_guest")]
    user: String,
    item_id: String,
    #[serde(default)]
    use_points: bool,
}

async fn api_economy_buy(State(state): State<Arc<AppState>>, Json(req): Json<BuyReq>) -> impl IntoResponse {
    let db = state.db.lock().unwrap();
    let mut prof = load_profile(&db, &req.user);
    if prof.owned_skins.contains(&req.item_id) {
        return (StatusCode::OK, Json(json!({ "ok": false, "reason": "すでに所持しています" })));
    }
    let Some((_, _, _, base_price)) = state.shop_items.iter().find(|x| x.0 == req.item_id) else {
        return (StatusCode::OK, Json(json!({ "ok": false, "reason": "商品が見つかりません" })));
    };
    if req.use_points {
        let pt_price = (*base_price / 2).max(50);
        if prof.points < pt_price {
            return (StatusCode::OK, Json(json!({ "ok": false, "reason": "ポイントが足りません" })));
        }
        prof.points -= pt_price;
    } else {
        if prof.coins < *base_price {
            return (StatusCode::OK, Json(json!({ "ok": false, "reason": "コインが足りません" })));
        }
        prof.coins -= *base_price;
    }
    prof.owned_skins.push(req.item_id);
    let _ = save_profile(&db, &prof);
    (StatusCode::OK, Json(json!({ "ok": true, "profile": prof })))
}
