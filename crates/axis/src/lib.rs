//! Stellarc control plane — core library.
//!
//! Phase 1: append-only event log (`event`, `log`).
//! Phase 2: in-memory views (`views`).
//! Phase 6: tantivy full-text search (`search`).

pub mod auth;
pub mod auth_mode;
pub mod auth_sidecar;
pub mod auth_store;
pub mod edge;
pub mod edit_model;
pub mod enroll;
pub mod event;
pub mod event_log;
pub mod import;
pub mod irc;
pub mod jobs;
pub mod log;
#[cfg(feature = "postgres")]
pub mod log_pg;
mod migrations;
pub mod node;
pub mod package;
pub mod projects;
pub mod proxy;
pub mod repos;
pub mod search;
pub mod server;
pub mod state_db_reader;
pub mod store;
pub mod store_sqlite;
pub mod sync;
pub mod vault;
pub mod views;

// The orbit-side modules (ACP bridge + setup adapters) moved to
// `stellarc-orbit` (ADR 0008 milestone S2). Re-exported here so existing
// `crate::bridge::…` / `crate::adapter::…` call sites keep working unchanged
// while the monolith still links the orbit lib in-process.
pub use stellarc_orbit::adapter;
pub use stellarc_orbit::bridge;

pub mod entry;
pub mod home;
