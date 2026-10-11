import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { p2pkh, p2wpkh, Transaction } from '@scure/btc-signer';

export const PRIVATE_KEY = 'e8f32e723decf4051aefac8e2c93c9c5b214313817cdb01a1494b917c8436b35';

export function legacyAttachAndDependentListing() {
  const publicKey = secp256k1.getPublicKey(hexToBytes(PRIVATE_KEY), true);
  const legacy = p2pkh(publicKey);
  const segwit = p2wpkh(publicKey);

  const parent = new Transaction();
  parent.addInput({ txid: hexToBytes('aa'.repeat(32)), index: 0 });
  parent.addOutput({ script: legacy.script, amount: 100_000n });

  const attach = new Transaction({ allowUnknownOutputs: true });
  attach.addInput({
    txid: hexToBytes(parent.id),
    index: 0,
    nonWitnessUtxo: parent.toBytes(true, false),
  });
  attach.addOutput({ script: segwit.script, amount: 330n });
  attach.addOutput({ script: new Uint8Array([0x6a, 0x01, 0x00]), amount: 0n });
  attach.addOutput({ script: legacy.script, amount: 99_216n });

  const listing = new Transaction();
  listing.addInput({
    txid: hexToBytes('00'.repeat(32)),
    index: 0,
    witnessUtxo: { script: segwit.script, amount: 10_000n },
  });
  listing.addInput({
    txid: hexToBytes(attach.id),
    index: 0,
    witnessUtxo: { script: segwit.script, amount: 330n },
  });
  listing.addOutput({ script: segwit.script, amount: 330n });
  listing.addOutput({ script: segwit.script, amount: 100_330n });

  return {
    attachPsbt: bytesToHex(attach.toPSBT()),
    listingPsbt: bytesToHex(listing.toPSBT()),
    expectedOutpoint: { txid: attach.id, vout: 0 },
  };
}

const key = hexToBytes(PRIVATE_KEY);
const owner = p2wpkh(secp256k1.getPublicKey(key, true));
export function fundAndAuthorization() {
  const fund = new Transaction({ version: 2, lockTime: 0 });
  fund.addInput({ txid: new Uint8Array(32).fill(1), index: 0, witnessUtxo: { script: owner.script, amount: 20_000n } });
  fund.addOutput({ script: owner.script, amount: 5_000n });
  fund.addOutput({ script: owner.script, amount: 14_500n });
  const authorization = new Transaction({ version: 2, lockTime: 0 });
  authorization.addInput({ txid: fund.id, index: 0, witnessUtxo: { script: owner.script, amount: 5_000n } });
  authorization.addOutput({ script: owner.script, amount: 4_500n });
  return {
    fund: { psbtHex: bytesToHex(fund.toPSBT()) },
    authorization: { psbtHex: bytesToHex(authorization.toPSBT()) },
    fundId: fund.id,
  };
}
