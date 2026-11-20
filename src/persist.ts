import type {
  Company,
  Contact,
  Expo,
  ExpoState,
  Note,
  SectorTrack,
  TodoItem,
  TouchLog,
} from './types'

export const PERSIST_KEY = 'vc-workbench-v2'

export type Persist = {
  companies?: Record<string, Partial<Company>>
  logs?: TouchLog[]
  notes?: Note[]
  contacts?: Contact[]
  expoState?: Record<string, ExpoState>
  /** 手工添加的展会 */
  customExpos?: Expo[]
  /** 从种子列表里删掉的展会 id */
  removedExpoIds?: string[]
  tracks?: SectorTrack[]
  tracksSeedVersion?: number
  contactsSeedVersion?: number
  dismissedCcIds?: string[]
  ccTracks?: string[]
  todos?: TodoItem[]
  /** 本机最近一次写入时间，用于刷新时判断是否比 D1 更新 */
  _clientSavedAt?: number
}

export type RemoteState = {
  version: number
  updatedAt: string | null
  data: Persist
}

export function loadLocalPersist(): Persist {
  try {
    return JSON.parse(localStorage.getItem(PERSIST_KEY) || '{}') as Persist
  } catch {
    return {}
  }
}

export function saveLocalPersist(data: Persist) {
  localStorage.setItem(
    PERSIST_KEY,
    JSON.stringify({ ...data, _clientSavedAt: Date.now() }),
  )
}

export function persistNonEmpty(p: Persist) {
  return Boolean(
    (p.companies && Object.keys(p.companies).length) ||
      (p.logs && p.logs.length) ||
      (p.notes && p.notes.length) ||
      (p.contacts && p.contacts.length) ||
      (p.dismissedCcIds && p.dismissedCcIds.length) ||
      (p.ccTracks && p.ccTracks.length) ||
      (p.todos && p.todos.length) ||
      (p.tracks && p.tracks.length) ||
      (p.expoState && Object.keys(p.expoState).length) ||
      (p.customExpos && p.customExpos.length) ||
      (p.removedExpoIds && p.removedExpoIds.length),
  )
}

export function slimPersistData(data: Persist): Persist {
  if (!data.companies) return stripClientMeta(data)
  const companies: Record<string, Partial<Company>> = {}
  for (const [id, c] of Object.entries(data.companies)) {
    if (
      c.custom ||
      c.cc ||
      (c.verdict && c.verdict !== 'none') ||
      c.judgment ||
      c.relation
    ) {
      companies[id] = c
    }
  }
  return stripClientMeta({ ...data, companies })
}

/** 只保留真正有业务改动的公司，避免 2MB+ 整表拖死保存 */
export function slimCompanyOverlay(
  companies: Company[],
): Record<string, Partial<Company>> {
  const overlay: Record<string, Partial<Company>> = {}
  for (const c of companies) {
    const hasCc = Boolean(c.cc)
    const hasVerdict = c.verdict && c.verdict !== 'none'
    const hasMeta = Boolean(c.judgment || c.relation)
    const hasSourceManual = Boolean(c.sourceManual)
    if (!c.custom && !hasCc && !hasVerdict && !hasMeta && !hasSourceManual) continue
    overlay[c.id] = c.custom
      ? {
          name: c.name,
          sector: c.sector,
          group: c.group,
          source: c.source,
          sourceManual: c.sourceManual,
          founder: c.founder,
          relation: c.relation,
          verdict: c.verdict,
          judgment: c.judgment,
          lastDate: c.lastDate,
          events: c.events,
          cc: c.cc,
          feishuUrl: c.feishuUrl,
          sectorDetailUrl: c.sectorDetailUrl,
          custom: true,
        }
      : {
          group: c.group,
          sector: c.sector,
          verdict: c.verdict,
          judgment: c.judgment,
          relation: c.relation,
          ...(hasSourceManual ? { source: c.source || '', sourceManual: true } : {}),
          cc: c.cc,
          feishuUrl: c.feishuUrl,
          sectorDetailUrl: c.sectorDetailUrl,
        }
  }
  return overlay
}

export function stripClientMeta(data: Persist): Persist {
  const { _clientSavedAt: _, ...rest } = data
  return rest
}

export function localIsNewer(local: Persist, remoteUpdatedAt: string | null) {
  if (!local._clientSavedAt) return false
  if (!remoteUpdatedAt) return persistNonEmpty(local)
  const remoteMs = Date.parse(remoteUpdatedAt)
  if (Number.isNaN(remoteMs)) return true
  return local._clientSavedAt > remoteMs
}

export async function fetchRemotePersist(): Promise<RemoteState | null> {
  try {
    const res = await fetch('/api/state', { cache: 'no-store' })
    if (!res.ok) return null
    const json = (await res.json()) as RemoteState & { error?: string }
    if (json.error) return null
    return {
      version: json.version || 0,
      updatedAt: json.updatedAt || null,
      data: (json.data || {}) as Persist,
    }
  } catch {
    return null
  }
}

export async function putRemotePersist(
  data: Persist,
  baseVersion: number,
  opts?: { keepalive?: boolean },
): Promise<
  | { ok: true; version: number; updatedAt: string }
  | { ok: false; conflict?: RemoteState; error?: string }
> {
  try {
    const res = await fetch('/api/state', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: stripClientMeta(data), baseVersion }),
      keepalive: Boolean(opts?.keepalive),
    })
    const json = (await res.json()) as RemoteState & {
      error?: string
      version?: number
      updatedAt?: string
    }
    if (res.status === 409) {
      return {
        ok: false,
        conflict: {
          version: json.version || 0,
          updatedAt: json.updatedAt || null,
          data: (json.data || {}) as Persist,
        },
      }
    }
    if (!res.ok) return { ok: false, error: json.error || `HTTP ${res.status}` }
    return {
      ok: true,
      version: json.version || baseVersion + 1,
      updatedAt: json.updatedAt || new Date().toISOString(),
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network' }
  }
}
