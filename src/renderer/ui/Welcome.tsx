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
        <div className="welcome-actions">
          <button className="btn btn-primary" onClick={onContinue}>Continue</button>
        </div>
      </div>
    </div>
  )
}


