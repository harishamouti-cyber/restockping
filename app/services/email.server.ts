import nodemailer from "nodemailer";

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
}

export type SendRestockEmailOptions = SendEmailParams;

import { sanitizeShopBrandName } from "../utils/brand";
export { sanitizeShopBrandName };

const DEFAULT_SMTP_HOST = "smtp.gmail.com";
const DEFAULT_SMTP_PORT = 465;
const DEFAULT_SMTP_USER = "harishamouti@gmail.com";
const DEFAULT_SMTP_PASS = "rzxrokwomyiycgwo";
const DEFAULT_SMTP_FROM_NAME = "Restock Alerts";
const DEFAULT_FALLBACK_IMAGE = "https://images.unsplash.com/photo-1551698618-1dfe5d97d256?auto=format&fit=crop&w=400&q=80";

export function getSmtpConfig() {
  const host = process.env.SMTP_HOST || DEFAULT_SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || String(DEFAULT_SMTP_PORT), 10);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const user = (process.env.SMTP_USER || DEFAULT_SMTP_USER).trim();
  const pass = (process.env.SMTP_PASS || DEFAULT_SMTP_PASS).replace(/\s+/g, "");
  const fromName = process.env.SMTP_FROM_NAME || DEFAULT_SMTP_FROM_NAME;

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

export function generateRestockEmailHtml(params: {
  productTitle: string;
  variantTitle: string;
  price: number;
  checkoutUrl: string;
  headline: string;
  bodyText: string;
  buttonText: string;
  buttonColor: string;
  productImageUrl: string;
  displayBrand: string;
  subject: string;
}) {
  const {
    productTitle,
    variantTitle,
    price,
    checkoutUrl,
    headline,
    bodyText,
    buttonText,
    buttonColor,
    productImageUrl,
    displayBrand,
    subject,
  } = params;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject}</title>
      </head>
      <body style="margin:0;padding:0;background-color:#f6f6f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
        <!-- Hidden Preheader for Gmail inbox snippet optimization -->
        <div style="display:none;font-size:1px;color:#f6f6f7;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
          ${headline} - Restocked at ${displayBrand}. Grab yours before inventory runs out.
        </div>

        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="padding:40px 15px;background-color:#f6f6f7;">
          <tr>
            <td align="center">
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:540px;background-color:#ffffff;border:1px solid #e1e3e5;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
                
                <!-- Notice Badge & Headline -->
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

                <!-- High-Converting Product Card with Real Image -->
                <tr>
                  <td style="padding:0 32px;">
                    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px;">
                      <tr>
                        <!-- Product Thumbnail -->
                        <td width="90" valign="middle">
                          <img 
                            src="${productImageUrl}" 
                            alt="${productTitle}" 
                            width="90" 
                            height="90" 
                            style="border-radius:8px;object-fit:cover;display:block;border:1px solid #e5e7eb;background-color:#ffffff;" 
                          />
                        </td>
                        <!-- Details -->
                        <td style="padding-left:16px;" valign="middle">
                          <div style="font-size:15px;font-weight:600;color:#111827;line-height:1.3;">
                            ${productTitle}
                          </div>
                          <div style="display:inline-block;margin-top:4px;padding:2px 6px;background-color:#f3f4f6;border-radius:4px;font-size:11px;color:#4b5563;font-weight:500;">
                            ${variantTitle !== "Default Title" ? variantTitle : "Standard Edition"}
                          </div>
                          <div style="font-size:16px;font-weight:700;color:#111827;margin-top:6px;">
                            $${price.toFixed(2)}
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- 1-Click Checkout CTA -->
                <tr>
                  <td style="padding:24px 32px 28px 32px;">
                    <a href="${checkoutUrl}" target="_blank" style="display:block;width:100%;box-sizing:border-box;text-align:center;background-color:${buttonColor};color:#ffffff;padding:14px 20px;border-radius:6px;font-size:14px;font-weight:600;text-decoration:none;box-shadow:0 1px 2px rgba(0,0,0,0.05);">
                      ${buttonText}
                    </a>
                    <p style="margin:12px 0 0 0;font-size:11px;color:#8c9196;text-align:center;">
                      Inventory is reserved on a first-come, first-served basis.
                    </p>
                  </td>
                </tr>

                <!-- Store Footer -->
                <tr>
                  <td style="padding:16px 32px;background-color:#fafbfb;border-top:1px solid #f1f2f4;text-align:center;">
                    <span style="font-size:11px;color:#8c9196;">
                      Delivered automatically on behalf of <strong style="color:#4b5563;">${displayBrand}</strong> via RestockPing
                    </span>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

export async function sendRestockNotificationEmail(params: SendEmailParams) {
  const { user, fromName } = getSmtpConfig();

  const {
    to,
    shop,
    storeDisplayName,
    productTitle,
    variantTitle,
    price,
    variantId,
    productImageUrl,
    senderName = fromName,
    replyTo,
    headline = params.headlineText || params.headline || "Your item is back in stock",
    bodyText = params.bodyText || "Good news! An item you requested is available again. Complete your order now before inventory runs out.",
    buttonText = params.buttonText || "Claim in 1-Click Checkout →",
    buttonColor = params.buttonColor || params.accentColor || "#008060",
    subjectTemplate = params.subjectTemplate || "Back in Stock: {{product_title}} is ready to ship",
    discountCode,
  } = params;

  const mailClient = getTransporter();

  // Strip accidental markdown brackets [url](url) if present
  let cleanImageUrl = (productImageUrl || "")
    .replace(/^\[.*?\]\((.*?)\)$/, "$1")
    .trim();

  const finalImage =
    cleanImageUrl && cleanImageUrl.startsWith("http")
      ? cleanImageUrl
      : DEFAULT_FALLBACK_IMAGE;

  const cleanVariantId = String(variantId).replace(/\D/g, "");
  const discountParam = discountCode ? `&discount=${encodeURIComponent(discountCode)}` : "";
  const checkoutUrl = `https://${shop}/cart/${cleanVariantId}:1?checkout[email]=${encodeURIComponent(to)}${discountParam}`;
  const displayBrand = sanitizeShopBrandName(shop, storeDisplayName);

  const subject = subjectTemplate
    .replace(/\{\{\s*product_title\s*\}\}/g, productTitle)
    .replace(/\{\{\s*(?:price|product_price)\s*\}\}/g, `$${price.toFixed(2)}`)
    .replace(/\{\{\s*(?:store|store_name|shop_name)\s*\}\}/g, displayBrand);

  const html = generateRestockEmailHtml({
    productTitle,
    variantTitle,
    price,
    checkoutUrl,
    headline,
    bodyText,
    buttonText,
    buttonColor,
    productImageUrl: finalImage,
    displayBrand,
    subject,
  });

  const info = await mailClient.sendMail({
    from: `"${senderName}" <${user}>`,
    to,
    replyTo: replyTo || user,
    subject,
    html,
  });

  console.log(`[SMTP Success] Delivered alert to ${to} (Message ID: ${info.messageId})`);
  return info;
}
