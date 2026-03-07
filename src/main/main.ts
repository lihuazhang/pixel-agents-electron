import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import { TerminalManager } from './terminalManager.js'
import { FileWatcher } from './fileWatcher.js'
import { AssetLoader } from './assetLoader.js'
import { LayoutPersistence } from './layoutPersistence.js'
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

// Agent state management
const agents = new Map<number, AgentState>()
const waitingTimers = new Map<number, ReturnType<typeof setTimeout>>()
const permissionTimers = new Map<number, ReturnType<typeof setTimeout>>()
const jsonlPollTimers = new Map<number, ReturnType<typeof setInterval>>()
let nextAgentId = 1

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

          // Notify renderer that agent was created
          sendToRenderer('agentCreated', {
            id: agentId,
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
        const terminalId = terminalManager.attachExternalTerminal(pid, jsonlFile)

        // Create agent state for external terminal
        const projectDir = path.dirname(jsonlFile)
        const sessionId = path.basename(jsonlFile, '.jsonl')
        const agentId = nextAgentId++
        const agent = createAgentState(agentId, terminalId, projectDir, sessionId)
        agents.set(agentId, agent)

        // Start file watching
        fileWatcher.watch(terminalId, jsonlFile, (lines: string[]) => {
          console.log(`[Main] External terminal ${terminalId}: Read ${lines.length} new lines from JSONL`)
          processJsonlLines(agentId, lines)
        })

        return { terminalId }
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
        // Return initial workspace folders - typically just home directory
        const home = app.getPath('home')
        const folders = [{
          name: path.basename(home) || 'home',
          path: home
        }]
        return folders
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
  const dirName = workspacePath.replace(/[^a-zA-Z0-9-]/g, '-')
  const projectDir = path.join(os.homedir(), '.claude', 'projects', dirName)
  console.log(`[Pixel Agents] Project dir: ${workspacePath} → ${dirName}`)
  return projectDir
}

function restoreAgentsOnStartup() {
  restoreAgents(
    AGENTS_SETTINGS_PATH,
    agents,
    { current: nextAgentId },
    jsonlPollTimers,
    sendToRenderer,
    processJsonlLines
  )

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
  // Save agents before quitting
  persistAgents(agents, AGENTS_SETTINGS_PATH)
  terminalManager.disposeAll()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  // Save agents before quitting
  persistAgents(agents, AGENTS_SETTINGS_PATH)
  terminalManager.disposeAll()
})

// Export for renderer access
export { mainWindow, terminalManager, fileWatcher }
