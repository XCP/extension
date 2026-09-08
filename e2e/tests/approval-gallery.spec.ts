import { captureApprovalSizes } from '../utils/approval-layout';
/**
 * Screenshots every provider approval screen, one file per state.
 *
 * Captures the approval screens as a set and asserts their warning states after a change, which
 * otherwise means clicking through a dapp by hand and hitting whichever states balances allow.
 *
 * Transactions are built here rather than composed. Half the interesting message types cannot be
 * composed on demand (cancel needs an open order, dividend needs to be the issuer, fairmint needs
 * a live fairminter), and composing makes the run depend on the source address's balances. The
 * payloads in e2e/fixtures/approval-scenarios.json were packed by this repo's own packer and
 * ARC4-obfuscated the way core does it; src/core/counterparty/pack/approvalFixtures.test.ts is
 * the round-trip guard that they still decode.
 *
 * The change output is rebuilt for the live test wallet on each run. The safety analyzer compares
 * outputs against the signing address, so a change output paying anyone else raises "BTC Sent to
 * External Address" on every screen and buries the state actually under review.
 *
 * Output: test-results/approval-gallery/*.png
 * Optional subset: XCP_GALLERY_SCENARIOS=attach,detach (both raw and PSBT variants).
 * Optional real wallet locale: XCP_GALLERY_LOCALE=ja (also zh-CN, zh-TW, zh-HK).
 * XCP_GALLERY_INCLUDE_RETRY=1 adds failed-asset-lookup/recovery captures for send-with-memo.
 * XCP_GALLERY_OUT_DIR can point at an artifact directory; locales use separate subdirectories.
 * XCP_GALLERY_SURFACE=sidepanel also checks the real sidepanel entrypoint at 350/380/520px.
 * XCP_GALLERY_FIXED_DATA=1 uses authored API/ledger/display fixtures for the seven localized
 * scenarios. It tests presentation and local checks, not parity with a live API response.
 */

import { Address, OutScript } from '@scure/btc-signer';
import * as fs from 'fs';
import * as path from 'path';
import { expect, walletTest } from '../fixtures';
import { approvalCatalog, approvalGalleryLocale, literalPattern } from '../utils/approval-locale';
import { type ApprovalLocalizationFixtureAudit, installApprovalLocalizationFixtures } from '../utils/approval-localization-fixtures';
import { assertGalleryWorkerRouting, authorizeGalleryOrigin, callGalleryService, createGalleryApi, type GalleryApi, selectGalleryScenarios } from '../utils/provider-gallery';

const LOCALE = approvalGalleryLocale();
const message = approvalCatalog(LOCALE);
const SURFACE = process.env.XCP_GALLERY_SURFACE ?? 'popup';
const FIXED_DATA = process.env.XCP_GALLERY_FIXED_DATA === '1';
if (!['popup', 'sidepanel'].includes(SURFACE)) throw new Error(`Unsupported approval gallery surface: ${SURFACE}`);
const OUT_DIR = path.join(process.env.XCP_GALLERY_OUT_DIR ?? 'test-results/approval-gallery', ...(LOCALE === 'en' ? [] : [LOCALE]), ...(SURFACE === 'sidepanel' ? ['sidepanel'] : []));
const ORIGIN = 'https://launchpad.xcp.fun';


/**
 * Pause between screens.
 *
 * Each approval makes several API calls — unpack, asset info, one prevout lookup per input — so
 * fifty screens is a few hundred requests against shared public infrastructure. A rate-limited
 * screen does not fail: the decode returns nothing and the approval quietly renders its local-only
 * fallback, so the gallery would show states no user encounters and hide the ones they do.
 *
 * Two seconds, deliberately unsubtle. Earlier attempts used 350ms, which is not waiting. This is a
 * review tool run on demand; a slow gallery costs a few minutes, a throttled one costs a wrong
 * picture of the product.
 */
const SCREEN_SPACING_MS = 2_000;
const settle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const scenarioFixtures = JSON.parse(
  fs.readFileSync('e2e/fixtures/approval-scenarios.json', 'utf8')
) as { input: { txid: string; vout: number }; scenarios: Record<string, { rawTxHex: string }> };

