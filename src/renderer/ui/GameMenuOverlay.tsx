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
          {String(game.title || '').toLowerCase().includes('launcher') && (
            <div style={{
              margin: '12px 0 4px',
              padding: '8px 10px',
              background: 'rgba(255, 184, 0, 0.08)',
              border: '1px solid rgba(255, 184, 0, 0.25)',
              borderRadius: 6,
              color: 'var(--muted)'
            }}>
              This game may not record correctly as it is a launcher.
            </div>
          )}
          <div className="menu-actions">
            <button className="btn btn-primary" onClick={onLaunch}>Launch</button>
            <button
              className="btn"
              onClick={async () => {
                const p = (game as any).executablePath || (game as any).installDir
                const lib = (game as any).library
                try { console.debug('[ManageFiles] Requested path:', p, 'library:', lib) } catch {}
                let reveal = p
                try {
                  if (game.launcher === 'steam' && typeof lib === 'string' && typeof p === 'string') {
                    const lower = p.toLowerCase()
                    if (!lower.includes('steamapps')) {
                      // p might be like Z:\SteamLibrary\common\Game OR just common\Game
                      // Ensure we anchor it under <lib>\common\<folder>
                      const tail = lower.includes('common') ? p.substring(lower.indexOf('common') + 'common'.length + 1) : p
                      const { join } = await import('path')
                      reveal = join(lib, 'common', tail)
                    }
                  }
                } catch {}
                try { console.debug('[ManageFiles] Using path:', reveal) } catch {}
                if (reveal) {
                  try {
                    const ok = await (window as any).electronAPI.revealPath(reveal)
                    try { console.debug('[ManageFiles] Reveal result:', ok) } catch {}
                  } catch (e) {
                    try { console.warn('[ManageFiles] Reveal failed:', String(e)) } catch {}
                  }
                } else {
                  try { console.warn('[ManageFiles] No path available on game object') } catch {}
                }
              }}
            >Manage Files</button>
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


