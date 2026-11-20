import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { PageHead, VerdictBadge, Pager, Empty } from '../ui'
import { GROUPS, VERDICTS, num, shortDate } from '../lib'
import type { Verdict } from '../types'

const PAGE = 40

export default function Projects() {
  const { companies } = useStore()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [group, setGroup] = useState('全部')
  const [verdict, setVerdict] = useState<'全部' | Verdict>('全部')
  const [onlyCC, setOnlyCC] = useState(false)
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    return companies.filter((c) => {
      if (group !== '全部' && c.group !== group) return false
      if (verdict !== '全部' && c.verdict !== verdict) return false
      if (onlyCC && !c.cc) return false
      if (!query) return true
      const bag = [
        c.name,
        c.sector,
        c.founder,
        c.judgment,
        c.source,
        ...(c.events[0]?.investors || []),
      ]
        .join(' ')
        .toLowerCase()
      return bag.includes(query)
    })
  }, [companies, q, group, verdict, onlyCC])

  const rows = filtered.slice((page - 1) * PAGE, page * PAGE)

  return (
    <div>
      <PageHead
        title="项目库"
        desc={`共 ${num(companies.length)} 家公司。按 Excel「总表」沉淀融资事件，点进公司看完整档案与判断。`}
      />

      <div className="toolbar">
        <input
          className="field grow"
          placeholder="搜索公司、赛道、机构、创始人…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setPage(1)
          }}
        />
        <select
          className="field"
          value={group}
          onChange={(e) => {
            setGroup(e.target.value)
            setPage(1)
          }}
        >
          <option>全部</option>
          {GROUPS.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
        <select
          className="field"
          value={verdict}
          onChange={(e) => {
            setVerdict(e.target.value as '全部' | Verdict)
            setPage(1)
          }}
        >
          <option value="全部">全部判断</option>
          {VERDICTS.map((v) => (
            <option key={v.key} value={v.key}>
              {v.label}
            </option>
          ))}
        </select>
        <button
          className={`chip ${onlyCC ? 'on' : ''}`}
          onClick={() => {
            setOnlyCC((v) => !v)
            setPage(1)
          }}
        >
          仅看已进 CC
        </button>
      </div>

      <div className="panel">
        <div className="table-wrap">
          <table className="data">
            <colgroup>
              <col style={{ width: '16%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '10%' }} />
              <col />
              <col style={{ width: '10%' }} />
              <col style={{ width: '7%' }} />
            </colgroup>
            <thead>
              <tr>
                <th>公司</th>
                <th>赛道</th>
                <th>来源</th>
                <th>最近融资</th>
                <th>机构</th>
                <th>判断</th>
                <th>CC</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} onClick={() => nav(`/company/${c.id}`)}>
                  <td>
                    <div className="name-cell">
                      {c.name}
                      {c.founder ? <small>{c.founder}</small> : null}
                    </div>
                  </td>
                  <td>
                    <div>{c.sector || '—'}</div>
                    <div className="muted">{c.group}</div>
                  </td>
                  <td className="muted">{c.source || c.events[0]?.source || c.cc?.source || '—'}</td>
                  <td>{shortDate(c.lastDate)}</td>
                  <td className="clamp">{c.events[0]?.investors.join('、') || '—'}</td>
                  <td>
                    <VerdictBadge verdict={c.verdict} />
                  </td>
                  <td className="muted">{c.cc ? '已进' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length ? <Empty text="没有符合条件的公司。" /> : null}
        </div>
        <div style={{ padding: '0 12px 12px' }}>
          <Pager page={page} pageSize={PAGE} total={filtered.length} onChange={setPage} />
        </div>
      </div>
    </div>
  )
}
