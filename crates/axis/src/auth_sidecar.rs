use std::path::Path;

use anyhow::{Context, Result};
use http_body_util::{BodyExt, Full};
use hyper::{body::Bytes, header, Method, Request, StatusCode};
use hyper_util::rt::TokioIo;
use serde::Deserialize;
use tokio::net::UnixStream;

#[derive(Debug)]
pub struct Reply {
    pub status: StatusCode,
    pub body: Vec<u8>,
    pub set_cookie: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SessionUser {
    pub id: String,
    pub username: String,
}

#[derive(Debug, Deserialize)]
struct SessionReply {
    user: SessionUser,
}

pub async fn request(
    socket: &Path,
    method: Method,
    path: &str,
    cookie: Option<&str>,
    body: Vec<u8>,
) -> Result<Reply> {
    let stream = UnixStream::connect(socket)
        .await
        .with_context(|| format!("connecting to {}", socket.display()))?;
    let (mut sender, connection) =
        hyper::client::conn::http1::handshake(TokioIo::new(stream)).await?;
    tokio::spawn(async move {
        if let Err(error) = connection.await {
            tracing::debug!(%error, "auth sidecar connection closed");
        }
    });
    let mut builder = Request::builder()
        .method(method)
        .uri(path)
        .header(header::HOST, "localhost");
    if let Some(cookie) = cookie {
        builder = builder.header(header::COOKIE, cookie);
    }
    if !body.is_empty() {
        builder = builder.header(header::CONTENT_TYPE, "application/json");
    }
    let response = sender
        .send_request(builder.body(Full::new(Bytes::from(body)))?)
        .await?;
    let status = response.status();
    let set_cookie = response
        .headers()
        .get(header::SET_COOKIE)
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);
    let body = response.into_body().collect().await?.to_bytes().to_vec();
    Ok(Reply {
        status,
        body,
        set_cookie,
    })
}

pub async fn session(socket: &Path, cookie: &str) -> Result<Option<SessionUser>> {
    let reply = request(
        socket,
        Method::GET,
        "/stellarc/session",
        Some(cookie),
        vec![],
    )
    .await?;
    if reply.status == StatusCode::UNAUTHORIZED {
        return Ok(None);
    }
    if !reply.status.is_success() {
        anyhow::bail!("auth sidecar returned {}", reply.status);
    }
    Ok(Some(
        serde_json::from_slice::<SessionReply>(&reply.body)?.user,
    ))
}
