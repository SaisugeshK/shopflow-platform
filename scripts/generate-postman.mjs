#!/usr/bin/env node
/**
 * Generates docs/postman/shopflow-platform.postman_collection.json from the OpenAPI document (§53).
 *
 *   node scripts/generate-postman.mjs [openapi.json path or URL]   (default: docs/openapi/openapi.json)
 *
 * Every request gets tests for HTTP status, the standard envelope and the error format; the auth folder stores the
 * access/refresh tokens and list/create requests store IDs into environment variables.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const source = process.argv[2] ?? 'docs/openapi/openapi.json'
const spec = source.startsWith('http') ? await (await fetch(source)).json() : JSON.parse(readFileSync(source, 'utf8'))
const schemas = spec.components?.schemas ?? {}

const PARAM_VARS = {
  id: null, customerId: 'customerId', productId: 'productId', orderId: 'orderId', invoiceId: 'invoiceId', paymentId: 'paymentId',
  addressId: 'addressId', imageId: 'imageId', messageId: 'messageId', provider: 'paymentProvider', name: 'reportName',
}
const RESOURCE_ID_VAR = {
  customers: 'customerId', products: 'productId', orders: 'orderId', invoices: 'invoiceId', payments: 'paymentId',
  suppliers: 'supplierId', purchases: 'purchaseId', 'purchase-returns': 'purchaseReturnId', 'sales-returns': 'salesReturnId',
  users: 'userId', categories: 'categoryId', 'audit-logs': 'auditLogId', 'bank-accounts': 'bankAccountId',
}
const EXAMPLES = {
  mobileNumber: '+919000000001', otp: '123456', shopName: 'Sample Traders', contactName: 'Sample Contact', fullName: 'Sample Admin',
  addressLine1: '1 Market Road', city: 'Chennai', state: 'Tamil Nadu', pincode: '600001', reason: 'Example reason', quantity: '1',
  amount: '100.00', rate: '100.00', price: '100.00', sellingPrice: '100.00', purchasePrice: '80.00', gstRate: '18', unit: 'PCS',
  paymentMethod: 'CASH', method: 'CASH', paymentType: 'CASH', name: 'Sample', status: 'DELIVERED', outcome: 'SUCCESS',
}

function ref(s) {
  return s?.$ref ? schemas[s.$ref.split('/').pop()] : s
}

function sample(schema, key, depth = 0) {
  const s = ref(schema)
  if (!s || depth > 4) return undefined
  if (key && EXAMPLES[key] !== undefined) return EXAMPLES[key]
  if (s.enum) return s.enum[0]
  const type = Array.isArray(s.type) ? s.type.find((t) => t !== 'null') : s.type
  if (type === 'object' || s.properties) {
    const out = {}
    const required = new Set(s.required ?? [])
    for (const [k, v] of Object.entries(s.properties ?? {})) {
      if (required.has(k) || depth === 0) {
        const val = sample(v, k, depth + 1)
        if (val !== undefined) out[k] = val
      }
    }
    return out
  }
  if (type === 'array') return [sample(s.items, undefined, depth + 1)].filter((x) => x !== undefined)
  if (type === 'string') {
    if (s.format === 'uuid') return key && key.endsWith('Id') ? `{{${key}}}` : '{{id}}'
    if (s.format === 'date') return '2026-04-01'
    if (s.format === 'date-time') return '2026-04-01T10:00:00Z'
    return 'string'
  }
  if (type === 'number' || type === 'integer') return 1
  if (type === 'boolean') return false
  return undefined
}

function pathToPostman(path) {
  const segments = path.split('/').filter(Boolean)
  let prev = ''
  const mapped = segments.map((seg) => {
    const m = /^\{(.+)\}$/.exec(seg)
    let out = seg
    if (m) {
      const p = m[1]
      const variable = PARAM_VARS[p] === null || PARAM_VARS[p] === undefined ? RESOURCE_ID_VAR[prev] ?? p : PARAM_VARS[p]
      out = `{{${variable}}}`
    }
    prev = seg
    return out
  })
  return { raw: `{{baseUrl}}/${mapped.join('/')}`, host: ['{{baseUrl}}'], path: mapped }
}

function testsFor(method, path, successCode, isBinary) {
  // Reads (and sign-in) must succeed. Generated write requests use placeholder bodies, so they assert the API
  // contract instead: never a server error, and a well-formed success or error envelope. The Workflow folder asserts
  // exact statuses with real data.
  // Customer-only endpoints answer 403 to staff tokens; the collection signs in as the Owner.
  const customerOnly = ['/api/v1/my/', '/api/v1/cart', '/api/v1/catalog', '/api/v1/dashboard/customer', '/api/v1/customer-registration'].some((p) => path.startsWith(p))
  // Detail lookups depend on data captured earlier in the run, so they may legitimately be 404.
  const strict = (method === 'get' && !customerOnly && !path.includes('{') && !path.startsWith('/api/v1/dev/')) || path.startsWith('/api/v1/auth/otp')
  const lines = [strict
    ? `pm.test("status is ${successCode}", () => pm.response.to.have.status(${successCode}));`
    : `pm.test("no server error (${successCode} expected with valid data)", () => pm.expect(pm.response.code).to.be.below(500));`,
  ]
  if (isBinary) return lines
  lines.push(
    'const body = pm.response.json();',
    'pm.test("standard envelope", () => { pm.expect(body).to.have.property("success"); pm.expect(body).to.have.property("requestId"); });',
    'if (body.success === false) { pm.test("error format", () => { pm.expect(body.error).to.have.property("code"); pm.expect(body.error).to.have.property("message"); }); }',
    'if (body.pagination) { pm.test("pagination", () => { pm.expect(body.pagination).to.have.keys("page","pageSize","totalItems","totalPages"); }); }',
  )
  if (path === '/api/v1/auth/otp/request') lines.push('if (body.data) pm.environment.set("otpRequestId", body.data.requestId);')
  if (path === '/api/v1/auth/otp/verify' || path === '/api/v1/auth/refresh') {
    lines.push('if (body.data && body.data.accessToken) { pm.environment.set("accessToken", body.data.accessToken); pm.environment.set("refreshToken", body.data.refreshToken); pm.environment.set("userId", body.data.user.id); }')
  }
  const resource = path.split('/')[3]
  const idVar = RESOURCE_ID_VAR[resource]
  if (idVar && method === 'get' && !path.includes('{')) lines.push(`if (Array.isArray(body.data) && body.data.length) pm.environment.set("${idVar}", body.data[0].id ?? body.data[0].productId);`)
  if (idVar && method === 'post' && !path.includes('{')) lines.push(`if (body.data && body.data.id) pm.environment.set("${idVar}", body.data.id);`)
  return lines
}

const AUTH_ORDER = ['/api/v1/auth/otp/request', '/api/v1/auth/otp/verify', '/api/v1/auth/me', '/api/v1/auth/refresh', '/api/v1/auth/logout']
const folders = new Map()
for (const [path, ops] of Object.entries(spec.paths)) {
  for (const [method, op] of Object.entries(ops)) {
    if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue
    const tag = op.tags?.[0] ?? 'Other'
    const successCode = Number(Object.keys(op.responses ?? { 200: {} }).find((c) => c.startsWith('2')) ?? 200)
    const isBinary = Object.values(op.responses?.[successCode]?.content ?? {}).length > 0 &&
      Object.keys(op.responses[successCode].content).every((ct) => !ct.includes('json') && ct !== '*/*')
    const url = pathToPostman(path)
    const query = (op.parameters ?? []).filter((p) => p.in === 'query').map((p) => ({ key: p.name, value: '', disabled: true, description: p.description }))
    if (query.length) url.query = query
    const headers = (op.parameters ?? []).filter((p) => p.in === 'header').map((p) => ({ key: p.name, value: p.name === 'Idempotency-Key' ? '{{$guid}}' : '', disabled: p.name !== 'Idempotency-Key' }))
    const bodySchema = op.requestBody?.content?.['application/json']?.schema
    const multipart = op.requestBody?.content?.['multipart/form-data']
    const request = {
      method: method.toUpperCase(),
      header: [...headers, { key: 'X-Client-Type', value: 'postman' }],
      url,
      description: [op.summary, op.description].filter(Boolean).join('\n\n'),
    }
    if (op.security?.length || (!path.startsWith('/api/v1/auth/') && !path.includes('/webhook'))) {
      request.auth = { type: 'bearer', bearer: [{ key: 'token', value: '{{accessToken}}', type: 'string' }] }
    } else {
      request.auth = { type: 'noauth' }
    }
    if (bodySchema) {
      let body = sample(bodySchema)
      if (path === '/api/v1/auth/otp/verify') body = { mobileNumber: '{{mobileNumber}}', otp: '{{otp}}', requestId: '{{otpRequestId}}' }
      if (path === '/api/v1/auth/otp/request') body = { mobileNumber: '{{mobileNumber}}' }
      if (path === '/api/v1/auth/refresh') body = { refreshToken: '{{refreshToken}}' }
      request.body = { mode: 'raw', raw: JSON.stringify(body ?? {}, null, 2), options: { raw: { language: 'json' } } }
    } else if (multipart) {
      request.body = { mode: 'formdata', formdata: [{ key: 'file', type: 'file', src: [] }] }
    }
    const events = [{ listen: 'test', script: { type: 'text/javascript', exec: testsFor(method, path, successCode, isBinary) } }]
    if (path === '/api/v1/auth/otp/verify') {
      // Development only: read the mock OTP so the collection runs unattended. In other environments set {{otp}} manually.
      events.push({ listen: 'prerequest', script: { type: 'text/javascript', exec: [
        'if (!pm.environment.get("otpManual")) {',
        '  pm.sendRequest(pm.environment.get("baseUrl") + "/api/v1/dev/otp/latest?mobileNumber=" + encodeURIComponent(pm.environment.get("mobileNumber")), (err, res) => {',
        '    if (!err && res.code === 200) pm.environment.set("otp", res.json().data.otp);',
        '  });',
        '}',
      ] } })
    }
    const isWrite = method !== 'get' && !path.startsWith('/api/v1/auth/')
    if (isWrite) {
      // Generated write requests carry placeholder bodies. They are reference examples and never run automatically
      // (set runWriteExamples=true to send them, only against a disposable database).
      events.push({ listen: 'prerequest', script: { type: 'text/javascript', exec: ['if (pm.environment.get("runWriteExamples") !== "true") pm.execution.skipRequest();'] } })
    }
    const item = { name: op.summary ?? `${method.toUpperCase()} ${path}`, request, event: events, _order: AUTH_ORDER.indexOf(path) }
    if (!folders.has(tag)) folders.set(tag, [])
    folders.get(tag).push(item)
  }
}

