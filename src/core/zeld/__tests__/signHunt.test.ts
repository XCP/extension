import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import * as secp from '@noble/secp256k1';
import * as btc from '@scure/btc-signer';
import { describe, expect, it, vi } from 'vitest';
import { AddressFormat } from '@/core/bitcoin/address';
import { parseRawTransactionLocally } from '@/core/bitcoin/localTransactionParse';
import type { HuntTxidResult } from '@/core/zeld/hunt';
import { huntsWhileSigning, huntZeldWhileSigning } from '@/core/zeld/signHunt';
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

  it('falls back to null when the budget runs out or the hunt is aborted', async () => {
    for (const status of ['not_found', 'aborted'] as const) {
      const hunt = vi.fn(async (): Promise<HuntTxidResult> => ({ status, attempts: 3, elapsedMs: 4 }));
      expect(await huntZeldWhileSigning({ ...context, hunt })).toBeNull();
      expect(hunt).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'legacy' }),
        expect.objectContaining({ seconds: 5, targetZeros: 2, stopZeros: 2 }),
      );
    }
  });

  it('refuses a hunt result whose txid the signed bytes do not produce', async () => {
    const hunt = vi.fn(async (): Promise<HuntTxidResult> => ({
      status: 'found', nonce: 7, txid: 'f'.repeat(64), zeroCount: 6, attempts: 1, elapsedMs: 1,
    }));
    await expect(huntZeldWhileSigning({ ...context, hunt })).rejects.toThrow('does not hash to the txid found');
  });
});
