package com.shopflow.billing;

import com.shopflow.billing.BillingRepositories.InvoiceRepository;
import com.shopflow.billing.pdf.InvoicePdfRenderer;
import com.shopflow.files.FileService;
import com.shopflow.files.StoredFile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Invoice PDFs. The PDF of a generated invoice is rendered once from its snapshot and stored (object storage), so
 * the copy sent on WhatsApp is byte-identical to later downloads. Drafts and cancelled invoices render on demand
 * with a watermark.
 */
@Service
public class InvoiceDocumentService {

    private final InvoiceRepository invoices;
    private final InvoicePdfRenderer renderer;
    private final FileService files;

    public InvoiceDocumentService(InvoiceRepository invoices, InvoicePdfRenderer renderer, FileService files) {
        this.invoices = invoices;
        this.renderer = renderer;
        this.files = files;
    }

    @Transactional
    public byte[] storedPdf(Invoice detached) {
        Invoice invoice = invoices.findById(detached.getId()).orElseThrow();
        if (invoice.getStatus() == InvoiceStatus.DRAFT || invoice.getStatus() == InvoiceStatus.CANCELLED) {
            return renderer.render(invoice);
        }
        if (invoice.getPdfFileId() != null) {
            return files.read(files.get(invoice.getPdfFileId()));
        }
        byte[] pdf = renderer.render(invoice);
        StoredFile stored = files.storeGenerated(pdf, "application/pdf",
                invoice.getInvoiceNumber().replace('/', '-') + ".pdf", "INVOICE_PDF", "pdf");
        invoice.setPdfFileId(stored.getId());
        return pdf;
    }
}
