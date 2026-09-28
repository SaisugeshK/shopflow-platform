package com.shopflow.billing;

import com.shopflow.audit.AuditAction;
import com.shopflow.audit.AuditService;
import com.shopflow.billing.BillingRepositories.CreditNoteRepository;
import com.shopflow.billing.BillingRepositories.InvoiceRepository;
import com.shopflow.business.BusinessContext;
import com.shopflow.business.BusinessSettingsService;
import com.shopflow.common.error.BusinessException;
import com.shopflow.common.error.ErrorCode;
import com.shopflow.common.sequence.DocumentSequenceService;
import com.shopflow.common.sequence.DocumentType;
import com.shopflow.common.util.Money;
import com.shopflow.customers.CustomerLedgerEntry.EntryType;
import com.shopflow.customers.CustomerLedgerService;
import com.shopflow.payments.PaymentService;
import com.shopflow.security.CurrentUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Credit notes reduce an invoice's receivable without ever editing the original invoice (§17). They are priced at
 * the invoice's net (post-discount) rate and tax rate, so the reversal mirrors the original sale exactly.
 */
@Service
public class CreditNoteService {

    private final CreditNoteRepository creditNotes;
    private final InvoiceRepository invoices;
    private final TaxCalculator calculator;
    private final CustomerLedgerService ledger;
    private final PaymentService payments;
    private final DocumentSequenceService sequences;
    private final BusinessContext businessContext;
    private final BusinessSettingsService settings;
    private final AuditService audit;

    public CreditNoteService(CreditNoteRepository creditNotes, InvoiceRepository invoices, TaxCalculator calculator,
                             CustomerLedgerService ledger, PaymentService payments, DocumentSequenceService sequences,
                             BusinessContext businessContext, BusinessSettingsService settings, AuditService audit) {
        this.creditNotes = creditNotes;
        this.invoices = invoices;
        this.calculator = calculator;
        this.ledger = ledger;
        this.payments = payments;
        this.sequences = sequences;
        this.businessContext = businessContext;
        this.settings = settings;
        this.audit = audit;
    }

    public record Line(InvoiceItem item, BigDecimal quantity) {
    }

