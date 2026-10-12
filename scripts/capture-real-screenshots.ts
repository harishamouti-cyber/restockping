import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import * as jose from "jose";

async function captureRealScreenshots() {
  const outputDir = path.resolve(process.cwd(), "app-store-screenshots");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log("===============================================================");
  console.log("   CAPTURING GENUINE RESTOCKPING APP STORE SCREENSHOTS         ");
  console.log("===============================================================\n");

  const apiKey = process.env.SHOPIFY_API_KEY || "";
  const apiSecret = process.env.SHOPIFY_API_SECRET || "";
  const shop = process.env.SHOP || "restockping-demo.myshopify.com";
  const host = Buffer.from(`admin.shopify.com/store/${shop.replace(".myshopify.com", "")}`).toString("base64");

  const secret = new TextEncoder().encode(apiSecret);
  const jwt = await new jose.SignJWT({
    iss: `https://${shop}/admin`,
    dest: `https://${shop}`,
    aud: apiKey,
    sub: "7890",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(secret);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
  });

  const page = await context.newPage();

  // Intercept app-bridge.js to prevent iframe escape redirect while preserving Polaris UI
  await page.route("**/shopifycloud/app-bridge.js", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "window.shopify = { config: {}, idToken: () => Promise.resolve('') };",
    });
  });

  // Inject standard embedded iframe styles to hide App Bridge host elements
  await page.addInitScript(() => {
    const style = document.createElement("style");
    style.innerHTML = "ui-nav-menu, ui-title-bar { display: none !important; }";
    document.head.appendChild(style);
  });

  const cleanView = async () => {
    await page.evaluate(() => {
      document.querySelectorAll("ui-nav-menu, ui-title-bar").forEach((el) => el.remove());
    });
    await page.waitForTimeout(500);
  };

  const baseParams = `shop=${shop}&host=${host}&embedded=1&id_token=${jwt}`;

  // 1. DASHBOARD & SETUP OVERVIEW
  console.log("1. Capturing Dashboard & Setup Overview...");
  await page.goto(`http://localhost:3000/app?${baseParams}`, { waitUntil: "networkidle" });
  await cleanView();
  const screen1Path = path.join(outputDir, "01_restock_dashboard.png");
  await page.screenshot({ path: screen1Path });
  console.log(`✓ Saved ${screen1Path}`);

  // 2. SUBSCRIBER & WAITLIST MANAGEMENT
  console.log("2. Capturing Waitlist & Subscriber Management...");
  await page.goto(`http://localhost:3000/app/subscribers?${baseParams}`, { waitUntil: "networkidle" });
  await cleanView();
  const screen2Path = path.join(outputDir, "02_waitlist_subscribers.png");
  await page.screenshot({ path: screen2Path });
  console.log(`✓ Saved ${screen2Path}`);

  // 3. SETTINGS & LIVE EMAIL PREVIEW
  console.log("3. Capturing Settings & Live Email Preview...");
  await page.goto(`http://localhost:3000/app/settings?${baseParams}`, { waitUntil: "networkidle" });
  await cleanView();
  const screen3Path = path.join(outputDir, "03_email_settings_and_preview.png");
  await page.screenshot({ path: screen3Path });
  console.log(`✓ Saved ${screen3Path}`);

  // 4. SETTINGS - STOREFRONT PDP PREVIEW MODE
  console.log("4. Capturing Settings - Storefront PDP Button Preview...");
  const storefrontTabBtn = page.locator('button:has-text("Storefront PDP")');
  if (await storefrontTabBtn.isVisible()) {
    await storefrontTabBtn.click();
    await page.waitForTimeout(600);
  }
  await cleanView();
  const screen4Path = path.join(outputDir, "04_storefront_theme_preview.png");
  await page.screenshot({ path: screen4Path });
  console.log(`✓ Saved ${screen4Path}`);

  // 5. FIFO RESTOCK SIMULATOR TEST BENCH
  console.log("5. Capturing FIFO Inventory Restock Simulator...");
  await page.goto(`http://localhost:3000/app/simulation?${baseParams}`, { waitUntil: "networkidle" });
  await cleanView();
  const screen5Path = path.join(outputDir, "05_fifo_alert_simulator.png");
  await page.screenshot({ path: screen5Path });
  console.log(`✓ Saved ${screen5Path}`);

  await browser.close();
  console.log("\nAll 5 genuine screenshots captured successfully!");
}

captureRealScreenshots().catch((err) => {
  console.error("Capture failed:", err);
  process.exit(1);
});
