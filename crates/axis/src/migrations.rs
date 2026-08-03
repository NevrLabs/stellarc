use anyhow::{bail, Context, Result};
use rusqlite::{Connection, Transaction, TransactionBehavior};

const ID: i64 = 1;
const PRAGMAS: &str = "\nPRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA recursive_triggers=ON; PRAGMA cache_size=-4096; PRAGMA temp_store=MEMORY;\n";
/// Immutable migration 1. Never edit these bytes; append a new migration instead.
pub(crate) const MIGRATION_1_SQL: &str = r#"CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT,event_type TEXT NOT NULL,payload BLOB NOT NULL,created_at REAL NOT NULL,session_id TEXT);
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
CREATE TABLE IF NOT EXISTS sessions(session_id TEXT PRIMARY KEY,hermes_id TEXT NOT NULL DEFAULT '',source TEXT NOT NULL DEFAULT '',model TEXT,title TEXT,started_at REAL NOT NULL,message_count INTEGER NOT NULL DEFAULT 0,input_tokens INTEGER NOT NULL DEFAULT 0,output_tokens INTEGER NOT NULL DEFAULT 0,archived INTEGER NOT NULL DEFAULT 0,pinned INTEGER NOT NULL DEFAULT 0,last_activity REAL NOT NULL DEFAULT 0,agent TEXT,node TEXT,parent_session_id TEXT,card_id TEXT,project_id TEXT,org_id TEXT NOT NULL DEFAULT 'personal',capabilities TEXT,context_projects TEXT NOT NULL DEFAULT '[]');
CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at DESC); CREATE INDEX IF NOT EXISTS idx_sessions_source ON sessions(source); CREATE INDEX IF NOT EXISTS idx_sessions_archived ON sessions(archived); CREATE INDEX IF NOT EXISTS idx_sessions_pinned ON sessions(pinned);
CREATE TABLE IF NOT EXISTS messages(session_id TEXT NOT NULL,message_id INTEGER NOT NULL,role TEXT NOT NULL,content TEXT,tool_name TEXT,tool_calls TEXT,reasoning TEXT,timestamp REAL NOT NULL,token_count INTEGER,finish_reason TEXT,PRIMARY KEY(session_id,message_id)) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_messages_ts ON messages(session_id,timestamp);
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(session_id UNINDEXED,message_id UNINDEXED,content,role UNINDEXED,tool_name UNINDEXED,timestamp UNINDEXED,tokenize='porter unicode61');
CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON messages BEGIN INSERT INTO messages_fts(session_id,message_id,content,role,tool_name,timestamp) VALUES(new.session_id,new.message_id,new.content,new.role,new.tool_name,new.timestamp); END;
CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER DELETE ON messages BEGIN DELETE FROM messages_fts WHERE session_id=old.session_id AND message_id=old.message_id; END;
CREATE TRIGGER IF NOT EXISTS messages_fts_update AFTER UPDATE ON messages BEGIN DELETE FROM messages_fts WHERE session_id=old.session_id AND message_id=old.message_id; INSERT INTO messages_fts(session_id,message_id,content,role,tool_name,timestamp) VALUES(new.session_id,new.message_id,new.content,new.role,new.tool_name,new.timestamp); END;
CREATE TABLE IF NOT EXISTS cards(card_id TEXT PRIMARY KEY,board_id TEXT NOT NULL,title TEXT NOT NULL,status TEXT NOT NULL,assigned_id TEXT,assigned_kind TEXT,current_session_id TEXT,current_bookmark TEXT,blocked_by TEXT NOT NULL DEFAULT '[]',priority INTEGER NOT NULL DEFAULT 0,attempts TEXT NOT NULL DEFAULT '[]',created_at REAL NOT NULL,status_changed_at REAL NOT NULL,org_id TEXT NOT NULL DEFAULT 'personal');
CREATE TABLE IF NOT EXISTS setup(scope TEXT PRIMARY KEY,skills TEXT NOT NULL,mcp TEXT NOT NULL,plugins TEXT NOT NULL,hooks TEXT NOT NULL,declared_at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS registry(kind TEXT NOT NULL,slug TEXT NOT NULL,definition TEXT NOT NULL,registered_at REAL NOT NULL,PRIMARY KEY(kind,slug));
CREATE TABLE IF NOT EXISTS projects(project_id TEXT PRIMARY KEY,name TEXT NOT NULL,vaults TEXT NOT NULL DEFAULT '[]',repos TEXT NOT NULL DEFAULT '[]',boards TEXT NOT NULL DEFAULT '[]',layout TEXT,created_at REAL NOT NULL,deleted_at REAL,org_id TEXT NOT NULL DEFAULT 'personal');
CREATE TABLE IF NOT EXISTS repos(slug TEXT PRIMARY KEY,url TEXT NOT NULL,default_branch TEXT NOT NULL,registered_at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS session_repos(session_id TEXT NOT NULL,slug TEXT NOT NULL,attached_at REAL NOT NULL,PRIMARY KEY(session_id,slug));
CREATE TABLE IF NOT EXISTS orbit_watermarks(session_id TEXT PRIMARY KEY,seq INTEGER NOT NULL) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS observed_sessions(hermes_id TEXT PRIMARY KEY) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS observed_messages(hermes_id TEXT NOT NULL,message_id INTEGER NOT NULL,PRIMARY KEY(hermes_id,message_id)) WITHOUT ROWID;
"#;
const LEGACY_ADDITIONS: &[(&str, &str, &str)] = &[
    ("events", "session_id", "session_id TEXT"),
    (
        "sessions",
        "org_id",
        "org_id TEXT NOT NULL DEFAULT 'personal'",
    ),
    ("sessions", "capabilities", "capabilities TEXT"),
    (
        "sessions",
        "context_projects",
        "context_projects TEXT NOT NULL DEFAULT '[]'",
    ),
    ("cards", "org_id", "org_id TEXT NOT NULL DEFAULT 'personal'"),
    (
        "projects",
        "org_id",
        "org_id TEXT NOT NULL DEFAULT 'personal'",
    ),
    ("projects", "layout", "layout TEXT"),
];

pub(crate) fn run<F>(conn: &mut Connection, maintenance: F) -> Result<()>
where
    F: FnOnce(&Transaction<'_>) -> Result<()>,
{
    for attempt in 0..50 {
        match conn.execute_batch(PRAGMAS) {
            Ok(()) => break,
            Err(error)
                if error.sqlite_error_code() == Some(rusqlite::ErrorCode::DatabaseBusy)
                    && attempt < 49 =>
            {
                std::thread::sleep(std::time::Duration::from_millis(20));
            }
            Err(error) => return Err(error).context("configuring Stellarc SQLite"),
        }
    }
    let checksum = blake3::hash(MIGRATION_1_SQL.as_bytes())
        .to_hex()
        .to_string();
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .context("locking Stellarc SQLite startup maintenance")?;
    let ledger = table_exists(&tx, "stellarc_migrations")?;
    if ledger {
        let rows = {
            let mut stmt = tx.prepare("SELECT id,checksum FROM stellarc_migrations ORDER BY id")?;
            let rows = stmt
                .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            rows
        };
        if rows != vec![(ID, checksum.clone())] {
            bail!("database migration ledger is not the exact known ordered set");
        }
        validate_schema(&tx)?;
    } else {
        let tables: i64 = tx.query_row(
            "SELECT count(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
            [],
            |r| r.get(0),
        )?;
        if tables > 0 {
            validate_legacy(&tx)?;
            for &(table, column, definition) in LEGACY_ADDITIONS {
                if table_exists(&tx, table)? && !column_exists(&tx, table, column)? {
                    tx.execute_batch(&format!("ALTER TABLE {table} ADD COLUMN {definition};"))?;
                }
            }
            tx.execute_batch(MIGRATION_1_SQL)
                .context("completing recognized Axis SQLite schema")?;
            tx.execute_batch("CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id); CREATE INDEX IF NOT EXISTS idx_sessions_org ON sessions(org_id); CREATE INDEX IF NOT EXISTS idx_cards_org ON cards(org_id); CREATE INDEX IF NOT EXISTS idx_projects_org ON projects(org_id);")?;
        } else {
            tx.execute_batch(MIGRATION_1_SQL)
                .context("creating Stellarc SQLite schema")?;
        }
        validate_schema(&tx)?;
        tx.execute_batch(
            "CREATE TABLE stellarc_migrations(id INTEGER PRIMARY KEY, checksum TEXT NOT NULL);",
        )?;
        tx.execute(
            "INSERT INTO stellarc_migrations(id,checksum) VALUES(?1,?2)",
            (ID, checksum),
        )?;
    }
    maintenance(&tx)?;
    tx.commit()
        .context("committing Stellarc SQLite startup maintenance")
}

fn table_exists(conn: &Connection, table: &str) -> Result<bool> {
    Ok(conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1)",
        [table],
        |r| r.get(0),
    )?)
}
fn column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool> {
    let sql = format!("SELECT EXISTS(SELECT 1 FROM pragma_table_info('{table}') WHERE name=?1)");
    Ok(conn.query_row(&sql, [column], |r| r.get(0))?)
}
fn require_columns(conn: &Connection, table: &str, columns: &[&str]) -> Result<()> {
    if !table_exists(conn, table)? {
        bail!("unrecognized or incomplete Axis SQLite schema: missing table {table}");
    }
    for column in columns {
        if !column_exists(conn, table, column)? {
            bail!("unrecognized or incomplete Axis SQLite schema: missing {table}.{column}");
        }
    }
    Ok(())
}
fn validate_legacy(conn: &Connection) -> Result<()> {
    require_columns(
        conn,
        "events",
        &["seq", "event_type", "payload", "created_at"],
    )?;
    require_columns(conn, "meta", &["key", "value"])?;
    require_columns(
        conn,
        "sessions",
        &[
            "session_id",
            "hermes_id",
            "source",
            "started_at",
            "message_count",
        ],
    )
}
fn validate_schema(conn: &Connection) -> Result<()> {
    validate_legacy(conn)?;
    require_columns(conn, "events", &["session_id"])?;
    require_columns(
        conn,
        "sessions",
        &["org_id", "capabilities", "context_projects"],
    )?;
    require_columns(
        conn,
        "messages",
        &["session_id", "message_id", "content", "timestamp"],
    )?;
    require_columns(conn, "cards", &["card_id", "org_id"])?;
    require_columns(conn, "projects", &["project_id", "org_id", "layout"])?;
    for object in [
        "messages_fts",
        "messages_fts_insert",
        "messages_fts_delete",
        "messages_fts_update",
    ] {
        let found: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name=?1)",
            [object],
            |r| r.get(0),
        )?;
        if !found {
            bail!("incomplete Axis SQLite schema: missing object {object}");
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const LEGACY: &str = "
CREATE TABLE events(seq INTEGER PRIMARY KEY AUTOINCREMENT,event_type TEXT NOT NULL,payload BLOB NOT NULL,created_at REAL NOT NULL);
CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL) WITHOUT ROWID;
CREATE TABLE sessions(session_id TEXT PRIMARY KEY,hermes_id TEXT NOT NULL DEFAULT '',source TEXT NOT NULL DEFAULT '',model TEXT,title TEXT,started_at REAL NOT NULL,message_count INTEGER NOT NULL DEFAULT 0,input_tokens INTEGER NOT NULL DEFAULT 0,output_tokens INTEGER NOT NULL DEFAULT 0,archived INTEGER NOT NULL DEFAULT 0,pinned INTEGER NOT NULL DEFAULT 0,last_activity REAL NOT NULL DEFAULT 0,agent TEXT,node TEXT,parent_session_id TEXT,card_id TEXT,project_id TEXT);
";

    fn memory() -> Connection {
        Connection::open_in_memory().unwrap()
    }

    #[test]
    fn real_historical_signature_is_upgraded_without_losing_data() {
        let mut db = memory();
        db.execute_batch(LEGACY).unwrap();
        db.execute("INSERT INTO meta VALUES('fixture','kept')", [])
            .unwrap();
        run(&mut db, |_| Ok(())).unwrap();
        assert_eq!(
            db.query_row("SELECT value FROM meta WHERE key='fixture'", [], |r| r
                .get::<_, String>(
                0
            ))
            .unwrap(),
            "kept"
        );
        validate_schema(&db).unwrap();
    }

    #[test]
    fn foreign_sessions_table_is_refused_without_stamping() {
        let mut db = memory();
        db.execute_batch("CREATE TABLE sessions(id INTEGER PRIMARY KEY);")
            .unwrap();
        assert!(run(&mut db, |_| Ok(()))
            .unwrap_err()
            .to_string()
            .contains("missing table events"));
        assert!(!table_exists(&db, "stellarc_migrations").unwrap());
    }

    #[test]
    fn stamped_incomplete_database_is_refused() {
        let mut db = memory();
        run(&mut db, |_| Ok(())).unwrap();
        db.execute_batch("DROP TRIGGER messages_fts_update;")
            .unwrap();
        assert!(run(&mut db, |_| Ok(()))
            .unwrap_err()
            .to_string()
            .contains("messages_fts_update"));
    }

    #[test]
    fn every_non_exact_ledger_is_refused() {
        for id in [-1, 0, 2] {
            let mut db = memory();
            run(&mut db, |_| Ok(())).unwrap();
            db.execute("INSERT INTO stellarc_migrations VALUES(?1,'unknown')", [id])
                .unwrap();
            assert!(run(&mut db, |_| Ok(()))
                .unwrap_err()
                .to_string()
                .contains("exact known ordered set"));
        }
        let mut db = memory();
        run(&mut db, |_| Ok(())).unwrap();
        db.execute("DELETE FROM stellarc_migrations", []).unwrap();
        assert!(run(&mut db, |_| Ok(())).is_err());
    }

    #[test]
    fn maintenance_failure_rolls_back_schema_and_ledger() {
        let mut db = memory();
        let error = run(&mut db, |tx| {
            tx.execute_batch("CREATE TABLE must_roll_back(value INTEGER);")?;
            bail!("fixture failure")
        })
        .unwrap_err();
        assert!(error.to_string().contains("fixture failure"));
        assert!(!table_exists(&db, "stellarc_migrations").unwrap());
        assert!(!table_exists(&db, "must_roll_back").unwrap());
    }

    #[test]
    fn checksum_is_bound_to_immutable_migration_source() {
        let expected = blake3::hash(MIGRATION_1_SQL.as_bytes())
            .to_hex()
            .to_string();
        let changed = blake3::hash(format!("{MIGRATION_1_SQL}\n-- changed").as_bytes())
            .to_hex()
            .to_string();
        assert_ne!(expected, changed);
    }
}
