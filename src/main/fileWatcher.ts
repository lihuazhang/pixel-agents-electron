import * as chokidar from 'chokidar'
import * as fs from 'fs'
import * as path from 'path'
import type { TerminalManager, TerminalInstance } from './terminalManager.js'

export class FileWatcher {
  private watchers = new Map<number, chokidar.FSWatcher>()
  private pollingTimers = new Map<number, ReturnType<typeof setInterval>>()
  private fileOffsets = new Map<number, number>()
  private lineBuffers = new Map<number, string>()

  constructor(private terminalManager: TerminalManager) {}

  watch(terminalId: number, jsonlFile: string, onChange: (lines: string[]) => void): void {
    // Ensure directory exists
    const dir = path.dirname(jsonlFile)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    // Initialize state
    this.fileOffsets.set(terminalId, 0)
    this.lineBuffers.set(terminalId, '')

    // Primary: chokidar watch
    const watcher = chokidar.watch(jsonlFile, {
      persistent: false,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 100
      }
    })

    watcher.on('change', () => {
      this.readNewLines(terminalId, jsonlFile, onChange)
    })

    this.watchers.set(terminalId, watcher)

    // Secondary: poll as backup
    const pollTimer = setInterval(() => {
      this.readNewLines(terminalId, jsonlFile, onChange)
    }, 1000)

    this.pollingTimers.set(terminalId, pollTimer)

    // Initial read if file exists
    if (fs.existsSync(jsonlFile)) {
      const stat = fs.statSync(jsonlFile)
      this.fileOffsets.set(terminalId, stat.size)
    }
  }

  readNewLines(terminalId: number, jsonlFile: string, onChange: (lines: string[]) => void): void {
    try {
      if (!fs.existsSync(jsonlFile)) return

      const stat = fs.statSync(jsonlFile)
      const offset = this.fileOffsets.get(terminalId) || 0

      if (stat.size <= offset) return

      const buf = Buffer.alloc(stat.size - offset)
      const fd = fs.openSync(jsonlFile, 'r')
      fs.readSync(fd, buf, 0, buf.length, offset)
      fs.closeSync(fd)

      this.fileOffsets.set(terminalId, stat.size)

      const lineBuffer = this.lineBuffers.get(terminalId) || ''
      const text = lineBuffer + buf.toString('utf-8')
      const lines = text.split('\n')

      // Keep last incomplete line in buffer
      const completeLines = lines.slice(0, -1)
      this.lineBuffers.set(terminalId, lines[lines.length - 1])

      if (completeLines.length > 0) {
        onChange(completeLines)
      }
    } catch (err) {
      console.error(`[FileWatcher] Error reading ${jsonlFile}:`, err)
    }
  }

  unwatch(terminalId: number): void {
    const watcher = this.watchers.get(terminalId)
    if (watcher) {
      watcher.close()
      this.watchers.delete(terminalId)
    }

    const timer = this.pollingTimers.get(terminalId)
    if (timer) {
      clearInterval(timer)
      this.pollingTimers.delete(terminalId)
    }

    this.fileOffsets.delete(terminalId)
    this.lineBuffers.delete(terminalId)
  }

  disposeAll(): void {
    for (const [terminalId] of this.watchers) {
      this.unwatch(terminalId)
    }
  }
}
