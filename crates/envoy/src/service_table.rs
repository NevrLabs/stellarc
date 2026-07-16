//! Managed binary app runtime for the envoy (APP-1, ADR 0015).
//!
//! [`ServiceTable`] manages transient systemd user units for binary apps. Each
//! app runs in a dedicated `olympus-app-<escaped-id>.service` unit with
//! `Restart=always` and `StartLimitBurst=3` so systemd owns restart counting.
//! A Tokio health probe loop monitors the loopback HTTP endpoint and reports
//! status changes via an mpsc channel. Quarantine (start-limit-hit) requires an
//! explicit stop/remove to clear — Hall never auto-heals a quarantined app.
//!
//! # Port contract
//! Envoy allocates an ephemeral `127.0.0.1:0` listener, reads the assigned
//! port, closes the listener, then injects `PORT=<n>` into the unit. There is
//! an unavoidable TOCTOU race between close and bind by the app process.
//! Document this as the v1 ceiling; use systemd socket activation for v2.
//!
//! # Remote AppHost policy
//! The `package_root` in ServiceSpec is a Hall-local filesystem path. APP-1
//! v1 only supports same-host execution — callers must validate the host
//! before sending EnsureService. Remote iroh AppHosts are rejected with a
//! clear error; there is no package transfer protocol in APP-1.

use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Result};
use olympus_proto::frames::{EnvoyFrame, ServiceSpec, ServiceStatus};
use tokio::sync::{broadcast, RwLock};

/// State maintained per managed app.
#[allow(dead_code)] // fields used via Arc<ServiceEntry> passed to monitor tasks
struct ServiceEntry {
    /// The allocated loopback port.
    port: u16,
    /// Deterministic systemd unit name.
    unit: String,
    /// App state directory (preserved across restarts).
    state_dir: PathBuf,
    /// Current status (shared with the monitor task).
    status: Arc<std::sync::Mutex<ServiceStatus>>,
    /// Handle to abort the monitor task on stop.
    monitor_abort: tokio::task::AbortHandle,
}

/// The runtime seam for launching and stopping app units. Kept in-file
/// so there is no factory/registry until APP-2.
pub(crate) trait AppRuntime: Send + Sync {
    /// Launch (or idempotently ensure) the transient unit. Returns the
    /// allocated port or an error.
    fn ensure(&self, spec: &ServiceSpec, port: u16) -> Result<()>;
    /// Stop the unit and wait for it to fully stop.
    fn stop(&self, unit: &str) -> Result<()>;
    /// Query systemd for the unit's active/sub-state and restart count.
    fn inspect(&self, unit: &str) -> Result<UnitState>;
}

#[derive(Debug, Clone)]
pub(crate) struct UnitState {
    pub active_state: String,
    pub sub_state: String,
    pub result: String,
    #[allow(dead_code)] // available for logging/diagnostics; not gated by tests
    pub n_restarts: u32,
}

impl UnitState {
    fn is_quarantined(&self) -> bool {
        self.active_state == "failed" || self.result == "start-limit-hit"
    }
    fn is_active(&self) -> bool {
        self.active_state == "active" && self.sub_state == "running"
    }
}

/// Real systemd-run backend.
pub(crate) struct SystemdBinaryRuntime;

impl AppRuntime for SystemdBinaryRuntime {
    fn ensure(&self, spec: &ServiceSpec, port: u16) -> Result<()> {
        let unit = service_unit_name(&spec.app_id);
        let package_root = Path::new(&spec.package_root);
        let entrypoint = validate_entrypoint(package_root, &spec.entrypoint)?;

        let mut cmd = std::process::Command::new("systemd-run");
        cmd.args([
            "--user",
            &format!("--unit={unit}"),
            "--collect",
            "--property=Restart=always",
            "--property=RestartSec=1s",
            "--property=StartLimitIntervalSec=300s",
            "--property=StartLimitBurst=3",
            &format!("--working-directory={}", package_root.display()),
        ]);
        if let Some(max) = spec.memory_max {
            cmd.arg(format!("--property=MemoryMax={max}"));
        }
        // Envoy-owned PORT injection.
        cmd.arg(format!("--setenv=PORT={port}"));
        for (key, value) in &spec.env {
            validate_env_key(key)?;
            // Only template ${app_state} — reject any other ${...} tokens.
            let expanded = expand_env_value(value, &spec.app_id)?;
            cmd.arg(format!("--setenv={key}={expanded}"));
        }
        if let Some(cred) = &spec.credential_path {
            // Credential path is written by Hall; pass via a file, not env,
            // so it doesn't appear in D-Bus unit metadata.
            cmd.arg(format!("--setenv=OLYMPUS_CREDENTIAL_PATH={cred}"));
        }
        cmd.arg("--");
        cmd.arg(&entrypoint);

        let status = cmd.status().context("launching systemd-run")?;
        anyhow::ensure!(status.success(), "systemd-run failed: {}", status);
        Ok(())
    }

