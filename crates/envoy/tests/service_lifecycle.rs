//! Integration tests for ServiceTable (APP-1, ADR 0015).
//!
//! These tests use the real SystemdBinaryRuntime and require:
//! - A systemd user session (`systemctl --user status` works).
//! - The `olympus-echoapp` fixture binary, built with:
//!   `cargo build --release -p olympus-echoapp --manifest-path fixtures/apps/echoapp/Cargo.toml`
//!   and the binary at `fixtures/apps/echoapp/target/release/olympus-echoapp` made executable.
//!
//! ALL tests in this file are `#[ignore]` and must be run explicitly:
//!   cargo test -p olympus-envoy --test service_lifecycle -- --ignored --nocapture
//!
//! The tests use unique, timestamped app/unit IDs and clean up after themselves.
//! They NEVER touch `~/.olympus` or live services.
use std::path::Path;
use std::time::Duration;

use olympus_envoy::service_table::ServiceTable;
use olympus_proto::frames::{EnvoyFrame, ServiceSpec};

/// Path to the compiled echoapp fixture relative to the workspace root.
/// Must be built before running these tests.
const ECHOAPP_REL: &str = "fixtures/apps/echoapp/target/release/olympus-echoapp";

fn echoapp_path() -> std::path::PathBuf {
    // Resolve relative to workspace root (two levels up from crates/envoy).
    let manifest = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    manifest.join("../..").join(ECHOAPP_REL)
}

fn systemd_available() -> bool {
    std::process::Command::new("systemctl")
        .args(["--user", "status"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn make_spec(app_id: &str, package_root: &Path) -> ServiceSpec {
    ServiceSpec {
        app_id: app_id.to_string(),
        organization_id: "test-org".to_string(),
        package_root: package_root.to_string_lossy().to_string(),
        entrypoint: "bin/echoapp".to_string(),
        env: std::collections::BTreeMap::new(),
        health_path: "/health".to_string(),
        memory_max: None,
        credential_path: None,
    }
}

/// Build a fresh ServiceTable in a temp dir. Returns (table, rx, tempdir).
fn make_table() -> (ServiceTable, tokio::sync::broadcast::Receiver<EnvoyFrame>, tempfile::TempDir) {
    let dir = tempfile::tempdir().unwrap();
    let table = ServiceTable::new(dir.path().into()).unwrap();
    let rx = table.subscribe();
    (table, rx, dir)
}

/// Set up a fake package root with the echoapp binary at bin/echoapp.
fn make_package_root(dir: &std::path::Path) -> std::path::PathBuf {
    let bin_dir = dir.join("bin");
    std::fs::create_dir_all(&bin_dir).unwrap();
    let src = echoapp_path();
    let dst = bin_dir.join("echoapp");
    std::fs::copy(&src, &dst).expect("echoapp fixture binary not found; build it first");
    // Ensure executable bit.
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(&dst, std::fs::Permissions::from_mode(0o755)).unwrap();
    dir.to_path_buf()
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[tokio::test]
#[ignore = "requires systemd user session and built echoapp fixture"]
async fn service_lifecycle_ensure_healthy_stop() {
    if !systemd_available() {
        eprintln!("SKIP: systemd user session not available");
        return;
    }
    let pkg_dir = tempfile::tempdir().unwrap();
    let pkg_root = make_package_root(pkg_dir.path());
    let (table, mut rx, _root_dir) = make_table();

    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let app_id = format!("test.echo.{ts}");
    let spec = make_spec(&app_id, &pkg_root);

    // Ensure starts the app.
    table.ensure(spec).await.expect("ensure must succeed");

    // Wait up to 10s for healthy status.
    let healthy_deadline = tokio::time::Instant::now() + Duration::from_secs(10);
    let mut got_healthy = false;
    loop {
        if tokio::time::Instant::now() > healthy_deadline {
            break;
        }
        match tokio::time::timeout(Duration::from_secs(1), rx.recv()).await {
            Ok(Ok(EnvoyFrame::Services { services })) => {
                for s in &services {
                    if s.app_id == app_id && s.health == "healthy" {
                        got_healthy = true;
                        eprintln!("app {} healthy on port {:?}", app_id, s.port);
                    }
                }
                if got_healthy { break; }
            }
            _ => {}
        }
    }
    assert!(got_healthy, "app did not become healthy within 10s");

    // Stop: emits stopped snapshot, state dir persists.
    table.stop(&app_id).await.expect("stop must succeed");

    // Check unit is gone.
    let unit = format!("olympus-app-{app_id}.service");
    let out = std::process::Command::new("systemctl")
        .args(["--user", "is-active", &unit])
        .output()
        .unwrap();
    assert!(!out.status.success(), "unit should not be active after stop");

    eprintln!("PASS: service_lifecycle_ensure_healthy_stop");
}

#[tokio::test]
#[ignore = "requires systemd user session and built echoapp fixture"]
async fn service_lifecycle_drain() {
    if !systemd_available() {
        eprintln!("SKIP: systemd user session not available");
        return;
    }
    let pkg_dir = tempfile::tempdir().unwrap();
    let pkg_root = make_package_root(pkg_dir.path());
    let (table, mut rx, _root_dir) = make_table();

    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let app_id = format!("test.drain.{ts}");
    let spec = make_spec(&app_id, &pkg_root);
    table.ensure(spec).await.expect("ensure");

    // Wait for any status before drain.
    tokio::time::sleep(Duration::from_millis(500)).await;

    table.drain(&app_id).await.expect("drain");

    // Collect emitted states.
    let mut states = Vec::new();
    let deadline = tokio::time::Instant::now() + Duration::from_secs(3);
    while tokio::time::Instant::now() < deadline {
        match tokio::time::timeout(Duration::from_millis(200), rx.recv()).await {
            Ok(Ok(EnvoyFrame::Services { services })) => {
                for s in services {
                    if s.app_id == app_id {
                        states.push(s.state.clone());
                    }
                }
            }
            _ => break,
        }
    }
    assert!(
        states.contains(&"draining".to_string()) || states.contains(&"stopped".to_string()),
        "drain should emit draining or stopped, got: {states:?}"
    );
    eprintln!("PASS: service_lifecycle_drain");
}

#[tokio::test]
#[ignore = "requires systemd user session and built echoapp fixture"]
async fn service_lifecycle_state_dir_preserved_after_stop() {
    if !systemd_available() {
        eprintln!("SKIP: systemd user session not available");
        return;
    }
    let pkg_dir = tempfile::tempdir().unwrap();
    let pkg_root = make_package_root(pkg_dir.path());
    let root_dir = tempfile::tempdir().unwrap();
    let table = ServiceTable::new(root_dir.path().into()).unwrap();

    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let app_id = format!("test.statedir.{ts}");
    let spec = ServiceSpec {
        app_id: app_id.clone(),
        organization_id: "test-org".to_string(),
        package_root: pkg_root.to_string_lossy().to_string(),
        entrypoint: "bin/echoapp".to_string(),
        env: std::collections::BTreeMap::new(),
        health_path: "/health".to_string(),
        memory_max: None,
        credential_path: None,
    };
    table.ensure(spec).await.expect("ensure");

    let state_dir = root_dir.path().join("test-org").join("apps").join(&app_id);
    assert!(state_dir.exists(), "state dir must exist after ensure");

    table.stop(&app_id).await.expect("stop");
    assert!(state_dir.exists(), "state dir must survive stop");

    eprintln!("PASS: service_lifecycle_state_dir_preserved_after_stop");
}
