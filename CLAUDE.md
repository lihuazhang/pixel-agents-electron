# CLAUDE.md - Claude Code Guidelines

This file provides guidance to Claude Code when working on this project.

## Project Overview

Pixel Agents Electron is a pixel-art office visualization app that renders Claude Code agents as characters in an interactive office environment.

## Build & Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Start development (electron-vite)
npm run build        # Build for production
npm run package      # Package with electron-builder
npm test             # Run tests (vitest)
```

## Architecture

### Main Process (`src/main/`)
- **main.ts**: IPC handlers, agent lifecycle
- **assetLoader.ts**: Load PNG sprites to SpriteData
- **fileWatcher.ts**: Watch JSONL files for transcript changes
- **terminalManager.ts**: Create/manage Claude CLI terminals
- **agentManager.ts**: Agent state persistence and restoration
- **timerManager.ts**: Waiting/permission timers

### Renderer Process (`src/renderer/src/`)
- **office/engine/**: Game loop, canvas rendering, characters
- **office/sprites/**: Sprite data, caching, outline generation
- **office/layout/**: Furniture catalog, tile map, serializer
- **office/editor/**: Editor state, actions, keyboard handlers
- **hooks/**: React hooks (useExtensionMessages, useEditorKeyboard)
- **components/**: UI components (AgentLabels, ZoomControls, ToolOverlay)

### Key Data Structures

**SpriteData**: `string[][]` - 2D array of color strings (`#rrggbb` or `#rrggbbaa` or `''` for transparent)

**FurnitureInstance**:
```typescript
{
  x, y: number,           // Tile position
  sprite: SpriteData,     // Pixel data
  zY: number,             // Z-sort value
  type: string,           // Asset ID
}
```

**Character**:
```typescript
{
  id: number,             // Agent ID
  x, y: number,           // Tile position
  palette: number,        // Character color palette
  seatId: string | null,  // Assigned seat
  isSubagent: boolean,    // True for Task sub-agents
}
```

## Coding Patterns

### Sprite Data Format
- Empty string `''` = transparent
- `#rrggbb` = opaque color
- `#rrggbbaa` = semi-transparent (converted to `rgba()` in renderer)
- Shadow pixels: use solid `#4a4a4a` (not alpha blending)

### IPC Communication
```typescript
// Main to renderer
sendToRenderer('messageType', { payload })

// Renderer to main
vscode.postMessage({ type: 'messageType', payload })
// or
ipcBridge.send('messageType', payload)
```

### Canvas Rendering
- Use `getCachedSprite()` for sprite caching
- Z-sort by `zY` value (lower = in front)
- Integer pixel alignment with `Math.floor()` / `Math.round()`

## Testing

```bash
npm test                    # Run all tests
npm run test:watch          # Watch mode
npm run test:coverage       # With coverage
```

Test files are co-located: `src/**/*.test.ts`

## Git Workflow

- Main branch: `main`
- Feature branches: `feature/description`
- Fix branches: `fix/description`
- Commit messages: conventional commits

## File Naming

- **kebab-case**: file names (`assetLoader.ts`)
- **PascalCase**: React components (`ToolOverlay.tsx`)
- **camelCase**: utilities (`colorize.ts`)

## Important Conventions

1. **No default exports** - use named exports only
2. **TypeScript** - strict mode, no `any`
3. **React** - functional components with hooks
4. **State** - use Zustand for shared state
5. **Canvas** - cache sprites, avoid per-frame allocations

## Common Tasks

### Add new furniture asset
1. Add PNG to `assets/furniture/`
2. Update `assets/furniture/furniture-catalog.json`
3. Reload app to load new asset

### Modify character rendering
- `src/renderer/src/office/engine/characters.ts` - sprite selection
- `src/renderer/src/office/sprites/spriteData.ts` - base sprites
- `src/renderer/src/office/colorize.ts` - palette shifting

### Debug IPC messages
- Check `src/main/main.ts` for handlers
- Check `src/renderer/src/hooks/useExtensionMessages.ts` for listener
