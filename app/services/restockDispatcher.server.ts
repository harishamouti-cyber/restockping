import db from "../db.server";
import { generateCartPermalink, extractVariantIdNumber } from "../utils/permalink";

export { generateCartPermalink, extractVariantIdNumber };

export interface FifoDispatchParams {
  shop: string;
  inventoryItemId: string;
  availableUnits: number;
}

export interface DispatchResult {
  success: boolean;
  inventoryItemId: string;
  availableUnits: number;
  multiplier: number;
  targetAlerts: number;
  dispatchedCount: number;
  remainingPending: number;
  batchId: number;
  permalinksGenerated: string[];
}

/**
 * Triggers the FIFO Anti-Burnout Drip Dispatcher for newly reported restock levels.
 */
export async function triggerFifoRestockDispatch({
  shop,
  inventoryItemId,
  availableUnits,
}: FifoDispatchParams): Promise<DispatchResult> {
  // 1. Fetch store settings
  const settings = await db.restockSettings.findUnique({
    where: { shop },
  });

  const multiplier = settings?.dripBatchMultiplier ?? 2.5;
  const discountCode = settings?.incentiveDiscountCode;
  const senderName = settings?.senderName || "Fulfillment Center";
  const senderEmail = settings?.senderEmail || "alerts@restockping.com";
  const subjectTemplate =
    settings?.emailSubjectTemplate || "Back in Stock: {{product_title}} is ready to ship";

  // 2. Count current pending subscribers
  const pendingCount = await db.restockSubscription.count({
    where: {
      shop,
      inventoryItemId,
      status: "PENDING",
    },
  });

  if (pendingCount === 0) {
    return {
      success: true,
      inventoryItemId,
      availableUnits,
      multiplier,
      targetAlerts: 0,
      dispatchedCount: 0,
      remainingPending: 0,
      batchId: 0,
      permalinksGenerated: [],
    };
  }

  // 3. FIFO Formula: Target Alerts = min(round(availableUnits * multiplier), pendingCount)
  const calculatedCapacity = Math.round(availableUnits * multiplier);
  const targetAlerts = Math.max(1, Math.min(calculatedCapacity, pendingCount));

  // Determine current highest batch number for this restock item
  const latestBatch = await db.restockSubscription.findFirst({
    where: { shop, inventoryItemId },
    orderBy: { dispatchBatch: "desc" },
    select: { dispatchBatch: true },
  });
  const currentBatchId = (latestBatch?.dispatchBatch ?? 0) + 1;

  // 4. Fetch the earliest matching PENDING subscribers in strict FIFO order
  const subscribersToDispatch = await db.restockSubscription.findMany({
    where: {
      shop,
      inventoryItemId,
      status: "PENDING",
    },
    orderBy: {
      createdAt: "asc",
    },
    take: targetAlerts,
  });

  const permalinksGenerated: string[] = [];
  const dispatchedIds: string[] = [];

  for (const subscriber of subscribersToDispatch) {
    if (!subscriber.customerEmail) continue;

    const cartPermalink = generateCartPermalink({
      shop,
      variantId: subscriber.variantId,
      customerEmail: subscriber.customerEmail,
      discountCode,
    });
    permalinksGenerated.push(cartPermalink);

    const emailSubject = subjectTemplate
      .replace("{{product_title}}", subscriber.productTitle)
      .replace("{{variant_title}}", subscriber.variantTitle);

    // Send transactional email
    await sendRestockNotificationEmail({
      to: subscriber.customerEmail,
      fromName: senderName,
      fromEmail: senderEmail,
      subject: emailSubject,
      productTitle: subscriber.productTitle,
      variantTitle: subscriber.variantTitle,
      priceSnapshot: subscriber.priceSnapshot,
      cartPermalink,
      discountCode,
    });

    dispatchedIds.push(subscriber.id);
  }

  // 5. Update subscription statuses to DISPATCHED
  if (dispatchedIds.length > 0) {
    await db.restockSubscription.updateMany({
      where: {
        id: { in: dispatchedIds },
      },
      data: {
        status: "DISPATCHED",
        dispatchBatch: currentBatchId,
        dispatchedAt: new Date(),
      },
    });
  }

  const remainingPending = pendingCount - dispatchedIds.length;

  return {
    success: true,
    inventoryItemId,
    availableUnits,
    multiplier,
    targetAlerts,
    dispatchedCount: dispatchedIds.length,
    remainingPending,
    batchId: currentBatchId,
    permalinksGenerated,
  };
}

/**
 * Sends transactional email via Resend if API key is provided, or logs output cleanly.
 */
async function sendRestockNotificationEmail({
  to,
  fromName,
  fromEmail,
  subject,
  productTitle,
  variantTitle,
  priceSnapshot,
  cartPermalink,
  discountCode,
}: {
  to: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  productTitle: string;
  variantTitle: string;
  priceSnapshot: number;
  cartPermalink: string;
  discountCode?: string | null;
}) {
  const resendApiKey = process.env.RESEND_API_KEY;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f4f5; margin: 0; padding: 24px; color: #18181b; }
          .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e4e4e7; }
          .badge { display: inline-block; padding: 4px 10px; background: #dcfce7; color: #15803d; border-radius: 9999px; font-size: 12px; font-weight: 600; text-transform: uppercase; margin-bottom: 16px; }
          h1 { font-size: 22px; font-weight: 700; margin: 0 0 12px 0; color: #09090b; }
          p { font-size: 15px; line-height: 1.5; color: #52525b; margin: 0 0 16px 0; }
          .product-box { background: #fafafa; border: 1px solid #f4f4f5; border-radius: 8px; padding: 16px; margin: 20px 0; }
          .btn { display: inline-block; width: 100%; text-align: center; box-sizing: border-box; background: #008060; color: #ffffff !important; text-decoration: none; padding: 14px 20px; border-radius: 8px; font-weight: 600; font-size: 15px; }
          .footer { margin-top: 24px; font-size: 12px; color: #a1a1aa; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <span class="badge">Back in Stock</span>
          <h1>${productTitle}</h1>
          <p>Great news! The item you were waiting for has officially restocked and is available for immediate shipment.</p>
          
          <div class="product-box">
            <strong style="display:block; font-size: 16px;">${productTitle}</strong>
            <span style="color: #71717a; font-size: 14px;">${variantTitle}</span>
            ${priceSnapshot > 0 ? `<div style="font-weight: 600; margin-top: 8px; font-size: 16px;">$${priceSnapshot.toFixed(2)}</div>` : ""}
            ${discountCode ? `<div style="margin-top: 6px; font-size: 13px; color: #059669;">Special Restock Offer: Code <b>${discountCode}</b> auto-applied at checkout.</div>` : ""}
          </div>

          <a href="${cartPermalink}" class="btn">Claim Your Item & Complete Checkout →</a>
          
          <div class="footer">
            Delivered directly by RestockPing on behalf of ${fromName}.
          </div>
        </div>
      </body>
    </html>
  `;

  if (resendApiKey && resendApiKey.startsWith("re_")) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${fromName} <${fromEmail}>`,
          to: [to],
          subject,
          html: htmlContent,
        }),
      });
    } catch (err) {
      console.error("[RestockPing Email Dispatch Error]", err);
    }
  } else {
    // Development / test fallback logging
    console.log(`[RestockPing FIFO Alert Dispatched] to: ${to} | subject: ${subject}`);
    console.log(`[1-Click Permalink]: ${cartPermalink}`);
  }
}
