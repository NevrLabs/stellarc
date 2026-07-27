//! Parity + concurrency tests for the Postgres backend.
//!
//! These need a real server, so they are gated on STELLARC_TEST_PG_URL and
//! skip cleanly when it is unset (CI has no Postgres). A backend that only
//! compiles is worthless — the point is proving it behaves like the SQLite one.
//!
//! Run with:
//!   STELLARC_TEST_PG_URL='postgres:///stellarc_test?host=/var/run/postgresql' \
//!     cargo test -p stellarc-axis --features postgres --test pg_parity -- --nocapture

#![cfg(feature = "postgres")]

use stellarc_axis::event::Event;
use stellarc_axis::log::Log;
use stellarc_axis::log_pg::PgLog;

fn pg_url() -> Option<String> {
    std::env::var("STELLARC_TEST_PG_URL").ok()
}

/// Fresh schema per test: drop and recreate public so a rerun cannot inherit
/// state from a previous failure.
async fn fresh(url: &str) -> PgLog {
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(2)
        .connect(url)
        .await
        .expect("connect for reset");
    sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
        .execute(&pool)
        .await
        .expect("reset schema");
    pool.close().await;
    PgLog::connect(url).await.expect("connect PgLog")
}

fn session_created(id: &str) -> Event {
    Event::SessionCreated {
        session_id: id.to_string(),
        hermes_id: format!("hermes-{id}"),
        source: String::new(),
        model: Some("test-model".to_string()),
        title: Some(format!("title {id}")),
        started_at: 1000.0,
        message_count: 0,
        input_tokens: 0,
        output_tokens: 0,
        agent: Some("agent-a".to_string()),
        node: Some("node-a".to_string()),
    }
}

fn message(session: &str, id: u64, text: &str, ts: f64) -> Event {
    Event::MessageAppended {
        session_id: session.to_string(),
        hermes_session_id: session.to_string(),
        message_id: id,
        role: "user".to_string(),
        content: Some(text.to_string()),
        tool_name: None,
        tool_calls: None,
        reasoning: None,
        timestamp: ts,
        token_count: Some(7),
        finish_reason: None,
    }
}

