import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import * as btc from '@scure/btc-signer';

/** A compressed public key. Only its hash matters here, so any valid point will do. */
export const PUBKEY = hexToBytes('0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798');
export const SOURCE_P2WPKH = btc.p2wpkh(PUBKEY);
/** The private key behind PUBKEY (the generator point), for tests that sign. */
export const PRIVATE_KEY = hexToBytes('00'.repeat(31) + '01');
/** The same key behind a nested SegWit address. */
export const SOURCE_NESTED = btc.p2sh(SOURCE_P2WPKH);
export const SOURCE_ADDRESS = SOURCE_P2WPKH.address!;
export const OTHER_ADDRESS = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';
export const PREV_TXID = '1f81ad6116ac6045b5bc4941afc212456770ab389c05973c088f22063a2aff37';

/** A Counterparty-shaped data output: OP_RETURN with an opaque payload. */
export function opReturnScript(payloadLength = 40): Uint8Array {
  const script = new Uint8Array(2 + payloadLength);
  script[0] = 0x6a;
  script[1] = payloadLength;
  for (let i = 0; i < payloadLength; i++) script[2 + i] = (i * 37 + 11) & 0xff;
  return script;
}

export interface UnsignedTxSpec {
  outputs: Array<{ script: Uint8Array; amount: bigint }>;
  inputs?: Array<{ txid: string; index: number; sequence?: number }>;
  lockTime?: number;
}

/** Unsigned raw transaction hex in the composer's shape: empty scriptSigs, no witness. */
export function unsignedRawTx(spec: UnsignedTxSpec): string {
  const tx = new btc.Transaction({ allowUnknownOutputs: true, allowUnknownInputs: true, lockTime: spec.lockTime ?? 0 });
  for (const input of spec.inputs ?? [{ txid: PREV_TXID, index: 0 }]) {
    tx.addInput({ txid: hexToBytes(input.txid), index: input.index, sequence: input.sequence ?? 0xffffffff });
  }
  for (const output of spec.outputs) tx.addOutput({ script: output.script, amount: output.amount });
  return bytesToHex(tx.toBytes(true, false));
}

/** The enhanced-send layout: data output first, change to the source second. */
export function enhancedSendRawTx(changeSats = 95_160n): string {
  return unsignedRawTx({
    outputs: [
      { script: opReturnScript(), amount: 0n },
      { script: SOURCE_P2WPKH.script, amount: changeSats },
    ],
  });
}

/** A PSBT for the same unsigned transaction, with the witness UTXO the signer needs. */
export function psbtHexFor(rawTxHex: string, inputAmount = 100_000n): string {
  const tx = btc.Transaction.fromRaw(hexToBytes(rawTxHex), { allowUnknownOutputs: true, allowUnknownInputs: true });
  for (let i = 0; i < tx.inputsLength; i++) {
    tx.updateInput(i, { witnessUtxo: { script: SOURCE_P2WPKH.script, amount: inputAmount } });
  }
  return bytesToHex(tx.toPSBT());
}
