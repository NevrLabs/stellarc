//! Iroh transport for the Axis↔Orbit wire protocol (ADR 0008 §1, milestone S7).
//!
//! The JSON-lines OrbitFrame/AxisFrame protocol is transport-agnostic: locally
//! it runs over UDS, or over iroh QUIC — e2e-encrypted and keyed by node ids
//! either way. Remote peers use n0 discovery + relays for NAT traversal;
//! same-host and LAN peers use [`Reach::Local`], which dials a direct address
//! with no DNS, relay, or public-internet dependency (ADR 0035 §1.1). One orbit connection =
//! one bidirectional QUIC stream carrying the same newline-delimited JSON both
//! ways — so the Axis/orbit read-loops don't fork per transport.
//!
//! Key handling: the orbit persists its ed25519 secret key at
//! `<state_dir>/iroh.key` (32 raw bytes, 0600) so its node id is stable across
//! restarts — the node id IS the allowlist identity on the Axis side.

use std::path::Path;

use anyhow::{Context, Result};
use iroh::endpoint::presets;
use iroh::{Endpoint, EndpointAddr, PublicKey, SecretKey};

/// ALPN for the Stellarc Axis↔Orbit protocol.
pub const STELLARC_ALPN: &[u8] = b"stellarc/orbit/1";

/// Load the persisted iroh secret key from `dir/iroh.key`, generating and
/// persisting a fresh one on first run (0600 perms).
pub fn load_or_create_secret(dir: &Path) -> Result<SecretKey> {
    let path = dir.join("iroh.key");
    if path.exists() {
        let bytes =
            std::fs::read(&path).with_context(|| format!("reading iroh key {}", path.display()))?;
        let arr: [u8; 32] = bytes
            .as_slice()
            .try_into()
            .map_err(|_| anyhow::anyhow!("iroh.key must be exactly 32 bytes"))?;
        return Ok(SecretKey::from_bytes(&arr));
    }
    std::fs::create_dir_all(dir).with_context(|| format!("creating {}", dir.display()))?;
    let key = SecretKey::generate();
    std::fs::write(&path, key.to_bytes())
        .with_context(|| format!("writing iroh key {}", path.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))
            .with_context(|| format!("chmod 600 {}", path.display()))?;
    }
    Ok(key)
}

/// How an endpoint reaches its peers.
///
/// `presets::N0` publishes this endpoint to n0's pkarr/DNS servers and enables
/// relay fallback. That is correct for a node on someone else's network and
/// wrong for a peer on this machine: it makes reaching `localhost` depend on
/// public internet reachability. ADR 0035 §1.1.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Reach {
    /// Same host or LAN, dialed by direct address. No DNS, no relays, no
    /// public internet. Used for the Windows-axis <-> WSL-orbit pair.
    Local,
    /// Remote node: n0 discovery + relay fallback for NAT traversal.
    #[default]
    Global,
}

impl Reach {
    /// `Local` when the axis target is an explicit socket address, `Global`
    /// when it is a bare node id that has to be discovered.
    pub fn for_target(target: &str) -> Self {
        if parse_direct_target(target).is_some() {
            Self::Local
        } else {
            Self::Global
        }
    }
}

/// Bind an iroh endpoint accepting the Stellarc ALPN.
///
/// `Reach::Local` uses the minimal preset (crypto provider only) so no traffic
/// leaves the machine for peer discovery.
pub async fn bind_endpoint_with(secret: SecretKey, reach: Reach) -> Result<Endpoint> {
    let alpns = vec![STELLARC_ALPN.to_vec()];
    let ep = match reach {
        Reach::Local => {
            Endpoint::builder(presets::Minimal)
                .secret_key(secret)
                .alpns(alpns)
                .bind()
                .await
        }
        Reach::Global => {
            Endpoint::builder(presets::N0)
                .secret_key(secret)
                .alpns(alpns)
                .bind()
                .await
        }
    }
    .context("binding iroh endpoint")?;
    Ok(ep)
}

/// Bind for a remote (internet-reachable) peer. Equivalent to
/// `bind_endpoint_with(secret, Reach::Global)`.
pub async fn bind_endpoint(secret: SecretKey) -> Result<Endpoint> {
    bind_endpoint_with(secret, Reach::Global).await
}

