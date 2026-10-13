import db from "../db.server";

export interface OrderAttributionPayload {
  id?: string | number;
  order_number?: string | number;
  email?: string | null;
  customer?: {
    email?: string | null;
  } | null;
  line_items?: Array<{
    id?: string | number;
    variant_id?: string | number;
    product_id?: string | number;
    title?: string;
    quantity?: number;
    price?: string | number;
  }>;
  note_attributes?: Array<{
    name?: string;
    value?: string;
  }>;
  discount_codes?: Array<{
    code?: string;
    amount?: string;
  }>;
  created_at?: string;
  total_price?: string;
}

export interface AttributionResult {
  matchedCount: number;
  convertedSubscriptionIds: string[];
}

/**
 * Attributes a Shopify order to outstanding restock subscriptions.
 * Matches by:
 * 1. Explicit note attribute (e.g. name="restock_sub_id")
 * 2. Customer email + variant ID for subscriptions marked DISPATCHED within the last 30 days
 */
export async function attributeOrderConversion(
  shop: string,
  order: OrderAttributionPayload
): Promise<AttributionResult> {
  const customerEmail = (order.email || order.customer?.email || "").trim().toLowerCase();
  const orderCreatedAt = order.created_at ? new Date(order.created_at) : new Date();
  const lineItems = order.line_items || [];
  const noteAttributes = order.note_attributes || [];

  const convertedSubscriptionIds: string[] = [];

  // 1. Check for explicit restock subscription ID in note attributes
  const explicitSubAttr = noteAttributes.find(
    (attr) => attr.name === "restock_sub_id" || attr.name === "restock_subscription_id"
  );

  if (explicitSubAttr?.value) {
    const subId = explicitSubAttr.value.trim();
    const sub = await db.restockSubscription.findFirst({
      where: {
        id: subId,
        shop,
        status: "DISPATCHED",
      },
    });

    if (sub) {
      await db.restockSubscription.update({
        where: { id: sub.id },
        data: {
          status: "CONVERTED",
          convertedAt: orderCreatedAt,
        },
      });
      convertedSubscriptionIds.push(sub.id);
      console.log(
        `[Order Attribution] Explicit match: Subscription ${sub.id} converted via order #${order.order_number || order.id}`
      );
    }
  }

  // 2. Email + Variant matching for DISPATCHED subscriptions
  if (customerEmail && lineItems.length > 0) {
    const thirtyDaysAgo = new Date(orderCreatedAt.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Find all DISPATCHED subscriptions for this customer in this shop within 30 days
    const eligibleSubs = await db.restockSubscription.findMany({
      where: {
        shop,
        customerEmail,
        status: "DISPATCHED",
        dispatchedAt: { gte: thirtyDaysAgo },
      },
    });

    for (const sub of eligibleSubs) {
      if (convertedSubscriptionIds.includes(sub.id)) continue;

      const subCleanVariantId = sub.variantId.replace(/\D/g, "");

      // Check if any order line item matches the subscribed variant
      const matchingItem = lineItems.find((item) => {
        const itemCleanVariantId = String(item.variant_id || "").replace(/\D/g, "");
        return itemCleanVariantId && itemCleanVariantId === subCleanVariantId;
      });

      if (matchingItem) {
        await db.restockSubscription.update({
          where: { id: sub.id },
          data: {
            status: "CONVERTED",
            convertedAt: orderCreatedAt,
          },
        });
        convertedSubscriptionIds.push(sub.id);
        console.log(
          `[Order Attribution] Email/Variant match: Subscription ${sub.id} converted for ${customerEmail} (Variant: ${sub.variantId}) via order #${order.order_number || order.id}`
        );
      }
    }
  }

  return {
    matchedCount: convertedSubscriptionIds.length,
    convertedSubscriptionIds,
  };
}
