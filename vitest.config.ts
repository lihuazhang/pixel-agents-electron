import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node', // 默认使用 node 环境 (主进程)
    include: ['tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.d.ts',
        'dist/',
        'release/',
        '*.config.*',
      ],
    },
    // Vitest 4 使用顶层选项
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
  resolve: {
    alias: {
      // 主进程别名
      '@main': path.resolve(__dirname, './src/main'),
      '@preload': path.resolve(__dirname, './src/preload'),
      // 渲染进程别名
      '@renderer': path.resolve(__dirname, './src/renderer/src'),
      '@office': path.resolve(__dirname, './src/renderer/src/office'),
      '@components': path.resolve(__dirname, './src/renderer/src/components'),
      '@hooks': path.resolve(__dirname, './src/renderer/src/hooks'),
    },
  },
  // 处理 Electron 和 Native 模块
  optimizeDeps: {
    exclude: ['electron', 'node-pty', 'chokidar'],
  },
})

