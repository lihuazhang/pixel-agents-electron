import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

/**
 * Represents a discovered external Claude session
 */
export interface DiscoveredSession {
  /** Session ID (from JSONL filename or 'default' if no explicit ID) */
  sessionId: string
  /** Path to the JSONL file */
  jsonlFile: string
  /** Project directory path */
  projectDir: string
  /** Workspace path (derived from projectDir) */
  workspacePath: string
  /** Last modification time */
  lastModified: Date
  /** File size in bytes */
  fileSize: number
  /** Whether this is a subagent session */
  isSubagent: boolean
  /** Parent session ID (for subagents) */
  parentSessionId?: string
}

/**
 * Scan for external Claude sessions by looking for JSONL files in ~/.claude/projects/
 *
 * Claude creates JSONL files for each session:
 * - With explicit session ID: <session-id>.jsonl
 * - Without session ID: Uses a generated ID or 'default'
 *
 * This scanner finds all active JSONL files and returns session info.
 */
export function scanExternalSessions(): DiscoveredSession[] {
  const sessions: DiscoveredSession[] = []
  const projectsDir = path.join(os.homedir(), '.claude', 'projects')

  if (!fs.existsSync(projectsDir)) {
    return sessions
  }

  // Scan all project directories
  const projectDirs = fs.readdirSync(projectsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)

  for (const dirName of projectDirs) {
    const projectDir = path.join(projectsDir, dirName)
    const workspacePath = unhashProjectPath(dirName)

    // Scan main session files (directly in projectDir)
    const mainFiles = fs.readdirSync(projectDir, { withFileTypes: true })
      .filter(f => f.isFile() && f.name.endsWith('.jsonl'))
      .map(f => f.name)

    for (const file of mainFiles) {
      const jsonlFile = path.join(projectDir, file)
      const sessionId = path.basename(file, '.jsonl')

      try {
        const stat = fs.statSync(jsonlFile)

        sessions.push({
          sessionId,
          jsonlFile,
          projectDir,
          workspacePath,
          lastModified: stat.mtime,
          fileSize: stat.size,
          isSubagent: false
        })
      } catch (err) {
        console.error(`[SessionScanner] Error reading ${jsonlFile}:`, err)
      }
    }

    // Scan subagent files (in subagents/ subdirectory)
    const subagentsDir = path.join(projectDir, 'subagents')
    if (fs.existsSync(subagentsDir)) {
      const subagentFiles = fs.readdirSync(subagentsDir, { withFileTypes: true })
        .filter(f => f.isFile() && f.name.endsWith('.jsonl'))
        .map(f => f.name)

      for (const file of subagentFiles) {
        const jsonlFile = path.join(subagentsDir, file)
        const sessionId = path.basename(file, '.jsonl')

        // Extract parent session ID from the project directory
        // Parent session is the main session that created this subagent
        const parentSessionId = getParentSessionId(projectDir)

        try {
          const stat = fs.statSync(jsonlFile)

          sessions.push({
            sessionId,
            jsonlFile,
            projectDir,
            workspacePath,
            lastModified: stat.mtime,
            fileSize: stat.size,
            isSubagent: true,
            parentSessionId
          })
        } catch (err) {
          console.error(`[SessionScanner] Error reading subagent ${jsonlFile}:`, err)
        }
      }
    }
  }

  // Sort by last modified (newest first)
  sessions.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime())

  return sessions
}

/**
 * Get the parent session ID from the project directory
 * Looks for the most recently modified main session file
 */
function getParentSessionId(projectDir: string): string | undefined {
  try {
    const files = fs.readdirSync(projectDir, { withFileTypes: true })
      .filter(f => f.isFile() && f.name.endsWith('.jsonl'))
      .map(f => ({
        name: f.name,
        stat: fs.statSync(path.join(projectDir, f.name))
      }))
      .sort((a, b) => b.stat.mtime.getTime() - a.stat.mtime.getTime())

    if (files.length > 0) {
      return path.basename(files[0].name, '.jsonl')
    }
  } catch {
    // Ignore errors
  }
  return undefined
}

