package com.shopflow.billing.pdf;

import com.shopflow.billing.Invoice;
import com.shopflow.billing.InvoiceItem;
import com.shopflow.billing.InvoiceStatus;
import com.shopflow.billing.InvoiceTaxSummary;
import com.shopflow.files.FileService;
import org.openpdf.text.Chunk;
import org.openpdf.text.Document;
import org.openpdf.text.Element;
import org.openpdf.text.Font;
import org.openpdf.text.Image;
import org.openpdf.text.PageSize;
import org.openpdf.text.Paragraph;
import org.openpdf.text.Phrase;
import org.openpdf.text.Rectangle;
import org.openpdf.text.pdf.ColumnText;
import org.openpdf.text.pdf.GrayColor;
import org.openpdf.text.pdf.PdfContentByte;
import org.openpdf.text.pdf.PdfGState;
import org.openpdf.text.pdf.PdfPCell;
import org.openpdf.text.pdf.PdfPTable;
import org.openpdf.text.pdf.PdfPageEventHelper;
import org.openpdf.text.pdf.PdfWriter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.UUID;

/**
 * Server-side, deterministic A4 tax-invoice PDF (§31, §99), rendered purely from the invoice snapshot so reprints
 * are identical. Payment state and credit notes are separate documents and are deliberately not printed here. Layout follows the conventional Indian GST invoice: seller header, invoice metadata grid, buyer,
 * item table, totals, amount in words, HSN tax summary, bank details, declaration, signature and the
 * "Computer Generated Invoice" marker.
 */
@Component
public class InvoicePdfRenderer {

    private static final Logger log = LoggerFactory.getLogger(InvoicePdfRenderer.class);
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd-MMM-yyyy", Locale.ENGLISH);
    private static final Color NAVY = new Color(0x0F, 0x27, 0x47);
    private static final Color BORDER = new Color(0x94, 0xA3, 0xB8);
    private static final Color HEADER_BG = new Color(0xE2, 0xE8, 0xF0);
    private static final Font TITLE = new Font(Font.HELVETICA, 13, Font.BOLD, NAVY);
    private static final Font BOLD = new Font(Font.HELVETICA, 8, Font.BOLD);
    private static final Font NORMAL = new Font(Font.HELVETICA, 8, Font.NORMAL);
    private static final Font SMALL = new Font(Font.HELVETICA, 7, Font.NORMAL, new Color(0x33, 0x41, 0x55));
    private static final Font SELLER = new Font(Font.HELVETICA, 12, Font.BOLD, NAVY);
    private static final Font WARN = new Font(Font.HELVETICA, 8, Font.BOLD, new Color(0xB4, 0x53, 0x09));

    private final FileService files;

    public InvoicePdfRenderer(FileService files) {
        this.files = files;
    }

    public byte[] render(Invoice inv) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        Document doc = new Document(PageSize.A4, 24, 24, 24, 30);
        PdfWriter writer = PdfWriter.getInstance(doc, out);
        writer.setPageEvent(new Footer(inv));
        doc.addTitle("Tax Invoice " + nz(inv.getInvoiceNumber()));
        doc.addCreator("Shop Management Platform");
        doc.open();

        PdfPTable title = new PdfPTable(new float[]{1, 1});
        title.setWidthPercentage(100);
        title.addCell(plain(new Phrase("TAX INVOICE" + ("TAX_INVOICE".equals(inv.getInvoiceType()) ? "" : " (" + inv.getInvoiceType() + ")"), TITLE), Element.ALIGN_LEFT));
        String copy = "ORIGINAL".equals(inv.getCopyLabel()) ? "ORIGINAL FOR RECIPIENT" : inv.getCopyLabel();
        title.addCell(plain(new Phrase(copy, BOLD), Element.ALIGN_RIGHT));
        doc.add(title);

        // Seller + invoice metadata
        PdfPTable top = new PdfPTable(new float[]{1.15f, 1});
        top.setWidthPercentage(100);
        top.setSpacingBefore(4);
        top.addCell(sellerCell(inv));
        top.addCell(metaCell(inv));
        doc.add(top);

        // Buyer + dispatch
        PdfPTable party = new PdfPTable(new float[]{1.15f, 1});
        party.setWidthPercentage(100);
        party.addCell(boxed(buyerBlock(inv)));
        party.addCell(boxed(dispatchBlock(inv)));
        doc.add(party);

