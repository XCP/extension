import { captureApprovalSizes } from '../utils/approval-layout';
/**
 * Screenshots every marketplace / provider-safety approval screen the 0.9 work added, one file
 * per state — the companion to approval-gallery.spec.ts for the surfaces that gallery cannot
 * reach: proof-based marketplace intents (prepare asset, attach-for-listing, create listing, buy, exact offers,
 * bulk fan-out), the plain-Bitcoin payment capability, the linked-PSBT bundle screen, and the
 * blocked / retry gates in front of them.
 *
 * The proof analyzer independently re-derives every claim from PSBT bytes, prevouts, and UTXO
 * balance lookups — so reaching a "proved" state needs transactions whose bytes actually prove
 * out. The PSBTs here are built from scratch around the live test wallet's address, with real
 * Counterparty payloads (packed and ARC4-obfuscated the way core does), and the balance lookups
 * for their fabricated outpoints are answered by a route stub, since no real ledger has ever
 * seen these outpoints. Everything else still runs the real code path: the same decoder, the
 * same analyzer, the same screens.
 *
 * Output: test-results/marketplace-gallery/*.png
 * Optional subset: XCP_GALLERY_SCENARIOS=listing-create-proved,listing-create-retry.
 */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Page, Route } from '@playwright/test';
import { Address, OutScript } from '@scure/btc-signer';
import { expect, navigateTo, walletTest } from '../fixtures';
import { settings } from '../selectors';
import { ADDRESS_TYPE_DISPLAY_NAMES, type AddressType } from '../test-data';
import { assertGalleryWorkerRouting, authorizeGalleryOrigin, createGalleryApi, type GalleryApi, selectGalleryScenarios } from '../utils/provider-gallery';

const OUT_DIR = 'test-results/marketplace-gallery';

// ---------------------------------------------------------------------------------------------
// Byte-level builders
// ---------------------------------------------------------------------------------------------

const le = (value: number | bigint, bytes: number): string => {
  let hex = '';
  let remaining = BigInt(value);
  for (let i = 0; i < bytes; i += 1) {
    hex += (remaining & 0xffn).toString(16).padStart(2, '0');
    remaining >>= 8n;
  }
  return hex;
};

const varint = (n: number): string => {
  if (n < 0xfd) return le(n, 1);
  if (n <= 0xffff) return 'fd' + le(n, 2);
  return 'fe' + le(n, 4);
};

const sha256d = (hex: string): Buffer => {
  const first = createHash('sha256').update(Buffer.from(hex, 'hex')).digest();
  return createHash('sha256').update(first).digest();
};

/** Display-order txid of a raw transaction. */
const txidOf = (rawTxHex: string): string => sha256d(rawTxHex).reverse().toString('hex');

/** Symmetric ARC4, keyed the way core keys OP_RETURN obfuscation: the first input's txid. */
function arc4(key: Buffer, data: Buffer): Buffer {
  const s = Array.from({ length: 256 }, (_, i) => i);
  let j = 0;
  for (let i = 0; i < 256; i += 1) {
    j = (j + s[i]! + key[i % key.length]!) & 0xff;
    [s[i], s[j]] = [s[j]!, s[i]!];
  }
  const out = Buffer.alloc(data.length);
  let i = 0;
  j = 0;
  for (let k = 0; k < data.length; k += 1) {
    i = (i + 1) & 0xff;
    j = (j + s[i]!) & 0xff;
    [s[i], s[j]] = [s[j]!, s[i]!];
    out[k] = data[k]! ^ s[(s[i]! + s[j]!) & 0xff]!;
  }
  return out;
}

const CNTRPRTY = Buffer.from('CNTRPRTY', 'ascii');

/** attach: `asset|quantity|destination_vout` under type id 101 (core attach.py). */
const attachPayload = (asset: string, quantity: string, vout: number): Buffer =>
  Buffer.concat([CNTRPRTY, Buffer.from([101]), Buffer.from(`${asset}|${quantity}|${vout}`, 'utf8')]);

/** detach: the destination address alone under type id 102 (core detach.py). */
const detachPayload = (destination: string): Buffer =>
  Buffer.concat([CNTRPRTY, Buffer.from([102]), Buffer.from(destination || '0', 'utf8')]);

/** OP_RETURN script carrying `payload` obfuscated with the first input's display txid. */
const opReturnScript = (payload: Buffer, firstInputTxid: string): string => {
  const cipher = arc4(Buffer.from(firstInputTxid, 'hex'), payload);
  return '6a' + le(cipher.length, 1) + cipher.toString('hex');
};

const scriptFor = (address: string): string =>
  Buffer.from(OutScript.encode(Address().decode(address))).toString('hex');

/** A valid bech32 p2wpkh address from a constant hash byte, for counterparties that need one. */
const fakeAddress = (byte: number): string =>
  Address().encode({ type: 'wpkh', hash: new Uint8Array(20).fill(byte) });

interface BuiltInput {
  txid: string; // display order
  vout: number;
  /** Address whose script the authenticated prevout carries; omitted = empty-script placeholder. */
  address?: string;
  value: number;
  /** Full previous transaction, required when the prevout is Legacy P2PKH. */
  nonWitnessUtxoHex?: string;
  /** Attach a fabricated final witness so the input reads as already signed. */
  signed?: boolean;
}

interface BuiltOutput {
  scriptHex: string;
  value: number;
}

/** Version-2, locktime-0 unsigned transaction (exact_offer_v1 pins exactly this header). */
function buildRawTx(inputs: BuiltInput[], outputs: BuiltOutput[]): string {
  return [
    le(2, 4),
    varint(inputs.length),
    ...inputs.map(input =>
      input.txid.match(/../g)!.reverse().join('') + le(input.vout, 4) + '00' + 'ffffffff'
    ),
    varint(outputs.length),
    ...outputs.map(output => le(output.value, 8) + varint(output.scriptHex.length / 2) + output.scriptHex),
    le(0, 4),
  ].join('');
}

