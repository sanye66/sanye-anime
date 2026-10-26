import { registerPlugin } from '@capacitor/core'
import type { Anime4KProfile } from '../../video/anime4k'
import type { FrameRateTarget } from '../../video/frameCadence'

export interface SavedMedia {
  sourceKey?: string
  id: number
  title: string
  url: string
  coverUrl?: string
  summary?: string
  favorite: boolean
  updatedAt: number
  sourceContext?: import('./source').SourceContext
}

export interface WatchHistory {
  sourceKey?: string
  sourceContext?: import('./source').SourceContext
  mediaUrl: string
  title: string
  episodeId: string
  lineId: string
  episodeTitle: string
  /** 播放时记录的作品封面，历史卡片直接用它显示封面。 */
  coverUrl?: string
  positionSeconds: number
  durationSeconds: number
  completed: boolean
  updatedAt: number
}

/**
 * 落盘的档位表示：原生侧 `validSetting` 只接受字符串，数字会被整条拒绝
 * （用户看到的是「设置保存失败」，且档位永远存不下来）。
 */
export type FrameTargetSetting = 'off' | 'auto' | `${number}`

export interface AndroidSettings {
  theme: 'system' | 'light' | 'dark'
  autoPlay: boolean
  playbackRate: number
  /**
   * 画质档位与补帧目标帧率随设置落盘：起播直接以用户上次选择的档位运行，
   * 不需要每次进入播放器重选（档位集合仍由安卓端 `MOBILE_ANIME4K_PROFILES` 限制）。
   */
  qualityProfile: Anime4KProfile | 'off'
  frameTarget: FrameTargetSetting
  /**
   * 音量（0~1，0 表示静音）随设置落盘（VQ-61）：此前只存在内存里，每次启动都跳回 100%。
   * 老版本插件不返回该字段，调用方按 1 兜底。
   */
  volume: number
}

export interface PersonalDataBackup {
  format: 'sanye-personal-data'
  version: 1 | 2
  exportedAt: number
  savedMedia: SavedMedia[]
  watchHistory: WatchHistory[]
  settings: Partial<AndroidSettings>
}

export interface PersonalDataImportResult {
  /** 实际新增或更新的条数；保留较新数据或重复导入不计数。 */
  savedMedia: number
  watchHistory: number
  settings: number
  /** 备份作品 id → 本机合并后 id，用于恢复来源规则绑定。 */
  savedIdMap: Record<string, number>
  /** 资料/进度实际从备份恢复的记录；较新本机记录不能被旧规则绑定覆盖。 */
  restoredSavedIds: number[]
  restoredHistory: Array<Pick<WatchHistory, 'mediaUrl' | 'episodeId' | 'lineId' | 'sourceKey'>>
}

export interface RestoreJournal {
  token: string
  subscriptions: Array<{ url: string; name: string; content?: string; updatedAt?: number }>
}

interface AndroidCatalog {
  list(): Promise<{ items: SavedMedia[] }>
  save(options: { title: string; url: string; coverUrl?: string; summary?: string; favorite?: boolean; sourceContext?: import('./source').SourceContext }): Promise<{ item: SavedMedia }>
  setFavorite(options: { id: number; favorite: boolean }): Promise<{ item: SavedMedia }>
  recordProgress(options: Omit<WatchHistory, 'updatedAt'>): Promise<{ item: WatchHistory }>
  listHistory(): Promise<{ items: WatchHistory[] }>
  clearHistory(): Promise<{ removed: number }>
  getSettings(): Promise<{ settings: AndroidSettings }>
  setSettings(options: { settings: Partial<AndroidSettings> }): Promise<{ settings: AndroidSettings }>
  clearMediaCache(): Promise<{ removed: number }>
  exportPersonalData(): Promise<{ data: PersonalDataBackup }>
  validatePersonalData(options: { data: PersonalDataBackup }): Promise<{ valid: boolean }>
  importPersonalData(options: { data: PersonalDataBackup; recovery?: RestoreJournal }): Promise<PersonalDataImportResult>
  getRestoreState(): Promise<{ pending: RestoreJournal | null }>
  completeRestore(options: { token: string }): Promise<void>
  migrateSourceBindings(options: { saved: Array<{ id: number; context: import('./source').SourceContext }>; history: Array<Pick<WatchHistory, 'mediaUrl' | 'episodeId' | 'lineId'> & { context: import('./source').SourceContext }> }): Promise<{ migrated: number }>
}

export const androidCatalog = registerPlugin<AndroidCatalog>('SanyeCatalog')
