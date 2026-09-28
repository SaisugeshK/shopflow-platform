package com.shopflow.integrations.otp;

/**
 * Delivers an OTP to a mobile number. The backend generates, stores (hashed) and verifies OTPs; the provider only
 * delivers them (§108).
 */
public interface OtpProvider {

    String name();

    /**
     * @return provider message reference
     * @throws com.shopflow.integrations.ProviderException on delivery failure or timeout
     */
    String send(String mobileNumber, String otp, java.time.Duration validity);
}
