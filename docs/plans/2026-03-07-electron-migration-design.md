# Electron 迁移设计方案

**日期**: 2026-03-07
**状态**: 已批准

---

## 一、架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│                     Electron 主进程                              │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────┐ │
│  │ 终端管理器   │  │ 文件监听器    │  │  布局持久化             │ │
│  │ (pty + node)│  │ (chokidar)   │  │  (~/.pixel-agents/)     │ │
│  └─────────────┘  └──────────────┘  └─────────────────────────┘ │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────┐ │
│  │ 窗口/标签管理 │  │  IPC 桥接层   │  │  资产加载器             │ │
│  │ (multi-tab) │  │ (renderer ↔) │  │  (PNG → SpriteData)     │ │
│  └─────────────┘  └──────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              ↕ IPC
┌─────────────────────────────────────────────────────────────────┐
│                   渲染进程 (每个标签页一个)                        │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    React 办公室界面                          ││
│  │  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐ ││
│  │  │  游戏引擎   │  │  布局编辑器    │  │   xterm.js 终端      │ ││
│  │  │  (canvas)   │  │  (toolbar)   │  │   (嵌入式/外部)      │ ││
│  │  └─────────────┘  └──────────────┘  └─────────────────────┘ ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

---

## 二、项目结构

```
pixel-agents-electron/
├── package.json                 # Electron + React + xterm.js
├── electron.vite.config.ts      # electron-vite 配置
├── assets/                      # 共享资源（从原项目复制）
│   ├── floors.png
│   ├── walls.png
│   ├── characters/
│   └── furniture/
│
├── src/
│   ├── main/                    # 主进程代码
│   │   ├── main.ts              # 入口：app ready, window creation
│   │   ├── terminalManager.ts   # Terminal + pty 管理
│   │   ├── fileWatcher.ts       # JSONL 监听 (chokidar)
│   │   ├── layoutPersistence.ts # 用户级 layout.json I/O
│   │   ├── assetLoader.ts       # PNG 加载 + 资产发送
│   │   ├── ipcHandlers.ts       # IPC 消息路由
│   │   └── constants.ts         # 后端常量
│   │
│   └── renderer/                # 渲染进程 (React)
│       ├── src/
│       │   ├── main.tsx         # React 入口
│       │   ├── App.tsx          # 组合根组件
│       │   ├── components/      # UI 组件
│       │   │   ├── OfficeCanvas.tsx
│       │   │   ├── EditorToolbar.tsx
│       │   │   ├── TerminalPanel.tsx  # xterm.js 容器
│       │   │   ├── TabBar.tsx         # 标签页导航
│       │   │   └── SettingsModal.tsx
│       │   ├── hooks/
│       │   │   ├── useIPCMessages.ts  # IPC 监听 + 状态
│       │   │   └── useEditorActions.ts
│       │   ├── office/          # 办公室引擎（复用原代码）
│       │   │   ├── engine/
│       │   │   ├── editor/
│       │   │   ├── layout/
│       │   │   └── sprites/
│       │   ├── terminal/        # 终端相关
│       │   │   ├── xtermWrapper.tsx
│       │   │   └── terminalState.ts
│       │   ├── constants.ts     # 前端常量
│       │   └── types.ts
│       ├── index.html
│       └── package.json         # 渲染进程依赖
│
└── scripts/                     # 资产处理脚本（从原项目复用）
    ├── export-characters.ts
    └── generate-walls.js
```

---

## 三、核心模块设计

### 3.1 主进程模块

#### `terminalManager.ts` — 终端管理

```typescript
interface TerminalInstance {
  id: number;
  pty: Pty;              // node-pty
  cwd: string;           // 工作目录
  sessionId: string;     // Claude session ID
  jsonlFile: string;     // JSONL 路径
  agentId: number;       // 关联的 Agent ID
}

class TerminalManager {
  // 内嵌终端
  createTerminal(cwd: string): TerminalInstance;
  launchClaude(terminalId: number): void;  // 发送 'claude --session-id xxx'

  // 外部终端关联
  attachExternalTerminal(pid: number, jsonlFile: string): number;

  // 生命周期
  disposeTerminal(terminalId: number): void;
}
```

**关键依赖：**
- `node-pty` — 跨平台 PTY（VSCode 也在用）
- 备选：`node-conpty` (Windows 优化)

---

#### `fileWatcher.ts` — JSONL 监听

```typescript
// 复用原逻辑，替换 fs.watch → chokidar
import chokidar from 'chokidar';

class FileWatcher {
  watch(jsonlFile: string, onChange: () => void): void;
  unwatch(jsonlFile: string): void;
  readNewLines(file: string, offset: number): { text: string; newOffset: number };
}
```

