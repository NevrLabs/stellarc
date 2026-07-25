# 0055 — Session project metadata tripped the mandatory Clippy size gate

## Summary

Adding `project_id` to `SessionDto` increased the `ServerFrame::SessionAdded` variant enough to trigger Clippy's `large_enum_variant` lint under the repository's warning-as-error gate.

## Impact

Unit tests and production builds passed, but the canonical Clippy verification failed. The feature could not be integrated under the repository's required quality gate, and every `ServerFrame` value carried the enlarged inline enum storage cost.

## Root cause

`SessionAdded` stored the full `SessionDto` inline while substantially smaller variants shared the same enum. Existing checks did not run the all-targets Clippy gate before final review.

## Fix

Box the `SessionDto` payload in `ServerFrame::SessionAdded` and update all constructors. Serde preserves the existing JSON frame contract while the Rust enum remains compact.

## Prevention

Run `cargo clippy --locked -j2 -p stellarc-axis --all-targets -- -D warnings` before declaring a control-plane branch merge-ready; unit tests do not cover structural lints.
