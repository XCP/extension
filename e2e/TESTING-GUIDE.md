# E2E Testing Guide

How this repository's Playwright tests are built and run, and the mistakes that make a test pass
without testing anything. Unit tests are Vitest files next to the code under `src`; everything
here is about the browser tests under `e2e/`. Setup, CI and the other test environments are in
[CONTRIBUTING.md](../CONTRIBUTING.md#testing).

## Running tests

The tests load the unpacked extension from `.output/chrome-mv3`, so build it first, with the
e2e build ([how it differs](../CONTRIBUTING.md#building)):

```bash
npm run build:e2e
npx playwright test e2e/tests/provider-message-signing.spec.ts
```

Rebuild after every source change; Playwright does not rebuild for you. Run the specs your change
affects, not the whole suite: the full suite runs in CI.

**Run one Playwright job at a time.** Each test launches its own persistent Chromium profile with
the extension loaded, and `playwright.config.ts` already uses a single worker. Two Playwright
processes at once compete for the same build output and `test-results/` directory (each run wipes
it) and fail in ways that look like flaky tests.

Every page runs at the popup's size, a 350x600 viewport (`playwright.config.ts`). A screen that
only works in a larger viewport is broken for users.

### CI shard timing

CI uses `node scripts/run-e2e-shard.mjs 1/6 --workers=1 --retries=1`. It asks Playwright for the
current file list, then distributes whole files using `e2e/timings.json`. This changes scheduling,
not coverage: new files get the median recorded duration, and deleted files are ignored. Tests
still use one worker per runner. Browser profiles have unique directories even when test titles
share a prefix.

Refresh the timing baseline after significant suite changes using a completed, successful full run:

```bash
gh run view RUN_ID --log > run.log
node scripts/update-e2e-timings.mjs run.log https://github.com/XCP/extension/actions/runs/RUN_ID
node --test scripts/e2e-shards.test.mjs
```

Review and commit the timing file. It is only a scheduling estimate; stale timings cannot remove
tests from a run. `node scripts/run-e2e-shard.mjs 1/6 --list` lists an individual shard.

## Principles

1. **Test user-visible behavior** - Test what users see, not implementation details
2. **Tests must be able to fail** - If a test can't fail, it's not testing anything
3. **Use web-first assertions** - Let Playwright handle waiting and retrying
4. **Prefer semantic locators** - Use `getByRole`, `getByLabel`, `getByText` over CSS selectors
5. **An approval test must complete the approval** - see below

## Fixtures

Import `test`, `walletTest` and `expect` from [`e2e/fixtures.ts`](fixtures.ts), never from
`@playwright/test` directly:

| Fixture | Gives you |
|---|---|
| `test` | `extensionContext`, `extensionPage` and `extensionId`: the extension loaded with no wallet, on the unlock or onboarding screen |
| `walletTest` | `context`, `page` and `extensionId`: a wallet already imported from `TEST_MNEMONIC` with `TEST_PASSWORD`, on the dashboard |
| `walletTest` + `browserLocale` | The same wallet in a Chromium launched with that UI language (`'ja'`, `'zh-CN'`, `'zh-TW'`, `'zh-HK'`); onboarding is driven with that locale's catalog text |

```typescript
import { walletTest, expect, navigateTo } from '../fixtures';

walletTest('opens settings from the footer', async ({ page }) => {
  await navigateTo(page, 'settings');
  await expect(page).toHaveURL(/settings/);
});
```

```typescript
import { walletTest, expect } from '../fixtures';

walletTest.use({ browserLocale: 'ja' });

walletTest('dashboard renders in Japanese', async ({ page }) => {
  // Look up expected text in public/_locales/ja/messages.json rather than hard-coding it.
});
```

`fixtures.ts` also exports helpers for the common flows (`createWallet`, `importMnemonic`,
`importPrivateKey`, `unlockWallet`, `lockWallet`, `navigateTo`, `getCurrentAddress`,
`grantClipboardPermissions`) and the test credentials (`TEST_PASSWORD`, `TEST_MNEMONIC`,
`TEST_PRIVATE_KEY`). Shared selectors are in [`e2e/selectors.ts`](selectors.ts), and test data in
[`e2e/test-data.ts`](test-data.ts). `sleep()` is deliberately not exported.

`walletTest` supplies fixed Bitcoin fee quotes (3, 2, and 1 sat/vB) so compose and navigation tests
do not depend on a live fee provider responding. Tests for other quotes or provider failures can
override the fee endpoint with `context.route` after the fixture is initialized.

## Approval tests

Browser approval tests must initialize the wallet fixture, require a successful decision and
result, and run with normal browser security enabled. Merely observing a popup or an error does
not demonstrate a working approval flow.

Two specs render every approval state as screenshots:

- [`tests/approval-gallery.spec.ts`](tests/approval-gallery.spec.ts): every provider approval, per
  Counterparty message type, for raw transactions and PSBTs, with optional locales
  (`XCP_GALLERY_LOCALE`) and the side panel (`XCP_GALLERY_SURFACE=sidepanel`).
- [`tests/marketplace-gallery.spec.ts`](tests/marketplace-gallery.spec.ts): marketplace intents,
  plain-Bitcoin payments, linked bundles, and the blocked and retry gates in front of them.

Both write to `test-results/` and accept `XCP_GALLERY_SCENARIOS` to run a subset. They also assert
layout: no horizontal overflow at 350 and 380px, fact labels on one line, the exception notice and
the signer's outcome in view before anything is expanded, and misleading text absent. How to read
the screenshots is in [ARCHITECTURE.md](../ARCHITECTURE.md#approval-screens).

## Other environments

- **Trezor**: `e2e/hardware/` runs against the Trezor emulator and is skipped unless
  `TREZOR_EMULATOR_AVAILABLE=1`. Hardware wallet pages need the side panel
  (`launchExtension(testId, { useSidepanel: true })`). Setup is in
  [CONTRIBUTING.md](../CONTRIBUTING.md#trezor-emulator).
- **Review versus ledger (regtest)**: `e2e/regtest/` composes each transaction type through the
  wallet's own compose, verification and review code, signs it with the production signer, mines it
  on regtest, and asserts that what the review states is what Counterparty Core's ledger records.
  Skipped unless `REGTEST=1`; see [below](#review-versus-ledger-regtest).
- **ZELD regtest**: `e2e/zeld/` holds Vitest proofs against Bitcoin Core and Counterparty Core on
  regtest, skipped unless `ZELD_REGTEST=1`. Setup is in
  [CONTRIBUTING.md](../CONTRIBUTING.md#zeld-regtest).

## Review versus ledger (regtest)

One stack, one command, then tear down:

```bash
docker compose -p xcp-regtest -f e2e/regtest/docker-compose.yml up -d

REGTEST=1 REGTEST_BITCOIND=http://127.0.0.1:28443 REGTEST_COUNTERPARTY=http://127.0.0.1:34000   npx vitest run e2e/regtest --no-file-parallelism

docker compose -p xcp-regtest -f e2e/regtest/docker-compose.yml down -v
```

The stack is Bitcoin Core 30 and Counterparty Core 11.4 (`e2e/regtest/docker-compose.yml`); set
`COUNTERPARTY_IMAGE` to run it against another Counterparty Core image, for instance an 11.5 build
for `review-taproot.test.ts`, which is skipped on a node older than 11.5. The
files share one chain, so they run one after another. A run takes about three minutes while Core
follows new blocks over ZMQ; when Core on regtest falls back to catching up block by block
("Previous block is missing" in its log) each block costs ten seconds or more and a run can take
fifteen. Without `REGTEST=1` every test is skipped, so `npx vitest run` and CI are unaffected.

What each file covers:

| File | Types | Address formats |
|------|-------|-----------------|
| `review-send.test.ts` | enhanced send, MPMA | send from and to all four; MPMA to all four |
| `review-dex.test.ts` | dispenser open, dispense (two dispensers, partial fill), close; order, match, cancel; BTC order and BTCPay | dispense from all four |
| `review-utxo.test.ts` | attach (both layouts), detach, move | attach from all four; detach and move from two each |
| `review-issuance.test.ts` | issuance, issue more, description, lock, transfer ownership, dividend, destroy, broadcast, sweep | P2WPKH, P2PKH, P2TR |
| `review-fairminter.test.ts` | fairminter, fairmint | fairmint from all four |
| `review-taproot.test.ts` | Taproot-encoded broadcast (data and ord envelopes), issuance, MPMA: the wallet signs Core 11.5's unsigned reveal with the source key | P2WPKH; P2TR closed by its internal key and by its output key |

How it works:

- `walletReview.ts` computes what the wallet shows. `composeAsWallet` follows
  `composer-context.tsx`'s compose step (normalize the form, compose, read the message back out of
  the bytes, rebuild or field-check it, bound the fee, account for every output, overlay the
  verified review params); `reviewPageFacts` reads the result the way each
  `pages/compose/.../review.tsx` does; `approvalReview` runs the approval path a site's request
  takes (`decodeTransactionForApproval`, `getTxActionInfo`), which carries the describer, the
  protocol context and the MPMA recipients.
- `ledger.ts` reads what Core recorded: the transaction's events (credits, debits, dispenses,
  attaches, moves), balances, assets, orders, dispensers and fairminters.
- `walletTransport.ts` is the only thing that differs from production. The wallet runs as the
  mainnet spelling of each throwaway key, as it does in production, and requests are translated to
  regtest spellings on the way to Core; Esplora reads and the Electrs lookup Core makes for a
  detach or move are answered from Bitcoin Core. Addresses are compared by script.
- A mismatch between the review and the ledger is a finding, not a flaky test: it is kept as
  `it.fails` with a `TODO(review-vs-ledger)` comment saying what differs and when to remove the
  marker. `grep -rn "TODO(review-vs-ledger)" e2e/regtest` lists them.

---

## Anti-Patterns to Avoid

### 1. Always-True Conditions (`|| true`)

```typescript
// ❌ BAD - This test ALWAYS passes, it tests nothing
expect(hasButton || true).toBe(true);
expect(hasSpinner || hasOptions || true).toBe(true);

// ✅ GOOD - Actually tests that the button exists
await expect(page.getByRole('button', { name: 'Submit' })).toBeVisible();
```

**Why it's bad:** The `|| true` makes the entire condition always evaluate to `true`. The test passes whether the element exists or not.

---

### 2. Tautologies (Always-True Logic)

```typescript
// ❌ BAD - A boolean is ALWAYS either true or false
expect(isVisible === true || isVisible === false).toBe(true);

// ✅ GOOD - Test the specific behavior you expect
await expect(element).toBeVisible();
// or
await expect(element).toBeHidden();
```

**Why it's bad:** This is logically equivalent to `expect(true).toBe(true)`. It can never fail.

---

### 3. Swallowing Errors with `.catch(() => false)`

```typescript
// ❌ BAD - Silently converts errors to false, then checks boolean
const isVisible = await button.isVisible({ timeout: 5000 }).catch(() => false);
expect(isVisible).toBe(true);

// ✅ GOOD - Web-first assertion with proper error messages
await expect(button).toBeVisible({ timeout: 5000 });
```

**Why it's bad:**
- Hides the real error message
- Makes debugging difficult
- The `isVisible()` check doesn't auto-wait properly

---

### 4. Manual Boolean Assertions

```typescript
// ❌ BAD - await is inside expect, no auto-waiting
expect(await page.getByText('welcome').isVisible()).toBe(true);

// ✅ GOOD - Web-first assertion, auto-waits and retries
await expect(page.getByText('welcome')).toBeVisible();
```

**Why it's bad:** `isVisible()` returns immediately without waiting. Web-first assertions like `toBeVisible()` automatically wait and retry.

---

### 5. Fragile CSS Class Selectors

```typescript
// ❌ BAD - Breaks when styling changes
page.locator('button.bg-green-500');
page.locator('.buttonIcon.episode-actions-later');

// ✅ GOOD - Semantic, resilient to styling changes
page.getByRole('button', { name: 'Add Wallet' });
page.getByLabel('Username');
page.getByTestId('submit-button');
```

**Why it's bad:** CSS classes are implementation details that change frequently. Semantic locators are more stable.

---

### 6. Overly Flexible Assertions

```typescript
// ❌ BAD - Accepts too many conditions, hard to know what's being tested
expect(hasError || hasLoading || hasContent || redirected).toBe(true);

// ✅ GOOD - Test one specific behavior
await expect(page.getByRole('alert')).toBeVisible();
// In a separate test:
await expect(page.getByText('Loading')).toBeVisible();
```

**Why it's bad:** When this test passes, you don't know which condition was true. When it fails, you don't know which was expected.

---

### 7. Using `waitForTimeout` for Synchronization

```typescript
// ❌ BAD - Arbitrary delays, slow and flaky
await page.waitForTimeout(2000);
await expect(element).toBeVisible();

// ✅ GOOD - Wait for specific conditions
await expect(element).toBeVisible({ timeout: 5000 });
await page.waitForURL(/dashboard/);
await page.waitForLoadState('networkidle');
```

**Why it's bad:** Arbitrary timeouts are either too short (flaky) or too long (slow). Wait for specific conditions instead.

---

## Quick Reference

| Instead of... | Use... |
|---------------|--------|
| `expect(x \|\| true).toBe(true)` | `await expect(element).toBeVisible()` |
| `isVisible().catch(() => false)` | `await expect(element).toBeVisible()` |
| `expect(await el.isVisible()).toBe(true)` | `await expect(el).toBeVisible()` |
| `page.locator('.css-class')` | `page.getByRole('button', { name: '...' })` |
| `page.waitForTimeout(2000)` | `await expect(el).toBeVisible()` |
| `expect(a \|\| b \|\| c).toBe(true)` | Separate tests for each case |

---

## Debugging Tips

1. **Use `--debug` flag**: `npx playwright test e2e/tests/<spec>.ts --debug`
2. **Use trace viewer**: `npx playwright test e2e/tests/<spec>.ts --trace on`
3. **Use `page.pause()`**: Pause test execution for debugging
4. **Read `test-results/`** before the next run: each run replaces it

---

## Resources

- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Locators Guide](https://playwright.dev/docs/locators)
- [Assertions Guide](https://playwright.dev/docs/test-assertions)
