import { registerPlugin } from '@capacitor/core'

export interface SourceHit {
  title: string
  sourceUrl: string
  coverUrl: string
  summary: string
}

export interface SourceEpisode {
  id: string
  title: string
  sourceUrl?: string
  playbackUrl: string
  mimeType: string
  lineId?: string
}

export interface SourcePreview {
  title: string
  sourceUrl: string
  coverUrl: string
  summary: string
  episodes: SourceEpisode[]
}

interface AndroidSource {
  search(options: { keyword: string }): Promise<{ hits: SourceHit[] }>
  preview(options: { sourceUrl: string }): Promise<SourcePreview>
}

export const androidSource = registerPlugin<AndroidSource>('SanyeSource')
