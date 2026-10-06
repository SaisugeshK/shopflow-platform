import clsx from 'clsx'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Eye, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Search, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useDismiss } from '@/hooks/useDismiss'
import type { FormEvent } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { IconButton } from '@/components/ui/Button'
import { ClearButton } from '@/components/ui/Form'
import { AnimatedOutlet } from './AnimatedOutlet'
import { BusinessBrand, PoweredBy, useBusinessTitle } from './BusinessBrand'
import { BusinessSwitcherList } from '@/features/auth/TenantPicker'
import { useLogout } from '@/features/auth/useSession'
import { refreshSession } from '@/services/api'
import { NotificationBell } from '@/features/notifications/NotificationBell'
import { useAuthStore } from '@/stores/auth'
import { initials, titleCase } from '@/utils/format'
import { PLATFORM_NAV, STAFF_NAV, visible } from './navigation'
import type { NavItem } from './navigation'
import { BranchSwitcher } from '@/features/branches/BranchesPages'
import { wordify } from '@/stores/words'

const COLLAPSE_KEY = 'sf.sidebar.collapsed'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Owner/Admin web layout (§63): collapsible role-based sidebar, top bar with search, notifications and user menu.
 * The Super Admin console uses the same shell with its own menu (`variant="platform"`).
 */
export function AppShell({ variant = 'staff' }: { variant?: 'staff' | 'platform' }) {
  const user = useAuthStore((s) => s.user)!
  const platform = variant === 'platform'
  useBusinessTitle(platform ? 'Platform console' : undefined)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const items = platform ? PLATFORM_NAV : visible(STAFF_NAV, user.permissions, user.modules)

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
          {platform ? (
            <>
              <span className="brand-mark" aria-hidden><ShieldCheck size={18} /></span>
              <span className="brand-name">ShopFlow Platform</span>
            </>
          ) : <BusinessBrand nameClassName="brand-name" />}
        </div>
        <nav>
          {items.map((item) => <NavEntry key={item.label} item={item} home={platform ? '/platform' : '/app'} />)}
        </nav>
        <div className="sidebar-footer desktop-only">
          <button className="nav-item" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            <span className="nav-label">Collapse</span>
          </button>
          <PoweredBy className="powered-by nav-label" />
        </div>
      </aside>
      {mobileOpen && <div className="scrim" onClick={() => setMobileOpen(false)} aria-hidden />}
      <div className="main">
        <header className="topbar">
          <IconButton label="Open menu" className="mobile-only" onClick={() => setMobileOpen(true)}>
            <Menu size={20} />
          </IconButton>
          {platform ? <span className="small muted desktop-only">Super Admin console</span> : <GlobalSearch />}
          <div className="grow" />
          {!platform && !user.support && <BranchSwitcher inHeader />}
          {!platform && !user.support && <NotificationBell />}
          <UserMenu />
        </header>
        {user.support && <SupportBanner />}
        <main id="main" className="content" tabIndex={-1}>
          <AnimatedOutlet />
        </main>
      </div>
    </div>
  )
}

/** Shown during a Super Admin's read-only support view of a business (§0B.5). */
function SupportBanner() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const business = useAuthStore((s) => s.user?.business?.name)
  const exit = async () => {
    qc.clear()
    // The refresh cookie still belongs to the console session.
    if (await refreshSession()) navigate('/platform', { replace: true })
    else navigate('/login', { replace: true })
  }
  return (
    <div className="support-banner" role="status">
      <Eye size={16} aria-hidden />
      <span className="grow">Support view of <strong>{business}</strong>: read-only, time-limited and recorded in the business audit log.</span>
      <button className="btn btn-sm btn-secondary" onClick={exit}>Exit support view</button>
    </div>
  )
}

function NavEntry({ item, home }: { item: NavItem; home: string }) {
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
      <NavLink to={item.to} end={item.to === home || item.to.endsWith('/new') || item.to === '/platform/tenants'} className={({ isActive }) => clsx('nav-item', isActive && 'active')} title={wordify(item.label)}>
        {Icon && <Icon size={18} aria-hidden />}
        <span className="nav-label">{wordify(item.label)}</span>
      </NavLink>
    )
  }
  return (
    <div>
      <button className={clsx('nav-item', childActive && !open && 'active')} onClick={() => setOpen((o) => !o)} aria-expanded={open} title={wordify(item.label)}>
        {Icon && <Icon size={18} aria-hidden />}
        <span className="nav-label grow" style={{ textAlign: 'left' }}>{wordify(item.label)}</span>
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
              <span className="nav-label">{wordify(c.label)}</span>
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
      <input ref={ref} className="input" style={{ height: 38 }} type="search" placeholder={wordify("Search orders, customers, products, invoices…")} aria-label="Global search" value={q} onChange={(e) => setQ(e.target.value)} />
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
          <span className="xs muted">{user.role === 'SUPER_ADMIN' ? 'Super Admin' : titleCase(user.role)}</span>
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
            {!user.support && (user.memberships?.length ?? 0) > 1 && (
              <>
                <div style={{ padding: '0 4px' }}><BusinessSwitcherList onDone={() => setOpen(false)} /></div>
                <div className="divider" style={{ margin: '4px 0' }} />
              </>
            )}
            <button className="menu-item" role="menuitem" onClick={() => logout.mutate()}>
              <LogOut size={16} /> Sign out
            </button>
          </div>
      )}
    </div>
  )
}