/**
 * Check if a session is likely still active (modified within last 5 minutes)
 */
export function isSessionActive(session: DiscoveredSession, maxAgeMs = 5 * 60 * 1000): boolean {
  const now = Date.now()
  const age = now - session.lastModified.getTime()
  return age < maxAgeMs
}

/**
 * Convert project directory hash back to workspace path
 * This is the inverse of hashProjectPath in terminalManager.ts
 *
 * Claude Code uses the following format for project directories:
 * - Leading '-' indicates an absolute path
 * - Path separators are replaced with '-'
 * - Example: '-Users-zhanglihua-code-project' -> '/Users/zhanglihua/code/project'
 */
function unhashProjectPath(dirName: string): string {
  // Handle the leading '-' which indicates an absolute path
  let path = dirName

  // If it starts with '-', it's an absolute path (e.g., '-Users-zhanglihua')
  if (path.startsWith('-')) {
    path = path.substring(1) // Remove leading '-'
  }

  // Handle Windows-style paths (rare on macOS/Linux but possible)
  if (path.includes('-:')) {
    // Likely Windows path with drive letter
    path = path.replace(/-:/g, ':')
  }

  // Replace '-' back to '/' for path separators
  path = path.replace(/-/g, '/')

  // Ensure absolute path starts with '/'
  if (!path.startsWith('/')) {
    path = '/' + path
  }

  return path
}

/**
 * Match a JSONL file to an external session
 * This extracts the session ID from the filename
 */
export function matchSessionFromJsonl(jsonlFile: string): DiscoveredSession | null {
  try {
    const stat = fs.statSync(jsonlFile)
    const projectDir = path.dirname(jsonlFile)
    const fileName = path.basename(jsonlFile)
    const sessionId = path.basename(fileName, '.jsonl')
    const dirName = path.basename(projectDir)

    // Check if this is a subagent (in subagents subdirectory)
    const parentDir = path.basename(path.dirname(projectDir))
    const isSubagent = parentDir === 'subagents'

    // Get the actual project directory (go up one level if subagent)
    const actualProjectDir = isSubagent ? path.dirname(projectDir) : projectDir
    const actualDirName = path.basename(actualProjectDir)
    const workspacePath = unhashProjectPath(actualDirName)

    return {
      sessionId,
      jsonlFile,
      projectDir: actualProjectDir,
      workspacePath,
      lastModified: stat.mtime,
      fileSize: stat.size,
      isSubagent
    }
  } catch (err) {
    return null
  }
}

/**
 * Continuously monitor for new external sessions
 */
export class SessionMonitor {
  private intervalId: ReturnType<typeof setInterval> | null = null
  private knownSessions = new Set<string>()
  private onNewSession: ((session: DiscoveredSession) => void) | null = null

  constructor(private pollIntervalMs = 5000) {}

  start(onNewSession: (session: DiscoveredSession) => void): void {
    this.onNewSession = onNewSession

    // Initialize with only active existing sessions
    // This allows inactive sessions to be detected later when they become active
    const existing = scanExternalSessions()
    for (const session of existing) {
      if (isSessionActive(session)) {
        this.knownSessions.add(session.jsonlFile)
      }
    }

    // Start polling
    this.intervalId = setInterval(() => {
      this.checkForNewSessions()
    }, this.pollIntervalMs)
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  private checkForNewSessions(): void {
    const sessions = scanExternalSessions()

    for (const session of sessions) {
      // Only track and notify for active sessions
      if (isSessionActive(session) && !this.knownSessions.has(session.jsonlFile)) {
        this.knownSessions.add(session.jsonlFile)
        console.log(`[SessionMonitor] New session detected: ${session.sessionId} in ${session.workspacePath}`)
        this.onNewSession?.(session)
      }
    }
  }

  /**
   * Manually add a known session (e.g., from attachExternalTerminal)
   */
  addKnownSession(jsonlFile: string): void {
    this.knownSessions.add(jsonlFile)
  }
}
