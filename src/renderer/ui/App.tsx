import React, { useEffect, useState } from 'react'
import { GameCard } from './GameCard'
import { SessionOverlay } from './SessionOverlay'
const launchSound = new URL('../../sounds/Launch.ogg', import.meta.url).href
const openSound = new URL('../../sounds/Open.ogg', import.meta.url).href
const closeSound = new URL('../../sounds/Close.ogg', import.meta.url).href
const uiButtonHoverSound = new URL('../../sounds/UiButton.ogg', import.meta.url).href
import { Settings } from './Settings'
import { SessionEndedCard } from './SessionEndedCard'
import GameMenuOverlay from './GameMenuOverlay'

export type Game = {
  id: string
  title: string
  launcher: 'steam' | 'epic' | string
  installDir?: string
  executablePath?: string
  args?: string[]
  playtimeMinutes?: number
}

export function App() {
  const [games, setGames] = useState<Game[]>([])
  const [tab, setTab] = useState<'library' | 'settings'>('library')
  const [loading, setLoading] = useState(false)
  const [session, setSession] = useState<{ game: Game; startedAt: number } | null>(null)
  const [starting, setStarting] = useState<{ game: Game } | null>(null)
  const [ended, setEnded] = useState<{ game: Game; durationMs: number } | null>(null)
  const [menu, setMenu] = useState<{ game: Game } | null>(null)
  const [viewMode, setViewMode] = useState<'large' | 'small' | 'list'>('large')
  const [sortOrder, setSortOrder] = useState<'az' | 'za'>('az')
  const [query, setQuery] = useState('')
  const [modeAnim, setModeAnim] = useState(false)

  useEffect(() => {
    const api = (window as any).electronAPI
    if (api?.listGames) {
      setLoading(true)
      api
        .listGames()
        .then(setGames)
        .catch(() => setGames([]))
        .finally(() => setLoading(false))
    }

    if (api?.onSessionStart) {
      api.onSessionStart((payload: any) => {
        console.log('Session started:', payload)
        setStarting(null)
        setSession(payload)
      })
    }
    if (api?.onSessionEnd) {
      api.onSessionEnd((payload: any) => {
        console.log('Session ended')
        setSession(null)
        setStarting(null)
        if (payload?.game && typeof payload?.durationMs === 'number') {
          setEnded({ game: payload.game, durationMs: payload.durationMs })
        }
      })
    }

    // Load UI preferences
    if (api?.getSettings) {
      api.getSettings().then((s: any) => {
        const ui = s?.ui || {}
        if (ui.viewMode === 'large' || ui.viewMode === 'small' || ui.viewMode === 'list') {
          setViewMode(ui.viewMode)
        }
        if (ui.sort === 'az' || ui.sort === 'za') {
          setSortOrder(ui.sort)
        }
      }).catch(() => {})
    }
  }, [])

  // Global UI button hover sound
  useEffect(() => {
    let lastBtn: Element | null = null
    const onPointerOver = (e: PointerEvent) => {
      const target = (e.target as Element) || null
      const btn = target ? target.closest('button') : null
      if (btn && btn !== lastBtn) {
        lastBtn = btn
        try {
          const audio = new Audio(uiButtonHoverSound)
          audio.volume = 0.35
          audio.play().catch(() => {})
        } catch {}
      } else if (!btn) {
        lastBtn = null
      }
    }
    document.addEventListener('pointerover', onPointerOver)
    return () => document.removeEventListener('pointerover', onPointerOver)
  }, [])

  const sortedGames = React.useMemo(() => {
    const byTitle = (a: Game, b: Game) =>
      (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' })
    const filtered = query.trim().length > 0
      ? games.filter((g) => (g.title || '').toLowerCase().includes(query.trim().toLowerCase()))
      : games
    const list = filtered.slice().sort(byTitle)
    return sortOrder === 'az' ? list : list.reverse()
  }, [games, sortOrder, query])

  async function changeView(next: 'large' | 'small' | 'list') {
    setViewMode(next)
    setModeAnim(true)
    setTimeout(() => setModeAnim(false), 260)
    try {
      const current = await (window as any).electronAPI.getSettings()
      await (window as any).electronAPI.saveSettings({ ...current, ui: { ...(current?.ui || {}), viewMode: next } })
    } catch {}
  }

  async function changeSort(next: 'az' | 'za') {
    setSortOrder(next)
    try {
      const current = await (window as any).electronAPI.getSettings()
      await (window as any).electronAPI.saveSettings({ ...current, ui: { ...(current?.ui || {}), sort: next } })
    } catch {}
  }

  return (
    <div className={`app ${tab === 'settings' ? 'is-settings' : ''}`}>
      {session ? (
        <SessionOverlay
          game={session.game}
          startedAt={session.startedAt}
          onForceQuit={() => (window as any).electronAPI.forceQuit(session.game)}
        />
      ) : (
        <>
          <header className="header">
            <div className="left">
              <h1>Game Librarian</h1>
              <nav className="tabs">
                <button className={tab === 'library' ? 'active' : ''} onClick={() => setTab('library')}>
                  Library
                </button>
                <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>
                  Settings
                </button>
              </nav>
            </div>
            {tab === 'library' && (
              <div className="right">
                <div className="controls">
                  <div className="group">
                    <button
                      className={viewMode === 'list' ? 'active' : ''}
                      title="List view"
                      onClick={() => changeView('list')}
                    >List</button>
                    <button
                      className={viewMode === 'small' ? 'active' : ''}
                      title="Small icons"
                      onClick={() => changeView('small')}
                    >Small</button>
                    <button
                      className={viewMode === 'large' ? 'active' : ''}
                      title="Large icons"
                      onClick={() => changeView('large')}
                    >Large</button>
                  </div>
                  <select
                    className="sort-select"
                    value={sortOrder}
                    onChange={(e) => changeSort(e.target.value as 'az' | 'za')}
                    title="Sort order"
                  >
                    <option value="az">A → Z</option>
                    <option value="za">Z → A</option>
                  </select>
                </div>
              </div>
            )}
          </header>
          {tab === 'library' && (
            <div className="search-bar">
              <input
                type="text"
                placeholder="Search games..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search games"
              />
            </div>
          )}
          {loading && <div className="loading-bar" />}
          <div key={tab} className="view animate-fade">
            {tab === 'library' ? (
              <main className={`grid ${viewMode} ${modeAnim ? 'view-switch-in' : ''}`}>
                {sortedGames.map((g) => (
                  <GameCard
                    key={`${g.launcher}-${g.id}`}
                    game={g}
                    onLaunch={() => onLaunch(g, setStarting)}
                    onOpen={() => onOpenMenu(g, setMenu)}
                    variant={viewMode}
                  />
                ))}
              </main>
            ) : (
              <Settings
                onSaved={async () => {
                  setLoading(true)
                  try {
                    setGames(await (window as any).electronAPI.listGames())
                  } finally {
                    setLoading(false)
                  }
                }}
              />
            )}
          </div>
        </>
      )}

      {starting && (
        <div className="session-overlay starting">
          <div className="session-content">
            <div className="session-title">Launching {starting.game.title}…</div>
            <div className="progress-bar">
              <div className="bar" />
            </div>
            <div className="session-actions">
              <span style={{ opacity: 0.8, fontSize: 12 }}>Detecting game process…</span>
            </div>
          </div>
        </div>
      )}
      {ended && (
        <SessionEndedCard
          game={ended.game}
          durationMs={ended.durationMs}
          onClose={() => setEnded(null)}
        />
      )}

      {menu && (
        <GameMenuOverlay
          game={menu.game}
          onClose={() => onCloseMenu(setMenu)}
          onLaunch={() => { onLaunch(menu.game, setStarting); onCloseMenu(setMenu) }}
        />
      )}
    </div>
  )
}

function onLaunch(game: Game, setStarting: (v: { game: Game }) => void) {
  const audio = new Audio(launchSound)
  audio.volume = 0.6
  audio.preload = 'auto'
  audio.play().catch(() => {})
  setStarting({ game })
  return (window as any).electronAPI.launchGame(game)
}

function onOpenMenu(game: Game, setMenu: (v: { game: Game } | null) => void) {
  try {
    const audio = new Audio(openSound)
    audio.volume = 0.6
    audio.play().catch(() => {})
  } catch {}
  setMenu({ game })
}

function onCloseMenu(setMenu: (v: { game: Game } | null) => void) {
  try {
    const audio = new Audio(closeSound)
    audio.volume = 0.6
    audio.play().catch(() => {})
  } catch {}
  setMenu(null)
}
