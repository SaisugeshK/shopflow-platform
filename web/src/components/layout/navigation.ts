import {
  BarChart3, Building2, CreditCard, Factory, Inbox, LayoutDashboard, LayoutGrid, Package, Receipt, ScrollText, Settings, ShieldCheck,
  ShoppingCart, Truck, Users, UserPlus,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  label: string
  to: string
  icon?: LucideIcon
  /** Shown when the user has any of these permissions. */
  anyOf?: string[]
  /** Shown only when the business has this module switched on (§0B.6). */
  module?: string
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
      { label: 'Batches & Expiry', to: '/app/batches', anyOf: ['STOCK_READ'], module: 'BATCH_EXPIRY' },
      { label: 'Serial Numbers', to: '/app/serials', anyOf: ['STOCK_READ'], module: 'SERIAL_NUMBERS' },
      { label: 'Daily Rates', to: '/app/daily-rates', anyOf: ['PRODUCT_READ'], module: 'DAILY_RATES' },
      { label: 'Schemes', to: '/app/schemes', anyOf: ['PRODUCT_READ'], module: 'SCHEMES' },
      { label: 'Job Work', to: '/app/job-work', anyOf: ['STOCK_READ'], module: 'JOB_WORK' },
      { label: 'Branches & Transfers', to: '/app/branches', anyOf: ['STOCK_READ'], module: 'BRANCHES' },
    ],
  },
  {
    label: 'Purchases', to: '/app/purchases', icon: Truck, anyOf: ['PURCHASE_READ'],
    children: [
      { label: 'Purchase Orders', to: '/app/purchase-orders', anyOf: ['PURCHASE_READ'], module: 'PURCHASE_ORDERS' },
      { label: 'Add Purchase', to: '/app/purchases/new', anyOf: ['PURCHASE_WRITE'] },
      { label: 'Purchase History', to: '/app/purchases', anyOf: ['PURCHASE_READ'] },
      { label: 'Purchase Returns', to: '/app/purchase-returns', anyOf: ['PURCHASE_READ'], module: 'RETURNS' },
    ],
  },
  {
    label: 'Customers', to: '/app/customers', icon: Users, anyOf: ['CUSTOMER_READ'],
    children: [
      { label: 'All Customers', to: '/app/customers', anyOf: ['CUSTOMER_READ'] },
      { label: 'Add Customer', to: '/app/customers/new', anyOf: ['CUSTOMER_WRITE'] },
      { label: 'Pending Approval', to: '/app/customers?status=PENDING_APPROVAL', anyOf: ['CUSTOMER_READ'] },
      { label: 'Credit / Outstanding', to: '/app/customers?hasOutstanding=true', anyOf: ['CUSTOMER_READ'] },
      { label: 'Projects / Sites', to: '/app/projects', anyOf: ['CUSTOMER_READ'], module: 'PROJECT_ACCOUNTS' },
      { label: 'Agents & Commission', to: '/app/agents', anyOf: ['CUSTOMER_READ'], module: 'COMMISSION' },
    ],
  },
  { label: 'Suppliers', to: '/app/suppliers', icon: Building2, anyOf: ['SUPPLIER_READ'] },
  {
    label: 'Billing', to: '/app/invoices', icon: Receipt, anyOf: ['INVOICE_READ', 'PAYMENT_READ'],
    children: [
      { label: 'Quotations', to: '/app/quotations', anyOf: ['ORDER_READ'], module: 'QUOTATIONS' },
      { label: 'Delivery Challans', to: '/app/delivery-challans', anyOf: ['INVOICE_READ'], module: 'DELIVERY_CHALLAN' },
      { label: 'Create Invoice', to: '/app/invoices/new', anyOf: ['INVOICE_WRITE'] },
      { label: 'Invoices', to: '/app/invoices', anyOf: ['INVOICE_READ'] },
      { label: 'Credit Bills', to: '/app/invoices?status=CREDIT', anyOf: ['INVOICE_READ'] },
      { label: 'Payments', to: '/app/payments', anyOf: ['PAYMENT_READ'] },
      { label: 'Sales Returns', to: '/app/returns', anyOf: ['RETURN_READ'], module: 'RETURNS' },
    ],
  },
  { label: 'Reports', to: '/app/reports', icon: BarChart3, anyOf: ['REPORT_READ'] },
  { label: 'Users', to: '/app/users', icon: UserPlus, anyOf: ['USER_MANAGE'] },
  { label: 'Settings', to: '/app/settings', icon: Settings, anyOf: ['SETTINGS_MANAGE'] },
  { label: 'Audit Logs', to: '/app/audit', icon: ScrollText, anyOf: ['AUDIT_READ'] },
]

/** Super Admin console (§0B.5). */
export const PLATFORM_NAV: NavItem[] = [
  { label: 'Overview', to: '/platform', icon: LayoutDashboard },
  { label: 'Businesses', to: '/platform/tenants', icon: Building2 },
  { label: 'Sign-up requests', to: '/platform/signups', icon: Inbox },
  { label: 'Plans', to: '/platform/plans', icon: CreditCard },
  { label: 'Register business', to: '/platform/tenants/new', icon: Factory },
  { label: 'Industry templates', to: '/platform/industries', icon: LayoutGrid },
  { label: 'Platform admins', to: '/platform/admins', icon: ShieldCheck },
  { label: 'Audit log', to: '/platform/audit', icon: ScrollText },
]

/** Items the user may see: by permission and, when `modules` is given, by the business's modules. */
export function visible(items: NavItem[], permissions: string[], modules?: string[]): NavItem[] {
  return items
    .filter((i) => !i.anyOf || i.anyOf.some((p) => permissions.includes(p)))
    .filter((i) => !i.module || !modules || modules.includes(i.module))
    .map((i) => (i.children ? { ...i, children: visible(i.children, permissions, modules) } : i))
    .filter((i) => !i.children || i.children.length > 0)
}

