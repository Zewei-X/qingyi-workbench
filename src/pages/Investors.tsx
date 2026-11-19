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

type RawOrg = {
  id: string
  name: string
  blurb: string
  focus?: string[]
  R: string[]
  I: string[]
  deals: RawDeal[]
}

type InvestorData = {
  v: number
  orgCount: number
  dealCount: number
  orgs: RawOrg[]
}

type DealRow = {
  formal: string
  short: string
  date: string
  region: string
  industry: string
  pct: string
  status: string
}

function expandDeals(org: RawOrg): DealRow[] {
  return org.deals.map((d) => ({
    formal: d[0],
    short: d[1] || '',
    date: d[2] || '',
    region: d[3] == null ? '' : org.R[d[3]] || '',
    industry: d[4] == null ? '' : org.I[d[4]] || '',
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

  const deals = useMemo(() => {
    if (!activeOrg) return []
    const rows = expandDeals(activeOrg)
    const query = dealQ.trim().toLowerCase()
    if (!query) return rows
    return rows.filter((d) =>
      [d.formal, d.short, d.region, d.industry, d.date, d.status]
        .join(' ')
        .toLowerCase()
        .includes(query),
    )
  }, [activeOrg, dealQ])

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
        desc={`已收录 ${num(data.orgCount)} 家机构、${num(data.dealCount)} 家历史被投公司（已剔除基金/持股平台）。联系人可后补。`}
        actions={
          <button className="btn primary" onClick={() => setEditing(blankContact())}>
            添加联系人
          </button>
        }
      />

      <div className="toolbar">
        <input
          className="field grow"
          placeholder="搜索机构、联系人…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
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

      <div className="split-list fa-org-layout">
        <div className="side-list">
          {orgRows.map((o) => (
            <button
              key={o.id}
              className={activeOrg.id === o.id ? 'on' : ''}
              onClick={() => {
                setOrgId(o.id)
                setDealQ('')
              }}
            >
              <div className="t">{o.name}</div>
              <div className="s">
                被投 {num(o.deals.length)} · 联系人 {num(o.people.length)}
              </div>
            </button>
          ))}
          {!orgRows.length ? <Empty text="没有匹配的机构。" /> : null}
        </div>

        <div className="panel">
          <div className="panel-h">
            <h2>{activeOrg.name}</h2>
            <span>被投 {num(activeOrg.deals.length)} 家</span>
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
              <h3>联系人</h3>
              <span>{num(people.length)} 人</span>
            </div>
            {people.length ? (
              <div className="table-wrap">
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
            ) : (
              <Empty text="暂无联系人，可点右上角添加。" />
            )}
          </div>

          <div className="investor-section">
            <div className="panel-h investor-subhead">
              <h3>历史被投公司</h3>
              <span>
                {num(deals.length)} / {num(activeOrg.deals.length)}
              </span>
            </div>
            <div className="toolbar investor-deal-toolbar">
              <input
                className="field grow"
                placeholder="在本机构内搜索公司、地区、行业…"
                value={dealQ}
                onChange={(e) => setDealQ(e.target.value)}
              />
            </div>
            <div className="table-wrap investor-deal-table">
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
                    <th>行业</th>
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
                      <td className="clamp">{d.industry || '—'}</td>
                      <td>{d.pct ? `${d.pct}%` : '—'}</td>
                      <td>{d.status || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!deals.length ? <Empty text="没有匹配的被投公司。" /> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