        doc.add(itemsTable(inv));
        doc.add(totalsTable(inv));

        PdfPTable words = new PdfPTable(1);
        words.setWidthPercentage(100);
        Phrase w = new Phrase();
        w.add(new Chunk("Amount Chargeable (in words): ", BOLD));
        w.add(new Chunk(nz(inv.getAmountInWords()), NORMAL));
        words.addCell(boxed(w));
        doc.add(words);

        doc.add(taxSummaryTable(inv));

        PdfPTable taxWords = new PdfPTable(1);
        taxWords.setWidthPercentage(100);
        Phrase tw = new Phrase();
        tw.add(new Chunk("Tax Amount (in words): ", BOLD));
        tw.add(new Chunk(nz(inv.getTaxAmountInWords()), NORMAL));
        taxWords.addCell(boxed(tw));
        doc.add(taxWords);

        doc.add(footerTable(inv));

        if (inv.getIrn() != null) {
            PdfPTable ein = new PdfPTable(1);
            ein.setWidthPercentage(100);
            Phrase e = new Phrase();
            boolean test = inv.getEinvoiceStatus() == Invoice.EInvoiceStatus.TEST_IRN;
            if (test) {
                e.add(new Chunk("TEST ONLY - NOT A GOVERNMENT-ISSUED IRN\n", WARN));
            }
            e.add(new Chunk("IRN: ", BOLD));
            e.add(new Chunk(inv.getIrn() + "\n", SMALL));
            e.add(new Chunk("Ack No: ", BOLD));
            e.add(new Chunk(nz(inv.getAckNumber()) + "   ", SMALL));
            e.add(new Chunk("Ack Date: ", BOLD));
            e.add(new Chunk(inv.getAckDate() == null ? "" : inv.getAckDate().toString(), SMALL));
            ein.addCell(boxed(e));
            doc.add(ein);
        }

