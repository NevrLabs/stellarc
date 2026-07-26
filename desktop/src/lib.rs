//! Stellarc Desktop — Tauri shell that bundles and supervises a local Axis.
//!
//! ADR 0035 §1.2: one artifact containing axis + UI. Axis runs **in-process**
//! rather than as a spawned sidecar, so the shell and the control plane can
//! never be at different versions and there is no child process to leak if the
//! window dies.
//!
//! The window loads the UI **from axis** (`http://127.0.0.1:<port>`) rather
//! than from Tauri's asset protocol. A production UI build talks to its own
//! origin (`api.ts`: `BASE = import.meta.env.DEV ? VITE_API_BASE : ""`), so
//! serving it from anywhere else would leave every request pointing at the
//! wrong host. Axis already serves `ui/dist` with SPA fallback.
//!
//! Lite edition (ADR 0032): SQLite, single org, user tier. No human login —
//! one person on their own machine. The installation token and Origin gate
//! still apply because axis binds a local port and `127.0.0.1` is not a trust
//! boundary on a multi-process desktop (ADR 0035 §1.3).
//!
//! Windows note: orbit is NOT started here. The orbit role requires Unix
//! process control and refuses to run on Windows; the node runtime lives in
//! WSL2 and is installed only when the user opts in (ADR 0035 §1.2.8).

use std::net::TcpListener;
use std::path::PathBuf;

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

/// Pick a free loopback port by binding :0 and reading back what the OS gave
/// us. A fixed port would collide with a dev axis (:8799) or a second install.
fn free_loopback_port() -> std::io::Result<u16> {
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let port = listener.local_addr()?.port();
    // Dropping closes it; axis rebinds immediately. The race window is tiny and
    // the failure mode is a clear bind error at startup, not silent breakage.
    Ok(port)
}

/// Where the bundled `ui/dist` lands inside the installed app.
fn bundled_ui_dist(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path()
        .resource_dir()
        .ok()
        .map(|dir| dir.join("ui-dist"))
        .filter(|dir| dir.join("index.html").is_file())
}

/// State the frontend can query.
struct AxisEndpoint(String);

#[tauri::command]
fn axis_endpoint(state: tauri::State<'_, AxisEndpoint>) -> String {
    state.0.clone()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![axis_endpoint])
        .setup(|app| {
            let port = free_loopback_port()?;
            let origin = format!("http://127.0.0.1:{port}");

            // Axis reads its configuration from the environment. Set it before
            // starting the server rather than threading a config struct through
            // — `entry::run` is the same code path the CLI uses, so the desktop
            // cannot drift from `stellarc axis`.
            std::env::set_var("STELLARC_BIND", format!("127.0.0.1:{port}"));
            if let Some(dist) = bundled_ui_dist(&app.handle()) {
                std::env::set_var("STELLARC_UI_DIST", dist);
            }
            if std::env::var_os("STELLARC_HOME").is_none() {
                if let Ok(dir) = app.path().app_data_dir() {
                    std::env::set_var("STELLARC_HOME", dir);
                }
            }

            app.manage(AxisEndpoint(origin.clone()));

            // `axis::entry::run` is `#[tokio::main]` — it BLOCKS and builds its
            // own runtime, so it cannot be awaited or spawned onto Tauri's.
            // Give it a dedicated OS thread. Using the same entry point as
            // `stellarc axis` is deliberate: the desktop cannot drift from the
            // CLI's startup path.
            let handle = app.handle().clone();
            std::thread::Builder::new()
                .name("stellarc-axis".into())
                .spawn(move || {
                    if let Err(error) = stellarc_axis::entry::run() {
                        // A dead control plane is fatal for a Lite install —
                        // the window would be an empty shell. Say so rather
                        // than leaving a blank window and no explanation.
                        eprintln!("stellarc: axis failed to start: {error:#}");
                        handle.exit(1);
                    }
                })?;

            // Open the window only once axis answers, so the user never sees a
            // dead port.
            let handle = app.handle().clone();
            let url = origin.clone();
            tauri::async_runtime::spawn(async move {
                if wait_for_axis(&url).await {
                    let parsed = url.parse().expect("origin is a valid url");
                    let _ = WebviewWindowBuilder::new(
                        &handle,
                        "main",
                        WebviewUrl::External(parsed),
                    )
                    .title("Stellarc")
                    .inner_size(1440.0, 900.0)
                    .min_inner_size(900.0, 600.0)
                    .build();
                } else {
                    eprintln!("stellarc: axis did not become ready at {url}");
                    handle.exit(1);
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Stellarc desktop");
}

/// Poll axis's health endpoint until it answers. Returns false on timeout.
///
/// ponytail: fixed 30s budget with a 100ms poll. Enough for a cold SQLite
/// open + view rebuild on a laptop; revisit if a large event log makes first
/// start slower than that.
async fn wait_for_axis(origin: &str) -> bool {
    let health = format!("{origin}/api/health");
    for _ in 0..300 {
        if reqwest::get(&health).await.is_ok_and(|r| r.status().is_success()) {
            return true;
        }
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allocated_port_is_free_and_loopback() {
        let port = free_loopback_port().expect("should allocate a port");
        assert_ne!(port, 0, "port 0 means the OS never assigned one");

        // Must be immediately rebindable — otherwise axis would fail to start
        // on the port we just handed it.
        let again = TcpListener::bind(("127.0.0.1", port));
        assert!(again.is_ok(), "port {port} was not released for axis to bind");
    }
}
