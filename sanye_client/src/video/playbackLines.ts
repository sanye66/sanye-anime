/**
 * 播放线路名统一解析。
 *
 * 来源站点把语言、字幕和画质混在同一个名字里（`HD`、`HD国语`、`HD中字`、`BD国语中字`、
 * `粤语中字`…），此前搜索页、详情页标签和自动换线各用一套正则，展示与选线结果不一致。
 * 这里只做一次解析，供展示（规范标签）和选线（语言 + 默认优先级）共用：
 *
 * - 语言只认来源明确写出的文字；只写「中字」时不推断配音语言。
 * - 「中字 / 中文字幕 / 简中 / 繁中 / 中英双字」表示中文字幕，不表示语言。
 * - 无法识别语言和字幕时返回空标签，由调用方回退原始线路名。
 */

export type PlaybackLineLanguage = '国语' | '粤语' | '英语' | '原声'

export interface PlaybackLineMeta {
  /** 归一化后的配音语言；来源没有写时为空字符串。 */
  language: PlaybackLineLanguage | ''
  /** 是否声明中文字幕。 */
  chineseSubtitle: boolean
  /** 是否声明国粤双语。 */
  bilingual: boolean
  /** 画质标识（HD / BD / 1080P…），仅用于展示参考。 */
  quality: string
  /** 统一展示名，例如「国语中字」「中字」「日语原声」；无法识别时为空字符串。 */
  label: string
  /** 用户未指定语言偏好时的默认选线得分，越大越优先。 */
  defaultScore: number
}

const LANGUAGE_LABELS: Record<PlaybackLineLanguage, string> = {
  国语: '国语',
  粤语: '粤语',
  英语: '英语',
  原声: '日语原声',
}

const LANGUAGE_PATTERNS: Array<[PlaybackLineLanguage, RegExp]> = [
  ['国语', /国语|国配|国语配音|中文配音|普通话/],
  ['粤语', /粤语|粤配|广东话/],
  ['英语', /英语|英文/],
  ['原声', /日语|日文|原声/],
]

const BILINGUAL_PATTERN = /双语|国粤|粤国/
const SUBTITLE_PATTERN = /中字|中文字幕|简中|繁中|简体|繁体|中英|字幕/
const QUALITY_PATTERN = /(2160P|1080P|720P|4K|BD|HD|超清|高清|蓝光)/i

/**
 * 解析一个线路名（可拼接剧集标题与线路标签），返回规范标签与默认优先级。
 */
export function parsePlaybackLine(...texts: Array<string | undefined | null>): PlaybackLineMeta {
  const text = texts.filter((value): value is string => Boolean(value)).join(' ').normalize('NFKC')
  const bilingual = BILINGUAL_PATTERN.test(text)
  const language = bilingual
    ? '国语' as PlaybackLineLanguage
    : LANGUAGE_PATTERNS.find(([, pattern]) => pattern.test(text))?.[0] ?? ''
  const chineseSubtitle = SUBTITLE_PATTERN.test(text)
  const quality = (text.match(QUALITY_PATTERN)?.[0] ?? '').toUpperCase()
  const label = language
    ? `${LANGUAGE_LABELS[language]}${chineseSubtitle ? '中字' : ''}`
    : chineseSubtitle ? '中字' : ''
  return {
    language,
    chineseSubtitle,
    bilingual,
    quality,
    label,
    defaultScore: defaultScore(language, chineseSubtitle),
  }
}

/**
 * 默认选线优先级：未指定语言偏好时，存在「国语中字」线路就优先播它，
 * 其次才是只有国语、只有中字、粤语、原声和英语。用户显式选择的语言与近期成功线路仍排在其上。
 */
function defaultScore(language: PlaybackLineLanguage | '', chineseSubtitle: boolean) {
  if (language === '国语') return chineseSubtitle ? 6 : 5
  if (chineseSubtitle) return 3
  if (language === '粤语' || language === '原声') return 2
  if (language === '英语') return 1
  return 0
}
