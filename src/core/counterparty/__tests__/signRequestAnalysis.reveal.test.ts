/**
 * What the approval screen is told about a Taproot commit, with and without the site's reveal.
 *
 * With a proved reveal the commit is a Counterparty transaction: the reveal's message is its
 * payload, so it passes the Counterparty-only gate and every message check runs on it, and the
 * review states what the reveal's outputs decide and what they pay. Without one, a payment to a
 * script address the wallet does not control carries a caution — but only when it is paid from the
 * user's address and that address has something to lose.
 *
 * Network lookups are mocked; the transaction bytes, the envelope and the local decode are real.
 */

import { bytesToHex } from '@noble/hashes/utils.js';
import { getPublicKey } from '@noble/secp256k1';
import { p2wpkh } from '@scure/btc-signer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseBitcoinPaymentIntent } from '@/core/bitcoin/providerPayment';
import { extractPsbtDetails } from '@/core/bitcoin/psbt';
import { packComposeMessage } from '@/core/counterparty/pack/messages';
import type { InputAttachedAssets } from '../inputAssets';
import type { ProtocolContext } from '../protocolContext';
import { analyzeSignRequest } from '../signRequestAnalysis';
import {
  buildCommit,
  buildReveal,
  dataEnvelope,
  OTHER_ADDRESS,
  payTo,
  USER_ADDRESS,
} from './helpers/revealFixtures';

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

// The payer's holdings: the real assetHoldings code runs against these reads.
vi.mock('@/core/counterparty/api', () => ({
  fetchTokenBalances: vi.fn(async () => []),
  fetchOwnedAssets: vi.fn(async () => []),
}));

const api = await import('@/core/counterparty/api');

beforeEach(() => {
  vi.mocked(api.fetchTokenBalances).mockReset().mockResolvedValue([]);
  vi.mocked(api.fetchOwnedAssets).mockReset().mockResolvedValue([]);
});

const holdsAssets = () =>
  vi.mocked(api.fetchTokenBalances).mockResolvedValue([{ asset: 'PEPECASH' }] as never);

const RECIPIENTS = Array.from({ length: 3 }, (_, i) =>
  p2wpkh(getPublicKey(new Uint8Array(32).fill(10 + i), true)).address!);
const MPMA_HEX = bytesToHex(packComposeMessage('mpma', {
  assets: 'PEPECASH,PEPECASH,PEPECASH',
  destinations: RECIPIENTS.join(','),
  quantities: '1,2,3',
})!.bytes);
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
    holdsAssets();
    const commit = buildCommit(dataEnvelope(MPMA_HEX));
    const analysis = await analyze(commit.psbtHex, { counterpartyReveal: buildReveal(commit) });

    expect(analysis.safety.blocked).toBe(false);
    expect(analysis.verification.localUnpack?.messageType).toBe('mpma_send');
    expect(analysis.verifiedCommit).toMatchObject({ value: 600, kind: 'reveal' });
    expect(codes(analysis)).toContain('counterparty_reveal_commit');
    // The commit output is the transaction's subject, not an unexplained payment.
    expect(codes(analysis)).not.toContain('external_btc_output');
    // Proved, so the script-address caution has nothing left to say, even for a holder.
    expect(codes(analysis)).not.toContain('unproven_script_output');
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

