import { lazy, Suspense } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { createBrowserRouter, Link, Navigate } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { CustomerShell } from '@/components/layout/CustomerShell'
import { EmptyState, Spinner } from '@/components/ui/Feedback'
import { PublicOnly, RequireAuth, RequirePermission } from '@/features/auth/Guards'
import { LoginPage } from '@/features/auth/LoginPage'
import { RegisterPage } from '@/features/auth/RegisterPage'
import { RegistrationStatusPage, SessionExpiredPage } from '@/features/auth/StatusPages'
import { RouteError } from './RouteError'

/** Lazily loads a named export so each feature is its own chunk. */
function page<T extends object>(loader: () => Promise<T>, name: keyof T & string) {
  const C = lazy(async () => ({ default: (await loader())[name] as unknown as ComponentType }))
  return (
    <Suspense fallback={<div style={{ padding: 48 }}><Spinner size={26} /></div>}>
      <C />
    </Suspense>
  )
}

function guard(anyOf: string[], element: ReactNode) {
  return <RequirePermission anyOf={anyOf}>{element}</RequirePermission>
}

const dashboard = () => import('@/features/dashboard/DashboardPage')
const orders = () => import('@/features/orders/OrdersPages')
const products = () => import('@/features/products/ProductsPages')
const inventory = () => import('@/features/inventory/StockPages')
const purchases = () => import('@/features/purchases/PurchasesPages')
const customers = () => import('@/features/customers/CustomersPages')
const suppliers = () => import('@/features/suppliers/SuppliersPages')
const billing = () => import('@/features/billing/InvoicesPages')
const payments = () => import('@/features/payments/PaymentsPages')
const returns = () => import('@/features/returns/ReturnsPage')
const reports = () => import('@/features/reports/ReportsPage')
const users = () => import('@/features/users/UsersPage')
const settings = () => import('@/features/settings/SettingsPage')
const audit = () => import('@/features/audit/AuditPage')
const search = () => import('@/features/dashboard/SearchPage')
const portal = () => import('@/features/portal/PortalPages')
const portalOrders = () => import('@/features/portal/PortalOrders')
const portalAccount = () => import('@/features/portal/PortalAccount')

function NotFound() {
  return <EmptyState title="Page not found" description="The page you are looking for does not exist." action={<Link to="/" className="btn btn-primary">Go home</Link>} />
}

