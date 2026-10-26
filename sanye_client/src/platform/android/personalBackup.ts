import { registerPlugin } from '@capacitor/core'
import { androidCatalog, type PersonalDataBackup, type PersonalDataImportResult, type WatchHistory } from './catalog'
import { exportSourceBindings, historySourceBindingKey, type SourceBindingSnapshot } from './source'
import { mergeSubscriptionBackup, parseSubscription, subscriptionState, subscriptionUrl, type Subscription } from '../../subscriptions'

export const maxBackupBytes = 10 * 1024 * 1024
type BackupSubscription = Omit<Subscription, 'sources'>
export interface AndroidPersonalBackup {
  format: 'sanye-android-backup'
  version: 1 | 2
  personalData: PersonalDataBackup
  subscriptions: BackupSubscription[]
  sourceBindings: SourceBindingSnapshot[]
}
export const backupFiles = registerPlugin<{
  save(options: { content: string; name: string }): Promise<{ cancelled: boolean }>
  pick(): Promise<{ cancelled: boolean; content?: string }>
}>('SanyeBackupFiles')

function fail(): never { throw new Error('备份格式、版本或来源关联无效，原有数据未更改。') }
function object(value: unknown, allowed: string[], required = allowed): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail()
  const data = value as Record<string, unknown>
  if (Object.keys(data).some(key => !allowed.includes(key)) || required.some(key => !Object.prototype.hasOwnProperty.call(data, key))) fail()
  return data
}
function integer(value: unknown) { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 }
function label(value: unknown, max: number) { return typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value) }
export function historyBindingKey(item: Pick<WatchHistory, 'mediaUrl' | 'episodeId' | 'lineId' | 'sourceKey'>) {
  return historySourceBindingKey(item)
}
function sourceIdentity(item: Record<string, unknown>) {
  if (item.sourceKey !== undefined && (typeof item.sourceKey !== 'string' || item.sourceKey !== '' && !/^[a-f0-9]{64}$/.test(item.sourceKey))) fail()
  if (item.sourceContext === undefined) { if (item.sourceKey) fail(); return '' }
  const context = object(item.sourceContext, ['content', 'sourceIndex'], ['content'])
  if (typeof context.content !== 'string') fail()
  if (!context.content) {
    if (context.sourceIndex !== undefined || item.sourceKey) fail()
    return ''
  }
  const sources = parseSubscription(context.content)
  if (context.sourceIndex !== undefined && (!integer(context.sourceIndex) || (context.sourceIndex as number) >= sources.length)) fail()
  return JSON.stringify([context.content, context.sourceIndex ?? null])
}
function bindingKeys(data: PersonalDataBackup) {
  return new Set([...data.savedMedia.map(item => `saved:${item.id}`), ...data.watchHistory.map(historyBindingKey)])
}

