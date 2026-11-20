/** Port of scripts/build-data.py mapping logic for Feishu → workbench catalog. */

export type Verdict = 'priority' | 'focus' | 'watch' | 'hold' | 'pass' | 'none'
export type Stage = 'todo' | 'reached' | 'connected' | 'talked' | 'blocked' | 'dropped'

export type FundingEvent = {
  date: string | null
  investors: string[]
  source: string
  sector: string
}

export type Person = { name: string; role: string }

export type CCInfo = {
  stage: Stage
  status: string
  lastTouch: string | null
  channels: string[]
  reason: string
  reasonKind: string
  owner: string | null
  contact: string
  people: Person[]
  phones: string[]
  emails: string[]
  direct: boolean | null
  source: string
}

export type Company = {
  id: string
  name: string
  sector: string
  sectorIsClass: boolean
  group: string
  source: string
  founder: string
  relation: string
  verdict: Verdict
  judgment: string
  lastDate: string | null
  events: FundingEvent[]
  cc: CCInfo | null
  feishuUrl?: string
}

export type CatalogPayload = {
  generatedAt: string
  syncedAt: string
  sourceFile: string
  owners: string[]
  companies: Company[]
}

const YEAR = new Date().getFullYear()
const UNGROUPED = '未归类'

const VERDICTS: Array<[Verdict, string[]]> = [
  ['priority', ['优先关注', '符合重点关注标准']],
  ['focus', ['符合关注标准', '奇绩创坛已投资', '建议关注']],
  ['watch', ['建议持续观察']],
  ['hold', ['暂不优先', '暂不进入CC', '不符合CC']],
  ['pass', ['不看此类项目']],
]

const GROUPS: Array<[string, RegExp]> = [
  ['具身智能与机器人', /机器人|具身|灵巧手|人形|触觉|机械臂|外骨骼/],
  ['脑机与量子', /脑机|量子|核聚变|聚变/],
  ['芯片与半导体', /芯片|半导体|晶圆|封装|光刻|EDA|存储器|集成电路|光电子|光互连|光模块|传感器/],
  ['航天与低空', /卫星|火箭|航天|太空|低空|无人机|eVTOL|飞行器|航空/],
  ['生物医药', /药|医疗|基因|细胞|生物|诊断|医学|器械|临床|合成生物|DNA|蛋白/],
  ['新能源与材料', /电池|储能|光伏|氢|新能源|材料|电力|充电|碳/],
  ['AI 模型与算力', /大模型|基础模型|算力|数据中心|云计算|GPU|推理|训练|向量|AI基础设施|AI计算/],
  ['AI 应用', /AI|智能体|Agent|AIGC|人工智能|数字人|智能/i],
  ['消费与品牌', /消费|品牌|食品|饮料|保健|户外|服饰|服装|美妆|咖啡|宠物|家居|零售|潮玩|运动/],
  ['先进制造与硬件', /工业|制造|装备|设备|光学|光通信|3D打印|增材|汽车|电机|零部件|仪器|加工|激光|车载/],
  ['企业软件与数据', /软件|SaaS|数据|安全|云|平台|系统|互联网/i],
]

const SOURCE_MAP: Record<string, string> = {
  机构融资: '融资变更',
  机构投资列表: '融资变更',
  国内融资: 'PR爬取',
  国内融资事件: 'PR爬取',
  企名片补录: '企名片',
  企名片: '企名片',
}

const STAGE_RULES: Array<[Stage, RegExp]> = [
  ['talked', /聊过|已聊|交流过/],
  ['connected', /已加|通过|已添加|已有微信|已建联|加到微信/],
  ['blocked', /可尝试|可重打|没接|未接|未绑定|好友库无/],
  ['reached', /申请|发送|私信|邮箱|邮件|短信|小红书|cc|CC|留言|已打电话|发微信|公众号|座机电话/],
  ['blocked', /无联系|没找到|无直接|暂无|无$/],
]

const CHANNELS: Array<[string, RegExp]> = [
  ['企微', /企微/],
  ['微信', /微信(?!公众号)|申请|已加上/],
  ['公众号', /公众号/],
  ['邮件', /邮箱|邮件/],
  ['短信', /短信/],
  ['电话', /电话|座机|拨号/],
  ['小红书', /小红书/],
  ['FA', /FA|fa/],
  ['官网留言', /留言/],
]

