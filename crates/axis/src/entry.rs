//! Stellarc Axis — the control-plane entrypoint (ADR 0008 S6).
//!
//! On boot: import the operator's Hermes `state.db` into a fresh event log,
//! build the in-memory views + search index from that log, then serve the REST
//! + WSS API on `127.0.0.1:8787` behind the per-install token.
//!
//! Axis owns the event log, views, search, REST/WS, and the fleet node
//! registry. Agent runtimes (the actual `hermes acp` children) live in the
//! separate `stellarc-orbit` binary — Axis drives them over UDS via the
//! `OrbitFrame` wire protocol. The local node is `stellarc-orbit@1` over UDS,
//! not an in-process pseudo-orbit.
//!
//! The event log is rebuilt from `state.db` on every boot for the MVP (cheap,
//! deterministic, no migration story needed yet). Live sync (ADR §6.7) lands
//! later; for now the snapshot is taken at startup.

use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

use crate::{
    auth, import,
    node::NodeRegistry,
    search::SearchIndex,
    server::{self, AppState, ImportState},
    sync,
    vault::VaultStore,
    views::ViewManager,
};
use anyhow::{Context, Result};
use tokio::sync::{broadcast, RwLock};

/// Where Stellarc keeps its own INTERNAL state (event log, search index, token).
/// This is the dotted `~/.stellarc/` root from ADR 0005 §4, which ALSO holds the
/// org-scoped resource tree (`<org>/sessions/`, `<org>/repos/`, etc.). Internal
/// state files live directly under it; resources live under `<org>/`.
fn stellarc_home() -> Result<PathBuf> {
    if let Ok(dir) = std::env::var("STELLARC_HOME") {
        return Ok(PathBuf::from(dir));
    }
    let home = crate::home::home_dir()?;
    Ok(home.join(".stellarc"))
}

fn warn_if_obsolete_event_log_exists(home: &std::path::Path) {
    let obsolete = home.join("eventlog.redb");
    if obsolete.exists() {
        tracing::warn!(
            path = %obsolete.display(),
            "obsolete redb event log ignored; SQLite stellarc.db is the sole source of truth"
        );
    }
}

/// The default org slug for the single-operator case (ADR 0005 §3 — org replaces
/// context). Multi-org management is post-MVP; the MVP runs one org. Override
/// with `STELLARC_DEFAULT_ORG`.
pub fn default_org() -> String {
    std::env::var("STELLARC_DEFAULT_ORG").unwrap_or_else(|_| "default".to_string())
}

/// The on-disk root for an org's resources: `~/.stellarc/<org_slug>/` per ADR
/// 0005 §4. Holds `sessions/`, `repos/`, `vaults/`, `projects/`, etc.
fn org_workspace_root(org: &str) -> Result<PathBuf> {
    Ok(stellarc_home()?.join(org))
}

/// Locate the Hermes state.db (override with `HERMES_STATE_DB`).
fn hermes_state_db() -> Result<PathBuf> {
    if let Ok(p) = std::env::var("HERMES_STATE_DB") {
        return Ok(PathBuf::from(p));
    }
    let home = crate::home::home_dir()?;
    Ok(home.join(".hermes").join("state.db"))
}

