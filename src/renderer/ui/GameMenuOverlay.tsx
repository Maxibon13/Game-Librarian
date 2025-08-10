import React, { useEffect, useMemo, useState } from 'react'
import type { Game } from './App'

type Props = {
  game: Game
  onClose: () => void
  onLaunch: () => void
  onRenamed?: (nextTitle: string) => void
}

export function GameMenuOverlay({ game, onClose, onLaunch, onRenamed }: Props) {
  const [editing, setEditing] = useState(false)
  const [titleInput, setTitleInput] = useState(game.title)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const bg = useMemo(() => {
    const uri = (game as any).image as string | undefined
    if (uri) return `url(${uri})`
    if (game.launcher === 'steam' && /^\d+$/.test(String(game.id))) {
      return `url(https://steamcdn-a.akamaihd.net/steam/apps/${game.id}/library_600x900.jpg)`
    }
    return 'linear-gradient(135deg, #2a2d35, #1f2127)'
  }, [game])

  async function saveRename() {
    const next = String(titleInput || '').trim()
    if (!next || next === game.title) { setEditing(false); return }
    try {
      await (window as any).electronAPI.setCustomTitle(game.launcher, game.id, next)
      onRenamed?.(next)
      setEditing(false)
    } catch {}
  }

  return (
    <div className="menu-overlay" onClick={onClose}>
      <div className="menu-card" onClick={(e) => e.stopPropagation()}>
        <div className="menu-thumb" style={{ backgroundImage: bg }} />
        <div className="menu-content">
          <div className="menu-title-row">
            {editing ? (
              <input
                className="menu-title-input"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                autoFocus
              />
            ) : (
              <div className="menu-title">{game.title}</div>
            )}
          </div>
          <div className="menu-meta">
            <span className="meta-chip time">{formatMinutes(game.playtimeMinutes ?? 0)}</span>
            <span className="meta-chip launcher">{game.launcher}</span>
          </div>
          <div className="menu-actions">
            <button className="btn btn-primary" onClick={onLaunch}>Launch</button>
            {editing ? (
              <button className="btn btn-primary" onClick={saveRename}>Save</button>
            ) : (
              <button className="btn" onClick={() => { setTitleInput(game.title); setEditing(true) }}>Rename</button>
            )}
            <button className="btn" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default GameMenuOverlay

function formatMinutes(mins: number) {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}


