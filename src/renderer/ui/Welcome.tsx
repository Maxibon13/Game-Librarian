import React from 'react'
import { playSound } from '../lib/audio'

type Props = {
  onContinue: () => void
}

export function Welcome({ onContinue }: Props) {
  const logo = new URL('../../../assets/icons/Icon.png', import.meta.url).href
  React.useEffect(() => {
    requestAnimationFrame(() => document.querySelector<HTMLElement>('.welcome-card [data-nav-default]')?.focus())
  }, [])
  return (
    <div className="welcome-overlay" data-nav-root>
      <div className="welcome-card">
        <div className="welcome-title-wrap">
          <img className="welcome-title-logo" src={logo} alt="" aria-hidden />
          <h1 className="welcome-title">Welcome to Game Librarian</h1>
        </div>
        <p className="welcome-desc">
          One console-style home for every launcher on this PC. Steam, Epic, GOG, Ubisoft Connect and Xbox games are
          detected automatically, launched from one place, and tracked for playtime.
        </p>
        <div className="welcome-grid">
          <div className="welcome-step">
            <div className="welcome-step-title">Home</div>
            <div className="welcome-step-body">Jump back into what you played last. Covers, rails, and a big Play button.</div>
          </div>
          <div className="welcome-step">
            <div className="welcome-step-title">Library</div>
            <div className="welcome-step-body">Every game in a portrait grid. Filter by launcher, search with <kbd>/</kbd>.</div>
          </div>
          <div className="welcome-step">
            <div className="welcome-step-title">Controller ready</div>
            <div className="welcome-step-body">Plug in a gamepad: <kbd>A</kbd> plays, <kbd>Y</kbd> opens details, <kbd>B</kbd> goes back.</div>
          </div>
        </div>
        <div className="welcome-note" role="note">
          Missing a game? Launchers installed somewhere unusual can be pointed at in <strong>Settings → Library paths</strong>, then rescanned.
        </div>
        <div className="welcome-actions">
          <button className="btn btn-accent btn-lg" data-nav data-nav-default onClick={() => { playSound('welcome'); onContinue() }}>Continue</button>
        </div>
      </div>
    </div>
  )
}
