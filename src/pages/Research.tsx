import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../store'
import { PageHead, Empty } from '../ui'
import { num, shortDate, todayISO, uid } from '../lib'
import type { SectorFirm, SectorFirmRole, SectorTrack } from '../types'

function blankTrack(): SectorTrack {
  return {
    id: `track-${uid()}`,
    name: '',
    owner: '',
    thesis: '',
    report: '## 核心判断\n\n',
    source: '',
    updatedAt: todayISO(),
    firms: [],
  }
}

function blankFirm(role: SectorFirmRole): SectorFirm {
  return { id: `firm-${uid()}`, name: '', role, note: '', companyId: null }
}

type ReportBlock =
  | { type: 'h'; text: string }
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'table'; rows: string[][] }

function parseReport(text: string): ReportBlock[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReportBlock[] = []
  let i = 0
  while (i < lines.length) {
    const raw = lines[i]
    const line = raw.trimEnd()
    if (!line.trim()) {
      i += 1
      continue
    }
    if (line.startsWith('## ')) {
      blocks.push({ type: 'h', text: line.slice(3).trim() })
      i += 1
      continue
    }
    if (line.trim().startsWith('|')) {
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const l = lines[i].trim()
        if (!/^\|[\s:\-|]+\|$/.test(l)) {
          rows.push(
            l
              .replace(/^\|/, '')
              .replace(/\|$/, '')
              .split('|')
              .map((c) => c.trim()),
          )
        }
        i += 1
      }
      if (rows.length) blocks.push({ type: 'table', rows })
      continue
    }
    if (line.trim().startsWith('- ')) {
      const items: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('- ')) {
        items.push(lines[i].trim().slice(2))
        i += 1
      }
      blocks.push({ type: 'ul', items })
      continue
    }
    const paras: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].startsWith('## ') &&
      !lines[i].trim().startsWith('|') &&
      !lines[i].trim().startsWith('- ')
    ) {
      paras.push(lines[i])
      i += 1
    }
    blocks.push({ type: 'p', text: paras.join('\n') })
  }
  return blocks
}

