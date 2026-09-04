import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchAlkanesByOutpoint, parseAlkaneBalances } from '../api';

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

  it('does not mistake an unknown response shape for an empty carrier', () => {
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
      params: { txid: 'ab'.repeat(32), vout: 3, protocolTag: '1' },
    });
  });
});
