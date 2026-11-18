import { useEffect, useMemo, useState, type FormEvent, type MouseEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { PageHead, StageBadge, Pager, Empty } from '../ui'
import {
  CC_ALL,
  CC_BUCKETS,
  CC_FOCUS,
  CC_TRACKS,
  GROUPS,
  ago,
  ccBucket,
  companyTrack,
  isAppliedWaiting,
  isPriorityFollow,
  needsConnect,
  num,
  shortDate,
  type CCBucket,
} from '../lib'
import type { Company } from '../types'

type Draft = {
  name: string
  group: string
  owner: string
  contact: string
  reason: string
  priorityFollow: boolean
}

const PAGE = 40

function trackList(companies: Company[], extraTracks: string[] = []) {
  const counts = new Map<string, number>()
  for (const t of CC_TRACKS) counts.set(t, 0)
  for (const g of GROUPS) if (!counts.has(g)) counts.set(g, 0)
  for (const t of extraTracks) if (t) counts.set(t, counts.get(t) || 0)
  for (const c of companies) {
    if (!c.cc) continue
    const t = companyTrack(c)
    counts.set(t, (counts.get(t) || 0) + 1)
  }
  const preferred = [...CC_TRACKS]
  const preferredSet = new Set<string>(preferred)
  const rest = [...counts.keys()]
    .filter((k) => !preferredSet.has(k) && k !== '未归类')
    .sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0) || a.localeCompare(b, 'zh'))
  const ungrouped = counts.has('未归类') ? ['未归类'] : []
  return [...preferred, ...rest, ...ungrouped].map((name) => ({ name, count: counts.get(name) || 0 }))
}

function blankDraft(track: string, focusBoard: boolean): Draft {
  const group =
    track !== CC_ALL && track !== CC_FOCUS && track !== '未归类' ? track : CC_TRACKS[0]
  return {
    name: '',
    group,
    owner: '',
    contact: '',
    reason: '',
    priorityFollow: focusBoard,
  }
}

