//! `EventStore` for the SQLite backend (lite edition).
//!
//! Every method hands the blocking rusqlite call to `spawn_blocking`, which is
//! the point: axis runs a 4-worker multi-thread runtime and today calls these
//! synchronously from async handlers, so a slow append stalls unrelated
//! requests (ADR 0037 §1). The `Mutex<Connection>` inside `Log` stays — SQLite
//! is single-writer by nature and this is the lite path.
//!
//! `Arc<Log>` is cloned into each blocking task because `spawn_blocking`
//! requires `'static`.

use std::sync::Arc;

use anyhow::Result;
use async_trait::async_trait;

use crate::event::Event;
use crate::log::{Log, SearchHit};
use crate::store::EventStore;
use crate::views::{CardRow, MessageRow, ProjectRow, RegistryEntry, RepoRow, SessionRow, SetupRow};

/// Runs a blocking closure off the async runtime with a cloned `Arc<Log>`.
///
/// A macro rather than a generic helper fn: each call needs to move different
/// owned copies of the arguments, and a fn would force a closure-per-call
/// anyway. `expect` on the join handle is deliberate — a panic inside the
/// closure means the log is corrupt, and continuing would be worse.
macro_rules! blocking {
    ($self:ident, |$log:ident| $body:expr) => {{
        let $log = Arc::clone(&$self.0);
        tokio::task::spawn_blocking(move || $body)
            .await
            .expect("event log blocking task panicked")
    }};
}

/// Newtype so the trait impl lives here rather than in `log.rs`.
pub struct SqliteStore(pub Arc<Log>);

#[async_trait]
impl EventStore for SqliteStore {
    // ---- append ----------------------------------------------------------

    async fn append(&self, event: &Event) -> Result<u64> {
        let event = event.clone();
        blocking!(self, |log| log.append(&event))
    }

    async fn append_orbit_event(&self, identity: &str, seq: u64, event: &Event) -> Result<bool> {
        let identity = identity.to_owned();
        let event = event.clone();
        blocking!(self, |log| log.append_orbit_event(&identity, seq, &event))
    }

    async fn append_batch(&self, events: &[Event]) -> Result<Option<u64>> {
        let events = events.to_vec();
        blocking!(self, |log| log.append_batch(&events))
    }

    async fn accept_orbit_seq(&self, session_id: &str, seq: u64) -> Result<bool> {
        let session_id = session_id.to_owned();
        blocking!(self, |log| log.accept_orbit_seq(&session_id, seq))
    }

    async fn accept_observed(
        &self,
        transport_session_id: &str,
        seq: u64,
        hermes_id: &str,
        message_id: Option<u64>,
        event: &Event,
    ) -> Result<bool> {
        let transport_session_id = transport_session_id.to_owned();
        let hermes_id = hermes_id.to_owned();
        let event = event.clone();
        blocking!(self, |log| log.accept_observed(
            &transport_session_id,
            seq,
            &hermes_id,
            message_id,
            &event
        ))
    }

    // ---- read ------------------------------------------------------------

    async fn read_from(&self, seq: u64, limit: usize) -> Result<Vec<(u64, Event)>> {
        blocking!(self, |log| log.read_from(seq, limit))
    }

    async fn read_all(&self) -> Result<Vec<(u64, Event)>> {
        blocking!(self, |log| log.read_all())
    }

    async fn event_count(&self) -> Result<usize> {
        blocking!(self, |log| log.event_count())
    }

    async fn orbit_watermark(&self, session_id: &str) -> Result<Option<u64>> {
        let session_id = session_id.to_owned();
        blocking!(self, |log| log.orbit_watermark(&session_id))
    }

    // ---- maintenance -----------------------------------------------------

    async fn delete_job_history(&self, seqs: &[u64], identities: &[String]) -> Result<()> {
        let seqs = seqs.to_vec();
        let identities = identities.to_vec();
        blocking!(self, |log| log.delete_job_history(&seqs, &identities))
    }

    async fn retain_native(&self) -> Result<()> {
        blocking!(self, |log| log.retain_native())
    }

    // ---- projections -----------------------------------------------------

    async fn list_sessions(&self) -> Result<Vec<SessionRow>> {
        blocking!(self, |log| log.list_sessions())
    }

    async fn get_session(&self, id: &str) -> Result<Option<SessionRow>> {
        let id = id.to_owned();
        blocking!(self, |log| log.get_session(&id))
    }

    async fn recent_messages(&self, session_id: &str, limit: usize) -> Result<Vec<MessageRow>> {
        let session_id = session_id.to_owned();
        blocking!(self, |log| log.recent_messages(&session_id, limit))
    }

    async fn next_message_id(&self, session_id: &str) -> Result<u64> {
        let session_id = session_id.to_owned();
        blocking!(self, |log| log.next_message_id(&session_id))
    }

    async fn search(&self, query: &str, limit: usize) -> Result<Vec<SearchHit>> {
        let query = query.to_owned();
        blocking!(self, |log| log.search(&query, limit))
    }

    async fn get_setup(&self, scope: &str) -> Result<Option<SetupRow>> {
        let scope = scope.to_owned();
        blocking!(self, |log| log.get_setup(&scope))
    }

    async fn effective_setup(&self, org: &str, project: &str) -> Result<SetupRow> {
        let org = org.to_owned();
        let project = project.to_owned();
        blocking!(self, |log| log.effective_setup(&org, &project))
    }

    async fn list_registry(&self, kind: Option<&str>) -> Result<Vec<RegistryEntry>> {
        let kind = kind.map(str::to_owned);
        blocking!(self, |log| log.list_registry(kind.as_deref()))
    }

    async fn get_registry(&self, kind: &str, slug: &str) -> Result<Option<RegistryEntry>> {
        let kind = kind.to_owned();
        let slug = slug.to_owned();
        blocking!(self, |log| log.get_registry(&kind, &slug))
    }

    async fn list_projects(&self) -> Result<Vec<ProjectRow>> {
        blocking!(self, |log| log.list_projects())
    }

    async fn get_project(&self, id: &str) -> Result<Option<ProjectRow>> {
        let id = id.to_owned();
        blocking!(self, |log| log.get_project(&id))
    }

    async fn list_repos(&self) -> Result<Vec<RepoRow>> {
        blocking!(self, |log| log.list_repos())
    }

    async fn get_repo(&self, slug: &str) -> Result<Option<RepoRow>> {
        let slug = slug.to_owned();
        blocking!(self, |log| log.get_repo(&slug))
    }

    async fn list_cards(&self) -> Result<Vec<CardRow>> {
        blocking!(self, |log| log.list_cards())
    }

    async fn get_card(&self, id: &str) -> Result<Option<CardRow>> {
        let id = id.to_owned();
        blocking!(self, |log| log.get_card(&id))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The seam must be object-safe and actually usable as `Arc<dyn
    /// EventStore>` — that is the whole reason for `async_trait` here. This
    /// fails to compile if the trait drifts out of object safety.
    #[tokio::test]
    async fn sqlite_store_is_object_safe_and_reads_through() {
        let dir = tempfile::tempdir().expect("tempdir");
        let log = Arc::new(Log::open(&dir.path().join("t.db")).expect("open"));
        let store: Arc<dyn EventStore> = Arc::new(SqliteStore(log));

        assert_eq!(store.event_count().await.expect("count"), 0);
        assert!(store.list_sessions().await.expect("sessions").is_empty());
        // Blocking call really did run off-runtime and come back.
        assert!(store.get_session("nope").await.expect("get").is_none());
    }
}
