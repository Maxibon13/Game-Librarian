import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { SteamDetector } from '../src/main/services/detection/SteamDetector.js'
import { EpicDetector } from '../src/main/services/detection/EpicDetector.js'
import { findSteamLibraries } from '../src/main/services/detection/LibraryLocations.js'
import { steamImages } from '../src/main/services/detection/SteamArtwork.js'

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'librarian-test-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  return root
}

async function manifest(library, id, title) {
  const folder = path.join(library, 'steamapps')
  await fs.mkdir(folder, { recursive: true })
  await fs.writeFile(path.join(folder, `appmanifest_${id}.acf`), `"AppState" { "appid" "${id}" "name" "${title}" "installdir" "${title}" }`)
}

test('first scan discovers games on secondary drives without a Steam installation', async (t) => {
  const drive = await fixture(t)
  const library = path.join(drive, 'Games', 'My unusual library')
  await manifest(library, '252950', 'Rocket League')
  const exe = path.join(library, 'steamapps', 'common', 'Rocket League', 'Binaries', 'Win64', 'RocketLeague.exe')
  await fs.mkdir(path.dirname(exe), { recursive: true })
  await fs.writeFile(exe, '')
  const detector = new SteamDetector({ getDriveRoots: async () => [drive] })
  detector.findSteamPath = async () => null
  const games = await detector.detect({})
  assert.equal(games.length, 1)
  assert.equal(games[0].id, '252950')
  assert.equal(path.normalize(games[0].executablePath), exe)
})

test('Steam reads both library records, including deep and legacy paths', async (t) => {
  const root = await fixture(t)
  const steam = path.join(root, 'Steam')
  const modern = path.join(root, 'outside', 'bounded', 'drive', 'scan', 'depth', 'Modern')
  const legacy = path.join(root, 'Legacy')
  await manifest(steam, '1', 'Default')
  await manifest(modern, '2', 'Modern')
  await manifest(legacy, '3', 'Legacy')
  const vdfPath = (p) => p.replaceAll('\\', '\\\\')
  await fs.writeFile(path.join(steam, 'steamapps', 'libraryfolders.vdf'), `"libraryfolders" { "1" { "path" "${vdfPath(modern)}" } }`)
  await fs.mkdir(path.join(steam, 'config'))
  await fs.writeFile(path.join(steam, 'config', 'libraryfolders.vdf'), `"LibraryFolders" { "1" "${vdfPath(legacy)}" "TimeNextStatsReport" "123" }`)
  const detector = new SteamDetector({ getDriveRoots: async () => [] })
  const games = await detector.detect({ steam: { steamPath: steam } })
  assert.deepEqual(games.map((g) => String(g.id)).sort(), ['1', '2', '3'])
  assert.equal(detector.lastDebug.libraries.some((p) => p.includes('123')), false)
})

test('custom roots remain usable when the launcher path is missing', async (t) => {
  const root = await fixture(t)
  await manifest(root, '7', 'Custom')
  const detector = new SteamDetector({ getDriveRoots: async () => [] })
  detector.findSteamPath = async () => null
  const games = await detector.detect({ steam: { customLibraries: [root] } })
  assert.equal(games[0].title, 'Custom')
})

test('bounded discovery prunes game content and system directories', async (t) => {
  const root = await fixture(t)
  const library = path.join(root, 'Games', 'steamapps')
  await fs.mkdir(path.join(library, 'common', 'Fake', 'steamapps'), { recursive: true })
  await fs.mkdir(path.join(root, 'Windows', 'steamapps'), { recursive: true })
  assert.deepEqual(await findSteamLibraries([root]), [library])
})

test('Steam artwork finds legacy and hashed per-app images without borrowing another game', async (t) => {
  const root = await fixture(t)
  const cache = path.join(root, 'appcache', 'librarycache')
  await fs.mkdir(path.join(cache, '2483190'), { recursive: true })
  await fs.writeFile(path.join(cache, '2483190', 'library_600x900_deadbeef.jpg'), 'image')
  await fs.writeFile(path.join(cache, '2483190_header.jpg'), 'image')
  await fs.writeFile(path.join(cache, '999_library_600x900.jpg'), 'other image')
  const images = await steamImages(root, '2483190')
  assert.equal(images.length, 2)
  assert.ok(images.some((url) => url.endsWith('library_600x900_deadbeef.jpg')))
  assert.ok(images.every((url) => url.includes('2483190')))
  assert.deepEqual(await steamImages(null, '2483190'), [])
})

test('Epic accepts a launcher data root and preserves its launch executable and artwork', async (t) => {
  const root = await fixture(t)
  const manifests = path.join(root, 'Data', 'Manifests')
  await fs.mkdir(manifests, { recursive: true })
  await fs.writeFile(path.join(manifests, 'rocket.item'), JSON.stringify({ AppName: 'Sugar', DisplayName: 'Rocket League', InstallLocation: root, LaunchExecutable: 'Binaries/Win64/RocketLeague.exe', ImageUrl: 'https://example.test/rocket.png' }))
  const detector = new EpicDetector()
  const dirs = await detector.findManifestDirs({ epic: { manifestDir: root } })
  assert.ok(dirs.includes(manifests))
  detector.findManifestDirs = async () => dirs.filter((p) => p.startsWith(root))
  const games = await detector.detect({})
  assert.equal(games.length, 1)
  assert.equal(games[0].executablePath, path.join(root, 'Binaries', 'Win64', 'RocketLeague.exe'))
  assert.equal(games[0].image, 'https://example.test/rocket.png')
})
