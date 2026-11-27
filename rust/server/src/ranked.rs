//! ランクマッチ（v2 Phase 8）：ゲストの本人確認・待ち行列・結果の反映・ランキング。
//! - 点数（MMR・RP）はサーバーが確定した試合の結果からだけ変わる。クライアントから点数を送る口はない
//! - 本人確認は `POST /api/account/guest` でサーバーが発行する userId と secret（ゲスト。端末に保存する）
//! - 待ち行列はメモリだけ（サーバーを再起動すると空になる）。成立した試合の部屋はふつうの部屋と同じ仕組みで動く
//! - 数値は `data/ranks.json`・`data/seasons.json`（castlefield_core::rank が読む）

use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Json};
use redb::{Database, ReadableTable, TableDefinition};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use castlefield_core::json::parse_json;
use castlefield_core::rank::{DisplayRank, RankConfig, RankEntry, SeasonConfig};

use crate::{state_to_value, AppState, Room};

pub(crate) const ACCOUNTS_TABLE: TableDefinition<&str, &str> = TableDefinition::new("accounts");
pub(crate) const RANKED_TABLE: TableDefinition<&str, &str> = TableDefinition::new("ranked");

/// 予想しにくい16進の文字列（鍵・ID用）。/dev/urandom が読めなければ、時刻と RandomState の混ぜ合わせ
pub fn random_hex(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    let ok = fs::File::open("/dev/urandom").and_then(|mut f| f.read_exact(&mut buf)).is_ok();
    if !ok {
        use std::collections::hash_map::RandomState;
        use std::hash::{BuildHasher, Hasher};
        for (i, chunk) in buf.chunks_mut(8).enumerate() {
            let mut h = RandomState::new().build_hasher();
            h.write_u128(SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0));
            h.write_usize(i);
            let v = h.finish().to_le_bytes();
            chunk.copy_from_slice(&v[..chunk.len()]);
        }
    }
    buf.iter().map(|b| format!("{b:02x}")).collect()
}

pub fn system_now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

pub struct RankedConfig {
    pub ranks: RankConfig,
    pub seasons: SeasonConfig,
    /// 相手が操作しないまま、この時間がたったら、待っている人は勝ちを申し出られる（ranks.json の ranked.idleTurnMs）
    pub idle_turn_ms: i64,
    /// 階級 → シーズン報酬の品（seasons.json の rewards。アイコンフレーム・カード裏面）
    pub rewards: HashMap<String, Vec<String>>,
    /// 報酬をもらうのに要る、そのシーズンのランク戦の試合数（認定戦を含む）
    pub min_matches_for_reward: u32,
}

pub fn load_ranked_config(data_dir: &std::path::Path) -> Result<RankedConfig, String> {
    let read = |f: &str| fs::read_to_string(data_dir.join(f)).map_err(|e| format!("{f}: {e}"));
    let ranks_v = parse_json(&read("ranks.json")?)?;
    let ranks = RankConfig::from_json(&ranks_v)?;
    let seasons_v = parse_json(&read("seasons.json")?)?;
    let seasons = SeasonConfig::from_json(&seasons_v)?;
    let mut rewards = HashMap::new();
    if let Some(map) = seasons_v.get("rewards").and_then(|v| v.as_object()) {
        for (tier, rw) in map {
            let items: Vec<String> = ["iconFrame", "cardBack"]
                .iter()
                .filter_map(|k| rw.get(k).and_then(|v| v.as_str()).map(String::from))
                .collect();
            rewards.insert(tier.clone(), items);
        }
    }
    let min_matches_for_reward = seasons_v.get("minMatchesForReward").and_then(|v| v.as_u32()).unwrap_or(5);
    let idle_turn_ms = ranks_v
        .get("ranked")
        .and_then(|r| r.get("idleTurnMs"))
        .and_then(|v| v.as_i64())
        .unwrap_or(180_000);
    Ok(RankedConfig { ranks, seasons, idle_turn_ms, rewards, min_matches_for_reward })
}

// ---------------------------------------------------------------------------
// 保存する形
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub user_id: String,
    pub secret: String,
    pub name: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StoredEntry {
    pub season: u32,
    pub mmr: i32,
    pub rp: i32,
    pub peak_rp: i32,
    pub matches: u32,
    pub wins: u32,
    pub placement_left: u32,
}

