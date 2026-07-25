//! Stellarc shared wire types (ADR 0008) — the only crate Axis and Orbit both
//! depend on. Serde data types only: frame enums, agent command/event types,
//! runtime specs, and version identity. No heavy deps (serde + serde_json).
//!
//! Wire style matches the existing node protocol (`node.rs`): JSON-lines,
//! internally tagged on `"kind"`, camelCase field names, `#[serde(default)]`
//! tolerance on optional fields. Unknown fields are ignored (no
//! `deny_unknown_fields`) so old peers parse new frames — schema-compat
//! rejection is Axis's job via [`PROTOCOL_VERSION`], not serde's.

pub mod agent;
pub mod frames;
pub mod runtime;
pub mod version;

pub use agent::{AgentCommand, AgentEvent, PermissionOption};
pub use frames::{OrbitFrame, AxisFrame, RuntimeStatus};
pub use runtime::{AcpFraming, ModelSetStyle, RuntimeSpec};
pub use version::{BuildVersion, PROTOCOL_VERSION};