/// The core parity assertion: identical events into both backends must produce
/// identical projections.
#[tokio::test]
async fn pg_matches_sqlite_projections() {
    let Some(url) = pg_url() else {
        eprintln!("SKIP: STELLARC_TEST_PG_URL unset");
        return;
    };
    let pg = fresh(&url).await;

    let dir = tempfile::tempdir().expect("tempdir");
    let sqlite = Log::open(&dir.path().join("parity.db")).expect("open sqlite");

    let events = vec![
        session_created("s1"),
        session_created("s2"),
        message("s1", 0, "hello world", 1001.0),
        message("s1", 1, "second message", 1002.0),
        message("s2", 0, "unrelated", 1003.0),
        Event::SessionUpdated {
            session_id: "s1".to_string(),
            title: Some("renamed".to_string()),
            model: None,
            archived: Some(true),
            message_count: Some(2),
            agent: None,
            node: None,
            hermes_id: None,
            pinned: Some(true),
        },
        Event::ProjectCreated {
            project_id: "p1".to_string(),
            name: "Project One".to_string(),
            created_at: 900.0,
        },
        Event::SessionProjectAttached {
            session_id: "s1".to_string(),
            project_id: "p1".to_string(),
            attached_at: 1004.0,
        },
        Event::RepoRegistered {
            slug: "r1".to_string(),
            url: "https://example.invalid/r1.git".to_string(),
            default_branch: "main".to_string(),
            registered_at: 950.0,
        },
        Event::CardCreated {
            card_id: "c1".to_string(),
            board_id: "b1".to_string(),
            title: "Card One".to_string(),
            created_at: 960.0,
        },
    ];

    for event in &events {
        sqlite.append(event).expect("sqlite append");
        pg.append(event).await.expect("pg append");
    }

    // ---- event count ----
    assert_eq!(
        pg.event_count().await.expect("pg count"),
        sqlite.event_count().expect("sqlite count"),
        "event counts diverged"
    );

    // ---- sessions ----
    let pg_sessions = pg.list_sessions().await.expect("pg sessions");
    let lite_sessions = sqlite.list_sessions().expect("sqlite sessions");
    assert_eq!(pg_sessions.len(), lite_sessions.len(), "session count");
    for (got, want) in pg_sessions.iter().zip(lite_sessions.iter()) {
        assert_eq!(got.session_id, want.session_id, "session_id order");
        assert_eq!(got.hermes_id, want.hermes_id, "hermes_id");
        assert_eq!(
            got.org_id, want.org_id,
            "org_id — the field I nearly swapped"
        );
        assert_eq!(got.title, want.title, "title");
        assert_eq!(got.archived, want.archived, "archived");
        assert_eq!(got.pinned, want.pinned, "pinned");
        assert_eq!(got.message_count, want.message_count, "message_count");
        assert_eq!(got.project_id, want.project_id, "project_id");
        assert_eq!(got.agent, want.agent, "agent");
        assert_eq!(got.last_activity, want.last_activity, "last_activity");
    }

    // ---- messages, including field order in the decoder ----
    let pg_messages = pg.recent_messages("s1", 10).await.expect("pg messages");
    let lite_messages = sqlite.recent_messages("s1", 10).expect("sqlite messages");
    assert_eq!(pg_messages.len(), lite_messages.len(), "message count");
    for (got, want) in pg_messages.iter().zip(lite_messages.iter()) {
        assert_eq!(got.message_id, want.message_id, "message_id");
        assert_eq!(got.role, want.role, "role");
        assert_eq!(got.content, want.content, "content");
        assert_eq!(got.timestamp, want.timestamp, "timestamp");
        assert_eq!(got.token_count, want.token_count, "token_count");
    }

    // ---- round trip through the zstd+JSON codec ----
    let pg_events = pg.read_all().await.expect("pg read_all");
    assert_eq!(pg_events.len(), events.len(), "read_all count");
    for (i, (_, decoded)) in pg_events.iter().enumerate() {
        assert_eq!(decoded, &events[i], "event {i} did not round trip");
    }

    // ---- other projections ----
    assert_eq!(
        pg.list_projects().await.expect("pg projects").len(),
        sqlite.list_projects().expect("lite projects").len()
    );
    assert_eq!(
        pg.list_repos().await.expect("pg repos").len(),
        sqlite.list_repos().expect("lite repos").len()
    );
    assert_eq!(
        pg.list_cards().await.expect("pg cards").len(),
        sqlite.list_cards().expect("lite cards").len()
    );
    assert!(pg.get_session("s1").await.expect("get").is_some());
    assert!(pg.get_session("nope").await.expect("get").is_none());
}

/// Full-text search must find what FTS5 finds.
#[tokio::test]
async fn pg_search_finds_content() {
    let Some(url) = pg_url() else {
        eprintln!("SKIP: STELLARC_TEST_PG_URL unset");
        return;
    };
    let pg = fresh(&url).await;
    pg.append(&session_created("s1")).await.expect("append");
    pg.append(&message("s1", 0, "the quick brown fox jumps", 1001.0))
        .await
        .expect("append");

    let hits = pg.search("brown fox", 10).await.expect("search");
    assert_eq!(hits.len(), 1, "expected one hit, got {hits:?}");
    assert_eq!(hits[0].session_id, "s1");
    assert!(
        hits[0].snippet.contains("<mark>"),
        "no highlight: {:?}",
        hits[0].snippet
    );

    // Arbitrary punctuation must not raise — this is why
    // websearch_to_tsquery is used instead of to_tsquery.
    assert!(
        pg.search("!!! ??? &&&", 10).await.is_ok(),
        "punctuation raised"
    );
    assert!(pg
        .search("nonexistentterm", 10)
        .await
        .expect("search")
        .is_empty());
}

