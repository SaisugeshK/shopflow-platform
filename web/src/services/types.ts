/** Response shapes of the ShopFlow API (see docs/openapi/openapi.yaml). Money values arrive as numbers with 2 decimals. */

export type OrderStatus = 'PLACED' | 'ACCEPTED' | 'PACKING' | 'READY_FOR_DELIVERY' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'COMPLETED' | 'CANCELLED' | 'REJECTED' | 'DELIVERY_FAILED'
export type OrderPaymentStatus = 'PENDING' | 'PAID' | 'PARTIALLY_PAID' | 'CREDIT' | 'FAILED' | 'REFUNDED' | 'CANCELLED'
export type PaymentMethod = 'CASH' | 'ONLINE' | 'UPI' | 'BANK_TRANSFER' | 'CREDIT' | 'OTHER'
export type InvoiceStatus = 'DRAFT' | 'GENERATED' | 'SENT' | 'PARTIALLY_PAID' | 'PAID' | 'CREDIT' | 'CANCELLED'
export type CustomerStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'BLOCKED'
export type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK'

export interface Address {
  id: string
  label?: string
  addressLine1: string
  addressLine2?: string
  city: string
  state: string
  stateCode: string
  pincode: string
  isDefault: boolean
}

export interface CreditProfile {
  creditEnabled: boolean
  creditLimit: number
  creditDays: number
  creditPolicyOverride?: 'BLOCK' | 'REQUIRE_ADMIN_APPROVAL' | 'ALLOW'
}

export interface Outstanding {
  ledgerBalance: number
  invoiceOutstanding: number
  overdueAmount: number
  openInvoiceCount: number
  oldestDueDate?: string
  creditEnabled: boolean
  creditLimit: number
  creditDays: number
  availableCredit: number
  creditPolicy: string
}

export interface CustomerSummary {
  id: string
  customerCode: string
  shopName: string
  contactName: string
  mobileNumber: string
  gstin?: string
  status: CustomerStatus
  city?: string
  outstanding: number
  creditLimit: number
  creditDays: number
  totalSales: number
  lastTransactionAt?: string
  createdAt: string
}

export interface CustomerDetail {
  agentId?: string
  id: string
  customerCode: string
  shopName: string
  contactName: string
  mobileNumber: string
  alternateMobile?: string
  email?: string
  gstin?: string
  pan?: string
  status: CustomerStatus
  statusReason?: string
  statusChangedAt?: string
  notes?: string
  hasLogin: boolean
  addresses: Address[]
  credit: CreditProfile
  outstanding: Outstanding
  createdAt: string
  updatedAt: string
}

export interface LedgerEntry {
  id: string
  date: string
  entryType: string
  referenceType: string
  referenceId: string
  referenceNumber: string
  debit: number
  credit: number
  balance: number
  narration?: string
  createdAt: string
}

export interface ProductImage {
  id: string
  fileId: string
  url: string
  primary: boolean
}

export interface Product {
  id: string
  sku: string
  name: string
  categoryId: string
  categoryName?: string
  brandId?: string
  brand?: string
  description?: string
  hsnCode?: string
  unit: string
  purchasePrice: number
  sellingPrice: number
  mrp?: number
  gstRate: number
  minimumStock: number
  onHand: number
  reserved: number
  available: number
  stockStatus: StockStatus
  active: boolean
  featured: boolean
  imageUrl?: string
  images: ProductImage[]
  createdAt: string
  updatedAt: string
  // Industry options (§0B.7)
  barcode?: string
  decimalQuantity: boolean
  pricingMode: PricingMode
  mrpDiscountPercent?: number
  trackBatches: boolean
  trackSerials: boolean
  warrantyMonths?: number
  variantGroup: boolean
  parentId?: string
  variantAttributes?: string
  units: UnitOption[]
}

export type PricingMode = 'FIXED' | 'MRP' | 'DAILY_RATE'

/** 1 unit = factor × the product's base unit. */
export interface UnitOption {
  unit: string
  factor: number
  barcode?: string
}

export interface CatalogProduct {
  id: string
  sku: string
  name: string
  categoryId: string
  categoryName?: string
  brand?: string
  description?: string
  hsnCode?: string
  unit: string
  price: number
  mrp?: number
  gstRate: number
  customPrice: boolean
  stockStatus: StockStatus
  availableQuantity?: number
  featured: boolean
  imageUrl?: string
  images: string[]
  decimalQuantity: boolean
  units: { unit: string; factor: number; price: number }[]
  parentId?: string
  variantAttributes?: string
}

