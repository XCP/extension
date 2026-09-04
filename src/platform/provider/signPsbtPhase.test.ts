import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { getPublicKey } from '@noble/secp256k1';
import { p2pkh, p2wpkh, SigHash, Transaction } from '@scure/btc-signer';
import { describe, expect, it } from 'vitest';
import { AddressFormat } from '@/core/bitcoin/address';
import { finalizePSBT, parsePSBT, signPSBT } from '@/core/bitcoin/psbt';
import { computeTxid } from '@/core/bitcoin/transactionBroadcaster';
import {
  rebindDependentListingPsbt,
  signAttachAndListingForDelivery,
} from '@/platform/provider/signPsbtPhase';

const PRIVATE_KEY = 'e8f32e723decf4051aefac8e2c93c9c5b214313817cdb01a1494b917c8436b35';

function legacyAttachAndDependentListing() {
  const publicKey = getPublicKey(hexToBytes(PRIVATE_KEY), true);
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

describe('dependent attach and listing signing', () => {
  it('rebinds only the listing asset input to the final signed Legacy attach txid', async () => {
    const fixture = legacyAttachAndDependentListing();
    const signed = await signAttachAndListingForDelivery(
      [{ psbtHex: fixture.attachPsbt }, { psbtHex: fixture.listingPsbt }],
      fixture.expectedOutpoint,
      async (item, index) => index === 0
        ? signPSBT(item.psbtHex, PRIVATE_KEY, [0], AddressFormat.P2PKH, [SigHash.ALL])
        : signPSBT(
            item.psbtHex,
            PRIVATE_KEY,
            [1],
            AddressFormat.P2WPKH,
            [SigHash.ALL, SigHash.SINGLE_ANYONECANPAY],
          ),
    );

    const finalAttachTxid = computeTxid(finalizePSBT(signed[0]!));
    expect(finalAttachTxid).not.toBe(fixture.expectedOutpoint.txid);
    const resolvedListing = parsePSBT(signed[1]!);
    expect(bytesToHex(resolvedListing.getInput(1)!.txid!)).toBe(finalAttachTxid);
    expect(bytesToHex(resolvedListing.getInput(0)!.txid!)).toBe('00'.repeat(32));
    expect(resolvedListing.getInput(1)!.partialSig).toHaveLength(1);
  });

  it('refuses to rebind a different source outpoint', () => {
    const fixture = legacyAttachAndDependentListing();
    expect(() => rebindDependentListingPsbt(
      fixture.listingPsbt,
      { txid: 'ff'.repeat(32), vout: 0 },
      '11'.repeat(32),
    )).toThrow(/reviewed attach outpoint/);
  });
});
