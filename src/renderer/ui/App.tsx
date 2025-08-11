import React, { useEffect, useState } from 'react'
import { GameCard } from './GameCard'
import { SessionOverlay } from './SessionOverlay'
const launchSound = new URL('../../sounds/Launch.ogg', import.meta.url).href
const openSound = new URL('../../sounds/Open.ogg', import.meta.url).href
const closeSound = new URL('../../sounds/Close.ogg', import.meta.url).href
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
  const [sortOrder, setSortOrder] = useState<'az' | 'za' | 'playtime-desc' | 'playtime-asc'>('az')
  const [query, setQuery] = useState('')
  const [modeAnim, setModeAnim] = useState(false)
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [masterVolume, setMasterVolume] = useState(1)
  const [appVersion, setAppVersion] = useState<string | null>(null)

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

    // Load UI/audio preferences
    if (api?.getSettings) {
      api.getSettings().then((s: any) => {
        const ui = s?.ui || {}
        if (ui.viewMode === 'large' || ui.viewMode === 'small' || ui.viewMode === 'list') {
          setViewMode(ui.viewMode)
        }
        if (ui.sort === 'az' || ui.sort === 'za' || ui.sort === 'playtime-desc' || ui.sort === 'playtime-asc') {
          setSortOrder(ui.sort)
        }
        const audio = s?.audio || {}
        setAudioEnabled(audio.enabled !== false)
        const mv = typeof audio.masterVolume === 'number' ? audio.masterVolume : 1
        setMasterVolume(Math.max(0, Math.min(1, mv)))
      }).catch(() => {})
    }

    // Load app version for watermark
    if (api?.getAppConfig) {
      api.getAppConfig().then((cfg: any) => {
        const v = cfg?.appVersion
        if (typeof v === 'string' && v.length > 0) setAppVersion(v)
      }).catch(() => {})
    }
  }, [])

  // Removed global UI button hover sound

  const sortedGames = React.useMemo(() => {
    const byTitle = (a: Game, b: Game) =>
      (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' })
    const byPlaytimeDesc = (a: Game, b: Game) => {
      const ap = Math.max(0, a.playtimeMinutes ?? 0)
      const bp = Math.max(0, b.playtimeMinutes ?? 0)
      if (bp !== ap) return bp - ap
      return byTitle(a, b)
    }
    const byPlaytimeAsc = (a: Game, b: Game) => {
      const ap = Math.max(0, a.playtimeMinutes ?? 0)
      const bp = Math.max(0, b.playtimeMinutes ?? 0)
      if (ap !== bp) return ap - bp
      return byTitle(a, b)
    }
    const filtered = query.trim().length > 0
      ? games.filter((g) => (g.title || '').toLowerCase().includes(query.trim().toLowerCase()))
      : games
    const list = filtered.slice()
    if (sortOrder === 'playtime-desc') return list.sort(byPlaytimeDesc)
    if (sortOrder === 'playtime-asc') return list.sort(byPlaytimeAsc)
    const titled = list.sort(byTitle)
    return sortOrder === 'az' ? titled : titled.reverse()
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

  async function changeSort(next: 'az' | 'za' | 'playtime-desc' | 'playtime-asc') {
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
                    onChange={(e) => changeSort(e.target.value as 'az' | 'za' | 'playtime-desc' | 'playtime-asc')}
                    title="Sort order"
                  >
                    <option value="az">A → Z</option>
                    <option value="za">Z → A</option>
                    <option value="playtime-desc">Most played</option>
                    <option value="playtime-asc">Least played</option>
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
                    onLaunch={() => onLaunch(g, setStarting, audioEnabled, masterVolume)}
                    audioEnabled={audioEnabled}
                    masterVolume={masterVolume}
                    onOpen={() => onOpenMenu(g, setMenu, audioEnabled, masterVolume)}
                    variant={viewMode}
                  />
                ))}
              </main>
            ) : (
              <Settings
                audio={{ enabled: audioEnabled, masterVolume }}
                onAudioChange={async (next) => {
                  setAudioEnabled(next.enabled)
                  setMasterVolume(next.masterVolume)
                  try {
                    const current = await (window as any).electronAPI.getSettings()
                    await (window as any).electronAPI.saveSettings({ ...current, audio: next })
                  } catch {}
                }}
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
          onClose={() => onCloseMenu(setMenu, audioEnabled, masterVolume)}
          onLaunch={() => { onLaunch(menu.game, setStarting, audioEnabled, masterVolume); onCloseMenu(setMenu, audioEnabled, masterVolume) }}
        />
      )}

      {appVersion && (
        <div className="version-watermark" aria-hidden>
          v{appVersion}
        </div>
      )}
    </div>
  )
}

function onLaunch(game: Game, setStarting: (v: { game: Game }) => void, audioEnabled: boolean, masterVolume: number) {
  if (audioEnabled) {
    const audio = new Audio(launchSound)
    audio.volume = 0.6 * Math.max(0, Math.min(1, masterVolume))
    audio.preload = 'auto'
    audio.play().catch(() => {})
  }
  setStarting({ game })
  return (window as any).electronAPI.launchGame(game)
}

function onOpenMenu(game: Game, setMenu: (v: { game: Game } | null) => void, audioEnabled: boolean, masterVolume: number) {
  try {
    if (audioEnabled) {
      const audio = new Audio(openSound)
      audio.volume = 0.6 * Math.max(0, Math.min(1, masterVolume))
      audio.play().catch(() => {})
    }
  } catch {}
  setMenu({ game })
}

function onCloseMenu(setMenu: (v: { game: Game } | null) => void, audioEnabled?: boolean, masterVolume?: number) {
  try {
    if (audioEnabled) {
      const audio = new Audio(closeSound)
      const mv = Math.max(0, Math.min(1, masterVolume ?? 1))
      audio.volume = 0.6 * mv
      audio.play().catch(() => {})
    }
  } catch {}
  setMenu(null)
}
