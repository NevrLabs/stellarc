use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{atomic::AtomicBool, Arc},
};

use axum::{
    body::Body,
    http::{Method, Request, StatusCode},
    Router,
};
use futures::StreamExt;
use http_body_util::BodyExt;
use olympus_control_plane::{
    event::Event,
    log::Log,
    node::{self, NodeRegistry, NodeTransport},
    search::SearchIndex,
    server::{
        bridge_mgr::BridgeManager,
        build_router,
        envoy_conn::{EnvoyConnections, RemoteRuntime},
        AppState, ImportState,
    },
    views::ViewManager,
};
use olympus_envoy::{
    bridge::{
        hermes::{HermesAgentRuntime, HermesRuntimeConfig},
        AgentCommand, AgentEvent, AgentRuntime,
    },
    mock_runtime::MockAgentRuntime,
    runtime_table::RuntimeTable,
};
use olympus_proto::{
    frames::{EnvoyFrame, HallFrame, NodeRole},
    version::{BuildVersion, PROTOCOL_VERSION},
    RuntimeSpec,
};
use serde_json::{json, Value};
use tokio::{
    io::{AsyncBufReadExt, AsyncWrite, AsyncWriteExt, BufReader},
    sync::Mutex,
    task::JoinHandle,
};
use tower::ServiceExt;

const NODE: &str = "mock-envoy";

struct NoopEdge;
impl olympus_control_plane::edge::EdgeDriver for NoopEdge {
    fn apply(&self, _: &[olympus_control_plane::edge::Route]) -> anyhow::Result<()> {
        Ok(())
    }
    fn healthy(&self) -> bool {
        true
    }
}

type Writer = Arc<Mutex<Box<dyn AsyncWrite + Send + Unpin>>>;

struct MockEnvoy {
    main: JoinHandle<()>,
    handlers: Arc<Mutex<Vec<JoinHandle<()>>>>,
    table: Arc<RuntimeTable>,
}

impl MockEnvoy {
    async fn disconnect(self) {
        self.main.abort();
        for task in self.handlers.lock().await.drain(..) {
            task.abort();
        }
        // The test envoy owns no durable child state; release every slot/process.
        for session in ["disconnect", "a", "b"] {
            let _ = self.table.stop(session).await;
        }
    }
}

async fn connect_envoy(
    scenario: impl AsRef<Path>,
    cwd: impl AsRef<Path>,
    registry: NodeRegistry,
    conns: EnvoyConnections,
) -> MockEnvoy {
    let scenario = scenario.as_ref().to_path_buf();
    let cwd = cwd.as_ref().to_path_buf();
    let binary = PathBuf::from(env!("CARGO_BIN_EXE_olympus-mock-harness"));
    let table = Arc::new(RuntimeTable::with_factory(Arc::new(move |_spec| {
        HermesAgentRuntime::new_arc(HermesRuntimeConfig {
            command: vec![
                binary.to_string_lossy().into_owned(),
                scenario.to_string_lossy().into_owned(),
            ],
            cwd: cwd.to_string_lossy().into_owned(),
            start_timeout_secs: 2,
            session_source: None,
            ..Default::default()
        }) as Arc<dyn AgentRuntime>
    })));

    let (hall_io, envoy_io) = tokio::io::duplex(1 << 20);
    let (hall_read, hall_write) = tokio::io::split(hall_io);
    tokio::spawn(node::handle_envoy_conn(
        hall_read,
        hall_write,
        registry.clone(),
        conns,
        NodeTransport::Uds,
        None,
    ));

    let (envoy_read, envoy_write) = tokio::io::split(envoy_io);
    let writer: Writer = Arc::new(Mutex::new(Box::new(envoy_write)));
    send_frame(
        &writer,
        &EnvoyFrame::Hello {
            node_id: NODE.into(),
            hostname: "test".into(),
            slots_total: 4,
            protocol_version: PROTOCOL_VERSION,
            version: BuildVersion::for_binary("test"),
            agents: None,
            runtimes: vec![],
            roles: vec![NodeRole::AgentRuntime],
        },
    )
    .await;

    let handlers = Arc::new(Mutex::new(Vec::new()));
    let main_handlers = handlers.clone();
    let main_table = table.clone();
    let main = tokio::spawn(async move {
        let mut lines = BufReader::new(envoy_read).lines();
        let seq = Arc::new(Mutex::new(HashMap::<String, u64>::new()));
        while let Ok(Some(line)) = lines.next_line().await {
            let Ok(frame) = serde_json::from_str::<HallFrame>(&line) else {
                continue;
            };
            if matches!(frame, HallFrame::Ack { .. } | HallFrame::ResumeFrom { .. }) {
                continue;
            }
            let task = tokio::spawn(handle_hall_frame(
                frame,
                main_table.clone(),
                writer.clone(),
                seq.clone(),
            ));
            main_handlers.lock().await.push(task);
        }
    });

    wait_until(|| {
        let registry = registry.clone();
        async move {
            registry
                .list()
                .await
                .iter()
                .any(|node| node.node_id == NODE)
        }
    })
    .await;
    MockEnvoy {
        main,
        handlers,
        table,
    }
}

