package com.shopflow.reports;

import com.shopflow.billing.pdf.IndianNumberFormat;
import com.shopflow.common.error.BusinessException;
import com.shopflow.reports.ReportResult.Column;
import org.dhatim.fastexcel.Workbook;
import org.dhatim.fastexcel.Worksheet;
import org.openpdf.text.Document;
import org.openpdf.text.Element;
import org.openpdf.text.Font;
import org.openpdf.text.PageSize;
import org.openpdf.text.Paragraph;
import org.openpdf.text.Phrase;
import org.openpdf.text.pdf.PdfPCell;
import org.openpdf.text.pdf.PdfPTable;
import org.openpdf.text.pdf.PdfWriter;
import org.springframework.stereotype.Service;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.Map;

/**
 * CSV, Excel and PDF exports of a {@link ReportResult} (§42). The report is built with the caller's filters and
 * permissions before export, so every format contains exactly what the screen shows.
 */
@Service
public class ExportService {

    public record Export(byte[] content, String contentType, String fileName) {
    }

    public Export export(ReportResult report, String format) {
        String base = report.name() + "-report-" + report.from() + "-to-" + report.to();
        return switch (format.toLowerCase()) {
            case "csv" -> new Export(csv(report), "text/csv; charset=utf-8", base + ".csv");
            case "xlsx" -> new Export(xlsx(report), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", base + ".xlsx");
            case "pdf" -> new Export(pdf(report), "application/pdf", base + ".pdf");
            default -> throw BusinessException.validation("format", "format must be csv, xlsx or pdf");
        };
    }

    byte[] csv(ReportResult r) {
        StringBuilder sb = new StringBuilder("﻿");
        sb.append(String.join(",", r.columns().stream().map(c -> escape(c.label())).toList())).append("\r\n");
        for (Map<String, Object> row : r.rows()) {
            sb.append(String.join(",", r.columns().stream().map(c -> escape(plain(row.get(c.key())))).toList())).append("\r\n");
        }
        if (!r.totals().isEmpty()) {
            sb.append(String.join(",", r.columns().stream().map(c -> {
                if (c == r.columns().getFirst()) {
                    return "Total";
                }
                return escape(plain(r.totals().get(c.key())));
            }).toList())).append("\r\n");
        }
        return sb.toString().getBytes(StandardCharsets.UTF_8);
    }

    /** Neutralises spreadsheet formula injection and quotes as needed. */
    static String escape(String value) {
        if (value == null) {
            return "";
        }
        String v = value;
        if (!v.isEmpty() && "=+-@\t\r".indexOf(v.charAt(0)) >= 0 && !v.matches("^-?\\d+(\\.\\d+)?$")) {
            v = "'" + v;
        }
        if (v.contains(",") || v.contains("\"") || v.contains("\n") || v.contains("\r")) {
            v = "\"" + v.replace("\"", "\"\"") + "\"";
        }
        return v;
    }

    private static String plain(Object v) {
        if (v == null) {
            return "";
        }
        if (v instanceof BigDecimal b) {
            return b.toPlainString();
        }
        return v.toString();
    }

    byte[] xlsx(ReportResult r) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (Workbook wb = new Workbook(out, "ShopFlow", "1.0")) {
            Worksheet ws = wb.newWorksheet(r.title().length() > 31 ? r.title().substring(0, 31) : r.title());
            ws.value(0, 0, r.title() + " (" + r.from() + " to " + r.to() + ")");
            ws.style(0, 0).bold().set();
            int col = 0;
            for (Column c : r.columns()) {
                ws.value(2, col, c.label());
                ws.style(2, col).bold().fillColor("E2E8F0").set();
                col++;
            }
            int rowIdx = 3;
            for (Map<String, Object> row : r.rows()) {
                col = 0;
                for (Column c : r.columns()) {
                    cell(ws, rowIdx, col, row.get(c.key()), c);
                    col++;
                }
                rowIdx++;
            }
            if (!r.totals().isEmpty()) {
                ws.value(rowIdx, 0, "Total");
                col = 0;
                for (Column c : r.columns()) {
                    if (r.totals().containsKey(c.key())) {
                        cell(ws, rowIdx, col, r.totals().get(c.key()), c);
                    }
                    ws.style(rowIdx, col).bold().set();
                    col++;
                }
            }
            ws.freezePane(0, 3);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return out.toByteArray();
    }

    private static void cell(Worksheet ws, int r, int c, Object v, Column col) {
        if (v == null) {
            return;
        }
        if (v instanceof BigDecimal b) {
            ws.value(r, c, b);
            ws.style(r, c).format(col.type() == ReportResult.Type.QUANTITY ? "#,##0.###" : "#,##0.00").set();
        } else if (v instanceof Number n) {
            ws.value(r, c, n);
        } else if (v instanceof LocalDate d) {
            ws.value(r, c, d);
            ws.style(r, c).format("dd-mmm-yyyy").set();
        } else {
            ws.value(r, c, v.toString());
        }
    }

    byte[] pdf(ReportResult r) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        Document doc = new Document(r.columns().size() > 7 ? PageSize.A4.rotate() : PageSize.A4, 20, 20, 24, 24);
        PdfWriter.getInstance(doc, out);
        doc.open();
        doc.add(new Paragraph(r.title(), new Font(Font.HELVETICA, 13, Font.BOLD, new Color(0x0F, 0x27, 0x47))));
        doc.add(new Paragraph("Period: " + r.from() + " to " + r.to() + "   Rows: " + r.rows().size(), new Font(Font.HELVETICA, 8)));
        PdfPTable t = new PdfPTable(r.columns().size());
        t.setWidthPercentage(100);
        t.setSpacingBefore(6);
        t.setHeaderRows(1);
        Font head = new Font(Font.HELVETICA, 7, Font.BOLD);
        Font body = new Font(Font.HELVETICA, 7);
        for (Column c : r.columns()) {
            PdfPCell cell = new PdfPCell(new Phrase(c.label(), head));
            cell.setBackgroundColor(new Color(0xE2, 0xE8, 0xF0));
            t.addCell(cell);
        }
        for (Map<String, Object> row : r.rows()) {
            for (Column c : r.columns()) {
                t.addCell(pdfCell(row.get(c.key()), c, body));
            }
        }
        if (!r.totals().isEmpty()) {
            for (Column c : r.columns()) {
                Object v = c == r.columns().getFirst() ? "Total" : r.totals().get(c.key());
                t.addCell(pdfCell(v, c, head));
            }
        }
        doc.add(t);
        doc.close();
        return out.toByteArray();
    }

    private static PdfPCell pdfCell(Object v, Column c, Font font) {
        String text = v == null ? "" : v instanceof BigDecimal b
                ? (c.type() == ReportResult.Type.MONEY ? IndianNumberFormat.format(b) : b.stripTrailingZeros().toPlainString())
                : v.toString();
        PdfPCell cell = new PdfPCell(new Phrase(text, font));
        if (v instanceof Number) {
            cell.setHorizontalAlignment(Element.ALIGN_RIGHT);
        }
        return cell;
    }
}
