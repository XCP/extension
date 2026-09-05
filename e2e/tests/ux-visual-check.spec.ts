/**
 * Visual-check spec for the UX-unification work (Phases 0-2).
 *
 * Asserts the key changed surfaces render correctly and attaches a screenshot
 * of each for human review. Intentionally assertion-based rather than pixel
 * golden-image diffing: the app renders in a browser extension and CI (Linux)
 * vs local (Windows) font rendering differs, which would make pixel baselines
 * flaky. These checks fail on real regressions (a missing caution on the
 * attention screen, the Review step disappearing, the Advanced disclosure
 * breaking) without that fragility, and the attached screenshots let a human
 * eyeball the result.
 *
 * The approval screen is reached by seeding a pending request into
 * chrome.storage.session (its PSBT decode is local, no dApp connection needed);
 * the active address is derived at runtime, so it is read from the details view.
 */
import { expect, walletTest } from '@e2e/fixtures';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import type { Page } from '@playwright/test';
import { Address, OutScript, Transaction } from '@scure/btc-signer';
import { authorizeGalleryOrigin } from '../utils/provider-gallery';

// A Counterparty send — the OP_RETURN payload of the `send-divisible-bech32` gallery fixture —
// against a 1 BTC input and a 10k-sat output, so the fee reads as absurd and the screen shows the
// high-fee caption and a BTC-to-external banner without needing any API.
//
// It has to be a real Counterparty transaction: the wallet refuses to sign anything that carries
// no message and spends nothing holding attached assets, so a plain P2WPKH PSBT reaches a disabled
// "Blocked" button rather than the signable view this test is checking. Only the payload is taken
// from the fixture, as the gallery does — the fixtures' own output values are not maintained.
const HIGH_FEE_PSBT =
  '70736274ff0100900200000001d6a5449f6ebaff846701cd467283f5bd7f48114448c142ec00fe9c88b05c7b3f0200000000ffffffff020000000000000000356a33a90f422858ffd8d5891e583f8b74f0b9bc420f67f5cf4463298da066285ae0a3c89caf6e61b9c14620b32f08ef7ee42fa25f95102700000000000016001406afd46bcdfd22ef94ac122aa11f241244a37ecc000000000001011f00e1f50500000000160014751e76e8199196d454941c45d1b3a323f1433bd6000000';

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
  const identity = await authorizeGalleryOrigin(page, origin);
  expect(identity.address).toBe(address);
  // The background review checks the real signer and prevout script. Keep the
  // high-fee fixture, but make its funding input belong to the active test wallet.
  const psbt = Transaction.fromPSBT(hexToBytes(psbtHex));
  const input = psbt.getInput(0);
  psbt.updateInput(0, { witnessUtxo: {
    amount: input.witnessUtxo!.amount,
    script: OutScript.encode(Address().decode(address)),
  } });
  psbtHex = bytesToHex(psbt.toPSBT());
  // One record per signing request, in the shape `beginSignFlow` writes (`signFlow.ts`). Seeded
  // directly rather than through a dApp connection, so `requestKey` only has to be present — it
  // exists for rejoining a duplicate request, which this test never makes.
  await page.evaluate(async ({ identity, psbtHex, origin }) => {
    await chrome.storage.session.set({
      pending_sign_flow: [
        {
          id: 'visual-check',
          origin,
          timestamp: Date.now(),
          ...identity,
          requestKey: 'xcp_signPsbt:visual-check',
          kind: 'sign-psbt',
          status: 'pending',
          psbtHex,
          signInputs: { [identity.address]: [0] },
          sighashTypes: [0x01],
        },
      ],
    });
  }, { identity, psbtHex, origin });
  await page.goto(
    page.url().replace(/\/addresses.*/, `/requests/psbt/approve?requestId=visual-check&origin=${encodeURIComponent(origin)}`),
    { waitUntil: 'domcontentloaded' }
  );
  // The PSBT decode is async and its API-enrichment calls fail-and-retry in the
  // test (no dApp backend), so networkidle never settles. Wait for the screen
  // itself to resolve to either the signable view or an error gate. A signable
  // request with cautions labels its footer button Review rather than Sign.
  await expect(
    page.getByRole('button', { name: /^(Sign transaction|Review)$/ })
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

  walletTest('approval screen: extracted chrome, Review step with high-fee and severity cautions', async ({ page }, testInfo) => {
    await seedPsbtAndOpenApproval(page, HIGH_FEE_PSBT);

    // Extracted chrome (wallet header dot + site bar + footer). The high-fee and
    // BTC-to-external cautions defer signing behind a Review step, so the footer
    // reads Review rather than Sign and the main screen stays visually quiet.
    await expect(page.getByText('app.example.com', { exact: true })).toBeVisible();
    const review = page.getByTestId('approval-footer').getByRole('button', { name: 'Review', exact: true });
    await expect(review).toBeVisible();
    await expect(page.getByRole('button', { name: 'What to review', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();

    await testInfo.attach('approval-high-fee', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });

    // The cautions themselves live on the attention screen behind Review: the
    // high-fee item and the BTC-to-external severity item.
    await review.click();
    const attention = page.getByRole('dialog');
    await expect(attention.getByRole('heading', { name: 'Unusually high network fee', exact: true })).toBeVisible();
    await expect(attention.getByRole('heading', { name: 'BTC Sent to External Address', exact: true })).toBeVisible();

    await testInfo.attach('approval-high-fee-attention', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  });
});
