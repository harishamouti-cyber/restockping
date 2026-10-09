import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import db from "../db.server";
import { sanitizeShopBrandName } from "../utils/brand";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const email = (url.searchParams.get("email") || "").trim().toLowerCase();
  const variant = (url.searchParams.get("variant") || "").trim();
  const id = (url.searchParams.get("id") || "").trim();
  const shop = (url.searchParams.get("shop") || "").trim();

  let unsubscribed = false;

  if (email) {
    try {
      if (id) {
        const res = await db.restockSubscription.updateMany({
          where: { id, customerEmail: email },
          data: { status: "CANCELLED" },
        });
        unsubscribed = res.count > 0;
      }

      if (!unsubscribed) {
        const res = await db.restockSubscription.updateMany({
          where: {
            customerEmail: email,
            ...(variant ? { variantId: { contains: variant.replace(/\D/g, "") } } : {}),
            status: { in: ["PENDING", "DISPATCHED"] },
          },
          data: { status: "CANCELLED" },
        });
        unsubscribed = res.count > 0;
      }
    } catch (err) {
      console.error("[Unsubscribe Error]:", err);
    }
  }

  const brandName = sanitizeShopBrandName(shop || "Store");

  return json({
    email,
    unsubscribed,
    brandName,
  });
}

export default function UnsubscribePage() {
  const { email, unsubscribed, brandName } = useLoaderData<typeof loader>();

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
          {email
            ? `Your email (${email}) has been removed from restock alerts for this product.`
            : "You have been unsubscribed from this restock notification."}
        </p>

        <p style={{ fontSize: "12px", color: "#8c9196", margin: 0 }}>
          Thank you for shopping with <strong>{brandName}</strong>. You will no longer receive restock emails for this request.
        </p>
      </div>
    </div>
  );
}
