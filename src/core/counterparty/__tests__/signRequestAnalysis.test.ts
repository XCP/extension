/**
 * The gate that decides whether this wallet will sign for a website.
 *
 * This logic used to be written out twice, once inside each approval hook, and neither copy was
 * covered by a test — the hooks had none at all. It is the check that stops a site using the
 * wallet as a plain Bitcoin signer, so it is pinned here now that it lives in one place.
 *
 * The lookups that reach the network are mocked; everything that decides safety is the real code.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseBitcoinPaymentIntent } from '@/core/bitcoin/providerPayment';
import type { InputAttachedAssets } from '../inputAssets';
import { parseMarketplaceIntent } from '../marketplaceIntent';
import type { ProtocolContext } from '../protocolContext';
import { type AnalyzedOutput, analyzeSignRequest } from '../signRequestAnalysis';

vi.mock('@/core/counterparty/transaction', () => ({
  decodeCounterpartyMessage: vi.fn(async () => null),
  resolveMpmaRecipients: vi.fn(async () => []),
  describeMpmaSend: vi.fn(() => 'described locally'),
}));

vi.mock('@/core/counterparty/protocolContext', () => ({
  resolveProtocolContext: vi.fn(async () => ({ context: {} as ProtocolContext, warnings: [] })),
}));

vi.mock('@/core/counterparty/unpack', () => ({
  verifyProviderTransaction: vi.fn(() => ({ localUnpack: undefined })),
}));

const { decodeCounterpartyMessage, resolveMpmaRecipients } = await import('../transaction');
const { resolveProtocolContext } = await import('../protocolContext');
const { verifyProviderTransaction } = await import('../unpack');

const SIGNER = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';

const OUTPUTS: AnalyzedOutput[] = [
  { index: 0, value: 10_000, type: 'witness_v0_keyhash', address: SIGNER },
];

const INPUTS = [{ txid: 'a'.repeat(64), vout: 0 }];
const VAULT = 'bc1qglv8hh3l23y0qu5uw4zu7e8q4td0gcjsa8f3tq';
const PAYMENT_INTENT = parseBitcoinPaymentIntent({
  standard: 'xcp-wallet/bitcoin-payment',
  version: 1,
  action: 'pay',
  outputs: [{ address: VAULT, amountSats: 21_600 }],
  description: 'Fund Emblem Vault',
});
const LISTING_TXID = 'ab'.repeat(32);
const LISTING_INTENT = parseMarketplaceIntent({
  standard: 'counterparty-marketplace',
  version: 1,
  action: 'create_listing',
  operationId: 'preflight-1',
  protocolVersion: 'counterparty_attach_listing_v1',
  assets: [{
    asset: 'RAREPEPE',
    quantityRaw: '1',
    sourceOutpoint: { txid: LISTING_TXID, vout: 4 },
  }],
  seller: SIGNER,
  priceSats: 250_000,
  carrierValueSats: 546,
  guaranteedSellerPaymentSats: 250_546,
  delivery: { mode: 'buyer_selected_detach' },
  signingRequestExpiresAt: 2_000_000_000,
  marketplaceExpiresAt: null,
  bitcoinExpiresAt: null,
});

/** An input carrying assets, at the given index. */
function withAssets(inputIndex: number): InputAttachedAssets {
  return {
    inputIndex,
    utxo: `${'a'.repeat(64)}:${inputIndex}`,
    assets: [{ asset: 'XCP', quantity_normalized: '1.0' }],
  };
}

function run(overrides: Partial<Parameters<typeof analyzeSignRequest>[0]> = {}) {
  return analyzeSignRequest({
    counterpartyDataHex: undefined,
    inputs: INPUTS,
    outputs: OUTPUTS,
    signerAddresses: [SIGNER],
    signedInputIndices: [0],
    signedInputs: [{ index: 0, sighashType: 0x01 }],
    transactionId: undefined,
    attachedAssets: Promise.resolve([]),
    ...overrides,
  });
}

const blockedOnNotCounterparty = (warnings: { title: string }[]) =>
  warnings.some((w) => w.title === 'Blocked: Not a Counterparty Transaction');

