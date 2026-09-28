/**
 * What the approval screen is told about a Taproot commit, with and without the site's reveal.
 *
 * With a proved reveal the commit is a Counterparty transaction: the reveal's message is its
 * payload, so it passes the Counterparty-only gate and every message check runs on it, and the
 * review states what the reveal's outputs decide and what they pay. Without one, the commit is an
 * ordinary payment, analyzed as before the reveal work.
 *
 * Network lookups are mocked; the transaction bytes, the envelope and the local decode are real.
 */

import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { p2wpkh } from '@scure/btc-signer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseBitcoinPaymentIntent } from '@/core/bitcoin/providerPayment';
import { extractPsbtDetails } from '@/core/bitcoin/psbt';
import type { ProtocolContext } from '@/core/counterparty/describe';
import { packComposeMessage } from '@/core/counterparty/pack/messages';
import { analyzeSignRequest } from '../signRequestAnalysis';
import {
  buildCommit,
  buildReveal,
  dataEnvelope,
  OTHER_ADDRESS,
  payTo,
  USER_ADDRESS,
} from './helpers/revealFixtures';

// The address table is checked against the height elsewhere; these fixtures carry the legacy one.
vi.mock('@/core/counterparty/mpmaTableFormat', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/core/counterparty/mpmaTableFormat')>(),
  resolveMpmaTableFormat: vi.fn(async () => ({ format: 'legacy', nextBlockIndex: 971_000, activationHeight: 971_700 })),
}));
vi.mock('@/core/zeld/protection', () => ({
  classifyZeldOutpoints: async () => ({ bearing: [], unknown: [], clean: [] }),
}));

vi.mock('@/core/counterparty/transaction', () => ({
  decodeCounterpartyMessage: vi.fn(async () => null),
  resolveMpmaRecipients: vi.fn(async () => []),
  describeMpmaSend: vi.fn(() => 'described locally'),
}));

vi.mock('@/core/counterparty/protocolContext', () => ({
  resolveProtocolContext: vi.fn(async () => ({ context: {} as ProtocolContext, warnings: [] })),
}));

vi.mock('@/core/counterparty/api', () => ({
  fetchTokenBalances: vi.fn(async () => []),
  fetchOwnedAssets: vi.fn(async () => []),
}));

const api = await import('@/core/counterparty/api');

beforeEach(() => {
  vi.mocked(api.fetchTokenBalances).mockReset().mockResolvedValue([]);
  vi.mocked(api.fetchOwnedAssets).mockReset().mockResolvedValue([]);
});

const RECIPIENTS = Array.from({ length: 3 }, (_, i) =>
  p2wpkh(secp256k1.getPublicKey(new Uint8Array(32).fill(10 + i), true)).address!);
const MPMA_HEX = bytesToHex(packComposeMessage('mpma', {
  assets: 'PEPECASH,PEPECASH,PEPECASH',
  destinations: RECIPIENTS.join(','),
  quantities: '1,2,3',
}, undefined, { mpmaTableFormat: 'legacy' })!.bytes);
const ISSUANCE_HEX = bytesToHex(packComposeMessage('issuance', {
  asset: 'PEPECASH', quantity: 1, divisible: true, lock: false, reset: false, description: '',
})!.bytes);

function analyze(psbtHex: string, extra: Partial<Parameters<typeof analyzeSignRequest>[0]> = {}) {
  const details = extractPsbtDetails(psbtHex);
  return analyzeSignRequest({
    counterpartyDataHex: undefined,
    inputs: details.inputs,
    outputs: details.outputs,
    signerAddresses: [USER_ADDRESS],
    signedInputIndices: [0],
    signedInputs: [{ index: 0, sighashType: 0x01 }],
    transactionId: details.transactionId,
    attachedAssets: Promise.resolve([]),
    ...extra,
  });
}

const codes = (analysis: Awaited<ReturnType<typeof analyze>>) =>
  analysis.safety.warnings.map((warning) => warning.code);

const payIntent = (address: string, amountSats: number) => parseBitcoinPaymentIntent({
  standard: 'xcp-wallet/bitcoin-payment',
  version: 1,
  action: 'pay',
  outputs: [{ address, amountSats }],
});

