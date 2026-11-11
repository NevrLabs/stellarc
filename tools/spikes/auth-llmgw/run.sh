#!/usr/bin/env bash
# Run on fxbuilder only; owner DSN MUST point to a new disposable database.
set -euo pipefail
: "${SPIKE_OWNER_DSN:?fresh disposable PG owner DSN required}"
: "${SPIKE_RUNTIME_DSN:?authgw_runtime DSN for same disposable PG required}"
cd "$(dirname "$0")/../../.."
bun tools/spikes/auth-llmgw/check.ts
bun x tsc --noEmit --skipLibCheck --strict --target es2022 --module esnext --moduleResolution bundler --types bun tools/spikes/auth-llmgw/gateway.ts tools/spikes/auth-llmgw/check.ts tools/spikes/auth-llmgw/oidc.ts
