import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { decryptField } from "@/lib/encryption";
import { ordersApiRateLimit } from "@/lib/api-security";

// pdfkit needs the Node runtime (fs, Buffer); it will not work on edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Invoices are only available once a customer has paid.
const INVOICEABLE_STATUSES = new Set(["PAID", "PROCESSING", "DELIVERED"]);

// Brand palette (mirrors tailwind `royal-*` tokens but baked in because pdfkit
// doesn't read CSS).
const BRAND = {
  primary: "#6366F1", // Indigo
  primaryDark: "#4338CA", // Indigo-700
  ink: "#040408", // match royal-bg
  text: "#1e1e3a", // slate-800
  muted: "#64748b", // slate-500
  line: "#e2e8f0", // slate-200
  surface: "#f8fafc", // slate-50
  success: "#16a34a", // green-600
};

function renderPdf(order: {
  orderNumber: string;
  playerUid: string;
  serverId: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  amountUsd: number;
  amountKhr: number | null;
  paymentMethod: string;
  paymentRef: string | null;
  status: string;
  createdAt: Date;
  paidAt: Date | null;
  deliveredAt: Date | null;
  game: { name: string; publisher: string; currencyName: string };
  product: { name: string; amount: number; bonus: number; priceUsd: number };
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      // Validate required data
      if (!order.game?.name || !order.product?.name) {
        throw new Error("Missing game or product data");
      }

      const doc = new PDFDocument({ size: "A4", margin: 0 });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

    const pageW = doc.page.width; // 595
    const pageH = doc.page.height; // 842
    const marginX = 50;
    const contentW = pageW - marginX * 2;

    // --- Header band ------------------------------------------------------
    const headerH = 140;
    doc.rect(0, 0, pageW, headerH).fill(BRAND.ink);
    // Accent bar
    doc.rect(0, headerH, pageW, 6).fill(BRAND.primary);

    // Brand lockup
    doc.fillColor(BRAND.primary).font("Helvetica-Bold").fontSize(26).text("TY KHAI", marginX, 44);
    const brandW = doc.widthOfString("TY KHAI");
    doc
      .fillColor("#ffffff")
      .fontSize(26)
      .text("TOPUP", marginX + brandW + 2, 44);
    doc
      .fillColor("#cbd5e1")
      .font("Helvetica")
      .fontSize(9)
      .text("Instant game top-up · Cambodia", marginX, 76);
    doc.fillColor("#94a3b8").fontSize(8).text("support: @Vichet_SAT on Telegram", marginX, 90);
    // INVOICE title right
    doc
      .fillColor("#ffffff")
      .font("Helvetica-Bold")
      .fontSize(34)
      .text("INVOICE", marginX, 44, { width: contentW, align: "right" });
    doc
      .fillColor("#cbd5e1")
      .font("Helvetica")
      .fontSize(9)
      .text(`No. ${order.orderNumber}`, marginX, 84, { width: contentW, align: "right" });
    doc
      .fillColor("#94a3b8")
      .fontSize(8)
      .text(
        `Issued ${new Date(order.paidAt ?? order.createdAt).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })}`,
        marginX,
        98,
        { width: contentW, align: "right" }
      );

    // --- Meta row (Billed To + Details) -----------------------------------
    let y = headerH + 40;

    const colW = (contentW - 30) / 2;
    // Left: Billed To
    doc
      .fillColor(BRAND.muted)
      .font("Helvetica-Bold")
      .fontSize(8)
      .text("BILLED TO", marginX, y, { characterSpacing: 1.5 });
    doc.fillColor(BRAND.text).font("Helvetica-Bold").fontSize(11);
    const customerLabel =
      order.customerEmail || order.customerPhone || `Player ${order.playerUid}`;
    doc.text(customerLabel, marginX, y + 14);
    doc.font("Helvetica").fontSize(9).fillColor(BRAND.muted);
    if (order.customerEmail && order.customerPhone) {
      doc.text(order.customerPhone, marginX, y + 30);
    }
    doc.text(`Player UID: ${order.playerUid}`, marginX, y + (order.customerEmail && order.customerPhone ? 44 : 30));
    if (order.serverId) {
      doc.text(`Server: ${order.serverId}`, marginX, y + (order.customerEmail && order.customerPhone ? 58 : 44));
    }

    // Right: Details
    const rx = marginX + colW + 30;
    doc
      .fillColor(BRAND.muted)
      .font("Helvetica-Bold")
      .fontSize(8)
      .text("ORDER DETAILS", rx, y, { characterSpacing: 1.5 });

    const detailRows: Array<[string, string]> = [
      ["Order #", order.orderNumber],
      [
        "Order Date",
        new Date(order.createdAt).toLocaleString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
      ],
      [
        "Payment",
        order.paymentMethod.replace(/_/g, " "),
      ],
    ];
    if (order.paymentRef) detailRows.push(["Reference", order.paymentRef]);
    if (order.paidAt) {
      detailRows.push([
        "Paid On",
        new Date(order.paidAt).toLocaleString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
      ]);
    }

    let detailY = y + 14;
    detailRows.forEach(([k, v]) => {
      doc.font("Helvetica").fontSize(9).fillColor(BRAND.muted).text(k, rx, detailY);
      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor(BRAND.text)
        .text(v, rx + 85, detailY, { width: colW - 85, align: "left" });
      detailY += 14;
    });

    // --- Items table ------------------------------------------------------
    y = Math.max(y + 110, detailY + 20);

    // Table header
    const tableH = 28;
    doc.rect(marginX, y, contentW, tableH).fill(BRAND.ink);

    const col = {
      desc: marginX + 14,
      qty: marginX + contentW - 200,
      unit: marginX + contentW - 130,
      total: marginX + contentW - 14,
    };

    doc
      .fillColor("#ffffff")
      .font("Helvetica-Bold")
      .fontSize(9)
      .text("DESCRIPTION", col.desc, y + 10, { characterSpacing: 1 });
    doc.text("QTY", col.qty, y + 10, { width: 40, align: "center" });
    doc.text("UNIT", col.unit, y + 10, { width: 60, align: "right" });
    doc.text("TOTAL", col.total - 60, y + 10, { width: 60, align: "right" });

    y += tableH;

    // Row
    const rowH = 64;
    doc.rect(marginX, y, contentW, rowH).fill(BRAND.surface);

    doc
      .fillColor(BRAND.text)
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(order.product.name, col.desc, y + 12, { width: contentW - 230 });
    const bonusText = order.product.bonus > 0 ? ` (+${order.product.bonus} bonus)` : "";
    doc
      .fillColor(BRAND.muted)
      .font("Helvetica")
      .fontSize(9)
      .text(
        `${order.game.name} — ${order.product.amount}${bonusText} ${order.game.currencyName}`,
        col.desc,
        y + 28,
        { width: contentW - 230 }
      );
    doc
      .fillColor(BRAND.muted)
      .fontSize(8)
      .text(`Delivered to UID ${order.playerUid}`, col.desc, y + 44, { width: contentW - 230 });

    doc
      .fillColor(BRAND.text)
      .font("Helvetica")
      .fontSize(10)
      .text("1", col.qty, y + 24, { width: 40, align: "center" });
    doc.text(`$${order.product.priceUsd.toFixed(2)}`, col.unit, y + 24, {
      width: 60,
      align: "right",
    });
    doc
      .font("Helvetica-Bold")
      .text(`$${order.amountUsd.toFixed(2)}`, col.total - 60, y + 24, { width: 60, align: "right" });

    y += rowH;

    // Totals block
    const totalsW = 240;
    const totalsX = marginX + contentW - totalsW;
    y += 10;

    const writeTotalsRow = (label: string, value: string, bold = false, accent = false) => {
      doc
        .fillColor(accent ? BRAND.primary : BRAND.muted)
        .font(bold ? "Helvetica-Bold" : "Helvetica")
        .fontSize(accent ? 13 : 10)
        .text(label, totalsX, y, { width: totalsW / 2, align: "left" });
      doc
        .fillColor(accent ? BRAND.primaryDark : BRAND.text)
        .font("Helvetica-Bold")
        .fontSize(accent ? 14 : 10)
        .text(value, totalsX + totalsW / 2, y, { width: totalsW / 2, align: "right" });
      y += accent ? 24 : 18;
    };

    writeTotalsRow("Subtotal", `$${order.amountUsd.toFixed(2)}`);
    writeTotalsRow("Fees", "$0.00");

    // Divider
    doc.moveTo(totalsX, y + 2).lineTo(totalsX + totalsW, y + 2).strokeColor(BRAND.line).lineWidth(1).stroke();
    y += 10;
    writeTotalsRow("TOTAL (USD)", `$${order.amountUsd.toFixed(2)}`, true, true);
    if (order.amountKhr) {
      doc
        .fillColor(BRAND.muted)
        .font("Helvetica")
        .fontSize(9)
        .text(
          `≈ ${Math.round(order.amountKhr).toLocaleString()} KHR`,
          totalsX,
          y,
          { width: totalsW, align: "right" }
        );
      y += 16;
    }

    // --- PAID stamp -------------------------------------------------------
    if (INVOICEABLE_STATUSES.has(order.status)) {
      const stampX = marginX + 60;
      const stampY = y + 30;
      doc.save();
      doc.rotate(-14, { origin: [stampX + 70, stampY + 30] });
      doc.strokeColor(BRAND.success).lineWidth(3).roundedRect(stampX, stampY, 180, 60, 8).stroke();
      doc
        .fillColor(BRAND.success)
        .font("Helvetica-Bold")
        .fontSize(28)
        .text("PAID", stampX, stampY + 14, { width: 180, align: "center", characterSpacing: 4 });
      doc
        .fontSize(8)
        .text(
          new Date(order.paidAt ?? order.createdAt).toLocaleDateString("en-GB"),
          stampX,
          stampY + 44,
          { width: 180, align: "center" }
        );
      doc.restore();
    }

    // --- Footer -----------------------------------------------------------
    const footerY = pageH - 110;
    doc.rect(0, footerY, pageW, 2).fill(BRAND.primary);
    doc.rect(0, footerY + 2, pageW, 108).fill(BRAND.ink);

    doc
      .fillColor("#ffffff")
      .font("Helvetica-Bold")
      .fontSize(12)
      .text("Thank you for your purchase!", marginX, footerY + 22);
    doc
      .fillColor("#cbd5e1")
      .font("Helvetica")
      .fontSize(9)
      .text(
        "Credits are delivered directly to your in-game account. If you don't receive them within 10 minutes, contact us with your order number.",
        marginX,
        footerY + 40,
        { width: contentW }
      );

    doc
      .fillColor(BRAND.primary)
      .font("Helvetica-Bold")
      .fontSize(9)
      .text("Telegram: @Vichet_SAT", marginX, footerY + 78);
    doc
      .fillColor("#94a3b8")
      .font("Helvetica")
      .fontSize(8)
      .text(
        `This is a computer-generated invoice for order ${order.orderNumber}. No signature required.`,
        marginX,
        footerY + 78,
        { width: contentW, align: "right" }
      );

    doc.end();
    } catch (error) {
      console.error("[invoice] renderPdf error:", error);
      reject(error);
    }
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  // Apply rate limiting
  const rateLimitResponse = await ordersApiRateLimit(req);
  if (rateLimitResponse) return rateLimitResponse;

  const { orderNumber } = await params;
  const order = await prisma.order.findUnique({
    where: { orderNumber: orderNumber.toUpperCase() },
    include: {
      game: { select: { name: true, publisher: true, currencyName: true } },
      product: { select: { name: true, amount: true, bonus: true, priceUsd: true } },
    },
  });

  if (!order) {
    console.error(`[invoice] Order not found: ${orderNumber}`);
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  
  // No authentication required - having the order number is sufficient
  // This allows customers to download invoices without logging in
  
  if (!INVOICEABLE_STATUSES.has(order.status)) {
    console.error(`[invoice] Invalid status: ${order.status}`);
    return NextResponse.json(
      { error: "Invoice is only available after payment is confirmed." },
      { status: 409 }
    );
  }

  // Validate required data
  if (!order.game || !order.product) {
    console.error(`[invoice] Missing game or product data for order: ${orderNumber}`);
    return NextResponse.json({ error: "Order data incomplete" }, { status: 400 });
  }

  try {
    console.log(`[invoice] Generating PDF for order: ${orderNumber}`);
    const pdf = await renderPdf({
      ...order,
      customerEmail: decryptField(order.customerEmail) ?? order.customerEmail,
      customerPhone: decryptField(order.customerPhone) ?? order.customerPhone,
    });

    console.log(`[invoice] PDF generated successfully: ${pdf.length} bytes`);

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="invoice-${order.orderNumber}.pdf"`,
        "Content-Length": String(pdf.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error(`[invoice] Error generating PDF:`, error);
    return NextResponse.json(
      { error: "Failed to generate invoice", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