**关键改进：**
- `chokidar` 比 `fs.watch` 更可靠（尤其 macOS）
- 保留原项目的 2s 轮询备份逻辑

---

#### `ipcHandlers.ts` — IPC 消息路由

```typescript
// 主进程 → 渲染进程
type MainToRendererMessages =
  | { type: 'agentCreated'; id: number; folderName?: string }
  | { type: 'agentClosed'; id: number }
  | { type: 'agentToolStart'; id: number; toolId: string; status: string }
  | { type: 'agentToolDone'; id: number; toolId: string }
  | { type: 'agentStatus'; id: number; status: 'active' | 'waiting' }
  | { type: 'layoutLoaded'; layout: OfficeLayout }
  | { type: 'furnitureAssetsLoaded'; catalog: FurnitureAsset[]; sprites: Record }
  | { type: 'floorTilesLoaded'; sprites: string[][][] }
  | { type: 'wallTilesLoaded'; sprites: string[][][] }
  | { type: 'tabCreated'; tabId: number; projectPath: string }
  | { type: 'tabClosed'; tabId: number };

// 渲染进程 → 主进程
type RendererToMainMessages =
  | { type: 'createTerminal'; cwd?: string }
  | { type: 'attachExternalTerminal'; pid: number; jsonlFile: string }
  | { type: 'focusAgent'; id: number }
  | { type: 'closeAgent'; id: number }
  | { type: 'saveLayout'; layout: OfficeLayout }
  | { type: 'exportLayout' }
  | { type: 'importLayout' }
  | { type: 'createTab'; projectPath: string }
  | { type: 'switchTab'; tabId: number };
```

---

### 3.2 渲染进程模块

#### `TabBar.tsx` — 多标签页导航

```typescript
interface Tab {
  id: number;
  name: string;           // 项目名
  projectPath: string;
  agents: number[];       // 该标签页的 agents
  selectedAgent: number | null;
}

function TabBar({ tabs, activeTabId, onSelect, onClose, onNewTab }: Props) {
  // 顶部标签条：[ 项目 A ×] [ 项目 B ×] [+]
  // 点击 [+] 弹出文件夹选择对话框（调用主进程 showOpenDialog）
}
```

---

#### `TerminalPanel.tsx` — xterm.js 嵌入

```typescript
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';

function TerminalPanel({ terminalId, isVisible }: Props) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);

  useEffect(() => {
    if (isVisible && terminalRef.current && !xtermRef.current) {
      const term = new Terminal({ /* 配置 */ });
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(terminalRef.current);
      fitAddon.fit();

      // 连接 IPC：主进程 PTY 输出 → term.write()
      // term.onData() → IPC 发送到主进程 → pty.write()
    }
  }, [isVisible]);
}
```

**布局选项：**
- **并排模式**：办公室 canvas + 终端面板左右并排
- **切换模式**：点击 Agent 时切换显示（办公室/终端）
- **浮动终端**：终端作为可拖动面板

推荐：**并排模式**（类似 VSCode 面板布局）

---

### 3.3 代码复用策略

#### 可直接复用的模块（~80% 代码）

| 原文件 | 复用方式 | 修改点 |
|--------|---------|--------|
| `webview-ui/src/office/` 下所有 | 直接复制 | 无 |
| `webview-ui/src/components/` 大部分 | 直接复制 | 移除 vscode API 引用 |
| `webview-ui/src/hooks/useEditorActions.ts` | 直接复制 | 无 |
| `webview-ui/src/hooks/useEditorKeyboard.ts` | 直接复制 | 无 |
| `src/constants.ts` | 复制并重用 | 添加 Electron 特定常量 |
| `src/assetLoader.ts` | 复制 | PNG 加载逻辑完全复用 |
| `src/layoutPersistence.ts` | 复制 | 文件路径逻辑不变 |
| `src/transcriptParser.ts` | 复制 | JSONL 解析逻辑不变 |
| `src/timerManager.ts` | 复制 | 定时器逻辑不变 |

#### 需要重写的模块

| 原模块 | 新实现 | 变化说明 |
|--------|--------|----------|
| `PixelAgentsViewProvider.ts` | `ipcHandlers.ts` | VS Code webview → IPC |
| `agentManager.ts` | `terminalManager.ts` | vscode.Terminal → node-pty |
| `fileWatcher.ts` | `fileWatcher.ts` | fs.watch → chokidar |
| `extension.ts` | `main.ts` | VS Code 生命周期 → Electron app 生命周期 |
| `webview-ui/src/vscodeApi.ts` | `ipcBridge.ts` | acquireVsCodeApi → contextBridge |
| `webview-ui/src/hooks/useExtensionMessages.ts` | `useIPCMessages.ts` | window.postMessage → ipcRenderer.on |