/**
 * Value left to the signer as change. The mocked input is 18,074 sats, whose value the screen
 * resolves by lookup, so this must sit below it — change above the input yields a negative
 * fee, which is what the screens showed while this was set too high.
 */
const CHANGE_VALUE = 17_500;

/**
 * Little-endian encode. BigInt, not `>>`: JS bitwise operators are 32-bit, so shifting past byte 3
 * wraps the shift count and repeats the low bytes. An 8-byte output value of 58,448 came out as
 * 0x0000e4500000e450 — the approval screen showed 2,510,322 BTC and a negative fee.
 */
const le = (value: number, bytes: number): string => {
  let hex = '';
  let remaining = BigInt(value);
  for (let i = 0; i < bytes; i += 1) {
    hex += (remaining & 0xffn).toString(16).padStart(2, '0');
    remaining >>= 8n;
  }
  return hex;
};

/** Read the OP_RETURN script out of a fixture, which is output 0 of a two-output transaction. */
function opReturnScriptOf(rawTxHex: string): string {
  let cursor = 8; // version
  const inputCount = parseInt(rawTxHex.slice(cursor, cursor + 2), 16);
  cursor += 2;
  for (let i = 0; i < inputCount; i += 1) {
    cursor += 64 + 8; // outpoint
    const scriptLen = parseInt(rawTxHex.slice(cursor, cursor + 2), 16);
    cursor += 2 + scriptLen * 2 + 8; // scriptSig + sequence
  }
  cursor += 2; // output count
  cursor += 16; // value
  const scriptLen = parseInt(rawTxHex.slice(cursor, cursor + 2), 16);
  cursor += 2;
  return rawTxHex.slice(cursor, cursor + scriptLen * 2);
}

/** Rebuild a fixture so its change output pays `changeAddress`, leaving the payload untouched. */
/**
 * The external party a `dispense` or `btcpay` pays. Real dispenses send BTC to the dispenser's
 * address, and a real BTCPay sends it to the order-match counterparty — without that output the
 * screen shows a payment type that pays nobody, a state no user encounters.
 */
const DISPENSER_ADDRESS_SCRIPT = '76a914' + '11'.repeat(20) + '88ac';
const DISPENSE_PAYMENT_SATS = 10_000;
const PAYS_EXTERNAL = new Set(['dispense', 'btcpay']);
/**
 * A real attach has three outputs — OP_RETURN, the 546-sat asset UTXO the assets attach to, and
 * change — and its payload targets vout 1, which is where the fixture's attach points. Without
 * the dedicated asset UTXO the change output doubled as the attached UTXO, a shape no composer
 * produces. attach-bad-vout is deliberately absent: its payload must keep pointing past the end.
 */
const ASSET_UTXO_VALUE = 546;
const HAS_ATTACH_UTXO = new Set(['attach']);

function rebuildForSigner(
  rawTxHex: string,
  changeAddress: string,
  payExternal = false,
  attachUtxo = false,
): string {
  const { txid, vout } = scenarioFixtures.input;
  const txidLe = txid.match(/../g)!.reverse().join('');
  const opReturnScript = opReturnScriptOf(rawTxHex);
  const changeScript = Buffer.from(OutScript.encode(Address().decode(changeAddress))).toString('hex');
  const extraCount = (payExternal ? 1 : 0) + (attachUtxo ? 1 : 0);
  const extraValue = (payExternal ? DISPENSE_PAYMENT_SATS : 0) + (attachUtxo ? ASSET_UTXO_VALUE : 0);

  return [
    le(2, 4),
    '01',
    txidLe,
    le(vout, 4),
    '00',
    'ffffffff',
    le(2 + extraCount, 1),
    le(0, 8), le(opReturnScript.length / 2, 1), opReturnScript,
    ...(payExternal
      ? [le(DISPENSE_PAYMENT_SATS, 8), le(DISPENSER_ADDRESS_SCRIPT.length / 2, 1), DISPENSER_ADDRESS_SCRIPT]
      : []),
    ...(attachUtxo
      ? [le(ASSET_UTXO_VALUE, 8), le(changeScript.length / 2, 1), changeScript]
      : []),
    le(CHANGE_VALUE - extraValue, 8),
    le(changeScript.length / 2, 1), changeScript,
    le(0, 4),
  ].join('');
}