export interface Category {
  id: string
  name: string
  description?: string
  parentId?: string
  sortOrder: number
  active: boolean
  productCount: number
}

export interface StockRow {
  productId: string
  sku: string
  productName: string
  category: string
  unit: string
  active: boolean
  onHand: number
  reserved: number
  available: number
  minimumStock: number
  stockValue: number
  status: StockStatus
  updatedAt: string
}

export interface MovementRow {
  id: string
  productId: string
  sku: string
  productName: string
  movementType: string
  direction: 'IN' | 'OUT'
  quantity: number
  balanceAfter: number
  referenceType: string
  referenceId: string
  referenceNumber?: string
  reason?: string
  createdAt: string
}

export interface SupplierAddress {
  addressLine1: string
  addressLine2?: string
  city: string
  state: string
  stateCode?: string
  pincode: string
}

export interface Supplier {
  id: string
  supplierCode: string
  name: string
  contactPerson?: string
  mobileNumber?: string
  email?: string
  gstin?: string
  pan?: string
  paymentTerms?: string
  creditDays: number
  active: boolean
  address?: SupplierAddress
  outstanding: number
  createdAt: string
}

export interface PurchaseItem {
  id: string
  lineNumber: number
  productId: string
  productName: string
  hsnCode?: string
  unit: string
  quantity: number
  rate: number
  discountPercent: number
  discountAmount: number
  taxRate: number
  taxableAmount: number
  cgstAmount: number
  sgstAmount: number
  igstAmount: number
  lineTotal: number
  returnedQuantity: number
  unitFactor: number
  batchNumber?: string
  mfgDate?: string
  expiryDate?: string
  serialNumbers: string[]
}

export interface Purchase {
  id: string
  purchaseNumber: string
  purchaseDate: string
  supplierId: string
  supplierName: string
  supplierInvoiceNumber?: string
  supplierInvoiceDate?: string
  status: 'DRAFT' | 'POSTED' | 'CANCELLED'
  paymentStatus: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID'
  interState: boolean
  subtotal: number
  discountTotal: number
  taxableTotal: number
  cgstTotal: number
  sgstTotal: number
  igstTotal: number
  roundOff: number
  grandTotal: number
  paidAmount: number
  balanceDue?: number
  notes?: string
  postedAt?: string
  cancelReason?: string
  items?: PurchaseItem[]
  payments?: { id: string; paymentNumber: string; amount: number; method: string; referenceNumber?: string; paidAt: string; notes?: string }[]
  createdAt: string
}

export interface PurchaseReturn {
  id: string
  returnNumber: string
  purchaseId: string
  purchaseNumber: string
  supplierId: string
  supplierName: string
  returnDate: string
  status: 'DRAFT' | 'POSTED'
  reason: string
  taxableTotal: number
  taxTotal: number
  roundOff: number
  grandTotal: number
  postedAt?: string
  items: { id: string; purchaseItemId: string; productId: string; productName: string; quantity: number; rate: number; taxRate: number; taxableAmount: number; taxAmount: number; lineTotal: number }[]
  createdAt: string
}

export interface CartLine {
  id: string
  productId: string
  sku: string
  productName: string
  unit: string
  imageUrl?: string
  quantity: number
  unitPrice: number
  mrp?: number
  discountAmount: number
  taxRate: number
  taxableAmount: number
  taxAmount: number
  lineTotal: number
  stockStatus: StockStatus
  issue?: string
  unitFactor: number
  schemeName?: string
  freeQuantity?: number
}

export interface Cart {
  id: string
  items: CartLine[]
  itemCount: number
  subtotal: number
  discountTotal: number
  taxableTotal: number
  cgstTotal: number
  sgstTotal: number
  igstTotal: number
  roundOff: number
  grandTotal: number
  interState: boolean
  checkoutReady: boolean
}

export interface PaymentIntent {
  paymentId: string
  paymentNumber: string
  provider: string
  providerOrderId: string
  amount: number
  currency: string
  checkoutKey: string
  status: string
}

export interface OrderItem {
  id: string
  lineNumber: number
  productId: string
  sku: string
  productName: string
  hsnCode?: string
  unit: string
  orderedQuantity: number
  acceptedQuantity: number
  packedQuantity: number
  deliveredQuantity: number
  cancelledQuantity: number
  returnedQuantity: number
  invoicedQuantity: number
  pendingQuantity: number
  rate: number
  discountAmount: number
  taxRate: number
  taxableAmount: number
  taxAmount: number
  lineTotal: number
  unitFactor: number
  freeItem: boolean
  schemeName?: string
}

