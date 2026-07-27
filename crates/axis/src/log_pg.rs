//! Postgres event log — the Full-edition backend (ADR 0037).
//!
//! Async sqlx with a `PgPool`, deliberately NOT a `Mutex<Client>`: axis must
//! support many concurrent writers because one database is shared by axis,
//! stellarc-managed apps, boards, and repo sync. A global write lock would buy
//! Postgres's operational cost with SQLite's concurrency.
//!
//! Orbit is NOT a client of this — each orbit keeps its own local SQLite so an
//! edge runtime still works when axis is unreachable.
//!
//! Translations from the SQLite original (ADR 0037 §2.2): `?N` -> `$N`,
//! `INSERT OR REPLACE` -> `ON CONFLICT DO UPDATE`, `INSERT OR IGNORE` ->
//! `ON CONFLICT DO NOTHING`, scalar `MAX(a,b)` -> `GREATEST`, FTS5 ->
//! tsvector/`ts_rank`/`ts_headline`.

use anyhow::{Context, Result};
use sqlx::postgres::PgPoolOptions;
use sqlx::{PgPool, Postgres, Row, Transaction};

use crate::event::Event;
use crate::log::SearchHit;
use crate::views::card::CardAttempt;
use crate::views::session::ContextProjectRef;
use crate::views::{CardRow, MessageRow, ProjectRow, RegistryEntry, RepoRow, SessionRow, SetupRow};

const SCHEMA: &str = include_str!("schema_pg.sql");

pub struct PgLog {
    pool: PgPool,
}

impl PgLog {
    /// Connect and apply the schema.
    ///
    /// `url` is a libpq/sqlx connection string. For the intended deployment —
    /// a Unix socket with peer auth — that is
    /// `postgres:///stellarc?host=/var/run/postgresql`, which carries no
    /// password at all.
    pub async fn connect(url: &str) -> Result<Self> {
        let pool = PgPoolOptions::new()
            .max_connections(16)
            .connect(url)
            .await
            .with_context(|| format!("connecting to Postgres ({url})"))?;
        // `execute` on a multi-statement string runs it as a simple query,
        // which is what the DDL batch needs.
        sqlx::raw_sql(SCHEMA)
            .execute(&pool)
            .await
            .context("initializing Stellarc Postgres schema")?;
        Ok(Self { pool })
    }

    /// Which engine this is, for the runtime check axis exposes on /api/health.
    pub fn backend(&self) -> crate::store::Backend {
        crate::store::Backend::Postgres
    }

    /// Shared pool, so other subsystems (boards, repo sync, managed apps) reuse
    /// one set of connections instead of opening their own.
    pub fn pool(&self) -> &PgPool {
        &self.pool
    }

    // ---- append ----------------------------------------------------------

    pub async fn append(&self, event: &Event) -> Result<u64> {
        let mut tx = self.pool.begin().await?;
        let seq = append_in_tx(&mut tx, event).await?;
        tx.commit().await?;
        Ok(seq)
    }

    /// Returns the seq of the **first** appended event, matching the SQLite
    /// backend. Returning the last would silently break job replay.
    pub async fn append_batch(&self, events: &[Event]) -> Result<Option<u64>> {
        if events.is_empty() {
            return Ok(None);
        }
        let mut tx = self.pool.begin().await?;
        let mut first = None;
        for event in events {
            let seq = append_in_tx(&mut tx, event).await?;
            first.get_or_insert(seq);
        }
        tx.commit().await?;
        Ok(first)
    }

    /// Persist a sequenced Orbit frame and advance its watermark atomically.
    ///
    /// The strict `seq == watermark + 1` check means concurrent writers for the
    /// same session must be serialized. A per-session advisory lock does that
    /// without blocking other sessions (ADR 0037 §2.1 hazard 2) — a global lock
    /// here would destroy the multi-writer property this backend exists for.
    pub async fn append_orbit_event(
        &self,
        identity: &str,
        seq: u64,
        event: &Event,
    ) -> Result<bool> {
        let mut tx = self.pool.begin().await?;
        advisory_lock(&mut tx, identity).await?;
        let current = watermark_in_tx(&mut tx, identity).await?;
        if current.is_some_and(|watermark| seq <= watermark) {
            return Ok(false);
        }
        let expected = current.map_or(0, |watermark| watermark + 1);
        anyhow::ensure!(
            seq == expected,
            "orbit event sequence gap for {identity}: expected {expected}, got {seq}"
        );
        append_in_tx(&mut tx, event).await?;
        set_watermark_in_tx(&mut tx, identity, seq).await?;
        tx.commit().await?;
        Ok(true)
    }

    pub async fn accept_observed(
        &self,
        transport_session_id: &str,
        seq: u64,
        hermes_id: &str,
        message_id: Option<u64>,
        event: &Event,
    ) -> Result<bool> {
        let mut tx = self.pool.begin().await?;
        advisory_lock(&mut tx, transport_session_id).await?;
        let current = watermark_in_tx(&mut tx, transport_session_id).await?;
        if current.is_some_and(|watermark| seq <= watermark) {
            return Ok(false);
        }

        // Dedupe by observed identity: a re-import must not double-apply.
        let duplicate = match message_id {
            Some(message_id) => sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM observed_messages WHERE hermes_id = $1 AND message_id = $2",
            )
            .bind(hermes_id)
            .bind(message_id as i64)
            .fetch_one(&mut *tx)
            .await?,
            None => {
                sqlx::query_scalar::<_, i64>(
                    "SELECT COUNT(*) FROM observed_sessions WHERE hermes_id = $1",
                )
                .bind(hermes_id)
                .fetch_one(&mut *tx)
                .await?
            }
        } > 0;
        if duplicate {
            set_watermark_in_tx(&mut tx, transport_session_id, seq).await?;
            tx.commit().await?;
            return Ok(false);
        }

