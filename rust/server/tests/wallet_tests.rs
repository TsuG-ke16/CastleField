use std::path::PathBuf;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Arc;

use axum::body::Body;
use axum::http::Request;
use castlefield_server::{build_router, create_state_with_clock};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use tower::ServiceExt;

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
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().parent().unwrap().to_path_buf();
    let db = std::env::temp_dir().join(format!("cf_wallet_{name}_{}.redb", std::process::id()));
    let _ = std::fs::remove_file(&db);
    let clock = Arc::new(AtomicI64::new(1_793_491_200_000 + 10 * 86_400_000 + 3_600_000));
    let c2 = clock.clone();
    let state = create_state_with_clock(&root.join("data"), &db, Arc::new(move || c2.load(Ordering::SeqCst))).unwrap();
    Env { app: build_router(state, None), clock, db }
}

async fn post(e: &Env, uri: &str, body: Value) -> Value {
    let r = Request::builder().method("POST").uri(uri).header("content-type", "application/json").body(Body::from(body.to_string())).unwrap();
    let resp = e.app.clone().oneshot(r).await.unwrap();
    let bytes = resp.into_body().collect().await.unwrap().to_bytes();
    serde_json::from_slice(&bytes).unwrap_or(Value::Null)
}

async fn guest(e: &Env) -> Value {
    let g = post(e, "/api/account/guest", json!({ "name": "W" })).await;
    json!({ "userId": g["userId"], "secret": g["secret"] })
}

fn with(base: &Value, extra: Value) -> Value {
    let mut v = base.clone();
    for (k, x) in extra.as_object().unwrap() {
        v[k] = x.clone();
    }
    v
}

#[tokio::test]
async fn migrate_moves_only_shop_cosmetics_once_and_never_coins() {
    let e = env("migrate");
    let a = guest(&e).await;
    let w = post(&e, "/api/economy/wallet", a.clone()).await;
    assert_eq!(w["coins"], 2400);
    assert_eq!(w["migrated"], false);
    let r = post(
        &e,
        "/api/economy/migrate",
        with(&a, json!({ "ownedSkins": ["unit_crimson", "castle-blue", "frame_gold", "hack_item"], "coins": 999999 })),
    )
    .await;
    assert_eq!(r["ok"], true, "{r}");
    assert_eq!(r["added"], json!(["unit_crimson"]), "ランク報酬・知らない品は移さない");
    assert_eq!(r["coins"], 2400, "コインは移さない");
    assert_eq!(r["migrated"], true);
    let r = post(&e, "/api/economy/migrate", with(&a, json!({ "ownedSkins": ["unit_gold"] }))).await;
    assert_eq!(r["ok"], false, "2回目は移せない");
    // 認証なしは断る
    let r = post(&e, "/api/economy/wallet", json!({ "userId": a["userId"], "secret": "x" })).await;
    assert_eq!(r["ok"], false);
}

#[tokio::test]
async fn match_rewards_have_a_daily_limit() {
    let e = env("daily");
    let a = guest(&e).await;
    let mut last = Value::Null;
    for i in 0..10 {
        last = post(&e, "/api/economy/matchReward", with(&a, json!({ "won": i % 2 == 0 }))).await;
        assert!(last["granted"].as_i64().unwrap() > 0, "{i}: {last}");
    }
    assert_eq!(last["coins"], 2400 + 5 * 150 + 5 * 40);
    assert_eq!(last["matchRewardsLeft"], 0);
    let r = post(&e, "/api/economy/matchReward", with(&a, json!({ "won": true }))).await;
    assert_eq!(r["granted"], 0, "上限を超えたら増えない");
    assert_eq!(r["coins"], last["coins"]);
    assert_eq!(r["matches"], 11, "試合数は数える");
    // 次の日は戻る
    e.clock.fetch_add(86_400_000, Ordering::SeqCst);
    let r = post(&e, "/api/economy/matchReward", with(&a, json!({ "won": true }))).await;
    assert_eq!(r["granted"], 150);
    assert_eq!(r["matchRewardsLeft"], 9);
}