/**
 * Wrap an unsigned transaction in a minimal PSBT v0 envelope.
 *
 * The PSBT approval screen reads the same Counterparty payloads as the raw-transaction screen, so
 * the same fixtures exercise it — but until now nothing captured that screen, and a change to it
 * (the recipients list, the structural warnings) shipped unseen. Which is the situation this
 * gallery exists to prevent.
 *
 * Layout: magic, then a global map holding the unsigned transaction under key 0x00, then one empty
 * map per input and per output. The fixtures already carry empty scriptSigs, which is what a PSBT
 * requires of its unsigned transaction.
 */

/**
 * The same fabricated signer-owned 18,074-sat prevout supplied to the raw decoder's network
 * lookup. Encoded as PSBT_IN_WITNESS_UTXO (key 0x01) followed by the map terminator.
 */
function witnessUtxo(signerAddress: string): string {
  const script = Buffer.from(OutScript.encode(Address().decode(signerAddress))).toString('hex');
  const value = le(18_074, 8);
  const record = value + le(script.length / 2, 1) + script;
  return '01' + '01' + le(record.length / 2, 1) + record + '00';
}

function toPsbt(rawTxHex: string, signerAddress: string): string {
  const bytes = rawTxHex.length / 2;
  const varint = (n: number): string => {
    if (n < 0xfd) return le(n, 1);
    if (n <= 0xffff) return 'fd' + le(n, 2);
    return 'fe' + le(n, 4);
  };

  // One input and two outputs in every fixture; read them back rather than assuming.
  let cursor = 8;
  const inputCount = parseInt(rawTxHex.slice(cursor, cursor + 2), 16);
  cursor += 2;
  for (let i = 0; i < inputCount; i += 1) {
    cursor += 64 + 8;
    const scriptLen = parseInt(rawTxHex.slice(cursor, cursor + 2), 16);
    cursor += 2 + scriptLen * 2 + 8;
  }
  const outputCount = parseInt(rawTxHex.slice(cursor, cursor + 2), 16);

  return [
    '70736274ff',                      // magic + separator
    '01', '00',                        // key length 1, key type 0x00 (unsigned tx)
    varint(bytes), rawTxHex,           // value
    '00',                              // end of global map
    // A witness_utxo per input, carrying the prevout's value and script. Without it the PSBT
    // screen cannot know what the inputs are worth and says "some amounts couldn't be determined"
    // — on every screenshot. That is an artifact of a hand-built envelope, not of the product:
    // real PSBTs from the integrator carry these records. Omitting them made all 25 PSBT
    // screenshots show a warning a user would not see.
    witnessUtxo(signerAddress).repeat(inputCount),
    '00'.repeat(outputCount),          // one empty map per output
  ].join('');
}


/**
 * The warnings each scenario is expected to raise, by the phrase that identifies them.
 *
 * A warning is a claim about the user's money, so a spurious one is not cosmetic — it teaches
 * people that alarms are noise. Reviewing screenshots catches those only if somebody looks at all
 * of them, every time. This table means an unexpected warning fails the run and a warning that
 * silently stops appearing does too.
 *
 * Scenarios absent from this table are expected to raise nothing at all.
 */
const WARNINGS = {
  sweep: literalPattern(message('safety_blocked_sweep_transaction')),
  destroy: literalPattern(message('safety_danger_supply_destruction')),
  detach: literalPattern(message('approval_approval_warnings_assets_are_detached_to_another')),
  attach: literalPattern(message('approval_structure_attach_missing_output_title')),
  move: literalPattern(message('approval_structure_utxo_source_not_spent_title')),
};
const EXPECTED_WARNINGS: Record<string, RegExp[]> = {
  'sweep-blocked': [WARNINGS.sweep],
  destroy: [WARNINGS.destroy],
  // The fixture detaches to a foreign address, which genuinely deserves attention; a detach to
  // your own address is routine and raises nothing (its generic note is info-severity now).
  detach: [WARNINGS.detach],
  // Paying the dispenser or the order-match counterparty is what those transactions are; the
  // movement rows state the payment and no warning or note fires on a correct one.
  'attach-bad-vout': [WARNINGS.attach],
  'utxo-move-foreign-source': [WARNINGS.move],
};

