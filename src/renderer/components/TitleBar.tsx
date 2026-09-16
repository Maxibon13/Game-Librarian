import React from 'react'
import type { Tab, WindowChrome } from '../lib/types'
import { IconFullscreen, IconFullscreenExit, IconGamepad, IconSearch, IconClose } from './Icons'

type Props = {
  tab: Tab
  chrome: WindowChrome | null
  fullscreen: boolean
  gamepadConnected: boolean
  refreshing: boolean
  query: string
  onQuery: (q: string) => void
  onToggleFullscreen: () => void
  searchRef: React.RefObject<HTMLInputElement>
  onSearchSubmit?: () => void
}

// Frameless title strip. Native caption buttons come from titleBarOverlay on
// Windows, so the right edge reserves `env(titlebar-area-*)` space.
export function TitleBar({ tab, chrome, fullscreen, gamepadConnected, refreshing, query, onQuery, onToggleFullscreen, searchRef, onSearchSubmit }: Props) {
  const showSearch = tab === 'library'
  return (
    <header className={`titlebar ${fullscreen ? 'is-fullscreen' : ''}`}>
      <div className="titlebar-drag">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          <span className="brand-name">Game Librarian</span>
        </div>
      </div>
      <div className="titlebar-center">
        {showSearch && (
          <label className="search">
            <IconSearch size={16} />
            <input
              ref={searchRef}
              type="search"
              placeholder="Search library"
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { onQuery(''); (e.target as HTMLInputElement).blur() }
                if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); onSearchSubmit?.() }
              }}
              aria-label="Search library"
              spellCheck={false}
            />
            {query && (
              <button className="search-clear" tabIndex={-1} aria-label="Clear search" onClick={() => { onQuery(''); searchRef.current?.focus() }}>
                <IconClose size={14} />
              </button>
            )}
          </label>
        )}
      </div>
      <div className="titlebar-tools">
        {refreshing && <span className="status-chip"><span className="spinner" /> Updating library</span>}
        {gamepadConnected && <span className="status-chip accent" title="Controller connected"><IconGamepad size={16} /></span>}
        <button className="icon-btn" title={fullscreen ? 'Exit fullscreen (F11)' : 'Fullscreen (F11)'} onClick={onToggleFullscreen} tabIndex={-1}>
          {fullscreen ? <IconFullscreenExit size={18} /> : <IconFullscreen size={18} />}
        </button>
      </div>
      {chrome?.platform === 'win32' && !fullscreen && <div className="titlebar-caption-space" aria-hidden />}
    </header>
  )
}
