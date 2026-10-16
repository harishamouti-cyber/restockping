/**
 * Shared email template rendering and sanitization utility for RestockPing.
 * Used identically across settings live previews and transactional email delivery.
 */

export interface TemplateVariables {
  product_title?: string;
  variant_title?: string;
  price?: number | string;
  store?: string;
}

/**
 * Escapes characters that have special meaning in HTML text and attributes.
 */
export function escapeHtml(str?: string | null): string {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Validates that a color string is a valid CSS hex color (#rgb or #rrggbb).
 * Falls back safely to #008060 if invalid to prevent CSS/attribute injection.
 */
export function validateHexColor(color?: string | null, fallback = "#008060"): string {
  if (!color || typeof color !== "string") return fallback;
  const trimmed = color.trim();
  if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) {
    return trimmed;
  }
  return fallback;
}

/**
 * Validates that a URL is a valid absolute HTTP/HTTPS URL.
 * Disallows javascript:, data:, or malformed protocols.
 */
export function validateSafeUrl(url?: string | null, fallback = ""): string {
  if (!url || typeof url !== "string") return fallback;
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.toString();
    }
  } catch {
    // Malformed URL
  }
  return fallback;
}

/**
 * Formats a numeric or string price into standard currency format ($XX.XX).
 */
export function formatTemplatePrice(price?: number | string | null): string {
  if (price === null || price === undefined || price === "") return "";
  const num = typeof price === "number" ? price : parseFloat(String(price).replace(/[^0-9.]/g, ""));
  if (isNaN(num)) return "";
  return `$${num.toFixed(2)}`;
}

/**
 * Interpolates {{product_title}}, {{variant_title}}, {{price}}, and {{store}} in text.
 * Case-insensitive and supports whitespace variations.
 */
export function interpolateTemplate(
  template?: string | null,
  vars?: TemplateVariables
): string {
  if (!template || typeof template !== "string") return "";

  const productTitle = vars?.product_title ?? "";
  const variantTitle = vars?.variant_title ?? "";
  const priceStr = formatTemplatePrice(vars?.price) || "$0.00";
  const store = vars?.store ?? "";

  return template
    .replace(/\{\{\s*product_title\s*\}\}/gi, productTitle)
    .replace(/\{\{\s*variant_title\s*\}\}/gi, variantTitle)
    .replace(/\{\{\s*(?:price|product_price)\s*\}\}/gi, priceStr)
    .replace(/\{\{\s*(?:store|store_name|shop_name)\s*\}\}/gi, store);
}

/**
 * Renders subject, headline, and body text using the same interpolation variables.
 */
export function renderEmailCopy(params: {
  subjectTemplate?: string | null;
  headline?: string | null;
  headlineTemplate?: string | null;
  bodyText?: string | null;
  bodyTemplate?: string | null;
  vars?: TemplateVariables;
  variables?: TemplateVariables;
}): { subject: string; headline: string; bodyText: string } {
  const variables = params.variables || params.vars;
  const headline = params.headlineTemplate || params.headline;
  const bodyText = params.bodyTemplate || params.bodyText;
  const defaultSubject = "Back in Stock: {{product_title}} is ready to ship";
  const defaultHeadline = "Your item is back in stock";
  const defaultBody = "Good news! An item you requested is available again. Complete your order now before inventory runs out.";

  return {
    subject: interpolateTemplate(params.subjectTemplate || defaultSubject, variables),
    headline: interpolateTemplate(headline || defaultHeadline, variables),
    bodyText: interpolateTemplate(bodyText || defaultBody, variables),
  };
}

export interface EmailRenderInput {
  productTitle: string;
  variantTitle?: string;
  price?: number;
  productImageUrl?: string;
  imageLookupError?: string | null;
  storeDisplayName: string;
  senderName?: string;
  subjectTemplate?: string;
  headline?: string;
  bodyText?: string;
  buttonText?: string;
  buttonColor?: string;
  discountCode?: string;
  checkoutUrl: string;
  unsubscribeUrl: string;
  isTestPreview?: boolean;
}

/**
 * Generates plain-text email representation.
 */
