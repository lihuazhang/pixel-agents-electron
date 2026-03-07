import { vi } from 'vitest'

export interface MockIPty {
  pid: number
  cols: number
  rows: number
  process: string
  handleFlowControl: boolean

  onData: (handler: (data: string) => void) => void
  onExit: (handler: (e: { exitCode: number; signal?: number }) => void) => void

  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  kill: (signal?: string) => void
  pause: () => void
  resume: () => void
  clear: () => void
}

export class MockPtyProcess implements MockIPty {
  pid = Math.floor(Math.random() * 100000)
  cols = 80
  rows = 24
  process = 'zsh'
  handleFlowControl = false

  private dataHandlers: ((data: string) => void)[] = []
  private exitHandlers: ((e: { exitCode: number; signal?: number }) => void)[] = []
  private isKilled = false

  constructor(
    public file: string,
    public args: string[],
    public options: any
  ) {
    // 模拟异步启动
    setTimeout(() => {
      this.dataHandlers.forEach((h) => h('\r\n$ '))
    }, 10)
  }

  onData(handler: (data: string) => void) {
    this.dataHandlers.push(handler)
  }

  onExit(handler: (e: { exitCode: number; signal?: number }) => void) {
    this.exitHandlers.push(handler)
  }

  write(data: string) {
    if (this.isKilled) return
    // 模拟命令执行
    if (data.includes('claude')) {
      this.dataHandlers.forEach((h) => h('Starting Claude...\r\n'))
    }
  }

  resize(cols: number, rows: number) {
    this.cols = cols
    this.rows = rows
  }

  kill(signal?: string) {
    if (this.isKilled) return
    this.isKilled = true
    this.exitHandlers.forEach((h) => h({ exitCode: 0, signal: signal ? parseInt(signal) : undefined }))
  }

  pause() {}
  resume() {}
  clear() {}

  // 测试辅助方法
  simulateOutput(data: string) {
    this.dataHandlers.forEach((h) => h(data))
  }

  simulateExit(exitCode: number, signal?: number) {
    this.exitHandlers.forEach((h) => h({ exitCode, signal }))
  }
}

// 直接导出 spawn 函数
export const spawn = vi.fn((file: string, args: string[], options: any) => {
  return new MockPtyProcess(file, args, options)
})

// 兼容旧代码的对象形式
export const mockNodePty = {
  spawn,
}

export function resetNodePtyMocks() {
  mockNodePty.spawn.mockClear()
}

// 默认导出
export default {
  spawn,
}
