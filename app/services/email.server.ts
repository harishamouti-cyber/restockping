import nodemailer, { type Transporter } from "nodemailer";
import db from "../db.server";
import { normalizeShopifyImageUrl } from "./catalog.server";
import { sanitizeShopBrandName } from "../utils/brand";
import { generateUnsubscribeToken } from "./unsubscribeToken.server";
import { isEmailSuppressed, suppressEmail } from "./suppression.server";
import { decryptCredential } from "./crypto.server";
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
  isTestPreview?: boolean;
}

export type SendRestockEmailOptions = SendEmailParams;
export { sanitizeShopBrandName };

const DEFAULT_SMTP_HOST = "smtp.gmail.com";
const DEFAULT_SMTP_PORT = 465;
const DEFAULT_SMTP_FROM_NAME = "Restock Alerts";

/**
 * Returns global app-managed SMTP configuration from server environment.
 */
export function getAppManagedSmtpConfig() {
  const host = process.env.SMTP_HOST || DEFAULT_SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || String(DEFAULT_SMTP_PORT), 10);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const user = (process.env.SMTP_USER || "").trim();
  const pass = (process.env.SMTP_PASS || "").replace(/\s+/g, "");
  const fromName = process.env.SMTP_FROM_NAME || DEFAULT_SMTP_FROM_NAME;

  if (!user || !pass) {
    throw new Error(
      "App delivery credentials missing. Configure SMTP_USER and SMTP_PASS environment variables."
    );
  }

  return { host, port, secure, user, pass, fromName };
}

// Backward compatibility alias
export const getSmtpConfig = getAppManagedSmtpConfig;

let appTransporter: Transporter | null = null;

function getAppManagedTransporter() {
  if (appTransporter) return appTransporter;

  const { host, port, secure, user, pass } = getAppManagedSmtpConfig();

  appTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  return appTransporter;
}

/**
 * Resolves the appropriate nodemailer transporter for a specific shop:
 * - If merchant configured custom SMTP and provided encrypted credentials, uses their private SMTP server.
 * - Otherwise, uses RestockPing's app-managed transactional delivery cluster.
 */
export async function getTransporterForShop(shop: string) {
  const settings = await db.restockSettings.findUnique({
    where: { shop },
  });

  if (
    settings?.emailDeliveryMode === "CUSTOM_SMTP" &&
    settings.customSmtpHost &&
    settings.customSmtpUser &&
    settings.customSmtpEncryptedPass
  ) {
    const decryptedPass = decryptCredential(settings.customSmtpEncryptedPass);
    if (decryptedPass) {
      const port = settings.customSmtpPort || 587;
      const secure = port === 465;
      const customTransporter = nodemailer.createTransport({
        host: settings.customSmtpHost,
        port,
        secure,
        auth: {
          user: settings.customSmtpUser,
          pass: decryptedPass,
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
      });

      return {
        transporter: customTransporter,
        fromAddress: settings.customSmtpUser,
        isCustom: true,
        replyTo: settings.replyToEmail || settings.customSmtpUser,
      };
    }
  }

  const { user } = getAppManagedSmtpConfig();
  return {
    transporter: getAppManagedTransporter(),
    fromAddress: user,
    isCustom: false,
    replyTo: settings?.replyToEmail || user,
  };
}

export class SuppressedEmailError extends Error {
  isSuppressed = true;
  constructor(message: string) {
    super(message);
    this.name = "SuppressedEmailError";
  }
}

export class HardBounceError extends Error {
  isHardBounce = true;
  constructor(message: string) {
    super(message);
    this.name = "HardBounceError";
  }
}

export class QuotaExceededError extends Error {
  isTransientQuota = true;
  constructor(message: string) {
    super(message);
    this.name = "QuotaExceededError";
  }
}

/**
 * Sends a transactional restock notification email.
 * Includes suppression checks, bounce & quota classification, and provider response tracking.
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
  } = params;

  if (!to || !to.includes("@")) {
    throw new Error("Invalid recipient email address.");
  }

  // 1. Suppression check: Do not deliver to unsubscribed, hard-bounced, or complaining emails
  const isSuppressed = await isEmailSuppressed(shop, to);
  if (isSuppressed) {
    throw new SuppressedEmailError(`Recipient ${to} is on the suppression list for shop ${shop}.`);
  }

  const { transporter, fromAddress, replyTo } = await getTransporterForShop(shop);

  // Strip markdown brackets [url](url) if present
  const cleanImageUrl = (productImageUrl || "")
    .replace(/^\[.*?\]\((.*?)\)$/, "$1")
    .trim();

  const cleanVariantId = String(variantId).replace(/\D/g, "");
  const discountParam = discountCode ? `&discount=${encodeURIComponent(discountCode)}` : "";
  const subAttrParam = subscriptionId ? `&attributes[restock_sub_id]=${encodeURIComponent(subscriptionId)}` : "";
  const checkoutUrl = cleanVariantId
    ? `https://${shop}/cart/${cleanVariantId}:1?checkout[email]=${encodeURIComponent(to)}${discountParam}${subAttrParam}&utm_source=restockping&utm_medium=email&utm_campaign=back_in_stock`
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
    isTestPreview: params.isTestPreview,
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

  const finalSubject = params.isTestPreview
    ? `[TEST PREVIEW] ${copy.subject.replace(/^\[TEST PREVIEW\]\s*/i, "")}`
    : copy.subject;

  const html = renderHtmlEmail(renderInput);
  const text = renderPlainTextEmail(renderInput);

  try {
    const info = await transporter.sendMail({
      from: `"${senderName}" <${fromAddress}>`,
      to,
      replyTo: params.replyTo || replyTo || fromAddress,
      subject: finalSubject,
      text,
      html,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });

    return {
      success: true,
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
    };
  } catch (err: any) {
    const msg = String(err?.message || err);
    const code = err?.responseCode || err?.code;

    // Detect hard bounces (SMTP 5xx: mailbox does not exist, user unknown)
    if (
      code === 550 ||
      code === 551 ||
      code === 552 ||
      code === 553 ||
      code === 554 ||
      /mailbox unavailable|user unknown|no such user|does not exist/i.test(msg)
    ) {
      console.warn(`[RestockPing Hard Bounce] Suppressing ${to} on ${shop}: ${msg}`);
      await suppressEmail(shop, to, "BOUNCE", msg);
      throw new HardBounceError(`Permanent email delivery failure (bounce): ${msg}`);
    }

    // Detect rate limit / quota exceeded (SMTP 4xx: quota exceeded, try again later)
    if (
      code === 421 ||
      code === 450 ||
      code === 451 ||
      code === 452 ||
      /quota|rate limit|too many connections|try again later/i.test(msg)
    ) {
      console.warn(`[RestockPing SMTP Quota/Rate Limit]: ${msg}`);
      throw new QuotaExceededError(`Transient mail delivery quota exceeded: ${msg}`);
    }

    console.error(`[RestockPing SMTP Send Error] Delivery to ${to} failed:`, msg);
    throw err;
  }
}
