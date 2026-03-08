import * as fs from 'fs'
import * as path from 'path'
import { PNG } from 'pngjs'
import { app } from 'electron'

export interface SpriteData {
  pixels: string[][]
  width: number
  height: number
}

export interface FurnitureAsset {
  id: string
  name: string
  label: string
  category: string
  file: string
  width: number
  height: number
  footprintW: number
  footprintH: number
  isDesk: boolean
  canPlaceOnWalls: boolean
  canPlaceOnSurfaces?: boolean
  backgroundTiles?: number
  groupId?: string
  orientation?: string
  state?: string
}

export class AssetLoader {
  private assetsRoot: string

  constructor() {
    this.assetsRoot = this.getAssetsRoot()
  }

  private getAssetsRoot(): string {
    // Try multiple paths to find assets directory
    const possiblePaths = [
      // Development: project root assets folder (from dist/main/main.js -> project root)
      path.resolve(__dirname, '../../assets'),
      // Development: electron-vite dev mode (from dist/main/main.js -> project root)
      path.resolve(__dirname, '../../../assets'),
      // Production: bundled app assets (app.getAppPath() returns app root)
      path.resolve(app.getAppPath(), 'assets'),
      // Production: electron-builder puts assets in resources
      path.join(process.resourcesPath || '', 'assets'),
      // Production: alternative resources path
      path.join(process.resourcesPath || '', 'app', 'assets'),
      // Production: app.asar.unpacked
      path.join(process.resourcesPath || '', 'app.asar.unpacked', 'assets'),
    ]

    console.log('[AssetLoader] Searching for assets in:')
    for (const assetsPath of possiblePaths) {
      const exists = fs.existsSync(assetsPath)
      console.log(`  ${exists ? '✓' : '✗'} ${assetsPath}`)
      if (exists) {
        // Verify it's actually a directory with expected content
        try {
          const stat = fs.statSync(assetsPath)
          if (stat.isDirectory()) {
            const files = fs.readdirSync(assetsPath)
            console.log(`[AssetLoader] Selected assets directory: ${assetsPath} (${files.length} items)`)
            return assetsPath
          }
        } catch (err) {
          console.warn(`[AssetLoader] Error accessing ${assetsPath}:`, err)
        }
      }
    }

    console.error('[AssetLoader] No valid assets directory found!')
    console.error('[AssetLoader] __dirname:', __dirname)
    console.error('[AssetLoader] app.getAppPath():', app.getAppPath())
    console.error('[AssetLoader] process.resourcesPath:', process.resourcesPath)
    return ''
  }

  loadCharacterSprites(): Array<{ down: string[][][]; up: string[][][]; right: string[][][] }> {
    const characters: Array<{ down: string[][][]; up: string[][][]; right: string[][][] }> = []
    const charsDir = path.join(this.assetsRoot, 'characters')

    if (!fs.existsSync(charsDir)) {
      console.warn('[AssetLoader] Characters directory not found')
      return characters
    }

    for (let i = 0; i < 6; i++) {
      const pngPath = path.join(charsDir, `char_${i}.png`)
      if (fs.existsSync(pngPath)) {
        const png = this.loadPng(pngPath)
        const sprite = this.parseCharacterPng(png)
        characters.push(sprite)
      }
    }

    return characters
  }

  loadFloorTiles(): string[][][] {
    const floorsPath = path.join(this.assetsRoot, 'floors.png')
    if (!fs.existsSync(floorsPath)) {
      console.warn('[AssetLoader] floors.png not found')
      return []
    }

    const png = this.loadPng(floorsPath)
    return this.parseFloorTiles(png)
  }

  loadWallTiles(): string[][][] {
    const wallsPath = path.join(this.assetsRoot, 'walls.png')
    if (!fs.existsSync(wallsPath)) {
      console.warn('[AssetLoader] walls.png not found')
      return []
    }

    const png = this.loadPng(wallsPath)
    return this.parseWallTiles(png)
  }

  loadFurnitureAssets(): { catalog: FurnitureAsset[]; sprites: Record<string, string[][]> } {
    const catalogPath = path.join(this.assetsRoot, 'furniture', 'furniture-catalog.json')
    const sprites: Record<string, string[][]> = {}

    let catalog: FurnitureAsset[] = []
    if (fs.existsSync(catalogPath)) {
      const catalogData = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'))
      // Catalog file structure is { version, timestamp, totalAssets, categories, assets }
      catalog = catalogData.assets || catalogData
    }

    // Load furniture sprites using asset IDs as keys
    // Map from asset ID to file path for lookup
    const assetFileMap = new Map<string, string>()
    for (const asset of catalog) {
      if (asset.file) {
        assetFileMap.set(asset.id, asset.file)
      }
    }

    // Load sprites for each asset using the catalog mapping
    for (const [assetId, file] of assetFileMap.entries()) {
      const pngPath = path.join(this.assetsRoot, file)
      if (fs.existsSync(pngPath)) {
        try {
          const png = this.loadPng(pngPath)
          const spriteData = this.pngToSpriteData(png)
          sprites[assetId] = spriteData
        } catch (err) {
          console.warn(`[AssetLoader] Failed to load sprite for ${assetId}:`, err)
        }
      } else {
        console.warn(`[AssetLoader] Sprite not found for ${assetId} at ${pngPath}`)
      }
    }

    return { catalog, sprites }
  }

