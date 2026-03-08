import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import { TerminalManager } from './terminalManager.js'
import { FileWatcher } from './fileWatcher.js'
import { AssetLoader } from './assetLoader.js'
import { LayoutPersistence } from './layoutPersistence.js'
import { SessionMonitor, scanExternalSessions, isSessionActive, type DiscoveredSession } from './sessionScanner.js'
import type { AgentState } from './types.js'
import {
  processTranscriptLine,
  PERMISSION_EXEMPT_TOOLS,
} from './transcriptParser.js'
import {
  cancelWaitingTimer,
  startWaitingTimer,
  cancelPermissionTimer,
  startPermissionTimer,
  clearAgentActivity,
} from './timerManager.js'
import {
  createAgentState,
  removeAgent,
  persistAgents,
  restoreAgents,
  sendExistingAgents,
  startPollingJsonl,
  processJsonlLinesFactory,
} from './agentManager.js'

// Disable GPU hardware acceleration and sandboxing for stability
app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('disable-gpu-compositing')
app.commandLine.appendSwitch('disable-software-rasterizer')
app.commandLine.appendSwitch('no-sandbox')
app.commandLine.appendSwitch('disable-dev-shm-usage')

let mainWindow: BrowserWindow | null = null
let terminalManager: TerminalManager
let fileWatcher: FileWatcher
let assetLoader: AssetLoader
let layoutPersistence: LayoutPersistence
let sessionMonitor: SessionMonitor | null = null

// Agent state management
const agents = new Map<number, AgentState>()
const waitingTimers = new Map<number, ReturnType<typeof setTimeout>>()
const permissionTimers = new Map<number, ReturnType<typeof setTimeout>>()
const jsonlPollTimers = new Map<number, ReturnType<typeof setInterval>>()
let nextAgentId = 1

// Track external sessions we've already attached to
const attachedExternalSessions = new Set<string>()

