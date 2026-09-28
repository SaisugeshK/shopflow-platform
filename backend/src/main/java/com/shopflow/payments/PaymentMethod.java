package com.shopflow.payments;

/** Payment methods (§9). UPI is used for §110's "UPI_MANUAL" (see DECISIONS.md). */
public enum PaymentMethod {
    CASH, ONLINE, UPI, BANK_TRANSFER, CREDIT, OTHER
}
