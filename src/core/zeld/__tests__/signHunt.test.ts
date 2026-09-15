import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import * as secp from '@noble/secp256k1';
import * as btc from '@scure/btc-signer';
import { describe, expect, it, vi } from 'vitest';
import { AddressFormat } from '@/core/bitcoin/address';
import { parseRawTransactionLocally } from '@/core/bitcoin/localTransactionParse';
import { huntsWhileSigning } from '@/core/zeld/eligibility';
import type { HuntTxidResult } from '@/core/zeld/hunt';
import { huntTxid } from '@/core/zeld/hunt';
import { huntZeldWhileSigning } from '@/core/zeld/signHunt';
import { opReturnScript, PREV_TXID } from './fixtures';

const PRIVATE_KEY_HEX = '2'.repeat(64);
const pubkey = secp.getPublicKey(hexToBytes(PRIVATE_KEY_HEX), true);
const own = btc.p2pkh(pubkey);
const OWN_SCRIPT = bytesToHex(own.script);
const OTHER_SCRIPT = '76a914' + 'cd'.repeat(20) + '88ac';

function legacySend(changeScript = own.script): string {
  const tx = new btc.Transaction({ allowUnknownOutputs: true, allowUnknownInputs: true });
  tx.addInput({ txid: hexToBytes(PREV_TXID), index: 0, sequence: 0xfffffffd });
  tx.addOutput({ script: opReturnScript(), amount: 0n });
  tx.addOutput({ script: changeScript, amount: 95_000n });
  return bytesToHex(tx.toBytes(true, false));
}

const context = {
  rawTxHex: legacySend(),
  sourceAddress: own.address!,
  lockScripts: [OWN_SCRIPT],
  privateKeyHex: PRIVATE_KEY_HEX,
  compressed: true,
  seconds: 5,
  targetZeros: 2,
};

describe('huntsWhileSigning', () => {
  it('is true for software wallets on legacy formats only', () => {
    expect(huntsWhileSigning(AddressFormat.P2PKH, 'mnemonic')).toBe(true);
    expect(huntsWhileSigning(AddressFormat.Counterwallet, 'privateKey')).toBe(true);
    expect(huntsWhileSigning(AddressFormat.FreewalletBIP39, 'mnemonic')).toBe(true);
    expect(huntsWhileSigning(AddressFormat.P2PKH, 'hardware')).toBe(false);
    expect(huntsWhileSigning(AddressFormat.P2WPKH, 'mnemonic')).toBe(false);
    expect(huntsWhileSigning(AddressFormat.P2SH_P2WPKH, 'mnemonic')).toBe(false);
  });
});

