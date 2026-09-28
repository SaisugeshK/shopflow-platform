package com.shopflow.common.sequence;

import com.shopflow.business.BusinessContext;
import com.shopflow.common.util.FinancialYear;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

/**
 * Issues system-generated document numbers. The UPDATE ... RETURNING row lock serialises concurrent callers and is
 * held until the caller's transaction commits, so numbers are unique and a rolled-back transaction never consumes a
 * number. Numbers are never reused or manually assigned.
 */
@Service
public class DocumentSequenceService {

    private final JdbcTemplate jdbc;
    private final BusinessContext businessContext;

    public DocumentSequenceService(JdbcTemplate jdbc, BusinessContext businessContext) {
        this.jdbc = jdbc;
        this.businessContext = businessContext;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public String next(DocumentType type, LocalDate documentDate) {
        return next(type, documentDate, type.defaultPrefix(), 1L, 6);
    }

    /**
     * @param prefix         prefix used when the sequence row is first created (existing rows keep their prefix)
     * @param startingNumber first number issued for a new financial year
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public String next(DocumentType type, LocalDate documentDate, String prefix, long startingNumber, int padding) {
        UUID businessId = businessContext.businessId();
        String year = type.financialYearScoped()
                ? FinancialYear.label(documentDate, businessContext.financialYearStartMonth())
                : "ALL";

        jdbc.update("""
                INSERT INTO document_sequences (id, business_id, document_type, financial_year, prefix, next_number, padding, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (business_id, document_type, financial_year) DO NOTHING
                """, UUID.randomUUID(), businessId, type.name(), year, prefix, startingNumber, padding, Timestamp.from(Instant.now()));

        Map<String, Object> row = jdbc.queryForMap("""
                UPDATE document_sequences SET next_number = next_number + 1, updated_at = ?
                WHERE business_id = ? AND document_type = ? AND financial_year = ?
                RETURNING next_number - 1 AS issued, prefix, padding
                """, Timestamp.from(Instant.now()), businessId, type.name(), year);

        long issued = ((Number) row.get("issued")).longValue();
        String rowPrefix = (String) row.get("prefix");
        int rowPadding = ((Number) row.get("padding")).intValue();
        String number = String.format("%0" + rowPadding + "d", issued);
        return type.financialYearScoped() ? rowPrefix + "/" + year + "/" + number : rowPrefix + "-" + number;
    }
}
