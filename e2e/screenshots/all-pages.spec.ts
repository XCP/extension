/**
 * All Pages Screenshot Capture
 *
 * This script navigates to all non-compose pages and takes screenshots
 * for UX review and analysis.
 */

import { test } from '@playwright/test';
import { launchExtension, createWallet, cleanup, TEST_PASSWORD } from '../helpers/test-helpers';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// All pages to screenshot (excluding compose pages)
const PAGES = [
  // Main navigation
  { path: '/index', name: '01-index-wallet', category: 'Main', description: 'Wallet Home / Index' },
  { path: '/market', name: '02-market', category: 'Main', description: 'Market Overview' },
  { path: '/actions', name: '03-actions', category: 'Main', description: 'Actions Menu' },
  { path: '/settings', name: '04-settings', category: 'Main', description: 'Settings Menu' },

  // Settings pages
  { path: '/settings/address-type', name: '05-settings-address-type', category: 'Settings', description: 'Address Type Settings' },
  { path: '/settings/advanced', name: '06-settings-advanced', category: 'Settings', description: 'Advanced Settings' },
  { path: '/settings/connected-sites', name: '07-settings-connected-sites', category: 'Settings', description: 'Connected Sites' },
  { path: '/settings/security', name: '08-settings-security', category: 'Settings', description: 'Security Settings' },
  { path: '/settings/pinned-assets', name: '09-settings-pinned-assets', category: 'Settings', description: 'Pinned Assets' },

  // Wallet management
  { path: '/add-wallet', name: '10-add-wallet', category: 'Wallet', description: 'Add Wallet' },
  { path: '/select-wallet', name: '11-select-wallet', category: 'Wallet', description: 'Select Wallet' },
  { path: '/reset-wallet', name: '12-reset-wallet', category: 'Wallet', description: 'Reset Wallet' },
  { path: '/import-private-key', name: '13-import-private-key', category: 'Wallet', description: 'Import Private Key' },

  // Address management
  { path: '/select-address', name: '14-select-address', category: 'Address', description: 'Select Address' },
  { path: '/view-address', name: '15-view-address', category: 'Address', description: 'View Address QR' },
  { path: '/address-history', name: '16-address-history', category: 'Address', description: 'Address History' },

  // Asset viewing
  { path: '/select-assets', name: '17-select-assets', category: 'Assets', description: 'Select Assets' },
  { path: '/asset/XCP', name: '18-asset-xcp', category: 'Assets', description: 'View Asset (XCP)' },
  { path: '/balance/BTC', name: '19-balance-btc', category: 'Assets', description: 'View Balance (BTC)' },

  // Actions
  { path: '/actions/sign-message', name: '20-sign-message', category: 'Actions', description: 'Sign Message' },
  { path: '/actions/verify-message', name: '21-verify-message', category: 'Actions', description: 'Verify Message' },

  // Consolidation
  { path: '/consolidate', name: '22-consolidate', category: 'Actions', description: 'Consolidate UTXOs' },

  // Provider pages (will show empty state)
  { path: '/provider/approval-queue', name: '23-approval-queue', category: 'Provider', description: 'Approval Queue' },
];

// Ensure screenshots directory exists
const screenshotsDir = path.join(__dirname, '../../test-results/all-screenshots');

test.describe('All Pages Screenshots', () => {
  test('Capture all page screenshots', async () => {
    // Create screenshots directory
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    // Launch extension and create wallet
    const { context, page, extensionId } = await launchExtension('all-screenshots');

    try {
      // Create a wallet first
      await createWallet(page, TEST_PASSWORD);
      await page.waitForTimeout(2000);

      const baseUrl = `chrome-extension://${extensionId}/popup.html#`;

      // Capture each page
      for (const pageInfo of PAGES) {
        console.log(`Capturing: ${pageInfo.description} (${pageInfo.path})`);

        try {
          // Navigate to the page
          await page.goto(`${baseUrl}${pageInfo.path}`, { waitUntil: 'networkidle' });
          await page.waitForTimeout(1500); // Wait for page to fully render

          // Take screenshot
          await page.screenshot({
            path: path.join(screenshotsDir, `${pageInfo.name}.png`),
            fullPage: true,
          });

          console.log(`  ✓ Captured ${pageInfo.name}.png`);
        } catch (error) {
          console.error(`  ✗ Failed to capture ${pageInfo.name}: ${(error as Error).message}`);

          // Take error screenshot
          await page.screenshot({
            path: path.join(screenshotsDir, `${pageInfo.name}-error.png`),
            fullPage: true,
          });
        }
      }

      // Generate HTML report
      const htmlReport = generateHtmlReport(PAGES);
      fs.writeFileSync(path.join(screenshotsDir, 'index.html'), htmlReport);
      console.log('\n✓ Generated HTML report: index.html');

    } finally {
      await cleanup(context);
    }
  });
});

function generateHtmlReport(pages: typeof PAGES): string {
  // Group pages by category
  const categories = [...new Set(pages.map(p => p.category))];

  let content = '';
  for (const category of categories) {
    const categoryPages = pages.filter(p => p.category === category);
    content += `
    <div class="section-header">${category}</div>
    ${categoryPages.map(p => `
    <div class="screenshot-card">
      <h3>${p.description}</h3>
      <p class="path">${p.path}</p>
      <img src="${p.name}.png" alt="${p.description}" onerror="this.src='${p.name}-error.png'" />
    </div>
    `).join('\n')}
    `;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>All Pages UX Review</title>
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
      margin: 0 0 8px 0;
      color: #333;
      font-size: 14px;
    }
    .screenshot-card .path {
      font-family: monospace;
      font-size: 11px;
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
      font-weight: bold;
    }
    .section-header:first-child {
      margin-top: 0;
    }
  </style>
</head>
<body>
  <h1>All Pages UX Review</h1>
  <p style="text-align: center; color: #666;">Generated: ${new Date().toISOString()}</p>

  <div class="screenshots-grid">
    ${content}
  </div>
</body>
</html>`;
}
