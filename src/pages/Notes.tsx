import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../store'
import { PageHead, Empty } from '../ui'
import { shortDate, todayISO, uid } from '../lib'
import type { Note } from '../types'

export default function Notes() {
  const { notes, companies, saveNote, deleteNote } = useStore()
  const [kind, setKind] = useState<'全部' | 'meeting' | 'chat'>('全部')
  const [activeId, setActiveId] = useState(notes[0]?.id || '')
  const [draftLink, setDraftLink] = useState('')

  const filtered = useMemo(
    () => notes.filter((n) => (kind === '全部' ? true : n.kind === kind)),
    [notes, kind],
  )
  const active = filtered.find((n) => n.id === activeId) || filtered[0]

  function create(kind: Note['kind']) {
    const note: Note = {
      id: uid(),
      kind,
      title: kind === 'meeting' ? '新会议纪要' : '新群聊摘要',
      date: todayISO(),
      source: kind === 'meeting' ? '飞书会议' : '飞书群聊',
      body: '摘要\n\n要点\n- \n\n待办\n- ',
      companyIds: [],
    }
    saveNote(note)
    setActiveId(note.id)
  }

  function linkCompany() {
    if (!active || !draftLink.trim()) return
    const hit = companies.find((c) => c.name === draftLink.trim() || c.id === draftLink.trim())
    if (!hit) return
    if (active.companyIds.includes(hit.id)) return
    saveNote({ ...active, companyIds: [...active.companyIds, hit.id] })
    setDraftLink('')
  }

  return (
    <div>
      <PageHead
        title="飞书纪要"
        desc="会议妙记与群聊摘要先落在这里，并挂到相关公司。飞书同步接通前，可手工粘贴或改示例。"
        actions={
          <>
            <button className="btn" onClick={() => create('chat')}>
              新建群聊摘要
            </button>
            <button className="btn primary" onClick={() => create('meeting')}>
              新建会议纪要
            </button>
          </>
        }
      />

      <div className="chips" style={{ marginBottom: 14 }}>
        {(['全部', 'meeting', 'chat'] as const).map((k) => (
          <button key={k} className={`chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>
            {k === '全部' ? '全部' : k === 'meeting' ? '会议纪要' : '群聊摘要'}
          </button>
        ))}
      </div>

      {!filtered.length ? (
        <Empty text="还没有纪要。" />
      ) : (
        <div className="split-list">
          <div className="side-list">
            {filtered.map((n) => (
              <button
                key={n.id}
                className={active?.id === n.id ? 'on' : ''}
                onClick={() => setActiveId(n.id)}
              >
                <div className="t">
                  {n.title}
                  {n.sample ? ' · 示例' : ''}
                </div>
                <div className="s">
                  {n.kind === 'meeting' ? '会议' : '群聊'} · {shortDate(n.date)}
                </div>
              </button>
            ))}
          </div>

          {active ? (
            <div className="stack">
              <section className="panel block">
                <div className="form-row">
                  <label>
                    标题
                    <input
                      className="field"
                      value={active.title}
                      onChange={(e) => saveNote({ ...active, title: e.target.value })}
                    />
                  </label>
                  <label>
                    日期
                    <input
                      className="field"
                      type="date"
                      value={active.date}
                      onChange={(e) => saveNote({ ...active, date: e.target.value })}
                    />
                  </label>
                </div>
                <div className="form-row one">
                  <label>
                    来源
                    <input
                      className="field"
                      value={active.source}
                      onChange={(e) => saveNote({ ...active, source: e.target.value })}
                    />
                  </label>
                </div>
                <label className="form-row one">
                  正文
                  <textarea
                    className="editor"
                    style={{ minHeight: 280 }}
                    value={active.body}
                    onChange={(e) => saveNote({ ...active, body: e.target.value })}
                  />
                </label>
                <div className="page-actions">
                  <button className="btn" onClick={() => deleteNote(active.id)}>
                    删除
                  </button>
                </div>
              </section>

              <section className="panel block">
                <h3>关联公司</h3>
                <div className="toolbar">
                  <input
                    className="field grow"
                    list="company-names"
                    placeholder="输入公司全名后添加"
                    value={draftLink}
                    onChange={(e) => setDraftLink(e.target.value)}
                  />
                  <datalist id="company-names">
                    {companies.slice(0, 800).map((c) => (
                      <option key={c.id} value={c.name} />
                    ))}
                  </datalist>
                  <button className="btn primary" onClick={linkCompany}>
                    添加
                  </button>
                </div>
                {!active.companyIds.length ? (
                  <Empty text="还没有关联公司。" />
                ) : (
                  <div className="list">
                    {active.companyIds.map((id) => {
                      const c = companies.find((x) => x.id === id)
                      if (!c) return null
                      return (
                        <div key={id} className="list-item">
                          <Link to={`/company/${id}`} className="title">
                            {c.name}
                          </Link>
                          <button
                            className="btn ghost"
                            onClick={() =>
                              saveNote({
                                ...active,
                                companyIds: active.companyIds.filter((x) => x !== id),
                              })
                            }
                          >
                            移除
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
