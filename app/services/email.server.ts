import nodemailer from "nodemailer";
import { normalizeShopifyImageUrl } from "./catalog.server";
import { sanitizeShopBrandName } from "../utils/brand";
import { generateUnsubscribeToken } from "./unsubscribeToken.server";
import {
  renderHtmlEmail,
  renderPlainTextEmail,
  renderEmailCopy,
  type TemplateVariables,
} from "../utils/emailTemplate";

export interface SendEmailParams {
  to: string;
  shop: string;
  storeDisplayName?: string;
  shopName?: string;
  productTitle: string;
  variantTitle?: string;
  price?: number;
  variantId?: string;
  productImageUrl?: string;
  imageLookupError?: string | null;
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

/**
 * Sends a transactional restock notification email via standard SMTP client.
 * Shared across test sends, automated FIFO dispatches, and manual merchant sends.
 * Includes both HTML (with honest image fallback and proportional media container)
 * and plain-text alternatives.
 */
export async function sendRestockNotificationEmail(params: SendEmailParams) {
  const {
    to,
    shop,
    storeDisplayName,
    productTitle,
    variantTitle = "Default Title",
    price = 0,
    variantId = "",
    productImageUrl,
    imageLookupError,
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

  if (!to || !to.includes("@")) {
    throw new Error("Invalid recipient email address.");
  }

  const { user } = getSmtpConfig();
  const mailClient = getTransporter();

  // Strip markdown brackets [url](url) if present
  const cleanImageUrl = (productImageUrl || "")
    .replace(/^\[.*?\]\((.*?)\)$/, "$1")
    .trim();

  const cleanVariantId = String(variantId).replace(/\D/g, "");
  const discountParam = discountCode ? `&discount=${encodeURIComponent(discountCode)}` : "";
  const checkoutUrl = cleanVariantId
    ? `https://${shop}/cart/${cleanVariantId}:1?checkout[email]=${encodeURIComponent(to)}${discountParam}`
    : `https://${shop}${discountParam ? `?${discountParam.slice(1)}` : ""}`;
  const displayBrand = sanitizeShopBrandName(shop, storeDisplayName);

  // Generate cryptographically signed, tenant-scoped unsubscribe token
  const unsubscribeToken = generateUnsubscribeToken({
    subscriptionId: subscriptionId || "preview",
    shop,
    email: to,
  });
  const unsubscribeUrl = `https://${shop}/apps/restockping/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;

  const normalized = normalizeShopifyImageUrl(cleanImageUrl, shop, 300);
  const safeImageUrl = normalized.isValid ? normalized.url : "";

  const renderInput = {
    productTitle,
    variantTitle,
    price,
    productImageUrl: safeImageUrl,
    imageLookupError: imageLookupError || (!safeImageUrl && normalized.reason && normalized.reason !== "No image URL provided" ? normalized.reason : null),
    storeDisplayName: displayBrand,
    senderName,
    subjectTemplate,
    headline,
    bodyText,
    buttonText,
    buttonColor,
    discountCode: discountCode || undefined,
    checkoutUrl,
    unsubscribeUrl,
  };

  const vars: TemplateVariables = {
    product_title: productTitle,
    variant_title: variantTitle,
    price,
    store: displayBrand,
  };

  const copy = renderEmailCopy({
    subjectTemplate,
    headline,
    bodyText,
    vars,
  });

  const html = renderHtmlEmail(renderInput);
  const text = renderPlainTextEmail(renderInput);

  try {
    return await mailClient.sendMail({
      from: `"${senderName}" <${user}>`,
      to,
      replyTo: replyTo || user,
      subject: copy.subject,
      text,
      html,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
  } catch (err: any) {
    console.error(`[RestockPing SMTP Send Error] Failed delivering to ${to}:`, err.message || err);
    throw err;
  }
}