/// Strict orbit sequencing: duplicates rejected, gaps error, in-order accepted.
#[tokio::test]
async fn pg_orbit_sequencing_is_strict() {
    let Some(url) = pg_url() else {
        eprintln!("SKIP: STELLARC_TEST_PG_URL unset");
        return;
    };
    let pg = fresh(&url).await;
    pg.append(&session_created("s1")).await.expect("append");

    assert!(pg
        .append_orbit_event("s1", 0, &message("s1", 0, "a", 1.0))
        .await
        .expect("seq 0"));
    assert!(pg
        .append_orbit_event("s1", 1, &message("s1", 1, "b", 2.0))
        .await
        .expect("seq 1"));
    // Replay of an already-applied seq is a duplicate, not an error.
    assert!(!pg
        .append_orbit_event("s1", 1, &message("s1", 1, "b", 2.0))
        .await
        .expect("dup"));
    // A gap must be refused loudly.
    assert!(
        pg.append_orbit_event("s1", 9, &message("s1", 9, "z", 3.0))
            .await
            .is_err(),
        "gap accepted"
    );
    assert_eq!(pg.orbit_watermark("s1").await.expect("watermark"), Some(1));
}

/// The multi-writer property this backend exists for: concurrent writers on
/// DIFFERENT sessions must not serialize behind one another.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn pg_concurrent_writers_do_not_serialize() {
    let Some(url) = pg_url() else {
        eprintln!("SKIP: STELLARC_TEST_PG_URL unset");
        return;
    };
    let pg = std::sync::Arc::new(fresh(&url).await);
    for i in 0..8 {
        pg.append(&session_created(&format!("s{i}")))
            .await
            .expect("append");
    }

    let mut tasks = Vec::new();
    for i in 0..8 {
        let pg = std::sync::Arc::clone(&pg);
        tasks.push(tokio::spawn(async move {
            let session = format!("s{i}");
            for m in 0..10u64 {
                pg.append_orbit_event(&session, m, &message(&session, m, "x", m as f64))
                    .await
                    .expect("concurrent append");
            }
        }));
    }
    for task in tasks {
        task.await.expect("task");
    }

    // 8 sessions created + 8*10 messages, all committed, none lost.
    assert_eq!(pg.event_count().await.expect("count"), 88);
    for i in 0..8 {
        assert_eq!(
            pg.orbit_watermark(&format!("s{i}"))
                .await
                .expect("watermark"),
            Some(9),
            "session {i} lost writes"
        );
    }
}

/// `read_from` must be INCLUSIVE of `seq`, identically on both backends.
///
/// Postgres had `seq > $1` where SQLite has `seq >= ?1`. `read_all` calls
/// `read_from(0, MAX)` so the full read masked it, but
/// `GET /api/events?since=N` pages with an explicit cursor and Postgres was
/// dropping the event AT `since` on every page. The original parity test missed
/// this because it only ever compared whole-log reads.
#[tokio::test]
async fn pg_read_from_cursor_matches_sqlite() {
    let Some(url) = pg_url() else {
        eprintln!("SKIP: STELLARC_TEST_PG_URL unset");
        return;
    };
    let pg = fresh(&url).await;
    let dir = tempfile::tempdir().expect("tempdir");
    let sqlite = Log::open(&dir.path().join("cursor.db")).expect("open sqlite");

    pg.append(&session_created("s1")).await.expect("pg");
    sqlite.append(&session_created("s1")).expect("lite");
    for id in 0..5u64 {
        let event = message("s1", id, "body", 100.0 + id as f64);
        pg.append(&event).await.expect("pg append");
        sqlite.append(&event).expect("lite append");
    }

    // Paging from an explicit cursor must return the same rows on both.
    for cursor in [0u64, 1, 2, 3] {
        let from_pg = pg.read_from(cursor, 100).await.expect("pg read_from");
        let from_lite = sqlite.read_from(cursor, 100).expect("lite read_from");
        assert_eq!(
            from_pg.len(),
            from_lite.len(),
            "cursor {cursor}: pg returned {} rows, sqlite {}",
            from_pg.len(),
            from_lite.len()
        );
        let pg_seqs: Vec<u64> = from_pg.iter().map(|(seq, _)| *seq).collect();
        let lite_seqs: Vec<u64> = from_lite.iter().map(|(seq, _)| *seq).collect();
        assert_eq!(pg_seqs, lite_seqs, "cursor {cursor}: seq sets diverged");
        // Inclusive: the event AT the cursor must be present.
        if cursor > 0 {
            assert!(
                pg_seqs.contains(&cursor),
                "cursor {cursor} dropped its own event on pg"
            );
        }
    }
}