        Paragraph generated = new Paragraph("This is a Computer Generated Invoice", SMALL);
        generated.setAlignment(Element.ALIGN_CENTER);
        generated.setSpacingBefore(6);
        doc.add(generated);
        doc.close();
        return out.toByteArray();
    }

    private PdfPCell sellerCell(Invoice inv) {
        PdfPTable inner = new PdfPTable(new float[]{0.28f, 1});
        inner.setWidthPercentage(100);
        Image logo = image(inv.getSellerLogoFileId());
        if (logo != null) {
            logo.scaleToFit(56, 56);
            PdfPCell lc = new PdfPCell(logo, false);
            lc.setBorder(Rectangle.NO_BORDER);
            lc.setPadding(2);
            inner.addCell(lc);
        } else {
            inner.addCell(plain(new Phrase(""), Element.ALIGN_LEFT));
        }
        Phrase p = new Phrase();
        p.add(new Chunk(nz(inv.getSellerName()) + "\n", SELLER));
        p.add(new Chunk(nz(inv.getSellerAddress()) + "\n", NORMAL));
        if (inv.getSellerPhone() != null) {
            p.add(new Chunk("Phone: " + inv.getSellerPhone() + "\n", NORMAL));
        }
        if (inv.getSellerEmail() != null) {
            p.add(new Chunk("Email: " + inv.getSellerEmail() + "\n", NORMAL));
        }
        p.add(new Chunk("GSTIN/UIN: " + nz(inv.getSellerGstin()), BOLD));
        if (inv.getSellerPan() != null) {
            p.add(new Chunk("   PAN: " + inv.getSellerPan(), NORMAL));
        }
        p.add(new Chunk("\nState: " + nz(inv.getSellerState()) + ", Code: " + nz(inv.getSellerStateCode()), NORMAL));
        PdfPCell text = new PdfPCell(p);
        text.setBorder(Rectangle.NO_BORDER);
        inner.addCell(text);
        PdfPCell cell = new PdfPCell(inner);
        border(cell);
        return cell;
    }

    private PdfPCell metaCell(Invoice inv) {
        PdfPTable m = new PdfPTable(2);
        m.setWidthPercentage(100);
        meta(m, "Invoice No.", nz(inv.getInvoiceNumber()), "Dated", inv.getInvoiceDate() == null ? "" : DATE.format(inv.getInvoiceDate()));
        meta(m, "Mode/Terms of Payment", (inv.getPaymentType() == com.shopflow.payments.PaymentMethod.CREDIT ? "CREDIT BILL" : inv.getPaymentType().name())
                + (inv.getPaymentTerms() != null ? " - " + inv.getPaymentTerms() : ""), "Due Date", inv.getDueDate() == null ? "" : DATE.format(inv.getDueDate()));
        meta(m, "Buyer's Order No.", nz(inv.getBuyerOrderNumber()), "Delivery Note", nz(inv.getDeliveryNote()));
        PdfPCell cell = new PdfPCell(m);
        border(cell);
        cell.setPadding(0);
        return cell;
    }

    private static void meta(PdfPTable t, String l1, String v1, String l2, String v2) {
        t.addCell(metaEntry(l1, v1));
        t.addCell(metaEntry(l2, v2));
    }

    private static PdfPCell metaEntry(String label, String value) {
        Phrase p = new Phrase();
        p.add(new Chunk(label + "\n", SMALL));
        p.add(new Chunk(value, BOLD));
        PdfPCell c = new PdfPCell(p);
        c.setBorderColor(BORDER);
        c.setBorderWidth(0.5f);
        c.setPadding(3);
        c.setMinimumHeight(22);
        return c;
    }

    private static Phrase buyerBlock(Invoice inv) {
        Phrase p = new Phrase();
        p.add(new Chunk("Buyer (Bill to)\n", SMALL));
        p.add(new Chunk(nz(inv.getBuyerName()) + "\n", BOLD));
        if (inv.getBuyerContactName() != null) {
            p.add(new Chunk("Attn: " + inv.getBuyerContactName() + "\n", NORMAL));
        }
        p.add(new Chunk(joinAddress(inv) + "\n", NORMAL));
        p.add(new Chunk("Mobile: " + nz(inv.getBuyerMobile()) + "\n", NORMAL));
        p.add(new Chunk("GSTIN/UIN: " + (inv.getBuyerGstin() == null ? "Unregistered" : inv.getBuyerGstin()), BOLD));
        if (inv.getBuyerPan() != null) {
            p.add(new Chunk("   PAN: " + inv.getBuyerPan(), NORMAL));
        }
        p.add(new Chunk("\nState: " + nz(inv.getBuyerState()) + ", Code: " + nz(inv.getBuyerStateCode())
                + (inv.isInterState() ? "   (Inter-state supply)" : ""), NORMAL));
        return p;
    }

    private static Phrase dispatchBlock(Invoice inv) {
        Phrase p = new Phrase();
        p.add(new Chunk("Dispatch Details\n", SMALL));
        p.add(new Chunk("Dispatch Doc No.: " + nz(inv.getDispatchDocument()) + "\n", NORMAL));
        p.add(new Chunk("Dispatched through: " + nz(inv.getTransport()) + "\n", NORMAL));
        p.add(new Chunk("Vehicle No.: " + nz(inv.getVehicleNumber()) + "\n", NORMAL));
        p.add(new Chunk("Destination: " + nz(inv.getDestination()) + "\n", NORMAL));
        if (inv.getNotes() != null) {
            p.add(new Chunk("Notes: " + inv.getNotes(), NORMAL));
        }
        return p;
    }

    private PdfPTable itemsTable(Invoice inv) {
        boolean igst = inv.isInterState();
        float[] widths = igst
                ? new float[]{0.35f, 2.6f, 0.75f, 0.8f, 0.9f, 0.55f, 1.0f, 0.5f, 0.9f, 1.05f}
                : new float[]{0.35f, 2.4f, 0.7f, 0.75f, 0.85f, 0.5f, 0.95f, 0.45f, 0.8f, 0.8f, 1.0f};
        PdfPTable t = new PdfPTable(widths);
        t.setWidthPercentage(100);
        t.setHeaderRows(1);
        String[] headers = igst
                ? new String[]{"Sl", "Description of Goods", "HSN/SAC", "Quantity", "Rate", "Disc %", "Taxable Value", "GST %", "IGST", "Amount"}
                : new String[]{"Sl", "Description of Goods", "HSN/SAC", "Quantity", "Rate", "Disc %", "Taxable Value", "GST %", "CGST", "SGST", "Amount"};
        for (String h : headers) {
            PdfPCell c = new PdfPCell(new Phrase(h, BOLD));
            c.setBackgroundColor(HEADER_BG);
            c.setHorizontalAlignment(Element.ALIGN_CENTER);
            c.setBorderColor(BORDER);
            c.setPadding(3);
            t.addCell(c);
        }
        for (InvoiceItem i : inv.getItems()) {
            t.addCell(num(String.valueOf(i.getLineNumber()), Element.ALIGN_CENTER));
            Phrase desc = new Phrase(i.getProductName(), BOLD);
            if (i.getDescription() != null) {
                desc.add(new Chunk("\n" + i.getDescription(), SMALL));
            }
            if (i.isFreeItem()) {
                desc.add(new Chunk("\nFree goods" + (i.getSchemeName() != null ? " (" + i.getSchemeName() + ")" : ""), SMALL));
            } else if (i.getSchemeName() != null) {
                desc.add(new Chunk("\nScheme: " + i.getSchemeName(), SMALL));
            }
            if (i.getBatchDetails() != null && !i.getBatchDetails().startsWith("BATCH:")) {
                desc.add(new Chunk("\nBatch: " + i.getBatchDetails(), SMALL));
            }
            if (i.getSerialNumbers() != null && !i.getSerialNumbers().isBlank()) {
                desc.add(new Chunk("\nSerial no.: " + i.getSerialNumbers().replace(",", ", "), SMALL));
            }
            PdfPCell d = new PdfPCell(desc);
            d.setBorderColor(BORDER);
            d.setPadding(3);
            t.addCell(d);
            t.addCell(num(nz(i.getHsnCode()), Element.ALIGN_CENTER));
            t.addCell(num(qty(i.getQuantity()) + " " + i.getUnit(), Element.ALIGN_RIGHT));
            t.addCell(num(money(i.getRate()), Element.ALIGN_RIGHT));
            t.addCell(num(pct(i.getDiscountPercent()), Element.ALIGN_RIGHT));
            t.addCell(num(money(i.getTaxableAmount()), Element.ALIGN_RIGHT));
            t.addCell(num(pct(i.getTaxRate()), Element.ALIGN_RIGHT));
            if (igst) {
                t.addCell(num(money(i.getIgstAmount()), Element.ALIGN_RIGHT));
            } else {
                t.addCell(num(money(i.getCgstAmount()), Element.ALIGN_RIGHT));
                t.addCell(num(money(i.getSgstAmount()), Element.ALIGN_RIGHT));
            }
            t.addCell(num(money(i.getLineTotal()), Element.ALIGN_RIGHT));
        }
        // Invoice-level charges (transport, loading…) with their own GST.
        for (com.shopflow.billing.InvoiceCharge c : inv.getCharges()) {
            t.addCell(num("", Element.ALIGN_CENTER));
            PdfPCell d = new PdfPCell(new Phrase(c.displayName(), BOLD));
            d.setBorderColor(BORDER);
            d.setPadding(3);
            t.addCell(d);
            t.addCell(num(nz(c.getSacCode()), Element.ALIGN_CENTER));
            t.addCell(num("", Element.ALIGN_RIGHT));
            t.addCell(num(money(c.getAmount()), Element.ALIGN_RIGHT));
            t.addCell(num("", Element.ALIGN_RIGHT));
            t.addCell(num(money(c.getAmount()), Element.ALIGN_RIGHT));
            t.addCell(num(pct(c.getTaxRate()), Element.ALIGN_RIGHT));
            if (igst) {
                t.addCell(num(money(c.getIgstAmount()), Element.ALIGN_RIGHT));
            } else {
                t.addCell(num(money(c.getCgstAmount()), Element.ALIGN_RIGHT));
                t.addCell(num(money(c.getSgstAmount()), Element.ALIGN_RIGHT));
            }
            t.addCell(num(money(c.getTotal()), Element.ALIGN_RIGHT));
        }
        return t;
    }

    private static PdfPTable totalsTable(Invoice inv) {
        PdfPTable t = new PdfPTable(new float[]{3, 1.2f});
        t.setWidthPercentage(100);
        totalRow(t, "Sub Total (before discount)", money(inv.getSubtotal()), false);
        if (inv.getDiscountTotal().signum() > 0) {
            totalRow(t, "Less: Discount", "-" + money(inv.getDiscountTotal()), false);
        }
        totalRow(t, "Taxable Value", money(inv.getTaxableTotal()), false);
        if (inv.isInterState()) {
            totalRow(t, "IGST", money(inv.getIgstTotal()), false);
        } else {
            totalRow(t, "CGST", money(inv.getCgstTotal()), false);
            totalRow(t, "SGST/UTGST", money(inv.getSgstTotal()), false);
        }
        if (inv.getRoundOff().signum() != 0) {
            totalRow(t, "Round Off", money(inv.getRoundOff()), false);
        }
        totalRow(t, "Grand Total (Rs.)", money(inv.getGrandTotal()), true);
        return t;
    }

    private static void totalRow(PdfPTable t, String label, String value, boolean strong) {
        PdfPCell l = new PdfPCell(new Phrase(label, strong ? BOLD : NORMAL));
        l.setHorizontalAlignment(Element.ALIGN_RIGHT);
        l.setBorderColor(BORDER);
        l.setPadding(3);
        PdfPCell v = new PdfPCell(new Phrase(value, strong ? BOLD : NORMAL));
        v.setHorizontalAlignment(Element.ALIGN_RIGHT);
        v.setBorderColor(BORDER);
        v.setPadding(3);
        if (strong) {
            l.setBackgroundColor(HEADER_BG);
            v.setBackgroundColor(HEADER_BG);
        }
        t.addCell(l);
        t.addCell(v);
    }

    private static PdfPTable taxSummaryTable(Invoice inv) {
        boolean igst = inv.isInterState();
        PdfPTable t = new PdfPTable(igst ? new float[]{1.2f, 1.2f, 0.8f, 1.2f, 1.2f} : new float[]{1.2f, 1.2f, 0.8f, 1, 1, 1.2f});
        t.setWidthPercentage(100);
        t.setSpacingBefore(4);
        String[] headers = igst ? new String[]{"HSN/SAC", "Taxable Value", "Rate", "IGST", "Total Tax"}
                : new String[]{"HSN/SAC", "Taxable Value", "Rate", "CGST", "SGST/UTGST", "Total Tax"};
        for (String h : headers) {
            PdfPCell c = new PdfPCell(new Phrase(h, BOLD));
            c.setBackgroundColor(HEADER_BG);
            c.setHorizontalAlignment(Element.ALIGN_CENTER);
            c.setBorderColor(BORDER);
            c.setPadding(3);
            t.addCell(c);
        }
        for (InvoiceTaxSummary s : inv.getTaxSummaries()) {
            t.addCell(num(nz(s.getHsnCode()), Element.ALIGN_CENTER));
            t.addCell(num(money(s.getTaxableAmount()), Element.ALIGN_RIGHT));
            t.addCell(num(pct(s.getTaxRate()), Element.ALIGN_RIGHT));
            if (igst) {
                t.addCell(num(money(s.getIgstAmount()), Element.ALIGN_RIGHT));
            } else {
                t.addCell(num(money(s.getCgstAmount()), Element.ALIGN_RIGHT));
                t.addCell(num(money(s.getSgstAmount()), Element.ALIGN_RIGHT));
            }
            t.addCell(num(money(s.getTotalTax()), Element.ALIGN_RIGHT));
        }
        return t;
    }

    private PdfPTable footerTable(Invoice inv) {
        PdfPTable t = new PdfPTable(new float[]{1.2f, 1});
        t.setWidthPercentage(100);
        t.setSpacingBefore(4);
        Phrase left = new Phrase();
        if (inv.getBankName() != null) {
            left.add(new Chunk("Company's Bank Details\n", BOLD));
            left.add(new Chunk("Bank Name: " + inv.getBankName() + "\nA/c No.: " + nz(inv.getBankAccountNumber())
                    + "\nBranch & IFS Code: " + nz(inv.getBankBranch()) + " & " + nz(inv.getBankIfsc()) + "\n\n", NORMAL));
        }
        if (inv.getDeclaration() != null) {
            left.add(new Chunk("Declaration\n", BOLD));
            left.add(new Chunk(inv.getDeclaration() + "\n\n", SMALL));
        }
        if (inv.getTermsAndConditions() != null) {
            left.add(new Chunk("Terms & Conditions\n", BOLD));
            left.add(new Chunk(inv.getTermsAndConditions(), SMALL));
        }
        t.addCell(boxed(left));
        PdfPTable sign = new PdfPTable(1);
        sign.addCell(plain(new Phrase("for " + nz(inv.getSellerName()), BOLD), Element.ALIGN_RIGHT));
        PdfPCell space = plain(new Phrase(" "), Element.ALIGN_RIGHT);
        space.setMinimumHeight(48);
        sign.addCell(space);
        sign.addCell(plain(new Phrase(inv.getAuthorizedSignatory() != null ? inv.getAuthorizedSignatory() : "Authorised Signatory", NORMAL), Element.ALIGN_RIGHT));
        PdfPCell sc = new PdfPCell(sign);
        border(sc);
        sc.setVerticalAlignment(Element.ALIGN_BOTTOM);
        t.addCell(sc);
        return t;
    }

    private Image image(UUID fileId) {
        if (fileId == null) {
            return null;
        }
        try {
            return Image.getInstance(files.read(files.get(fileId)));
        } catch (Exception e) {
            log.warn("Could not load image {} for invoice PDF: {}", fileId, e.getMessage());
            return null;
        }
    }

    private static String joinAddress(Invoice inv) {
        StringBuilder sb = new StringBuilder(nz(inv.getBuyerAddress()));
        if (inv.getBuyerCity() != null) {
            sb.append(", ").append(inv.getBuyerCity());
        }
        if (inv.getBuyerPincode() != null) {
            sb.append(" - ").append(inv.getBuyerPincode());
        }
        return sb.toString();
    }

    private static PdfPCell boxed(Phrase p) {
        PdfPCell c = new PdfPCell(p);
        border(c);
        return c;
    }

    private static void border(PdfPCell c) {
        c.setBorderColor(BORDER);
        c.setBorderWidth(0.75f);
        c.setPadding(5);
    }

    private static PdfPCell plain(Phrase p, int align) {
        PdfPCell c = new PdfPCell(p);
        c.setBorder(Rectangle.NO_BORDER);
        c.setHorizontalAlignment(align);
        c.setPadding(2);
        return c;
    }

    private static PdfPCell num(String text, int align) {
        PdfPCell c = new PdfPCell(new Phrase(text, NORMAL));
        c.setHorizontalAlignment(align);
        c.setBorderColor(BORDER);
        c.setPadding(3);
        return c;
    }

    static String money(BigDecimal v) {
        if (v == null) {
            return "";
        }
        return IndianNumberFormat.format(v);
    }

    private static String qty(BigDecimal v) {
        return v.stripTrailingZeros().toPlainString();
    }

    private static String pct(BigDecimal v) {
        return v == null ? "" : v.stripTrailingZeros().toPlainString() + "%";
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }

    /** Page numbers and a CANCELLED / DRAFT watermark. */
    private static final class Footer extends PdfPageEventHelper {
        private final Invoice invoice;

        Footer(Invoice invoice) {
            this.invoice = invoice;
        }

        @Override
        public void onEndPage(PdfWriter writer, Document document) {
            PdfContentByte cb = writer.getDirectContent();
            ColumnText.showTextAligned(cb, Element.ALIGN_CENTER,
                    new Phrase((invoice.getInvoiceNumber() == null ? "Draft" : invoice.getInvoiceNumber()) + "  |  Page " + writer.getPageNumber(), SMALL),
                    (document.left() + document.right()) / 2, document.bottom() - 16, 0);
            String mark = invoice.getStatus() == InvoiceStatus.CANCELLED ? "CANCELLED"
                    : invoice.getStatus() == InvoiceStatus.DRAFT ? "DRAFT" : null;
            if (mark != null) {
                PdfContentByte under = writer.getDirectContentUnder();
                under.saveState();
                PdfGState gs = new PdfGState();
                gs.setFillOpacity(0.12f);
                under.setGState(gs);
                ColumnText.showTextAligned(under, Element.ALIGN_CENTER,
                        new Phrase(mark, new Font(Font.HELVETICA, 90, Font.BOLD, new GrayColor(0.2f))),
                        297, 421, 45);
                under.restoreState();
            }
        }
    }
}
