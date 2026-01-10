/**
 * Market Pages Screenshot Capture
 *
 * Captures screenshots of all market-related pages for UX review.
 */

import { test } from '@playwright/test';
import { launchExtension, createWallet, cleanup, TEST_PASSWORD } from '../helpers/test-helpers';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure screenshots directory exists
const screenshotsDir = path.join(__dirname, '../../test-results/market-screenshots');

test.describe('Market Pages Screenshots', () => {
  test('Capture market page screenshots', async () => {
    // Create screenshots directory
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    // Launch extension and create wallet
    const { context, page, extensionId } = await launchExtension('market-screenshots');

    try {
      // Create a wallet first
      await createWallet(page, TEST_PASSWORD);
      await page.waitForTimeout(2000);

      const baseUrl = `chrome-extension://${extensionId}/popup.html#`;

      // 1. Market page - Browse tab (default)
      console.log('Capturing: Market Browse - Dispensers Open');
      await page.goto(`${baseUrl}/market`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(3000); // Wait for API data
      await page.screenshot({
        path: path.join(screenshotsDir, '01-market-browse-dispensers-open.png'),
        fullPage: true,
      });

      // 2. Click on Dispensed tab for dispensers section
      console.log('Capturing: Market Browse - Dispensers Dispensed');
      const dispensedTab = page.locator('button:has-text("Dispensed")').first();
      if (await dispensedTab.isVisible()) {
        await dispensedTab.click();
        await page.waitForTimeout(1000);
      }
      await page.screenshot({
        path: path.join(screenshotsDir, '02-market-browse-dispensers-dispensed.png'),
        fullPage: true,
      });

      // 3. Scroll down and click on History tab for orders section
      console.log('Capturing: Market Browse - Orders History');
      const historyTab = page.locator('button:has-text("History")').first();
      if (await historyTab.isVisible()) {
        await historyTab.click();
        await page.waitForTimeout(1000);
      }
      await page.screenshot({
        path: path.join(screenshotsDir, '03-market-browse-orders-history.png'),
        fullPage: true,
      });

      // 4. Click back to Open tab for orders
      console.log('Capturing: Market Browse - Orders Open');
      // Need to find the Orders section Open tab (not the Dispensers one)
      const ordersOpenTab = page.locator('text=Orders').locator('..').locator('button:has-text("Open")');
      if (await ordersOpenTab.isVisible()) {
        await ordersOpenTab.click();
        await page.waitForTimeout(1000);
      }
      await page.screenshot({
        path: path.join(screenshotsDir, '04-market-browse-orders-open.png'),
        fullPage: true,
      });

      // 5. Switch to Manage tab
      console.log('Capturing: Market Manage tab');
      const manageTab = page.locator('button:has-text("Manage")').first();
      await manageTab.click();
      await page.waitForTimeout(2000);
      await page.screenshot({
        path: path.join(screenshotsDir, '05-market-manage.png'),
        fullPage: true,
      });

      // 6. Asset dispensers page (XCP)
      console.log('Capturing: Asset Dispensers - XCP');
      await page.goto(`${baseUrl}/market/dispensers/XCP`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(3000);
      await page.screenshot({
        path: path.join(screenshotsDir, '06-asset-dispensers-xcp-open.png'),
        fullPage: true,
      });

      // 7. XCP Dispensed tab
      console.log('Capturing: Asset Dispensers - XCP Dispensed');
      const xcpDispensedTab = page.locator('button:has-text("Dispensed")').first();
      if (await xcpDispensedTab.isVisible()) {
        await xcpDispensedTab.click();
        await page.waitForTimeout(1000);
      }
      await page.screenshot({
        path: path.join(screenshotsDir, '07-asset-dispensers-xcp-dispensed.png'),
        fullPage: true,
      });

      // 8. Test XCP click from price ticker
      console.log('Capturing: Price ticker XCP click navigation');
      await page.goto(`${baseUrl}/market`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);

      // Click on the XCP price ticker
      const xcpTicker = page.locator('text=XCP').first();
      if (await xcpTicker.isVisible()) {
        await xcpTicker.click();
        await page.waitForTimeout(2000);
        await page.screenshot({
          path: path.join(screenshotsDir, '08-xcp-ticker-navigation.png'),
          fullPage: true,
        });
      }

      // Generate HTML report
      const htmlReport = generateHtmlReport();
      fs.writeFileSync(path.join(screenshotsDir, 'index.html'), htmlReport);
      console.log('\n✓ Generated HTML report: index.html');
      console.log(`Screenshots saved to: ${screenshotsDir}`);

    } finally {
      await cleanup(context);
    }
  });
});

function generateHtmlReport(): string {
  const screenshots = [
    { name: '01-market-browse-dispensers-open', description: 'Market Browse - Dispensers Open' },
    { name: '02-market-browse-dispensers-dispensed', description: 'Market Browse - Dispensers Dispensed' },
    { name: '03-market-browse-orders-history', description: 'Market Browse - Orders History' },
    { name: '04-market-browse-orders-open', description: 'Market Browse - Orders Open' },
    { name: '05-market-manage', description: 'Market Manage Tab' },
    { name: '06-asset-dispensers-xcp-open', description: 'XCP Dispensers - Open' },
    { name: '07-asset-dispensers-xcp-dispensed', description: 'XCP Dispensers - Dispensed' },
    { name: '08-xcp-ticker-navigation', description: 'XCP Ticker Click Navigation' },
  ];

  const content = screenshots.map(s => `
    <div class="screenshot-card">
      <h3>${s.description}</h3>
      <img src="${s.name}.png" alt="${s.description}" onerror="this.parentElement.innerHTML='<p class=\\'error\\'>Failed to load screenshot</p>'" />
    </div>
  `).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Market Pages UX Review</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 1400px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    h1 {
      text-align: center;
      color: #333;
    }
    .screenshots-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
      gap: 20px;
    }
    .screenshot-card {
      background: white;
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .screenshot-card h3 {
      margin: 0 0 12px 0;
      color: #333;
      font-size: 14px;
    }
    .screenshot-card img {
      width: 100%;
      border: 1px solid #ddd;
      border-radius: 4px;
    }
    .error {
      color: red;
      text-align: center;
      padding: 20px;
    }
  </style>
</head>
<body>
  <h1>Market Pages UX Review</h1>
  <p style="text-align: center; color: #666;">Generated: ${new Date().toISOString()}</p>

  <div class="screenshots-grid">
    ${content}
  </div>
</body>
</html>`;
}
