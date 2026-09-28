#!/usr/bin/env python3
"""
End-to-end API smoke test against a running backend with dev tools enabled (mock providers).

Usage: python scripts/smoke_test.py [base_url]
Exits non-zero on the first failed step. Only standard library is used.
"""
import json
import sys
import time
import urllib.error
import urllib.request
import uuid

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080").rstrip("/")
OWNER, ADMIN, CUSTOMER = "+919000000001", "+919000000002", "+919000000003"


def call(method, path, token=None, body=None, headers=None, raw=False, expect=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            status, payload = resp.status, resp.read()
    except urllib.error.HTTPError as e:
        status, payload = e.code, e.read()
    if expect is not None and status != expect:
        raise AssertionError(f"{method} {path} -> {status}, expected {expect}: {payload[:500]!r}")
    if raw:
        return status, payload
    parsed = json.loads(payload) if payload else None
    if expect is None and status >= 400:
        raise AssertionError(f"{method} {path} -> {status}: {parsed}")
    return parsed


def step(name):
    print(f"  - {name}")


def request_otp(mobile):
    for _ in range(3):
        status, payload = call("POST", "/api/v1/auth/otp/request", body={"mobileNumber": mobile}, raw=True)
        body = json.loads(payload)
        if status == 429 and body["error"]["code"] == "AUTH_OTP_COOLDOWN":
            time.sleep(31)
            continue
        if status >= 400:
            raise AssertionError(f"OTP request failed: {body}")
        return body["data"]
    raise AssertionError("OTP cooldown did not clear")


def login(mobile):
    r = request_otp(mobile)
    otp = call("GET", f"/api/v1/dev/otp/latest?mobileNumber={urllib.request.quote(mobile)}")["data"]["otp"]
    v = call("POST", "/api/v1/auth/otp/verify", body={"mobileNumber": mobile, "otp": otp, "requestId": r["requestId"]})["data"]
    return v["accessToken"]


def main():
    print(f"Smoke test against {BASE}")
    step("health")
    assert call("GET", "/actuator/health")["status"] == "UP"

    step("wrong OTP is rejected")
    r = request_otp("+919000000002")
    bad = call("POST", "/api/v1/auth/otp/verify", body={"mobileNumber": "+919000000002", "otp": "000000", "requestId": r["requestId"]}, expect=401)
    assert bad["error"]["code"] == "AUTH_INVALID_OTP"
    time.sleep(31)  # resend cooldown before the admin logs in below

    step("login owner / admin / customer")
    owner, admin, cust = login(OWNER), login(ADMIN), login(CUSTOMER)
    me = call("GET", "/api/v1/auth/me", owner)["data"]
    assert me["role"] == "OWNER"

    step("authorization: admin cannot open owner dashboard, customer cannot list products")
    call("GET", "/api/v1/dashboard/owner", admin, expect=403)
    call("GET", "/api/v1/products", cust, expect=403)

    step("create product with opening stock")
    cats = call("GET", "/api/v1/categories", owner)["data"]
    sku = "SMK-" + uuid.uuid4().hex[:6].upper()
    product = call("POST", "/api/v1/products", admin, {
        "sku": sku, "name": "Smoke Test Biscuits", "categoryId": cats[0]["id"], "hsnCode": "1905", "unit": "BOX",
        "purchasePrice": "80.00", "sellingPrice": "100.00", "mrp": "120.00", "gstRate": "18", "minimumStock": "5",
        "openingStock": "10"}, expect=201)["data"]
    assert product["onHand"] == 10

    step("post a purchase (stock IN + supplier ledger)")
    supplier = call("GET", "/api/v1/suppliers", admin)["data"][0]
    purchase = call("POST", "/api/v1/purchases", admin, {
        "supplierId": supplier["id"], "supplierInvoiceNumber": "SUP-" + sku,
        "items": [{"productId": product["id"], "quantity": "40", "rate": "80.00"}], "post": True}, expect=201)["data"]
    assert purchase["status"] == "POSTED"
    stock = call("GET", f"/api/v1/stock/{product['id']}", admin)["data"]
    assert stock["onHand"] == 50, stock

    step("customer catalog hides purchase price")
    cat = call("GET", f"/api/v1/catalog/products/{product['id']}", cust)["data"]
    assert "purchasePrice" not in cat and cat["price"] == 100.0

    step("cart and CREDIT checkout (stock reserved)")
    call("DELETE", "/api/v1/cart", cust)
    call("POST", "/api/v1/cart/items", cust, {"productId": product["id"], "quantity": "5"})
    cart = call("GET", "/api/v1/cart", cust)["data"]
    assert cart["grandTotal"] == 590.0, cart  # 5 x 100 + 18% GST
    key = str(uuid.uuid4())
    order = call("POST", "/api/v1/orders", cust, {"paymentMethod": "CREDIT"}, headers={"Idempotency-Key": key}, expect=201)["data"]
    again = call("POST", "/api/v1/orders", cust, {"paymentMethod": "CREDIT"}, headers={"Idempotency-Key": key}, expect=201)["data"]
    assert again["id"] == order["id"], "idempotent order creation"
    assert order["status"] == "PLACED" and order["paymentStatus"] == "CREDIT"
    assert call("GET", f"/api/v1/stock/{product['id']}", admin)["data"]["reserved"] == 5

    step("accept (partial: 4 of 5) and generate invoice")
    item_id = order["items"][0]["id"]
    order = call("POST", f"/api/v1/orders/{order['id']}/accept", admin, {"items": [{"orderItemId": item_id, "acceptedQuantity": "4"}]})["data"]
    assert order["grandTotal"] == 472.0, order["grandTotal"]
    inv = call("POST", "/api/v1/invoices", admin, {"orderId": order["id"], "generate": True}, expect=201)["data"]
    assert inv["status"] == "CREDIT" and inv["invoiceNumber"].startswith("INV/"), inv
    assert inv["cgstTotal"] == 36.0 and inv["sgstTotal"] == 36.0

    step("packing -> ready -> out for delivery -> delivered (3 of 4, short delivery credit note)")
    call("POST", f"/api/v1/orders/{order['id']}/packing", admin)
    call("POST", f"/api/v1/orders/{order['id']}/ready-for-delivery", admin)
    call("POST", f"/api/v1/orders/{order['id']}/out-for-delivery", admin, {"deliveryPerson": "Kumar", "vehicleNumber": "tn01ab1234"})
    order = call("POST", f"/api/v1/orders/{order['id']}/deliver", admin, {"items": [{"orderItemId": item_id, "deliveredQuantity": "3"}]})["data"]
    assert order["status"] == "DELIVERED"
    inv = call("GET", f"/api/v1/invoices/{inv['id']}", admin)["data"]
    assert inv["creditedAmount"] == 118.0 and len(inv["creditNotes"]) == 1, inv["creditedAmount"]
    s = call("GET", f"/api/v1/stock/{product['id']}", admin)["data"]
    assert s["onHand"] == 47 and s["reserved"] == 0, s

    step("record cash payment against the invoice")
    pay = call("POST", "/api/v1/payments", admin, {"customerId": order["customerId"], "invoiceId": inv["id"],
                                                   "amount": "354.00", "method": "CASH"}, expect=201)["data"]
    inv = call("GET", f"/api/v1/invoices/{inv['id']}", admin)["data"]
    assert inv["status"] == "PAID" and inv["outstanding"] == 0, inv
    status, receipt = call("GET", f"/api/v1/payments/{pay['id']}/receipt", admin, raw=True)
    assert status == 200 and receipt[:4] == b"%PDF"

    step("invoice PDF and WhatsApp (mock)")
    status, pdf = call("GET", f"/api/v1/invoices/{inv['id']}/pdf", cust, raw=True)
    assert status == 200 and pdf[:4] == b"%PDF"
    msg = call("POST", f"/api/v1/invoices/{inv['id']}/send-whatsapp", admin, headers={"Idempotency-Key": str(uuid.uuid4())})["data"]
    for _ in range(20):
        time.sleep(0.5)
        msgs = call("GET", f"/api/v1/invoices/{inv['id']}/whatsapp-messages", admin)["data"]
        if msgs[0]["status"] == "SENT":
            break
    assert msgs[0]["status"] == "SENT", msgs
    call("POST", f"/api/v1/dev/whatsapp/{msg['id']}/status", body={"status": "DELIVERED"})
    assert call("GET", f"/api/v1/invoices/{inv['id']}/whatsapp-messages", admin)["data"][0]["status"] == "DELIVERED"

    step("sales return (customer requests, admin approves -> stock IN + credit note)")
    ret = call("POST", "/api/v1/sales-returns", cust, {"invoiceId": inv["id"], "reason": "Damaged",
                                                        "items": [{"invoiceItemId": inv["items"][0]["id"], "quantity": "1"}]}, expect=201)["data"]
    ret = call("POST", f"/api/v1/sales-returns/{ret['id']}/approve", admin)["data"]
    assert ret["status"] == "APPROVED" and ret["creditAmount"] == 118.0, ret
    assert call("GET", f"/api/v1/stock/{product['id']}", admin)["data"]["onHand"] == 48

    step("customer ledger balance reflects invoice, credit notes, payment")
    out = call("GET", f"/api/v1/customers/{order['customerId']}/outstanding", admin)["data"]
    print(f"    ledger balance: {out['ledgerBalance']}")

    step("ONLINE order paid via mock gateway (duplicate webhook is idempotent)")
    call("POST", "/api/v1/cart/items", cust, {"productId": product["id"], "quantity": "2"})
    online = call("POST", "/api/v1/orders", cust, {"paymentMethod": "ONLINE"}, expect=201)["data"]
    intent = online["paymentIntent"]
    assert intent and intent["status"] == "UNPAID", online
    sim = call("POST", f"/api/v1/dev/payments/{intent['paymentId']}/simulate", body={"outcome": "DUPLICATE_WEBHOOK"})["data"]
    assert sim["webhookResults"] == ["CAPTURED", "DUPLICATE"], sim
    online = call("GET", f"/api/v1/orders/{online['id']}", cust)["data"]
    assert online["paymentStatus"] == "PAID", online["paymentStatus"]

    step("invalid webhook signature is rejected")
    bad = call("POST", "/api/v1/payments/webhooks/mock", body={"id": "evt_x", "type": "payment.captured", "orderId": "x"},
               headers={"X-Webhook-Signature": "nope"}, expect=400)
    assert bad["error"]["code"] == "WEBHOOK_SIGNATURE_INVALID"

    step("customer cancels the paid online order -> refund")
    online = call("POST", f"/api/v1/orders/{online['id']}/cancel", cust, {"reason": "Changed my mind"})["data"]
    assert online["status"] == "CANCELLED" and online["paymentStatus"] == "REFUNDED", online["paymentStatus"]

    step("reports and dashboards")
    for name in ["sales", "purchases", "stock", "profit", "tax", "customers", "outstanding", "payments"]:
        call("GET", f"/api/v1/reports/{name}", owner)
    status, xlsx = call("GET", "/api/v1/reports/sales?format=xlsx", owner, raw=True)
    assert status == 200 and xlsx[:2] == b"PK"
    call("GET", "/api/v1/reports/profit", admin, expect=403)
    call("GET", "/api/v1/dashboard/owner?range=THIS_FINANCIAL_YEAR", owner)
    call("GET", "/api/v1/dashboard/admin", admin)
    call("GET", "/api/v1/dashboard/customer", cust)
    assert call("GET", "/api/v1/audit-logs?pageSize=5", owner)["pagination"]["totalItems"] > 0

    print("SMOKE TEST PASSED")


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print(f"SMOKE TEST FAILED: {e}")
        sys.exit(1)
