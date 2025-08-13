import React from 'react'

type Line = { ts: string; level: 'log' | 'warn' | 'error'; text: string }

export function DebugConsoleView() {
  const [lines, setLines] = React.useState<Line[]>([])
  const scrollerRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    let mounted = true
    const api: any = (window as any).debugConsoleAPI
    const prime = async () => {
      try {
        const res = await api.getBuffer()
        if (mounted && res && res.ok && Array.isArray(res.lines)) setLines(res.lines)
      } catch {}
    }
    const onLog = (line: Line) => {
      if (!mounted) return
      setLines((prev) => {
        const next = [...prev, line]
        if (next.length > 1000) next.shift()
        return next
      })
    }
    const onCleared = () => { if (mounted) setLines([]) }
    try { api?.onLog && api.onLog(onLog) } catch {}
    try { if (typeof api?.onCleared === 'function') api.onCleared(onCleared) } catch {}
    prime()
    return () => { mounted = false }
  }, [])

  React.useEffect(() => {
    try {
      const el = document.getElementById('debug-console')
      if (el) el.scrollTop = el.scrollHeight
    } catch {}
  }, [lines])

  const colorFor = (lvl: string) => lvl === 'error' ? '#ff6b6b' : (lvl === 'warn' ? '#ffd166' : '#9aa4b2')

  return (
    <div>
      {lines.map((l, i) => (
        <div key={i} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
          <span style={{ opacity: .6 }}>{l.ts}</span>
          <span style={{ color: colorFor(l.level) }}> [{l.level.toUpperCase()}]</span>{' '}
          <span>{l.text}</span>
        </div>
      ))}
      {lines.length === 0 && (
        <div style={{ opacity: .7 }}>No logs yet…</div>
      )}
    </div>
  )
}

export default DebugConsoleView