#[tokio::test]
async fn missions_check_server_counts_and_pay_once() {
    let e = env("mission");
    let a = guest(&e).await;
    let m = |id: &str| with(&a, json!({ "missionId": id }));
    let r = post(&e, "/api/economy/mission", m("welcome_gift")).await;
    assert_eq!(r["ok"], true);
    assert_eq!(r["coins"], 2550);
    let r = post(&e, "/api/economy/mission", m("welcome_gift")).await;
    assert_eq!(r["ok"], false, "1回だけ");
    let r = post(&e, "/api/economy/mission", m("win_three")).await;
    assert_eq!(r["ok"], false, "まだ勝っていない: {r}");
    for _ in 0..3 {
        post(&e, "/api/economy/matchReward", with(&a, json!({ "won": true }))).await;
    }
    let r = post(&e, "/api/economy/mission", m("win_three")).await;
    assert_eq!(r["ok"], true, "{r}");
    assert_eq!(r["granted"], 500);
    let r = post(&e, "/api/economy/mission", m("gacha_ten")).await;
    assert_eq!(r["ok"], false);
    let g = post(&e, "/api/economy/gacha", with(&a, json!({ "count": 10 }))).await;
    assert_eq!(g["wallet"]["gachaRolls"], 10);
    let r = post(&e, "/api/economy/mission", m("gacha_ten")).await;
    assert_eq!(r["ok"], true, "{r}");
    let r = post(&e, "/api/economy/mission", m("no_such")).await;
    assert_eq!(r["ok"], false);
}

#[tokio::test]
async fn transfer_code_moves_account_once_and_retires_old_secret() {
    let e = env("transfer");
    let a = guest(&e).await;
    post(&e, "/api/economy/gacha", with(&a, json!({ "count": 1 }))).await;
    let before = post(&e, "/api/economy/wallet", a.clone()).await;

    // 出し直すと、前のコードは使えない
    let old = post(&e, "/api/account/transferCode", a.clone()).await;
    let c = post(&e, "/api/account/transferCode", a.clone()).await;
    assert_eq!(c["ok"], true);
    let code = c["code"].as_str().unwrap().to_string();
    assert_eq!(code.len(), 10);
    let r = post(&e, "/api/account/redeem", json!({ "code": old["code"] })).await;
    assert_eq!(r["ok"], false, "古いコードは使えない");

    // 小文字・ハイフン入りでも通る
    let typed = format!("{}-{}", &code[..5], &code[5..]).to_lowercase();
    let r = post(&e, "/api/account/redeem", json!({ "code": typed })).await;
    assert_eq!(r["ok"], true, "{r}");
    assert_eq!(r["userId"], a["userId"]);
    let b = json!({ "userId": r["userId"], "secret": r["secret"] });
    assert_ne!(b["secret"], a["secret"]);
    let w = post(&e, "/api/economy/wallet", b.clone()).await;
    assert_eq!(w["coins"], before["coins"]);
    assert_eq!(w["ownedSkins"], before["ownedSkins"]);
    // 元の端末の鍵は使えない
    let r = post(&e, "/api/economy/wallet", a.clone()).await;
    assert_eq!(r["ok"], false);
    // コードは1回だけ
    let r = post(&e, "/api/account/redeem", json!({ "code": code })).await;
    assert_eq!(r["ok"], false);

    // 期限切れ
    let c = post(&e, "/api/account/transferCode", b.clone()).await;
    e.clock.fetch_add(24 * 3_600_000 + 1, Ordering::SeqCst);
    let r = post(&e, "/api/account/redeem", json!({ "code": c["code"] })).await;
    assert_eq!(r["ok"], false);
    let r = post(&e, "/api/economy/wallet", b.clone()).await;
    assert_eq!(r["ok"], true, "期限切れのコードを使われても、今の鍵はそのまま");
}