const ORDER = ['Authentication', 'Customer Registration', 'Customers', 'My Account', 'Products', 'Categories', 'Catalog', 'Suppliers', 'Purchases', 'Stock',
  'Orders', 'Cart', 'Invoices', 'Payments', 'Sales Returns', 'Reports', 'Dashboard', 'Business Settings', 'Users', 'Audit', 'Notifications']
const names = [...folders.keys()].sort((a, b) => ((ORDER.indexOf(a) + 1) || 99) - ((ORDER.indexOf(b) + 1) || 99))


// ---------------------------------------------------------------- curated workflow (strict)
function step(name, method, path, body, tests) {
  return {
    name,
    request: {
      method, header: [{ key: 'Content-Type', value: 'application/json' }, { key: 'Idempotency-Key', value: '{{$guid}}' }],
      auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{accessToken}}', type: 'string' }] },
      url: { raw: `{{baseUrl}}${path}`, host: ['{{baseUrl}}'], path: path.split('/').filter(Boolean) },
      ...(body ? { body: { mode: 'raw', raw: JSON.stringify(body, null, 2), options: { raw: { language: 'json' } } } } : {}),
    },
    event: [{ listen: 'test', script: { type: 'text/javascript', exec: ['const body = pm.response.json();', ...tests] } }],
  }
}
const workflowFolder = {
  name: 'Workflow (order to cash)',
  description: 'Runs after Authentication as the Owner (dev seed). Creates a product, a staff order for the seeded customer, accepts it, invoices it, delivers it and records the payment.',
  item: [
    step('List categories', 'GET', '/api/v1/categories', null, ['pm.test("200", () => pm.response.to.have.status(200));', 'pm.environment.set("categoryId", body.data[0].id);']),
    step('List customers (approved)', 'GET', '/api/v1/customers?status=APPROVED', null, ['pm.test("200", () => pm.response.to.have.status(200));', 'pm.environment.set("customerId", body.data[0].id);']),
    step('Create product', 'POST', '/api/v1/products', { name: 'Postman Test Product', categoryId: '{{categoryId}}', unit: 'PCS', hsnCode: '1905', purchasePrice: '80.00', sellingPrice: '100.00', gstRate: '18', openingStock: '50' },
      ['pm.test("201", () => pm.response.to.have.status(201));', 'pm.environment.set("productId", body.data.id);', 'pm.test("opening stock posted", () => pm.expect(body.data.onHand).to.eql(50));']),
    step('Place staff order', 'POST', '/api/v1/orders', { customerId: '{{customerId}}', paymentMethod: 'CASH', items: [{ productId: '{{productId}}', quantity: '2' }] },
      ['pm.test("201", () => pm.response.to.have.status(201));', 'pm.environment.set("orderId", body.data.id);', 'pm.test("backend totals", () => pm.expect(body.data.grandTotal).to.eql(236));']),
    step('Accept order', 'POST', '/api/v1/orders/{{orderId}}/accept', {}, ['pm.test("200", () => pm.response.to.have.status(200));', 'pm.test("accepted", () => pm.expect(body.data.status).to.eql("ACCEPTED"));']),
    step('Generate invoice', 'POST', '/api/v1/invoices', { orderId: '{{orderId}}', generate: true },
      ['pm.test("201", () => pm.response.to.have.status(201));', 'pm.environment.set("invoiceId", body.data.id);', 'pm.test("numbered", () => pm.expect(body.data.invoiceNumber).to.include("INV/"));']),
    step('Packing', 'POST', '/api/v1/orders/{{orderId}}/packing', {}, ['pm.test("200", () => pm.response.to.have.status(200));']),
    step('Ready for delivery', 'POST', '/api/v1/orders/{{orderId}}/ready-for-delivery', {}, ['pm.test("200", () => pm.response.to.have.status(200));']),
    step('Out for delivery', 'POST', '/api/v1/orders/{{orderId}}/out-for-delivery', { deliveryPerson: 'Postman' }, ['pm.test("200", () => pm.response.to.have.status(200));']),
    step('Deliver', 'POST', '/api/v1/orders/{{orderId}}/deliver', {}, ['pm.test("200", () => pm.response.to.have.status(200));', 'pm.test("delivered", () => pm.expect(body.data.status).to.eql("DELIVERED"));']),
    // Customer advances are applied automatically at invoicing, so pay whatever is still outstanding.
    step('Read invoice balance', 'GET', '/api/v1/invoices/{{invoiceId}}', null,
      ['pm.test("200", () => pm.response.to.have.status(200));', 'pm.environment.set("invoiceOutstanding", String(body.data.outstanding));']),
    { ...step('Record payment', 'POST', '/api/v1/payments', { customerId: '{{customerId}}', invoiceId: '{{invoiceId}}', amount: '{{invoiceOutstanding}}', method: 'CASH' },
      ['pm.test("201", () => pm.response.to.have.status(201));', 'pm.environment.set("paymentId", body.data.id);']),
      event: [
        { listen: 'prerequest', script: { type: 'text/javascript', exec: ['if (Number(pm.environment.get("invoiceOutstanding")) <= 0) pm.execution.skipRequest();'] } },
        { listen: 'test', script: { type: 'text/javascript', exec: ['const body = pm.response.json();', 'pm.test("201", () => pm.response.to.have.status(201));', 'pm.environment.set("paymentId", body.data.id);'] } },
      ] },
    step('Invoice is paid', 'GET', '/api/v1/invoices/{{invoiceId}}', null, ['pm.test("200", () => pm.response.to.have.status(200));', 'pm.test("paid", () => pm.expect(body.data.status).to.eql("PAID"));']),
    step('Validation error format', 'POST', '/api/v1/products', { name: '' },
      ['pm.test("400", () => pm.response.to.have.status(400));', 'pm.test("VALIDATION_ERROR", () => pm.expect(body.error.code).to.eql("VALIDATION_ERROR"));', 'pm.test("details", () => pm.expect(body.error.details).to.be.an("array"));']),
  ],
}

