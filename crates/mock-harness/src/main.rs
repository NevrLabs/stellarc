use anyhow::{Context, Result};
use olympus_mock_harness::{run, Scenario};

#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<()> {
    let path = std::env::args()
        .nth(1)
        .or_else(|| std::env::var("OLYMPUS_MOCK_SCENARIO").ok())
        .context("usage: olympus-mock-harness <scenario.json>")?;
    let scenario: Scenario = serde_json::from_slice(&std::fs::read(&path)?)
        .with_context(|| format!("parsing scenario {path}"))?;
    run(tokio::io::stdin(), tokio::io::stdout(), scenario).await
}
