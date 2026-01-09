/**
 * Compose Pages Screenshot Capture
 *
 * This script navigates to all compose pages and takes screenshots
 * for UX review and analysis.
 */

import { test } from '@playwright/test';
import { launchExtension, createWallet, cleanup, TEST_PASSWORD } from '../helpers/test-helpers';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// All compose pages to screenshot
const COMPOSE_PAGES = [
  // Send operations
  { path: '/compose/send/BTC', name: 'send-btc', description: 'Send BTC' },
  { path: '/compose/send/XCP', name: 'send-xcp', description: 'Send XCP' },
  { path: '/compose/send/mpma', name: 'send-mpma', description: 'Multi-recipient Send (MPMA)' },

  // Sweep
  { path: '/compose/sweep', name: 'sweep', description: 'Sweep Address' },

  // Order/Trading
  { path: '/compose/order/XCP', name: 'order', description: 'Create Order (DEX)' },
  { path: '/compose/btcpay', name: 'btcpay', description: 'BTC Pay' },
  { path: '/compose/cancel', name: 'cancel-order', description: 'Cancel Order' },

  // Issuance
  { path: '/compose/issuance', name: 'issuance-new', description: 'Create New Asset' },
  { path: '/compose/issuance/TESTASSET', name: 'issuance-existing', description: 'Manage Existing Asset' },

  // Dispenser
  { path: '/compose/dispenser/XCP', name: 'dispenser-create', description: 'Create Dispenser' },
  { path: '/compose/dispenser/close', name: 'dispenser-close', description: 'Close Dispenser' },
  { path: '/compose/dispenser/close-by-hash', name: 'dispenser-close-hash', description: 'Close Dispenser by Hash' },
  { path: '/compose/dispenser/dispense', name: 'dispense', description: 'Dispense from Dispenser' },

  // Fairminter
  { path: '/compose/fairminter', name: 'fairminter-create', description: 'Create Fairminter' },
  { path: '/compose/fairmint', name: 'fairmint', description: 'Mint from Fairminter' },

  // Other operations
  { path: '/compose/dividend/XCP', name: 'dividend', description: 'Pay Dividend' },
  { path: '/compose/broadcast', name: 'broadcast', description: 'Broadcast Message' },

  // UTXO operations
  { path: '/compose/utxo/attach', name: 'utxo-attach', description: 'Attach Asset to UTXO' },
  { path: '/compose/utxo/detach', name: 'utxo-detach', description: 'Detach Asset from UTXO' },
  { path: '/compose/utxo/move', name: 'utxo-move', description: 'Move UTXO' },
];

// Ensure screenshots directory exists
const screenshotsDir = path.join(__dirname, '../../test-results/compose-screenshots');

test.describe('Compose Pages Screenshots', () => {
  test('Capture all compose page screenshots', async () => {
    // Create screenshots directory
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    // Launch extension and create wallet
    const { context, page, extensionId } = await launchExtension('compose-screenshots');

    try {
      // Create a wallet first
      await createWallet(page, TEST_PASSWORD);
      await page.waitForTimeout(2000);

      const baseUrl = `chrome-extension://${extensionId}/popup.html#`;

      // Capture each compose page
      for (const composePage of COMPOSE_PAGES) {
        console.log(`Capturing: ${composePage.description} (${composePage.path})`);

        try {
          // Navigate to the compose page
          await page.goto(`${baseUrl}${composePage.path}`, { waitUntil: 'networkidle' });
          await page.waitForTimeout(1500); // Wait for page to fully render

          // Take screenshot
          await page.screenshot({
            path: path.join(screenshotsDir, `${composePage.name}.png`),
            fullPage: true,
          });

          console.log(`  ✓ Captured ${composePage.name}.png`);
        } catch (error) {
          console.error(`  ✗ Failed to capture ${composePage.name}: ${(error as Error).message}`);

          // Take error screenshot
          await page.screenshot({
            path: path.join(screenshotsDir, `${composePage.name}-error.png`),
            fullPage: true,
          });
        }
      }

      // Generate HTML report
      const htmlReport = generateHtmlReport(COMPOSE_PAGES);
      fs.writeFileSync(path.join(screenshotsDir, 'index.html'), htmlReport);
      console.log('\n✓ Generated HTML report: index.html');

    } finally {
      await cleanup(context);
    }
  });
});

function generateHtmlReport(pages: typeof COMPOSE_PAGES): string {
  const rows = pages.map(p => `
    <div class="screenshot-card">
      <h3>${p.description}</h3>
      <p class="path">${p.path}</p>
      <img src="${p.name}.png" alt="${p.description}" onerror="this.src='${p.name}-error.png'" />
    </div>
  `).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Compose Pages UX Review</title>
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
      grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
      gap: 20px;
    }
    .screenshot-card {
      background: white;
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .screenshot-card h3 {
      margin: 0 0 8px 0;
      color: #333;
    }
    .screenshot-card .path {
      font-family: monospace;
      font-size: 12px;
      color: #666;
      margin: 0 0 12px 0;
    }
    .screenshot-card img {
      width: 100%;
      border: 1px solid #ddd;
      border-radius: 4px;
    }
    .section-header {
      grid-column: 1 / -1;
      background: #333;
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <h1>Compose Pages UX Review</h1>
  <p style="text-align: center; color: #666;">Generated: ${new Date().toISOString()}</p>

  <div class="screenshots-grid">
    ${rows}
  </div>
</body>
</html>`;
}
