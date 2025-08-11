import React from 'react'

type Props = {
  onClose: () => void
}

export function Changelog({ onClose }: Props) {
  const [text, setText] = React.useState<string>('Loading changelog…')
  const [repoUrl, setRepoUrl] = React.useState<string>('https://github.com/Maxibon13/Game-Librarian')

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const cfg = await (window as any).electronAPI.getAppConfig?.()
        const repo = String(cfg?.appRepository || cfg?.AppRepository || 'https://github.com/Maxibon13/Game-Librarian')
        if (!cancelled) setRepoUrl(repo)
        // Build raw URL for CHANGELOG.md
        const u = new URL(repo)
        const [owner, name] = u.pathname.replace(/^\//, '').split('/')
        const raw = `https://raw.githubusercontent.com/${owner}/${name}/main/CHANGELOG.md`
        const res = await fetch(raw, { cache: 'no-store' })
        if (!res.ok) throw new Error(String(res.status))
        const md = await res.text()
        if (!cancelled) setText(md || 'Empty changelog')
      } catch (e) {
        if (!cancelled) setText('Unable to load CHANGELOG.md from repository. You can open the project page to view release notes.')
      }
    })()
    return () => { cancelled = true }
  }, [])

  function openRepo() {
    (window as any).electronAPI.openExternal?.(repoUrl)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="changelog-card" role="dialog" aria-label="Changelog" onClick={(e) => e.stopPropagation()}>
        <div className="changelog-title">Changelog</div>
        <div className="changelog-content" aria-live="polite">
          <pre className="md-plain">{text}</pre>
        </div>
        <div className="changelog-actions">
          <button className="btn" onClick={openRepo}>Open repository</button>
          <button className="btn btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}