    /**
     * Issues a credit note against a posted invoice (caller holds the invoice lock). Money already paid in excess
     * of the reduced invoice total becomes a customer advance.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public CreditNote issue(Invoice invoice, List<Line> lines, CreditNote.ReasonType reasonType, String reason,
                            String referenceType, UUID referenceId) {
        if (!invoice.getStatus().isPosted()) {
            throw new BusinessException(ErrorCode.INVOICE_INVALID_STATUS, "Credit notes can only be issued against generated invoices");
        }
        List<TaxCalculator.Line> calcLines = new ArrayList<>();
        for (Line l : lines) {
            BigDecimal credited = creditedQuantity(invoice.getId(), l.item().getId());
            BigDecimal available = l.item().getQuantity().subtract(credited);
            if (Money.qty(l.quantity()).compareTo(available) > 0) {
                throw new BusinessException(ErrorCode.RETURN_INVALID_QUANTITY,
                        "Cannot credit more than " + available.stripTrailingZeros().toPlainString() + " of " + l.item().getProductName());
            }
            BigDecimal netRate = l.item().getTaxableAmount().divide(l.item().getQuantity(), 2, RoundingMode.HALF_UP);
            calcLines.add(new TaxCalculator.Line(l.quantity(), netRate, null, null, l.item().getTaxRate(), l.item().getHsnCode()));
        }
        TaxCalculator.Result calc = calculator.calculate(calcLines, invoice.isInterState(), settings.taxSettings().isRoundOffEnabled());
        BigDecimal maxCredit = invoice.getGrandTotal().subtract(invoice.getCreditedAmount());
        BigDecimal total = Money.min(calc.grandTotal(), maxCredit);

        CreditNote note = new CreditNote();
        note.setBusinessId(businessContext.businessId());
        note.setCreditNoteNumber(sequences.next(DocumentType.CREDIT_NOTE, businessContext.today()));
        note.setInvoiceId(invoice.getId());
        note.setCustomerId(invoice.getCustomerId());
        note.setReasonType(reasonType);
        note.setReason(reason);
        note.setReferenceType(referenceType);
        note.setReferenceId(referenceId);
        note.setNoteDate(businessContext.today());
        note.setTaxableTotal(calc.taxable());
        note.setCgstTotal(calc.cgst());
        note.setSgstTotal(calc.sgst());
        note.setIgstTotal(calc.igst());
        note.setRoundOff(total.subtract(calc.grandTotal().subtract(calc.roundOff())));
        note.setGrandTotal(total);
        note.setCreatedBy(CurrentUser.idIfPresent().orElse(null));
        for (int i = 0; i < lines.size(); i++) {
            Line l = lines.get(i);
            TaxCalculator.LineResult lr = calc.lines().get(i);
            CreditNoteItem item = new CreditNoteItem();
            item.setCreditNote(note);
            item.setInvoiceItemId(l.item().getId());
            item.setProductId(l.item().getProductId());
            item.setProductName(l.item().getProductName());
            item.setQuantity(Money.qty(l.quantity()));
            item.setRate(calcLines.get(i).rate());
            item.setTaxRate(l.item().getTaxRate());
            item.setTaxableAmount(lr.taxable());
            item.setCgstAmount(lr.cgst());
            item.setSgstAmount(lr.sgst());
            item.setIgstAmount(lr.igst());
            item.setLineTotal(lr.total());
            note.getItems().add(item);
        }
        creditNotes.save(note);

        invoice.setCreditedAmount(invoice.getCreditedAmount().add(total));
        if (invoice.getPaidAmount().compareTo(invoice.getGrandTotal().subtract(invoice.getCreditedAmount())) > 0) {
            payments.releaseExcess(invoice);
        }
        invoice.refreshStatus();
        ledger.credit(invoice.getCustomerId(), EntryType.CREDIT_NOTE, "CREDIT_NOTE",
                note.getId(), note.getCreditNoteNumber(), total, reasonType + " against " + invoice.getInvoiceNumber());
        audit.record(AuditAction.CREDIT_NOTE_CREATED, "INVOICE", invoice.getId(), null, Map.of(
                "creditNoteNumber", note.getCreditNoteNumber(), "amount", total, "reasonType", reasonType, "reason", reason));
        return note;
    }

    /** Credits every uncredited quantity on the invoice (used when a delivery fails after invoicing). */
    @Transactional(propagation = Propagation.MANDATORY)
    public CreditNote issueFull(Invoice invoice, CreditNote.ReasonType reasonType, String reason, String refType, UUID refId) {
        List<Line> lines = new ArrayList<>();
        for (InvoiceItem item : invoice.getItems()) {
            BigDecimal remaining = item.getQuantity().subtract(creditedQuantity(invoice.getId(), item.getId()));
            if (remaining.signum() > 0) {
                lines.add(new Line(item, remaining));
            }
        }
        if (lines.isEmpty()) {
            return null;
        }
        return issue(invoice, lines, reasonType, reason, refType, refId);
    }

    public BigDecimal creditedQuantity(UUID invoiceId, UUID invoiceItemId) {
        return creditNotes.findByInvoiceIdOrderByCreatedAtAsc(invoiceId).stream()
                .flatMap(n -> n.getItems().stream())
                .filter(i -> i.getInvoiceItemId().equals(invoiceItemId))
                .map(CreditNoteItem::getQuantity)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    public List<CreditNote> forInvoice(UUID invoiceId) {
        return creditNotes.findByInvoiceIdOrderByCreatedAtAsc(invoiceId);
    }

    /** Manual credit note endpoint (price adjustment / other). */
    @Transactional
    public CreditNote createManual(UUID invoiceId, InvoiceDtos.CreateCreditNoteRequest r) {
        Invoice invoice = invoices.findByIdForUpdate(invoiceId)
                .orElseThrow(() -> BusinessException.notFound(ErrorCode.INVOICE_NOT_FOUND, "Invoice"));
        List<Line> lines = new ArrayList<>();
        for (InvoiceDtos.CreditNoteLineRequest l : r.items()) {
            InvoiceItem item = invoice.getItems().stream().filter(i -> i.getId().equals(l.invoiceItemId())).findFirst()
                    .orElseThrow(() -> BusinessException.validation("invoiceItemId", "Line not found on this invoice"));
            lines.add(new Line(item, l.quantity()));
        }
        return issue(invoice, lines, r.reasonType(), r.reason().trim(), "MANUAL", null);
    }
}
