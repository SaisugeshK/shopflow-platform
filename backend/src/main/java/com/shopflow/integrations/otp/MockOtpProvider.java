package com.shopflow.integrations.otp;

import com.shopflow.common.util.MobileNumbers;
import com.shopflow.integrations.ProviderException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Development OTP provider. Never sends an SMS. The latest OTP per number is kept in memory for the dev-only
 * endpoint and printed to the log so developers can sign in. Numbers ending in 0000 simulate a provider timeout and
 * numbers ending in 1111 simulate a provider rejection, so failure paths can be exercised.
 */
@Component
@ConditionalOnProperty(name = "app.otp.provider", havingValue = "mock", matchIfMissing = true)
public class MockOtpProvider implements OtpProvider {

    private static final Logger log = LoggerFactory.getLogger(MockOtpProvider.class);
    private final Map<String, String> latest = new ConcurrentHashMap<>();

    @Override
    public String name() {
        return "mock";
    }

    @Override
    public String send(String mobileNumber, String otp, Duration validity) {
        if (mobileNumber.endsWith("0000")) {
            throw ProviderException.timeout("mock-otp");
        }
        if (mobileNumber.endsWith("1111")) {
            throw ProviderException.rejected("mock-otp", "number not reachable");
        }
        latest.put(mobileNumber, otp);
        log.info("[MOCK OTP - DEVELOPMENT ONLY] OTP for {} is {} (valid {}s)", MobileNumbers.mask(mobileNumber), otp, validity.toSeconds());
        return "mock-" + UUID.randomUUID();
    }

    public Optional<String> latestFor(String mobileNumber) {
        return Optional.ofNullable(latest.get(mobileNumber));
    }
}