---

## 四、关键技术实现

### 4.1 IPC 桥接层

**preload.ts**（Electron 安全模型）

```typescript
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('pixelAgentsAPI', {
  // 发送消息到主进程
  send: (type: string, payload: unknown) => {
    ipcRenderer.send('renderer-to-main', { type, payload });
  },

  // 监听主进程消息
  on: (type: string, callback: (payload: unknown) => void) => {
    const handler = (_event: any, payload: unknown) => callback(payload);
    ipcRenderer.on('main-to-renderer', handler);
    return () => ipcRenderer.removeListener('main-to-renderer', handler);
  },
});
```

**useIPCMessages.ts**（替换 useExtensionMessages）

```typescript
export function useIPCMessages(getOfficeState: () => OfficeState) {
  useEffect(() => {
    const api = (window as any).pixelAgentsAPI;

    const unsubscribe = api.on('message', (msg: ExtensionMessage) => {
      // 处理逻辑与原版 useExtensionMessages 完全一致
      if (msg.type === 'agentToolStart') { ... }
      if (msg.type === 'layoutLoaded') { ... }
    });

    // 通知主进程渲染进程已就绪
    api.send('webviewReady');

    return unsubscribe;
  }, []);
}
```

---

### 4.2 终端管理实现

**主进程：terminalManager.ts**

```typescript
import * as pty from 'node-pty';
import { app } from 'electron';

class TerminalManager {
  private terminals = new Map<number, TerminalInstance>();
  private nextId = 1;

  createTerminal(cwd: string): number {
    const id = this.nextId++;
    const ptyProcess = pty.spawn('zsh', [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd,
    });

    const sessionId = crypto.randomUUID();
    const jsonlFile = this.getJsonlPath(sessionId, cwd);

    ptyProcess.write(`claude --session-id ${sessionId}\r`);

    // 输出 → IPC 发送到渲染进程
    ptyProcess.onData((data) => {
      this.sendToRenderer('terminalOutput', { id, data });
    });

    this.terminals.set(id, { id, pty: ptyProcess, cwd, sessionId, jsonlFile, agentId: -1 });
    return id;
  }

  attachExternalTerminal(pid: number, jsonlFile: string): number {
    // 用于关联外部运行的 Claude 终端
    const id = this.nextId++;
    this.terminals.set(id, { id, pty: null, cwd: '', sessionId: '', jsonlFile, agentId: -1 });
    return id;
  }
}
```

---

### 4.3 多标签页实现

**主进程：windowManager.ts**

```typescript
class WindowManager {
  private mainWindow: BrowserWindow | null = null;
  private tabs = new Map<number, TabState>();
  private nextTabId = 1;

  createWindow(): void {
    this.mainWindow = new BrowserWindow({
      width: 1600,
      height: 1000,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
      },
    });

    this.mainWindow.loadFile('index.html');
  }

  createTab(projectPath: string): number {
    const tabId = this.nextTabId++;
    this.tabs.set(tabId, { id: tabId, projectPath, agents: [] });
    this.mainWindow?.webContents.send('tabCreated', { tabId, projectPath });
    return tabId;
  }

  switchTab(tabId: number): void {
    this.mainWindow?.webContents.send('switchTab', tabId);
  }
}
```

**渲染进程：Tab 状态管理**

```typescript
interface TabState {
  id: number;
  projectPath: string;
  officeState: OfficeState;  // 每个标签页独立的办公室状态
  agents: number[];
  selectedAgent: number | null;
}

// 使用 Context 或 Zustand 管理多标签状态
const useTabStore = create((set) => ({
  tabs: [] as TabState[],
  activeTabId: null as number | null,
  addTab: (tab: TabState) => set((state: any) => ({
    tabs: [...state.tabs, tab],
    activeTabId: tab.id
  })),
  setActiveTab: (tabId: number) => set({ activeTabId: tabId }),
  // ...
}));
```

---

### 4.4 资产加载

**主进程：assetLoader.ts**（几乎完全复用）

```typescript
// 复用原项目的 PNG 加载逻辑
import { PNG } from 'pngjs';

export async function loadCharacterSprites(assetsRoot: string): Promise<CharacterSprite[]> {
  const sprites: CharacterSprite[] = [];
  for (let i = 0; i < 6; i++) {
    const pngPath = path.join(assetsRoot, `characters/char_${i}.png`);
    const png = await loadPng(pngPath);
    sprites.push(parseCharacterPng(png));
  }
  return sprites;
}
```

**资产路径策略：**

