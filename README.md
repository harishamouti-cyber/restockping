# RestockPing: Revolutionary Back-in-Stock Engine & Unrealized Revenue Accelerator for Shopify

[![Built for Shopify](https://img.shields.io/badge/Shopify-Built_for_Shopify_Ready-008060.svg)](https://shopify.dev/docs/apps/best-practices/built-for-shopify)
[![Remix Framework](https://img.shields.io/badge/Remix-2.15-000000.svg)](https://remix.run/)
[![Shopify App Bridge v4](https://img.shields.io/badge/App_Bridge-v4-008060.svg)](https://shopify.dev/docs/api/app-bridge-library)
[![Polaris Design System](https://img.shields.io/badge/Polaris-v13-5c6ac4.svg)](https://polaris.shopify.com/)
[![Cumulative Layout Shift](https://img.shields.io/badge/CLS-0.00-success.svg)](#)
[![Client Footprint](https://img.shields.io/badge/Client_Bundle-%3C4KB-blue.svg)](#)

---

## 1. Executive Summary

Traditional back-in-stock notification apps (e.g., Swym, Appikon) suffer from architectural flaws that hurt conversion rates and store performance:
* **Heavy, Layout-Shifting Script Injections:** Unmanaged third-party scripts inject arbitrary DOM elements, causing severe Cumulative Layout Shift (CLS) and lowering Core Web Vitals scores.
* **Blind "Blast-All" Delivery:** Blasting entire waitlists simultaneously upon restocking small quantities causes instant re-depletions, server spikes, and frustrated shoppers who arrive at an already sold-out product.
* **Friction-Heavy Product Page Drops:** Sending shoppers back to standard PDPs where they must re-select options, click add-to-cart, and proceed through cart before checkout.
* **Passive Waitlist Storage:** Treating subscriber tables as stagnant rows rather than actionable supplier purchasing intelligence.

**RestockPing** solves these challenges by combining a **zero-CLS native OS 2.0 Theme App Block**, a **FIFO Anti-Burnout Drip Dispatcher**, **1-Click Checkout Permalinks with dynamic discount auto-application**, and an **Unrealized Revenue Supplier Reorder Hub**.

---

## 2. Core Architectural Pillars

### 1. Native OS 2.0 Theme Block Architecture (Zero CLS)
* **Pre-allocated Layout Bounding Box:** Renders server-side within the Shopify theme DOM with CSS dimensional boundaries, guaranteeing **0.00 Cumulative Layout Shift (CLS)**.
* **Pure Vanilla ES6 Engine:** Sub-5KB client footprint with zero external dependencies.
* **Dynamic Variant Change Observer:** Automatically tracks variant switches (`theme:variant:change`, `variant:change`, `[name="id"]`), revealing opt-in fields seamlessly when unavailable.
* **Spam Protection:** Built-in honeypot trap (`b_identifier_hp`) and sliding-window rate limiting.

### 2. FIFO Anti-Burnout Drip Dispatch Pipeline
Instead of flooding the server and waitlist simultaneously, RestockPing paces deliveries based on newly restocked inventory:
$$\text{Target Alerts} = \min\left(\operatorname{round}(\text{availableUnits} \times \text{multiplier}), \text{pendingCount}\right)$$
* Earliest subscribers in chronological order (`createdAt: asc`) are alerted first.
* Configurable cool-down intervals (default 120 minutes) allow initial cohorts time to purchase before releasing additional cohorts.

### 3. 1-Click Checkout Permalinks with Dynamic Discounting
Bypasses product page re-navigation completely:
```
https://${shop}/cart/${variantIdNumber}:1?checkout[email]=${encodeURIComponent(customerEmail)}&discount=${discountCode}
```
Pre-loads the selected variant, pre-fills the shopper's email, and applies any promotional recovery incentive automatically.

### 4. Unrealized Revenue & Supplier Reorder Intelligence
Transforms passive waitlists into an executive purchasing dashboard:
* **Gross Unrealized Demand:** Total dollar backlog waiting across all sold-out items ($\sum \text{Pending} \times \text{Price}$).
* **Supplier Purchase Order Recommendations:**
  $$\text{Suggested Reorder} = \max\left(\text{Waitlist Count} \times 1.5, 20\right)$$
* **One-Click CSV Export:** Formatted for direct warehouse purchase orders.

### 5. Multi-Channel Fallback
* High-deliverability transactional emails via Resend/Postmark SDKs.
* Native browser Web Push opt-in support for zero-SMS carrier fees.

---

## 3. Database Schema (Prisma Relational Model)

* `Session`: Multi-store authenticated sessions with Prisma session storage.
* `RestockSettings`: Merchant dispatch multiplier (2.5x), pacing intervals, sender branding, and promotional discount codes.
* `InventoryItemMapping`: Bidirectional mapping linking Shopify `inventory_item_id` to variants and SKUs.
* `RestockSubscription`: Customer waitlist requests indexed across `[shop, variantId, status]`, `[shop, inventoryItemId, status]`, and `[shop, customerEmail]`.

---

## 4. Built for Shopify (BFS) & App Store Review Compliance

RestockPing is built to achieve 100% first-pass review compliance:

| Requirement | Implementation Details | Status |
| :--- | :--- | :---: |
| **App Bridge v4 & OAuth** | Modern session tokens, embedded layout, zero iframe redirects | PASS |
| **Dynamic CSP & Framing** | Strict `frame-ancestors https://admin.shopify.com https://*.myshopify.com;` | PASS |
| **X-Frame-Options Removal** | Safely deleted on embedded routes to eliminate framing denial | PASS |
| **GDPR Webhook Endpoints** | HMAC SHA-256 verified `customers/data_request`, `customers/redact`, `shop/redact` | PASS |
| **Clean App Uninstall** | `app/uninstalled` purges sessions and deactivates store settings | PASS |
| **Minimal Scopes** | Only `read_products,write_products,read_inventory,write_inventory,read_themes` | PASS |
| **Managed Billing** | 7-day trial, $9.99/mo plan, auto test-mode (`isTest: true`) for test/review stores | PASS |
| **Public Legal Pages** | Polaris-styled `/privacy` and `/terms` routes | PASS |
| **Zero Theme Pollution** | 100% Theme App Extension; zero modifications to `theme.liquid` | PASS |

---

## 5. Development & Deployment

### Local Development
```bash
# 1. Install dependencies
npm install

# 2. Synchronize database schema
npx prisma generate
npx prisma db push

# 3. Run pre-flight audit
npm run audit

# 4. Generate listing assets
npm run assets

# 5. Start development server
npm run dev
```

### Production Build
```bash
npm run build
npm start
```

### Continuous Deployment (Vercel)
1. Push to `main` on GitHub (`harishamouti-cyber/restockping`).
2. Connect repository to Vercel (automatically configured via `vercel.json`).
3. Set environment variables:
   - `SHOPIFY_API_KEY`
   - `SHOPIFY_API_SECRET`
   - `SCOPES`
   - `DATABASE_URL` (PostgreSQL via Neon / Supabase / Vercel Postgres)
   - `RESEND_API_KEY`
   - `EMAIL_FROM`
