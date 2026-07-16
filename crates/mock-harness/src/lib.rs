use anyhow::{Context, Result};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::VecDeque;
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufReader};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Scenario {
    #[serde(default = "default_session_id")]
    pub session_id: String,
    #[serde(default)]
    pub turns: Vec<Turn>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Turn {
    pub expect: Option<String>,
    #[serde(default)]
    pub actions: Vec<Action>,
    #[serde(default = "default_finish_reason")]
    pub finish_reason: String,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Action {
    Chunk {
        text: String,
    },
    Reasoning {
        text: String,
    },
    ToolCall {
        id: String,
        name: String,
        args: Value,
    },
    ToolResult {
        id: String,
        name: String,
        result: Value,
    },
    Stall {
        millis: u64,
    },
    Crash {
        code: i32,
    },
    Malformed {
        frame: Option<String>,
    },
}

fn default_session_id() -> String {
    "mock-session".into()
}
fn default_finish_reason() -> String {
    "end_turn".into()
}

pub async fn run<R, W>(reader: R, mut writer: W, scenario: Scenario) -> Result<()>
where
    R: AsyncRead + Unpin,
    W: AsyncWrite + Unpin,
{
    let mut lines = BufReader::new(reader).lines();
    let mut turns: VecDeque<_> = scenario.turns.into();
    while let Some(line) = lines.next_line().await? {
        let request: Value = serde_json::from_str(&line).context("parsing ACP request")?;
        let Some(method) = request.get("method").and_then(Value::as_str) else {
            continue;
        };
        let Some(id) = request.get("id").cloned() else {
            continue;
        };
        match method {
            "initialize" => {
                respond(
                    &mut writer,
                    id,
                    json!({
                        "protocolVersion": 1,
                        "agentCapabilities": {
                            "loadSession": true,
                            "sessionCapabilities": { "resume": {} }
                        }
                    }),
                )
                .await?
            }
            "session/new" | "session/resume" | "session/fork" => {
                respond(&mut writer, id, json!({"sessionId": scenario.session_id})).await?
            }
            "session/set_model" | "session/set_config_option" => {
                respond(&mut writer, id, json!({})).await?
            }
            "session/prompt" => {
                let Some(turn) = turns.pop_front() else {
                    rpc_error(
                        &mut writer,
                        id,
                        -32001,
                        "unexpected prompt: scenario exhausted",
                    )
                    .await?;
                    continue;
                };
                let prompt = request["params"]["prompt"][0]["text"]
                    .as_str()
                    .unwrap_or("");
                if turn
                    .expect
                    .as_deref()
                    .is_some_and(|expected| expected != prompt)
                {
                    rpc_error(
                        &mut writer,
                        id,
                        -32002,
                        &format!("expected prompt {:?}, got {prompt:?}", turn.expect.unwrap()),
                    )
                    .await?;
                    continue;
                }
                for action in turn.actions {
                    match action {
                        Action::Chunk { text } => update(&mut writer, json!({
                            "sessionUpdate": "agent_message_chunk", "content": {"type":"text", "text":text}
                        })).await?,
                        Action::Reasoning { text } => update(&mut writer, json!({
                            "sessionUpdate": "agent_thought_chunk", "content": {"type":"text", "text":text}
                        })).await?,
                        Action::ToolCall { id, name, args } => update(&mut writer, json!({
                            "sessionUpdate":"tool_call", "toolCallId":id, "title":name,
                            "status":"in_progress", "content":args
                        })).await?,
                        Action::ToolResult { id, name, result } => update(&mut writer, json!({
                            "sessionUpdate":"tool_call_update", "toolCallId":id, "title":name,
                            "status":"completed", "content":result
                        })).await?,
                        Action::Stall { millis } => tokio::time::sleep(std::time::Duration::from_millis(millis)).await,
                        Action::Crash { code } => {
                            writer.flush().await?;
                            std::process::exit(code);
                        }
                        Action::Malformed { frame } => {
                            writer.write_all(frame.unwrap_or_else(|| "{not-json".into()).as_bytes()).await?;
                            writer.write_all(b"\n").await?;
                            writer.flush().await?;
                        }
                    }
                }
                respond(&mut writer, id, json!({"stopReason": turn.finish_reason})).await?;
            }
            _ => rpc_error(&mut writer, id, -32601, "method not found").await?,
        }
    }
    Ok(())
}

async fn write_json<W: AsyncWrite + Unpin>(writer: &mut W, value: &Value) -> Result<()> {
    writer
        .write_all(serde_json::to_string(value)?.as_bytes())
        .await?;
    writer.write_all(b"\n").await?;
    writer.flush().await?;
    Ok(())
}

async fn respond<W: AsyncWrite + Unpin>(writer: &mut W, id: Value, result: Value) -> Result<()> {
    write_json(writer, &json!({"jsonrpc":"2.0", "id":id, "result":result})).await
}

async fn rpc_error<W: AsyncWrite + Unpin>(
    writer: &mut W,
    id: Value,
    code: i64,
    message: &str,
) -> Result<()> {
    write_json(
        writer,
        &json!({"jsonrpc":"2.0", "id":id, "error":{"code":code,"message":message}}),
    )
    .await
}

async fn update<W: AsyncWrite + Unpin>(writer: &mut W, update: Value) -> Result<()> {
    write_json(
        writer,
        &json!({
            "jsonrpc":"2.0", "method":"session/update",
            "params":{"sessionId":"mock-session", "update":update}
        }),
    )
    .await
}
