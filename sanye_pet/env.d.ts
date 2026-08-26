/// <reference types="vite/client" />

interface Window {
  petApi: {
    moveBy(dx: number, dy: number): void
    hide(): void
    quit(): void
    toggleTop(): void
    openClient(path?: string): Promise<{ ok: boolean; reason?: string }>
    getConfig(): Promise<{
      clientUrl: string
      alwaysOnTop: boolean
      settings: {
        scale: number
        opacity: number
        animation: boolean
        bubbles: boolean
        reminders: boolean
        quietStart: string
        quietEnd: string
        startOnBoot: boolean
      }
    }>
    setSettings(settings: {
      scale: number
      opacity: number
      animation: boolean
      bubbles: boolean
      reminders: boolean
      quietStart: string
      quietEnd: string
      startOnBoot: boolean
    }): Promise<void>
  }
}
