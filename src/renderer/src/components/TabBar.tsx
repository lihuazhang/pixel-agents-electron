import { useState, useRef, useEffect } from 'react'

export interface Tab {
  id: number
  name: string
  projectPath: string
  isDirty?: boolean
}

interface TabBarProps {
  tabs: Tab[]
  activeTabId: number | null
  onSelectTab: (tabId: number) => void
  onCloseTab: (tabId: number) => void
  onNewTab: () => void
}

const tabBarStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height: 36,
  background: 'var(--pixel-bg)',
  borderBottom: '2px solid var(--pixel-border)',
  display: 'flex',
  alignItems: 'center',
  padding: '0 8px',
  gap: 4,
  zIndex: 'var(--pixel-controls-z)',
  overflowX: 'auto',
  overflowY: 'hidden',
}

const tabStyle = (isActive: boolean, isHovered: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 10px',
  fontSize: '20px',
  color: isActive ? 'var(--pixel-text)' : 'var(--pixel-text-dim)',
  background: isActive
    ? 'var(--pixel-active-bg)'
    : isHovered
      ? 'var(--pixel-btn-hover-bg)'
      : 'var(--pixel-btn-bg)',
  border: isActive ? '2px solid var(--pixel-accent)' : '2px solid var(--pixel-border)',
  borderBottom: isActive ? '2px solid var(--pixel-bg)' : '2px solid var(--pixel-border)',
  borderRadius: 0,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  userSelect: 'none',
  marginBottom: isActive ? -2 : 0,
  position: 'relative',
  top: isActive ? 1 : 0,
})

const newTabBtnStyle = (isHovered: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  fontSize: '22px',
  color: 'var(--pixel-text-dim)',
  background: isHovered ? 'var(--pixel-btn-hover-bg)' : 'transparent',
  border: '2px solid transparent',
  borderRadius: 0,
  cursor: 'pointer',
  flexShrink: 0,
})

const closeBtnStyle = (isHovered: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 16,
  height: 16,
  fontSize: '16px',
  lineHeight: 1,
  color: isHovered ? 'var(--pixel-close-hover)' : 'var(--pixel-close-text)',
  background: isHovered ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
  border: 'none',
  borderRadius: 0,
  cursor: 'pointer',
  padding: 0,
})

const dirtyIndicatorStyle: React.CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: 'var(--pixel-accent)',
  flexShrink: 0,
}

export function TabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
}: TabBarProps) {
  const [hoveredTab, setHoveredTab] = useState<number | null>(null)
  const [hoveredClose, setHoveredClose] = useState<number | null>(null)
  const [isNewHovered, setIsNewHovered] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll active tab into view
  useEffect(() => {
    if (activeTabId && scrollRef.current) {
      const activeTab = scrollRef.current.querySelector(`[data-tab-id="${activeTabId}"]`)
      if (activeTab) {
        activeTab.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' })
      }
    }
  }, [activeTabId])

  // Handle wheel scroll
  const handleWheel = (e: React.WheelEvent) => {
    if (scrollRef.current) {
      e.preventDefault()
      scrollRef.current.scrollLeft += e.deltaY
    }
  }

  return (
    <div style={tabBarStyle} ref={scrollRef} onWheel={handleWheel}>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          data-tab-id={tab.id}
          style={tabStyle(tab.id === activeTabId, hoveredTab === tab.id)}
          onMouseEnter={() => setHoveredTab(tab.id)}
          onMouseLeave={() => setHoveredTab(null)}
          onClick={() => onSelectTab(tab.id)}
          title={tab.projectPath}
        >
          {tab.isDirty && <span style={dirtyIndicatorStyle} />}
          <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {tab.name}
          </span>
          <button
            style={closeBtnStyle(hoveredClose === tab.id)}
            onMouseEnter={() => setHoveredClose(tab.id)}
            onMouseLeave={() => setHoveredClose(null)}
            onClick={(e) => {
              e.stopPropagation()
              onCloseTab(tab.id)
            }}
            title="Close tab"
          >
            ×
          </button>
        </div>
      ))}

      <button
        style={newTabBtnStyle(isNewHovered)}
        onMouseEnter={() => setIsNewHovered(true)}
        onMouseLeave={() => setIsNewHovered(false)}
        onClick={onNewTab}
        title="New tab"
      >
        +
      </button>
    </div>
  )
}
