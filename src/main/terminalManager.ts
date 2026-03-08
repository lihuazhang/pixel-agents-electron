import * as pty from 'node-pty'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import { app } from 'electron'
import * as crypto from 'crypto'

export interface TerminalInstance {
  id: number
  pty: pty.IPty | null
  cwd: string
  sessionId: string
  jsonlFile: string
  agentId: number
  process?: pty.IPty
}

export class TerminalManager {
  private terminals = new Map<number, TerminalInstance>()
  private nextId = 1

  createTerminal(cwd: string): number {
    const id = this.nextId++

    // Determine shell path based on platform with robust fallbacks
    let shell: string
    if (process.platform === 'win32') {
      shell = 'powershell.exe'
    } else {
      // Try SHELL env var first, then fallback to common shells
      const shellEnv = process.env.SHELL
      if (shellEnv && fs.existsSync(shellEnv)) {
        shell = shellEnv
      } else if (fs.existsSync('/bin/zsh')) {
        shell = '/bin/zsh'
      } else if (fs.existsSync('/bin/bash')) {
        shell = '/bin/bash'
      } else if (fs.existsSync('/bin/sh')) {
        shell = '/bin/sh'
      } else {
        shell = '/bin/zsh' // Ultimate fallback, will throw if doesn't exist
      }
    }

    // Verify shell exists before spawning
    if (!fs.existsSync(shell)) {
      throw new Error(`Shell not found: ${shell}. SHELL=${process.env.SHELL}`)
    }

    let ptyProcess: pty.IPty
    try {
      ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd,
        env: {
          ...process.env,
          TERM: 'xterm-256color'
        }
      })
    } catch (err) {
      console.error('[TerminalManager] Failed to spawn pty:', err)
      throw new Error(`Failed to spawn terminal: ${err instanceof Error ? err.message : String(err)}`)
    }

    const sessionId = this.generateSessionId()
    const jsonlFile = this.getJsonlPath(sessionId, cwd)

    // Launch Claude
    ptyProcess.write(`claude --session-id ${sessionId}\r`)

    this.terminals.set(id, {
      id,
      pty: ptyProcess,
      cwd,
      sessionId,
      jsonlFile,
      agentId: -1,
      process: ptyProcess
    })

    return id
  }

  attachExternalTerminal(pid: number, jsonlFile: string, cwd?: string, sessionId?: string): number {
    const id = this.nextId++
    const extractedSessionId = sessionId || path.basename(jsonlFile, '.jsonl')
    const extractedCwd = cwd || this.inferCwdFromJsonlPath(jsonlFile)

    this.terminals.set(id, {
      id,
      pty: null,
      cwd: extractedCwd,
      sessionId: extractedSessionId,
      jsonlFile,
      agentId: -1
    })

    console.log(`[TerminalManager] Attached external terminal ${id}: session=${extractedSessionId}, cwd=${extractedCwd}`)
    return id
  }

  launchClaude(terminalId: number): void {
    const terminal = this.terminals.get(terminalId)
    if (!terminal || !terminal.process) return

    const sessionId = this.generateSessionId()
    terminal.sessionId = sessionId
    terminal.jsonlFile = this.getJsonlPath(sessionId, terminal.cwd)

    terminal.process.write(`claude --session-id ${sessionId}\r`)
  }

  focusTerminal(terminalId: number): void {
    // For embedded terminal, this would bring it to focus
    // For now, just log
    console.log(`[TerminalManager] Focus terminal ${terminalId}`)
  }

  disposeTerminal(terminalId: number): void {
    const terminal = this.terminals.get(terminalId)
    if (!terminal) return

    if (terminal.process) {
      terminal.process.kill()
    }

    this.terminals.delete(terminalId)
  }

  disposeAll(): void {
    for (const terminal of this.terminals.values()) {
      if (terminal.process) {
        terminal.process.kill()
      }
    }
    this.terminals.clear()
  }

  getTerminal(terminalId: number): TerminalInstance | undefined {
    return this.terminals.get(terminalId)
  }

  getAllTerminals(): TerminalInstance[] {
    return Array.from(this.terminals.values())
  }

  private generateSessionId(): string {
    // Use Node.js crypto module for reliable UUID generation in Electron
    return crypto.randomUUID()
  }

  private getJsonlPath(sessionId: string, cwd: string): string {
    const projectHash = this.hashProjectPath(cwd)
    const projectDir = path.join(os.homedir(), '.claude', 'projects', projectHash)
    return path.join(projectDir, `${sessionId}.jsonl`)
  }

  private hashProjectPath(projectPath: string): string {
    // Match Claude Code's format: leading '-' for absolute paths
    // Replace path separators and special chars with '-'
    const sanitized = projectPath.replace(/[:\\]/g, '-')
    if (sanitized.startsWith('/')) {
      return '-' + sanitized.substring(1).replace(/\//g, '-').replace(/-$/, '')
    }
    return sanitized.replace(/\//g, '-')
  }

  /**
   * Infer the working directory from a JSONL file path
   * JSONL files are stored at ~/.claude/projects/<project-hash>/<session-id>.jsonl
   */
  private inferCwdFromJsonlPath(jsonlFile: string): string {
    try {
      const projectsDir = path.join(os.homedir(), '.claude', 'projects')
      const relativePath = path.relative(projectsDir, jsonlFile)
      const parts = relativePath.split(path.sep)

      if (parts.length >= 2) {
        const projectHash = parts[0]
        // Try to reverse the hash back to a path
        return this.unhashProjectPath(projectHash)
      }
    } catch (err) {
      console.error('[TerminalManager] Error inferring cwd:', err)
    }
    return ''
  }

  /**
   * Reverse the project path hash (best effort)
   * Handles Claude Code's format where leading '-' indicates absolute path
   */
  private unhashProjectPath(dirName: string): string {
    // Handle the leading '-' which indicates an absolute path
    if (dirName.startsWith('-')) {
      return dirName.substring(1).replace(/-/g, '/')
    }
    // For paths without leading '-', just replace - with /
    const result = dirName.replace(/-/g, '/')
    return result.startsWith('/') ? result : '/' + result
  }
}