describe('the not-a-Counterparty-transaction gate', () => {
  beforeEach(() => {
    vi.mocked(verifyProviderTransaction).mockReturnValue({ localUnpack: undefined } as never);
    vi.mocked(resolveProtocolContext).mockResolvedValue({
      context: {} as ProtocolContext,
      warnings: [],
    });
  });

  it('blocks a transaction carrying no message and spending nothing attached', async () => {
    const analysis = await run();

    expect(analysis.safety.blocked).toBe(true);
    expect(blockedOnNotCounterparty(analysis.safety.warnings)).toBe(true);
    // The block is stated first, ahead of whatever else the outputs earned.
    expect(analysis.safety.warnings[0]?.title).toBe('Blocked: Not a Counterparty Transaction');
  });

  it('allows a transaction that carries a Counterparty message', async () => {
    const analysis = await run({ counterpartyDataHex: '434e5452505254590a00' });

    expect(blockedOnNotCounterparty(analysis.safety.warnings)).toBe(false);
  });

  it('allows a transaction spending an input that carries attached assets', async () => {
    const analysis = await run({ attachedAssets: Promise.resolve([withAssets(0)]) });

    expect(blockedOnNotCounterparty(analysis.safety.warnings)).toBe(false);
  });

  it('still blocks when the attached assets sit on an input this wallet is not signing', async () => {
    // Assets on an input we do not sign are somebody else's side of the transaction, so they are
    // no reason to sign a transaction that does nothing for us.
    const analysis = await run({
      attachedAssets: Promise.resolve([withAssets(3)]),
      signedInputIndices: [0],
    });

    expect(analysis.safety.blocked).toBe(true);
    expect(blockedOnNotCounterparty(analysis.safety.warnings)).toBe(true);
  });
});

describe('the separate plain Bitcoin payment capability', () => {
  beforeEach(() => {
    vi.mocked(verifyProviderTransaction).mockReturnValue({ localUnpack: undefined } as never);
    vi.mocked(resolveProtocolContext).mockResolvedValue({
      context: {} as ProtocolContext,
      warnings: [],
    });
  });

  const payment = (overrides: Partial<Parameters<typeof analyzeSignRequest>[0]> = {}) => run({
    signingPurpose: 'bitcoin-payment',
    bitcoinPaymentIntent: PAYMENT_INTENT,
    outputs: [
      { index: 0, value: 21_600, type: 'witness_v0_keyhash', address: VAULT },
      { index: 1, value: 28_982, type: 'witness_v0_keyhash', address: SIGNER },
    ],
    ...overrides,
  });

  it('allows an exact declared payment after proving clean signed inputs', async () => {
    const analysis = await payment();

    expect(analysis.safety.blocked).toBe(false);
    expect(analysis.bitcoinPaymentProof).toMatchObject({
      proved: true,
      totalSats: 21_600,
      outputs: [{ index: 0, address: VAULT, amountSats: 21_600 }],
    });
    expect(analysis.safety.warnings).not.toContainEqual(expect.objectContaining({
      title: 'Bitcoin Payment',
    }));
  });

  it.each([
    {
      name: 'changed destination',
      overrides: {
        outputs: [{
          index: 0, value: 21_600, type: 'witness_v0_keyhash',
          address: 'bc1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq9e75rs',
        }],
      },
    },
    {
      name: 'Counterparty payload',
      overrides: { counterpartyDataHex: '434e5452505254590a00' },
    },
    {
      name: 'attached asset',
      overrides: { attachedAssets: Promise.resolve([withAssets(0)]) },
    },
    {
      name: 'unknown asset status',
      overrides: {
        attachedAssets: Promise.resolve([{
          inputIndex: 0, utxo: `${'a'.repeat(64)}:0`, assets: [], lookupFailed: true,
        }]),
      },
    },
  ])('blocks $name rather than trusting the site or origin', async ({ overrides }) => {
    const analysis = await payment(overrides);
    expect(analysis.safety.blocked).toBe(true);
    expect(analysis.safety.warnings[0]?.severity).toBe('block');
  });
});