export const router = createBrowserRouter([{
  errorElement: <RouteError />,
  children: [
  { path: '/', element: <Navigate to="/login" replace /> },
  { path: '/login', element: <PublicOnly><LoginPage /></PublicOnly> },
  { path: '/register', element: <PublicOnly><RegisterPage /></PublicOnly> },
  { path: '/session-expired', element: <SessionExpiredPage /> },
  { path: '/registration-status', element: <RequireAuth kind="any"><RegistrationStatusPage /></RequireAuth> },
  {
    path: '/app',
    element: <RequireAuth kind="staff"><AppShell /></RequireAuth>,
    children: [{ errorElement: <RouteError />, children: [
      { index: true, element: page(dashboard, 'DashboardPage') },
      { path: 'search', element: page(search, 'SearchPage') },
      { path: 'orders', element: guard(['ORDER_READ'], page(orders, 'OrdersPage')) },
      { path: 'orders/:id', element: guard(['ORDER_READ'], page(orders, 'OrderDetailPage')) },
      { path: 'products', element: guard(['PRODUCT_READ'], page(products, 'ProductsPage')) },
      { path: 'products/new', element: guard(['PRODUCT_WRITE'], page(products, 'ProductFormPage')) },
      { path: 'products/:id', element: guard(['PRODUCT_READ'], page(products, 'ProductDetailPage')) },
      { path: 'products/:id/edit', element: guard(['PRODUCT_WRITE'], page(products, 'ProductFormPage')) },
      { path: 'categories', element: guard(['PRODUCT_READ'], page(products, 'CategoriesPage')) },
      { path: 'stock', element: guard(['STOCK_READ'], page(inventory, 'StockPage')) },
      { path: 'stock/movements', element: guard(['STOCK_READ'], page(inventory, 'MovementsPage')) },
      { path: 'purchases', element: guard(['PURCHASE_READ'], page(purchases, 'PurchasesPage')) },
      { path: 'purchases/new', element: guard(['PURCHASE_WRITE'], page(purchases, 'PurchaseFormPage')) },
      { path: 'purchases/:id', element: guard(['PURCHASE_READ'], page(purchases, 'PurchaseDetailPage')) },
      { path: 'purchase-returns', element: guard(['PURCHASE_READ'], page(purchases, 'PurchaseReturnsPage')) },
      { path: 'customers', element: guard(['CUSTOMER_READ'], page(customers, 'CustomersPage')) },
      { path: 'customers/new', element: guard(['CUSTOMER_WRITE'], page(customers, 'CustomerFormPage')) },
      { path: 'customers/:id', element: guard(['CUSTOMER_READ'], page(customers, 'CustomerDetailPage')) },
      { path: 'suppliers', element: guard(['SUPPLIER_READ'], page(suppliers, 'SuppliersPage')) },
      { path: 'suppliers/:id', element: guard(['SUPPLIER_READ'], page(suppliers, 'SupplierDetailPage')) },
      { path: 'invoices', element: guard(['INVOICE_READ'], page(billing, 'InvoicesPage')) },
      { path: 'invoices/new', element: guard(['INVOICE_WRITE'], page(billing, 'CreateInvoicePage')) },
      { path: 'invoices/:id', element: guard(['INVOICE_READ'], page(billing, 'InvoiceDetailPage')) },
      { path: 'payments', element: guard(['PAYMENT_READ'], page(payments, 'PaymentsPage')) },
      { path: 'payments/:id', element: guard(['PAYMENT_READ'], page(payments, 'PaymentDetailPage')) },
      { path: 'returns', element: guard(['RETURN_READ'], page(returns, 'ReturnsPage')) },
      { path: 'reports', element: guard(['REPORT_READ'], page(reports, 'ReportsPage')) },
      { path: 'users', element: guard(['USER_MANAGE'], page(users, 'UsersPage')) },
      { path: 'settings', element: guard(['SETTINGS_MANAGE'], page(settings, 'SettingsPage')) },
      { path: 'audit', element: guard(['AUDIT_READ'], page(audit, 'AuditPage')) },
      { path: '*', element: <NotFound /> },
    ] }],
  },
  {
    path: '/shop',
    element: <RequireAuth kind="customer"><CustomerShell /></RequireAuth>,
    children: [{ errorElement: <RouteError />, children: [
      { index: true, element: page(portal, 'CustomerHomePage') },
      { path: 'products', element: page(portal, 'CatalogPage') },
      { path: 'products/:id', element: page(portal, 'CatalogProductPage') },
      { path: 'cart', element: page(portal, 'CartPage') },
      { path: 'checkout', element: page(portal, 'CheckoutPage') },
      { path: 'orders', element: page(portalOrders, 'MyOrdersPage') },
      { path: 'orders/:id', element: page(portalOrders, 'MyOrderDetailPage') },
      { path: 'invoices', element: page(portalAccount, 'MyInvoicesPage') },
      { path: 'invoices/:id', element: page(portalAccount, 'MyInvoiceDetailPage') },
      { path: 'payments', element: page(portalAccount, 'MyPaymentsPage') },
      { path: 'outstanding', element: page(portalAccount, 'MyOutstandingPage') },
      { path: 'returns', element: page(portalAccount, 'MyReturnsPage') },
      { path: 'profile', element: page(portalAccount, 'ProfilePage') },
      { path: '*', element: <NotFound /> },
    ] }],
  },
  { path: '*', element: <NotFound /> },
  ],
}])
