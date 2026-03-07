import type { SpriteData } from '../types.js'

const zoomCaches = new Map<number, WeakMap<SpriteData, HTMLCanvasElement>>()

// ── Outline sprite generation ─────────────────────────────────

const outlineCache = new WeakMap<SpriteData, SpriteData>()

/** Generate a 1px white outline SpriteData (2px larger in each dimension) */
export function getOutlineSprite(sprite: SpriteData): SpriteData {
  const cached = outlineCache.get(sprite)
  if (cached) return cached

  const rows = sprite.length
  const cols = sprite[0].length
  // Expanded grid: +2 in each dimension for 1px border
  const outline: string[][] = []
  for (let r = 0; r < rows + 2; r++) {
    outline.push(new Array<string>(cols + 2).fill(''))
  }

  // For each opaque pixel, mark its 4 cardinal neighbors as white
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const color = sprite[r][c]
      if (color === '' || color === 'transparent') continue
      const er = r + 1
      const ec = c + 1
      if (outline[er - 1][ec] === '') outline[er - 1][ec] = '#FFFFFF'
      if (outline[er + 1][ec] === '') outline[er + 1][ec] = '#FFFFFF'
      if (outline[er][ec - 1] === '') outline[er][ec - 1] = '#FFFFFF'
      if (outline[er][ec + 1] === '') outline[er][ec + 1] = '#FFFFFF'
    }
  }

  // Clear pixels that overlap with original opaque pixels
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const color = sprite[r][c]
      if (color !== '' && color !== 'transparent') {
        outline[r + 1][c + 1] = ''
      }
    }
  }

  outlineCache.set(sprite, outline)
  return outline
}

export function getCachedSprite(sprite: SpriteData, zoom: number): HTMLCanvasElement {
  let cache = zoomCaches.get(zoom)
  if (!cache) {
    cache = new WeakMap()
    zoomCaches.set(zoom, cache)
  }

  const cached = cache.get(sprite)
  if (cached) return cached

  const rows = sprite.length
  const cols = sprite[0].length
  const canvas = document.createElement('canvas')
  canvas.width = cols * zoom
  canvas.height = rows * zoom
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const color = sprite[r][c]
      if (color === '' || color === 'transparent') continue

      // Parse color - support #rgb, #rrggbb, #rgba, #rrggbbaa formats
      let fillStyle = color

      if (color.startsWith('#')) {
        const hexPart = color.slice(1)
        if (hexPart.length === 3) {
          // #rgb format - fully opaque
          fillStyle = color
        } else if (hexPart.length === 6) {
          // #rrggbb format - fully opaque
          fillStyle = color
        } else if (hexPart.length === 8) {
          // #rrggbbaa format - convert to rgba()
          const r = parseInt(hexPart.slice(0, 2), 16)
          const g = parseInt(hexPart.slice(2, 4), 16)
          const b = parseInt(hexPart.slice(4, 6), 16)
          const a = parseInt(hexPart.slice(6, 8), 16) / 255
          fillStyle = `rgba(${r},${g},${b},${a})`
        } else if (hexPart.length === 4) {
          // #rgba format - convert to rgba()
          const r = parseInt(hexPart[0].repeat(2), 16)
          const g = parseInt(hexPart[1].repeat(2), 16)
          const b = parseInt(hexPart[2].repeat(2), 16)
          const a = parseInt(hexPart[3].repeat(2), 16) / 255
          fillStyle = `rgba(${r},${g},${b},${a})`
        }
      }

      ctx.fillStyle = fillStyle
      ctx.fillRect(c * zoom, r * zoom, zoom, zoom)
    }
  }

  cache.set(sprite, canvas)
  return canvas
}
