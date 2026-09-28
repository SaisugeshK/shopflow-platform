import {
  BarChart3, Building2, LayoutDashboard, Package, Receipt, ScrollText, Settings, ShoppingCart, Truck, Users, UserPlus,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  label: string
  to: string
  icon?: LucideIcon
  /** Shown when the user has any of these permissions. */
  anyOf?: string[]
  children?: NavItem[]
}

/**
 * Role-based navigation (§6.1 Owner, §6.2 Admin). Items are filtered by permission, so the Owner sees everything and
 * an Admin sees only what their permissions allow.
 */
export const STAFF_NAV: NavItem[] = [
  { label: 'Dashboard', to: '/app', icon: LayoutDashboard, anyOf: ['DASHBOARD_VIEW', 'DASHBOARD_OWNER_VIEW'] },
  { label: 'Orders', to: '/app/orders', icon: ShoppingCart, anyOf: ['ORDER_READ'] },
  {
    label: 'Products', to: '/app/products', icon: Package, anyOf: ['PRODUCT_READ', 'STOCK_READ'],
    children: [
      { label: 'Products', to: '/app/products', anyOf: ['PRODUCT_READ'] },
      { label: 'Categories', to: '/app/categories', anyOf: ['PRODUCT_READ'] },
      { label: 'Stock', to: '/app/stock', anyOf: ['STOCK_READ'] },
      { label: 'Stock Movements', to: '/app/stock/movements', anyOf: ['STOCK_READ'] },
    ],
  },
  {
    label: 'Purchases', to: '/app/purchases', icon: Truck, anyOf: ['PURCHASE_READ'],
    children: [
      { label: 'Add Purchase', to: '/app/purchases/new', anyOf: ['PURCHASE_WRITE'] },
      { label: 'Purchase History', to: '/app/purchases', anyOf: ['PURCHASE_READ'] },
      { label: 'Purchase Returns', to: '/app/purchase-returns', anyOf: ['PURCHASE_READ'] },
    ],
  },
  {
    label: 'Customers', to: '/app/customers', icon: Users, anyOf: ['CUSTOMER_READ'],
    children: [
      { label: 'All Customers', to: '/app/customers', anyOf: ['CUSTOMER_READ'] },
      { label: 'Add Customer', to: '/app/customers/new', anyOf: ['CUSTOMER_WRITE'] },
      { label: 'Pending Approval', to: '/app/customers?status=PENDING_APPROVAL', anyOf: ['CUSTOMER_READ'] },
      { label: 'Credit / Outstanding', to: '/app/customers?hasOutstanding=true', anyOf: ['CUSTOMER_READ'] },
    ],
  },
  { label: 'Suppliers', to: '/app/suppliers', icon: Building2, anyOf: ['SUPPLIER_READ'] },
  {
    label: 'Billing', to: '/app/invoices', icon: Receipt, anyOf: ['INVOICE_READ', 'PAYMENT_READ'],
    children: [
      { label: 'Create Invoice', to: '/app/invoices/new', anyOf: ['INVOICE_WRITE'] },
      { label: 'Invoices', to: '/app/invoices', anyOf: ['INVOICE_READ'] },
      { label: 'Credit Bills', to: '/app/invoices?status=CREDIT', anyOf: ['INVOICE_READ'] },
      { label: 'Payments', to: '/app/payments', anyOf: ['PAYMENT_READ'] },
      { label: 'Sales Returns', to: '/app/returns', anyOf: ['RETURN_READ'] },
    ],
  },
  { label: 'Reports', to: '/app/reports', icon: BarChart3, anyOf: ['REPORT_READ'] },
  { label: 'Users', to: '/app/users', icon: UserPlus, anyOf: ['USER_MANAGE'] },
  { label: 'Settings', to: '/app/settings', icon: Settings, anyOf: ['SETTINGS_MANAGE'] },
  { label: 'Audit Logs', to: '/app/audit', icon: ScrollText, anyOf: ['AUDIT_READ'] },
]

export function visible(items: NavItem[], permissions: string[]): NavItem[] {
  return items
    .filter((i) => !i.anyOf || i.anyOf.some((p) => permissions.includes(p)))
    .map((i) => (i.children ? { ...i, children: visible(i.children, permissions) } : i))
}

