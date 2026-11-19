export type Verdict = 'priority' | 'focus' | 'watch' | 'hold' | 'pass' | 'none'
export type Stage = 'todo' | 'reached' | 'connected' | 'talked' | 'blocked' | 'dropped'

export interface FundingEvent {
  date: string | null
  investors: string[]
  source: string
  sector: string
}

export interface Person {
  name: string
  role: string
}

export interface CCInfo {
  stage: Stage
  /** CC 表里的原始状态文字 */
  status: string
  /** 最近一次真正触达 / 沟通的日期 */
  lastTouch: string | null
  /** 发出好友申请 / 触达申请的日期 */
  appliedAt?: string | null
  nextDate?: string | null
  channels: string[]
  reason: string
  reasonKind: string
  owner: string | null
  /** 「联系方式」列的核查原文 */
  contact: string
  people: Person[]
  phones: string[]
  emails: string[]
  direct: boolean | null
  source: string
  /** 赛道内重点跟进；总表下「重点跟进」汇总用 */
  priorityFollow?: boolean
}

export interface Company {
  id: string
  name: string
  sector: string
  sectorIsClass: boolean
  group: string
  founder: string
  relation: string
  verdict: Verdict
  judgment: string
  lastDate: string | null
  events: FundingEvent[]
  cc: CCInfo | null
  /** 飞书文档 / 知识库链接，公司详情页用 */
  feishuUrl?: string
  /** 赛道详情链接（研报 / 文档等） */
  sectorDetailUrl?: string
  custom?: boolean
}

export interface TouchLog {
  id: string
  companyId: string
  date: string
  channel: string
  text: string
  stage: Stage
}

export interface Note {
  id: string
  kind: 'meeting' | 'chat'
  title: string
  date: string
  source: string
  body: string
  companyIds: string[]
  sample?: boolean
}

export type ContactKind = 'fa' | 'founder' | 'investor'

export interface Contact {
  id: string
  kind: ContactKind
  name: string
  role: string
  others: Person[]
  companyId: string | null
  /** FA/投资机构所属机构名，或创始人对应公司 */
  companyName: string
  phones: string[]
  emails: string[]
  wechat: string
  source: string
  /** 内部关系人：哪位同事认识或对接 */
  via: string
  note: string
  custom?: boolean
}

export type City = '北京' | '上海' | '广州' | '深圳'

export interface Expo {
  id: string
  name: string
  city: City
  /** 常规档期所在月份，1–12 */
  month: number
  /** 示例/默认开展日 YYYY-MM-DD，日历用；可被 ExpoState 覆盖 */
  dateStart?: string
  dateEnd?: string
  venue: string
  groups: string[]
  platforms: string[]
  about: string
  /** 项目库里「来源」等于该值的公司会被列为展会线索 */
  leadSource?: string
}

export type ExpoStatus = 'watch' | 'planned' | 'attended'

export interface ExpoState {
  status: ExpoStatus
  dates: string
  dateStart: string
  dateEnd: string
  /** 负责人：哪位同事主跟这场 */
  owner: string
  memo: string
  leads: string[]
}

export interface DocSection {
  heading: string
  body: string
  /** 由项目库数据生成的段落 */
  auto?: boolean
  hint?: string
}

export interface Doc {
  id: string
  group: string
  kind: 'report' | 'review'
  title: string
  updatedAt: string
  sections: DocSection[]
}

/** 赛道研究里挂的公司：可库外，头部 / 需 CC */
export type SectorFirmRole = 'leader' | 'cc'

export interface SectorFirm {
  id: string
  name: string
  role: SectorFirmRole
  /** 一句话：为何是头部 / 为何要 CC */
  note: string
  /** 若项目库能匹配上，挂上 id */
  companyId: string | null
  /** 行业头部里的海外标杆 */
  overseas?: boolean
}

export interface SectorTrack {
  id: string
  name: string
  /** 赛道负责人 */
  owner: string
  /** 一句话判断 */
  thesis: string
  /** 研报 / Review 正文 */
  report: string
  source: string
  updatedAt: string
  firms: SectorFirm[]
}

export interface TodoItem {
  id: string
  text: string
  done: boolean
  createdAt: string
}
