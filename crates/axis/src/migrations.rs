use anyhow::{bail, Context, Result};
use rusqlite::{Connection, OptionalExtension, TransactionBehavior};

const ID: i64 = 1;
const SQL: &str = "axis-sqlite-schema-v1";

pub(crate) fn run(conn: &mut Connection, schema: &str) -> Result<()> {
    let (pragmas, schema) = schema
        .split_once("CREATE TABLE")
        .context("Axis schema has no tables")?;
    conn.execute_batch(pragmas)
        .context("configuring Stellarc SQLite")?;
    let schema = format!("CREATE TABLE{schema}");
    let checksum = blake3::hash(SQL.as_bytes()).to_hex().to_string();
    // IMMEDIATE serializes startup writers before either inspects the ledger.
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .context("locking Stellarc SQLite migrations")?;
    let ledger_exists: bool = tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='stellarc_migrations')",
        [], |r| r.get(0),
    )?;
    if ledger_exists {
        let newer: Option<i64> = tx.query_row(
            "SELECT max(id) FROM stellarc_migrations WHERE id > ?1",
            [ID],
            |r| r.get(0),
        )?;
        if let Some(id) = newer {
            bail!("database has newer unknown migration {id}");
        }
        if let Some(found) = tx
            .query_row(
                "SELECT checksum FROM stellarc_migrations WHERE id=?1",
                [ID],
                |r| r.get::<_, String>(0),
            )
            .optional()?
        {
            if found != checksum {
                bail!("migration {ID} checksum mismatch");
            }
            tx.commit()?;
            return Ok(());
        }
        bail!("database migration ledger is missing known migration {ID}");
    }

    let tables: i64 = tx.query_row(
        "SELECT count(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        [],
        |r| r.get(0),
    )?;
    if tables > 0 {
        let sessions: i64 = tx.query_row(
            "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='sessions'",
            [],
            |r| r.get(0),
        )?;
        if sessions != 1 {
            bail!("unrecognized existing Axis SQLite schema: missing sessions");
        }
        tx.execute_batch(&schema)
            .context("completing recognized Axis SQLite schema")?;
        for (table, column, definition) in [
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
        ] {
            let sql = format!("SELECT count(*) FROM pragma_table_info('{table}') WHERE name=?1");
            if tx.query_row(&sql, [column], |r| r.get::<_, i64>(0))? == 0 {
                tx.execute_batch(&format!("ALTER TABLE {table} ADD COLUMN {definition};"))?;
            }
        }
        tx.execute_batch("CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id); CREATE INDEX IF NOT EXISTS idx_sessions_org ON sessions(org_id); CREATE INDEX IF NOT EXISTS idx_cards_org ON cards(org_id); CREATE INDEX IF NOT EXISTS idx_projects_org ON projects(org_id);")?;
    } else {
        tx.execute_batch(&schema)
            .context("creating Stellarc SQLite schema")?;
    }
    tx.execute_batch(
        "CREATE TABLE stellarc_migrations(id INTEGER PRIMARY KEY, checksum TEXT NOT NULL);",
    )?;
    tx.execute(
        "INSERT INTO stellarc_migrations(id,checksum) VALUES(?1,?2)",
        (ID, checksum),
    )?;
    tx.commit()
        .context("committing Stellarc SQLite migration")?;
    Ok(())
}
