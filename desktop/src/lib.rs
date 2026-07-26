//! Stellarc Desktop — Tauri shell that bundles and supervises a local Axis.
//!
//! ADR 0035 §1.2: the desktop app is one artifact containing axis + UI. Axis
//! runs **in-process** rather than as a spawned sidecar binary, so the shell
//! and the control plane can never be at different versions, and there is no
//! child process to leak if the window dies.
//!
//! Lite edition (ADR 0032): SQLite, single org, user tier. No human login —
//! one person on their own machine. The installation token and Origin gate
//! still apply because axis binds a local HTTP port and `127.0.0.1` is not a
//! trust boundary on a multi-process desktop (ADR 0035 §1.3).
//!
//! Windows note: orbit is NOT bundled here. It does not compile for Windows
//! (Unix process control in `pty.rs`), so the node runtime lives in WSL2 and
//! is installed only when the user opts in (ADR 0035 §1.2.7).

use std::net::SocketAddr;

/// Where the bundled axis listens. Port 0 would be nicer but the UI needs a
/// known origin for its CSP connect-src, so a fixed loopback port it is.
///
/// ponytail: fixed port; switch to an ephemeral port handed to the UI at
/// runtime if a second instance ever needs to coexist.
const AXIS_ADDR: &str = "127.0.0.1:8799";

/// Start the bundled Axis, then open the window pointed at it.
///
/// Returns the address the UI should talk to.
fn axis_addr() -> SocketAddr {
    AXIS_ADDR.parse().expect("AXIS_ADDR is a literal")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![axis_endpoint])
        .setup(|_app| {
            // TODO(desktop-2): supervise the in-process axis here — bind
            // axis_addr(), serve, and surface a failure in the window instead
            // of a silent dead port. Deliberately not stubbed with a fake
            // success: an unsupervised axis that reports "running" is worse
            // than one that reports nothing.
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Stellarc desktop");
}

/// The axis origin for the frontend to use.
#[tauri::command]
fn axis_endpoint() -> String {
    format!("http://{}", axis_addr())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn axis_addr_is_loopback_only() {
        let addr = axis_addr();
        assert!(
            addr.ip().is_loopback(),
            "bundled axis must never bind a routable address: {addr}"
        );
        assert_eq!(addr.port(), 8799);
        assert_eq!(axis_endpoint(), "http://127.0.0.1:8799");
    }
}
