//! Runtime backend selection for the Axis event log.
//!
//! `EventLog` presents the same **synchronous** API as `log::Log` and dispatches
//! to either SQLite or Postgres. Synchronous on purpose: `jobs.rs` has no async
//! functions at all and is called from async route handlers, so making the log
//! async would colour `JobService` and everything above it — a large diff for
//! no gain, since axis already performs blocking SQLite I/O on its tokio
//! workers today (ADR 0037 §1).
//!
//! ponytail: the Postgres arm blocks the calling thread on a DEDICATED runtime.
//! That is safe — blocking on a *different* runtime cannot deadlock, unlike
//! `Handle::block_on` against the current one — and costs no more than the
//! SQLite arm already does. Upgrade path when it matters: make `EventStore`
//! (crates/axis/src/store.rs) the real interface and port the ~20 non-test call
//! sites to `.await`, which also removes the blocking from the SQLite arm.

use std::path::Path;
#[cfg(feature = "postgres")]
use std::sync::Arc;

use anyhow::{Context, Result};

use crate::event::Event;
use crate::log::{Log, SearchHit};
use crate::store::Backend;
use crate::views::{CardRow, MessageRow, ProjectRow, RegistryEntry, RepoRow, SessionRow, SetupRow};

pub enum EventLog {
    Sqlite(Log),
    #[cfg(feature = "postgres")]
    Postgres {
        log: crate::log_pg::PgLog,
        /// Owns the reactor the pool's sockets are registered with. Dropping it
        /// would kill every connection, so it lives as long as the log.
        runtime: Arc<tokio::runtime::Runtime>,
    },
}

impl EventLog {
    /// Open SQLite at `path`, or Postgres when `STELLARC_DATABASE_URL` is set.
    ///
    /// Selection is by environment, not by cargo feature: a binary built with
    /// `postgres` still runs SQLite unless it is told otherwise, so the desktop
    /// bundle behaves identically whether or not the feature was compiled in.
    pub fn open(path: &Path) -> Result<Self> {
        match std::env::var("STELLARC_DATABASE_URL") {
            Ok(url) if !url.trim().is_empty() => Self::open_postgres(&url),
            _ => Ok(Self::Sqlite(
                Log::open(path).context("opening the SQLite event log")?,
            )),
        }
    }

    #[cfg(feature = "postgres")]
    fn open_postgres(url: &str) -> Result<Self> {
        // `entry::run` is `#[tokio::main]`, so this executes INSIDE a runtime
        // and `Runtime::new()` here panics with "Cannot start a runtime from
        // within a runtime". Build it on a dedicated thread instead — that
        // thread has no runtime context, and the result is a runtime wholly
        // separate from the server's, which is what makes the later
        // `block_on` calls safe rather than deadlock-prone.
        let url = url.to_string();
        let (runtime, log) = std::thread::spawn(move || -> Result<_> {
            // Two workers: the pool is I/O bound and this runtime exists only
            // to drive it.
            let runtime = tokio::runtime::Builder::new_multi_thread()
                .worker_threads(2)
                .enable_all()
                .thread_name("stellarc-pg")
                .build()
                .context("building the Postgres runtime")?;
            let log = runtime
                .block_on(crate::log_pg::PgLog::connect(&url))
                .context("connecting the Postgres event log")?;
            Ok((Arc::new(runtime), log))
        })
        .join()
        .map_err(|_| anyhow::anyhow!("the Postgres runtime thread panicked"))??;

        tracing::info!("event log backend: postgres");
        Ok(Self::Postgres { log, runtime })
    }

    #[cfg(not(feature = "postgres"))]
    fn open_postgres(_url: &str) -> Result<Self> {
        anyhow::bail!(
            "STELLARC_DATABASE_URL is set but this build has no Postgres support; \
             rebuild with --features postgres"
        )
    }

    /// Open a SQLite-backed log directly, bypassing environment selection.
    ///
    /// For tests and for the `EventLog::Sqlite` construction sites that must
    /// stay on SQLite regardless of `STELLARC_DATABASE_URL`.
    pub fn open_sqlite_for_test(path: &Path) -> Result<Self> {
        Ok(Self::Sqlite(Log::open(path)?))
    }

    pub fn backend(&self) -> Backend {
        match self {
            Self::Sqlite(_) => Backend::Sqlite,
            #[cfg(feature = "postgres")]
            Self::Postgres { .. } => Backend::Postgres,
        }
    }
}

/// Forward a method to whichever backend is live, blocking on the dedicated
/// runtime for the Postgres arm.
macro_rules! dispatch {
    ($self:ident, $method:ident ( $($arg:expr),* )) => {
        match $self {
            EventLog::Sqlite(log) => log.$method($($arg),*),
            #[cfg(feature = "postgres")]
            // Both `Runtime::block_on` and `Handle::block_on` panic when the
            // CALLING thread is driving a runtime — and every axis route handler
            // is such a thread. `block_in_place` is the sanctioned escape: it
            // hands this worker's queued tasks to another worker first, so the
            // thread is free to block. The future then runs on the DEDICATED
            // Postgres runtime's own workers, so this cannot deadlock.
            EventLog::Postgres { log, runtime } => {
                let handle = runtime.handle().clone();
                let future = log.$method($($arg),*);
                match tokio::runtime::Handle::try_current() {
                    // On a multi_thread worker: release it, then block.
                    Ok(current)
                        if current.runtime_flavor()
                            == tokio::runtime::RuntimeFlavor::MultiThread =>
                    {
                        tokio::task::block_in_place(move || handle.block_on(future))
                    }
                    // current_thread runtime (mostly `#[tokio::test]`): there is
                    // no other worker to hand off to, so block the pg runtime's
                    // handle directly. Safe because it is a different runtime.
                    Ok(_) => std::thread::scope(|scope| {
                        scope
                            .spawn(move || handle.block_on(future))
                            .join()
                            .expect("the Postgres dispatch thread panicked")
                    }),
                    // No runtime at all (startup, before the server runs).
                    Err(_) => handle.block_on(future),
                }
            }
        }
    };
}

