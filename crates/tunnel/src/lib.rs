//! stellarc tunnel — capability-scoped harness exposure over iroh (ADR 0004).
//! Transport only: carries bytes between authorized principals; authorization
//! stays at the CP chokepoint. Standalone product wedge.
//!
//! MVP: expose one stdio harness (e.g. `hermes acp`) over an iroh endpoint.
//! A client holding a scoped connection ticket (endpoint address, bearer
//! token, expiry) connects and speaks ACP through the tunnel. A wrong or
//! expired ticket is refused before the harness ever spawns (fail closed).

use std::process::Stdio;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use anyhow::{anyhow, bail, Context, Result};
use iroh::endpoint::{presets, Connection, Endpoint, RecvStream, SendStream};
use iroh::EndpointAddr;
use serde::{Deserialize, Serialize};
use tokio::process::Command;

/// ALPN for the tunnel protocol.
pub const ALPN: &[u8] = b"stellarc/tunnel/0";
const AUTH_TIMEOUT: Duration = Duration::from_secs(10);
const TOKEN_BYTES: usize = 32; // 64 hex chars on the wire

/// Scoped connection ticket: who to dial + proof you may.
/// The server enforces token + expiry from its own copy; the client's copy is
/// just addressing + UX. Per ADR 0004 this is the tunnel's entire permission
/// model — anything richer belongs at the CP chokepoint.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ticket {
    pub addr: EndpointAddr,
    pub token: String,   // hex bearer token
    pub expires_at: u64, // unix seconds
}

impl Ticket {
    /// Hex-encoded JSON. ponytail: hex not base64 — std has neither, hex is 6 lines.
    pub fn encode(&self) -> Result<String> {
        Ok(hex_encode(&serde_json::to_vec(self)?))
    }

    pub fn decode(s: &str) -> Result<Self> {
        Ok(serde_json::from_slice(&hex_decode(s.trim())?)?)
    }
}

/// A bound tunnel server. Hold it, print `ticket`, then `run()`.
pub struct Server {
    pub endpoint: Endpoint,
    pub ticket: Ticket,
}

/// Bind an iroh endpoint and mint one scoped ticket valid for `ttl`.
pub async fn bind_server(ttl: Duration) -> Result<Server> {
    let endpoint = Endpoint::builder(presets::N0)
        .alpns(vec![ALPN.to_vec()])
        .bind()
        .await
        .map_err(|e| anyhow!("bind endpoint: {e}"))?;

    // Union of whatever iroh already knows plus our bound sockets with
    // unspecified IPs mapped to loopback, so same-host demos dial direct.
    let mut addr = endpoint.addr();
    for sa in endpoint.bound_sockets() {
        let sa = if sa.ip().is_unspecified() {
            let ip = if sa.is_ipv4() {
                std::net::IpAddr::V4(std::net::Ipv4Addr::LOCALHOST)
            } else {
                std::net::IpAddr::V6(std::net::Ipv6Addr::LOCALHOST)
            };
            std::net::SocketAddr::new(ip, sa.port())
        } else {
            sa
        };
        addr = addr.with_ip_addr(sa);
    }

    let ticket = Ticket {
        addr,
        token: new_token()?,
        expires_at: now() + ttl.as_secs(),
    };
    Ok(Server { endpoint, ticket })
}

impl Server {
    /// Accept connections forever; each authorized connection gets its own
    /// fresh harness process (`cmd`), stdio piped over the QUIC stream.
    pub async fn run(&self, cmd: &[String]) -> Result<()> {
        while let Some(incoming) = self.endpoint.accept().await {
            let conn = match incoming.await {
                Ok(c) => c,
                Err(e) => {
                    eprintln!("tunnel: handshake failed: {e}");
                    continue;
                }
            };
            let token = self.ticket.token.clone();
            let expires_at = self.ticket.expires_at;
            let cmd = cmd.to_vec();
            tokio::spawn(async move {
                if let Err(e) = handle_conn(conn, &token, expires_at, &cmd).await {
                    eprintln!("tunnel: connection ended: {e:#}");
                }
            });
        }
        Ok(())
    }
}

