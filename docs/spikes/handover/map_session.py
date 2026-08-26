#!/usr/bin/env python3
"""Phase-0 handover spike (NevrLabs/stellarc#13).

Maps one Hermes session (~/.hermes/state.db, READ ONLY) into the canonical
9-kind event union (docs/transcript-schema-v2.md), then renders the lossy
structured replay prompt for cross-harness handover.

Usage: python3 map_session.py <session_id> [outdir]
"""

import json
import sqlite3
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

DB = Path.home() / ".hermes" / "state.db"
HARNESS = "hermes"
HARNESS_VERSION = "0.20.2"
RAW_FORMAT = "hermes/state.db@26"  # hermes state schema_version 26
PLUGIN_NS = "spike-hermes-adapter"
NODE_ID = "terminus.host.entelechia.cloud"

# ACP ToolKind mapping for Hermes tool names (default: other)
TOOL_KIND = {
    "terminal": "execute",
    "read_file": "read",
    "skill_view": "read",
    "search_files": "search",
    "session_search": "search",
    "web_search": "fetch",
    "web_extract": "fetch",
    "write_file": "edit",
    "patch": "edit",
}


def new_id():
    try:
        return str(uuid.uuid7())  # py3.14+, sortable per schema
    except AttributeError:
        return str(uuid.uuid4())


def iso(ts):
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


