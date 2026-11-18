import { Link, useParams } from 'react-router-dom'
import { useMemo } from 'react'
import { useStore } from '../store'
import { PageHead, StageBadge, VerdictBadge, Empty } from '../ui'
import { CC_TRACKS, GROUPS, STAGES, VERDICTS, companyTrack, shortDate, todayISO } from '../lib'
import type { Stage, Verdict } from '../types'

export default function Company() {
  const { id = '' } = useParams()
  const { companyMap, notes, contacts, owners, updateCC, setVerdict, updateCompany, ccTracks } =
    useStore()
  const company = companyMap.get(id)

  const companyNotes = useMemo(() => notes.filter((n) => n.companyIds.includes(id)), [notes, id])
  const companyContacts = useMemo(
    () => contacts.filter((c) => c.companyId === id),
    [contacts, id],
  )
  const trackOptions = useMemo(() => {
    const current = company ? companyTrack(company) : ''
    const set = new Set<string>([...CC_TRACKS, ...GROUPS, ...ccTracks])
    if (current) set.add(current)
    return [...set].filter((g) => g !== '未归类').concat('未归类')
  }, [company, ccTracks])

  if (!company) {
    return (
      <div className="boot-error">
        <div>
          <h1>找不到这家公司</h1>
          <p>
            <Link to="/projects">返回项目库</Link>
          </p>
        </div>
      </div>
    )
  }

  const cc = company.cc

  return (
    <div>
      <PageHead
        title={company.name}
        desc={[company.group, company.sector, company.founder].filter(Boolean).join(' · ')}
        actions={
          <>
            <Link className="btn" to="/projects">
              项目库
            </Link>
            {cc ? (
              <Link className="btn" to="/cc">
                CC 跟进
              </Link>
            ) : null}
          </>
        }
      />

      <div className="detail">
        <div className="stack">
          <section className="panel block">
            <h3>判断与关系</h3>
            <div className="form-row">
              <label>
                赛道
                <select
                  className="field"
                  value={companyTrack(company)}
                  onChange={(e) => {
                    const group = e.target.value
                    updateCompany(company.id, {
                      group,
                      sector: company.sectorIsClass ? company.sector : group === '未归类' ? company.sector : group,
                    })
                  }}
                >
                  {trackOptions.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                判断
                <select
                  className="field"
                  value={company.verdict}
                  onChange={(e) => setVerdict(company.id, e.target.value as Verdict)}
                >
                  {VERDICTS.map((v) => (
                    <option key={v.key} value={v.key}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-row">
              <label>
                当前标记
                <div style={{ paddingTop: 8 }}>
                  <VerdictBadge verdict={company.verdict} />
                  {company.relation ? (
                    <span style={{ marginLeft: 8 }} className="muted">
                      {company.relation}
                    </span>
                  ) : null}
                </div>
              </label>
            </div>
            <label className="form-row one">
              判断原文 / 备注
              <textarea
                className="editor"
                value={company.judgment}
                onChange={(e) => setVerdict(company.id, company.verdict, e.target.value)}
              />
            </label>
          </section>

          <section className="panel block">
            <h3>融资事件</h3>
            {!company.events.length ? (
              <Empty text="项目库里没有这家公司的融资事件（可能只出现在 CC 表）。" />
            ) : (
              company.events.map((e, i) => (
                <div className="event" key={`${e.date}-${i}`}>
                  <div className="when">
                    {shortDate(e.date)} · {e.source || '来源未知'}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    {(e.investors.length ? e.investors.join('、') : '机构未披露')}
                    {e.sector ? ` · ${e.sector}` : ''}
                  </div>
                </div>
              ))
            )}
          </section>

          <section className="panel block">
            <h3>公司详情</h3>
            <p className="muted" style={{ margin: '0 0 12px', fontSize: 13 }}>
              用于挂飞书项目文档 / 知识库，后续可在此跳转或嵌入。
            </p>
            <label className="form-row one">
              飞书链接
              <div className="feishu-row">
                <input
                  className="field grow"
                  type="url"
                  placeholder="粘贴飞书文档或知识库链接…"
                  value={company.feishuUrl || ''}
                  onChange={(e) => updateCompany(company.id, { feishuUrl: e.target.value.trim() })}
                />
                {company.feishuUrl ? (
                  <a className="btn" href={company.feishuUrl} target="_blank" rel="noreferrer">
                    打开飞书
                  </a>
                ) : (
                  <button className="btn" type="button" disabled title="先填入链接">
                    打开飞书
                  </button>
                )}
              </div>
            </label>
            {!company.feishuUrl ? (
              <Empty text="还没有飞书链接。有项目文档后贴进来即可。" />
            ) : null}
          </section>

          <section className="panel block">
            <h3>赛道详情</h3>
            <p className="muted" style={{ margin: '0 0 12px', fontSize: 13 }}>
              挂赛道研报 / 文档链接，有了再贴进来。
            </p>
            <label className="form-row one">
              链接
              <div className="feishu-row">
                <input
                  className="field grow"
                  type="url"
                  placeholder="粘贴赛道详情链接…"
                  value={company.sectorDetailUrl || ''}
                  onChange={(e) =>
                    updateCompany(company.id, { sectorDetailUrl: e.target.value.trim() })
                  }
                />
                {company.sectorDetailUrl ? (
                  <a
                    className="btn"
                    href={company.sectorDetailUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    打开
                  </a>
                ) : (
                  <button className="btn" type="button" disabled title="先填入链接">
                    打开
                  </button>
                )}
              </div>
            </label>
            {!company.sectorDetailUrl ? (
              <Empty text="还没有赛道详情链接，有了再贴。" />
            ) : null}
          </section>
        </div>

        <div className="stack">
          <section className="panel block">
            <h3>CC 状态</h3>
            {!cc ? (
              <Empty text="未列入 CC。" />
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <StageBadge stage={cc.stage} />
                  {cc.priorityFollow ? <span className="badge reached">重点跟进</span> : null}
                  {cc.channels.map((c) => (
                    <span className="badge" key={c}>
                      {c}
                    </span>
                  ))}
                </div>
                <label className="cc-select-all" style={{ marginBottom: 12, display: 'inline-flex' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(cc.priorityFollow)}
                    onChange={(e) => updateCC(company.id, { priorityFollow: e.target.checked })}
                  />
                  <span>标为重点跟进</span>
                  <span className="muted" style={{ marginLeft: 4, fontSize: 12 }}>
                    （汇总到 CC「重点跟进」）
                  </span>
                </label>
                <dl className="kv">
                  <dt>原始状态</dt>
                  <dd>{cc.status || '—'}</dd>
                  <dt>发申请</dt>
                  <dd>
                    <input
                      className="field"
                      type="date"
                      value={cc.appliedAt || ''}
                      onChange={(e) => updateCC(company.id, { appliedAt: e.target.value || null })}
                    />
                  </dd>
                  <dt>最近触达</dt>
                  <dd>
                    <input
                      className="field"
                      type="date"
                      value={cc.lastTouch || ''}
                      onChange={(e) => updateCC(company.id, { lastTouch: e.target.value || null })}
                    />
                  </dd>
                  <dt>下次跟进</dt>
                  <dd>
                    <input
                      className="field"
                      type="date"
                      value={cc.nextDate || ''}
                      onChange={(e) => updateCC(company.id, { nextDate: e.target.value || null })}
                    />
                  </dd>
                  <dt>阶段</dt>
                  <dd>
                    <select
                      className="field"
                      value={cc.stage}
                      onChange={(e) => updateCC(company.id, { stage: e.target.value as Stage })}
                    >
                      {STAGES.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </dd>
                  <dt>负责人</dt>
                  <dd>
                    <select
                      className="field"
                      value={cc.owner || ''}
                      onChange={(e) => updateCC(company.id, { owner: e.target.value || null })}
                    >
                      <option value="">未分配</option>
                      {owners.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                      {cc.owner && !owners.includes(cc.owner) ? (
                        <option value={cc.owner}>{cc.owner}</option>
                      ) : null}
                    </select>
                  </dd>
                  <dt>原因</dt>
                  <dd>{cc.reason || '—'}</dd>
                  <dt>来源</dt>
                  <dd>{cc.source || '—'}</dd>
                </dl>
              </>
            )}
          </section>

          <section className="panel block">
            <h3>联系方式</h3>
            {!cc ? (
              <Empty text="无 CC 联系方式。" />
            ) : (
              <>
                {companyContacts.length ? (
                  <div className="list" style={{ marginBottom: 12 }}>
                    {companyContacts.map((p) => (
                      <div key={p.id} className="list-item">
                        <div>
                          <div className="title">
                            {p.name}
                            <span className="muted"> · {p.role}</span>
                          </div>
                          <div className="meta">
                            {[...p.phones, ...p.emails].slice(0, 3).join(' · ') || '见原文'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="mono">{cc.contact || 'Excel 中无联系方式原文。'}</div>
              </>
            )}
          </section>

          <section className="panel block">
            <h3>相关纪要</h3>
            {!companyNotes.length ? (
              <Empty text="还没有挂到这家公司的会议纪要。" />
            ) : (
              companyNotes.map((n) => (
                <Link key={n.id} className="list-item" to="/notes">
                  <div>
                    <div className="title">{n.title}</div>
                    <div className="meta">
                      {shortDate(n.date)} · {n.source}
                    </div>
                  </div>
                </Link>
              ))
            )}
            <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
              今天是 {shortDate(todayISO())}。飞书同步接通后，纪要会自动出现在这里。
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
