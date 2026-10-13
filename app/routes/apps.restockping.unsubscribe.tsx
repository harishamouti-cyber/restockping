import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useActionData, useNavigation, Form } from "@remix-run/react";
import db from "../db.server";
import { sanitizeShopBrandName } from "../utils/brand";
import { verifyUnsubscribeToken } from "../services/unsubscribeToken.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  // Legacy fallback params if token is omitted
  const legacyEmail = (url.searchParams.get("email") || "").trim().toLowerCase();
  const legacyId = (url.searchParams.get("id") || "").trim();
  const legacyShop = (url.searchParams.get("shop") || "").trim();

  let targetId = "";
  let targetShop = "";
  let targetEmail = "";
  let isValid = false;

  if (token) {
    const verified = verifyUnsubscribeToken(token);
    if (verified) {
      targetId = verified.subId;
      targetShop = verified.shop;
      targetEmail = verified.email;
      isValid = true;
    }
  } else if (legacyEmail && (legacyId || legacyShop)) {
    // Legacy support: allow viewing confirmation, but NEVER unsubscribe on GET
    targetId = legacyId;
    targetShop = legacyShop;
    targetEmail = legacyEmail;
    isValid = Boolean(legacyEmail);
  }

  if (!isValid || !targetEmail) {
    return json({
      status: "INVALID",
      message: "This unsubscribe link is invalid or has expired.",
      email: "",
      brandName: "Store",
      productTitle: "",
      token: "",
    });
  }

  // Look up subscription details to display to customer
  const subscription = targetId
    ? await db.restockSubscription.findFirst({
        where: { id: targetId, ...(targetShop ? { shop: targetShop } : {}), customerEmail: targetEmail },
      })
    : await db.restockSubscription.findFirst({
        where: { customerEmail: targetEmail, ...(targetShop ? { shop: targetShop } : {}) },
      });

  const shopDomain = subscription?.shop || targetShop || "Store";
  const brandName = sanitizeShopBrandName(shopDomain);
  const productTitle = subscription?.productTitle || "this product";
  const variantTitle = subscription?.variantTitle && subscription.variantTitle !== "Default Title"
    ? ` (${subscription.variantTitle})`
    : "";

  const isAlreadyCancelled = subscription?.status === "CANCELLED";

  return json({
    status: isAlreadyCancelled ? "ALREADY_CANCELLED" : "CONFIRM",
    message: isAlreadyCancelled ? "You are already unsubscribed from alerts for this item." : null,
    email: targetEmail,
    brandName,
    productTitle: `${productTitle}${variantTitle}`,
    token: token || "",
    legacyId: targetId,
    legacyShop: targetShop,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  // Check RFC 8058 One-Click Unsubscribe header or form data
  const isOneClickHeader = request.headers.get("List-Unsubscribe-Post") === "List-Unsubscribe=One-Click";

  let token = "";
  let legacyId = "";
  let legacyShop = "";
  let legacyEmail = "";

  const contentType = request.headers.get("Content-Type") || "";
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    token = String(body.token || "");
    legacyId = String(body.id || "");
    legacyShop = String(body.shop || "");
    legacyEmail = String(body.email || "");
  } else {
    const formData = await request.formData();
    token = String(formData.get("token") || "");
    legacyId = String(formData.get("legacyId") || "");
    legacyShop = String(formData.get("legacyShop") || "");
    legacyEmail = String(formData.get("email") || "");
  }

  let verifiedSubId = "";
  let verifiedShop = "";
  let verifiedEmail = "";

  if (token) {
    const verified = verifyUnsubscribeToken(token);
    if (!verified) {
      if (isOneClickHeader) {
        return new Response("Invalid token", { status: 400 });
      }
      return json({ success: false, error: "Invalid or expired unsubscribe token." }, { status: 400 });
    }
    verifiedSubId = verified.subId;
    verifiedShop = verified.shop;
    verifiedEmail = verified.email;
  } else if (legacyEmail && (legacyId || legacyShop)) {
    verifiedSubId = legacyId;
    verifiedShop = legacyShop;
    verifiedEmail = legacyEmail.toLowerCase().trim();
  } else {
    return json({ success: false, error: "Missing required token." }, { status: 400 });
  }

  try {
    if (verifiedSubId && verifiedSubId !== "preview") {
      await db.restockSubscription.updateMany({
        where: {
          id: verifiedSubId,
          ...(verifiedShop ? { shop: verifiedShop } : {}),
          customerEmail: verifiedEmail,
        },
        data: { status: "CANCELLED" },
      });
    } else {
      await db.restockSubscription.updateMany({
        where: {
          ...(verifiedShop ? { shop: verifiedShop } : {}),
          customerEmail: verifiedEmail,
          status: { in: ["PENDING", "QUEUED", "DISPATCHED"] },
        },
        data: { status: "CANCELLED" },
      });
    }

    if (isOneClickHeader) {
      return new Response("Unsubscribed successfully", { status: 200 });
    }

    return json({
      success: true,
      message: `You have been removed from restock alerts for ${verifiedEmail}.`,
    });
  } catch (err: any) {
    console.error("[Unsubscribe Action Error]:", err);
    return json({ success: false, error: "Unable to process unsubscribe request." }, { status: 500 });
  }
}

