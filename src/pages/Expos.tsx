import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../store'
import { PageHead, Empty, Badge } from '../ui'
import {
  EXPO_STATUS,
  buildMonthGrid,
  eachDate,
  formatDateRange,
  num,
  parseExpoDates,
  rollingMonths,
  shiftDateRange,
  todayISO,
  uid,
} from '../lib'
import type { City, Company, Expo, ExpoFirm, ExpoProfile, ExpoStatus } from '../types'

const CITIES: Array<City | '全部'> = ['全部', '北京', '上海', '广州', '深圳']
const WEEK = ['日', '一', '二', '三', '四', '五', '六']

type RankedExpo = Expo & { year: number; sortKey: string }

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function isoFromParts(y: number, m: number, d: number) {
  return `${y}-${pad2(m)}-${pad2(d)}`
}

function statusLabel(s: ExpoStatus) {
  return EXPO_STATUS.find((x) => x.key === s)?.label || s
}

function getState(
  expoState: Record<
    string,
    {
      status?: ExpoStatus
      dates?: string
      dateStart?: string
      dateEnd?: string
      owner?: string
      attendees?: string
      memo?: string
      leads?: string[]
      dismissedLeads?: string[]
      profiles?: ExpoProfile[]
    }
  >,
  expo: RankedExpo,
) {
  const raw = expoState[expo.id]
  const seedYear = expo.dateStart ? Number(expo.dateStart.slice(0, 4)) : expo.year
  const shifted = shiftDateRange(expo.dateStart, expo.dateEnd || expo.dateStart, expo.year - seedYear)
  const dateStart = raw?.dateStart || shifted.start
  const dateEnd = raw?.dateEnd || shifted.end || dateStart
  const dates = raw?.dates || formatDateRange(dateStart, dateEnd) || ''
  return {
    status: ((((raw?.status as string | undefined) === 'reviewed' ? 'attended' : raw?.status) ||
      'watch') as ExpoStatus),

    dates,
    dateStart,
    dateEnd,
    owner: raw?.owner || raw?.attendees || '',
    memo: raw?.memo || '',
    leads: raw?.leads || [],
    dismissedLeads: raw?.dismissedLeads || [],
    profiles: raw?.profiles || [],
  }
}

function ensureProfile(profiles: ExpoProfile[], year: number): ExpoProfile[] {
  if (profiles.some((p) => p.year === year)) return profiles
  return [...profiles, { year, harvest: '', firms: [] }].sort((a, b) => b.year - a.year)
}

function profileOf(profiles: ExpoProfile[], year: number): ExpoProfile {
  return profiles.find((p) => p.year === year) || { year, harvest: '', firms: [] }
}

function prevProfile(profiles: ExpoProfile[], year: number): ExpoProfile | null {
  return (
    profiles
      .filter((p) => p.year < year && (p.harvest.trim() || p.firms.length))
      .sort((a, b) => b.year - a.year)[0] || null
  )
}

function resolveFirm(companies: Company[], nameOrId: string): ExpoFirm | null {
  const q = nameOrId.trim()
  if (!q) return null
  const hit = companies.find((c) => c.name === q || c.id === q)
  if (hit) return { id: hit.id, name: hit.name, companyId: hit.id }
  return { id: uid(), name: q, companyId: null }
}

const COLOR_COUNT = 12

function dayIndex(iso: string) {
  return Math.round(new Date(`${iso}T00:00:00`).getTime() / 86400000)
}

/**
 * 同月内着色：同一活动全程同色；
 * 日期重叠或首尾相邻的不同活动强制不同色，避免看成同一场。
 */
function assignEventColors(
  items: Array<{ id: string; start: string; end: string }>,
) {
  const sorted = [...items].sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id))
  const colors = new Map<string, string>()
  for (const item of sorted) {
    const s = dayIndex(item.start)
    const e = dayIndex(item.end || item.start)
    const used = new Set<number>()
    for (const other of sorted) {
      if (other.id === item.id || !colors.has(other.id)) continue
      const os = dayIndex(other.start)
      const oe = dayIndex(other.end || other.start)
      // 重叠或隔天紧挨（|gap|<=1）都算冲突
      if (s <= oe + 1 && e >= os - 1) {
        used.add(Number(colors.get(other.id)!.slice(1)))
      }
    }
    let pick = 0
    while (used.has(pick) && pick < COLOR_COUNT) pick += 1
    if (pick >= COLOR_COUNT) {
      let h = 0
      for (let i = 0; i < item.id.length; i++) h = (h * 31 + item.id.charCodeAt(i)) >>> 0
      pick = h % COLOR_COUNT
    }
    colors.set(item.id, `c${pick}`)
  }
  return colors
}

