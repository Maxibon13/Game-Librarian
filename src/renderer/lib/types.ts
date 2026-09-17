export type Game = {
  id: string
  title: string
  originalTitle?: string
  launcher: 'steam' | 'epic' | 'gog' | 'ubisoft' | 'xbox' | 'roblox' | string
  installDir?: string
  executablePath?: string
  library?: string | null
  image?: string
  images?: string[]
  icon?: string
  args?: string[]
  playtimeMinutes?: number
  lastPlayedAt?: number
  addedAt?: number
  aumid?: string
}

export type Tab = 'home' | 'library' | 'settings'
export type ViewMode = 'grid' | 'compact' | 'list'
export type SortOrder = 'az' | 'za' | 'playtime-desc' | 'playtime-asc' | 'recent'
export type AudioProfile = 'normal' | 'alt'

export type Settings = {
  steam: { steamPath: string; customLibraries: string[] }
  epic: { manifestDir: string }
  gog: { manifestDir: string; customLibraries: string[] }
  ubisoft: { manifestDir: string; customLibraries: string[] }
  theme: { name: string }
  welcomeSeen?: boolean
  ui: {
    viewMode: ViewMode | 'large' | 'small'
    sort: SortOrder
    mica?: boolean
    fullscreenOnGamepad?: boolean
    sessionFocusMode?: boolean
    reduceMotion?: boolean
    chrome?: { titleBarColor?: string; titleBarSymbolColor?: string }
  }
  audio: { enabled: boolean; masterVolume: number; profile: AudioProfile }
  hotkeys: { [action: string]: string }
  windows: { closeToTray?: boolean; notifications?: boolean }
  customTitles?: { [key: string]: string }
}

export type WindowChrome = {
  platform: string
  mica: boolean
  micaSupported: boolean
  fullscreen: boolean
  maximized: boolean
  titleBarHeight: number
}

export type Session = { game: Game; startedAt: number }

export function gameKey(g: Pick<Game, 'launcher' | 'id'>) {
  return `${g.launcher}:${g.id}`
}

export const LAUNCHER_LABEL: Record<string, string> = {
  steam: 'Steam',
  epic: 'Epic Games',
  gog: 'GOG',
  ubisoft: 'Ubisoft Connect',
  xbox: 'Xbox',
  msstore: 'Microsoft Store',
  roblox: 'Roblox',
  minecraft: 'Minecraft'
}

export function launcherLabel(l: string) {
  return LAUNCHER_LABEL[l] || (l ? l[0].toUpperCase() + l.slice(1) : 'Unknown')
}
