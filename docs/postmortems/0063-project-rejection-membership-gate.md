# 0063 — Project rejection waited for membership authority

## Summary

The workspace restore effect checked sessions-membership readiness before processing a settled authoritative project response.

## Impact

If membership refresh failed while Axis returned `layout: null` or 401/403/404, already-mounted panes could remain visible indefinitely. A project rejection was therefore not independently fail-closed.

## Root cause

Two separate authorities were treated as one ordered gate. Membership is required to mount session panes, but it is not required to clear panes after project authority rejects or clears the workspace.

## Fix

Resolve project authority first. Apply rejection and empty layouts immediately; require current membership only before restoring or retaining a non-empty layout.

## Prevention

Negative authority must be monotonic and independently enforceable. Auxiliary lookup failures may reduce access but may never preserve content rejected by a stronger authority.
