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
  /** 项目来源标注：融资变更 / PR爬取 / 企名片 / 外滩大会 等 */
  source?: string
  /** 用户在详情页手改过来源时写入，便于持久化覆盖种子数据 */
  sourceManual?: boolean
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
  /** 手工新增的展会 */
  custom?: boolean
}

export type ExpoStatus = 'watch' | 'planned' | 'attended'

/** 展会关联的公司：可挂项目库，也可只记现场名字 */
export interface ExpoFirm {
  id: string
  name: string
  companyId: string | null
}

/** 某一届参展的 Profile：收获与带回的公司 */
export interface ExpoProfile {
  year: number
  harvest: string
  firms: ExpoFirm[]
}

export interface ExpoState {
  status: ExpoStatus
  dates: string
  dateStart: string
  dateEnd: string
  /** 负责人：哪位同事主跟这场 */
  owner: string
  memo: string
  /** 手工加入的展会公司（项目库 id） */
  leads: string[]
  /** 从 leadSource 自动线索里隐藏的公司 id */
  dismissedLeads: string[]
  /** 按年份存的参展 Profile */
  profiles: ExpoProfile[]
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