async fn handle_hall_frame(
    frame: HallFrame,
    table: Arc<RuntimeTable>,
    writer: Writer,
    seqs: Arc<Mutex<HashMap<String, u64>>>,
) {
    match frame {
        HallFrame::EnsureRuntime {
            req_id,
            session_id,
            spec,
            resume_id,
        } => {
            match table
                .ensure_runtime(&session_id, &spec, resume_id.as_deref())
                .await
            {
                Ok((_, id)) => {
                    send_resp(&writer, req_id, true, None, Some(json!({"hermesId":id}))).await
                }
                Err(error) => {
                    send_resp(&writer, req_id, false, Some(error.to_string()), None).await
                }
            }
            heartbeat(&writer, table.len().await as u32).await;
        }
        HallFrame::Prompt {
            req_id,
            session_id,
            text,
            model,
        } => {
            let Some(runtime) = table.get(&session_id).await else {
                send_resp(&writer, req_id, false, Some("no runtime".into()), None).await;
                return;
            };
            let mut events = runtime.events();
            if let Err(error) = runtime.send(AgentCommand::Prompt { text, model }).await {
                send_resp(&writer, req_id, false, Some(error.to_string()), None).await;
                return;
            }
            let mut failed = false;
            while let Some(event) = events.next().await {
                let seq = {
                    let mut seqs = seqs.lock().await;
                    let next = seqs.entry(session_id.clone()).or_insert(0);
                    let value = *next;
                    *next += 1;
                    value
                };
                send_frame(
                    &writer,
                    &EnvoyFrame::Event {
                        session_id: session_id.clone(),
                        turn_id: "turn-1".into(),
                        seq,
                        payload: event.clone(),
                    },
                )
                .await;
                if matches!(event, AgentEvent::Error(_)) {
                    failed = true;
                }
                if matches!(event, AgentEvent::Done { .. } | AgentEvent::Error(_)) {
                    break;
                }
            }
            if failed {
                let _ = table.stop(&session_id).await;
            }
            heartbeat(&writer, table.len().await as u32).await;
            send_resp(&writer, req_id, true, None, None).await;
        }
        HallFrame::Stop { req_id, session_id } => {
            let result = table.stop(&session_id).await;
            send_resp(
                &writer,
                req_id,
                result.is_ok(),
                result.err().map(|e| e.to_string()),
                None,
            )
            .await;
            heartbeat(&writer, table.len().await as u32).await;
        }
        _ => {}
    }
}

async fn send_frame(writer: &Writer, frame: &EnvoyFrame) {
    let mut writer = writer.lock().await;
    writer
        .write_all(serde_json::to_string(frame).unwrap().as_bytes())
        .await
        .unwrap();
    writer.write_all(b"\n").await.unwrap();
    writer.flush().await.unwrap();
}

async fn send_resp(
    writer: &Writer,
    req_id: u64,
    ok: bool,
    error: Option<String>,
    result: Option<Value>,
) {
    send_frame(
        writer,
        &EnvoyFrame::Resp {
            req_id,
            ok,
            error,
            result,
        },
    )
    .await;
}

