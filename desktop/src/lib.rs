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
//! NEVR-657 (Multica #10566 law): a log seam must survive a dead sink. When
//! nothing read the app's output — a launcher or terminal already gone, common
//! for a GUI launch on Linux — the first write to a broken pipe must not kill
//! the process. `eprintln!` panics if the write fails, so every seam write
//! rides [`write_seam_line_checked`]: best-effort, a dropped line is
//! acceptable, a killed process is not.
//!
//! NSH #1865 (NEVR-632): a packaged app's panics are written to its log file —
//! the failure is observable, never swallowed by the GUI (a packaged Windows
//! app has no console, so without a hook the panic prints nowhere).
//! `install_panic_hook` routes every panic record through this same stderr
//! seam and, once setup has resolved the app's log dir, into the persistent
//! log file under it. The hook records, never swallows.

use std::io::Write;
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

/// Emit one structured startup line to stderr. Checked seam write: on a dead
/// stderr sink the line is dropped and the caller keeps running (NEVR-657).
fn log_event(event: &str) {
    write_seam_line_checked(&mut std::io::stderr().lock(), &seam_line(event));
}

/// The one checked seam write every seam line rides (NEVR-657, Multica #10566
/// law): write `line` plus one trailing newline — the exact bytes `eprintln!`
/// emitted, so the Linux launch-smoke grep contract and the hook's
/// "both outputs stay byte-identical" invariant hold by construction — and
/// survive a dead sink. `eprintln!` panics if the write fails (std: "Panics
/// if writing to io::stderr fails"; Rust ignores SIGPIPE, so a broken pipe
/// surfaces as `Err(EPIPE)`, not a signal), which killed the app at the very
/// first log line in #10566. Here a failed write drops this one line and
/// returns. Generic over the writer (not hard-wired to stderr) so a unit
/// test can prove the no-panic contract with a failing writer. Best-effort
/// by design: the `let _` is the law, not an oversight — never "fix" it.
fn write_seam_line_checked(writer: &mut dyn Write, line: &str) {
    let _ = writeln!(writer, "{line}");
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
/// appended to the persistent log file. All IO is best-effort: a panic hook
/// must never panic itself, so its writes ride [`write_seam_line_checked`] —
/// on a dead sink the record is dropped, not the process (NEVR-657).
fn panic_hook(info: &std::panic::PanicHookInfo<'_>) {
    let line = seam_line(&format!("panic {}", panic_record(info)));
    emit_panic_record_line(&mut std::io::stderr().lock(), &line);
}

/// The panic hook's write half, split out so the dead-sink law is testable
/// without owning the process's stderr: record `line` on the stderr seam,
/// then append it to the persistent log file. Both writes are checked —
/// inside a panic hook, a write failure must drop the record, never panic
/// (a panic-in-panic is an abort).
fn emit_panic_record_line(stderr: &mut dyn Write, line: &str) {
    write_seam_line_checked(stderr, line);
    if let Some(Some(path)) = PANIC_LOG_FILE.get() {
        if let Ok(mut file) = open_log_file(path) {
            write_seam_line_checked(&mut file, line);
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

    /// A sink whose every write fails — the in-process stand-in for a dead
    /// stderr pipe. A real EPIPE cannot be constructed safely inside a cargo
    /// test (the harness owns the process's stderr), but it needs none: what
    /// must be proven is the helper's behavior on `Err`, whatever produced it.
    struct FailingWriter;

    impl Write for FailingWriter {
        fn write(&mut self, _buf: &[u8]) -> std::io::Result<usize> {
            Err(std::io::Error::new(
                std::io::ErrorKind::BrokenPipe,
                "failing writer: dead-sink stand-in (EPIPE)",
            ))
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Err(std::io::Error::new(
                std::io::ErrorKind::BrokenPipe,
                "failing writer: dead-sink stand-in (EPIPE)",
            ))
        }
    }

    /// NEVR-657 acceptance 3 — byte identity: the checked helper emits exactly
    /// the bytes the old `eprintln!` did — one seam line, one trailing
    /// newline — so the Linux launch-smoke grep contract is unchanged.
    /// Negative control: make the helper emit anything else (drop the
    /// newline, alter the line) and this test goes red.
    #[test]
    fn seam_write_emits_eprintln_identical_bytes() {
        let mut sink = Vec::new();
        write_seam_line_checked(&mut sink, &seam_line("startup"));
        assert_eq!(
            String::from_utf8(sink).expect("seam line is utf-8"),
            "service.name=stellarc-desktop event=startup\n"
        );
    }

    /// NEVR-657 acceptance 4 — the dead-sink law (Multica #10566): a seam
    /// write to a failing writer must drop the line and return normally,
    /// never panic. `eprintln!` panics here — and a panic inside the panic
    /// hook is an abort. Covers both seam consumers: the helper itself, and
    /// the panic hook's write half ([`emit_panic_record_line`]).
    /// Negative control: restore a panicking write inside the helper
    /// (`.expect("stderr")` or a plain `eprintln!`) and this test goes red.
    #[test]
    fn seam_writes_survive_a_failing_writer() {
        let mut failing = FailingWriter;
        write_seam_line_checked(&mut failing, &seam_line("startup"));
        emit_panic_record_line(
            &mut failing,
            &seam_line("panic message=\"boom\" location=unknown"),
        );
        // Both calls returned — that is the whole assertion. The hook-path
        // call may or may not find a sink file set by its sibling test; the
        // file half is already checked, so it cannot panic either way.
    }

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
