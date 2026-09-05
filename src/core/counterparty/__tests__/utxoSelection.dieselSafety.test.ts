import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchInputsAlkanes } from '@/core/alkanes/inputAssets';
import { clearPendingDieselUtxos, getKnownDieselUtxos, getPendingDieselUtxos, recordPendingDieselUtxo } from '@/core/alkanes/pendingDieselUtxos';
import { getCurrentBlockHeight } from '@/core/bitcoin/blockHeight';
import { clearSpentUtxoCache } from '@/core/bitcoin/spentUtxoCache';
import { fetchUTXOs } from '@/core/bitcoin/utxo';
import { fetchTokenBalances } from '@/core/counterparty/api';
import { DEFAULT_SETTINGS, getActiveSettings } from '@/core/settings';
import { selectUtxosForTransaction } from '../utxoSelection';

vi.mock('@/core/bitcoin/utxo', async (importOriginal) => ({ ...await importOriginal<typeof import('@/core/bitcoin/utxo')>(), fetchUTXOs: vi.fn() }));
vi.mock('@/core/alkanes/inputAssets');
vi.mock('@/core/bitcoin/blockHeight', () => ({ getCurrentBlockHeight: vi.fn() }));
vi.mock('@/core/counterparty/api');
vi.mock('@/core/settings', async (importOriginal) => ({ ...await importOriginal<typeof import('@/core/settings')>(), getActiveSettings: vi.fn() }));

const address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
const dieselTxid = 'a'.repeat(64);
const cleanTxid = 'b'.repeat(64);
const makeUtxo = (txid: string, value: number, confirmed = true) => ({
  txid, vout: 1, value,
  status: { confirmed, block_height: confirmed ? 950000 : 0, block_hash: '', block_time: 0 },
});

describe('DIESEL funding protection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPendingDieselUtxos();
    clearSpentUtxoCache();
    vi.mocked(fetchTokenBalances).mockResolvedValue([]);
    vi.mocked(fetchInputsAlkanes).mockResolvedValue([]);
    vi.mocked(getActiveSettings).mockReturnValue({ ...DEFAULT_SETTINGS, protectAlkanesUtxos: true, alkanesApiBase: 'https://alkanes.fixture.test/rpc' });
    vi.mocked(getCurrentBlockHeight).mockResolvedValue(950000);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps a known DIESEL output protected across Bitcoin confirmation and indexer lag', async () => {
    recordPendingDieselUtxo({ txid: dieselTxid, vout: 1, address, value: 80000 }, []);
    vi.mocked(fetchUTXOs).mockResolvedValue([makeUtxo(dieselTxid, 80000, false), makeUtxo(cleanTxid, 50000)]);
    expect((await selectUtxosForTransaction(address, { allowUnconfirmed: true })).utxos.map(coin => coin.txid)).toEqual([cleanTxid]);
    vi.mocked(fetchUTXOs).mockResolvedValue([makeUtxo(dieselTxid, 80000), makeUtxo(cleanTxid, 50000)]);
    for (let attempt = 0; attempt < 2; attempt++) {
      const confirmed = await selectUtxosForTransaction(address, { allowUnconfirmed: true, includeDieselUtxos: true });
      expect(confirmed.utxos.map(coin => coin.txid)).toEqual([cleanTxid]);
      expect(confirmed.dieselUtxos).toEqual([]);
      expect(getKnownDieselUtxos(address)).toHaveLength(1);
    }
  });

  it('does not turn an expired known tip into plain BTC after confirmation', async () => {
    vi.useFakeTimers();
    recordPendingDieselUtxo({ txid: dieselTxid, vout: 1, address, value: 80000 }, []);
    vi.advanceTimersByTime(31 * 60000);
    expect(getPendingDieselUtxos(address)).toEqual([]);
    vi.mocked(fetchUTXOs).mockResolvedValue([makeUtxo(dieselTxid, 80000), makeUtxo(cleanTxid, 50000)]);
    expect((await selectUtxosForTransaction(address)).utxos.map(coin => coin.txid)).toEqual([cleanTxid]);
    expect(getKnownDieselUtxos(address)).toHaveLength(1);
  });

  it('retires the journal only after a positive confirmed DIESEL lookup and resets chain depth', async () => {
    recordPendingDieselUtxo({ txid: dieselTxid, vout: 1, address, value: 80000 }, []);
    vi.mocked(fetchUTXOs).mockResolvedValue([makeUtxo(dieselTxid, 80000), makeUtxo(cleanTxid, 50000)]);
    vi.mocked(fetchInputsAlkanes).mockResolvedValue([{ inputIndex: 0, utxo: `${dieselTxid}:1`, balances: [{ id: '2:0', value: '100000000' }] }]);
    const selected = await selectUtxosForTransaction(address, { includeDieselUtxos: true });
    expect(selected.dieselUtxos).toEqual([makeUtxo(dieselTxid, 80000)]);
    expect(getKnownDieselUtxos(address)).toEqual([]);
    expect(getPendingDieselUtxos(address)).toEqual([]);
  });

  it('classifies explicit DIESEL sends independently of opt-in mining/protection settings', async () => {
    vi.mocked(getActiveSettings).mockReturnValue(DEFAULT_SETTINGS);
    vi.mocked(fetchUTXOs).mockResolvedValue([makeUtxo(dieselTxid, 80000), makeUtxo(cleanTxid, 50000)]);
    vi.mocked(fetchInputsAlkanes).mockResolvedValue([{ inputIndex: 0, utxo: `${dieselTxid}:1`, balances: [{ id: '2:0', value: '100000000' }] }]);
    const selected = await selectUtxosForTransaction(address, { includeDieselUtxos: true });
    expect(fetchInputsAlkanes).toHaveBeenCalled();
    expect(selected.utxos.map(coin => coin.txid)).toEqual([cleanTxid]);
    expect(selected.dieselUtxos?.map(coin => coin.txid)).toEqual([dieselTxid]);
  });

  it('checks all funding candidates in batches rather than abandoning entries beyond 30', async () => {
    const actual = await vi.importActual<typeof import('@/core/alkanes/inputAssets')>('@/core/alkanes/inputAssets');
    vi.mocked(fetchInputsAlkanes).mockImplementation(actual.fetchInputsAlkanes);
    const protectedCoins = Array.from({ length: 60 }, (_, index) => makeUtxo(index.toString(16).padStart(64, '0'), 546));
    vi.mocked(fetchUTXOs).mockResolvedValue([...protectedCoins, makeUtxo(cleanTxid, 10000000)]);
    const fetchMock = vi.fn(async (_url: unknown, init: RequestInit | undefined) => {
      const request = JSON.parse(String(init?.body));
      if (request.method === 'metashrew_height') return new Response(JSON.stringify({ result: '950000' }));
      return new Response(JSON.stringify({ result: { balance_sheet: { cached: { balances:
        request.params[0].txid === cleanTxid ? [] : [{ id: '2:0', value: '1' }],
      } } } }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const selected = await selectUtxosForTransaction(address);
    expect(selected.utxos).toEqual([makeUtxo(cleanTxid, 10000000)]);
    expect(fetchMock).toHaveBeenCalledTimes(67); // 61 sheets + two height gates per batch.
    expect(vi.mocked(fetchInputsAlkanes).mock.calls.map(([batch]) => batch.length)).toEqual([30, 30, 1]);
  });
});