export default function UnsubscribePage() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();

  const isSubmitting = navigation.state === "submitting";
  const isSuccess = actionData?.success || loaderData.status === "ALREADY_CANCELLED";

  return (
    <div style={{
      minHeight: "100vh",
      backgroundColor: "#f6f6f7",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      color: "#202223"
    }}>
      <div style={{
        maxWidth: "480px",
        width: "100%",
        backgroundColor: "#ffffff",
        borderRadius: "12px",
        padding: "36px 32px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        border: "1px solid #e1e3e5",
        textAlign: "center"
      }}>
        {loaderData.status === "INVALID" ? (
          <div>
            <div style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              backgroundColor: "#fee2e2",
              color: "#dc2626",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px auto",
              fontSize: "24px"
            }}>
              ⚠️
            </div>
            <h1 style={{ fontSize: "20px", fontWeight: 700, margin: "0 0 8px 0" }}>
              Invalid Unsubscribe Link
            </h1>
            <p style={{ fontSize: "14px", color: "#6d7175", lineHeight: "1.5", margin: "0 0 20px 0" }}>
              {loaderData.message}
            </p>
          </div>
        ) : isSuccess ? (
          <div>
            <div style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              backgroundColor: "#e3f1df",
              color: "#008060",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px auto",
              fontSize: "24px"
            }}>
              ✓
            </div>
            <h1 style={{ fontSize: "20px", fontWeight: 700, margin: "0 0 8px 0" }}>
              Unsubscribed Successfully
            </h1>
            <p style={{ fontSize: "14px", color: "#6d7175", lineHeight: "1.5", margin: "0 0 20px 0" }}>
              Your email (<strong>{loaderData.email}</strong>) has been removed from restock alerts for {loaderData.productTitle}.
            </p>
            <p style={{ fontSize: "12px", color: "#8c9196", margin: 0 }}>
              Thank you for shopping with <strong>{loaderData.brandName}</strong>. You will not receive further restock notices for this request.
            </p>
          </div>
        ) : (
          <div>
            <div style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              backgroundColor: "#fef3c7",
              color: "#d97706",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px auto",
              fontSize: "24px"
            }}>
              🔔
            </div>
            <h1 style={{ fontSize: "20px", fontWeight: 700, margin: "0 0 8px 0" }}>
              Confirm Unsubscribe
            </h1>
            <p style={{ fontSize: "14px", color: "#4b5563", lineHeight: "1.5", margin: "0 0 20px 0" }}>
              Would you like to stop receiving restock alerts for <strong>{loaderData.productTitle}</strong> at <strong>{loaderData.brandName}</strong>?
            </p>
            <p style={{ fontSize: "12px", color: "#6b7280", margin: "0 0 24px 0" }}>
              Subscribed email: {loaderData.email}
            </p>

            <Form method="POST" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <input type="hidden" name="token" value={loaderData.token} />
              <input type="hidden" name="legacyId" value={loaderData.legacyId || ""} />
              <input type="hidden" name="legacyShop" value={loaderData.legacyShop || ""} />
              <input type="hidden" name="email" value={loaderData.email} />

              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  backgroundColor: "#dc2626",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "6px",
                  padding: "10px 16px",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: isSubmitting ? "not-allowed" : "pointer",
                  opacity: isSubmitting ? 0.7 : 1,
                  transition: "background-color 0.15s ease",
                }}
              >
                {isSubmitting ? "Unsubscribing..." : "Unsubscribe From Alerts"}
              </button>
            </Form>
          </div>
        )}
      </div>
    </div>
  );
}