#[tokio::main(flavor = "multi_thread", worker_threads = 4)]
pub async fn run() -> Result<()> {
    if std::env::args().any(|a| a == "--version" || a == "-V") {
        println!("stellarc axis {}", env!("CARGO_PKG_VERSION"));
        return Ok(());
    }

    tracing_subscriber::fmt()
        .with_target(false)
        .compact()
        .init();

    let home = stellarc_home()?;
    std::fs::create_dir_all(&home).with_context(|| format!("creating {}", home.display()))?;
    warn_if_obsolete_event_log_exists(&home);

    let token = auth::load_or_create_token()?;
    let capability_signer = Arc::new(
        crate::server::capability::CapabilitySigner::load_or_create(&home)
            .context("loading capability signing key")?,
    );
    let auth_store = Arc::new(
        crate::auth_store::AuthStore::open(&home.join("auth.sqlite"))
            .context("opening Axis authentication store")?,
    );
    let bootstrap_username = std::env::var("STELLARC_ADMIN_USERNAME").ok();
    let bootstrap_password = std::env::var("STELLARC_ADMIN_PASSWORD").ok();
    // Agent runtimes are child processes. Remove one-shot bootstrap secrets
    // before any runtime can inherit the Axis environment.
    std::env::remove_var("STELLARC_ADMIN_USERNAME");
    std::env::remove_var("STELLARC_ADMIN_PASSWORD");
    match (bootstrap_username, bootstrap_password) {
        (Some(username), Some(password)) => {
            auth_store
                .bootstrap_admin(&username, &password, &default_org(), "Default")
                .context("bootstrapping Axis administrator")?;
        }
        (None, None) => {}
        _ => {
            anyhow::bail!(
                "STELLARC_ADMIN_USERNAME and STELLARC_ADMIN_PASSWORD must be set together"
            )
        }
    }
    let session_cookie_secure = std::env::var("STELLARC_INSECURE_COOKIES").as_deref() != Ok("1");
    let allow_installation_token = std::env::var("STELLARC_ALLOW_INSTALLATION_TOKEN")
        .map(|value| !matches!(value.to_ascii_lowercase().as_str(), "0" | "false" | "off"))
        .unwrap_or(true);
    let profile = std::env::var("HERMES_PROFILE").unwrap_or_else(|_| "default".to_string());

    // ---- open the SQLite event log (sole source of truth for native data) ----
    let log_path = home.join("stellarc.db");
    let log = Arc::new(crate::event_log::EventLog::open(&log_path).context("opening event log")?);
    // Drop the previous boot's state.db-imported sessions so the re-index is
    // idempotent (native events survive a restart).
    log.retain_native().context("retaining native events")?;

    let state_db = hermes_state_db()?;
    let state_db_reader = crate::state_db_reader::StateDbReader::open(&state_db)
        .context("opening state.db reader")?;
    if let Some(ref r) = state_db_reader {
        tracing::info!(db = %r.path().display(), "state.db reader ready (lazy history)");
    }
    // ---- NATIVE-ONLY boot: rebuild views from the event log (Stellarc sessions,
    // cards, setup). The Hermes state.db session index runs AFTER bind. ----
    let mut views = ViewManager::new();
    views
        .replay(&log)
        .context("replaying native log into views")?;

    let mut search = SearchIndex::from_log(log.clone());
    search
        .build_from_log(&log)
        .context("building search index (native only)")?;

    // Snapshot counts BEFORE the Hermes import adds observed sessions — these
    // reflect Stellarc-native records only, so they stay stable across restarts.
    let snap_sessions: u64 = 0;
    let snap_messages: u64 = 0;

    // ---- assemble server state ----
    let (deltas, _rx) = broadcast::channel(1024);
    // `log` is already an Arc<crate::event_log::EventLog> (opened at the top); reuse it directly.
    let log_arc = log;
    let jobs =
        Arc::new(crate::jobs::JobService::open(log_arc.clone()).context("replaying durable jobs")?);
    let bridge = std::sync::Arc::new(
        crate::server::bridge_mgr::BridgeManager::with_factory(
            log_arc.clone(),
            std::sync::Arc::new(
                |_session_id,
                 spec: &crate::server::bridge_mgr::RuntimeSpec|
                 -> anyhow::Result<
                    std::sync::Arc<dyn crate::bridge::AgentRuntime>,
                > {
                    let cwd = spec
                        .cwd
                        .as_deref()
                        .filter(|c| !c.is_empty())
                        .map(String::from)
                        .unwrap_or_else(|| {
                            std::env::current_dir()
                                .map(|p| p.to_string_lossy().into_owned())
                                .unwrap_or_else(|_| ".".into())
                        });
                    let env = spec.env.clone();
                    // Route the chosen agent to the correct ACP adapter: Hermes
                    // profiles use `hermes acp`, while local CLI harnesses
                    // (Claude Code / Codex) use the pinned Zed ACP adapters.
                    let command = crate::bridge::hermes::acp_command_for_agent(
                        spec.agent.as_deref(),
                    );
                    // Select the ACP wire framing: Hermes uses newline-delimited
                    // JSON (the transport hermes acp actually uses), while
                    // Claude Code and Codex use Content-Length framing per the
                    // ACP specification.
                    let framing = crate::bridge::hermes::acp_framing_for_agent(
                        spec.agent.as_deref(),
                    );
                    let model_set_style =
                        crate::bridge::hermes::model_set_style_for_agent(
                            spec.agent.as_deref(),
                        );
                    let config = crate::bridge::hermes::HermesRuntimeConfig {
                        command,
                        cwd,
                        session_source: Some("stellarc".into()),
                        event_buffer: 256,
                        start_timeout_secs: 30,
                        mcp_servers: spec.mcp_servers.clone(),
                        env,
                        framing,
                        model_set_style,
                    };
                    Ok(crate::bridge::hermes::HermesAgentRuntime::new_arc(config))
                },
            ),
        )
        // Session spaces live at ~/.stellarc/<organization_id>/sessions/<session_id>/
        // (ADR 0005 §4). BridgeManager derives the organization directory from
        // validated session ownership for every creation/runtime path.
        .with_spaces_root(stellarc_home()?),
    );
    let sync_connected = Arc::new(AtomicBool::new(false));

    // ---- fleet node registry ----
    // ADR 0008 S6: the local node is NO LONGER an in-process pseudo-orbit.
    // It is stellarc-orbit@1 over UDS — the orbit binary connects and
    // registers itself at boot. Axis does not pre-register any node.
    let node_registry = NodeRegistry::with_inventory(&home)?;

    let mut state = AppState {
        storage_backend: log_arc.backend(),
        views: Arc::new(RwLock::new(views)),
        search: Arc::new(RwLock::new(search)),
        token: Arc::new(token.clone()),
        capability_signer,
        auth_store,
        allow_installation_token,
        session_cookie_secure,
        import_state: ImportState::running(), // Hermes import runs after bind (below)
        hermes_profile: Arc::new(profile),
        deltas,
        snapshot_sessions: snap_sessions,
        snapshot_messages: snap_messages,
        log: log_arc.clone(),
        jobs: jobs.clone(),
        bridge,
        sync_connected: sync_connected.clone(),
        irc: crate::irc::IrcBus::new(),
        nodes: node_registry.clone(),
        orbit_conns: crate::server::orbit_conn::OrbitConnections::with_log_and_jobs(
            log_arc.clone(),
            jobs,
        ),
        #[cfg(unix)]
        axis_pty: crate::server::terminal_ws::AxisTerminals::new(),
        proxy: crate::proxy::ProxyTable::new(),
        edge: crate::edge::EdgeManager::new(Arc::new(crate::edge::caddy::CaddyDriver::localhost(
            "127.0.0.1:8787",
        ))),
        vaults: Arc::new(VaultStore::new(org_workspace_root(&default_org())?)),
        state_db: state_db_reader.map(Arc::new),
        projects: Arc::new(crate::projects::ProjectStore::new(org_workspace_root(
            &default_org(),
        )?)),
        repos: Arc::new(crate::repos::RepoStore::new(
            &org_workspace_root(&default_org())?,
            &default_org(),
        )),
        enroll: crate::enroll::EnrollStore::new(),
        home: Arc::new(home.clone()),
        axis_iroh_id: None, // set below after endpoint creation
    };

    // Caddy may restart independently of Axis and lose its dynamic subtree.
    // Re-apply the full desired level periodically; the driver serializes its
    // writer and the full-subtree PATCH is idempotent.
    {
        let edge = state.edge.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(10));
            interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
            loop {
                interval.tick().await;
                if let Err(error) = edge.converge() {
                    tracing::debug!(%error, "edge reconciliation deferred");
                }
            }
        });
    }

    // Negative-polarity rollback flag: Orbit observation is default-on, so the
    // legacy Axis poll is disabled unless an operator explicitly sets this to
    // false/0/off.
    let disable_axis_statedb_poll = std::env::var("STELLARC_DISABLE_AXIS_STATEDB_POLL")
        .map(|value| !matches!(value.to_ascii_lowercase().as_str(), "0" | "false" | "off"))
        .unwrap_or(true);
    if !disable_axis_statedb_poll {
        let sync_log = Arc::clone(&log_arc);
        let sync_views = Arc::clone(&state.views);
        let sync_search = Arc::clone(&state.search);
        let sync_deltas = state.deltas.clone();
        let sync_state_db = state_db.clone();
        let sync_connected_flag = sync_connected.clone();
        std::thread::Builder::new()
            .name("stellarc-live-sync".into())
            .spawn(move || {
                tracing::info!(db = %sync_state_db.display(), "legacy Axis live sync worker starting");
                let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    sync::run_live_sync(
                        sync_state_db,
                        sync_log,
                        sync_views,
                        sync_search,
                        sync_deltas,
                        sync_connected_flag.clone(),
                    )
                }));
                sync_connected_flag.store(false, Ordering::SeqCst);
                match result {
                    Ok(Ok(())) => tracing::warn!("live sync worker loop returned (unexpected)"),
                    Ok(Err(err)) => tracing::error!(error = %err, "live sync worker errored"),
                    Err(_) => tracing::error!("live sync worker panicked"),
                }
            })
            .expect("spawn live sync thread");
    } else {
        tracing::info!("Axis state.db poll disabled; Orbit observation is authoritative");
    }

    // Spawn the iroh listener for REMOTE orbits (ADR 0008 §1, S7). Public n0
    // relays; peers are gated by the node-id allowlist in ~/.stellarc/axis.toml
    // (`allowed_orbits = ["<node-id>", ...]`) — fail closed: no file or empty
    // list means no remote orbits can connect (the endpoint still binds and
    // prints its node id so the operator can set up the allowlist).
    //
    // Must run BEFORE build_router: the router clones AppState, so
    // axis_iroh_id has to be set first or /api/nodes/axis-identity would
    // forever report null.
    {
        match crate::node::create_iroh_endpoint(&home).await {
            Ok((endpoint, node_id)) => {
                println!("axis iroh node id: {node_id}");
                tracing::info!(node_id = %node_id, "axis iroh endpoint bound");
                state.axis_iroh_id = Some(Arc::new(node_id.to_string()));
                let reg = node_registry.clone();
                let conns = state.orbit_conns.clone();
                let axis_home = home.clone();
                tokio::spawn(async move {
                    if let Err(e) =
                        crate::node::run_iroh_accept_loop(axis_home, endpoint, reg, conns).await
                    {
                        tracing::error!(error = format!("{e:#}"), "iroh accept loop failed");
                    }
                });
            }
            Err(e) => {
                tracing::error!(
                    error = format!("{e:#}"),
                    "failed to bind iroh endpoint — remote orbits disabled (UDS still active)"
                );
            }
        }
    }

    let app = server::build_router(state.clone());

    // Spawn the UDS listener for same-host node (orbit) registration.
    // Unix-only: on Windows the orbit lives in WSL2 and registers over iroh
    // instead (ADR 0035 §1.1), so there is no local socket to listen on.
    #[cfg(unix)]
    {
        let uds_path = home.join("control.sock");
        let reg = node_registry.clone();
        let conns = state.orbit_conns.clone();
        tokio::spawn(async move {
            crate::node::run_uds_listener(uds_path, reg, conns).await;
        });
    }

    let bind = std::env::var("STELLARC_BIND").unwrap_or_else(|_| "127.0.0.1:8787".to_string());
    let listener = tokio::net::TcpListener::bind(&bind)
        .await
        .with_context(|| format!("binding {bind}"))?;
    tracing::info!(
        addr = %bind,
        token_file = %home.join("token").display(),
        "stellarc control plane listening"
    );
    println!("stellarc control plane listening on http://{bind}");

    // ---- Session metadata index (lazy history, ADR 0009) ----
    // Axis imports ONLY session metadata (id, source, title, model, timestamps)
    // from state.db — not message bodies. Message reads and full-text search
    // query state.db on-demand via StateDbReader. This keeps RSS low.
    {
        let bg_log = Arc::clone(&log_arc);
        let bg_views = Arc::clone(&state.views);
        let bg_search = Arc::clone(&state.search);
        let bg_deltas = state.deltas.clone();
        let bg_import = state.import_state.clone();
        let bg_state_db = state_db.clone();
        tokio::spawn(async move {
            if !bg_state_db.exists() {
                tracing::warn!(db = %bg_state_db.display(), "state.db not found — skipping session index");
                bg_import.set_done();
                return;
            }
            tracing::info!(db = %bg_state_db.display(), "indexing Hermes sessions (metadata only)");
            let db = bg_state_db.clone();
            let log_clone = Arc::clone(&bg_log);
            let import_result =
                tokio::task::spawn_blocking(move || import::import_sessions(&db, &log_clone)).await;
            match import_result {
                Ok(Ok(s)) => {
                    tracing::info!(
                        sessions = s.session_count,
                        "session index complete — replaying into views"
                    );
                    {
                        let mut v = bg_views.write().await;
                        *v = ViewManager::new();
                        if let Err(e) = v.replay(&bg_log) {
                            tracing::error!(error = %e, "view replay after import failed");
                        }
                    }
                    {
                        let mut idx = bg_search.write().await;
                        if let Err(e) = idx.build_from_log(&bg_log) {
                            tracing::error!(error = %e, "search rebuild after import failed");
                        }
                    }
                }
                Ok(Err(e)) => tracing::error!(error = %e, "session index failed"),
                Err(e) => tracing::error!(error = %e, "session index task panicked"),
            }
            bg_import.set_done();
            use crate::server::ws::ServerFrame;
            let _ = bg_deltas.send(ServerFrame::SessionUpdated {
                session_id: "__import__".into(),
                changes: serde_json::json!({ "importState": "done" }),
            });
        });
    }

    axum::serve(listener, app).await.context("serving")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn obsolete_redb_path_is_ignored_without_being_read() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join("eventlog.redb")).unwrap();

        warn_if_obsolete_event_log_exists(dir.path());
    }
}
