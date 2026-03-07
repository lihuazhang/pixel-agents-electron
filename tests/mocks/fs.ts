/**
 * fs Mock - 用于测试文件系统操作
 */

import { vi } from 'vitest'

export interface MockFileSystem {
  [path: string]: string | Buffer | MockFileSystem
}

export class MockFS {
  private files: Map<string, string | Buffer> = new Map()
  private dirs: Set<string> = new Set()

  constructor(initialFiles: MockFileSystem = {}) {
    this.populate(initialFiles, '/')
  }

  private populate(files: MockFileSystem, basePath: string) {
    for (const [name, content] of Object.entries(files)) {
      const fullPath = basePath === '/' ? `/${name}` : `${basePath}/${name}`
      if (typeof content === 'string' || Buffer.isBuffer(content)) {
        this.files.set(fullPath, content)
      } else {
        this.dirs.add(fullPath)
        this.populate(content, fullPath)
      }
    }
  }

  // fs.existsSync mock
  existsSync(path: string): boolean {
    return this.files.has(path) || this.dirs.has(path)
  }

  // fs.readFileSync mock
  readFileSync(path: string, encoding?: string): string | Buffer {
    const content = this.files.get(path)
    if (content === undefined) {
      const error = new Error(`ENOENT: no such file or directory, open '${path}'`)
      ;(error as any).code = 'ENOENT'
      throw error
    }
    if (encoding === 'utf-8' || encoding === 'utf8') {
      return content.toString()
    }
    return content
  }

  // fs.writeFileSync mock
  writeFileSync(path: string, data: string | Buffer, encoding?: string) {
    this.files.set(path, Buffer.isBuffer(data) ? data : Buffer.from(data))
  }

  // fs.mkdirSync mock
  mkdirSync(path: string, options?: { recursive?: boolean }) {
    if (options?.recursive) {
      // 创建所有父目录
      const parts = path.split('/').filter(Boolean)
      let currentPath = ''
      for (const part of parts) {
        currentPath += `/${part}`
        this.dirs.add(currentPath)
      }
    } else {
      this.dirs.add(path)
    }
  }

  // fs.statSync mock
  statSync(path: string) {
    const isFile = this.files.has(path)
    const isDir = this.dirs.has(path)

    if (!isFile && !isDir) {
      const error = new Error(`ENOENT: no such file or directory, stat '${path}'`)
      ;(error as any).code = 'ENOENT'
      throw error
    }

    const content = this.files.get(path)
    const size = content ? content.length : 0

    return {
      isFile: () => isFile,
      isDirectory: () => isDir,
      size,
      mtime: new Date(),
      ctime: new Date(),
      birthtime: new Date(),
    }
  }

  // fs.readdirSync mock
  readdirSync(path: string): string[] {
    if (!this.dirs.has(path)) {
      const error = new Error(`ENOENT: no such file or directory, scandir '${path}'`)
      ;(error as any).code = 'ENOENT'
      throw error
    }

    const items: string[] = []
    const prefix = path === '/' ? '/' : `${path}/`

    for (const file of this.files.keys()) {
      if (file.startsWith(prefix)) {
        const relativePath = file.slice(prefix.length)
        const parts = relativePath.split('/')
        if (parts.length === 1 && parts[0]) {
          items.push(parts[0])
        }
      }
    }

    for (const dir of this.dirs) {
      if (dir.startsWith(prefix) && dir !== path) {
        const relativePath = dir.slice(prefix.length)
        const parts = relativePath.split('/')
        if (parts.length === 1 && parts[0] && !items.includes(parts[0])) {
          items.push(parts[0])
        }
      }
    }

    return items
  }

  // fs.unlinkSync mock
  unlinkSync(path: string) {
    this.files.delete(path)
  }

  // fs.rmdirSync mock
  rmdirSync(path: string) {
    this.dirs.delete(path)
  }

  // fs.renameSync mock
  renameSync(oldPath: string, newPath: string) {
    const content = this.files.get(oldPath)
    if (content !== undefined) {
      this.files.delete(oldPath)
      this.files.set(newPath, content)
    }
  }

  // fs.openSync mock
  openSync(path: string, flags: string): number {
    return 1 // mock fd
  }

  // fs.closeSync mock
  closeSync(fd: number) {
    // no-op
  }

  // fs.readSync mock
  readSync(fd: number, buffer: Buffer, offset: number, length: number, position: number): number {
    // 简化实现：查找已知的文件并读取内容
    for (const [filePath, content] of files.entries()) {
      const contentBuffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8')
      if (position < contentBuffer.length) {
        const toRead = Math.min(length, contentBuffer.length - position)
        contentBuffer.copy(buffer, offset, position, position + toRead)
        return toRead
      }
    }
    return 0
  }

  // 测试辅助方法
  setFile(path: string, content: string | Buffer) {
    this.files.set(path, content)
  }

  getFile(path: string): string | Buffer | undefined {
    return this.files.get(path)
  }

  clear() {
    this.files.clear()
    this.dirs.clear()
  }
}

// 创建全局 mockFS 实例
export const mockFS = new MockFS()

// fs mock 函数 - 直接导出函数
export const existsSync = vi.fn((path: string) => mockFS.existsSync(path))
export const readFileSync = vi.fn((path: string, encoding?: string) => mockFS.readFileSync(path, encoding))
export const writeFileSync = vi.fn((path: string, data: string | Buffer, encoding?: string) =>
  mockFS.writeFileSync(path, data, encoding)
)
export const mkdirSync = vi.fn((path: string, options?: { recursive?: boolean }) => mockFS.mkdirSync(path, options))
export const statSync = vi.fn((path: string) => mockFS.statSync(path))
export const readdirSync = vi.fn((path: string) => mockFS.readdirSync(path))
export const unlinkSync = vi.fn((path: string) => mockFS.unlinkSync(path))
export const rmdirSync = vi.fn((path: string) => mockFS.rmdirSync(path))
export const renameSync = vi.fn((oldPath: string, newPath: string) => mockFS.renameSync(oldPath, newPath))
export const openSync = vi.fn((path: string, flags: string) => mockFS.openSync(path, flags))
export const closeSync = vi.fn((fd: number) => mockFS.closeSync(fd))
export const readSync = vi.fn((fd: number, buffer: Buffer, offset: number, length: number, position: number) =>
  mockFS.readSync(fd, buffer, offset, length, position)
)

// 兼容旧代码的对象形式
export const fsMock = {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  statSync,
  readdirSync,
  unlinkSync,
  rmdirSync,
  renameSync,
  openSync,
  closeSync,
  readSync,
}

export function resetFSMocks() {
  mockFS.clear()
  vi.clearAllMocks()
}
