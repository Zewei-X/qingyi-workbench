import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  Company,
  Contact,
  ExpoState,
  Note,
  SectorTrack,
  Stage,
  TodoItem,
  TouchLog,
  Verdict,
} from './types'
import { CONTACTS_SEED_VERSION, EXPOS, FA_CONTACTS, SAMPLE_NOTES } from './seed'
import { SEED_TRACKS, TRACKS_SEED_VERSION } from './researchSeed'
import { addDays, FOLLOW_UP_DAYS, todayISO, uid } from './lib'
import { fetchJsonCached, fetchJsonOptional } from './bootData'
import {
  fetchRemotePersist,
  loadLocalPersist,
  localIsNewer,
  persistNonEmpty,
  putRemotePersist,
  saveLocalPersist,
  slimCompanyOverlay,
  slimPersistData,
  type Persist,
} from './persist'

const SAMPLE_TODOS: TodoItem[] = [
  { id: 'todo-1', text: '过一遍待触达 CC，挑 5 家今天发出去', done: false, createdAt: todayISO() },
  { id: 'todo-2', text: '确认本周展会负责人是否已定', done: false, createdAt: todayISO() },
  { id: 'todo-3', text: '把昨天纪要里的待办挂到对应公司', done: false, createdAt: todayISO() },
]


interface RawFile {
  generatedAt: string
  sourceFile: string
  owners: string[]
  companies: Company[]
}

interface Store {
  ready: boolean
  error: string
  generatedAt: string
  owners: string[]
  companies: Company[]
  logs: TouchLog[]
  notes: Note[]
  contacts: Contact[]
  expoState: Record<string, ExpoState>
  tracks: SectorTrack[]
  /** CC 侧栏自定义赛道（可空表） */
  ccTracks: string[]
  todos: TodoItem[]
  companyMap: Map<string, Company>
  updateCC: (id: string, patch: Partial<NonNullable<Company['cc']>>) => void
  setVerdict: (id: string, verdict: Verdict, judgment?: string) => void
  updateCompany: (id: string, patch: Partial<Company>) => void
  addTouch: (companyId: string, channel: string, text: string, stage?: Stage) => void
  saveNote: (note: Note) => void
  deleteNote: (id: string) => void
  saveContact: (contact: Contact) => void
  deleteContact: (id: string) => void
  saveExpo: (id: string, patch: Partial<ExpoState>) => void
  saveTrack: (track: SectorTrack) => void
  deleteTrack: (id: string) => void
  /** 从 CC 列表移除（本机记住，刷新不回） */
  removeFromCC: (ids: string | string[]) => void
  /** 手动加入 CC；可新建公司，或把项目库已有公司挂上 CC */
  addCCCompany: (input: {
    name: string
    group?: string
    owner?: string
    contact?: string
    reason?: string
    priorityFollow?: boolean
    companyId?: string
  }) => { id: string; created: boolean; already: boolean }
  addCCTrack: (name: string) => string
  addTodo: (text: string) => void
  toggleTodo: (id: string) => void
  updateTodo: (id: string, text: string) => void
  deleteTodo: (id: string) => void
}

const StoreCtx = createContext<Store | null>(null)

function cloneTracks(tracks: SectorTrack[]): SectorTrack[] {
  return tracks.map((t) => ({ ...t, firms: t.firms.map((f) => ({ ...f })) }))
}

