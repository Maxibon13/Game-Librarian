export {}
declare global {
  interface Window {
    electronAPI: any
  }
}

declare module '*.ogg' {
  const src: string
  export default src
}
declare module '*.OGG' {
  const src: string
  export default src
}
// Vite supports importing assets directly; our default '*.ogg' module above suffices.