describe('huntZeldWhileSigning', () => {
  it.each([true, false])('combines signatures for a multi-input spend (compressed=%s)', async compressed => {
    const payment = btc.p2pkh(secp.getPublicKey(hexToBytes(PRIVATE_KEY_HEX), compressed));
    const tx = new btc.Transaction({ allowUnknownOutputs: true });
    for (let i = 0; i < 3; i++) tx.addInput({ txid: hexToBytes(PREV_TXID), index: i });
    tx.addOutput({ script: payment.script, amount: 90_000n });
    const hunt = vi.fn(huntTxid);
    const result = await huntZeldWhileSigning({ ...context, compressed, rawTxHex: bytesToHex(tx.toBytes(true, false)),
      sourceAddress: payment.address!, lockScripts: Array(3).fill(bytesToHex(payment.script)), hunt });
    expect(hunt.mock.calls[0]?.[0].kind).toBe('legacy-signature-pool');
    expect(result?.txid.startsWith('00')).toBe(true);
    const parsed = btc.Transaction.fromRaw(hexToBytes(result!.signedTxHex), { allowUnknownOutputs: true });
    expect(parsed.inputsLength).toBe(3);
    expect(parsed.getOutput(0).amount).toBe(90_000n);
  }, 15_000);

  it('retains parallel legacy hunting on runtimes with Worker support', async () => {
    const tx = new btc.Transaction({ allowUnknownOutputs: true });
    for (let i = 0; i < 2; i++) tx.addInput({ txid: hexToBytes(PREV_TXID), index: i });
    tx.addOutput({ script: own.script, amount: 90_000n });
    const hunt = vi.fn<typeof huntTxid>(async () => ({ status: 'not_found', attempts: 0, elapsedMs: 0 }));
    vi.stubGlobal('Worker', class {});
    try {
      await huntZeldWhileSigning({ ...context, rawTxHex: bytesToHex(tx.toBytes(true, false)),
        lockScripts: [OWN_SCRIPT, OWN_SCRIPT], hunt });
      expect(hunt.mock.calls[0]?.[0]).toMatchObject({ kind: 'legacy' });
    } finally { vi.unstubAllGlobals(); }
  });

  it('returns a signed transaction with a rare txid that parses and matches the reviewed one', async () => {
    const result = await huntZeldWhileSigning(context);
    expect(result).not.toBeNull();
    expect(result!.txid.startsWith('00')).toBe(true);
    const parsed = parseRawTransactionLocally(result!.signedTxHex)!;
    expect(parsed.txid).toBe(result!.txid);
    expect(parsed.outputs.map(o => o.value)).toEqual([0, 95_000]);
    expect(parsed.inputs[0]?.txid).toBe(PREV_TXID);
    const tx = btc.Transaction.fromRaw(hexToBytes(result!.signedTxHex), { allowUnknownOutputs: true, allowUnknownInputs: true });
    expect(tx.lockTime).toBe(result!.nonce);
    expect(tx.getInput(0).finalScriptSig?.length).toBeGreaterThan(100);
  });

  it("signs nothing when an input is not the key's own P2PKH output", async () => {
    const hunt = vi.fn();
    expect(await huntZeldWhileSigning({ ...context, lockScripts: [OTHER_SCRIPT], hunt })).toBeNull();
    expect(hunt).not.toHaveBeenCalled();
  });

  it('signs nothing when the first spendable output pays someone else', async () => {
    const hunt = vi.fn();
    expect(await huntZeldWhileSigning({ ...context, rawTxHex: legacySend(hexToBytes(OTHER_SCRIPT)), hunt })).toBeNull();
    expect(hunt).not.toHaveBeenCalled();
  });

  it('signs nothing with a zero budget or a script count that does not match the inputs', async () => {
    const hunt = vi.fn();
    expect(await huntZeldWhileSigning({ ...context, seconds: 0, hunt })).toBeNull();
    expect(await huntZeldWhileSigning({ ...context, lockScripts: [OWN_SCRIPT, OWN_SCRIPT], hunt })).toBeNull();
    expect(hunt).not.toHaveBeenCalled();
  });

  it('falls back to null when the budget runs out', async () => {
    for (const status of ['not_found'] as const) {
      const hunt = vi.fn(async (): Promise<HuntTxidResult> => ({ status, attempts: 3, elapsedMs: 4 }));
      expect(await huntZeldWhileSigning({ ...context, hunt })).toBeNull();
      expect(hunt).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'legacy' }),
        expect.objectContaining({ seconds: 5, targetZeros: 2, stopZeros: 2 }),
      );
    }
  });

  it('throws on cancellation so callers cannot fall through to ordinary signing', async () => {
    const hunt = vi.fn(async (): Promise<HuntTxidResult> => ({ status: 'aborted', attempts: 3, elapsedMs: 4 }));
    await expect(huntZeldWhileSigning({ ...context, hunt })).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('withholds a result when the background session changes during hunting', async () => {
    let authorized = true;
    const assertStillAuthorized = () => { if (!authorized) throw new Error('Wallet session changed'); };
    const hunt = vi.fn(async (): Promise<HuntTxidResult> => {
      authorized = false;
      return { status: 'not_found', attempts: 3, elapsedMs: 4 };
    });
    await expect(huntZeldWhileSigning({ ...context, hunt, assertStillAuthorized })).rejects.toThrow('Wallet session changed');
  });

  it('refuses a hunt result whose txid the signed bytes do not produce', async () => {
    const hunt = vi.fn(async (): Promise<HuntTxidResult> => ({
      status: 'found', nonce: 7, txid: 'f'.repeat(64), zeroCount: 6, attempts: 1, elapsedMs: 1,
    }));
    await expect(huntZeldWhileSigning({ ...context, hunt })).rejects.toThrow('does not hash to the txid found');
  });
});
