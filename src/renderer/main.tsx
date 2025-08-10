import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './ui/App'
import { Updater } from './ui/Updater'
import './ui/styles.css'

const container = document.getElementById('root')!
const root = createRoot(container)

function Root() {
  const [ready, setReady] = React.useState(false)
  return ready ? <App /> : <Updater onReady={() => setReady(true)} />
}

root.render(<Root />)