// Settings path
const SETTINGS_DIR = path.join(os.homedir(), '.pixel-agents-electron')
const AGENTS_SETTINGS_PATH = path.join(SETTINGS_DIR, 'agents.json')

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    backgroundColor: '#1e1e2e',
    show: false,
    frame: true,
    titleBarStyle: 'default'
  })

  // Load renderer
  if (process.env.NODE_ENV === 'development' && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    // Use absolute path from main process location (dist/main -> ../dist/renderer)
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// Initialize managers
function initializeManagers() {
  terminalManager = new TerminalManager()
  fileWatcher = new FileWatcher(terminalManager)
  assetLoader = new AssetLoader()
  layoutPersistence = new LayoutPersistence()

  // Ensure settings directory exists
  if (!fs.existsSync(SETTINGS_DIR)) {
    fs.mkdirSync(SETTINGS_DIR, { recursive: true })
  }
}

// IPC Handlers - shared for renderer-to-main and main-to-renderer
let mainWindowEvent: Electron.WebContents | null = null

// Helper function to send messages to renderer
function sendToRenderer(type: string, payload?: unknown) {
  if (mainWindowEvent) {
    mainWindowEvent.send('main-to-renderer', { type, payload })
  }
}

// Create processJsonlLines function with closure
let processJsonlLines: (agentId: number, lines: string[]) => void

function setupIpcHandlers() {
  // Initialize processJsonlLines with closure
  processJsonlLines = processJsonlLinesFactory(agents, waitingTimers, permissionTimers, sendToRenderer)

  // Handle renderer-to-main IPC
  ipcMain.on('renderer-to-main', (event, { type, payload }) => {
    // Store webContents for sending messages back to renderer
    if (!mainWindowEvent) {
      mainWindowEvent = event.sender
    }

    console.log(`[Main] Received IPC: ${type}`, payload)

    // Dispatch to specific handlers
    switch (type) {
      case 'webviewReady':
        console.log('[Main] Webview ready')
        sendAssetsToRenderer(event)
        // Restore agents from previous session
        restoreAgentsOnStartup()
        // Scan for and attach to existing external sessions
        scanAndAttachExternalSessions()
        // Start monitoring for new external sessions
        initializeSessionMonitoring()
        break
      case 'openClaude': {
        // Legacy message from original webview - create new terminal
        console.log('[Main] Creating new terminal (openClaude)')
        const cwd = app.getPath('home')
        const terminalId = terminalManager.createTerminal(cwd)
        const terminal = terminalManager.getTerminal(terminalId)

        if (terminal) {
          console.log(`[Main] Terminal ${terminalId} created with session: ${terminal.sessionId}`)
          console.log(`[Main] JSONL file: ${terminal.jsonlFile}`)

          // Create agent state
          const projectDir = getProjectDirPath(cwd)
          if (!projectDir) {
            console.log('[Main] No project dir, cannot track agent')
            break
          }

          const agentId = nextAgentId++
          const agent = createAgentState(agentId, terminalId, projectDir, terminal.sessionId)
          agents.set(agentId, agent)

          // Start file watching for JSONL file
          fileWatcher.watch(terminalId, terminal.jsonlFile, (lines: string[]) => {
            console.log(`[Main] Terminal ${terminalId}: Read ${lines.length} new lines from JSONL`)
            processJsonlLines(agentId, lines)
          })

          // Notify renderer that agent was created (legacy openClaude)
          sendToRenderer('agentCreated', {
            id: agentId,
            terminalId,
            sessionId: terminal.sessionId,
            jsonlFile: terminal.jsonlFile
          })
        }
        break
      }
      case 'createTerminal': {
        // Handled by ipcMain.handle below
        break
      }
      case 'saveAgentSeats': {
        // Handled by ipcMain.handle - just acknowledge here
        break
      }
      default:
        console.log(`[Main] Unhandled IPC type: ${type}`)
    }
  })

  // Handle invoke calls
  ipcMain.handle('renderer-to-main', async (event, { type, payload }) => {
    console.log(`[Main] Handle IPC: ${type}`, payload)

    switch (type) {
      case 'createTerminal': {
        const cwd = payload?.cwd as string | undefined
        const terminalId = terminalManager.createTerminal(cwd || app.getPath('home'))
        terminalManager.launchClaude(terminalId)

        // Create agent state
        const terminal = terminalManager.getTerminal(terminalId)
        if (terminal) {
          const projectDir = getProjectDirPath(terminal.cwd)
          if (!projectDir) {
            console.log('[Main] No project dir, cannot track agent')
            return { terminalId }
          }

          const agentId = nextAgentId++
          const agent = createAgentState(agentId, terminalId, projectDir, terminal.sessionId)
          agents.set(agentId, agent)

          // Start file watching for JSONL file
          fileWatcher.watch(terminalId, terminal.jsonlFile, (lines: string[]) => {
            console.log(`[Main] Terminal ${terminalId}: Read ${lines.length} new lines from JSONL`)
            processJsonlLines(agentId, lines)
          })

          // Notify renderer that agent was created
          sendToRenderer('agentCreated', {
            id: agentId,
            terminalId,
            sessionId: terminal.sessionId,
            jsonlFile: terminal.jsonlFile
          })

          // Persist agents
          persistAgents(agents, AGENTS_SETTINGS_PATH)
        }

        return { terminalId }
      }

      case 'focusTerminal': {
        const terminalId = payload?.terminalId as number
        terminalManager.focusTerminal(terminalId)
        return { success: true }
      }

      case 'closeTerminal': {
        const terminalId = payload?.terminalId as number
        const agent = agents.get(terminalId)
        if (agent) {
          // Cancel timers
          cancelWaitingTimer(terminalId, waitingTimers)
          cancelPermissionTimer(terminalId, permissionTimers)

          // Stop file watcher
          fileWatcher.unwatch(terminalId)

          // Stop JSONL poll timer
          const pollTimer = jsonlPollTimers.get(terminalId)
          if (pollTimer) {
            clearInterval(pollTimer)
          }
          jsonlPollTimers.delete(terminalId)

          // Remove agent
          agents.delete(terminalId)
          persistAgents(agents, AGENTS_SETTINGS_PATH)

          // Notify renderer
          sendToRenderer('agentClosed', { id: terminalId })
        }
        terminalManager.disposeTerminal(terminalId)
        return { success: true }
      }

      case 'attachExternalTerminal': {
        const pid = payload?.pid as number
        const jsonlFile = payload?.jsonlFile as string
        const result = attachExternalSession(jsonlFile, pid)
        return result
      }

      case 'saveLayout': {
        const layout = payload as Record<string, unknown>
        return layoutPersistence.saveLayout(layout)
      }

      case 'loadLayout': {
        return layoutPersistence.loadLayout()
      }

      case 'exportLayout': {
        const layout = layoutPersistence.loadLayout()
        if (!layout) {
          return { success: false, error: 'No layout to export' }
        }

        const result = await dialog.showSaveDialog(mainWindow!, {
          defaultPath: path.join(app.getPath('home'), 'pixel-agents-layout.json'),
          filters: [{ name: 'JSON', extensions: ['json'] }]
        })

        if (result.filePath) {
          const fs = await import('fs')
          fs.writeFileSync(result.filePath, JSON.stringify(layout, null, 2), 'utf-8')
          return { success: true }
        }

        return { success: false, cancelled: true }
      }

      case 'importLayout': {
        const result = await dialog.showOpenDialog(mainWindow!, {
          filters: [{ name: 'JSON', extensions: ['json'] }]
        })

        if (result.canceled || result.filePaths.length === 0) {
          return { success: false, cancelled: true }
        }

        const fs = await import('fs')
        try {
          const imported = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf-8'))
          if (imported.version !== 1 || !Array.isArray(imported.tiles)) {
            return { success: false, error: 'Invalid layout file' }
          }
          await layoutPersistence.saveLayout(imported)
          return { success: true, layout: imported }
        } catch (err) {
          return { success: false, error: 'Failed to read layout' }
        }
      }

      case 'selectFolder': {
        const result = await dialog.showOpenDialog(mainWindow!, {
          properties: ['openDirectory']
        })

        if (result.canceled || result.filePaths.length === 0) {
          return null
        }

        return result.filePaths[0]
      }

      case 'openSessionsFolder': {
        const projectsPath = path.join(os.homedir(), '.claude', 'projects')
        if (!fs.existsSync(projectsPath)) {
          fs.mkdirSync(projectsPath, { recursive: true })
        }
        await shell.openPath(projectsPath)
        return { success: true }
      }

      case 'workspaceFolders': {
        // Send workspace folders to renderer
        const home = app.getPath('home')
        const folders = [{
          name: path.basename(home) || 'home',
          path: home
        }]
        sendToRenderer('workspaceFolders', { folders })
        return null
      }

      case 'setSoundEnabled': {
        const enabled = payload?.enabled as boolean
        // Save sound setting to a settings file
        try {
          const settingsDir = path.join(os.homedir(), '.pixel-agents-electron')
          if (!fs.existsSync(settingsDir)) {
            fs.mkdirSync(settingsDir, { recursive: true })
          }
          const settingsPath = path.join(settingsDir, 'settings.json')
          const settings: Record<string, unknown> = {}
          if (fs.existsSync(settingsPath)) {
            Object.assign(settings, JSON.parse(fs.readFileSync(settingsPath, 'utf-8')))
          }
          settings.soundEnabled = enabled
          fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
        } catch (err) {
          console.error('[Main] Failed to save sound setting:', err)
        }
        return { success: true }
      }

      case 'saveAgentSeats': {
        const seats = payload?.seats as Record<number, { palette: number; hueShift: number; seatId: string | null }>
        // Agent seats are saved as part of the layout, handled by saveLayout
        // This handler acknowledges the message
        return { success: true }
      }

      default:
        console.log(`[Main] Unhandled handle type: ${type}`)
        return null
    }
  })
}

function getProjectDirPath(cwd?: string): string | null {
  const workspacePath = cwd || os.homedir()
  if (!workspacePath) return null
  // Match Claude Code's hash format: leading '-' for absolute paths
  // Replace path separators and special chars with '-'
  const sanitized = workspacePath.replace(/[:\\]/g, '-')
  const dirName = sanitized.startsWith('/')
    ? '-' + sanitized.substring(1).replace(/\//g, '-').replace(/-$/, '')
    : sanitized.replace(/\//g, '-')
  const projectDir = path.join(os.homedir(), '.claude', 'projects', dirName)
  console.log(`[Pixel Agents] Project dir: ${workspacePath} → ${dirName}`)
  return projectDir
}

/**
 * Reverse the project path hash to get workspace path
 * Handles Claude Code's format where leading '-' indicates absolute path
 */
function unhashProjectPath(dirName: string): string {
  if (dirName.startsWith('-')) {
    return dirName.substring(1).replace(/-/g, '/')
  }
  const result = dirName.replace(/-/g, '/')
  return result.startsWith('/') ? result : '/' + result
}

/**
 * Attach to an external Claude session discovered via JSONL file
 */
function attachExternalSession(jsonlFile: string, pid?: number, isSubagent: boolean = false): { terminalId: number; agentId: number } | null {
  // Check if we've already attached to this session
  if (attachedExternalSessions.has(jsonlFile)) {
    console.log(`[Main] Already attached to external session: ${jsonlFile}`)
    return null
  }

  // Verify the file exists
  if (!fs.existsSync(jsonlFile)) {
    console.log(`[Main] External session file does not exist: ${jsonlFile}`)
    return null
  }

  // Detect if this is a subagent session from the path
  // Subagent files are in: ~/.claude/projects/<project>/<session>/subagents/agent-<id>.jsonl
  const parentDir = path.basename(path.dirname(jsonlFile))
  isSubagent = isSubagent || parentDir === 'subagents'

  // Create terminal for external session
  const terminalId = terminalManager.attachExternalTerminal(pid || 0, jsonlFile)

  // Get the actual project directory
  // For subagents: go up two levels (subagents/ -> session dir/)
  // For main sessions: go up one level
  const actualProjectDir = isSubagent
    ? path.dirname(path.dirname(jsonlFile))
    : path.dirname(jsonlFile)
  const sessionId = path.basename(jsonlFile, '.jsonl')

  // Extract folder name from project directory
  // Project dir is like: ~/.claude/projects/-Users-zhanglihua-code-project/<session-id>
  const grandparentDir = path.dirname(actualProjectDir)
  const projectDirName = path.basename(grandparentDir)
  const workspacePath = unhashProjectPath(projectDirName)
  const folderName = path.basename(workspacePath) || 'workspace'

  // Create agent state with folder name and subagent flag
  const agentId = nextAgentId++
  const agent = createAgentState(agentId, terminalId, actualProjectDir, sessionId, folderName, isSubagent)
  agents.set(agentId, agent)

  // Mark as attached
  attachedExternalSessions.add(jsonlFile)
  sessionMonitor?.addKnownSession(jsonlFile)

  // Start file watching
  fileWatcher.watch(terminalId, jsonlFile, (lines: string[]) => {
    console.log(`[Main] External terminal ${terminalId}: Read ${lines.length} new lines from JSONL`)
    processJsonlLines(agentId, lines)
  })

  // Notify renderer with folder name and subagent status
  sendToRenderer('agentCreated', {
    id: agentId,
    sessionId,
    jsonlFile,
    folderName,
    isSubagent
  })

  console.log(`[Main] Attached to external ${isSubagent ? 'subagent' : 'session'}: ${sessionId} (agent ${agentId}) in ${folderName}`)

  // Persist agents
  persistAgents(agents, AGENTS_SETTINGS_PATH)

  return { terminalId, agentId }
}

/**
 * Scan for existing external sessions and attach to them
 * Only attach to recently active sessions (modified within last 5 minutes)
 */
function scanAndAttachExternalSessions(): void {
  console.log('[Main] Scanning for external Claude sessions...')

  const sessions = scanExternalSessions()
  console.log(`[Main] Found ${sessions.length} external session(s)`)

  // Filter: only recently active sessions (modified within 5 minutes)
  // This prevents loading all historical sessions
  const activeSessions = sessions.filter(s => isSessionActive(s))
  console.log(`[Main] Active sessions (last 5 min): ${activeSessions.length}`)

  // Filter out sessions we've already attached to
  const newSessions = activeSessions.filter(s => !attachedExternalSessions.has(s.jsonlFile))

  for (const session of newSessions) {
    console.log(`[Main] Attaching to external ${session.isSubagent ? 'subagent' : 'session'}: ${session.sessionId} (${session.workspacePath})`)
    attachExternalSession(session.jsonlFile, undefined, session.isSubagent)
  }
}

/**
 * Initialize session monitoring for new external sessions
 */
function initializeSessionMonitoring(): void {
  sessionMonitor = new SessionMonitor(5000) // Check every 5 seconds

  sessionMonitor.start((session: DiscoveredSession) => {
    console.log(`[Main] New external ${session.isSubagent ? 'subagent' : 'session'} detected: ${session.sessionId}`)
    attachExternalSession(session.jsonlFile, undefined, session.isSubagent)
  })

  console.log('[Main] Session monitoring started')
}

function restoreAgentsOnStartup() {
  // Only restore agents with active JSONL files (modified within last 5 minutes)
  // This prevents loading all historically saved sessions
  if (fs.existsSync(AGENTS_SETTINGS_PATH)) {
    try {
      const persisted = JSON.parse(fs.readFileSync(AGENTS_SETTINGS_PATH, 'utf-8')) as Array<{
        id: number
        terminalId: number
        jsonlFile: string
        projectDir: string
        folderName?: string
      }>

      // Filter to only active sessions
      const activePersisted = persisted.filter(p => {
        if (!fs.existsSync(p.jsonlFile)) return false
        try {
          const stat = fs.statSync(p.jsonlFile)
          const age = Date.now() - stat.mtime.getTime()
          return age < 5 * 60 * 1000 // 5 minutes
        } catch {
          return false
        }
      })

      console.log(`[Main] Persisted agents: ${persisted.length}, Active: ${activePersisted.length}`)

      // Write back only active agents
      fs.writeFileSync(AGENTS_SETTINGS_PATH, JSON.stringify(activePersisted, null, 2), 'utf-8')

      // Restore active agents
      for (const p of activePersisted) {
        const agent = {
          id: p.id,
          terminalId: p.terminalId,
          projectDir: p.projectDir,
          jsonlFile: p.jsonlFile,
          fileOffset: 0,
          lineBuffer: '',
          activeToolIds: new Set(),
          activeToolStatuses: new Map(),
          activeToolNames: new Map(),
          activeSubagentToolIds: new Map(),
          activeSubagentToolNames: new Map(),
          isWaiting: false,
          permissionSent: false,
          hadToolsInTurn: false,
          folderName: p.folderName,
        }

        agents.set(p.id, agent)
        console.log(`[Pixel Agents] Restored agent ${p.id} for terminal ${p.terminalId}`)

        if (p.id >= nextAgentId) {
          nextAgentId = p.id + 1
        }

        // Start polling for JSONL file
        const stat = fs.statSync(p.jsonlFile)
        agent.fileOffset = stat.size
        startPollingJsonl(p.id, agent, jsonlPollTimers, sendToRenderer, processJsonlLines)
      }
    } catch (err) {
      console.error('[Main] Failed to restore agents:', err)
    }
  }

  // Add restored agents' JSONL files to attachedExternalSessions to avoid duplicates
  for (const agent of agents.values()) {
    if (agent.jsonlFile) {
      attachedExternalSessions.add(agent.jsonlFile)
      console.log(`[Main] Restored agent ${agent.id} session: ${agent.jsonlFile}`)
    }
  }

  // Send existing agents to renderer
  if (agents.size > 0) {
    sendExistingAgents(agents, sendToRenderer)
  }
}

function sendAssetsToRenderer(event: Electron.IpcMainEvent) {
  // Store webContents for future use
  mainWindowEvent = event.sender

  // Load and send character sprites
  const characters = assetLoader.loadCharacterSprites()
  sendToRenderer('characterSpritesLoaded', { characters })

  // Load and send floor tiles
  const floorTiles = assetLoader.loadFloorTiles()
  sendToRenderer('floorTilesLoaded', { sprites: floorTiles })

  // Load and send wall tiles
  const wallTiles = assetLoader.loadWallTiles()
  sendToRenderer('wallTilesLoaded', { sprites: wallTiles })

  // Load and send furniture assets
  const furniture = assetLoader.loadFurnitureAssets()
  sendToRenderer('furnitureAssetsLoaded', furniture)

  // Load layout
  const layout = layoutPersistence.loadLayout()
  sendToRenderer('layoutLoaded', { layout })

  // Load and send sound settings
  try {
    const settingsPath = path.join(os.homedir(), '.pixel-agents-electron', 'settings.json')
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
      if (typeof settings.soundEnabled === 'boolean') {
        sendToRenderer('settingsLoaded', { soundEnabled: settings.soundEnabled })
      }
    }
  } catch (err) {
    console.error('[Main] Failed to load settings:', err)
  }
}

// App lifecycle
app.whenReady().then(() => {
  initializeManagers()
  setupIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  // Stop session monitoring
  sessionMonitor?.stop()
  // Save agents before quitting
  persistAgents(agents, AGENTS_SETTINGS_PATH)
  terminalManager.disposeAll()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  // Stop session monitoring
  sessionMonitor?.stop()
  // Save agents before quitting
  persistAgents(agents, AGENTS_SETTINGS_PATH)
  terminalManager.disposeAll()
})

// Export for renderer access
export { mainWindow, terminalManager, fileWatcher }
