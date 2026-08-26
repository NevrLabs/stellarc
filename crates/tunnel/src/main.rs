//! stellarc-tunnel CLI — spike MVP (ticket #13).
//! serve: expose a stdio harness over iroh, print a scoped ticket.
//! connect: dial a ticket, bridge local stdio to the remote harness.

use anyhow::{bail, Context, Result};
use std::time::Duration;

fn usage() -> ! {
    eprintln!("usage: stellarc-tunnel serve [--ttl-secs N] -- <harness-cmd> [args...]");
    eprintln!("       stellarc-tunnel connect <ticket>");
    std::process::exit(2);
}

#[tokio::main]
async fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("serve") => {
            let mut ttl = 3600u64;
            let mut rest = &args[1..];
            if rest.first().map(String::as_str) == Some("--ttl-secs") {
                ttl = rest.get(1).context("--ttl-secs value")?.parse()?;
                rest = &rest[2..];
            }
            if rest.first().map(String::as_str) != Some("--") || rest.len() < 2 {
                usage();
            }
            let cmd = rest[1..].to_vec();
            let server = stellarc_tunnel::bind_server(Duration::from_secs(ttl)).await?;
            // Ticket on stdout (the one thing a caller scrapes), logs on stderr.
            println!("{}", server.ticket.encode()?);
            eprintln!("tunnel: serving {:?} as {}", cmd, server.endpoint.id());
            server.run(&cmd).await
        }
        Some("connect") => {
            let ticket_str = args.get(1).map(String::as_str).unwrap_or_else(|| usage());
            let ticket = stellarc_tunnel::Ticket::decode(ticket_str)?;
            let stellarc_tunnel::Client {
                endpoint,
                conn,
                send,
                recv,
            } = stellarc_tunnel::connect(&ticket).await?;
            eprintln!("tunnel: connected to {}", ticket.addr.id);
            // Bridge with drain semantics: stdin EOF half-closes our send side
            // (the remote harness sees stdin EOF and may reply+exit) and we
            // keep draining the harness until it closes. Teardown on first
            // EOF truncates the last reply — that was a real demo bug.
            let send_task = {
                let mut send = send;
                let mut stdin = tokio::io::stdin();
                tokio::spawn(async move {
                    let r = tokio::io::copy(&mut stdin, &mut send)
                        .await
                        .context("stdin->tunnel");
                    let _ = send.finish();
                    r
                })
            };
            let recv_task = {
                let mut recv = recv;
                let mut stdout = tokio::io::stdout();
                tokio::spawn(async move {
                    tokio::io::copy(&mut recv, &mut stdout)
                        .await
                        .context("tunnel->stdout")
                })
            };
            send_task.await??;
            recv_task.await??;
            conn.close(0u8.into(), b"done");
            endpoint.close().await;
            Ok(())
        }
        _ => {
            if args.is_empty() {
                usage();
            }
            bail!("unknown subcommand {:?}", args[0]);
        }
    }
}