export interface Order {
  id: string
  orderNumber: string
  customerId: string
  customerName: string
  customerCode: string
  status: OrderStatus
  paymentStatus: OrderPaymentStatus
  paymentMethod: PaymentMethod
  creditApprovalStatus: 'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'REJECTED'
  source: string
  deliveryName: string
  deliveryAddress: string
  contactMobile: string
  orderNote?: string
  interState: boolean
  subtotal: number
  discountTotal: number
  taxableTotal: number
  cgstTotal: number
  sgstTotal: number
  igstTotal: number
  roundOff: number
  grandTotal: number
  paidAmount: number
  balanceDue: number
  placedAt: string
  cancelReason?: string
  rejectReason?: string
  customerCanCancel: boolean
  items?: OrderItem[]
  invoices?: { id: string; invoiceNumber?: string; status: InvoiceStatus; grandTotal: number; outstanding: number }[]
  delivery?: { attemptNumber: number; deliveryPerson?: string; deliveryPersonMobile?: string; vehicleNumber?: string; notes?: string; dispatchedAt?: string; deliveredAt?: string; failedAt?: string; failureReason?: string; receivedBy?: string }
  paymentIntent?: PaymentIntent
  updatedAt: string
}

export interface StatusHistory {
  previousStatus?: string
  newStatus: string
  changedBy?: string
  changedAt: string
  note?: string
}

export interface Party {
  name?: string
  contactName?: string
  address?: string
  city?: string
  state?: string
  stateCode?: string
  pincode?: string
  phone?: string
  email?: string
  gstin?: string
  pan?: string
}

export interface InvoiceItem {
  id: string
  lineNumber: number
  productId: string
  productName: string
  description?: string
  sku?: string
  hsnCode?: string
  unit: string
  quantity: number
  rate: number
  discountPercent: number
  discountAmount: number
  taxRate: number
  taxableAmount: number
  cgstAmount: number
  sgstAmount: number
  igstAmount: number
  lineTotal: number
  returnedQuantity: number
  unitFactor: number
  freeItem: boolean
  schemeName?: string
  serialNumbers: string[]
  batchDetails?: string
}

export interface InvoiceCharge {
  id: string
  type: string
  description: string
  sacCode?: string
  amount: number
  taxRate: number
  cgstAmount: number
  sgstAmount: number
  igstAmount: number
  total: number
}

export interface Invoice {
  id: string
  invoiceNumber?: string
  invoiceType: string
  source: 'ORDER' | 'MANUAL' | 'CHALLAN'
  status: InvoiceStatus
  customerId: string
  orderId?: string
  orderNumber?: string
  invoiceDate: string
  dueDate?: string
  paymentType: PaymentMethod
  paymentTerms?: string
  buyerOrderNumber?: string
  transport?: string
  vehicleNumber?: string
  destination?: string
  notes?: string
  interState: boolean
  seller: Party
  buyer: Party
  subtotal: number
  discountTotal: number
  taxableTotal: number
  cgstTotal: number
  sgstTotal: number
  igstTotal: number
  roundOff: number
  grandTotal: number
  paidAmount: number
  creditedAmount: number
  outstanding: number
  amountInWords?: string
  taxAmountInWords?: string
  einvoiceStatus: string
  irn?: string
  overdue: boolean
  generatedAt?: string
  sentAt?: string
  cancelReason?: string
  items?: InvoiceItem[]
  taxSummary?: { hsnCode?: string; taxRate: number; taxableAmount: number; cgstAmount: number; sgstAmount: number; igstAmount: number; totalTax: number }[]
  creditNotes?: { id: string; creditNoteNumber: string; noteDate: string; reasonType: string; reason: string; taxableTotal: number; taxTotal: number; grandTotal: number }[]
  createdAt: string
  charges?: InvoiceCharge[]
  chargesTotal: number
  /** Project, agent commission (staff only), e-way bill and delivery challan (§0B.9). */
  trade?: InvoiceTradeInfo | null
}

