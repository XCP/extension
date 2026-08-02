/**
 * The approval summary against real PSBTs supplied by the RareBtcAssets integrator, covering the
 * three shapes their move and listing flows produce.
 *
 * Deterministic keys: legacy priv = 0x07 x32, segwit priv = 0x09 x32.
 */
import { describe, it, expect } from 'vitest';
import { extractPsbtDetails, committedOutputIndices } from '@/utils/blockchain/bitcoin/psbt';
import { computeMoneyMovement } from './money-movement';

const LEGACY = '1FvyAqqELFiQyaEWdhFbWF8MZapKPZS8J7';
const SEGWIT = 'bc1qvux25709r4uw6rzc8wyl7wwecjdhrx085hm5ty';

const ASSET_MOVE_FEE_FROM_SEGWIT =
  '70736274ff01009a0200000002dcdd8cd287d40de3d260ccfc5fa3008f14ff8f13fc840164715cbb2b925874190000000000ffffffff98f9e476f918cc143cf8a6bd09042d1f2ee7c46bfd29c906166613b2d9c516c90000000000ffffffff022202000000000000160014670caa79e51d78ed0c583b89ff39d9c49b7199e75c12000000000000160014670caa79e51d78ed0c583b89ff39d9c49b7199e70000000000010055020000000101010101010101010101010101010101010101010101010101010101010101010000000000ffffffff0122020000000000001976a914a3c6b1ee4a49d9f2af3b3802974744fba924164a88ac000000000001011f8813000000000000160014670caa79e51d78ed0c583b89ff39d9c49b7199e7000000';

const MARKETPLACE_LISTING =
  '70736274ff010055020000000186eeddc08bc258a9dd8bdce62058d76b0355c2173ba744ce5c971d94ed1c43af0000000000ffffffff0190d00300000000001976a914a3c6b1ee4a49d9f2af3b3802974744fba924164a88ac0000000000010055020000000103030303030303030303030303030303030303030303030303030303030303030000000000ffffffff0122020000000000001976a914a3c6b1ee4a49d9f2af3b3802974744fba924164a88ac000000000000';

const ASSET_MOVE_TWO_FEE_COINS =
  '70736274ff0100c30200000003c3b06ae77edf2257a11304daa647b7ce6b90067ab7f826b56b4bdefbee80efd70000000000ffffffff617293be2b6167deb093829b9baac25555216b354542cc09e8b6898102bc49480000000000ffffffff7da32ac879b629c42dd63c60d330b4aa464ed7c0e1b59219dd38d3afe0a00b500000000000ffffffff022202000000000000160014670caa79e51d78ed0c583b89ff39d9c49b7199e76009000000000000160014670caa79e51d78ed0c583b89ff39d9c49b7199e70000000000010055020000000104040404040404040404040404040404040404040404040404040404040404040000000000ffffffff0122020000000000001976a914a3c6b1ee4a49d9f2af3b3802974744fba924164a88ac000000000001011fb004000000000000160014670caa79e51d78ed0c583b89ff39d9c49b7199e70001011fdc05000000000000160014670caa79e51d78ed0c583b89ff39d9c49b7199e7000000';

function summarise(hex: string, signed: Array<{ index: number; sighashType: number }>) {
  const details = extractPsbtDetails(hex);
  const movement = computeMoneyMovement({
    inputs: details.inputs,
    outputs: details.outputs,
    myAddresses: [LEGACY, SEGWIT],
    fee: details.fee,
    committedOutputs: committedOutputIndices(signed, details.outputs.length),
  });
  return { details, movement };
}

const ALL = 0x01;
const SINGLE_ACP = 0x83;

describe('RareBtcAssets marketplace PSBTs', () => {
  it('prices a legacy asset move whose fee comes from segwit', () => {
    const { movement } = summarise(ASSET_MOVE_FEE_FROM_SEGWIT, [
      { index: 0, sighashType: ALL },
      { index: 1, sighashType: ALL },
    ]);

    // 546 asset + 5000 fee coin in; 546 asset + 4700 change back. Only the 300 sat fee leaves.
    expect(movement.spent).toBe(5546);
    expect(movement.backToYou).toBe(5246);
    expect(movement.net).toBe(-300);
    expect(movement.atRisk).toBe(0);
  });

  it('prices a listing as proceeds to the seller, not a loss', () => {
    const { details, movement } = summarise(MARKETPLACE_LISTING, [
      { index: 0, sighashType: SINGLE_ACP },
    ]);

    // The buyer supplies the funding inputs, so no fee is knowable from this PSBT alone.
    expect(details.unfunded).toBe(true);
    expect(details.fee).toBe(0);
    // Giving up a 546 sat carrier to be paid 250,000.
    expect(movement.net).toBe(249_454);
    // The priced output is the one the signature commits to, so nothing is redirectable.
    expect(movement.atRisk).toBe(0);
  });

  it('prices an asset move funded by two segwit coins', () => {
    const { movement } = summarise(ASSET_MOVE_TWO_FEE_COINS, [
      { index: 0, sighashType: ALL },
      { index: 1, sighashType: ALL },
      { index: 2, sighashType: ALL },
    ]);

    expect(movement.spent).toBe(3246);
    expect(movement.backToYou).toBe(2946);
    expect(movement.net).toBe(-300);
    expect(movement.atRisk).toBe(0);
  });

  it('resolves every address from its script, with no indexer call', () => {
    for (const hex of [ASSET_MOVE_FEE_FROM_SEGWIT, MARKETPLACE_LISTING, ASSET_MOVE_TWO_FEE_COINS]) {
      const { details, movement } = summarise(hex, [{ index: 0, sighashType: ALL }]);
      for (const output of details.outputs) {
        if (output.type === 'op_return') continue;
        expect(output.address, 'output address must decode locally').toBeDefined();
      }
      expect(movement.incomplete).toBe(false);
    }
  });
});
