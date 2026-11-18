import type { ExpoStatus, Stage, Verdict } from './types'

export const STAGES: { key: Stage; label: string; hint: string }[] = [
  { key: 'todo', label: '未触达', hint: '还没发申请，也还没联系上' },
  { key: 'reached', label: '已发申请', hint: '已发出微信申请或消息，等对方通过/回复' },
  { key: 'connected', label: '已触达', hint: '已加上微信或对方有回应' },
  { key: 'talked', label: '已沟通', hint: '已经聊过一轮' },
  { key: 'blocked', label: '未成功', hint: '暂时没有可用联系方式，需要再找渠道' },
  { key: 'dropped', label: '搁置', hint: '暂不继续跟进' },
]

/** CC 左侧栏「总表」：跨赛道看全部 CC */
export const CC_ALL = '总表'

/** CC 左侧栏「重点跟进」：汇总各赛道标为重点跟进的公司 */
export const CC_FOCUS = '重点跟进'

/** CC 工作台优先展示的赛道；数据来自联系管理总库（运动户外 / 健康营养） */
export const CC_TRACKS = ['户外', '保健品'] as const

export type CCBucket = 'needConnect' | 'untouched' | 'applied' | 'touched' | 'priority' | 'all'

export const CC_BUCKETS: { key: CCBucket; label: string; hint: string }[] = [
  { key: 'priority', label: '重点跟进', hint: '当前范围内标为重点跟进的公司' },
  { key: 'needConnect', label: '需建联', hint: '还没发出申请，需要先发微信/消息' },
  { key: 'untouched', label: '未触达库', hint: '尚未成功触达：含需建联、已发申请等回复' },
  { key: 'applied', label: '已发申请', hint: '申请已发出、还没建联成功' },
  { key: 'touched', label: '已触达', hint: '已建联或已聊过' },
  { key: 'all', label: '全部跟踪', hint: '当前赛道下所有 CC 公司' },
]

export function isPriorityFollow(cc: { priorityFollow?: boolean } | null | undefined) {
  return Boolean(cc?.priorityFollow)
}

export const VERDICTS: { key: Verdict; label: string }[] = [
  { key: 'priority', label: '重点关注' },
  { key: 'focus', label: '关注' },
  { key: 'watch', label: '观察' },
  { key: 'hold', label: '暂不跟进' },
  { key: 'pass', label: '不看' },
  { key: 'none', label: '未判断' },
]

export const EXPO_STATUS: { key: ExpoStatus; label: string }[] = [
  { key: 'watch', label: '关注中' },
  { key: 'planned', label: '计划参加' },
  { key: 'attended', label: '已参加' },
]

export const CHANNELS = ['微信', '企微', '电话', '邮件', '短信', '公众号', '小红书', 'FA', '官网留言', '线下', '其他']

export const GROUPS = [
  '户外', '保健品',
  '具身智能与机器人', 'AI 应用', 'AI 模型与算力', '芯片与半导体', '脑机与量子', '航天与低空',
  '生物医药', '新能源与材料', '先进制造与硬件', '企业软件与数据', '消费与品牌', '未归类',
]

export function companyTrack(c: { group: string; sector: string }) {
  if (c.group && c.group !== '未归类') return c.group
  return c.sector || '未归类'
}

/** 已发申请但尚未成功触达（建联/聊过） */
export function isAppliedWaiting(cc: {
  stage: Stage
  appliedAt?: string | null
}) {
  if (
    cc.stage === 'connected' ||
    cc.stage === 'talked' ||
    cc.stage === 'dropped' ||
    cc.stage === 'blocked'
  ) {
    return false
  }
  return cc.stage === 'reached' || Boolean(cc.appliedAt)
}

/** 还没发过申请，需要先建联 */
export function needsConnect(cc: {
  stage: Stage
  appliedAt?: string | null
  lastTouch: string | null
}) {
  if (
    cc.stage === 'dropped' ||
    cc.stage === 'connected' ||
    cc.stage === 'talked' ||
    cc.stage === 'blocked'
  ) {
    return false
  }
  return !isAppliedWaiting(cc)
}

/**
 * 归库：未成功触达一律进未触达库（含已发申请）；
 * 「需建联」「已发申请」是未触达库里的子集。
 */
export function ccBucket(cc: {
  stage: Stage
  appliedAt?: string | null
  lastTouch: string | null
}): Exclude<CCBucket, 'all' | 'needConnect' | 'applied'> | 'parked' {
  if (cc.stage === 'dropped') return 'parked'
  if (cc.stage === 'connected' || cc.stage === 'talked') return 'touched'
  return 'untouched'
}

/** 已触达后超过这么多天没有新进展，就提示再跟一次 */
export const FOLLOW_UP_DAYS = 7

export const stageLabel = (stage: Stage) => STAGES.find((s) => s.key === stage)?.label ?? stage
export const verdictLabel = (verdict: Verdict) => VERDICTS.find((v) => v.key === verdict)?.label ?? verdict
export const isFocus = (verdict: Verdict) => verdict === 'priority' || verdict === 'focus'

const pad = (n: number) => String(n).padStart(2, '0')