    fn stop(&self, unit: &str) -> Result<()> {
        std::process::Command::new("systemctl")
            .args(["--user", "stop", unit])
            .status()
            .context("systemctl stop")?;
        Ok(())
    }

    fn inspect(&self, unit: &str) -> Result<UnitState> {
        let out = std::process::Command::new("systemctl")
            .args([
                "--user",
                "show",
                unit,
                "--property=ActiveState",
                "--property=SubState",
                "--property=Result",
                "--property=NRestarts",
            ])
            .output()
            .context("systemctl show")?;
        let text = String::from_utf8_lossy(&out.stdout);
        let mut active_state = String::from("inactive");
        let mut sub_state = String::new();
        let mut result = String::new();
        let mut n_restarts = 0u32;
        for line in text.lines() {
            if let Some(v) = line.strip_prefix("ActiveState=") {
                active_state = v.to_string();
            } else if let Some(v) = line.strip_prefix("SubState=") {
                sub_state = v.to_string();
            } else if let Some(v) = line.strip_prefix("Result=") {
                result = v.to_string();
            } else if let Some(v) = line.strip_prefix("NRestarts=") {
                n_restarts = v.parse().unwrap_or(0);
            }
        }
        Ok(UnitState {
            active_state,
            sub_state,
            result,
            n_restarts,
        })
    }
}

/// ServiceTable — the envoy-side managed app registry.
///
/// Keyed by app_id (Hall-globally unique per settled v1 contract). Statuses
/// are broadcast as changed-only full snapshots; each connection subscribes to
/// a new receiver. Broadcast capacity 64: old receivers that lag too far just
/// miss intermediate snapshots (level-triggered state; Hall rejoins on reconnect).
#[derive(Clone)]
pub struct ServiceTable {
    root: Arc<PathBuf>,
    runtime: Arc<dyn AppRuntime>,
    entries: Arc<RwLock<HashMap<String, Arc<ServiceEntry>>>>,
    status_tx: broadcast::Sender<EnvoyFrame>,
}

impl ServiceTable {
    pub fn new(root: PathBuf) -> Result<Self> {
        std::fs::create_dir_all(&root)
            .with_context(|| format!("creating service workspace {}", root.display()))?;
        let (status_tx, _) = broadcast::channel(64);
        Ok(Self {
            root: Arc::new(root),
            runtime: Arc::new(SystemdBinaryRuntime),
            entries: Arc::new(RwLock::new(HashMap::new())),
            status_tx,
        })
    }

    /// Subscribe to service status updates (one receiver per connection).
    pub fn subscribe(&self) -> broadcast::Receiver<EnvoyFrame> {
        self.status_tx.subscribe()
    }

    #[cfg(test)]
    pub fn with_runtime(root: PathBuf, runtime: Arc<dyn AppRuntime>) -> Result<Self> {
        std::fs::create_dir_all(&root)?;
        let (status_tx, _) = broadcast::channel(64);
        Ok(Self {
            root: Arc::new(root),
            runtime,
            entries: Arc::new(RwLock::new(HashMap::new())),
            status_tx,
        })
    }

    /// Snapshot of all current service statuses.
    pub async fn statuses(&self) -> Vec<ServiceStatus> {
        let entries = self.entries.read().await;
        entries
            .values()
            .map(|e| e.status.lock().unwrap().clone())
            .collect()
    }

