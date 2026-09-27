/**
 * The effective sighash the approval review judges must be the one the signer will use. With no
 * sighash in the request or the PSBT, a Taproot input signs SIGHASH_DEFAULT (0x00), so that is what
 * the review, its marketplace proofs and its pricing must see; every other input signs ALL.
 */

import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { p2tr, p2wpkh, Transaction } from '@scure/btc-signer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPsbtApprovalPolicy } from '@/core/bitcoin/providerApprovalPolicy';
import { resolveProviderSignInputs } from '@/core/bitcoin/providerSigningPlan';
import { decodePsbtForApproval } from '@/core/bitcoin/psbtApprovalDecoder';
import { analyzeSignRequest } from '@/core/counterparty/signRequestAnalysis';

vi.mock('@/core/counterparty/signRequestAnalysis', () => ({
  analyzeSignRequest: vi.fn(async () => ({
    verification: { passed: true },
    safety: { blocked: false, warnings: [] },
    attachedAssets: [],
    mpmaRecipients: [],
    structureFindings: [],
    protocolContext: {},
    attachedAssetDestination: null,
  })),
}));
vi.mock('@/core/counterparty/inputAssets', async (original) => ({
  ...(await original<typeof import('@/core/counterparty/inputAssets')>()),
  fetchInputsAttachedAssets: vi.fn(async () => []),
}));

const PUBKEY = secp256k1.getPublicKey(hexToBytes('11'.repeat(32)), true);
const P2TR = p2tr(PUBKEY.slice(1), undefined, undefined, true);
const P2WPKH = p2wpkh(PUBKEY);

/** Two inputs paying `payment`, one output to it, 1 000 sats fee; no sighash field anywhere. */
function psbt(payment: { script: Uint8Array }, embedded?: number): string {
  const tx = new Transaction();
  for (const index of [0, 1]) {
    tx.addInput({
      txid: hexToBytes('77'.repeat(32)), index,
      witnessUtxo: { script: payment.script, amount: 50_000n },
      ...(embedded !== undefined ? { sighashType: embedded } : {}),
    });
  }
  tx.addOutput({ script: payment.script, amount: 99_000n });
  return bytesToHex(tx.toPSBT());
}

const signedInputsSeen = () => vi.mocked(analyzeSignRequest).mock.calls.at(-1)![0].signedInputs;

beforeEach(() => vi.mocked(analyzeSignRequest).mockClear());

describe('the sighash the approval review judges', () => {
  it('is SIGHASH_DEFAULT for a Taproot input with no sighash anywhere', async () => {
    await decodePsbtForApproval(psbt(P2TR), [P2TR.address!], [0, 1]);
    expect(signedInputsSeen()).toStrictEqual([{ index: 0, sighashType: 0x00 }, { index: 1, sighashType: 0x00 }]);
  });

  it('is ALL for a P2WPKH input with no sighash anywhere, as before', async () => {
    await decodePsbtForApproval(psbt(P2WPKH), [P2WPKH.address!], [0, 1]);
    expect(signedInputsSeen()).toStrictEqual([{ index: 0, sighashType: 0x01 }, { index: 1, sighashType: 0x01 }]);
  });

  it('is still the explicit request entry, then the embedded type, for a Taproot input', async () => {
    // A marketplace proof that requires ALL (0x01) is satisfied only by asking for it.
    await decodePsbtForApproval(psbt(P2TR), [P2TR.address!], [0, 1], [0x01, 0x01]);
    expect(signedInputsSeen()).toStrictEqual([{ index: 0, sighashType: 0x01 }, { index: 1, sighashType: 0x01 }]);
    await decodePsbtForApproval(psbt(P2TR, 0x81), [P2TR.address!], [0, 1]);
    expect(signedInputsSeen()).toStrictEqual([{ index: 0, sighashType: 0x81 }, { index: 1, sighashType: 0x81 }]);
  });
});

describe('the approval summary of a Taproot PSBT with no sighash', () => {
  it('prices and gates it exactly as one that asks for DEFAULT or ALL', async () => {
    const address = P2TR.address!;
    const decoded = await decodePsbtForApproval(psbt(P2TR), [address], [0, 1]);
    const policyFor = (sighashTypes?: number[]) =>
      getPsbtApprovalPolicy({ address, signInputs: { [address]: [0, 1] }, sighashTypes }, decoded, true, 10);
    expect(policyFor()).toStrictEqual(policyFor([0x00, 0x00]));
    expect(policyFor()).toStrictEqual(policyFor([0x01, 0x01]));
    expect(policyFor()).toMatchObject({ blocked: false });
  });

  it('passes intake, in explicit and best-effort form', async () => {
    const address = P2TR.address!;
    const { psbtDetails } = await decodePsbtForApproval(psbt(P2TR), [address], [0, 1]);
    expect(resolveProviderSignInputs(psbtDetails, address, { [address]: [0, 1] })).toStrictEqual({ [address]: [0, 1] });
    expect(resolveProviderSignInputs(psbtDetails, address)).toStrictEqual({ [address]: [0, 1] });
  });
});