export interface InvoiceTradeInfo {
  projectId?: string
  projectName?: string
  agentId?: string
  agentName?: string
  commissionPercent?: number
  commissionAmount?: number
  commissionPaidAt?: string
  ewayBillNumber?: string
  ewayBillDate?: string
  ewayValidUntil?: string
  ewayDistanceKm?: number
  ewayTestOnly: boolean
  deliveryChallanId?: string
  challanNumber?: string
}

// ---------------------------------------------------------------- trade documents (§0B.9)

export interface QuotationItem {
  id: string
  lineNumber: number
  productId: string
  productName: string
  hsnCode?: string
  unit: string
  unitFactor: number
  quantity: number
  rate: number
  discountPercent: number
  taxRate: number
  taxableAmount: number
  taxAmount: number
  lineTotal: number
}

export type QuotationStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CONVERTED' | 'CANCELLED'

export interface Quotation {
  id: string
  quotationNumber: string
  customerId: string
  customerName: string
  projectId?: string
  projectName?: string
  status: QuotationStatus
  quoteDate: string
  validUntil?: string
  notes?: string
  interState: boolean
  subtotal: number
  discountTotal: number
  taxableTotal: number
  taxTotal: number
  grandTotal: number
  orderId?: string
  orderNumber?: string
  sentAt?: string
  decidedAt?: string
  decisionNote?: string
  createdAt: string
  items?: QuotationItem[] | null
}

export interface ChallanItem {
  id: string
  lineNumber: number
  productId: string
  productName: string
  hsnCode?: string
  unit: string
  unitFactor: number
  quantity: number
  rate: number
  taxRate: number
  batchDetails?: string
  serialNumbers: string[]
}

export interface DeliveryChallan {
  id: string
  challanNumber: string
  customerId: string
  customerName: string
  projectId?: string
  projectName?: string
  challanDate: string
  status: 'ISSUED' | 'INVOICED' | 'CANCELLED'
  purpose: 'SUPPLY' | 'APPROVAL' | 'JOB_WORK' | 'OTHER'
  vehicleNumber?: string
  transport?: string
  destination?: string
  notes?: string
  totalValue: number
  invoiceId?: string
  invoiceNumber?: string
  cancelReason?: string
  createdAt: string
  items?: ChallanItem[] | null
}

export interface JobWorkLine {
  id: string
  direction: 'ISSUE' | 'RECEIVE'
  productId: string
  productName: string
  unit: string
  quantity: number
  returnedQuantity: number
  consumedQuantity: number
  pendingQuantity: number
  lineDate: string
}

export interface JobWork {
  id: string
  jobNumber: string
  supplierId?: string
  jobWorkerName: string
  process: string
  issueDate: string
  expectedDate?: string
  status: 'OPEN' | 'PARTIAL' | 'CLOSED' | 'CANCELLED'
  notes?: string
  charges: number
  createdAt: string
  lines?: JobWorkLine[] | null
}

export interface Agent {
  id: string
  name: string
  mobileNumber?: string
  commissionPercent: number
  active: boolean
  customerCount: number
  pendingCommission: number
  paidCommission: number
}

export interface CommissionRow {
  invoiceId: string
  invoiceNumber: string
  invoiceDate: string
  invoiceStatus: string
  customerId: string
  customerName: string
  agentId: string
  agentName: string
  taxableTotal: number
  commissionPercent: number
  commissionAmount: number
  paidAt?: string
}

export interface CommissionReport {
  rows: CommissionRow[]
  pending: number
  paid: number
}

export interface Project {
  id: string
  customerId: string
  customerName: string
  name: string
  siteAddress?: string
  budget?: number
  status: 'ACTIVE' | 'CLOSED'
  billed: number
  received: number
  outstanding: number
  invoiceCount: number
  createdAt: string
}

export interface ProjectStatement {
  project: Project
  lines: { type: 'INVOICE' | 'ORDER' | 'CHALLAN' | 'QUOTATION'; id: string; number: string; date?: string; status: string; amount: number; outstanding?: number }[]
}

export interface BatchRow {
  id: string
  productId: string
  productName: string
  sku: string
  unit: string
  batchNumber: string
  mfgDate?: string
  expiryDate?: string
  onHand: number
  daysToExpiry?: number
  status: 'OK' | 'NEAR_EXPIRY' | 'EXPIRED' | 'EMPTY'
}

export interface SerialRow {
  id: string
  productId: string
  productName: string
  serialNumber: string
  status: 'IN_STOCK' | 'SOLD' | 'RETURNED_TO_SUPPLIER' | 'REMOVED'
  purchaseId?: string
  purchaseNumber?: string
  invoiceId?: string
  invoiceNumber?: string
  orderId?: string
  orderNumber?: string
  customerId?: string
  customerName?: string
  soldAt?: string
  warrantyUntil?: string
  underWarranty: boolean
}

