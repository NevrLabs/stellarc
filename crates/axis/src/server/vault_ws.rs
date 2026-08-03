use axum::{extract::{Query, State, WebSocketUpgrade}, extract::ws::{Message, WebSocket}, response::{IntoResponse, Response}};
use serde::Deserialize;
use std::{collections::HashMap, sync::{Mutex, OnceLock}};
use tokio::sync::broadcast;
use super::AppState;

static ROOMS: OnceLock<Mutex<HashMap<String, broadcast::Sender<Vec<u8>>>>> = OnceLock::new();
#[derive(Deserialize)] pub struct VaultWsQuery { path: String }

pub async fn handler(State(state): State<AppState>, axum::extract::Path(vault_id): axum::extract::Path<String>, Query(q): Query<VaultWsQuery>, ws: WebSocketUpgrade) -> Response {
    if state.vaults.read_note(&vault_id, &q.path).is_err() { return axum::http::StatusCode::NOT_FOUND.into_response(); }
    let key = format!("{vault_id}:{}", q.path);
    ws.on_upgrade(move |socket| run(socket, key))
}
async fn run(mut socket: WebSocket, key: String) {
    let tx = ROOMS.get_or_init(Default::default).lock().unwrap().entry(key).or_insert_with(|| broadcast::channel(128).0).clone();
    let mut rx = tx.subscribe();
    loop { tokio::select! {
        inbound = socket.recv() => match inbound { Some(Ok(Message::Binary(bytes))) if bytes.len() <= 1024 * 1024 => { let _=tx.send(bytes.to_vec()); }, Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break, _ => {} },
        outbound = rx.recv() => match outbound { Ok(bytes) => if socket.send(Message::Binary(bytes.into())).await.is_err() { break }, Err(broadcast::error::RecvError::Lagged(_)) => continue, Err(_) => break }
    }}
}
