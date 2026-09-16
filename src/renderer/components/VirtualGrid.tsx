import React from 'react'

type Props<T> = {
  items: T[]
  keyOf: (item: T) => string
  minTileWidth: number
  aspect: number // height / width of the tile's cover
  captionHeight: number
  gap: number
  scrollParent: React.RefObject<HTMLElement>
  overscanRows?: number
  render: (item: T, index: number) => React.ReactNode
}

// Row-windowed grid. Renders only rows intersecting the scroll parent viewport
// (plus overscan) so large libraries stay cheap while remaining plain DOM for
// spatial navigation.
export function VirtualGrid<T>({ items, keyOf, minTileWidth, aspect, captionHeight, gap, scrollParent, overscanRows = 2, render }: Props<T>) {
  const hostRef = React.useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = React.useState(0)
  const [range, setRange] = React.useState({ start: 0, end: 0 })

  React.useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(Math.floor(e.contentRect.width))
    })
    ro.observe(host)
    setWidth(Math.floor(host.clientWidth))
    return () => ro.disconnect()
  }, [])

  const cols = Math.max(1, Math.floor((width + gap) / (minTileWidth + gap)))
  const tileW = cols > 0 && width > 0 ? (width - gap * (cols - 1)) / cols : minTileWidth
  const rowH = tileW * aspect + captionHeight + gap
  const rows = Math.ceil(items.length / cols)
  const totalH = Math.max(0, rows * rowH - gap)

  const measure = React.useCallback(() => {
    const host = hostRef.current
    const sp = scrollParent.current
    if (!host || !sp || rowH <= 0) return
    const hostTop = host.getBoundingClientRect().top - sp.getBoundingClientRect().top + sp.scrollTop
    const viewTop = sp.scrollTop - hostTop
    const viewBottom = viewTop + sp.clientHeight
    const start = Math.max(0, Math.floor(viewTop / rowH) - overscanRows)
    const end = Math.min(rows, Math.ceil(viewBottom / rowH) + overscanRows)
    setRange((r) => (r.start === start && r.end === end ? r : { start, end }))
  }, [rowH, rows, overscanRows, scrollParent])

  React.useEffect(() => {
    measure()
    const sp = scrollParent.current
    if (!sp) return
    let raf = 0
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure) }
    sp.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => { sp.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(raf) }
  }, [measure, scrollParent])

  // Keep the focused tile mounted when it scrolls out via keyboard (focus moves first, then scroll)
  React.useEffect(() => {
    const onFocus = () => requestAnimationFrame(measure)
    document.addEventListener('focusin', onFocus)
    return () => document.removeEventListener('focusin', onFocus)
  }, [measure])

  const children: React.ReactNode[] = []
  if (width > 0) {
    const from = range.start * cols
    const to = Math.min(items.length, range.end * cols)
    for (let i = from; i < to; i++) {
      const item = items[i]
      const r = Math.floor(i / cols)
      const c = i % cols
      children.push(
        <div
          key={keyOf(item)}
          className="vgrid-cell"
          style={{ position: 'absolute', top: r * rowH, left: c * (tileW + gap), width: tileW, height: rowH - gap }}
        >
          {render(item, i)}
        </div>
      )
    }
  }

  return (
    <div ref={hostRef} className="vgrid" style={{ position: 'relative', height: totalH }}>
      {children}
    </div>
  )
}
