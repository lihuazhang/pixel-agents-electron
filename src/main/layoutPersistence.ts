import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const LAYOUT_DIR = '.pixel-agents-electron'
const LAYOUT_FILE = 'layout.json'

export class LayoutPersistence {
  private layoutPath: string

  constructor() {
    this.layoutPath = path.join(os.homedir(), LAYOUT_DIR, LAYOUT_FILE)
  }

  saveLayout(layout: Record<string, unknown>): boolean {
    try {
      const dir = path.dirname(this.layoutPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      // Atomic write
      const tmpPath = this.layoutPath + '.tmp'
      fs.writeFileSync(tmpPath, JSON.stringify(layout, null, 2), 'utf-8')
      fs.renameSync(tmpPath, this.layoutPath)

      return true
    } catch (err) {
      console.error('[LayoutPersistence] Failed to save layout:', err)
      return false
    }
  }

  loadLayout(): Record<string, unknown> | null {
    try {
      // First, try to load from user directory
      if (fs.existsSync(this.layoutPath)) {
        const content = fs.readFileSync(this.layoutPath, 'utf-8')
        const layout = JSON.parse(content)

        if (layout.version !== 1 || !Array.isArray(layout.tiles)) {
          console.warn('[LayoutPersistence] Invalid layout file format in user directory')
          // Fall through to default layout
        } else {
          console.log('[LayoutPersistence] Loaded layout from user directory:', this.layoutPath)
          return layout
        }
      }

      // Fall back to default layout from @assets directory
      const defaultLayout = this.getDefaultLayout()
      if (defaultLayout) {
        console.log('[LayoutPersistence] Using default layout from @assets')
        console.log('[LayoutPersistence] Default layout cols:', defaultLayout.cols, 'rows:', defaultLayout.rows, 'tiles length:', (defaultLayout.tiles as Array<unknown>).length, 'furniture count:', Array.isArray(defaultLayout.furniture) ? defaultLayout.furniture.length : 0)
        return defaultLayout
      }

      console.warn('[LayoutPersistence] No layout found, returning null')
      return null
    } catch (err) {
      console.error('[LayoutPersistence] Failed to load layout:', err)
      return null
    }
  }

  getLayoutPath(): string {
    return this.layoutPath
  }

  getDefaultLayout(): Record<string, unknown> | null {
    // Try multiple paths to find the default layout in @assets directory
    const possiblePaths = [
      // Development: from dist/main/main.js -> project root/assets
      path.resolve(__dirname, '../../assets/default-layout.json'),
      // Development: electron-vite dev mode
      path.resolve(__dirname, '../../../assets/default-layout.json'),
      // Production: bundled app
      path.join(process.resourcesPath || '', 'assets', 'default-layout.json'),
      path.join(process.resourcesPath || '', 'app.asar.unpacked', 'assets', 'default-layout.json'),
      // Fallback: relative to app.getAppPath()
      path.join(require('electron').app.getAppPath(), 'assets', 'default-layout.json'),
    ]

    for (const defaultPath of possiblePaths) {
      if (fs.existsSync(defaultPath)) {
        console.log('[LayoutPersistence] Found default layout at:', defaultPath)
        return JSON.parse(fs.readFileSync(defaultPath, 'utf-8'))
      }
    }

    console.warn('[LayoutPersistence] Default layout not found at any expected location')
    return null
  }
}
