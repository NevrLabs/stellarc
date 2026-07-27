-- Stellarc Axis — Postgres schema (Full edition, ADR 0032 §2).
--
-- Ported from the SQLite SCHEMA const in crates/axis/src/log.rs. Deliberate
-- divergences, each forced by a real SQLite-ism:
--
--   * PRAGMAs are dropped. WAL/synchronous/cache_size are server-side config
--     in Postgres, not per-connection statements.
--   * INTEGER PRIMARY KEY AUTOINCREMENT -> BIGSERIAL.
--   * REAL timestamps stay DOUBLE PRECISION (unix epoch seconds). NOT
--     timestamptz: the wire format is f64 everywhere in the event payloads and
--     converting here would desync every projection. Revisit only with a real
--     migration.
--   * INTEGER booleans (archived, pinned) stay SMALLINT rather than BOOLEAN,
--     for the same reason — the row structs decode i64.
--   * WITHOUT ROWID is a SQLite storage hint with no Postgres equivalent; the
--     PRIMARY KEY already gives the clustering intent.
--   * FTS5 virtual table + its 3 sync triggers collapse into one GENERATED
--     tsvector column plus a GIN index. Postgres keeps it in sync itself, so
--     the triggers are deleted rather than ported — fewer moving parts than
--     the SQLite original.

CREATE TABLE IF NOT EXISTS events(
    seq         BIGSERIAL PRIMARY KEY,
    event_type  TEXT NOT NULL,
    payload     BYTEA NOT NULL,
    created_at  DOUBLE PRECISION NOT NULL,
    session_id  TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);

CREATE TABLE IF NOT EXISTS meta(
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions(
    session_id        TEXT PRIMARY KEY,
    hermes_id         TEXT NOT NULL DEFAULT '',
    source            TEXT NOT NULL DEFAULT '',
    model             TEXT,
    title             TEXT,
    started_at        DOUBLE PRECISION NOT NULL,
    message_count     BIGINT NOT NULL DEFAULT 0,
    input_tokens      BIGINT NOT NULL DEFAULT 0,
    output_tokens     BIGINT NOT NULL DEFAULT 0,
    archived          SMALLINT NOT NULL DEFAULT 0,
    pinned            SMALLINT NOT NULL DEFAULT 0,
    last_activity     DOUBLE PRECISION NOT NULL DEFAULT 0,
    agent             TEXT,
    node              TEXT,
    parent_session_id TEXT,
    card_id           TEXT,
    project_id        TEXT,
    org_id            TEXT NOT NULL DEFAULT 'personal',
    capabilities      TEXT,
    context_projects  TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_source ON sessions(source);
CREATE INDEX IF NOT EXISTS idx_sessions_archived ON sessions(archived);
CREATE INDEX IF NOT EXISTS idx_sessions_pinned ON sessions(pinned);

-- content_fts is maintained by Postgres itself. This is the FTS5 virtual table
-- and all three of its triggers, replaced by one column.
CREATE TABLE IF NOT EXISTS messages(
    session_id    TEXT NOT NULL,
    message_id    BIGINT NOT NULL,
    role          TEXT NOT NULL,
    content       TEXT,
    tool_name     TEXT,
    tool_calls    TEXT,
    reasoning     TEXT,
    timestamp     DOUBLE PRECISION NOT NULL,
    token_count   BIGINT,
    finish_reason TEXT,
    content_fts   tsvector GENERATED ALWAYS AS
                      (to_tsvector('english', COALESCE(content, ''))) STORED,
    PRIMARY KEY(session_id, message_id)
);
CREATE INDEX IF NOT EXISTS idx_messages_ts ON messages(session_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_fts ON messages USING GIN(content_fts);

CREATE TABLE IF NOT EXISTS cards(
    card_id            TEXT PRIMARY KEY,
    board_id           TEXT NOT NULL,
    title              TEXT NOT NULL,
    status             TEXT NOT NULL,
    assigned_id        TEXT,
    assigned_kind      TEXT,
    current_session_id TEXT,
    current_bookmark   TEXT,
    blocked_by         TEXT NOT NULL DEFAULT '[]',
    priority           BIGINT NOT NULL DEFAULT 0,
    attempts           TEXT NOT NULL DEFAULT '[]',
    created_at         DOUBLE PRECISION NOT NULL,
    status_changed_at  DOUBLE PRECISION NOT NULL,
    org_id             TEXT NOT NULL DEFAULT 'personal'
);

CREATE TABLE IF NOT EXISTS setup(
    scope       TEXT PRIMARY KEY,
    skills      TEXT NOT NULL,
    mcp         TEXT NOT NULL,
    plugins     TEXT NOT NULL,
    hooks       TEXT NOT NULL,
    declared_at DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS registry(
    kind          TEXT NOT NULL,
    slug          TEXT NOT NULL,
    definition    TEXT NOT NULL,
    registered_at DOUBLE PRECISION NOT NULL,
    PRIMARY KEY(kind, slug)
);

CREATE TABLE IF NOT EXISTS projects(
    project_id TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    vaults     TEXT NOT NULL DEFAULT '[]',
    repos      TEXT NOT NULL DEFAULT '[]',
    boards     TEXT NOT NULL DEFAULT '[]',
    layout     TEXT,
    created_at DOUBLE PRECISION NOT NULL,
    deleted_at DOUBLE PRECISION,
    org_id     TEXT NOT NULL DEFAULT 'personal'
);

CREATE TABLE IF NOT EXISTS repos(
    slug           TEXT PRIMARY KEY,
    url            TEXT NOT NULL,
    default_branch TEXT NOT NULL,
    registered_at  DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS session_repos(
    session_id  TEXT NOT NULL,
    slug        TEXT NOT NULL,
    attached_at DOUBLE PRECISION NOT NULL,
    PRIMARY KEY(session_id, slug)
);

CREATE TABLE IF NOT EXISTS orbit_watermarks(
    session_id TEXT PRIMARY KEY,
    seq        BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS observed_sessions(
    hermes_id TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS observed_messages(
    hermes_id  TEXT NOT NULL,
    message_id BIGINT NOT NULL,
    PRIMARY KEY(hermes_id, message_id)
);
