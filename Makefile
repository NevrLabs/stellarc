# Stellarc — canonical developer commands.
#
# This is a Rust workspace (control plane) + a Vite/React UI under ui/.
# The single source of truth for "is the tree green?" is `make verify`.

SHELL := /bin/bash
.PHONY: verify verify-rust verify-ui test lint fmt build run e2e e2e-desktop e2e-live e2e-prod deploy deploy-axis deploy-orbit

## verify — run ALL canonical gates (Rust + UI). The harness's go-to command.
verify: verify-rust verify-ui
	@echo "ALL CANONICAL GATES GREEN"

## verify-rust — cargo test + clippy (-D warnings) + fmt --check
verify-rust:
	cargo test --workspace
	cargo clippy --all-targets -- -D warnings
	cargo fmt --check

## verify-ui — typecheck + build + Maestro web e2e (fast inner loop)
verify-ui:
	cd ui && bun run typecheck
	cd ui && bun run build
	cd ui && bun run test:e2e

## test — Rust tests only (fast inner loop)
test:
	cargo test --workspace

## lint — clippy with warnings as errors
lint:
	cargo clippy --all-targets -- -D warnings

## fmt — apply rustfmt
fmt:
	cargo fmt

## build — release binary
build:
	cargo build --release

## run — start the control plane (imports state.db, serves API on :8787)
run:
	cargo run --release

## e2e — Maestro web e2e with evidence bundle (screenshots + optional videos)
e2e:
	cd ui && bun run test:e2e
	cd ui && bash scripts/evidence-bundle.sh

## e2e-desktop — compatibility alias for the Maestro Chromium web tier
e2e-desktop:
	cd ui && bun run test:e2e

## e2e-live — smoke tests against the REAL control plane (spends tokens)
e2e-live:
	cd ui && bun run test:e2e:live

## e2e-prod — prod-parity: static UI served by the control plane itself
## (same origin cloudflared sees). Requires stellarc.service running.
e2e-prod:
	cd ui && bun run test:e2e:prod

## deploy — install both axis + orbit binaries (symlink flip, no restart).
deploy:
	bash scripts/deploy.sh both

## deploy-axis — build axis → symlink flip → restart stellarc-axis.service.
## Orbits survive (ADR §5 Axis deploy story); they buffer through downtime.
deploy-axis:
	bash scripts/deploy.sh axis
	systemctl --user restart stellarc-axis
	@echo "Axis restarted. Orbits will re-attach on their next reconnect."

## deploy-orbit N — build orbit → symlink flip → start stellarc-orbit@N →
## poll /api/nodes until the new orbit is online → drain the old orbit if
## one exists. Usage: make deploy-orbit N=2
deploy-orbit:
	@if [ -z "$$N" ]; then echo "Usage: make deploy-orbit N=2" >&2; exit 1; fi
	bash scripts/deploy.sh orbit
	systemctl --user start stellarc-orbit@$$N
	@echo "Started stellarc-orbit@$$N, polling /api/nodes until online…"
	@TOKEN=$$(cat ~/.stellarc/token); \
	for i in $$(seq 1 30); do \
		online=$$(curl -sf -H "Authorization: Bearer $${TOKEN}" \
			http://127.0.0.1:8799/api/nodes \
			| grep -c "orbit-$$N" || true); \
		if [ "$$online" -gt 0 ]; then \
			echo "orbit-$$N is online"; exit 0; \
		fi; \
		sleep 1; \
	done; \
	echo "ERROR: orbit-$$N did not come online in 30s" >&2; exit 1
