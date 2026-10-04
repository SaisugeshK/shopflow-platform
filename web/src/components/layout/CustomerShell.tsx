import clsx from 'clsx'
import { useQuery } from '@tanstack/react-query'
import { ClipboardList, House, LogOut, Package, ShoppingCart, User } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import { IconButton } from '@/components/ui/Button'
import { AnimatedOutlet } from './AnimatedOutlet'
import { BusinessBrand, PoweredBy, useBusinessTitle } from './BusinessBrand'
import { BusinessSwitchButton } from '@/features/auth/BusinessSwitchButton'
import { useLogout } from '@/features/auth/useSession'
import { NotificationBell } from '@/features/notifications/NotificationBell'
import { api } from '@/services/api'
import type { Cart } from '@/services/types'
import { useAuthStore, useModule } from '@/stores/auth'

export function useCart() {
  return useQuery({ queryKey: ['cart'], queryFn: () => api.get<Cart>('/api/v1/cart') })
}

const NAV = [
  { to: '/shop', label: 'Home', icon: House, end: true },
  { to: '/shop/products', label: 'Products', icon: Package },
  { to: '/shop/orders', label: 'Orders', icon: ClipboardList },
  { to: '/shop/invoices', label: 'Invoices' },
  { to: '/shop/quotations', label: 'Quotations', module: 'QUOTATIONS' },
  { to: '/shop/projects', label: 'Projects', module: 'PROJECT_ACCOUNTS' },
  { to: '/shop/outstanding', label: 'Credit' },
  { to: '/shop/profile', label: 'Account', icon: User },
]

/** Customer web portal: same screens as the future mobile app (§6.3), with mobile bottom navigation (§64). */
export function CustomerShell() {
  const user = useAuthStore((s) => s.user)!
  useBusinessTitle()
  const cart = useCart()
  const logout = useLogout()
  const location = useLocation()
  const count = cart.data?.itemCount ?? 0
  const showFloating = count > 0 && location.pathname.startsWith('/shop/products')
  const quotationsOn = useModule('QUOTATIONS')
  const projectsOn = useModule('PROJECT_ACCOUNTS')
  const nav = NAV.filter((n) => !('module' in n) || (n.module === 'QUOTATIONS' ? quotationsOn : projectsOn))

  return (
    <div className="portal">
      <a href="#main" className="sr-only">Skip to content</a>
      <header className="portal-header">
        <div className="portal-header-inner">
          <NavLink to="/shop" className="row" style={{ fontWeight: 700, color: 'var(--color-text)' }}>
            <BusinessBrand nameClassName="portal-brand-name" />
          </NavLink>
          <nav className="portal-nav" aria-label="Main">
            {nav.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => clsx(isActive && 'active')}>{n.label}</NavLink>
            ))}
          </nav>
          <div className="grow" />
          <span className="small muted desktop-only" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.customer?.shopName}</span>
          <NavLink to="/shop/cart" className="icon-btn" aria-label={`Cart, ${count} items`} style={{ position: 'relative' }}>
            <ShoppingCart size={20} />
            {count > 0 && <span className="cart-count">{count}</span>}
          </NavLink>
          <BusinessSwitchButton />
          <NotificationBell />
          <IconButton label="Sign out" onClick={() => logout.mutate()}><LogOut size={18} /></IconButton>
        </div>
      </header>
      <main id="main" className="portal-main" tabIndex={-1}>
        <AnimatedOutlet />
        <div className="portal-credit"><PoweredBy /></div>
      </main>
      {showFloating && (
        <NavLink to="/shop/cart" className="btn btn-primary btn-lg floating-cart">
          <ShoppingCart size={18} /> View cart ({count})
        </NavLink>
      )}
      <nav className="bottom-nav" aria-label="Bottom navigation">
        <NavLink to="/shop" end className={({ isActive }) => clsx(isActive && 'active')}><House size={20} />Home</NavLink>
        <NavLink to="/shop/products" className={({ isActive }) => clsx(isActive && 'active')}><Package size={20} />Products</NavLink>
        <NavLink to="/shop/cart" className={({ isActive }) => clsx(isActive && 'active')}>
          <span style={{ position: 'relative' }}><ShoppingCart size={20} />{count > 0 && <span className="cart-count">{count}</span>}</span>Cart
        </NavLink>
        <NavLink to="/shop/orders" className={({ isActive }) => clsx(isActive && 'active')}><ClipboardList size={20} />Orders</NavLink>
        <NavLink to="/shop/profile" className={({ isActive }) => clsx(isActive && 'active')}><User size={20} />Profile</NavLink>
      </nav>
    </div>
  )
}
