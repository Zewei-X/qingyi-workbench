import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { PageHead, Empty } from '../ui'
import { num, uid } from '../lib'
import { FA_ORG_RANK, contactBelongsToOrg } from '../faOrgs'
import { getFaOrgProfile } from '../faOrgProfiles'
import type { Contact, ContactKind } from '../types'

type FaView = 'people' | 'orgs'

export default function Contacts() {
  const { contacts, saveContact, deleteContact } = useStore()
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<ContactKind>('fa')
  const [faView, setFaView] = useState<FaView>('orgs')
  const [orgName, setOrgName] = useState(FA_ORG_RANK[0]?.name || '')
  const [editing, setEditing] = useState<Contact | null>(null)

  const fa = useMemo(() => contacts.filter((c) => c.kind === 'fa'), [contacts])
  const founders = useMemo(() => contacts.filter((c) => c.kind === 'founder'), [contacts])

  const orgRows = useMemo(() => {
    const query = q.trim().toLowerCase()
    return FA_ORG_RANK.map((o) => {
      const people = fa.filter((c) => contactBelongsToOrg(c.companyName, o.name))
      return { ...o, people }
    }).filter((o) => {
      if (!query) return true
      if (o.name.toLowerCase().includes(query)) return true
      return o.people.some((c) =>
        [c.name, c.companyName, c.wechat, c.via, ...c.phones].join(' ').toLowerCase().includes(query),
      )
    })
  }, [fa, q])

  const activeOrg = orgRows.find((o) => o.name === orgName) || orgRows[0]
  const orgPeople = activeOrg?.people || []
  const orgProfile = activeOrg ? getFaOrgProfile(activeOrg.name) : null

  const peopleFiltered = useMemo(() => {
    const list = tab === 'fa' ? fa : founders
    const query = q.trim().toLowerCase()
    if (!query) return list
    return list.filter((c) =>
      [c.name, c.companyName, c.wechat, c.via, c.note, ...c.phones, ...c.emails]
        .join(' ')
        .toLowerCase()
        .includes(query),
    )
  }, [tab, fa, founders, q])

  function blank(kind: ContactKind): Contact {
    return {
      id: uid(),
      kind,
      name: '',
      role: kind === 'fa' ? 'FA' : '创始人/项目方',
      others: [],
      companyId: null,
      companyName: kind === 'fa' && faView === 'orgs' && activeOrg ? activeOrg.name : '',
      phones: [],
      emails: [],
      wechat: '',
      source: kind === 'fa' ? 'FA 通讯录' : '手工录入',
      via: '',
      note: '',
      custom: true,
    }
  }

  function commit() {
    if (!editing || !editing.name.trim()) return
    saveContact({
      ...editing,
      name: editing.name.trim(),
      companyName: editing.companyName.trim(),
      wechat: editing.wechat.trim(),
      phones: editing.phones.filter(Boolean),
      emails: editing.emails.filter(Boolean),
    })
    setEditing(null)
  }

  return (
    <div>
      <PageHead
        title="联系人"
        desc="FA 可按机构浏览（按今年成交活跃度排序）；点进机构看库内联系人。另有创始人/项目方。"
        actions={
          <button className="btn primary" onClick={() => setEditing(blank(tab))}>
            {tab === 'fa' ? '新建 FA' : '新建创始人/项目方'}
          </button>
        }
      />

      <div className="chips" style={{ marginBottom: 14 }}>
        <button
          className={`chip ${tab === 'fa' ? 'on' : ''}`}
          onClick={() => setTab('fa')}
        >
          FA {num(fa.length)}
        </button>
        <button
          className={`chip ${tab === 'founder' ? 'on' : ''}`}
          onClick={() => setTab('founder')}
        >
          创始人/项目方 {num(founders.length)}
        </button>
      </div>

      {tab === 'fa' ? (
        <div className="chips" style={{ marginBottom: 14 }}>
          <button
            className={`chip ${faView === 'orgs' ? 'on' : ''}`}
            onClick={() => setFaView('orgs')}
          >
            按机构
          </button>
          <button
            className={`chip ${faView === 'people' ? 'on' : ''}`}
            onClick={() => setFaView('people')}
          >
            全部联系人
          </button>
        </div>
      ) : null}

      <div className="toolbar">
        <input
          className="field grow"
          placeholder={
            tab === 'founder'
              ? '搜索姓名、公司、微信…'
              : faView === 'orgs'
                ? '搜索机构、联系人、微信、电话…'
                : '搜索姓名、机构、微信、电话…'
          }
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {editing ? (
        <section className="panel block" style={{ marginBottom: 14 }}>
          <h3>
            {contacts.some((c) => c.id === editing.id) ? '编辑' : '新建'}
            {editing.kind === 'fa' ? ' FA' : ' 创始人/项目方'}
          </h3>
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
              {editing.kind === 'fa' ? '机构' : '公司'}
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
              {editing.kind === 'fa' ? '建联人' : '内部关系人'}
              <input
                className="field"
                placeholder="哪位同事认识"
                value={editing.via}
                onChange={(e) => setEditing({ ...editing, via: e.target.value })}
              />
            </label>
          </div>
          <label className="form-row one">
            备注
            <textarea
              className="editor"
              value={editing.note}
              onChange={(e) => setEditing({ ...editing, note: e.target.value })}
            />
          </label>
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

      {tab === 'fa' && faView === 'orgs' ? (
        <div className="split-list fa-org-layout">
          <div className="side-list">
            {orgRows.map((o, i) => (
              <button
                key={o.name}
                className={activeOrg?.name === o.name ? 'on' : ''}
                onClick={() => setOrgName(o.name)}
              >
                <div className="t">
                  <span className="fa-org-rank">{i + 1}</span>
                  {o.name}
                </div>
                <div className="s">库内联系人 {num(o.people.length)}</div>
              </button>
            ))}
            {!orgRows.length ? <Empty text="没有匹配的机构。" /> : null}
          </div>

          <div className="panel">
            <div className="panel-h">
              <h2>
                {activeOrg ? (
                  <>
                    {activeOrg.name}
                    <span className="fa-deal-inline">({activeOrg.deals})</span>
                  </>
                ) : (
                  '机构'
                )}
              </h2>
              <span>
                今年成交 {activeOrg ? num(activeOrg.deals) : 0} · 库内{' '}
                {num(orgPeople.length)} 人
              </span>
            </div>
            {orgProfile ? (
              <div className="fa-org-profile">
                <div className="fa-org-profile-label">近一年方向</div>
                <div className="fa-org-focus">
                  {orgProfile.focus.map((tag) => (
                    <span key={tag} className="fa-org-focus-tag">
                      {tag}
                    </span>
                  ))}
                </div>
                <p className="fa-org-summary">{orgProfile.summary}</p>
                {orgProfile.cases && orgProfile.cases.length > 0 ? (
                  <ul className="fa-org-cases">
                    {orgProfile.cases.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            <ContactTable
              rows={orgPeople}
              kind="fa"
              emptyText={
                activeOrg
                  ? `「${activeOrg.name}」在库内还没有联系人，可点右上角新建。`
                  : '选择左侧机构。'
              }
              onEdit={setEditing}
              onDelete={deleteContact}
            />
          </div>
        </div>
      ) : (
        <div className="panel">
          <div className="panel-h">
            <h2>{tab === 'fa' ? 'FA' : '创始人/项目方'}</h2>
            <span>{num(peopleFiltered.length)} 人</span>
          </div>
          {tab === 'founder' && !founders.length && !editing ? (
            <Empty text="创始人/项目方名单先空着，后面再补。" />
          ) : (
            <ContactTable
              rows={peopleFiltered}
              kind={tab}
              emptyText={tab === 'fa' ? '没有匹配的 FA。' : '没有匹配的创始人/项目方。'}
              onEdit={setEditing}
              onDelete={deleteContact}
            />
          )}
        </div>
      )}
    </div>
  )
}

function ContactTable({
  rows,
  kind,
  emptyText,
  onEdit,
  onDelete,
}: {
  rows: Contact[]
  kind: ContactKind
  emptyText: string
  onEdit: (c: Contact) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="table-wrap">
      <table className="data">
        <colgroup>
          <col style={{ width: '22%' }} />
          <col style={{ width: '28%' }} />
          <col />
          <col style={{ width: '14%' }} />
          <col style={{ width: '120px' }} />
        </colgroup>
        <thead>
          <tr>
            <th>姓名</th>
            <th>{kind === 'fa' ? '机构' : '公司'}</th>
            <th>{kind === 'fa' ? '微信 / 电话' : '微信'}</th>
            <th>{kind === 'fa' ? '建联人' : '内部关系'}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td>
                <div className="name-cell">{c.name}</div>
              </td>
              <td className="clamp">{c.companyName || '—'}</td>
              <td className="clamp">{[c.wechat, ...c.phones].filter(Boolean).join(' / ') || '—'}</td>
              <td>{c.via || '—'}</td>
              <td>
                <div className="page-actions">
                  <button className="btn ghost" onClick={() => onEdit(c)}>
                    编辑
                  </button>
                  <button className="btn ghost" onClick={() => onDelete(c.id)}>
                    删除
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length ? <Empty text={emptyText} /> : null}
    </div>
  )
}
