import React from 'react'

export type NavAction =
  | 'up' | 'down' | 'left' | 'right'
  | 'accept' | 'back' | 'details' | 'alt'
  | 'prevTab' | 'nextTab' | 'menu' | 'view'

// Standard gamepad mapping (Xbox layout)
const BUTTON_ACTION: Record<number, NavAction> = {
  0: 'accept', 1: 'back', 2: 'alt', 3: 'details',
  4: 'prevTab', 5: 'nextTab', 8: 'view', 9: 'menu',
  12: 'up', 13: 'down', 14: 'left', 15: 'right'
}
const REPEATABLE = new Set<NavAction>(['up', 'down', 'left', 'right'])
const INITIAL_DELAY = 320
const REPEAT_EVERY = 110
const DEADZONE = 0.55

export function useGamepad(onAction: (a: NavAction) => void, enabled = true) {
  const [connected, setConnected] = React.useState(false)
  const [id, setId] = React.useState<string | null>(null)
  const cb = React.useRef(onAction)
  cb.current = onAction
  const connectedRef = React.useRef(false)

  React.useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !('getGamepads' in navigator)) return
    let raf = 0
    const held = new Map<NavAction, { since: number; lastFire: number }>()

    const setConn = (c: boolean, padId: string | null) => {
      if (connectedRef.current === c) return
      connectedRef.current = c
      setConnected(c)
      setId(padId)
    }

    const fire = (a: NavAction, now: number) => {
      const h = held.get(a)
      if (!h) { held.set(a, { since: now, lastFire: now }); cb.current(a); return }
      if (!REPEATABLE.has(a)) return
      const wait = now - h.since < INITIAL_DELAY ? INITIAL_DELAY : REPEAT_EVERY
      if (now - h.lastFire >= wait) { h.lastFire = now; cb.current(a) }
    }

    const poll = () => {
      raf = requestAnimationFrame(poll)
      const pads = Array.from(navigator.getGamepads()).filter(Boolean) as Gamepad[]
      const pad = pads[0]
      if (!pad) { setConn(false, null); held.clear(); return }
      setConn(true, pad.id)
      const now = performance.now()
      const active = new Set<NavAction>()
      pad.buttons.forEach((b, i) => {
        const a = BUTTON_ACTION[i]
        if (a && (b.pressed || b.value > 0.5)) active.add(a)
      })
      const ax = pad.axes[0] || 0
      const ay = pad.axes[1] || 0
      if (Math.abs(ax) > DEADZONE && Math.abs(ax) >= Math.abs(ay)) active.add(ax > 0 ? 'right' : 'left')
      else if (Math.abs(ay) > DEADZONE) active.add(ay > 0 ? 'down' : 'up')
      for (const a of active) fire(a, now)
      for (const a of Array.from(held.keys())) if (!active.has(a)) held.delete(a)
    }

    const onConnect = (e: GamepadEvent) => setConn(true, e.gamepad?.id || null)
    const onDisconnect = () => setConn(false, null)
    window.addEventListener('gamepadconnected', onConnect)
    window.addEventListener('gamepaddisconnected', onDisconnect)
    raf = requestAnimationFrame(poll)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('gamepadconnected', onConnect)
      window.removeEventListener('gamepaddisconnected', onDisconnect)
    }
  }, [enabled])

  return { connected, id }
}