const PERSON_KEY =
  /^(创始人[^：:]{0,14}|法定代表人|法人[^：:]{0,8}|联系人|实控人|核心团队|CEO|CFO)[：:]\s*(.+)$/
const PERSON_NAME = /[\u4e00-\u9fa5·]{2,4}(?![\u4e00-\u9fa5])|[A-Za-z][A-Za-z .\-]{1,30}/
const NOT_A_NAME = new Set(['未披露', '未确认', '暂无', '未知', '待核实', '不详', '暂未', '未公开', '公开信息'])
const MOBILE = /(?<!\d)1[3-9]\d{9}(?!\d)/g
const LANDLINE = /(?<!\d)0\d{2,3}[- ]?\d{7,8}(?!\d)/g
const EMAIL = /[A-Za-z0-9_.+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)+/g

/** Feishu display-name aliases → canonical Excel column names */
export const MAIN_FIELD_ALIASES: Record<string, string[]> = {
  项目: ['项目', '公司名称', '公司'],
  机构: ['机构', '投资机构'],
  来源: ['来源', '数据来源'],
  创始人: ['创始人'],
  赛道: ['赛道'],
  投资日期: ['投资日期', '日期'],
  公司简介: ['公司简介', '简介链接', '飞书链接'],
  状态: ['状态'],
  判断: ['判断'],
  赛道关联: ['赛道关联'],
}

export const CC_FIELD_ALIASES: Record<string, string[]> = {
  公司名称: ['公司名称', '项目', '公司'],
  CC状态: ['CC状态', '状态'],
  cc原因: ['cc原因', 'CC原因', '原因'],
  公司简介: ['公司简介', '简介链接', '飞书链接'],
  联系方式: ['联系方式'],
  来源: ['来源', '数据来源'],
  赛道: ['赛道'],
}

export function mapSource(raw: string): string {
  const text = (raw || '').trim()
  if (!text) return ''
  return SOURCE_MAP[text] || text
}

export function isIndustryClass(sector: string): boolean {
  return Boolean(sector) && (sector.endsWith('业') || sector === '研究和试验发展' || sector === '资本市场服务')
}

export function verdictOf(judgment: string): Verdict {
  for (const [key, prefixes] of VERDICTS) {
    if (prefixes.some((p) => judgment.startsWith(p))) return key
  }
  return 'none'
}

export function groupOf(...labels: string[]): string {
  for (const label of labels) {
    if (!label || isIndustryClass(label)) continue
    for (const [name, pattern] of GROUPS) {
      if (pattern.test(label)) return name
    }
  }
  return UNGROUPED
}

