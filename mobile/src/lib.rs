//! Stellarc Mobile — Tauri 2 shells (Android/iOS) around the pixel-frozen
//! `stellarc-ui` bundle, loaded over Tauri's asset protocol.
//!
//! Presentation-only (ADR 0009): no local Axis, no local control plane, no
//! API surface of its own. The UI's API origin is baked at build time
//! (`VITE_API_URL` via `MOBILE_API_URL`, see `scripts/build-ui.sh`), so the
//! shell points the device webview at the frozen bundle and lets the UI
//! reach the stellarc-api deployment directly. No window sizing is applied:
//! the webview fills the device screen (spec SS5).
//!
//! Structured startup lines go to stderr with `service.name=stellarc-mobile`;
//! the CI launch smokes grep them. Never log tokens, credential-bearing
//! URLs, or PII (M12): the health probe logs a status word only — reqwest's
//! error Display embeds the request URL, so the error detail is dropped.

use tauri::{WebviewUrl, WebviewWindowBuilder};

/// API origin baked at compile time. `scripts/build-ui.sh` bakes the same
/// value into the frozen UI's `VITE_API_URL`; the shell uses it only for
/// the launch-time `GET /health` readiness log line (best-effort,
/// non-fatal — spec SS3, identical contract to STL-22 §3).
/// `Option::unwrap_or` is not a stable const fn — const `match` is the idiom.
const API_URL: &str = match option_env!("MOBILE_API_URL") {
    Some(url) => url,
    None => "http://localhost:1337",
};

/// Emit one structured startup line to stderr. The only log path in the
/// shell (M12): every line carries `service.name=stellarc-mobile`.
fn log_event(event: &str) {
    eprintln!("service.name=stellarc-mobile event={event}");
}

/// Best-effort `GET {API_URL}/health` with a 2 s timeout, non-fatal. The
/// result is logged as a bare status word; the error detail is deliberately
/// dropped because reqwest's Display embeds the request URL (M12).
fn probe_health() {
    let url = format!("{}/health", API_URL.trim_end_matches('/'));
    let result = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .and_then(|client| client.get(&url).send());
    match result {
        Ok(response) => log_event(&format!("health-probe status={}", response.status())),
        Err(_) => log_event("health-probe status=unreachable"),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            log_event("startup");
            // Readiness line is best-effort (spec SS3): probe off-thread so
            // an unreachable API origin can never delay webview creation.
            std::thread::spawn(probe_health);

            // The webview fills the device screen: no sizing calls (spec
            // SS5). If the mobile runtime has not already created the main
            // window, create it against the frozen bundle.
            if app.get_webview_window("main").is_none() {
                WebviewWindowBuilder::new(
                    app,
                    "main",
                    WebviewUrl::App("index.html".into()),
                )
                .build()?;
            }

            log_event("window-created");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Stellarc mobile");
}
