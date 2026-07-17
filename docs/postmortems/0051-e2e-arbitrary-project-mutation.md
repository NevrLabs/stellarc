# 0051 — Canonical E2E mutated arbitrary project workspace state

## Summary

The live project-workspace E2E selected the first project with at least two member sessions, reset its layout, and persisted a two-pane test layout. That project could be a fixture owned by the restart/persistence probe—or a real development project.

## Impact

The E2E changed Project B from its expected one-pane layout to two panes. The subsequent fresh-browser check after a Hall restart correctly failed. More broadly, running the canonical E2E against dev could overwrite an operator's workspace layout.

## Root cause

Fixture discovery treated membership count as sufficient ownership. The test had no dedicated resource boundary and performed destructive setup (`layout: null`) against whatever project matched first.

## Fix

Use one exact-name `QA E2E` project owned by the harness. Create it and two draft member sessions when absent, then reset and exercise only that project's layout. Other projects remain untouched.

## Prevention

- Destructive E2E setup must act only on resources carrying an explicit harness-owned identity.
- Persistence probes and canonical E2E must use separate projects.
- Run restart verification after E2E so cross-test mutation is observable.
