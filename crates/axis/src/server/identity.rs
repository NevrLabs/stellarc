use axum::{
    extract::{Extension, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::json;
use std::collections::{HashMap, VecDeque};
use std::sync::{Mutex, OnceLock};

use super::principal::Principal;
use super::AppState;

const SESSION_COOKIE: &str = "stellarc_session";
const SESSION_TTL_SECONDS: i64 = 60 * 60 * 24 * 30;
const LOGIN_WINDOW_SECONDS: i64 = 60;
const LOGIN_GLOBAL_LIMIT: usize = 20;
const LOGIN_USERNAME_LIMIT: usize = 5;

async fn sidecar_response(
    state: &AppState,
    path: &str,
    headers: &HeaderMap,
    body: Vec<u8>,
) -> Option<Response> {
    let socket = state.auth_sidecar_socket.as_ref()?;
    let cookie = headers.get(header::COOKIE).and_then(|v| v.to_str().ok());
    Some(
        match crate::auth_sidecar::request(socket, hyper::Method::POST, path, cookie, body).await {
            Ok(reply) => {
                let mut response = (reply.status, reply.body).into_response();
                if let Some(cookie) = reply
                    .set_cookie
                    .and_then(|v| HeaderValue::from_str(&v).ok())
                {
                    response.headers_mut().append(header::SET_COOKIE, cookie);
                }
                response
            }
            Err(error) => {
                tracing::error!(%error, "calling auth sidecar");
                (
                    StatusCode::SERVICE_UNAVAILABLE,
                    "authentication unavailable",
                )
                    .into_response()
            }
        },
    )
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    username: String,
    password: String,
}

/// Unauthenticated probe: has this Axis been claimed yet? Deliberately a bare
/// boolean — no usernames, no counts, no org names.
pub async fn bootstrap_state(State(state): State<AppState>) -> Response {
    if let Some(socket) = &state.auth_sidecar_socket {
        return match crate::auth_sidecar::request(
            socket,
            hyper::Method::GET,
            "/stellarc/bootstrap",
            None,
            vec![],
        )
        .await
        {
            Ok(reply) => (reply.status, reply.body).into_response(),
            Err(error) => {
                tracing::error!(%error, "reading auth sidecar bootstrap state");
                (
                    StatusCode::SERVICE_UNAVAILABLE,
                    "authentication unavailable",
                )
                    .into_response()
            }
        };
    }
    match state.auth_store.has_any_user() {
        Ok(exists) => Json(json!({ "usersExist": exists })).into_response(),
        Err(error) => {
            tracing::error!(%error, "reading Axis bootstrap state");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "authentication unavailable",
            )
                .into_response()
        }
    }
}

/// Claim a fresh install: create the first user plus its organization, then log
/// it straight in. This route is necessarily unauthenticated, so it fails
/// closed — `bootstrap_admin` performs the "no users yet" check inside the same
/// IMMEDIATE transaction as the inserts, and anything but a fresh table is a
/// 409. Same Origin gate and same rate limiter as `login`.
pub async fn register(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<LoginRequest>,
) -> Response {
    if !crate::auth::request_origin_ok(&headers, false) {
        return (StatusCode::FORBIDDEN, "forbidden origin").into_response();
    }
    if let Some(response) = sidecar_response(
        &state,
        "/stellarc/register",
        &headers,
        serde_json::to_vec(
            &serde_json::json!({"username": body.username, "password": body.password}),
        )
        .unwrap(),
    )
    .await
    {
        return response;
    }
    if !allow_login_attempt(&body.username, unix_timestamp()) {
        return (StatusCode::TOO_MANY_REQUESTS, "too many login attempts").into_response();
    }
    // Validate before touching the store so malformed input is a 400 and a
    // storage failure stays a 500 (never echo a rusqlite error to an
    // unauthenticated caller).
    if let Err(error) = crate::auth_store::validate_username(&body.username)
        .and_then(|()| crate::auth_store::validate_password(&body.password))
    {
        return (StatusCode::BAD_REQUEST, error.to_string()).into_response();
    }

    let organization = crate::entry::default_org();
    match state
        .auth_store
        .bootstrap_admin(&body.username, &body.password, &organization, "Default")
    {
        Ok(true) => {}
        Ok(false) => {
            return (
                StatusCode::CONFLICT,
                "this Axis already has an account; sign in instead",
            )
                .into_response()
        }
        Err(error) => {
            tracing::error!(%error, "registering the first Axis user");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                "registration unavailable",
            )
                .into_response();
        }
    }
    tracing::info!(username = %body.username, "registered the first Axis user");

    login(State(state), headers, Json(body)).await
}

pub async fn login(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<LoginRequest>,
) -> Response {
    if !crate::auth::request_origin_ok(&headers, false) {
        return (StatusCode::FORBIDDEN, "forbidden origin").into_response();
    }
    if let Some(response) = sidecar_response(
        &state,
        "/stellarc/login",
        &headers,
        serde_json::to_vec(
            &serde_json::json!({"username": body.username, "password": body.password}),
        )
        .unwrap(),
    )
    .await
    {
        return response;
    }
    if !allow_login_attempt(&body.username, unix_timestamp()) {
        return (StatusCode::TOO_MANY_REQUESTS, "too many login attempts").into_response();
    }

    let principal = match state
        .auth_store
        .authenticate(&body.username, &body.password)
    {
        Ok(Some(principal)) => principal,
        Ok(None) => {
            return (StatusCode::UNAUTHORIZED, "invalid username or password").into_response()
        }
        Err(error) => {
            tracing::error!(%error, "authenticating Axis user");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                "authentication unavailable",
            )
                .into_response();
        }
    };
    let session = match state.auth_store.create_session(
        &principal.user_id,
        unix_timestamp(),
        SESSION_TTL_SECONDS,
    ) {
        Ok(session) => session,
        Err(error) => {
            tracing::error!(%error, "creating Axis login session");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                "authentication unavailable",
            )
                .into_response();
        }
    };

    let mut response = Json(json!({ "user": principal })).into_response();
    let cookie = session_cookie(
        &session.token,
        SESSION_TTL_SECONDS,
        state.session_cookie_secure,
    );
    response.headers_mut().insert(
        header::SET_COOKIE,
        HeaderValue::from_str(&cookie).expect("valid session cookie"),
    );
    response
}