describe('the marketplace intent proof', () => {
  const listing = (overrides: Partial<Parameters<typeof analyzeSignRequest>[0]> = {}) => run({
    marketplaceIntent: LISTING_INTENT,
    inputs: [
      { index: 0, txid: '0'.repeat(64), vout: 0, hasSignatures: false },
      { index: 1, txid: LISTING_TXID, vout: 4, address: SIGNER, value: 546 },
    ],
    outputs: [
      { index: 0, value: 546, type: 'witness_v0_keyhash', address: SIGNER },
      { index: 1, value: 250_546, type: 'witness_v0_keyhash', address: SIGNER },
    ],
    signedInputIndices: [1],
    signedInputs: [{ index: 1, sighashType: 0x83 }],
    attachedAssets: Promise.resolve([{
      inputIndex: 1,
      utxo: `${LISTING_TXID}:4`,
      assets: [{
        asset: 'RAREPEPE',
        quantity: '1',
        quantity_normalized: '1',
      }],
    }]),
    ...overrides,
  });

  it('allows the proved listing and returns semantic terms', async () => {
    const analysis = await listing();

    expect(analysis.safety.blocked).toBe(false);
    expect(analysis.marketplaceReview).toMatchObject({
      status: 'caution',
      family: 'create_listing',
      blockers: [],
    });
    expect(analysis.attachedAssetDestination).toMatchObject({
      destinationCommitted: false,
      mode: 'flexible',
    });
  });

  it('hard-blocks a site claim whose seller payment differs from the PSBT', async () => {
    const analysis = await listing({
      outputs: [
        { index: 0, value: 546, type: 'witness_v0_keyhash', address: SIGNER },
        { index: 1, value: 250_545, type: 'witness_v0_keyhash', address: SIGNER },
      ],
    });

    expect(analysis.safety.blocked).toBe(true);
    expect(analysis.safety.warnings[0]?.title).toBe('Blocked: Marketplace Intent Mismatch');
  });
});

describe('policy warnings from the ledger lookups', () => {
  beforeEach(() => {
    vi.mocked(verifyProviderTransaction).mockReturnValue({ localUnpack: undefined } as never);
  });

  it('escalates a blocking policy warning and puts it ahead of the rest', async () => {
    vi.mocked(resolveProtocolContext).mockResolvedValue({
      context: {} as ProtocolContext,
      warnings: [{ severity: 'block', title: 'Blocked: Oracle Dispenser', message: 'x' }],
    });

    const analysis = await run({ counterpartyDataHex: '434e5452505254590a00' });

    expect(analysis.safety.blocked).toBe(true);
    expect(analysis.safety.warnings[0]?.title).toBe('Blocked: Oracle Dispenser');
  });

  it('carries a non-blocking policy warning through without blocking', async () => {
    vi.mocked(resolveProtocolContext).mockResolvedValue({
      context: {} as ProtocolContext,
      warnings: [{ severity: 'warning', title: 'Priced by an oracle', message: 'x' }],
    });

    const analysis = await run({ counterpartyDataHex: '434e5452505254590a00' });

    expect(analysis.safety.blocked).toBe(false);
    expect(analysis.safety.warnings.some((w) => w.title === 'Priced by an oracle')).toBe(true);
  });
});

describe('reading the message', () => {
  beforeEach(() => {
    vi.mocked(resolveProtocolContext).mockResolvedValue({
      context: {} as ProtocolContext,
      warnings: [],
    });
  });

  it('survives a decode failure rather than failing the whole analysis', async () => {
    // The API's rendering is for display only, so losing it must not stop the checks that matter.
    vi.mocked(verifyProviderTransaction).mockReturnValue({ localUnpack: undefined } as never);
    vi.mocked(decodeCounterpartyMessage).mockRejectedValueOnce(new Error('API down'));

    const analysis = await run({ counterpartyDataHex: '434e5452505254590a00' });

    expect(analysis.counterpartyMessage).toBeUndefined();
    expect(analysis.safety).toBeDefined();
  });

  it('describes an mpma_send from the bytes, replacing the API description', async () => {
    vi.mocked(verifyProviderTransaction).mockReturnValue({
      localUnpack: { messageType: 'mpma_send', data: { sends: [{ asset: 'XCP' }] } },
    } as never);
    vi.mocked(decodeCounterpartyMessage).mockResolvedValueOnce({
      messageType: 'mpma_send',
      description: 'whatever the API said',
    } as never);
    vi.mocked(resolveMpmaRecipients).mockResolvedValueOnce([
      { address: SIGNER, asset: 'XCP', quantity_normalized: '1.0' },
    ] as never);

    const analysis = await run({ counterpartyDataHex: '434e545250525459030' });

    expect(analysis.mpmaRecipients).toHaveLength(1);
    expect(analysis.counterpartyMessage?.description).toBe('described locally');
  });
});
