//! S7 integration test: two iroh endpoints (axis-side accept + orbit-side
//! connect) exchange OrbitFrame/AxisFrame JSON-lines over a QUIC bi-stream,
//! plus the allowlist rejection path.
//!
//! Uses real iroh endpoints with deterministic direct loopback addresses and
//! public relays disabled. Public endpoint discovery is deliberately excluded
//! from the canonical offline suite.

use iroh::endpoint::presets;
use iroh::{Endpoint, RelayMode, SecretKey};
use stellarc_orbit::transport::{load_or_create_secret, STELLARC_ALPN};
use stellarc_proto::frames::OrbitFrame;
use stellarc_proto::version::{BuildVersion, PROTOCOL_VERSION};

/// Axis-side accept loop for one connection: reads one line, parses an
/// OrbitFrame, answers with a welcome-ish JSON line.
async fn axis_accept_once(ep: Endpoint, allowlist: Vec<iroh::PublicKey>) -> Option<OrbitFrame> {
    let incoming = ep.accept().await?;
    let conn = incoming.await.ok()?;
    // Allowlist gate: reject peers not on the list (fail closed).
    let peer = conn.remote_id();
    if !allowlist.contains(&peer) {
        conn.close(1u32.into(), b"not allowlisted");
        return None;
    }
    let (mut send, mut recv) = conn.accept_bi().await.ok()?;
    let buf = recv.read_to_end(64 * 1024).await.ok()?;
    let line = String::from_utf8(buf).ok()?;
    let frame: OrbitFrame = serde_json::from_str(line.trim()).ok()?;
    send.write_all(b"{\"kind\":\"ack\",\"status\":\"ok\"}\n")
        .await
        .ok()?;
    send.finish().ok()?;
    // Give the peer a moment to read before the connection drops.
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    Some(frame)
}

async fn connect_direct(
    endpoint: &Endpoint,
    axis: &Endpoint,
) -> anyhow::Result<(iroh::endpoint::SendStream, iroh::endpoint::RecvStream)> {
    let connection = endpoint.connect(axis.addr(), STELLARC_ALPN).await?;
    Ok(connection.open_bi().await?)
}

#[tokio::test]
async fn iroh_loopback_hello_round_trip() {
    // Axis endpoint.
    let axis_secret = SecretKey::generate();
    let axis_ep = Endpoint::builder(presets::N0)
        .secret_key(axis_secret)
        .alpns(vec![STELLARC_ALPN.to_vec()])
        .relay_mode(RelayMode::Disabled)
        .bind()
        .await
        .expect("axis endpoint binds");
    // Orbit endpoint with a persisted key (exercises load_or_create_secret).
    let dir = tempfile::tempdir().unwrap();
    let orbit_secret = load_or_create_secret(dir.path()).unwrap();
    let orbit_pub = orbit_secret.public();
    let orbit_ep = Endpoint::builder(presets::N0)
        .secret_key(orbit_secret)
        .relay_mode(RelayMode::Disabled)
        .bind()
        .await
        .expect("orbit endpoint binds");

    // Axis accepts in the background, allowlisting the orbit.
    let axis_task = tokio::spawn(axis_accept_once(axis_ep.clone(), vec![orbit_pub]));

    let (mut send, mut recv) = connect_direct(&orbit_ep, &axis_ep)
        .await
        .expect("orbit connects to axis via iroh");

    let hello = OrbitFrame::Hello {
        node_id: "orbit-test".into(),
        hostname: "loopback".into(),
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
    send.finish().unwrap();

    let reply = recv.read_to_end(4096).await.unwrap();
    let reply = String::from_utf8(reply).unwrap();
    assert!(reply.contains("\"ack\""), "axis acked: {reply}");

    let received = tokio::time::timeout(std::time::Duration::from_secs(30), axis_task)
        .await
        .expect("axis accept did not hang")
        .expect("axis task ok")
        .expect("axis saw a frame");
    match received {
        OrbitFrame::Hello {
            node_id,
            protocol_version,
            ..
        } => {
            assert_eq!(node_id, "orbit-test");
            assert_eq!(protocol_version, PROTOCOL_VERSION);
        }
        other => panic!("expected Hello, got {other:?}"),
    }

    orbit_ep.close().await;
    axis_ep.close().await;
}

#[tokio::test]
async fn iroh_rejects_non_allowlisted_peer() {
    let axis_ep = Endpoint::builder(presets::N0)
        .secret_key(SecretKey::generate())
        .alpns(vec![STELLARC_ALPN.to_vec()])
        .relay_mode(RelayMode::Disabled)
        .bind()
        .await
        .expect("axis endpoint binds");

    // Empty allowlist — every peer must be rejected.
    let axis_task = tokio::spawn(axis_accept_once(axis_ep.clone(), vec![]));

    let orbit_ep = Endpoint::builder(presets::N0)
        .secret_key(SecretKey::generate())
        .relay_mode(RelayMode::Disabled)
        .bind()
        .await
        .expect("orbit endpoint binds");

    // The QUIC connection itself may establish (allowlist is checked
    // post-handshake), but the axis must close it without processing frames.
    if let Ok((mut send, mut recv)) = connect_direct(&orbit_ep, &axis_ep).await {
        let _ = send
            .write_all(b"{\"kind\":\"heartbeat\",\"nodeId\":\"x\"}\n")
            .await;
        let _ = send.finish();
        // Read should yield nothing / error — the axis closed on us.
        let got = recv.read_to_end(4096).await.unwrap_or_default();
        assert!(
            got.is_empty(),
            "non-allowlisted peer must get no protocol reply, got: {}",
            String::from_utf8_lossy(&got)
        );
    }

    let seen = tokio::time::timeout(std::time::Duration::from_secs(30), axis_task)
        .await
        .expect("axis accept did not hang")
        .expect("axis task ok");
    assert!(
        seen.is_none(),
        "axis must not process frames from non-allowlisted peers"
    );

    orbit_ep.close().await;
    axis_ep.close().await;
}
