import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { fetchTokenBalancesPage } from '@/core/counterparty/api';
import { asDisplayUnits } from '@/core/numeric';
import { BalanceList } from "./balance-list";

const mockNavigate = vi.fn();
let activeAddress = 'bc1qtest123';
vi.mock("react-router", () => ({ useNavigate: () => mockNavigate }));

vi.mock("@/contexts/wallet-context", () => ({
  useWallet: () => ({
    activeWallet: { id: "wallet1", name: "Test Wallet" },
    activeAddress: { address: activeAddress, name: "Test Address" },
  }),
}));

let zeldHuntSeconds = 20;
vi.mock("@/contexts/settings-context", () => ({
  useSettings: () => ({ settings: { pinnedAssets: ["XCP"], zeldHuntSeconds } }),
}));

const cacheBalances = vi.fn();
vi.mock("@/contexts/header-context", () => ({
  useHeader: () => ({ cacheBalances }),
}));

vi.mock("@/core/bitcoin/balance", () => ({ fetchBTCBalance: vi.fn(async () => 100_000) }));

vi.mock("@/core/counterparty/api", () => ({
  fetchTokenBalance: vi.fn(async (_address: string, asset: string) => ({ asset, quantity_normalized: asDisplayUnits('0'), asset_info: { divisible: true } })),
  emptyTokenBalance: (asset: string) => ({ asset, quantity_normalized: asDisplayUnits('0'), asset_info: { divisible: true } }),
  fetchTokenBalancesPage: vi.fn(async () => ({ result: [], result_count: null })),
  fetchMempoolLedgerEvents: vi.fn(async () => []),
}));

const mockFetchZeldBalance = vi.fn();
vi.mock("@/core/zeld/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/core/zeld/api")>()),
  fetchZeldBalance: (...args: unknown[]) => mockFetchZeldBalance(...args),
}));

const mockRecordShowsZeld = vi.fn();
vi.mock("@/services/zeldRecordClient", () => ({
  recordShowsZeld: (...args: unknown[]) => mockRecordShowsZeld(...args),
}));

let search = { searchQuery: '', searchResults: [] as { symbol: string }[], isSearching: false, error: null as string | null };
vi.mock("@/hooks/useSearchQuery", () => ({
  useSearchQuery: () => ({ ...search, setSearchQuery: vi.fn(), retry: vi.fn() }),
}));
let inView = false;
vi.mock("@/hooks/useInView", () => ({ useInView: () => ({ ref: vi.fn(), inView }) }));
vi.mock("@/hooks/usePendingStatus", () => ({
  usePendingDeltas: () => ({ byAsset: new Map() }),
  labelsFromDeltas: () => new Map(),
}));

