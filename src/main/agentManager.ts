import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type { AgentState, PersistedAgent } from './types.js'
import { cancelWaitingTimer, cancelPermissionTimer, clearAgentActivity } from './timerManager.js'
import { processTranscriptLine } from './transcriptParser.js'

const JSONL_POLL_INTERVAL_MS = 1000
const TERMINAL_NAME_PREFIX = 'Claude Code'

// Re-export types for convenience
export type { AgentState, PersistedAgent }

export function getProjectDirPath(cwd?: string): string | null {
  const workspacePath = cwd || os.homedir()
  if (!workspacePath) return null
  const dirName = workspacePath.replace(/[^a-zA-Z0-9-]/g, '-')
  const projectDir = path.join(os.homedir(), '.claude', 'projects', dirName)
  console.log(`[Pixel Agents] Project dir: ${workspacePath} → ${dirName}`)
  return projectDir
}

export function createAgentState(
  id: number,
  terminalId: number,
  projectDir: string,
  sessionId: string,
  folderName?: string,
): AgentState {
  const expectedFile = path.join(projectDir, `${sessionId}.jsonl`)

  return {
    id,
    terminalId,
    projectDir,
    jsonlFile: expectedFile,
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
    folderName,
  }
}

export function removeAgent(
  agentId: number,
  agents: Map<number, AgentState>,
  jsonlPollTimers: Map<number, ReturnType<typeof setInterval>>,
  persistAgents: () => void,
): void {
  const agent = agents.get(agentId)
  if (!agent) return

  // Stop JSONL poll timer
  const jpTimer = jsonlPollTimers.get(agentId)
  if (jpTimer) {
    clearInterval(jpTimer)
  }
  jsonlPollTimers.delete(agentId)

  // Remove from maps
  agents.delete(agentId)
  persistAgents()
}

export function persistAgents(
  agents: Map<number, AgentState>,
  settingsPath: string,
): void {
  const persisted: PersistedAgent[] = []
  for (const agent of agents.values()) {
    persisted.push({
      id: agent.id,
      terminalId: agent.terminalId,
      jsonlFile: agent.jsonlFile,
      projectDir: agent.projectDir,
      folderName: agent.folderName,
    })
  }

  try {
    const dir = path.dirname(settingsPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(settingsPath, JSON.stringify(persisted, null, 2), 'utf-8')
  } catch (err) {
    console.error('[AgentManager] Failed to persist agents:', err)
  }
}

export function restoreAgents(
  settingsPath: string,
  agents: Map<number, AgentState>,
  nextAgentIdRef: { current: number },
  jsonlPollTimers: Map<number, ReturnType<typeof setInterval>>,
  sendToRenderer: (type: string, payload?: unknown) => void,
  processJsonlLines: (agentId: number, lines: string[]) => void,
): void {
  if (!fs.existsSync(settingsPath)) return

  let persisted: PersistedAgent[]
  try {
    persisted = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
  } catch {
    return
  }

  if (persisted.length === 0) return

  let maxId = 0

  for (const p of persisted) {
    const agent: AgentState = {
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

    if (p.id > maxId) maxId = p.id

    // Start polling for JSONL file if it exists
    if (fs.existsSync(p.jsonlFile)) {
      const stat = fs.statSync(p.jsonlFile)
      agent.fileOffset = stat.size
      startPollingJsonl(p.id, agent, jsonlPollTimers, sendToRenderer, processJsonlLines)
    } else {
      startPollingJsonl(p.id, agent, jsonlPollTimers, sendToRenderer, processJsonlLines)
    }
  }

  // Advance counter past restored IDs
  if (maxId >= nextAgentIdRef.current) {
    nextAgentIdRef.current = maxId + 1
  }
}

export function sendExistingAgents(
  agents: Map<number, AgentState>,
  sendToRenderer: (type: string, payload?: unknown) => void,
): void {
  const agentIds: number[] = []
  const folderNames: Record<number, string> = {}

  for (const [id, agent] of agents) {
    agentIds.push(id)
    if (agent.folderName) {
      folderNames[id] = agent.folderName
    }
  }
  agentIds.sort((a, b) => a - b)

  console.log(`[Pixel Agents] sendExistingAgents: agents=${JSON.stringify(agentIds)}`)

  sendToRenderer('existingAgents', {
    agents: agentIds,
    folderNames,
  })

  // Re-send current statuses
  for (const [agentId, agent] of agents) {
    // Re-send active tools
    for (const [toolId, status] of agent.activeToolStatuses) {
      sendToRenderer('agentToolStart', {
        id: agentId,
        toolId,
        status,
      })
    }
    // Re-send waiting status
    if (agent.isWaiting) {
      sendToRenderer('agentStatus', {
        id: agentId,
        status: 'waiting',
      })
    }
  }
}

export function startPollingJsonl(
  agentId: number,
  agent: AgentState,
  jsonlPollTimers: Map<number, ReturnType<typeof setInterval>>,
  sendToRenderer: (type: string, payload?: unknown) => void,
  processJsonlLines: (agentId: number, lines: string[]) => void,
): void {
  const pollTimer = setInterval(() => {
    try {
      if (fs.existsSync(agent.jsonlFile)) {
        const stat = fs.statSync(agent.jsonlFile)
        if (stat.size > agent.fileOffset) {
          // Read new lines
          const buf = Buffer.alloc(stat.size - agent.fileOffset)
          const fd = fs.openSync(agent.jsonlFile, 'r')
          fs.readSync(fd, buf, 0, buf.length, agent.fileOffset)
          fs.closeSync(fd)
          agent.fileOffset = stat.size

          const text = agent.lineBuffer + buf.toString('utf-8')
          const lines = text.split('\n')
          agent.lineBuffer = lines.pop() || ''

          const completeLines = lines.filter(l => l.trim())
          if (completeLines.length > 0) {
            processJsonlLines(agentId, completeLines)
          }
        }
      }
    } catch (err) {
      console.error(`[AgentManager] Poll error for agent ${agentId}:`, err)
    }
  }, JSONL_POLL_INTERVAL_MS)

  jsonlPollTimers.set(agentId, pollTimer)
}

export function processJsonlLinesFactory(
  agents: Map<number, AgentState>,
  waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
  sendToRenderer: (type: string, payload?: unknown) => void,
) {
  return function processJsonlLines(agentId: number, lines: string[]): void {
    for (const line of lines) {
      if (!line.trim()) continue
      processTranscriptLine(agentId, line, agents, waitingTimers, permissionTimers, sendToRenderer)
    }
  }
}
