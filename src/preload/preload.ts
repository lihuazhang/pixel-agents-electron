import { contextBridge, ipcRenderer } from 'electron'

// Types for IPC messages
interface ExtensionMessage {
  type: string
  [key: string]: unknown
}

// Expose protected methods that allow renderer to communicate with main process
contextBridge.exposeInMainWorld('pixelAgentsAPI', {
  // Send message to main process
  send: (type: string, payload?: unknown) => {
    ipcRenderer.send('renderer-to-main', { type, payload })
  },

  // Invoke main process and get result
  invoke: async (type: string, payload?: unknown): Promise<unknown> => {
    return ipcRenderer.invoke('renderer-to-main', { type, payload })
  },

  // Listen for messages of a specific type from main process
  on: (type: string, callback: (payload: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { type: string; payload?: unknown }) => {
      // Filter by message type
      if (data.type === type) {
        callback(data.payload)
      }
    }
    ipcRenderer.on('main-to-renderer', handler)
    return () => {
      ipcRenderer.removeListener('main-to-renderer', handler)
    }
  },

  // Remove listener
  removeListener: (type: string, callback: (...args: unknown[]) => void) => {
    ipcRenderer.removeListener('main-to-renderer', callback)
  },

  // Send without payload
  postMessage: (data: ExtensionMessage) => {
    ipcRenderer.send('renderer-to-main', data)
  },

  // Listen for generic messages
  onMessage: (callback: (data: ExtensionMessage) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: ExtensionMessage) => {
      callback(data)
    }
    ipcRenderer.on('main-to-renderer', handler)
    return () => {
      ipcRenderer.removeListener('main-to-renderer', handler)
    }
  }
})

// Type declaration for the exposed API
declare global {
  interface Window {
    pixelAgentsAPI: {
      send: (type: string, payload?: unknown) => void
      invoke: (type: string, payload?: unknown) => Promise<unknown>
      on: (type: string, callback: (payload: unknown) => void) => () => void
      removeListener: (type: string, callback: (...args: unknown[]) => void) => void
      postMessage: (data: ExtensionMessage) => void
      onMessage: (callback: (data: ExtensionMessage) => void) => () => void
    }
  }
}
