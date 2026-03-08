// IPC bridge for Electron app

export interface ExtensionMessage {
  type: string
  [key: string]: unknown
}

// Event emitter for simulating window.postMessage
const messageListeners = new Set<(data: ExtensionMessage) => void>()

// Listen for messages from main process and forward to window.addEventListener('message')
if (typeof window !== 'undefined' && window.pixelAgentsAPI) {
  window.pixelAgentsAPI.onMessage((data: { type: string; payload?: unknown }) => {
    // Forward to all registered message listeners
    messageListeners.forEach((listener) => {
      listener(data)
    })
  })
}

export const ipcBridge = {
  // Send message to main process (fire-and-forget)
  postMessage: (data: ExtensionMessage) => {
    if (window.pixelAgentsAPI) {
      window.pixelAgentsAPI.postMessage(data)
    } else {
      console.warn('[IPC Bridge] pixelAgentsAPI not available')
    }
  },

  // Send message to main process and wait for response
  invoke: async <T = unknown>(type: string, payload?: unknown): Promise<T> => {
    if (window.pixelAgentsAPI) {
      return window.pixelAgentsAPI.invoke(type, payload) as Promise<T>
    } else {
      console.warn('[IPC Bridge] pixelAgentsAPI not available')
      throw new Error('pixelAgentsAPI not available')
    }
  },

  // Listen for messages from main process (simulates window.addEventListener('message'))
  addMessageListener: (callback: (data: ExtensionMessage) => void) => {
    messageListeners.add(callback)
  },

  // Remove message listener
  removeMessageListener: (callback: (data: ExtensionMessage) => void) => {
    messageListeners.delete(callback)
  }
}

// Alias for compatibility with existing code
export const vscode = {
  postMessage: ipcBridge.postMessage,
  invoke: ipcBridge.invoke
}