    /// Ensure a managed app is running. Idempotent: if the app is already
    /// running/starting it is a no-op (returns Ok without re-launching).
    /// Rejects quarantined entries — caller must stop first.
    pub async fn ensure(&self, spec: ServiceSpec) -> Result<()> {
        validate_app_id(&spec.app_id)?;
        validate_health_path(&spec.health_path)?;
        for key in spec.env.keys() {
            validate_env_key(key)?;
        }

        let mut entries = self.entries.write().await;
        if let Some(existing) = entries.get(&spec.app_id) {
            let st = existing.status.lock().unwrap();
            if st.state == "quarantined" {
                anyhow::bail!(
                    "app {} is quarantined; stop it before re-ensuring",
                    spec.app_id
                );
            }
            if st.state != "stopped" {
                // Already running/starting — idempotent no-op.
                return Ok(());
            }
        }

        // Create per-app state directory (preserved forever; never GC'd here).
        let state_dir = self
            .root
            .join(&spec.organization_id)
            .join("apps")
            .join(&spec.app_id);
        std::fs::create_dir_all(&state_dir)
            .with_context(|| format!("creating app state dir {}", state_dir.display()))?;
        secure_dir(&state_dir)?;

        // Allocate port: bind :0, read assigned port, close, pass to unit.
        // ponytail: TOCTOU bind race accepted as v1 ceiling; use systemd socket activation for v2.
        let port = allocate_port()?;
        let unit = service_unit_name(&spec.app_id);
        let app_id = spec.app_id.clone();
        let health_path = spec.health_path.clone();

        self.runtime.ensure(&spec, port)?;

        let status = Arc::new(std::sync::Mutex::new(ServiceStatus {
            app_id: app_id.clone(),
            state: "starting".into(),
            health: "unknown".into(),
            port: Some(port),
        }));

        // Spawn health probe/status monitor task.
        let monitor_status = status.clone();
        let monitor_tx = self.status_tx.clone();
        let monitor_runtime = self.runtime.clone();
        let monitor_unit = unit.clone();
        let monitor_app_id = app_id.clone();
        let handle = tokio::spawn(async move {
            run_monitor(
                monitor_app_id,
                monitor_unit,
                port,
                health_path,
                monitor_status,
                monitor_tx,
                monitor_runtime,
            )
            .await;
        });

        entries.insert(
            app_id,
            Arc::new(ServiceEntry {
                port,
                unit,
                state_dir,
                status,
                monitor_abort: handle.abort_handle(),
            }),
        );

        Ok(())
    }

    /// Drain then stop. Marks as draining first (so edge removes the route),
    /// then stops the unit. App state dir is preserved.
    pub async fn drain(&self, app_id: &str) -> Result<()> {
        let entry = {
            let entries = self.entries.read().await;
            entries.get(app_id).cloned()
        };
        let Some(entry) = entry else {
            anyhow::bail!("unknown app: {app_id}");
        };
        self.set_state_and_emit(&entry.status, "draining", &self.status_tx);
        self.runtime.stop(&entry.unit)?;
        self.remove_entry(app_id).await;
        Ok(())
    }

    /// Stop and remove. App state dir preserved.
    pub async fn stop(&self, app_id: &str) -> Result<()> {
        let entry = {
            let entries = self.entries.read().await;
            entries.get(app_id).cloned()
        };
        let Some(entry) = entry else {
            anyhow::bail!("unknown app: {app_id}");
        };
        self.runtime.stop(&entry.unit)?;
        self.remove_entry(app_id).await;
        Ok(())
    }

    async fn remove_entry(&self, app_id: &str) {
        let mut entries = self.entries.write().await;
        if let Some(e) = entries.remove(app_id) {
            e.monitor_abort.abort();
            // Emit stopped snapshot so Hall/edge removes the route.
            let mut st = e.status.lock().unwrap();
            st.state = "stopped".into();
            st.health = "unhealthy".into();
            let _ = self.status_tx.send(EnvoyFrame::Services {
                services: vec![st.clone()],
            });
        }
    }

    fn set_state_and_emit(
        &self,
        status: &Arc<std::sync::Mutex<ServiceStatus>>,
        state: &str,
        tx: &broadcast::Sender<EnvoyFrame>,
    ) {
        let mut st = status.lock().unwrap();
        st.state = state.into();
        let _ = tx.send(EnvoyFrame::Services {
            services: vec![st.clone()],
        });
    }
}

