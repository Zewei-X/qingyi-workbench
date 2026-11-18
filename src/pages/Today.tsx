import { Link } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { useStore, EXPOS } from '../store'
import { PageHead, Panel, Empty, StageBadge } from '../ui'
import {
  FOLLOW_UP_DAYS,
  addDays,
  ago,
  daysSince,
  eachDate,
  formatDateRange,
  longToday,
  num,
  rollingMonths,
  shiftDateRange,
  shortDate,
  todayISO,
} from '../lib'
import type { City, Expo } from '../types'

const CITIES: Array<City | '全部'> = ['全部', '北京', '上海', '广州', '深圳']


function expoRange(
  expo: Expo & { year: number },
  expoState: Record<
    string,
    { dateStart?: string; dateEnd?: string; dates?: string; owner?: string; status?: string; attendees?: string }
  >,
) {
  const raw = expoState[expo.id]
  const seedYear = expo.dateStart ? Number(expo.dateStart.slice(0, 4)) : expo.year
  const shifted = shiftDateRange(expo.dateStart, expo.dateEnd || expo.dateStart, expo.year - seedYear)
  const dateStart = raw?.dateStart || shifted.start
  const dateEnd = raw?.dateEnd || shifted.end || dateStart
  return {
    dateStart,
    dateEnd,
    dates: raw?.dates || formatDateRange(dateStart, dateEnd),
    owner: raw?.owner || raw?.attendees || '',
    status: raw?.status || 'watch',
  }
}