export interface Scheme {
  id: string
  name: string
  schemeType: 'BUY_X_GET_Y' | 'QUANTITY_SLAB' | 'VALUE_SLAB'
  productId?: string
  productName?: string
  categoryId?: string
  categoryName?: string
  buyQuantity?: number
  freeQuantity?: number
  minQuantity?: number
  minValue?: number
  discountPercent?: number
  validFrom?: string
  validTo?: string
  active: boolean
  summary: string
  createdAt: string
}

export interface RateRow {
  productId: string
  sku: string
  name: string
  unit: string
  currentPrice: number
  rate?: number
  rateDate?: string
  previousRate?: number
  previousDate?: string
}

export interface WhatsAppMessage {
  id: string
  invoiceId: string
  recipient: string
  status: 'QUEUED' | 'SENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'
  providerMessageId?: string
  failureReason?: string
  retryCount: number
  nextRetryAt?: string
  queuedAt: string
  sentAt?: string
  deliveredAt?: string
  readAt?: string
}

export interface Payment {
  id: string
  paymentNumber: string
  customerId: string
  customerName: string
  invoiceId?: string
  invoiceNumber?: string
  orderId?: string
  orderNumber?: string
  amount: number
  method: PaymentMethod
  status: string
  referenceNumber?: string
  paidAt?: string
  collectedBy?: string
  notes?: string
  provider?: string
  providerOrderId?: string
  failureReason?: string
  allocatedAmount: number
  refundedAmount: number
  unallocatedAmount: number
  cancelReason?: string
  allocations?: { invoiceId: string; invoiceNumber?: string; amount: number; reversed: boolean }[]
  createdAt: string
}

export interface SalesReturn {
  id: string
  returnNumber: string
  invoiceId: string
  invoiceNumber?: string
  orderId?: string
  customerId: string
  customerName: string
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED'
  reason: string
  reviewNote?: string
  requestedAt: string
  reviewedAt?: string
  creditNoteNumber?: string
  creditAmount?: number
  items: { id: string; invoiceItemId: string; productId: string; productName: string; quantity: number; reason?: string }[]
}

export interface ReportColumn {
  key: string
  label: string
  type: 'TEXT' | 'DATE' | 'MONEY' | 'QUANTITY' | 'NUMBER' | 'PERCENT'
}

export interface ReportResult {
  name: string
  title: string
  from: string
  to: string
  columns: ReportColumn[]
  rows: Record<string, string | number | null>[]
  totals: Record<string, number>
}

export interface Notification {
  id: string
  type: string
  title: string
  body?: string
  entityType?: string
  entityId?: string
  read: boolean
  createdAt: string
}

export interface StaffUser {
  id: string
  mobileNumber: string
  fullName: string
  email?: string
  role: string
  status: 'ACTIVE' | 'INACTIVE' | 'BLOCKED'
  extraPermissions: string[]
  effectivePermissions: string[]
  lastLoginAt?: string
  createdAt: string
}

export interface AuditRecord {
  id: string
  action: string
  entityType: string
  entityId?: string
  actorUserId?: string
  actorName?: string
  actorRole?: string
  oldValue?: string
  newValue?: string
  ipAddress?: string
  userAgent?: string
  requestId?: string
  createdAt: string
}

export interface BusinessProfile {
  id: string
  name: string
  legalName?: string
  logoFileId?: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  state?: string
  stateCode?: string
  pincode?: string
  phone?: string
  mobile?: string
  email?: string
  gstin?: string
  pan?: string
  timezone: string
  currency: string
  financialYearStartMonth: number
  termsAndConditions?: string
  authorizedSignatory?: string
}

// ---------------------------------------------------------------- purchase orders & supplier portal (§0B.8)

export type PoStatus = 'DRAFT' | 'SENT' | 'QUOTED' | 'COUNTERED' | 'ACCEPTED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CLOSED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED'

export interface PoLine {
  id: string
  lineNumber: number
  productId?: string
  description: string
  sku?: string
  hsnCode?: string
  unit: string
  unitFactor: number
  quantity: number
  rate: number
  discountPercent: number
  taxRate: number
  taxableAmount: number
  taxAmount: number
  lineTotal: number
  availability: 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE'
  deliveryDate?: string
  lineNote?: string
  substituteNote?: string
  addedBy: 'BUSINESS' | 'SUPPLIER'
  status: 'OPEN' | 'ACCEPTED' | 'REJECTED'
  receivedQuantity: number
  pendingQuantity: number
  trackBatches: boolean
  trackSerials: boolean
}

