import simpleGit from 'simple-git'

export interface CommitInfo {
  hash: string
  author: string
  date: string
  message: string
}

export interface BranchResult {
  repo: string
  branch: string
  commits: CommitInfo[]
}

export interface GitActivityResult {
  results: BranchResult[]
  errors: Array<{ repo: string; error: string }>
}

const FIELD_SEP = '\x1f'
const RECORD_SEP = '\x1e'

function parseCommits(raw: string): CommitInfo[] {
  return raw
    .split(RECORD_SEP)
    .map(record => record.trim())
    .filter(record => record.length > 0)
    .map(record => {
      const parts = record.split(FIELD_SEP)
      const hash = parts[0]?.trim() ?? ''
      const author = parts[1]?.trim() ?? ''
      const date = parts[2]?.trim() ?? ''
      const subject = parts[3]?.trim() ?? ''
      const body = parts.slice(4).join(FIELD_SEP).trim()
      const message = body ? `${subject}\n\n${body}` : subject
      return { hash, author, date, message }
    })
    .filter(c => c.hash.length > 0)
}

async function getCommitsForBranch(
  sg: ReturnType<typeof simpleGit>,
  branch: string,
  sinceIso: string
): Promise<CommitInfo[]> {
  const raw = await sg.raw([
    'log',
    branch,
    `--after=${sinceIso}`,
    `--format=%h${FIELD_SEP}%an${FIELD_SEP}%aI${FIELD_SEP}%s${FIELD_SEP}%b${RECORD_SEP}`,
    '--',
  ])
  return parseCommits(raw)
}

async function getBranchesForRepo(
  sg: ReturnType<typeof simpleGit>,
  ticketId?: string
): Promise<string[]> {
  const raw = await sg.raw(['branch', '--format=%(refname:short)'])
  const branches = raw
    .split('\n')
    .map(b => b.trim())
    .filter(b => b.length > 0)

  if (!ticketId) return branches

  const lower = ticketId.toLowerCase()
  return branches.filter(b => b.toLowerCase().includes(lower))
}

export async function getActivityForTicket(
  ticketId: string,
  lookbackDays: number,
  repoPaths: string[]
): Promise<GitActivityResult> {
  const sinceIso = new Date(Date.now() - lookbackDays * 86400_000).toISOString()
  const results: BranchResult[] = []
  const errors: Array<{ repo: string; error: string }> = []

  for (const repoPath of repoPaths) {
    try {
      const sg = simpleGit(repoPath)
      const branches = await getBranchesForRepo(sg, ticketId)
      const seenHashes = new Set<string>()

      for (const branch of branches) {
        const commits = (await getCommitsForBranch(sg, branch, sinceIso)).filter(c => {
          if (seenHashes.has(c.hash)) return false
          seenHashes.add(c.hash)
          return true
        })
        results.push({ repo: repoPath, branch, commits })
      }
    } catch (e) {
      errors.push({ repo: repoPath, error: (e as Error).message })
    }
  }

  return { results, errors }
}

export async function getRecentActivity(
  lookbackDays: number,
  repoPaths: string[]
): Promise<GitActivityResult> {
  const sinceIso = new Date(Date.now() - lookbackDays * 86400_000).toISOString()
  const results: BranchResult[] = []
  const errors: Array<{ repo: string; error: string }> = []

  for (const repoPath of repoPaths) {
    try {
      const sg = simpleGit(repoPath)
      const branches = await getBranchesForRepo(sg)
      const seenHashes = new Set<string>()

      for (const branch of branches) {
        const commits = (await getCommitsForBranch(sg, branch, sinceIso)).filter(c => {
          if (seenHashes.has(c.hash)) return false
          seenHashes.add(c.hash)
          return true
        })
        if (commits.length > 0) {
          results.push({ repo: repoPath, branch, commits })
        }
      }
    } catch (e) {
      errors.push({ repo: repoPath, error: (e as Error).message })
    }
  }

  return { results, errors }
}

export function formatActivityResult(
  result: GitActivityResult,
  header: string
): string {
  const lines: string[] = [header, '']

  if (result.results.length === 0 && result.errors.length === 0) {
    lines.push('No matching branches found.')
    return lines.join('\n')
  }

  const byRepo = new Map<string, BranchResult[]>()
  for (const br of result.results) {
    const list = byRepo.get(br.repo) ?? []
    list.push(br)
    byRepo.set(br.repo, list)
  }

  for (const [repo, branches] of byRepo) {
    lines.push(`Repo: ${repo}`)
    const withCommits = branches.filter(b => b.commits.length > 0)
    const withoutCommits = branches.filter(b => b.commits.length === 0)

    if (withCommits.length === 0 && withoutCommits.length > 0) {
      const names = withoutCommits.map(b => b.branch).join(', ')
      lines.push(`  Matching branches with no commits in window: ${names}`)
    }

    for (const br of withCommits) {
      lines.push(`  Branch: ${br.branch}`)
      for (const commit of br.commits) {
        const shortDate = commit.date.replace('T', ' ').replace(/\.\d+[+-]\d+:\d+$/, '').replace('Z', ' UTC')
        lines.push(`    ${commit.hash} | ${shortDate} | ${commit.author}`)
        const msgLines = commit.message.split('\n')
        for (const ml of msgLines) {
          lines.push(`      ${ml}`)
        }
      }
    }
    lines.push('')
  }

  if (result.errors.length > 0) {
    lines.push('Errors:')
    for (const err of result.errors) {
      lines.push(`  ${err.repo}: ${err.error}`)
    }
  }

  return lines.join('\n').trimEnd()
}