def main():
    session_id = sys.argv[1]
    outdir = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).parent
    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row

    sess = con.execute("SELECT * FROM sessions WHERE id=?", (session_id,)).fetchone()
    rows = con.execute(
        "SELECT * FROM messages WHERE session_id=? ORDER BY id", (session_id,)
    ).fetchall()
    assert sess and rows, "session not found or empty"

    canon_session = str(uuid.uuid5(uuid.NAMESPACE_URL, f"hermes:{session_id}"))
    ingested = datetime.now(timezone.utc).isoformat()
    events = []
    seq = 0
    turn_id = None

    def emit(kind, body, row=None, item_id=None, source_uid=None):
        nonlocal seq
        seq += 1
        events.append({
            "event_id": new_id(),
            "session_id": canon_session,
            "seq": seq,
            "turn_id": turn_id,
            "item_id": item_id or new_id(),
            "parent_item_id": None,
            "source_uid": source_uid or (f"msg:{row['id']}" if row else None),
            "plugin_ns": PLUGIN_NS,
            "schema_version": 1,
            "actor": sess["user_id"] or "rpw",
            "node_id": NODE_ID,
            "harness": HARNESS,
            "harness_version": HARNESS_VERSION,
            "agent_id": None,
            "kind": kind,
            "body": body,
            # D21: pointer into the source store, raw never inlined
            "raw_ref": f"sqlite://~/.hermes/state.db#messages/{row['id']}" if row
                       else f"sqlite://~/.hermes/state.db#sessions/{session_id}",
            "raw_format": RAW_FORMAT,
            "occurred_at": iso(row["timestamp"]) if row else iso(sess["started_at"]),
            "ingested_at": ingested,
            "in_context": bool(row["active"]) if row else True,
            "superseded_by": None,
        })

    # sessions row -> config
    emit("config", {
        "model": sess["model"],
        "provider": sess["billing_provider"],
        "cwd": sess["cwd"],
        "git_branch": sess["git_branch"],
        "system_prompt_hash": sess["system_prompt_hash"],
    })

    for row in rows:
        role = row["role"]
        if role == "user":
            # ponytail: turn heuristic — Hermes has no explicit turn.closed
            # (deterministic_turn_end=false); user msg opens a turn.
            turn_id = new_id()
            emit("message", {
                "role": "user",
                "content": [{"type": "text", "text": row["content"]}],
            }, row)
        elif role == "assistant":
            if row["reasoning"] or row["reasoning_content"]:
                # Hermes stores only the provider's reasoning *summary*;
                # the full chain stays provider-side -> provider_opaque.
                emit("thinking", {
                    "text": row["reasoning"] or row["reasoning_content"],
                    "redacted": False,
                    "provider_opaque": True,
                }, row, source_uid=f"msg:{row['id']}:thinking")
            for tc in json.loads(row["tool_calls"] or "[]"):
                fn = tc["function"]
                try:
                    args = json.loads(fn["arguments"])
                except (json.JSONDecodeError, TypeError):
                    args = {"_raw": fn["arguments"]}
                emit("tool_call", {
                    "call_id": tc["call_id"],
                    "name": fn["name"],
                    "kind": TOOL_KIND.get(fn["name"], "other"),
                    "input": args,
                }, row, source_uid=tc["call_id"])
            if row["content"]:
                emit("message", {
                    "role": "assistant",
                    "content": [{"type": "text", "text": row["content"]}],
                    "model": sess["model"],
                    "stop_reason": row["finish_reason"],
                }, row)
        elif role == "tool":
            try:
                payload = json.loads(row["content"])
                is_error = bool(payload.get("error")) or payload.get("exit_code", 0) not in (0, None) \
                    or payload.get("success") is False
            except (json.JSONDecodeError, TypeError):
                is_error = False
            emit("tool_result", {
                "call_id": row["tool_call_id"],
                "status": "failed" if is_error else "completed",
                "content": [{"type": "text", "text": row["content"]}],
                "is_error": is_error,
            }, row)
        else:
            # rule 3: unknown -> harness_meta, never dropped, never an error
            emit("harness_meta", {
                "subtype": role,
                "data": {k: row[k] for k in row.keys()
                         if row[k] is not None and k not in ("id", "session_id")},
            }, row)

    events_path = outdir / f"{session_id}.events.jsonl"
    events_path.write_text("".join(json.dumps(e) + "\n" for e in events))

    # ---- structured replay prompt (design rule 1: lossy by design) ----
    lines = [
        "# Cross-harness handover: structured replay",
        "",
        f"You are taking over a session from another agent harness ({HARNESS}, "
        f"model {sess['model']}). Below is a lossy structured replay of the "
        "transcript. Provider-opaque reasoning was EXCLUDED (only one-line "
        "summaries survive, marked [thinking summary]). Tool results are "
        "truncated. Do not assume unstated details.",
        "",
        f"Session title: {sess['title']}",
        "",
        "## Transcript",
        "",
    ]
    for e in events:
        k, b = e["kind"], e["body"]
        if k == "message":
            text = b["content"][0]["text"]
            lines += [f"**{b['role']}:** {text}", ""]
        elif k == "thinking":
            # provider_opaque: full chain excluded per schema rule 7;
            # summary line retained per handover rule.
            lines += [f"[thinking summary — full reasoning provider-opaque, excluded] {b['text']}", ""]
        elif k == "tool_call":
            arg = json.dumps(b["input"])
            arg = arg[:400] + "…" if len(arg) > 400 else arg
            lines += [f"[tool call] {b['name']} {arg}", ""]
        elif k == "tool_result":
            text = b["content"][0]["text"] or ""
            text = text[:1200] + "…(truncated)" if len(text) > 1200 else text
            lines += [f"[tool result{' — ERROR' if b['is_error'] else ''}] {text}", ""]
        # config/harness_meta: not replayed — machine context, not conversation

    lines += [
        "## Your task",
        "",
        "Continue this session as the assistant. The user has now completed "
        "the AWS SSO device authentication. State, in one short paragraph, "
        "what you would do next and why. Do not use any tools — answer in "
        "plain text only.",
    ]
    prompt_path = outdir / f"{session_id}.replay-prompt.md"
    prompt_path.write_text("\n".join(lines))

    kinds = {}
    for e in events:
        kinds[e["kind"]] = kinds.get(e["kind"], 0) + 1
    print(f"{len(events)} events -> {events_path}")
    print(f"kinds: {json.dumps(kinds)}")
    print(f"replay prompt -> {prompt_path} ({prompt_path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