async fn heartbeat(writer: &Writer, slots_used: u32) {
    send_frame(
        writer,
        &EnvoyFrame::Heartbeat {
            node_id: NODE.into(),
            slots_used,
        },
    )
    .await;
}

async fn wait_until<F, Fut>(mut predicate: F)
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = bool>,
{
    tokio::time::timeout(std::time::Duration::from_secs(5), async {
        while !predicate().await {
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("condition timed out");
}

fn write_scenario(dir: &tempfile::TempDir, value: Value) -> PathBuf {
    let path = dir.path().join("scenario.json");
    std::fs::write(&path, serde_json::to_vec(&value).unwrap()).unwrap();
    path
}

fn state(dir: &tempfile::TempDir, conns: EnvoyConnections, nodes: NodeRegistry) -> AppState {
    let log = Arc::new(Log::open(&dir.path().join("hall.redb")).unwrap());
    let views = ViewManager::new();
    let search = SearchIndex::from_log(log.clone());
    let (deltas, _) = tokio::sync::broadcast::channel(64);
    let factory = Arc::new(|_: &RuntimeSpec| MockAgentRuntime::new_arc() as Arc<dyn AgentRuntime>);
    AppState {
        views: Arc::new(tokio::sync::RwLock::new(views)),
        search: Arc::new(tokio::sync::RwLock::new(search)),
        token: Arc::new("testtoken".into()),
        capability_signer: Arc::new(
            olympus_control_plane::server::capability::CapabilitySigner::load_or_create(dir.path())
                .unwrap(),
        ),
        auth_store: Arc::new(
            olympus_control_plane::auth_store::AuthStore::open_in_memory().unwrap(),
        ),
        allow_installation_token: true,
        session_cookie_secure: true,
        import_state: ImportState::done(),
        hermes_profile: Arc::new("default".into()),
        deltas,
        snapshot_sessions: 0,
        snapshot_messages: 0,
        log: log.clone(),
        bridge: Arc::new(BridgeManager::with_factory(log, factory)),
        sync_connected: Arc::new(AtomicBool::new(true)),
        irc: olympus_control_plane::irc::IrcBus::new(),
        nodes,
        envoy_conns: conns,
        hall_pty: olympus_control_plane::server::terminal_ws::HallTerminals::new(),
        hall_iroh_id: None,
        proxy: olympus_control_plane::proxy::ProxyTable::new(),
        edge: olympus_control_plane::edge::EdgeManager::new(Arc::new(NoopEdge)),
        vaults: Arc::new(olympus_control_plane::vault::VaultStore::with_jj_mode(
            dir.path().join("vaults"),
            olympus_control_plane::vault::JjMode::Disabled,
        )),
        state_db: None,
        projects: Arc::new(olympus_control_plane::projects::ProjectStore::new(
            dir.path().join("projects"),
        )),
        repos: Arc::new(olympus_control_plane::repos::RepoStore::new(
            dir.path().join("repos"),
            "default",
        )),
        enroll: olympus_control_plane::enroll::EnrollStore::new(),
        home: Arc::new(dir.path().to_path_buf()),
    }
}

async fn request(app: &Router, method: Method, uri: String, body: Value) -> (StatusCode, Value) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(method)
                .uri(uri)
                .header("authorization", "Bearer testtoken")
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}

async fn remote_turn(runtime: &RemoteRuntime, text: &str) -> Vec<AgentEvent> {
    let mut stream = runtime.events();
    let send = runtime.send(AgentCommand::Prompt {
        text: text.into(),
        model: None,
    });
    let collect = async {
        let mut out = Vec::new();
        while let Some(event) = stream.next().await {
            let terminal = matches!(event, AgentEvent::Done { .. } | AgentEvent::Error(_));
            out.push(event);
            if terminal {
                break;
            }
        }
        out
    };
    let (result, events) = tokio::join!(send, collect);
    result.unwrap();
    events
}

#[tokio::test]
async fn session_create_streams_and_persists_event_sourced_reply() {
    let dir = tempfile::tempdir().unwrap();
    let nodes = NodeRegistry::new();
    let log = Arc::new(Log::open(&dir.path().join("transport.redb")).unwrap());
    let conns = EnvoyConnections::with_log(log);
    let scenario = Path::new(env!("CARGO_MANIFEST_DIR")).join("scenarios/stream.json");
    let _envoy = connect_envoy(scenario, dir.path(), nodes.clone(), conns.clone()).await;
    let state = state(&dir, conns, nodes);
    let app = build_router(state.clone());

    let (status, created) = request(
        &app,
        Method::POST,
        "/api/sessions".into(),
        json!({"node":NODE}),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let id = created["id"].as_str().unwrap();
    let (status, _) = request(
        &app,
        Method::POST,
        format!("/api/sessions/{id}/messages"),
        json!({"text":"hello"}),
    )
    .await;
    assert_eq!(status, StatusCode::ACCEPTED);
    wait_until(|| {
        let bridge = state.bridge.clone();
        let id = id.to_string();
        async move { !bridge.in_flight_set().await.contains(&id) }
    })
    .await;

    let messages = state.log.recent_messages(id, 10).unwrap();
    assert_eq!(messages.len(), 2);
    assert_eq!(messages[1].role, "assistant");
    assert_eq!(messages[1].content.as_deref(), Some("hello world"));
    assert!(messages[1]
        .tool_calls
        .as_deref()
        .unwrap()
        .contains("read_file"));
    assert!(state.log.read_all().unwrap().iter().any(|(_, event)| matches!(event, Event::MessageAppended { session_id, role, .. } if session_id == id && role == "assistant")));
}

#[tokio::test]
async fn crash_mid_turn_surfaces_error_releases_slot_and_recovers() {
    let dir = tempfile::tempdir().unwrap();
    let scenario = write_scenario(
        &dir,
        json!({"sessionId":"recoverable","turns":[{"expect":"crash","actions":[{"type":"chunk","text":"partial"},{"type":"crash","code":23}]}]}),
    );
    let nodes = NodeRegistry::new();
    let conns = EnvoyConnections::new();
    let envoy = connect_envoy(&scenario, dir.path(), nodes, conns.clone()).await;
    let conn = conns.get(NODE).await.unwrap();
    let runtime = RemoteRuntime::new(conn.clone(), "recover".into());
    runtime.start(None).await.unwrap();
    let events = remote_turn(&runtime, "crash").await;
    assert!(events
        .iter()
        .any(|event| matches!(event, AgentEvent::Error(message) if message.contains("EOF"))));
    wait_until(|| {
        let table = envoy.table.clone();
        async move { table.len().await == 0 }
    })
    .await;

    std::fs::write(&scenario, serde_json::to_vec(&json!({"sessionId":"recoverable","turns":[{"expect":"again","actions":[{"type":"chunk","text":"recovered"}]}]})).unwrap()).unwrap();
    let runtime = RemoteRuntime::new(conn, "recover".into());
    runtime.start(Some("recoverable")).await.unwrap();
    let events = remote_turn(&runtime, "again").await;
    assert!(events.contains(&AgentEvent::Text("recovered".into())));
    assert!(events
        .iter()
        .any(|event| matches!(event, AgentEvent::Done { .. })));
}

#[tokio::test]
async fn node_disconnect_active_turn_clears_pending_and_reconnects() {
    let dir = tempfile::tempdir().unwrap();
    let stalled = write_scenario(
        &dir,
        json!({"turns":[{"expect":"wait","actions":[{"type":"stall","millis":5000}]}]}),
    );
    let nodes = NodeRegistry::new();
    let conns = EnvoyConnections::new();
    let envoy = connect_envoy(&stalled, dir.path(), nodes.clone(), conns.clone()).await;
    let runtime = Arc::new(RemoteRuntime::new(
        conns.get(NODE).await.unwrap(),
        "disconnect".into(),
    ));
    runtime.start(None).await.unwrap();
    let send = {
        let runtime = runtime.clone();
        tokio::spawn(async move {
            runtime
                .send(AgentCommand::Prompt {
                    text: "wait".into(),
                    model: None,
                })
                .await
        })
    };
    wait_until(|| {
        let table = envoy.table.clone();
        async move { table.len().await == 1 }
    })
    .await;
    envoy.disconnect().await;
    assert!(send.await.unwrap().is_err());
    wait_until(|| {
        let nodes = nodes.clone();
        async move { nodes.list().await.iter().all(|node| node.node_id != NODE) }
    })
    .await;

    let recovered = write_scenario(
        &dir,
        json!({"turns":[{"expect":"back","actions":[{"type":"chunk","text":"online"}]}]}),
    );
    let _envoy = connect_envoy(recovered, dir.path(), nodes, conns.clone()).await;
    let runtime = RemoteRuntime::new(conns.get(NODE).await.unwrap(), "disconnect".into());
    runtime.start(None).await.unwrap();
    assert!(remote_turn(&runtime, "back")
        .await
        .contains(&AgentEvent::Text("online".into())));
}

#[tokio::test]
async fn concurrent_sessions_report_real_slot_usage() {
    let dir = tempfile::tempdir().unwrap();
    let scenario = write_scenario(
        &dir,
        json!({"turns":[{"actions":[{"type":"stall","millis":100}]}]}),
    );
    let nodes = NodeRegistry::new();
    let conns = EnvoyConnections::new();
    let envoy = connect_envoy(scenario, dir.path(), nodes.clone(), conns.clone()).await;
    let conn = conns.get(NODE).await.unwrap();
    let a = RemoteRuntime::new(conn.clone(), "a".into());
    let b = RemoteRuntime::new(conn, "b".into());
    tokio::try_join!(a.start(None), b.start(None)).unwrap();
    wait_until(|| {
        let nodes = nodes.clone();
        async move {
            nodes
                .list()
                .await
                .iter()
                .any(|node| node.node_id == NODE && node.slots_used == 2)
        }
    })
    .await;
    assert_eq!(envoy.table.len().await, 2);
    tokio::try_join!(a.stop(), b.stop()).unwrap();
    wait_until(|| {
        let nodes = nodes.clone();
        async move {
            nodes
                .list()
                .await
                .iter()
                .any(|node| node.node_id == NODE && node.slots_used == 0)
        }
    })
    .await;
}

#[tokio::test]
async fn malformed_acp_frame_fences_child_not_hall() {
    let dir = tempfile::tempdir().unwrap();
    let scenario = Path::new(env!("CARGO_MANIFEST_DIR")).join("scenarios/malformed.json");
    let nodes = NodeRegistry::new();
    let conns = EnvoyConnections::new();
    let envoy = connect_envoy(scenario, dir.path(), nodes.clone(), conns.clone()).await;
    let runtime = RemoteRuntime::new(conns.get(NODE).await.unwrap(), "malformed".into());
    runtime.start(None).await.unwrap();
    let events = remote_turn(&runtime, "malformed").await;
    assert!(events
        .iter()
        .any(|event| matches!(event, AgentEvent::Error(message) if message.contains("decode"))));
    wait_until(|| {
        let table = envoy.table.clone();
        async move { table.len().await == 0 }
    })
    .await;
    assert!(nodes.list().await.iter().any(|node| node.node_id == NODE));
}

#[tokio::test]
async fn wrong_scripted_expectation_is_a_terminal_failure() {
    let dir = tempfile::tempdir().unwrap();
    let scenario = write_scenario(
        &dir,
        json!({"turns":[{"expect":"right","actions":[{"type":"chunk","text":"unreachable"}]}]}),
    );
    let conns = EnvoyConnections::new();
    let envoy = connect_envoy(scenario, dir.path(), NodeRegistry::new(), conns.clone()).await;
    let runtime = RemoteRuntime::new(conns.get(NODE).await.unwrap(), "expectation".into());
    runtime.start(None).await.unwrap();
    let events = remote_turn(&runtime, "wrong").await;
    assert!(events.iter().any(
        |event| matches!(event, AgentEvent::Error(message) if message.contains("expected prompt"))
    ));
    wait_until(|| {
        let table = envoy.table.clone();
        async move { table.len().await == 0 }
    })
    .await;
}