        append_in_tx(&mut tx, event).await?;
        match message_id {
            Some(message_id) => {
                sqlx::query(
                    "INSERT INTO observed_messages(hermes_id, message_id) VALUES ($1, $2)
                     ON CONFLICT DO NOTHING",
                )
                .bind(hermes_id)
                .bind(message_id as i64)
                .execute(&mut *tx)
                .await?;
            }
            None => {
                sqlx::query(
                    "INSERT INTO observed_sessions(hermes_id) VALUES ($1) ON CONFLICT DO NOTHING",
                )
                .bind(hermes_id)
                .execute(&mut *tx)
                .await?;
            }
        }
        set_watermark_in_tx(&mut tx, transport_session_id, seq).await?;
        tx.commit().await?;
        Ok(true)
    }

    pub async fn accept_orbit_seq(&self, session_id: &str, seq: u64) -> Result<bool> {
        let mut tx = self.pool.begin().await?;
        advisory_lock(&mut tx, session_id).await?;
        let current = watermark_in_tx(&mut tx, session_id).await?;
        if current.is_some_and(|watermark| seq <= watermark) {
            return Ok(false);
        }
        set_watermark_in_tx(&mut tx, session_id, seq).await?;
        tx.commit().await?;
        Ok(true)
    }

    // ---- read ------------------------------------------------------------

    pub async fn read_from(&self, seq: u64, limit: usize) -> Result<Vec<(u64, Event)>> {
        let rows = sqlx::query(
            // `>=`, inclusive, matching the SQLite backend: `read_all` calls
            // `read_from(0, MAX)` and `GET /api/events?since=N` pages with an
            // explicit cursor, so an exclusive bound silently drops the event at
            // `since` on every page.
            "SELECT seq, payload FROM events WHERE seq >= $1 ORDER BY seq LIMIT $2",
        )
        .bind(seq as i64)
        .bind(limit as i64)
        .fetch_all(&self.pool)
        .await?;
        rows.iter().map(decode_event_row).collect()
    }

    pub async fn read_all(&self) -> Result<Vec<(u64, Event)>> {
        let rows = sqlx::query("SELECT seq, payload FROM events ORDER BY seq")
            .fetch_all(&self.pool)
            .await?;
        rows.iter().map(decode_event_row).collect()
    }

    pub async fn event_count(&self) -> Result<usize> {
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM events")
            .fetch_one(&self.pool)
            .await?;
        Ok(count as usize)
    }

    pub async fn orbit_watermark(&self, session_id: &str) -> Result<Option<u64>> {
        let seq: Option<i64> =
            sqlx::query_scalar("SELECT seq FROM orbit_watermarks WHERE session_id = $1")
                .bind(session_id)
                .fetch_optional(&self.pool)
                .await?;
        Ok(seq.map(|seq| seq as u64))
    }

    // ---- maintenance -----------------------------------------------------

    pub async fn delete_job_history(&self, seqs: &[u64], identities: &[String]) -> Result<()> {
        if seqs.is_empty() && identities.is_empty() {
            return Ok(());
        }
        let mut tx = self.pool.begin().await?;
        if !seqs.is_empty() {
            let seqs: Vec<i64> = seqs.iter().map(|seq| *seq as i64).collect();
            sqlx::query("DELETE FROM events WHERE seq = ANY($1)")
                .bind(&seqs)
                .execute(&mut *tx)
                .await?;
        }
        if !identities.is_empty() {
            sqlx::query("DELETE FROM orbit_watermarks WHERE session_id = ANY($1)")
                .bind(identities)
                .execute(&mut *tx)
                .await?;
        }
        tx.commit().await?;
        Ok(())
    }

    /// Drop the previous boot's state.db-imported sessions so re-index is
    /// idempotent, keeping natively-created rows.
    pub async fn retain_native(&self) -> Result<()> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("DELETE FROM messages WHERE session_id IN (SELECT session_id FROM sessions WHERE source <> '')")
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM sessions WHERE source <> ''")
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM observed_sessions")
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM observed_messages")
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(())
    }

    // ---- projections -----------------------------------------------------

    pub async fn list_sessions(&self) -> Result<Vec<SessionRow>> {
        let rows = sqlx::query(&format!(
            "{SESSION_COLUMNS} ORDER BY started_at DESC, session_id DESC"
        ))
        .fetch_all(&self.pool)
        .await?;
        rows.iter().map(session_row).collect()
    }

    pub async fn get_session(&self, id: &str) -> Result<Option<SessionRow>> {
        let row = sqlx::query(&format!("{SESSION_COLUMNS} WHERE session_id = $1"))
            .bind(id)
            .fetch_optional(&self.pool)
            .await?;
        row.as_ref().map(session_row).transpose()
    }

    pub async fn recent_messages(&self, session_id: &str, limit: usize) -> Result<Vec<MessageRow>> {
        let rows = sqlx::query(
            "SELECT message_id, role, content, tool_name, timestamp, token_count,
                    tool_calls, reasoning
             FROM messages WHERE session_id = $1
             ORDER BY message_id DESC LIMIT $2",
        )
        .bind(session_id)
        .bind(limit as i64)
        .fetch_all(&self.pool)
        .await?;
        // Query descending for the newest N, then flip so callers get
        // chronological order — same as the SQLite backend.
        rows.iter().rev().map(message_row).collect()
    }

    pub async fn next_message_id(&self, session_id: &str) -> Result<u64> {
        let next: i64 = sqlx::query_scalar(
            "SELECT COALESCE(MAX(message_id) + 1, 0) FROM messages WHERE session_id = $1",
        )
        .bind(session_id)
        .fetch_one(&self.pool)
        .await?;
        Ok(next as u64)
    }

    /// FTS5 `MATCH`/`bm25`/`snippet` -> tsvector/`ts_rank`/`ts_headline`.
    ///
    /// `websearch_to_tsquery` rather than `to_tsquery`: it never raises on
    /// arbitrary user input, where `to_tsquery` rejects bare punctuation. The
    /// SQLite path negated bm25 to sort ascending; `ts_rank` is already
    /// higher-is-better, so the sign flip is gone.
    pub async fn search(&self, query: &str, limit: usize) -> Result<Vec<SearchHit>> {
        let rows = sqlx::query(
            "SELECT m.session_id,
                    m.message_id,
                    ts_headline('english', COALESCE(m.content, ''),
                                websearch_to_tsquery('english', $1),
                                'StartSel=<mark>,StopSel=</mark>,MaxFragments=1,MaxWords=32,MinWords=8'),
                    ts_rank(m.content_fts, websearch_to_tsquery('english', $1)) AS rank,
                    m.timestamp,
                    COALESCE(s.source, '')
             FROM messages m
             LEFT JOIN sessions s ON s.session_id = m.session_id
             WHERE m.content_fts @@ websearch_to_tsquery('english', $1)
             ORDER BY rank DESC
             LIMIT $2",
        )
        .bind(query)
        .bind(limit as i64)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows
            .iter()
            .map(|row| SearchHit {
                session_id: row.get(0),
                message_id: row.get::<i64, _>(1) as u64,
                snippet: row.get(2),
                score: row.get::<f32, _>(3),
                timestamp: row.get(4),
                source: row.get(5),
            })
            .collect())
    }

    pub async fn get_setup(&self, scope: &str) -> Result<Option<SetupRow>> {
        let row = sqlx::query(
            "SELECT scope, skills, mcp, plugins, hooks, declared_at FROM setup WHERE scope = $1",
        )
        .bind(scope)
        .fetch_optional(&self.pool)
        .await?;
        row.as_ref().map(setup_row).transpose()
    }

    /// Most specific scope wins: project, then org, then global.
    pub async fn effective_setup(&self, org: &str, project: &str) -> Result<SetupRow> {
        for scope in [
            format!("project:{project}"),
            format!("org:{org}"),
            "global".to_string(),
        ] {
            if let Some(found) = self.get_setup(&scope).await? {
                return Ok(found);
            }
        }
        Ok(SetupRow {
            scope: "global".to_string(),
            skills: Vec::new(),
            mcp: Vec::new(),
            plugins: Vec::new(),
            hooks: Vec::new(),
            declared_at: 0.0,
        })
    }

    pub async fn list_registry(&self, kind: Option<&str>) -> Result<Vec<RegistryEntry>> {
        let rows = match kind {
            Some(kind) => {
                sqlx::query(
                    "SELECT kind, slug, definition, registered_at FROM registry
                 WHERE kind = $1 ORDER BY kind, slug",
                )
                .bind(kind)
                .fetch_all(&self.pool)
                .await?
            }
            None => sqlx::query(
                "SELECT kind, slug, definition, registered_at FROM registry ORDER BY kind, slug",
            )
            .fetch_all(&self.pool)
            .await?,
        };
        rows.iter().map(registry_row).collect()
    }

    pub async fn get_registry(&self, kind: &str, slug: &str) -> Result<Option<RegistryEntry>> {
        let row = sqlx::query(
            "SELECT kind, slug, definition, registered_at FROM registry
             WHERE kind = $1 AND slug = $2",
        )
        .bind(kind)
        .bind(slug)
        .fetch_optional(&self.pool)
        .await?;
        row.as_ref().map(registry_row).transpose()
    }

    pub async fn list_projects(&self) -> Result<Vec<ProjectRow>> {
        let rows = sqlx::query(&format!(
            "{PROJECT_COLUMNS} WHERE deleted_at IS NULL ORDER BY created_at DESC, project_id DESC"
        ))
        .fetch_all(&self.pool)
        .await?;
        rows.iter().map(project_row).collect()
    }

    pub async fn get_project(&self, id: &str) -> Result<Option<ProjectRow>> {
        let row = sqlx::query(&format!(
            "{PROJECT_COLUMNS} WHERE project_id = $1 AND deleted_at IS NULL"
        ))
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        row.as_ref().map(project_row).transpose()
    }

    pub async fn list_repos(&self) -> Result<Vec<RepoRow>> {
        let rows =
            sqlx::query("SELECT slug, url, default_branch, registered_at FROM repos ORDER BY slug")
                .fetch_all(&self.pool)
                .await?;
        Ok(rows.iter().map(repo_row).collect())
    }

    pub async fn get_repo(&self, slug: &str) -> Result<Option<RepoRow>> {
        let row = sqlx::query(
            "SELECT slug, url, default_branch, registered_at FROM repos WHERE slug = $1",
        )
        .bind(slug)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.as_ref().map(repo_row))
    }

    pub async fn list_cards(&self) -> Result<Vec<CardRow>> {
        let rows = sqlx::query(&format!(
            "{CARD_COLUMNS} ORDER BY created_at DESC, card_id DESC"
        ))
        .fetch_all(&self.pool)
        .await?;
        rows.iter().map(card_row).collect()
    }

    pub async fn get_card(&self, id: &str) -> Result<Option<CardRow>> {
        let row = sqlx::query(&format!("{CARD_COLUMNS} WHERE card_id = $1"))
            .bind(id)
            .fetch_optional(&self.pool)
            .await?;
        row.as_ref().map(card_row).transpose()
    }
}