export default function Expos() {
  const { companies, expoState, expos, saveExpo, addExpo, deleteExpo, owners } = useStore()
  const months = rollingMonths(12)
  const now = new Date()
  const defaultKey = `${now.getFullYear()}-${now.getMonth() + 1}`
  const today = todayISO()

  const [view, setView] = useState<'list' | 'calendar'>('calendar')
  const [city, setCity] = useState<City | '全部'>('全部')
  const [monthKey, setMonthKey] = useState<string | '全部'>(defaultKey)
  const [status, setStatus] = useState<'全部' | ExpoStatus>('全部')
  const [ownerFilter, setOwnerFilter] = useState('全部')
  const [q, setQ] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [focusDate, setFocusDate] = useState(today)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [leadDraft, setLeadDraft] = useState('')
  const [profileDraft, setProfileDraft] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCity, setNewCity] = useState<City>('上海')
  const [newMonth, setNewMonth] = useState(String(now.getMonth() + 1))
  const [newVenue, setNewVenue] = useState('')
  const [newDates, setNewDates] = useState('')

  const calYear = view === 'calendar' && monthKey !== '全部'
    ? Number(monthKey.split('-')[0])
    : now.getFullYear()
  const calMonth = view === 'calendar' && monthKey !== '全部'
    ? Number(monthKey.split('-')[1])
    : now.getMonth() + 1

  const ranked = useMemo(() => {
    const items: RankedExpo[] = []
    for (const e of expos) {
      const hit = months.find((m) => m.month === e.month) || months[0]
      const year = e.dateStart ? Number(e.dateStart.slice(0, 4)) || hit.year : hit.year
      items.push({
        ...e,
        year: e.custom && e.dateStart ? year : hit.year,
        sortKey: `${e.custom && e.dateStart ? year : hit.year}-${String(e.month).padStart(2, '0')}`,
      })
    }
    return items.sort((a, b) => a.sortKey.localeCompare(b.sortKey) || a.name.localeCompare(b.name, 'zh'))
  }, [months, expos])

  const monthCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const m of months) map.set(`${m.year}-${m.month}`, 0)
    for (const e of ranked) {
      if (city !== '全部' && e.city !== city) continue
      map.set(`${e.year}-${e.month}`, (map.get(`${e.year}-${e.month}`) || 0) + 1)
    }
    return map
  }, [ranked, months, city])

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    return ranked.filter((e) => {
      if (city !== '全部' && e.city !== city) return false
      if (view === 'list' && monthKey !== '全部' && `${e.year}-${e.month}` !== monthKey) return false
      const st = getState(expoState, e)
      if (status !== '全部' && st.status !== status) return false
      if (ownerFilter === '未分配' && st.owner) return false
      if (ownerFilter !== '全部' && ownerFilter !== '未分配' && st.owner !== ownerFilter) return false
      if (!query) return true
      return [e.name, e.city, e.venue, e.about, ...e.groups, st.owner, st.dates]
        .join(' ')
        .toLowerCase()
        .includes(query)
    })
  }, [ranked, city, monthKey, status, ownerFilter, q, expoState, view])

  const active = ranked.find((e) => e.id === activeId) || null
  const activeState = active ? getState(expoState, active) : null

  const expoCompanies = useMemo(() => {
    if (!active || !activeState) return [] as Array<Company & { origin: 'auto' | 'manual' | 'both' }>
    const dismissed = new Set(activeState.dismissedLeads)
    const manual = new Set(activeState.leads)
    const autoIds = new Set<string>()
    if (active.leadSource) {
      for (const c of companies) {
        if (dismissed.has(c.id)) continue
        if (c.events.some((ev) => ev.source === active.leadSource) || c.source === active.leadSource) {
          autoIds.add(c.id)
        }
      }
    }
    const ids = new Set<string>([...autoIds, ...manual])
    const rows: Array<Company & { origin: 'auto' | 'manual' | 'both' }> = []
    for (const id of ids) {
      const c = companies.find((x) => x.id === id)
      if (!c) continue
      const inAuto = autoIds.has(id)
      const inManual = manual.has(id)
      rows.push({
        ...c,
        origin: inAuto && inManual ? 'both' : inManual ? 'manual' : 'auto',
      })
    }
    rows.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
    return rows
  }, [companies, active, activeState])

  const currentProfile = active && activeState ? profileOf(activeState.profiles, active.year) : null
  const lastProfile =
    active && activeState ? prevProfile(activeState.profiles, active.year) : null

  function patchProfiles(next: ExpoProfile[]) {
    if (!active) return
    saveExpo(active.id, { profiles: next })
  }

  function updateCurrentProfile(patch: Partial<ExpoProfile>) {
    if (!active || !activeState) return
    const profiles = ensureProfile(activeState.profiles, active.year).map((p) =>
      p.year === active.year ? { ...p, ...patch } : p,
    )
    patchProfiles(profiles)
  }

  function addExpoLead() {
    if (!active || !activeState || !leadDraft.trim()) return
    const hit = companies.find((c) => c.name === leadDraft.trim() || c.id === leadDraft.trim())
    if (!hit) return
    const leads = activeState.leads.includes(hit.id)
      ? activeState.leads
      : [...activeState.leads, hit.id]
    const dismissedLeads = activeState.dismissedLeads.filter((id) => id !== hit.id)
    saveExpo(active.id, { leads, dismissedLeads })
    setLeadDraft('')
  }

  function removeExpoLead(companyId: string, origin: 'auto' | 'manual' | 'both') {
    if (!active || !activeState) return
    const leads = activeState.leads.filter((id) => id !== companyId)
    const dismissedLeads =
      origin === 'manual'
        ? activeState.dismissedLeads
        : activeState.dismissedLeads.includes(companyId)
          ? activeState.dismissedLeads
          : [...activeState.dismissedLeads, companyId]
    saveExpo(active.id, { leads, dismissedLeads })
  }

  function addProfileFirm() {
    if (!active || !activeState || !profileDraft.trim()) return
    const firm = resolveFirm(companies, profileDraft)
    if (!firm) return
    const profiles = ensureProfile(activeState.profiles, active.year)
    const base = profileOf(profiles, active.year)
    if (
      base.firms.some(
        (f) => f.name === firm.name || (firm.companyId && f.companyId === firm.companyId),
      )
    ) {
      setProfileDraft('')
      return
    }
    const nextProfiles = profiles.map((p) =>
      p.year === active.year ? { ...p, firms: [...base.firms, firm] } : p,
    )
    if (firm.companyId && !activeState.leads.includes(firm.companyId)) {
      saveExpo(active.id, {
        profiles: nextProfiles,
        leads: [...activeState.leads, firm.companyId],
        dismissedLeads: activeState.dismissedLeads.filter((id) => id !== firm.companyId),
      })
    } else {
      saveExpo(active.id, { profiles: nextProfiles })
    }
    setProfileDraft('')
  }

  function removeProfileFirm(firmId: string) {
    if (!currentProfile) return
    updateCurrentProfile({ firms: currentProfile.firms.filter((f) => f.id !== firmId) })
  }

  function bringPrevIntoCurrent() {
    if (!active || !activeState || !lastProfile) return
    const base = profileOf(ensureProfile(activeState.profiles, active.year), active.year)
    const names = new Set(base.firms.map((f) => f.name))
    const merged = [
      ...base.firms,
      ...lastProfile.firms
        .filter((f) => !names.has(f.name))
        .map((f) => ({ ...f, id: f.companyId || uid() })),
    ]
    const harvest =
      base.harvest.trim() ||
      (lastProfile.harvest.trim() ? `（参考 ${lastProfile.year}）${lastProfile.harvest}` : '')
    const leadIds = new Set(activeState.leads)
    for (const f of merged) if (f.companyId) leadIds.add(f.companyId)
    saveExpo(active.id, {
      leads: [...leadIds],
      dismissedLeads: activeState.dismissedLeads.filter((id) => !leadIds.has(id)),
      profiles: ensureProfile(activeState.profiles, active.year).map((p) =>
        p.year === active.year ? { ...p, harvest, firms: merged } : p,
      ),
    })
  }

  const ownerOptions = useMemo(() => {
    const set = new Set<string>(owners)
    for (const e of ranked) {
      const o = getState(expoState, e).owner
      if (o) set.add(o)
    }
    return [...set]
  }, [owners, ranked, expoState])

  const calEvents = useMemo(() => {
    const byDate = new Map<string, RankedExpo[]>()
    const undated: RankedExpo[] = []
    const ranged: Array<{ id: string; start: string; end: string }> = []
    const prefix = `${calYear}-${String(calMonth).padStart(2, '0')}`
    for (const e of filtered) {
      const st = getState(expoState, e)
      if (!st.dateStart) {
        if (e.year === calYear && e.month === calMonth) undated.push(e)
        continue
      }
      const days = eachDate(st.dateStart, st.dateEnd || st.dateStart)
      let hitMonth = false
      for (const d of days) {
        if (d.startsWith(prefix)) {
          hitMonth = true
          const list = byDate.get(d) || []
          if (!list.find((x) => x.id === e.id)) list.push(e)
          byDate.set(d, list)
        }
      }
      if (hitMonth) {
        ranged.push({
          id: e.id,
          start: days.find((d) => d.startsWith(prefix)) || st.dateStart,
          end: [...days].reverse().find((d) => d.startsWith(prefix)) || st.dateEnd || st.dateStart,
        })
      } else if (e.year === calYear && e.month === calMonth) {
        undated.push(e)
      }
    }
    return { byDate, undated, colors: assignEventColors(ranged) }
  }, [filtered, expoState, calYear, calMonth])

  const grid = useMemo(() => buildMonthGrid(calYear, calMonth), [calYear, calMonth])

  /** 本月每一天一列，左右自由滑；一屏大约三天宽 */
  const monthDays = useMemo(() => {
    const daysInMonth = new Date(calYear, calMonth, 0).getDate()
    const out: Array<{ date: string; day: number; weekday: number; events: RankedExpo[] }> = []
    for (let d = 1; d <= daysInMonth; d++) {
      const date = isoFromParts(calYear, calMonth, d)
      out.push({
        date,
        day: d,
        weekday: new Date(`${date}T00:00:00`).getDay(),
        events: calEvents.byDate.get(date) || [],
      })
    }
    return out
  }, [calYear, calMonth, calEvents])

  const boardRef = useRef<HTMLDivElement>(null)
  const dayStripRef = useRef<HTMLDivElement>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)

  useEffect(() => {
    setFocusDate((prev) => {
      const d = new Date(`${prev}T00:00:00`)
      if (d.getFullYear() === calYear && d.getMonth() + 1 === calMonth) return prev
      const inThisMonth = today.startsWith(`${calYear}-${pad2(calMonth)}`)
      return inThisMonth ? today : isoFromParts(calYear, calMonth, 1)
    })
  }, [calYear, calMonth, today])

  function scrollPaneToDate(pane: HTMLDivElement | null, iso: string, center: boolean) {
    if (!pane) return
    const col = pane.querySelector<HTMLElement>(`[data-date="${iso}"]`)
    if (!col) return
    const left = center
      ? col.offsetLeft - (pane.clientWidth - col.offsetWidth) / 2
      : col.offsetLeft
    pane.scrollTo({ left: Math.max(0, left), behavior: 'smooth' })
  }

  useEffect(() => {
    const t = window.setTimeout(() => {
      scrollPaneToDate(boardRef.current, focusDate, false)
      scrollPaneToDate(dayStripRef.current, focusDate, true)
    }, 30)
    return () => window.clearTimeout(t)
  }, [focusDate, monthDays])

  function scrollBoardBy(dir: -1 | 1) {
    const root = boardRef.current
    if (!root) return
    const col = root.querySelector<HTMLElement>('.fs-col')
    const w = col?.offsetWidth || Math.floor(window.innerWidth / 3)
    root.scrollBy({ left: dir * w, behavior: 'smooth' })
  }

  function shiftMonth(delta: number) {
    const d = new Date(calYear, calMonth - 1 + delta, 1)
    setMonthKey(`${d.getFullYear()}-${d.getMonth() + 1}`)
  }

  function goToDate(iso: string) {
    const d = new Date(`${iso}T00:00:00`)
    if (Number.isNaN(d.getTime())) return
    setMonthKey(`${d.getFullYear()}-${d.getMonth() + 1}`)
    setFocusDate(iso)
    setPickerOpen(false)
  }

  function saveDates(id: string, text: string, year: number, month: number) {
    const parsed = parseExpoDates(text, year, month)
    saveExpo(id, {
      dates: text,
      dateStart: parsed.start,
      dateEnd: parsed.end || parsed.start,
    })
  }

  function switchView(next: 'list' | 'calendar') {
    setView(next)
    if (next === 'calendar' && monthKey === '全部') setMonthKey(defaultKey)
  }

  useEffect(() => {
    setLeadDraft('')
    setProfileDraft('')
  }, [activeId])

  const monthCountLabel = num(
    filtered.filter((e) => {
      const st = getState(expoState, e)
      if (!st.dateStart) return e.year === calYear && e.month === calMonth
      return eachDate(st.dateStart, st.dateEnd || st.dateStart).some((d) =>
        d.startsWith(`${calYear}-${String(calMonth).padStart(2, '0')}`),
      )
    }).length,
  )

  function submitNewExpo() {
    const name = newName.trim()
    if (!name) return
    const month = Number(newMonth) || now.getMonth() + 1
    const yearHint =
      monthKey !== '全部' ? Number(String(monthKey).split('-')[0]) : now.getFullYear()
    const parsed = parseExpoDates(newDates, yearHint, month)
    const id = addExpo({
      name,
      city: newCity,
      month,
      venue: newVenue.trim(),
      dateStart: parsed.start || undefined,
      dateEnd: parsed.end || parsed.start || undefined,
    })
    if (parsed.start) {
      saveExpo(id, {
        dates: newDates.trim() || formatDateRange(parsed.start, parsed.end || parsed.start),
        dateStart: parsed.start,
        dateEnd: parsed.end || parsed.start,
      })
    }
    setNewName('')
    setNewVenue('')
    setNewDates('')
    setAddOpen(false)
    setActiveId(id)
    setView('list')
  }

  function removeExpo(id: string) {
    if (!window.confirm('确定删除这场展会？参展名单和建联记录也会一起清掉。')) return
    deleteExpo(id)
    if (activeId === id) setActiveId(null)
  }

  function expoCard(e: RankedExpo) {
    const st = getState(expoState, e)
    return (
      <div key={e.id} className={`expo-card ${activeId === e.id ? 'on' : ''}`}>
        <button type="button" className="expo-card-body" onClick={() => setActiveId(e.id)}>
          <div className="expo-card-top">
            <div className="expo-card-title">{e.name}</div>
            <Badge kind={st.status === 'watch' ? 'todo' : st.status === 'planned' ? 'focus' : 'ok'}>
              {statusLabel(st.status)}
            </Badge>
          </div>
          <div className="expo-card-meta">
            <span>
              {e.city} · {st.dates || `${e.month}月待定`}
            </span>
            <span>{st.owner || '未分配负责人'}</span>
          </div>
          <div className="expo-card-sub">{e.venue || e.groups.slice(0, 2).join(' · ') || '—'}</div>
        </button>
        <button
          type="button"
          className="btn ghost expo-card-del"
          onClick={() => removeExpo(e.id)}
        >
          删除
        </button>
      </div>
    )
  }

  const detail = active && activeState ? (
    <>
      <button
        type="button"
        className="expo-sheet-backdrop cc-mobile-only"
        aria-label="关闭详情"
        onClick={() => setActiveId(null)}
      />
      <aside className="panel expo-detail">
        <div className="panel-h">
          <h2>{active.name}</h2>
          <button
            type="button"
            className="icon-close"
            aria-label="关闭"
            title="关闭"
            onClick={() => setActiveId(null)}
          >
            ×
          </button>
        </div>
        <div className="block" style={{ paddingTop: 0 }}>
          <div className="muted" style={{ marginBottom: 12 }}>
            {active.city} · 常规档期 {active.month} 月 · {active.venue}
          </div>
          <p style={{ marginTop: 0 }}>{active.about}</p>
          <dl className="kv" style={{ marginTop: 14 }}>
            <dt>相关赛道</dt>
            <dd>{active.groups.join('、') || '—'}</dd>
            <dt>信息平台</dt>
            <dd>{active.platforms.join('、') || '—'}</dd>
          </dl>

          <div className="form-row" style={{ marginTop: 16 }}>
            <label>
              状态
              <select
                className="field"
                value={activeState.status}
                onChange={(e) => saveExpo(active.id, { status: e.target.value as ExpoStatus })}
              >
                {EXPO_STATUS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              负责人
              <input
                className="field"
                list="expo-owners"
                placeholder="哪位同事主跟"
                value={activeState.owner}
                onChange={(e) => saveExpo(active.id, { owner: e.target.value })}
              />
              <datalist id="expo-owners">
                {ownerOptions.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            </label>
          </div>
          <div className="form-row one">
            <label>
              具体日期
              <input
                className="field"
                placeholder="例如 2026-07-04 至 07-06"
                value={activeState.dates}
                onChange={(e) => saveDates(active.id, e.target.value, active.year, active.month)}
              />
            </label>
          </div>
          <label className="form-row one">
            备忘 / 复盘
            <textarea
              className="editor"
              placeholder="行前目标、必看展台、会后线索…"
              value={activeState.memo}
              onChange={(e) => saveExpo(active.id, { memo: e.target.value })}
            />
          </label>

          <h3 style={{ marginTop: 18 }}>参展名单</h3>
          <p className="muted" style={{ margin: '0 0 8px', fontSize: 12 }}>
            {active.leadSource
              ? `自动带入来源「${active.leadSource}」的项目，也可手工加减。`
              : '可手工添加现场看到的公司；列表与日历共用这份名单。'}
          </p>
          <div className="toolbar" style={{ marginBottom: 8 }}>
            <input
              className="field grow"
              list="expo-company-names"
              placeholder="输入项目库公司全名后添加"
              value={leadDraft}
              onChange={(e) => setLeadDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addExpoLead()
                }
              }}
            />
            <button type="button" className="btn primary" onClick={addExpoLead}>
              添加
            </button>
          </div>
          {!expoCompanies.length ? (
            <Empty text="还没有挂公司。可从项目库添加，或在下方「展会建联公司」里记现场名字。" />
          ) : (
            <div className="list">
              {expoCompanies.map((c) => (
                <div key={c.id} className="list-item expo-firm-row">
                  <Link to={`/company/${c.id}`} className="expo-firm-main">
                    <div className="title">{c.name}</div>
                    <div className="meta">
                      {c.sector || c.group || '—'}
                      {c.origin !== 'manual' ? ' · 自动' : ''}
                      {c.origin !== 'auto' ? ' · 手工' : ''}
                    </div>
                  </Link>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => removeExpoLead(c.id, c.origin)}
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          )}

          <h3 style={{ marginTop: 22 }}>展会建联公司 · {active.year}</h3>
          <p className="muted" style={{ margin: '0 0 8px', fontSize: 12 }}>
            展会回来写收获与建联公司；可挂项目库，也可只记现场名字。
          </p>
          {lastProfile ? (
            <div className="expo-prev-profile">
              <div className="expo-prev-head">
                <strong>上次 {lastProfile.year}</strong>
                <button type="button" className="btn ghost" onClick={bringPrevIntoCurrent}>
                  带入本次
                </button>
              </div>
              {lastProfile.harvest ? (
                <p className="expo-prev-harvest">{lastProfile.harvest}</p>
              ) : null}
              {lastProfile.firms.length ? (
                <div className="chips" style={{ marginTop: 6 }}>
                  {lastProfile.firms.map((f) =>
                    f.companyId ? (
                      <Link key={f.id} className="chip" to={`/company/${f.companyId}`}>
                        {f.name}
                      </Link>
                    ) : (
                      <span key={f.id} className="chip">
                        {f.name}
                      </span>
                    ),
                  )}
                </div>
              ) : (
                <div className="muted tiny">上次没有记公司。</div>
              )}
            </div>
          ) : (
            <div className="muted tiny" style={{ marginBottom: 8 }}>
              还没有往届建联记录；参展后在这里沉淀，下一届就能对照。
            </div>
          )}
          <label className="form-row one">
            本次收获
            <textarea
              className="editor"
              placeholder="见了谁、看中哪些方向、会后要跟进什么…"
              value={currentProfile?.harvest || ''}
              onChange={(e) => updateCurrentProfile({ harvest: e.target.value })}
            />
          </label>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
            本次公司
          </div>
          <div className="toolbar" style={{ marginBottom: 8 }}>
            <input
              className="field grow"
              list="expo-company-names"
              placeholder="公司名：库内匹配，或直接记现场名字"
              value={profileDraft}
              onChange={(e) => setProfileDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addProfileFirm()
                }
              }}
            />
            <button type="button" className="btn primary" onClick={addProfileFirm}>
              添加
            </button>
          </div>
          {!currentProfile?.firms.length ? (
            <Empty text="本次还没记公司。" />
          ) : (
            <div className="list">
              {currentProfile.firms.map((f) => (
                <div key={f.id} className="list-item expo-firm-row">
                  <div className="expo-firm-main">
                    {f.companyId ? (
                      <Link to={`/company/${f.companyId}`} className="title">
                        {f.name}
                      </Link>
                    ) : (
                      <div className="title">{f.name}</div>
                    )}
                    <div className="meta">{f.companyId ? '项目库' : '现场备注'}</div>
                  </div>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => removeProfileFirm(f.id)}
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          )}
          <datalist id="expo-company-names">
            {companies.slice(0, 800).map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
        </div>
      </aside>
    </>
  ) : null

  return (
    <div className={active ? 'expo-page has-active' : 'expo-page'}>
      <PageHead
        title="展会日历"
        desc="列表看分工，日历看每天有什么展。点进单场可改日期、参展名单和展会建联公司。"
        actions={
          <div className="chips">
            <button className={`chip ${view === 'calendar' ? 'on' : ''}`} onClick={() => switchView('calendar')}>
              日历
            </button>
            <button className={`chip ${view === 'list' ? 'on' : ''}`} onClick={() => switchView('list')}>
              列表
            </button>
          </div>
        }
      />

      {view === 'list' ? (
        <div className="month-tabs">
          <button
            className={`month-tab ${monthKey === '全部' ? 'on' : ''}`}
            onClick={() => setMonthKey('全部')}
          >
            <span className="mt-label">全部</span>
            <span className="mt-count">
              {num(ranked.filter((e) => (city === '全部' ? true : e.city === city)).length)}
            </span>
          </button>
          {months.map(({ year, month }) => {
            const key = `${year}-${month}`
            return (
              <button
                key={key}
                className={`month-tab ${monthKey === key ? 'on' : ''} ${key === defaultKey ? 'now' : ''}`}
                onClick={() => setMonthKey(key)}
              >
                <span className="mt-label">
                  {month}月{year !== now.getFullYear() ? ` '${String(year).slice(2)}` : ''}
                </span>
                <span className="mt-count">{monthCounts.get(key) || 0}</span>
              </button>
            )
          })}
        </div>
      ) : null}

      <div className="expo-filter-bar cc-mobile-only">
        <button
          type="button"
          className={`btn ${filtersOpen ? 'primary' : ''}`}
          onClick={() => setFiltersOpen((v) => !v)}
        >
          筛选{q || city !== '全部' || status !== '全部' || ownerFilter !== '全部' ? ' · 已设' : ''}
        </button>
      </div>
      <div className={`toolbar expo-toolbar${filtersOpen || view === 'list' ? ' is-open' : ''}`}>
        <input
          className="field grow"
          placeholder="搜索展会、场馆、赛道、负责人…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="field" value={city} onChange={(e) => setCity(e.target.value as City | '全部')}>
          {CITIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select
          className="field"
          value={status}
          onChange={(e) => setStatus(e.target.value as '全部' | ExpoStatus)}
        >
          <option value="全部">全部状态</option>
          {EXPO_STATUS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <select className="field" value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
          <option value="全部">全部负责人</option>
          <option value="未分配">未分配</option>
          {ownerOptions.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </div>

      <div className={`expo-layout ${active ? 'with-detail' : ''}`}>
        {view === 'calendar' ? (
          <div className="stack">
            <section className="panel expo-cal-panel">
              <div className="cal-head cc-desktop-only">
                <div className="cal-title">
                  {calYear}年{calMonth}月
                  <span className="muted"> · 本月 {monthCountLabel} 场</span>
                </div>
                <div className="cal-nav">
                  <button type="button" className="btn" onClick={() => shiftMonth(-1)}>
                    上月
                  </button>
                  <button type="button" className="btn" onClick={() => setMonthKey(defaultKey)}>
                    今天
                  </button>
                  <button type="button" className="btn" onClick={() => shiftMonth(1)}>
                    下月
                  </button>
                </div>
              </div>

              <div className="cal-desktop-only">
                <div className="cal-week">
                  {WEEK.map((w) => (
                    <div key={w} className="cal-week-cell">
                      {w}
                    </div>
                  ))}
                </div>
                <div className="cal-grid">
                  {grid.map((cell, i) => {
                    const events = cell.date ? calEvents.byDate.get(cell.date) || [] : []
                    const isToday = cell.date === today
                    return (
                      <div
                        key={cell.date || `pad-${i}`}
                        className={`cal-cell ${cell.inMonth ? '' : 'pad'} ${isToday ? 'today' : ''}`}
                      >
                        {cell.day ? (
                          <div className="cal-day">
                            {cell.day}
                            {isToday ? <span className="cal-today-tag">今天</span> : null}
                          </div>
                        ) : null}
                        <div className="cal-events">
                          {events.slice(0, 4).map((e) => {
                            const st = getState(expoState, e)
                            return (
                              <button
                                key={e.id}
                                className={`cal-pill ${calEvents.colors.get(e.id) || 'c0'} ${activeId === e.id ? 'on' : ''}`}
                                title={`${e.name} · ${e.city}${st.owner ? ` · ${st.owner}` : ''}`}
                                onClick={() => setActiveId(e.id)}
                              >
                                <span className="cal-pill-name">{e.name}</span>
                                <span className="cal-pill-owner">
                                  {e.city}
                                  {st.owner ? ` · ${st.owner}` : ''}
                                </span>
                              </button>
                            )
                          })}
                          {events.length > 4 ? (
                            <div className="cal-more">+{events.length - 4}</div>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="fs-mobile cc-mobile-only">
                <div className="fs-month-bar">
                  <button type="button" className="btn fs-nav-btn" onClick={() => shiftMonth(-1)} aria-label="上月">
                    ‹
                  </button>
                  <button
                    type="button"
                    className="btn fs-date-btn"
                    onClick={() => setPickerOpen((v) => !v)}
                    aria-expanded={pickerOpen}
                  >
                    {calYear}年{calMonth}月
                    <span className="muted"> · {monthCountLabel}场</span>
                    <span className="fs-date-caret">▾</span>
                  </button>
                  <button type="button" className="btn fs-nav-btn" onClick={() => shiftMonth(1)} aria-label="下月">
                    ›
                  </button>
                  <button type="button" className="btn" onClick={() => goToDate(today)}>
                    今天
                  </button>
                </div>

                {pickerOpen ? (
                  <div className="fs-picker">
                    <input
                      className="field"
                      type="date"
                      value={focusDate}
                      onChange={(e) => {
                        if (e.target.value) goToDate(e.target.value)
                      }}
                    />
                  </div>
                ) : null}

                <div className="fs-scroll-clip">
                  <div className="fs-day-strip" ref={dayStripRef}>
                    {monthDays.map(({ date, day, weekday, events }) => (
                      <button
                        key={date}
                        type="button"
                        data-date={date}
                        className={`fs-strip-day ${date === focusDate ? 'on' : ''} ${date === today ? 'today' : ''}`}
                        onClick={() => setFocusDate(date)}
                      >
                        <span className="fs-strip-week">周{WEEK[weekday]}</span>
                        <span className="fs-strip-num">{day}</span>
                        {events.length ? <span className="fs-strip-dot" /> : <span className="fs-strip-dot ghost" />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="fs-scroll-clip">
                  <div className="fs-board" ref={boardRef}>
                    <div className="fs-board-inner">
                      {monthDays.map(({ date, day, weekday, events }) => (
                        <div
                          key={date}
                          data-date={date}
                          className={`fs-col ${date === today ? 'today' : ''} ${date === focusDate ? 'focus' : ''}`}
                        >
                          <div className="fs-col-head">
                            <span className="fs-week">周{WEEK[weekday]}</span>
                            <span className={`fs-day ${date === today ? 'on' : ''}`}>{day}</span>
                          </div>
                          <div className="fs-col-body">
                            {events.length ? (
                              events.map((e) => {
                                const st = getState(expoState, e)
                                return (
                                  <button
                                    key={e.id}
                                    type="button"
                                    className={`fs-event ${calEvents.colors.get(e.id) || 'c0'} ${activeId === e.id ? 'on' : ''}`}
                                    onClick={() => setActiveId(e.id)}
                                  >
                                    <span className="fs-event-name">{e.name}</span>
                                    <span className="fs-event-meta">
                                      {e.city}
                                      {st.owner ? ` · ${st.owner}` : ''}
                                    </span>
                                  </button>
                                )
                              })
                            ) : (
                              <div className="fs-empty">无展</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="fs-board-nav">
                  <button type="button" className="btn" onClick={() => scrollBoardBy(-1)}>
                    ‹ 前一天
                  </button>
                  <button type="button" className="btn" onClick={() => scrollBoardBy(1)}>
                    后一天 ›
                  </button>
                </div>
              </div>
            </section>

            {calEvents.undated.length ? (
              <section className="panel">
                <div className="panel-h">
                  <h2>本月待定日期</h2>
                  <span>{num(calEvents.undated.length)} 场</span>
                </div>
                <div className="list cc-desktop-only">
                  {calEvents.undated.map((e) => (
                    <button key={e.id} className="list-item" onClick={() => setActiveId(e.id)}>
                      <div>
                        <div className="title">
                          {e.name}
                          <span className="muted"> · {e.city}</span>
                        </div>
                        <div className="meta">{e.venue}</div>
                      </div>
                      <div className="side">{getState(expoState, e).owner || '未分配'}</div>
                    </button>
                  ))}
                </div>
                <div className="expo-card-list cc-mobile-only" style={{ padding: '8px 10px 12px' }}>
                  {calEvents.undated.map((e) => expoCard(e))}
                </div>
              </section>
            ) : null}
          </div>
        ) : (
          <div className="panel">
            <div className="panel-h">
              <h2>
                {monthKey === '全部'
                  ? '全部展会'
                  : `${monthKey.split('-')[1]}月 · ${monthKey.split('-')[0]}`}
              </h2>
              <div className="chips">
                <span className="muted">{num(filtered.length)} 场</span>
                <button
                  type="button"
                  className={`btn ${addOpen ? '' : 'primary'}`}
                  onClick={() => setAddOpen((v) => !v)}
                >
                  {addOpen ? '收起' : '添加展会'}
                </button>
              </div>
            </div>
            {addOpen ? (
              <div className="block expo-add-form">
                <div className="form-row">
                  <label>
                    展会名称
                    <input
                      className="field"
                      placeholder="例如：某产业峰会"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                    />
                  </label>
                  <label>
                    城市
                    <select
                      className="field"
                      value={newCity}
                      onChange={(e) => setNewCity(e.target.value as City)}
                    >
                      {CITIES.filter((c): c is City => c !== '全部').map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    月份
                    <select
                      className="field"
                      value={newMonth}
                      onChange={(e) => setNewMonth(e.target.value)}
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                        <option key={m} value={m}>
                          {m} 月
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    场馆
                    <input
                      className="field"
                      placeholder="可选"
                      value={newVenue}
                      onChange={(e) => setNewVenue(e.target.value)}
                    />
                  </label>
                </div>
                <div className="form-row one">
                  <label>
                    具体日期
                    <input
                      className="field"
                      placeholder="可选，例如 2026-07-04 至 07-06"
                      value={newDates}
                      onChange={(e) => setNewDates(e.target.value)}
                    />
                  </label>
                </div>
                <div className="toolbar">
                  <button type="button" className="btn primary" onClick={submitNewExpo}>
                    确认添加
                  </button>
                </div>
              </div>
            ) : null}
            <div className="table-wrap cc-desktop-only">
              <table className="data">
                <colgroup>
                  <col style={{ width: '72px' }} />
                  <col />
                  <col style={{ width: '64px' }} />
                  <col style={{ width: '150px' }} />
                  <col style={{ width: '88px' }} />
                  <col style={{ width: '100px' }} />
                  <col style={{ width: '72px' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>月份</th>
                    <th>展会</th>
                    <th>城市</th>
                    <th>具体日期</th>
                    <th>状态</th>
                    <th>负责人</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => {
                    const st = getState(expoState, e)
                    return (
                      <tr
                        key={e.id}
                        className={activeId === e.id ? 'is-active' : ''}
                        onClick={() => setActiveId(e.id)}
                      >
                        <td>
                          {e.month}月
                          <div className="muted">{e.year}</div>
                        </td>
                        <td>
                          <div className="name-cell">
                            {e.name}
                            <small>{e.groups.slice(0, 2).join(' · ') || e.venue}</small>
                          </div>
                        </td>
                        <td>{e.city}</td>
                        <td className="clamp">{st.dates || '待定'}</td>
                        <td>
                          <Badge
                            kind={
                              st.status === 'watch' ? 'todo' : st.status === 'planned' ? 'focus' : 'ok'
                            }
                          >
                            {statusLabel(st.status)}
                          </Badge>
                        </td>
                        <td className="clamp">{st.owner || '—'}</td>
                        <td>
                          <button
                            type="button"
                            className="btn ghost"
                            onClick={(ev) => {
                              ev.stopPropagation()
                              removeExpo(e.id)
                            }}
                          >
                            删除
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="expo-card-list cc-mobile-only" style={{ padding: '8px 10px 12px' }}>
              {filtered.map((e) => expoCard(e))}
            </div>
            {!filtered.length ? <Empty text="这个筛选条件下没有展会。" /> : null}
          </div>
        )}

        {detail}
      </div>
    </div>
  )
}