/// Split a `<node-id>@<socket-addr>[,<socket-addr>...]` target.
///
/// Returns `None` for a bare node id, which is the discovery path.
fn parse_direct_target(target: &str) -> Option<(&str, Vec<std::net::SocketAddr>)> {
    let (id, addrs) = target.split_once('@')?;
    let parsed: Vec<std::net::SocketAddr> = addrs
        .split(',')
        .filter(|part| !part.is_empty())
        .filter_map(|part| part.trim().parse().ok())
        .collect();
    if parsed.is_empty() {
        return None;
    }
    Some((id, parsed))
}

/// Connect to a Axis by its iroh node id (public key, z-base-32 or hex as
/// printed by the axis at boot). Returns the QUIC connection's bi-stream
/// halves, which speak the same JSON-lines protocol as the UDS path.
pub async fn connect_to_axis(
    endpoint: &Endpoint,
    axis_node_id: &str,
) -> Result<(iroh::endpoint::SendStream, iroh::endpoint::RecvStream)> {
    // `<id>@<addr>` dials the address directly; a bare `<id>` needs discovery.
    // Without at least one of the two, iroh has no way to reach the peer.
    let (id_part, direct) = match parse_direct_target(axis_node_id) {
        Some((id, addrs)) => (id, addrs),
        None => (axis_node_id, Vec::new()),
    };
    let key: PublicKey = id_part
        .parse()
        .with_context(|| format!("parsing axis node id {id_part:?}"))?;
    let mut addr = EndpointAddr::from(key);
    for socket in direct {
        addr = addr.with_ip_addr(socket);
    }
    let conn = endpoint
        .connect(addr, STELLARC_ALPN)
        .await
        .with_context(|| format!("connecting to axis {axis_node_id} via iroh"))?;
    let (send, recv) = conn
        .open_bi()
        .await
        .context("opening bidirectional stream to axis")?;
    Ok((send, recv))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A same-host peer must never be routed through n0 discovery: requiring
    /// internet reachability to reach localhost is the bug ADR 0035 §1.1 fixes.
    #[test]
    fn direct_target_selects_local_reach() {
        let id = "k7hqz4vfbnbcmxwzptlqzstsqvenzyzpxvhwvhwvhwvhwvhwvhwa";

        let one = format!("{id}@127.0.0.1:9999");
        let (parsed_id, addrs) =
            parse_direct_target(&one).expect("id@addr must parse as a direct target");
        assert_eq!(parsed_id, id);
        assert_eq!(addrs.len(), 1);
        assert_eq!(addrs[0].port(), 9999);
        assert!(addrs[0].ip().is_loopback());

        // multiple addresses (e.g. WSL NAT address + mirrored loopback)
        let multi = format!("{id}@127.0.0.1:1,172.20.0.2:2");
        let (_, many) = parse_direct_target(&multi).expect("comma-separated addrs must parse");
        assert_eq!(many.len(), 2);

        // a bare node id has no address, so it must fall back to discovery
        assert!(parse_direct_target(id).is_none());
        // an unparseable address is not a direct target either
        let bad = format!("{id}@not-an-addr");
        assert!(parse_direct_target(&bad).is_none());

        assert_eq!(Reach::for_target(&one), Reach::Local);
        assert_eq!(Reach::for_target(id), Reach::Global);
        assert_eq!(Reach::default(), Reach::Global, "remote stays the default");
    }

    #[test]
    fn key_persists_and_reloads() {
        let dir = tempfile::tempdir().unwrap();
        let k1 = load_or_create_secret(dir.path()).unwrap();
        let k2 = load_or_create_secret(dir.path()).unwrap();
        assert_eq!(
            k1.to_bytes(),
            k2.to_bytes(),
            "key must be stable across loads"
        );
        assert_eq!(k1.public(), k2.public());
    }

    #[test]
    fn key_file_is_0600() {
        let dir = tempfile::tempdir().unwrap();
        load_or_create_secret(dir.path()).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(dir.path().join("iroh.key"))
                .unwrap()
                .permissions()
                .mode();
            assert_eq!(mode & 0o777, 0o600);
        }
    }

    #[test]
    fn corrupt_key_fails_closed() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("iroh.key"), b"short").unwrap();
        assert!(load_or_create_secret(dir.path()).is_err());
    }
}