// ---- shared SELECT prefixes so list/get pairs cannot drift ----------------

/// Column order here is authoritative and must match `session_row` below
/// index for index. The SQLite backend's SELECT text and its decoder disagree
/// on where `org_id` sits (the decoder reads index 18), so copying either one
/// blindly produces silently swapped fields.
const SESSION_COLUMNS: &str = "SELECT session_id, hermes_id, source, model, title, started_at,
            message_count, input_tokens, output_tokens, archived, pinned,
            last_activity, agent, node, parent_session_id, card_id, project_id,
            context_projects, org_id, capabilities
     FROM sessions";

const PROJECT_COLUMNS: &str = "SELECT project_id, org_id, name, vaults, repos, boards, layout,
            created_at, deleted_at
     FROM projects";

const CARD_COLUMNS: &str = "SELECT card_id, org_id, board_id, title, status, assigned_id,
            assigned_kind, current_session_id, current_bookmark, blocked_by,
            priority, attempts, created_at, status_changed_at
     FROM cards";

// ---- transaction helpers --------------------------------------------------

/// Serialize writers for one session without blocking other sessions.
///
/// `hashtext` collisions are acceptable: a collision costs two unrelated
/// sessions brief mutual exclusion, never incorrectness. Released at commit.
async fn advisory_lock(tx: &mut Transaction<'_, Postgres>, key: &str) -> Result<()> {
    sqlx::query("SELECT pg_advisory_xact_lock(hashtext($1))")
        .bind(key)
        .execute(&mut **tx)
        .await?;
    Ok(())
}

