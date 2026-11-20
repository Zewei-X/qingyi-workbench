import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import { Empty, PageHead } from '../ui'
import { num, uid } from '../lib'
import type { Contact } from '../types'

type RawDeal = [
  string,
  string | null,
  string | null,
  number | null,
  number | null,
  string | null,
  string | null,
]

type TeamMember = { n: string; t: string }

type RawOrg = {
  id: string
  name: string
  blurb: string
  focus?: string[]
  team?: TeamMember[]
  teamSource?: string
  cutoff?: string
  R: string[]
  /** 赛道大类字典（替代原始工商行业） */
  C?: string[]
  /** 兼容旧数据 */
  I?: string[]
  catCounts?: Record<string, number>
  deals: RawDeal[]
}

type InvestorData = {
  v: number
  source?: string
  cutoff?: string
  categories?: string[]
  orgCount: number
  dealCount: number
  orgs: RawOrg[]
}

type DealRow = {
  formal: string
  short: string
  date: string
  region: string
  category: string
  pct: string
  status: string
}

function expandDeals(org: RawOrg): DealRow[] {
  const dict = org.C || org.I || []
  return org.deals.map((d) => ({
    formal: d[0],
    short: d[1] || '',
    date: d[2] || '',
    region: d[3] == null ? '' : org.R[d[3]] || '',
    category: d[4] == null ? '' : dict[d[4]] || '',
    pct: d[5] || '',
    status: d[6] || '',
  }))
}

