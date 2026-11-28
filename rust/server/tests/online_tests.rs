use std::path::PathBuf;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use castlefield_server::{build_router, create_state, filter_event_for};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use tower::ServiceExt;

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().parent().unwrap().to_path_buf()
}

async fn post(app: &axum::Router, uri: &str, body: Value) -> (StatusCode, Value) {
    let req = Request::builder()
        .method("POST")
        .uri(uri)
        .header("content-type", "application/json")
        .body(Body::from(body.to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    let status = resp.status();
    let bytes = resp.into_body().collect().await.unwrap().to_bytes();
    (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}

#[test]
fn hides_opponent_card_ids() {
    let ev = json!({ "type": "cardDrawn", "playerId": "p1", "cardIds": ["c01", "c02"] });
    assert_eq!(filter_event_for(&ev, "p2").unwrap(), json!({ "type": "cardDrawn", "playerId": "p1", "count": 2 }));
    let mine = filter_event_for(&ev, "p1").unwrap();
    assert_eq!(mine["cardIds"], json!(["c01", "c02"]));
    assert_eq!(mine["count"], 2);
    let fused = json!({ "type": "cardsFused", "playerId": "p1", "cardIds": ["a", "b"], "cardId": "c", "from": "x", "to": "y" });
    assert_eq!(filter_event_for(&fused, "p2").unwrap(), json!({ "type": "cardsFused", "playerId": "p1" }));
    let other = json!({ "type": "turnStarted", "playerId": "p1", "turn": 1 });
    assert_eq!(filter_event_for(&other, "p2").unwrap(), other);
}

#[tokio::test]
async fn tokens_are_unguessable_and_defense_is_defender_only() {
    let db = std::env::temp_dir().join(format!("cf_online_{}.redb", std::process::id()));
    let _ = std::fs::remove_file(&db);
    let app = build_router(create_state(&repo_root().join("data"), &db).unwrap(), None);

    let (_, a) = post(&app, "/api/join", json!({ "passphrase": "fix-room", "name": "A" })).await;
    let (_, b) = post(&app, "/api/join", json!({ "passphrase": "fix-room", "name": "B" })).await;
    let ta = a["token"].as_str().unwrap();
    let tb = b["token"].as_str().unwrap();
    assert_ne!(ta, tb);
    // 連番（cf_tok_1_p1 など）ではなく、32桁の16進
    for t in [ta, tb] {
        let hex = t.strip_prefix("cf_tok_").unwrap();
        assert_eq!(hex.len(), 32, "{t}");
        assert!(hex.chars().all(|c| c.is_ascii_hexdigit()));
    }
    assert!(post(&app, "/api/action", json!({ "token": "cf_tok_1_p1", "method": "endTurn" })).await.0 == StatusCode::FORBIDDEN);

    // 攻撃を受けていないときは、だれも防御の操作を送れない
    for t in [ta, tb] {
        let (_, r) = post(&app, "/api/action", json!({ "token": t, "method": "passDefense", "args": [] })).await;
        assert_eq!(r["ok"], false, "{r}");
    }
    let _ = std::fs::remove_file(&db);
}