export function parsePersonalBackup(content: string): AndroidPersonalBackup {
  if (content.length > maxBackupBytes || new TextEncoder().encode(content).byteLength > maxBackupBytes) fail()
  let parsed: unknown
  try { parsed = JSON.parse(content) } catch { return fail() }
  const root = object(parsed, ['format', 'version', 'personalData', 'subscriptions', 'sourceBindings'])
  if (root.format !== 'sanye-android-backup' || root.version !== 1 && root.version !== 2) fail()
  const personal = object(root.personalData, ['format', 'version', 'exportedAt', 'savedMedia', 'watchHistory', 'settings'])
  if (personal.format !== 'sanye-personal-data' || personal.version !== 1 && personal.version !== 2 || !integer(personal.exportedAt)
    || !Array.isArray(personal.savedMedia) || !Array.isArray(personal.watchHistory)
    || personal.savedMedia.length > 10000 || personal.watchHistory.length > 10000) fail()
  object(personal.settings, ['theme', 'autoPlay', 'playbackRate', 'qualityProfile', 'frameTarget', 'volume'], [])
  const savedIds = new Set<number>(), urls = new Set<string>(), histories = new Set<string>()
  for (const entry of personal.savedMedia) {
    const item = object(entry, ['id', 'title', 'url', 'coverUrl', 'summary', 'favorite', 'updatedAt', 'sourceKey', 'sourceContext'], ['id', 'title', 'url', 'coverUrl', 'summary', 'favorite', 'updatedAt'])
    const identity = JSON.stringify([item.url, sourceIdentity(item)])
    if (!integer(item.id) || item.id === 0 || savedIds.has(item.id as number) || typeof item.url !== 'string'
      || urls.has(identity) || !integer(item.updatedAt)) fail()
    savedIds.add(item.id as number); urls.add(identity)
  }
  for (const entry of personal.watchHistory) {
    const item = object(entry, ['mediaUrl', 'title', 'episodeId', 'episodeTitle', 'lineId', 'coverUrl', 'positionSeconds', 'durationSeconds', 'completed', 'updatedAt', 'sourceKey', 'sourceContext'], ['mediaUrl', 'title', 'episodeId', 'episodeTitle', 'lineId', 'coverUrl', 'positionSeconds', 'durationSeconds', 'completed', 'updatedAt'])
    if (typeof item.mediaUrl !== 'string' || typeof item.episodeId !== 'string' || typeof item.lineId !== 'string' || !integer(item.updatedAt)) fail()
    const key = JSON.stringify([item.mediaUrl, item.episodeId, item.lineId, sourceIdentity(item)])
    if (histories.has(key)) fail()
    histories.add(key)
  }
  if (!Array.isArray(root.subscriptions) || root.subscriptions.length > 20 || !Array.isArray(root.sourceBindings)
    || root.sourceBindings.length > 20000) fail()
  const subscriptionUrls = new Set<string>()
  for (const entry of root.subscriptions) {
    const item = object(entry, ['url', 'name', 'content', 'updatedAt'], ['url', 'name'])
    if (!label(item.name, 80) || typeof item.url !== 'string' || subscriptionUrl(item.url) !== item.url
      || subscriptionUrls.has(item.url) || item.updatedAt !== undefined && !integer(item.updatedAt)) fail()
    subscriptionUrls.add(item.url)
    if (item.content !== undefined) {
      if (typeof item.content !== 'string' || !integer(item.updatedAt)) fail()
      parseSubscription(item.content)
    } else if (item.updatedAt !== undefined) fail()
  }
  const backup = root as unknown as AndroidPersonalBackup
  const keys = bindingKeys(backup.personalData), seen = new Set<string>()
  for (const entry of root.sourceBindings) {
    const item = object(entry, ['key', 'context'])
    const context = object(item.context, ['content', 'sourceIndex'], ['content'])
    if (typeof item.key !== 'string' || !keys.has(item.key) || seen.has(item.key) || typeof context.content !== 'string'
      || context.sourceIndex !== undefined && !integer(context.sourceIndex)) fail()
    seen.add(item.key)
    if (context.content) {
      const sources = parseSubscription(context.content)
      if (context.sourceIndex !== undefined && (context.sourceIndex as number) >= sources.length) fail()
    } else if (context.sourceIndex !== undefined) fail()
  }
  return backup
}

export async function validatePersonalBackup(content: string) {
  const backup = parsePersonalBackup(content)
  await androidCatalog.validatePersonalData({ data: promoteBackupSources(backup) })
  return backup
}

export function promoteBackupSources(backup: AndroidPersonalBackup): PersonalDataBackup {
  const snapshots = new Map(backup.sourceBindings.filter(entry => entry.context.content).map(entry => [entry.key, entry.context]))
  const historyCounts = new Map<string, number>()
  for (const item of backup.personalData.watchHistory) {
    const key = historyBindingKey(item)
    historyCounts.set(key, (historyCounts.get(key) || 0) + 1)
  }
  return { ...backup.personalData, version: 2,
    savedMedia: backup.personalData.savedMedia.map(item => ({ ...item, ...(item.sourceContext ? {} : snapshots.has(`saved:${item.id}`) ? { sourceKey: undefined, sourceContext: snapshots.get(`saved:${item.id}`) } : {}) })),
    watchHistory: backup.personalData.watchHistory.map(item => {
      const key = historyBindingKey(item)
      if (snapshots.has(key) && historyCounts.get(key) !== 1) fail()
      return { ...item, ...(item.sourceContext ? {} : snapshots.has(key) ? { sourceKey: undefined, sourceContext: snapshots.get(key) } : {}) }
    }),
  }
}

