package com.shopflow.auth;

import com.shopflow.common.util.MobileNumbers;
import com.shopflow.integrations.otp.MockOtpProvider;
import com.shopflow.support.IntegrationTest;
import com.shopflow.support.TestData;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import tools.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;

/** OTP test matrix (§108) plus token rotation, logout and registration. */
class AuthIntegrationTest extends IntegrationTest {

    @Autowired
    MockOtpProvider otp;

    private JsonNode request(String mobile) {
        return api.post("/api/v1/auth/otp/request", null, Map.of("mobileNumber", mobile), 200).path("data");
    }

    private JsonNode verify(String mobile, String requestId, String code, int status) {
        return api.post("/api/v1/auth/otp/verify", null, Map.of("mobileNumber", mobile, "otp", code, "requestId", requestId), status);
    }

    private String code(String mobile) {
        return otp.latestFor(MobileNumbers.normalize(mobile)).orElseThrow();
    }

    @Test
    void correctOtpSignsInWithRoleFromAccount() {
        String mobile = data.owner();
        JsonNode r = request(mobile);
        JsonNode body = verify(mobile, r.path("requestId").asString(), code(mobile), 200).path("data");
        assertThat(body.path("registrationRequired").asBoolean()).isFalse();
        assertThat(body.path("user").path("role").asString()).isEqualTo("OWNER");
        assertThat(body.path("accessToken").asString()).isNotBlank();
        assertThat(body.path("refreshToken").asString()).isNotBlank();
    }

    @Test
    void wrongOtpIsRejectedAndOtpIsNotStoredInPlaintext() {
        String mobile = data.admin();
        JsonNode r = request(mobile);
        JsonNode err = verify(mobile, r.path("requestId").asString(), "000000".equals(code(mobile)) ? "111111" : "000000", 401);
        assertThat(err.path("error").path("code").asString()).isEqualTo("AUTH_INVALID_OTP");
        String stored = data.jdbc().queryForObject("SELECT otp_hash FROM otp_requests WHERE id = ?::uuid", String.class, r.path("requestId").asString());
        assertThat(stored).isNotEqualTo(code(mobile)).hasSize(64);
    }

    @Test
    void expiredOtpIsRejected() {
        String mobile = data.admin();
        JsonNode r = request(mobile);
        data.jdbc().update("UPDATE otp_requests SET expires_at = now() - interval '1 minute' WHERE id = ?::uuid", r.path("requestId").asString());
        JsonNode err = verify(mobile, r.path("requestId").asString(), code(mobile), 401);
        assertThat(err.path("error").path("code").asString()).isEqualTo("AUTH_OTP_EXPIRED");
    }

    @Test
    void tooManyAttemptsLocksTheOtpEvenForTheRightCode() {
        String mobile = data.admin();
        JsonNode r = request(mobile);
        String right = code(mobile);
        String wrong = right.equals("123456") ? "654321" : "123456";
        for (int i = 0; i < 4; i++) {
            verify(mobile, r.path("requestId").asString(), wrong, 401);
        }
        JsonNode locked = verify(mobile, r.path("requestId").asString(), wrong, 429);
        assertThat(locked.path("error").path("code").asString()).isEqualTo("AUTH_TOO_MANY_ATTEMPTS");
        JsonNode still = verify(mobile, r.path("requestId").asString(), right, 429);
        assertThat(still.path("error").path("code").asString()).isEqualTo("AUTH_TOO_MANY_ATTEMPTS");
    }

    @Test
    void resendCooldownAndOldOtpInvalidation() {
        String mobile = data.admin();
        JsonNode first = request(mobile);
        String firstCode = code(mobile);
        JsonNode cooldown = api.post("/api/v1/auth/otp/request", null, Map.of("mobileNumber", mobile), 429);
        assertThat(cooldown.path("error").path("code").asString()).isEqualTo("AUTH_OTP_COOLDOWN");
        data.jdbc().update("UPDATE otp_requests SET created_at = now() - interval '5 minutes' WHERE mobile_number = ?", mobile);
        JsonNode second = request(mobile);
        JsonNode stale = verify(mobile, first.path("requestId").asString(), firstCode, 401);
        assertThat(stale.path("error").path("code").asString()).isEqualTo("AUTH_INVALID_OTP");
        verify(mobile, second.path("requestId").asString(), code(mobile), 200);
    }

    @Test
    void repeatedRequestsAreRateLimitedPerMobile() {
        String mobile = data.admin();
        for (int i = 0; i < 5; i++) {
            request(mobile);
            data.jdbc().update("UPDATE otp_requests SET created_at = created_at - interval '40 seconds' WHERE mobile_number = ?", mobile);
        }
        JsonNode limited = api.post("/api/v1/auth/otp/request", null, Map.of("mobileNumber", mobile), 429);
        assertThat(limited.path("error").path("code").asString()).isEqualTo("RATE_LIMITED");
    }

