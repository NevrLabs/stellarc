//! Runtime spawn/wire configuration types shared between Axis and Orbit.

use serde::{Deserialize, Serialize};

/// Managed-session workspace contract understood by current Axis and Orbit.
/// Zero is reserved for legacy payloads that predate node-local workspaces.
pub const MANAGED_WORKSPACE_VERSION: u8 = 1;

/// What an agent runtime needs to spawn: which agent (Hermes profile) drives it
/// and on which node. The factory turns this into a concrete runtime.
///
/// Moved from `stellarc-axis`'s `server/bridge_mgr.rs` (ADR 0008).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSpec {
    /// Hermes profile to run as (`None` → the server's default profile).
    #[serde(default)]
    pub agent: Option<String>,
    /// Node to run on ("local" for now; multi-node is post-MVP).
    #[serde(default)]
    pub node: Option<String>,
    /// Organization that owns the managed session. Orbits combine this
    /// logical identity with the request's session id to materialize a
    /// node-local workspace; Axis-local absolute paths are not portable.
    #[serde(default)]
    pub organization_id: Option<String>,
    /// Versioned node-local workspace contract. New Orbits reject legacy zero
    /// with an actionable upgrade error instead of misdiagnosing a missing
    /// Axis-local cwd as a missing agent executable.
    #[serde(default)]
    pub workspace_version: u8,
    /// Legacy/local requested working directory. A production Orbit ignores
    /// this Axis-local path for managed sessions and derives its working
    /// directory from `organization_id` plus the request's session id.
    #[serde(default)]
    pub cwd: Option<String>,
    /// MCP servers to inject into the ACP session/new request (resolved from
    /// the registry by the setup adapter). Each value is the harness's native
    /// MCP server JSON. `None`/empty → no MCP servers (legacy behavior).
    #[serde(default)]
    pub mcp_servers: Vec<serde_json::Value>,
    /// Extra environment variables for the child process (from the setup
    /// adapter, e.g. HERMES_SKILLS_PATH). Default empty.
    #[serde(default)]
    pub env: Vec<(String, String)>,
}

/// Which JSON-RPC framing an ACP adapter speaks on stdio.
///
/// Moved from `stellarc-axis`'s `bridge/hermes.rs` (ADR 0008).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AcpFraming {
    /// One compact JSON object per line, `\n`-terminated (what `hermes acp`,
    /// claude-code-acp, and codex-acp actually use on the wire).
    NewlineJson,
    /// LSP-style `Content-Length: <n>\r\n\r\n<body>` framing (ACP spec).
    ContentLength,
}

/// How an ACP adapter accepts a mid-session model switch.
///
/// Not every harness exposes the same method. `hermes acp` implements the
/// Hermes-native `session/set_model`; the Zed Claude Code and Codex adapters
/// implement the ACP-standard `session/set_config_option` with
/// `configId: "model"` instead and return JSON-RPC `-32601 Method not found`
/// for `session/set_model`. Keep the selection seam explicit (like
/// [`AcpFraming`]) so the protocol client never guesses.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ModelSetStyle {
    /// `session/set_model { sessionId, modelId }` — Hermes ACP.
    SetModel,
    /// `session/set_config_option { sessionId, configId: "model", value }` —
    /// the ACP-standard config surface used by Claude Code and Codex adapters.
    ConfigOption,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runtime_spec_round_trips_camel_case() {
        let spec = RuntimeSpec {
            agent: Some("default".into()),
            node: Some("local".into()),
            organization_id: Some("org-a".into()),
            workspace_version: MANAGED_WORKSPACE_VERSION,
            cwd: Some("/tmp/space".into()),
            mcp_servers: vec![serde_json::json!({"name": "gh"})],
            env: vec![("HERMES_SKILLS_PATH".into(), "/x".into())],
        };
        let json = serde_json::to_value(&spec).unwrap();
        assert!(json.get("mcpServers").is_some(), "camelCase wire naming");
        assert_eq!(json["organizationId"], "org-a");
        assert_eq!(json["workspaceVersion"], MANAGED_WORKSPACE_VERSION);
        let back: RuntimeSpec = serde_json::from_value(json).unwrap();
        assert_eq!(back, spec);
    }

    #[test]
    fn runtime_spec_tolerates_missing_and_unknown_fields() {
        let spec: RuntimeSpec = serde_json::from_str(r#"{"agent":"a","futureField":1}"#).unwrap();
        assert_eq!(spec.agent.as_deref(), Some("a"));
        assert!(spec.organization_id.is_none());
        assert_eq!(spec.workspace_version, 0, "legacy payload marker");
        assert!(spec.mcp_servers.is_empty());
    }

    #[test]
    fn acp_framing_round_trips() {
        for f in [AcpFraming::NewlineJson, AcpFraming::ContentLength] {
            let json = serde_json::to_string(&f).unwrap();
            let back: AcpFraming = serde_json::from_str(&json).unwrap();
            assert_eq!(back, f);
        }
        assert_eq!(
            serde_json::to_string(&AcpFraming::NewlineJson).unwrap(),
            "\"newline_json\""
        );
    }
}
