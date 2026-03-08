import { useState, useEffect, useRef, useCallback } from 'react'
import type { OfficeState } from '../office/engine/officeState.js'
import type { OfficeLayout, ToolActivity } from '../office/types.js'
import type { ExtensionMessage } from '../ipcBridge.js'
import { extractToolName } from '../office/toolUtils.js'
import { migrateLayoutColors } from '../office/layout/layoutSerializer.js'
import { buildDynamicCatalog } from '../office/layout/furnitureCatalog.js'
import { setFloorSprites } from '../office/floorTiles.js'
import { setWallSprites } from '../office/wallTiles.js'
import { setCharacterTemplates } from '../office/sprites/spriteData.js'
import { vscode, ipcBridge } from '../ipcBridge.js'
import { playDoneSound, setSoundEnabled } from '../notificationSound.js'

export interface SubagentCharacter {
  id: number
  parentAgentId: number
  parentToolId: string
  label: string
}

export interface FurnitureAsset {
  id: string
  name: string
  label: string
  category: string
  file: string
  width: number
  height: number
  footprintW: number
  footprintH: number
  isDesk: boolean
  canPlaceOnWalls: boolean
  partOfGroup?: boolean
  groupId?: string
  canPlaceOnSurfaces?: boolean
  backgroundTiles?: number
}

export interface WorkspaceFolder {
  name: string
  path: string
}

export interface ExtensionMessageState {
  agents: number[]
  selectedAgent: number | null
  agentTools: Record<number, ToolActivity[]>
  agentStatuses: Record<number, string>
  subagentTools: Record<number, Record<string, ToolActivity[]>>
  subagentCharacters: SubagentCharacter[]
  layoutReady: boolean
  loadedAssets?: { catalog: FurnitureAsset[]; sprites: Record<string, string[][]> }
  workspaceFolders: WorkspaceFolder[]
}

function saveAgentSeats(os: OfficeState): void {
  const seats: Record<number, { palette: number; hueShift: number; seatId: string | null }> = {}
  for (const ch of os.characters.values()) {
    if (ch.isSubagent) continue
    seats[ch.id] = { palette: ch.palette, hueShift: ch.hueShift, seatId: ch.seatId }
  }
  vscode.postMessage({ type: 'saveAgentSeats', seats })
}

