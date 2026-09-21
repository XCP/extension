import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { Transaction } from '@scure/btc-signer';
import { describe, expect, it } from 'vitest';
import {
  decodeRawTransaction,
  MAX_RAW_TRANSACTION_BYTES,
  parseTransactionForSigning,
} from '@/core/bitcoin/rawTransaction';

describe('bounded raw transaction parsing', () => {
  it('rejects oversized hex before decoder allocation', () => {
    expect(() => decodeRawTransaction('00'.repeat(MAX_RAW_TRANSACTION_BYTES + 1)))
      .toThrow(/no larger than/);
  });

  it('rejects signing transactions with excessive output fan-out', () => {
    const transaction = new Transaction({ allowUnknownOutputs: true });
    transaction.addInput({ txid: hexToBytes('ab'.repeat(32)), index: 0 });
    for (let index = 0; index < 1_001; index++) {
      transaction.addOutput({ script: new Uint8Array([0x6a]), amount: 0n });
    }

    expect(() => parseTransactionForSigning(bytesToHex(transaction.toBytes(true, true))))
      .toThrow(/too many outputs/);
  });
});