const collection = {
  info: {
    name: 'ShopFlow Platform API',
    description: 'Generated from docs/openapi/openapi.yaml by scripts/generate-postman.mjs. Run "Authentication → Request an OTP", read the OTP (dev: GET /api/v1/dev/otp/latest), set {{otp}}, then "Verify an OTP and sign in" to store tokens.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  item: [
    ...names.slice(0, 1).map((n) => ({ name: n, item: folders.get(n).sort((a, b) => a._order - b._order).map(({ _order, ...rest }) => rest) })),
    workflowFolder,
    ...names.slice(1).map((n) => ({ name: n, item: folders.get(n).map(({ _order, ...rest }) => rest) })),
  ],
  variable: [{ key: 'baseUrl', value: 'http://localhost:8080' }],
}
writeFileSync('docs/postman/shopflow-platform.postman_collection.json', JSON.stringify(collection, null, 2) + '\n')

const environment = {
  name: 'ShopFlow Local',
  values: ['baseUrl', 'accessToken', 'refreshToken', 'businessId', 'userId', 'customerId', 'productId', 'orderId', 'invoiceId', 'paymentId',
    'supplierId', 'purchaseId', 'categoryId', 'mobileNumber', 'otp', 'otpRequestId', 'paymentProvider', 'reportName', 'runWriteExamples', 'invoiceOutstanding'].map((key) => ({
    key,
    value: { baseUrl: 'http://localhost:8080', businessId: '00000000-0000-0000-0000-000000000001', mobileNumber: '+919000000001', paymentProvider: 'mock', reportName: 'sales', runWriteExamples: 'false' }[key] ?? '',
    enabled: true,
  })),
}
writeFileSync('docs/postman/shopflow-platform.local.postman_environment.json', JSON.stringify(environment, null, 2) + '\n')
const count = names.reduce((n, f) => n + folders.get(f).length, 0)
console.log(`Wrote ${count} requests in ${names.length} folders`)