describe('a Counterparty commit with its reveal', () => {
  it('becomes the Counterparty transaction the reveal publishes', async () => {
    const commit = buildCommit(dataEnvelope(MPMA_HEX));
    const analysis = await analyze(commit.psbtHex, { counterpartyReveal: buildReveal(commit) });

    expect(analysis.safety.blocked).toBe(false);
    expect(analysis.verification.localUnpack?.messageType).toBe('mpma_send');
    expect(analysis.verifiedCommit).toMatchObject({ value: 600, kind: 'reveal' });
    expect(codes(analysis)).toContain('counterparty_reveal_commit');
    // The commit output is the transaction's subject, not an unexplained payment.
    expect(codes(analysis)).not.toContain('external_btc_output');
    expect(codes(analysis)).not.toContain('counterparty_only_gate');
    // An MPMA is stated entirely in the message: no site-control disclosure, and a data-only
    // reveal is information, not a warning.
    expect(codes(analysis)).not.toContain('counterparty_reveal_site_control');
    expect(analysis.safety.warnings.find((w) => w.code === 'counterparty_reveal_outputs'))
      .toMatchObject({ severity: 'info', data: { externalSats: 0 } });
    expect(analysis.safety.warnings.some((w) => w.severity === 'warning')).toBe(false);
  });

  it('is blocked, with the reason first, when the reveal does not prove out', async () => {
    const commit = buildCommit(dataEnvelope(MPMA_HEX));
    const other = buildCommit(dataEnvelope(MPMA_HEX), { prevTxid: 'ab'.repeat(32) });
    const analysis = await analyze(commit.psbtHex, { counterpartyReveal: buildReveal(other) });

    expect(analysis.safety.blocked).toBe(true);
    expect(analysis.safety.warnings[0]).toMatchObject({
      code: 'counterparty_reveal_refused',
      severity: 'block',
      data: { reason: 'not_this_transaction' },
    });
    expect(analysis.verifiedCommit).toBeUndefined();
  });

  // Formerly refused. Now the action is shown with what the site decides, and the review step
  // is required because the site's outputs change what the issuance does.
  it('shows an issuance and discloses the ownership transfer the site can add', async () => {
    const commit = buildCommit(dataEnvelope(ISSUANCE_HEX));
    const analysis = await analyze(commit.psbtHex, { counterpartyReveal: buildReveal(commit) });

    expect(analysis.safety.blocked).toBe(false);
    expect(analysis.verification.localUnpack?.messageType).toBe('issuance');
    expect(analysis.safety.warnings.find((w) => w.code === 'counterparty_reveal_site_control')).toMatchObject({
      severity: 'warning',
      data: { control: 'issuance_transfer', asset: 'PEPECASH', supplied: { kind: 'no_transfer' } },
    });
  });

  it('states a reveal that pays someone else as a warning, naming the payee', async () => {
    const commit = buildCommit(dataEnvelope(MPMA_HEX));
    const analysis = await analyze(commit.psbtHex, {
      counterpartyReveal: buildReveal(commit, { trailing: [payTo(OTHER_ADDRESS, 330n)] }),
    });

    const outputs = analysis.safety.warnings.find((w) => w.code === 'counterparty_reveal_outputs');
    expect(outputs).toMatchObject({ severity: 'warning', data: { externalSats: 330 } });
    expect(outputs?.message).toContain(`330 sats to ${OTHER_ADDRESS} (not yours)`);
  });

  it('counts the other addresses of the wallet as its own in the reveal outputs', async () => {
    const commit = buildCommit(dataEnvelope(MPMA_HEX));
    const analysis = await analyze(commit.psbtHex, {
      counterpartyReveal: buildReveal(commit, { trailing: [payTo(OTHER_ADDRESS, 330n)] }),
      ownedAddresses: [OTHER_ADDRESS],
    });

    expect(analysis.safety.warnings.find((w) => w.code === 'counterparty_reveal_outputs'))
      .toMatchObject({ severity: 'info', data: { externalSats: 0 } });
  });
});

