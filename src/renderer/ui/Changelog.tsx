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

  function escapeHtml(s: string) {
    return s
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
  }

  function renderSimpleMarkdown(md: string) {
    // Minimal renderer tailored for our CHANGELOG format (headings + bullet lists + code blocks)
    const lines = md.split(/\r?\n/)
    let html = ''
    let inCode = false
    let codeBuf: string[] = []
    for (const raw of lines) {
      const line = raw.replace(/\s+$/, '')
      if (/^```/.test(line)) {
        if (!inCode) {
          inCode = true
          codeBuf = []
        } else {
          inCode = false
          html += `<pre class="md-code">${escapeHtml(codeBuf.join('\n'))}</pre>`
        }
        continue
      }
      if (inCode) { codeBuf.push(line); continue }

      if (/^#\s+/.test(line)) {
        html += `<h1>${escapeHtml(line.replace(/^#\s+/, ''))}</h1>`; continue
      }
      if (/^##\s+/.test(line)) {
        html += `<h2>${escapeHtml(line.replace(/^##\s+/, ''))}</h2>`; continue
      }
      if (/^###\s+/.test(line)) {
        html += `<h3>${escapeHtml(line.replace(/^###\s+/, ''))}</h3>`; continue
      }
      const m = /^(\s*)([-*+])\s+(.*)$/.exec(line)
      if (m) {
        const depth = Math.floor((m[1] || '').length / 2)
        const content = escapeHtml(m[3]).replace(/`([^`]+)`/g, '<code>$1</code>')
        html += `<div class="md-li" style="margin-left:${depth * 18}px">• ${content}</div>`
        continue
      }
      if (line.trim().length === 0) { html += '<div class="md-space" />'; continue }
      html += `<p>${escapeHtml(line)}</p>`
    }
    return html
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="changelog-card" role="dialog" aria-label="Changelog" onClick={(e) => e.stopPropagation()}>
        <div className="changelog-title">Changelog</div>
        <div className="changelog-content md-github" aria-live="polite" dangerouslySetInnerHTML={{ __html: renderSimpleMarkdown(text) }}>
        </div>
        <div className="changelog-actions">
          <button className="btn" onClick={openRepo}>Open repository</button>
          <button className="btn btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}


