import type { IconName } from '@/components/ui/Button'

export interface MenuItem {
  label: string
  href: string
  icon: IconName
  /** Shown when the user has any of these permissions. */
  anyOf: string[]
  hint?: string
}

export interface MenuSection {
  title: string
  items: MenuItem[]
}

/**
 * Owner/Admin "More" menu — same structure and permission rules as the web sidebar (web/src/components/layout/navigation.ts).
 * Items the user may not use are hidden; the backend enforces the same permissions on every request.
 */
export const STAFF_MENU: MenuSection[] = [
  {
    title: 'Sales',
    items: [
      { label: 'Orders', href: '/admin/orders', icon: 'shopping-cart', anyOf: ['ORDER_READ'] },
      { label: 'Create invoice', href: '/admin/invoice-new', icon: 'file-plus', anyOf: ['INVOICE_WRITE'] },
      { label: 'Invoices', href: '/admin/invoices', icon: 'file-text', anyOf: ['INVOICE_READ'] },
      { label: 'Credit bills', href: '/admin/invoices?status=CREDIT', icon: 'book', anyOf: ['INVOICE_READ'] },
      { label: 'Payments', href: '/admin/payments', icon: 'credit-card', anyOf: ['PAYMENT_READ'] },
      { label: 'Sales returns', href: '/admin/returns', icon: 'rotate-ccw', anyOf: ['RETURN_READ'] },
    ],
  },
  {
    title: 'Catalogue & stock',
    items: [
      { label: 'Products', href: '/admin/products', icon: 'package', anyOf: ['PRODUCT_READ'] },
      { label: 'Categories', href: '/admin/categories', icon: 'grid', anyOf: ['PRODUCT_READ'] },
      { label: 'Stock', href: '/admin/stock', icon: 'layers', anyOf: ['STOCK_READ'] },
      { label: 'Stock movements', href: '/admin/movements', icon: 'activity', anyOf: ['STOCK_READ'] },
    ],
  },
  {
    title: 'Purchasing',
    items: [
      { label: 'Add purchase', href: '/admin/purchase-new', icon: 'truck', anyOf: ['PURCHASE_WRITE'] },
      { label: 'Purchase history', href: '/admin/purchases', icon: 'archive', anyOf: ['PURCHASE_READ'] },
      { label: 'Purchase returns', href: '/admin/purchase-returns', icon: 'corner-up-left', anyOf: ['PURCHASE_READ'] },
      { label: 'Suppliers', href: '/admin/suppliers', icon: 'briefcase', anyOf: ['SUPPLIER_READ'] },
    ],
  },
  {
    title: 'Customers',
    items: [
      { label: 'All customers', href: '/admin/customers', icon: 'users', anyOf: ['CUSTOMER_READ'] },
      { label: 'Add customer', href: '/admin/customer-new', icon: 'user-plus', anyOf: ['CUSTOMER_WRITE'] },
      { label: 'Pending approval', href: '/admin/customers?status=PENDING_APPROVAL', icon: 'user-check', anyOf: ['CUSTOMER_READ'] },
      { label: 'Credit / outstanding', href: '/admin/customers?hasOutstanding=true', icon: 'alert-circle', anyOf: ['CUSTOMER_READ'] },
    ],
  },
  {
    title: 'Business',
    items: [
      { label: 'Reports', href: '/admin/reports', icon: 'bar-chart-2', anyOf: ['REPORT_READ'] },
      { label: 'Users & permissions', href: '/admin/users', icon: 'shield', anyOf: ['USER_MANAGE'] },
      { label: 'Settings', href: '/admin/settings', icon: 'settings', anyOf: ['SETTINGS_MANAGE'] },
      { label: 'Audit logs', href: '/admin/audit', icon: 'file', anyOf: ['AUDIT_READ'] },
    ],
  },
]

export function visibleMenu(permissions: string[]): MenuSection[] {
  return STAFF_MENU.map((s) => ({ ...s, items: s.items.filter((i) => i.anyOf.some((p) => permissions.includes(p))) })).filter((s) => s.items.length > 0)
}
