import db from "../db.server";

export type SuppressionReason = "BOUNCE" | "COMPLAINT" | "UNSUBSCRIBE";

/**
 * Checks if an email address is currently suppressed for a given shop.
 */
export async function isEmailSuppressed(shop: string, email: string): Promise<boolean> {
  if (!shop || !email) return false;
  const normalizedEmail = email.trim().toLowerCase();

  try {
    const record = await db.emailSuppression.findUnique({
      where: {
        shop_email: {
          shop,
          email: normalizedEmail,
        },
      },
    });
    return Boolean(record);
  } catch (err) {
    console.error("[Email Suppression Check Error]:", err);
    return false;
  }
}

/**
 * Adds an email to the suppression list for a shop.
 * Also marks any pending/queued subscriptions for this customer as CANCELLED or BOUNCED.
 */
export async function suppressEmail(
  shop: string,
  email: string,
  reason: SuppressionReason,
  details?: string
): Promise<void> {
  if (!shop || !email) return;
  const normalizedEmail = email.trim().toLowerCase();

  try {
    await db.emailSuppression.upsert({
      where: {
        shop_email: {
          shop,
          email: normalizedEmail,
        },
      },
      update: {
        reason,
        details: details ? details.slice(0, 500) : undefined,
      },
      create: {
        shop,
        email: normalizedEmail,
        reason,
        details: details ? details.slice(0, 500) : undefined,
      },
    });

    // Update active subscriptions
    const newStatus = reason === "BOUNCE" ? "BOUNCED" : "CANCELLED";
    await db.restockSubscription.updateMany({
      where: {
        shop,
        customerEmail: normalizedEmail,
        status: { in: ["PENDING", "QUEUED"] },
      },
      data: {
        status: newStatus,
        deliveryError: details ? details.slice(0, 255) : `Suppressed: ${reason}`,
      },
    });

    console.log(`[Email Suppressed] ${normalizedEmail} on shop ${shop} for reason ${reason}`);
  } catch (err) {
    console.error("[Email Suppression Error]:", err);
  }
}

/**
 * Removes an email from suppression (e.g. merchant manual unblock or resubscribe).
 */
export async function removeSuppression(shop: string, email: string): Promise<void> {
  if (!shop || !email) return;
  const normalizedEmail = email.trim().toLowerCase();

  try {
    await db.emailSuppression.deleteMany({
      where: {
        shop,
        email: normalizedEmail,
      },
    });
  } catch (err) {
    console.error("[Remove Email Suppression Error]:", err);
  }
}
