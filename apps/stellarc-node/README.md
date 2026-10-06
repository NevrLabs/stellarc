# stellarc-node — bring your own agent

Runs on your machine. It connects to a Stellarc plane, picks up tasks for the
agents you bound to this node, and drives your locally installed ACP agent.
Your binaries and API keys never leave the machine.

```bash
# 1. operator: register a node (the token is shown once)
curl -XPOST $PLANE/orgs/$ORG/v1/nodes -H "authorization: Bearer $OPERATOR" \
  -H 'content-type: application/json' -d '{"name":"my-laptop"}'

# 2. you: ~/.config/stellarc/node.json
{
  "server": "https://stellarc.example",
  "tokenEnv": "STELLARC_NODE_TOKEN",
  "concurrency": 2,
  "harnesses": {
    "hermes": null,                       // built-in default: `hermes acp`
    "claude-code": null,                  // npx @zed-industries/claude-code-acp
    "my-agent": { "command": "/opt/my-agent", "args": ["--acp"] }
  }
}

# 3. run it
STELLARC_NODE_TOKEN=stln_... bun apps/stellarc-node/src/main.ts

# 4. operator: create an agent on that node and give it work
curl -XPOST $PLANE/orgs/$ORG/v1/agents ... -d '{"name":"builder","nodeId":"node_…","harness":"hermes"}'
curl -XPOST $PLANE/orgs/$ORG/v1/tasks  ... -d '{"agentId":"agt_…","prompt":"…","subjectRef":"kaneo:KFL-1"}'
curl $PLANE/orgs/$ORG/v1/tasks/task_…    # status + transcript items
```

The built-in harness names are `hermes`, `goose`, `claude-code`, `codex`,
`gemini` and `opencode`. Any other ACP-over-stdio agent works through
`command` + `args`. See `docs/adrs/0011-byo-agent-runtime.md`.
