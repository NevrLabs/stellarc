//! Axis↔Orbit wire frames (ADR 0008 §1).
//!
//! JSON-lines frames (one compact JSON object per line), internally tagged on
//! `"kind"` with camelCase field names — wire-compatible in style with the
//! existing node protocol (`node.rs` hello/heartbeat/bye).
//!
//! Frame families:
//! - Axis→Orbit ([`AxisFrame`]): `ensure_runtime`, `prompt`, `steer`,
//!   `cancel`, `stop`, `respond_permission`, `drain`, `probe` — each with a
//!   Axis-assigned `reqId`; plus `ack {sessionId, seq}` (spool truncation
//!   watermark) and `resume_from {sessionId, seq}` (replay cursor at
//!   reconnect).
//! - Orbit→Axis ([`OrbitFrame`]): `hello`, `heartbeat`, `bye`,
//!   `resp {reqId, ok|error}`, `event {sessionId, turnId, seq, payload}`,
//!   `runtimes {…}` (in hello and on change).
//!
//! Unknown fields are tolerated everywhere (no `deny_unknown_fields`); a hello
//! with an unexpected `protocolVersion` still *parses* — rejection is Axis's
//! policy decision, not serde's.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::agent::AgentCommand;
use crate::runtime::RuntimeSpec;
use crate::version::BuildVersion;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NodeRole {
    AgentRuntime,
    JobRunner,
    /// Node can host operator terminals (PTY shells). ADR 0021 cockpit.
    TerminalHost,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum JobStream {
    Stdout,
    Stderr,
}

/// A normalized, read-only observation from Hermes `state.db`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ObservedEvent {
    Session {
        #[serde(rename = "hermesId")]
        hermes_id: String,
        source: String,
        model: Option<String>,
        title: Option<String>,
        #[serde(rename = "startedAt")]
        started_at: f64,
        #[serde(rename = "messageCount")]
        message_count: u64,
        #[serde(rename = "inputTokens")]
        input_tokens: u64,
        #[serde(rename = "outputTokens")]
        output_tokens: u64,
        archived: bool,
    },
    Message {
        #[serde(rename = "hermesId")]
        hermes_id: String,
        #[serde(rename = "messageId")]
        message_id: u64,
        role: String,
        content: Option<String>,
        #[serde(rename = "toolName")]
        tool_name: Option<String>,
        #[serde(rename = "toolCalls")]
        tool_calls: Option<String>,
        reasoning: Option<String>,
        timestamp: f64,
        #[serde(rename = "tokenCount")]
        token_count: Option<u64>,
        #[serde(rename = "finishReason")]
        finish_reason: Option<String>,
    },
}

/// One entry in the orbit's runtimes table: which session it holds, its
/// backing Hermes session id, and resume metadata (ADR 0008 §2).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatus {
    pub session_id: String,
    /// The harness-side (Hermes/ACP) session id backing this runtime.
    #[serde(default)]
    pub hermes_id: Option<String>,
    /// Runtime lifecycle state (e.g. "running", "idle", "stopped").
    #[serde(default)]
    pub state: String,
    /// Capability-derived: whether this runtime's harness supports
    /// cross-process resume (`loadSession` + `sessionCapabilities.resume`).
    #[serde(default)]
    pub resumable: bool,
    /// Highest per-session event `seq` this orbit has assigned.
    #[serde(default)]
    pub last_seq: u64,
}

