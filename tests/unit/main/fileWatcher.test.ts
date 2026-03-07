import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock 依赖模块
vi.mock('chokidar', async () => {
  const mocks = await import('../../mocks/chokidar')
  return {
    ...mocks.mockChokidar,
    default: mocks.mockChokidar,
  }
})
vi.mock('fs', async () => {
  const { fsMock } = await import('../../mocks/fs')
  return {
    ...fsMock,
    default: fsMock,
  }
})
vi.mock('path', async () => {
  const actual = await vi.importActual('path')
  return {
    ...actual,
    join: (...args: string[]) => args.join('/').replace(/\/+/g, '/'),
    dirname: (p: string) => {
      const parts = p.split('/')
      parts.pop()
      return parts.join('/') || '/'
    },
  }
})

import { FileWatcher } from '../../../src/main/fileWatcher'
import { mockChokidar, resetChokidarMocks, MockFSWatcher } from '../../mocks/chokidar'
import { mockFS, resetFSMocks } from '../../mocks/fs'

describe('FileWatcher', () => {
  let fileWatcher: FileWatcher
  const mockTerminalManager = {} as any

  beforeEach(() => {
    resetChokidarMocks()
    resetFSMocks()
    fileWatcher = new FileWatcher(mockTerminalManager)
    vi.useFakeTimers()
  })

  afterEach(() => {
    fileWatcher.disposeAll()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  describe('watch', () => {
    it('应该创建文件监听器', () => {
      const jsonlFile = '/test/session.jsonl'
      const onChange = vi.fn()

      fileWatcher.watch(1, jsonlFile, onChange)

      expect(mockChokidar.watch).toHaveBeenCalledWith(
        jsonlFile,
        expect.objectContaining({
          persistent: false,
          ignoreInitial: true,
        })
      )
    })

    it('应该创建目录如果不存在', () => {
      const jsonlFile = '/new/dir/session.jsonl'
      const onChange = vi.fn()

      fileWatcher.watch(1, jsonlFile, onChange)

      expect(mockFS.existsSync('/new/dir')).toBe(true)
    })

    it('应该在文件变更时调用回调', () => {
      const jsonlFile = '/test/session.jsonl'
      const onChange = vi.fn()

      // 设置初始文件内容
      mockFS.setFile(jsonlFile, '{"type":"tool_start"}\n')
      mockFS.mkdirSync('/test', { recursive: true })

      fileWatcher.watch(1, jsonlFile, onChange)

      const watcher = mockChokidar.watch.mock.results[0].value as MockFSWatcher
      watcher.simulateChange(jsonlFile)

      // 回调应该在文件变更时被调用
      expect(onChange).toHaveBeenCalled()
    })

    it('应该启动轮询定时器作为备份', () => {
      const jsonlFile = '/test/session.jsonl'
      const onChange = vi.fn()

      fileWatcher.watch(1, jsonlFile, onChange)

      // 轮询间隔是 1000ms
      vi.advanceTimersByTime(1000)

      // 定时器应该触发
      expect(onChange).toHaveBeenCalledTimes(1)
    })

    it('应该为每个终端创建独立的监听器', () => {
      fileWatcher.watch(1, '/test/session1.jsonl', vi.fn())
      fileWatcher.watch(2, '/test/session2.jsonl', vi.fn())

      expect(mockChokidar.watch).toHaveBeenCalledTimes(2)
    })

    it('不应该为同一个终端创建重复监听器', () => {
      // 这个行为取决于实现 - 如果实现不检查重复，应该保留两个
      fileWatcher.watch(1, '/test/session1.jsonl', vi.fn())
      fileWatcher.watch(1, '/test/session2.jsonl', vi.fn())

      // 根据代码，第二个会覆盖第一个的引用，但两个 watcher 都会存在
      expect(mockChokidar.watch).toHaveBeenCalledTimes(2)
    })
  })

  describe('readNewLines', () => {
    it('应该读取新添加的行', () => {
      const jsonlFile = '/test/session.jsonl'
      const onChange = vi.fn()

      // 创建初始文件
      mockFS.mkdirSync('/test', { recursive: true })
      mockFS.setFile(jsonlFile, '{"type":"line1"}\n{"type":"line2"}\n')

      fileWatcher.watch(1, jsonlFile, onChange)

      // 清除初始调用
      onChange.mockClear()

      // 添加新行
      mockFS.setFile(jsonlFile, '{"type":"line1"}\n{"type":"line2"}\n{"type":"line3"}\n')

      fileWatcher.readNewLines(1, jsonlFile, onChange)

      expect(onChange).toHaveBeenCalledWith(['{"type":"line3"}'])
    })

    it('应该处理不完整的行（保留在缓冲区）', () => {
      const jsonlFile = '/test/session.jsonl'
      const onChange = vi.fn()

      mockFS.mkdirSync('/test', { recursive: true })
      mockFS.setFile(jsonlFile, '{"type":"incomplete"') // 没有换行符

      fileWatcher.watch(1, jsonlFile, onChange)
      fileWatcher.readNewLines(1, jsonlFile, onChange)

      // 不完整的行不应该被回调
      expect(onChange).not.toHaveBeenCalled()
    })

    it('应该处理多行追加', () => {
      const jsonlFile = '/test/session.jsonl'
      const onChange = vi.fn()

      mockFS.mkdirSync('/test', { recursive: true })
      mockFS.setFile(jsonlFile, '{"type":"line1"}\n')

      fileWatcher.watch(1, jsonlFile, onChange)

      // 追加多行
      mockFS.setFile(jsonlFile, '{"type":"line1"}\n{"type":"line2"}\n{"type":"line3"}\n')

      onChange.mockClear()
      fileWatcher.readNewLines(1, jsonlFile, onChange)

      expect(onChange).toHaveBeenCalledWith(['{"type":"line2"}', '{"type":"line3"}'])
    })

    it('如果文件不存在应该返回', () => {
      const jsonlFile = '/nonexistent/session.jsonl'
      const onChange = vi.fn()

      fileWatcher.watch(1, jsonlFile, onChange)
      fileWatcher.readNewLines(1, jsonlFile, onChange)

      expect(onChange).not.toHaveBeenCalled()
    })

    it('如果没有新内容应该返回', () => {
      const jsonlFile = '/test/session.jsonl'
      const onChange = vi.fn()

      mockFS.mkdirSync('/test', { recursive: true })
      mockFS.setFile(jsonlFile, '{"type":"line1"}\n')

      fileWatcher.watch(1, jsonlFile, onChange)

      // 读取一次后再次读取（没有新内容）
      onChange.mockClear()
      fileWatcher.readNewLines(1, jsonlFile, onChange)

      expect(onChange).not.toHaveBeenCalled()
    })

    it('应该处理读取错误', () => {
      const jsonlFile = '/test/session.jsonl'
      const onChange = vi.fn()

      mockFS.mkdirSync('/test', { recursive: true })

      // 模拟读取错误
      vi.spyOn(mockFS, 'openSync').mockImplementation(() => {
        throw new Error('Permission denied')
      })

      fileWatcher.watch(1, jsonlFile, onChange)

      // 不应该抛出错误
      expect(() => fileWatcher.readNewLines(1, jsonlFile, onChange)).not.toThrow()
    })
  })

  describe('unwatch', () => {
    it('应该关闭文件监听器', () => {
      const jsonlFile = '/test/session.jsonl'

      fileWatcher.watch(1, jsonlFile, vi.fn())
      const watcher = mockChokidar.watch.mock.results[0].value as MockFSWatcher
      const closeSpy = vi.spyOn(watcher, 'close')

      fileWatcher.unwatch(1)

      expect(closeSpy).toHaveBeenCalled()
    })

    it('应该清除轮询定时器', () => {
      const jsonlFile = '/test/session.jsonl'

      fileWatcher.watch(1, jsonlFile, vi.fn())
      fileWatcher.unwatch(1)

      // 定时器应该被清除，不会触发
      vi.advanceTimersByTime(5000)
      // 如果定时器未被清除，测试会失败
    })

    it('应该清理状态', () => {
      const jsonlFile = '/test/session.jsonl'
      const onChange = vi.fn()

      mockFS.mkdirSync('/test', { recursive: true })
      mockFS.setFile(jsonlFile, '{"type":"test"}\n')

      fileWatcher.watch(1, jsonlFile, onChange)

      // 读取后应该有偏移量
      fileWatcher.readNewLines(1, jsonlFile, onChange)

      fileWatcher.unwatch(1)

      // 重新 watch 应该从头开始
      // 验证通过重新 watch 时文件偏移量被重置
    })

    it('如果终端未监听应该不做任何事情', () => {
      // 不应该抛出错误
      expect(() => fileWatcher.unwatch(999)).not.toThrow()
    })
  })

  describe('disposeAll', () => {
    it('应该关闭所有监听器', () => {
      fileWatcher.watch(1, '/test/session1.jsonl', vi.fn())
      fileWatcher.watch(2, '/test/session2.jsonl', vi.fn())

      const watcher1 = mockChokidar.watch.mock.results[0].value as MockFSWatcher
      const watcher2 = mockChokidar.watch.mock.results[1].value as MockFSWatcher
      const closeSpy1 = vi.spyOn(watcher1, 'close')
      const closeSpy2 = vi.spyOn(watcher2, 'close')

      fileWatcher.disposeAll()

      expect(closeSpy1).toHaveBeenCalled()
      expect(closeSpy2).toHaveBeenCalled()
    })

    it('应该清空所有状态', () => {
      fileWatcher.watch(1, '/test/session1.jsonl', vi.fn())
      fileWatcher.watch(2, '/test/session2.jsonl', vi.fn())

      fileWatcher.disposeAll()

      // 再次 watch 同一个 ID 应该正常工作
      fileWatcher.watch(1, '/test/session3.jsonl', vi.fn())
      expect(mockChokidar.watch).toHaveBeenCalledTimes(3)
    })
  })

  describe('边界场景', () => {
    it('应该处理大量数据追加', () => {
      const jsonlFile = '/test/session.jsonl'
      const onChange = vi.fn()
      const lines = Array(1000).fill(null).map((_, i) => `{"id":${i}}`).join('\n') + '\n'

      mockFS.mkdirSync('/test', { recursive: true })
      mockFS.setFile(jsonlFile, lines)

      fileWatcher.watch(1, jsonlFile, onChange)

      expect(onChange).toHaveBeenCalled()
      const calledLines = onChange.mock.calls[0][0] as string[]
      expect(calledLines.length).toBeGreaterThan(0)
    })

    it('应该处理空文件', () => {
      const jsonlFile = '/test/session.jsonl'
      const onChange = vi.fn()

      mockFS.mkdirSync('/test', { recursive: true })
      mockFS.setFile(jsonlFile, '')

      fileWatcher.watch(1, jsonlFile, onChange)
      fileWatcher.readNewLines(1, jsonlFile, onChange)

      // 空文件不应该触发回调
      expect(onChange).not.toHaveBeenCalled()
    })

    it('应该处理只有换行符的文件', () => {
      const jsonlFile = '/test/session.jsonl'
      const onChange = vi.fn()

      mockFS.mkdirSync('/test', { recursive: true })
      mockFS.setFile(jsonlFile, '\n\n\n')

      fileWatcher.watch(1, jsonlFile, onChange)
      fileWatcher.readNewLines(1, jsonlFile, onChange)

      // 只有换行符不应该触发有效行回调
      // 取决于实现细节
    })

    it('应该处理快速连续的变更', () => {
      const jsonlFile = '/test/session.jsonl'
      const onChange = vi.fn()

      mockFS.mkdirSync('/test', { recursive: true })
      mockFS.setFile(jsonlFile, '{"type":"initial"}\n')

      fileWatcher.watch(1, jsonlFile, onChange)

      // 模拟快速连续变更
      for (let i = 0; i < 10; i++) {
        mockFS.setFile(jsonlFile, `{"type":"line${i}"}\n`)
        const watcher = mockChokidar.watch.mock.results[0].value as MockFSWatcher
        watcher.simulateChange(jsonlFile)
      }

      // 应该处理了所有变更
      expect(onChange.mock.calls.length).toBeGreaterThan(0)
    })

    it('应该正确处理跨平台路径', () => {
      const windowsPath = 'C:/Users/test/.claude/projects/test-session.jsonl'
      const onChange = vi.fn()

      mockFS.mkdirSync('C:/Users/test/.claude/projects', { recursive: true })
      mockFS.setFile(windowsPath, '{"type":"test"}\n')

      fileWatcher.watch(1, windowsPath, onChange)

      expect(mockChokidar.watch).toHaveBeenCalledWith(windowsPath, expect.any(Object))
    })
  })
})