  private loadPng(filePath: string): PNG {
    const buffer = fs.readFileSync(filePath)
    return PNG.sync.read(buffer)
  }

  private parseCharacterPng(png: PNG): { down: string[][][]; up: string[][][]; right: string[][][] } {
    // Character sprites: 7 frames × 16px wide, 3 direction rows × 32px tall
    // Row 0 = down, Row 1 = up, Row 2 = right
    // Actual character height is 29px (legs/feet extend to row 28), with 3px transparent padding at bottom
    const frames = 7
    const frameWidth = 16
    const rowHeight = 32
    const pixelHeight = 31 // Actual sprite height including legs/feet (bottom 1px is transparent padding)

    const down: string[][][] = []
    const up: string[][][] = []
    const right: string[][][] = []

    for (let f = 0; f < frames; f++) {
      const frameData: string[][] = []
      const x = f * frameWidth

      // Parse each row
      for (let row = 0; row < 3; row++) {
        const y = row * rowHeight
        const direction: string[][] = []

        for (let dy = 0; dy < pixelHeight; dy++) {
          const pixelRow: string[] = []
          for (let dx = 0; dx < frameWidth; dx++) {
            const idx = ((y + dy) * png.width + (x + dx)) * 4
            const r = png.data[idx]
            const g = png.data[idx + 1]
            const b = png.data[idx + 2]
            const a = png.data[idx + 3]

            if (a >= 128) {
              pixelRow.push(`#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`)
            } else {
              pixelRow.push('transparent')
            }
          }
          direction.push(pixelRow)
        }

        if (row === 0) down.push(direction)
        else if (row === 1) up.push(direction)
        else if (row === 2) right.push(direction)
      }
    }

    return { down, up, right }
  }

  private parseFloorTiles(png: PNG): string[][][] {
    // 7 patterns, 16×16 each
    const tiles: string[][][] = []
    const patternWidth = 16
    const tileCount = 7

    for (let i = 0; i < tileCount; i++) {
      const x = i * patternWidth
      const tile = this.extractTile(png, x, 0, patternWidth, patternWidth)
      tiles.push(tile)
    }

    return tiles
  }

  private parseWallTiles(png: PNG): string[][][] {
    // 4×4 grid of 16×32 pieces (16 auto-tile combinations)
    const tiles: string[][][] = []
    const pieceWidth = 16
    const pieceHeight = 32
    const cols = 4

    for (let i = 0; i < 16; i++) {
      const col = i % cols
      const row = Math.floor(i / cols)
      const x = col * pieceWidth
      const y = row * pieceHeight
      const tile = this.extractTile(png, x, y, pieceWidth, pieceHeight)
      tiles.push(tile)
    }

    return tiles
  }

  private extractTile(png: PNG, x: number, y: number, width: number, height: number): string[][] {
    const tile: string[][] = []
    for (let ty = 0; ty < height; ty++) {
      const row: string[] = []
      for (let tx = 0; tx < width; tx++) {
        const idx = ((y + ty) * png.width + (x + tx)) * 4
        const r = png.data[idx]
        const g = png.data[idx + 1]
        const b = png.data[idx + 2]
        const a = png.data[idx + 3]

        if (a >= 128) {
          row.push(`#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`)
        } else {
          row.push('transparent')
        }
      }
      tile.push(row)
    }
    return tile
  }

  private pngToSpriteData(png: PNG): string[][] {
    const data: string[][] = []
    for (let y = 0; y < png.height; y++) {
      const row: string[] = []
      for (let x = 0; x < png.width; x++) {
        const idx = (y * png.width + x) * 4
        const r = png.data[idx]
        const g = png.data[idx + 1]
        const b = png.data[idx + 2]
        const a = png.data[idx + 3]

        if (a === 0) {
          // Fully transparent
          row.push('')
        } else if (a < 255) {
          // Semi-transparent (shadows) - convert to solid dark shadow color
          // Use a dark gray/brown shadow similar to hand-drawn sprites (#6B4E0A)
          row.push('#4a4a4a')
        } else {
          // Fully opaque
          row.push(`#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`)
        }
      }
      data.push(row)
    }
    return data
  }
}
