import { vi } from 'vitest'

// Mock BrowserWindow
export class MockBrowserWindow {
  public static instances: MockBrowserWindow[] = []

  public webContents = {
    send: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
  }

  public loadURL = vi.fn()
  public loadFile = vi.fn()
  public show = vi.fn()
  public hide = vi.fn()
  public close = vi.fn()
  public on = vi.fn()
  public once = vi.fn()

  constructor(public options: any) {
    MockBrowserWindow.instances.push(this)
  }

  static getAllWindows() {
    return MockBrowserWindow.instances
  }

  static clearInstances() {
    MockBrowserWindow.instances = []
  }
}

// Mock ipcMain
export const ipcMain = {
  on: vi.fn(),
  handle: vi.fn(),
  removeHandler: vi.fn(),
  removeAllListeners: vi.fn(),
}

// Mock ipcRenderer
export const ipcRenderer = {
  on: vi.fn(),
  once: vi.fn(),
  send: vi.fn(),
  invoke: vi.fn(),
  removeListener: vi.fn(),
  removeAllListeners: vi.fn(),
}

// Mock app
export const app = {
  getPath: vi.fn((name: string) => {
    const paths: Record<string, string> = {
      home: '/mock/home',
      appData: '/mock/appData',
      userData: '/mock/userData',
      temp: '/mock/temp',
      exe: '/mock/exe',
      module: '/mock/module',
      desktop: '/mock/desktop',
      documents: '/mock/documents',
      downloads: '/mock/downloads',
      music: '/mock/music',
      pictures: '/mock/pictures',
      videos: '/mock/videos',
      recent: '/mock/recent',
      logs: '/mock/logs',
      crashDumps: '/mock/crashDumps',
    }
    return paths[name] || `/mock/${name}`
  }),
  getAppPath: vi.fn(() => '/mock/app'),
  getVersion: vi.fn(() => '1.0.0'),
  getName: vi.fn(() => 'Pixel Agents'),
  whenReady: vi.fn(() => Promise.resolve()),
  on: vi.fn(),
  once: vi.fn(),
  quit: vi.fn(),
  exit: vi.fn(),
  disableHardwareAcceleration: vi.fn(),
  commandLine: {
    appendSwitch: vi.fn(),
    appendArgument: vi.fn(),
  },
  isPackaged: false,
}

// Mock dialog
export const dialog = {
  showOpenDialog: vi.fn(),
  showSaveDialog: vi.fn(),
  showMessageBox: vi.fn(),
  showErrorBox: vi.fn(),
}

// Mock shell
export const shell = {
  openPath: vi.fn(),
  openExternal: vi.fn(),
  showItemInFolder: vi.fn(),
  beep: vi.fn(),
}

// Mock contextBridge
export const contextBridge = {
  exposeInMainWorld: vi.fn(),
}

// Electron 主进程 mock
export const electronMainMock = {
  app,
  BrowserWindow: MockBrowserWindow,
  ipcMain,
  dialog,
  shell,
}

// Electron 预加载进程 mock
export const electronPreloadMock = {
  contextBridge,
  ipcRenderer,
}

// 兼容旧代码的导出
export const mockApp = app
export const mockDialog = dialog
export const mockShell = shell
export const mockContextBridge = contextBridge
export const mockIpcRenderer = ipcRenderer
export const mockIpcMain = ipcMain

// 重置所有 mocks
export function resetElectronMocks() {
  MockBrowserWindow.clearInstances()
  vi.clearAllMocks()
}

// 默认导出
export default {
  app,
  BrowserWindow: MockBrowserWindow,
  ipcMain,
  ipcRenderer,
  dialog,
  shell,
  contextBridge,
}
