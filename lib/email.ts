import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendOrderReceipt(order: {
  orderNumber: string;
  gameName: string;
  productName: string;
  playerUid: string;
  amountUsd: number;
  amountKhr: number | null;
  currency: string;
  paidAt: Date | null;
  deliveredAt: Date | null;
  status: string;
  customerEmail: string | null;
}) {
  if (!order.customerEmail || !process.env.SMTP_USER) {
    console.log("Skipping email: no email or SMTP not configured");
    return false;
  }

  const paidDate = order.paidAt ? new Date(order.paidAt).toLocaleString("en-US", { timeZone: "Asia/Phnom_Penh" }) : "N/A";
  const deliverDate = order.deliveredAt ? new Date(order.deliveredAt).toLocaleString("en-US", { timeZone: "Asia/Phnom_Penh" }) : "N/A";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Receipt - ${order.orderNumber}</title>
</head>
<body style="font-family: Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 30px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 28px;">TY KHAI TOPUP</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0; font-size: 14px;">Order Receipt</p>
    </div>

    <!-- Order Info -->
    <div style="padding: 30px;">
      <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="color: #6b7280; font-size: 13px; padding: 8px 0;">Order Number</td>
            <td style="text-align: right; font-weight: bold; font-size: 18px; color: #6366f1;">${order.orderNumber}</td>
          </tr>
          <tr>
            <td style="color: #6b7280; font-size: 13px; padding: 8px 0;">Status</td>
            <td style="text-align: right;">
              <span style="background: ${order.status === "DELIVERED" ? "#10b981" : "#f59e0b"}; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold;">
                ${order.status}
              </span>
            </td>
          </tr>
        </table>
      </div>

      <!-- Order Details -->
      <h3 style="color: #374151; margin-bottom: 15px; font-size: 16px; border-bottom: 2px solid #6366f1; padding-bottom: 10px;">Order Details</h3>
      <table style="width: 100%;">
        <tr>
          <td style="color: #6b7280; font-size: 14px; padding: 10px 0;">Game</td>
          <td style="text-align: right; color: #111827; font-weight: 500;">${order.gameName}</td>
        </tr>
        <tr>
          <td style="color: #6b7280; font-size: 14px; padding: 10px 0;">Product</td>
          <td style="text-align: right; color: #111827; font-weight: 500;">${order.productName}</td>
        </tr>
        <tr>
          <td style="color: #6b7280; font-size: 14px; padding: 10px 0;">Player ID</td>
          <td style="text-align: right; color: #111827; font-weight: 500;">${order.playerUid}</td>
        </tr>
        <tr>
          <td style="color: #6b7280; font-size: 14px; padding: 10px 0;">Paid At</td>
          <td style="text-align: right; color: #111827;">${paidDate}</td>
        </tr>
        <tr>
          <td style="color: #6b7280; font-size: 14px; padding: 10px 0;">Delivered At</td>
          <td style="text-align: right; color: #111827;">${deliverDate}</td>
        </tr>
      </table>

      <!-- Total -->
      <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); border-radius: 8px; padding: 20px; margin-top: 20px; text-align: center;">
        <p style="color: rgba(255,255,255,0.8); margin: 0; font-size: 14px;">Total Paid</p>
        <p style="color: white; margin: 5px 0 0; font-size: 32px; font-weight: bold;">
          $${order.amountUsd.toFixed(2)}
          ${order.amountKhr ? `<span style="font-size: 16px;"> / ${order.amountKhr.toLocaleString()} KHR</span>` : ""}
        </p>
      </div>

      <!-- Footer -->
      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center;">
        <p style="color: #6b7280; font-size: 12px; margin: 0;">
          Thank you for choosing Ty Khai Topup!<br>
          For support, contact us via Telegram.
        </p>
        <p style="color: #9ca3af; font-size: 11px; margin-top: 10px;">
          This is an automated receipt. Please keep for your records.
        </p>
      </div>
    </div>
  </div>
</body>
</html>
`;

  try {
    await transporter.sendMail({
      from: `"Ty Khai Topup" <${process.env.SMTP_USER}>`,
      to: order.customerEmail,
      subject: `Receipt for Order ${order.orderNumber} - Ty Khai Topup`,
      html,
    });
    console.log(`Receipt sent to ${order.customerEmail} for order ${order.orderNumber}`);
    return true;
  } catch (error) {
    console.error("Failed to send email:", error);
    return false;
  }
}