/** Every warning title the safety layer and the approval screens can raise. */
const ALL_WARNING_PATTERNS: RegExp[] = [
  ...Object.values(WARNINGS),
  ...[
    'safety_moves_everything_on_the_utxo',
    'safety_unknown_transaction_type',
    'safety_unrecognized_transaction',
    'safety_btc_sent_to_external_address',
    'safety_btc_payment',
    'safety_btc_sent_to_an_unrecognized_script',
    'safety_counterparty_data_outputs',
    'approval_approval_warnings_attached_assets_leave_your_wallet',
    'approval_approval_warnings_attached_assets_move_to_your',
    'approval_approval_warnings_attached_assets_are_detached_to',
    'approval_approval_warnings_spends_utxos_holding_counterparty_assets',
    'tx_verification_status_verification_failed_signing_blocked',
    'approval_money_movement_view_some_amounts_couldn_t_be',
  ].map(key => literalPattern(message(key))),
];

/** Which of the known warnings are actually on screen. */
async function warningsOn(page: import('@playwright/test').Page): Promise<RegExp[]> {
  const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  return ALL_WARNING_PATTERNS.filter((re) => re.test(body));
}

/** Consequential facts must survive both approval presentation paths. */
async function assertScenarioFacts(page: import('@playwright/test').Page, name: string): Promise<void> {
  if (FIXED_DATA && name === 'order') {
    await expect(page.getByText('0.00001000 PEPECASH', { exact: true })).toBeVisible();
    await expect(page.getByText(message('approval_order_card_price_unavailable'), { exact: true })).toHaveCount(0);
  }
  if (FIXED_DATA && name === 'destroy') {
    await expect(page.getByText(message('tx_action_destroy_amount', ['1', 'BONPARTY']), { exact: true })).toBeVisible();
  }
  if (name === 'dividend') {
    await expect(page.getByText(message('tx_action_per_unit', ['0.00000001', 'XCP']), { exact: true })).toBeVisible();
    // Supply and total holders cannot prove the actual payout or fee: Core excludes the signer
    // and truncates each eligible holder independently. Do not present those estimates as facts.
    await expect(page.getByText('Total dividend', { exact: true })).toHaveCount(0);
    await expect(page.getByText(message('tx_action_xcp_fee'), { exact: true })).toHaveCount(0);
    return;
  }
  if (name !== 'send-with-memo') return;
  const memo = page.locator('dl > div').filter({ has: page.locator('dt').filter({ hasText: new RegExp(`^${literalPattern(message('common_memo')).source}$`) }) });
  await expect(memo.locator('dd')).toHaveText('invoice 42');
  await expect(memo.locator('dd')).toBeVisible();
}

/** Inspect the expanded evidence too; a collapsed title cannot prove the outpoint fits. */
async function captureStructureEvidence(page: import('@playwright/test').Page, name: string, captureName: string) {
  if (!['attach-bad-vout', 'utxo-move-foreign-source'].includes(name)) return;
  const notice = page.getByTestId('approval-notice');
  await notice.getByRole('button', { name: message('approval_approval_notice_why_signing_is_unavailable'), exact: true }).click();
  // These exact values are encoded in the committed fixture payloads, not supplied by the API.
  const description = name === 'attach-bad-vout'
    ? message('approval_structure_attach_missing_output_many', ['9', '2'])
    : message('approval_structure_utxo_source_not_spent_description', [`${'f'.repeat(64)}:7`]);
  await expect(notice.getByText(description, { exact: true })).toBeVisible();
  for (const width of [350, 380]) {
    await page.setViewportSize({ width, height: 1400 });
    expect(await notice.evaluate(element => element.scrollWidth <= element.clientWidth),
      `${captureName}: full diagnostic evidence overflows at ${width}px`).toBe(true);
    await page.screenshot({ path: path.join(OUT_DIR, `${captureName}-evidence-${width}.png`), fullPage: true });
  }
}

/**
 * Ledger answers for the states the live ledger cannot produce on demand. The fixture outpoint
 * carries no attached assets, the fake dispenser address runs no dispenser, and the pool test
 * assets do not exist — so detach showed no released balances, dispense no payouts, and pool
 * amounts fell back to the base-units caveat: states no real user of those flows would see.
 * These stubs answer only those specific lookups; every other request still hits the real API.
 */