/// The monitor task runs forever (until abort). It alternates between polling
/// systemd state and probing the HTTP health endpoint. Emits EnvoyFrame::Services
/// only when something changes.
async fn run_monitor(
    app_id: String,
    unit: String,
    port: u16,
    health_path: String,
    status: Arc<std::sync::Mutex<ServiceStatus>>,
    tx: broadcast::Sender<EnvoyFrame>,
    runtime: Arc<dyn AppRuntime>,
) {
    let backoffs = [100u64, 250, 500, 1000, 5000];
    let mut backoff_idx = 0usize;

    loop {
        let delay = Duration::from_millis(backoffs[backoff_idx.min(backoffs.len() - 1)]);
        tokio::time::sleep(delay).await;

        // Check systemd unit state.
        match runtime.inspect(&unit) {
            Ok(unit_state) if unit_state.is_quarantined() => {
                let changed = {
                    let mut st = status.lock().unwrap();
                    let was = st.state.clone();
                    st.state = "quarantined".into();
                    st.health = "unhealthy".into();
                    st.state != was || st.health != "unhealthy"
                };
                if changed {
                    let st = status.lock().unwrap().clone();
                    tracing::warn!(app = %app_id, "service quarantined (start-limit-hit)");
                    let _ = tx.send(EnvoyFrame::Services { services: vec![st] });
                }
                // Quarantine is terminal; stop probing until explicit stop.
                return;
            }
            Ok(unit_state) if !unit_state.is_active() => {
                // Unit starting up or between restarts — keep looping.
                backoff_idx = (backoff_idx + 1).min(backoffs.len() - 1);
                continue;
            }
            Ok(_) => {
                // Unit is active/running — proceed to health probe.
            }
            Err(e) => {
                tracing::debug!(app = %app_id, error = %e, "systemd inspect failed");
                backoff_idx = (backoff_idx + 1).min(backoffs.len() - 1);
                continue;
            }
        }

        // Health probe: raw Tokio TCP, HTTP/1.0 GET.
        let health_ok = probe_http(port, &health_path).await;
        let (new_state, new_health) = if health_ok {
            ("running", "healthy")
        } else {
            ("running", "unhealthy")
        };

        let changed = {
            let mut st = status.lock().unwrap();
            let old_state = st.state.clone();
            let old_health = st.health.clone();
            st.state = new_state.into();
            st.health = new_health.into();
            st.state != old_state || st.health != old_health
        };
        if changed {
            let st = status.lock().unwrap().clone();
            let _ = tx.send(EnvoyFrame::Services { services: vec![st] });
        }

        // Back off to poll interval once stable.
        backoff_idx = if health_ok { 0 } else { backoff_idx.saturating_add(1) };
    }
}

/// Raw Tokio TCP HTTP/1.0 health probe. Returns true iff status is 2xx.
async fn probe_http(port: u16, path: &str) -> bool {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let connect = tokio::net::TcpStream::connect(("127.0.0.1", port));
    let mut stream = match tokio::time::timeout(Duration::from_secs(2), connect).await {
        Ok(Ok(s)) => s,
        _ => return false,
    };
    let request = format!("GET {path} HTTP/1.0\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n");
    if stream.write_all(request.as_bytes()).await.is_err() {
        return false;
    }
    let mut buf = [0u8; 16];
    match tokio::time::timeout(Duration::from_secs(2), stream.read_exact(&mut buf)).await {
        Ok(Ok(_)) => {}
        _ => return false,
    }
    // HTTP/1.0 200, 201, …, 299
    buf.starts_with(b"HTTP/1.") && buf.get(9..12).is_some_and(|s| s[0] == b'2')
}

// ── Validation helpers ──────────────────────────────────────────────────────

/// Deterministic transient systemd unit name for an app id.
/// systemd-escape is not invoked — we enforce strict slug chars below.
fn service_unit_name(app_id: &str) -> String {
    // app_id contains only alphanumeric, '-', '_', '.'; safe in unit names.
    format!("olympus-app-{app_id}.service")
}

fn validate_app_id(id: &str) -> Result<()> {
    anyhow::ensure!(
        !id.is_empty()
            && id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.')),
        "invalid app_id: {id}"
    );
    Ok(())
}

fn validate_health_path(path: &str) -> Result<()> {
    anyhow::ensure!(
        path.starts_with('/') && !path.contains('\r') && !path.contains('\n'),
        "health_path must start with '/' and contain no CR/LF: {path}"
    );
    Ok(())
}

/// Env key must be a safe identifier: ASCII letters, digits, underscore only.
fn validate_env_key(key: &str) -> Result<()> {
    anyhow::ensure!(
        !key.is_empty()
            && key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
            && !key.starts_with(|c: char| c.is_ascii_digit()),
        "invalid env key: {key}"
    );
    anyhow::ensure!(key != "PORT", "PORT is reserved; envoy owns it");
    Ok(())
}

/// Expand exactly `${app_state}` in env values; reject any other `${...}`.
fn expand_env_value(value: &str, app_id: &str) -> Result<String> {
    if !value.contains("${") {
        return Ok(value.to_string());
    }
    // Replace all occurrences of ${app_state} first.
    let expanded = value.replace("${app_state}", app_id);
    // Now reject any remaining ${...} tokens.
    anyhow::ensure!(
        !expanded.contains("${"),
        "unknown template token in env value: {value}"
    );
    Ok(expanded)
}

