use std::path::PathBuf;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use castlefield_server::{build_router, create_state};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use tower::ServiceExt;

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .to_path_buf()
}

async fn json_req(app: &axum::Router, method: &str, uri: &str, body: Option<Value>) -> (StatusCode, Value) {
    let req = Request::builder()
        .method(method)
        .uri(uri)
        .header("content-type", "application/json")
        .body(match body {
            Some(b) => Body::from(b.to_string()),
            None => Body::empty(),
        })
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    let status = resp.status();
    let bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let val: Value = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
    (status, val)
}

#[tokio::test]
async fn health_room_action_and_economy_persistence_work() {
    let root = repo_root();
    let tmp_db = std::env::temp_dir().join(format!("cf_server_test_{}.redb", std::process::id()));
    let _ = std::fs::remove_file(&tmp_db);
    let state = create_state(&root.join("data"), &tmp_db).unwrap();
    let app = build_router(state, None);

    let (st, body) = json_req(&app, "GET", "/healthz", None).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(body["ok"], true);

    let (st, rdy) = json_req(&app, "GET", "/readyz", None).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(rdy["ok"], true);

    let (st, join) = json_req(
        &app,
        "POST",
        "/api/join",
        Some(json!({ "passphrase": "rust-room-1", "name": "Tester", "cpu": true })),
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(join["ok"], true);
    assert_eq!(join["playerId"], "p1");
    let token = join["token"].as_str().unwrap().to_string();

    let (st, act) = json_req(
        &app,
        "POST",
        "/api/action",
        Some(json!({ "token": token, "method": "endTurn", "args": [] })),
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    assert!(act["state"]["turn"].as_u64().unwrap() >= 3);

    // ガチャ・ショップは本人確認が要る（user を名乗るだけでは動かない）
    let (st, bad) = json_req(&app, "POST", "/api/economy/gacha", Some(json!({ "user": "tester1", "count": 10 }))).await;
    assert_ne!(st, StatusCode::OK, "{bad}");
    let (_, g) = json_req(&app, "POST", "/api/account/guest", Some(json!({ "name": "Tester" }))).await;
    let (uid, secret) = (g["userId"].clone(), g["secret"].clone());
    let (st, wrong) = json_req(&app, "POST", "/api/economy/buy", Some(json!({ "userId": uid, "secret": "x", "itemId": "unit_crimson" }))).await;
    assert_eq!(st, StatusCode::FORBIDDEN, "{wrong}");

    let (st, gacha) = json_req(
        &app,
        "POST",
        "/api/economy/gacha",
        Some(json!({ "userId": uid, "secret": secret, "count": 10 })),
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(gacha["ok"], true);
    assert_eq!(gacha["results"].as_array().unwrap().len(), 10);
    assert_eq!(gacha["profile"]["coins"], 1500);

    // ガチャで引いていない、値段のある品を買う（ガチャの乱数しだいで同じ品を引くことがあるため）
    let shop: Value = serde_json::from_str(&std::fs::read_to_string(root.join("data/shop.json")).unwrap()).unwrap();
    let owned = gacha["profile"]["ownedSkins"].as_array().unwrap().clone();
    let (item, price) = shop["items"]
        .as_object()
        .unwrap()
        .iter()
        .filter(|(id, it)| it["price"].as_i64().is_some_and(|p| p <= 1500) && !owned.contains(&json!(id)))
        .map(|(id, it)| (id.clone(), it["price"].as_i64().unwrap()))
        .next()
        .unwrap();
    let (st, buy) = json_req(
        &app,
        "POST",
        "/api/economy/buy",
        Some(json!({ "userId": uid, "secret": secret, "itemId": item, "usePoints": false })),
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(buy["ok"], true, "{buy}");
    assert_eq!(buy["profile"]["coins"], 1500 - price);

    let (st, prof) = json_req(&app, "POST", "/api/economy/profile", Some(json!({ "userId": uid, "secret": secret }))).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(prof["profile"]["coins"], 1500 - price);

    let _ = std::fs::remove_file(&tmp_db);
}
