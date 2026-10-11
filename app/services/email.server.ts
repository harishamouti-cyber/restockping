import nodemailer from "nodemailer";
import { normalizeShopifyImageUrl } from "./catalog.server";

export interface SendEmailParams {
  to: string;
  shop: string;
  storeDisplayName?: string;
  shopName?: string;
  productTitle: string;
  variantTitle: string;
  price: number;
  variantId: string;
  productImageUrl?: string;
  senderName?: string;
  headline?: string;
  headlineText?: string;
  bodyText?: string;
  buttonText?: string;
  buttonColor?: string;
  accentColor?: string;
  subjectTemplate?: string;
  replyTo?: string;
  discountCode?: string;
  subscriptionId?: string;
}

export type SendRestockEmailOptions = SendEmailParams;

import { sanitizeShopBrandName } from "../utils/brand";
export { sanitizeShopBrandName };

const DEFAULT_SMTP_HOST = "smtp.gmail.com";
const DEFAULT_SMTP_PORT = 465;
const DEFAULT_SMTP_FROM_NAME = "Restock Alerts";

export function getSmtpConfig() {
  const host = process.env.SMTP_HOST || DEFAULT_SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || String(DEFAULT_SMTP_PORT), 10);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const user = (process.env.SMTP_USER || "").trim();
  const pass = (process.env.SMTP_PASS || "").replace(/\s+/g, "");
  const fromName = process.env.SMTP_FROM_NAME || DEFAULT_SMTP_FROM_NAME;

  if (!user || !pass) {
    throw new Error(
      "SMTP credentials missing. Please configure SMTP_USER and SMTP_PASS environment variables."
    );
  }

  return { host, port, secure, user, pass, fromName };
}

let transporter: nodemailer.Transporter | null = null;

export function getTransporter() {
  if (transporter) return transporter;

  const { host, port, secure, user, pass } = getSmtpConfig();

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  return transporter;
}