export function renderPlainTextEmail(input: EmailRenderInput): string {
  const vars: TemplateVariables = {
    product_title: input.productTitle,
    variant_title: input.variantTitle,
    price: input.price,
    store: input.storeDisplayName,
  };

  const copy = renderEmailCopy({
    subjectTemplate: input.subjectTemplate,
    headline: input.headline,
    bodyText: input.bodyText,
    vars,
  });

  const variantDisplay =
    input.variantTitle && input.variantTitle !== "Default Title"
      ? ` (${input.variantTitle})`
      : "";

  const lines: string[] = [];

  if (input.isTestPreview) {
    lines.push("================================================================================");
    lines.push(`[TEST NOTIFICATION PREVIEW]`);
    lines.push(`Product: ${input.productTitle}${variantDisplay}`);
    lines.push(`Delivered via RestockPing Settings test dispatch.`);
    lines.push("================================================================================");
    lines.push("");
  }

  lines.push(
    `${input.storeDisplayName} - Restock Notice`,
    "=".repeat(`${input.storeDisplayName} - Restock Notice`.length),
    "",
    copy.headline,
    "-".repeat(copy.headline.length),
    "",
    copy.bodyText,
    "",
    `Item: ${input.productTitle}${variantDisplay}`,
    `Price: ${formatTemplatePrice(input.price) || "$0.00"}`,
    "",
    `Claim item & complete checkout:`,
    input.checkoutUrl
  );

  if (input.discountCode) {
    lines.push("");
    lines.push(`Discount Code: ${input.discountCode} (apply at checkout)`);
  }

  lines.push("");
  lines.push("Inventory is available on a first-come, first-served basis. Items are not reserved until checkout is completed.");
  lines.push("");
  lines.push(`Delivered automatically on behalf of ${input.storeDisplayName} via RestockPing.`);
  lines.push(`Unsubscribe: ${input.unsubscribeUrl}`);

  return lines.join("\n");
}

/**
 * Generates secure, escaped HTML email markup.
 */
