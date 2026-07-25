//! S7 integration test: axis-side iroh endpoint (real node.rs dispatch) accepts
//! a remote orbit over iroh; full hello → ensure_runtime round-trip works with
//! allowlist enforcement.
//!
//! These tests exercise the transport-generic `handle_orbit_conn` dispatch over
//! real iroh QUIC streams (public n0 relays, loopback). The same dispatch code
//! runs over UDS for local orbits — no protocol fork (ADR 0008 §1).

use iroh::endpoint::presets;
use iroh::{Endpoint, PublicKey, RelayMode, SecretKey};
use stellarc_axis::node::{self, NodeRegistry};
use stellarc_axis::server::orbit_conn::OrbitConnections;
use stellarc_orbit::transport::STELLARC_ALPN;
use stellarc_proto::frames::{OrbitFrame, AxisFrame};
use stellarc_proto::version::{BuildVersion, PROTOCOL_VERSION};

use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

/// Spawn a axis-side iroh accept loop that delegates to `handle_orbit_conn`.
/// Peers not in `allowlist` are rejected at accept (fail closed). An empty
/// allowlist rejects ALL peers (fail-closed default).
async fn spawn_axis(
    allowlist: Vec<PublicKey>,
) -> (Endpoint, PublicKey, NodeRegistry, OrbitConnections) {
    let secret = SecretKey::generate();
    let endpoint = Endpoint::builder(presets::N0)
        .secret_key(secret)
        .alpns(vec![STELLARC_ALPN.to_vec()])
        .relay_mode(RelayMode::Disabled)
        .bind()
        .await
        .expect("axis endpoint binds");
    let axis_key = endpoint.id();
    let registry = NodeRegistry::new();
    let conns = OrbitConnections::new();

    let reg = registry.clone();
    let cs = conns.clone();
    let allow = allowlist.clone();
    let ep = endpoint.clone();
    tokio::spawn(async move {
        while let Some(incoming) = ep.accept().await {
            let conn = match incoming.await {
                Ok(c) => c,
                Err(_) => continue,
            };
            let peer = conn.remote_id();
            if !allow.contains(&peer) {
                conn.close(1u32.into(), b"not allowlisted");
                continue;
            }
            let r = reg.clone();
            let c = cs.clone();
            tokio::spawn(async move {
                if let Ok((send, recv)) = conn.accept_bi().await {
                    node::handle_orbit_conn(
                        recv,
                        send,
                        r,
                        c,
                        node::NodeTransport::Iroh,
                        Some(peer.to_string()),
                    )
                    .await;
                }
            });
        }
    });
    (endpoint, axis_key, registry, conns)
}

async fn connect_direct(
    endpoint: &Endpoint,
    axis: &Endpoint,
) -> (iroh::endpoint::SendStream, iroh::endpoint::RecvStream) {
    endpoint
        .connect(axis.addr(), STELLARC_ALPN)
        .await
        .expect("orbit connects directly")
        .open_bi()
        .await
        .expect("orbit opens bidirectional stream")
}

/// Poll the registry until the node appears, or timeout.
async fn wait_for_node(registry: &NodeRegistry, node_id: &str, timeout_secs: u64) -> bool {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(timeout_secs);
    loop {
        let nodes = registry.list().await;
        if nodes.iter().any(|n| n.node_id == node_id) {
            return true;
        }
        if std::time::Instant::now() > deadline {
            return false;
        }
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }
}

#[tokio::test]
async fn iroh_orbit_hello_registers_in_registry() {
    let orbit_secret = SecretKey::generate();
    let orbit_pub = orbit_secret.public();
    let (axis_ep, _axis_key, registry, _conns) = spawn_axis(vec![orbit_pub]).await;

    // The orbit endpoint MUST stay alive for the connection lifetime.
    let orbit_ep = Endpoint::builder(presets::N0)
        .secret_key(orbit_secret)
        .relay_mode(RelayMode::Disabled)
        .bind()
        .await
        .expect("orbit binds");
    let (mut send, _recv) = connect_direct(&orbit_ep, &axis_ep).await;

    let hello = OrbitFrame::Hello {
        node_id: "orbit-iroh-1".into(),
        hostname: "iroh-test".into(),
        slots_total: 4,
        protocol_version: PROTOCOL_VERSION,
        version: BuildVersion::for_binary("0.0.0-test"),
        agents: None,
        runtimes: vec![],
        roles: vec![stellarc_proto::frames::NodeRole::AgentRuntime],
        job_attempts: vec![],
    };
    let mut line = serde_json::to_string(&hello).unwrap();
    line.push('\n');
    send.write_all(line.as_bytes()).await.unwrap();
    send.flush().await.unwrap();

    assert!(
        wait_for_node(&registry, "orbit-iroh-1", 15).await,
        "orbit should register within 15s"
    );

    let _ = orbit_ep.close().await;
}

