import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { p2pkh, p2wpkh, SigHash, Transaction } from '@scure/btc-signer';
import { describe, expect, it, vi } from 'vitest';
import { AddressFormat } from '@/core/bitcoin/address';
import { finalizePSBT, parsePSBT, signPSBT } from '@/core/bitcoin/psbt';
import { computeTxid } from '@/core/bitcoin/transactionBroadcaster';
import {
  bundleSpendsItsParent,
  packageParentOf,
  rebindDependentListingPsbt,
  signAttachAndListingForDelivery,
  signFundAndAuthorizationsForDelivery,
  signPsbtPhaseForDelivery,
} from '@/platform/provider/signPsbtPhase';

describe('signPsbtPhaseForDelivery', () => {
  it('signs sequentially and returns the complete ordered phase', async () => {
    const active: number[] = [];
    const sign = vi.fn(async (item: string, index: number) => {
      active.push(index);
      expect(active).toEqual([index]);
      active.pop();
      return `signed-${item}`;
    });

    await expect(signPsbtPhaseForDelivery(['a', 'b', 'c'], sign)).resolves.toEqual([
      'signed-a',
      'signed-b',
      'signed-c',
    ]);
    expect(sign.mock.calls.map(call => call[1])).toEqual([0, 1, 2]);
  });

  it('rejects the whole delivery when a later signer fails', async () => {
    let delivered: string[] | undefined;
    const sign = vi.fn(async (item: string) => {
      if (item === 'b') throw new Error('hardware signer cancelled');
      return `signed-${item}`;
    });

    await expect(
      signPsbtPhaseForDelivery(['a', 'b', 'c'], sign).then(result => {
        delivered = result;
      }),
    ).rejects.toThrow('hardware signer cancelled');
    expect(delivered).toBeUndefined();
    expect(sign).toHaveBeenCalledTimes(2);
  });

  it('refuses an empty or oversized phase', async () => {
    const sign = vi.fn(async () => 'signed');
    await expect(signPsbtPhaseForDelivery([], sign)).rejects.toThrow('1..8');
    await expect(signPsbtPhaseForDelivery(Array.from({ length: 9 }, () => 'x'), sign))
      .rejects.toThrow('1..8');
    expect(sign).not.toHaveBeenCalled();
  });
});

const PRIVATE_KEY = 'e8f32e723decf4051aefac8e2c93c9c5b214313817cdb01a1494b917c8436b35';

function legacyAttachAndDependentListing() {
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
    expect(resolvedListing.getInput(1)!.nonWitnessUtxo).toBeDefined();
  });

  it('refuses to sign when the claimed attach outpoint is not the reviewed attach transaction', async () => {
    const fixture = legacyAttachAndDependentListing();
    let signed = 0;
    await expect(signAttachAndListingForDelivery(
      [{ psbtHex: fixture.attachPsbt }, { psbtHex: fixture.listingPsbt }],
      { txid: 'ff'.repeat(32), vout: 0 },
      async item => { signed += 1; return item.psbtHex; },
    )).rejects.toThrow(/reviewed attach transaction/);
    expect(signed).toBe(0);
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

describe('signFundAndAuthorizationsForDelivery', () => {
  const key = hexToBytes(PRIVATE_KEY);
  const owner = p2wpkh(getPublicKey(key, true));
  function fundAndAuthorization() {
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
  const signAll = async (item: { psbtHex: string }) =>
    signPSBT(item.psbtHex, PRIVATE_KEY, [0], AddressFormat.P2WPKH, [SigHash.ALL]);

  it('signs the funding first, checks its final txid, then the authorizations', async () => {
    const { fund, authorization, fundId } = fundAndAuthorization();
    const sign = vi.fn(async (item: { psbtHex: string }, _index: number) => signAll(item));
    const signed = await signFundAndAuthorizationsForDelivery([fund, authorization, authorization], sign);
    expect(signed).toHaveLength(3);
    expect(computeTxid(finalizePSBT(signed[0]!))).toBe(fundId);
    expect(sign.mock.calls.map(call => call[1])).toEqual([0, 1, 2]);
  });

  it('signs no authorization when the signed funding changed', async () => {
    const { fund, authorization } = fundAndAuthorization();
    const other = fundAndAuthorization();
    const tampered = parsePSBT(other.fund.psbtHex);
    tampered.updateInput(0, { sequence: 1 });
    const sign = vi.fn(async (item: { psbtHex: string }, index: number) =>
      index === 0 ? signAll({ psbtHex: bytesToHex(tampered.toPSBT()) }) : signAll(item));
    await expect(signFundAndAuthorizationsForDelivery([fund, authorization], sign))
      .rejects.toThrow('offer funding signer changed the reviewed transaction');
    expect(sign).toHaveBeenCalledTimes(1);
  });

  it('refuses a phase without an authorization', async () => {
    const { fund } = fundAndAuthorization();
    const sign = vi.fn(signAll);
    await expect(signFundAndAuthorizationsForDelivery([fund], sign)).rejects.toThrow('2..8');
    expect(sign).not.toHaveBeenCalled();
  });

  it('hands the funding bytes, keyed by its txid, only to bundles that spend their parent', () => {
    const { fund, fundId } = fundAndAuthorization();
    expect(packageParentOf(fund.psbtHex)).toEqual({ [fundId]: bytesToHex(parsePSBT(fund.psbtHex).toBytes(true, false)) });
    expect(bundleSpendsItsParent('fund-and-authorize-offers')).toBe(true);
    expect(bundleSpendsItsParent('acceptance-cpfp')).toBe(true);
    expect(bundleSpendsItsParent('authorize-offers')).toBe(false);
    expect(bundleSpendsItsParent('attach-and-list')).toBe(false);
  });
});
