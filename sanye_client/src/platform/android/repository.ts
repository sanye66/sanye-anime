import { registerPlugin } from '@capacitor/core'
import type { SourceHit } from './source'

export interface RepositoryCapability {
  sourceIndex: number
  name: string
  search: boolean
  playback: 'static-only' | 'unsupported'
  repository: boolean
  pagination: boolean
  reason: string
}

export interface RepositoryPage {
  hits: SourceHit[]
  sourceIndex: number
  page: number
  hasMore: boolean
  nextPage?: number
  truncated: boolean
  warnings: string[]
}

export interface RepositoryRequest { content: string; sourceIndex: number; page?: number }

export interface RepositoryBridge {
  subscriptionCapabilities(options: { content: string }): Promise<{ sources: RepositoryCapability[] }>
  subscriptionRepository(options: { content: string; sourceIndex: number; page: number }): Promise<RepositoryPage>
}

export function createRepository(bridge: RepositoryBridge) {
  function bounded<T>(pending: Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('目录读取超时，请重试')), 10000)
      pending.then(value => { clearTimeout(timer); resolve(value) }, error => { clearTimeout(timer); reject(error) })
    })
  }
  function validateContent(content: string) {
    if (!content.trim() || new TextEncoder().encode(content).length > 2 * 1024 * 1024) throw new Error('目录需要有效订阅内容，且不得超过 2 MB')
  }
  return {
    async capabilities(content: string, sourceIndex?: number): Promise<RepositoryCapability[]> {
      validateContent(content)
      if (sourceIndex !== undefined && (!Number.isSafeInteger(sourceIndex) || sourceIndex < 0)) throw new Error('目录需要明确的来源索引')
      try {
        const sources = (await bounded(bridge.subscriptionCapabilities({ content }))).sources || []
        return sourceIndex === undefined ? sources : sources.filter(source => source.sourceIndex === sourceIndex)
      }
      catch (error) { if ((error as { code?: string })?.code === 'UNIMPLEMENTED') return []; throw error }
    },
    async readPage(options: RepositoryRequest): Promise<RepositoryPage> {
      validateContent(options.content)
      const page = options.page ?? 1
      if (!Number.isSafeInteger(options.sourceIndex) || options.sourceIndex < 0) throw new Error('目录需要明确的来源索引')
      if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw new Error('目录页码需为 1 至 10000')
      const result = await bounded(bridge.subscriptionRepository({ ...options, page }))
      if (result.sourceIndex !== options.sourceIndex || result.page !== page
          || result.hasMore && result.nextPage !== page + 1
          || result.hits.some(hit => hit.sourceIndex !== options.sourceIndex)) throw new Error('目录响应与当前来源或页码不匹配')
      return {
        ...result,
        hits: result.hits.map(hit => ({ ...hit, sourceContext: { content: options.content, sourceIndex: options.sourceIndex } })),
      }
    },
  }
}

export const androidRepository = createRepository(registerPlugin<RepositoryBridge>('SanyeSource'))
