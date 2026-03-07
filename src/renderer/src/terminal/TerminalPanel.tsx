import { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'
import { vscode } from '../ipcBridge.js'

interface TerminalPanelProps {
  terminalId: number | null
  isVisible: boolean
  className?: string
}

const panelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  background: '#1a1a2e',
  borderLeft: '2px solid var(--pixel-border)',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '6px 10px',
  background: 'var(--pixel-bg)',
  borderBottom: '2px solid var(--pixel-border)',
  fontSize: '20px',
  color: 'var(--pixel-text-dim)',
}

const terminalContainerStyle: React.CSSProperties = {
  flex: 1,
  padding: 4,
  overflow: 'hidden',
}

const buttonStyle = (isHovered: boolean): React.CSSProperties => ({
  padding: '2px 8px',
  fontSize: '18px',
  color: 'var(--pixel-text-dim)',
  background: isHovered ? 'var(--pixel-btn-hover-bg)' : 'transparent',
  border: '2px solid transparent',
  borderRadius: 0,
  cursor: 'pointer',
})

export function TerminalPanel({
  terminalId,
  isVisible,
  className,
}: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [clearHovered, setClearHovered] = useState(false)
  const [closeHovered, setCloseHovered] = useState(false)

  // Initialize xterm
  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return

    const term = new Terminal({
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      theme: {
        background: '#1a1a2e',
        foreground: '#c0caf5',
        cursor: '#5a8cff',
        selectionBackground: 'rgba(90, 140, 255, 0.3)',
        black: '#1a1a2e',
        red: '#f7768e',
        green: '#9ece6a',
        yellow: '#e0af68',
        blue: '#7aa2f7',
        magenta: '#bb9af7',
        cyan: '#7dcfff',
        white: '#c0caf5',
        brightBlack: '#565f89',
        brightRed: '#ff9e64',
        brightGreen: '#73daca',
        brightYellow: '#e0af68',
        brightBlue: '#7aa2f7',
        brightMagenta: '#bb9af7',
        brightCyan: '#7dcfff',
        brightWhite: '#ffffff',
      },
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 10000,
      allowTransparency: true,
      convertEol: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)

    term.open(containerRef.current)
    fitAddon.fit()

    // Handle terminal input
    term.onData((data) => {
      if (terminalId) {
        vscode.postMessage({
          type: 'terminalInput',
          terminalId,
          data,
        })
      }
    })

    terminalRef.current = term
    fitAddonRef.current = fitAddon

    // Request initial terminal data
    if (terminalId) {
      vscode.postMessage({
        type: 'terminalReady',
        terminalId,
      })
    }

    return () => {
      term.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [terminalId])

  // Handle resize
  useEffect(() => {
    if (!isVisible || !fitAddonRef.current) return

    const timeout = setTimeout(() => {
      fitAddonRef.current?.fit()
    }, 100)

    const handleResize = () => {
      fitAddonRef.current?.fit()
    }

    window.addEventListener('resize', handleResize)

    return () => {
      clearTimeout(timeout)
      window.removeEventListener('resize', handleResize)
    }
  }, [isVisible])

  // Handle terminal output from main process
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data
      if (msg.type === 'terminalOutput' && msg.terminalId === terminalId) {
        terminalRef.current?.write(msg.data)
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [terminalId])

  const handleClear = useCallback(() => {
    terminalRef.current?.clear()
  }, [])

  const handleClose = useCallback(() => {
    if (terminalId) {
      vscode.postMessage({
        type: 'closeTerminal',
        terminalId,
      })
    }
  }, [terminalId])

  if (!isVisible) {
    return null
  }

  return (
    <div style={panelStyle} className={className}>
      <div style={headerStyle}>
        <span>Terminal {terminalId ? `#${terminalId}` : ''}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            style={buttonStyle(clearHovered)}
            onMouseEnter={() => setClearHovered(true)}
            onMouseLeave={() => setClearHovered(false)}
            onClick={handleClear}
            title="Clear terminal"
          >
            Clear
          </button>
          <button
            style={buttonStyle(closeHovered)}
            onMouseEnter={() => setCloseHovered(true)}
            onMouseLeave={() => setCloseHovered(false)}
            onClick={handleClose}
            title="Close terminal"
          >
            ×
          </button>
        </div>
      </div>
      <div style={terminalContainerStyle}>
        <div
          ref={containerRef}
          style={{
            width: '100%',
            height: '100%',
            opacity: terminalId ? 1 : 0.5,
          }}
        />
      </div>
    </div>
  )
}
