use std::env;
use std::path::PathBuf;

use castlefield_server::{build_router, create_state};

#[tokio::main]
async fn main() {
    let repo_root = env::var("CF_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("../.."));
    let data_dir = env::var("CF_DATA_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| repo_root.join("data"));
    let db_path = env::var("CF_REDB_PATH")
        .map(PathBuf::from)
        .unwrap_or_else(|_| repo_root.join("data-store").join("castlefield.redb"));
    let port: u16 = env::var("PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(8787);

    let state = create_state(&data_dir, &db_path).expect("failed to init castlefield-server state");
    let app = build_router(state, Some(repo_root));

    let addr = format!("0.0.0.0:{port}");
    println!("castlefield-server listening on http://{addr}");
    let listener = tokio::net::TcpListener::bind(&addr).await.expect("bind failed");
    axum::serve(listener, app).await.expect("server error");
}
