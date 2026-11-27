use std::path::PathBuf;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Arc;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use castlefield_server::{build_router, create_state_with_clock};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use tower::ServiceExt;

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().parent().unwrap().to_path_buf()
}

async fn req(app: &axum::Router, method: &str, uri: &str, body: Option<Value>) -> (StatusCode, Value) {
    let r = Request::builder()
        .method(method)
        .uri(uri)
        .header("content-type", "application/json")
        .body(match body {
            Some(b) => Body::from(b.to_string()),
            None => Body::empty(),
        })
        .unwrap();
    let resp = app.clone().oneshot(r).await.unwrap();
    let status = resp.status();
    let bytes = resp.into_body().collect().await.unwrap().to_bytes();
    (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}

struct Env {
    app: axum::Router,
    clock: Arc<AtomicI64>,
    db: PathBuf,
}

impl Drop for Env {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.db);
    }
}

fn env(name: &str) -> Env {
    let db = std::env::temp_dir().join(format!("cf_ranked_{name}_{}.redb", std::process::id()));
    let _ = std::fs::remove_file(&db);
    // シーズン1の途中（data/seasons.json の起点 2026-11-01 から10日後）
    let clock = Arc::new(AtomicI64::new(1_793_491_200_000 + 10 * 86_400_000));
    let c2 = clock.clone();
    let state = create_state_with_clock(&repo_root().join("data"), &db, Arc::new(move || c2.load(Ordering::SeqCst))).unwrap();
    Env { app: build_router(state, None), clock, db }
}

async fn guest(e: &Env, name: &str) -> Value {
    let (st, g) = req(&e.app, "POST", "/api/account/guest", Some(json!({ "name": name }))).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(g["ok"], true);
    json!({ "userId": g["userId"], "secret": g["secret"] })
}

async fn post(e: &Env, uri: &str, body: &Value) -> Value {
    let (st, v) = req(&e.app, "POST", uri, Some(body.clone())).await;
    assert_eq!(st, StatusCode::OK, "{uri}: {v}");
    v
}

/// 2人を組み合わせて、(a の席, b の席) の (token, playerId) を返す
async fn match_two(e: &Env, a: &Value, b: &Value) -> ((String, String), (String, String)) {
    let qa = post(e, "/api/ranked/queue", a).await;
    assert_eq!(qa["state"], "queued");
    let mut qb = post(e, "/api/ranked/queue", b).await;
    // MMR が離れていると、待つほど探す範囲が広がってから組まれる
    for _ in 0..20 {
        if qb["state"] == "matched" {
            break;
        }
        e.clock.fetch_add(10_000, Ordering::SeqCst);
        qb = post(e, "/api/ranked/status", b).await;
    }
    assert_eq!(qb["state"], "matched", "{qb}");
    let sa = post(e, "/api/ranked/status", a).await;
    assert_eq!(sa["state"], "matched");
    let seat = |v: &Value| (v["token"].as_str().unwrap().to_string(), v["playerId"].as_str().unwrap().to_string());
    let (x, y) = (seat(&sa), seat(&qb));
    assert_ne!(x.0, y.0);
    assert_ne!(x.1, y.1);
    assert_eq!(sa["gameState"]["phase"], "main");
    // 本人の手札は見え、相手の手札は見えない
    assert!(sa["gameState"]["players"][&x.1]["hand"].is_array());
    assert!(sa["gameState"]["players"][&y.1]["hand"].is_null());
    (x, y)
}

#[tokio::test]
async fn guest_auth_is_required() {
    let e = env("auth");
    let a = guest(&e, "Alice").await;
    let bad = json!({ "userId": a["userId"], "secret": "nope" });
    let (st, v) = req(&e.app, "POST", "/api/ranked/queue", Some(bad)).await;
    assert_eq!(st, StatusCode::FORBIDDEN);
    assert_eq!(v["ok"], false);
    let s = post(&e, "/api/ranked/summary", &a).await;
    assert_eq!(s["placed"], false);
    assert_eq!(s["placementLeft"], 5);
    assert_eq!(s["season"], 1);
    assert_eq!(s["name"], "Alice");
}

