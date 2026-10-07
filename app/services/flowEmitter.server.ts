import { unauthenticated } from "../shopify.server";

export interface RestockFlowTriggerParams {
  customerEmail: string;
  productTitle: string;
  variantTitle: string;
  price: number | string;
  variantId: string;
  productId: string;
  shop: string;
  discountCode?: string;
}

export interface AdminClient {
  graphql: (
    query: string,
    options?: { variables?: Record<string, any> }
  ) => Promise<Response>;
}

const FLOW_TRIGGER_RECEIVE_MUTATION = `#graphql
  mutation flowTriggerReceive($handle: String!, $payload: JSON!) {
    flowTriggerReceive(handle: $handle, payload: $payload) {
      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * Emits a native Shopify Flow trigger for a customer whose requested item has been restocked.
 * Passes customer details and a 1-Click checkout link to Shopify Flow.
 */
export async function emitRestockFlowTrigger(
  adminOrShop: AdminClient | string,
  params: RestockFlowTriggerParams
) {
  const {
    customerEmail,
    productTitle,
    variantTitle,
    price,
    variantId,
    productId,
    shop,
    discountCode,
  } = params;

  if (!customerEmail || !customerEmail.includes("@")) {
    throw new Error(`Invalid recipient email for Flow trigger: ${customerEmail}`);
  }

  // Resolve admin GraphQL client
  let adminClient: AdminClient;
  if (typeof adminOrShop === "string") {
    const unauth = await unauthenticated.admin(adminOrShop);
    adminClient = unauth.admin;
  } else if (adminOrShop && typeof adminOrShop.graphql === "function") {
    adminClient = adminOrShop;
  } else {
    const unauth = await unauthenticated.admin(shop);
    adminClient = unauth.admin;
  }

  // Extract clean numeric variant ID for the permalink
  const cleanVariantId = String(variantId).replace(/\D/g, "");
  const discountParam = discountCode
    ? `&discount=${encodeURIComponent(discountCode)}`
    : "";
  const checkoutPermalink = `https://${shop}/cart/${cleanVariantId}:1?checkout[email]=${encodeURIComponent(
    customerEmail
  )}${discountParam}`;

  const formattedPrice =
    typeof price === "number" ? `$${price.toFixed(2)}` : String(price);

  const payload = {
    customer_email: customerEmail,
    product_title: productTitle,
    variant_title:
      variantTitle && variantTitle !== "Default Title"
        ? variantTitle
        : "Standard Edition",
    product_price: formattedPrice,
    checkout_permalink: checkoutPermalink,
    product_id: String(productId),
  };

  const response = await adminClient.graphql(FLOW_TRIGGER_RECEIVE_MUTATION, {
    variables: {
      handle: "customer_ready_for_restock_alert",
      payload,
    },
  });

  const responseJson = await response.json();

  if (responseJson.errors && responseJson.errors.length > 0) {
    const errMsg = responseJson.errors.map((e: any) => e.message).join(", ");
    console.error(`[Shopify Flow GraphQL Error]:`, errMsg);
    throw new Error(`Shopify Flow error: ${errMsg}`);
  }

  const userErrors =
    responseJson.data?.flowTriggerReceive?.userErrors || [];
  if (userErrors.length > 0) {
    const errMsg = userErrors
      .map(
        (e: any) =>
          `${Array.isArray(e.field) ? e.field.join(".") : e.field || "error"}: ${
            e.message
          }`
      )
      .join(", ");
    console.error(`[Shopify Flow userErrors]:`, errMsg);
    throw new Error(`Shopify Flow rejected trigger: ${errMsg}`);
  }

  console.log(
    `[Shopify Flow Success] Trigger emitted for ${customerEmail} (Product: ${productTitle})`
  );

  return {
    success: true,
    checkoutPermalink,
    payload,
  };
}
