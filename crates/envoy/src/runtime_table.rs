//! Per-session runtime table — the envoy-side half of the old monolith
//! `BridgeManager` (ADR 0008 milestone S2).
//!
//! Owns the `session id → runtime` map and the factory that spawns runtimes.
//! Session bookkeeping (draft creation, spaces, event-log appends, hermes-id
//! backfill) stays hall-side; the hall calls into this table through the
//! factory seam.

use std::collections::HashMap;
use std::sync::Arc;

use anyhow::{Context, Result};
use tokio::sync::{Mutex, RwLock};

use crate::bridge::{AgentCommand, AgentRuntime};
use olympus_proto::RuntimeSpec;

/// A type-erased runtime factory. Production uses HermesAgentRuntime; tests
/// inject a mock. The optional session id lets the production Envoy
/// materialize a node-local managed-session workspace before constructing the
/// runtime. Factories return errors so invalid identities fail closed before
/// any child process is spawned.
pub type RuntimeFactory =
    Arc<dyn Fn(Option<&str>, &RuntimeSpec) -> Result<Arc<dyn AgentRuntime>> + Send + Sync>;

/// One registered runtime plus the capability flags captured from its
/// adapter's `initialize` response (ADR 0008 §3).
pub struct RuntimeEntry {
    pub runtime: Arc<dyn AgentRuntime>,
    /// Whether the adapter advertised cross-process session resume
    /// (`agentCapabilities.loadSession` + `sessionCapabilities.resume`).
    /// Fail closed: false when the capability was absent or never captured.
    pub resumable: bool,
    /// Last time this runtime received a command (prompt, steer, etc.).
    /// Used by `reap_idle()` to terminate sessions that have been idle
    /// longer than the configured threshold. Updated on every `ensure_runtime`
    /// and `send` call.
    pub last_activity: std::time::Instant,
}

/// The result of forking a source agent session into a fresh runtime: the
/// started runtime and the agent session id it captured.
pub struct ForkedRuntime {
    pub runtime: Arc<dyn AgentRuntime>,
    pub hermes_id: String,
}

/// Active agent runtimes keyed by Olympus session id, plus the factory that
/// spawns them (ensure/send/stop per-session mechanics).
pub struct RuntimeTable {
    /// Factory that produces a fresh runtime per session.
    factory: RuntimeFactory,
    /// Active runtimes keyed by Olympus session id.
    runtimes: RwLock<HashMap<String, RuntimeEntry>>,
    /// Per-session creation locks prevent retries/concurrent first prompts from
    /// spawning multiple ACP children against one workspace.
    start_locks: Mutex<HashMap<String, Arc<Mutex<()>>>>,
}

impl RuntimeTable {
    /// Create a runtime table with the given runtime factory.
    pub fn with_factory(factory: RuntimeFactory) -> Self {
        Self {
            factory,
            runtimes: RwLock::new(HashMap::new()),
            start_locks: Mutex::new(HashMap::new()),
        }
    }

    async fn start_lock(&self, session_id: &str) -> Arc<Mutex<()>> {
        let mut locks = self.start_locks.lock().await;
        // A lock with no caller references is stale. Runtime-backed sessions
        // bypass this map via the fast path; stopped sessions get a fresh lock.
        locks.retain(|_, lock| Arc::strong_count(lock) > 1);
        locks
            .entry(session_id.to_owned())
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone()
    }

