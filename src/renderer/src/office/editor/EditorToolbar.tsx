import { useState, useEffect, useRef, useCallback } from 'react'
import { EditTool } from '../types.js'
import type { TileType as TileTypeVal, FloorColor } from '../types.js'
import { getCatalogByCategory, buildDynamicCatalog, getActiveCategories } from '../layout/furnitureCatalog.js'
import type { FurnitureCategory, LoadedAssetData } from '../layout/furnitureCatalog.js'
import { getCachedSprite } from '../sprites/spriteCache.js'
import { getColorizedFloorSprite, getFloorPatternCount, hasFloorSprites } from '../floorTiles.js'

// Enhanced button styles with CSS variables
const btnStyle: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: '20px',
  background: 'var(--pixel-btn-bg)',
  color: 'var(--pixel-text-dim)',
  border: '2px solid transparent',
  borderRadius: 0,
  cursor: 'pointer',
  transition: 'all 0.1s ease',
}

const activeBtnStyle: React.CSSProperties = {
  ...btnStyle,
  background: 'var(--pixel-active-bg)',
  color: 'var(--pixel-text)',
  border: '2px solid var(--pixel-accent)',
  boxShadow: '0 0 8px rgba(90, 140, 255, 0.3)',
}

const tabStyle: React.CSSProperties = {
  padding: '3px 8px',
  fontSize: '18px',
  background: 'transparent',
  color: 'var(--pixel-text-muted)',
  border: '2px solid transparent',
  borderRadius: 0,
  cursor: 'pointer',
  transition: 'all 0.1s ease',
}

const activeTabStyle: React.CSSProperties = {
  ...tabStyle,
  background: 'var(--pixel-btn-bg)',
  color: 'var(--pixel-text)',
  border: '2px solid var(--pixel-accent)',
}

interface EditorToolbarProps {
  activeTool: EditTool
  selectedTileType: TileTypeVal
  selectedFurnitureType: string
  selectedFurnitureUid: string | null
  selectedFurnitureColor: FloorColor | null
  floorColor: FloorColor
  wallColor: FloorColor
  onToolChange: (tool: EditTool) => void
  onTileTypeChange: (type: TileTypeVal) => void
  onFloorColorChange: (color: FloorColor) => void
  onWallColorChange: (color: FloorColor) => void
  onSelectedFurnitureColorChange: (color: FloorColor | null) => void
  onFurnitureTypeChange: (type: string) => void
  loadedAssets?: LoadedAssetData
}

/** Render a floor pattern preview at 2x (32x32 canvas showing the 16x16 tile) */
function FloorPatternPreview({ patternIndex, color, selected, onClick }: {
  patternIndex: number
  color: FloorColor
  selected: boolean
  onClick: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const displaySize = 32
  const tileZoom = 2

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = displaySize
    canvas.height = displaySize
    ctx.imageSmoothingEnabled = false

    if (!hasFloorSprites()) {
      ctx.fillStyle = '#444'
      ctx.fillRect(0, 0, displaySize, displaySize)
      return
    }

    const sprite = getColorizedFloorSprite(patternIndex, color)
    const cached = getCachedSprite(sprite, tileZoom)
    ctx.drawImage(cached, 0, 0)
  }, [patternIndex, color])

  return (
    <button
      onClick={onClick}
      title={`Floor pattern ${patternIndex}`}
      style={{
        width: displaySize,
        height: displaySize,
        padding: 0,
        border: selected ? '2px solid var(--pixel-accent)' : '2px solid var(--pixel-border)',
        borderRadius: 0,
        cursor: 'pointer',
        overflow: 'hidden',
        flexShrink: 0,
        background: '#2A2A3A',
        transition: 'all 0.1s ease',
        boxShadow: selected ? '0 0 6px rgba(90, 140, 255, 0.4)' : 'none',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: displaySize, height: displaySize, display: 'block' }}
      />
    </button>
  )
}

/** Slider control for a single color parameter */
function ColorSlider({ label, value, min, max, onChange }: {
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  const [isDragging, setIsDragging] = useState(false)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 0',
      }}
    >
      <span style={{
        fontSize: '18px',
        color: 'var(--pixel-text-muted)',
        width: 24,
        textAlign: 'center',
        flexShrink: 0,
        fontWeight: 'bold',
      }}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onMouseDown={() => setIsDragging(true)}
        onMouseUp={() => setIsDragging(false)}
        onMouseLeave={() => setIsDragging(false)}
        style={{
          flex: 1,
          height: 10,
          accentColor: 'var(--pixel-accent)',
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
      />
      <span style={{
        fontSize: '18px',
        color: 'var(--pixel-text-dim)',
        width: 44,
        textAlign: 'right',
        flexShrink: 0,
        fontFamily: 'monospace',
      }}>{value}</span>
    </div>
  )
}

