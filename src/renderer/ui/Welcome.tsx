import React from 'react'

type Props = {
  onContinue: () => void
}

export function Welcome({ onContinue }: Props) {
  const logo = new URL('../../Icon.png', import.meta.url).href
  return (
    <div className="welcome-overlay">
      <div className="welcome-card">
        <div className="welcome-title-wrap">
          <img className="welcome-title-logo" src={logo} alt="" aria-hidden />
          <h1 className="welcome-title">Welcome to Game Librarian</h1>
        </div>
        <p className="welcome-desc">
          Game Librarian is an open-source, unified game library that brings your games together in one modern, lightweight hub.
          Fast detection, streamlined launching, and playtime tracking — all wrapped in a polished, themeable interface.
        </p>
        <div className="welcome-note" role="note">
          <div className="note-header">
            <span className="warn-icon" aria-hidden>⚠️</span>
            <div>
              <div className="note-title">Some libraries may be installed in non‑default locations.</div>
              <div className="note-sub">If a game is missing, perform these checks:</div>
            </div>
          </div>
          <div className="note-steps">
            <div className="step">
              <div className="step-title">Settings</div>
            </div>
            <div className="step-arrow">→</div>
            <div className="step">
              <div className="step-title">Steam / Epic Paths</div>
              <ul className="step-hints">
                <li>Verify that paths are correct</li>
                <li>Add any extra libraries</li>
              </ul>
            </div>
            <div className="step-arrow">→</div>
            <div className="step"><div className="step-title">Validate</div></div>
            <div className="step-arrow">→</div>
            <div className="step">
              <div className="step-title">Steam Debug</div>
              <div className="step-desc">(in Settings) to verify detected folders</div>
            </div>
          </div>
        </div>
        <div className="welcome-actions">
          <button className="btn btn-primary" onClick={onContinue}>Continue</button>
        </div>
      </div>
    </div>
  )
}