async fn watermark_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    session_id: &str,
) -> Result<Option<u64>> {
    let seq: Option<i64> =
        sqlx::query_scalar("SELECT seq FROM orbit_watermarks WHERE session_id = $1")
            .bind(session_id)
            .fetch_optional(&mut **tx)
            .await?;
    Ok(seq.map(|seq| seq as u64))
}

async fn set_watermark_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    session_id: &str,
    seq: u64,
) -> Result<()> {
    sqlx::query(
        "INSERT INTO orbit_watermarks(session_id, seq) VALUES ($1, $2)
         ON CONFLICT (session_id) DO UPDATE SET seq = EXCLUDED.seq",
    )
    .bind(session_id)
    .bind(seq as i64)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

/// Append the immutable event and apply its projection in ONE transaction.
///
/// Payloads are zstd-compressed JSON, matching ADR 0009 and the SQLite
/// backend byte for byte. Storing raw JSON or `jsonb` here would silently
/// break every existing reader.
async fn append_in_tx(tx: &mut Transaction<'_, Postgres>, event: &Event) -> Result<u64> {
    let encoded = serde_json::to_vec(event).context("encoding event as JSON")?;
    let payload = zstd::stream::encode_all(encoded.as_slice(), 3).context("compressing event")?;
    let seq: i64 = sqlx::query_scalar(
        "INSERT INTO events(event_type, payload, created_at, session_id)
         VALUES ($1, $2, $3, $4) RETURNING seq",
    )
    .bind(crate::log::event_type(event))
    .bind(&payload)
    .bind(crate::log::event_time(event))
    .bind(crate::log::event_session_id(event))
    .fetch_one(&mut **tx)
    .await?;
    apply_projection(tx, event).await?;
    Ok(seq as u64)
}

fn decode_event_row(row: &sqlx::postgres::PgRow) -> Result<(u64, Event)> {
    let seq: i64 = row.get(0);
    let payload: Vec<u8> = row.get(1);
    let decoded = zstd::stream::decode_all(payload.as_slice())
        .with_context(|| format!("decompressing event at seq {seq}"))?;
    let event = serde_json::from_slice(&decoded)
        .with_context(|| format!("decoding event payload at seq {seq}"))?;
    Ok((seq as u64, event))
}

// ---- projection ------------------------------------------------------------

/// Apply an event's projection. Mirrors the SQLite `apply_projection` case for
/// case; any divergence here silently corrupts a view.
async fn apply_projection(tx: &mut Transaction<'_, Postgres>, event: &Event) -> Result<()> {
    match event {
        // Job lifecycle and package events have no projection.
        Event::JobDispatchIntent { .. }
        | Event::JobOutputPersisted { .. }
        | Event::JobTerminal { .. }
        | Event::JobReconciled { .. }
        | Event::PackageInstalled { .. }
        | Event::PackageInstalledV2 { .. }
        | Event::PackageGranted { .. }
        | Event::PackageActivated { .. }
        | Event::PackageDeactivated { .. }
        | Event::PackageRemoved { .. } => {}

        Event::SessionCreated {
            session_id,
            hermes_id,
            source,
            model,
            title,
            started_at,
            message_count,
            input_tokens,
            output_tokens,
            agent,
            node,
        } => {
            sqlx::query(
                "INSERT INTO sessions(session_id, hermes_id, source, model, title, started_at,
                        message_count, input_tokens, output_tokens, archived, pinned,
                        last_activity, agent, node, parent_session_id, card_id, project_id, org_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, 0, $6, $10, $11,
                         NULL, NULL, NULL, 'personal')
                 ON CONFLICT (session_id) DO UPDATE SET
                     hermes_id = EXCLUDED.hermes_id, source = EXCLUDED.source,
                     model = EXCLUDED.model, title = EXCLUDED.title,
                     started_at = EXCLUDED.started_at,
                     message_count = EXCLUDED.message_count,
                     input_tokens = EXCLUDED.input_tokens,
                     output_tokens = EXCLUDED.output_tokens,
                     last_activity = EXCLUDED.last_activity,
                     agent = EXCLUDED.agent, node = EXCLUDED.node",
            )
            .bind(session_id)
            .bind(hermes_id)
            .bind(source)
            .bind(model)
            .bind(title)
            .bind(started_at)
            .bind(*message_count as i64)
            .bind(*input_tokens as i64)
            .bind(*output_tokens as i64)
            .bind(agent)
            .bind(node)
            .execute(&mut **tx)
            .await?;
        }

        Event::SessionOrganizationAssigned {
            session_id,
            organization_id,
        } => {
            sqlx::query("UPDATE sessions SET org_id = $2 WHERE session_id = $1")
                .bind(session_id)
                .bind(organization_id)
                .execute(&mut **tx)
                .await?;
        }

        Event::SessionCapabilitiesAssigned {
            session_id,
            capabilities,
            ..
        } => {
            sqlx::query("UPDATE sessions SET capabilities = $2 WHERE session_id = $1")
                .bind(session_id)
                .bind(serde_json::to_string(capabilities)?)
                .execute(&mut **tx)
                .await?;
        }

        Event::SessionUpdated {
            session_id,
            title,
            model,
            archived,
            message_count,
            agent,
            node,
            hermes_id,
            pinned,
        } => {
            sqlx::query(
                "UPDATE sessions SET
                     title = COALESCE($2, title),
                     model = COALESCE($3, model),
                     archived = COALESCE($4, archived),
                     message_count = COALESCE($5, message_count),
                     agent = COALESCE($6, agent),
                     node = COALESCE($7, node),
                     hermes_id = COALESCE($8, hermes_id),
                     pinned = COALESCE($9, pinned)
                 WHERE session_id = $1",
            )
            .bind(session_id)
            .bind(title)
            .bind(model)
            .bind(archived.map(i16::from))
            .bind(message_count.map(|value| value as i64))
            .bind(agent)
            .bind(node)
            .bind(hermes_id)
            .bind(pinned.map(i16::from))
            .execute(&mut **tx)
            .await?;
        }

        Event::MessageAppended {
            session_id,
            message_id,
            role,
            content,
            tool_name,
            tool_calls,
            reasoning,
            timestamp,
            token_count,
            finish_reason,
            ..
        } => {
            sqlx::query(
                "INSERT INTO messages(session_id, message_id, role, content, tool_name,
                        tool_calls, reasoning, timestamp, token_count, finish_reason)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                 ON CONFLICT (session_id, message_id) DO UPDATE SET
                     role = EXCLUDED.role, content = EXCLUDED.content,
                     tool_name = EXCLUDED.tool_name, tool_calls = EXCLUDED.tool_calls,
                     reasoning = EXCLUDED.reasoning, timestamp = EXCLUDED.timestamp,
                     token_count = EXCLUDED.token_count,
                     finish_reason = EXCLUDED.finish_reason",
            )
            .bind(session_id)
            .bind(*message_id as i64)
            .bind(role)
            .bind(content)
            .bind(tool_name)
            .bind(tool_calls)
            .bind(reasoning)
            .bind(timestamp)
            .bind(token_count.map(|value| value as i64))
            .bind(finish_reason)
            .execute(&mut **tx)
            .await?;
            // GREATEST, not MAX: SQLite overloads one name for the aggregate
            // and the two-argument scalar, Postgres does not.
            sqlx::query(
                "UPDATE sessions SET last_activity = GREATEST(last_activity, $2)
                 WHERE session_id = $1",
            )
            .bind(session_id)
            .bind(timestamp)
            .execute(&mut **tx)
            .await?;
        }

        Event::MessageRemoved {
            session_id,
            message_id,
            ..
        } => {
            sqlx::query("DELETE FROM messages WHERE session_id = $1 AND message_id = $2")
                .bind(session_id)
                .bind(*message_id as i64)
                .execute(&mut **tx)
                .await?;
        }

        Event::SetupDeclared {
            scope,
            skills,
            mcp,
            plugins,
            hooks,
            declared_at,
        } => {
            sqlx::query(
                "INSERT INTO setup(scope, skills, mcp, plugins, hooks, declared_at)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (scope) DO UPDATE SET
                     skills = EXCLUDED.skills, mcp = EXCLUDED.mcp,
                     plugins = EXCLUDED.plugins, hooks = EXCLUDED.hooks,
                     declared_at = EXCLUDED.declared_at",
            )
            .bind(scope)
            .bind(json(skills))
            .bind(json(mcp))
            .bind(json(plugins))
            .bind(json(hooks))
            .bind(declared_at)
            .execute(&mut **tx)
            .await?;
        }

        Event::EntryRegistered {
            kind,
            slug,
            definition,
            registered_at,
        } => {
            sqlx::query(
                "INSERT INTO registry(kind, slug, definition, registered_at)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (kind, slug) DO UPDATE SET
                     definition = EXCLUDED.definition,
                     registered_at = EXCLUDED.registered_at",
            )
            .bind(kind)
            .bind(slug)
            .bind(definition)
            .bind(registered_at)
            .execute(&mut **tx)
            .await?;
        }

        Event::RepoRegistered {
            slug,
            url,
            default_branch,
            registered_at,
        } => {
            sqlx::query(
                "INSERT INTO repos(slug, url, default_branch, registered_at)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (slug) DO UPDATE SET
                     url = EXCLUDED.url, default_branch = EXCLUDED.default_branch,
                     registered_at = EXCLUDED.registered_at",
            )
            .bind(slug)
            .bind(url)
            .bind(default_branch)
            .bind(registered_at)
            .execute(&mut **tx)
            .await?;
        }

        Event::RepoRemoved { slug, .. } => {
            sqlx::query("DELETE FROM repos WHERE slug = $1")
                .bind(slug)
                .execute(&mut **tx)
                .await?;
        }

        Event::SessionRepoAttached {
            session_id,
            slug,
            attached_at,
        } => {
            sqlx::query(
                "INSERT INTO session_repos(session_id, slug, attached_at) VALUES ($1, $2, $3)
                 ON CONFLICT DO NOTHING",
            )
            .bind(session_id)
            .bind(slug)
            .bind(attached_at)
            .execute(&mut **tx)
            .await?;
        }

        Event::ProjectCreated {
            project_id,
            name,
            created_at,
        } => {
            sqlx::query(
                "INSERT INTO projects(project_id, name, vaults, repos, boards, created_at,
                        deleted_at, org_id)
                 VALUES ($1, $2, '[]', '[]', '[]', $3, NULL, 'personal')
                 ON CONFLICT (project_id) DO UPDATE SET
                     name = EXCLUDED.name, created_at = EXCLUDED.created_at,
                     deleted_at = NULL",
            )
            .bind(project_id)
            .bind(name)
            .bind(created_at)
            .execute(&mut **tx)
            .await?;
        }

        Event::ProjectOrganizationAssigned {
            project_id,
            organization_id,
        } => {
            sqlx::query("UPDATE projects SET org_id = $2 WHERE project_id = $1")
                .bind(project_id)
                .bind(organization_id)
                .execute(&mut **tx)
                .await?;
        }

        Event::ProjectUpdated {
            project_id,
            name,
            vaults,
            repos,
            boards,
        } => {
            sqlx::query(
                "UPDATE projects SET
                     name = COALESCE($2, name),
                     vaults = COALESCE($3, vaults),
                     repos = COALESCE($4, repos),
                     boards = COALESCE($5, boards)
                 WHERE project_id = $1",
            )
            .bind(project_id)
            .bind(name)
            .bind(vaults.as_ref().map(json))
            .bind(repos.as_ref().map(json))
            .bind(boards.as_ref().map(json))
            .execute(&mut **tx)
            .await?;
        }

        Event::ProjectLayoutUpdated {
            project_id, layout, ..
        } => {
            sqlx::query("UPDATE projects SET layout = $2 WHERE project_id = $1")
                .bind(project_id)
                .bind(serde_json::to_string(layout)?)
                .execute(&mut **tx)
                .await?;
        }

        Event::ProjectDeleted {
            project_id,
            deleted_at,
        } => {
            sqlx::query("UPDATE projects SET deleted_at = $2 WHERE project_id = $1")
                .bind(project_id)
                .bind(deleted_at)
                .execute(&mut **tx)
                .await?;
        }

        Event::SessionProjectAttached {
            session_id,
            project_id,
            ..
        } => {
            sqlx::query("UPDATE sessions SET project_id = $2 WHERE session_id = $1")
                .bind(session_id)
                .bind(project_id)
                .execute(&mut **tx)
                .await?;
        }

        Event::SessionContextProjectAttached {
            session_id,
            project_id,
            mode,
            ..
        } => {
            // Read-modify-write of a JSON array. The advisory lock in the
            // caller does NOT cover this path, so take the row lock: FOR UPDATE
            // makes a concurrent attach on the same session wait instead of
            // clobbering the other's entry.
            let current: Option<String> = sqlx::query_scalar(
                "SELECT context_projects FROM sessions WHERE session_id = $1 FOR UPDATE",
            )
            .bind(session_id)
            .fetch_optional(&mut **tx)
            .await?;
            if let Some(current) = current {
                let mut projects: Vec<ContextProjectRef> = serde_json::from_str(&current)?;
                if let Some(project) = projects
                    .iter_mut()
                    .find(|project| project.project_id == *project_id)
                {
                    project.mode = mode.clone();
                } else {
                    projects.push(ContextProjectRef {
                        project_id: project_id.clone(),
                        mode: mode.clone(),
                    });
                }
                sqlx::query("UPDATE sessions SET context_projects = $2 WHERE session_id = $1")
                    .bind(session_id)
                    .bind(serde_json::to_string(&projects)?)
                    .execute(&mut **tx)
                    .await?;
            }
        }

        Event::SessionContextProjectDetached {
            session_id,
            project_id,
            ..
        } => {
            let current: Option<String> = sqlx::query_scalar(
                "SELECT context_projects FROM sessions WHERE session_id = $1 FOR UPDATE",
            )
            .bind(session_id)
            .fetch_optional(&mut **tx)
            .await?;
            if let Some(current) = current {
                let mut projects: Vec<ContextProjectRef> = serde_json::from_str(&current)?;
                projects.retain(|project| project.project_id != *project_id);
                sqlx::query("UPDATE sessions SET context_projects = $2 WHERE session_id = $1")
                    .bind(session_id)
                    .bind(serde_json::to_string(&projects)?)
                    .execute(&mut **tx)
                    .await?;
            }
        }

        Event::SessionForked {
            parent_session_id,
            child_session_id,
            ..
        } => {
            sqlx::query(
                "UPDATE sessions SET
                     parent_session_id = $2,
                     card_id = (SELECT card_id FROM sessions WHERE session_id = $2),
                     project_id = (SELECT project_id FROM sessions WHERE session_id = $2)
                 WHERE session_id = $1",
            )
            .bind(child_session_id)
            .bind(parent_session_id)
            .execute(&mut **tx)
            .await?;
        }

        Event::CardSessionLinked {
            card_id,
            session_id,
            ..
        } => {
            sqlx::query(
                "UPDATE sessions SET card_id = $2
                 WHERE session_id = $1 OR parent_session_id = $1",
            )
            .bind(session_id)
            .bind(card_id)
            .execute(&mut **tx)
            .await?;
        }

        Event::SessionHandover {
            source_session_id,
            target_session_id,
            ..
        } => {
            sqlx::query(
                "UPDATE sessions SET
                     parent_session_id = $2,
                     card_id = (SELECT card_id FROM sessions WHERE session_id = $2)
                 WHERE session_id = $1",
            )
            .bind(target_session_id)
            .bind(source_session_id)
            .execute(&mut **tx)
            .await?;
        }

        Event::CardCreated {
            card_id,
            board_id,
            title,
            created_at,
        } => {
            sqlx::query(
                "INSERT INTO cards(card_id, board_id, title, status, assigned_id, assigned_kind,
                        current_session_id, current_bookmark, blocked_by, priority, attempts,
                        created_at, status_changed_at, org_id)
                 VALUES ($1, $2, $3, 'todo', NULL, NULL, NULL, NULL, '[]', 0, '[]', $4, $4,
                         'personal')
                 ON CONFLICT (card_id) DO UPDATE SET
                     board_id = EXCLUDED.board_id, title = EXCLUDED.title,
                     created_at = EXCLUDED.created_at,
                     status_changed_at = EXCLUDED.status_changed_at",
            )
            .bind(card_id)
            .bind(board_id)
            .bind(title)
            .bind(created_at)
            .execute(&mut **tx)
            .await?;
        }

        Event::CardOrganizationAssigned {
            card_id,
            organization_id,
        } => {
            sqlx::query("UPDATE cards SET org_id = $2 WHERE card_id = $1")
                .bind(card_id)
                .bind(organization_id)
                .execute(&mut **tx)
                .await?;
        }

        Event::CardAssigned {
            card_id,
            assigned_id,
            assigned_kind,
            session_id,
            attempt_bookmark,
            assigned_at,
        } => {
            update_card_attempt(
                tx,
                card_id,
                assigned_id,
                assigned_kind,
                session_id,
                attempt_bookmark,
                *assigned_at,
                None,
            )
            .await?;
        }

        Event::CardClaimed {
            card_id,
            claimed_at,
        } => {
            sqlx::query(
                "UPDATE cards SET status = 'claimed', status_changed_at = $2 WHERE card_id = $1",
            )
            .bind(card_id)
            .bind(claimed_at)
            .execute(&mut **tx)
            .await?;
        }

        Event::CardBlocked {
            card_id,
            blocked_by,
            blocked_at,
        } => {
            sqlx::query(
                "UPDATE cards SET status = 'blocked', blocked_by = $2, status_changed_at = $3
                 WHERE card_id = $1",
            )
            .bind(card_id)
            .bind(json(blocked_by))
            .bind(blocked_at)
            .execute(&mut **tx)
            .await?;
        }

        Event::CardCompleted {
            card_id,
            completed_at,
        } => {
            sqlx::query(
                "UPDATE cards SET status = 'done', status_changed_at = $2 WHERE card_id = $1",
            )
            .bind(card_id)
            .bind(completed_at)
            .execute(&mut **tx)
            .await?;
        }

        Event::CardReassigned {
            card_id,
            assigned_id,
            assigned_kind,
            session_id,
            attempt_bookmark,
            previous_session_id,
            reassigned_at,
        } => {
            update_card_attempt(
                tx,
                card_id,
                assigned_id,
                assigned_kind,
                session_id,
                attempt_bookmark,
                *reassigned_at,
                Some(previous_session_id),
            )
            .await?;
        }
    }
    Ok(())
}

