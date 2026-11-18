import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { Stage, Verdict } from './types'
import { stageLabel, verdictLabel } from './lib'

export function PageHead({
  title,
  desc,
  actions,
}: {
  title: string
  desc?: string
  actions?: ReactNode
}) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {desc ? <p>{desc}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  )
}

export function Badge({ kind, children }: { kind?: string; children: ReactNode }) {
  return <span className={`badge ${kind || ''}`}>{children}</span>
}

export function StageBadge({ stage }: { stage: Stage }) {
  return <Badge kind={stage}>{stageLabel(stage)}</Badge>
}

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return <Badge kind={verdict}>{verdictLabel(verdict)}</Badge>
}

export function Panel({
  title,
  extra,
  children,
}: {
  title: string
  extra?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="panel">
      <div className="panel-h">
        <h2>{title}</h2>
        {extra ? <span>{extra}</span> : null}
      </div>
      <div className="panel-b">{children}</div>
    </section>
  )
}

export function Empty({ text }: { text: string }) {
  return <div className="empty">{text}</div>
}

export function CompanyLink({ id, name }: { id: string; name: string }) {
  return (
    <Link className="name-cell" to={`/company/${id}`}>
      {name}
    </Link>
  )
}

export function Pager({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number
  pageSize: number
  total: number
  onChange: (page: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className="pager">
      <span>
        共 {total} 条 · 第 {page}/{pages} 页
      </span>
      <div className="page-actions">
        <button className="btn" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          上一页
        </button>
        <button className="btn" disabled={page >= pages} onClick={() => onChange(page + 1)}>
          下一页
        </button>
      </div>
    </div>
  )
}
