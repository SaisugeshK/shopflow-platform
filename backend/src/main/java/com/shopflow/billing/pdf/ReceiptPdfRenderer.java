package com.shopflow.billing.pdf;

import com.shopflow.business.Business;
import com.shopflow.common.util.AmountInWords;
import com.shopflow.customers.Customer;
import com.shopflow.payments.Payment;
import org.openpdf.text.Chunk;
import org.openpdf.text.Document;
import org.openpdf.text.Element;
import org.openpdf.text.Font;
import org.openpdf.text.PageSize;
import org.openpdf.text.Paragraph;
import org.openpdf.text.Phrase;
import org.openpdf.text.pdf.PdfPCell;
import org.openpdf.text.pdf.PdfPTable;
import org.openpdf.text.pdf.PdfWriter;
import org.springframework.stereotype.Component;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;

/** A5 payment receipt rendered from the payment record. */
@Component
public class ReceiptPdfRenderer {

    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("dd-MMM-yyyy HH:mm", Locale.ENGLISH);
    private static final Font TITLE = new Font(Font.HELVETICA, 14, Font.BOLD, new Color(0x0F, 0x27, 0x47));
    private static final Font BOLD = new Font(Font.HELVETICA, 9, Font.BOLD);
    private static final Font NORMAL = new Font(Font.HELVETICA, 9, Font.NORMAL);

    public byte[] render(Business business, Customer customer, Payment payment, List<String> allocations, ZoneId zone) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        Document doc = new Document(PageSize.A5, 28, 28, 28, 28);
        PdfWriter.getInstance(doc, out);
        doc.open();
        Paragraph shop = new Paragraph(business.getName(), TITLE);
        shop.setAlignment(Element.ALIGN_CENTER);
        doc.add(shop);
        Paragraph addr = new Paragraph(business.formattedAddress() + (business.getGstin() != null ? "\nGSTIN: " + business.getGstin() : ""), NORMAL);
        addr.setAlignment(Element.ALIGN_CENTER);
        doc.add(addr);
        Paragraph title = new Paragraph("PAYMENT RECEIPT", BOLD);
        title.setAlignment(Element.ALIGN_CENTER);
        title.setSpacingBefore(10);
        title.setSpacingAfter(8);
        doc.add(title);

        PdfPTable t = new PdfPTable(new float[]{1, 2});
        t.setWidthPercentage(100);
        row(t, "Receipt No.", payment.getPaymentNumber());
        row(t, "Date", payment.getPaidAt() == null ? "" : DATE_TIME.format(payment.getPaidAt().atZone(zone)));
        row(t, "Received from", customer.getShopName() + " (" + customer.getCustomerCode() + ")");
        row(t, "Amount", "Rs. " + IndianNumberFormat.format(payment.getAmount()));
        row(t, "In words", AmountInWords.inr(payment.getAmount()));
        row(t, "Mode", payment.getMethod().name() + (payment.getReferenceNumber() != null ? " / Ref " + payment.getReferenceNumber() : ""));
        if (!allocations.isEmpty()) {
            row(t, "Against", String.join(", ", allocations));
        }
        if (payment.getRefundedAmount().signum() > 0) {
            row(t, "Refunded", "Rs. " + IndianNumberFormat.format(payment.getRefundedAmount()));
        }
        row(t, "Status", payment.getStatus().name());
        doc.add(t);

        Paragraph sign = new Paragraph("\n\nfor " + business.getName() + "\nAuthorised Signatory", NORMAL);
        sign.setAlignment(Element.ALIGN_RIGHT);
        doc.add(sign);
        Paragraph note = new Paragraph(new Phrase(new Chunk("This is a computer generated receipt", new Font(Font.HELVETICA, 7))));
        note.setAlignment(Element.ALIGN_CENTER);
        note.setSpacingBefore(12);
        doc.add(note);
        doc.close();
        return out.toByteArray();
    }

    private static void row(PdfPTable t, String label, String value) {
        PdfPCell l = new PdfPCell(new Phrase(label, BOLD));
        l.setPadding(4);
        PdfPCell v = new PdfPCell(new Phrase(value == null ? "" : value, NORMAL));
        v.setPadding(4);
        t.addCell(l);
        t.addCell(v);
    }
}