/// Close the previous attempt (if any) and open a new one.
#[allow(clippy::too_many_arguments)]
async fn update_card_attempt(
    tx: &mut Transaction<'_, Postgres>,
    card_id: &str,
    assigned_id: &str,
    assigned_kind: &str,
    session_id: &str,
    attempt_bookmark: &str,
    at: f64,
    previous_session_id: Option<&String>,
) -> Result<()> {
    // FOR UPDATE: attempts is a JSON array read-modify-written here, so two
    // concurrent assignments to one card must not clobber each other.
    let current: Option<String> =
        sqlx::query_scalar("SELECT attempts FROM cards WHERE card_id = $1 FOR UPDATE")
            .bind(card_id)
            .fetch_optional(&mut **tx)
            .await?;
    let Some(current) = current else {
        return Ok(());
    };
    let mut attempts: Vec<CardAttempt> = serde_json::from_str(&current)?;
    if let Some(previous_session_id) = previous_session_id {
        if let Some(previous) = attempts
            .iter_mut()
            .find(|attempt| attempt.session_id == *previous_session_id)
        {
            previous.ended_at = Some(at);
            previous.outcome = "reassigned".to_string();
        }
    }
    attempts.push(CardAttempt {
        session_id: session_id.to_string(),
        assigned_id: assigned_id.to_string(),
        bookmark: attempt_bookmark.to_string(),
        started_at: at,
        ended_at: None,
        outcome: "active".to_string(),
    });
    sqlx::query(
        "UPDATE cards SET assigned_id = $2, assigned_kind = $3, current_session_id = $4,
             current_bookmark = $5, attempts = $6, status = 'assigned', status_changed_at = $7
         WHERE card_id = $1",
    )
    .bind(card_id)
    .bind(assigned_id)
    .bind(assigned_kind)
    .bind(session_id)
    .bind(attempt_bookmark)
    .bind(serde_json::to_string(&attempts)?)
    .bind(at)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

// ---- row decoders ---------------------------------------------------------
//
// Index order matches the corresponding *_COLUMNS const above, which is the
// single source of truth. Do not reorder one without the other.

fn json<T: serde::Serialize + ?Sized>(value: &T) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "[]".to_string())
}

