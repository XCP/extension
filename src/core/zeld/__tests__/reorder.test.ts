import { hexToBytes } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';
import { parseRawTransactionLocally } from '@/core/bitcoin/localTransactionParse';
import { parsePSBT } from '@/core/bitcoin/psbt';
import { parseConsensusTransaction } from '@/core/bitcoin/rawTransaction';
import { assertTransactionMatchesReviewed, parseTransactionForIntegrity } from '@/core/bitcoin/transactionIntegrity';
import { assertOnlyOutputOrderChanged, psbtWithChangeFirst, withChangeFirst } from '@/core/zeld/reorder';
import { enhancedSendRawTx, opReturnScript, PREV_TXID, psbtHexFor, SOURCE_ADDRESS, SOURCE_P2WPKH, unsignedRawTx } from './fixtures';

const otherScript = hexToBytes('0014' + '7'.repeat(40));
const btcSend = () => unsignedRawTx({
  inputs: [{ txid: PREV_TXID, index: 0, sequence: 0xfffffffd }, { txid: PREV_TXID, index: 3 }],
  outputs: [{ script: otherScript, amount: 5_000n }, { script: SOURCE_P2WPKH.script, amount: 90_000n }],
});
const dispense = () => unsignedRawTx({
  outputs: [
    { script: otherScript, amount: 20_000n },
    { script: opReturnScript(10), amount: 0n },
    { script: SOURCE_P2WPKH.script, amount: 70_000n },
  ],
});

describe('withChangeFirst', () => {
  it('moves the change output to position 0 and keeps everything else', () => {
    const original = btcSend();
    const result = withChangeFirst(original, SOURCE_ADDRESS);
    expect(result.movedFrom).toBe(1);
    const parsed = parseRawTransactionLocally(result.rawtransaction)!;
    expect(parsed.outputs.map(o => o.value)).toEqual([90_000, 5_000]);
    expect(parsed.outputs[0]?.script).toBe(Buffer.from(SOURCE_P2WPKH.script).toString('hex'));
    const tx = parseConsensusTransaction(result.rawtransaction);
    expect(tx.getInput(0).sequence).toBe(0xfffffffd);
    expect(tx.getInput(1).index).toBe(3);
    expect(() => assertOnlyOutputOrderChanged(original, result.rawtransaction)).not.toThrow();
  });

  it('puts change ahead of both the dispenser output and the data output of a dispense', () => {
    const result = withChangeFirst(dispense(), SOURCE_ADDRESS);
    expect(result.movedFrom).toBe(2);
    const parsed = parseRawTransactionLocally(result.rawtransaction)!;
    expect(parsed.outputs.map(o => o.type)).toEqual(['address', 'address', 'op_return']);
    expect(parsed.outputs[0]?.value).toBe(70_000);
    expect(parsed.outputs[1]?.value).toBe(20_000);
  });

  it('leaves a transaction alone when change is already first among all outputs', () => {
    const raw = unsignedRawTx({ outputs: [{ script: SOURCE_P2WPKH.script, amount: 1n }, { script: otherScript, amount: 2n }] });
    expect(withChangeFirst(raw, SOURCE_ADDRESS)).toEqual({ rawtransaction: raw });
  });

  it('moves change ahead of a data output too, which is why callers restrict it to shapes that allow that', () => {
    // An enhanced send is [OP_RETURN, change]; the helper would put change before the data.
    // `composeSend` only asks for change first on BTC sends, and `composeDispense` on dispenses.
    const result = withChangeFirst(enhancedSendRawTx(), SOURCE_ADDRESS);
    expect(result.movedFrom).toBe(1);
  });

  it('leaves a transaction with no change output alone', () => {
    const raw = unsignedRawTx({ outputs: [{ script: otherScript, amount: 2n }] });
    expect(withChangeFirst(raw, SOURCE_ADDRESS)).toEqual({ rawtransaction: raw });
    expect(withChangeFirst('zz', SOURCE_ADDRESS)).toEqual({ rawtransaction: 'zz' });
  });
});

describe('assertOnlyOutputOrderChanged', () => {
  it('rejects a changed output value or a changed input', () => {
    const original = btcSend();
    const tampered = unsignedRawTx({
      inputs: [{ txid: PREV_TXID, index: 0, sequence: 0xfffffffd }, { txid: PREV_TXID, index: 3 }],
      outputs: [{ script: SOURCE_P2WPKH.script, amount: 90_001n }, { script: otherScript, amount: 5_000n }],
    });
    expect(() => assertOnlyOutputOrderChanged(original, tampered)).toThrow('changed an output');
    const otherInput = unsignedRawTx({
      inputs: [{ txid: PREV_TXID, index: 1, sequence: 0xfffffffd }, { txid: PREV_TXID, index: 3 }],
      outputs: [{ script: SOURCE_P2WPKH.script, amount: 90_000n }, { script: otherScript, amount: 5_000n }],
    });
    expect(() => assertOnlyOutputOrderChanged(original, otherInput)).toThrow('changed input 0');
  });
});

describe('psbtWithChangeFirst', () => {
  it('reorders the PSBT to match the reordered raw transaction and keeps witness data', () => {
    const original = btcSend();
    const reordered = withChangeFirst(original, SOURCE_ADDRESS);
    const psbt = psbtWithChangeFirst(psbtHexFor(original), SOURCE_ADDRESS);
    const parsed = parsePSBT(psbt);
    expect(parsed.getInput(0).witnessUtxo?.amount).toBe(100_000n);
    expect(() => assertTransactionMatchesReviewed(parsed, parseTransactionForIntegrity(reordered.rawtransaction))).not.toThrow();
  });
});
