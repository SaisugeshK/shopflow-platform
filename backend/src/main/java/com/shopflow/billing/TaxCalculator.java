package com.shopflow.billing;

import com.shopflow.common.util.Money;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * The single financial calculation engine (§27, §48) used by orders, invoices, purchases, returns and credit notes.
 *
 * <pre>
 * gross      = quantity × rate                       (rounded to paise)
 * discount   = discountAmount, or gross × discount% (rounded)
 * taxable    = gross − discount
 * intra-state: CGST = SGST = taxable × (rate / 2) %  (each rounded)
 * inter-state: IGST = taxable × rate %               (rounded)
 * line total = taxable + taxes
 * round-off  = nearest rupee − sum(line totals)      (when enabled)
 * </pre>
 *
 * Tax is computed per line and summed, which keeps line-level and summary figures consistent on printed invoices.
 * The exact GST treatment must be confirmed with the business's tax advisor before production use.
 */
@Component
public class TaxCalculator {

    private static final BigDecimal TWO = new BigDecimal("2");

    public Result calculate(List<Line> lines, boolean interState, boolean roundOff) {
        List<LineResult> results = new ArrayList<>(lines.size());
        BigDecimal subtotal = Money.ZERO;
        BigDecimal discount = Money.ZERO;
        BigDecimal taxable = Money.ZERO;
        BigDecimal cgst = Money.ZERO;
        BigDecimal sgst = Money.ZERO;
        BigDecimal igst = Money.ZERO;
        Map<String, TaxSummary> summary = new LinkedHashMap<>();

        for (Line line : lines) {
            LineResult r = line(line, interState);
            results.add(r);
            subtotal = subtotal.add(r.gross());
            discount = discount.add(r.discountAmount());
            taxable = taxable.add(r.taxable());
            cgst = cgst.add(r.cgst());
            sgst = sgst.add(r.sgst());
            igst = igst.add(r.igst());
            String key = Objects.toString(line.hsnCode(), "") + "|" + line.taxRate().stripTrailingZeros().toPlainString();
            summary.merge(key, new TaxSummary(line.hsnCode(), line.taxRate(), r.taxable(), r.cgst(), r.sgst(), r.igst()), TaxSummary::plus);
        }
        BigDecimal beforeRound = taxable.add(cgst).add(sgst).add(igst);
        BigDecimal grandTotal = roundOff ? beforeRound.setScale(0, RoundingMode.HALF_UP).setScale(Money.SCALE) : beforeRound;
        BigDecimal roundOffAmount = grandTotal.subtract(beforeRound);
        return new Result(results, subtotal, discount, taxable, cgst, sgst, igst, roundOffAmount, grandTotal,
                List.copyOf(summary.values()));
    }

    public LineResult line(Line line, boolean interState) {
        if (line.quantity().signum() <= 0) {
            throw new IllegalArgumentException("Quantity must be positive");
        }
        if (line.rate().signum() < 0) {
            throw new IllegalArgumentException("Rate cannot be negative");
        }
        BigDecimal gross = Money.of(line.quantity().multiply(line.rate()));
        BigDecimal discountPercent = Money.nz(line.discountPercent());
        BigDecimal discountAmount;
        if (line.discountAmount() != null && line.discountAmount().signum() > 0) {
            discountAmount = Money.of(line.discountAmount());
            discountPercent = gross.signum() == 0 ? BigDecimal.ZERO
                    : discountAmount.multiply(Money.HUNDRED).divide(gross, 2, RoundingMode.HALF_UP);
        } else {
            discountAmount = Money.percentOf(gross, discountPercent);
        }
        if (discountAmount.compareTo(gross) > 0) {
            throw new IllegalArgumentException("Discount cannot exceed the line amount");
        }
        BigDecimal taxable = gross.subtract(discountAmount);
        BigDecimal cgst = Money.ZERO;
        BigDecimal sgst = Money.ZERO;
        BigDecimal igst = Money.ZERO;
        if (interState) {
            igst = Money.percentOf(taxable, line.taxRate());
        } else {
            BigDecimal half = line.taxRate().divide(TWO, 4, RoundingMode.HALF_UP);
            cgst = Money.percentOf(taxable, half);
            sgst = cgst;
        }
        BigDecimal total = taxable.add(cgst).add(sgst).add(igst);
        return new LineResult(gross, discountPercent.setScale(2, RoundingMode.HALF_UP), discountAmount, taxable, cgst, sgst, igst, total);
    }

    /** Intra-state when both parties are in the same GST state (or the buyer's state is unknown). */
    public static boolean isInterState(String sellerStateCode, String buyerStateCode) {
        return sellerStateCode != null && buyerStateCode != null && !sellerStateCode.equals(buyerStateCode);
    }

    public record Line(BigDecimal quantity, BigDecimal rate, BigDecimal discountPercent, BigDecimal discountAmount,
                       BigDecimal taxRate, String hsnCode) {
    }

    public record LineResult(BigDecimal gross, BigDecimal discountPercent, BigDecimal discountAmount, BigDecimal taxable,
                             BigDecimal cgst, BigDecimal sgst, BigDecimal igst, BigDecimal total) {
        public BigDecimal tax() {
            return cgst.add(sgst).add(igst);
        }
    }

    public record TaxSummary(String hsnCode, BigDecimal taxRate, BigDecimal taxable, BigDecimal cgst, BigDecimal sgst,
                             BigDecimal igst) {
        TaxSummary plus(TaxSummary o) {
            return new TaxSummary(hsnCode, taxRate, taxable.add(o.taxable), cgst.add(o.cgst), sgst.add(o.sgst), igst.add(o.igst));
        }

        public BigDecimal totalTax() {
            return cgst.add(sgst).add(igst);
        }
    }

    public record Result(List<LineResult> lines, BigDecimal subtotal, BigDecimal discount, BigDecimal taxable,
                         BigDecimal cgst, BigDecimal sgst, BigDecimal igst, BigDecimal roundOff, BigDecimal grandTotal,
                         List<TaxSummary> taxSummary) {
        public BigDecimal totalTax() {
            return cgst.add(sgst).add(igst);
        }
    }
}