/** 极简 Markdown：标题、段落、粗体、列表、表格 —— 按行完整渲染 */
function ReportView({ text }: { text: string }) {
  const blocks = useMemo(() => parseReport(text), [text])
  return (
    <div className="report-body">
      {blocks.map((b, i) => {
        if (b.type === 'h') {
          return (
            <h4 key={i} className="report-h">
              {b.text}
            </h4>
          )
        }
        if (b.type === 'ul') {
          return (
            <ul key={i} className="report-ul">
              {b.items.map((item, j) => (
                <li key={j}>{inline(item)}</li>
              ))}
            </ul>
          )
        }
        if (b.type === 'table') {
          const [head, ...body] = b.rows
          if (!head) return null
          return (
            <table key={i} className="report-table">
              <thead>
                <tr>
                  {head.map((c, j) => (
                    <th key={j}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((r, ri) => (
                  <tr key={ri}>
                    {r.map((c, j) => (
                      <td key={j}>{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
        return (
          <p key={i} className="report-p">
            {b.text.split('\n').map((l, j) => (
              <span key={j}>
                {j > 0 ? <br /> : null}
                {inline(l)}
              </span>
            ))}
          </p>
        )
      })}
    </div>
  )
}

function inline(s: string) {
  const parts = s.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : p,
  )
}

function matchCompanyId(name: string, companies: { id: string; name: string }[]) {
  const n = name.trim().toLowerCase()
  if (!n) return null
  const hit = companies.find((c) => c.name.toLowerCase() === n || c.name.toLowerCase().includes(n) || n.includes(c.name.toLowerCase()))
  return hit?.id || null
}

export default function Research() {
  const { tracks, companies, saveTrack, deleteTrack } = useStore()
  const [activeId, setActiveId] = useState(tracks[0]?.id || '')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<SectorTrack | null>(null)

  useEffect(() => {
    if (!tracks.find((t) => t.id === activeId)) {
      setActiveId(tracks[0]?.id || '')
      setEditing(false)
      setDraft(null)
    }
  }, [tracks, activeId])

  const active = tracks.find((t) => t.id === activeId) || tracks[0]
  const view = editing && draft ? draft : active

  const leaders = view?.firms.filter((f) => f.role === 'leader') || []
  const ccFirms = view?.firms.filter((f) => f.role === 'cc') || []
  const inLibrary = useMemo(() => {
    if (!view) return []
    return companies
      .filter((c) => c.group === view.name || c.sector === view.name)
      .slice(0, 12)
  }, [companies, view])

  function startCreate() {
    const t = blankTrack()
    setDraft(t)
    setActiveId(t.id)
    setEditing(true)
  }

  function startEdit() {
    if (!active) return
    setDraft({
      ...active,
      firms: active.firms.map((f) => ({ ...f })),
    })
    setEditing(true)
  }

  function cancelEdit() {
    const wasNew = draft && !tracks.some((t) => t.id === draft.id)
    setEditing(false)
    setDraft(null)
    if (wasNew) setActiveId(tracks[0]?.id || '')
  }

  function commit() {
    if (!draft) return
    const name = draft.name.trim()
    if (!name) return
    const next: SectorTrack = {
      ...draft,
      name,
      owner: draft.owner.trim(),
      thesis: draft.thesis.trim(),
      report: draft.report.trim(),
      source: draft.source.trim(),
      updatedAt: todayISO(),
      firms: draft.firms
        .map((f) => ({
          ...f,
          name: f.name.trim(),
          note: f.note.trim(),
          companyId: f.companyId || matchCompanyId(f.name, companies),
        }))
        .filter((f) => f.name),
    }
    saveTrack(next)
    setActiveId(next.id)
    setEditing(false)
    setDraft(null)
  }

  function patchDraft(p: Partial<SectorTrack>) {
    setDraft((d) => (d ? { ...d, ...p } : d))
  }

  function patchFirm(id: string, p: Partial<SectorFirm>) {
    setDraft((d) =>
      d
        ? {
            ...d,
            firms: d.firms.map((f) => (f.id === id ? { ...f, ...p } : f)),
          }
        : d,
    )
  }

  function addFirm(role: SectorFirmRole) {
    setDraft((d) => (d ? { ...d, firms: [...d.firms, blankFirm(role)] } : d))
  }

  function removeFirm(id: string) {
    setDraft((d) => (d ? { ...d, firms: d.firms.filter((f) => f.id !== id) } : d))
  }

  function removeTrack() {
    if (!active) return
    if (!confirm(`删除赛道「${active.name}」？`)) return
    deleteTrack(active.id)
    setEditing(false)
    setDraft(null)
  }

  return (
    <div>
      <PageHead
        title="赛道研究"
        desc="研报与 Review 归档；赛道内挂头部公司与需 CC 名单（可不在项目库）。支持新增与编辑。"
        actions={
          <button className="btn primary" onClick={startCreate} disabled={editing}>
            添加赛道
          </button>
        }
      />

      {!tracks.length && !editing ? (
        <Empty text="还没有赛道。点右上角「添加赛道」开始。" />
      ) : (
        <div className="split-list research-layout">
          <div className="side-list">
            {(editing && draft && !tracks.some((t) => t.id === draft.id)
              ? [draft, ...tracks]
              : tracks
            ).map((t) => (
              <button
                key={t.id}
                className={view?.id === t.id ? 'on' : ''}
                disabled={editing && draft?.id !== t.id}
                onClick={() => {
                  if (editing) return
                  setActiveId(t.id)
                }}
              >
                <div className="t">{t.name || '未命名赛道'}</div>
                <div className="s">
                  {t.owner ? `${t.owner} · ` : ''}
                  {t.updatedAt ? shortDate(t.updatedAt) : '草稿'}
                </div>
              </button>
            ))}
          </div>

          {view ? (
            <div className="stack">
              <section className="panel block">
                <div className="research-head">
                  <div className="grow">
                    {editing && draft ? (
                      <div className="form-row" style={{ marginBottom: 10 }}>
                        <label>
                          赛道名称
                          <input
                            className="field"
                            value={draft.name}
                            onChange={(e) => patchDraft({ name: e.target.value })}
                            placeholder="例如：智能健康穿戴"
                          />
                        </label>
                        <label>
                          负责人
                          <input
                            className="field"
                            value={draft.owner}
                            onChange={(e) => patchDraft({ owner: e.target.value })}
                            placeholder="例如：姚远弋"
                          />
                        </label>
                      </div>
                    ) : (
                      <h3 style={{ margin: 0 }}>{view.name}</h3>
                    )}
                    {!editing ? (
                      <div className="muted" style={{ marginTop: 6 }}>
                        {[view.owner, view.source, view.updatedAt ? `更新 ${shortDate(view.updatedAt)}` : '']
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    ) : (
                      <label className="block-label">
                        来源
                        <input
                          className="field"
                          value={draft?.source || ''}
                          onChange={(e) => patchDraft({ source: e.target.value })}
                          placeholder="纪要 / 研报标题与日期"
                        />
                      </label>
                    )}
                  </div>
                  <div className="page-actions">
                    {editing ? (
                      <>
                        <button className="btn primary" onClick={commit}>
                          保存
                        </button>
                        <button className="btn" onClick={cancelEdit}>
                          取消
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="btn" onClick={startEdit}>
                          编辑
                        </button>
                        <button className="btn ghost" onClick={removeTrack}>
                          删除
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="research-thesis">
                  <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                    一句话判断
                  </div>
                  {editing && draft ? (
                    <textarea
                      className="editor"
                      rows={3}
                      value={draft.thesis}
                      onChange={(e) => patchDraft({ thesis: e.target.value })}
                      placeholder="这个赛道现在怎么看…"
                    />
                  ) : (
                    <p>{view.thesis || '（尚未填写）'}</p>
                  )}
                </div>
              </section>

              <section className="panel block">
                <div className="panel-h" style={{ padding: 0, border: 0, marginBottom: 10 }}>
                  <h3 style={{ margin: 0 }}>研报 / Review</h3>
                  <span>{editing ? '支持 ## 标题、- 列表、简易表格' : '正文'}</span>
                </div>
                {editing && draft ? (
                  <textarea
                    className="editor report-editor"
                    value={draft.report}
                    onChange={(e) => patchDraft({ report: e.target.value })}
                  />
                ) : view.report.trim() ? (
                  <ReportView text={view.report} />
                ) : (
                  <Empty text="还没有研报正文，点编辑补充。" />
                )}
              </section>

              <section className="panel block">
                <div className="research-firms-head">
                  <h3 style={{ margin: 0 }}>赛道里的公司</h3>
                  <span className="muted">
                    头部 {num(leaders.length)} · 需 CC {num(ccFirms.length)}
                    {inLibrary.length ? ` · 项目库同名赛道 ${num(inLibrary.length)}` : ''}
                  </span>
                </div>
                <p className="muted research-firms-hint">
                  名单可独立于项目库：头部用于 mapping，需 CC 进行动队列；若名称能匹配库内公司会自动挂链接。
                </p>

                <FirmBlock
                  title="行业头部"
                  hint="国内代表性几家 + 少量顶级海外标杆（标「海外」）"
                  firms={leaders}
                  editing={editing}
                  showOverseas
                  onAdd={() => addFirm('leader')}
                  onPatch={patchFirm}
                  onRemove={removeFirm}
                />
                <FirmBlock
                  title="需 / 待 CC"
                  hint="国内要触达、建联的目标"
                  firms={ccFirms}
                  editing={editing}
                  onAdd={() => addFirm('cc')}
                  onPatch={patchFirm}
                  onRemove={removeFirm}
                />

                {inLibrary.length ? (
                  <div style={{ marginTop: 18 }}>
                    <h4 className="research-subh">项目库里同赛道</h4>
                    <div className="list">
                      {inLibrary.map((c) => (
                        <Link key={c.id} className="list-item" to={`/company/${c.id}`}>
                          <div>
                            <div className="title">{c.name}</div>
                            <div className="meta">{c.sector || c.group}</div>
                          </div>
                          <div className="side">{c.cc ? 'CC' : '库内'}</div>
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

function FirmBlock({
  title,
  hint,
  firms,
  editing,
  showOverseas,
  onAdd,
  onPatch,
  onRemove,
}: {
  title: string
  hint: string
  firms: SectorFirm[]
  editing: boolean
  showOverseas?: boolean
  onAdd: () => void
  onPatch: (id: string, p: Partial<SectorFirm>) => void
  onRemove: (id: string) => void
}) {
  const ordered = showOverseas
    ? [...firms].sort((a, b) => Number(Boolean(a.overseas)) - Number(Boolean(b.overseas)))
    : firms

  return (
    <div className="firm-block">
      <div className="firm-block-h">
        <div>
          <h4 className="research-subh">{title}</h4>
          <div className="muted" style={{ fontSize: 12 }}>
            {hint}
          </div>
        </div>
        {editing ? (
          <button type="button" className="btn" onClick={onAdd}>
            添加
          </button>
        ) : null}
      </div>
      {!ordered.length ? (
        <Empty text={editing ? '还没有，点添加。' : '暂无。'} />
      ) : editing ? (
        <div className="firm-edit-list">
          {ordered.map((f) => (
            <div key={f.id} className={`firm-edit-row ${showOverseas ? 'with-flag' : ''}`}>
              <input
                className="field"
                placeholder="公司名"
                value={f.name}
                onChange={(e) => onPatch(f.id, { name: e.target.value })}
              />
              <input
                className="field grow"
                placeholder="备注"
                value={f.note}
                onChange={(e) => onPatch(f.id, { note: e.target.value })}
              />
              {showOverseas ? (
                <label className="firm-overseas-check">
                  <input
                    type="checkbox"
                    checked={Boolean(f.overseas)}
                    onChange={(e) => onPatch(f.id, { overseas: e.target.checked })}
                  />
                  海外
                </label>
              ) : null}
              <button type="button" className="btn ghost" onClick={() => onRemove(f.id)}>
                删
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="list">
          {ordered.map((f) => {
            const inner = (
              <>
                <div>
                  <div className="title">
                    {f.name}
                    {f.overseas ? <span className="tag-overseas">海外</span> : null}
                  </div>
                  <div className="meta">{f.note || '—'}</div>
                </div>
                <div className="side">{f.companyId ? '库内' : '库外'}</div>
              </>
            )
            return f.companyId ? (
              <Link key={f.id} className="list-item" to={`/company/${f.companyId}`}>
                {inner}
              </Link>
            ) : (
              <div key={f.id} className="list-item static">
                {inner}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
