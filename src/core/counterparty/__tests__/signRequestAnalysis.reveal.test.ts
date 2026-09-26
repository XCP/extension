/**
 * What the approval screen is told about a Taproot commit, with and without the site's reveal.
 *
 * With a proved reveal the commit is a Counterparty transaction: the reveal's message is its
 * payload, so it passes the Counterparty-only gate and every message check runs on it. Without
 * one, an output that could fund a reveal is opaque, and the user is told what it could do to
 * their assets — but only when the commit is funded from their address, since that is who
 * Counterparty would credit.
 *
 * Network lookups are mocked; the transaction bytes, the envelope and the local decode are real.
 */

import { bytesToHex } from '@noble/hashes/utils.js';
import { getPublicKey } from '@noble/secp256k1';
import { p2wpkh } from '@scure/btc-signer';
import { describe, expect, it, vi } from 'vitest';
import { parseBitcoinPaymentIntent } from '@/core/bitcoin/providerPayment';
import { extractPsbtDetails } from '@/core/bitcoin/psbt';
import { packComposeMessage } from '@/core/counterparty/pack/messages';
import type { ProtocolContext } from '../protocolContext';
import { analyzeSignRequest } from '../signRequestAnalysis';
import {
  buildCommit,
  buildReveal,
  dataEnvelope,
  OTHER_ADDRESS,
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

const RECIPIENTS = Array.from({ length: 3 }, (_, i) =>
  p2wpkh(getPublicKey(new Uint8Array(32).fill(10 + i), true)).address!);
const MPMA_HEX = bytesToHex(packComposeMessage('mpma', {
  assets: 'PEPECASH,PEPECASH,PEPECASH',
  destinations: RECIPIENTS.join(','),
  quantities: '1,2,3',
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
    expect(codes(analysis)).not.toContain('unproven_script_output');
    expect(codes(analysis)).not.toContain('counterparty_only_gate');
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
});

describe('a script-address output without a reveal', () => {
  const payIntent = (address: string, amountSats: number) => parseBitcoinPaymentIntent({
    standard: 'xcp-wallet/bitcoin-payment',
    version: 1,
    action: 'pay',
    outputs: [{ address, amountSats }],
  });

  // Today's CounterwalletV2 shape: the commit sent as a plain Bitcoin payment.
  it('cautions, without blocking, on a payment the user funds', async () => {
    const commit = buildCommit(dataEnvelope(MPMA_HEX));
    const commitAddress = extractPsbtDetails(commit.psbtHex).outputs[0]!.address!;
    const analysis = await analyze(commit.psbtHex, {
      signingPurpose: 'bitcoin-payment',
      bitcoinPaymentIntent: payIntent(commitAddress, 600),
    });

    expect(analysis.bitcoinPaymentProof?.proved).toBe(true);
    expect(analysis.safety.blocked).toBe(false);
    expect(analysis.safety.warnings).toContainEqual(expect.objectContaining({
      code: 'unproven_script_output',
      severity: 'warning',
      data: { totalSats: 600, addresses: [commitAddress] },
    }));
  });

  it('stays quiet for a key-hash address, which no reveal can spend', async () => {
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
  });

  // Counterparty credits the commit's first input; here that is someone else.
  it('stays quiet when the first input is not this wallet’s', async () => {
    const commit = buildCommit(dataEnvelope(MPMA_HEX), { funder: OTHER_ADDRESS });
    const analysis = await analyze(commit.psbtHex);

    expect(codes(analysis)).not.toContain('unproven_script_output');
  });

  it('still refuses a plain Bitcoin commit through the Counterparty method', async () => {
    const commit = buildCommit(dataEnvelope(MPMA_HEX));
    const analysis = await analyze(commit.psbtHex);

    expect(analysis.safety.blocked).toBe(true);
    expect(codes(analysis)).toContain('counterparty_only_gate');
    expect(codes(analysis)).toContain('unproven_script_output');
  });
});
