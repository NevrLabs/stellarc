//! Transactional Envoy execution event outbox (ADR 0033).
//!
//! Envoy owns active session/job-run history. Events and sequence allocation
//! live in one SQLite transaction; Hall acknowledgements remove delivered
//! outbox rows without resetting the monotonic sequence.

use std::path::Path;
use std::sync::Mutex;

use anyhow::{Context, Result};
use olympus_proto::frames::EnvoyFrame;
use rusqlite::{params, Connection, OptionalExtension};

pub const DEFAULT_SESSION_CAP: u64 = 512 * 1024 * 1024;

pub struct EventSpool {
    db: Mutex<Connection>,
    cap: u64,
}

impl EventSpool {
    pub fn open(state_dir: &Path) -> Result<Self> {
        Self::with_cap(state_dir, DEFAULT_SESSION_CAP)
    }

    pub fn with_cap(state_dir: &Path, cap: u64) -> Result<Self> {
        std::fs::create_dir_all(state_dir)
            .with_context(|| format!("creating {}", state_dir.display()))?;
        let db = Connection::open(state_dir.join("envoy.sqlite"))?;
        db.pragma_update(None, "journal_mode", "WAL")?;
        db.pragma_update(None, "foreign_keys", "ON")?;
        db.execute_batch(
            "CREATE TABLE IF NOT EXISTS execution_sequences (
                 session_id TEXT PRIMARY KEY,
                 next_seq INTEGER NOT NULL CHECK(next_seq >= 0)
             );
             CREATE TABLE IF NOT EXISTS execution_events (
                 session_id TEXT NOT NULL,
                 seq INTEGER NOT NULL CHECK(seq >= 0),
                 frame BLOB NOT NULL,
                 byte_len INTEGER NOT NULL CHECK(byte_len >= 0),
                 acknowledged INTEGER NOT NULL DEFAULT 0 CHECK(acknowledged IN (0, 1)),
                 PRIMARY KEY(session_id, seq)
             );
             CREATE INDEX IF NOT EXISTS execution_events_unacked
                 ON execution_events(session_id, acknowledged, seq);",
        )?;
        Ok(Self {
            db: Mutex::new(db),
            cap,
        })
    }

    /// Inspect the next sequence without consuming it.
    pub fn next_seq(&self, session_id: &str) -> Result<u64> {
        let db = self.db.lock().expect("event store mutex poisoned");
        next_value(&db, session_id)
    }

    /// Allocate a sequence and durably append one frame atomically.
    pub fn append_next(&self, frame: &mut EnvoyFrame) -> Result<u64> {
        let session_id = event_identity(frame)
            .map(|(session_id, _)| session_id.to_owned())
            .context("only event frames are spoolable")?;
        let mut db = self.db.lock().expect("event store mutex poisoned");
        let tx = db.transaction()?;
        let seq = next_value(&tx, &session_id)?;
        set_event_seq(frame, seq).context("only event frames are spoolable")?;
        insert_frame(&tx, frame, self.cap)?;
        let next = seq.checked_add(1).context("event sequence exhausted")?;
        tx.execute(
            "INSERT INTO execution_sequences(session_id, next_seq) VALUES (?1, ?2)
             ON CONFLICT(session_id) DO UPDATE SET next_seq = excluded.next_seq",
            params![session_id, to_sql_i64(next)?],
        )?;
        tx.commit()?;
        Ok(seq)
    }

    /// Append an already-sequenced frame and preserve monotonic allocation.
    pub fn append(&self, frame: &EnvoyFrame) -> Result<()> {
        let (session_id, seq) = event_identity(frame).context("only event frames are spoolable")?;
        let mut db = self.db.lock().expect("event store mutex poisoned");
        let tx = db.transaction()?;
        insert_frame(&tx, frame, self.cap)?;
        let next = seq.checked_add(1).context("event sequence exhausted")?;
        tx.execute(
            "INSERT INTO execution_sequences(session_id, next_seq) VALUES (?1, ?2)
             ON CONFLICT(session_id) DO UPDATE SET next_seq = MAX(next_seq, excluded.next_seq)",
            params![session_id, to_sql_i64(next)?],
        )?;
        tx.commit()?;
        Ok(())
    }

    pub fn read(&self, session_id: &str, after: Option<u64>) -> Result<Vec<EnvoyFrame>> {
        let db = self.db.lock().expect("event store mutex poisoned");
        let after = after.map(to_sql_i64).transpose()?.unwrap_or(-1);
        let mut statement = db.prepare(
            "SELECT frame FROM execution_events
             WHERE session_id = ?1 AND acknowledged = 0 AND seq > ?2 ORDER BY seq",
        )?;
        let rows =
            statement.query_map(params![session_id, after], |row| row.get::<_, Vec<u8>>(0))?;
        rows.map(|row| {
            serde_json::from_slice(&row?).context("decoding execution event from SQLite")
        })
        .collect()
    }

    pub fn acknowledge(&self, session_id: &str, watermark: u64) -> Result<()> {
        let db = self.db.lock().expect("event store mutex poisoned");
        db.execute(
            "DELETE FROM execution_events WHERE session_id = ?1 AND seq <= ?2",
            params![session_id, to_sql_i64(watermark)?],
        )?;
        Ok(())
    }

    pub fn sessions(&self) -> Result<Vec<String>> {
        let db = self.db.lock().expect("event store mutex poisoned");
        let mut statement = db.prepare(
            "SELECT session_id FROM execution_sequences
             UNION SELECT session_id FROM execution_events ORDER BY session_id",
        )?;
        let sessions = statement
            .query_map([], |row| row.get(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(sessions)
    }

    pub fn last_seq(&self, session_id: &str) -> Result<Option<u64>> {
        let db = self.db.lock().expect("event store mutex poisoned");
        let value: Option<i64> = db
            .query_row(
                "SELECT MAX(seq) FROM execution_events WHERE session_id = ?1 AND acknowledged = 0",
                [session_id],
                |row| row.get(0),
            )
            .optional()?
            .flatten();
        value.map(from_sql_i64).transpose()
    }
}

fn insert_frame(db: &Connection, frame: &EnvoyFrame, cap: u64) -> Result<()> {
    let (session_id, seq) = event_identity(frame).context("only event frames are spoolable")?;
    let bytes = serde_json::to_vec(frame).context("serializing execution event")?;
    let used: i64 = db.query_row(
        "SELECT COALESCE(SUM(byte_len), 0) FROM execution_events
         WHERE session_id = ?1 AND acknowledged = 0",
        [session_id],
        |row| row.get(0),
    )?;
    let projected = u64::try_from(used)?
        .checked_add(bytes.len() as u64)
        .context("spool size overflow")?;
    if projected > cap {
        anyhow::bail!("SPOOL_OVERFLOW: session {session_id} exceeded {cap} bytes");
    }
    db.execute(
        "INSERT INTO execution_events(session_id, seq, frame, byte_len)
         VALUES (?1, ?2, ?3, ?4)",
        params![
            session_id,
            to_sql_i64(seq)?,
            bytes,
            to_sql_i64(bytes.len() as u64)?
        ],
    )?;
    Ok(())
}

fn next_value(db: &Connection, session_id: &str) -> Result<u64> {
    let value: Option<i64> = db
        .query_row(
            "SELECT next_seq FROM execution_sequences WHERE session_id = ?1",
            [session_id],
            |row| row.get(0),
        )
        .optional()?;
    value
        .map(from_sql_i64)
        .transpose()
        .map(|value| value.unwrap_or(0))
}

fn to_sql_i64(value: u64) -> Result<i64> {
    i64::try_from(value).context("event sequence exceeds SQLite integer range")
}

fn from_sql_i64(value: i64) -> Result<u64> {
    u64::try_from(value).context("negative event sequence in SQLite")
}

fn event_identity(frame: &EnvoyFrame) -> Option<(&str, u64)> {
    match frame {
        EnvoyFrame::Event {
            session_id, seq, ..
        }
        | EnvoyFrame::Observed {
            session_id, seq, ..
        } => Some((session_id, *seq)),
        EnvoyFrame::JobOutput { job_id, seq, .. } | EnvoyFrame::JobResult { job_id, seq, .. } => {
            Some((job_id, *seq))
        }
        _ => None,
    }
}

fn event_seq(frame: &EnvoyFrame) -> Option<u64> {
    event_identity(frame).map(|(_, seq)| seq)
}

fn set_event_seq(frame: &mut EnvoyFrame, seq: u64) -> Option<()> {
    match frame {
        EnvoyFrame::Event { seq: value, .. }
        | EnvoyFrame::Observed { seq: value, .. }
        | EnvoyFrame::JobOutput { seq: value, .. }
        | EnvoyFrame::JobResult { seq: value, .. } => {
            *value = seq;
            Some(())
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use olympus_proto::agent::AgentEvent;

    fn event(session: &str, seq: u64) -> EnvoyFrame {
        EnvoyFrame::Event {
            session_id: session.into(),
            turn_id: "turn-1".into(),
            seq,
            payload: AgentEvent::Text(format!("event-{seq}")),
        }
    }

    #[test]
    fn persists_replays_and_acknowledges_in_order() {
        let dir = tempfile::tempdir().unwrap();
        let spool = EventSpool::open(dir.path()).unwrap();
        for seq in 0..4 {
            spool.append(&event("s/1", seq)).unwrap();
        }
        drop(spool);

        let reopened = EventSpool::open(dir.path()).unwrap();
        assert_eq!(reopened.last_seq("s/1").unwrap(), Some(3));
        assert_eq!(reopened.next_seq("s/1").unwrap(), 4);
        reopened.acknowledge("s/1", 1).unwrap();
        assert_eq!(
            reopened
                .read("s/1", Some(1))
                .unwrap()
                .iter()
                .filter_map(event_seq)
                .collect::<Vec<_>>(),
            [2, 3]
        );
        reopened.acknowledge("s/1", 3).unwrap();
        assert!(reopened.read("s/1", None).unwrap().is_empty());
        drop(reopened);
        assert_eq!(
            EventSpool::open(dir.path())
                .unwrap()
                .next_seq("s/1")
                .unwrap(),
            4
        );
    }

    #[test]
    fn stores_events_in_one_transactional_sqlite_database() {
        let dir = tempfile::tempdir().unwrap();
        let spool = EventSpool::open(dir.path()).unwrap();
        let mut frame = event("s/1", u64::MAX);
        spool.append_next(&mut frame).unwrap();
        drop(spool);

        assert!(dir.path().join("envoy.sqlite").is_file());
        assert!(!dir.path().join("spool").exists());
        let db = Connection::open(dir.path().join("envoy.sqlite")).unwrap();
        let row: (String, i64, i64) = db
            .query_row(
                "SELECT session_id, seq, acknowledged FROM execution_events",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(row, ("s/1".into(), 0, 0));
    }

    #[test]
    fn cap_fails_closed_without_consuming_sequence() {
        let dir = tempfile::tempdir().unwrap();
        let spool = EventSpool::with_cap(dir.path(), 1).unwrap();
        let mut first = event("s", u64::MAX);
        let mut second = event("s", u64::MAX);
        assert!(spool.append_next(&mut first).is_err());
        assert!(spool.append_next(&mut second).is_err());
        assert_eq!(event_seq(&first), Some(0));
        assert_eq!(event_seq(&second), Some(0));
        assert_eq!(spool.next_seq("s").unwrap(), 0);
        assert!(spool.read("s", None).unwrap().is_empty());
    }
}
