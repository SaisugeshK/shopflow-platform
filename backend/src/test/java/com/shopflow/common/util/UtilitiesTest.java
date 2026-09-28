package com.shopflow.common.util;

import com.shopflow.billing.pdf.IndianNumberFormat;
import com.shopflow.common.error.BusinessException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class UtilitiesTest {

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
            "0 | Indian Rupees Zero Only",
            "1 | Indian Rupees One Only",
            "118 | Indian Rupees One Hundred Eighteen Only",
            "125000.50 | Indian Rupees One Lakh Twenty Five Thousand and Fifty Paise Only",
            "10000000 | Indian Rupees One Crore Only",
            "99999999.99 | Indian Rupees Nine Crore Ninety Nine Lakh Ninety Nine Thousand Nine Hundred Ninety Nine and Ninety Nine Paise Only"})
    void amountInWordsUsesIndianNumbering(String amount, String words) {
        assertThat(AmountInWords.inr(new BigDecimal(amount))).isEqualTo(words);
    }

    @ParameterizedTest
    @CsvSource({"9876543210,+919876543210", "+91 98765 43210,+919876543210", "09876543210,+919876543210", "919876543210,+919876543210"})
    void normalisesIndianMobiles(String raw, String expected) {
        assertThat(MobileNumbers.normalize(raw)).isEqualTo(expected);
    }

    @ParameterizedTest
    @ValueSource(strings = {"12345", "5876543210", "abcdefghij", "+1 2025550100"})
    void rejectsInvalidMobiles(String raw) {
        assertThatThrownBy(() -> MobileNumbers.normalize(raw)).isInstanceOf(BusinessException.class);
    }

    @Test
    void masksMobiles() {
        assertThat(MobileNumbers.mask("+919876543210")).isEqualTo("+91******3210");
    }

    @ParameterizedTest
    @CsvSource({"2026-04-01,2026-27", "2026-03-31,2025-26", "2027-01-15,2026-27"})
    void financialYearLabel(String date, String label) {
        assertThat(FinancialYear.label(LocalDate.parse(date), 4)).isEqualTo(label);
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {"0|0.00", "999.5|999.50", "1234567.891|12,34,567.89", "-100000|-1,00,000.00"})
    void indianDigitGrouping(String value, String expected) {
        assertThat(IndianNumberFormat.format(new BigDecimal(value))).isEqualTo(expected);
    }

    @Test
    void gstStateCodes() {
        assertThat(IndianStates.codeFor("tamil nadu")).contains("33");
        assertThat(IndianStates.resolve("Karnataka", null)).isEqualTo("29");
        assertThatThrownBy(() -> IndianStates.resolve("Atlantis", null)).isInstanceOf(BusinessException.class);
    }

    @Test
    void rateLimiterEnforcesSlidingWindow() {
        RateLimiter limiter = new RateLimiter();
        for (int i = 0; i < 3; i++) {
            assertThat(limiter.tryAcquire("k", 3, Duration.ofMinutes(1))).isTrue();
        }
        assertThat(limiter.tryAcquire("k", 3, Duration.ofMinutes(1))).isFalse();
        assertThat(limiter.tryAcquire("other", 3, Duration.ofMinutes(1))).isTrue();
    }

    @Test
    void hmacAndConstantTimeCompare() {
        String a = Hashing.hmacSha256Hex("secret", "payload");
        assertThat(Hashing.constantTimeEquals(a, Hashing.hmacSha256Hex("secret", "payload"))).isTrue();
        assertThat(Hashing.constantTimeEquals(a, Hashing.hmacSha256Hex("other", "payload"))).isFalse();
        assertThat(Hashing.randomDigits(6)).matches("\\d{6}");
    }
}
