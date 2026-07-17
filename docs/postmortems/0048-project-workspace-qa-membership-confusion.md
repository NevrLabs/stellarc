# 0048 — Project workspace QA confused membership pruning with layout loss

Date: 2026-07-17 · Severity: medium (false acceptance blocker) · Author: Terminus

## Symptom

The first browser showed Project A with two panes, while a fresh browser and a
post-Hall-restart browser showed one. This was reported as a persistence defect.

## Root cause

The probe moved one of Project A's two open sessions into Project B before the
fresh-browser checks. Project membership enforcement correctly pruned that pane,
and the probe itself expected A=1. The evidence was then interpreted against an
unstated A=2 expectation. One fixture was trying to prove both cross-project
reparenting and durable two-pane restoration with the same session.

The canonical Playwright test also selected the first project in the sidebar.
Once the sidebar correctly filtered sessions by project, an arbitrary empty
project no longer exposed session rows and the test failed before exercising
Dockview.

## Fix

The durable probe now uses four sessions:

- two remain open in Project A;
- one is Project B's stable pane;
- one temporary Project A pane is moved to B to prove foreign-pane pruning.

Project A must remain at two panes in the initial browser, a fresh browser, and
after Hall restart. Project B must restore one pane and the clean project zero.
The canonical E2E discovers a project with at least two authoritative members
instead of selecting an arbitrary sidebar row.

## Prevention

- Persistence fixtures must keep the expected durable state unchanged while
  testing unrelated membership transitions.
- Browser probes must encode their acceptance matrix directly and print the
  observed counts.
- Project tests must select fixtures by API-visible invariants, not UI ordering.