/// Axis→Orbit frames. Request frames carry a Axis-assigned `reqId`; the orbit
/// replies with [`OrbitFrame::Resp`] echoing it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum AxisFrame {
    /// Ensure a runtime exists for `session_id` (spawn or resume). `resume_id`
    /// is the harness session id to resume; `spec` is the spawn configuration.
    EnsureRuntime {
        #[serde(rename = "reqId")]
        req_id: u64,
        #[serde(rename = "sessionId")]
        session_id: String,
        #[serde(default)]
        spec: RuntimeSpec,
        /// Harness session id to resume (ADR §3: Axis must verify the
        /// returned id matches — provenance check).
        #[serde(default, rename = "resumeId")]
        resume_id: Option<String>,
    },
    /// Send a prompt to the session's runtime.
    Prompt {
        #[serde(rename = "reqId")]
        req_id: u64,
        #[serde(rename = "sessionId")]
        session_id: String,
        text: String,
        #[serde(default)]
        model: Option<String>,
    },
    /// Inject mid-turn guidance.
    Steer {
        #[serde(rename = "reqId")]
        req_id: u64,
        #[serde(rename = "sessionId")]
        session_id: String,
        text: String,
    },
    /// Cancel the running turn.
    Cancel {
        #[serde(rename = "reqId")]
        req_id: u64,
        #[serde(rename = "sessionId")]
        session_id: String,
    },
    /// Stop the session's runtime (close the child).
    Stop {
        #[serde(rename = "reqId")]
        req_id: u64,
        #[serde(rename = "sessionId")]
        session_id: String,
    },
    /// Answer a pending `session/request_permission`.
    RespondPermission {
        #[serde(rename = "reqId")]
        req_id: u64,
        #[serde(rename = "sessionId")]
        session_id: String,
        #[serde(rename = "requestId")]
        request_id: String,
        /// The chosen permission option id; `None` → cancelled outcome.
        #[serde(default, rename = "optionId")]
        option_id: Option<String>,
    },
    /// Begin draining this orbit: no new sessions; hand over held sessions.
    Drain {
        #[serde(rename = "reqId")]
        req_id: u64,
        /// Target node for handover, if directed.
        #[serde(default, rename = "toNode")]
        to_node: Option<String>,
    },
    /// Health-gate probe: orbit replies with agent discovery (ADR §5).
    Probe {
        #[serde(rename = "reqId")]
        req_id: u64,
    },
    DispatchJob {
        #[serde(rename = "reqId")]
        req_id: u64,
        #[serde(rename = "jobId")]
        job_id: String,
        #[serde(rename = "attemptEpoch")]
        attempt_epoch: u64,
        #[serde(rename = "packageId")]
        package_id: String,
        #[serde(rename = "packageVersion")]
        package_version: String,
        #[serde(rename = "packageDigest")]
        package_digest: String,
        activity: String,
        argv: Vec<String>,
        #[serde(default, rename = "envAllowlist")]
        env_allowlist: Vec<String>,
        #[serde(default)]
        cwd: Option<String>,
        #[serde(rename = "timeoutSecs")]
        timeout_secs: u64,
        #[serde(rename = "maxOutputBytes")]
        max_output_bytes: u64,
    },
    CancelJob {
        #[serde(rename = "reqId")]
        req_id: u64,
        #[serde(rename = "jobId")]
        job_id: String,
        #[serde(rename = "attemptEpoch")]
        attempt_epoch: u64,
    },
    /// Open an operator terminal (PTY) on this node (ADR 0021 cockpit).
    /// `terminal_id` is Axis-issued and stable for the terminal's lifetime.
    /// The orbit spawns `$SHELL` as a process-group leader with a PTY and
    /// streams `TerminalOutput` frames back. Operator-only; no agent path.
    TerminalOpen {
        #[serde(rename = "reqId")]
        req_id: u64,
        #[serde(rename = "terminalId")]
        terminal_id: String,
        #[serde(default)]
        cols: u16,
        #[serde(default)]
        rows: u16,
        /// Optional starting directory; orbit falls back to $HOME. Never a
        /// caller-arbitrary command — the shell is fixed to the node's $SHELL.
        #[serde(default)]
        cwd: Option<String>,
    },
    /// Write operator keystrokes to a terminal's PTY (fire-and-forget stream).
    /// `data` is base64 (PTY bytes are not guaranteed UTF-8).
    TerminalInput {
        #[serde(rename = "terminalId")]
        terminal_id: String,
        #[serde(rename = "dataB64")]
        data_b64: String,
    },
    /// Resize a terminal's PTY window (fire-and-forget).
    TerminalResize {
        #[serde(rename = "terminalId")]
        terminal_id: String,
        cols: u16,
        rows: u16,
    },
    /// Close a terminal: kill its process group and drop the PTY.
    TerminalClose {
        #[serde(rename = "terminalId")]
        terminal_id: String,
    },
    /// Spool truncation watermark: Axis has durably applied events for
    /// `session_id` up to and including `seq`.
    Ack {
        #[serde(rename = "sessionId")]
        session_id: String,
        seq: u64,
    },
    /// Replay cursor at reconnect: orbit replays spooled events with
    /// `seq > seq`, then streams live.
    ResumeFrom {
        #[serde(rename = "sessionId")]
        session_id: String,
        seq: u64,
    },
    /// Acknowledge one orbit heartbeat. Orbits use missing acknowledgements to
    /// detect a Axis-side registration black hole.
    HeartbeatAck,
    /// The authenticated connection is alive, but Axis no longer has its node
    /// registration. The orbit must send Hello again on this connection.
    ReRegister,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum JobAttemptState {
    Running,
    Completed,
    StepIndeterminate,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobAttemptStatus {
    pub job_id: String,
    pub attempt_epoch: u64,
    pub state: JobAttemptState,
    #[serde(default)]
    pub exit_code: Option<i32>,
    #[serde(default)]
    pub truncated: bool,
    #[serde(default)]
    pub timed_out: bool,
    #[serde(default)]
    pub cancelled: bool,
    #[serde(default)]
    pub terminal_reason: Option<String>,
    /// Final durable spool sequence, when Orbit has fsynced a terminal result.
    #[serde(default)]
    pub final_sequence: Option<u64>,
}

/// Orbit→Axis frames.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum OrbitFrame {
    /// Registration handshake. `protocol_version` is the frame-schema compat
    /// gate (Axis rejects unknown values — fail closed, but the frame always
    /// *parses*); `version` is the build identity drain decisions key on.
    Hello {
        #[serde(rename = "nodeId")]
        node_id: String,
        hostname: String,
        #[serde(rename = "slotsTotal")]
        slots_total: u32,
        #[serde(rename = "protocolVersion")]
        protocol_version: u32,
        version: BuildVersion,
        /// Agents discovered on this orbit's host (harness-native JSON;
        /// proto stays decoupled from Axis's `AgentInfo` DTO).
        #[serde(default)]
        agents: Option<Value>,
        /// The orbit's runtimes table (which sessions it holds + lastSeq),
        /// used by Axis to relearn locations and drive `resume_from`.
        #[serde(default)]
        runtimes: Vec<RuntimeStatus>,
        #[serde(default)]
        roles: Vec<NodeRole>,
        /// Durable attempts retained for restart reconciliation.
        #[serde(default, rename = "jobAttempts")]
        job_attempts: Vec<JobAttemptStatus>,
    },
    /// Liveness beat.
    Heartbeat {
        #[serde(rename = "nodeId")]
        node_id: String,
        #[serde(default, rename = "slotsUsed")]
        slots_used: u32,
    },
    /// Graceful disconnect.
    Bye {
        #[serde(rename = "nodeId")]
        node_id: String,
    },
    /// Reply to a Axis request frame: ok, or an error message. `result`
    /// carries request-specific payload (e.g. probe → discovery report).
    Resp {
        #[serde(rename = "reqId")]
        req_id: u64,
        ok: bool,
        #[serde(default)]
        error: Option<String>,
        #[serde(default)]
        result: Option<Value>,
    },
    /// A session event. `seq` is a per-session monotonic counter assigned by
    /// the orbit — the ordering/idempotency key for exactly-once replay.
    Event {
        #[serde(rename = "sessionId")]
        session_id: String,
        #[serde(rename = "turnId")]
        turn_id: String,
        seq: u64,
        payload: crate::agent::AgentEvent,
    },
    /// A host observation, sequenced and spooled exactly like runtime events.
    Observed {
        #[serde(rename = "sessionId")]
        session_id: String,
        seq: u64,
        payload: ObservedEvent,
    },
    /// Runtimes-table update (sent in hello and on change).
    Runtimes { runtimes: Vec<RuntimeStatus> },
    JobOutput {
        #[serde(rename = "jobId")]
        job_id: String,
        #[serde(rename = "attemptEpoch")]
        attempt_epoch: u64,
        seq: u64,
        stream: JobStream,
        data: String,
    },
    JobResult {
        #[serde(rename = "jobId")]
        job_id: String,
        #[serde(rename = "attemptEpoch")]
        attempt_epoch: u64,
        seq: u64,
        #[serde(rename = "exitCode")]
        exit_code: Option<i32>,
        truncated: bool,
        #[serde(rename = "timedOut")]
        timed_out: bool,
        cancelled: bool,
    },
    /// Operator terminal output bytes (ADR 0021). `data_b64` is base64 —
    /// PTY output is arbitrary bytes, not guaranteed UTF-8.
    TerminalOutput {
        #[serde(rename = "terminalId")]
        terminal_id: String,
        #[serde(rename = "dataB64")]
        data_b64: String,
    },
    /// The terminal's shell exited (or was killed). Terminal-state; no more
    /// output follows for this `terminal_id`.
    TerminalExited {
        #[serde(rename = "terminalId")]
        terminal_id: String,
        #[serde(default, rename = "exitCode")]
        exit_code: Option<i32>,
    },
}

