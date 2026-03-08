import { useState, useEffect, useCallback } from 'react'
import { vscode } from '../ipcBridge.js'
import { isSoundEnabled, setSoundEnabled } from '../notificationSound.js'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  isDebugMode: boolean
  onToggleDebugMode: () => void
}

type ThemeMode = 'dark' | 'light' | 'system'

interface SettingItem {
  id: string
  label: string
  type: 'action' | 'toggle' | 'select'
  value?: boolean | string
  options?: { value: string; label: string }[]
  onClick?: () => void
  description?: string
}

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.6)',
  zIndex: 'var(--pixel-backdrop-z)',
  animation: 'pixel-fade-in 0.15s ease-out',
}

const modalStyle: React.CSSProperties = {
  position: 'fixed',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  zIndex: 'var(--pixel-modal-z)',
  background: 'var(--pixel-bg)',
  border: '2px solid var(--pixel-border)',
  borderRadius: 0,
  boxShadow: 'var(--pixel-shadow)',
  minWidth: 280,
  maxWidth: '90vw',
  maxHeight: '80vh',
  display: 'flex',
  flexDirection: 'column',
  animation: 'pixel-slide-up 0.2s ease-out',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 12px',
  borderBottom: '2px solid var(--pixel-border)',
  background: 'rgba(255, 255, 255, 0.03)',
}

const titleStyle: React.CSSProperties = {
  fontSize: '24px',
  color: 'var(--pixel-text)',
  fontWeight: 'normal',
  margin: 0,
}

const closeBtnStyle = (isHovered: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  fontSize: '22px',
  color: isHovered ? 'var(--pixel-close-hover)' : 'var(--pixel-close-text)',
  background: isHovered ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
  border: '2px solid transparent',
  borderRadius: 0,
  cursor: 'pointer',
  padding: 0,
  lineHeight: 1,
})

const contentStyle: React.CSSProperties = {
  padding: '8px',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: '18px',
  color: 'var(--pixel-text-dim)',
  padding: '4px 8px',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
}

const menuItemBase: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  padding: '8px 12px',
  fontSize: '22px',
  color: 'var(--pixel-text)',
  background: 'transparent',
  border: '2px solid transparent',
  borderRadius: 0,
  cursor: 'pointer',
  textAlign: 'left',
  transition: 'background-color 0.1s ease',
}

const menuItemHover = (isHovered: boolean): React.CSSProperties => ({
  background: isHovered ? 'var(--pixel-btn-hover-bg)' : 'transparent',
})

const toggleStyle = (isEnabled: boolean): React.CSSProperties => ({
  width: 20,
  height: 20,
  border: '2px solid var(--pixel-border-light)',
  borderRadius: 0,
  background: isEnabled ? 'var(--pixel-accent)' : 'transparent',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '14px',
  lineHeight: 1,
  color: '#fff',
  transition: 'background-color 0.15s ease',
})

const indicatorStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: 'var(--pixel-accent)',
  flexShrink: 0,
  boxShadow: '0 0 4px var(--pixel-accent)',
}

const shortcutInfoStyle: React.CSSProperties = {
  fontSize: '16px',
  color: 'var(--pixel-text-muted)',
  padding: '8px 12px',
  borderTop: '2px solid var(--pixel-border)',
  textAlign: 'center',
}