    @Test
    void blockedAndInactiveUsersCannotSignIn() {
        String blockedMobile = TestData.mobile();
        data.user(blockedMobile, "Blocked", TestData.ADMIN_ROLE, "BLOCKED");
        JsonNode r = request(blockedMobile);
        JsonNode err = verify(blockedMobile, r.path("requestId").asString(), code(blockedMobile), 403);
        assertThat(err.path("error").path("code").asString()).isEqualTo("AUTH_ACCOUNT_INACTIVE");

        TestData.TestCustomer blockedCustomer = data.customer("BLOCKED", false, java.math.BigDecimal.ZERO, "33");
        JsonNode r2 = request(blockedCustomer.mobile());
        JsonNode err2 = verify(blockedCustomer.mobile(), r2.path("requestId").asString(), code(blockedCustomer.mobile()), 403);
        assertThat(err2.path("error").path("code").asString()).isEqualTo("CUSTOMER_BLOCKED");
    }

    @Test
    void pendingCustomerGetsLimitedSession() {
        TestData.TestCustomer pending = data.customer("PENDING_APPROVAL", false, java.math.BigDecimal.ZERO, "33");
        String token = api.login(pending.mobile());
        JsonNode me = api.get("/api/v1/auth/me", token, 200).path("data");
        assertThat(me.path("permissions").size()).isZero();
        assertThat(me.path("customer").path("status").asString()).isEqualTo("PENDING_APPROVAL");
        api.get("/api/v1/customer-registration/status", token, 200);
        api.get("/api/v1/catalog/products", token, 403);
    }

    @Test
    void providerTimeoutReturnsRetryableError() {
        JsonNode err = api.post("/api/v1/auth/otp/request", null, Map.of("mobileNumber", "+919876500000"), 502);
        assertThat(err.path("error").path("code").asString()).isEqualTo("AUTH_OTP_DELIVERY_FAILED");
        // A failed delivery does not start the cooldown.
        api.post("/api/v1/auth/otp/request", null, Map.of("mobileNumber", "+919876500000"), 502);
    }

    @Test
    void concurrentVerificationSucceedsOnlyOnce() throws Exception {
        String mobile = data.admin();
        JsonNode r = request(mobile);
        String c = code(mobile);
        ExecutorService pool = Executors.newFixedThreadPool(5);
        List<Callable<Integer>> tasks = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            tasks.add(() -> {
                try {
                    verify(mobile, r.path("requestId").asString(), c, 200);
                    return 200;
                } catch (AssertionError e) {
                    return 401;
                }
            });
        }
        int ok = 0;
        for (Future<Integer> f : pool.invokeAll(tasks)) {
            if (f.get() == 200) {
                ok++;
            }
        }
        pool.shutdown();
        assertThat(ok).isEqualTo(1);
    }

    @Test
    void refreshRotatesAndReuseRevokesTheSession() {
        String mobile = data.owner();
        JsonNode r = request(mobile);
        JsonNode session = verify(mobile, r.path("requestId").asString(), code(mobile), 200).path("data");
        String refresh1 = session.path("refreshToken").asString();

        JsonNode rotated = api.post("/api/v1/auth/refresh", null, Map.of("refreshToken", refresh1), 200).path("data");
        String refresh2 = rotated.path("refreshToken").asString();
        assertThat(refresh2).isNotEqualTo(refresh1);
        String access2 = rotated.path("accessToken").asString();
        api.get("/api/v1/auth/me", access2, 200);

        // Reusing the old token is treated as theft: the whole session is revoked.
        api.post("/api/v1/auth/refresh", null, Map.of("refreshToken", refresh1), 401);
        api.post("/api/v1/auth/refresh", null, Map.of("refreshToken", refresh2), 401);
        api.get("/api/v1/auth/me", access2, 401);
    }

    @Test
    void logoutRevokesAccessImmediately() {
        String token = api.login(data.admin());
        api.get("/api/v1/auth/me", token, 200);
        api.post("/api/v1/auth/logout", token, null, 200);
        api.get("/api/v1/auth/me", token, 401);
    }

    @Test
    void newNumberRegistersAsPendingCustomer() {
        String mobile = TestData.mobile();
        JsonNode r = request(mobile);
        JsonNode v = verify(mobile, r.path("requestId").asString(), code(mobile), 200).path("data");
        assertThat(v.path("registrationRequired").asBoolean()).isTrue();
        String registrationToken = v.path("registrationToken").asString();

        // A registration token cannot call normal APIs.
        api.get("/api/v1/auth/me", registrationToken, 403);

        JsonNode reg = api.post("/api/v1/customer-registration", registrationToken, Map.of(
                "shopName", "New Test Shop", "contactName", "Asha",
                "address", Map.of("addressLine1", "5 Main Road", "city", "Madurai", "state", "Tamil Nadu", "pincode", "625001")), 201).path("data");
        assertThat(reg.path("user").path("customer").path("status").asString()).isEqualTo("PENDING_APPROVAL");
        // Second submission with the same token is rejected.
        api.post("/api/v1/customer-registration", registrationToken, Map.of(
                "shopName", "Again", "contactName", "Asha",
                "address", Map.of("addressLine1", "5 Main Road", "city", "Madurai", "state", "Tamil Nadu", "pincode", "625001")), 409);
    }

    @Test
    void clientCannotChooseRoleAndUnauthenticatedCallsAreRejected() {
        api.get("/api/v1/customers", null, 401);
        api.get("/api/v1/customers", "not-a-jwt", 401);
    }
}
