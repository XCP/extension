import { act, render, screen, waitFor } from "@testing-library/react";
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

vi.mock("@/hooks/useSearchQuery", () => ({
  useSearchQuery: () => ({ searchQuery: "", setSearchQuery: vi.fn(), searchResults: [], isSearching: false, error: null, retry: vi.fn() }),
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
    mockFetchZeldBalance.mockResolvedValue({ baseUnits: 409_600_000_000n, utxos: [{ txid: "00".repeat(32), vout: 1, balance: 409_600_000_000n }] });
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

  it("keeps the other balances when the indexer is down", async () => {
    mockFetchZeldBalance.mockRejectedValue(new Error("down"));
    render(<BalanceList />);
    expect(await screen.findAllByText("BTC")).not.toHaveLength(0);
    await waitFor(() => expect(screen.queryByText("Failed to load balances.")).not.toBeInTheDocument());
    expect(screen.queryByText("ZELD")).not.toBeInTheDocument();
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
    expect(screen.queryByText('ZELD')).not.toBeInTheDocument();
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
    expect(await screen.findByText('ZELD')).toBeInTheDocument();
    await act(async () => finish({ baseUnits: 409_600_000_000n, utxos: [] }));
    expect(screen.queryByText('4,096.00000000')).not.toBeInTheDocument();
    expect(cacheBalances.mock.calls.flatMap(call => call[0]).filter(balance => balance.asset === 'zeldhash:ZELD'))
      .toEqual([expect.objectContaining({ quantity_normalized: '0.00000000' })]);
  });
});