describe("BalanceList ZELD row", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activeAddress = 'bc1qtest123';
    inView = false;
    zeldHuntSeconds = 20;
    search = { searchQuery: '', searchResults: [], isSearching: false, error: null };
    mockFetchZeldBalance.mockResolvedValue({ baseUnits: 409_600_000_000n, utxos: [{ txid: "00".repeat(32), vout: 1, balance: 409_600_000_000n }] });
    mockRecordShowsZeld.mockResolvedValue(false);
  });

  it("lists ZELD with its balance while hunting is on, and opens the ZELD page", async () => {
    render(<BalanceList />);
    expect(await screen.findByText("ZELD")).toBeInTheDocument();
    expect(screen.getByText("4,096.00000000")).toBeInTheDocument();
    expect(mockFetchZeldBalance).toHaveBeenCalledWith("bc1qtest123");
    screen.getByText("ZELD").closest("button")!.click();
    expect(mockNavigate).toHaveBeenCalledWith("/zeld");
  });

  it("shows ZELD at zero while hunting is on, since the row is where the hunt explains itself", async () => {
    mockFetchZeldBalance.mockResolvedValue({ baseUnits: 0n, utxos: [] });
    render(<BalanceList />);
    expect(await screen.findByText("ZELD")).toBeInTheDocument();
  });

  it("still shows ZELD already earned when hunting is off", async () => {
    zeldHuntSeconds = 0;
    render(<BalanceList />);
    expect(await screen.findByText("ZELD")).toBeInTheDocument();
    expect(screen.getByText("4,096.00000000")).toBeInTheDocument();
  });

  it("hides an empty ZELD row when hunting is off", async () => {
    zeldHuntSeconds = 0;
    mockFetchZeldBalance.mockResolvedValue({ baseUnits: 0n, utxos: [] });
    render(<BalanceList />);
    expect(await screen.findAllByText("BTC")).not.toHaveLength(0);
    expect(screen.queryByText("ZELD")).not.toBeInTheDocument();
  });

  it.each([
    ['hunting', 20, false],
    ["holding ZELD by the wallet's record", 0, true],
  ])("keeps ZELD reachable without claiming zero when the indexer is down (%s)", async (_name, seconds, held) => {
    zeldHuntSeconds = seconds;
    mockRecordShowsZeld.mockResolvedValue(held);
    mockFetchZeldBalance.mockRejectedValue(new Error("down"));
    render(<BalanceList />);
    expect(await screen.findAllByText("BTC")).not.toHaveLength(0);
    await waitFor(() => expect(screen.queryByText("Failed to load balances.")).not.toBeInTheDocument());
    expect(await screen.findByText('Balance unavailable. Try again shortly.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View ZELD (ZeldHash)' }));
    expect(mockNavigate).toHaveBeenCalledWith('/zeld');
    expect(cacheBalances.mock.calls.flatMap(call => call[1]).some(balance => balance.asset === 'zeldhash:ZELD')).toBe(false);
  });

  it("adds no ZELD row during an outage for an address with no ZELD and hunting off", async () => {
    zeldHuntSeconds = 0;
    mockFetchZeldBalance.mockRejectedValue(new Error("down"));
    render(<BalanceList />);
    expect(await screen.findAllByText("BTC")).not.toHaveLength(0);
    await waitFor(() => expect(mockFetchZeldBalance).toHaveBeenCalledWith('bc1qtest123'));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(screen.queryByText('Balance unavailable. Try again shortly.')).not.toBeInTheDocument();
    expect(screen.queryByText("ZELD")).not.toBeInTheDocument();
    expect(mockRecordShowsZeld).toHaveBeenCalledWith('bc1qtest123');
  });

  it.each([0, 20])('loads balances, pagination and refresh without waiting for ZELD (budget=%s)', async seconds => {
    zeldHuntSeconds = seconds;
    inView = true;
    let finish!: (value: { baseUnits: bigint; utxos: [] }) => void;
    mockFetchZeldBalance.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const onRefreshed = vi.fn();
    const { rerender } = render(<BalanceList refreshNonce={0} onRefreshed={onRefreshed} />);
    expect(await screen.findAllByText('BTC')).not.toHaveLength(0);
    expect(screen.getAllByText('XCP')).not.toHaveLength(0);
    await waitFor(() => expect(fetchTokenBalancesPage).toHaveBeenCalled());
    expect(screen.queryByText('Loading balances…')).not.toBeInTheDocument();
    if (seconds > 0) expect(screen.getByRole('button', { name: 'View ZELD (ZeldHash)' })).toBeInTheDocument();
    else expect(screen.queryByText('ZELD')).not.toBeInTheDocument();
    rerender(<BalanceList refreshNonce={1} onRefreshed={onRefreshed} />);
    await waitFor(() => expect(onRefreshed).toHaveBeenCalledOnce());
    await act(async () => finish({ baseUnits: 409_600_000_000n, utxos: [] }));
    expect(await screen.findByText('4,096.00000000')).toBeInTheDocument();
    expect(screen.getAllByText('BTC')).not.toHaveLength(0);
    expect(screen.getAllByText('XCP')).not.toHaveLength(0);
  });

  it('ignores a delayed ZELD response for the previous address', async () => {
    let finish!: (value: { baseUnits: bigint; utxos: [] }) => void;
    mockFetchZeldBalance.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    mockFetchZeldBalance.mockResolvedValue({ baseUnits: 0n, utxos: [] });
    const { rerender } = render(<BalanceList />);
    expect(await screen.findAllByText('BTC')).not.toHaveLength(0);
    activeAddress = 'bc1qnewaddress';
    rerender(<BalanceList />);
    await waitFor(() => expect(mockFetchZeldBalance).toHaveBeenLastCalledWith(activeAddress));
    await waitFor(() => expect(screen.getByText('ZELD')).toBeInTheDocument());
    await act(async () => finish({ baseUnits: 409_600_000_000n, utxos: [] }));
    expect(screen.queryByText('4,096.00000000')).not.toBeInTheDocument();
    expect(cacheBalances.mock.calls.flatMap(call => call[1]).filter(balance => balance.asset === 'zeldhash:ZELD'))
      .toEqual([expect.objectContaining({ quantity_normalized: '0.00000000' })]);
  });

  it.each(['waiting', 'failed', 'empty', 'collision'])('finds native ZELD when Counterparty search is %s', async mode => {
    search = { searchQuery: 'zeld', searchResults: mode === 'collision' ? [{ symbol: 'ZELD' }] : [],
      isSearching: mode === 'waiting', error: mode === 'failed' ? 'Search failed' : null };
    mockFetchZeldBalance.mockRejectedValue(new Error('indexer down'));
    render(<BalanceList />);
    fireEvent.click(screen.getByRole('button', { name: 'View ZELD (ZeldHash)' }));
    expect(mockNavigate).toHaveBeenCalledWith('/zeld');
    expect(screen.queryByText('No results found')).not.toBeInTheDocument();
    if (mode === 'collision') {
      fireEvent.click(screen.getByRole('button', { name: 'View ZELD (Counterparty)' }));
      expect(mockNavigate).toHaveBeenLastCalledWith('/assets/ZELD/balance');
    }
    await waitFor(() => expect(mockFetchZeldBalance).toHaveBeenCalledOnce());
  });
});