```typescript
function getAssetsRoot(): string {
  // 开发模式：从项目根目录 assets/
  // 生产模式：从 app.asar.unpacked/dist/assets/
  if (process.env.NODE_ENV === 'development') {
    return path.resolve(__dirname, '../../assets');
  }
  return path.join(process.resourcesPath, 'assets');
}
```

---

## 五、数据流图

```
┌──────────────┐     IPC      ┌─────────────────────────────────────┐
│   xterm.js   │ ───────────→ │  渲染进程 (React + Canvas)           │
│  (终端输出)    │              │  - useIPCMessages hook              │
└──────────────┘              │  - OfficeState (游戏状态)           │
         ▲                      │  - EditorState (编辑状态)           │
         │                      └─────────────────────────────────────┘
         │ onData                                          ↕
         │                           ┌─────────────────────────────┐
         ↓                           │      主进程                  │
┌─────────────────┐                  │  - terminalManager          │
│  node-pty       │ ←─ spawn ─→     │  - fileWatcher (chokidar)   │
│  (Claude 进程)   │                  │  - ipcHandlers              │
└─────────────────┘                  └─────────────────────────────┘
         ↓                                        ↕
┌─────────────────┐                     JSONL 文件监听
│  JSONL 文件      │ ←─────────────────────────────
│  (~/.claude/    │
│   projects/...) │
└─────────────────┘
```

---

## 六、迁移步骤

### 阶段 1：项目 Scaffold（第 1 周）
1. 创建新仓库 `pixel-agents-electron`
2. 配置 `electron-vite` + React + TypeScript
3. 设置 preload 脚本和 IPC 桥接
4. 实现主窗口创建和基本 IPC 通信

### 阶段 2：核心功能迁移（第 2-3 周）
1. 复用办公室引擎代码（`webview-ui/src/office/`）
2. 实现终端管理器（node-pty）
3. 实现文件监听器（chokidar）
4. 实现 IPC 消息处理（替换 VS Code postMessage）

### 阶段 3：多标签页（第 4 周）
1. 实现 TabBar 组件
2. 实现主进程窗口/标签管理
3. 每个标签页独立的 OfficeState

### 阶段 4：嵌入式终端（第 5 周）
1. 集成 xterm.js
2. 实现 PTY ↔ xterm 双向通信
3. 并排布局（Canvas + Terminal）

### 阶段 5：资产系统（第 6 周）
1. 复制 assets 目录
2. 复用 PNG 加载逻辑
3. 配置生产模式资产路径

### 阶段 6：完善与测试（第 7 周）
1. 布局编辑器功能验证
2. 子 Agent 系统测试
3. macOS 打包测试

---

## 七、依赖清单

### 主进程依赖
```json
{
  "electron": "^35.x",
  "electron-vite": "^3.x",
  "node-pty": "^1.x",
  "chokidar": "^4.x",
  "pngjs": "^7.x"
}
```

### 渲染进程依赖
```json
{
  "react": "^19.x",
  "react-dom": "^19.x",
  "xterm": "^5.x",
  "xterm-addon-fit": "^0.8.x",
  "zustand": "^5.x"  // 状态管理（可选，用于多标签）
}
```

---

## 八、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| node-pty 在 macOS 编译问题 | 中 | 使用预编译二进制 (node-gyp-build) |
| Canvas 性能问题 | 低 | 保持当前 imperative 渲染模式 |
| 多标签页状态同步复杂 | 中 | 每个标签独立 state，主进程只路由 |
| xterm.js 与 Canvas 布局冲突 | 低 | CSS grid/flex 布局隔离 |
| 资产路径在生产环境失效 | 中 | app.asar.unpacked + resourcesPath |

---

## 九、关键决策总结

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 构建工具 | electron-vite | 与现有技术栈一致 |
| UI 框架 | React + TS | 80% 代码可直接复用 |
| 终端 | xterm.js + node-pty | VSCode 验证过的组合 |
| 进程模型 | 标准架构 | 单窗口 + 多标签 |
| 平台 | macOS only | 简化测试和打包 |
| 分发 | 本地使用 | 无需签名/公证 |
| 更新 | 手动 | 简化架构 |

---

## 十、与原 VSCode 插件的差异

| 功能 | VSCode 插件 | Electron 应用 |
|------|------------|--------------|
| 终端创建 | `vscode.window.createTerminal()` | `node-pty.spawn()` |
| 消息传递 | `webview.postMessage()` | `ipcRenderer.send/on()` |
| 文件监听 | `fs.watch` + 轮询 | `chokidar` + 轮询 |
| 多工作空间 | 多根 workspace | 多标签页 |
| 布局存储 | `~/.pixel-agents/layout.json` | 相同 |
| JSONL 路径 | `~/.claude/projects/<hash>/` | 相同 |
| 资产加载 | webview 资源路径 | `process.resourcesPath` |
