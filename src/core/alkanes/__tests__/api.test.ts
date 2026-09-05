import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dieselBaseUnitsToDisplay,
  fetchAlkanesByAddress,
  fetchAlkanesByOutpoint,
  fetchAlkanesIndexedHeight,
  fetchDieselBalance,
  parseAlkaneBalances,
} from '../api';

const FIXTURE_API = 'https://alkanes.fixture.test/jsonrpc';

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

    await expect(fetchAlkanesByOutpoint('ab'.repeat(32), 3, FIXTURE_API)).resolves.toEqual([]);
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

    await expect(fetchAlkanesByAddress('bc1qexample', FIXTURE_API)).resolves.toEqual([{
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

    await expect(fetchAlkanesByAddress('bc1qexample', FIXTURE_API)).rejects.toThrow(
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

    const balance = await fetchDieselBalance('bc1qexample', FIXTURE_API);
    expect(balance.baseUnits).toBe('300000001');
    expect(balance.utxos).toHaveLength(2);
    expect(dieselBaseUnitsToDisplay(balance.baseUnits)).toBe('3.00000001');
  });

  it('reads the processed index height through metashrew, independently of asset ids', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: '965504' })));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchAlkanesIndexedHeight(FIXTURE_API)).resolves.toBe(965504);
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1].body))).toMatchObject({ method: 'metashrew_height', params: [] });
  });

  it.each(['965504.5', '9007199254740992', null, {}])('rejects an invalid processed height %j', async height => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: height }))));
    await expect(fetchAlkanesIndexedHeight(FIXTURE_API)).rejects.toThrow('invalid processed height');
  });
});

describe('anonymous default Alkanes endpoint pacing', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('spaces starts by 3200 ms and sends individual RPC objects across all read methods', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date('2026-09-05T00:00:00Z'));
    vi.resetModules();
    const api = await import('../api');
    const starts: number[] = [];
    const bodies: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      starts.push(Date.now());
      const body = JSON.parse(String(init.body));
      bodies.push(body);
      const result = body.method === 'metashrew_height' ? '965504'
        : body.method === 'alkanes_protorunesbyaddress' ? { outpoints: [] }
        : { balance_sheet: { balances: [] } };
      return new Response(JSON.stringify({ result }));
    }));
    const reads = Promise.all([
      api.fetchAlkanesIndexedHeight(api.DEFAULT_ALKANES_API_BASE),
      api.fetchAlkanesByOutpoint('ab'.repeat(32), 0, api.DEFAULT_ALKANES_API_BASE),
      api.fetchAlkanesByAddress('bc1qfixture', api.DEFAULT_ALKANES_API_BASE),
    ]);
    await vi.advanceTimersByTimeAsync(0);
    expect(starts).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(3199);
    expect(starts).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(starts).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(3200);
    await reads;
    expect(starts.map(time => time - starts[0]!)).toEqual([0, 3200, 6400]);
    expect(bodies.every(body => !Array.isArray(body))).toBe(true);
  });

  it.each([['2', 60_000], ['120', 120_000]])('respects 429 Retry-After=%s with at least a minute cooldown', async (retryAfter, delay) => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date('2026-09-05T00:00:00Z'));
    vi.resetModules();
    const api = await import('../api');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': retryAfter } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: { balance_sheet: { balances: [] } } })));
    vi.stubGlobal('fetch', fetchMock);
    const rejected = api.fetchAlkanesByOutpoint('ab'.repeat(32), 0).catch(error => error);
    const queued = api.fetchAlkanesByOutpoint('cd'.repeat(32), 0);
    await vi.advanceTimersByTimeAsync(0);
    expect(await rejected).toBeInstanceOf(Error);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(delay - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(queued).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