async function installScenarioStubs(
  api: GalleryApi,
  name: string,
  signerAddress: string,
): Promise<void> {
  const fixtureOutpoint = `${scenarioFixtures.input.txid}:${scenarioFixtures.input.vout}`;
  // Both raw and PSBT screenshots describe a fabricated signer-owned 18,074-sat input. Its
  // outpoint stays fixed because it is also the fixture payload's ARC4 key; these never sign.
  await api.route(new RegExp(`/api/tx/${scenarioFixtures.input.txid}$`), route => route.fulfill({
    json: { vout: Array.from({ length: scenarioFixtures.input.vout + 1 }, () => ({
      value: 18_074, scriptpubkey_address: signerAddress,
    })) },
  }));
  await api.route(/\/v2\/utxos\//, (route) => {
    const match = new URL(route.request().url()).pathname.match(/\/v2\/utxos\/([^/]+)\/balances/);
    if (!match) return route.fallback();
    const utxo = decodeURIComponent(match[1]!);
    return route.fulfill({
      json: {
        result: name === 'detach' && utxo === fixtureOutpoint
          ? [
              { asset: 'RAREPEPE', quantity: '1', quantity_normalized: '1', asset_info: { divisible: false, asset_longname: null } },
              { asset: 'PEPECASH', quantity: '50000000', quantity_normalized: '0.5', asset_info: { divisible: true, asset_longname: null } },
            ]
          : [],
        next_cursor: null,
        result_count: name === 'detach' && utxo === fixtureOutpoint ? 2 : 0,
      },
    });
  });
  if (name === 'dividend') {
    // Fixed ledger facts keep this fixture independent of API availability. Even with supply
    // and holder count available, neither proves the actual total payable by this signer.
    await api.route(/\/v2\/assets\/BONPARTY(?:\/holders)?(?:[/?]|$)/, route => route.fulfill({
      json: new URL(route.request().url()).pathname.endsWith('/holders')
        ? { result: [], result_count: 15 }
        : { result: { asset: 'BONPARTY', divisible: false, asset_longname: null, supply: 1779, supply_normalized: '1779' } },
    }));
  }
  if (name === 'dispense') {
    await api.route(/\/dispensers/, (route) => route.fulfill({
      json: {
        result: [{
          asset: 'BAMBOU',
          status: 0,
          satoshirate: 1000,
          give_quantity: 100000000,
          give_remaining: 2000000000,
          give_quantity_normalized: '1',
          asset_info: { divisible: true, asset_longname: null },
        }],
        next_cursor: null,
        result_count: 1,
      },
    }));
  }
  if (name.startsWith('pool-')) {
    // The unpack endpoint names an asset its ledger cannot resolve as the literal 0, and the
    // divisibility enrichment then looks THAT up — so the stub answers both spellings.
    await api.route(/\/v2\/assets\/(A9542\d+|0)([/?]|$)/, (route) => {
      const match = new URL(route.request().url()).pathname.match(/\/v2\/assets\/([^/?]+)/);
      return route.fulfill({
        json: {
          result: {
            asset: decodeURIComponent(match?.[1] ?? ''),
            divisible: true,
            asset_longname: null,
            supply: 10_000_000_000,
            supply_normalized: '100',
          },
        },
      });
    });
    await api.route(/\/v2\/pools\//, (route) => route.fulfill({
      json: {
        result: {
          asset_a: 'XCP',
          asset_b: 'A95428957068369062',
          lp_asset: 'A95428957068369099',
          reserve_a: 0,
          reserve_b: 0,
          fee_bps: 50,
        },
      },
    }));
  }
}

/**
 * The approval spreads its statements over two surfaces now: blocking warnings render on the
 * main screen, and signable cautions wait on the attention screen behind the Review button. A
 * scan of the main screen alone would call a deliberately deferred caution "missing", so open
 * the attention screen too, scan both, and capture it alongside the main screenshot.
 */