export default function Today() {
  const { companies, expoState, todos, addTodo, toggleTodo, updateTodo, deleteTodo } = useStore()
  const today = todayISO()
  const weekEnd = addDays(today, 6)
  const [draft, setDraft] = useState('')
  const [city, setCity] = useState<City | '全部'>('全部')
  const months = rollingMonths(12)

  const dueCC = useMemo(() => {
    return companies
      .filter((c) => {
        if (!c.cc) return false
        if (c.cc.stage === 'dropped' || c.cc.stage === 'talked') return false
        if (c.cc.nextDate) return c.cc.nextDate <= today
        // 未触达 / 已发申请还没建联：都进今日待 CC
        if (c.cc.stage === 'todo' || c.cc.stage === 'reached' || c.cc.stage === 'blocked') return true
        if (!c.cc.lastTouch && !c.cc.appliedAt) return true
        const anchor = c.cc.lastTouch || c.cc.appliedAt
        return (daysSince(anchor) ?? 0) >= FOLLOW_UP_DAYS
      })
      .sort((a, b) => {
        const ao = a.cc?.nextDate || a.cc?.appliedAt || a.cc?.lastTouch || ''
        const bo = b.cc?.nextDate || b.cc?.appliedAt || b.cc?.lastTouch || ''
        return ao.localeCompare(bo)
      })
  }, [companies, today])

  const upcoming = useMemo(() => {
    const ranked = EXPOS.map((e) => {
      const hit = months.find((m) => m.month === e.month) || months[0]
      return { ...e, year: hit.year }
    })
    const hits: Array<{
      expo: (typeof ranked)[number]
      start: string
      end: string
      owner: string
      status: string
    }> = []
    for (const e of ranked) {
      const st = expoRange(e, expoState)
      if (city !== '全部' && e.city !== city) continue
      if (!st.dateStart) continue
      const days = eachDate(st.dateStart, st.dateEnd || st.dateStart)
      const inWindow = days.some((d) => d >= today && d <= weekEnd)
      if (!inWindow) continue
      hits.push({
        expo: e,
        start: st.dateStart,
        end: st.dateEnd || st.dateStart,
        owner: st.owner,
        status: st.status,
      })
    }
    return hits.sort((a, b) => a.start.localeCompare(b.start) || a.expo.name.localeCompare(b.expo.name, 'zh'))
  }, [months, expoState, today, weekEnd, city])

  const openTodos = todos.filter((t) => !t.done)
  const doneTodos = todos.filter((t) => t.done)

  function submitTodo() {
    addTodo(draft)
    setDraft('')
  }

  return (
    <div>
      <PageHead
        title="今日"
        desc={`${longToday()}。看待 CC、近一周活动和自己的待办。`}
        actions={
          <>
            <Link className="btn primary" to="/cc">
              CC 跟进
            </Link>
            <Link className="btn" to="/expos">
              展会日历
            </Link>
          </>
        }
      />

      <div style={{ marginBottom: 14 }}>
        <Panel title="个人待办" extra={`${num(openTodos.length)} 项未完成`}>
          <div className="todo-add">
            <input
              className="field grow"
              placeholder="写下今天要做的事，回车添加"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitTodo()
              }}
            />
            <button className="btn primary" onClick={submitTodo}>
              添加
            </button>
          </div>

          {!todos.length ? (
            <Empty text="还没有待办，先加一条。" />
          ) : (
            <div className="todo-list">
              {openTodos.map((t) => (
                <div key={t.id} className="todo-item">
                  <label className="todo-check">
                    <input type="checkbox" checked={false} onChange={() => toggleTodo(t.id)} />
                    <span className="box" />
                  </label>
                  <input
                    className="todo-text"
                    value={t.text}
                    onChange={(e) => updateTodo(t.id, e.target.value)}
                  />
                  <button className="todo-del" onClick={() => deleteTodo(t.id)} title="删除">
                    ×
                  </button>
                </div>
              ))}
              {doneTodos.length ? (
                <>
                  <div className="todo-done-label">已完成 · {num(doneTodos.length)}</div>
                  {doneTodos.map((t) => (
                    <div key={t.id} className="todo-item done">
                      <label className="todo-check">
                        <input type="checkbox" checked onChange={() => toggleTodo(t.id)} />
                        <span className="box" />
                      </label>
                      <input
                        className="todo-text"
                        value={t.text}
                        onChange={(e) => updateTodo(t.id, e.target.value)}
                      />
                      <button className="todo-del" onClick={() => deleteTodo(t.id)} title="删除">
                        ×
                      </button>
                    </div>
                  ))}
                </>
              ) : null}
            </div>
          )}
        </Panel>
      </div>

      <div className="today-grid">
        <Panel title="待 CC 公司" extra={`${num(dueCC.length)} 家`}>
          {dueCC.length === 0 ? (
            <Empty text="暂时没有需要跟进的 CC。" />
          ) : (
            <div className="list">
              {dueCC.slice(0, 20).map((c) => (
                <Link key={c.id} className="list-item" to={`/company/${c.id}`}>
                  <div>
                    <div className="title">{c.name}</div>
                    <div className="meta">
                      {c.sector || c.group}
                      {c.cc?.owner ? ` · ${c.cc.owner}` : ''}
                      {c.cc?.status ? ` · ${c.cc.status}` : ''}
                    </div>
                  </div>
                  <div className="side">
                    <StageBadge stage={c.cc!.stage} />
                    <div style={{ marginTop: 4 }}>
                      {c.cc?.nextDate
                        ? `应跟 ${shortDate(c.cc.nextDate)}`
                        : c.cc?.lastTouch
                          ? `${ago(c.cc.lastTouch)}触达`
                          : '尚未触达'}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
          {dueCC.length > 20 ? (
            <div className="panel-more">
              <Link to="/cc">查看全部 {num(dueCC.length)} 家 →</Link>
            </div>
          ) : null}
        </Panel>

        <Panel
          title="最近活动"
          extra={
            <span className="panel-extra-row">
              <span>
                今天起 7 天 · {shortDate(today)}–{shortDate(weekEnd)}
              </span>
              <select
                className="field city-filter"
                value={city}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setCity(e.target.value as City | '全部')}
              >
                {CITIES.map((c) => (
                  <option key={c} value={c}>
                    {c === '全部' ? '全部城市' : c}
                  </option>
                ))}
              </select>
            </span>
          }
        >
          {upcoming.length === 0 ? (
            <Empty text={city === '全部' ? '未来七天没有排期中的展会。' : `未来七天没有「${city}」的展会。`} />
          ) : (
            <div className="list">
              {upcoming.map(({ expo, start, end, owner, status }) => (
                <Link key={expo.id} className="list-item" to="/expos">
                  <div>
                    <div className="title">{expo.name}</div>
                    <div className="meta">
                      {expo.city} · {expo.venue}
                      {owner ? ` · ${owner}` : ''}
                    </div>
                  </div>
                  <div className="side">
                    <div>{formatDateRange(start, end)}</div>
                    <div style={{ marginTop: 4 }}>
                      {status === 'planned' ? '计划参加' : status === 'attended' ? '已参加' : '关注中'}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}
