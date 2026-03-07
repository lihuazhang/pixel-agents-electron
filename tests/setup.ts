/**
 * Test Setup - 全局测试配置
 */

import { vi } from 'vitest'

// 设置全局 vi
declare global {
  var vi: typeof import('vitest').vi
}

// Mock 全局对象
globalThis.vi = vi

// 清理所有 mocks 在每个测试后
afterEach(() => {
  vi.clearAllMocks()
})
