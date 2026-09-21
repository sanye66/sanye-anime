/**
 * 补帧延迟预算判定（VQ-29）。
 *
 * 旧口径把补帧路径的视频与音频都固定在 150ms：`target` 必须落后最新源帧 `delay`，因此起播与定位后
 * 必须等窗口填满 150ms 才能出补间层，这段窗口显示的是未处理的原始视频。本模块把延迟当成按实测需要
 * 收缩的预算，规则固定为：
 *
 * - 每个播放段（起播、定位、暂停恢复、时间轴跳变）从上次证明可用的延迟起步，范围是
 *   `[max(2 个源帧间隔, 40ms), 会话上限]`，因此起播与定位后的原画窗口随实际需要而定，不再固定 150ms；
 * - 未出补间层前允许按实测需要直接加宽：此时画布还没有接管呈现，加宽不会产生画面回跳；
 * - 播放稳定且连续若干个干净窗口都有余量时才逐步收缩，单步不超过 20ms，收缩只让画面向前推进；
 * - 出现停顿或画面回跳时只登记“需要恢复”，在下一个播放段起点按步缓慢恢复；稳定播放期不做加宽，
 *   因此不会把画面拉回已经播放过的位置。
 *
 * 返回值单位统一为毫秒。判定不读取时钟本身，`nowMs` 由调用方传入，便于用固定时间线复现。
 */
export interface DelayWindowSample {
  nowMs: number
  /** 本窗口实测需要的最小延迟：最新源帧的老化时间加安全余量。 */
  neededMs: number
  /** 本窗口未命中配对的次数。 */
  missedPairs: number
  /** 本窗口内容停顿的绘制次数。 */
  stallFrames: number
  /** 本窗口画面整体回跳的次数；稳定播放期必须为 0。 */
  rewinds: number
}

export interface InterpolationDelaySnapshot {
  /** 是否处于自适应模式；`false` 表示固定延迟隔离对照。 */
  adaptive: boolean
  /** 本窗口内画布是否已接管呈现。 */
  active: boolean
  /** 会话上限：页面传入的固定延迟，默认 150ms。 */
  nominalMs: number
  /** 当前生效延迟。 */
  effectiveMs: number
  /** 本播放段起点采用的延迟。 */
  startMs: number
  /** 本播放段的下限：2 个源帧间隔与 40ms 的较大者，且不超过会话上限。 */
  floorMs: number
  /** 本播放段实测需要的最小延迟，取自最近一次判定输入。 */
  neededMs: number
  /** 下一次播放段起点的延迟（收缩会立即跟随，恢复在段起点生效）。 */
  learnedMs: number
  /** 是否已登记“下个播放段恢复余量”。 */
  pendingRestore: boolean
  /** 播放段内因停顿而恢复余量的次数，与播放段起点的恢复分开记录。 */
  inEpochRestores: number
  /** 加宽、收缩与恢复的次数与总变化次数。 */
  widens: number
  shrinks: number
  restores: number
  changes: number
  /** 最近一次判定原因。 */
  reason: string
}

export interface InterpolationDelayOptions {
  /** 会话上限，默认 150ms。 */
  nominalMs?: number
  /** 下限，默认 40ms。 */
  minMs?: number
  /** 单次收缩步长，默认 20ms。 */
  shrinkStepMs?: number
  /** 每次播放段起点恢复的步长，默认 40ms。 */
  restoreStepMs?: number
  /** 收缩前需要的连续干净窗口数，默认 2。 */
  cleanWindows?: number
  /** 两次变化之间的最小间隔，默认 1000ms。 */
  changeCooldownMs?: number
  /** 收缩前要求的最小余量，默认 15ms。 */
  shrinkHeadroomMs?: number
}

const DEFAULTS = { nominalMs: 150, minMs: 40, shrinkStepMs: 20, restoreStepMs: 40,
  cleanWindows: 2, changeCooldownMs: 1000, shrinkHeadroomMs: 15 }

const clamp = (value: number, lower: number, upper: number) => Math.min(Math.max(value, lower), upper)

export class InterpolationDelayPolicy {
  readonly nominalMs: number
  readonly minMs: number
  readonly shrinkStepMs: number
  readonly restoreStepMs: number
  readonly cleanWindowTarget: number
  readonly changeCooldownMs: number
  readonly shrinkHeadroomMs: number
  effectiveMs: number
  startMs: number
  floorMs: number
  neededMs: number
  learnedMs: number
  pendingRestore = false
  widens = 0
  shrinks = 0
  restores = 0
  inEpochRestores = 0
  changes = 0
  reason = ''
  private lastChangeAt = 0
  private cleanWindows = 0
  private warmupWindows = 0
  constructor(options: InterpolationDelayOptions = {}) {
    this.nominalMs = options.nominalMs ?? DEFAULTS.nominalMs
    this.minMs = Math.min(options.minMs ?? DEFAULTS.minMs, this.nominalMs)
    this.shrinkStepMs = options.shrinkStepMs ?? DEFAULTS.shrinkStepMs
    this.restoreStepMs = options.restoreStepMs ?? DEFAULTS.restoreStepMs
    this.cleanWindowTarget = Math.max(1, options.cleanWindows ?? DEFAULTS.cleanWindows)
    this.changeCooldownMs = options.changeCooldownMs ?? DEFAULTS.changeCooldownMs
    this.shrinkHeadroomMs = options.shrinkHeadroomMs ?? DEFAULTS.shrinkHeadroomMs
    this.floorMs = this.minMs
    this.effectiveMs = this.minMs
    this.startMs = this.minMs
    this.neededMs = this.minMs
    this.learnedMs = this.minMs
    this.reason = '等待首个播放段'
  }

