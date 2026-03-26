import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

export interface Config {
  repos: string[]
  defaultLookbackDays: number
}

const DEFAULT_CONFIG: Config = {
  repos: [],
  defaultLookbackDays: 1,
}

function getConfigDir(): string {
  return path.join(os.homedir(), '.config', 'local-git-mcp')
}

function getConfigPath(): string {
  return path.join(getConfigDir(), 'config.json')
}

export function getPidPath(): string {
  return path.join(getConfigDir(), 'server.pid')
}

export function readConfig(): Config {
  const configPath = getConfigPath()
  if (!fs.existsSync(configPath)) {
    return { ...DEFAULT_CONFIG }
  }
  try {
    const raw = fs.readFileSync(configPath, 'utf8')
    return JSON.parse(raw) as Config
  } catch (e) {
    throw new Error(`Failed to parse config at ${configPath}: ${(e as Error).message}`)
  }
}

export function writeConfig(config: Config): void {
  const configDir = getConfigDir()
  fs.mkdirSync(configDir, { recursive: true })
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2) + '\n', 'utf8')
}

export function addRepo(repoPath: string): string {
  const resolved = path.resolve(repoPath)
  if (!fs.existsSync(resolved)) {
    throw new Error(`Path does not exist: ${resolved}`)
  }
  if (!fs.statSync(resolved).isDirectory()) {
    throw new Error(`Path is not a directory: ${resolved}`)
  }
  const config = readConfig()
  if (!config.repos.includes(resolved)) {
    config.repos.push(resolved)
    writeConfig(config)
  }
  return resolved
}

export function removeRepo(repoPath: string): void {
  const resolved = path.resolve(repoPath)
  const config = readConfig()
  config.repos = config.repos.filter(r => r !== resolved)
  writeConfig(config)
}

export function setLookback(days: number): void {
  if (!Number.isInteger(days) || days < 1) {
    throw new Error(`days must be a positive integer, got: ${days}`)
  }
  const config = readConfig()
  config.defaultLookbackDays = days
  writeConfig(config)
}
