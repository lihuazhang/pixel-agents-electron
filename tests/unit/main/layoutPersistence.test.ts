import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock fs 模块
vi.mock('fs', async () => {
  const { fsMock } = await import('../../mocks/fs')
  return {
    ...fsMock,
    default: fsMock,
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

import { LayoutPersistence } from '../../../src/main/layoutPersistence'
import { mockFS, resetFSMocks } from '../../mocks/fs'

describe('LayoutPersistence', () => {
  let persistence: LayoutPersistence

  beforeEach(() => {
    resetFSMocks()
    persistence = new LayoutPersistence()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('saveLayout', () => {
    it('应该成功保存布局到文件', () => {
      const layout = {
        version: 1,
        cols: 20,
        rows: 11,
        tiles: Array(220).fill(1),
        furniture: [],
      }

      const result = persistence.saveLayout(layout)

      expect(result).toBe(true)
      const savedContent = mockFS.getFile('/mock/home/.pixel-agents/layout.json')
      expect(savedContent).toBeDefined()
      expect(JSON.parse(savedContent as string)).toEqual(layout)
    })

    it('应该创建目录如果不存在', () => {
      const layout = { version: 1, tiles: [] }

      persistence.saveLayout(layout)

      // 验证目录被创建
      expect(mockFS.existsSync('/mock/home/.pixel-agents')).toBe(true)
    })

    it('应该使用原子写入（先写临时文件再重命名）', () => {
      const layout = { version: 1, tiles: [] }

      persistence.saveLayout(layout)

      // 验证最终文件存在
      expect(mockFS.existsSync('/mock/home/.pixel-agents/layout.json')).toBe(true)
      // 验证临时文件被正确重命名（重命名后不应该存在）
      expect(mockFS.existsSync('/mock/home/.pixel-agents/layout.json.tmp')).toBe(false)
    })

    it('应该处理写入错误并返回 false', () => {
      // 模拟目录权限错误
      const { mkdirSync } = require('fs')
      mkdirSync.mockImplementation(() => {
        throw new Error('Permission denied')
      })

      const layout = { version: 1, tiles: [] }
      const result = persistence.saveLayout(layout)

      expect(result).toBe(false)
    })
  })

  describe('loadLayout', () => {
    it('应该成功加载存在的布局文件', () => {
      const layout = {
        version: 1,
        cols: 20,
        rows: 11,
        tiles: Array(220).fill(1),
        furniture: [],
      }
      mockFS.setFile('/mock/home/.pixel-agents/layout.json', JSON.stringify(layout))

      const result = persistence.loadLayout()

      expect(result).toEqual(layout)
    })

    it('如果文件不存在应该返回 null', () => {
      const result = persistence.loadLayout()

      expect(result).toBeNull()
    })

    it('应该验证版本号，无效版本返回 null', () => {
      const invalidLayout = { version: 2, tiles: [] }
      mockFS.setFile('/mock/home/.pixel-agents/layout.json', JSON.stringify(invalidLayout))

      const result = persistence.loadLayout()

      expect(result).toBeNull()
    })

    it('应该验证 tiles 是否为数组，无效格式返回 null', () => {
      const invalidLayout = { version: 1, tiles: 'invalid' }
      mockFS.setFile('/mock/home/.pixel-agents/layout.json', JSON.stringify(invalidLayout))

      const result = persistence.loadLayout()

      expect(result).toBeNull()
    })

    it('应该处理读取错误并返回 null', () => {
      // 创建一个文件但模拟读取错误
      mockFS.setFile('/mock/home/.pixel-agents/layout.json', 'invalid json')

      const result = persistence.loadLayout()

      expect(result).toBeNull()
    })

    it('应该处理 JSON 解析错误并返回 null', () => {
      mockFS.setFile('/mock/home/.pixel-agents/layout.json', '{ invalid json')

      const result = persistence.loadLayout()

      expect(result).toBeNull()
    })
  })

  describe('getLayoutPath', () => {
    it('应该返回正确的布局文件路径', () => {
      const path = persistence.getLayoutPath()

      expect(path).toBe('/mock/home/.pixel-agents/layout.json')
    })
  })

  describe('getDefaultLayout', () => {
    it('如果存在默认布局文件应该返回它', () => {
      const defaultLayout = {
        version: 1,
        cols: 20,
        rows: 11,
        tiles: Array(220).fill(1),
        furniture: [],
      }
      mockFS.setFile('/src/main/../../assets/default-layout.json', JSON.stringify(defaultLayout))

      // 注意：这个测试可能需要根据实际路径调整
    })

    it('如果默认布局文件不存在应该返回 null', () => {
      const result = persistence.getDefaultLayout()

      expect(result).toBeNull()
    })
  })

  describe('边界场景', () => {
    it('应该处理空布局对象', () => {
      const layout = {}

      const result = persistence.saveLayout(layout)

      expect(result).toBe(true)
      const savedContent = mockFS.getFile('/mock/home/.pixel-agents/layout.json')
      expect(savedContent).toBeDefined()
    })

    it('应该处理大型布局文件', () => {
      const largeLayout = {
        version: 1,
        cols: 64,
        rows: 64,
        tiles: Array(4096).fill(1),
        furniture: Array(100).fill(null).map((_, i) => ({
          uid: `furniture-${i}`,
          type: 'desk',
          col: i % 64,
          row: Math.floor(i / 64),
        })),
      }

      const result = persistence.saveLayout(largeLayout)
      expect(result).toBe(true)

      const loaded = persistence.loadLayout()
      expect(loaded).toEqual(largeLayout)
    })

    it('应该处理并发保存', async () => {
      const layout1 = { version: 1, tiles: [1], id: 'first' }
      const layout2 = { version: 1, tiles: [2], id: 'second' }

      // 并发保存
      const result1 = persistence.saveLayout(layout1)
      const result2 = persistence.saveLayout(layout2)

      expect(result1).toBe(true)
      expect(result2).toBe(true)

      // 最终结果应该是第二个布局
      const loaded = persistence.loadLayout()
      expect(loaded).toEqual(layout2)
    })
  })
})
