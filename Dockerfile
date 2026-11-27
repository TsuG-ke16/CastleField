# Stage 1: Build pure-Rust WASM engine and Axum online server
FROM rust:1.85-bookworm AS rust-builder
WORKDIR /src

RUN rustup target add wasm32-unknown-unknown
COPY rust/ rust/
COPY data/ data/

RUN cargo build --manifest-path rust/Cargo.toml -p castlefield-wasm --target wasm32-unknown-unknown --release
RUN cargo build --manifest-path rust/server/Cargo.toml --release

# Stage 2: Build Vite + React + Three.js + PixiJS PWA frontend
FROM node:22-bookworm-slim AS web-builder
WORKDIR /src

COPY web/package.json web/package-lock.json web/
RUN cd web && npm ci

COPY . .
RUN mkdir -p web/public/wasm && \
    cp rust/target/wasm32-unknown-unknown/release/castlefield_wasm.wasm web/public/wasm/castlefield_wasm.wasm && \
    cd web && npm run build

# Stage 3: Minimal production runtime serving SPA, WASM, assets, API, and WebSockets
FROM debian:bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=rust-builder /src/rust/server/target/release/castlefield-server /usr/local/bin/castlefield-server
COPY data/ /app/data/
COPY assets/ /app/assets/
COPY --from=web-builder /src/web/dist/ /app/web/dist/

ENV PORT=8787 \
    CF_ROOT=/app \
    CF_DATA_DIR=/app/data \
    CF_REDB_PATH=/app/data-store/castlefield.redb

VOLUME ["/app/data-store"]
EXPOSE 8787

CMD ["castlefield-server"]
