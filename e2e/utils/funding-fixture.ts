import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { Transaction } from '@scure/btc-signer';

/** A real transaction shape so funding checks can verify its txid and output. */
export function fundingFixture(scriptHex: string, amount: bigint) {
  const tx = new Transaction({ allowUnknownOutputs: true, disableScriptCheck: true });
  tx.addInput({ txid: '12'.repeat(32), index: 0 });
  tx.addOutput({ script: hexToBytes(scriptHex), amount });
  return { txid: tx.id, hex: bytesToHex(tx.toBytes(true, false)) };
}
