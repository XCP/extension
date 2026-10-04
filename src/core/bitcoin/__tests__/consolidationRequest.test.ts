import { describe, expect, it } from 'vitest';
import { consolidateBareMultisigBatch } from '../consolidateBatch';
import { fromConsolidationRequest, toConsolidationRequest } from '../consolidationRequest';
import { RECOVERY_TEST_KEY, recoveryBatchFixture } from './helpers/recoveryBatchFixture';

describe('recovery RPC payload', () => {
  it('preserves multiple parents, output ordering, fees and protection settings through Chrome JSON', () => {
    const batch = recoveryBatchFixture(2);
    const other = recoveryBatchFixture(3);
    batch.utxos.push(other.utxos[2]!, other.utxos[0]!);
    batch.fee_config = { fee_address: batch.address, fee_percent: 2, exemption_threshold: 100_000 };
    batch.stamp_protection = { protected_utxos: 4, protected_btc: 0.0004, included: true };
    const request = toConsolidationRequest(batch);
    expect(Object.keys(request.transactions)).toHaveLength(2);
    expect(request.utxos.every((utxo) => !('prev_tx_hex' in utxo))).toBe(true);
    expect(fromConsolidationRequest(JSON.parse(JSON.stringify(request)))).toEqual(batch);
  });

  it('rejects conflicting data instead of overwriting a parent during deduplication', () => {
    const batch = recoveryBatchFixture(2);
    batch.utxos[1]!.prev_tx_hex = 'deadbeef';
    expect(() => toConsolidationRequest(batch)).toThrow('Conflicting previous transaction');
  });

  it('rejects missing, empty and inherited parent data', () => {
    const request = toConsolidationRequest(recoveryBatchFixture(1));
    for (const transactions of [{}, { [request.utxos[0]!.txid]: '' }, Object.create(request.transactions)]) {
      expect(() => fromConsolidationRequest({ ...request, transactions })).toThrow('Missing previous transaction');
    }
  });

  it('still rejects claimed amounts that disagree with the parent after transport', async () => {
    const request = toConsolidationRequest(recoveryBatchFixture(1));
    request.utxos[0]!.amount += 1;
    await expect(consolidateBareMultisigBatch(
      RECOVERY_TEST_KEY, request.address, fromConsolidationRequest(request), 1,
    )).rejects.toThrow('Value mismatch for UTXO');
  });
});