describe('a script-address output without a reveal', () => {
  // A commit sent as a plain Bitcoin payment, from an address that holds assets.
  it('cautions, without blocking, when the payer holds Counterparty assets', async () => {
    holdsAssets();
    const commit = buildCommit(dataEnvelope(MPMA_HEX));
    const commitAddress = extractPsbtDetails(commit.psbtHex).outputs[0]!.address!;
    const analysis = await analyze(commit.psbtHex, {
      signingPurpose: 'bitcoin-payment',
      bitcoinPaymentIntent: payIntent(commitAddress, 600),
    });

    expect(analysis.bitcoinPaymentProof?.proved).toBe(true);
    expect(analysis.safety.blocked).toBe(false);
    const caution = analysis.safety.warnings.find((w) => w.code === 'unproven_script_output');
    expect(caution).toMatchObject({
      severity: 'warning',
      data: { totalSats: 600, addresses: [commitAddress], source: USER_ADDRESS },
    });
    expect(caution?.message).toBe(
      `0.00000600 BTC goes to ${commitAddress}, a script address. Paying a script address can let its owner `
      + `move your Counterparty assets from ${USER_ADDRESS}. Only continue if you trust the recipient.`);
    expect(api.fetchTokenBalances).toHaveBeenCalledWith(USER_ADDRESS, expect.anything());
  });

  it('cautions for an address that owns an asset but holds no balance', async () => {
    vi.mocked(api.fetchOwnedAssets).mockResolvedValue([{ asset: 'PEPECASH' }] as never);
    const commit = buildCommit(dataEnvelope(MPMA_HEX));
    const commitAddress = extractPsbtDetails(commit.psbtHex).outputs[0]!.address!;
    const analysis = await analyze(commit.psbtHex, {
      signingPurpose: 'bitcoin-payment',
      bitcoinPaymentIntent: payIntent(commitAddress, 600),
    });

    expect(codes(analysis)).toContain('unproven_script_output');
  });

  it('stays quiet when the payer holds nothing', async () => {
    const commit = buildCommit(dataEnvelope(MPMA_HEX));
    const commitAddress = extractPsbtDetails(commit.psbtHex).outputs[0]!.address!;
    const analysis = await analyze(commit.psbtHex, {
      signingPurpose: 'bitcoin-payment',
      bitcoinPaymentIntent: payIntent(commitAddress, 600),
    });

    expect(codes(analysis)).not.toContain('unproven_script_output');
  });

  it('fails safe: cautions when the holdings cannot be read', async () => {
    vi.mocked(api.fetchTokenBalances).mockRejectedValue(new Error('API down'));
    const commit = buildCommit(dataEnvelope(MPMA_HEX));
    const commitAddress = extractPsbtDetails(commit.psbtHex).outputs[0]!.address!;
    const analysis = await analyze(commit.psbtHex, {
      signingPurpose: 'bitcoin-payment',
      bitcoinPaymentIntent: payIntent(commitAddress, 600),
    });

    expect(codes(analysis)).toContain('unproven_script_output');
  });

  it('cautions when an input carries attached assets, whatever the address holds', async () => {
    const commit = buildCommit(dataEnvelope(MPMA_HEX));
    const attached = [{
      inputIndex: 0, utxo: `${'ab'.repeat(32)}:0`,
      assets: [{ asset: 'PEPECASH', quantity_normalized: '1' }],
    }] as unknown as InputAttachedAssets[];
    const analysis = await analyze(commit.psbtHex, { attachedAssets: Promise.resolve(attached) });

    expect(codes(analysis)).toContain('unproven_script_output');
  });

  it('stays quiet for a key-hash address, without a lookup', async () => {
    holdsAssets();
    const tx = extractPsbtDetails(buildCommit(dataEnvelope(MPMA_HEX)).psbtHex);
    const outputs = tx.outputs.map((output, index) => index === 0
      ? { ...output, type: 'p2wpkh' as const, address: OTHER_ADDRESS,
          script: bytesToHex(p2wpkh(getPublicKey(new Uint8Array(32).fill(2), true)).script) }
      : output);
    const analysis = await analyzeSignRequest({
      counterpartyDataHex: undefined,
      inputs: tx.inputs,
      outputs,
      signerAddresses: [USER_ADDRESS],
      signedInputIndices: [0],
      signedInputs: [{ index: 0, sighashType: 0x01 }],
      transactionId: tx.transactionId,
      attachedAssets: Promise.resolve([]),
      signingPurpose: 'bitcoin-payment',
      bitcoinPaymentIntent: payIntent(OTHER_ADDRESS, 600),
    });

    expect(analysis.safety.blocked).toBe(false);
    expect(codes(analysis)).not.toContain('unproven_script_output');
    expect(api.fetchTokenBalances).not.toHaveBeenCalled();
  });

  it('stays quiet when someone else pays', async () => {
    holdsAssets();
    const commit = buildCommit(dataEnvelope(MPMA_HEX), { funder: OTHER_ADDRESS });
    const analysis = await analyze(commit.psbtHex);

    expect(codes(analysis)).not.toContain('unproven_script_output');
    expect(api.fetchTokenBalances).not.toHaveBeenCalled();
  });

  it('still refuses a plain Bitcoin commit through the Counterparty method', async () => {
    holdsAssets();
    const commit = buildCommit(dataEnvelope(MPMA_HEX));
    const analysis = await analyze(commit.psbtHex);

    expect(analysis.safety.blocked).toBe(true);
    expect(codes(analysis)).toContain('counterparty_only_gate');
    expect(codes(analysis)).toContain('unproven_script_output');
  });
});

/**
 * A request with no reveal, from an address with no Counterparty assets, must be analyzed exactly
 * as before the reveal work. The expected values below were produced by running these inputs
 * through `analyzeSignRequest` on origin/main (e164b041) with the same mocks.
 */
describe('without a reveal, from an address holding nothing', () => {
  const plain = (value: unknown) => JSON.parse(JSON.stringify(value, (_key, v) =>
    typeof v === 'bigint' ? `${v}n` : v));

  it('is identical to main for a plain Bitcoin payment to a Taproot address', async () => {
    const commit = buildCommit(dataEnvelope(MPMA_HEX));
    const commitAddress = extractPsbtDetails(commit.psbtHex).outputs[0]!.address!;
    const analysis = await analyze(commit.psbtHex, {
      signingPurpose: 'bitcoin-payment',
      bitcoinPaymentIntent: payIntent(commitAddress, 600),
    });

    expect(api.fetchTokenBalances).toHaveBeenCalled();
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
