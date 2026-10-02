package com.shopflow.auth;

import com.shopflow.config.AppProperties;
import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Demo mode (OTP shown on screen) must never be combined with a real SMS provider. */
class DemoOtpGuardTest {

    private static AppProperties.Otp otp(String provider, boolean showInResponse) {
        Duration d = Duration.ofMinutes(5);
        return new AppProperties.Otp(provider, 6, d, 5, d, 5, d, 30, d, "secret", null, null, d, showInResponse);
    }

    @Test
    void demoModeIsAllowedWithTheMockProvider() {
        assertThatCode(() -> otp("mock", true)).doesNotThrowAnyException();
    }

    @Test
    void demoModeIsRejectedWithARealProvider() {
        assertThatThrownBy(() -> otp("msg91", true))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("show-in-response");
    }

    @Test
    void realProviderStartsWhenDemoModeIsOff() {
        assertThatCode(() -> otp("msg91", false)).doesNotThrowAnyException();
    }
}