/// Validate and canonicalize the entrypoint. Must be a relative path with no
/// parent-dir traversal, remaining under package_root after joining.
/// Returns the absolute canonical path.
fn validate_entrypoint(package_root: &Path, entrypoint: &str) -> Result<PathBuf> {
    let rel = Path::new(entrypoint);
    anyhow::ensure!(!rel.is_absolute(), "entrypoint must be relative: {entrypoint}");
    for component in rel.components() {
        anyhow::ensure!(
            matches!(component, Component::Normal(_)),
            "entrypoint contains path traversal: {entrypoint}"
        );
    }
    let abs = package_root.join(rel);
    anyhow::ensure!(
        abs.exists(),
        "entrypoint not found: {}",
        abs.display()
    );
    anyhow::ensure!(
        is_executable(&abs),
        "entrypoint is not executable: {}",
        abs.display()
    );
    Ok(abs)
}

fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    std::fs::metadata(path)
        .map(|m| m.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

/// Allocate an ephemeral loopback port: bind :0, read port, close.
fn allocate_port() -> Result<u16> {
    let listener = std::net::TcpListener::bind("127.0.0.1:0")?;
    Ok(listener.local_addr()?.port())
}

fn secure_dir(path: &Path) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700))
        .with_context(|| format!("setting permissions on {}", path.display()))
}