function normalizeContact(c: Contact): Contact {
  const kind =
    c.kind ||
    (c.source === '投资机构' || c.role === '投资机构联系人'
      ? 'investor'
      : c.source === 'FA 通讯录' || c.role === 'FA'
        ? 'fa'
        : 'founder')
  return { ...c, kind }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [generatedAt, setGeneratedAt] = useState('')
  const [owners, setOwners] = useState<string[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [logs, setLogs] = useState<TouchLog[]>([])
  const [notes, setNotes] = useState<Note[]>(SAMPLE_NOTES)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [expoState, setExpoState] = useState<Record<string, ExpoState>>({})
  const [tracks, setTracks] = useState<SectorTrack[]>(SEED_TRACKS)
  const [dismissedCcIds, setDismissedCcIds] = useState<string[]>([])
  const [ccTracks, setCcTracks] = useState<string[]>([])
  const [todos, setTodos] = useState<TodoItem[]>(SAMPLE_TODOS)
  const [remoteEnabled, setRemoteEnabled] = useState(false)
  const [remoteVersion, setRemoteVersion] = useState(0)
  const skipSaveRef = useRef(true)
  const dirtyRef = useRef(false)
  const savingRef = useRef(false)
  const saveTimerRef = useRef<number | null>(null)
  const remoteVersionRef = useRef(0)
  const payloadRef = useRef<Persist>({})

  useEffect(() => {
    remoteVersionRef.current = remoteVersion
  }, [remoteVersion])

  const flushRemote = useCallback(async (keepalive = false) => {
    if (!remoteEnabled || skipSaveRef.current) return
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    const payload = payloadRef.current
    if (!persistNonEmpty(payload) && remoteVersionRef.current === 0) return
    savingRef.current = true
    const result = await putRemotePersist(payload, remoteVersionRef.current, { keepalive })
    savingRef.current = false
    if (result.ok) {
      dirtyRef.current = false
      setRemoteVersion(result.version)
      return
    }
    if (result.conflict && !keepalive) {
      // 仅在本机没有未同步改动时跟服务端走；否则先保住本机再下轮合并
      if (!dirtyRef.current) {
        skipSaveRef.current = true
        setRemoteVersion(result.conflict.version)
        window.location.reload()
      }
    }
  }, [remoteEnabled])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const local = loadLocalPersist()
        // 静态库 + D1 并行；静态走 Cache API，二次打开可秒开
        const [raw, contactFile, feishuFile, remote] = await Promise.all([
          fetchJsonCached<RawFile>('/data/workbench.json'),
          fetchJsonOptional<{ companies?: Company[] }>('/data/contact-cc.json'),
          fetchJsonOptional<{ links?: { name: string; feishuUrl: string }[] }>(
            '/data/feishu-company-links.json',
          ),
          fetchRemotePersist(),
        ])
        if (cancelled) return

        const contactExtra = contactFile?.companies || []
        const feishuByName = new Map<string, string>()
        for (const row of feishuFile?.links || []) {
          if (row.name && row.feishuUrl) feishuByName.set(row.name, row.feishuUrl)
        }

        let persist = local
        let version = 0
        let usingRemote = false
        let uploadLater: Persist | null = null
        if (remote) {
          usingRemote = true
          if (localIsNewer(local, remote.updatedAt)) {
            persist = slimPersistData(local)
            version = remote.version
            uploadLater = persist
          } else if (persistNonEmpty(remote.data)) {
            persist = slimPersistData(remote.data)
            version = remote.version
            // 旧胖数据后台收一刀，加快以后同步
            if (
              Object.keys(remote.data.companies || {}).length >
              Object.keys(persist.companies || {}).length
            ) {
              uploadLater = persist
            }
          } else if (persistNonEmpty(local)) {
            persist = slimPersistData(local)
            version = remote.version
            uploadLater = persist
          } else {
            persist = {}
            version = remote.version
          }
        } else {
          persist = slimPersistData(local)
        }

        const dismissed = new Set(persist.dismissedCcIds || [])
        setDismissedCcIds([...dismissed])
        const patchCompany = (c: Company): Company => {
          const patch = persist.companies?.[c.id]
          let base = patch
            ? {
                ...c,
                ...patch,
                cc: c.cc || patch.cc ? ({ ...(c.cc || ({} as Company['cc'])), ...patch.cc } as Company['cc']) : null,
              }
            : c
          if (dismissed.has(c.id)) {
            base = { ...base, cc: null }
          } else if (base.cc && !base.cc.appliedAt && (base.cc.stage === 'reached' || /申请/.test(base.cc.status || ''))) {
            base = { ...base, cc: { ...base.cc, appliedAt: base.cc.lastTouch } }
          }
          if (!base.feishuUrl) {
            const url = feishuByName.get(base.name)
            if (url) base = { ...base, feishuUrl: url }
          }
          return base
        }
        const merged = raw.companies.map(patchCompany)
        const seen = new Set(merged.map((c) => c.id))
        for (const c of contactExtra) {
          if (seen.has(c.id) || dismissed.has(c.id)) continue
          merged.push(patchCompany(c))
          seen.add(c.id)
        }
        for (const [id, patch] of Object.entries(persist.companies || {})) {
          if (seen.has(id) || dismissed.has(id)) continue
          if (!patch.custom || !patch.name) continue
          merged.push(
            patchCompany({
              id,
              name: patch.name,
              sector: patch.sector || '',
              sectorIsClass: false,
              group: patch.group || '未归类',
              founder: patch.founder || '',
              relation: patch.relation || '',
              verdict: patch.verdict || 'none',
              judgment: patch.judgment || '',
              lastDate: patch.lastDate || null,
              events: patch.events || [],
              cc: patch.cc || null,
              feishuUrl: patch.feishuUrl,
              sectorDetailUrl: patch.sectorDetailUrl,
              custom: true,
            }),
          )
          seen.add(id)
        }
        setGeneratedAt(raw.generatedAt)
        setOwners(raw.owners)
        setCompanies(merged)
        setLogs(persist.logs || [])
        setNotes(persist.notes?.length ? persist.notes : SAMPLE_NOTES)
        {
          const foundersKept = (persist.contacts || [])
            .filter((c) => c.kind === 'founder')
            .map(normalizeContact)
          const useFaSeed =
            persist.contactsSeedVersion !== CONTACTS_SEED_VERSION || !persist.contacts?.length
          const faList = useFaSeed
            ? FA_CONTACTS.map((c) => ({ ...c }))
            : persist.contacts!.filter((c) => c.kind === 'fa').map(normalizeContact)
          setContacts([...faList, ...foundersKept])
        }
        setExpoState(persist.expoState || {})
        {
          const useSeed =
            persist.tracksSeedVersion !== TRACKS_SEED_VERSION || persist.tracks === undefined
          setTracks(useSeed ? cloneTracks(SEED_TRACKS) : persist.tracks!)
        }
        setCcTracks(
          Array.from(
            new Set(
              (persist.ccTracks || [])
                .map((t) => t.trim())
                .filter((t) => t && t !== '总表' && t !== '重点跟进'),
            ),
          ),
        )
        setTodos(persist.todos ? persist.todos : SAMPLE_TODOS)
        setRemoteEnabled(usingRemote)
        setRemoteVersion(version)
        skipSaveRef.current = true
        setReady(true)

        // 上传不挡首屏
        if (usingRemote && uploadLater) {
          void putRemotePersist(uploadLater, version).then((uploaded) => {
            if (!cancelled && uploaded.ok) setRemoteVersion(uploaded.version)
          })
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '加载失败')
          setReady(true)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!ready || error) return
    const payload: Persist = {
      companies: slimCompanyOverlay(companies),
      logs,
      notes,
      contacts,
      expoState,
      tracks,
      tracksSeedVersion: TRACKS_SEED_VERSION,
      contactsSeedVersion: CONTACTS_SEED_VERSION,
      dismissedCcIds,
      ccTracks,
      todos,
    }
    payloadRef.current = payload
    // 本机立刻落盘：刷新也不会丢
    saveLocalPersist(payload)
    if (skipSaveRef.current) {
      skipSaveRef.current = false
      dirtyRef.current = false
      return
    }
    dirtyRef.current = true
    if (!remoteEnabled) return
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      void flushRemote(false)
    }, 200)
  }, [
    ready,
    error,
    remoteEnabled,
    companies,
    logs,
    notes,
    contacts,
    expoState,
    tracks,
    dismissedCcIds,
    ccTracks,
    todos,
    flushRemote,
  ])

  useEffect(() => {
    if (!ready || !remoteEnabled) return
    const pull = async () => {
      if (dirtyRef.current || savingRef.current) return
      const remote = await fetchRemotePersist()
      if (!remote) return
      if (remote.version > remoteVersionRef.current) {
        skipSaveRef.current = true
        setRemoteVersion(remote.version)
        window.location.reload()
      }
    }
    const onFocus = () => {
      void pull()
    }
    const onHide = () => {
      if (dirtyRef.current) void flushRemote(true)
    }
    const onVis = () => {
      if (document.visibilityState === 'hidden') onHide()
    }
    window.addEventListener('focus', onFocus)
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onVis)
    const timer = window.setInterval(() => {
      void pull()
    }, 20000)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('visibilitychange', onVis)
      window.clearInterval(timer)
      if (dirtyRef.current) void flushRemote(true)
    }
  }, [ready, remoteEnabled, flushRemote])

  const companyMap = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies])

  const updateCC = useCallback((id: string, patch: Partial<NonNullable<Company['cc']>>) => {
    setCompanies((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c
        const base = c.cc || {
          stage: 'todo' as Stage,
          status: '',
          lastTouch: null,
          channels: [],
          reason: '',
          reasonKind: '',
          owner: null,
          contact: '',
          people: [],
          phones: [],
          emails: [],
          direct: null,
          source: '手动',
        }
        return { ...c, cc: { ...base, ...patch } }
      }),
    )
  }, [])

  const setVerdict = useCallback((id: string, verdict: Verdict, judgment?: string) => {
    setCompanies((prev) =>
      prev.map((c) => (c.id === id ? { ...c, verdict, judgment: judgment ?? c.judgment } : c)),
    )
  }, [])

  const updateCompany = useCallback((id: string, patch: Partial<Company>) => {
    setCompanies((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }, [])

  const addTouch = useCallback((companyId: string, channel: string, text: string, stage?: Stage) => {
    const date = todayISO()
    const nextStage = stage || 'reached'
    setLogs((prev) => [
      { id: uid(), companyId, date, channel, text, stage: nextStage },
      ...prev,
    ])
    setCompanies((prev) =>
      prev.map((c) => {
        if (c.id !== companyId || !c.cc) return c
        const applying = nextStage === 'reached' || /申请/.test(channel + text)
        const touched = nextStage === 'connected' || nextStage === 'talked'
        return {
          ...c,
          cc: {
            ...c.cc,
            stage: nextStage,
            appliedAt: applying ? c.cc.appliedAt || date : c.cc.appliedAt,
            lastTouch: touched || (!applying && nextStage !== 'todo') ? date : c.cc.lastTouch,
            nextDate: addDays(date, FOLLOW_UP_DAYS),
            channels: Array.from(new Set([channel, ...c.cc.channels].filter(Boolean))),
            status: text || c.cc.status,
          },
        }
      }),
    )
  }, [])

  const saveNote = useCallback((note: Note) => {
    setNotes((prev) => {
      const i = prev.findIndex((n) => n.id === note.id)
      if (i >= 0) {
        const next = [...prev]
        next[i] = note
        return next
      }
      return [note, ...prev]
    })
  }, [])

  const deleteNote = useCallback((id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id))
  }, [])

  const saveContact = useCallback((contact: Contact) => {
    setContacts((prev) => {
      const i = prev.findIndex((c) => c.id === contact.id)
      if (i >= 0) {
        const next = [...prev]
        next[i] = contact
        return next
      }
      return [contact, ...prev]
    })
  }, [])

  const deleteContact = useCallback((id: string) => {
    setContacts((prev) => prev.filter((c) => c.id !== id))
  }, [])

  const saveExpo = useCallback((id: string, patch: Partial<ExpoState>) => {
    setExpoState((prev) => {
      const raw = prev[id] as (ExpoState & { attendees?: string }) | undefined
      const current: ExpoState = {
        status: raw?.status || 'watch',
        dates: raw?.dates || '',
        dateStart: raw?.dateStart || '',
        dateEnd: raw?.dateEnd || '',
        owner: raw?.owner || raw?.attendees || '',
        memo: raw?.memo || '',
        leads: raw?.leads || [],
      }
      return { ...prev, [id]: { ...current, ...patch } }
    })
  }, [])

  const saveTrack = useCallback((track: SectorTrack) => {
    setTracks((prev) => {
      const i = prev.findIndex((t) => t.id === track.id)
      if (i >= 0) {
        const next = [...prev]
        next[i] = track
        return next
      }
      return [track, ...prev]
    })
  }, [])

  const deleteTrack = useCallback((id: string) => {
    setTracks((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const removeFromCC = useCallback((ids: string | string[]) => {
    const set = new Set(Array.isArray(ids) ? ids : [ids])
    if (!set.size) return
    setDismissedCcIds((prev) => {
      const next = [...prev]
      for (const id of set) if (!next.includes(id)) next.push(id)
      return next
    })
    setCompanies((prev) =>
      prev
        .map((c) => (set.has(c.id) ? { ...c, cc: null } : c))
        .filter((c) => !(set.has(c.id) && c.custom && !c.events.length)),
    )
  }, [])

  const addCCCompany = useCallback(
    (input: {
      name: string
      group?: string
      owner?: string
      contact?: string
      reason?: string
      priorityFollow?: boolean
      companyId?: string
    }) => {
      const name = input.name.trim()
      if (!name) return { id: '', created: false, already: false }

      const blankCc = (): NonNullable<Company['cc']> => ({
        stage: 'todo',
        status: '',
        lastTouch: null,
        appliedAt: null,
        channels: [],
        reason: input.reason?.trim() || '',
        reasonKind: '',
        owner: input.owner?.trim() || null,
        contact: input.contact?.trim() || '',
        people: [],
        phones: [],
        emails: [],
        direct: null,
        source: '手动',
        priorityFollow: Boolean(input.priorityFollow),
      })

      let hit =
        (input.companyId && companies.find((c) => c.id === input.companyId)) ||
        companies.find((c) => c.name === name)

      if (hit?.cc) {
        return { id: hit.id, created: false, already: true }
      }

      if (hit) {
        const id = hit.id
        setDismissedCcIds((prev) => prev.filter((x) => x !== id))
        setCompanies((prev) =>
          prev.map((c) => {
            if (c.id !== id) return c
            const group = input.group?.trim()
            return {
              ...c,
              group: group || c.group,
              sector: group && !c.sector ? group : c.sector,
              cc: blankCc(),
            }
          }),
        )
        return { id, created: false, already: false }
      }

      const id = `cc-${uid()}`
      const group = input.group?.trim() || '未归类'
      const created: Company = {
        id,
        name,
        sector: group === '未归类' ? '' : group,
        sectorIsClass: false,
        group,
        founder: '',
        relation: '',
        verdict: 'none',
        judgment: '',
        lastDate: null,
        events: [],
        cc: blankCc(),
        custom: true,
      }
      setCompanies((prev) => [created, ...prev])
      return { id, created: true, already: false }
    },
    [companies],
  )

  const addCCTrack = useCallback((name: string) => {
    const t = name.trim()
    if (!t || t === '总表' || t === '重点跟进') return ''
    setCcTracks((prev) => (prev.includes(t) ? prev : [...prev, t]))
    return t
  }, [])

  const addTodo = useCallback((text: string) => {
    const t = text.trim()
    if (!t) return
    setTodos((prev) => [{ id: uid(), text: t, done: false, createdAt: todayISO() }, ...prev])
  }, [])

  const toggleTodo = useCallback((id: string) => {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)))
  }, [])

  const updateTodo = useCallback((id: string, text: string) => {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, text } : t)))
  }, [])

  const deleteTodo = useCallback((id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const value: Store = {
    ready,
    error,
    generatedAt,
    owners,
    companies,
    logs,
    notes,
    contacts,
    expoState,
    tracks,
    ccTracks,
    todos,
    companyMap,
    updateCC,
    setVerdict,
    updateCompany,
    addTouch,
    saveNote,
    deleteNote,
    saveContact,
    deleteContact,
    saveExpo,
    saveTrack,
    deleteTrack,
    removeFromCC,
    addCCCompany,
    addCCTrack,
    addTodo,
    toggleTodo,
    updateTodo,
    deleteTodo,
  }

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}

export function useStore() {
  const ctx = useContext(StoreCtx)
  if (!ctx) throw new Error('useStore outside provider')
  return ctx
}

export { EXPOS }
