//! Stellarc Desktop — Tauri 2 shell that loads the pixel-frozen `stellarc-ui`
//! bundle over Tauri's asset protocol.
//!
//! The shell is presentation-only (ADR 0009): no local Axis, no local control
//! plane, no API surface of its own. The UI's API origin is baked at build time
//! (`VITE_API_URL` via `DESKTOP_API_URL`, see `scripts/build-ui.sh`), so the
//! shell points the webview at the frozen bundle and lets the UI reach the
//! stellarc-api deployment directly.
//!
//! Structured startup lines go to stderr with `service.name=stellarc-desktop`;
//! the Linux launch smoke greps them. Never log tokens, credential-bearing
//! URLs, or PII.

use tauri::{WebviewUrl, WebviewWindowBuilder};

/// API origin baked at compile time. `scripts/build-ui.sh` bakes the same value
/// into the frozen UI's `VITE_API_URL`; the shell uses it only for the
/// launch-time `GET /health` readiness log line (best-effort, non-fatal).
const API_URL: &str = option_env!("DESKTOP_API_URL").unwrap_or("http://localhost:1337");

/// Emit one structured startup line to stderr.
fn log_event(event: &str) {
    eprintln!("service.name=stellarc-desktop event={event}");
}

/// Best-effort `GET {API_URL}/health` with a 2 s timeout. Non-fatal: a desktop
/// shell must not die because the API is briefly unreachable. The result is
/// logged regardless, which is what the Linux launch smoke asserts.
fn probe_health() {
    let url = format!("{}/health", API_URL.trim_end_matches('/'));
    let result = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .and_then(|client| client.get(&url).send());
    match result {
        Ok(response) => log_event(&format!("health-probe status={}", response.status())),
        Err(error) => log_event(&format!("health-probe status=unreachable error={error}")),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            log_event("startup");
            probe_health();

            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Stellarc")
                .inner_size(1440.0, 900.0)
                .min_inner_size(360.0, 640.0)
                .build()?;

            log_event("window-created");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Stellarc desktop");
}