export function renderHtmlEmail(input: EmailRenderInput): string {
  const vars: TemplateVariables = {
    product_title: input.productTitle,
    variant_title: input.variantTitle,
    price: input.price,
    store: input.storeDisplayName,
  };

  const copy = renderEmailCopy({
    subjectTemplate: input.subjectTemplate,
    headline: input.headline,
    bodyText: input.bodyText,
    vars,
  });

  const safeColor = validateHexColor(input.buttonColor, "#008060");
  const safeCheckoutUrl = validateSafeUrl(input.checkoutUrl, "#");
  const safeUnsubscribeUrl = validateSafeUrl(input.unsubscribeUrl, "#");
  let safeImageUrl = validateSafeUrl(input.productImageUrl, "");
  if (safeImageUrl && safeImageUrl.includes("cdn.shopify.com") && !safeImageUrl.includes("width=")) {
    safeImageUrl = `${safeImageUrl}${safeImageUrl.includes("?") ? "&" : "?"}width=300`;
  }

  const safeProductTitle = escapeHtml(input.productTitle);
  const safeVariantTitle = escapeHtml(input.variantTitle || "Default Title");
  const safeDisplayBrand = escapeHtml(input.storeDisplayName);
  const safeHeadline = escapeHtml(copy.headline);
  const safeBodyText = escapeHtml(copy.bodyText);
  const safeButtonText = escapeHtml(input.buttonText || "Claim In-Stock Item →");
  const safeDiscountCode = escapeHtml(input.discountCode || "");
  const formattedPrice = formatTemplatePrice(input.price);

  // Honest image resolution handling
  let imageCellHtml = "";
  let imageNoteHtml = "";

  if (safeImageUrl) {
    imageCellHtml = `
      <td width="92" align="center" valign="middle" style="background-color:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:8px;text-align:center;">
        <img src="${escapeHtml(safeImageUrl)}" alt="${safeProductTitle}" width="76" border="0" style="display:block;max-width:76px;max-height:104px;width:auto;height:auto;object-fit:contain;margin:0 auto;border:0;outline:none;text-decoration:none;" />
      </td>
    `;
  } else if (input.imageLookupError) {
    // API/lookup error occurred
    imageCellHtml = `
      <td width="92" align="center" valign="middle" style="background-color:#fffbeb;border:1px dashed #f59e0b;border-radius:8px;padding:12px 6px;text-align:center;">
        <div style="font-size:20px;line-height:1;color:#b45309;margin-bottom:4px;">⚠️</div>
        <div style="font-size:9px;color:#b45309;font-weight:600;letter-spacing:0.02em;text-transform:uppercase;line-height:1.2;">Lookup Error</div>
      </td>
    `;
    imageNoteHtml = `
      <div style="font-size:11px;color:#b45309;margin-top:4px;font-style:italic;">
        Product image lookup failed (Shopify API error)
      </div>
    `;
  } else {
    // Genuinely no photo uploaded
    imageCellHtml = `
      <td width="92" align="center" valign="middle" style="background-color:#f9fafb;border:1px dashed #d1d5db;border-radius:8px;padding:12px 6px;text-align:center;">
        <div style="font-size:22px;line-height:1;color:#9ca3af;margin-bottom:4px;">📷</div>
        <div style="font-size:9px;color:#9ca3af;font-weight:600;letter-spacing:0.02em;text-transform:uppercase;line-height:1.2;">No Image</div>
      </td>
    `;
    imageNoteHtml = `
      <div style="font-size:11px;color:#9ca3af;margin-top:4px;font-style:italic;">
        No product image uploaded in store catalog
      </div>
    `;
  }

  const discountBannerHtml = safeDiscountCode
    ? `
      <div style="margin-top:12px;padding:8px 12px;background-color:#ecfdf5;border:1px solid #a7f3d0;border-radius:6px;font-size:12px;color:#065f46;text-align:center;">
        Special Restock Offer: Code <strong>${safeDiscountCode}</strong> auto-applied at checkout!
      </div>
    `
    : "";

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(copy.subject)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f6f6f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
    <!-- Preheader -->
    <div style="display:none;font-size:1px;color:#f6f6f7;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
      ${safeHeadline} - Restocked at ${safeDisplayBrand}. Order before inventory runs out.
    </div>

    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="padding:40px 15px;background-color:#f6f6f7;">
      <tr>
        <td align="center">
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:540px;background-color:#ffffff;border:1px solid #e1e3e5;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
            ${
              input.isTestPreview
                ? `<tr>
                    <td style="padding:14px 32px 0 32px;">
                      <div style="background-color:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 14px;text-align:left;">
                        <div style="font-size:12px;font-weight:700;color:#1e40af;display:flex;align-items:center;gap:6px;">
                          <span>🧪</span>
                          <span>Test Notification Preview</span>
                        </div>
                        <div style="font-size:11px;color:#1e3a8a;margin-top:2px;line-height:1.4;">
                          Testing restock alert template using <strong>${safeProductTitle}</strong>${safeVariantTitle !== "Default Title" ? ` (${safeVariantTitle})` : ""}. No real inventory changes occurred.
                        </div>
                      </div>
                    </td>
                  </tr>`
                : ""
            }
            <tr>
              <td style="padding:32px 32px 16px 32px;">
                <div style="display:inline-block;padding:3px 8px;background-color:#e3f1df;border-radius:4px;font-size:11px;font-weight:600;color:#008060;text-transform:uppercase;letter-spacing:0.04em;">
                  ● Restock Notice
                </div>
                <h1 style="margin:16px 0 8px 0;font-size:22px;font-weight:700;color:#202223;line-height:1.3;">
                  ${safeHeadline}
                </h1>
                <p style="margin:0;font-size:14px;color:#6d7175;line-height:1.5;">
                  ${safeBodyText}
                </p>
              </td>
            </tr>

            <!-- Product Box with Proportional Containment -->
            <tr>
              <td style="padding:0 32px;">
                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;">
                  <tr>
                    ${imageCellHtml}
                    <td style="padding-left:14px;" valign="middle">
                      <div style="font-size:14px;font-weight:600;color:#111827;">${safeProductTitle}</div>
                      <div style="font-size:12px;color:#6b7280;margin-top:2px;">
                        ${safeVariantTitle !== "Default Title" ? safeVariantTitle : "Standard Edition"} · <strong style="color:#111827;">${formattedPrice}</strong>
                      </div>
                      ${imageNoteHtml}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- CTA -->
            <tr>
              <td style="padding:24px 32px 28px 32px;">
                <a href="${escapeHtml(safeCheckoutUrl)}" target="_blank" style="display:block;width:100%;box-sizing:border-box;text-align:center;background-color:${safeColor};color:#ffffff;padding:14px 20px;border-radius:6px;font-size:14px;font-weight:600;text-decoration:none;box-shadow:0 1px 2px rgba(0,0,0,0.05);">
                  ${safeButtonText}
                </a>
                ${discountBannerHtml}
                <p style="margin:12px 0 0 0;font-size:11px;color:#8c9196;text-align:center;">
                  Inventory is available on a first-come, first-served basis. Items are not reserved until checkout is completed.
                </p>
              </td>
            </tr>

            <!-- Footer with CAN-SPAM Opt-Out -->
            <tr>
              <td style="padding:16px 32px;background-color:#fafbfb;border-top:1px solid #f1f2f4;text-align:center;">
                <span style="font-size:11px;color:#8c9196;display:block;margin-bottom:4px;">
                  Delivered automatically on behalf of <strong>${safeDisplayBrand}</strong> via RestockPing
                </span>
                <a href="${escapeHtml(safeUnsubscribeUrl)}" target="_blank" style="font-size:10px;color:#9ca3af;text-decoration:underline;">
                  Unsubscribe from this restock notification
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
