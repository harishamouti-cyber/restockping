import nodemailer from "nodemailer";

export interface SendRestockEmailOptions {
  to: string;
  shop: string;
  productTitle: string;
  variantTitle: string;
  price: number;
  variantId: string;
  senderName?: string;
  replyTo?: string;
  subjectTemplate?: string;
  headlineText?: string;
  bodyText?: string;
  buttonText?: string;
  accentColor?: string;
  discountCode?: string;
}

let transporter: nodemailer.Transporter | null = null;

export function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = parseInt(process.env.SMTP_PORT || "465", 10);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    throw new Error("SMTP credentials missing. Please define SMTP_USER and SMTP_PASS in your .env file.");
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: user.trim(),
      pass: pass.replace(/\s+/g, ""), // Sanitize out any whitespace
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
  headlineText: string;
  bodyText: string;
  buttonText: string;
  accentColor: string;
  shop: string;
}) {
  const {
    productTitle,
    variantTitle,
    price,
    checkoutUrl,
    headlineText,
    bodyText,
    buttonText,
    accentColor,
    shop,
  } = params;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; background-color: #f6f6f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="padding: 32px 12px; background-color: #f6f6f7;">
          <tr>
            <td align="center">
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 500px; background-color: #ffffff; border: 1px solid #e1e3e5; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
                <tr>
                  <td style="padding: 32px 28px 16px 28px;">
                    <div style="display: inline-block; padding: 3px 8px; background-color: #e3f1df; border-radius: 4px; font-size: 11px; font-weight: 600; color: #008060; text-transform: uppercase; letter-spacing: 0.04em;">
                      ● Restock Notice
                    </div>
                    <h1 style="margin: 16px 0 8px 0; font-size: 20px; font-weight: 700; color: #202223; line-height: 1.3;">
                      ${headlineText}
                    </h1>
                    <p style="margin: 0; font-size: 13px; color: #6d7175; line-height: 1.5;">
                      ${bodyText}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 0 28px;">
                    <div style="background-color: #f6f6f7; border: 1px solid #e1e3e5; border-radius: 8px; padding: 14px 16px;">
                      <div style="font-size: 14px; font-weight: 600; color: #202223;">
                        ${productTitle}
                      </div>
                      <div style="font-size: 12px; color: #6d7175; margin-top: 3px;">
                        ${variantTitle !== "Default Title" ? variantTitle : "Standard Edition"} · $${price.toFixed(2)}
                      </div>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 24px 28px 32px 28px;">
                    <a href="${checkoutUrl}" target="_blank" style="display: block; width: 100%; box-sizing: border-box; text-align: center; background-color: ${accentColor}; color: #ffffff; padding: 13px 20px; border-radius: 6px; font-size: 14px; font-weight: 600; text-decoration: none;">
                      ${buttonText} →
                    </a>
                    <p style="margin: 12px 0 0 0; font-size: 11px; color: #8c9196; text-align: center;">
                      Inventory is reserved on a first-come, first-served basis.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 14px 28px; background-color: #fafbfb; border-top: 1px solid #f1f2f4; text-align: center;">
                    <span style="font-size: 11px; color: #8c9196;">
                      Delivered automatically on behalf of ${shop} via RestockPing
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

export async function sendRestockNotificationEmail(options: SendRestockEmailOptions) {
  const {
    to,
    shop,
    productTitle,
    variantTitle,
    price,
    variantId,
    senderName = process.env.SMTP_FROM_NAME || "Restock Alerts",
    replyTo,
    subjectTemplate = "Back in Stock: {{product_title}} is ready to ship",
    headlineText = "Your item is back in stock",
    bodyText = "Good news! An item you requested is available again. Complete your order now before inventory runs out.",
    buttonText = "Claim in 1-Click Checkout",
    accentColor = "#008060",
    discountCode,
  } = options;

  const mailClient = getTransporter();

  const cleanVariantId = String(variantId).replace(/\D/g, "");
  const discountParam = discountCode ? `&discount=${encodeURIComponent(discountCode)}` : "";
  const checkoutUrl = `https://${shop}/cart/${cleanVariantId}:1?checkout[email]=${encodeURIComponent(to)}${discountParam}`;

  const subject = subjectTemplate.replace(/\{\{\s*product_title\s*\}\}/g, productTitle);

  const html = generateRestockEmailHtml({
    productTitle,
    variantTitle,
    price,
    checkoutUrl,
    headlineText,
    bodyText,
    buttonText,
    accentColor,
    shop,
  });

  const info = await mailClient.sendMail({
    from: `"${senderName}" <${process.env.SMTP_USER}>`,
    to,
    replyTo: replyTo || process.env.SMTP_USER,
    subject,
    html,
  });

  console.log(`[SMTP Success] Delivered alert to ${to} (Message ID: ${info.messageId})`);
  return info;
}
