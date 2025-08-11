import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import { spawnSync } from 'node:child_process'

export class MinecraftDetector {
  constructor() {
    this.type = 'minecraft'
  }

  async detect(_settings) {
    if (os.platform() !== 'win32') return []
    const candidates = []

    // 1) Try Microsoft Store/Xbox Minecraft Launcher (primarily a bridge app). We'll try to find the Win32 stub.
    // New Microsoft Minecraft Launcher often installs a Win32 stub in Program Files (x86)/Minecraft Launcher
    const pf86 = process.env['ProgramFiles(x86)']
    if (pf86) candidates.push(path.join(pf86, 'Minecraft Launcher', 'MinecraftLauncher.exe'))
    const pf = process.env['ProgramFiles']
    if (pf) candidates.push(path.join(pf, 'Minecraft Launcher', 'MinecraftLauncher.exe'))

    // 2) Legacy/third-party launchers that users commonly have installed
    const localAppData = process.env.LOCALAPPDATA
    if (localAppData) {
      candidates.push(path.join(localAppData, 'Programs', 'Minecraft Launcher', 'MinecraftLauncher.exe'))
      candidates.push(path.join(localAppData, 'Microsoft', 'WindowsApps', 'MinecraftLauncher.exe'))
    }
    // Xbox Games default folder (Win11 Xbox app)
    candidates.push('C:/XboxGames/Minecraft Launcher/MinecraftLauncher.exe')

    // 3) Registry check for uninstall/display icon path
    const regHives = [
      'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
      'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
      'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
    ]
    for (const hive of regHives) {
      try {
        const { stdout } = spawnSync('reg', ['query', hive, '/s', '/v', 'DisplayIcon'], { encoding: 'utf8' })
        for (const line of (stdout || '').split(/\r?\n/)) {
          if (/MinecraftLauncher\.exe/i.test(line)) {
            const parts = line.trim().split(/\s{2,}/)
            const val = parts[parts.length - 1]
            if (val && /MinecraftLauncher\.exe/i.test(val)) candidates.push(val.replace(/,\d+$/, ''))
          }
        }
      } catch {}
    }
    // Also look for InstallLocation values that point to folder containing the launcher
    for (const hive of regHives) {
      try {
        const { stdout } = spawnSync('reg', ['query', hive, '/s', '/v', 'InstallLocation'], { encoding: 'utf8' })
        for (const line of (stdout || '').split(/\r?\n/)) {
          if (/Minecraft/i.test(line)) {
            const parts = line.trim().split(/\s{2,}/)
            const dir = parts[parts.length - 1]
            if (dir) candidates.push(path.join(dir, 'MinecraftLauncher.exe'))
          }
        }
      } catch {}
    }

    const exe = candidates.find((p) => {
      try { return fsSync.existsSync(p) } catch { return false }
    })

    if (exe) {
      return [{ id: 'minecraft-launcher', title: 'Minecraft Launcher', launcher: 'minecraft', executablePath: exe }]
    }

    // 4) If protocol handler exists, add a protocol-based launcher entry so it still shows up and can launch
    try {
      const { status } = spawnSync('reg', ['query', 'HKCR\\minecraft\\shell\\open\\command'], { encoding: 'utf8' })
      if (status === 0) {
        return [{ id: 'minecraft-launcher-protocol', title: 'Minecraft Launcher', launcher: 'minecraft' }]
      }
    } catch {}

    return []
  }
}