/** A plausible final witness (sig-shaped bytes + a compressed-pubkey-shaped key). */
const FAKE_WITNESS = (() => {
  const sig = '30440220' + '11'.repeat(32) + '0220' + '22'.repeat(32) + '01';
  const pubkey = '02' + '33'.repeat(32);
  return varint(2) + varint(sig.length / 2) + sig + varint(pubkey.length / 2) + pubkey;
})();

/** Wrap the unsigned tx in a PSBT v0 envelope with witness_utxo (and optional witness) records. */
function buildPsbt(inputs: BuiltInput[], outputs: BuiltOutput[]): { psbtHex: string; txid: string } {
  const rawTxHex = buildRawTx(inputs, outputs);
  const inputMaps = inputs.map(input => {
    const authenticatedPrevout = input.nonWitnessUtxoHex
      ? ['01', '00', varint(input.nonWitnessUtxoHex.length / 2), input.nonWitnessUtxoHex]
      : (() => {
          const script = input.address ? scriptFor(input.address) : '';
          const witnessUtxo = le(input.value, 8) + varint(script.length / 2) + script;
          return ['01', '01', varint(witnessUtxo.length / 2), witnessUtxo];
        })();
    return [
      ...authenticatedPrevout,
      ...(input.signed ? ['01', '08', varint(FAKE_WITNESS.length / 2), FAKE_WITNESS] : []),
      '00',
    ].join('');
  });
  const psbtHex = [
    '70736274ff',
    '01', '00', varint(rawTxHex.length / 2), rawTxHex,
    '00',
    ...inputMaps,
    '00'.repeat(outputs.length),
  ].join('');
  return { psbtHex, txid: txidOf(rawTxHex) };
}

// ---------------------------------------------------------------------------------------------
// Balance stubbing
// ---------------------------------------------------------------------------------------------

interface StubBalance {
  asset: string;
  quantity: string;
  quantity_normalized: string;
}

/**
 * Answer every /v2/utxos/{utxo}/balances lookup from the scenario's table: listed outpoints
 * carry the given assets, 'fail' simulates an unreachable ledger (the retry state), and every
 * other outpoint is confirmed empty — these outpoints are fabricated, so the real API's answer
 * for them would be an accident. Everything else still reaches the real API.
 */
async function stubUtxoBalances(
  api: GalleryApi,
  balances: Record<string, StubBalance[] | 'fail'>
): Promise<void> {
  await api.route('**/v2/utxos/**', async (route: Route) => {
    const url = new URL(route.request().url());
    const match = url.pathname.match(/\/v2\/utxos\/([^/]+)\/balances/);
    if (!match) return route.fallback();
    const utxo = decodeURIComponent(match[1]!);
    const entry = balances[utxo];
    if (entry === 'fail') return route.fulfill({ status: 500, body: 'stubbed ledger outage' });
    return route.fulfill({
      json: {
        result: (entry ?? []).map(balance => ({
          asset: balance.asset,
          quantity: balance.quantity,
          quantity_normalized: balance.quantity_normalized,
          asset_info: { divisible: balance.quantity !== balance.quantity_normalized, asset_longname: null },
        })),
        next_cursor: null,
        result_count: (entry ?? []).length,
      },
    });
  });
}

// ---------------------------------------------------------------------------------------------
// The scenarios
// ---------------------------------------------------------------------------------------------

const ORIGIN = 'https://marketplace.xcp.io';
const FUTURE = 2_000_000_000;

/** Select a standard mnemonic address format through the same UI a user does. */
async function selectAddressType(page: Page, addressType: Extract<AddressType, 'p2pkh' | 'p2wpkh'>): Promise<void> {
  await navigateTo(page, 'settings');
  await settings.addressTypeOption(page).click();
  await expect(page).toHaveURL(/address-type/);
  const option = page.locator('[role="radio"]').filter({
    hasText: ADDRESS_TYPE_DISPLAY_NAMES[addressType],
  });
  await expect(option).toBeVisible();
  await option.click();
  await navigateTo(page, 'wallet');
  const expectedPrefix = addressType === 'p2pkh' ? '1' : 'bc1q';
  await page.waitForFunction(
    (prefix: string) => {
      const address = document.querySelector('[aria-label="Current address"] .font-mono');
      return (address?.textContent ?? '').startsWith(prefix);
    },
    expectedPrefix,
    { timeout: 10_000 },
  );
}

/** Read the complete active address from its detail page. */
async function readActiveAddress(page: Page): Promise<string> {
  const extensionRoot = page.url().split('#')[0];
  await page.goto(`${extensionRoot}#/addresses/details`);
  await page.waitForLoadState('networkidle');
  const address = await page.evaluate(() => {
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const m = (el.textContent || '').match(
        /\b(?:bc1|tb1)[0-9a-z]{30,}\b|\b[13mn2][1-9A-HJ-NP-Za-km-z]{25,34}\b/
      );
      if (m) return m[0];
    }
    return '';
  });
  expect(address, 'should read the full active address').toMatch(
    /^(?:bc1|tb1|[13mn2][1-9A-HJ-NP-Za-km-z])/
  );
  return address;
}

interface Scenario {
  name: string;
  /** popup.html#<route>?requestId=… */
  route: '/requests/psbt/approve' | '/requests/psbts/approve';
  record: Record<string, unknown>;
  balances: Record<string, StubBalance[] | 'fail'>;
  /** The footer state this scenario is expected to reach — a drifting state fails the run. */
  expectFooter:
    | 'Sign transaction'
    | 'Buy collectibles'
    | 'Accept offer'
    | 'Prepare funds'
    | 'Send Bitcoin'
    | 'Review'
    | 'Blocked'
    | 'Awaiting verification'
    | 'Authorize listing'
    | 'Authorize reprice'
    | 'Prepare asset'
    | 'Attach and list';
  /** Important semantic disclosures that must survive visual refactors. */
  expectedText?: string[];
  /** False-positive warnings that would make an ordinary marketplace request look unsafe. */
  absentText?: string[];
}

