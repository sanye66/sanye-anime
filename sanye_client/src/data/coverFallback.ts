import { resolveAssetUrl } from '@/api/http'
import { animeCatalogMap } from '@/data/animeCatalog'
import { titleKey } from '@/data/titleKey'

/**
 * 通用占位封面：所有封面降级的最后一步。
 *
 * 占位图必须随客户端一起发布并从前端自身加载：后端封面与网关都不可用时，
 * 仍然要有一张能出画的封面。`/covers/*` 与 `/client-covers/*` 是两条独立解析路径，
 * 前者交给网关或桌面运行时，后者始终由客户端静态资源提供，这里用后者。
 */
export const placeholderCover = '/client-covers/anime-placeholder.svg'

/**
 * 随包目录里同名作品的精修封面。
 *
 * 来源封面可能被防盗链、CDN 失效或包内文件缺失挡住；固定作品在包内本来就有精修封面，
 * 先退到它再退占位图，避免「封面加载不出来」直接变成通用占位图。
 */
export function bundledCover(title?: string): string {
  const key = titleKey(title)
  if (!key) return ''
  const match = Object.values(animeCatalogMap).find(entry => titleKey(entry.title) === key)
  return resolveAssetUrl(match?.cover) ?? ''
}

/**
 * 图片加载失败时的统一降级：先尝试随包同名封面（由 `data-bundled-cover` 传入），
 * 再退通用占位图；同一张图只降级一次，避免失败循环。
 */
export function handleCoverFallback(event: Event): void {
  const image = event.currentTarget as HTMLImageElement | null
  if (!image || image.dataset.fallbackApplied) return
  const bundled = image.dataset.bundledCover
  if (bundled && image.src !== bundled) {
    image.src = bundled
    return
  }
  image.dataset.fallbackApplied = 'true'
  image.src = placeholderCover
}
