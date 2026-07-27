//! Storage seam for the Axis event log (ADR 0032 §2, ADR 0037).
//!
//! One async trait, two implementations: `log::Log` (rusqlite, lite) and
//! `log_pg::PgLog` (sqlx, full). Async is a hard requirement, not a detail —
//! see ADR 0037 §1: axis runs a 4-worker multi-thread tokio runtime and the
//! blocking SQLite calls sit directly on those workers today, so four
//! concurrent appends can stall the whole runtime.
//!
//! The trait is `async_trait` rather than native RPITIT because it must be
//! object-safe: callers hold `Arc<dyn EventStore>` so the backend is a runtime
//! choice (`STELLARC_DATABASE_URL` present or not), not a compile-time one.

use anyhow::Result;
use async_trait::async_trait;

use crate::event::Event;
use crate::log::SearchHit;
use crate::views::{CardRow, MessageRow, ProjectRow, RegistryEntry, RepoRow, SessionRow, SetupRow};

/// Which storage engine is behind the seam.
///
/// Axis needs this at runtime, not compile time: the same binary can be built
/// with the `postgres` feature and still be pointed at SQLite, so a `cfg!`
/// check would answer the wrong question.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Backend {
    /// Lite edition: single file, single writer, in-process (ADR 0032).
    Sqlite,
    /// Full edition: many writers, shared with other subsystems (ADR 0037).
    Postgres,
}

impl Backend {
    pub fn as_str(self) -> &'static str {
        match self {
            Backend::Sqlite => "sqlite",
            Backend::Postgres => "postgres",
        }
    }
}

/// A capability that exists on one backend and not the other.
///
/// This enum is deliberately small and grows only when a real feature needs to
/// branch. Speculative entries invite dead gates that drift out of truth.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Capability {
    /// Writers on unrelated sessions proceed in parallel. SQLite serializes
    /// every write through one connection, so a caller that wants real
    /// concurrency has to know.
    ConcurrentWriters,
    /// `pgvector` embedding search. Installed on Full; no SQLite equivalent
    /// ships with the bundled build.
    VectorSearch,
    /// Other subsystems (boards, repo sync, managed apps) can share this
    /// database. A Lite install's SQLite file is private to axis by design.
    SharedSubstrate,
    /// Server-pushed change notification (`LISTEN`/`NOTIFY`). Lite polls.
    ChangeNotification,
}

/// The Axis event log: an append-only event stream plus its projections.
///
/// Every `append*` method writes the immutable event **and** applies its
/// projection in one transaction. That atomicity is load-bearing: a projection
/// that lands without its event (or vice versa) is unrecoverable corruption of
/// the source of truth.
#[async_trait]
pub trait EventStore: Send + Sync {
    /// Which engine is actually in use. Callers branch on this rather than on
    /// a cargo feature, because the feature only says what was compiled in.
    fn backend(&self) -> Backend;

    /// Whether a capability is available on this backend.
    ///
    /// Derived from `backend()` rather than left to each impl, so adding a
    /// backend cannot silently claim capabilities it lacks.
    fn supports(&self, capability: Capability) -> bool {
        match (self.backend(), capability) {
            (Backend::Postgres, _) => true,
            // SQLite has none of these, and pretending otherwise is how a
            // Lite install ends up with a feature that corrupts or hangs.
            (Backend::Sqlite, _) => false,
        }
    }

    // ---- append ----------------------------------------------------------

    async fn append(&self, event: &Event) -> Result<u64>;

    /// Persist a sequenced Orbit frame and advance its watermark atomically.
    ///
    /// Enforces a strict sequence: `seq` must equal `watermark + 1`. A lower
    /// seq is a duplicate (returns `Ok(false)`); a gap is an error. Under
    /// concurrent writers this needs per-session serialization — see ADR 0037
    /// §2.1 hazard 2. It must NOT be achieved with a global lock.
    async fn append_orbit_event(&self, identity: &str, seq: u64, event: &Event) -> Result<bool>;

    /// Returns the seq of the **first** appended event, not the last.
    async fn append_batch(&self, events: &[Event]) -> Result<Option<u64>>;

    async fn accept_orbit_seq(&self, session_id: &str, seq: u64) -> Result<bool>;

    async fn accept_observed(
        &self,
        transport_session_id: &str,
        seq: u64,
        hermes_id: &str,
        message_id: Option<u64>,
        event: &Event,
    ) -> Result<bool>;

    // ---- read ------------------------------------------------------------

    async fn read_from(&self, seq: u64, limit: usize) -> Result<Vec<(u64, Event)>>;
    async fn read_all(&self) -> Result<Vec<(u64, Event)>>;
    async fn event_count(&self) -> Result<usize>;
    async fn orbit_watermark(&self, session_id: &str) -> Result<Option<u64>>;

    // ---- maintenance -----------------------------------------------------

    async fn delete_job_history(&self, seqs: &[u64], identities: &[String]) -> Result<()>;
    async fn retain_native(&self) -> Result<()>;

    // ---- projections -----------------------------------------------------

    async fn list_sessions(&self) -> Result<Vec<SessionRow>>;
    async fn get_session(&self, id: &str) -> Result<Option<SessionRow>>;
    async fn recent_messages(&self, session_id: &str, limit: usize) -> Result<Vec<MessageRow>>;

    /// Next per-session message id.
    ///
    /// Callers must treat this as advisory only. The id is assigned atomically
    /// inside the insert (ADR 0037 §2.1 hazard 1); reading it here and then
    /// writing it separately is the lost-update bug this seam exists to
    /// prevent.
    async fn next_message_id(&self, session_id: &str) -> Result<u64>;

    async fn search(&self, query: &str, limit: usize) -> Result<Vec<SearchHit>>;
    async fn get_setup(&self, scope: &str) -> Result<Option<SetupRow>>;
    async fn effective_setup(&self, org: &str, project: &str) -> Result<SetupRow>;
    async fn list_registry(&self, kind: Option<&str>) -> Result<Vec<RegistryEntry>>;
    async fn get_registry(&self, kind: &str, slug: &str) -> Result<Option<RegistryEntry>>;
    async fn list_projects(&self) -> Result<Vec<ProjectRow>>;
    async fn get_project(&self, id: &str) -> Result<Option<ProjectRow>>;
    async fn list_repos(&self) -> Result<Vec<RepoRow>>;
    async fn get_repo(&self, slug: &str) -> Result<Option<RepoRow>>;
    async fn list_cards(&self) -> Result<Vec<CardRow>>;
    async fn get_card(&self, id: &str) -> Result<Option<CardRow>>;
}
