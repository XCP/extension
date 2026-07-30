/**
 * Visual-check spec for the UX-unification work (Phases 0-2).
 *
 * Asserts the key changed surfaces render correctly and attaches a screenshot
 * of each for human review. Intentionally assertion-based rather than pixel
 * golden-image diffing: the app renders in a browser extension and CI (Linux)
 * vs local (Windows) font rendering differs, which would make pixel baselines
 * flaky. These checks fail on real regressions (a missing banner, the amber
 * fee caption disappearing, the Advanced disclosure breaking) without that
 * fragility, and the attached screenshots let a human eyeball the result.
 *
 * The approval screen is reached by seeding a pending request into
 * chrome.storage.session (its PSBT decode is local, no dApp connection needed);
 * the active address is derived at runtime, so it is read from the details view.
 */
import { walletTest, expect } from '@e2e/fixtures';
import type { Page } from '@playwright/test';

// Valid P2WPKH PSBT: 1 BTC input, 10k-sat output -> ~1 BTC fee. No signer
// inputs, so it renders the high-fee caption and a BTC-to-external safety
// banner without needing any API.
const HIGH_FEE_PSBT =
  '70736274ff0100520200000001aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0000000000ffffffff01102700000000000016001406afd46bcdfd22ef94ac122aa11f241244a37ecc000000000001011f00e1f50500000000160014751e76e8199196d454941c45d1b3a323f1433bd60000';

async function readActiveAddress(page: Page): Promise<string> {
  await page.goto(page.url().replace(/\/(index|requests|addresses).*/, '/addresses/details'));
  await page.waitForLoadState('networkidle');
  const address = await page.evaluate(() => {
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const m = (el.textContent || '').match(/(bc1|tb1)[0-9a-z]{30,}/);
      if (m) return m[0];
    }
    return '';
  });
  expect(address, 'should read the full active address from /addresses/details').toMatch(/^(bc1|tb1)/);
  return address;
}

async function seedPsbtAndOpenApproval(page: Page, psbtHex: string, origin = 'https://app.example.com') {
  const address = await readActiveAddress(page);
  await page.evaluate(async ({ address, psbtHex, origin }) => {
    await chrome.storage.session.set({
      pending_sign_psbt_requests: [
        { id: 'visual-check', origin, timestamp: Date.now(), address, walletId: '', psbtHex },
      ],
    });
  }, { address, psbtHex, origin });
  await page.goto(
    page.url().replace(/\/addresses.*/, `/requests/psbt/approve?requestId=visual-check&origin=${encodeURIComponent(origin)}`),
    { waitUntil: 'domcontentloaded' }
  );
  // The PSBT decode is async and its API-enrichment calls fail-and-retry in the
  // test (no dApp backend), so networkidle never settles. Wait for the screen
  // itself to resolve to either the signable view or an error gate.
  await expect(
    page.getByRole('button', { name: 'Sign' }).or(page.getByText('Request Expired'))
  ).toBeVisible({ timeout: 20000 });
}

walletTest.describe('UX visual check', () => {
  walletTest('compose form: standardized TextField + AdvancedSection disclosure', async ({ page }, testInfo) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/fairminter'));
    await page.waitForLoadState('networkidle');

    // TextField-rendered labels are present.
    await expect(page.getByText('Mint per Address')).toBeVisible();
    await expect(page.getByText('Hard Cap')).toBeVisible();

    // The AdvancedSection toggle reveals its (TextField) fields.
    const advanced = page.getByRole('button', { name: /advanced options/i });
    await expect(advanced).toBeVisible();
    await advanced.click();
    await expect(page.getByText('Pre-mine')).toBeVisible();

    await testInfo.attach('compose-fairminter', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  });

  walletTest('approval screen: extracted chrome, amber high-fee caption, severity banner', async ({ page }, testInfo) => {
    await seedPsbtAndOpenApproval(page, HIGH_FEE_PSBT);

    // Extracted chrome (wallet header dot + site bar + footer).
    await expect(page.getByText('app.example.com', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();

    // High-fee signal is the amber caption (the standalone banner was removed).
    await expect(page.getByText(/unusually high/i)).toBeVisible();

    // A severity banner renders through WarningStack/Banner.
    await expect(page.getByText(/BTC Sent to External Address/i)).toBeVisible();

    await testInfo.attach('approval-high-fee', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  });
});