#[tokio::test]
async fn ranked_match_settles_once_and_counts_placement() {
    let e = env("settle");
    let a = guest(&e, "Alice").await;
    let b = guest(&e, "Bob").await;
    let ((ta, pa), (tb, pb)) = match_two(&e, &a, &b).await;

    // 合言葉で ranked の部屋に入れない
    let (_, j) = req(&e.app, "POST", "/api/join", Some(json!({ "passphrase": "ranked:x" }))).await;
    assert_eq!(j["ok"], false);

    // 手番でない人は操作できない。防御は攻撃を受けている人だけ
    let (cur_tok, other_tok) = {
        let s = post(&e, "/api/ranked/status", &a).await;
        if s["gameState"]["currentPlayer"] == pa.as_str() { (ta.clone(), tb.clone()) } else { (tb.clone(), ta.clone()) }
    };
    let r = post(&e, "/api/action", &json!({ "token": other_tok, "method": "endTurn", "args": [] })).await;
    assert_eq!(r["ok"], false, "{r}");
    let r = post(&e, "/api/action", &json!({ "token": other_tok, "method": "passDefense", "args": [] })).await;
    assert_eq!(r["ok"], false, "{r}");
    let r = post(&e, "/api/action", &json!({ "token": cur_tok, "method": "start", "args": [] })).await;
    assert_eq!(r["ok"], false);

    // Bob が降参 → Alice の勝ち
    let r = post(&e, "/api/action", &json!({ "token": tb, "method": "surrender", "args": [] })).await;
    assert_eq!(r["state"]["phase"], "gameOver");
    assert_eq!(r["state"]["winner"], pa.as_str());
    // もう一度送っても二重に反映しない
    let _ = post(&e, "/api/action", &json!({ "token": tb, "method": "surrender", "args": [] })).await;

    let sa = post(&e, "/api/ranked/summary", &a).await;
    let sb = post(&e, "/api/ranked/summary", &b).await;
    assert_eq!((sa["matches"].clone(), sa["wins"].clone(), sa["placementLeft"].clone()), (json!(1), json!(1), json!(4)));
    assert_eq!((sb["matches"].clone(), sb["wins"].clone(), sb["placementLeft"].clone()), (json!(1), json!(0), json!(4)));
    assert_eq!(sa["lastChange"]["result"], "win");
    assert_eq!(sa["lastChange"]["placement"], true);
    assert_eq!(sb["lastChange"]["result"], "loss");
    let _ = pb;

    // 試合が終わったら、もう一度並べる
    let q = post(&e, "/api/ranked/queue", &a).await;
    assert_eq!(q["state"], "queued");
    let l = post(&e, "/api/ranked/leave", &a).await;
    assert_eq!(l["ok"], true);
}

#[tokio::test]
async fn placement_finishes_and_leaderboard_lists_players() {
    let e = env("board");
    let a = guest(&e, "Alice").await;
    let b = guest(&e, "Bob").await;
    for _ in 0..5 {
        let (_, (tb, _)) = match_two(&e, &a, &b).await;
        post(&e, "/api/action", &json!({ "token": tb, "method": "surrender", "args": [] })).await;
    }
    let sa = post(&e, "/api/ranked/summary", &a).await;
    assert_eq!(sa["placed"], true);
    assert_eq!(sa["lastChange"]["placedNow"], true);
    assert!(sa["rank"]["divisionLabel"].is_string());
    assert_eq!(sa["position"], 1);
    // 6試合目からは RP が動く
    let (_, (tb, _)) = match_two(&e, &a, &b).await;
    post(&e, "/api/action", &json!({ "token": tb, "method": "surrender", "args": [] })).await;
    let sa2 = post(&e, "/api/ranked/summary", &a).await;
    assert!(sa2["lastChange"]["rpDelta"].as_i64().unwrap() > 0);
    let (_, board) = req(&e.app, "GET", "/api/ranked/leaderboard?limit=10", None).await;
    let list = board["entries"].as_array().unwrap();
    assert_eq!(list.len(), 2);
    assert_eq!(list[0]["name"], "Alice");
    assert_eq!(list[0]["position"], 1);
    assert!(list[0].get("userId").is_none(), "userId はランキングに出さない");
}

#[tokio::test]
async fn queue_times_out_and_idle_opponent_can_be_claimed() {
    let e = env("idle");
    let a = guest(&e, "Alice").await;
    let q = post(&e, "/api/ranked/queue", &a).await;
    assert_eq!(q["state"], "queued");
    e.clock.fetch_add(91_000, Ordering::SeqCst);
    let s = post(&e, "/api/ranked/status", &a).await;
    assert_eq!(s["state"], "timeout");
    let s = post(&e, "/api/ranked/status", &a).await;
    assert_eq!(s["state"], "idle", "タイムアウトの知らせは1回だけ");

    let b = guest(&e, "Bob").await;
    let ((ta, pa), (tb, pb)) = match_two(&e, &a, &b).await;
    let st = post(&e, "/api/ranked/status", &a).await;
    let cur = st["gameState"]["currentPlayer"].as_str().unwrap().to_string();
    let (waiting_tok, waiting_pid) = if cur == pa { (tb, pb) } else { (ta, pa) };
    let r = post(&e, "/api/ranked/claimIdle", &json!({ "token": waiting_tok })).await;
    assert_eq!(r["ok"], false);
    e.clock.fetch_add(181_000, Ordering::SeqCst);
    let r = post(&e, "/api/ranked/claimIdle", &json!({ "token": waiting_tok })).await;
    assert_eq!(r["ok"], true, "{r}");
    assert_eq!(r["state"]["phase"], "gameOver");
    assert_eq!(r["state"]["winner"], waiting_pid.as_str());
}
