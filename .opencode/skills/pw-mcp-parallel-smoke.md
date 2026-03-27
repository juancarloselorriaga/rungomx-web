---
description: Parallel-safe Playwright MCP smoke tests across multiple terminals/worktrees. Use when asked to run smoke tests, Playwright MCP, or UI checks where parallel runs might collide. Configure worktree-scoped .codex/config.toml, choose a free dev-server port, update .env.local safely, capture artifacts, and always close the browser.
---

# PW MCP Parallel Smoke

## Overview
Enable true parallel UI smoke tests in multiple worktrees without Playwright profile or port collisions, while keeping all evidence inside the current worktree.

## Quick Start (preferred)
Use the runner to set up a parallel-safe run from existing `smoke-tests.json`:

```bash
node ~/.codex/skills/pw-mcp-parallel-smoke/scripts/run_parallel_smoke.js \
  --workdir . \
  --session-dir /path/to/ui-smoke-session \
  --mode isolated \
  --start --wait
```

The runner will:
- Ensure `.codex/config.toml` has parallel-safe MCP servers
- Pick a free port and patch `.env.local` safely
- Create a per-run artifacts directory
- Emit a `run-manifest.json` you can execute with MCP tools

If you already have `smoke-tests.json`, pass `--tests /path/to/smoke-tests.json` instead of `--session-dir`.

Optional variables:
- Use `--port <port>` to reuse an already-running dev server.
- Use `--var KEY=VALUE` or `--vars KEY=VALUE,KEY2=VALUE2` to fill placeholders like `${EVENT_ID}`.
  - `${BASE_URL}` is always provided automatically.

## Workflow (parallel-safe)

### 1) Ensure worktree-scoped Playwright MCP server
Create or update `.codex/config.toml` in the current worktree only. Keep existing entries and append missing ones.

Use stdio mode by default (no `--port`). Only use HTTP/SSE if the user explicitly configured it, then pick a unique port.

```toml
[mcp_servers.playwright]
command = "npx"
args = [
  "-y",
  "@playwright/mcp@latest",
  "--isolated",
  "--output-mode=file",
  "--output-dir=../playwright-artifacts"
]
cwd = ".codex"

[mcp_servers.playwright_isolated]
command = "npx"
args = [
  "-y",
  "@playwright/mcp@latest",
  "--isolated",
  "--output-mode=file",
  "--output-dir=../playwright-artifacts"
]
cwd = ".codex"

[mcp_servers.playwright_persistent]
command = "npx"
args = [
  "-y",
  "@playwright/mcp@latest",
  "--user-data-dir=../playwright-user-data",
  "--output-mode=file",
  "--output-dir=../playwright-artifacts"
]
cwd = ".codex"
```

Notes:
- Prefer `playwright_isolated` for explicit parallel smoke runs.
- Use `playwright_persistent` only when per-worktree auth state is required.
- Treat `--isolated` and `--user-data-dir` as mutually exclusive.
- If auth is needed in isolated mode, prefer `--storage-state=...`.
- If running in a container and isolated mode fails, add `--no-sandbox`.

### 2) Prepare port + artifacts (use helper script)

```bash
python3 ~/.codex/skills/pw-mcp-parallel-smoke/scripts/parallel_smoke_setup.py --workdir . --start --wait
```

Parse the JSON output to get:
- `base_url` (use for navigation)
- `port`
- `run_id` and `run_dir`

### 3) Start or reuse the dev server
If `--start` was used, the script starts the dev server and waits for HTTP readiness.
If the port is already serving HTTP, reuse it.

### 4) Run the smoke checks (minimal, parallel-safe)
Minimal required actions:
- `browser_navigate` to `base_url`
- `browser_snapshot` → `<run_id>/snapshot.json`
- `browser_take_screenshot` → `<run_id>/screenshot.png`
- `browser_console_messages` → `<run_id>/console.json`
- `browser_network_requests` → `<run_id>/network.json`

Always call `browser_close` in a finally/cleanup step, even on failure.

### 5) Write the smoke report
Create `playwright-artifacts/<run_id>/smoke-report.md` with base URL, port, artifact paths, and pass/fail status.

## Safety Rules
- Never delete global Playwright caches or lock files.
- Never kill processes on occupied ports.
- Only read/write inside the current worktree.
- Use stdio MCP mode unless explicitly configured otherwise.