async function collectWarnings(
  approval: import('@playwright/test').Page,
  attentionShotPath: string
): Promise<RegExp[]> {
  const shown = new Set(await warningsOn(approval));

  const review = approval.getByRole('button', { name: message('approval_review'), exact: true });
  if (await review.count()) {
    await review.click();
    await expect(approval.getByRole('button', { name: message('common_back'), exact: true })).toBeVisible({ timeout: 10_000 });
    for (const re of await warningsOn(approval)) shown.add(re);
    for (const width of SURFACE === 'sidepanel' ? [350, 380, 520] : [350, 380]) {
      await approval.setViewportSize({ width, height: 600 });
      const dialog = approval.getByRole('dialog');
      expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth),
        `attention screen overflows at ${width}px`).toBe(true);
      await expect(dialog.getByRole('button', { name: message('common_back'), exact: true })).toBeInViewport({ ratio: 1 });
      await expect(dialog.getByRole('button').last()).toBeInViewport({ ratio: 1 });
      await approval.screenshot({ path: attentionShotPath.replace(/\.png$/, `-${width}.png`) });
    }
    await approval.setViewportSize({ width: 380, height: 1400 });
    await approval.screenshot({ path: attentionShotPath, fullPage: true });
    await approval.getByRole('button', { name: message('common_back'), exact: true }).click();
  }

  return ALL_WARNING_PATTERNS.filter((re) => shown.has(re));
}