export async function createPersonalBackup() {
  const { data } = await androidCatalog.exportPersonalData()
  const keys = bindingKeys(data)
  const backup: AndroidPersonalBackup = {
    format: 'sanye-android-backup', version: 2, personalData: data,
    subscriptions: subscriptionState.value.items.map(({ url, name, content, updatedAt }) => ({ url, name, content, updatedAt })),
    sourceBindings: exportSourceBindings().filter(entry => keys.has(entry.key)),
  }
  const content = JSON.stringify(backup)
  parsePersonalBackup(content)
  return content
}

export function remapBackupBindings(backup: AndroidPersonalBackup, result: PersonalDataImportResult) {
  const saved = new Set(result.restoredSavedIds), history = new Set(result.restoredHistory.map(historyBindingKey))
  return backup.sourceBindings.flatMap(entry => {
    if (entry.key.startsWith('saved:')) {
      const id = result.savedIdMap[entry.key.slice(6)]
      return id && saved.has(id) ? [{ key: `saved:${id}`, context: entry.context }] : []
    }
    return history.has(entry.key) ? [entry] : []
  })
}

function restoreStorage(key: string, content: string | null) {
  if (content === null) localStorage.removeItem(key)
  else localStorage.setItem(key, content)
}

function mergedSubscriptions(items: BackupSubscription[]) {
  const merged = new Map(subscriptionState.value.items.map(item => [item.url, item]))
  for (const item of items) {
    const current = merged.get(item.url)
    if (current && (current.updatedAt || 0) >= (item.updatedAt || 0)) continue
    merged.set(item.url, { ...item, sources: item.content ? parseSubscription(item.content) : [] })
  }
  if (merged.size > 20) throw new Error('合并后订阅超过 20 个，请先整理本机订阅。')
  return { ...subscriptionState.value, items: [...merged.values()] }
}

export async function retryPendingRestore(): Promise<{ pending: boolean; message: string }> {
  const { pending } = await androidCatalog.getRestoreState()
  if (!pending) return { pending: false, message: '' }
  mergedSubscriptions(pending.subscriptions)
  mergeSubscriptionBackup(pending.subscriptions.map(item => ({ ...item, sources: item.content ? parseSubscription(item.content) : [] })))
  await androidCatalog.completeRestore({ token: pending.token })
  return { pending: false, message: '待完成恢复已收口，来源规则与订阅已恢复。' }
}

export async function pendingRestoreState() { return androidCatalog.getRestoreState() }

export async function restorePersonalBackup(backup: AndroidPersonalBackup): Promise<{ result: PersonalDataImportResult; partial: boolean; message: string }> {
  await validatePersonalBackup(JSON.stringify(backup))
  await retryPendingRestore()
  const subscriptions = mergedSubscriptions(backup.subscriptions)
  const probeKey = 'sanye:backup-capacity-probe:v1'
  const previousProbe = localStorage.getItem(probeKey)
  try {
    localStorage.setItem(probeKey, JSON.stringify(subscriptions))
  } finally {
    restoreStorage(probeKey, previousProbe)
  }
  const recovery = { token: `${Date.now()}:${crypto.randomUUID()}`, subscriptions: backup.subscriptions }
  const result = await androidCatalog.importPersonalData({ data: promoteBackupSources(backup), recovery })
  try {
    mergeSubscriptionBackup(backup.subscriptions.map(item => ({ ...item, sources: item.content ? parseSubscription(item.content) : [] })))
    await androidCatalog.completeRestore({ token: recovery.token })
    return { result, partial: false, message: `恢复完成：保存 ${result.savedMedia} 条、历史 ${result.watchHistory} 条。` }
  } catch {
    return { result, partial: true, message: '作品、历史及来源规则已恢复；订阅尚未确认收口。恢复日志已保留，可释放空间或重启后重试。' }
  }
}
