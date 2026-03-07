import * as pty from 'node-pty'
import * as path from 'path'
import * as os from 'os'
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
    const ptyProcess = pty.spawn(process.platform === 'win32' ? 'powershell' : 'zsh', [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd
    })

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

  attachExternalTerminal(pid: number, jsonlFile: string): number {
    const id = this.nextId++
    this.terminals.set(id, {
      id,
      pty: null,
      cwd: '',
      sessionId: '',
      jsonlFile,
      agentId: -1
    })
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
    return projectPath.replace(/[:\\/]/g, '-')
  }
}
