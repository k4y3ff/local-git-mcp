import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import * as z from 'zod/v4'
import * as path from 'path'
import { readConfig, addRepo, removeRepo, setLookback } from './config'
import { getActivityForTicket, getRecentActivity, formatActivityResult } from './git'

export async function startServer(): Promise<void> {
  const server = new McpServer({
    name: 'local-git-mcp',
    version: '1.0.0',
  })

  server.registerTool(
    'get_git_activity_for_ticket',
    {
      description:
        'Search configured local git repos for branches matching a Jira ticket ID and return commit history within a lookback period. Useful for generating standup updates.',
      inputSchema: {
        ticket_id: z.string().describe(
          'Jira ticket ID to search for (e.g. "PROJ-123"). Case-insensitive substring match on branch names.'
        ),
        lookback_days: z.number().optional().describe(
          'Number of days to look back for commits. Defaults to the configured default (usually 1).'
        ),
        repos: z.array(z.string()).optional().describe(
          'Limit search to these repository paths. Must be paths already configured in local-git-mcp. Defaults to all configured repos.'
        ),
      },
    },
    async ({ ticket_id, lookback_days, repos }) => {
      const config = readConfig()
      const days = lookback_days ?? config.defaultLookbackDays

      if (config.repos.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: 'No repositories configured. Use the add_repository tool or run `local-git-mcp add <path>` to register a repo.',
          }],
        }
      }

      const targetRepos = repos && repos.length > 0
        ? config.repos.filter(r => repos.includes(r))
        : config.repos

      if (targetRepos.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `None of the specified repos are configured. Use list_configured_repos to see available repositories.`,
          }],
        }
      }

      const result = await getActivityForTicket(ticket_id, days, targetRepos)
      const repoScope = targetRepos.length < config.repos.length
        ? `, ${targetRepos.length} repo${targetRepos.length === 1 ? '' : 's'}`
        : ''
      const header = `Git activity for ${ticket_id} (last ${days} day${days === 1 ? '' : 's'}${repoScope}):`
      return {
        content: [{ type: 'text' as const, text: formatActivityResult(result, header) }],
      }
    }
  )

  server.registerTool(
    'get_recent_git_activity',
    {
      description:
        'Return all git commits across all configured repos and branches within a lookback period, with no ticket ID filter. Useful for a full standup summary.',
      inputSchema: {
        lookback_days: z.number().optional().describe(
          'Number of days to look back for commits. Defaults to the configured default (usually 1).'
        ),
      },
    },
    async ({ lookback_days }) => {
      const config = readConfig()
      const days = lookback_days ?? config.defaultLookbackDays

      if (config.repos.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: 'No repositories configured. Use the add_repository tool or run `local-git-mcp add <path>` to register a repo.',
          }],
        }
      }

      const result = await getRecentActivity(days, config.repos)
      const header = `Recent git activity (last ${days} day${days === 1 ? '' : 's'}):`
      return {
        content: [{ type: 'text' as const, text: formatActivityResult(result, header) }],
      }
    }
  )

  server.registerTool(
    'list_configured_repos',
    {
      description: 'List all git repository paths configured for local-git-mcp.',
    },
    async () => {
      const config = readConfig()
      const text =
        config.repos.length === 0
          ? 'No repositories configured.'
          : `Configured repos (${config.repos.length}):\n${config.repos.map(r => `  - ${r}`).join('\n')}\n\nDefault lookback: ${config.defaultLookbackDays} day(s)`
      return { content: [{ type: 'text' as const, text }] }
    }
  )

  server.registerTool(
    'add_repository',
    {
      description:
        'Register a local git repository path with local-git-mcp so it will be included in future queries.',
      inputSchema: {
        path: z.string().describe('Absolute or relative path to a local git repository directory.'),
      },
    },
    async ({ path: repoPath }) => {
      try {
        const resolved = addRepo(repoPath)
        return {
          content: [{ type: 'text' as const, text: `Added repository: ${resolved}` }],
        }
      } catch (e) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(e as Error).message}` }],
          isError: true,
        }
      }
    }
  )

  server.registerTool(
    'remove_repository',
    {
      description: 'Unregister a local git repository path from local-git-mcp.',
      inputSchema: {
        path: z.string().describe('Absolute or relative path to the repository to remove.'),
      },
    },
    async ({ path: repoPath }) => {
      removeRepo(repoPath)
      return {
        content: [{ type: 'text' as const, text: `Removed repository: ${path.resolve(repoPath)}` }],
      }
    }
  )

  server.registerTool(
    'set_default_lookback',
    {
      description:
        'Set the default lookback period used by get_git_activity_for_ticket and get_recent_git_activity when no lookback_days is specified.',
      inputSchema: {
        days: z.number().int().positive().describe(
          'Number of days to use as the default lookback period. Must be a positive integer.'
        ),
      },
    },
    async ({ days }) => {
      try {
        setLookback(days)
        return {
          content: [{ type: 'text' as const, text: `Default lookback set to ${days} day${days === 1 ? '' : 's'}.` }],
        }
      } catch (e) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(e as Error).message}` }],
          isError: true,
        }
      }
    }
  )

  const transport = new StdioServerTransport()
  await server.connect(transport)
}
