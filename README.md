# Pixel Agents Electron

> **Derived from [Pixel Agents](https://github.com/pablodelucca/pixel-agents)** — A VS Code extension by [Pablo Delucca](https://github.com/pablodelucca) that turns AI coding agents into animated pixel art characters. This project adapts the original concept as a standalone Electron application.

A pixel-art style office visualization app built with Electron and React. Visualizes Claude Code agents as characters in an interactive office environment.

## Promo Video
https://github-production-user-asset-6210df.s3.amazonaws.com/872749/560619012-6d764a24-5751-4594-8ce5-71e350a68fbe.mp4

## Tech Stack

- **Main Process**: Electron + Node.js (TypeScript)
- **Renderer Process**: React 19 + TypeScript + Vite
- **State Management**: Zustand
- **Terminal**: xterm.js
- **Build Tool**: electron-vite

## Project Structure

```
pixel-agents-electron/
├── src/
│   ├── main/           # Electron main process
│   │   ├── main.ts              # Entry point
│   │   ├── assetLoader.ts       # Load PNG assets
│   │   ├── fileWatcher.ts       # Watch JSONL files
│   │   ├── terminalManager.ts   # Manage terminal sessions
│   │   ├── agentManager.ts      # Agent state management
│   │   ├── timerManager.ts      # Agent timers
│   │   ├── transcriptParser.ts  # Parse Claude transcripts
│   │   └── layoutPersistence.ts # Save/load layouts
│   ├── renderer/       # React renderer process
│   │   └── src/
│   │       ├── office/          # Office engine
│   │       │   ├── engine/      # Game loop, renderer, characters
│   │       │   ├── sprites/     # Sprite data and caching
│   │       │   ├── layout/      # Furniture catalog, tile map
│   │       │   ├── editor/      # Editor state and actions
│   │       │   ├── components/  # React components
│   │       │   └── hooks/       # React hooks
│   │       ├── components/      # UI components
│   │       ├── hooks/           # Custom hooks
│   │       └── ipcBridge.ts     # IPC communication
│   └── preload/        # Preload scripts
├── assets/             # Static assets (PNG sprites, layouts)
├── tests/              # Unit and integration tests
├── docs/               # Documentation
└── docs/plans/         # Design documents
```

## Development

```bash
# Install dependencies
npm install

# Start dev mode
npm run dev

# Run tests
npm test

# Build for production
npm run build
npm run package
```

## Architecture

### Main Components

1. **TerminalManager**: Creates and manages Claude CLI terminal sessions
2. **FileWatcher**: Watches JSONL transcript files for changes
3. **AgentManager**: Tracks agent state (active, waiting, permission)
4. **OfficeEngine**: Renders the pixel art office with characters and furniture

### Data Flow

```
Claude CLI → JSONL file → FileWatcher → Main Process → IPC → Renderer
                                                        ↓
                                                 Office State → Canvas
```

## Key Features

- Multi-agent visualization (up to 8 agents)
- Real-time tool activity display
- Interactive furniture editor
- Layout persistence
- Sub-agent support (Task tool)
- Sound notifications

## Acknowledgments

This project is derived from and inspired by:

- **[Pixel Agents](https://github.com/pablodelucca/pixel-agents)** — Original VS Code extension by [Pablo Delucca](https://github.com/pablodelucca)
- **[Metro City Character Pack](https://jik-a-4.itch.io/metrocity-free-topdown-character-pack)** — Character sprites by JIK-A-4
- **[Office Interior Tileset](https://donarg.itch.io/officetileset)** — Office tileset by Donarg

## License

MIT