pub async fn current_session(Extension(principal): Extension<Principal>) -> Response {
    match principal {
        Principal::User {
            user_id, username, ..
        } => Json(json!({
            "user": { "userId": user_id, "username": username, "kind": "user" }
        }))
        .into_response(),
        Principal::Operator => (StatusCode::FORBIDDEN, "user login required").into_response(),
    }
}

pub async fn list_organizations(
    State(state): State<AppState>,
    Extension(principal): Extension<Principal>,
) -> Response {
    if state.auth_mode == crate::auth_mode::AuthMode::SingleUser
        || state.auth_sidecar_socket.is_some()
    {
        let id = crate::entry::default_org();
        return Json(json!({ "organizations": [{
            "id": id,
            "slug": id,
            "displayName": "Personal",
            "role": "owner"
        }] }))
        .into_response();
    }
    let Principal::User { user_id, .. } = principal else {
        return (StatusCode::FORBIDDEN, "user login required").into_response();
    };
    match state.auth_store.organizations_for_user(&user_id) {
        Ok(organizations) => Json(json!({ "organizations": organizations })).into_response(),
        Err(error) => {
            tracing::error!(%error, "listing user organizations");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "organizations unavailable",
            )
                .into_response()
        }
    }
}

pub async fn logout(State(state): State<AppState>, headers: HeaderMap) -> Response {
    if let Some(response) = sidecar_response(&state, "/stellarc/logout", &headers, vec![]).await {
        return response;
    }
    if let Some(token) = session_token(&headers) {
        if let Err(error) = state.auth_store.revoke_session(&token) {
            tracing::error!(%error, "revoking Axis login session");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                "authentication unavailable",
            )
                .into_response();
        }
    }
    let mut response = StatusCode::NO_CONTENT.into_response();
    let cookie = session_cookie("", 0, state.session_cookie_secure);
    response.headers_mut().insert(
        header::SET_COOKIE,
        HeaderValue::from_str(&cookie).expect("valid expired cookie"),
    );
    response
}

pub fn session_token(headers: &HeaderMap) -> Option<String> {
    headers
        .get(header::COOKIE)?
        .to_str()
        .ok()?
        .split(';')
        .filter_map(|item| item.trim().split_once('='))
        .find_map(|(name, value)| {
            (name == SESSION_COOKIE && !value.is_empty()).then(|| value.to_string())
        })
}

fn session_cookie(token: &str, max_age: i64, secure: bool) -> String {
    let secure = if secure { "; Secure" } else { "" };
    format!(
        "{SESSION_COOKIE}={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age={max_age}{secure}"
    )
}

#[derive(Default)]
struct LoginLimiter {
    global: VecDeque<i64>,
    by_username: HashMap<String, VecDeque<i64>>,
}

impl LoginLimiter {
    fn allow(&mut self, username: &str, now: i64) -> bool {
        let cutoff = now - LOGIN_WINDOW_SECONDS;
        self.global.retain(|timestamp| *timestamp > cutoff);
        let username = username.to_ascii_lowercase();
        let attempts = self.by_username.entry(username).or_default();
        attempts.retain(|timestamp| *timestamp > cutoff);
        if self.global.len() >= LOGIN_GLOBAL_LIMIT || attempts.len() >= LOGIN_USERNAME_LIMIT {
            return false;
        }
        self.global.push_back(now);
        attempts.push_back(now);
        true
    }
}

fn allow_login_attempt(username: &str, now: i64) -> bool {
    static LIMITER: OnceLock<Mutex<LoginLimiter>> = OnceLock::new();
    LIMITER
        .get_or_init(|| Mutex::new(LoginLimiter::default()))
        .lock()
        .expect("login limiter mutex poisoned")
        .allow(username, now)
}

pub fn unix_timestamp() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cookie_is_secure_http_only_and_strict() {
        let cookie = session_cookie("secret", 60, true);
        assert!(cookie.contains("HttpOnly"));
        assert!(cookie.contains("SameSite=Strict"));
        assert!(cookie.contains("Secure"));
        assert!(cookie.contains("Max-Age=60"));
    }

    #[test]
    fn cookie_parser_matches_only_named_cookie() {
        let mut headers = HeaderMap::new();
        headers.insert(
            header::COOKIE,
            HeaderValue::from_static("other=x; stellarc_session=abc123"),
        );
        assert_eq!(session_token(&headers).as_deref(), Some("abc123"));
    }

    #[test]
    fn login_limiter_caps_username_and_global_argon_work() {
        let mut limiter = LoginLimiter::default();
        for _ in 0..LOGIN_USERNAME_LIMIT {
            assert!(limiter.allow("admin", 100));
        }
        assert!(!limiter.allow("ADMIN", 100));
        for index in 0..(LOGIN_GLOBAL_LIMIT - LOGIN_USERNAME_LIMIT) {
            assert!(limiter.allow(&format!("user-{index}"), 100));
        }
        assert!(!limiter.allow("one-more-user", 100));
        assert!(limiter.allow("admin", 100 + LOGIN_WINDOW_SECONDS + 1));
    }
}