impl EventLog {
    pub fn append(&self, event: &Event) -> Result<u64> {
        dispatch!(self, append(event))
    }

    pub fn append_batch(&self, events: &[Event]) -> Result<Option<u64>> {
        dispatch!(self, append_batch(events))
    }

    pub fn append_orbit_event(&self, identity: &str, seq: u64, event: &Event) -> Result<bool> {
        dispatch!(self, append_orbit_event(identity, seq, event))
    }

    pub fn accept_orbit_seq(&self, session_id: &str, seq: u64) -> Result<bool> {
        dispatch!(self, accept_orbit_seq(session_id, seq))
    }

    pub fn accept_observed(
        &self,
        transport_session_id: &str,
        seq: u64,
        hermes_id: &str,
        message_id: Option<u64>,
        event: &Event,
    ) -> Result<bool> {
        dispatch!(
            self,
            accept_observed(transport_session_id, seq, hermes_id, message_id, event)
        )
    }

    pub fn read_from(&self, seq: u64, limit: usize) -> Result<Vec<(u64, Event)>> {
        dispatch!(self, read_from(seq, limit))
    }

    pub fn read_all(&self) -> Result<Vec<(u64, Event)>> {
        dispatch!(self, read_all())
    }

    pub fn event_count(&self) -> Result<usize> {
        dispatch!(self, event_count())
    }

    pub fn orbit_watermark(&self, session_id: &str) -> Result<Option<u64>> {
        dispatch!(self, orbit_watermark(session_id))
    }

    pub fn delete_job_history(&self, seqs: &[u64], identities: &[String]) -> Result<()> {
        dispatch!(self, delete_job_history(seqs, identities))
    }

    pub fn retain_native(&self) -> Result<()> {
        dispatch!(self, retain_native())
    }

    pub fn list_sessions(&self) -> Result<Vec<SessionRow>> {
        dispatch!(self, list_sessions())
    }

    pub fn get_session(&self, id: &str) -> Result<Option<SessionRow>> {
        dispatch!(self, get_session(id))
    }

    pub fn recent_messages(&self, session_id: &str, limit: usize) -> Result<Vec<MessageRow>> {
        dispatch!(self, recent_messages(session_id, limit))
    }

    pub fn next_message_id(&self, session_id: &str) -> Result<u64> {
        dispatch!(self, next_message_id(session_id))
    }

    pub fn search(&self, query: &str, limit: usize) -> Result<Vec<SearchHit>> {
        dispatch!(self, search(query, limit))
    }

    pub fn get_setup(&self, scope: &str) -> Result<Option<SetupRow>> {
        dispatch!(self, get_setup(scope))
    }

    pub fn effective_setup(&self, org: &str, project: &str) -> Result<SetupRow> {
        dispatch!(self, effective_setup(org, project))
    }

    pub fn list_registry(&self, kind: Option<&str>) -> Result<Vec<RegistryEntry>> {
        dispatch!(self, list_registry(kind))
    }

    pub fn get_registry(&self, kind: &str, slug: &str) -> Result<Option<RegistryEntry>> {
        dispatch!(self, get_registry(kind, slug))
    }

    pub fn list_projects(&self) -> Result<Vec<ProjectRow>> {
        dispatch!(self, list_projects())
    }

    pub fn get_project(&self, id: &str) -> Result<Option<ProjectRow>> {
        dispatch!(self, get_project(id))
    }

    pub fn list_repos(&self) -> Result<Vec<RepoRow>> {
        dispatch!(self, list_repos())
    }

    pub fn get_repo(&self, slug: &str) -> Result<Option<RepoRow>> {
        dispatch!(self, get_repo(slug))
    }

    pub fn list_cards(&self) -> Result<Vec<CardRow>> {
        dispatch!(self, list_cards())
    }

    pub fn get_card(&self, id: &str) -> Result<Option<CardRow>> {
        dispatch!(self, get_card(id))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Without the env var, the desktop/Lite path must stay on SQLite even in a
    /// binary compiled with the postgres feature.
    #[test]
    fn defaults_to_sqlite_without_the_env_var() {
        let dir = tempfile::tempdir().expect("tempdir");
        // Not #[serial]: no other test in this module touches this variable.
        std::env::remove_var("STELLARC_DATABASE_URL");
        let log = EventLog::open(&dir.path().join("d.db")).expect("open");
        assert_eq!(log.backend(), Backend::Sqlite);
        assert_eq!(log.event_count().expect("count"), 0);
    }
}