async fn handle_conn(conn: Connection, token: &str, expires_at: u64, cmd: &[String]) -> Result<()> {
    let (mut send, mut recv) = conn
        .accept_bi()
        .await
        .map_err(|e| anyhow!("accept_bi: {e}"))?;

    // Fail closed: exactly `token\n` within the timeout, or the connection
    // dies and no harness is spawned.
    let mut line = vec![0u8; TOKEN_BYTES * 2 + 1];
    let authed = match tokio::time::timeout(AUTH_TIMEOUT, recv.read_exact(&mut line)).await {
        Ok(Ok(())) => {
            line.last() == Some(&b'\n')
                && ct_eq(&line[..TOKEN_BYTES * 2], token.as_bytes())
                && now() < expires_at
        }
        _ => false,
    };
    if !authed {
        conn.close(1u8.into(), b"refused");
        bail!("refused: bad or expired ticket from {}", conn.remote_id());
    }
    send.write_all(b"OK\n").await.context("auth ack")?;

    let mut child = Command::new(&cmd[0])
        .args(&cmd[1..])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .kill_on_drop(true)
        .spawn()
        .with_context(|| format!("spawn harness {cmd:?}"))?;
    let mut stdin = child.stdin.take().context("child stdin")?;
    let mut stdout = child.stdout.take().context("child stdout")?;

    // Dumb pipe with drain semantics: a direction ending does NOT tear down
    // the other. Client EOF closes the child's stdin (harness may respond and
    // exit); child exit finishes our send side (client sees a clean EOF).
    // Known spike weakness: a harness that never exits after stdin EOF keeps
    // the connection open — fine for ACP request/response, not policed here.
    let to_harness = tokio::spawn(async move {
        let r = tokio::io::copy(&mut recv, &mut stdin).await;
        drop(stdin);
        r
    });
    let from_harness = tokio::spawn(async move {
        let r = tokio::io::copy(&mut stdout, &mut send).await;
        let _ = send.finish();
        r
    });
    to_harness
        .await
        .map_err(|e| anyhow!("join client->harness: {e}"))?
        .context("client->harness")?;
    from_harness
        .await
        .map_err(|e| anyhow!("join harness->client: {e}"))?
        .context("harness->client")?;
    // Wait for the client's close rather than closing first: an immediate
    // close after `finish()` races the in-flight stream data and the client
    // sees ConnectionLost instead of a clean EOF. Idle timeout covers a
    // vanished peer.
    let _ = conn.closed().await;
    Ok(())
}

/// A connected, authorized client. Speak ACP on `send`/`recv`.
pub struct Client {
    pub endpoint: Endpoint,
    pub conn: Connection,
    pub send: SendStream,
    pub recv: RecvStream,
}

/// Dial the ticket's endpoint, present the token, await the `OK`.
/// Errors (refusal, timeout, dead endpoint) all fail closed.
pub async fn connect(ticket: &Ticket) -> Result<Client> {
    let endpoint = Endpoint::bind(presets::N0)
        .await
        .map_err(|e| anyhow!("bind client endpoint: {e}"))?;
    let conn = endpoint
        .connect(ticket.addr.clone(), ALPN)
        .await
        .map_err(|e| anyhow!("connect: {e}"))?;
    let (mut send, mut recv) = conn.open_bi().await.map_err(|e| anyhow!("open_bi: {e}"))?;
    send.write_all(format!("{}\n", ticket.token).as_bytes())
        .await
        .context("send token")?;
    let mut ok = [0u8; 3];
    tokio::time::timeout(AUTH_TIMEOUT, recv.read_exact(&mut ok))
        .await
        .map_err(|_| anyhow!("refused: auth timed out"))?
        .map_err(|e| anyhow!("refused: {e}"))?;
    if &ok != b"OK\n" {
        bail!("refused: unexpected auth reply");
    }
    Ok(Client {
        endpoint,
        conn,
        send,
        recv,
    })
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs()
}

// ponytail: /dev/urandom directly — Linux-only spike, swap for getrandom crate
// if this outlives the spike.
fn new_token() -> Result<String> {
    use std::io::Read;
    let mut buf = [0u8; TOKEN_BYTES];
    std::fs::File::open("/dev/urandom")?.read_exact(&mut buf)?;
    Ok(hex_encode(&buf))
}

fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn hex_decode(s: &str) -> Result<Vec<u8>> {
    if !s.len().is_multiple_of(2) {
        bail!("odd-length hex");
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).context("bad hex"))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ticket_roundtrip() {
        let t = Ticket {
            addr: EndpointAddr::new(iroh::SecretKey::from_bytes(&[7u8; 32]).public()),
            token: "ab".repeat(32),
            expires_at: 123,
        };
        let d = Ticket::decode(&t.encode().unwrap()).unwrap();
        assert_eq!(d.token, t.token);
        assert_eq!(d.expires_at, 123);
        assert_eq!(d.addr.id, t.addr.id);
    }

    #[test]
    fn ct_eq_basics() {
        assert!(ct_eq(b"abc", b"abc"));
        assert!(!ct_eq(b"abc", b"abd"));
        assert!(!ct_eq(b"abc", b"ab"));
    }
}