export interface PoSnapshotLine {
  lineId: string
  lineNumber: number
  description: string
  unit: string
  quantity: number
  rate: number
  discountPercent: number
  taxRate: number
  lineTotal: number
  availability: string
  deliveryDate?: string
  note?: string
  substituteNote?: string
  addedBy: string
  status: string
}

export interface PoRevision {
  id: string
  revision: number
  actorType: 'BUSINESS' | 'SUPPLIER' | 'SYSTEM'
  actorName?: string
  action: string
  note?: string
  grandTotal: number
  createdAt: string
  snapshot?: { status: string; expectedDate?: string; quoteValidUntil?: string; supplierNote?: string; grandTotal: number; lines: PoSnapshotLine[] }
}

export interface PoAttachment {
  id: string
  fileName?: string
  uploadedByType: 'BUSINESS' | 'SUPPLIER'
  createdAt: string
}

export interface GoodsReceipt {
  id: string
  grnNumber: string
  purchaseOrderId: string
  poNumber: string
  receiptDate: string
  supplierInvoiceNumber?: string
  supplierInvoiceDate?: string
  purchaseId?: string
  purchaseNumber?: string
  hasMismatch: boolean
  notes?: string
  createdAt: string
  lines: { id: string; poLineId: string; description: string; receivedQuantity: number; damagedQuantity: number; rate: number; batchNumber?: string; expiryDate?: string; serialNumbers: string[]; mismatchNote?: string }[]
}

export interface PurchaseOrder {
  id: string
  poNumber: string
  supplierId: string
  supplierName: string
  supplierCode: string
  supplierHasPortal: boolean
  status: PoStatus
  orderDate: string
  expectedDate?: string
  quoteValidUntil?: string
  notes?: string
  supplierNote?: string
  interState: boolean
  revision: number
  subtotal: number
  taxableTotal: number
  taxTotal: number
  grandTotal: number
  sentAt?: string
  quotedAt?: string
  acceptedAt?: string
  closedAt?: string
  cancelReason?: string
  createdAt: string
  updatedAt: string
  lines?: PoLine[]
  revisions?: PoRevision[]
  attachments?: PoAttachment[]
  receipts?: GoodsReceipt[]
  businessName: string
}

export interface PortalAccess {
  supplierId: string
  enabled: boolean
  mobileNumber?: string
  userStatus?: string
  lastLoginAt?: string
}

// ---------------------------------------------------------------- SaaS: plans, sign-ups, branches (§0B.14)

/** A plan; missing limits are unlimited. */
export interface Plan {
  code: string
  name: string
  description?: string
  priceMonthly?: number
  maxStaff?: number
  maxProducts?: number
  maxCustomers?: number
  maxInvoicesPerMonth?: number
  maxBranches?: number
  maxStorageMb?: number
  active: boolean
}

export interface Subscription {
  plan: Plan
  usage: { staff: number; products: number; customers: number; invoicesThisMonth: number; branches: number; storageMb: number }
  planChangedAt?: string
}

export interface Signup {
  id: string
  businessName: string
  legalName?: string
  ownerName: string
  ownerMobile: string
  email?: string
  state: string
  stateCode: string
  city?: string
  gstin?: string
  industry: string
  planCode: string
  message?: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  decisionReason?: string
  businessId?: string
  tenantCode?: string
  decidedAt?: string
  createdAt: string
}

export interface Branch {
  id: string
  code: string
  name: string
  kind: 'BRANCH' | 'WAREHOUSE'
  addressLine1?: string
  city?: string
  state?: string
  stateCode?: string
  phone?: string
  isDefault: boolean
  active: boolean
  productsInStock: number
}

export interface BranchStockRow {
  productId: string
  productName: string
  sku: string
  unit: string
  onHand: number
  totalOnHand: number
}

export interface StockTransfer {
  id: string
  transferNumber: string
  fromBranchId: string
  fromBranchName: string
  toBranchId: string
  toBranchName: string
  transferDate: string
  notes?: string
  createdAt: string
  items?: { productId: string; productName: string; unit: string; quantity: number; batchDetails?: string }[] | null
}
