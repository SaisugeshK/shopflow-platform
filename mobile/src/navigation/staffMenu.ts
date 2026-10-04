import type { IconName } from '@/components/ui/Button'

export interface MenuItem {
  label: string
  href: string
  icon: IconName
  /** Shown when the user has any of these permissions. */
  anyOf: string[]
  /** Shown only when the business has this module switched on (§0B.6). */
  module?: string
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
      { label: 'Quotations', href: '/admin/quotations', icon: 'file-text', anyOf: ['ORDER_READ'], module: 'QUOTATIONS' },
      { label: 'Delivery challans', href: '/admin/delivery-challans', icon: 'truck', anyOf: ['INVOICE_READ'], module: 'DELIVERY_CHALLAN' },
      { label: 'Create invoice', href: '/admin/invoice-new', icon: 'file-plus', anyOf: ['INVOICE_WRITE'] },
      { label: 'Invoices', href: '/admin/invoices', icon: 'file-text', anyOf: ['INVOICE_READ'] },
      { label: 'Credit bills', href: '/admin/invoices?status=CREDIT', icon: 'book', anyOf: ['INVOICE_READ'] },
      { label: 'Payments', href: '/admin/payments', icon: 'credit-card', anyOf: ['PAYMENT_READ'] },
      { label: 'Sales returns', href: '/admin/returns', icon: 'rotate-ccw', anyOf: ['RETURN_READ'], module: 'RETURNS' },
    ],
  },
  {
    title: 'Catalogue & stock',
    items: [
      { label: 'Products', href: '/admin/products', icon: 'package', anyOf: ['PRODUCT_READ'] },
      { label: 'Categories', href: '/admin/categories', icon: 'grid', anyOf: ['PRODUCT_READ'] },
      { label: 'Stock', href: '/admin/stock', icon: 'layers', anyOf: ['STOCK_READ'] },
      { label: 'Stock movements', href: '/admin/movements', icon: 'activity', anyOf: ['STOCK_READ'] },
      { label: 'Batches & expiry', href: '/admin/batches', icon: 'archive', anyOf: ['STOCK_READ'], module: 'BATCH_EXPIRY' },
      { label: 'Serial numbers', href: '/admin/serials', icon: 'hash', anyOf: ['STOCK_READ'], module: 'SERIAL_NUMBERS' },
      { label: 'Daily rates', href: '/admin/daily-rates', icon: 'trending-up', anyOf: ['PRODUCT_READ'], module: 'DAILY_RATES' },
      { label: 'Schemes', href: '/admin/schemes', icon: 'gift', anyOf: ['PRODUCT_READ'], module: 'SCHEMES' },
      { label: 'Job work', href: '/admin/job-work', icon: 'tool', anyOf: ['STOCK_READ'], module: 'JOB_WORK' },
      { label: 'Branches & transfers', href: '/admin/branches', icon: 'home', anyOf: ['STOCK_READ'], module: 'BRANCHES' },
    ],
  },
  {
    title: 'Purchasing',
    items: [
      { label: 'Purchase orders', href: '/admin/purchase-orders', icon: 'clipboard', anyOf: ['PURCHASE_READ'], module: 'PURCHASE_ORDERS' },
      { label: 'Add purchase', href: '/admin/purchase-new', icon: 'truck', anyOf: ['PURCHASE_WRITE'] },
      { label: 'Purchase history', href: '/admin/purchases', icon: 'archive', anyOf: ['PURCHASE_READ'] },
      { label: 'Purchase returns', href: '/admin/purchase-returns', icon: 'corner-up-left', anyOf: ['PURCHASE_READ'], module: 'RETURNS' },
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
      { label: 'Projects / sites', href: '/admin/projects', icon: 'map-pin', anyOf: ['CUSTOMER_READ'], module: 'PROJECT_ACCOUNTS' },
      { label: 'Agents & commission', href: '/admin/agents', icon: 'percent', anyOf: ['CUSTOMER_READ'], module: 'COMMISSION' },
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

export function visibleMenu(permissions: string[], modules?: string[]): MenuSection[] {
  return STAFF_MENU.map((s) => ({
    ...s,
    items: s.items.filter((i) => i.anyOf.some((p) => permissions.includes(p)) && (!i.module || !modules || modules.includes(i.module))),
  })).filter((s) => s.items.length > 0)
}