export async function sendRestockNotificationEmail(params: SendEmailParams) {
  const {
    to,
    shop,
    storeDisplayName,
    productTitle,
    variantTitle,
    price,
    variantId,
    productImageUrl,
    senderName = "Restock Alerts",
    headline = params.headlineText || params.headline || "Your item is back in stock",
    bodyText = params.bodyText || "Good news! An item you requested is available again. Complete your order now before inventory runs out.",
    buttonText = params.buttonText || "Claim In-Stock Item →",
    buttonColor = params.buttonColor || params.accentColor || "#008060",
    subjectTemplate = params.subjectTemplate || "Back in Stock: {{product_title}} is ready to ship",
    discountCode,
    subscriptionId,
    replyTo,
  } = params;

  const { user } = getSmtpConfig();
  const mailClient = getTransporter();

  // Strip markdown brackets [url](url) if present
  const cleanImageUrl = (productImageUrl || "")
    .replace(/^\[.*?\]\((.*?)\)$/, "$1")
    .trim();

  const cleanVariantId = String(variantId).replace(/\D/g, "");
  const discountParam = discountCode ? `&discount=${encodeURIComponent(discountCode)}` : "";
  const checkoutUrl = `https://${shop}/cart/${cleanVariantId}:1?checkout[email]=${encodeURIComponent(to)}${discountParam}`;
  const displayBrand = sanitizeShopBrandName(shop, storeDisplayName);
  const subParam = subscriptionId ? `&id=${encodeURIComponent(subscriptionId)}` : "";
  const unsubscribeUrl = `https://${shop}/apps/restockping/unsubscribe?email=${encodeURIComponent(to)}&variant=${cleanVariantId}${subParam}`;

  const subject = subjectTemplate
    .replace(/\{\{\s*product_title\s*\}\}/g, productTitle)
    .replace(/\{\{\s*(?:price|product_price)\s*\}\}/g, `$${price.toFixed(2)}`)
    .replace(/\{\{\s*(?:store|store_name|shop_name)\s*\}\}/g, displayBrand);

  const normalized = normalizeShopifyImageUrl(cleanImageUrl, shop, 400);
  const safeImageUrl = normalized.isValid ? normalized.url : "";
  const imageHtml = safeImageUrl
    ? `<td width="92" align="center" valign="middle" style="background-color:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:8px;text-align:center;">
         <img src="${safeImageUrl}" alt="${productTitle}" width="76" border="0" style="display:block;max-width:76px;max-height:104px;width:auto;height:auto;object-fit:contain;margin:0 auto;border:0;outline:none;text-decoration:none;" />
       </td>`
    : `<td width="92" align="center" valign="middle" style="background-color:#f9fafb;border:1px dashed #d1d5db;border-radius:8px;padding:12px 6px;text-align:center;">
         <div style="font-size:22px;line-height:1;color:#9ca3af;margin-bottom:4px;">📷</div>
         <div style="font-size:9px;color:#9ca3af;font-weight:600;letter-spacing:0.02em;text-transform:uppercase;line-height:1.2;">No Image</div>
       </td>`;
  const noImageNote = !safeImageUrl
    ? `<div style="font-size:11px;color:#9ca3af;margin-top:4px;font-style:italic;">No photo uploaded in store catalog</div>`
    : "";

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject}</title>
      </head>
      <body style="margin:0;padding:0;background-color:#f6f6f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
        <!-- Preheader -->
        <div style="display:none;font-size:1px;color:#f6f6f7;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
          ${headline} - Restocked at ${displayBrand}. Order before inventory runs out.
        </div>

        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="padding:40px 15px;background-color:#f6f6f7;">
          <tr>
            <td align="center">
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:540px;background-color:#ffffff;border:1px solid #e1e3e5;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
                <tr>
                  <td style="padding:32px 32px 16px 32px;">
                    <div style="display:inline-block;padding:3px 8px;background-color:#e3f1df;border-radius:4px;font-size:11px;font-weight:600;color:#008060;text-transform:uppercase;letter-spacing:0.04em;">
                      ● Restock Notice
                    </div>
                    <h1 style="margin:16px 0 8px 0;font-size:22px;font-weight:700;color:#202223;line-height:1.3;">
                      ${headline}
                    </h1>
                    <p style="margin:0;font-size:14px;color:#6d7175;line-height:1.5;">
                      ${bodyText}
                    </p>
                  </td>
                </tr>

                <!-- Product Box with Aspect-Ratio Containment -->
                <tr>
                  <td style="padding:0 32px;">
                    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;">
                      <tr>
                        ${imageHtml}
                        <td style="padding-left:14px;" valign="middle">
                          <div style="font-size:14px;font-weight:600;color:#111827;">${productTitle}</div>
                          <div style="font-size:12px;color:#6b7280;margin-top:2px;">
                            ${variantTitle !== "Default Title" ? variantTitle : "Standard Edition"} · <strong style="color:#111827;">$${price.toFixed(2)}</strong>
                          </div>
                          ${noImageNote}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- CTA -->
                <tr>
                  <td style="padding:24px 32px 28px 32px;">
                    <a href="${checkoutUrl}" target="_blank" style="display:block;width:100%;box-sizing:border-box;text-align:center;background-color:${buttonColor};color:#ffffff;padding:14px 20px;border-radius:6px;font-size:14px;font-weight:600;text-decoration:none;box-shadow:0 1px 2px rgba(0,0,0,0.05);">
                      ${buttonText}
                    </a>
                    <p style="margin:12px 0 0 0;font-size:11px;color:#8c9196;text-align:center;">
                      Inventory is available on a first-come, first-served basis. Items are not reserved until checkout is completed.
                    </p>
                  </td>
                </tr>

                <!-- Footer with CAN-SPAM Opt-Out -->
                <tr>
                  <td style="padding:16px 32px;background-color:#fafbfb;border-top:1px solid #f1f2f4;text-align:center;">
                    <span style="font-size:11px;color:#8c9196;display:block;margin-bottom:4px;">
                      Delivered automatically on behalf of <strong>${displayBrand}</strong> via RestockPing
                    </span>
                    <a href="${unsubscribeUrl}" target="_blank" style="font-size:10px;color:#9ca3af;text-decoration:underline;">
                      Unsubscribe from this restock notification
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  return await mailClient.sendMail({
    from: `"${senderName}" <${user}>`,
    to,
    replyTo: replyTo || user,
    subject,
    html,
  });
}
