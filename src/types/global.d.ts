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


