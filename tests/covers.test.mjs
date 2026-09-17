import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CoverCache } from '../electron/covers.js'

async function cacheFixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'librarian-covers-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const cache = new CoverCache(root)
  await cache.init()
  return cache
}

test('missing legacy Steam artwork resolves the current hashed store image', async (t) => {
  const cache = await cacheFixture(t)
  const calls = []
  const art = Buffer.alloc(100, 42)
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls.push(url)
    if (url.includes('/api/appdetails')) return Response.json({ '4704690': { success: true, data: { header_image: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/4704690/hash/header.jpg' } } })
    if (url.includes('/hash/')) return new Response(art, { headers: { 'content-type': 'image/jpeg' } })
    return new Response('', { status: 404 })
  })
  const source = 'https://cdn.akamai.steamstatic.com/steam/apps/4704690/library_600x900.jpg'
  const result = await cache.resolve(source)
  assert.ok(result.startsWith('file:'))
  assert.deepEqual(await fs.readFile(fileURLToPath(result)), art)
  assert.equal(calls.length, 3)
  assert.equal(await cache.resolve(source), result)
  assert.equal(calls.length, 3)
})

test('offline or failed cover requests can recover on retry', async (t) => {
  const cache = await cacheFixture(t)
  let online = false
  t.mock.method(globalThis, 'fetch', async () => {
    if (!online) throw new Error('offline')
    return new Response(Buffer.alloc(100), { headers: { 'content-type': 'image/png' } })
  })
  const source = 'https://example.test/game.png'
  assert.equal(await cache.resolve(source), source)
  online = true
  assert.ok((await cache.resolve(source)).startsWith('file:'))
})

test('local icons pass through and duplicate downloads share one request', async (t) => {
  const cache = await cacheFixture(t)
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => {
    calls++
    return new Response(Buffer.alloc(100), { headers: { 'content-type': 'image/png' } })
  })
  const icon = 'data:image/png;base64,abc'
  assert.equal(await cache.resolve(icon), icon)
  const [a, b] = await Promise.all([cache.resolve('https://example.test/a.png'), cache.resolve('https://example.test/a.png')])
  assert.equal(a, b)
  assert.equal(calls, 1)
})
