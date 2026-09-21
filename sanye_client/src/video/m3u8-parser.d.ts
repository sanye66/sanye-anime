declare module 'm3u8-parser' {
  export class Parser {
    push(value: string): void
    end(): void
    manifest: {
      endList?: boolean
      playlists?: { uri: string; attributes?: { AUDIO?: string; RESOLUTION?: { height: number } } }[]
      segments?: { uri: string; duration: number; key?: unknown; map?: unknown; byterange?: unknown; discontinuity?: boolean }[]
    }
  }
}
