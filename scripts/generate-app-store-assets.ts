import fs from "fs";
import path from "path";
import { chromium } from "playwright";

async function generateAssets() {
  const outputDir = path.resolve(process.cwd(), "app-store-assets");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log("===============================================================");
  console.log("   RESTOCKPING APP STORE ASSETS GENERATOR (PLAYWRIGHT)         ");
  console.log("===============================================================\n");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ deviceScaleFactor: 2 });
  const page = await context.newPage();

  // 1. MASTER APP ICON (1200 x 1200, Square PNG, 30% safe zone, No pre-rounded corners)
  console.log("Rendering 1200x1200 Master App Icon...");
  await page.setViewportSize({ width: 1200, height: 1200 });
  const iconHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            width: 1200px;
            height: 1200px;
            background: linear-gradient(135deg, #09090b 0%, #18181b 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          }
          .icon-container {
            width: 600px;
            height: 600px;
            background: radial-gradient(circle at 30% 30%, #008060 0%, #004c3f 100%);
            border-radius: 120px;
            box-shadow: 0 40px 100px rgba(0, 128, 96, 0.4), inset 0 2px 4px rgba(255, 255, 255, 0.3);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            position: relative;
          }
          .pulse-ring {
            position: absolute;
            width: 720px;
            height: 720px;
            border: 4px solid rgba(0, 128, 96, 0.25);
            border-radius: 180px;
          }
          .ping-badge {
            position: absolute;
            top: 60px;
            right: 60px;
            width: 56px;
            height: 56px;
            background: #ea580c;
            border-radius: 50%;
            border: 8px solid #ffffff;
            box-shadow: 0 8px 24px rgba(234, 88, 12, 0.5);
          }
          svg {
            width: 280px;
            height: 280px;
            fill: #ffffff;
            filter: drop-shadow(0 10px 20px rgba(0,0,0,0.25));
          }
          .brand-label {
            margin-top: 18px;
            font-size: 42px;
            font-weight: 800;
            color: #ffffff;
            letter-spacing: -1px;
            text-shadow: 0 2px 8px rgba(0,0,0,0.3);
          }
        </style>
      </head>
      <body>
        <div class="pulse-ring"></div>
        <div class="icon-container">
          <div class="ping-badge"></div>
          <svg viewBox="0 0 24 24">
            <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/>
          </svg>
          <div class="brand-label">RESTOCKPING</div>
        </div>
      </body>
    </html>
  `;
  await page.setContent(iconHtml);
  await page.screenshot({ path: path.join(outputDir, "app_icon_1200x1200.png") });

  // 2. KEY VISUAL / HERO BANNER (1600 x 900, 16:9, Dark Graphite Linear Aesthetic)
  console.log("Rendering 1600x900 Key Visual / Hero Banner...");
  await page.setViewportSize({ width: 1600, height: 900 });
  const bannerHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            width: 1600px;
            height: 900px;
            background: #09090b;
            color: #fafafa;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            padding: 80px;
            position: relative;
            overflow: hidden;
          }
          .grid-background {
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background-image: linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px),
                              linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px);
            background-size: 40px 40px;
            pointer-events: none;
          }
          .glow {
            position: absolute;
            width: 700px;
            height: 700px;
            background: radial-gradient(circle, rgba(0, 128, 96, 0.18) 0%, transparent 70%);
            top: -150px;
            right: -100px;
            pointer-events: none;
          }
          .header {
            display: flex;
            align-items: center;
            gap: 16px;
            z-index: 2;
          }
          .tag {
            background: rgba(0, 128, 96, 0.15);
            border: 1px solid rgba(0, 128, 96, 0.4);
            color: #34d399;
            padding: 6px 16px;
            border-radius: 9999px;
            font-size: 14px;
            font-weight: 600;
            letter-spacing: 0.5px;
          }
          .main-content {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 60px;
            z-index: 2;
          }
          .text-col {
            max-width: 650px;
          }
          h1 {
            font-size: 58px;
            line-height: 1.1;
            font-weight: 800;
            letter-spacing: -2px;
            margin-bottom: 24px;
            background: linear-gradient(180deg, #ffffff 0%, #a1a1aa 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
          }
          p {
            font-size: 20px;
            line-height: 1.5;
            color: #a1a1aa;
            margin-bottom: 32px;
          }
          .metrics-row {
            display: flex;
            gap: 32px;
          }
          .metric-item {
            background: rgba(24, 24, 27, 0.8);
            border: 1px solid rgba(255, 255, 255, 0.1);
            padding: 16px 24px;
            border-radius: 12px;
          }
          .metric-val {
            font-size: 28px;
            font-weight: 700;
            color: #ffffff;
          }
          .metric-label {
            font-size: 13px;
            color: #71717a;
            margin-top: 4px;
          }
          .ui-mockup {
            flex: 1;
            background: #18181b;
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 16px;
            padding: 32px;
            box-shadow: 0 30px 80px rgba(0,0,0,0.6);
          }
          .ui-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          }
          .ui-title { font-weight: 600; font-size: 16px; }
          .ui-sub { font-size: 13px; color: #71717a; }
          .ui-badge {
            background: #008060;
            color: #ffffff;
            font-size: 12px;
            font-weight: 600;
            padding: 4px 10px;
            border-radius: 6px;
          }
        </style>
      </head>
      <body>
        <div class="grid-background"></div>
        <div class="glow"></div>
        <div class="header">
          <div class="tag">BUILT FOR SHOPIFY &bull; OS 2.0</div>
        </div>
        <div class="main-content">
          <div class="text-col">
            <h1>Never Lose a Restock Sale Again.</h1>
            <p>FIFO anti-burnout drip delivery, 1-click cart permalinks with auto-discounts, and real-time supplier reorder demand forecasting.</p>
            <div class="metrics-row">
              <div class="metric-item">
                <div class="metric-val">0.00 CLS</div>
                <div class="metric-label">Zero Layout Shift</div>
              </div>
              <div class="metric-item">
                <div class="metric-val">&lt; 4 KB</div>
                <div class="metric-label">Lightweight Client</div>
              </div>
              <div class="metric-item">
                <div class="metric-val">FIFO</div>
                <div class="metric-label">Drip Dispatch</div>
              </div>
            </div>
          </div>
          <div class="ui-mockup">
            <div style="font-size: 14px; text-transform: uppercase; color: #71717a; margin-bottom: 16px; letter-spacing: 1px;">Live Waitlist Demand</div>
            <div class="ui-row">
              <div>
                <div class="ui-title">Titanium Chronograph</div>
                <div class="ui-sub">Matte Black / 42mm &bull; $249.00</div>
              </div>
              <div style="text-align: right;">
                <div class="ui-badge">42 Waiting</div>
                <div style="font-size: 12px; color: #34d399; margin-top: 4px;">+$10,458 Demand</div>
              </div>
            </div>
            <div class="ui-row">
              <div>
                <div class="ui-title">Merino Wool Trench</div>
                <div class="ui-sub">Charcoal / Large &bull; $385.00</div>
              </div>
              <div style="text-align: right;">
                <div class="ui-badge">18 Waiting</div>
                <div style="font-size: 12px; color: #34d399; margin-top: 4px;">+$6,930 Demand</div>
              </div>
            </div>
          </div>
        </div>
        <div style="font-size: 14px; color: #71717a; z-index: 2;">
          RestockPing &bull; Official Shopify App Store Listing
        </div>
      </body>
    </html>
  `;
  await page.setContent(bannerHtml);
  await page.screenshot({ path: path.join(outputDir, "hero_banner_1600x900.png") });

  // 3. FULL-BLEED SCREENSHOT: STOREFRONT OS 2.0 TRIGGER
  console.log("Rendering 1600x900 Storefront Screenshot...");
  const screenshotStorefrontHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            width: 1600px;
            height: 900px;
            background: #ffffff;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 60px;
          }
          .pdp-card {
            width: 1000px;
            display: flex;
            gap: 60px;
            background: #ffffff;
            border-radius: 16px;
            padding: 40px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.08);
            border: 1px solid #f4f4f5;
          }
          .pdp-img {
            width: 420px;
            height: 420px;
            background: #f4f4f5;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
            color: #a1a1aa;
            font-weight: 500;
          }
          .pdp-info {
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: center;
          }
          .sold-out-badge {
            display: inline-block;
            background: #fee2e2;
            color: #b91c1c;
            padding: 4px 10px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 700;
            margin-bottom: 12px;
            width: fit-content;
          }
          h2 { font-size: 28px; font-weight: 700; color: #18181b; margin-bottom: 8px; }
          .price { font-size: 22px; font-weight: 600; color: #52525b; margin-bottom: 24px; }
          .restockping-box {
            border: 1px solid #e4e4e7;
            border-radius: 8px;
            padding: 16px;
            background: #fafafa;
          }
          .rp-head { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; margin-bottom: 10px; }
          .rp-dot { width: 8px; height: 8px; border-radius: 50%; background: #ea580c; }
          .rp-form { display: flex; gap: 8px; }
          .rp-input { flex: 1; height: 42px; border: 1px solid #d4d4d8; border-radius: 6px; padding: 0 12px; font-size: 14px; }
          .rp-btn { height: 42px; padding: 0 20px; background: #008060; color: #fff; border: none; border-radius: 6px; font-weight: 600; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="pdp-card">
          <div class="pdp-img">Product Image (Sold Out)</div>
          <div class="pdp-info">
            <div class="sold-out-badge">SOLD OUT</div>
            <h2>Titanium Chronograph Watch</h2>
            <div class="price">$249.00 USD</div>
            <div class="restockping-box">
              <div class="rp-head">
                <div class="rp-dot"></div>
                <span>Sold out? Get notified when back in stock</span>
              </div>
              <div class="rp-form">
                <input class="rp-input" value="alexander.shopper@example.com" readonly />
                <button class="rp-btn">Notify Me</button>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
  await page.setContent(screenshotStorefrontHtml);
  await page.screenshot({ path: path.join(outputDir, "screenshot_01_storefront_optin.png") });

  // 4. FULL-BLEED SCREENSHOT: EXECUTIVE DASHBOARD & REORDER INTELLIGENCE
  console.log("Rendering 1600x900 Executive Dashboard Screenshot...");
  const screenshotDashboardHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            width: 1600px;
            height: 900px;
            background: #f1f2f4;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            padding: 40px;
            color: #202223;
          }
          .polaris-page {
            max-width: 1520px;
            margin: 0 auto;
          }
          .polaris-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 24px;
          }
          .title { font-size: 24px; font-weight: 700; }
          .subtitle { font-size: 14px; color: #6d7175; margin-top: 4px; }
          .metrics-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 20px;
            margin-bottom: 24px;
          }
          .card {
            background: #ffffff;
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.06);
            border: 1px solid #e1e3e5;
          }
          .metric-num { font-size: 32px; font-weight: 700; color: #202223; margin: 10px 0 4px; }
          .table-card {
            background: #ffffff;
            border-radius: 12px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.06);
            border: 1px solid #e1e3e5;
            overflow: hidden;
          }
          .table-head {
            padding: 18px 24px;
            border-bottom: 1px solid #e1e3e5;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          table { width: 100%; border-collapse: collapse; text-align: left; }
          th { padding: 14px 24px; background: #fafbfb; font-size: 13px; color: #6d7175; font-weight: 600; border-bottom: 1px solid #e1e3e5; }
          td { padding: 16px 24px; border-bottom: 1px solid #f1f2f3; font-size: 14px; }
          .badge-out { background: #fed3d1; color: #8e1f0b; padding: 3px 8px; border-radius: 6px; font-size: 12px; font-weight: 600; }
          .badge-suggest { background: #ffd6a4; color: #8a6116; padding: 3px 8px; border-radius: 6px; font-size: 12px; font-weight: 600; }
          .rev-num { color: #108043; font-weight: 700; }
          .btn-export { background: #008060; color: #ffffff; border: none; padding: 10px 18px; border-radius: 8px; font-weight: 600; font-size: 14px; cursor: pointer; }
        </style>
      </head>
      <body>
        <div class="polaris-page">
          <div class="polaris-header">
            <div>
              <div class="title">RestockPing Executive Demand Hub</div>
              <div class="subtitle">Real-time back-in-stock waitlist aggregation and supplier replenishment intelligence</div>
            </div>
            <button class="btn-export">Export Supplier Reorder CSV</button>
          </div>
          <div class="metrics-grid">
            <div class="card">
              <div style="font-size: 13px; color: #6d7175; font-weight: 600;">Gross Unrealized Demand</div>
              <div class="metric-num">$17,388.00</div>
              <div style="font-size: 12px; color: #108043;">● Active customer demand awaiting restock</div>
            </div>
            <div class="card">
              <div style="font-size: 13px; color: #6d7175; font-weight: 600;">Total Waitlist Subscribers</div>
              <div class="metric-num">60 Waiting</div>
              <div style="font-size: 12px; color: #2c6ecb;">● High-intent buyer notifications queued</div>
            </div>
            <div class="card">
              <div style="font-size: 13px; color: #6d7175; font-weight: 600;">Recovered Conversions</div>
              <div class="metric-num">14 Orders</div>
              <div style="font-size: 12px; color: #108043;">● Originating from 1-Click checkout links</div>
            </div>
          </div>
          <div class="table-card">
            <div class="table-head">
              <div>
                <strong style="font-size: 16px;">Supplier Reorder Intelligence</strong>
                <div style="font-size: 13px; color: #6d7175;">Recommended purchase order replenish quantities (Formula: max(Waitlist × 1.5, 20 units))</div>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Product / Variant</th>
                  <th>Current Stock</th>
                  <th>Active Waitlist</th>
                  <th>Unrealized Demand</th>
                  <th>Suggested PO Reorder</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><b>Titanium Chronograph</b><br><span style="color:#6d7175; font-size: 13px;">Matte Black / 42mm</span></td>
                  <td><span class="badge-out">0 units</span></td>
                  <td><b>42</b></td>
                  <td class="rev-num">$10,458.00</td>
                  <td><span class="badge-suggest">63 units</span></td>
                </tr>
                <tr>
                  <td><b>Merino Wool Trench</b><br><span style="color:#6d7175; font-size: 13px;">Charcoal / Large</span></td>
                  <td><span class="badge-out">0 units</span></td>
                  <td><b>18</b></td>
                  <td class="rev-num">$6,930.00</td>
                  <td><span class="badge-suggest">27 units</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </body>
    </html>
  `;
  await page.setContent(screenshotDashboardHtml);
  await page.screenshot({ path: path.join(outputDir, "screenshot_02_executive_dashboard.png") });

  await browser.close();
  console.log(`\n✓ All App Store Assets rendered successfully to: ${outputDir}`);
}

generateAssets().catch((err) => {
  console.error("Asset generation error:", err);
});
