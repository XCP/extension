/**
 * An issuance that locks (or resets) supply, built as real transaction bytes and read back through
 * the approval path a site's request takes: `decodeTransactionForApproval` (local parse, local
 * unpack, provider verification) then `getTxActionInfo`. Only the network is simulated: the input's
 * prevout and Core's own decode of the message.
 */
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { p2wpkh, Script, Transaction } from '@scure/btc-signer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { packComposeMessage } from '@/core/counterparty/pack/messages';
import { arc4 } from '@/core/counterparty/unpack/binary';

const state = vi.hoisted(() => ({
  prevouts: new Map<string, { value: number; address: string }>(),
  apiMessage: null as null | { messageType: string; messageTypeId: number; messageData: Record<string, unknown>; description: string },
}));

vi.mock('@/core/counterparty/transaction', async importOriginal => ({
  ...(await importOriginal<typeof import('@/core/counterparty/transaction')>()),
  fetchInputPrevouts: async () => state.prevouts,
  decodeCounterpartyMessage: async () => state.apiMessage,
}));
vi.mock('@/core/counterparty/inputAssets', () => ({ fetchInputsAttachedAssets: async () => [] }));
vi.mock('@/core/counterparty/assetHoldings', () => ({ addressHoldsCounterpartyAssets: async () => false }));

import { decodeTransactionForApproval } from '@/core/bitcoin/transactionApprovalDecoder';
import { getTxActionInfo } from './tx-action-info';

const signer = p2wpkh(secp256k1.getPublicKey(new Uint8Array(32).fill(5)));

/** A reissuance of `LOCKME` with no new supply, carrying the lock/reset switches given. */
function issuanceTx(switches: { lock?: boolean; reset?: boolean }): string {
  const packed = packComposeMessage('issuance', {
    asset: 'LOCKME', quantity: 0n, divisible: true, description: '', ...switches,
  });
  if (!packed) throw new Error('issuance did not pack');
  const prevTxid = bytesToHex(new Uint8Array(32).fill(3));
  const tx = new Transaction({ allowUnknownOutputs: true });
  tx.addInput({ txid: prevTxid, index: 0 });
  // Core's obfuscation: ARC4 keyed by the first input's txid.
  tx.addOutput({ script: Script.encode(['RETURN', arc4(hexToBytes(prevTxid), packed.bytes)]), amount: 0n });
  tx.addOutput({ script: signer.script, amount: 99_000n });
  state.prevouts = new Map([[`${prevTxid}:0`, { value: 100_000, address: signer.address! }]]);
  return tx.hex;
}

function coreDecode(switches: { lock?: boolean; reset?: boolean }) {
  return {
    messageType: 'issuance', messageTypeId: 22, description: 'Issuance',
    messageData: {
      asset: 'LOCKME', quantity: 0, divisible: true, lock: switches.lock === true,
      reset: switches.reset === true, description: '', status: 'valid',
    },
  };
}

async function approval(switches: { lock?: boolean; reset?: boolean }, withCore = true) {
  state.apiMessage = withCore ? coreDecode(switches) : null;
  const decoded = await decodeTransactionForApproval(issuanceTx(switches), signer.address);
  expect(decoded.verification?.localUnpack?.messageType).toMatch(/issuance/);
  return getTxActionInfo(decoded, decoded.protocolContext);
}

describe('issuance lock and reset on the approval screen', () => {
  beforeEach(() => {
    state.apiMessage = null;
  });

  it.each([true, false])('states that the supply will be locked (Core decode available: %s)', async withCore => {
    const info = await approval({ lock: true }, withCore);
    expect(info?.protocol).toContainEqual(expect.objectContaining({
      label: 'Lock', value: 'Yes - supply can never be increased again',
    }));
    expect(info?.protocol.some(field => field.label === 'Reset')).toBe(false);
  });

  it('states that the supply will be reset', async () => {
    const info = await approval({ reset: true });
    expect(info?.protocol).toContainEqual(expect.objectContaining({
      label: 'Reset', value: 'Yes - existing supply is destroyed and replaced',
    }));
  });

  it('adds neither row to a plain reissuance', async () => {
    const info = await approval({});
    expect(info?.protocol.some(field => field.label === 'Lock' || field.label === 'Reset')).toBe(false);
  });
});