const DEFAULT_FURNITURE_COLOR: FloorColor = { h: 0, s: 0, b: 0, c: 0 }

// Tool definitions with keyboard shortcuts
const TOOLS = [
  { id: EditTool.TILE_PAINT, label: 'Floor', shortcut: 'F', title: 'Paint floor tiles (F)' },
  { id: EditTool.WALL_PAINT, label: 'Wall', shortcut: 'W', title: 'Paint walls - click to toggle (W)' },
  { id: EditTool.ERASE, label: 'Erase', shortcut: 'E', title: 'Erase tiles to void (E)' },
  { id: EditTool.FURNITURE_PLACE, label: 'Furniture', shortcut: 'R', title: 'Place furniture (R)' },
] as const

export function EditorToolbar({
  activeTool,
  selectedTileType,
  selectedFurnitureType,
  selectedFurnitureUid,
  selectedFurnitureColor,
  floorColor,
  wallColor,
  onToolChange,
  onTileTypeChange,
  onFloorColorChange,
  onWallColorChange,
  onSelectedFurnitureColorChange,
  onFurnitureTypeChange,
  loadedAssets,
}: EditorToolbarProps) {
  const [activeCategory, setActiveCategory] = useState<FurnitureCategory>('desks')
  const [showColor, setShowColor] = useState(false)
  const [showWallColor, setShowWallColor] = useState(false)
  const [showFurnitureColor, setShowFurnitureColor] = useState(false)
  const [hoveredTool, setHoveredTool] = useState<string | null>(null)

  // Build dynamic catalog from loaded assets
  useEffect(() => {
    if (loadedAssets) {
      try {
        console.log(`[EditorToolbar] Building dynamic catalog with ${loadedAssets.catalog.length} assets...`)
        const success = buildDynamicCatalog(loadedAssets)
        console.log(`[EditorToolbar] Catalog build result: ${success}`)

        // Reset to first available category if current doesn't exist
        const activeCategories = getActiveCategories()
        if (activeCategories.length > 0) {
          const firstCat = activeCategories[0]?.id
          if (firstCat) {
            console.log(`[EditorToolbar] Setting active category to: ${firstCat}`)
            setActiveCategory(firstCat)
          }
        }
      } catch (err) {
        console.error(`[EditorToolbar] Error building dynamic catalog:`, err)
      }
    }
  }, [loadedAssets])

  const handleColorChange = useCallback((key: keyof FloorColor, value: number) => {
    onFloorColorChange({ ...floorColor, [key]: value })
  }, [floorColor, onFloorColorChange])

  const handleWallColorChange = useCallback((key: keyof FloorColor, value: number) => {
    onWallColorChange({ ...wallColor, [key]: value })
  }, [wallColor, onWallColorChange])

  // For selected furniture: use existing color or default
  const effectiveColor = selectedFurnitureColor ?? DEFAULT_FURNITURE_COLOR
  const handleSelFurnColorChange = useCallback((key: keyof FloorColor, value: number) => {
    onSelectedFurnitureColorChange({ ...effectiveColor, [key]: value })
  }, [effectiveColor, onSelectedFurnitureColorChange])

  const categoryItems = getCatalogByCategory(activeCategory)

  const patternCount = getFloorPatternCount()
  // Wall is TileType 0, floor patterns are 1..patternCount
  const floorPatterns = Array.from({ length: patternCount }, (_, i) => i + 1)

  const thumbSize = 36 // 2x for items

  const isFloorActive = activeTool === EditTool.TILE_PAINT || activeTool === EditTool.EYEDROPPER
  const isWallActive = activeTool === EditTool.WALL_PAINT
  const isEraseActive = activeTool === EditTool.ERASE
  const isFurnitureActive = activeTool === EditTool.FURNITURE_PLACE || activeTool === EditTool.FURNITURE_PICK

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 68,
        left: 10,
        zIndex: 'var(--pixel-controls-z)',
        background: 'var(--pixel-bg)',
        border: '2px solid var(--pixel-border)',
        borderRadius: 0,
        padding: '8px',
        display: 'flex',
        flexDirection: 'column-reverse',
        gap: 8,
        boxShadow: 'var(--pixel-shadow)',
        maxWidth: 'calc(100vw - 20px)',
        maxHeight: 'calc(100vh - 100px)',
        overflow: 'auto',
      }}
    >
      {/* Tool row — at the bottom */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {TOOLS.map((tool) => {
          const isActive =
            (tool.id === EditTool.TILE_PAINT && isFloorActive) ||
            (tool.id === EditTool.WALL_PAINT && isWallActive) ||
            (tool.id === EditTool.ERASE && isEraseActive) ||
            (tool.id === EditTool.FURNITURE_PLACE && isFurnitureActive)

          return (
            <button
              key={tool.id}
              style={isActive ? activeBtnStyle : btnStyle}
              onClick={() => onToolChange(tool.id)}
              onMouseEnter={() => setHoveredTool(tool.id)}
              onMouseLeave={() => setHoveredTool(null)}
              title={tool.title}
            >
              <span>{tool.label}</span>
              <kbd
                style={{
                  marginLeft: 4,
                  padding: '0 4px',
                  fontSize: '14px',
                  background: isActive ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)',
                  borderRadius: 0,
                  color: isActive ? '#fff' : 'var(--pixel-text-muted)',
                  fontFamily: 'inherit',
                }}
              >
                {tool.shortcut}
              </kbd>
            </button>
          )
        })}
      </div>

      {/* Sub-panel: Floor tiles — stacked bottom-to-top via column-reverse */}
      {isFloorActive && (
        <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 8 }}>
          {/* Color toggle + Pick — just above tool row */}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button
              style={showColor ? activeBtnStyle : btnStyle}
              onClick={() => setShowColor((v) => !v)}
              title="Adjust floor color"
            >
              🎨 Color
            </button>
            <button
              style={activeTool === EditTool.EYEDROPPER ? activeBtnStyle : btnStyle}
              onClick={() => onToolChange(EditTool.EYEDROPPER)}
              title="Pick floor pattern + color from existing tile"
            >
              👁 Pick
            </button>
          </div>

          {/* Color controls (collapsible) — above Wall/Color/Pick */}
          {showColor && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              padding: '6px 8px',
              background: 'rgba(0, 0, 0, 0.3)',
              border: '2px solid var(--pixel-border)',
              borderRadius: 0,
            }}>
              <ColorSlider label="H" value={floorColor.h} min={0} max={360} onChange={(v) => handleColorChange('h', v)} />
              <ColorSlider label="S" value={floorColor.s} min={0} max={100} onChange={(v) => handleColorChange('s', v)} />
              <ColorSlider label="B" value={floorColor.b} min={-100} max={100} onChange={(v) => handleColorChange('b', v)} />
              <ColorSlider label="C" value={floorColor.c} min={-100} max={100} onChange={(v) => handleColorChange('c', v)} />
            </div>
          )}

          {/* Floor pattern horizontal carousel — at the top */}
          <div style={{
            display: 'flex',
            gap: 4,
            overflowX: 'auto',
            flexWrap: 'nowrap',
            padding: '4px 0',
          }}>
            {floorPatterns.map((patIdx) => (
              <FloorPatternPreview
                key={patIdx}
                patternIndex={patIdx}
                color={floorColor}
                selected={selectedTileType === patIdx}
                onClick={() => onTileTypeChange(patIdx as TileTypeVal)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Sub-panel: Wall — stacked bottom-to-top via column-reverse */}
      {isWallActive && (
        <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 8 }}>
          {/* Color toggle — just above tool row */}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button
              style={showWallColor ? activeBtnStyle : btnStyle}
              onClick={() => setShowWallColor((v) => !v)}
              title="Adjust wall color"
            >
              🎨 Color
            </button>
          </div>

          {/* Color controls (collapsible) */}
          {showWallColor && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              padding: '6px 8px',
              background: 'rgba(0, 0, 0, 0.3)',
              border: '2px solid var(--pixel-border)',
              borderRadius: 0,
            }}>
              <ColorSlider label="H" value={wallColor.h} min={0} max={360} onChange={(v) => handleWallColorChange('h', v)} />
              <ColorSlider label="S" value={wallColor.s} min={0} max={100} onChange={(v) => handleWallColorChange('s', v)} />
              <ColorSlider label="B" value={wallColor.b} min={-100} max={100} onChange={(v) => handleWallColorChange('b', v)} />
              <ColorSlider label="C" value={wallColor.c} min={-100} max={100} onChange={(v) => handleWallColorChange('c', v)} />
            </div>
          )}

        </div>
      )}

      {/* Sub-panel: Furniture — stacked bottom-to-top via column-reverse */}
      {isFurnitureActive && (
        <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 6 }}>
          {/* Category tabs + Pick — just above tool row */}
          <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            {getActiveCategories().map((cat) => (
              <button
                key={cat.id}
                style={activeCategory === cat.id ? activeTabStyle : tabStyle}
                onClick={() => setActiveCategory(cat.id)}
              >
                {cat.label}
              </button>
            ))}
            <div style={{ width: 1, height: 16, background: 'var(--pixel-border)', margin: '0 4px', flexShrink: 0 }} />
            <button
              style={activeTool === EditTool.FURNITURE_PICK ? activeBtnStyle : btnStyle}
              onClick={() => onToolChange(EditTool.FURNITURE_PICK)}
              title="Pick furniture type from placed item"
            >
              👁 Pick
            </button>
          </div>
          {/* Furniture items — single-row horizontal carousel at 2x */}
          <div style={{
            display: 'flex',
            gap: 4,
            overflowX: 'auto',
            flexWrap: 'nowrap',
            padding: '4px 0',
          }}>
            {categoryItems.map((entry) => {
              const cached = getCachedSprite(entry.sprite, 2)
              const isSelected = selectedFurnitureType === entry.type
              return (
                <button
                  key={entry.type}
                  onClick={() => onFurnitureTypeChange(entry.type)}
                  title={entry.label}
                  style={{
                    width: thumbSize,
                    height: thumbSize,
                    background: '#2A2A3A',
                    border: isSelected ? '2px solid var(--pixel-accent)' : '2px solid var(--pixel-border)',
                    borderRadius: 0,
                    cursor: 'pointer',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    flexShrink: 0,
                    transition: 'all 0.1s ease',
                    boxShadow: isSelected ? '0 0 6px rgba(90, 140, 255, 0.4)' : 'none',
                  }}
                >
                  <canvas
                    ref={(el) => {
                      if (!el) return
                      const ctx = el.getContext('2d')
                      if (!ctx) return
                      const scale = Math.min(thumbSize / cached.width, thumbSize / cached.height) * 0.85
                      el.width = thumbSize
                      el.height = thumbSize
                      ctx.imageSmoothingEnabled = false
                      ctx.clearRect(0, 0, thumbSize, thumbSize)
                      const dw = cached.width * scale
                      const dh = cached.height * scale
                      ctx.drawImage(cached, (thumbSize - dw) / 2, (thumbSize - dh) / 2, dw, dh)
                    }}
                    style={{ width: thumbSize, height: thumbSize }}
                  />
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Selected furniture color panel — shows when any placed furniture item is selected */}
      {selectedFurnitureUid && (
        <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 4 }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button
              style={showFurnitureColor ? activeBtnStyle : btnStyle}
              onClick={() => setShowFurnitureColor((v) => !v)}
              title="Adjust selected furniture color"
            >
              🎨 Color
            </button>
            {selectedFurnitureColor && (
              <button
                style={{ ...btnStyle, fontSize: '18px', padding: '2px 8px' }}
                onClick={() => onSelectedFurnitureColorChange(null)}
                title="Remove color (restore original)"
              >
                ✕ Clear
              </button>
            )}
          </div>
          {showFurnitureColor && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              padding: '6px 8px',
              background: 'rgba(0, 0, 0, 0.3)',
              border: '2px solid var(--pixel-border)',
              borderRadius: 0,
            }}>
              {effectiveColor.colorize ? (
                <>
                  <ColorSlider label="H" value={effectiveColor.h} min={0} max={360} onChange={(v) => handleSelFurnColorChange('h', v)} />
                  <ColorSlider label="S" value={effectiveColor.s} min={0} max={100} onChange={(v) => handleSelFurnColorChange('s', v)} />
                </>
              ) : (
                <>
                  <ColorSlider label="H" value={effectiveColor.h} min={-180} max={180} onChange={(v) => handleSelFurnColorChange('h', v)} />
                  <ColorSlider label="S" value={effectiveColor.s} min={-100} max={100} onChange={(v) => handleSelFurnColorChange('s', v)} />
                </>
              )}
              <ColorSlider label="B" value={effectiveColor.b} min={-100} max={100} onChange={(v) => handleSelFurnColorChange('b', v)} />
              <ColorSlider label="C" value={effectiveColor.c} min={-100} max={100} onChange={(v) => handleSelFurnColorChange('c', v)} />
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: '18px',
                color: 'var(--pixel-text-dim)',
                cursor: 'pointer',
                padding: '4px 0',
              }}>
                <input
                  type="checkbox"
                  checked={!!effectiveColor.colorize}
                  onChange={(e) => onSelectedFurnitureColorChange({ ...effectiveColor, colorize: e.target.checked || undefined })}
                  style={{ accentColor: 'var(--pixel-accent)', width: 16, height: 16 }}
                />
                Colorize Mode
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