    /// Ensure a runtime exists for a managed session, spawning it lazily on
    /// the first send. Returns the runtime plus the (possibly newly captured)
    /// Hermes session id.
    ///
    /// - If a runtime is already registered, returns it (no spawn).
    /// - Otherwise spawns one via the factory and performs the ACP handshake.
    ///   When `resume_hermes_id` is `Some` and non-empty, it resumes that
    ///   Hermes session (survives server restarts); otherwise it creates a
    ///   fresh one.
    pub async fn ensure_runtime(
        &self,
        session_id: &str,
        spec: &RuntimeSpec,
        resume_hermes_id: Option<&str>,
    ) -> Result<(Arc<dyn AgentRuntime>, String)> {
        if let Some(entry) = self.runtimes.read().await.get(session_id) {
            let rt = entry.runtime.clone();
            let hid = rt.hermes_session_id().await.unwrap_or_default();
            return Ok((rt, hid));
        }

        let start_lock = self.start_lock(session_id).await;
        let _start_guard = start_lock.lock().await;
        // Another caller may have completed startup while this request waited.
        if let Some(entry) = self.runtimes.read().await.get(session_id) {
            let rt = entry.runtime.clone();
            let hid = rt.hermes_session_id().await.unwrap_or_default();
            return Ok((rt, hid));
        }

        let runtime = (self.factory)(Some(session_id), spec)?;
        let resume = resume_hermes_id.filter(|s| !s.is_empty());
        runtime
            .start(resume)
            .await
            .context("starting agent runtime (lazy)")?;
        let hermes_id = runtime
            .hermes_session_id()
            .await
            .unwrap_or_else(|| format!("sess-{}", chrono_millis()));

        // Capability flags come from the adapter's initialize response,
        // captured during start(). Fail closed (false) when absent.
        let resumable = runtime.resumable().await;
        self.runtimes.write().await.insert(
            session_id.to_string(),
            RuntimeEntry {
                runtime: runtime.clone(),
                resumable,
                last_activity: std::time::Instant::now(),
            },
        );

        Ok((runtime, hermes_id))
    }

    /// Fork a source agent session into a fresh runtime (not yet registered —
    /// the caller assigns the Olympus session id and calls [`Self::register`]).
    pub async fn fork_runtime(&self, source_hermes_id: &str) -> Result<ForkedRuntime> {
        let runtime = (self.factory)(None, &RuntimeSpec::default())?;
        runtime
            .fork_session(source_hermes_id)
            .await
            .context("forking agent runtime session")?;

        let hermes_id = runtime
            .hermes_session_id()
            .await
            .unwrap_or_else(|| format!("fork-{}", chrono_millis()));
        Ok(ForkedRuntime { runtime, hermes_id })
    }

    /// Register an already-started runtime under an Olympus session id,
    /// capturing its capability flags.
    pub async fn register(&self, session_id: &str, runtime: Arc<dyn AgentRuntime>) {
        let resumable = runtime.resumable().await;
        self.runtimes.write().await.insert(
            session_id.to_string(),
            RuntimeEntry {
                runtime,
                resumable,
                last_activity: std::time::Instant::now(),
            },
        );
    }

    /// The runtime registered for a session, if any.
    pub async fn get(&self, session_id: &str) -> Option<Arc<dyn AgentRuntime>> {
        self.runtimes
            .read()
            .await
            .get(session_id)
            .map(|e| e.runtime.clone())
    }

    /// The `resumable` capability flag for a session's runtime, if registered.
    pub async fn resumable(&self, session_id: &str) -> Option<bool> {
        self.runtimes
            .read()
            .await
            .get(session_id)
            .map(|e| e.resumable)
    }

    /// Send a command to a session's runtime. Errors if no runtime is
    /// registered for the session.
    pub async fn send(&self, session_id: &str, cmd: AgentCommand) -> Result<()> {
        let runtime = self
            .get(session_id)
            .await
            .ok_or_else(|| anyhow::anyhow!("no runtime for session"))?;
        runtime.send(cmd).await?;
        // Touch last_activity so the reaper doesn't kill an active session.
        if let Some(entry) = self.runtimes.write().await.get_mut(session_id) {
            entry.last_activity = std::time::Instant::now();
        }
        Ok(())
    }

    /// Stop and deregister a session's runtime (no-op if none registered).
    pub async fn stop(&self, session_id: &str) -> Result<()> {
        let entry = self.runtimes.write().await.remove(session_id);
        if let Some(entry) = entry {
            entry.runtime.stop().await?;
        }
        Ok(())
    }

