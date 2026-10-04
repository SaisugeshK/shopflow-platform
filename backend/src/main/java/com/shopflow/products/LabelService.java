package com.shopflow.products;

import com.shopflow.business.BusinessContext;
import com.shopflow.common.error.BusinessException;
import com.shopflow.tenancy.ModuleCode;
import com.shopflow.tenancy.TenantModules;
import org.openpdf.text.Document;
import org.openpdf.text.Element;
import org.openpdf.text.Font;
import org.openpdf.text.Image;
import org.openpdf.text.PageSize;
import org.openpdf.text.Paragraph;
import org.openpdf.text.Rectangle;
import org.openpdf.text.pdf.Barcode128;
import org.openpdf.text.pdf.PdfContentByte;
import org.openpdf.text.pdf.PdfPCell;
import org.openpdf.text.pdf.PdfPTable;
import org.openpdf.text.pdf.PdfWriter;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Printable barcode labels (§0B.7, BARCODE_LABELS module): an A4 sheet of 3 × 8 labels with the business name,
 * product name, price/MRP and a Code 128 barcode of the product's barcode (or SKU).
 */
@Service
public class LabelService {

    private static final int COLUMNS = 3;
    private static final float LABEL_HEIGHT = 96f;

    private final ProductService products;
    private final TenantModules modules;
    private final BusinessContext businessContext;

    public LabelService(ProductService products, TenantModules modules, BusinessContext businessContext) {
        this.products = products;
        this.modules = modules;
        this.businessContext = businessContext;
    }

    public byte[] productLabels(List<UUID> productIds, int copies) {
        modules.require(ModuleCode.BARCODE_LABELS);
        if (productIds == null || productIds.isEmpty()) {
            throw BusinessException.validation("ids", "Choose at least one product");
        }
        int perProduct = Math.max(1, Math.min(copies, 100));
        List<Product> list = products.getAll(productIds).stream().filter(p -> !p.isVariantGroup()).toList();
        if (list.isEmpty()) {
            throw BusinessException.validation("ids", "No printable products found");
        }
        if (list.size() * perProduct > 2400) {
            throw BusinessException.validation("copies", "At most 2400 labels per print");
        }
        List<Product> labels = new ArrayList<>();
        list.forEach(p -> {
            for (int i = 0; i < perProduct; i++) {
                labels.add(p);
            }
        });
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        Document doc = new Document(PageSize.A4, 18, 18, 24, 24);
        PdfWriter writer = PdfWriter.getInstance(doc, out);
        doc.open();
        PdfContentByte cb = writer.getDirectContent();
        PdfPTable table = new PdfPTable(COLUMNS);
        table.setWidthPercentage(100);
        Font small = new Font(Font.HELVETICA, 6.5f, Font.NORMAL);
        Font name = new Font(Font.HELVETICA, 8.5f, Font.BOLD);
        Font price = new Font(Font.HELVETICA, 9f, Font.BOLD);
        String business = businessContext.displayName();
        for (Product p : labels) {
            PdfPCell cell = new PdfPCell();
            cell.setFixedHeight(LABEL_HEIGHT);
            cell.setBorder(Rectangle.BOX);
            cell.setBorderWidth(0.3f);
            cell.setPadding(5);
            cell.addElement(new Paragraph(business, small));
            String title = p.getName().length() > 60 ? p.getName().substring(0, 57) + "…" : p.getName();
            cell.addElement(new Paragraph(title, name));
            String priceLine = "₹ " + plain(p.getSellingPrice()) + (p.getMrp() != null ? "   MRP ₹ " + plain(p.getMrp()) : "")
                    + " / " + p.getUnit().name();
            cell.addElement(new Paragraph(priceLine.replace("₹", "Rs."), price));
            Barcode128 code = new Barcode128();
            code.setCode(p.getBarcode() != null ? p.getBarcode() : p.getSku());
            code.setBarHeight(22f);
            code.setX(0.8f);
            code.setSize(6.5f);
            Image image = code.createImageWithBarcode(cb, null, null);
            image.scaleToFit(160f, 34f);
            image.setAlignment(Element.ALIGN_CENTER);
            cell.addElement(image);
            table.addCell(cell);
        }
        int remainder = labels.size() % COLUMNS;
        if (remainder != 0) {
            for (int i = remainder; i < COLUMNS; i++) {
                PdfPCell empty = new PdfPCell();
                empty.setBorder(Rectangle.NO_BORDER);
                empty.setFixedHeight(LABEL_HEIGHT);
                table.addCell(empty);
            }
        }
        doc.add(table);
        doc.close();
        return out.toByteArray();
    }

    private static String plain(BigDecimal v) {
        return v.setScale(2, java.math.RoundingMode.HALF_UP).toPlainString();
    }
}
