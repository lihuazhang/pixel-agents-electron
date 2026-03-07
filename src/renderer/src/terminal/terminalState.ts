import { create } from 'zustand'

export interface Terminal {
  id: number
  name: string
  isActive: boolean
  cwd: string
}

interface TerminalState {
  terminals: Terminal[]
  activeTerminalId: number | null
  isPanelVisible: boolean
  panelHeight: number

  // Actions
  addTerminal: (terminal: Terminal) => void
  removeTerminal: (id: number) => void
  setActiveTerminal: (id: number | null) => void
  togglePanel: () => void
  setPanelHeight: (height: number) => void
  updateTerminalName: (id: number, name: string) => void
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  terminals: [],
  activeTerminalId: null,
  isPanelVisible: false,
  panelHeight: 250,

  addTerminal: (terminal) => {
    set((state) => ({
      terminals: [...state.terminals, terminal],
      activeTerminalId: terminal.id,
      isPanelVisible: true,
    }))
  },

  removeTerminal: (id) => {
    set((state) => {
      const newTerminals = state.terminals.filter((t) => t.id !== id)
      const newActiveId =
        state.activeTerminalId === id
          ? newTerminals.length > 0
            ? newTerminals[newTerminals.length - 1].id
            : null
          : state.activeTerminalId
      return {
        terminals: newTerminals,
        activeTerminalId: newActiveId,
        isPanelVisible: newTerminals.length > 0 ? state.isPanelVisible : false,
      }
    })
  },

  setActiveTerminal: (id) => {
    set({ activeTerminalId: id })
  },

  togglePanel: () => {
    set((state) => ({
      isPanelVisible: !state.isPanelVisible,
    }))
  },

  setPanelHeight: (height) => {
    set({ panelHeight: Math.max(150, Math.min(500, height)) })
  },

  updateTerminalName: (id, name) => {
    set((state) => ({
      terminals: state.terminals.map((t) =>
        t.id === id ? { ...t, name } : t
      ),
    }))
  },
}))