describe('a commit without a reveal', () => {
  it('is an ordinary payment when sent as a plain Bitcoin payment', async () => {
    const commit = buildCommit(dataEnvelope(MPMA_HEX));
    const commitAddress = extractPsbtDetails(commit.psbtHex).outputs[0]!.address!;
    const analysis = await analyze(commit.psbtHex, {
      signingPurpose: 'bitcoin-payment',
      bitcoinPaymentIntent: payIntent(commitAddress, 600),
    });

    expect(analysis.bitcoinPaymentProof?.proved).toBe(true);
    expect(analysis.safety.blocked).toBe(false);
    expect(analysis.safety.warnings.some((w) => w.severity === 'warning')).toBe(false);
  });

  it('still refuses a plain Bitcoin commit through the Counterparty method', async () => {
    const commit = buildCommit(dataEnvelope(MPMA_HEX));
    const analysis = await analyze(commit.psbtHex);

    expect(analysis.safety.blocked).toBe(true);
    expect(codes(analysis)).toContain('counterparty_only_gate');
  });
});

/**
 * A request with no reveal must be analyzed exactly as before the reveal work. The expected values below were produced by running these inputs
 * through `analyzeSignRequest` on origin/main (e164b041) with the same mocks.
 */
describe('without a reveal', () => {
  const plain = (value: unknown) => JSON.parse(JSON.stringify(value, (_key, v) =>
    typeof v === 'bigint' ? `${v}n` : v));

  it('is identical to main for a plain Bitcoin payment to a Taproot address', async () => {
    const commit = buildCommit(dataEnvelope(MPMA_HEX));
    const commitAddress = extractPsbtDetails(commit.psbtHex).outputs[0]!.address!;
    const analysis = await analyze(commit.psbtHex, {
      signingPurpose: 'bitcoin-payment',
      bitcoinPaymentIntent: payIntent(commitAddress, 600),
    });

    expect(plain(analysis)).toEqual(MAIN_BITCOIN_PAYMENT);
  });

  it('is identical to main for the same transaction through the Counterparty method', async () => {
    const commit = buildCommit(dataEnvelope(MPMA_HEX));
    const analysis = await analyze(commit.psbtHex);

    expect(plain(analysis)).toEqual(MAIN_COUNTERPARTY);
  });
});

// Generated on origin/main; see the describe block above.
const MAIN_BITCOIN_PAYMENT = {
  verification: {
    comparedAgainstApi: false,
    repackProved: false,
    mismatches: []
  },
  safety: {
    blocked: false,
    warnings: []
  },
  attachedAssets: [],
  mpmaRecipients: [],
  structureFindings: [],
  protocolContext: {},
  attachedAssetDestination: null,
  bitcoinPaymentProof: {
    proved: true,
    errors: [],
    outputs: [
      {
        index: 0,
        address: "bc1pzzv2fdvgn9l85am2x683x002279d602vl79ah0mvucxvlgal5vesnxszgg",
        amountSats: 600
      }
    ],
    totalSats: 600
  }
};
const MAIN_COUNTERPARTY = {
  verification: {
    comparedAgainstApi: false,
    repackProved: false,
    mismatches: []
  },
  safety: {
    blocked: true,
    warnings: [
      {
        code: "counterparty_only_gate",
        severity: "block",
        title: "Blocked: Not a Counterparty Transaction",
        message: "This carries no Counterparty message and spends nothing holding Counterparty assets, so signing it would move only bitcoin at a site’s direction. Make plain Bitcoin payments in the wallet, where you choose the destination."
      },
      {
        code: "external_btc_output",
        data: {
          totalSats: 600,
          addresses: [
            "bc1pzzv2fdvgn9l85am2x683x002279d602vl79ah0mvucxvlgal5vesnxszgg"
          ]
        },
        severity: "danger",
        title: "BTC Sent to External Address",
        message: "This transaction sends 0.00000600 BTC to an address that is not yours: bc1pzzv2fdvgn9l85am2x683x002279d602vl79ah0mvucxvlgal5vesnxszgg. Normal Counterparty transactions only send BTC back to your own address as change."
      }
    ]
  },
  attachedAssets: [],
  mpmaRecipients: [],
  structureFindings: [],
  protocolContext: {},
  attachedAssetDestination: null
};
