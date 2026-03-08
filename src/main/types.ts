// Agent state interface for tracking agent activity
export interface AgentState {
  id: number
  terminalId: number
  projectDir: string
  jsonlFile: string
  fileOffset: number
  lineBuffer: string
  activeToolIds: Set<string>
  activeToolStatuses: Map<string, string>
  activeToolNames: Map<string, string>
  activeSubagentToolIds: Map<string, Set<string>> // parentToolId → active sub-tool IDs
  activeSubagentToolNames: Map<string, Map<string, string>> // parentToolId → (subToolId → toolName)
  isWaiting: boolean
  permissionSent: boolean
  hadToolsInTurn: boolean
  /** Workspace folder name (only set for multi-root workspaces) */
  folderName?: string
  /** Whether this agent represents a subagent session */
  isSubagent: boolean
}

// Persisted agent interface for saving/restoring agents across sessions
export interface PersistedAgent {
  id: number
  terminalId: number
  jsonlFile: string
  projectDir: string
  /** Workspace folder name (only set for multi-root workspaces) */
  folderName?: string
  /** Whether this agent represents a subagent session */
  isSubagent?: boolean
}

// Terminal instance interface (already defined in terminalManager.ts, re-exported for convenience)
export type { TerminalInstance } from './terminalManager.js'
