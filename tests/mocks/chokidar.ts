import { vi } from 'vitest'
import type { FSWatcher } from 'chokidar'

export class MockFSWatcher implements FSWatcher {
  private eventHandlers: Record<string, ((path: string) => void)[]> = {}
  private isClosed = false

  on(event: string, handler: (path: string) => void): this {
    if (!this.eventHandlers[event]) {
      this.eventHandlers[event] = []
    }
    this.eventHandlers[event].push(handler)
    return this
  }

  once(event: string, handler: (path: string) => void): this {
    const onceHandler = (path: string) => {
      handler(path)
      this.off(event, onceHandler)
    }
    return this.on(event, onceHandler)
  }

  off(event: string, handler: (path: string) => void): this {
    if (this.eventHandlers[event]) {
      const idx = this.eventHandlers[event].indexOf(handler)
      if (idx > -1) {
        this.eventHandlers[event].splice(idx, 1)
      }
    }
    return this
  }

  emit(event: string, path: string): boolean {
    if (this.isClosed) return false
    const handlers = this.eventHandlers[event]
    if (handlers) {
      handlers.forEach((h) => h(path))
      return true
    }
    return false
  }

  close(): Promise<void> {
    this.isClosed = true
    this.eventHandlers = {}
    return Promise.resolve()
  }

  // 测试辅助方法
  simulateChange(path: string) {
    this.emit('change', path)
  }

  simulateAdd(path: string) {
    this.emit('add', path)
  }

  simulateUnlink(path: string) {
    this.emit('unlink', path)
  }
}

// 直接导出 watch 函数
export const watch = vi.fn((paths: string | string[], options?: any): MockFSWatcher => {
  return new MockFSWatcher()
})

// 兼容旧代码的对象形式
export const mockChokidar = {
  watch,
}

export function resetChokidarMocks() {
  mockChokidar.watch.mockClear()
}

// 默认导出
export default {
  watch,
}
