//! Integration: good ticket → round-trip through a spawned harness;
//! bad/expired ticket → refused, harness never runs.

use std::time::Duration;
use stellarc_tunnel::{bind_server, connect, Ticket};

/// `cat` is the harness stand-in: a stdio process that echoes, exactly the
/// shape of `hermes acp` piping without needing hermes in CI.
fn cat_cmd() -> Vec<String> {
    vec!["cat".to_string()]
}

#[tokio::test]
async fn good_ticket_round_trips() {
    let server = bind_server(Duration::from_secs(60)).await.unwrap();
    let ticket = server.ticket.clone();
    tokio::spawn(async move { server.run(&cat_cmd()).await.unwrap() });

    let mut client = connect(&ticket).await.expect("valid ticket must connect");
    let msg = b"{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\"}\n";
    client.send.write_all(msg).await.unwrap();
    let mut buf = vec![0u8; msg.len()];
    client.recv.read_exact(&mut buf).await.unwrap();
    assert_eq!(&buf, msg, "harness echoed the ACP frame back");
}

#[tokio::test]
async fn wrong_token_is_refused() {
    let server = bind_server(Duration::from_secs(60)).await.unwrap();
    let mut ticket = server.ticket.clone();
    tokio::spawn(async move { server.run(&cat_cmd()).await.unwrap() });

    ticket.token = "00".repeat(32); // right length, wrong bytes
    let err = connect(&ticket)
        .await
        .err()
        .expect("wrong token must be refused");
    assert!(err.to_string().contains("refused"), "got: {err:#}");
}

#[tokio::test]
async fn expired_ticket_is_refused() {
    let server = bind_server(Duration::from_secs(0)).await.unwrap();
    let ticket = server.ticket.clone();
    tokio::spawn(async move { server.run(&cat_cmd()).await.unwrap() });

    tokio::time::sleep(Duration::from_millis(1100)).await;
    let err = connect(&ticket)
        .await
        .err()
        .expect("expired ticket must be refused");
    assert!(err.to_string().contains("refused"), "got: {err:#}");
}

#[test]
fn garbage_ticket_fails_decode() {
    assert!(Ticket::decode("not-a-ticket").is_err());
}