function buildScenarios(wallet: string, pairedLegacy: string, walletId: string): Scenario[] {
  const SELLER_A = fakeAddress(0x11);
  const SELLER_B = fakeAddress(0x22);
  const BUYER_EXT = fakeAddress(0x33);
  const PLATFORM = fakeAddress(0x44);

  const ASSET_TXID = 'ab'.repeat(32);
  const ASSET_TXID_TWO = 'cd'.repeat(32);
  const FUNDING_TXID = '11'.repeat(32);
  const BID_TXID = '19'.repeat(32);
  const scenarios: Scenario[] = [];
  const seedRecord = (
    id: string,
    fields: Record<string, unknown>,
  ): Record<string, unknown> => ({
    id,
    origin: ORIGIN,
    timestamp: Date.now(),
    address: wallet,
    walletId,
    status: 'pending',
    ...fields,
  });

  // --- attach_for_listing (caution: block-dependent XCP fee) --------------------------------
  {
    const funding: BuiltInput = { txid: '15'.repeat(32), vout: 0, address: wallet, value: 100_000 };
    const payload = attachPayload('RAREPEPE', '1', 0);
    const outputs: BuiltOutput[] = [
      { scriptHex: scriptFor(wallet), value: 546 },
      { scriptHex: opReturnScript(payload, funding.txid), value: 0 },
      { scriptHex: scriptFor(wallet), value: 98_454 },
    ];
    const { psbtHex, txid } = buildPsbt([funding], outputs);
    scenarios.push({
      name: 'listing-attach-caution',
      route: '/requests/psbt/approve',
      expectFooter: 'Sign transaction',
      record: seedRecord('mk-attach', {
        requestKey: 'xcp_signPsbt:mk-attach',
        kind: 'sign-psbt',
        psbtHex,
        signInputs: { [wallet]: [0] },
        sighashTypes: [0x01],
        marketplaceIntent: {
          standard: 'counterparty-marketplace',
          version: 1,
          action: 'attach_for_listing',
          operationId: 'attach-1',
          protocolVersion: 'counterparty_attach_listing_v1',
          assets: [{ asset: 'RAREPEPE', quantityRaw: '1' }],
          seller: wallet,
          expectedAttachedOutpoint: { txid, vout: 0 },
          carrierAddress: wallet,
          carrierValueSats: 546,
          networkFeeSats: 1_000,
          protocolFee: {
            asset: 'XCP',
            quotedAmountRaw: '25000000',
            actualAmountRaw: null,
            observedBlock: 900_000,
            variableUntilConfirmed: true,
          },
          operationExpiresAt: FUTURE,
        },
      }),
      balances: {},
    });
  }

  // --- attach_for_listing from paired Legacy, with SegWit paying the miner fee --------------
  // This is the real DigiRare migration shape: Counterparty reads source from input 0, while
  // the new attached carrier belongs to the active SegWit identity. A second, same-wallet input
  // pays the fee. Legacy uses nonWitnessUtxo so the gallery cannot accidentally normalize the
  // forged-amount shape that the signer correctly refuses.
  {
    const legacyPrevTx = buildRawTx(
      [{ txid: '16'.repeat(32), vout: 0, value: 0 }],
      [{ scriptHex: scriptFor(pairedLegacy), value: 330 }],
    );
    const legacySource: BuiltInput = {
      txid: txidOf(legacyPrevTx),
      vout: 0,
      address: pairedLegacy,
      value: 330,
      nonWitnessUtxoHex: legacyPrevTx,
    };
    const segwitFunding: BuiltInput = {
      txid: '17'.repeat(32),
      vout: 1,
      address: wallet,
      value: 10_000,
    };
    const payload = attachPayload('COLLECTOR', '1', 0);
    const outputs: BuiltOutput[] = [
      { scriptHex: scriptFor(wallet), value: 330 },
      { scriptHex: opReturnScript(payload, legacySource.txid), value: 0 },
      { scriptHex: scriptFor(wallet), value: 9_000 },
    ];
    const { psbtHex, txid } = buildPsbt([legacySource, segwitFunding], outputs);
    scenarios.push({
      name: 'listing-attach-paired-legacy-source',
      route: '/requests/psbt/approve',
      expectFooter: 'Sign transaction',
      expectedText: [
        'Signing addresses (2)',
        'Asset source',
        pairedLegacy,
        'New UTXO owner',
        wallet,
      ],
      absentText: [
        'Blocked: Not a Counterparty Transaction',
        'BTC Sent to External Address',
      ],
      record: seedRecord('mk-attach-paired', {
        requestKey: 'xcp_signPsbt:mk-attach-paired',
        kind: 'sign-psbt',
        psbtHex,
        signInputs: { [pairedLegacy]: [0], [wallet]: [1] },
        sighashTypes: [0x01, 0x01],
        marketplaceIntent: {
          standard: 'counterparty-marketplace',
          version: 1,
          action: 'attach_for_listing',
          operationId: 'attach-paired-1',
          protocolVersion: 'counterparty_attach_listing_v1',
          assets: [{ asset: 'COLLECTOR', quantityRaw: '1' }],
          seller: wallet,
          assetSource: pairedLegacy,
          expectedAttachedOutpoint: { txid, vout: 0 },
          carrierAddress: wallet,
          carrierValueSats: 330,
          networkFeeSats: 1_000,
          protocolFee: {
            asset: 'XCP',
            quotedAmountRaw: '0',
            actualAmountRaw: null,
            observedBlock: 900_000,
            variableUntilConfirmed: true,
          },
          operationExpiresAt: FUTURE,
        },
      }),
      balances: {},
    });
  }

  // --- prepare_asset: the same proved attach with no price or listing authorization ----------
  {
    const legacyPrevTx = buildRawTx(
      [{ txid: '2a'.repeat(32), vout: 0, value: 0 }],
      [{ scriptHex: scriptFor(pairedLegacy), value: 330 }],
    );
    const legacySource: BuiltInput = {
      txid: txidOf(legacyPrevTx),
      vout: 0,
      address: pairedLegacy,
      value: 330,
      nonWitnessUtxoHex: legacyPrevTx,
    };
    const modernFunding: BuiltInput = {
      txid: '2b'.repeat(32),
      vout: 1,
      address: wallet,
      value: 10_000,
    };
    const payload = attachPayload('RAREPEPE', '1', 0);
    const outputs: BuiltOutput[] = [
      { scriptHex: scriptFor(wallet), value: 330 },
      { scriptHex: opReturnScript(payload, legacySource.txid), value: 0 },
      { scriptHex: scriptFor(wallet), value: 9_000 },
    ];
    const { psbtHex, txid } = buildPsbt([legacySource, modernFunding], outputs);
    scenarios.push({
      name: 'prepare-asset-proved',
      route: '/requests/psbt/approve',
      expectFooter: 'Prepare asset',
      expectedText: [
        'Prepare Asset',
        'Attach 1 RAREPEPE',
        'Signing addresses (2)',
        'Asset source',
        pairedLegacy,
        'New UTXO owner',
        wallet,
        'New UTXO value',
        '330 sats',
        'Quoted XCP fee',
      ],
      absentText: [
        'for listing',
        'Authorize listing',
        'Blocked: Not a Counterparty Transaction',
      ],
      record: seedRecord('mk-prepare-asset', {
        requestKey: 'xcp_signPsbt:mk-prepare-asset',
        kind: 'sign-psbt',
        psbtHex,
        signInputs: { [pairedLegacy]: [0], [wallet]: [1] },
        sighashTypes: [0x01, 0x01],
        marketplaceIntent: {
          standard: 'counterparty-marketplace',
          version: 1,
          action: 'prepare_asset',
          operationId: 'prepare-1',
          protocolVersion: 'counterparty_prepare_assets_v1',
          assets: [{ asset: 'RAREPEPE', quantityRaw: '1' }],
          carrierOwner: wallet,
          assetSource: pairedLegacy,
          expectedAttachedOutpoint: { txid, vout: 0 },
          carrierValueSats: 330,
          networkFeeSats: 1_000,
          protocolFee: {
            asset: 'XCP',
            quotedAmountRaw: '25000000',
            actualAmountRaw: null,
            observedBlock: 900_000,
            variableUntilConfirmed: true,
          },
          operationExpiresAt: FUTURE,
        },
      }),
      balances: {},
    });
  }

  // --- one-review attach + listing from paired Legacy ---------------------------------------
  // The listing points at the unsigned attachment txid here. At approval time the wallet signs
  // the Legacy parent, resolves its final txid, rewrites only this dependent outpoint, and then
  // signs the listing. The unit test covers that mutation; this scenario keeps the combined
  // disclosure and paired signer context visible in the approval gallery.
  {
    const legacyPrevTx = buildRawTx(
      [{ txid: '18'.repeat(32), vout: 0, value: 0 }],
      [{ scriptHex: scriptFor(pairedLegacy), value: 330 }],
    );
    const legacySource: BuiltInput = {
      txid: txidOf(legacyPrevTx),
      vout: 0,
      address: pairedLegacy,
      value: 330,
      nonWitnessUtxoHex: legacyPrevTx,
    };
    const modernFunding: BuiltInput = {
      txid: '1a'.repeat(32),
      vout: 1,
      address: wallet,
      value: 10_000,
    };
    const payload = attachPayload('COLLECTOR', '1', 0);
    const attach = buildPsbt(
      [legacySource, modernFunding],
      [
        { scriptHex: scriptFor(wallet), value: 330 },
        { scriptHex: opReturnScript(payload, legacySource.txid), value: 0 },
        { scriptHex: scriptFor(wallet), value: 9_000 },
      ],
    );
    const listing = buildPsbt(
      [
        { txid: '00'.repeat(32), vout: 0, value: 0 },
        { txid: attach.txid, vout: 0, address: wallet, value: 330 },
      ],
      [
        { scriptHex: scriptFor(wallet), value: 330 },
        { scriptHex: scriptFor(wallet), value: 100_330 },
      ],
    );
    const operationId = 'attach-and-list-paired-1';
    const assetClaim = {
      asset: 'COLLECTOR',
      quantityRaw: '1',
      sourceOutpoint: { txid: attach.txid, vout: 0 },
    };
    scenarios.push({
      name: 'bundle-attach-and-list-paired-legacy',
      route: '/requests/psbts/approve',
      expectFooter: 'Attach and list',
      expectedText: [
        'Attach and list COLLECTOR',
        'Asset source',
        pairedLegacy,
        'Broadcast now',
        'Attach transaction only',
        'Listing activation',
        'After confirmation and Counterparty verification',
      ],
      absentText: [
        'Blocked: Not a Counterparty Transaction',
        'BTC Sent to External Address',
      ],
      record: seedRecord('mk-attach-and-list-paired', {
        requestKey: 'xcp_signPsbts:mk-attach-and-list-paired',
        kind: 'sign-psbts',
        bundleKind: 'attach-and-list',
        items: [
          {
            psbtHex: attach.psbtHex,
            signInputs: { [pairedLegacy]: [0], [wallet]: [1] },
            sighashTypes: [0x01, 0x01],
            marketplaceIntent: {
              standard: 'counterparty-marketplace',
              version: 1,
              action: 'attach_for_listing',
              operationId,
              protocolVersion: 'counterparty_attach_listing_v1',
              assets: [{ asset: 'COLLECTOR', quantityRaw: '1' }],
              seller: wallet,
              assetSource: pairedLegacy,
              expectedAttachedOutpoint: { txid: attach.txid, vout: 0 },
              carrierAddress: wallet,
              carrierValueSats: 330,
              networkFeeSats: 1_000,
              protocolFee: {
                asset: 'XCP',
                quotedAmountRaw: '0',
                actualAmountRaw: null,
                observedBlock: 900_000,
                variableUntilConfirmed: true,
              },
              operationExpiresAt: FUTURE,
            },
          },
          {
            psbtHex: listing.psbtHex,
            signInputs: { [wallet]: [1] },
            sighashTypes: [0x01, 0x83],
            marketplaceIntent: {
              standard: 'counterparty-marketplace',
              version: 1,
              action: 'create_listing',
              operationId,
              protocolVersion: 'counterparty_attach_listing_v1',
              assets: [assetClaim],
              seller: wallet,
              priceSats: 100_000,
              carrierValueSats: 330,
              guaranteedSellerPaymentSats: 100_330,
              delivery: { mode: 'buyer_selected_detach' },
              signingRequestExpiresAt: FUTURE,
              marketplaceExpiresAt: null,
              bitcoinExpiresAt: null,
            },
          },
        ],
      }),
      balances: {
        [`${attach.txid}:0`]: [{ asset: 'COLLECTOR', quantity: '1', quantity_normalized: '1' }],
      },
    });
  }

  // --- create_listing (proved: the bounded buyer-selected detach is fully explained) --------
  {
    const placeholder: BuiltInput = { txid: '00'.repeat(32), vout: 0, value: 0 };
    const assetInput: BuiltInput = { txid: ASSET_TXID, vout: 7, address: wallet, value: 546 };
    const outputs: BuiltOutput[] = [
      { scriptHex: scriptFor(wallet), value: 546 },
      { scriptHex: scriptFor(wallet), value: 250_546 },
    ];
    const { psbtHex } = buildPsbt([placeholder, assetInput], outputs);
    const intent = {
      standard: 'counterparty-marketplace',
      version: 1,
      action: 'create_listing',
      operationId: 'listing-1',
      protocolVersion: 'counterparty_attach_listing_v1',
      assets: [{
        asset: 'RAREPEPE',
        quantityRaw: '100000000',
        sourceOutpoint: { txid: ASSET_TXID, vout: 7 },
      }],
      seller: wallet,
      priceSats: 250_000,
      carrierValueSats: 546,
      guaranteedSellerPaymentSats: 250_546,
      delivery: { mode: 'buyer_selected_detach' },
      signingRequestExpiresAt: FUTURE,
      marketplaceExpiresAt: FUTURE + 3_600,
      bitcoinExpiresAt: null,
    };
    scenarios.push({
      name: 'listing-create-proved',
      route: '/requests/psbt/approve',
      expectFooter: 'Authorize listing',
      record: seedRecord('mk-listing', {
        requestKey: 'xcp_signPsbt:mk-listing',
        kind: 'sign-psbt',
        psbtHex,
        signInputs: { [wallet]: [1] },
        sighashTypes: [0x01, 0x83],
        marketplaceIntent: intent,
      }),
      balances: {
        [`${ASSET_TXID}:7`]: [{ asset: 'RAREPEPE', quantity: '100000000', quantity_normalized: '1' }],
      },
      expectedText: [
        'Not broadcast now.',
        'Marketplace cancellation',
        'Signature invalidation',
        'Spend the asset UTXO',
      ],
    });

    scenarios.push({
      name: 'listing-reprice-proved',
      route: '/requests/psbt/approve',
      expectFooter: 'Authorize reprice',
      record: seedRecord('mk-listing-reprice', {
        requestKey: 'xcp_signPsbt:mk-listing-reprice',
        kind: 'sign-psbt',
        psbtHex,
        signInputs: { [wallet]: [1] },
        sighashTypes: [0x01, 0x83],
        marketplaceIntent: {
          ...intent,
          operationId: 'listing-reprice-1',
          listingContext: {
            mode: 'reprice',
          },
        },
      }),
      balances: {
        [`${ASSET_TXID}:7`]: [{ asset: 'RAREPEPE', quantity: '100000000', quantity_normalized: '1' }],
      },
    });

    // Same listing, but the ledger cannot answer for the attached outpoint → retry gate.
    scenarios.push({
      name: 'listing-create-retry',
      route: '/requests/psbt/approve',
      expectFooter: 'Awaiting verification',
      record: seedRecord('mk-listing-retry', {
        requestKey: 'xcp_signPsbt:mk-listing-retry',
        kind: 'sign-psbt',
        psbtHex,
        signInputs: { [wallet]: [1] },
        sighashTypes: [0x01, 0x83],
        marketplaceIntent: intent,
      }),
      balances: { [`${ASSET_TXID}:7`]: 'fail' },
    });
  }

  // --- buy_listings (proved) and its tampered twin (blocked) --------------------------------
  {
    const buildBuy = (seller1Payment: number) => {
      const inputs: BuiltInput[] = [
        { txid: FUNDING_TXID, vout: 0, address: wallet, value: 400_000 },
        { txid: ASSET_TXID, vout: 7, address: SELLER_A, value: 546 },
        { txid: ASSET_TXID_TWO, vout: 3, address: SELLER_B, value: 330 },
      ];
      const outputs: BuiltOutput[] = [
        { scriptHex: opReturnScript(detachPayload(wallet), FUNDING_TXID), value: 0 },
        { scriptHex: scriptFor(SELLER_A), value: seller1Payment },
        { scriptHex: scriptFor(SELLER_B), value: 200_330 },
        { scriptHex: scriptFor(PLATFORM), value: 5_000 },
        { scriptHex: scriptFor(wallet), value: 94_000 },
      ];
      return buildPsbt(inputs, outputs);
    };
    const intentFor = (txid: string) => ({
      standard: 'counterparty-marketplace',
      version: 1,
      action: 'buy_listings',
      operationId: 'checkout-1',
      protocolVersion: 'direct_v1',
      assets: [
        { asset: 'RAREPEPE', quantityRaw: '1', sourceOutpoint: { txid: ASSET_TXID, vout: 7 } },
        { asset: 'SPELLS', quantityRaw: '100000000', sourceOutpoint: { txid: ASSET_TXID_TWO, vout: 3 } },
      ],
      buyer: wallet,
      items: [
        {
          asset: 'RAREPEPE',
          quantityRaw: '1',
          sourceOutpoint: { txid: ASSET_TXID, vout: 7 },
          listingId: 'listing-1',
          seller: SELLER_A,
          carrierValueSats: 546,
          priceSats: 100_000,
          sellerPaymentSats: 100_546,
        },
        {
          asset: 'SPELLS',
          quantityRaw: '100000000',
          sourceOutpoint: { txid: ASSET_TXID_TWO, vout: 3 },
          listingId: 'listing-2',
          seller: SELLER_B,
          carrierValueSats: 330,
          priceSats: 200_000,
          sellerPaymentSats: 200_330,
        },
      ],
      subtotalSats: 300_000,
      networkFeeSats: 1_000,
      platformFeeSats: 5_000,
      totalSats: 306_000,
      expectedTxid: txid,
      delivery: { mode: 'detached', address: wallet },
      marketplaceExpiresAt: FUTURE + 3_600,
    });
    const buyBalances = {
      [`${ASSET_TXID}:7`]: [{ asset: 'RAREPEPE', quantity: '1', quantity_normalized: '1' }],
      [`${ASSET_TXID_TWO}:3`]: [{ asset: 'SPELLS', quantity: '100000000', quantity_normalized: '1' }],
    };

    const proved = buildBuy(100_546);
    scenarios.push({
      name: 'checkout-buy-proved',
      route: '/requests/psbt/approve',
      expectFooter: 'Buy collectibles',
      record: seedRecord('mk-buy', {
        requestKey: 'xcp_signPsbt:mk-buy',
        kind: 'sign-psbt',
        psbtHex: proved.psbtHex,
        signInputs: { [wallet]: [0] },
        sighashTypes: [0x01],
        marketplaceIntent: intentFor(proved.txid),
      }),
      balances: buyBalances,
    });

    // A tampered seller payment: the site's claim no longer matches the bytes.
    const tampered = buildBuy(100_545);
    scenarios.push({
      name: 'checkout-buy-tampered-blocked',
      route: '/requests/psbt/approve',
      expectFooter: 'Blocked',
      record: seedRecord('mk-buy-bad', {
        requestKey: 'xcp_signPsbt:mk-buy-bad',
        kind: 'sign-psbt',
        psbtHex: tampered.psbtHex,
        signInputs: { [wallet]: [0] },
        sighashTypes: [0x01],
        // The intent still claims the original payment, so the mismatch must block.
        marketplaceIntent: intentFor(tampered.txid),
      }),
      balances: buyBalances,
    });
  }

  // --- exact offers: buyer authorization (caution) and seller acceptance (proved) -----------
  {
    const offer = (accepting: boolean) => {
      const buyerAddr = accepting ? BUYER_EXT : wallet;
      const sellerAddr = accepting ? wallet : SELLER_A;
      const inputs: BuiltInput[] = [
        { txid: BID_TXID, vout: 4, address: buyerAddr, value: 256_250, signed: accepting },
        { txid: ASSET_TXID, vout: 7, address: sellerAddr, value: 546 },
      ];
      const outputs: BuiltOutput[] = [
        { scriptHex: opReturnScript(detachPayload(buyerAddr), BID_TXID), value: 0 },
        { scriptHex: scriptFor(sellerAddr), value: 250_046 },
        { scriptHex: scriptFor(PLATFORM), value: 6_250 },
      ];
      const { psbtHex, txid } = buildPsbt(inputs, outputs);
      const intent = {
        standard: 'counterparty-marketplace',
        version: 1,
        action: accepting ? 'accept_exact_offer' : 'authorize_exact_offer',
        operationId: 'authorization-1',
        protocolVersion: 'exact_offer_v1',
        assets: [{
          asset: 'RAREPEPE',
          quantityRaw: '1',
          sourceOutpoint: { txid: ASSET_TXID, vout: 7 },
        }],
        authorizationId: 'authorization-1',
        bidder: buyerAddr,
        seller: sellerAddr,
        priceSats: 250_000,
        carrierValueSats: 546,
        sellerProceedsSats: 250_046,
        networkFeeSats: 500,
        platformFeeSats: 6_250,
        expectedTxid: txid,
        delivery: { mode: 'detached', address: buyerAddr },
        marketplaceExpiresAt: FUTURE + 3_600,
        bitcoinExpiresAt: null,
        bitcoinInvalidation: {
          type: 'spend_funding_outpoint',
          outpoint: { txid: BID_TXID, vout: 4 },
        },
      };
      return { psbtHex, txid, intent };
    };

    const authorize = offer(false);
    scenarios.push({
      name: 'offer-authorize-caution',
      expectedText: ['Platform fee', '6,250 sats', 'Paid by the buyer', '256,250 sats'],
      route: '/requests/psbt/approve',
      expectFooter: 'Review',
      record: seedRecord('mk-authorize', {
        requestKey: 'xcp_signPsbt:mk-authorize',
        kind: 'sign-psbt',
        psbtHex: authorize.psbtHex,
        signInputs: { [wallet]: [0] },
        sighashTypes: [0x01],
        marketplaceIntent: authorize.intent,
      }),
      balances: {
        [`${ASSET_TXID}:7`]: [{ asset: 'RAREPEPE', quantity: '1', quantity_normalized: '1' }],
      },
    });

    const accept = offer(true);
    scenarios.push({
      name: 'offer-accept-proved',
      expectedText: ['Platform fee', '6,250 sats', 'Paid by the buyer', '250,046 sats'],
      route: '/requests/psbt/approve',
      expectFooter: 'Accept offer',
      record: seedRecord('mk-accept', {
        requestKey: 'xcp_signPsbt:mk-accept',
        kind: 'sign-psbt',
        psbtHex: accept.psbtHex,
        signInputs: { [wallet]: [1] },
        sighashTypes: [0x01, 0x01],
        marketplaceIntent: accept.intent,
      }),
      balances: {
        [`${ASSET_TXID}:7`]: [{ asset: 'RAREPEPE', quantity: '1', quantity_normalized: '1' }],
      },
    });

    // The acceptance again, now linked to its CPFP fee-bump child on the bundle screen.
    const child = buildPsbt(
      [{ txid: accept.txid, vout: 1, address: wallet, value: 250_046 }],
      [{ scriptHex: scriptFor(wallet), value: 249_046 }],
    );
    scenarios.push({
      name: 'bundle-accept-cpfp-proved',
      expectedText: ['Platform fee', '6,250 sats', 'Paid by the buyer', '249,046 sats'],
      route: '/requests/psbts/approve',
      expectFooter: 'Accept offer',
      record: seedRecord('mk-bundle', {
        requestKey: 'xcp_signPsbts:mk-bundle',
        kind: 'sign-psbts',
        bundleKind: 'acceptance-cpfp',
        items: [
          {
            psbtHex: accept.psbtHex,
            signInputs: { [wallet]: [1] },
            sighashTypes: [0x01, 0x01],
            marketplaceIntent: accept.intent,
          },
          {
            psbtHex: child.psbtHex,
            signInputs: { [wallet]: [0] },
            sighashTypes: [0x01],
            marketplaceIntent: {
              standard: 'counterparty-marketplace',
              version: 1,
              action: 'bump_acceptance_fee',
              operationId: 'authorization-1',
              protocolVersion: 'exact_offer_v1',
              assets: [{
                asset: 'RAREPEPE',
                quantityRaw: '1',
                sourceOutpoint: { txid: ASSET_TXID, vout: 7 },
              }],
              authorizationId: 'authorization-1',
              seller: wallet,
              parentExpectedTxid: accept.txid,
              childExpectedTxid: child.txid,
              parentSellerProceedsVout: 1,
              parentSellerProceedsSats: 250_046,
              parentNetworkFeeSats: 500,
              childNetworkFeeSats: 1_000,
              packageFeeSats: 1_500,
              packageFeeRate: 5,
              finalSellerProceedsSats: 249_046,
            },
          },
        ],
      }),
      balances: {
        [`${ASSET_TXID}:7`]: [{ asset: 'RAREPEPE', quantity: '1', quantity_normalized: '1' }],
      },
    });
  }

  // --- prepare_bulk_fanout (proved). Plain BTC never signs as a single xcp_signPsbt — the
  // Counterparty-only gate blocks it there — so the fan-out phase exists only as a bundle. -----
  {
    const parents = ['31', '32'].map((seed, index) => {
      const fundingTxid = seed.repeat(32);
      const { psbtHex, txid } = buildPsbt(
        [{ txid: fundingTxid, vout: 2, address: wallet, value: 100_000 }],
        [
          { scriptHex: scriptFor(wallet), value: 10_000 },
          { scriptHex: scriptFor(wallet), value: 10_000 },
          { scriptHex: scriptFor(wallet), value: 79_000 },
        ],
      );
      return {
        psbtHex,
        signInputs: { [wallet]: [0] },
        sighashTypes: [0x01],
        marketplaceIntent: {
          standard: 'counterparty-marketplace',
          version: 1,
          action: 'prepare_bulk_fanout',
          operationId: 'bulk-1',
          protocolVersion: 'counterparty_bulk_attach_v1',
          assets: [],
          batchIndex: index,
          seller: wallet,
          fundingOutpoint: { txid: fundingTxid, vout: 2 },
          fundingValueSats: 100_000,
          slotCount: 2,
          slotValueSats: 10_000,
          networkFeeSats: 1_000,
          changeSats: 79_000,
          expectedTxid: txid,
          operationExpiresAt: FUTURE,
        },
      };
    });
    scenarios.push({
      name: 'bundle-bulk-fanout-proved',
      route: '/requests/psbts/approve',
      expectFooter: 'Prepare funds',
      record: seedRecord('mk-fanout', {
        requestKey: 'xcp_signPsbts:mk-fanout',
        kind: 'sign-psbts',
        bundleKind: 'bulk-fanout',
        items: parents,
      }),
      balances: {},
    });
  }

  // --- xcp_signBitcoinPsbt: exact website payment (proved) and its tampered twin ------------
  {
    const buildPay = (declaredSats: number) => buildPsbt(
      [{ txid: '31'.repeat(32), vout: 0, address: wallet, value: 100_000 }],
      [
        { scriptHex: scriptFor(BUYER_EXT), value: 21_600 },
        { scriptHex: scriptFor(wallet), value: 77_400 },
      ],
    ).psbtHex;
    const payIntent = (amountSats: number) => ({
      standard: 'xcp-wallet/bitcoin-payment',
      version: 1,
      action: 'pay',
      outputs: [{ address: BUYER_EXT, amountSats }],
      description: 'Fund Emblem Vault',
      reference: 'vault-63',
    });
    scenarios.push({
      name: 'bitcoin-pay-proved',
      route: '/requests/psbt/approve',
      expectFooter: 'Send Bitcoin',
      record: seedRecord('mk-pay', {
        requestKey: 'xcp_signBitcoinPsbt:mk-pay',
        kind: 'sign-psbt',
        psbtHex: buildPay(21_600),
        signInputs: { [wallet]: [0] },
        sighashTypes: [0x01],
        signingPurpose: 'bitcoin-payment',
        bitcoinPaymentIntent: payIntent(21_600),
      }),
      balances: {},
    });
    scenarios.push({
      name: 'bitcoin-pay-mismatch-blocked',
      route: '/requests/psbt/approve',
      expectFooter: 'Blocked',
      record: seedRecord('mk-pay-bad', {
        requestKey: 'xcp_signBitcoinPsbt:mk-pay-bad',
        kind: 'sign-psbt',
        psbtHex: buildPay(21_600),
        signInputs: { [wallet]: [0] },
        sighashTypes: [0x01],
        signingPurpose: 'bitcoin-payment',
        // The site declares a different amount than the PSBT pays.
        bitcoinPaymentIntent: payIntent(21_599),
      }),
      balances: {},
    });
  }

  return scenarios;
}

