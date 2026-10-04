import { lazy, Suspense } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { createBrowserRouter, Link, Navigate } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { CustomerShell } from '@/components/layout/CustomerShell'
import { EmptyState, Spinner } from '@/components/ui/Feedback'
import { PublicOnly, RequireAuth, RequirePermission } from '@/features/auth/Guards'
import { DomainLoginPage, JoinPage } from '@/features/auth/JoinPage'
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
const platform = () => import('@/features/platform/PlatformPages')
const options = () => import('@/features/options/OptionsPages')
const procurement = () => import('@/features/procurement/PurchaseOrdersPages')
const supplierPortal = () => import('@/features/supplier/SupplierPortal')
const salesDocs = () => import('@/features/trade/SalesDocsPages')
const tradeAccounts = () => import('@/features/trade/TradeAccountsPages')
const portalTrade = () => import('@/features/portal/PortalTrade')
const branches = () => import('@/features/branches/BranchesPages')
const platformSaas = () => import('@/features/platform/PlatformSaasPages')
const signup = () => import('@/features/auth/SignupPage')

function NotFound() {
  return <EmptyState title="Page not found" description="The page you are looking for does not exist." action={<Link to="/" className="btn btn-primary">Go home</Link>} />
}

export const router = createBrowserRouter([{
  errorElement: <RouteError />,
  children: [
  { path: '/', element: <Navigate to="/login" replace /> },
  { path: '/login', element: <PublicOnly><DomainLoginPage /></PublicOnly> },
  { path: '/register', element: <PublicOnly><RegisterPage /></PublicOnly> },
  { path: '/join/:code', element: <JoinPage /> },
  { path: '/signup', element: page(signup, 'SignupPage') },
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
      { path: 'batches', element: guard(['STOCK_READ'], page(options, 'BatchesPage')) },
      { path: 'serials', element: guard(['STOCK_READ'], page(options, 'SerialsPage')) },
      { path: 'daily-rates', element: guard(['PRODUCT_READ'], page(options, 'DailyRatesPage')) },
      { path: 'schemes', element: guard(['PRODUCT_READ'], page(options, 'SchemesPage')) },
      { path: 'purchases', element: guard(['PURCHASE_READ'], page(purchases, 'PurchasesPage')) },
      { path: 'purchases/new', element: guard(['PURCHASE_WRITE'], page(purchases, 'PurchaseFormPage')) },
      { path: 'purchases/:id', element: guard(['PURCHASE_READ'], page(purchases, 'PurchaseDetailPage')) },
      { path: 'purchase-returns', element: guard(['PURCHASE_READ'], page(purchases, 'PurchaseReturnsPage')) },
      { path: 'purchase-orders', element: guard(['PURCHASE_READ'], page(procurement, 'PurchaseOrdersPage')) },
      { path: 'purchase-orders/new', element: guard(['PURCHASE_WRITE'], page(procurement, 'PurchaseOrderFormPage')) },
      { path: 'purchase-orders/:id', element: guard(['PURCHASE_READ'], page(procurement, 'PurchaseOrderDetailPage')) },
      { path: 'customers', element: guard(['CUSTOMER_READ'], page(customers, 'CustomersPage')) },
      { path: 'customers/new', element: guard(['CUSTOMER_WRITE'], page(customers, 'CustomerFormPage')) },
      { path: 'customers/:id', element: guard(['CUSTOMER_READ'], page(customers, 'CustomerDetailPage')) },
      { path: 'suppliers', element: guard(['SUPPLIER_READ'], page(suppliers, 'SuppliersPage')) },
      { path: 'suppliers/:id', element: guard(['SUPPLIER_READ'], page(suppliers, 'SupplierDetailPage')) },
      { path: 'invoices', element: guard(['INVOICE_READ'], page(billing, 'InvoicesPage')) },
      { path: 'invoices/new', element: guard(['INVOICE_WRITE'], page(billing, 'CreateInvoicePage')) },
      { path: 'invoices/:id', element: guard(['INVOICE_READ'], page(billing, 'InvoiceDetailPage')) },
      { path: 'quotations', element: guard(['ORDER_READ'], page(salesDocs, 'QuotationsPage')) },
      { path: 'quotations/new', element: guard(['ORDER_WRITE'], page(salesDocs, 'QuotationFormPage')) },
      { path: 'quotations/:id', element: guard(['ORDER_READ'], page(salesDocs, 'QuotationDetailPage')) },
      { path: 'delivery-challans', element: guard(['INVOICE_READ'], page(salesDocs, 'ChallansPage')) },
      { path: 'delivery-challans/new', element: guard(['INVOICE_WRITE'], page(salesDocs, 'ChallanFormPage')) },
      { path: 'delivery-challans/:id', element: guard(['INVOICE_READ'], page(salesDocs, 'ChallanDetailPage')) },
      { path: 'job-work', element: guard(['STOCK_READ'], page(tradeAccounts, 'JobWorkPage')) },
      { path: 'branches', element: guard(['STOCK_READ'], page(branches, 'BranchesPage')) },
      { path: 'job-work/:id', element: guard(['STOCK_READ'], page(tradeAccounts, 'JobWorkDetailPage')) },
      { path: 'agents', element: guard(['CUSTOMER_READ'], page(tradeAccounts, 'AgentsPage')) },
      { path: 'projects', element: guard(['CUSTOMER_READ'], page(tradeAccounts, 'ProjectsPage')) },
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
    path: '/supplier',
    element: <RequireAuth kind="supplier">{page(supplierPortal, 'SupplierShell')}</RequireAuth>,
    children: [{ errorElement: <RouteError />, children: [
      { index: true, element: page(supplierPortal, 'SupplierOrdersPage') },
      { path: 'orders/:id', element: page(supplierPortal, 'SupplierOrderPage') },
      { path: 'deliveries', element: page(supplierPortal, 'SupplierDeliveriesPage') },
      { path: 'profile', element: page(supplierPortal, 'SupplierProfilePage') },
      { path: '*', element: <NotFound /> },
    ] }],
  },
  {
    path: '/platform',
    element: <RequireAuth kind="platform"><AppShell variant="platform" /></RequireAuth>,
    children: [{ errorElement: <RouteError />, children: [
      { index: true, element: page(platform, 'PlatformOverviewPage') },
      { path: 'tenants', element: page(platform, 'TenantsPage') },
      { path: 'tenants/new', element: page(platform, 'CreateTenantPage') },
      { path: 'tenants/:id', element: page(platform, 'TenantDetailPage') },
      { path: 'industries', element: page(platform, 'IndustriesPage') },
      { path: 'signups', element: page(platformSaas, 'SignupsPage') },
      { path: 'plans', element: page(platformSaas, 'PlansPage') },
      { path: 'admins', element: page(platform, 'PlatformAdminsPage') },
      { path: 'audit', element: page(platform, 'PlatformAuditPage') },
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
      { path: 'quotations', element: page(portalTrade, 'MyQuotationsPage') },
      { path: 'quotations/:id', element: page(portalTrade, 'MyQuotationDetailPage') },
      { path: 'projects', element: page(portalTrade, 'MyProjectsPage') },
      { path: 'profile', element: page(portalAccount, 'ProfilePage') },
      { path: '*', element: <NotFound /> },
    ] }],
  },
  { path: '*', element: <NotFound /> },
  ],
}])
