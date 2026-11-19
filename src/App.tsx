import { useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useStore } from './store'
import { num } from './lib'
import { Brand } from './Brand'
import Today from './pages/Today'
import Projects from './pages/Projects'
import CC from './pages/CC'
import Company from './pages/Company'
import Research from './pages/Research'
import Expos from './pages/Expos'
import Notes from './pages/Notes'
import Contacts from './pages/Contacts'
import Investors from './pages/Investors'

const links = [
  { to: '/', label: '今日', end: true },
  { to: '/projects', label: '项目库' },
  { to: '/cc', label: 'CC 跟进' },
  { to: '/investors', label: '投资机构' },
  { to: '/research', label: '赛道研究' },
  { to: '/expos', label: '展会日历' },
  { to: '/notes', label: '飞书纪要' },
  { to: '/contacts', label: '联系人' },
]

export default function App() {
  const { ready, error, companies, generatedAt } = useStore()
  const ccCount = companies.filter((c) => c.cc).length
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [menuOpen])

  if (!ready) {
    return (
      <div className="loading">
        <div>
          <Brand />
          <p className="muted">正在载入项目库…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="boot-error">
        <div>
          <h1>数据还没准备好</h1>
          <p>{error}</p>
          <p className="muted">在项目目录执行：npm run data</p>
        </div>
      </div>
    )
  }

  const navLinks = (
    <nav className="nav-links" aria-label="主导航">
      {links.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          end={l.end}
          className={({ isActive }) => (isActive ? 'active' : '')}
          onClick={() => setMenuOpen(false)}
        >
          <span>{l.label}</span>
          {l.to === '/projects' ? <span className="nav-count">{num(companies.length)}</span> : null}
          {l.to === '/cc' ? <span className="nav-count">{num(ccCount)}</span> : null}
        </NavLink>
      ))}
    </nav>
  )

  return (
    <div className={`app${menuOpen ? ' menu-open' : ''}`}>
      <header className="mobile-top">
        <Brand />
        <button
          type="button"
          className="btn mobile-menu-btn"
          aria-expanded={menuOpen}
          aria-controls="mobile-drawer"
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? '关闭' : '菜单'}
        </button>
      </header>

      {menuOpen ? (
        <button
          type="button"
          className="mobile-backdrop"
          aria-label="关闭菜单"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}

      <aside className="nav" id="mobile-drawer">
        <div className="nav-desktop-brand">
          <Brand />
        </div>
        {navLinks}
        <div className="nav-foot">
          测试版
          <br />
          数据来自《{generatedAt ? '融资事件.xlsx' : '本地 JSON'}》
          <br />
          户外/保健品联系库已接入
          <br />
          生成于 {generatedAt || '—'}
          <br />
          跟进记录保存在本机浏览器
        </div>
      </aside>

      <main className="main">
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/cc" element={<CC />} />
          <Route path="/company/:id" element={<Company />} />
          <Route path="/research" element={<Research />} />
          <Route path="/expos" element={<Expos />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/investors" element={<Investors />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
