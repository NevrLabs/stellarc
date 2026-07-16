//! Minimal echo app fixture for APP-1 service_table integration tests.
//!
//! Reads PORT from the environment, binds a TCP listener on 127.0.0.1:PORT,
//! and responds to HTTP GET /health with "200 OK" and any other request with
//! "200 echo". No external dependencies — pure stdlib.
//!
//! Build: cargo build --release
//! Then symlink or copy the binary as fixtures/apps/echoapp/bin/echoapp.
use std::io::{Read, Write};
use std::net::TcpListener;

fn main() {
    let port: u16 = std::env::var("PORT")
        .expect("PORT env var required")
        .parse()
        .expect("PORT must be a valid u16");

    let listener = TcpListener::bind(format!("127.0.0.1:{port}")).expect("bind");
    eprintln!("echoapp listening on 127.0.0.1:{port}");

    for stream in listener.incoming() {
        let Ok(mut stream) = stream else { continue };
        let mut buf = [0u8; 512];
        let n = stream.read(&mut buf).unwrap_or(0);
        let req = String::from_utf8_lossy(&buf[..n]);
        let is_health = req.contains("GET /health");
        let body = if is_health { "ok" } else { "echo" };
        let resp = format!(
            "HTTP/1.0 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        );
        let _ = stream.write_all(resp.as_bytes());
    }
}