export function todayISO() {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function daysSince(date: string | null | undefined) {
  if (!date) return null
  const ms = new Date(`${todayISO()}T00:00:00`).getTime() - new Date(`${date}T00:00:00`).getTime()
  return Math.round(ms / 86400000)
}

/** 11月15日；跨年时带年份 */
export function shortDate(date: string | null | undefined) {
  if (!date) return '—'
  const [y, m, d] = date.split('-').map(Number)
  const text = `${m}月${d}日`
  return y === new Date().getFullYear() ? text : `${y}年${text}`
}

export function ago(date: string | null | undefined) {
  const days = daysSince(date)
  if (days === null) return ''
  if (days <= 0) return days === 0 ? '今天' : `${-days} 天后`
  return days === 1 ? '昨天' : `${days} 天前`
}

export function longToday() {
  const now = new Date()
  const week = '日一二三四五六'[now.getDay()]
  return `${now.getMonth() + 1}月${now.getDate()}日 星期${week}`
}

export const uid = () => Math.random().toString(36).slice(2, 10)

export const num = (n: number) => n.toLocaleString('zh-CN')

/** 把日期改到指定年月，保留日（超出当月则钳到月末） */
export function remapYMD(iso: string | undefined, year: number, month: number) {
  if (!iso) return ''
  const day = Math.min(Number(iso.slice(8, 10)) || 1, new Date(year, month, 0).getDate())
  return `${year}-${pad(month)}-${pad(day)}`
}

/** 整段日期按年份平移，保留月日（跨月展会用） */
export function shiftDateRange(start: string | undefined, end: string | undefined, yearShift: number) {
  if (!start) return { start: '', end: '' }
  const shift = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`)
    if (Number.isNaN(d.getTime())) return ''
    d.setFullYear(d.getFullYear() + yearShift)
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }
  return { start: shift(start), end: shift(end || start) }
}

/**
 * 解析「2026-07-04 至 07-06」「2026-07-04」「7月4日-6日」等。
 * 返回 [start, end]，解析失败则空字符串。
 */
export function parseExpoDates(text: string, fallbackYear?: number, fallbackMonth?: number) {
  const raw = text.trim()
  if (!raw) return { start: '', end: '' }
  const y = fallbackYear || new Date().getFullYear()
  const m = fallbackMonth || new Date().getMonth() + 1

  const isoRange = raw.match(
    /(\d{4})-(\d{1,2})-(\d{1,2})\s*(?:至|到|-|—|~)\s*(?:(\d{4})-)?(\d{1,2})-(\d{1,2})/,
  )
  if (isoRange) {
    const start = `${isoRange[1]}-${pad(+isoRange[2])}-${pad(+isoRange[3])}`
    const endY = isoRange[4] || isoRange[1]
    const end = `${endY}-${pad(+isoRange[5])}-${pad(+isoRange[6])}`
    return { start, end }
  }
  const singleIso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (singleIso) {
    const d = `${singleIso[1]}-${pad(+singleIso[2])}-${pad(+singleIso[3])}`
    return { start: d, end: d }
  }
  const cn = raw.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日?(?:\s*(?:至|到|-|—|~)\s*(?:(\d{1,2})\s*月\s*)?(\d{1,2})\s*日?)?/)
  if (cn) {
    const start = `${y}-${pad(+cn[1])}-${pad(+cn[2])}`
    const endM = cn[3] ? +cn[3] : +cn[1]
    const endD = cn[4] ? +cn[4] : +cn[2]
    const end = `${y}-${pad(endM)}-${pad(endD)}`
    return { start, end }
  }
  const md = raw.match(/^(\d{1,2})-(\d{1,2})(?:\s*(?:至|到|-|—|~)\s*(\d{1,2})-(\d{1,2}))?$/)
  if (md) {
    const start = `${y}-${pad(+md[1])}-${pad(+md[2])}`
    const end = md[3] ? `${y}-${pad(+md[3])}-${pad(+md[4])}` : start
    return { start, end }
  }
  // 兜底：不当解析时不写结构化日期
  void m
  return { start: '', end: '' }
}

export function formatDateRange(start: string, end: string) {
  if (!start) return ''
  if (!end || end === start) return start
  if (start.slice(0, 7) === end.slice(0, 7)) {
    return `${start} 至 ${end.slice(8)}`
  }
  return `${start} 至 ${end}`
}

/** 含首尾的每一天 YYYY-MM-DD */
export function eachDate(start: string, end: string) {
  if (!start) return [] as string[]
  const out: string[] = []
  const s = new Date(`${start}T00:00:00`)
  const e = new Date(`${(end || start)}T00:00:00`)
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return out
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)
  }
  return out
}

/** 月历格子：从头一周日起到月末所在周，空位 day=null */
export function buildMonthGrid(year: number, month: number) {
  const first = new Date(year, month - 1, 1)
  const startPad = first.getDay() // 0=周日
  const daysInMonth = new Date(year, month, 0).getDate()
  const cells: Array<{ date: string | null; day: number | null; inMonth: boolean }> = []
  for (let i = 0; i < startPad; i++) cells.push({ date: null, day: null, inMonth: false })
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      date: `${year}-${pad(month)}-${pad(d)}`,
      day: d,
      inMonth: true,
    })
  }
  while (cells.length % 7 !== 0) cells.push({ date: null, day: null, inMonth: false })
  return cells
}

/** 从今天所在月份起往后 12 个月：[{ year, month }] */
export function rollingMonths(count = 12) {
  const now = new Date()
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    return { year: d.getFullYear(), month: d.getMonth() + 1 }
  })
}

/** 最近 n 个月的 YYYY-MM，从早到晚 */
export function recentMonths(count: number) {
  const now = new Date()
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1)
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
  })
}

export function countBy<T>(items: T[], key: (item: T) => string | null | undefined) {
  const map = new Map<string, number>()
  for (const item of items) {
    const k = key(item)
    if (k) map.set(k, (map.get(k) ?? 0) + 1)
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1])
}