export function SettingsModal({
  isOpen,
  onClose,
  isDebugMode,
  onToggleDebugMode,
}: SettingsModalProps) {
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  const [soundLocal, setSoundLocal] = useState(isSoundEnabled)
  const [theme, setTheme] = useState<ThemeMode>('dark')

  // Sync sound state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSoundLocal(isSoundEnabled())
    }
  }, [isOpen])

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  const handleSoundToggle = useCallback(() => {
    const newVal = !isSoundEnabled()
    setSoundEnabled(newVal)
    setSoundLocal(newVal)
    vscode.invoke('setSoundEnabled', { enabled: newVal }).catch(console.error)
  }, [])

  const handleOpenSessions = useCallback(async () => {
    try {
      await vscode.invoke('openSessionsFolder')
      onClose()
    } catch (err) {
      console.error('Failed to open sessions folder:', err)
    }
  }, [onClose])

  const handleExportLayout = useCallback(async () => {
    try {
      await vscode.invoke('exportLayout')
      onClose()
    } catch (err) {
      console.error('Failed to export layout:', err)
    }
  }, [onClose])

  const handleImportLayout = useCallback(async () => {
    try {
      const result = await vscode.invoke<{ success: boolean; layout?: unknown; error?: string }>('importLayout')
      if (result && !result.success && result.error) {
        console.error('Import layout failed:', result.error)
      }
      onClose()
    } catch (err) {
      console.error('Failed to import layout:', err)
    }
  }, [onClose])

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop with click to close */}
      <div style={backdropStyle} onClick={onClose} />

      {/* Modal */}
      <div style={modalStyle} role="dialog" aria-modal="true" aria-labelledby="settings-title">
        {/* Header */}
        <div style={headerStyle}>
          <h2 id="settings-title" style={titleStyle}>
            Settings
          </h2>
          <button
            onClick={onClose}
            onMouseEnter={() => setHoveredItem('close')}
            onMouseLeave={() => setHoveredItem(null)}
            style={closeBtnStyle(hoveredItem === 'close')}
            aria-label="Close settings"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={contentStyle}>
          {/* General Section */}
          <div style={sectionStyle}>
            <span style={sectionTitleStyle}>General</span>

            {/* Sound Notifications */}
            <button
              style={{ ...menuItemBase, ...menuItemHover(hoveredItem === 'sound') }}
              onMouseEnter={() => setHoveredItem('sound')}
              onMouseLeave={() => setHoveredItem(null)}
              onClick={handleSoundToggle}
            >
              <span>Sound Notifications</span>
              <span style={toggleStyle(soundLocal)}>{soundLocal ? '✓' : ''}</span>
            </button>
          </div>

          {/* Layout Section */}
          <div style={sectionStyle}>
            <span style={sectionTitleStyle}>Layout</span>

            {/* Export Layout */}
            <button
              style={{ ...menuItemBase, ...menuItemHover(hoveredItem === 'export') }}
              onMouseEnter={() => setHoveredItem('export')}
              onMouseLeave={() => setHoveredItem(null)}
              onClick={handleExportLayout}
            >
              <span>Export Layout</span>
              <span style={{ fontSize: '18px', color: 'var(--pixel-text-muted)' }}>↗</span>
            </button>

            {/* Import Layout */}
            <button
              style={{ ...menuItemBase, ...menuItemHover(hoveredItem === 'import') }}
              onMouseEnter={() => setHoveredItem('import')}
              onMouseLeave={() => setHoveredItem(null)}
              onClick={handleImportLayout}
            >
              <span>Import Layout</span>
              <span style={{ fontSize: '18px', color: 'var(--pixel-text-muted)' }}>↙</span>
            </button>

            {/* Open Sessions Folder */}
            <button
              style={{ ...menuItemBase, ...menuItemHover(hoveredItem === 'sessions') }}
              onMouseEnter={() => setHoveredItem('sessions')}
              onMouseLeave={() => setHoveredItem(null)}
              onClick={handleOpenSessions}
            >
              <span>Open Sessions Folder</span>
              <span style={{ fontSize: '18px', color: 'var(--pixel-text-muted)' }}>→</span>
            </button>
          </div>

          {/* Developer Section */}
          <div style={sectionStyle}>
            <span style={sectionTitleStyle}>Developer</span>

            {/* Debug View */}
            <button
              style={{ ...menuItemBase, ...menuItemHover(hoveredItem === 'debug') }}
              onMouseEnter={() => setHoveredItem('debug')}
              onMouseLeave={() => setHoveredItem(null)}
              onClick={onToggleDebugMode}
            >
              <span>Debug View</span>
              {isDebugMode && <span style={indicatorStyle} />}
            </button>
          </div>
        </div>

        {/* Footer with shortcuts */}
        <div style={shortcutInfoStyle}>
          Press <kbd style={{ fontFamily: 'inherit', background: 'var(--pixel-btn-bg)', padding: '2px 6px' }}>Esc</kbd> to close
        </div>
      </div>
    </>
  )
}