fn json_vec(raw: String) -> Vec<String> {
    serde_json::from_str(&raw).unwrap_or_default()
}

fn session_row(row: &sqlx::postgres::PgRow) -> Result<SessionRow> {
    Ok(SessionRow {
        session_id: row.get(0),
        hermes_id: row.get(1),
        source: row.get(2),
        model: row.get(3),
        title: row.get(4),
        started_at: row.get(5),
        message_count: row.get::<i64, _>(6) as u64,
        input_tokens: row.get::<i64, _>(7) as u64,
        output_tokens: row.get::<i64, _>(8) as u64,
        archived: row.get::<i16, _>(9) != 0,
        pinned: row.get::<i16, _>(10) != 0,
        last_activity: row.get(11),
        agent: row.get(12),
        node: row.get(13),
        parent_session_id: row.get(14),
        card_id: row.get(15),
        project_id: row.get(16),
        context_projects: serde_json::from_str(row.get::<&str, _>(17))
            .context("decoding session context_projects")?,
        org_id: row.get(18),
        capabilities: row
            .get::<Option<&str>, _>(19)
            .map(serde_json::from_str)
            .transpose()
            .context("decoding session capabilities")?,
    })
}

fn message_row(row: &sqlx::postgres::PgRow) -> Result<MessageRow> {
    Ok(MessageRow {
        message_id: row.get::<i64, _>(0) as u64,
        role: row.get(1),
        content: row.get(2),
        tool_name: row.get(3),
        timestamp: row.get(4),
        token_count: row.get::<Option<i64>, _>(5).map(|value| value as u64),
        tool_calls: row.get(6),
        reasoning: row.get(7),
    })
}