export default function Investors() {
  const { contacts, saveContact, deleteContact } = useStore()
  const [data, setData] = useState<InvestorData | null>(null)
  const [loadError, setLoadError] = useState('')
  const [q, setQ] = useState('')
  const [dealQ, setDealQ] = useState('')
  const [catFilter, setCatFilter] = useState('全部')
  const [orgId, setOrgId] = useState('')
  const [editing, setEditing] = useState<Contact | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/data/investor-orgs.json')
      .then(async (r) => {
        if (!r.ok) throw new Error(`加载失败 ${r.status}`)
        return r.json() as Promise<InvestorData>
      })
      .then((payload) => {
        if (cancelled) return
        setData(payload)
        setOrgId(payload.orgs[0]?.id || '')
      })
      .catch((e: Error) => {
        if (!cancelled) setLoadError(e.message || '投资机构数据加载失败')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const investorContacts = useMemo(
    () => contacts.filter((c) => c.kind === 'investor'),
    [contacts],
  )

  const orgRows = useMemo(() => {
    if (!data) return []
    const query = q.trim().toLowerCase()
    return data.orgs
      .map((o) => ({
        ...o,
        people: investorContacts.filter((c) => c.companyName === o.name),
      }))
      .filter((o) => {
        if (!query) return true
        if (o.name.toLowerCase().includes(query) || o.id.toLowerCase().includes(query)) return true
        return o.people.some((c) =>
          [c.name, c.wechat, c.via, ...c.phones].join(' ').toLowerCase().includes(query),
        )
      })
  }, [data, investorContacts, q])

  const activeOrg = orgRows.find((o) => o.id === orgId) || orgRows[0]

  const catChips = useMemo(() => {
    if (!activeOrg) return ['全部']
    const counts = activeOrg.catCounts || {}
    const order = data?.categories || activeOrg.C || []
    const keys = order.filter((c) => (counts[c] || 0) > 0)
    // 兜底：若无 catCounts，从当前 deals 统计
    if (!keys.length) {
      const seen = new Set(expandDeals(activeOrg).map((d) => d.category).filter(Boolean))
      return ['全部', ...order.filter((c) => seen.has(c)), ...[...seen].filter((c) => !order.includes(c))]
    }
    return ['全部', ...keys]
  }, [activeOrg, data])

  const deals = useMemo(() => {
    if (!activeOrg) return []
    let rows = expandDeals(activeOrg)
    if (catFilter !== '全部') rows = rows.filter((d) => d.category === catFilter)
    const query = dealQ.trim().toLowerCase()
    if (!query) return rows
    return rows.filter((d) =>
      [d.formal, d.short, d.region, d.category, d.date, d.status]
        .join(' ')
        .toLowerCase()
        .includes(query),
    )
  }, [activeOrg, dealQ, catFilter])

  function blankContact(): Contact {
    return {
      id: uid(),
      kind: 'investor',
      name: '',
      role: '投资机构联系人',
      others: [],
      companyId: null,
      companyName: activeOrg?.name || '',
      phones: [],
      emails: [],
      wechat: '',
      source: '投资机构',
      via: '',
      note: '',
      custom: true,
    }
  }

  function commit() {
    if (!editing || !editing.name.trim()) return
    saveContact({
      ...editing,
      kind: 'investor',
      name: editing.name.trim(),
      companyName: editing.companyName.trim() || activeOrg?.name || '',
      wechat: editing.wechat.trim(),
      phones: editing.phones.filter(Boolean),
      emails: editing.emails.filter(Boolean),
      source: editing.source || '投资机构',
    })
    setEditing(null)
  }

  if (loadError) {
    return (
      <div>
        <PageHead title="投资机构" desc="机构画像与历史被投公司。" />
        <Empty text={loadError} />
      </div>
    )
  }

  if (!data || !activeOrg) {
    return (
      <div>
        <PageHead title="投资机构" desc="机构画像与历史被投公司。" />
        <Empty text="正在载入投资机构…" />
      </div>
    )
  }

  const people = activeOrg.people

  return (
    <div className="investors-page">
      <PageHead
        title="投资机构"
        desc={`来源：${data.source || '融资变更'}。已收录 ${num(data.orgCount)} 家机构；被投仅保留近两年（自 ${data.cutoff || '最近两年'}），共 ${num(data.dealCount)} 家，并按 AI / 机器人 / 消费品等大类归类。`}
        actions={
          <button className="btn primary" onClick={() => setEditing(blankContact())}>
            添加联系人
          </button>
        }
      />

      <div className="toolbar investors-desktop-only">
        <input
          className="field grow"
          placeholder="搜索机构、联系人…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="investors-mobile-picker">
        <label className="investors-mobile-picker-label">
          选择机构
          <select
            className="field"
            value={activeOrg.id}
            onChange={(e) => {
              setOrgId(e.target.value)
              setDealQ('')
              setCatFilter('全部')
            }}
          >
            {(data.orgs || []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}（{o.deals.length}）
              </option>
            ))}
          </select>
        </label>
      </div>

      {editing ? (
        <section className="panel block" style={{ marginBottom: 14 }}>
          <h3>{investorContacts.some((c) => c.id === editing.id) ? '编辑' : '新建'}联系人</h3>
          <div className="form-row">
            <label>
              姓名
              <input
                className="field"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </label>
            <label>
              机构
              <input
                className="field"
                value={editing.companyName}
                onChange={(e) => setEditing({ ...editing, companyName: e.target.value })}
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              微信
              <input
                className="field"
                value={editing.wechat}
                onChange={(e) => setEditing({ ...editing, wechat: e.target.value })}
              />
            </label>
            <label>
              电话
              <input
                className="field"
                value={editing.phones[0] || ''}
                onChange={(e) => setEditing({ ...editing, phones: [e.target.value] })}
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              内部关系人
              <input
                className="field"
                placeholder="哪位同事认识"
                value={editing.via}
                onChange={(e) => setEditing({ ...editing, via: e.target.value })}
              />
            </label>
            <label>
              备注
              <input
                className="field"
                value={editing.note}
                onChange={(e) => setEditing({ ...editing, note: e.target.value })}
              />
            </label>
          </div>
          <div className="page-actions">
            <button className="btn" onClick={() => setEditing(null)}>
              取消
            </button>
            <button className="btn primary" onClick={commit}>
              保存
            </button>
          </div>
        </section>
      ) : null}

      <div className="split-list fa-org-layout investors-layout">
        <div className="side-list investors-desktop-only">
          {orgRows.map((o) => (
            <button
              key={o.id}
              className={activeOrg.id === o.id ? 'on' : ''}
              onClick={() => {
                setOrgId(o.id)
                setDealQ('')
                setCatFilter('全部')
              }}
            >
              <div className="t">{o.name}</div>
              <div className="s">
                近两年 {num(o.deals.length)} · 联系人 {num(o.people.length)}
              </div>
            </button>
          ))}
          {!orgRows.length ? <Empty text="没有匹配的机构。" /> : null}
        </div>

        <div className="panel investors-detail">
          <div className="panel-h">
            <h2>{activeOrg.name}</h2>
            <span>近两年被投 {num(activeOrg.deals.length)} 家</span>
          </div>

          <div className="fa-org-profile">
            <div className="fa-org-profile-label">机构背景</div>
            {activeOrg.focus?.length ? (
              <div className="fa-org-focus">
                {activeOrg.focus.map((tag) => (
                  <span key={tag} className="fa-org-focus-tag">
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
            <p className="fa-org-summary">{activeOrg.blurb}</p>
          </div>

          <div className="investor-section">
            <div className="panel-h investor-subhead">
              <h3>团队</h3>
              <span>{num(activeOrg.team?.length || 0)} 人</span>
            </div>
            {activeOrg.team?.length ? (
              <>
                <div className="investor-team-grid">
                  {activeOrg.team.map((m) => (
                    <div key={`${m.n}-${m.t}`} className="investor-team-card">
                      <div className="investor-team-name">{m.n}</div>
                      <div className="investor-team-title">{m.t}</div>
                    </div>
                  ))}
                </div>
                {activeOrg.teamSource ? (
                  <p className="muted tiny investor-team-source">
                    来源：
                    {/^https?:\/\//.test(activeOrg.teamSource) ? (
                      <a href={activeOrg.teamSource} target="_blank" rel="noreferrer">
                        {activeOrg.teamSource}
                      </a>
                    ) : (
                      activeOrg.teamSource
                    )}
                  </p>
                ) : null}
              </>
            ) : (
              <Empty text="暂无公开团队信息，待补充。" />
            )}
          </div>

          <div className="investor-section">
            <div className="panel-h investor-subhead">
              <h3>联系人</h3>
              <span>{num(people.length)} 人</span>
            </div>
            {people.length ? (
              <>
                <div className="table-wrap investors-desktop-only">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>姓名</th>
                        <th>微信 / 电话</th>
                        <th>内部关系</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {people.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <div className="name-cell">{c.name}</div>
                          </td>
                          <td className="clamp">
                            {[c.wechat, ...c.phones].filter(Boolean).join(' / ') || '—'}
                          </td>
                          <td>{c.via || '—'}</td>
                          <td>
                            <div className="page-actions">
                              <button className="btn ghost" onClick={() => setEditing(c)}>
                                编辑
                              </button>
                              <button className="btn ghost" onClick={() => deleteContact(c.id)}>
                                删除
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="investors-contact-cards">
                  {people.map((c) => (
                    <article key={c.id} className="investor-contact-card">
                      <div className="investor-contact-card-top">
                        <strong>{c.name}</strong>
                        <span>{c.via || '无内部关系'}</span>
                      </div>
                      <div className="muted">
                        {[c.wechat, ...c.phones].filter(Boolean).join(' / ') || '暂无联系方式'}
                      </div>
                      <div className="page-actions">
                        <button className="btn ghost" onClick={() => setEditing(c)}>
                          编辑
                        </button>
                        <button className="btn ghost" onClick={() => deleteContact(c.id)}>
                          删除
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <Empty text="暂无联系人，可点右上角添加。" />
            )}
          </div>

          <div className="investor-section">
            <div className="panel-h investor-subhead">
              <h3>近两年被投公司</h3>
              <span>
                {num(deals.length)} / {num(activeOrg.deals.length)}
              </span>
            </div>
            {catChips.length > 1 ? (
              <div className="chips investor-cat-chips">
                {catChips.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`chip ${catFilter === c ? 'on' : ''}`}
                    onClick={() => setCatFilter(c)}
                  >
                    {c}
                    {c !== '全部' && activeOrg.catCounts?.[c]
                      ? ` ${activeOrg.catCounts[c]}`
                      : c === '全部'
                        ? ` ${activeOrg.deals.length}`
                        : ''}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="toolbar investor-deal-toolbar">
              <input
                className="field grow"
                placeholder="搜索公司、地区、赛道大类…"
                value={dealQ}
                onChange={(e) => setDealQ(e.target.value)}
              />
            </div>

            <div className="table-wrap investor-deal-table investors-desktop-only">
              <table className="data">
                <colgroup>
                  <col style={{ width: '34%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '12%' }} />
                  <col />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '10%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>公司</th>
                    <th>投资日期</th>
                    <th>地区</th>
                    <th>赛道大类</th>
                    <th>持股</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {deals.map((d) => (
                    <tr key={d.formal}>
                      <td>
                        <div className="name-cell">{d.short || d.formal}</div>
                        {d.short ? <div className="muted tiny">{d.formal}</div> : null}
                      </td>
                      <td>{d.date || '—'}</td>
                      <td>{d.region || '—'}</td>
                      <td>
                        <span className="investor-cat-tag">{d.category || '其他'}</span>
                      </td>
                      <td>{d.pct ? `${d.pct}%` : '—'}</td>
                      <td>{d.status || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!deals.length ? <Empty text="没有匹配的被投公司。" /> : null}
            </div>

            <div className="investors-deal-cards">
              {deals.map((d) => (
                <article key={d.formal} className="investor-deal-card">
                  <div className="investor-deal-card-top">
                    <div className="investor-deal-card-title">{d.short || d.formal}</div>
                    <span className="investor-cat-tag">{d.category || '其他'}</span>
                  </div>
                  {d.short ? <div className="muted tiny">{d.formal}</div> : null}
                  <div className="investor-deal-card-meta">
                    <span>{d.date || '日期未知'}</span>
                    <span>{d.region || '地区未知'}</span>
                    <span>{d.pct ? `${d.pct}%` : '持股未知'}</span>
                    <span>{d.status || '状态未知'}</span>
                  </div>
                </article>
              ))}
              {!deals.length ? <Empty text="没有匹配的被投公司。" /> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
