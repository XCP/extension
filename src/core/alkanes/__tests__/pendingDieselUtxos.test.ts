import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearPendingDieselUtxos,
  confirmPendingDieselUtxo,
  getPendingDieselUtxos,
  recordPendingDieselUtxo,
} from '../pendingDieselUtxos';

describe('pending DIESEL UTXO journal', () => {
  beforeEach(() => {
    clearPendingDieselUtxos();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps only the active tip and derives chain depth from the spent parent', () => {
    const first = recordPendingDieselUtxo(
      { txid: '11'.repeat(32), vout: 1, address: 'addr-a', value: 50_000 },
      [],
    );
    const second = recordPendingDieselUtxo(
      { txid: '22'.repeat(32), vout: 1, address: 'addr-a', value: 49_000 },
      [{ txid: first.txid, vout: first.vout }],
    );

    expect(first.chainDepth).toBe(1);
    expect(second.chainDepth).toBe(2);
    expect(getPendingDieselUtxos('addr-a')).toEqual([{
      txid: second.txid,
      vout: second.vout,
      address: second.address,
      value: second.value,
      chainDepth: second.chainDepth,
    }]);
  });

  it('forgets a confirmed tip so the next unconfirmed child starts at depth one', () => {
    const tip = recordPendingDieselUtxo(
      { txid: '33'.repeat(32), vout: 1, address: 'addr-a', value: 50_000 },
      [],
    );

    confirmPendingDieselUtxo(tip.txid, tip.vout);
    const child = recordPendingDieselUtxo(
      { txid: '44'.repeat(32), vout: 1, address: 'addr-a', value: 49_000 },
      [{ txid: tip.txid, vout: tip.vout }],
    );

    expect(child.chainDepth).toBe(1);
    expect(getPendingDieselUtxos('addr-a')).toEqual([{
      txid: child.txid,
      vout: child.vout,
      address: child.address,
      value: child.value,
      chainDepth: child.chainDepth,
    }]);
  });

  it('expires and explicitly clears unconfirmed tips', () => {
    recordPendingDieselUtxo(
      { txid: '55'.repeat(32), vout: 1, address: 'addr-a', value: 50_000 },
      [],
    );
    vi.advanceTimersByTime(30 * 60_000 + 1);
    expect(getPendingDieselUtxos('addr-a')).toEqual([]);

    recordPendingDieselUtxo(
      { txid: '66'.repeat(32), vout: 1, address: 'addr-a', value: 50_000 },
      [],
    );
    clearPendingDieselUtxos();
    expect(getPendingDieselUtxos('addr-a')).toEqual([]);
  });
});
