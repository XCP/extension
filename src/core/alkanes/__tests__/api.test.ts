import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dieselBaseUnitsToDisplay,
  fetchAlkanesByAddress,
  fetchAlkanesByOutpoint,
  fetchDieselBalance,
  parseAlkaneBalances,
} from '../api';

describe('Alkanes outpoint API', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('preserves exact integer balances', () => {
    expect(parseAlkaneBalances({
      result: {
        balance_sheet: {
          cached: {
            balances: [{ id: { block: '2', tx: '0' }, balance: '90071992547409931234' }],
          },
        },
      },
    })).toEqual([{ id: '2:0', value: '90071992547409931234' }]);
  });

  it('accepts the object balance map emitted by the TypeScript SDK', () => {
    expect(parseAlkaneBalances({
      result: { balance_sheet: { cached: { balances: { '2:0': '42', '2:1': '0' } } } },
    })).toEqual([{ id: '2:0', value: '42' }]);
  });

  it('does not mistake an unknown response shape for an empty UTXO', () => {
    expect(() => parseAlkaneBalances({ result: {} })).toThrow('no recognized balance list');
  });

  it('uses the protocol-1 protorunes outpoint method', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      result: { balance_sheet: { cached: { balances: [] } } },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchAlkanesByOutpoint('ab'.repeat(32), 3)).resolves.toEqual([]);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      method: 'alkanes_protorunesbyoutpoint',
      params: [{ txid: 'ab'.repeat(32), vout: 3, protocolTag: '1' }],
    });
  });

  it('keeps address balances attached to their UTXO outpoints', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      result: {
        outpoints: [{
          outpoint: { txid: 'cd'.repeat(32), vout: 1 },
          output: { value: '330' },
          height: '965504',
          balance_sheet: { cached: { balances: [{ id: '2:0', value: '125000000' }] } },
        }],
      },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchAlkanesByAddress('bc1qexample')).resolves.toEqual([{
      txid: 'cd'.repeat(32),
      vout: 1,
      value: 330,
      height: 965504,
      balances: [{ id: '2:0', value: '125000000' }],
    }]);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      method: 'alkanes_protorunesbyaddress',
      params: [{ address: 'bc1qexample', protocolTag: '1' }],
    });
  });

  it('rejects an outpoint index that cannot be represented exactly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      result: {
        outpoints: [{
          outpoint: { txid: 'cd'.repeat(32), vout: '9007199254740992' },
          balance_sheet: { cached: { balances: [] } },
        }],
      },
    }), { status: 200 })));

    await expect(fetchAlkanesByAddress('bc1qexample')).rejects.toThrow(
      'Invalid Alkanes outpoint at index 0',
    );
  });

  it('aggregates DIESEL only and formats all eight decimal places exactly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      result: {
        outpoints: [
          {
            outpoint: { txid: 'ab'.repeat(32), vout: 1 },
            balance_sheet: { cached: { balances: { '2:0': '100000001', '2:1': '9' } } },
          },
          {
            outpoint: { txid: 'cd'.repeat(32), vout: 2 },
            balance_sheet: { cached: { balances: { '2:0': '200000000' } } },
          },
        ],
      },
    }), { status: 200 })));

    const balance = await fetchDieselBalance('bc1qexample');
    expect(balance.baseUnits).toBe('300000001');
    expect(balance.utxos).toHaveLength(2);
    expect(dieselBaseUnitsToDisplay(balance.baseUnits)).toBe('3.00000001');
  });
});