// ── Unit tests ─────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    /// Fake AppRuntime for unit tests — no systemd, no filesystem exec.
    struct FakeRuntime {
        /// Injected states keyed by unit name.
        states: Mutex<HashMap<String, UnitState>>,
        /// Track what was launched.
        launched: Mutex<Vec<(String, u16)>>,
        stopped: Mutex<Vec<String>>,
    }

    impl FakeRuntime {
        fn new() -> Arc<Self> {
            Arc::new(Self {
                states: Mutex::new(HashMap::new()),
                launched: Mutex::new(Vec::new()),
                stopped: Mutex::new(Vec::new()),
            })
        }

        fn set_state(&self, unit: &str, active: &str, sub: &str, result: &str, n: u32) {
            self.states.lock().unwrap().insert(
                unit.to_string(),
                UnitState {
                    active_state: active.to_string(),
                    sub_state: sub.to_string(),
                    result: result.to_string(),
                    n_restarts: n,
                },
            );
        }
    }

    impl AppRuntime for FakeRuntime {
        fn ensure(&self, spec: &ServiceSpec, port: u16) -> Result<()> {
            self.launched
                .lock()
                .unwrap()
                .push((spec.app_id.clone(), port));
            Ok(())
        }
        fn stop(&self, unit: &str) -> Result<()> {
            self.stopped.lock().unwrap().push(unit.to_string());
            Ok(())
        }
        fn inspect(&self, unit: &str) -> Result<UnitState> {
            Ok(self
                .states
                .lock()
                .unwrap()
                .get(unit)
                .cloned()
                .unwrap_or(UnitState {
                    active_state: "inactive".into(),
                    sub_state: "".into(),
                    result: "success".into(),
                    n_restarts: 0,
                }))
        }
    }

    fn make_table(rt: Arc<dyn AppRuntime>) -> (ServiceTable, broadcast::Receiver<EnvoyFrame>) {
        let dir = tempfile::tempdir().unwrap();
        let table = ServiceTable::with_runtime(dir.path().into(), rt).unwrap();
        let rx = table.subscribe();
        (table, rx)
    }

    fn sample_spec(app_id: &str) -> ServiceSpec {
        // We can't run real binaries in unit tests, so we use FakeRuntime which
        // skips validate_entrypoint. Build a spec that would pass pure
        // validation checks.
        ServiceSpec {
            app_id: app_id.to_string(),
            organization_id: "org-1".into(),
            package_root: "/tmp/fake-pkg".into(),
            entrypoint: "bin/server".into(),
            env: std::collections::BTreeMap::new(),
            health_path: "/health".into(),
            memory_max: None,
            credential_path: None,
        }
    }

    // ServiceTable::ensure bypasses validate_entrypoint via FakeRuntime, but
    // we need to override the validation that happens before calling runtime.ensure.
    // Let's patch the ensure method path — it calls validate_app_id/health_path
    // from the public ensure(), then calls runtime.ensure(). The fake runtime
    // just records the call. This works as-is since validate_entrypoint is only
    // called inside SystemdBinaryRuntime::ensure.

    #[tokio::test]
    async fn ensure_idempotent() {
        let rt = FakeRuntime::new();
        let (table, _rx) = make_table(rt.clone());
        table.ensure(sample_spec("my.app")).await.unwrap();
        // Second ensure on a running app is a no-op.
        table.ensure(sample_spec("my.app")).await.unwrap();
        assert_eq!(rt.launched.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn stop_aborts_monitor_and_emits_stopped() {
        let rt = FakeRuntime::new();
        let (table, mut rx) = make_table(rt.clone());
        table.ensure(sample_spec("my.app")).await.unwrap();
        table.stop("my.app").await.unwrap();

        // Should have received a "stopped" snapshot.
        let mut found_stopped = false;
        while let Ok(frame) = rx.try_recv() {
            if let EnvoyFrame::Services { services } = frame {
                if services.iter().any(|s| s.state == "stopped") {
                    found_stopped = true;
                }
            }
        }
        assert!(found_stopped);
    }

    #[tokio::test]
    async fn drain_emits_draining_then_stopped() {
        let rt = FakeRuntime::new();
        let (table, mut rx) = make_table(rt.clone());
        table.ensure(sample_spec("drain.app")).await.unwrap();
        table.drain("drain.app").await.unwrap();

        let mut states: Vec<String> = Vec::new();
        while let Ok(frame) = rx.try_recv() {
            if let EnvoyFrame::Services { services } = frame {
                for s in services {
                    states.push(s.state.clone());
                }
            }
        }
        assert!(states.contains(&"draining".to_string()), "states: {states:?}");
        assert!(states.contains(&"stopped".to_string()), "states: {states:?}");
    }

    #[tokio::test]
    async fn state_dir_preserved_after_stop() {
        let dir = tempfile::tempdir().unwrap();
        let rt = FakeRuntime::new();
        let table = ServiceTable::with_runtime(dir.path().into(), rt).unwrap();
        table.ensure(sample_spec("keep.app")).await.unwrap();
        let state_dir = dir.path().join("org-1").join("apps").join("keep.app");
        assert!(state_dir.exists(), "state dir must exist after ensure");
        table.stop("keep.app").await.unwrap();
        assert!(state_dir.exists(), "state dir must survive stop");
    }

    #[test]
    fn env_template_expands_app_state_only() {
        assert_eq!(
            expand_env_value("${app_state}/data", "org.app").unwrap(),
            "org.app/data"
        );
        assert_eq!(
            expand_env_value("no-template", "x").unwrap(),
            "no-template"
        );
        assert!(expand_env_value("${unknown}", "x").is_err());
    }

    #[test]
    fn reserved_port_env_key_rejected() {
        assert!(validate_env_key("PORT").is_err());
    }

    #[test]
    fn invalid_env_keys_rejected() {
        assert!(validate_env_key("").is_err());
        assert!(validate_env_key("1BAD").is_err());
        assert!(validate_env_key("BAD KEY").is_err());
        assert!(validate_env_key("GOOD_KEY").is_ok());
    }

    #[test]
    fn health_path_crlf_rejected() {
        assert!(validate_health_path("/health\r\n").is_err());
        assert!(validate_health_path("health").is_err()); // no leading /
        assert!(validate_health_path("/ok").is_ok());
    }

    #[test]
    fn entrypoint_traversal_rejected() {
        let root = Path::new("/tmp");
        assert!(validate_entrypoint(root, "../escape").is_err());
        assert!(validate_entrypoint(root, "/absolute").is_err());
    }

    #[tokio::test]
    async fn quarantined_app_blocks_re_ensure() {
        let rt = FakeRuntime::new();
        let (table, _rx) = make_table(rt.clone());
        table.ensure(sample_spec("q.app")).await.unwrap();

        // Force-set quarantined state directly.
        {
            let entries = table.entries.read().await;
            let e = entries.get("q.app").unwrap();
            let mut st = e.status.lock().unwrap();
            st.state = "quarantined".into();
        }

        let err = table.ensure(sample_spec("q.app")).await.unwrap_err();
        assert!(err.to_string().contains("quarantined"), "{err}");
    }

    #[test]
    fn probe_http_returns_false_for_nothing_listening() {
        // Nothing should be listening on port 1, so health probe returns false.
        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt.block_on(probe_http(1, "/health"));
        assert!(!result);
    }
}