impl AxisFrame {
    /// The Axis-assigned request id, for frames that expect a `resp`.
    /// `ack`/`resume_from` are fire-and-forget and return `None`.
    pub fn req_id(&self) -> Option<u64> {
        match self {
            AxisFrame::EnsureRuntime { req_id, .. }
            | AxisFrame::Prompt { req_id, .. }
            | AxisFrame::Steer { req_id, .. }
            | AxisFrame::Cancel { req_id, .. }
            | AxisFrame::Stop { req_id, .. }
            | AxisFrame::RespondPermission { req_id, .. }
            | AxisFrame::Drain { req_id, .. }
            | AxisFrame::Probe { req_id }
            | AxisFrame::DispatchJob { req_id, .. }
            | AxisFrame::CancelJob { req_id, .. }
            | AxisFrame::TerminalOpen { req_id, .. } => Some(*req_id),
            AxisFrame::Ack { .. }
            | AxisFrame::ResumeFrom { .. }
            | AxisFrame::HeartbeatAck
            | AxisFrame::ReRegister
            | AxisFrame::TerminalInput { .. }
            | AxisFrame::TerminalResize { .. }
            | AxisFrame::TerminalClose { .. } => None,
        }
    }
}

impl From<&AxisFrame> for Option<AgentCommand> {
    /// Map a session frame onto the runtime-level [`AgentCommand`] it drives,
    /// where a direct mapping exists.
    fn from(frame: &AxisFrame) -> Self {
        match frame {
            AxisFrame::Prompt { text, model, .. } => Some(AgentCommand::Prompt {
                text: text.clone(),
                model: model.clone(),
            }),
            AxisFrame::Steer { text, .. } => Some(AgentCommand::Steer { text: text.clone() }),
            AxisFrame::Cancel { .. } => Some(AgentCommand::Cancel),
            AxisFrame::Stop { .. } => Some(AgentCommand::Stop),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::AgentEvent;
    use crate::version::PROTOCOL_VERSION;
    use serde_json::json;

    fn round_trip<T: Serialize + for<'de> Deserialize<'de> + PartialEq + std::fmt::Debug>(v: &T) {
        let json = serde_json::to_string(v).expect("serialize");
        let back: T = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(&back, v, "round-trip mismatch for {json}");
    }

    fn sample_runtime_status() -> RuntimeStatus {
        RuntimeStatus {
            session_id: "s-1".into(),
            hermes_id: Some("h-1".into()),
            state: "running".into(),
            resumable: true,
            last_seq: 42,
        }
    }

    #[test]
    fn axis_frame_round_trips_every_variant() {
        let frames = [
            AxisFrame::EnsureRuntime {
                req_id: 1,
                session_id: "s-1".into(),
                spec: RuntimeSpec {
                    agent: Some("default".into()),
                    ..Default::default()
                },
                resume_id: Some("h-1".into()),
            },
            AxisFrame::Prompt {
                req_id: 2,
                session_id: "s-1".into(),
                text: "hi".into(),
                model: Some("m".into()),
            },
            AxisFrame::Steer {
                req_id: 3,
                session_id: "s-1".into(),
                text: "focus".into(),
            },
            AxisFrame::Cancel {
                req_id: 4,
                session_id: "s-1".into(),
            },
            AxisFrame::Stop {
                req_id: 5,
                session_id: "s-1".into(),
            },
            AxisFrame::RespondPermission {
                req_id: 6,
                session_id: "s-1".into(),
                request_id: "9".into(),
                option_id: Some("allow-once".into()),
            },
            AxisFrame::DispatchJob {
                req_id: 7,
                job_id: "j-1".into(),
                attempt_epoch: 2,
                package_id: "core.jobs".into(),
                package_version: "0.1".into(),
                package_digest: "builtin:jobs-v1".into(),
                activity: "job.run".into(),
                argv: vec!["true".into()],
                env_allowlist: vec![],
                cwd: None,
                timeout_secs: 30,
                max_output_bytes: 1024,
            },
            AxisFrame::CancelJob {
                req_id: 8,
                job_id: "j-1".into(),
                attempt_epoch: 2,
            },
            AxisFrame::TerminalOpen {
                req_id: 9,
                terminal_id: "term-1".into(),
                cols: 80,
                rows: 24,
                cwd: None,
            },
            AxisFrame::TerminalInput {
                terminal_id: "term-1".into(),
                data_b64: "YQ==".into(),
            },
            AxisFrame::TerminalResize {
                terminal_id: "term-1".into(),
                cols: 120,
                rows: 40,
            },
            AxisFrame::TerminalClose {
                terminal_id: "term-1".into(),
            },
            AxisFrame::Drain {
                req_id: 7,
                to_node: Some("orbit-2".into()),
            },
            AxisFrame::Probe { req_id: 8 },
            AxisFrame::Ack {
                session_id: "s-1".into(),
                seq: 10,
            },
            AxisFrame::ResumeFrom {
                session_id: "s-1".into(),
                seq: 7,
            },
            AxisFrame::HeartbeatAck,
            AxisFrame::ReRegister,
        ];
        for f in &frames {
            round_trip(f);
        }
    }

    #[test]
    fn orbit_frame_round_trips_every_variant() {
        let frames = [
            OrbitFrame::Hello {
                node_id: "orbit-1".into(),
                hostname: "talos".into(),
                slots_total: 4,
                protocol_version: PROTOCOL_VERSION,
                version: BuildVersion::for_binary("0.1.0"),
                agents: Some(json!([{"id": "default", "kind": "hermes"}])),
                runtimes: vec![sample_runtime_status()],
                roles: vec![NodeRole::AgentRuntime, NodeRole::JobRunner],
                job_attempts: vec![JobAttemptStatus {
                    job_id: "j-1".into(),
                    attempt_epoch: 3,
                    state: JobAttemptState::Running,
                    exit_code: None,
                    truncated: false,
                    timed_out: false,
                    cancelled: false,
                    terminal_reason: None,
                    final_sequence: None,
                }],
            },
            OrbitFrame::Heartbeat {
                node_id: "orbit-1".into(),
                slots_used: 2,
            },
            OrbitFrame::Bye {
                node_id: "orbit-1".into(),
            },
            OrbitFrame::Resp {
                req_id: 1,
                ok: true,
                error: None,
                result: Some(json!({"agents": []})),
            },
            OrbitFrame::Resp {
                req_id: 2,
                ok: false,
                error: Some("spawn failed".into()),
                result: None,
            },
            OrbitFrame::Event {
                session_id: "s-1".into(),
                turn_id: "t-1".into(),
                seq: 11,
                payload: AgentEvent::Text("chunk".into()),
            },
            OrbitFrame::Observed {
                session_id: "observed:s-1".into(),
                seq: 12,
                payload: ObservedEvent::Message {
                    hermes_id: "s-1".into(),
                    message_id: 3,
                    role: "user".into(),
                    content: Some("hello".into()),
                    tool_name: None,
                    tool_calls: None,
                    reasoning: None,
                    timestamp: 1.0,
                    token_count: None,
                    finish_reason: None,
                },
            },
            OrbitFrame::Runtimes {
                runtimes: vec![sample_runtime_status()],
            },
            OrbitFrame::JobOutput {
                job_id: "j-1".into(),
                attempt_epoch: 3,
                seq: 1,
                stream: JobStream::Stdout,
                data: "ok".into(),
            },
            OrbitFrame::JobResult {
                job_id: "j-1".into(),
                attempt_epoch: 3,
                seq: 2,
                exit_code: Some(0),
                truncated: false,
                timed_out: false,
                cancelled: false,
            },
            OrbitFrame::TerminalOutput {
                terminal_id: "term-1".into(),
                data_b64: "b2s=".into(),
            },
            OrbitFrame::TerminalExited {
                terminal_id: "term-1".into(),
                exit_code: Some(0),
            },
        ];
        for f in &frames {
            round_trip(f);
        }
    }

    #[test]
    fn frames_are_kind_tagged_camel_case() {
        let f = AxisFrame::EnsureRuntime {
            req_id: 1,
            session_id: "s-1".into(),
            spec: RuntimeSpec::default(),
            resume_id: None,
        };
        let v = serde_json::to_value(&f).unwrap();
        assert_eq!(v["kind"], "ensure_runtime");
        assert_eq!(v["reqId"], 1);
        assert_eq!(v["sessionId"], "s-1");

        let e = OrbitFrame::Event {
            session_id: "s-1".into(),
            turn_id: "t-1".into(),
            seq: 3,
            payload: AgentEvent::Text("x".into()),
        };
        let v = serde_json::to_value(&e).unwrap();
        assert_eq!(v["kind"], "event");
        assert_eq!(v["turnId"], "t-1");
    }

    #[test]
    fn unknown_fields_are_tolerated() {
        let f: AxisFrame = serde_json::from_str(
            r#"{"kind":"prompt","reqId":1,"sessionId":"s-1","text":"hi","futureField":{"x":1}}"#,
        )
        .expect("unknown field must not break deserialization");
        assert!(matches!(f, AxisFrame::Prompt { req_id: 1, .. }));

        let e: OrbitFrame = serde_json::from_str(
            r#"{"kind":"heartbeat","nodeId":"orbit-1","slotsUsed":1,"newThing":true}"#,
        )
        .expect("unknown field must not break deserialization");
        assert!(matches!(e, OrbitFrame::Heartbeat { .. }));
    }

    #[test]
    fn hello_with_wrong_protocol_version_still_parses() {
        // Rejection of incompatible protocol versions is Axis's policy job at
        // registration time — serde must still parse the frame so Axis can see
        // the version and reject it explicitly (fail closed, but informed).
        let json = format!(
            r#"{{"kind":"hello","nodeId":"orbit-9","hostname":"h","slotsTotal":4,
                "protocolVersion":{},"version":{{"semver":"9.9.9"}}}}"#,
            PROTOCOL_VERSION + 40
        );
        let f: OrbitFrame = serde_json::from_str(&json).expect("wrong version must still parse");
        match f {
            OrbitFrame::Hello {
                protocol_version,
                version,
                runtimes,
                ..
            } => {
                assert_eq!(protocol_version, PROTOCOL_VERSION + 40);
                assert_eq!(version.git_hash, "unknown"); // #[serde(default)]
                assert!(runtimes.is_empty()); // #[serde(default)]
            }
            other => panic!("expected Hello, got {other:?}"),
        }
    }

    #[test]
    fn req_id_accessor_covers_request_frames_only() {
        assert_eq!(AxisFrame::Probe { req_id: 5 }.req_id(), Some(5));
        assert_eq!(
            AxisFrame::Ack {
                session_id: "s".into(),
                seq: 1
            }
            .req_id(),
            None
        );
    }

    #[test]
    fn prompt_frame_maps_to_agent_command() {
        let f = AxisFrame::Prompt {
            req_id: 1,
            session_id: "s-1".into(),
            text: "hi".into(),
            model: None,
        };
        let cmd: Option<AgentCommand> = (&f).into();
        assert_eq!(
            cmd,
            Some(AgentCommand::Prompt {
                text: "hi".into(),
                model: None
            })
        );
    }
}