export function parseStatus(raw: string): { stage: Stage; lastTouch: string | null; channels: string[] } {
  let stage: Stage | null = null
  for (const [key, pattern] of STAGE_RULES) {
    if (pattern.test(raw)) {
      stage = key
      break
    }
  }
  const dates: string[] = []
  for (const m of raw.matchAll(/(?<![\d.])(\d{1,2})\.(\d{1,2})(?![\d.])/g)) {
    const month = Number(m[1])
    const day = Number(m[2])
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      dates.push(`${YEAR}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
    }
  }
  if (!stage) stage = dates.length ? 'reached' : 'todo'
  const channels = CHANNELS.filter(([, pattern]) => pattern.test(raw)).map(([name]) => name)
  return { stage, lastTouch: dates.length ? dates.sort().at(-1)! : null, channels }
}

export function parseContact(raw: string): {
  people: Person[]
  phones: string[]
  emails: string[]
  direct: boolean | null
} {
  const people: Person[] = []
  const seen = new Set<string>()
  for (const segment of raw.split(/[\n；;]/)) {
    const match = PERSON_KEY.exec(segment.trim())
    if (!match) continue
    const nameMatch = PERSON_NAME.exec(match[2].trim())
    if (!nameMatch) continue
    let name = nameMatch[0].replace(/(教授|博士|先生|女士|老师)$/, '').trim()
    if (NOT_A_NAME.has(name) || seen.has(name) || [...NOT_A_NAME].some((x) => name.startsWith(x))) continue
    if (name.length < 2 || /创始人|来自|公司|团队|履历|法人|负责人/.test(name)) continue
    seen.add(name)
    people.push({ name, role: match[1].trim() })
  }
  const phones = [...new Set([...(raw.match(MOBILE) || []), ...(raw.match(LANDLINE) || [])])]
  const emails = [...new Set(raw.match(EMAIL) || [])]
  let direct: boolean | null = null
  if (raw.includes('无直接联系方式')) direct = false
  else if (raw.includes('有直接联系方式')) direct = true
  return { people, phones, emails, direct }
}

export function ownerOf(reason: string): string | null {
  for (const pattern of [
    /同事需求（([\u4e00-\u9fa5]{2,3})[，,）]/,
    /^([\u4e00-\u9fa5]{2,3})赛道 待CC/,
    /^([\u4e00-\u9fa5]{2,3})待cc名单/,
  ]) {
    const m = pattern.exec(reason)
    if (m) return m[1]
  }
  return null
}

export function reasonKind(reason: string): string {
  if (/^(抖音|双十一)/.test(reason)) return '消费榜单'
  if (/^(符合重点关注|优先关注)/.test(reason)) return '重点关注'
  if (reason.startsWith('符合关注标准') || reason.startsWith('建议关注') || reason.startsWith('项目符合公司画像')) {
    return '符合关注标准'
  }
  if (reason.slice(0, 12).includes('奇绩创坛')) return '奇绩创坛已投'
  if (ownerOf(reason)) return '同事提名'
  return reason ? '其他' : ''
}

export function fieldText(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) {
    return v
      .map((x) => {
        if (typeof x === 'string') return x
        if (x && typeof x === 'object' && 'text' in x) return String((x as { text?: string }).text || '')
        return ''
      })
      .join('')
      .trim()
  }
  if (typeof v === 'object' && v && 'text' in v) return String((v as { text?: string }).text || '').trim()
  return String(v).trim()
}

export function fieldLink(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v.startsWith('http') ? v.trim() : ''
  if (Array.isArray(v)) {
    for (const x of v) {
      if (x && typeof x === 'object' && 'link' in x) {
        const link = String((x as { link?: string }).link || '').trim()
        if (link) return link
      }
    }
    return ''
  }
  if (typeof v === 'object' && v && 'link' in v) {
    return String((v as { link?: string }).link || '').trim()
  }
  return ''
}

/** Resolve canonical field from Feishu record fields using aliases. */
export function pickField(
  fields: Record<string, unknown>,
  aliases: Record<string, string[]>,
  canonical: string,
): unknown {
  const names = aliases[canonical] || [canonical]
  for (const name of names) {
    if (name in fields) return fields[name]
  }
  // case-insensitive / trimmed key fallback
  const keys = Object.keys(fields)
  for (const name of names) {
    const hit = keys.find((k) => k.trim() === name || k.replace(/\s+/g, '') === name.replace(/\s+/g, ''))
    if (hit) return fields[hit]
  }
  return undefined
}

/** Minimal MD5 (Workers SubtleCrypto has no MD5); match Python hashlib.md5(name).hexdigest()[:8]. */
function md5Hex(text: string): string {
  function cmn(q: number, a: number, b: number, x: number, s: number, t: number) {
    a = (a + q + x + t) | 0
    return (((a << s) | (a >>> (32 - s))) + b) | 0
  }
  function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn((b & c) | (~b & d), a, b, x, s, t)
  }
  function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn((b & d) | (c & ~d), a, b, x, s, t)
  }
  function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn(b ^ c ^ d, a, b, x, s, t)
  }
  function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn(c ^ (b | ~d), a, b, x, s, t)
  }
  const utf8 = unescape(encodeURIComponent(text))
  const n = utf8.length
  const words: number[] = []
  for (let i = 0; i < n; i++) words[i >> 2] |= (utf8.charCodeAt(i) & 0xff) << ((i % 4) * 8)
  words[n >> 2] |= 0x80 << ((n % 4) * 8)
  const bits = n * 8
  words[(((bits + 64) >>> 9) << 4) + 14] = bits

  let a = 1732584193
  let b = -271733879
  let c = -1732584194
  let d = 271733878
  for (let i = 0; i < words.length; i += 16) {
    const oa = a
    const ob = b
    const oc = c
    const od = d
    const w = words
    a = ff(a, b, c, d, w[i] | 0, 7, -680876936)
    d = ff(d, a, b, c, w[i + 1] | 0, 12, -389564586)
    c = ff(c, d, a, b, w[i + 2] | 0, 17, 606105819)
    b = ff(b, c, d, a, w[i + 3] | 0, 22, -1044525330)
    a = ff(a, b, c, d, w[i + 4] | 0, 7, -176418897)
    d = ff(d, a, b, c, w[i + 5] | 0, 12, 1200080426)
    c = ff(c, d, a, b, w[i + 6] | 0, 17, -1473231341)
    b = ff(b, c, d, a, w[i + 7] | 0, 22, -45705983)
    a = ff(a, b, c, d, w[i + 8] | 0, 7, 1770035416)
    d = ff(d, a, b, c, w[i + 9] | 0, 12, -1958414417)
    c = ff(c, d, a, b, w[i + 10] | 0, 17, -42063)
    b = ff(b, c, d, a, w[i + 11] | 0, 22, -1990404162)
    a = ff(a, b, c, d, w[i + 12] | 0, 7, 1804603682)
    d = ff(d, a, b, c, w[i + 13] | 0, 12, -40341101)
    c = ff(c, d, a, b, w[i + 14] | 0, 17, -1502002290)
    b = ff(b, c, d, a, w[i + 15] | 0, 22, 1236535329)
    a = gg(a, b, c, d, w[i + 1] | 0, 5, -165796510)
    d = gg(d, a, b, c, w[i + 6] | 0, 9, -1069501632)
    c = gg(c, d, a, b, w[i + 11] | 0, 14, 643717713)
    b = gg(b, c, d, a, w[i] | 0, 20, -373897302)
    a = gg(a, b, c, d, w[i + 5] | 0, 5, -701558691)
    d = gg(d, a, b, c, w[i + 10] | 0, 9, 38016083)
    c = gg(c, d, a, b, w[i + 15] | 0, 14, -660478335)
    b = gg(b, c, d, a, w[i + 4] | 0, 20, -405537848)
    a = gg(a, b, c, d, w[i + 9] | 0, 5, 568446438)
    d = gg(d, a, b, c, w[i + 14] | 0, 9, -1019803690)
    c = gg(c, d, a, b, w[i + 3] | 0, 14, -187363961)
    b = gg(b, c, d, a, w[i + 8] | 0, 20, 1163531501)
    a = gg(a, b, c, d, w[i + 13] | 0, 5, -1444681467)
    d = gg(d, a, b, c, w[i + 2] | 0, 9, -51403784)
    c = gg(c, d, a, b, w[i + 7] | 0, 14, 1735328473)
    b = gg(b, c, d, a, w[i + 12] | 0, 20, -1926607734)
    a = hh(a, b, c, d, w[i + 5] | 0, 4, -378558)
    d = hh(d, a, b, c, w[i + 8] | 0, 11, -2022574463)
    c = hh(c, d, a, b, w[i + 11] | 0, 16, 1839030562)
    b = hh(b, c, d, a, w[i + 14] | 0, 23, -35309556)
    a = hh(a, b, c, d, w[i + 1] | 0, 4, -1530992060)
    d = hh(d, a, b, c, w[i + 4] | 0, 11, 1272893353)
    c = hh(c, d, a, b, w[i + 7] | 0, 16, -155497632)
    b = hh(b, c, d, a, w[i + 10] | 0, 23, -1094730640)
    a = hh(a, b, c, d, w[i + 13] | 0, 4, 681279174)
    d = hh(d, a, b, c, w[i] | 0, 11, -358537222)
    c = hh(c, d, a, b, w[i + 3] | 0, 16, -722521979)
    b = hh(b, c, d, a, w[i + 6] | 0, 23, 76029189)
    a = hh(a, b, c, d, w[i + 9] | 0, 4, -640364487)
    d = hh(d, a, b, c, w[i + 12] | 0, 11, -421815835)
    c = hh(c, d, a, b, w[i + 15] | 0, 16, 530742520)
    b = hh(b, c, d, a, w[i + 2] | 0, 23, -995338651)
    a = ii(a, b, c, d, w[i] | 0, 6, -198630844)
    d = ii(d, a, b, c, w[i + 7] | 0, 10, 1126891415)
    c = ii(c, d, a, b, w[i + 14] | 0, 15, -1416354905)
    b = ii(b, c, d, a, w[i + 5] | 0, 21, -57434055)
    a = ii(a, b, c, d, w[i + 12] | 0, 6, 1700485571)
    d = ii(d, a, b, c, w[i + 3] | 0, 10, -1894986606)
    c = ii(c, d, a, b, w[i + 10] | 0, 15, -1051523)
    b = ii(b, c, d, a, w[i + 1] | 0, 21, -2054922799)
    a = ii(a, b, c, d, w[i + 8] | 0, 6, 1873313359)
    d = ii(d, a, b, c, w[i + 15] | 0, 10, -30611744)
    c = ii(c, d, a, b, w[i + 6] | 0, 15, -1560198380)
    b = ii(b, c, d, a, w[i + 13] | 0, 21, 1309151649)
    a = ii(a, b, c, d, w[i + 4] | 0, 6, -145523070)
    d = ii(d, a, b, c, w[i + 11] | 0, 10, -1120210379)
    c = ii(c, d, a, b, w[i + 2] | 0, 15, 718787259)
    b = ii(b, c, d, a, w[i + 9] | 0, 21, -343485551)
    a = (a + oa) | 0
    b = (b + ob) | 0
    c = (c + oc) | 0
    d = (d + od) | 0
  }
  function hex(n: number) {
    let s = ''
    for (let j = 0; j < 4; j++) s += ((n >> (j * 8)) & 0xff).toString(16).padStart(2, '0')
    return s
  }
  return hex(a) + hex(b) + hex(c) + hex(d)
}

export function companyIdFromName(name: string): string {
  return md5Hex(name).slice(0, 8)
}

type RawEvent = {
  date: string | null
  investors: string[]
  source: string
  sector: string
  related: string
  founder: string
  status: string
  verdict: Verdict
  judgment: string
}

type Draft = {
  id: string
  name: string
  events: RawEvent[]
  cc: (CCInfo & { sector?: string }) | null
  feishuUrl?: string
}

function normalizeDate(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  // Feishu may return timestamp ms
  if (/^\d{10,13}$/.test(t)) {
    const n = Number(t)
    const d = new Date(t.length >= 13 ? n : n * 1000)
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  }
  const m = t.match(/(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  return t.slice(0, 10) || null
}

export function buildCatalogFromFeishuRows(input: {
  mainRows: Array<{ fields: Record<string, unknown> }>
  ccRows: Array<{ fields: Record<string, unknown> }>
  sourceLabel?: string
}): CatalogPayload {
  const byName = new Map<string, Draft>()

  function ensure(name: string): Draft {
    let item = byName.get(name)
    if (!item) {
      item = { id: companyIdFromName(name), name, events: [], cc: null }
      byName.set(name, item)
    }
    return item
  }

  for (const row of input.mainRows) {
    const f = row.fields || {}
    const name = fieldText(pickField(f, MAIN_FIELD_ALIASES, '项目'))
    if (!name) continue
    let founder = fieldText(pickField(f, MAIN_FIELD_ALIASES, '创始人'))
    if (founder === '未披露' || founder === 'None' || founder === '及核心团队履历' || founder.startsWith('及')) {
      founder = ''
    }
    const investorsRaw = fieldText(pickField(f, MAIN_FIELD_ALIASES, '机构'))
    const investors = investorsRaw
      .split(/[、,，;；]/)
      .map((x) => x.trim())
      .filter((x) => x && x !== '未披露')
    const link = fieldLink(pickField(f, MAIN_FIELD_ALIASES, '公司简介'))
    const item = ensure(name)
    if (link && !item.feishuUrl) item.feishuUrl = link
    item.events.push({
      date: normalizeDate(fieldText(pickField(f, MAIN_FIELD_ALIASES, '投资日期'))),
      investors,
      source: mapSource(fieldText(pickField(f, MAIN_FIELD_ALIASES, '来源'))),
      sector: fieldText(pickField(f, MAIN_FIELD_ALIASES, '赛道')),
      related: fieldText(pickField(f, MAIN_FIELD_ALIASES, '赛道关联')),
      founder,
      status: fieldText(pickField(f, MAIN_FIELD_ALIASES, '状态')),
      verdict: verdictOf(fieldText(pickField(f, MAIN_FIELD_ALIASES, '判断'))),
      judgment: fieldText(pickField(f, MAIN_FIELD_ALIASES, '判断')),
    })
  }

  for (const row of input.ccRows) {
    const f = row.fields || {}
    const name = fieldText(pickField(f, CC_FIELD_ALIASES, '公司名称'))
    if (!name) continue
    const item = ensure(name)
    const status = fieldText(pickField(f, CC_FIELD_ALIASES, 'CC状态'))
    const reason = fieldText(pickField(f, CC_FIELD_ALIASES, 'cc原因'))
    const contact = fieldText(pickField(f, CC_FIELD_ALIASES, '联系方式'))
    const { stage, lastTouch, channels } = parseStatus(status)
    const { people, phones, emails, direct } = parseContact(contact)
    const link = fieldLink(pickField(f, CC_FIELD_ALIASES, '公司简介'))
    if (link && !item.feishuUrl) item.feishuUrl = link
    const cc: CCInfo & { sector?: string } = {
      stage,
      status,
      lastTouch,
      channels,
      reason,
      reasonKind: reasonKind(reason),
      owner: ownerOf(reason),
      contact,
      people,
      phones,
      emails,
      direct,
      source: mapSource(fieldText(pickField(f, CC_FIELD_ALIASES, '来源'))),
      sector: fieldText(pickField(f, CC_FIELD_ALIASES, '赛道')),
    }
    if (item.cc) {
      const previous = item.cc
      if (!previous.status && cc.status) {
        previous.stage = cc.stage
        previous.lastTouch = cc.lastTouch
        previous.channels = cc.channels
        previous.status = cc.status
      }
      for (const [key, value] of Object.entries(cc) as Array<[keyof typeof cc, (typeof cc)[keyof typeof cc]]>) {
        if (!(previous as Record<string, unknown>)[key] && value) {
          ;(previous as Record<string, unknown>)[key] = value
        }
      }
    } else {
      item.cc = cc
    }
  }

  const result: Company[] = []
  for (const item of byName.values()) {
    const events = [...item.events].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    const cc = item.cc
    const sectors = [cc?.sector || '', ...events.map((e) => e.sector), ...events.map((e) => e.related)]
    const sector =
      sectors.find((s) => s && !isIndustryClass(s)) || sectors.find((s) => s) || ''
    const judged = events.find((e) => e.verdict !== 'none')
    let group = groupOf(...sectors)
    if (group === UNGROUPED && cc?.reasonKind === '消费榜单') group = '消费与品牌'

    const sourceParts: string[] = []
    for (const e of events) {
      if (e.source && !sourceParts.includes(e.source)) sourceParts.push(e.source)
    }
    if (cc?.source && !sourceParts.includes(cc.source)) sourceParts.push(cc.source)
    if (!sourceParts.length && cc) {
      sourceParts.push('CC表')
      if (!cc.source) cc.source = 'CC表'
    }

    const { sector: _drop, ...ccOut } = cc || { sector: undefined }
    void _drop

    result.push({
      id: item.id,
      name: item.name,
      sector,
      sectorIsClass: isIndustryClass(sector),
      group,
      source: sourceParts.join('、'),
      founder: events.find((e) => e.founder)?.founder || '',
      relation: events.find((e) => e.status)?.status || '',
      verdict: judged?.verdict || 'none',
      judgment: judged?.judgment || '',
      lastDate: events[0]?.date || null,
      events: events.map((e) => ({
        date: e.date,
        investors: e.investors,
        source: e.source,
        sector: e.sector,
      })),
      cc: cc
        ? {
            stage: cc.stage,
            status: cc.status,
            lastTouch: cc.lastTouch,
            channels: cc.channels,
            reason: cc.reason,
            reasonKind: cc.reasonKind,
            owner: cc.owner,
            contact: cc.contact,
            people: cc.people,
            phones: cc.phones,
            emails: cc.emails,
            direct: cc.direct,
            source: cc.source,
          }
        : null,
      ...(item.feishuUrl ? { feishuUrl: item.feishuUrl } : {}),
    })
  }

  result.sort((a, b) => (b.lastDate || '').localeCompare(a.lastDate || '') || a.name.localeCompare(b.name, 'zh'))
  const owners = [
    ...new Set(result.map((c) => c.cc?.owner).filter((o): o is string => Boolean(o))),
  ].sort((a, b) => a.localeCompare(b, 'zh'))

  const now = new Date().toISOString()
  return {
    generatedAt: now.slice(0, 16),
    syncedAt: now,
    sourceFile: input.sourceLabel || 'feishu-bitable',
    owners,
    companies: result,
  }
}
