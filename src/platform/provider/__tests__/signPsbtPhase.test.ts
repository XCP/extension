import { bytesToHex } from '@noble/hashes/utils.js';
import { SigHash } from '@scure/btc-signer';
import { describe, expect, it, vi } from 'vitest';
import { fundAndAuthorization, legacyAttachAndDependentListing, PRIVATE_KEY } from '@/core/bitcoin/__tests__/helpers/psbtBundleFixtures';
import { AddressFormat } from '@/core/bitcoin/addressFormat';
import { finalizePSBT, parsePSBT, signPSBT } from '@/core/bitcoin/psbt';
import { computeTxid } from '@/core/bitcoin/transactionBroadcaster';
import {
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
});

describe('signFundAndAuthorizationsForDelivery', () => {
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
});
