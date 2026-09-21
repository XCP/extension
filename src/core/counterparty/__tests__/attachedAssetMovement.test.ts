/**
 * Pins core's rule for where attached assets land, because nothing else in the wallet can catch a
 * mistake here: a transaction that spends an attached UTXO carries no payload to decode, no compose
 * request to compare against, and nothing to re-pack.
 */

import { describe, expect, it } from 'vitest';
import {
  movesCounterpartyValue,
  resolveAttachedAssetDestination,
} from '@/core/counterparty/attachedAssetMovement';

const MINE = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
const THEIRS = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
const all = (index = 0) => [{ index, sighashType: 0x01 }];

const withAssets = (inputIndex: number) => ({
  inputIndex,
  utxo: `${'a'.repeat(64)}:${inputIndex}`,
  assets: [{ asset: 'PEPECASH', quantity_normalized: '1.5', asset_longname: null }],
});
const empty = (inputIndex: number) => ({
  inputIndex,
  utxo: `${'b'.repeat(64)}:${inputIndex}`,
  assets: [],
});

describe('where attached assets go', () => {
  it('credits the first non-OP_RETURN output, as core does', () => {
    // gettxinfo.py takes get_first_non_op_return_output as the destination, so an OP_RETURN in
    // front of the real output must not be mistaken for it.
    const result = resolveAttachedAssetDestination(
      [
        { index: 0, type: 'op_return' },
        { index: 1, type: 'p2wpkh', address: MINE },
        { index: 2, type: 'p2wpkh', address: THEIRS },
      ],
      [withAssets(0)],
      [0],
      [MINE],
      all()
    );

    expect(result?.destinationVout).toBe(1);
    expect(result?.destinationAddress).toBe(MINE);
    expect(result?.leavesWallet).toBe(false);
  });

  it('reports when the assets land somewhere the signer does not control', () => {
    // The legitimate swap and the unwitting spend have the same shape, so this is stated rather
    // than judged — but it must be stated.
    const result = resolveAttachedAssetDestination(
      [{ index: 0, type: 'p2pkh', address: THEIRS }],
      [withAssets(0)],
      [0],
      [MINE],
      all()
    );

    expect(result?.destinationVout).toBe(0);
    expect(result?.leavesWallet).toBe(true);
  });

  it('treats an unattributable destination script as not the signer’s', () => {
    const result = resolveAttachedAssetDestination(
      [{ index: 0, type: 'unknown' }],
      [withAssets(0)],
      [0],
      [MINE],
      all()
    );

    expect(result?.destinationAddress).toBeUndefined();
    expect(result?.leavesWallet).toBe(true);
  });

  it('detaches when there is no non-OP_RETURN output', () => {
    // move.py: with no destination and spend_utxo_to_detach active, the balances are detached to
    // the source address rather than moved.
    const result = resolveAttachedAssetDestination(
      [{ index: 0, type: 'op_return' }],
      [withAssets(0)],
      [0],
      [MINE],
      all()
    );

    expect(result?.detaches).toBe(true);
    expect(result?.destinationVout).toBeNull();
    expect(result?.leavesWallet).toBe(false);
  });

  it('ignores assets on inputs this wallet is not signing', () => {
    // The counterparty's own contribution to a swap is not the user's to lose.
    const result = resolveAttachedAssetDestination(
      [{ index: 0, type: 'p2wpkh', address: MINE }],
      [withAssets(1)],
      [0],
      [MINE],
      all()
    );

    expect(result).toBeNull();
  });

  it('says nothing when no signed input carries assets', () => {
    expect(
      resolveAttachedAssetDestination(
        [{ index: 0, type: 'p2wpkh', address: MINE }],
        [empty(0)],
        [0],
        [MINE],
        all()
      )
    ).toBeNull();
  });

  it('uses a locally decoded detach destination instead of the first ordinary output', () => {
    const result = resolveAttachedAssetDestination(
      [
        { index: 0, type: 'op_return' },
        { index: 1, type: 'p2wpkh', address: MINE },
      ],
      [withAssets(1)],
      [1],
      [MINE],
      all(1),
      { messageType: 'detach', data: { destination: THEIRS } }
    );

    expect(result).toMatchObject({
      detaches: true,
      mode: 'explicit-detach',
      destinationCommitted: true,
      destinationVout: null,
      destinationAddress: THEIRS,
      leavesWallet: true,
    });
  });

  it('does not claim a listing placeholder fixes delivery under SINGLE|ANYONECANPAY', () => {
    const result = resolveAttachedAssetDestination(
      [
        { index: 0, type: 'p2wpkh', address: MINE },
        { index: 1, type: 'p2pkh', address: MINE },
      ],
      [withAssets(1)],
      [1],
      [MINE],
      [{ index: 1, sighashType: 0x83 }]
    );

    expect(result).toMatchObject({
      mode: 'flexible',
      destinationCommitted: false,
      leavesWallet: true,
    });
  });

  it('treats a missing effective sighash as flexible, never as implicit ALL', () => {
    const result = resolveAttachedAssetDestination(
      [{ index: 0, type: 'p2wpkh', address: MINE }],
      [withAssets(0)],
      [0],
      [MINE],
      []
    );

    expect(result?.destinationCommitted).toBe(false);
    expect(result?.mode).toBe('flexible');
  });
});

describe('the provider gate', () => {
  it('accepts a transaction carrying a Counterparty message', () => {
    expect(movesCounterpartyValue(true, [], [0])).toBe(true);
  });

  it('accepts a payload-less transaction that spends an attached UTXO', () => {
    // The atomic-swap case. Requiring a payload here would refuse the primary PSBT flow, since
    // spending an attached UTXO moves its balances with no message at all.
    expect(movesCounterpartyValue(false, [withAssets(0)], [0])).toBe(true);
  });

  it('refuses a plain Bitcoin transaction', () => {
    // No message, nothing attached: a site has no Counterparty reason to ask, and the user can
    // make this in the wallet directly.
    expect(movesCounterpartyValue(false, [empty(0)], [0])).toBe(false);
    expect(movesCounterpartyValue(false, [], [0])).toBe(false);
  });

  it('does not count attached assets on inputs the wallet is not signing', () => {
    expect(movesCounterpartyValue(false, [withAssets(2)], [0, 1])).toBe(false);
  });
});