#[tokio::test]
async fn iroh_non_allowlisted_orbit_rejected() {
    let (axis_ep, _axis_key, registry, _conns) = spawn_axis(vec![]).await;

    let orbit_secret = SecretKey::generate();
    let orbit_ep = Endpoint::builder(presets::N0)
        .secret_key(orbit_secret)
        .relay_mode(RelayMode::Disabled)
        .bind()
        .await
        .unwrap();

    if let Ok(connection) = orbit_ep.connect(axis_ep.addr(), STELLARC_ALPN).await {
        if let Ok((mut send, _recv)) = connection.open_bi().await {
            let hello = serde_json::json!({
                "kind": "hello",
                "nodeId": "rejected-orbit",
                "hostname": "evil",
                "slotsTotal": 4,
                "protocolVersion": PROTOCOL_VERSION,
            });
            let _ = send.write_all(format!("{hello}\n").as_bytes()).await;
            let _ = send.flush().await;
        }
    }
    tokio::time::sleep(std::time::Duration::from_secs(3)).await;
    let _ = orbit_ep.close().await;

    let nodes = registry.list().await;
    assert!(
        !nodes.iter().any(|n| n.node_id == "rejected-orbit"),
        "non-allowlisted orbit must not register"
    );
}

#[tokio::test]
async fn iroh_ensure_runtime_round_trip() {
    // Full round-trip: hello → axis sends EnsureRuntime via RemoteRuntime →
    // orbit reads it and responds with Resp → RemoteRuntime resolves.
    let orbit_secret = SecretKey::generate();
    let orbit_pub = orbit_secret.public();
    let (axis_ep, _axis_key, registry, conns) = spawn_axis(vec![orbit_pub]).await;

    // Orbit endpoint stays alive for the whole test.
    let orbit_ep = Endpoint::builder(presets::N0)
        .secret_key(orbit_secret)
        .relay_mode(RelayMode::Disabled)
        .bind()
        .await
        .expect("orbit binds");
    let (mut send, recv) = connect_direct(&orbit_ep, &axis_ep).await;

    // Send hello.
    let hello = OrbitFrame::Hello {
        node_id: "orbit-rt".into(),
        hostname: "iroh-host".into(),
        slots_total: 4,
        protocol_version: PROTOCOL_VERSION,
        version: BuildVersion::for_binary("0.0.0-test"),
        agents: None,
        runtimes: vec![],
        roles: vec![stellarc_proto::frames::NodeRole::AgentRuntime],
        job_attempts: vec![],
    };
    let mut line = serde_json::to_string(&hello).unwrap();
    line.push('\n');
    send.write_all(line.as_bytes()).await.unwrap();
    send.flush().await.unwrap();

    // Wait for registration.
    assert!(
        wait_for_node(&registry, "orbit-rt", 15).await,
        "orbit registered before round-trip"
    );

    // Spawn a responder that reads AxisFrames and replies to EnsureRuntime.
    // Keeps `send` alive so the connection doesn't close prematurely.
    let send_arc = std::sync::Arc::new(tokio::sync::Mutex::new(send));
    let send_for_responder = send_arc.clone();
    let responder = tokio::spawn(async move {
        let mut lines = BufReader::new(recv).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let line = line.trim().to_string();
            if line.is_empty() {
                continue;
            }
            if let Ok(AxisFrame::EnsureRuntime { req_id, .. }) =
                serde_json::from_str::<AxisFrame>(&line)
            {
                let resp = OrbitFrame::Resp {
                    req_id,
                    ok: true,
                    error: None,
                    result: Some(serde_json::json!({"hermesId": "hermes-iroh-mock"})),
                };
                let mut resp_line = serde_json::to_string(&resp).unwrap();
                resp_line.push('\n');
                let mut w = send_for_responder.lock().await;
                let _ = w.write_all(resp_line.as_bytes()).await;
                let _ = w.flush().await;
                return;
            }
        }
    });

    // Use RemoteRuntime (axis-side) to drive ensure_runtime on the orbit.
    let conn = conns.get("orbit-rt").await.expect("conn exists");
    let rt =
        stellarc_axis::server::orbit_conn::RemoteRuntime::new_arc(conn, "s-iroh-rt".into());

    let result = tokio::time::timeout(std::time::Duration::from_secs(15), rt.start(None)).await;

    assert!(result.is_ok(), "ensure_runtime timed out");
    let start_result = result.unwrap();
    assert!(
        start_result.is_ok(),
        "ensure_runtime succeeded over iroh: {:?}",
        start_result.err()
    );
    assert_eq!(
        rt.hermes_session_id().await.as_deref(),
        Some("hermes-iroh-mock"),
        "hermesId captured from iroh Resp"
    );

    let _ = responder.await;
    let _ = orbit_ep.close().await;
}
