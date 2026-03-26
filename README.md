# local-git-mcp

A local MCP server that queries local git branches so you can generate standup updates from work that hasn't yet been merged to your main branch.

## Why

GitHub-based MCP servers can only see merged code. If you're actively working on a feature branch, those commits are invisible to them. This server reads your local git repos directly, so it can report on any branch — merged or not.

## Requirements

- Node.js ≥ 18

## Install

```bash
git clone <this repo>
cd local-git-mcp
npm install
npm run build
npm install -g .
```

## CLI Usage

### Manage repositories

```bash
# Register a local repo
local-git-mcp add ~/src/my-project

# Unregister a repo
local-git-mcp remove ~/src/my-project

# List all configured repos
local-git-mcp list

# Show full config summary (repos + default lookback)
local-git-mcp status
```

### Configure lookback period

The default lookback is 1 day (good for daily standups). Change it with:

```bash
local-git-mcp set-lookback 3
```

### Start / stop the server

```bash
# Start (writes PID to ~/.config/local-git-mcp/server.pid)
local-git-mcp serve

# Stop a running server
local-git-mcp stop
```

### All commands

| Command | Description |
|---|---|
| `add <path>` | Register a local git repository |
| `remove <path>` | Unregister a repository |
| `list` | Print all configured repo paths |
| `status` | Show repos and default lookback |
| `set-lookback <days>` | Set default lookback in days |
| `serve` | Start the MCP stdio server |
| `stop` | Stop the running server |

## Connect to Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "local-git-mcp": {
      "command": "local-git-mcp",
      "args": ["serve"]
    }
  }
}
```

Then restart Claude Desktop.

## Connect to Claude Code

```bash
claude mcp add local-git-mcp -- local-git-mcp serve
```

Or add to your project's `.claude/settings.json`:

```json
{
  "mcpServers": {
    "local-git-mcp": {
      "command": "local-git-mcp",
      "args": ["serve"]
    }
  }
}
```

## MCP Tools

Once connected, Claude can call these tools:

### `get_git_activity_for_ticket`

Searches all configured repos for branches whose name contains the given Jira ticket ID, and returns commits within the lookback window.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `ticket_id` | string | yes | Jira ticket ID, e.g. `PROJ-123`. Case-insensitive substring match on branch names. |
| `lookback_days` | number | no | Days to look back. Defaults to configured value (default: 1). |

### `get_recent_git_activity`

Returns all commits across all configured repos and branches within the lookback window, with no ticket filter. Good for a general standup summary.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `lookback_days` | number | no | Days to look back. Defaults to configured value (default: 1). |

### `list_configured_repos`

Returns the list of configured repo paths and the default lookback setting. No parameters.

### `add_repository`

Registers a new repository path. Equivalent to `local-git-mcp add <path>`.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `path` | string | yes | Absolute or relative path to a local git repo. |

### `remove_repository`

Unregisters a repository path. Equivalent to `local-git-mcp remove <path>`.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `path` | string | yes | Path to remove. |

## Configuration

Config is stored at `~/.config/local-git-mcp/config.json`:

```json
{
  "repos": ["/absolute/path/to/repo"],
  "defaultLookbackDays": 1
}
```
