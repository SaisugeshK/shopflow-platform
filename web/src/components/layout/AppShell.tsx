import clsx from 'clsx'
import { ChevronDown, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Search, Store } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useDismiss } from '@/hooks/useDismiss'
import type { FormEvent } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { IconButton } from '@/components/ui/Button'
import { ClearButton } from '@/components/ui/Form'
import { AnimatedOutlet } from './AnimatedOutlet'
import { useLogout } from '@/features/auth/useSession'
import { NotificationBell } from '@/features/notifications/NotificationBell'
import { useAuthStore } from '@/stores/auth'
import { initials, titleCase } from '@/utils/format'
import { STAFF_NAV, visible } from './navigation'
import type { NavItem } from './navigation'

const COLLAPSE_KEY = 'sf.sidebar.collapsed'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

/** Owner/Admin web layout (§63): collapsible role-based sidebar, top bar with search, notifications and user menu. */
export function AppShell() {
  const user = useAuthStore((s) => s.user)!
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const items = visible(STAFF_NAV, user.permissions)

  useEffect(() => setMobileOpen(false), [location.pathname, location.search])
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0')
    } catch {
      /* storage unavailable */
    }
  }, [collapsed])

  return (
    <div className={clsx('app-shell', collapsed && 'collapsed')}>
      <a href="#main" className="sr-only">Skip to content</a>
      <aside className={clsx('sidebar', mobileOpen && 'open')} aria-label="Main navigation">
        <div className="sidebar-brand">
          <span className="brand-mark"><Store size={18} /></span>
          <span className="brand-name">ShopFlow</span>
        </div>
        <nav>
          {items.map((item) => <NavEntry key={item.label} item={item} />)}
        </nav>
        <div className="sidebar-footer desktop-only">
          <button className="nav-item" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            <span className="nav-label">Collapse</span>
          </button>
        </div>
      </aside>
      {mobileOpen && <div className="scrim" onClick={() => setMobileOpen(false)} aria-hidden />}
      <div className="main">
        <header className="topbar">
          <IconButton label="Open menu" className="mobile-only" onClick={() => setMobileOpen(true)}>
            <Menu size={20} />
          </IconButton>
          <GlobalSearch />
          <div className="grow" />
          <NotificationBell />
          <UserMenu />
        </header>
        <main id="main" className="content" tabIndex={-1}>
          <AnimatedOutlet />
        </main>
      </div>
    </div>
  )
}

function NavEntry({ item }: { item: NavItem }) {
  const location = useLocation()
  const Icon = item.icon
  const hasChildren = !!item.children?.length
  const childActive = item.children?.some((c) => location.pathname.startsWith(c.to.split('?')[0]!)) ?? false
  const [open, setOpen] = useState(childActive)
  useEffect(() => {
    if (childActive) setOpen(true)
  }, [childActive])

  if (!hasChildren) {
    return (
      <NavLink to={item.to} end={item.to === '/app'} className={({ isActive }) => clsx('nav-item', isActive && 'active')} title={item.label}>
        {Icon && <Icon size={18} aria-hidden />}
        <span className="nav-label">{item.label}</span>
      </NavLink>
    )
  }
  return (
    <div>
      <button className={clsx('nav-item', childActive && !open && 'active')} onClick={() => setOpen((o) => !o)} aria-expanded={open} title={item.label}>
        {Icon && <Icon size={18} aria-hidden />}
        <span className="nav-label grow" style={{ textAlign: 'left' }}>{item.label}</span>
        <ChevronDown size={14} className="chevron" style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s' }} aria-hidden />
      </button>
      {open && (
        <div className="nav-children">
          {item.children!.map((c) => (
            <NavLink
              key={c.label}
              to={c.to}
              end
              className={({ isActive }) => clsx('nav-item', isActive && location.search === (c.to.includes('?') ? `?${c.to.split('?')[1]}` : location.search) && 'active')}
            >
              <span className="nav-label">{c.label}</span>
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

function GlobalSearch() {
  const [q, setQ] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (q.trim()) navigate(`/app/search?q=${encodeURIComponent(q.trim())}`)
  }
  return (
    <form onSubmit={submit} className="search input-group has-clear" role="search">
      <Search size={16} className="prefix" aria-hidden />
      <input ref={ref} className="input" style={{ height: 38 }} type="search" placeholder="Search orders, customers, products, invoices…" aria-label="Global search" value={q} onChange={(e) => setQ(e.target.value)} />
      {q && <ClearButton onClear={() => { setQ(''); ref.current?.focus() }} />}
    </form>
  )
}

function UserMenu() {
  const user = useAuthStore((s) => s.user)!
  const [open, setOpen] = useState(false)
  const ref = useDismiss<HTMLDivElement>(open, useCallback(() => setOpen(false), []))
  const logout = useLogout()
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="user-chip" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <span className="avatar">{initials(user.fullName)}</span>
        <span className="desktop-only" style={{ textAlign: 'left', lineHeight: 1.2 }}>
          <span className="small" style={{ fontWeight: 600, display: 'block' }}>{user.fullName}</span>
          <span className="xs muted">{titleCase(user.role)}</span>
        </span>
        <ChevronDown size={14} className="desktop-only" />
      </button>
      {open && (
          <div className="menu" role="menu">
            <div style={{ padding: '8px 10px' }}>
              <div style={{ fontWeight: 600 }}>{user.fullName}</div>
              <div className="xs muted">{user.mobileNumber}</div>
            </div>
            <div className="divider" style={{ margin: '4px 0' }} />
            <button className="menu-item" role="menuitem" onClick={() => logout.mutate()}>
              <LogOut size={16} /> Sign out
            </button>
          </div>
      )}
    </div>
  )
}
