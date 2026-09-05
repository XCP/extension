import { describe, expect, it } from 'vitest';
import { encodeCbor } from '@/core/counterparty/pack/cbor';
import { unpackCounterpartyMessage } from '@/core/counterparty/unpack';
import type { FairminterData } from '@/core/counterparty/unpack/messages/fairminter';
import { getTxActionInfo } from './tx-action-info';

const assetId = 26n ** 12n + 1_000n;
const lpAssetId = assetId + 1_000n;
const asset = `A${assetId}`;

/** Exercise the wire decoder and approval adapter, not synthetic aliases in the describer. */
function review(overrides: Partial<FairminterData> = {}, apiDivisible?: boolean) {
  const terms = {
    price: 250_000_000n,
    quantityByPrice: 100_000_000n,
    maxMintPerTx: 500_000_000n,
    maxMintPerAddress: 1_000_000_000n,
    hardCap: 10_000_000_000n,
    premintQuantity: 1_000_000_000n,
    startBlock: 961_200,
    endBlock: 963_000,
    softCap: 5_000_000_000n,
    softCapDeadlineBlock: 962_500,
    mintedAssetCommissionInt: 5_000_000n,
    burnPayment: false,
    lockDescription: true,
    lockQuantity: false,
    divisible: true,
    poolQuantity: 4_000_000_000n,
    mimeType: 'text/plain',
    description: 'Terms from the signed payload',
    ...overrides,
  };
  const payload = encodeCbor([
    assetId, 0n, terms.price, terms.quantityByPrice, terms.maxMintPerTx,
    terms.maxMintPerAddress, terms.hardCap, terms.premintQuantity,
    BigInt(terms.startBlock), BigInt(terms.endBlock), terms.softCap,
    BigInt(terms.softCapDeadlineBlock), terms.mintedAssetCommissionInt,
    terms.burnPayment, terms.lockDescription, terms.lockQuantity, terms.divisible,
    terms.poolQuantity, terms.poolQuantity > 0n ? lpAssetId : 0n,
    terms.mimeType, new TextEncoder().encode(terms.description),
  ]);
  const localUnpack = unpackCounterpartyMessage(new Uint8Array([
    ...new TextEncoder().encode('CNTRPRTY'), 90, ...payload,
  ]));
  expect(localUnpack.success).toBe(true);
  const result = getTxActionInfo({
    verification: {
      passed: true, comparedAgainstApi: false, repackProved: false,
      mismatches: [], localUnpack,
    },
    counterpartyMessage: apiDivisible === undefined ? undefined : {
      messageType: 'fairminter', messageTypeId: 90,
      description: 'Untrusted API description',
      messageData: { asset_info: { divisible: apiDivisible }, price: 1 },
    },
  });
  expect(result).not.toBeNull();
  return result!;
}

describe('fairminter approval terms from decoded bytes', () => {
  it('shows all pricing, limits, timing, commission, and asset-control terms without API metadata', () => {
    const result = review();
    expect(result.description).toContain(asset);
    expect(result.protocol).toEqual(expect.arrayContaining([
      { label: 'XCP price per lot', value: '2.50000000 XCP', kind: 'amount' },
      { label: 'Lot size', value: `1.00000000 ${asset}`, kind: 'amount' },
      { label: 'Per transaction limit', value: `5.00000000 ${asset}`, kind: 'amount' },
      { label: 'Per address limit', value: `10.00000000 ${asset}`, kind: 'amount' },
      { label: 'Hard cap', value: `100.00000000 ${asset}`, kind: 'amount' },
      { label: 'Soft cap', value: `50.00000000 ${asset}`, kind: 'amount' },
      { label: 'Soft cap deadline', value: 'Block 962,500', kind: 'text' },
      { label: 'Premint', value: `10.00000000 ${asset}`, kind: 'amount' },
      { label: 'Starts', value: 'Block 961,200', kind: 'text' },
      { label: 'Ends', value: 'Block 963,000', kind: 'text' },
      { label: 'Minted asset commission', value: '5%', kind: 'amount' },
      { label: 'Divisible', value: 'Yes', kind: 'text' },
      { label: 'Lock description', value: 'Yes', kind: 'text' },
      { label: 'Lock quantity', value: 'No', kind: 'text' },
      { label: 'Description', value: 'Terms from the signed payload', kind: 'paragraph' },
    ]));
  });

  it('scales a pool reserve in minted-asset units and preserves the LP identity', () => {
    expect(review().protocol).toEqual(expect.arrayContaining([
      { label: 'Pool allocation', value: `40.00000000 ${asset}`, kind: 'amount' },
      { label: 'LP asset', value: `A${lpAssetId}`, kind: 'text' },
    ]));
  });

  it.each([
    { price: 0n, poolQuantity: 0n, burnPayment: false, expected: 'None (free mint)' },
    { price: 100_000_000n, poolQuantity: 0n, burnPayment: false, expected: 'Paid to issuer' },
    { price: 100_000_000n, poolQuantity: 0n, burnPayment: true, expected: 'Burned' },
    { price: 100_000_000n, poolQuantity: 1n, burnPayment: false, expected: 'Seeds the liquidity pool' },
  ])('states XCP payment routing as $expected', ({ expected, ...terms }) => {
    expect(review(terms).protocol).toContainEqual({ label: 'XCP payment', value: expected, kind: 'text' });
  });

  it.each([true, false])('uses wire divisibility %s over contradictory API metadata without rounding large quantities', (divisible) => {
    const result = review({ divisible, quantityByPrice: 9_999_999_999_999_999n }, !divisible);
    expect(result.protocol).toContainEqual({
      label: 'Lot size', kind: 'amount',
      value: `${divisible ? '99999999.99999999' : '9,999,999,999,999,999'} ${asset}`,
    });
    expect(result.protocol).toContainEqual({ label: 'XCP price per lot', value: '2.50000000 XCP', kind: 'amount' });
    expect(result.description).not.toContain('Untrusted API description');
  });

  it('renders explicit unlimited and immediate terms without inventing optional caps or pool allocations', () => {
    const result = review({
      maxMintPerTx: 0n, maxMintPerAddress: 0n, hardCap: 0n,
      softCap: 0n, premintQuantity: 0n, poolQuantity: 0n, startBlock: 0, endBlock: 0,
    });
    expect(result.protocol).toEqual(expect.arrayContaining([
      { label: 'Per transaction limit', value: 'No limit', kind: 'amount' },
      { label: 'Per address limit', value: 'No limit', kind: 'amount' },
      { label: 'Hard cap', value: 'No limit', kind: 'amount' },
      { label: 'Starts', value: 'On confirmation', kind: 'text' },
      { label: 'Ends', value: 'No end block', kind: 'text' },
    ]));
    const labels = result.protocol.map(field => field.label);
    for (const absent of ['Soft cap', 'Soft cap deadline', 'Premint', 'Pool allocation', 'LP asset']) {
      expect(labels).not.toContain(absent);
    }
  });
});
