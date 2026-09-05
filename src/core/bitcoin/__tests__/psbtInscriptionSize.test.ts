import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { getPublicKey } from '@noble/secp256k1';
import { Address, p2tr, SigHash, Transaction, taprootNumsKey } from '@scure/btc-signer';
import { describe, expect, it } from 'vitest';
import { AddressFormat } from '../address';
import { extractPsbtDetails, parsePSBT, signPSBT } from '../psbt';

const PRIVATE_KEY = '01'.repeat(32);
const owner = p2tr(getPublicKey(hexToBytes(PRIVATE_KEY)).slice(1, 33));
const decodedOwner = Address().decode(owner.address!);
if (decodedOwner.type !== 'tr') throw new Error('Expected Taproot fixture');
const ownerOutputKey = decodedOwner.pubkey;

function reveal(bodyBytes: number, wrongCommitment = false) {
  const script: number[] = [0x00, 0x63, 0x03, 0x6f, 0x72, 0x64, 0x00];
  // Body pushes stay within the 520-byte element limit; only total script size grows.
  for (let remaining = bodyBytes; remaining > 0;) {
    const length = Math.min(remaining, 520);
    if (length < 76) script.push(length);
    else if (length < 256) script.push(0x4c, length);
    else script.push(0x4d, length & 0xff, length >> 8);
    script.push(...new Uint8Array(length).fill(7));
    remaining -= length;
  }
  script.push(0x68, 0x20, ...ownerOutputKey, 0xac);
  const leaf = new Uint8Array(script);
  const commit = p2tr(taprootNumsKey(), { script: leaf, leafVersion: 0xc0 }, undefined, true);
  const tx = new Transaction({ allowUnknownInputs: true, allowUnknownOutputs: true,
    disableScriptCheck: wrongCommitment });
  tx.addInput({ txid: '11'.repeat(32), index: 0,
    witnessUtxo: { script: wrongCommitment ? owner.script : commit.script, amount: 100_000n },
    tapLeafScript: commit.tapLeafScript, sighashType: SigHash.ALL });
  tx.addOutputAddress(owner.address!, 546n);
  return { hex: bytesToHex(tx.toPSBT()), leaf };
}

describe('PSBT inscription script sizes', () => {
  it('parses and signs a 10 KiB inscription body through to its final witness', () => {
    const fixture = reveal(10_240);
    expect(fixture.leaf.length).toBeGreaterThan(10_000);
    expect(extractPsbtDetails(fixture.hex).inputs[0]!.tapLeafScripts)
      .toEqual([bytesToHex(fixture.leaf)]);
    const signed = signPSBT(fixture.hex, PRIVATE_KEY, [0], AddressFormat.P2TR);
    const tx = Transaction.fromPSBT(hexToBytes(signed), { allowUnknownInputs: true,
      allowUnknownOutputs: true, disableScriptCheck: true });
    tx.finalize();
    expect(tx.getInput(0).finalScriptWitness).toHaveLength(3);
    expect(tx.getInput(0).finalScriptWitness![1]).toEqual(fixture.leaf);
    expect(tx.extract().length).toBeGreaterThan(10_240);
  });

  it('still rejects a large leaf whose commitment does not match the prevout', () => {
    expect(() => parsePSBT(reveal(10_240, true).hex))
      .toThrow(/Taproot commitment does not match previous output/);
  });

  it('bounds Taproot script allocation even though BIP342 removes the legacy cap', () => {
    expect(() => parsePSBT(reveal(400_000).hex)).toThrow(/oversized Taproot script/);
  });

  it('keeps the legacy witness-script size limit', () => {
    const witnessScript = new Uint8Array(10_001).fill(0x61);
    const script = new Uint8Array([0x00, 0x20, ...sha256(witnessScript)]);
    const tx = new Transaction({ allowUnknownInputs: true, disableScriptCheck: true });
    tx.addInput({ txid: '22'.repeat(32), index: 0,
      witnessUtxo: { script, amount: 100_000n }, witnessScript });
    tx.addOutputAddress(owner.address!, 90_000n);
    expect(() => parsePSBT(bytesToHex(tx.toPSBT())))
      .toThrow(/oversized script|witnessScript exceeds 10,000 bytes/);
  });
});