// ---------------------------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------------------------

// Same deliberate pacing as approval-gallery: the balance lookups are stubbed here, but each
// screen still makes real decode calls against shared public infrastructure.
const SCREEN_SPACING_MS = 2_000;
const settle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

walletTest('captures every marketplace and provider-safety approval screen', async ({ context, page, extensionId }) => {
  walletTest.setTimeout(300_000);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // A paired permission is defined for the Legacy and Native SegWit formats at the same wallet
  // index. Read both through the real wallet UI, then leave SegWit active for every approval.
  await selectAddressType(page, 'p2pkh');
  const pairedLegacy = await readActiveAddress(page);
  await selectAddressType(page, 'p2wpkh');
  const wallet = await readActiveAddress(page);
  expect(pairedLegacy).toMatch(/^1/);
  expect(wallet).toMatch(/^bc1q/);

  const identity = await authorizeGalleryOrigin(page, ORIGIN, true);
  expect(identity.address).toBe(wallet);
  await assertGalleryWorkerRouting(context, extensionId);
  const scenarios = selectGalleryScenarios(buildScenarios(wallet, pairedLegacy, identity.walletId), scenario => scenario.name);
  const captured: string[] = [];
  const stateMismatches: string[] = [];

  for (const scenario of scenarios) {
    await walletTest.step('Capture marketplace approval', async () => {
      await settle(SCREEN_SPACING_MS);
      const api = await createGalleryApi(context, page, scenario.name);
      await stubUtxoBalances(api, scenario.balances);
      await page.evaluate(async (record) => {
        await chrome.storage.session.set({ pending_sign_flow: [record] });
      }, { ...scenario.record, ...identity, timestamp: Date.now() });

      const approval = await context.newPage();
      await approval.setViewportSize({ width: 380, height: 1400 });
      await approval.goto(
        `chrome-extension://${extensionId}/popup.html#${scenario.route}?requestId=${scenario.record.id}`
      );

      const footer = approval.getByRole('button', {
        name: /^(sign transaction|buy collectibles|accept offer|prepare funds|send bitcoin|review|blocked|awaiting verification|authorize listing|authorize reprice|prepare asset|attach and list)$/i,
      });
      await expect(footer).toBeVisible({ timeout: 60_000 });
      const footerLabel = (await footer.textContent())?.trim() ?? '';
      if (footerLabel.toLowerCase() !== scenario.expectFooter.toLowerCase()) {
        stateMismatches.push(`${scenario.name}: footer reads "${footerLabel}", expected "${scenario.expectFooter}"`);
      }

      await captureApprovalSizes(approval, OUT_DIR, scenario.name);

      // Capture the paired signer disclosure at the top of the approval before opening lower
      // transaction details, whose focus movement scrolls the real popup viewport downward.
      const signerToggle = approval.getByText(/^Signing addresses \(\d+\)$/);
      if (await signerToggle.count()) {
        await signerToggle.first().click();
        await approval.locator('.overflow-y-auto').first().evaluate((element) => {
          element.scrollTop = 0;
        });
        await approval.screenshot({
          path: path.join(OUT_DIR, `${scenario.name}-signers.png`),
          fullPage: true,
        });
      }

      // Open the lower-level transaction surfaces for the companion detail capture.
      for (const title of [/^Transaction Details$/, /^Linked Transaction Details$/, /^Compare payment details$/, /^Payout and fee details$/, /^Why signing is unavailable$/, /^What to review$/]) {
        const toggle = approval.getByText(title);
        if (await toggle.count()) await toggle.first().click();
      }

      const body = approval.locator('body');
      for (const expectedText of scenario.expectedText ?? []) {
        await expect(body).toContainText(expectedText);
      }
      for (const absentText of scenario.absentText ?? []) {
        await expect(body).not.toContainText(absentText);
      }
      await approval.screenshot({ path: path.join(OUT_DIR, `${scenario.name}.png`), fullPage: true });

      const review = approval.getByRole('button', { name: /^review$/i });
      if (await review.count()) {
        await review.click();
        await expect(approval.getByRole('button', { name: 'Back' })).toBeVisible({ timeout: 10_000 });
        await approval.screenshot({
          path: path.join(OUT_DIR, `${scenario.name}-attention.png`),
          fullPage: true,
        });
        await approval.getByRole('button', { name: 'Back' }).click();
      }

      if (scenario.name === 'listing-create-retry') {
        // Recovery must keep the same request and wait for new background evidence.
        await expect(approval.getByRole('button', { name: 'Awaiting verification' })).toBeDisabled();
        await stubUtxoBalances(api, {
          [Object.keys(scenario.balances)[0]!]: [{ asset: 'RAREPEPE', quantity: '100000000', quantity_normalized: '1' }],
        });
        await approval.getByRole('button', { name: 'Retry verification' }).click();
        await expect(approval.getByRole('button', { name: 'Authorize listing' })).toBeEnabled({ timeout: 60_000 });
        await expect(approval.getByRole('button', { name: 'Retry verification' })).toHaveCount(0);
        await captureApprovalSizes(approval, OUT_DIR, `${scenario.name}-recovered`);
      }
      captured.push(scenario.name);
      await approval.close();
      await api.dispose();
    }, {
      subtitle: scenario.name,
      params: { scenario: scenario.name, requestType: scenario.record.kind },
    });
  }

  expect(stateMismatches, 'scenarios did not reach their expected approval states').toEqual([]);
  expect(captured).toEqual(scenarios.map((scenario) => scenario.name));
  console.log(`\nMarketplace gallery: ${captured.length} screens in ${OUT_DIR}\n`);
});