export default function CC() {
  const { companies, owners, addTouch, removeFromCC, addCCCompany, addCCTrack, ccTracks } = useStore()
  const nav = useNavigate()
  const [track, setTrack] = useState<string>(CC_FOCUS)
  const [bucket, setBucket] = useState<CCBucket>('all')
  const [q, setQ] = useState('')
  const [owner, setOwner] = useState('全部')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<Draft>(() => blankDraft(CC_FOCUS, true))
  const [formError, setFormError] = useState('')
  const [addingTrack, setAddingTrack] = useState(false)
  const [trackName, setTrackName] = useState('')
  const [trackError, setTrackError] = useState('')

  const ccList = useMemo(() => companies.filter((c) => c.cc), [companies])
  const priorityList = useMemo(
    () => ccList.filter((c) => isPriorityFollow(c.cc)),
    [ccList],
  )
  const tracks = useMemo(() => trackList(companies, ccTracks), [companies, ccTracks])
  const isAll = track === CC_ALL
  const isFocusBoard = track === CC_FOCUS
  const showTrackCol = isAll || isFocusBoard

  const inTrack = useMemo(() => {
    if (isAll) return ccList
    if (isFocusBoard) return priorityList
    return ccList.filter((c) => companyTrack(c) === track)
  }, [ccList, priorityList, track, isAll, isFocusBoard])

  const bucketCounts = useMemo(() => {
    const map = {
      needConnect: 0,
      untouched: 0,
      applied: 0,
      touched: 0,
      priority: 0,
      all: inTrack.length,
      parked: 0,
    }
    for (const c of inTrack) {
      const cc = c.cc!
      const b = ccBucket(cc)
      if (isPriorityFollow(cc)) map.priority += 1
      if (b === 'parked') map.parked += 1
      else if (b === 'touched') map.touched += 1
      else {
        map.untouched += 1
        if (isAppliedWaiting(cc)) map.applied += 1
        else if (needsConnect(cc)) map.needConnect += 1
      }
    }
    return map
  }, [inTrack])

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    return inTrack.filter((c) => {
      const cc = c.cc!
      const b = ccBucket(cc)
      if (bucket === 'needConnect' && !needsConnect(cc)) return false
      if (bucket === 'untouched' && b !== 'untouched') return false
      if (bucket === 'applied' && !isAppliedWaiting(cc)) return false
      if (bucket === 'touched' && b !== 'touched') return false
      if (bucket === 'priority' && !isPriorityFollow(cc)) return false
      if (owner !== '全部' && (cc.owner || '') !== owner) return false
      if (!query) return true
      return [c.name, cc.status, cc.reason, cc.contact, c.sector, c.group, companyTrack(c)]
        .join(' ')
        .toLowerCase()
        .includes(query)
    })
  }, [inTrack, bucket, owner, q])

  const rows = filtered.slice((page - 1) * PAGE, page * PAGE)
  const pageIds = rows.map((c) => c.id)
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id))
  const somePageSelected = pageIds.some((id) => selected.has(id))

  useEffect(() => {
    setSelected(new Set())
  }, [track, bucket, owner, q])

  function markApplied(c: Company, e: MouseEvent) {
    e.stopPropagation()
    addTouch(c.id, '微信', '已发送微信申请', 'reached')
  }

  function markTouched(c: Company, e: MouseEvent) {
    e.stopPropagation()
    addTouch(c.id, '微信', '已触达 / 已建联', 'connected')
  }

  function markNoContact(c: Company, e: MouseEvent) {
    e.stopPropagation()
    addTouch(c.id, '其他', '未找到联系方式', 'blocked')
  }

  function toggleOne(id: string, e: MouseEvent) {
    e.stopPropagation()
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function togglePage(e: MouseEvent) {
    e.stopPropagation()
    setSelected((prev) => {
      const next = new Set(prev)
      if (allPageSelected) {
        for (const id of pageIds) next.delete(id)
      } else {
        for (const id of pageIds) next.add(id)
      }
      return next
    })
  }

  function deleteSelected() {
    const ids = [...selected]
    if (!ids.length) return
    if (!confirm(`从 CC 列表删除选中的 ${ids.length} 家公司？`)) return
    removeFromCC(ids)
    setSelected(new Set())
  }

  function openAdd() {
    setDraft(blankDraft(track, isFocusBoard))
    setFormError('')
    setAdding(true)
  }

  function submitAdd(e: FormEvent) {
    e.preventDefault()
    if (!draft.name.trim()) {
      setFormError('请填写公司名称')
      return
    }
    const result = addCCCompany({
      name: draft.name,
      group: draft.group,
      owner: draft.owner,
      contact: draft.contact,
      reason: draft.reason,
      priorityFollow: draft.priorityFollow || isFocusBoard,
    })
    if (result.already) {
      setFormError(`「${draft.name.trim()}」已在 CC 列表里`)
      return
    }
    setAdding(false)
    setFormError('')
    setPage(1)
    if (draft.priorityFollow || isFocusBoard) {
      setTrack(CC_FOCUS)
      setBucket('all')
    } else if (draft.group && draft.group !== '未归类') {
      setTrack(draft.group)
      setBucket('all')
    }
  }

  const scopeLabel = isAll ? '总表' : isFocusBoard ? '重点跟进' : track
  const emptyTrack =
    !isAll &&
    !isFocusBoard &&
    (CC_TRACKS as readonly string[]).includes(track) &&
    inTrack.length === 0
  const groupOptions = useMemo(() => {
    const set = new Set<string>([...CC_TRACKS, ...GROUPS, ...ccTracks])
    for (const t of tracks) set.add(t.name)
    return [...set].filter((g) => g !== '未归类').concat('未归类')
  }, [tracks, ccTracks])

  function openAddTrack() {
    setTrackName('')
    setTrackError('')
    setAddingTrack(true)
  }

  function submitTrack(e: FormEvent) {
    e.preventDefault()
    const name = trackName.trim()
    if (!name) {
      setTrackError('请填写赛道名称')
      return
    }
    if (name === CC_ALL || name === CC_FOCUS) {
      setTrackError('名称不可用')
      return
    }
    if (tracks.some((t) => t.name === name) || ccTracks.includes(name)) {
      setTrack(name)
      setAddingTrack(false)
      setPage(1)
      return
    }
    const created = addCCTrack(name)
    if (!created) {
      setTrackError('添加失败')
      return
    }
    setAddingTrack(false)
    setTrack(created)
    setPage(1)
  }

  return (
    <div>
      <PageHead
        title="CC 跟进"
        desc="总表看全部进度；重点跟进汇总各赛道优先公司；左侧进赛道排 CC。还没发申请的在「需建联」，发了但没建联的仍在未触达库。"
        actions={
          <>
            <button type="button" className="btn primary" onClick={openAdd}>
              添加
            </button>
            <Link className="btn" to="/projects">
              从项目库找公司
            </Link>
          </>
        }
      />

      {adding ? (
        <section className="panel block" style={{ marginBottom: 14 }}>
          <div className="panel-h">
            <h2>添加 CC</h2>
            <span>可新建，或把项目库已有公司挂进 CC</span>
          </div>
          <form className="panel-b" onSubmit={submitAdd}>
            <div className="form-row">
              <label>
                公司名称
                <input
                  className="field"
                  value={draft.name}
                  onChange={(e) => {
                    setDraft({ ...draft, name: e.target.value })
                    setFormError('')
                  }}
                  placeholder="例如：某某科技"
                  autoFocus
                />
              </label>
              <label>
                赛道
                <select
                  className="field"
                  value={draft.group}
                  onChange={(e) => setDraft({ ...draft, group: e.target.value })}
                >
                  {groupOptions.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-row">
              <label>
                负责人
                <input
                  className="field"
                  list="cc-owner-list"
                  value={draft.owner}
                  onChange={(e) => setDraft({ ...draft, owner: e.target.value })}
                  placeholder="可选"
                />
                <datalist id="cc-owner-list">
                  {owners.map((o) => (
                    <option key={o} value={o} />
                  ))}
                </datalist>
              </label>
              <label>
                联系方式
                <input
                  className="field"
                  value={draft.contact}
                  onChange={(e) => setDraft({ ...draft, contact: e.target.value })}
                  placeholder="微信 / 电话，可选"
                />
              </label>
            </div>
            <div className="form-row one">
              <label>
                备注
                <input
                  className="field"
                  value={draft.reason}
                  onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
                  placeholder="可选"
                />
              </label>
            </div>
            <label className="cc-select-all" style={{ marginTop: 8, display: 'inline-flex' }}>
              <input
                type="checkbox"
                checked={draft.priorityFollow}
                onChange={(e) => setDraft({ ...draft, priorityFollow: e.target.checked })}
              />
              <span>标为重点跟进</span>
            </label>
            {formError ? <p className="muted" style={{ color: '#b42318', marginTop: 10 }}>{formError}</p> : null}
            <div className="page-actions" style={{ marginTop: 12 }}>
              <button type="submit" className="btn primary">
                加入 CC
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setAdding(false)
                  setFormError('')
                }}
              >
                取消
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <div className="cc-layout">
        <aside className="panel cc-tracks cc-desktop-only">
          <div className="panel-h">
            <h2>赛道</h2>
            <button
              type="button"
              className="cc-track-head-add"
              onClick={openAddTrack}
              title="添加赛道"
              aria-label="添加赛道"
            >
              +
            </button>
          </div>
          <div className="cc-track-list">
            <button
              className={`cc-track ${isAll ? 'on' : ''}`}
              onClick={() => {
                setTrack(CC_ALL)
                setPage(1)
              }}
            >
              <span className="cc-track-name">总表</span>
              <span className="cc-track-count">{num(ccList.length)}</span>
            </button>
            <button
              className={`cc-track ${isFocusBoard ? 'on' : ''}`}
              onClick={() => {
                setTrack(CC_FOCUS)
                setBucket('all')
                setPage(1)
              }}
            >
              <span className="cc-track-name">重点跟进</span>
              <span className="cc-track-count">{num(priorityList.length)}</span>
            </button>
            <div className="cc-track-sep" aria-hidden />
            {tracks.map((t) => (
              <button
                key={t.name}
                className={`cc-track ${track === t.name ? 'on' : ''}`}
                onClick={() => {
                  setTrack(t.name)
                  setPage(1)
                }}
              >
                <span className="cc-track-name">{t.name}</span>
                <span className="cc-track-count">{num(t.count)}</span>
              </button>
            ))}
            {addingTrack ? (
              <form className="cc-track-add-form" onSubmit={submitTrack}>
                <input
                  className="field"
                  value={trackName}
                  onChange={(e) => {
                    setTrackName(e.target.value)
                    setTrackError('')
                  }}
                  placeholder="赛道名称"
                  autoFocus
                />
                {trackError ? <span className="cc-track-add-error">{trackError}</span> : null}
                <div className="cc-track-add-actions">
                  <button type="submit" className="btn primary">
                    确定
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => {
                      setAddingTrack(false)
                      setTrackError('')
                    }}
                  >
                    取消
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        </aside>

        <div className="stack">
          <div className="cc-mobile-only cc-track-select">
            <label>
              <span className="muted">赛道</span>
              <select
                className="field"
                value={track}
                onChange={(e) => {
                  const next = e.target.value
                  setTrack(next)
                  if (next === CC_FOCUS) setBucket('all')
                  setPage(1)
                }}
              >
                <option value={CC_ALL}>总表（{num(ccList.length)}）</option>
                <option value={CC_FOCUS}>重点跟进（{num(priorityList.length)}）</option>
                {tracks.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name}（{num(t.count)}）
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn cc-track-add-btn"
              onClick={openAddTrack}
              title="添加赛道"
              aria-label="添加赛道"
            >
              +
            </button>
          </div>
          {addingTrack ? (
            <form className="cc-mobile-only panel block" style={{ padding: 12 }} onSubmit={submitTrack}>
              <label className="form-row one">
                新赛道
                <input
                  className="field"
                  value={trackName}
                  onChange={(e) => {
                    setTrackName(e.target.value)
                    setTrackError('')
                  }}
                  placeholder="赛道名称"
                  autoFocus
                />
              </label>
              {trackError ? <p className="muted" style={{ color: '#b42318' }}>{trackError}</p> : null}
              <div className="page-actions" style={{ marginTop: 10 }}>
                <button type="submit" className="btn primary">
                  确定
                </button>
                <button type="button" className="btn ghost" onClick={() => setAddingTrack(false)}>
                  取消
                </button>
              </div>
            </form>
          ) : null}

          <div className="chips">
            {CC_BUCKETS.map((b) => (
              <button
                key={b.key}
                className={`chip ${bucket === b.key ? 'on' : ''}`}
                title={b.hint}
                onClick={() => {
                  setBucket(b.key)
                  setPage(1)
                }}
              >
                {b.label} {num(bucketCounts[b.key])}
              </button>
            ))}
          </div>

          <div className="toolbar">
            <input
              className="field grow"
              placeholder={
                showTrackCol
                  ? '搜索公司、赛道、状态、原因…'
                  : `在「${track}」里搜索…`
              }
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setPage(1)
              }}
            />
            <select
              className="field"
              value={owner}
              onChange={(e) => {
                setOwner(e.target.value)
                setPage(1)
              }}
            >
              <option>全部</option>
              {owners.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
            {selected.size > 0 ? (
              <button className="btn" onClick={deleteSelected}>
                删除选中 {num(selected.size)}
              </button>
            ) : null}
          </div>

          <div className="panel">
            <div className="panel-h">
              <h2>
                {scopeLabel} · {CC_BUCKETS.find((b) => b.key === bucket)?.label}
              </h2>
              <span className="cc-panel-meta">
                <label className="cc-select-all">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = !allPageSelected && somePageSelected
                    }}
                    onClick={togglePage}
                    onChange={() => {}}
                    aria-label="全选本页"
                  />
                  <span>{num(filtered.length)} 家</span>
                </label>
              </span>
            </div>

            {emptyTrack ? (
              <Empty text={`「${track}」赛道还没有公司。后续从项目库把公司标进这个赛道后，会出现在未触达库里。`} />
            ) : (
              <>
                <div className="table-wrap cc-desktop-only">
                  <table className="data">
                    <colgroup>
                      <col style={{ width: '36px' }} />
                      <col style={{ width: showTrackCol ? '18%' : '20%' }} />
                      {showTrackCol ? <col style={{ width: '12%' }} /> : null}
                      <col style={{ width: '10%' }} />
                      <col style={{ width: '11%' }} />
                      <col style={{ width: '11%' }} />
                      <col style={{ width: '9%' }} />
                      <col />
                      <col style={{ width: '250px' }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className="check-col">
                          <input
                            type="checkbox"
                            checked={allPageSelected}
                            ref={(el) => {
                              if (el) el.indeterminate = !allPageSelected && somePageSelected
                            }}
                            onClick={togglePage}
                            onChange={() => {}}
                            title="全选本页"
                            aria-label="全选本页"
                          />
                        </th>
                        <th>公司</th>
                        {showTrackCol ? <th>赛道</th> : null}
                        <th>阶段</th>
                        <th>发申请</th>
                        <th>最近触达</th>
                        <th>负责人</th>
                        <th>备注</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((c) => {
                        const cc = c.cc!
                        const b = ccBucket(cc)
                        const on = selected.has(c.id)
                        return (
                          <tr
                            key={c.id}
                            className={on ? 'row-selected' : undefined}
                            onClick={() => nav(`/company/${c.id}`)}
                          >
                            <td className="check-col" onClick={(e) => toggleOne(c.id, e)}>
                              <input
                                type="checkbox"
                                checked={on}
                                onClick={(e) => toggleOne(c.id, e)}
                                onChange={() => {}}
                                aria-label={`选择 ${c.name}`}
                              />
                            </td>
                            <td>
                              <div className="name-cell">
                                {c.name}
                                <small>{c.sector || c.group}</small>
                              </div>
                            </td>
                            {showTrackCol ? <td>{companyTrack(c)}</td> : null}
                            <td>
                              <StageBadge stage={cc.stage} />
                            </td>
                            <td>
                              {cc.appliedAt ? (
                                <>
                                  {shortDate(cc.appliedAt)}
                                  <div className="muted">{ago(cc.appliedAt)}</div>
                                </>
                              ) : (
                                <span className="muted">未发</span>
                              )}
                            </td>
                            <td>
                              {cc.lastTouch && (b === 'touched' || b !== 'untouched') ? (
                                <>
                                  {shortDate(cc.lastTouch)}
                                  <div className="muted">{ago(cc.lastTouch)}</div>
                                </>
                              ) : (
                                <span className="muted">未触达</span>
                              )}
                            </td>
                            <td>{cc.owner || '—'}</td>
                            <td className="clamp">{cc.status || cc.reason || '—'}</td>
                            <td>
                              <div className="page-actions" onClick={(e) => e.stopPropagation()}>
                                {(b === 'untouched' || b === 'parked') && !isAppliedWaiting(cc) ? (
                                  <button className="btn primary" onClick={(e) => markApplied(c, e)}>
                                    已发申请
                                  </button>
                                ) : null}
                                {b === 'untouched' || b === 'parked' ? (
                                  <button className="btn" onClick={(e) => markTouched(c, e)}>
                                    已触达
                                  </button>
                                ) : null}
                                {(b === 'untouched' || b === 'parked') && cc.stage !== 'blocked' ? (
                                  <button className="btn ghost" onClick={(e) => markNoContact(c, e)}>
                                    未找到联系方式
                                  </button>
                                ) : null}
                                {b === 'touched' ? (
                                  <button className="btn ghost" onClick={() => nav(`/company/${c.id}`)}>
                                    写跟进
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="cc-mobile-list cc-mobile-only">
                  {rows.map((c) => {
                    const cc = c.cc!
                    const b = ccBucket(cc)
                    const on = selected.has(c.id)
                    return (
                      <article
                        key={c.id}
                        className={`cc-card${on ? ' on' : ''}`}
                      >
                        <div className="cc-card-top">
                          <label className="cc-card-check" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={on}
                              onClick={(e) => toggleOne(c.id, e)}
                              onChange={() => {}}
                              aria-label={`选择 ${c.name}`}
                            />
                          </label>
                          <button
                            type="button"
                            className="cc-card-main"
                            onClick={() => nav(`/company/${c.id}`)}
                          >
                            <div className="cc-card-title">{c.name}</div>
                            <div className="cc-card-sub">
                              {showTrackCol ? companyTrack(c) : c.sector || c.group || '—'}
                              {cc.owner ? ` · ${cc.owner}` : ''}
                            </div>
                          </button>
                          <StageBadge stage={cc.stage} />
                        </div>
                        <div className="cc-card-meta">
                          <span>
                            申请{' '}
                            {cc.appliedAt ? `${shortDate(cc.appliedAt)}（${ago(cc.appliedAt)}）` : '未发'}
                          </span>
                          <span>
                            触达{' '}
                            {cc.lastTouch && (b === 'touched' || b !== 'untouched')
                              ? `${shortDate(cc.lastTouch)}（${ago(cc.lastTouch)}）`
                              : '未触达'}
                          </span>
                        </div>
                        {cc.status || cc.reason ? (
                          <p className="cc-card-note">{cc.status || cc.reason}</p>
                        ) : null}
                        <div className="cc-card-actions">
                          {(b === 'untouched' || b === 'parked') && !isAppliedWaiting(cc) ? (
                            <button className="btn primary" onClick={(e) => markApplied(c, e)}>
                              已发申请
                            </button>
                          ) : null}
                          {b === 'untouched' || b === 'parked' ? (
                            <button className="btn" onClick={(e) => markTouched(c, e)}>
                              已触达
                            </button>
                          ) : null}
                          {(b === 'untouched' || b === 'parked') && cc.stage !== 'blocked' ? (
                            <button className="btn ghost" onClick={(e) => markNoContact(c, e)}>
                              未找到联系方式
                            </button>
                          ) : null}
                          {b === 'touched' ? (
                            <button className="btn" onClick={() => nav(`/company/${c.id}`)}>
                              写跟进
                            </button>
                          ) : null}
                          <button className="btn ghost" onClick={() => nav(`/company/${c.id}`)}>
                            详情
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </div>

                {!rows.length ? (
                  <Empty
                    text={
                      isFocusBoard
                        ? '重点跟进还是空的。各赛道把公司标为重点跟进后，会汇总到这里。'
                        : bucket === 'priority'
                          ? isAll
                            ? '还没有标为重点跟进的公司。'
                            : '这个赛道还没有重点跟进公司。'
                          : bucket === 'needConnect'
                            ? '暂时没有需要建联的公司。'
                            : bucket === 'untouched'
                              ? isAll
                                ? '未触达库是空的。'
                                : '这个赛道的未触达库是空的。'
                              : '没有符合条件的公司。'
                    }
                  />
                ) : null}
                <div style={{ padding: '0 12px 12px' }}>
                  <Pager page={page} pageSize={PAGE} total={filtered.length} onChange={setPage} />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
