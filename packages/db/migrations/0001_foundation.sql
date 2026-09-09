CREATE TABLE org_event_counter (
  org text PRIMARY KEY CHECK (length(org) > 0),
  seq bigint NOT NULL DEFAULT 0 CHECK (seq >= 0)
);
CREATE TABLE event (
  org text NOT NULL REFERENCES org_event_counter(org),
  seq bigint NOT NULL CHECK (seq > 0),
  plugin_type text NOT NULL,
  actor text NOT NULL CHECK (length(actor) > 0),
  payload jsonb NOT NULL,
  schema_version integer NOT NULL CHECK (schema_version > 0),
  txid bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org, seq)
);
CREATE TABLE sync_probe (
  org text NOT NULL,
  id text NOT NULL,
  value text NOT NULL,
  last_seq bigint NOT NULL,
  PRIMARY KEY (org, id),
  FOREIGN KEY (org, last_seq) REFERENCES event(org, seq)
);
REVOKE UPDATE, DELETE, TRUNCATE ON event FROM PUBLIC;
