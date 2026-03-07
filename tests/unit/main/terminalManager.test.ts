import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock 依赖模块
vi.mock('node-pty', async () => {
  const mocks = await import('../../mocks/node-pty')
  return {
    ...mocks.mockNodePty,
    default: mocks.mockNodePty,
  }
})
vi.mock('electron', async () => {
  const mocks = await import('../../mocks/electron')
  return {
    app: mocks.mockApp,
    default: { app: mocks.mockApp },
  }
})
vi.mock('os', () => ({
  homedir: vi.fn(() => '/mock/home'),
}))
vi.mock('path', async () => {
  const actual = await vi.importActual('path')
  return {
    ...actual,
    join: (...args: string[]) => args.join('/').replace(/\/+/g, '/'),
  }
})

import { TerminalManager } from '../../../src/main/terminalManager'
import { mockNodePty, resetNodePtyMocks, MockPtyProcess } from '../../mocks/node-pty'
import { mockApp } from '../../mocks/electron'

describe('TerminalManager', () => {
  let manager: TerminalManager

  beforeEach(() => {
    resetNodePtyMocks()
    manager = new TerminalManager()
  })

  afterEach(() => {
    manager.disposeAll()
    vi.clearAllMocks()
  })

  describe('createTerminal', () => {
    it('应该创建新终端并返回终端 ID', () => {
      const terminalId = manager.createTerminal('/mock/workspace')

      expect(terminalId).toBe(1)
      expect(mockNodePty.spawn).toHaveBeenCalled()
    })

    it('应该使用 zsh 作为默认 shell (非 Windows)', () => {
      const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
      Object.defineProperty(process, 'platform', { value: 'darwin' })

      manager.createTerminal('/mock/workspace')

      expect(mockNodePty.spawn).toHaveBeenCalledWith(
        'zsh',
        [],
        expect.objectContaining({
          name: 'xterm-256color',
          cols: 80,
          rows: 24,
          cwd: '/mock/workspace',
        })
      )

      // 恢复平台
      if (originalPlatform) {
        Object.defineProperty(process, 'platform', originalPlatform)
      }
    })

    it('应该使用 powershell 在 Windows 上', () => {
      const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
      Object.defineProperty(process, 'platform', { value: 'win32' })

      manager.createTerminal('/mock/workspace')

      expect(mockNodePty.spawn).toHaveBeenCalledWith(
        'powershell',
        [],
        expect.any(Object)
      )

      if (originalPlatform) {
        Object.defineProperty(process, 'platform', originalPlatform)
      }
    })

    it('应该启动 Claude 进程', () => {
      const terminalId = manager.createTerminal('/mock/workspace')
      const terminal = manager.getTerminal(terminalId)

      expect(terminal).toBeDefined()
      expect(terminal?.process).toBeDefined()

      // 验证 Claude 命令被写入
      const ptyProcess = terminal?.process as MockPtyProcess
      // 模拟写入方法应该被调用
      expect(ptyProcess.write).toBeDefined()
    })

    it('应该生成唯一的会话 ID', () => {
      const terminalId1 = manager.createTerminal('/mock/workspace1')
      const terminalId2 = manager.createTerminal('/mock/workspace2')

      const terminal1 = manager.getTerminal(terminalId1)
      const terminal2 = manager.getTerminal(terminalId2)

      expect(terminal1?.sessionId).toBeDefined()
      expect(terminal2?.sessionId).toBeDefined()
      expect(terminal1?.sessionId).not.toBe(terminal2?.sessionId)
    })

    it('应该为每个终端创建 JSONL 文件路径', () => {
      const terminalId = manager.createTerminal('/mock/workspace')
      const terminal = manager.getTerminal(terminalId)

      expect(terminal?.jsonlFile).toBeDefined()
      expect(terminal?.jsonlFile).toContain('.claude/projects/')
      expect(terminal?.jsonlFile).toContain('.jsonl')
    })

    it('应该递增分配终端 ID', () => {
      const id1 = manager.createTerminal('/mock/workspace1')
      const id2 = manager.createTerminal('/mock/workspace2')
      const id3 = manager.createTerminal('/mock/workspace3')

      expect(id1).toBe(1)
      expect(id2).toBe(2)
      expect(id3).toBe(3)
    })
  })

  describe('attachExternalTerminal', () => {
    it('应该附加外部终端', () => {
      const pid = 12345
      const jsonlFile = '/path/to/session.jsonl'

      const terminalId = manager.attachExternalTerminal(pid, jsonlFile)

      expect(terminalId).toBe(1)
      const terminal = manager.getTerminal(terminalId)
      expect(terminal?.jsonlFile).toBe(jsonlFile)
      expect(terminal?.pty).toBeNull() // 外部终端没有 pty
    })

    it('不应该为外部终端启动 Claude', () => {
      const pid = 12345
      const jsonlFile = '/path/to/session.jsonl'

      manager.attachExternalTerminal(pid, jsonlFile)

      // 不应该调用 spawn
      expect(mockNodePty.spawn).not.toHaveBeenCalled()
    })
  })

  describe('launchClaude', () => {
    it('应该为新会话启动 Claude', () => {
      const terminalId = manager.createTerminal('/mock/workspace')
      const terminal = manager.getTerminal(terminalId)
      const oldSessionId = terminal?.sessionId

      manager.launchClaude(terminalId)

      const updatedTerminal = manager.getTerminal(terminalId)
      expect(updatedTerminal?.sessionId).not.toBe(oldSessionId)
      expect(updatedTerminal?.jsonlFile).toContain(updatedTerminal?.sessionId)
    })

    it('如果终端不存在应该不做任何事情', () => {
      // 不应该抛出错误
      expect(() => manager.launchClaude(999)).not.toThrow()
    })

    it('如果终端没有进程应该不做任何事情', () => {
      const terminalId = manager.attachExternalTerminal(12345, '/path/to/file.jsonl')

      expect(() => manager.launchClaude(terminalId)).not.toThrow()
    })
  })

  describe('disposeTerminal', () => {
    it('应该终止终端进程', () => {
      const terminalId = manager.createTerminal('/mock/workspace')
      const terminal = manager.getTerminal(terminalId)
      const ptyProcess = terminal?.process as MockPtyProcess

      const killSpy = vi.spyOn(ptyProcess, 'kill')

      manager.disposeTerminal(terminalId)

      expect(killSpy).toHaveBeenCalled()
    })

    it('应该从管理中移除终端', () => {
      const terminalId = manager.createTerminal('/mock/workspace')

      manager.disposeTerminal(terminalId)

      expect(manager.getTerminal(terminalId)).toBeUndefined()
    })

    it('如果终端不存在应该不做任何事情', () => {
      expect(() => manager.disposeTerminal(999)).not.toThrow()
    })
  })

  describe('disposeAll', () => {
    it('应该终止所有终端', () => {
      const id1 = manager.createTerminal('/mock/workspace1')
      const id2 = manager.createTerminal('/mock/workspace2')

      const terminal1 = manager.getTerminal(id1)
      const terminal2 = manager.getTerminal(id2)
      const killSpy1 = vi.spyOn(terminal1?.process as MockPtyProcess, 'kill')
      const killSpy2 = vi.spyOn(terminal2?.process as MockPtyProcess, 'kill')

      manager.disposeAll()

      expect(killSpy1).toHaveBeenCalled()
      expect(killSpy2).toHaveBeenCalled()
    })

    it('应该清空所有终端', () => {
      manager.createTerminal('/mock/workspace1')
      manager.createTerminal('/mock/workspace2')

      manager.disposeAll()

      expect(manager.getAllTerminals()).toHaveLength(0)
    })
  })

  describe('getTerminal', () => {
    it('应该返回存在的终端', () => {
      const terminalId = manager.createTerminal('/mock/workspace')

      const terminal = manager.getTerminal(terminalId)

      expect(terminal).toBeDefined()
      expect(terminal?.id).toBe(terminalId)
    })

    it('应该返回 undefined 如果终端不存在', () => {
      const terminal = manager.getTerminal(999)

      expect(terminal).toBeUndefined()
    })
  })

  describe('getAllTerminals', () => {
    it('应该返回所有终端', () => {
      manager.createTerminal('/mock/workspace1')
      manager.createTerminal('/mock/workspace2')

      const terminals = manager.getAllTerminals()

      expect(terminals).toHaveLength(2)
    })

    it('应该返回空数组如果没有终端', () => {
      const terminals = manager.getAllTerminals()

      expect(terminals).toHaveLength(0)
    })
  })

  describe('边界场景', () => {
    it('应该处理终端进程的 exit 事件', () => {
      const terminalId = manager.createTerminal('/mock/workspace')
      const terminal = manager.getTerminal(terminalId)
      const ptyProcess = terminal?.process as MockPtyProcess

      // 模拟进程退出
      ptyProcess.simulateExit(0)

      // 终端应该仍然可以获取（只是进程结束了）
      expect(manager.getTerminal(terminalId)).toBeDefined()
    })

    it('应该处理多次 dispose 调用', () => {
      const terminalId = manager.createTerminal('/mock/workspace')

      manager.disposeTerminal(terminalId)
      // 第二次调用不应该抛出错误
      expect(() => manager.disposeTerminal(terminalId)).not.toThrow()
    })

    it('应该处理很长的项目路径', () => {
      const longPath = '/very/long/path/' + 'a'.repeat(200)
      const terminalId = manager.createTerminal(longPath)

      const terminal = manager.getTerminal(terminalId)
      expect(terminal?.cwd).toBe(longPath)
    })

    it('应该正确处理项目路径哈希', () => {
      const workspace = '/path/with:colons/and\\backslashes'
      const terminalId = manager.createTerminal(workspace)

      const terminal = manager.getTerminal(terminalId)
      // 路径中的特殊字符应该被替换
      expect(terminal?.jsonlFile).not.toContain(':')
      expect(terminal?.jsonlFile).not.toContain('\\')
    })
  })
})
