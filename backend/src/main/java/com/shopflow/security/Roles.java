package com.shopflow.security;

public final class Roles {

    public static final String OWNER = "OWNER";
    public static final String ADMIN = "ADMIN";
    public static final String CUSTOMER = "CUSTOMER";
    /** Supplier of a business: signs in to the supplier portal (Phase 3). */
    public static final String SUPPLIER = "SUPPLIER";
    /** Platform operator (not a tenant role): registers tenants and grants modules (§0B.5). */
    public static final String SUPER_ADMIN = "SUPER_ADMIN";

    private Roles() {
    }
}