impl From<&RankEntry> for StoredEntry {
    fn from(e: &RankEntry) -> Self {
        Self { season: e.season, mmr: e.mmr, rp: e.rp, peak_rp: e.peak_rp, matches: e.matches, wins: e.wins, placement_left: e.placement_left }
    }
}
impl From<&StoredEntry> for RankEntry {
    fn from(e: &StoredEntry) -> Self {
        Self { season: e.season, mmr: e.mmr, rp: e.rp, peak_rp: e.peak_rp, matches: e.matches, wins: e.wins, placement_left: e.placement_left }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RankRecord {
    pub user_id: String,
    pub name: String,
    /// シーズンごとの成績（古い順）
    pub seasons: Vec<StoredEntry>,
    /// 最近のランク戦の相手（同じ相手から何度も RP を得すぎないため）：(相手の userId, 時刻)
    pub recent: Vec<(String, i64)>,
    /// 直近のランク戦の結果（結果画面用。MMR は入れない）
    pub last_change: Option<Value>,
    /// シーズン報酬を受け取ったシーズン
    #[serde(default)]
    pub claimed_seasons: Vec<u32>,
}

fn read_json<T: for<'de> Deserialize<'de>>(db: &Database, table: TableDefinition<&str, &str>, key: &str) -> Option<T> {
    let txn = db.begin_read().ok()?;
    let t = txn.open_table(table).ok()?;
    let v = t.get(key).ok()??;
    serde_json::from_str(v.value()).ok()
}

fn write_json<T: Serialize>(db: &Database, table: TableDefinition<&str, &str>, key: &str, value: &T) -> Result<(), String> {
    let txn = db.begin_write().map_err(|e| e.to_string())?;
    {
        let mut t = txn.open_table(table).map_err(|e| e.to_string())?;
        let s = serde_json::to_string(value).map_err(|e| e.to_string())?;
        t.insert(key, s.as_str()).map_err(|e| e.to_string())?;
    }
    txn.commit().map_err(|e| e.to_string())
}

fn all_records(db: &Database) -> Vec<RankRecord> {
    let Ok(txn) = db.begin_read() else { return Vec::new() };
    let Ok(t) = txn.open_table(RANKED_TABLE) else { return Vec::new() };
    let Ok(iter) = t.iter() else { return Vec::new() };
    iter.filter_map(|r| r.ok())
        .filter_map(|(_, v)| serde_json::from_str::<RankRecord>(v.value()).ok())
        .collect()
}

// ---------------------------------------------------------------------------
// 成績の計算（保存した記録 → 今のシーズンの成績）
// ---------------------------------------------------------------------------

/// 今のシーズンの成績（なければ、前のシーズンから引き継いで作る。保存はしない）
pub fn current_entry(cfg: &RankedConfig, rec: &RankRecord, season: u32) -> RankEntry {
    if let Some(e) = rec.seasons.iter().find(|e| e.season == season) {
        return e.into();
    }
    let prev: Option<RankEntry> = rec.seasons.iter().filter(|e| e.season < season).max_by_key(|e| e.season).map(|e| e.into());
    cfg.ranks.new_entry(&cfg.seasons, season, prev.as_ref())
}

fn set_entry(rec: &mut RankRecord, e: &RankEntry) {
    let s: StoredEntry = e.into();
    if let Some(slot) = rec.seasons.iter_mut().find(|x| x.season == e.season) {
        *slot = s;
    } else {
        rec.seasons.push(s);
        rec.seasons.sort_by_key(|x| x.season);
    }
}

fn rank_value(r: &DisplayRank) -> Value {
    serde_json::from_str(&r.to_json().to_json_string()).unwrap_or(Value::Null)
}

/// 認定戦が終わった人の中の順位（RP が上の人の数 + 1。同じ RP なら MMR で比べる）
fn position_of(records: &[RankRecord], cfg: &RankedConfig, season: u32, me: &RankEntry) -> u32 {
    let ahead = records
        .iter()
        .filter_map(|r| r.seasons.iter().find(|e| e.season == season))
        .filter(|e| e.placement_left == 0 && (e.rp > me.rp || (e.rp == me.rp && e.mmr > me.mmr)))
        .count();
    let _ = cfg;
    ahead as u32 + 1
}

pub fn summary_value(state: &AppState, rec: &RankRecord) -> Value {
    let cfg = &state.ranked;
    let now = (state.clock)();
    let (season, starts, ends) = cfg.seasons.season_at(now);
    let e = current_entry(cfg, rec, season);
    let placed = e.placement_left == 0;
    let db = state.db.lock().unwrap();
    let records = all_records(&db);
    drop(db);
    let pos = if placed { Some(position_of(&records, cfg, season, &e)) } else { None };
    json!({
        "season": season,
        "seasonStartsAt": starts,
        "seasonEndsAt": ends,
        "placed": placed,
        "placementLeft": e.placement_left,
        "placementTotal": cfg.ranks.placement_matches,
        "matches": e.matches,
        "wins": e.wins,
        "rank": if placed { rank_value(&cfg.ranks.display_rank(e.rp, pos)) } else { Value::Null },
        "peak": if placed { rank_value(&cfg.ranks.display_rank(e.peak_rp, None)) } else { Value::Null },
        "position": pos,
        "lastChange": rec.last_change.clone().unwrap_or(Value::Null),
    })
}

/// 2人の試合の結果を反映する（試合ごとに1回だけ呼ぶ）。返り値は userId → 結果画面用の変化
pub fn apply_match(state: &AppState, users: [(&str, bool); 2], match_id: &str) -> HashMap<String, Value> {
    let cfg = &state.ranked;
    let now = (state.clock)();
    let (season, _, _) = cfg.seasons.season_at(now);
    let db = state.db.lock().unwrap();
    let mut recs: Vec<RankRecord> = users
        .iter()
        .map(|(u, _)| {
            let mut r: RankRecord = read_json(&db, RANKED_TABLE, u).unwrap_or_default();
            r.user_id = (*u).into();
            if let Some(acc) = read_json::<Account>(&db, ACCOUNTS_TABLE, u) {
                r.name = acc.name;
            }
            r
        })
        .collect();
    let before: Vec<RankEntry> = recs.iter().map(|r| current_entry(cfg, r, season)).collect();
    let mut out = HashMap::new();
    for i in 0..2 {
        let j = 1 - i;
        let (uid, won) = users[i];
        let opp = users[j].0;
        let window = cfg.ranks.pair_window_ms;
        recs[i].recent.retain(|(_, at)| now - at <= window);
        let n = recs[i].recent.iter().filter(|(o, _)| o == opp).count() as u32;
        let ch = cfg.ranks.apply_result(&before[i], before[j].mmr, won, cfg.ranks.pair_scale(n));
        set_entry(&mut recs[i], &ch.entry);
        recs[i].recent.push((opp.to_string(), now));
        let placed_now = ch.entry.placement_left == 0;
        let rank_before = if ch.placement { None } else { Some(cfg.ranks.display_rank(ch.rp_before, None)) };
        let rank_after = if placed_now { Some(cfg.ranks.display_rank(ch.entry.rp, None)) } else { None };
        let (promoted, demoted) = match (&rank_before, &rank_after) {
            (Some(b), Some(a)) => (a.score() > b.score(), a.score() < b.score()),
            _ => (false, false),
        };
        let change = json!({
            "matchId": match_id,
            "result": if won { "win" } else { "loss" },
            "placement": ch.placement,
            "placementLeft": ch.entry.placement_left,
            "placedNow": ch.placement && placed_now,
            "rpDelta": if ch.placement { Value::Null } else { json!(ch.entry.rp - ch.rp_before) },
            "rpAfter": ch.entry.rp,
            "rankBefore": rank_before.as_ref().map(rank_value).unwrap_or(Value::Null),
            "rankAfter": rank_after.as_ref().map(rank_value).unwrap_or(Value::Null),
            "promoted": promoted,
            "demoted": demoted,
            "scaled": ch.scale < 1.0,
        });
        recs[i].last_change = Some(change.clone());
        out.insert(uid.to_string(), change);
    }
    for r in &recs {
        if let Err(e) = write_json(&db, RANKED_TABLE, &r.user_id, r) {
            eprintln!("ranked: save failed: {e}");
        }
    }
    out
}

// ---------------------------------------------------------------------------
// 待ち行列
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct QueueEntry {
    pub user_id: String,
    pub name: String,
    pub mmr: i32,
    pub joined_at: i64,
}

#[derive(Debug, Clone)]
pub enum MatchResult {
    Matched { room_key: String, token: String, player_id: String, at: i64 },
    Timeout,
}

#[derive(Default)]
pub struct Matchmaker {
    pub queue: Vec<QueueEntry>,
    pub results: HashMap<String, MatchResult>,
}

/// (userId, 席の鍵, 席)
type SeatKey = (String, String, String);

/// 成立した2人の部屋を作る（席の鍵は本人にだけ status で返す）
fn create_ranked_room(state: &AppState, a: &QueueEntry, b: &QueueEntry) -> Result<(String, [SeatKey; 2]), String> {
    let n = state.next_token_seq.fetch_add(1, Ordering::Relaxed);
    let match_id = format!("rm_{}_{}", n, random_hex(4));
    let room_key = format!("ranked:{match_id}");
    let mut cfg = state.base_config.clone();
    cfg.seed = (u32::from_str_radix(&random_hex(4), 16).unwrap_or(1)) | 1;
    cfg.rules.deck_mode = "cost".into();
    // 先攻・後攻はサーバーが決める（コイントス）
    let swap = cfg.seed & 2 == 2;
    let (first, second) = if swap { (b, a) } else { (a, b) };
    let game = castlefield_core::game::Game::new(cfg)?;
    let mut room = Room::new(game, n as u32);
    room.seats.insert("p1".into(), first.name.clone());
    room.seats.insert("p2".into(), second.name.clone());
    room.ranked = Some(crate::RankedMeta {
        match_id: match_id.clone(),
        users: [("p1".into(), first.user_id.clone()), ("p2".into(), second.user_id.clone())],
        applied: None,
    });
    let evs = room.game.start();
    room.push_events(evs);
    room.touch((state.clock)());
    let t1 = format!("cf_tok_{}", random_hex(16));
    let t2 = format!("cf_tok_{}", random_hex(16));
    {
        let mut toks = state.tokens.write().unwrap();
        toks.insert(t1.clone(), (room_key.clone(), "p1".into()));
        toks.insert(t2.clone(), (room_key.clone(), "p2".into()));
    }
    state.rooms.write().unwrap().insert(room_key.clone(), Arc::new(std::sync::Mutex::new(room)));
    Ok((
        room_key,
        [
            (first.user_id.clone(), t1, "p1".into()),
            (second.user_id.clone(), t2, "p2".into()),
        ],
    ))
}

impl Matchmaker {
    pub fn tick(&mut self, state: &AppState) {
        let now = (state.clock)();
        let timeout = state.ranked.ranks.matchmaking.timeout_ms;
        let (gone, keep): (Vec<_>, Vec<_>) = self.queue.drain(..).partition(|q| now - q.joined_at > timeout);
        self.queue = keep;
        for q in gone {
            self.results.insert(q.user_id, MatchResult::Timeout);
        }
        let mut waiting = self.queue.clone();
        waiting.sort_by_key(|q| q.joined_at);
        let mut taken: Vec<String> = Vec::new();
        for a in &waiting {
            if taken.contains(&a.user_id) {
                continue;
            }
            let mut best: Option<(&QueueEntry, i32)> = None;
            for b in &waiting {
                if b.user_id == a.user_id || taken.contains(&b.user_id) {
                    continue;
                }
                let diff = (a.mmr - b.mmr).abs();
                let range = state.ranked.ranks.match_range(now - a.joined_at).max(state.ranked.ranks.match_range(now - b.joined_at));
                if diff <= range && best.map(|(_, d)| diff < d).unwrap_or(true) {
                    best = Some((b, diff));
                }
            }
            let Some((b, _)) = best else { continue };
            match create_ranked_room(state, a, b) {
                Ok((room_key, seats)) => {
                    taken.push(a.user_id.clone());
                    taken.push(b.user_id.clone());
                    for (uid, token, pid) in seats {
                        self.results.insert(uid, MatchResult::Matched { room_key: room_key.clone(), token, player_id: pid, at: now });
                    }
                }
                Err(e) => eprintln!("ranked: createMatch failed: {e}"),
            }
        }
        self.queue.retain(|q| !taken.contains(&q.user_id));
    }
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GuestReq {
    #[serde(default)]
    name: Option<String>,
}

fn clean_name(s: Option<&str>) -> String {
    let t: String = s.unwrap_or("").chars().map(|c| if c.is_control() { ' ' } else { c }).collect::<String>().trim().chars().take(16).collect();
    if t.is_empty() { "ゲスト".into() } else { t }
}

/// ゲストの本人確認を作る。secret は本人だけが持つ（端末に保存する）
pub async fn api_account_guest(State(state): State<Arc<AppState>>, Json(req): Json<GuestReq>) -> impl IntoResponse {
    state.requests_total.fetch_add(1, Ordering::Relaxed);
    let acc = Account {
        user_id: format!("g_{}", random_hex(8)),
        secret: random_hex(24),
        name: clean_name(req.name.as_deref()),
        created_at: (state.clock)(),
    };
    let db = state.db.lock().unwrap();
    if let Err(e) = write_json(&db, ACCOUNTS_TABLE, &acc.user_id, &acc) {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "ok": false, "reason": e })));
    }
    (StatusCode::OK, Json(json!({ "ok": true, "userId": acc.user_id, "secret": acc.secret, "name": acc.name })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthReq {
    user_id: String,
    secret: String,
    #[serde(default)]
    name: Option<String>,
}

fn auth(state: &AppState, req: &AuthReq) -> Result<Account, (StatusCode, Json<Value>)> {
    let db = state.db.lock().unwrap();
    let acc: Option<Account> = read_json(&db, ACCOUNTS_TABLE, &req.user_id);
    match acc {
        Some(a) if constant_eq(&a.secret, &req.secret) => {
            // 表示名を変えたときは更新する
            if let Some(n) = req.name.as_deref() {
                let n = clean_name(Some(n));
                if n != a.name {
                    let mut a2 = a.clone();
                    a2.name = n;
                    let _ = write_json(&db, ACCOUNTS_TABLE, &a2.user_id, &a2);
                    return Ok(a2);
                }
            }
            Ok(a)
        }
        _ => Err((StatusCode::FORBIDDEN, Json(json!({ "ok": false, "reason": "本人確認ができませんでした（もう一度ゲスト登録してください）" })))),
    }
}

/// ほかの API（ガチャ・ショップ）からも使う本人確認。db の鍵を取る前に呼ぶ
pub(crate) fn authenticate(state: &AppState, user_id: &str, secret: &str) -> Result<Account, (StatusCode, Json<Value>)> {
    auth(state, &AuthReq { user_id: user_id.to_string(), secret: secret.to_string(), name: None })
}

fn constant_eq(a: &str, b: &str) -> bool {
    a.len() == b.len() && a.bytes().zip(b.bytes()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

fn record_of(state: &AppState, acc: &Account) -> RankRecord {
    let db = state.db.lock().unwrap();
    let mut rec: RankRecord = read_json(&db, RANKED_TABLE, &acc.user_id).unwrap_or_default();
    rec.user_id = acc.user_id.clone();
    rec.name = acc.name.clone();
    rec
}

fn status_value(state: &AppState, mm: &mut Matchmaker, user_id: &str) -> Value {
    mm.tick(state);
    match mm.results.get(user_id).cloned() {
        Some(MatchResult::Matched { room_key, token, player_id, .. }) => {
            let room = state.rooms.read().unwrap().get(&room_key).cloned();
            let Some(room) = room else {
                // 部屋が消えた（再起動など）：知らせを捨てて、探し直してもらう
                mm.results.remove(user_id);
                return json!({ "state": "idle" });
            };
            let room = room.lock().unwrap();
            let opponent = room.seats.iter().find(|(k, _)| **k != player_id).map(|(_, v)| v.clone()).unwrap_or_default();
            let finished = room.game.phase() == "gameOver";
            json!({
                "state": "matched",
                "token": token,
                "playerId": player_id,
                "opponentName": opponent,
                "finished": finished,
                "gameState": state_to_value(&room.game.get_state(Some(&player_id))),
            })
        }
        Some(MatchResult::Timeout) => {
            mm.results.remove(user_id);
            json!({ "state": "timeout" })
        }
        None => match mm.queue.iter().find(|q| q.user_id == user_id) {
            Some(q) => {
                let now = (state.clock)();
                json!({
                    "state": "queued",
                    "waitedMs": now - q.joined_at,
                    "range": state.ranked.ranks.match_range(now - q.joined_at),
                    "timeoutMs": state.ranked.ranks.matchmaking.timeout_ms,
                    "queued": mm.queue.len(),
                })
            }
            None => json!({ "state": "idle" }),
        },
    }
}

/// 待ち行列に入る（すでに試合中なら、その試合を返す）
pub async fn api_ranked_queue(State(state): State<Arc<AppState>>, Json(req): Json<AuthReq>) -> impl IntoResponse {
    state.requests_total.fetch_add(1, Ordering::Relaxed);
    let acc = match auth(&state, &req) {
        Ok(a) => a,
        Err(e) => return e,
    };
    let rec = record_of(&state, &acc);
    let (season, _, _) = state.ranked.seasons.season_at((state.clock)());
    let mmr = current_entry(&state.ranked, &rec, season).mmr;
    let mut mm = state.matchmaker.lock().unwrap();
    // 終わった試合の知らせは捨てて、探し直す
    let stale = match mm.results.get(&acc.user_id) {
        Some(MatchResult::Matched { room_key, .. }) => state
            .rooms
            .read()
            .unwrap()
            .get(room_key)
            .map(|r| r.lock().unwrap().game.phase() == "gameOver")
            .unwrap_or(true),
        Some(MatchResult::Timeout) => true,
        None => false,
    };
    if stale {
        mm.results.remove(&acc.user_id);
    }
    if !mm.results.contains_key(&acc.user_id) && !mm.queue.iter().any(|q| q.user_id == acc.user_id) {
        mm.queue.push(QueueEntry { user_id: acc.user_id.clone(), name: acc.name.clone(), mmr, joined_at: (state.clock)() });
    }
    let mut v = status_value(&state, &mut mm, &acc.user_id);
    v["ok"] = json!(true);
    (StatusCode::OK, Json(v))
}

pub async fn api_ranked_status(State(state): State<Arc<AppState>>, Json(req): Json<AuthReq>) -> impl IntoResponse {
    state.requests_total.fetch_add(1, Ordering::Relaxed);
    let acc = match auth(&state, &req) {
        Ok(a) => a,
        Err(e) => return e,
    };
    let mut mm = state.matchmaker.lock().unwrap();
    let mut v = status_value(&state, &mut mm, &acc.user_id);
    v["ok"] = json!(true);
    (StatusCode::OK, Json(v))
}

pub async fn api_ranked_leave(State(state): State<Arc<AppState>>, Json(req): Json<AuthReq>) -> impl IntoResponse {
    state.requests_total.fetch_add(1, Ordering::Relaxed);
    let acc = match auth(&state, &req) {
        Ok(a) => a,
        Err(e) => return e,
    };
    let mut mm = state.matchmaker.lock().unwrap();
    if matches!(mm.results.get(&acc.user_id), Some(MatchResult::Matched { .. })) {
        return (StatusCode::OK, Json(json!({ "ok": false, "reason": "すでに試合が成立しています" })));
    }
    mm.results.remove(&acc.user_id);
    mm.queue.retain(|q| q.user_id != acc.user_id);
    (StatusCode::OK, Json(json!({ "ok": true, "state": "idle" })))
}

pub async fn api_ranked_summary(State(state): State<Arc<AppState>>, Json(req): Json<AuthReq>) -> impl IntoResponse {
    state.requests_total.fetch_add(1, Ordering::Relaxed);
    let acc = match auth(&state, &req) {
        Ok(a) => a,
        Err(e) => return e,
    };
    let rec = record_of(&state, &acc);
    let mut v = summary_value(&state, &rec);
    v["ok"] = json!(true);
    v["name"] = json!(acc.name);
    (StatusCode::OK, Json(v))
}

#[derive(Deserialize)]
pub struct BoardQuery {
    #[serde(default)]
    limit: Option<usize>,
}

/// 今のシーズンのランキング（認定戦が終わった人だけ。userId は出さない）
pub async fn api_ranked_leaderboard(State(state): State<Arc<AppState>>, Query(q): Query<BoardQuery>) -> impl IntoResponse {
    state.requests_total.fetch_add(1, Ordering::Relaxed);
    let cfg = &state.ranked;
    let (season, _, _) = cfg.seasons.season_at((state.clock)());
    let records = {
        let db = state.db.lock().unwrap();
        all_records(&db)
    };
    let mut rows: Vec<(&RankRecord, StoredEntry)> = records
        .iter()
        .filter_map(|r| r.seasons.iter().find(|e| e.season == season && e.placement_left == 0).map(|e| (r, e.clone())))
        .collect();
    rows.sort_by(|a, b| b.1.rp.cmp(&a.1.rp).then(b.1.mmr.cmp(&a.1.mmr)).then(a.0.user_id.cmp(&b.0.user_id)));
    let limit = q.limit.unwrap_or(50).clamp(1, 100);
    let list: Vec<Value> = rows
        .iter()
        .take(limit)
        .enumerate()
        .map(|(i, (r, e))| {
            let pos = i as u32 + 1;
            json!({
                "position": pos,
                "name": if r.name.is_empty() { "ゲスト".to_string() } else { r.name.clone() },
                "rp": e.rp,
                "matches": e.matches,
                "wins": e.wins,
                "rank": rank_value(&cfg.ranks.display_rank(e.rp, Some(pos))),
            })
        })
        .collect();
    Json(json!({ "ok": true, "season": season, "entries": list }))
}

#[derive(Deserialize)]
pub struct ClaimReq {
    token: String,
}

/// 相手が長いあいだ操作しないとき、待っている人が勝ちを申し出る（相手が降参したことにする）
pub async fn api_ranked_claim_idle(State(state): State<Arc<AppState>>, Json(req): Json<ClaimReq>) -> impl IntoResponse {
    state.requests_total.fetch_add(1, Ordering::Relaxed);
    let Some((key, seat)) = state.tokens.read().unwrap().get(&req.token).cloned() else {
        return (StatusCode::FORBIDDEN, Json(json!({ "ok": false, "reason": "部屋に入っていません" })));
    };
    let Some(room_arc) = state.rooms.read().unwrap().get(&key).cloned() else {
        return (StatusCode::NOT_FOUND, Json(json!({ "ok": false, "reason": "部屋が見つかりません" })));
    };
    let mut room = room_arc.lock().unwrap();
    if room.ranked.is_none() {
        return (StatusCode::OK, Json(json!({ "ok": false, "reason": "ランクマッチの部屋ではありません" })));
    }
    if room.game.phase() == "gameOver" {
        return (StatusCode::OK, Json(json!({ "ok": false, "reason": "試合はもう終わっています" })));
    }
    // 待たされている側＝今動くべき人（手番か防御）でない人
    let st = state_to_value(&room.game.get_state(None));
    let acting = if st["phase"] == "defend" {
        st["defense"]["defenderId"].as_str().unwrap_or("").to_string()
    } else {
        room.game.current_player_id().to_string()
    };
    if acting == seat {
        return (StatusCode::OK, Json(json!({ "ok": false, "reason": "あなたが動く番です" })));
    }
    let idle = (state.clock)() - room.last_action_at;
    if idle < state.ranked.idle_turn_ms {
        let left = (state.ranked.idle_turn_ms - idle + 999) / 1000;
        return (StatusCode::OK, Json(json!({ "ok": false, "reason": format!("あと{left}秒待つと、勝ちを申し出られます"), "waitMs": state.ranked.idle_turn_ms - idle })));
    }
    let r = room.game.surrender(&acting);
    let evs = room.game.drain_events();
    room.push_events(evs);
    crate::settle_ranked(&state, &mut room);
    room.push_sync();
    (StatusCode::OK, Json(json!({ "ok": r.ok, "state": state_to_value(&room.game.get_state(Some(&seat))) })))
}

// ---------------------------------------------------------------------------
// シーズン報酬（終わったシーズンの最高到達ランクで、アイコンフレーム＋カード裏面を1組。コインはなし）
// ---------------------------------------------------------------------------

/// 終わったシーズンごとの報酬（新しい順）
pub fn season_rewards(cfg: &RankedConfig, rec: &RankRecord, current_season: u32) -> Vec<Value> {
    let mut list: Vec<&StoredEntry> = rec.seasons.iter().filter(|e| e.season < current_season).collect();
    list.sort_by(|a, b| b.season.cmp(&a.season));
    list.into_iter()
        .map(|e| {
            let eligible = e.placement_left == 0 && e.matches >= cfg.min_matches_for_reward;
            let peak = cfg.ranks.display_rank(e.peak_rp, None);
            let items: Vec<String> = if eligible { cfg.rewards.get(&peak.tier_id).cloned().unwrap_or_default() } else { Vec::new() };
            json!({
                "season": e.season,
                "eligible": eligible && !items.is_empty(),
                "claimed": rec.claimed_seasons.contains(&e.season),
                "peak": if eligible { rank_value(&peak) } else { Value::Null },
                "items": items,
                "matches": e.matches,
                "minMatches": cfg.min_matches_for_reward,
            })
        })
        .collect()
}

pub async fn api_ranked_season_rewards(State(state): State<Arc<AppState>>, Json(req): Json<AuthReq>) -> impl IntoResponse {
    state.requests_total.fetch_add(1, Ordering::Relaxed);
    let acc = match auth(&state, &req) {
        Ok(a) => a,
        Err(e) => return e,
    };
    let rec = record_of(&state, &acc);
    let (season, _, _) = state.ranked.seasons.season_at((state.clock)());
    (StatusCode::OK, Json(json!({ "ok": true, "season": season, "rewards": season_rewards(&state.ranked, &rec, season) })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaimSeasonReq {
    user_id: String,
    secret: String,
    season: u32,
}

/// シーズン報酬を受け取る（1シーズン1回）。品はサーバーの所持品に入れ、受け取った品の ID を返す
pub async fn api_ranked_claim_season(State(state): State<Arc<AppState>>, Json(req): Json<ClaimSeasonReq>) -> impl IntoResponse {
    state.requests_total.fetch_add(1, Ordering::Relaxed);
    let acc = match authenticate(&state, &req.user_id, &req.secret) {
        Ok(a) => a,
        Err(e) => return e,
    };
    let (current, _, _) = state.ranked.seasons.season_at((state.clock)());
    let db = state.db.lock().unwrap();
    let mut rec: RankRecord = read_json(&db, RANKED_TABLE, &acc.user_id).unwrap_or_default();
    rec.user_id = acc.user_id.clone();
    rec.name = acc.name.clone();
    let list = season_rewards(&state.ranked, &rec, current);
    let Some(r) = list.iter().find(|r| r["season"] == req.season) else {
        return (StatusCode::OK, Json(json!({ "ok": false, "reason": "そのシーズンの報酬はありません（終わったシーズンだけ受け取れます）" })));
    };
    if r["claimed"] == true {
        return (StatusCode::OK, Json(json!({ "ok": false, "reason": "もう受け取っています" })));
    }
    if r["eligible"] != true {
        let min = state.ranked.min_matches_for_reward;
        return (StatusCode::OK, Json(json!({ "ok": false, "reason": format!("報酬には、認定戦を終えて{min}試合以上のランク戦が必要です") })));
    }
    let items: Vec<String> = serde_json::from_value(r["items"].clone()).unwrap_or_default();
    let mut prof = crate::load_profile(&db, &acc.user_id);
    for it in &items {
        if !prof.owned_skins.contains(it) {
            prof.owned_skins.push(it.clone());
        }
    }
    rec.claimed_seasons.push(req.season);
    if let Err(e) = crate::save_profile(&db, &prof).and_then(|_| write_json(&db, RANKED_TABLE, &rec.user_id, &rec)) {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "ok": false, "reason": e })));
    }
    (StatusCode::OK, Json(json!({ "ok": true, "season": req.season, "items": items, "peak": r["peak"].clone() })))
}
