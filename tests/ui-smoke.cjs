const { app, BrowserWindow } = require('electron')
const { buildSync } = require('esbuild')
const fs = require('node:fs/promises')
const path = require('node:path')
const assert = require('node:assert/strict')

app.whenReady().then(async () => {
  const dir = path.resolve(__dirname, '../dev/ui-smoke')
  await fs.mkdir(dir, { recursive: true })
  const win = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { contextIsolation: true, backgroundThrottling: false } })
  const messages = []
  win.webContents.on('console-message', (_event, _level, message) => messages.push(message))
  const evaluate = (code) => win.webContents.executeJavaScript(code)
  async function waitFor(code, label) {
    const deadline = Date.now() + 5000
    while (Date.now() < deadline) {
      if (await evaluate(code)) return
      await new Promise((resolve) => setTimeout(resolve, 30))
    }
    throw new Error(`Timed out: ${label}`)
  }
  const click = (label) => evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === ${JSON.stringify(label)} || b.querySelector('.siderail-label')?.textContent === ${JSON.stringify(label)})?.click()`)
  try {
    buildSync({ entryPoints: [path.join(__dirname, 'ui-fixture.tsx')], bundle: true, format: 'esm', outfile: path.join(dir, 'fixture.js'), loader: { '.ogg': 'file', '.png': 'file' }, define: { 'process.env.NODE_ENV': '"test"' } })
    await fs.writeFile(path.join(dir, 'index.html'), '<html><head><link rel="stylesheet" href="fixture.css"></head><body><div id="root"></div><script type="module" src="fixture.js"></script></body></html>')
    await win.loadFile(path.join(dir, 'index.html'))
    await waitFor(`document.querySelector('[role="alert"]')?.textContent.includes('Cannot locate any games')`, 'empty boot error')
    await click('Update launcher locations')
    await waitFor(`document.querySelector('.settings-panel h2')?.textContent === 'Library paths'`, 'direct library paths link')
    await click('Appearance')
    await waitFor(`document.querySelector('.settings-panel h2')?.textContent === 'Appearance'`, 'appearance navigation')
    await click('Update launcher locations')
    await waitFor(`document.querySelector('.settings-panel h2')?.textContent === 'Library paths'`, 'link while settings already open')
    await evaluate(`(() => { const input = document.querySelector('.path-field input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'D:/Games'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`)
    await waitFor(`Array.from(document.querySelectorAll('button')).some(b => b.textContent === 'Save and rescan' && !b.disabled)`, 'edited path can be saved')
    await click('Save and rescan')
    await waitFor(`window.testRescans === 1 && document.querySelector('[role="alert"]')?.textContent.includes('Cannot locate any games')`, 'empty manual rescan error')
    await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    await new Promise((resolve) => setTimeout(resolve, 200))
    await fs.writeFile(path.join(dir, 'empty-library.png'), (await win.webContents.capturePage()).toPNG())
    await evaluate('window.testRefreshing(true)')
    await waitFor(`!document.querySelector('[role="alert"]')`, 'no false error during scan')
    await evaluate('window.testRefreshing(false); window.testGames([{ id: "roblox-player", title: "Roblox", launcher: "roblox" }])')
    await waitFor(`!document.querySelector('[role="alert"]') && document.body.textContent.includes('1')`, 'error clears on successful discovery')
    await click('Library')
    await evaluate(`(() => { const input = document.querySelector('input[type="search"]'); if (!input) throw new Error('Search not found'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'no match'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`)
    await waitFor(`document.body.textContent.includes('No results for')`, 'filtered empty state')
    assert.equal(await evaluate(`!!document.querySelector('[role="alert"]')`), false)
    await evaluate('window.testCover()')
    await waitFor(`document.querySelector('.cover img')?.naturalWidth === 1`, 'broken artwork advances to local icon')
    console.log('PASS: empty boot, direct settings link, repeated navigation, scan state, recovered scan, empty search, image fallback')
    await fs.writeFile(path.join(dir, 'result.json'), JSON.stringify({ ok: true, checks: 8 }))
  } catch (error) {
    console.error(error)
    await fs.writeFile(path.join(dir, 'result.json'), JSON.stringify({ ok: false, error: String(error), messages, page: await evaluate('document.body.innerText').catch(() => '') }, null, 2))
    process.exitCode = 1
  } finally {
    win.destroy()
    app.exit(process.exitCode || 0)
  }
})