  /**
   * 播放段起点：先按上一次登记的压力恢复一步，再取本次生效延迟。起播、定位、暂停恢复与时间轴跳变
   * 都走这里；画质档切换等仍连续播放的内部重建不调用本方法，避免稳定播放期改变延迟。
   */
  beginEpoch(nowMs: number, sourceIntervalMs: number) {
    this.floorMs = clamp(2 * Math.max(0, sourceIntervalMs), this.minMs, this.nominalMs)
    if (this.pendingRestore) {
      this.learnedMs = Math.min(this.nominalMs, this.learnedMs + this.restoreStepMs)
      this.restores++
      this.changes++
      this.pendingRestore = false
      this.reason = '上一播放段出现停顿或回跳，已恢复安全余量'
    } else {
      this.reason = '按最近一次证明可用的延迟起播'
    }
    this.effectiveMs = clamp(this.learnedMs, this.floorMs, this.nominalMs)
    this.neededMs = this.effectiveMs
    this.startMs = this.effectiveMs
    this.lastChangeAt = nowMs
    this.cleanWindows = 0
    // 播放段首个窗口是预热窗口：起播与定位后的首帧间隔、解码与传输都还没稳定，不据此登记压力。
    this.warmupWindows = 1
    return this.effectiveMs
  }

  /**
   * 未接管呈现时的加宽：窗口没能覆盖目标时刻，按实测需要（最新源帧老化时间 + 安全余量）直接加宽。
   * 此时画布未生效，加宽不会被观察到画面回跳。
   */
  widenTo(nowMs: number, neededMs: number, sourceIntervalMs: number) {
    this.floorMs = clamp(2 * Math.max(0, sourceIntervalMs), this.minMs, this.nominalMs)
    this.neededMs = neededMs
    const target = clamp(Math.max(neededMs, this.effectiveMs + 10), this.floorMs, this.nominalMs)
    if (target > this.effectiveMs + 0.5) {
      this.effectiveMs = target
      this.learnedMs = target
      this.widens++
      this.changes++
      this.lastChangeAt = nowMs
      this.reason = '窗口未覆盖目标时刻，按实测延迟加宽'
    }
    return this.effectiveMs
  }

  /**
   * 播放窗口判定。停顿或回跳只登记“下个播放段恢复余量”，不在此处加宽；有未命中配对时同样保持不动。
   * 只有连续干净窗口、冷却时间与余量都满足时才收缩一步。
   */
  observeWindow(sample: DelayWindowSample): 'hold' | 'shrink' {
    this.neededMs = sample.neededMs
    if (this.warmupWindows > 0) {
      this.warmupWindows--
      this.reason = '播放段预热窗口，暂不判定'
      return 'hold'
    }
    if (sample.stallFrames > 0 || sample.rewinds > 0) {
      this.cleanWindows = 0
      this.pendingRestore = true
      this.reason = '本窗口出现停顿或回跳，下个播放段恢复余量'
      return 'hold'
    }
    if (sample.missedPairs > 0) {
      this.cleanWindows = 0
      this.reason = '本窗口存在未命中配对，保持当前延迟'
      return 'hold'
    }
    this.cleanWindows++
    if (this.cleanWindows < this.cleanWindowTarget) {
      this.reason = '等待连续干净窗口'
      return 'hold'
    }
    if (sample.nowMs - this.lastChangeAt < this.changeCooldownMs) {
      this.reason = '距离上次变化不足冷却时间'
      return 'hold'
    }
    if (this.effectiveMs - sample.neededMs < this.shrinkHeadroomMs) {
      this.reason = '实测需要接近当前延迟，保持不动'
      return 'hold'
    }
    const next = Math.max(this.floorMs, this.effectiveMs - this.shrinkStepMs)
    if (this.effectiveMs - next < 1) {
      this.reason = '已到最小可用窗口'
      return 'hold'
    }
    this.effectiveMs = next
    this.learnedMs = next
    this.shrinks++
    this.changes++
    this.lastChangeAt = sample.nowMs
    this.cleanWindows = 0
    this.reason = '连续有余量，收缩延迟'
    return 'shrink'
  }

  /**
   * 播放中出现持续停顿时恢复余量：目标时刻已经越过最新源帧，画面正在重复同一帧，此刻加宽只会让这段
   * 已经停住的画面重新对齐到可用窗口，不会让正常推进的画面回跳。仍受冷却时间与步长约束。
   */
  widenInEpoch(nowMs: number, neededMs: number, sourceIntervalMs: number) {
    this.floorMs = clamp(2 * Math.max(0, sourceIntervalMs), this.minMs, this.nominalMs)
    this.neededMs = neededMs
    if (nowMs - this.lastChangeAt < this.changeCooldownMs) return this.effectiveMs
    const target = clamp(Math.max(neededMs, this.effectiveMs + this.restoreStepMs), this.floorMs, this.nominalMs)
    if (target <= this.effectiveMs + 0.5) return this.effectiveMs
    this.effectiveMs = target
    this.learnedMs = target
    this.restores++
    this.inEpochRestores++
    this.changes++
    this.lastChangeAt = nowMs
    this.pendingRestore = false
    this.reason = '播放中出现停顿，按实测延迟恢复余量'
    return this.effectiveMs
  }

  snapshot(active: boolean, adaptive = true): InterpolationDelaySnapshot {
    return { adaptive, active, nominalMs: this.nominalMs, effectiveMs: this.effectiveMs, startMs: this.startMs,
      floorMs: this.floorMs, neededMs: this.neededMs, learnedMs: this.learnedMs, pendingRestore: this.pendingRestore,
      widens: this.widens, shrinks: this.shrinks, restores: this.restores, inEpochRestores: this.inEpochRestores,
      changes: this.changes, reason: this.reason }
  }
}
