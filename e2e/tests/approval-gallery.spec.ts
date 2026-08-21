/**
 * Screenshots every provider approval screen, one file per state.
 *
 * Not an assertion suite — it exists so the approval screens can be reviewed as a set after a
 * change, which otherwise means clicking through a dapp by hand and hitting whichever states your
 * balances happen to allow.
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
 */

import { Address, OutScript } from '@scure/btc-signer';
import * as fs from 'fs';
import * as path from 'path';
import { expect, walletTest } from '../fixtures';

const OUT_DIR = 'test-results/approval-gallery';


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
 * Value left to the signer as change. The input is a real 18,074-sat outpoint whose value the
 * screen resolves by lookup, so this must sit below it — change above the input yields a negative
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
 * A real attach has three outputs — OP_RETURN, the 546-sat carrier the assets attach to, and
 * change — and its payload targets vout 1, which is where the fixture's attach points. Without
 * the dedicated carrier the change output doubled as the attached UTXO, a shape no composer
 * produces. attach-bad-vout is deliberately absent: its payload must keep pointing past the end.
 */
const CARRIER_VALUE = 546;
const HAS_ATTACH_CARRIER = new Set(['attach']);

function rebuildForSigner(
  rawTxHex: string,
  changeAddress: string,
  payExternal = false,
  attachCarrier = false,
): string {
  const { txid, vout } = scenarioFixtures.input;
  const txidLe = txid.match(/../g)!.reverse().join('');
  const opReturnScript = opReturnScriptOf(rawTxHex);
  const changeScript = Buffer.from(OutScript.encode(Address().decode(changeAddress))).toString('hex');
  const extraCount = (payExternal ? 1 : 0) + (attachCarrier ? 1 : 0);
  const extraValue = (payExternal ? DISPENSE_PAYMENT_SATS : 0) + (attachCarrier ? CARRIER_VALUE : 0);

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
    ...(attachCarrier
      ? [le(CARRIER_VALUE, 8), le(changeScript.length / 2, 1), changeScript]
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
 * The prevout every fixture spends: a real outpoint of 18,074 sats paying the P2PKH address that
 * composed them. Encoded as PSBT_IN_WITNESS_UTXO (key 0x01) followed by the map terminator.
 */
function witnessUtxo(): string {
  const script = '76a9145c333992ab554e7573df3d2a412df750a60d1f5b88ac';
  const value = le(18_074, 8);
  const record = value + le(script.length / 2, 1) + script;
  return '01' + '01' + le(record.length / 2, 1) + record + '00';
}

function toPsbt(rawTxHex: string): string {
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
    witnessUtxo().repeat(inputCount),
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
const EXPECTED_WARNINGS: Record<string, RegExp[]> = {
  'sweep-blocked': [/blocked: sweep/i],
  destroy: [/supply destruction/i],
  // The fixture detaches to a foreign address, which genuinely deserves attention; a detach to
  // your own address is routine and raises nothing (its generic note is info-severity now).
  detach: [/detached to another address/i],
  // Paying the dispenser or the order-match counterparty is what those transactions are; the
  // movement rows state the payment and no warning or note fires on a correct one.
  'attach-bad-vout': [/attaches to an output that does not exist/i],
  'utxo-move-foreign-source': [/moves a utxo this transaction does not spend/i],
};

/** Every warning title the safety layer and the approval screens can raise. */
const ALL_WARNING_PATTERNS: RegExp[] = [
  /blocked: sweep/i,
  /supply destruction/i,
  /moves everything on the utxo/i,
  /detached to another address/i,
  /unknown transaction type/i,
  /unrecognized transaction/i,
  /btc sent to external address/i,
  /btc payment/i,
  /btc sent to an unrecognized script/i,
  /counterparty data outputs/i,
  /attaches to an output that does not exist/i,
  /moves a utxo this transaction does not spend/i,
  /attached assets leave your wallet/i,
  /attached assets move to your own output/i,
  /attached assets are detached/i,
  /spends utxos holding counterparty assets/i,
  /verification failed/i,
  /some amounts couldn.t be determined/i,
];

/** Which of the known warnings are actually on screen. */
async function warningsOn(page: import('@playwright/test').Page): Promise<RegExp[]> {
  const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  return ALL_WARNING_PATTERNS.filter((re) => re.test(body));
}

/**
 * Ledger answers for the states the live ledger cannot produce on demand. The fixture outpoint
 * carries no attached assets, the fake dispenser address runs no dispenser, and the pool test
 * assets do not exist — so detach showed no released balances, dispense no payouts, and pool
 * amounts fell back to the base-units caveat: states no real user of those flows would see.
 * These stubs answer only those specific lookups; every other request still hits the real API.
 */
async function installScenarioStubs(
  page: import('@playwright/test').Page,
  name: string
): Promise<void> {
  const fixtureOutpoint = `${scenarioFixtures.input.txid}:${scenarioFixtures.input.vout}`;
  if (name === 'detach') {
    await page.route(/\/v2\/utxos\//, (route) => {
      const match = new URL(route.request().url()).pathname.match(/\/v2\/utxos\/([^/]+)\/balances/);
      if (!match) return route.continue();
      const utxo = decodeURIComponent(match[1]!);
      return route.fulfill({
        json: {
          result: utxo === fixtureOutpoint
            ? [
                { asset: 'RAREPEPE', quantity: '1', quantity_normalized: '1', asset_info: { divisible: false, asset_longname: null } },
                { asset: 'PEPECASH', quantity: '50000000', quantity_normalized: '0.5', asset_info: { divisible: true, asset_longname: null } },
              ]
            : [],
          next_cursor: null,
          result_count: utxo === fixtureOutpoint ? 2 : 0,
        },
      });
    });
  }
  if (name === 'dispense') {
    await page.route(/\/dispensers/, (route) => route.fulfill({
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
    await page.route(/\/v2\/assets\/(A9542\d+|0)([/?]|$)/, (route) => {
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
    await page.route(/\/v2\/pools\//, (route) => route.fulfill({
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

  const review = approval.getByRole('button', { name: /^review$/i });
  if (await review.count()) {
    await review.click();
    await expect(approval.getByRole('button', { name: 'Back' })).toBeVisible({ timeout: 10_000 });
    for (const re of await warningsOn(approval)) shown.add(re);
    await approval.screenshot({ path: attentionShotPath, fullPage: true });
    await approval.getByRole('button', { name: 'Back' }).click();
  }

  return ALL_WARNING_PATTERNS.filter((re) => shown.has(re));
}

walletTest('captures every provider approval screen', async ({ context, page, extensionId }) => {
  walletTest.setTimeout(300_000);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const scenarios = Object.entries(scenarioFixtures.scenarios);

  // One record per signing request, in the shape `beginSignFlow` writes (`signFlow.ts`). Seeded
  // directly rather than through a dApp connection, so `requestKey` only has to be present — it
  // exists for rejoining a duplicate request, which this gallery never makes.
  const seed = async (id: string, rawTxHex: string) => {
    await page.evaluate(
      async (req) => {
        await chrome.storage.session.set({ pending_sign_flow: [req] });
      },
      {
        id,
        origin: 'https://launchpad.xcp.fun',
        timestamp: Date.now(),
        address: '',
        walletId: '',
        requestKey: `xcp_signTransaction:${id}`,
        kind: 'sign-transaction',
        status: 'pending',
        rawTxHex,
      }
    );
  };

  const openApproval = async (id: string, scenarioName?: string) => {
    await settle(SCREEN_SPACING_MS);
    const approval = await context.newPage();
    // Popup width, because the horizontal-overflow bugs this gallery exists to catch are width
    // bound. The height is not the popup's: the screen scrolls in an inner container, so fullPage
    // captures nothing below the fold and warnings and the recipient list were cut off. A tall
    // viewport puts the whole screen in one image.
    await approval.setViewportSize({ width: 380, height: 1400 });
    if (scenarioName) await installScenarioStubs(approval, scenarioName);
    await approval.goto(
      `chrome-extension://${extensionId}/popup.html#/requests/transaction/approve?requestId=${id}`
    );
    // The screen decodes and cross-checks before it can describe anything, so wait on the footer
    // rather than a fixed delay. A signable request with cautions labels the button Review.
    await expect(approval.getByRole('button', { name: /^(sign|review|blocked)$/i })).toBeVisible({ timeout: 60_000 });
    return approval;
  };

  // The signing address is derived after unlock and never written to storage, and the header
  // renders it CSS-truncated — so read it off a first render, where textContent holds it in full.
  await seed('gallery-probe', scenarios[0]![1].rawTxHex);
  const probe = await openApproval('gallery-probe');
  const signerAddress = (
    await probe
      .locator('p')
      .filter({ hasText: /^(bc1|tb1|[13])[a-zA-Z0-9]{25,}$/ })
      .first()
      .textContent()
  )?.trim();
  await probe.close();

  expect(signerAddress, 'signing address must be readable from the approval header').toBeTruthy();

  const captured: string[] = [];
  const warningMismatches: string[] = [];

  for (const [name, { rawTxHex }] of scenarios) {
    const id = `gallery-${name}`;
    await seed(id, rebuildForSigner(rawTxHex, signerAddress!, PAYS_EXTERNAL.has(name), HAS_ATTACH_CARRIER.has(name)));
    const approval = await openApproval(id, name);

    // Expanded, so inputs, outputs and the mpma recipient list are part of the captured state —
    // for a multi-destination send that panel is the only place the payees appear at all.
    // Exact match: warning copy also mentions 'the transaction details', which makes a loose
    // locator ambiguous on any screen that carries one.
    const details = approval.getByText(/^Transaction Details$/);
    await expect(details).toBeVisible({ timeout: 30_000 });
    await details.click();
    await expect(approval.getByText(/^Outputs \(/)).toBeVisible({ timeout: 10_000 });

    const shown = (
      await collectWarnings(approval, path.join(OUT_DIR, `${name}-attention.png`))
    ).map((re) => re.source).sort();
    const expected = (EXPECTED_WARNINGS[name] ?? []).map((re) => re.source).sort();
    if (JSON.stringify(shown) !== JSON.stringify(expected)) {
      warningMismatches.push(`${name}
    on screen: ${shown.join(', ') || '(none)'}
    expected:  ${expected.join(', ') || '(none)'}`);
    }

    await approval.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage: true });
    captured.push(name);
    await approval.close();
  }

  // The same payloads through the PSBT screen. It runs the same decode, comparator and describer,
  // so any divergence between the two screens is a drift bug rather than a design difference.
  for (const [name, { rawTxHex }] of scenarios) {
    const id = `gallery-psbt-${name}`;
    await page.evaluate(
      async (req) => {
        await chrome.storage.session.set({ pending_sign_flow: [req] });
      },
      {
        id,
        origin: 'https://launchpad.xcp.fun',
        timestamp: Date.now(),
        address: signerAddress!,
        walletId: '',
        requestKey: `xcp_signPsbt:${id}`,
        kind: 'sign-psbt',
        status: 'pending',
        psbtHex: toPsbt(rebuildForSigner(rawTxHex, signerAddress!, PAYS_EXTERNAL.has(name), HAS_ATTACH_CARRIER.has(name))),
      }
    );

    await settle(SCREEN_SPACING_MS);
    const approval = await context.newPage();
    await approval.setViewportSize({ width: 380, height: 1400 });
    await installScenarioStubs(approval, name);
    await approval.goto(
      `chrome-extension://${extensionId}/popup.html#/requests/psbt/approve?requestId=${id}`
    );
    await expect(approval.getByRole('button', { name: /^(sign|review|blocked)$/i })).toBeVisible({ timeout: 60_000 });

    // Expanded, for the same reason as above: the recipients list and the checks line live in
    // this panel, and they are precisely what was missing from this screen.
    const psbtDetails = approval.getByText(/^Transaction Details$/);
    await expect(psbtDetails).toBeVisible({ timeout: 30_000 });
    await psbtDetails.click();

    await approval.screenshot({ path: path.join(OUT_DIR, `psbt-${name}.png`), fullPage: true });
    await approval.close();
  }

  // Every warning is a claim about the user's money, so a spurious one is not cosmetic — it
  // teaches people that alarms are noise. Reviewing screenshots catches those only if somebody
  // looks at all fifty, every time. This fails the run instead, in both directions: an
  // unexpected warning and a warning that has silently stopped appearing.
  expect(warningMismatches, 'warnings did not match these scenarios').toEqual([]);

  expect(captured).toEqual(scenarios.map(([name]) => name));
  console.log(`\nApproval gallery: ${captured.length} screens in ${OUT_DIR}\n`);
});
