import { Command } from 'commander'
import * as fs from 'fs'
import * as path from 'path'
import { readConfig, addRepo, removeRepo, setLookback, getPidPath } from './config'
import { startServer } from './server'

const program = new Command()

program
  .name('local-git-mcp')
  .description('Local MCP server for querying git activity by Jira ticket ID')
  .version('1.0.0')

program
  .command('add <repoPath>')
  .description('Register a local git repository')
  .action((repoPath: string) => {
    try {
      const resolved = addRepo(repoPath)
      console.log(`Added: ${resolved}`)
    } catch (e) {
      console.error(`Error: ${(e as Error).message}`)
      process.exit(1)
    }
  })

program
  .command('remove <repoPath>')
  .description('Unregister a local git repository')
  .action((repoPath: string) => {
    removeRepo(repoPath)
    console.log(`Removed: ${path.resolve(repoPath)}`)
  })

program
  .command('list')
  .description('List all configured repositories')
  .action(() => {
    const config = readConfig()
    if (config.repos.length === 0) {
      console.log('No repositories configured.')
    } else {
      config.repos.forEach(r => console.log(r))
    }
  })

program
  .command('status')
  .description('Show full configuration summary')
  .action(() => {
    const config = readConfig()
    console.log(`Default lookback: ${config.defaultLookbackDays} day(s)`)
    console.log(`Repos (${config.repos.length}):`)
    config.repos.forEach(r => console.log(`  ${r}`))
  })

program
  .command('set-lookback <days>')
  .description('Set the default lookback period in days')
  .action((daysStr: string) => {
    const days = parseInt(daysStr, 10)
    if (isNaN(days) || days < 1) {
      console.error('Error: days must be a positive integer')
      process.exit(1)
    }
    try {
      setLookback(days)
      console.log(`Default lookback set to ${days} day(s)`)
    } catch (e) {
      console.error(`Error: ${(e as Error).message}`)
      process.exit(1)
    }
  })

program
  .command('serve')
  .description('Start the MCP stdio server')
  .action(async () => {
    const pidPath = getPidPath()

    // Write PID file
    const { mkdirSync, writeFileSync, unlinkSync } = fs
    mkdirSync(path.dirname(pidPath), { recursive: true })
    writeFileSync(pidPath, String(process.pid), 'utf8')

    const cleanup = () => {
      try { unlinkSync(pidPath) } catch { /* already gone */ }
    }

    process.on('SIGINT', () => { cleanup(); process.exit(0) })
    process.on('SIGTERM', () => { cleanup(); process.exit(0) })
    process.on('exit', cleanup)

    try {
      await startServer()
    } catch (e) {
      console.error(`Server error: ${(e as Error).message}`)
      cleanup()
      process.exit(1)
    }
  })

program
  .command('stop')
  .description('Stop the running MCP server')
  .action(() => {
    const pidPath = getPidPath()
    if (!fs.existsSync(pidPath)) {
      console.error('No running server found (no PID file at ' + pidPath + ')')
      process.exit(1)
    }
    const pid = parseInt(fs.readFileSync(pidPath, 'utf8').trim(), 10)
    if (isNaN(pid)) {
      console.error('PID file is corrupt')
      process.exit(1)
    }
    try {
      process.kill(pid, 'SIGTERM')
      fs.unlinkSync(pidPath)
      console.log(`Stopped server (PID ${pid})`)
    } catch (e) {
      const err = e as NodeJS.ErrnoException
      if (err.code === 'ESRCH') {
        // Process already gone; clean up stale PID file
        fs.unlinkSync(pidPath)
        console.log(`Server was not running (stale PID ${pid} removed)`)
      } else {
        console.error(`Failed to stop server: ${err.message}`)
        process.exit(1)
      }
    }
  })

program.parseAsync(process.argv).catch(e => {
  console.error(e)
  process.exit(1)
})
