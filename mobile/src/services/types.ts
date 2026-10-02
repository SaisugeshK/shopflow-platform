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
}

export interface Invoice {
  id: string
  invoiceNumber?: string
  invoiceType: string
  source: 'ORDER' | 'MANUAL'
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
