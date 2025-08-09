import React, { useEffect, useState } from 'react'
import { GameCard } from './GameCard'
import { SessionOverlay } from './SessionOverlay'
import launchSound from '../../sounds/launch.ogg'
import { Settings } from './Settings'
import { SessionEndedCard } from './SessionEndedCard'

export type Game = {
  id: string
  title: string
  launcher: 'steam' | 'epic' | string
  installDir?: string
  executablePath?: string
  args?: string[]
  playtimeMinutes?: number
}

declare global {
  interface Window {
    electronAPI: {
      listGames: () => Promise<Game[]>
      launchGame: (game: Game) => Promise<boolean>
    }
  }
}

export function App() {
  const [games, setGames] = useState<Game[]>([])
  const [tab, setTab] = useState<'library' | 'settings'>('library')
  const [loading, setLoading] = useState(false)
  const [session, setSession] = useState<{ game: Game; startedAt: number } | null>(null)
  const [starting, setStarting] = useState<{ game: Game } | null>(null)
  const [ended, setEnded] = useState<{ game: Game; durationMs: number } | null>(null)

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
  }, [])

  return (
    <div className="app">
      {session ? (
        <SessionOverlay
          game={session.game}
          startedAt={session.startedAt}
          onForceQuit={() => (window as any).electronAPI.forceQuit(session.game)}
        />
      ) : (
        <>
          <header className="header">
            <h1>Game Librarian</h1>
            <nav className="tabs">
              <button className={tab === 'library' ? 'active' : ''} onClick={() => setTab('library')}>
                Library
              </button>
              <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>
                Settings
              </button>
            </nav>
          </header>
          {loading && <div className="loading-bar" />}
          <div key={tab} className="view animate-fade">
            {tab === 'library' ? (
              <main className="grid">
                {games.map((g) => (
                  <GameCard key={`${g.launcher}-${g.id}`} game={g} onLaunch={() => onLaunch(g, setStarting)} />
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