walletTest('captures every provider approval screen', async ({ context, page, extensionId }) => {
  walletTest.setTimeout(300_000);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const scenarios = selectGalleryScenarios(Object.entries(scenarioFixtures.scenarios), ([name]) => name);
  const includeRetry = process.env.XCP_GALLERY_INCLUDE_RETRY === '1';
  if (includeRetry && !scenarios.some(([name]) => name === 'send-with-memo')) {
    throw new Error('XCP_GALLERY_INCLUDE_RETRY requires send-with-memo in the selected scenarios');
  }
  const identity = await authorizeGalleryOrigin(page, ORIGIN);
  const signerAddress = identity.address;
  await assertGalleryWorkerRouting(context, extensionId);
  await callGalleryService(page, 'updateSettings', [{ language: LOCALE }]);
  await expect(page.locator('html')).toHaveAttribute('lang', LOCALE);
  const finalAction = (approval: import('@playwright/test').Page) => approval.getByRole('button', {
    name: new RegExp(`^(?:${['common_sign_transaction', 'approval_review', 'approval_blocked', 'common_awaiting_verification'].map(key => literalPattern(message(key)).source).join('|')})$`),
  });

  // One record per signing request, in the shape `beginSignFlow` writes (`signFlow.ts`). Seeded
  // directly after granting the origin through WalletService. `requestKey` exists for rejoining
  // a duplicate request, which this gallery never makes; identity and grants are real.
  const seed = async (id: string, rawTxHex: string) => {
    await page.evaluate(
      async (req) => {
        await chrome.storage.session.set({ pending_sign_flow: [req] });
      },
      {
        id,
        origin: ORIGIN,
        timestamp: Date.now(),
        ...identity,
        requestKey: `xcp_signTransaction:${id}`,
        kind: 'sign-transaction',
        status: 'pending',
        rawTxHex,
      }
    );
  };

  const openApproval = async (id: string) => {
    await settle(SCREEN_SPACING_MS);
    const approval = await context.newPage();
    // Popup width, because the horizontal-overflow bugs this gallery exists to catch are width
    // bound. The height is not the popup's: the screen scrolls in an inner container, so fullPage
    // captures nothing below the fold and warnings and the recipient list were cut off. A tall
    // viewport puts the whole screen in one image.
    await approval.setViewportSize({ width: 380, height: 1400 });
    await approval.goto(
      `chrome-extension://${extensionId}/${SURFACE}.html#/requests/transaction/approve?requestId=${id}`
    );
    // The screen decodes and cross-checks before it can describe anything, so wait on the footer
    // rather than a fixed delay. A signable request with cautions labels the button Review.
    await expect(approval.locator('html')).toHaveAttribute('lang', LOCALE);
    await expect(finalAction(approval)).toBeVisible({ timeout: 60_000 });
    const heading = approval.getByRole('banner').getByRole('heading');
    expect(await heading.evaluate(element => element.scrollWidth <= element.clientWidth), 'approval title must fit').toBe(true);
    return approval;
  };

  const captured: string[] = [];
  const warningMismatches: string[] = [];
  const fixtureAudits: ApprovalLocalizationFixtureAudit[] = [];

  for (const [name, { rawTxHex }] of scenarios) {
    await walletTest.step('Capture transaction approval', async () => {
      const id = `gallery-${name}`;
      const api = await createGalleryApi(context, page, id);
      await installScenarioStubs(api, name, signerAddress);
      if (FIXED_DATA) fixtureAudits.push(await installApprovalLocalizationFixtures(api, name));
      let unavailable = includeRetry && name === 'send-with-memo';
      if (unavailable) {
        await api.route(/\/v2\/utxos\/[^/]+\/balances/, route => unavailable
          ? route.fulfill({ status: 503, json: { error: 'Fixture asset status unavailable' } })
          : route.fallback());
      }
      await seed(id, rebuildForSigner(rawTxHex, signerAddress, PAYS_EXTERNAL.has(name), HAS_ATTACH_UTXO.has(name)));
      const approval = await openApproval(id);
      if (unavailable) {
        await expect(finalAction(approval)).toBeDisabled();
        await expect(approval.getByText(message('approval_approval_warnings_couldn_t_verify_asset_status'), { exact: true })).toBeVisible();
        await captureApprovalSizes(approval, OUT_DIR, `${name}-retry`, message('approval_review'));
        unavailable = false;
        await approval.getByRole('button', { name: message('common_retry_verification'), exact: true }).click();
        await expect(finalAction(approval)).toBeEnabled({ timeout: 60_000 });
        await expect(approval.getByText(message('approval_approval_warnings_couldn_t_verify_asset_status'), { exact: true })).toHaveCount(0);
        await captureApprovalSizes(approval, OUT_DIR, `${name}-retry-recovered`, message('approval_review'));
      }
      if (['sweep-blocked', 'attach-bad-vout', 'utxo-move-foreign-source'].includes(name)) {
        await expect(finalAction(approval)).toBeDisabled();
        await expect(finalAction(approval)).toHaveText(message('approval_blocked'));
      }
      await assertScenarioFacts(approval, name);
      await captureApprovalSizes(approval, OUT_DIR, name, message('approval_review'));
      await captureStructureEvidence(approval, name, name);

      // Expanded, so inputs, outputs and the mpma recipient list are part of the captured state —
      // for a multi-destination send that panel is the only place the payees appear at all.
      // Exact match: warning copy also mentions 'the transaction details', which makes a loose
      // locator ambiguous on any screen that carries one.
      const details = approval.getByText(message('common_transaction'), { exact: true });
      await expect(details).toBeVisible({ timeout: 30_000 });
      await details.click();
      const outputHeading = literalPattern(message('approval_approval_transaction_details_outputs')).source.replace('\\$1', '\\d+');
      await expect(approval.getByText(new RegExp(`^${outputHeading}$`))).toBeVisible({ timeout: 10_000 });

      const shown = (
        await collectWarnings(approval, path.join(OUT_DIR, `${name}-attention.png`))
      ).map((re) => re.source).sort((a, b) => a.localeCompare(b));
      const expected = (EXPECTED_WARNINGS[name] ?? [])
        .map((re) => re.source)
        .sort((a, b) => a.localeCompare(b));
      if (JSON.stringify(shown) !== JSON.stringify(expected)) {
        warningMismatches.push(`${name}
      on screen: ${shown.join(', ') || '(none)'}
      expected:  ${expected.join(', ') || '(none)'}`);
      }

      await approval.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage: true });
      captured.push(name);
      await approval.close();
      await api.dispose();
    }, { subtitle: name, params: { scenario: name, requestType: 'transaction' } });
  }

  // The same payloads through the PSBT screen. It runs the same decode, comparator and describer,
  // so any divergence between the two screens is a drift bug rather than a design difference.
  for (const [name, { rawTxHex }] of scenarios) {
    await walletTest.step('Capture PSBT approval', async () => {
      const id = `gallery-psbt-${name}`;
      const api = await createGalleryApi(context, page, id);
      await installScenarioStubs(api, name, signerAddress);
      if (FIXED_DATA) fixtureAudits.push(await installApprovalLocalizationFixtures(api, name));
      await page.evaluate(
        async (req) => {
          await chrome.storage.session.set({ pending_sign_flow: [req] });
        },
        {
          id,
          origin: ORIGIN,
          timestamp: Date.now(),
          ...identity,
          requestKey: `xcp_signPsbt:${id}`,
          kind: 'sign-psbt',
          status: 'pending',
          psbtHex: toPsbt(rebuildForSigner(rawTxHex, signerAddress, PAYS_EXTERNAL.has(name), HAS_ATTACH_UTXO.has(name)), signerAddress),
        }
      );

      await settle(SCREEN_SPACING_MS);
      const approval = await context.newPage();
      await approval.setViewportSize({ width: 380, height: 1400 });
      await approval.goto(
        `chrome-extension://${extensionId}/${SURFACE}.html#/requests/psbt/approve?requestId=${id}`
      );
      await expect(approval.locator('html')).toHaveAttribute('lang', LOCALE);
      await expect(finalAction(approval)).toBeVisible({ timeout: 60_000 });
      if (['sweep-blocked', 'attach-bad-vout', 'utxo-move-foreign-source'].includes(name)) {
        await expect(finalAction(approval)).toBeDisabled();
        await expect(finalAction(approval)).toHaveText(message('approval_blocked'));
      }

      await assertScenarioFacts(approval, name);
      await captureApprovalSizes(approval, OUT_DIR, `psbt-${name}`, message('approval_review'));
      await captureStructureEvidence(approval, name, `psbt-${name}`);

      // Expanded, for the same reason as above: the recipients list and the checks line live in
      // this panel, and they are precisely what was missing from this screen.
      const psbtDetails = approval.getByText(message('common_transaction'), { exact: true });
      await expect(psbtDetails).toBeVisible({ timeout: 30_000 });
      await psbtDetails.click();

      await approval.screenshot({ path: path.join(OUT_DIR, `psbt-${name}.png`), fullPage: true });
      await approval.close();
      await api.dispose();
    }, { subtitle: name, params: { scenario: name, requestType: 'psbt' } });
  }

  // Every warning is a claim about the user's money, so a spurious one is not cosmetic — it
  // teaches people that alarms are noise. Reviewing screenshots catches those only if somebody
  // looks at all fifty, every time. This fails the run instead, in both directions: an
  // unexpected warning and a warning that has silently stopped appearing.
  expect(warningMismatches, 'warnings did not match these scenarios').toEqual([]);

  expect(captured).toEqual(scenarios.map(([name]) => name));
  if (FIXED_DATA) {
    expect(fixtureAudits.every(audit => audit.installed), 'each selected scenario needs explicit metadata').toBe(true);
    expect(fixtureAudits.flatMap(audit => audit.unfixtureMetadataReads), 'unexpected metadata must not be assumed divisible').toEqual([]);
    expect(fixtureAudits.flatMap(audit => audit.unconfiguredQuoteReads), 'foreground quotes must use the configured Counterparty node').toEqual([]);
    if (scenarios.some(([name]) => name === 'order')) {
      expect(fixtureAudits.flatMap(audit => audit.fixtureReads).filter(read => read.startsWith('quote:')).length,
        'raw and PSBT order screens must fetch their price estimate').toBeGreaterThanOrEqual(2);
    }
    expect(fixtureAudits.flatMap(audit => audit.unexpectedPayloadReads), 'changed payloads must not receive a fabricated response').toEqual([]);
    expect(fixtureAudits.flatMap(audit => audit.upstreamUnpackReads), 'fixed localization cases must not call live unpack').toEqual([]);
    expect(fixtureAudits.every(audit => audit.mockedUnpackReads.length > 0), 'each variant must exercise the API-shaped fixture').toBe(true);
    console.log(`Fixture reads: ${fixtureAudits.reduce((n, audit) => n + audit.fixtureReads.length, 0)}; mocked unpack reads: ${fixtureAudits.reduce((n, audit) => n + audit.mockedUnpackReads.length, 0)}; live unpack reads: 0`);
  }
  console.log(`\nApproval gallery: ${captured.length * 2} transaction and PSBT screens in ${OUT_DIR}\n`);
});