export function useExtensionMessages(
  getOfficeState: () => OfficeState,
  onLayoutLoaded?: (layout: OfficeLayout) => void,
  isEditDirty?: () => boolean,
  onAgentCreated?: (terminalId: number) => void,
): ExtensionMessageState {
  const [agents, setAgents] = useState<number[]>([])
  const [selectedAgent, setSelectedAgent] = useState<number | null>(null)
  const [agentTools, setAgentTools] = useState<Record<number, ToolActivity[]>>({})
  const [agentStatuses, setAgentStatuses] = useState<Record<number, string>>({})
  const [subagentTools, setSubagentTools] = useState<Record<number, Record<string, ToolActivity[]>>>({})
  const [subagentCharacters, setSubagentCharacters] = useState<SubagentCharacter[]>([])
  const [layoutReady, setLayoutReady] = useState(false)
  const [loadedAssets, setLoadedAssets] = useState<{ catalog: FurnitureAsset[]; sprites: Record<string, string[][]> } | undefined>()
  const [workspaceFolders, setWorkspaceFolders] = useState<WorkspaceFolder[]>([])

  // Track whether initial layout has been loaded (ref to avoid re-render)
  const layoutReadyRef = useRef(false)

  useEffect(() => {
    // Buffer agents from existingAgents until layout is loaded
    let pendingAgents: Array<{ id: number; palette?: number; hueShift?: number; seatId?: string; folderName?: string }> = []

    const handler = (msg: ExtensionMessage) => {
      const os = getOfficeState()

      if (msg.type === 'layoutLoaded') {
        // Skip external layout updates while editor has unsaved changes
        if (layoutReadyRef.current && isEditDirty?.()) {
          return
        }
        const rawLayout = (msg.payload as any)?.layout as OfficeLayout | null
        const layout = rawLayout && rawLayout.version === 1 ? migrateLayoutColors(rawLayout) : null
        if (layout) {
          os.rebuildFromLayout(layout)
          onLayoutLoaded?.(layout)
        } else {
          // Default layout — snapshot whatever OfficeState built
          onLayoutLoaded?.(os.getLayout())
        }
        // Add buffered agents now that layout (and seats) are correct
        for (const p of pendingAgents) {
          os.addAgent(p.id, p.palette, p.hueShift, p.seatId, true, p.folderName)
        }
        pendingAgents = []
        layoutReadyRef.current = true
        setLayoutReady(true)
        if (os.characters.size > 0) {
          saveAgentSeats(os)
        }
      } else if (msg.type === 'agentCreated') {
        const id = (msg.payload as any)?.id as number
        const terminalId = (msg.payload as any)?.terminalId as number | undefined
        const folderName = (msg.payload as any)?.folderName as string | undefined
        setAgents((prev) => (prev.includes(id) ? prev : [...prev, id]))
        setSelectedAgent(id)
        // Notify parent component about the new agent/terminal
        if (terminalId && onAgentCreated) {
          onAgentCreated(terminalId)
        }
        os.addAgent(id, undefined, undefined, undefined, undefined, folderName)
        saveAgentSeats(os)
      } else if (msg.type === 'agentClosed') {
        const id = (msg.payload as any)?.id as number
        setAgents((prev) => prev.filter((a) => a !== id))
        setSelectedAgent((prev) => (prev === id ? null : prev))
        setAgentTools((prev) => {
          if (!(id in prev)) return prev
          const next = { ...prev }
          delete next[id]
          return next
        })
        setAgentStatuses((prev) => {
          if (!(id in prev)) return prev
          const next = { ...prev }
          delete next[id]
          return next
        })
        setSubagentTools((prev) => {
          if (!(id in prev)) return prev
          const next = { ...prev }
          delete next[id]
          return next
        })
        // Remove all sub-agent characters belonging to this agent
        os.removeAllSubagents(id)
        setSubagentCharacters((prev) => prev.filter((s) => s.parentAgentId !== id))
        os.removeAgent(id)
      } else if (msg.type === 'existingAgents') {
        const incoming = (msg.payload as any)?.agents as number[]
        const meta = ((msg.payload as any)?.agentMeta || {}) as Record<number, { palette?: number; hueShift?: number; seatId?: string }>
        const folderNames = ((msg.payload as any)?.folderNames || {}) as Record<number, string>
        // Buffer agents — they'll be added in layoutLoaded after seats are built
        for (const id of incoming) {
          const m = meta[id]
          pendingAgents.push({ id, palette: m?.palette, hueShift: m?.hueShift, seatId: m?.seatId, folderName: folderNames[id] })
        }
        setAgents((prev) => {
          const ids = new Set(prev)
          const merged = [...prev]
          for (const id of incoming) {
            if (!ids.has(id)) {
              merged.push(id)
            }
          }
          return merged.sort((a, b) => a - b)
        })
      } else if (msg.type === 'agentToolStart') {
        const id = (msg.payload as any)?.id as number
        const toolId = (msg.payload as any)?.toolId as string
        const status = (msg.payload as any)?.status as string
        setAgentTools((prev) => {
          const list = prev[id] || []
          if (list.some((t) => t.toolId === toolId)) return prev
          return { ...prev, [id]: [...list, { toolId, status, done: false }] }
        })
        const toolName = extractToolName(status)
        os.setAgentTool(id, toolName)
        os.setAgentActive(id, true)
        os.clearPermissionBubble(id)
        // Create sub-agent character for Task tool subtasks
        if (status.startsWith('Subtask:')) {
          const label = status.slice('Subtask:'.length).trim()
          const subId = os.addSubagent(id, toolId)
          setSubagentCharacters((prev) => {
            if (prev.some((s) => s.id === subId)) return prev
            return [...prev, { id: subId, parentAgentId: id, parentToolId: toolId, label }]
          })
        }
      } else if (msg.type === 'agentToolDone') {
        const id = (msg.payload as any)?.id as number
        const toolId = (msg.payload as any)?.toolId as string
        setAgentTools((prev) => {
          const list = prev[id]
          if (!list) return prev
          return {
            ...prev,
            [id]: list.map((t) => (t.toolId === toolId ? { ...t, done: true } : t)),
          }
        })
      } else if (msg.type === 'agentToolsClear') {
        const id = (msg.payload as any)?.id as number
        setAgentTools((prev) => {
          if (!(id in prev)) return prev
          const next = { ...prev }
          delete next[id]
          return next
        })
        setSubagentTools((prev) => {
          if (!(id in prev)) return prev
          const next = { ...prev }
          delete next[id]
          return next
        })
        // Remove all sub-agent characters belonging to this agent
        os.removeAllSubagents(id)
        setSubagentCharacters((prev) => prev.filter((s) => s.parentAgentId !== id))
        os.setAgentTool(id, null)
        os.clearPermissionBubble(id)
      } else if (msg.type === 'agentSelected') {
        const id = (msg.payload as any)?.id as number
        setSelectedAgent(id)
      } else if (msg.type === 'agentStatus') {
        const id = (msg.payload as any)?.id as number
        const status = (msg.payload as any)?.status as string
        setAgentStatuses((prev) => {
          if (status === 'active') {
            if (!(id in prev)) return prev
            const next = { ...prev }
            delete next[id]
            return next
          }
          return { ...prev, [id]: status }
        })
        os.setAgentActive(id, status === 'active')
        if (status === 'waiting') {
          os.showWaitingBubble(id)
          playDoneSound()
        }
      } else if (msg.type === 'agentToolPermission') {
        const id = (msg.payload as any)?.id as number
        setAgentTools((prev) => {
          const list = prev[id]
          if (!list) return prev
          return {
            ...prev,
            [id]: list.map((t) => (t.done ? t : { ...t, permissionWait: true })),
          }
        })
        os.showPermissionBubble(id)
      } else if (msg.type === 'subagentToolPermission') {
        const id = (msg.payload as any)?.id as number
        const parentToolId = (msg.payload as any)?.parentToolId as string
        // Show permission bubble on the sub-agent character
        const subId = os.getSubagentId(id, parentToolId)
        if (subId !== null) {
          os.showPermissionBubble(subId)
        }
      } else if (msg.type === 'agentToolPermissionClear') {
        const id = (msg.payload as any)?.id as number
        setAgentTools((prev) => {
          const list = prev[id]
          if (!list) return prev
          const hasPermission = list.some((t) => t.permissionWait)
          if (!hasPermission) return prev
          return {
            ...prev,
            [id]: list.map((t) => (t.permissionWait ? { ...t, permissionWait: false } : t)),
          }
        })
        os.clearPermissionBubble(id)
        // Also clear permission bubbles on all sub-agent characters of this parent
        for (const [subId, meta] of os.subagentMeta) {
          if (meta.parentAgentId === id) {
            os.clearPermissionBubble(subId)
          }
        }
      } else if (msg.type === 'subagentToolStart') {
        const id = (msg.payload as any)?.id as number
        const parentToolId = (msg.payload as any)?.parentToolId as string
        const toolId = (msg.payload as any)?.toolId as string
        const status = (msg.payload as any)?.status as string
        setSubagentTools((prev) => {
          const agentSubs = prev[id] || {}
          const list = agentSubs[parentToolId] || []
          if (list.some((t) => t.toolId === toolId)) return prev
          return { ...prev, [id]: { ...agentSubs, [parentToolId]: [...list, { toolId, status, done: false }] } }
        })
        // Update sub-agent character's tool and active state
        const subId = os.getSubagentId(id, parentToolId)
        if (subId !== null) {
          const subToolName = extractToolName(status)
          os.setAgentTool(subId, subToolName)
          os.setAgentActive(subId, true)
        }
      } else if (msg.type === 'subagentToolDone') {
        const id = (msg.payload as any)?.id as number
        const parentToolId = (msg.payload as any)?.parentToolId as string
        const toolId = (msg.payload as any)?.toolId as string
        setSubagentTools((prev) => {
          const agentSubs = prev[id]
          if (!agentSubs) return prev
          const list = agentSubs[parentToolId]
          if (!list) return prev
          return {
            ...prev,
            [id]: { ...agentSubs, [parentToolId]: list.map((t) => (t.toolId === toolId ? { ...t, done: true } : t)) },
          }
        })
      } else if (msg.type === 'subagentClear') {
        const id = (msg.payload as any)?.id as number
        const parentToolId = (msg.payload as any)?.parentToolId as string
        setSubagentTools((prev) => {
          const agentSubs = prev[id]
          if (!agentSubs || !(parentToolId in agentSubs)) return prev
          const next = { ...agentSubs }
          delete next[parentToolId]
          if (Object.keys(next).length === 0) {
            const outer = { ...prev }
            delete outer[id]
            return outer
          }
          return { ...prev, [id]: next }
        })
        // Remove sub-agent character
        os.removeSubagent(id, parentToolId)
        setSubagentCharacters((prev) => prev.filter((s) => !(s.parentAgentId === id && s.parentToolId === parentToolId)))
      } else if (msg.type === 'characterSpritesLoaded') {
        const characters = (msg.payload as any)?.characters as Array<{ down: string[][][]; up: string[][][]; right: string[][][] }>
        setCharacterTemplates(characters)
      } else if (msg.type === 'floorTilesLoaded') {
        const sprites = (msg.payload as any)?.sprites as string[][][]
        setFloorSprites(sprites)
      } else if (msg.type === 'wallTilesLoaded') {
        const sprites = (msg.payload as any)?.sprites as string[][][]
        setWallSprites(sprites)
      } else if (msg.type === 'workspaceFolders') {
        const folders = (msg.payload as any)?.folders as WorkspaceFolder[]
        setWorkspaceFolders(folders)
      } else if (msg.type === 'settingsLoaded') {
        const soundOn = (msg.payload as any)?.soundEnabled as boolean
        setSoundEnabled(soundOn)
      } else if (msg.type === 'furnitureAssetsLoaded') {
        try {
          const catalog = (msg.payload as any)?.catalog as FurnitureAsset[]
          const sprites = (msg.payload as any)?.sprites as Record<string, string[][]>
          console.log(`📦 Webview: Loaded ${catalog.length} furniture assets`)
          buildDynamicCatalog({ catalog, sprites })
          setLoadedAssets({ catalog, sprites })
        } catch (err) {
          console.error(`❌ Webview: Error processing furnitureAssetsLoaded:`, err)
        }
      }
    }
    ipcBridge.addMessageListener(handler)
    vscode.postMessage({ type: 'webviewReady' })
    // Request workspace folders
    vscode.invoke('workspaceFolders').then((folders) => {
      if (Array.isArray(folders)) {
        setWorkspaceFolders(folders as WorkspaceFolder[])
      }
    }).catch((err) => {
      console.error('[useExtensionMessages] Failed to get workspace folders:', err)
    })
    return () => ipcBridge.removeMessageListener(handler)
  }, [getOfficeState])

  return { agents, selectedAgent, agentTools, agentStatuses, subagentTools, subagentCharacters, layoutReady, loadedAssets, workspaceFolders }
}