fn setup_row(row: &sqlx::postgres::PgRow) -> Result<SetupRow> {
    Ok(SetupRow {
        scope: row.get(0),
        skills: json_vec(row.get(1)),
        mcp: json_vec(row.get(2)),
        plugins: json_vec(row.get(3)),
        hooks: json_vec(row.get(4)),
        declared_at: row.get(5),
    })
}

fn registry_row(row: &sqlx::postgres::PgRow) -> Result<RegistryEntry> {
    Ok(RegistryEntry {
        kind: row.get(0),
        slug: row.get(1),
        definition: serde_json::from_str(row.get::<&str, _>(2))
            .context("decoding registry definition")?,
        registered_at: row.get(3),
    })
}

fn project_row(row: &sqlx::postgres::PgRow) -> Result<ProjectRow> {
    Ok(ProjectRow {
        project_id: row.get(0),
        org_id: row.get(1),
        name: row.get(2),
        vaults: json_vec(row.get(3)),
        repos: json_vec(row.get(4)),
        boards: json_vec(row.get(5)),
        layout: row
            .get::<Option<&str>, _>(6)
            .map(serde_json::from_str)
            .transpose()
            .context("decoding project layout")?,
        created_at: row.get(7),
        deleted_at: row.get(8),
    })
}

fn repo_row(row: &sqlx::postgres::PgRow) -> RepoRow {
    RepoRow {
        slug: row.get(0),
        url: row.get(1),
        default_branch: row.get(2),
        registered_at: row.get(3),
    }
}

fn card_row(row: &sqlx::postgres::PgRow) -> Result<CardRow> {
    Ok(CardRow {
        card_id: row.get(0),
        org_id: row.get(1),
        board_id: row.get(2),
        title: row.get(3),
        status: row.get(4),
        assigned_id: row.get(5),
        assigned_kind: row.get(6),
        current_session_id: row.get(7),
        current_bookmark: row.get(8),
        blocked_by: json_vec(row.get(9)),
        priority: row.get(10),
        attempts: serde_json::from_str(row.get::<&str, _>(11)).context("decoding card attempts")?,
        created_at: row.get(12),
        status_changed_at: row.get(13),
    })
}