    /// Reap runtimes that have been idle longer than `threshold`.
    ///
    /// Called by a background task in `main.rs` on a fixed interval. Stops the
    /// child process and removes the entry from the table. The session can be
    /// resumed later via `ensure_runtime` with a `resume_hermes_id` — the
    /// conversation history persists on disk in the agent's session store.
    ///
    /// Returns the number of sessions reaped (for logging).
    pub async fn reap_idle(&self, threshold: std::time::Duration) -> usize {
        let now = std::time::Instant::now();
        let mut to_reap = Vec::new();

        {
            let runtimes = self.runtimes.read().await;
            for (sid, entry) in runtimes.iter() {
                if now.duration_since(entry.last_activity) > threshold {
                    to_reap.push(sid.clone());
                }
            }
        }

        let count = to_reap.len();
        for sid in &to_reap {
            if let Some(entry) = self.runtimes.write().await.remove(sid) {
                tracing::info!(
                    session_id = %sid,
                    idle_secs = now.duration_since(entry.last_activity).as_secs(),
                    "reaping idle runtime"
                );
                let _ = entry.runtime.stop().await;
            }
        }
        count
    }
}

/// Current epoch milliseconds as u128 (for unique id generation).
fn chrono_millis() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use std::pin::Pin;
    use std::sync::atomic::{AtomicUsize, Ordering};

    use futures::stream::{self, Stream};
    use tokio::sync::Notify;

    use super::*;
    use crate::bridge::AgentEvent;

    struct SlowRuntime {
        started: Arc<Notify>,
        release: Arc<Notify>,
        hermes_id: Mutex<Option<String>>,
    }

    #[async_trait::async_trait]
    impl AgentRuntime for SlowRuntime {
        async fn start(&self, _session_id: Option<&str>) -> Result<()> {
            self.started.notify_one();
            self.release.notified().await;
            *self.hermes_id.lock().await = Some("hermes-session".into());
            Ok(())
        }

        async fn fork_session(&self, _session_id: &str) -> Result<()> {
            Ok(())
        }

        async fn send(&self, _cmd: AgentCommand) -> Result<()> {
            Ok(())
        }

        fn events(&self) -> Pin<Box<dyn Stream<Item = AgentEvent> + Send>> {
            Box::pin(stream::empty())
        }

        async fn stop(&self) -> Result<()> {
            Ok(())
        }

        async fn hermes_session_id(&self) -> Option<String> {
            self.hermes_id.lock().await.clone()
        }
    }

    #[tokio::test]
    async fn concurrent_ensure_runtime_spawns_one_child_per_session() {
        let calls = Arc::new(AtomicUsize::new(0));
        let started = Arc::new(Notify::new());
        let release = Arc::new(Notify::new());
        let table = Arc::new(RuntimeTable::with_factory(Arc::new({
            let calls = calls.clone();
            let started = started.clone();
            let release = release.clone();
            move |_, _| {
                calls.fetch_add(1, Ordering::SeqCst);
                Ok(Arc::new(SlowRuntime {
                    started: started.clone(),
                    release: release.clone(),
                    hermes_id: Mutex::new(None),
                }) as Arc<dyn AgentRuntime>)
            }
        })));

        let first = tokio::spawn({
            let table = table.clone();
            async move {
                table
                    .ensure_runtime("session-a", &RuntimeSpec::default(), None)
                    .await
            }
        });
        started.notified().await;
        let second = tokio::spawn({
            let table = table.clone();
            async move {
                table
                    .ensure_runtime("session-a", &RuntimeSpec::default(), None)
                    .await
            }
        });
        tokio::task::yield_now().await;
        assert_eq!(calls.load(Ordering::SeqCst), 1);

        release.notify_waiters();
        let (_, first_id) = first.await.unwrap().unwrap();
        let (_, second_id) = second.await.unwrap().unwrap();
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        assert_eq!(first_id, "hermes-session");
        assert_eq!(second_id, first_id);
    }
}
