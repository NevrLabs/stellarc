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
//!
//! NSH #1865 (NEVR-632): a packaged app's panics are written to its log file —
//! the failure is observable, never swallowed by the GUI (a packaged Windows
//! app has no console, so without a hook the panic prints nowhere).
//! `install_panic_hook` routes every panic record through this same stderr
//! seam and, once setup has resolved the app's log dir, into the persistent
//! log file under it. The hook records, never swallows.

use std::io::Write as _;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

/// API origin baked at compile time. `scripts/build-ui.sh` bakes the same value
/// into the frozen UI's `VITE_API_URL`; the shell uses it only for the
/// launch-time `GET /health` readiness log line (best-effort, non-fatal).
/// `Option::unwrap_or` is not a stable const fn — const `match` is the idiom.
const API_URL: &str = match option_env!("DESKTOP_API_URL") {
    Some(url) => url,
    None => "http://localhost:1337",
};

/// Panic log file name under the app's log dir (`app.path().app_log_dir()`).
const PANIC_LOG_FILE_NAME: &str = "stellarc-desktop.log";

/// Persistent sink for panic records. The hook is installed first thing in
/// `run()`, but a Tauri `App` — and with it `app_log_dir()` — only exists once
/// setup runs, so the sink is unset during that early window and a panic there
/// is stderr-only. That boundary is deliberate (and strictly better than
/// nothing); setup resolves the real path and stores it exactly once — first
/// `set` wins.
static PANIC_LOG_FILE: OnceLock<Option<PathBuf>> = OnceLock::new();

/// The structured seam line for an event — emitted to stderr by `log_event`,
/// and appended to the persistent panic log file with the same shape, so both
/// outputs stay byte-identical for a panic record.
fn seam_line(event: &str) -> String {
    format!("service.name=stellarc-desktop event={event}")
}

/// Emit one structured startup line to stderr.
fn log_event(event: &str) {
    eprintln!("{}", seam_line(event));
}

/// Open the log file for appending, creating it if needed.
fn open_log_file(path: &Path) -> std::io::Result<std::fs::File> {
    std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
}

/// The panic record: exactly the standard panic payload — message and
/// location, nothing added around it (the seam's no-tokens, no
/// credential-bearing URLs, no PII rule applies to panic records too).
fn panic_record(info: &std::panic::PanicHookInfo<'_>) -> String {
    let message = if let Some(text) = info.payload().downcast_ref::<&str>() {
        (*text).to_string()
    } else if let Some(text) = info.payload().downcast_ref::<String>() {
        text.clone()
    } else {
        // What std's own hook prints for a non-string payload.
        "Box<dyn Any>".to_string()
    };
    let location = info
        .location()
        .map(|location| {
            format!(
                "{}:{}:{}",
                location.file(),
                location.line(),
                location.column()
            )
        })
        .unwrap_or_else(|| "unknown".to_string());
    format!("message={message:?} location={location}")
}

/// The panic hook (NSH #1865): record, never swallow. The panic still unwinds
/// and fails the process with the default non-zero exit — nothing here catches
/// or cancels it. The record always rides the stderr seam (what dev builds and
/// the Linux launch smoke see) and, once the app has resolved its log dir, is
/// appended to the persistent log file. File IO is best-effort: a panic hook
/// must never panic itself.
fn panic_hook(info: &std::panic::PanicHookInfo<'_>) {
    let line = seam_line(&format!("panic {}", panic_record(info)));
    eprintln!("{line}");
    if let Some(Some(path)) = PANIC_LOG_FILE.get() {
        if let Ok(mut file) = open_log_file(path) {
            let _ = writeln!(file, "{line}");
        }
    }
}

/// Install the panic hook — the first thing `run()` does, before the builder,
/// so nothing that can panic escapes it. Panics in the early window before
/// setup resolves the log dir are stderr-only; see [`PANIC_LOG_FILE`].
fn install_panic_hook() {
    std::panic::set_hook(Box::new(panic_hook));
}

/// Resolve the app's log dir, prove the panic log file is creatable and
/// appendable (an unwritable log dir must surface here at startup, not
/// silently mid-panic), publish the path to the panic sink, and emit the one
/// startup line that tells the user where the log lives. Best-effort by
/// design: a broken log dir keeps the hook stderr-only and the app running.
fn init_panic_log_file(app: &tauri::App) {
    let resolved = app.path().app_log_dir().and_then(|dir| {
        let path = dir.join(PANIC_LOG_FILE_NAME);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        open_log_file(&path)?;
        Ok(path)
    });
    // First set wins, and `run()` deliberately leaves the sink unset so this
    // single resolution sticks.
    match &resolved {
        Ok(path) => {
            let _ = PANIC_LOG_FILE.set(Some(path.clone()));
            log_event(&format!("log-file path={}", path.display()));
        }
        Err(error) => {
            let _ = PANIC_LOG_FILE.set(None);
            log_event(&format!("log-file status=unresolved error={error}"));
        }
    }
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
    // NSH #1865: the hook goes in before anything else can panic — before the
    // builder, before an app handle exists. Early-window panics (before setup
    // resolves the log dir) are stderr-only; see [`PANIC_LOG_FILE`]. The hook
    // records, never swallows: default panic behavior (non-zero exit) is
    // untouched.
    install_panic_hook();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            log_event("startup");
            // The panic log file path: resolved, published to the sink, and
            // announced on the seam before the window exists, so even a panic
            // during window creation is already being recorded to disk.
            init_panic_log_file(app);
            // The readiness line is best-effort (spec §3): probe off-thread so
            // an unreachable/slow API origin (e.g. DNS stall in a CI sandbox)
            // can never delay window creation — c5's smoke timeout proved it.
            std::thread::spawn(probe_health);

            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Stellarc")
                .inner_size(1440.0, 900.0)
                .min_inner_size(360.0, 640.0)
                .build()?;

            log_event("window-created");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Stellarc desktop")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// NEVR-632 acceptance 5 — prove hook → file: a panicking thread's record
    /// lands in the sink file, riding the seam line format. Negative control:
    /// replace `panic_hook`'s body with a no-op and this test goes red — the
    /// file never receives the record.
    #[test]
    fn panic_hook_writes_record_to_log_file() {
        let dir = std::env::temp_dir().join(format!(
            "stellarc-desktop-panic-hook-test-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("test dir created");
        let log_path = dir.join(PANIC_LOG_FILE_NAME);

        // Sink first (mirrors setup: one resolution per process), then hook.
        PANIC_LOG_FILE
            .set(Some(log_path.clone()))
            .expect("panic log sink is unset before this test");
        install_panic_hook();

        let worker = std::thread::spawn(|| {
            panic!("hook-e2e: this record must reach the log file");
        });
        assert!(
            worker.join().is_err(),
            "the worker thread must have panicked"
        );

        let record =
            std::fs::read_to_string(&log_path).expect("the panic record landed in the log file");
        let _ = std::fs::remove_dir_all(&dir);

        assert!(
            record.contains("service.name=stellarc-desktop event=panic"),
            "record rides the log seam line, got: {record}"
        );
        assert!(
            record.contains("hook-e2e: this record must reach the log file"),
            "record carries the panic message, got: {record}"
        );
        assert!(
            record.contains("lib.rs"),
            "record carries the panic location, got: {record}"
        );
    }
}
