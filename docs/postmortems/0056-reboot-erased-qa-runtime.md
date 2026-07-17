# 0056 — Reboot erased the browser QA Python environment

## Summary

fxcompute rebooted during final acceptance. The browser probes were committed, but every script searched only `/tmp/oly-qa/venv`; the tmpfs-backed environment disappeared and the durable probe failed with `ModuleNotFoundError: websockets`.

## Impact

Post-restart persistence verification could not run precisely when restart resilience mattered most. Four sibling CDP probes had the same hidden dependency on ephemeral state.

## Root cause

The harness treated `/tmp` as both disposable artifact storage and dependency storage. Documentation told operators to recreate or copy tooling after `/tmp` was wiped instead of keeping the small Python environment in durable cache.

## Fix

- Default all committed CDP probes to `~/.cache/olympus-qa-venv`.
- Support `OLYMPUS_QA_VENV` as an explicit override.
- Document `uv venv`/`uv pip install` setup and keep only profiles, screenshots, and disposable state under `/tmp/oly-qa`.

## Prevention

Acceptance tooling required after a service or host restart must not depend on tmpfs. Restart gates should include their own durable prerequisites and fail with a specific setup instruction when a dependency is absent.
