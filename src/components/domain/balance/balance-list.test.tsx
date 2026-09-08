import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import type { TokenBalance } from "@/core/counterparty/api";
import { asBaseUnits, asDisplayUnits } from '@/core/numeric';
import { BalanceList } from "./balance-list";

// Mock dependencies
const mockNavigate = vi.fn();
vi.mock("react-router", () => ({
  useNavigate: () => mockNavigate,
}));

// `let`, like the search mocks below, so a test can take the wallet or the address away.
let mockActiveWallet: { id: string; name: string } | null = { id: "wallet1", name: "Test Wallet" };
let mockActiveAddress: { address: string; name: string } | null = {
  address: "bc1qtest123",
  name: "Test Address",
};
vi.mock("@/contexts/wallet-context", () => ({
  useWallet: () => ({
    activeWallet: mockActiveWallet,
    activeAddress: mockActiveAddress,
  }),
}));

const mockSettings = { pinnedAssets: ["XCP", "PEPECASH"] };
vi.mock("@/contexts/settings-context", () => ({
  useSettings: () => ({
    settings: mockSettings,
  }),
}));

// Extract stable mock references to prevent useCallback invalidation on re-renders
const mockSetHeaderProps = vi.fn();
const mockCacheBalances = vi.fn();
vi.mock("@/contexts/header-context", () => ({
  useHeader: () => ({
    setHeaderProps: mockSetHeaderProps,
    cacheBalances: mockCacheBalances,
  }),
}));

const mockFetchBTCBalance = vi.fn();
vi.mock("@/core/bitcoin/balance", () => ({
  fetchBTCBalance: (...args: any[]) => mockFetchBTCBalance(...args),
}));

const mockFetchTokenBalance = vi.fn();
const mockFetchTokenBalances = vi.fn();
const mockFetchMempoolLedgerEvents = vi.fn();
vi.mock("@/core/counterparty/api", () => ({
  fetchTokenBalance: (...args: any[]) => mockFetchTokenBalance(...args),
  fetchTokenBalances: (...args: any[]) => mockFetchTokenBalances(...args),
  fetchMempoolLedgerEvents: (...args: any[]) => mockFetchMempoolLedgerEvents(...args),
}));

vi.mock("@/core/format", () => ({
  normalizeAssetQuery: (query: string) => query.includes('.') ? query.trim() : query.trim().toUpperCase(),
  formatAmount: vi.fn(
    ({ value, minimumFractionDigits, maximumFractionDigits }) => {
      if (minimumFractionDigits === 8 || maximumFractionDigits === 8) {
        return Number(value).toFixed(8);
      }
      return value.toString();
    },
  ),
  formatAsset: vi.fn((asset, options) => {
    if (options?.assetInfo?.asset_longname) {
      return options.assetInfo.asset_longname;
    }
    return asset;
  }),
}));

vi.mock("@/components/ui/spinner", () => ({
  Spinner: ({
    message,
    className,
  }: {
    message?: string;
    className?: string;
  }) => (
    <div data-testid="spinner" className={className}>
      {message || "Loading…"}
    </div>
  ),
}));

vi.mock("@/components/domain/balance/balance-menu", () => ({
  BalanceMenu: ({ asset }: { asset: string }) => (
    <div data-testid="balance-menu" data-asset={asset}>
      Menu
    </div>
  ),
}));

vi.mock("@/components/icons", () => ({
  FaSearch: () => <div data-testid="search-icon" />,
  FaTimes: () => <div data-testid="times-icon" />,
  FiX: () => <div data-testid="clear-icon" />,
}));

vi.mock("@/components/domain/asset/asset-icon", () => ({
  AssetIcon: ({ asset, size, className }: any) => (
    <img
      src={`https://cdn.xcp.io/img/icon/${asset}`}
      alt={asset}
      className={className}
      data-size={size}
      data-testid="asset-icon"
    />
  ),
}));

let mockSearchQuery = "";
let mockSearchResults: any[] = [];
let mockIsSearching = false;
const mockSetSearchQuery = vi.fn();
let mockSearchError: string | null = null;
const mockRetrySearch = vi.fn();

vi.mock("@/hooks/useSearchQuery", () => ({
  useSearchQuery: () => ({
    searchQuery: mockSearchQuery,
    setSearchQuery: mockSetSearchQuery,
    searchResults: mockSearchResults,
    isSearching: mockIsSearching,
    error: mockSearchError,
    retry: mockRetrySearch,
  }),
}));

const mockInView = vi.fn(() => false);
vi.mock("@/hooks/useInView", () => ({
  useInView: () => ({
    ref: vi.fn(),
    inView: mockInView(),
  }),
}));

describe("BalanceList", () => {
  it("preserves pinned subasset casing in API lookups and reloads after a case change", async () => {
    const previous = mockSettings.pinnedAssets;
    mockSettings.pinnedAssets = ["PARENT.child"];
    try {
      const view = render(<BalanceList />);
      await waitFor(() => expect(mockFetchTokenBalance).toHaveBeenCalledWith(
        "bc1qtest123", "PARENT.child", { type: "address" }));
      mockSettings.pinnedAssets = ["PARENT.Child"];
      view.rerender(<BalanceList />);
      await waitFor(() => expect(mockFetchTokenBalance).toHaveBeenCalledWith(
        "bc1qtest123", "PARENT.Child", { type: "address" }));
      expect(mockFetchTokenBalance).not.toHaveBeenCalledWith(
        "bc1qtest123", "PARENT.CHILD", { type: "address" });
    } finally {
      mockSettings.pinnedAssets = previous;
    }
  });

  const mockTokenBalances: TokenBalance[] = [
    {
      asset: "XCP",
      quantity_normalized: asDisplayUnits("100.00000000"),
      asset_info: {
        asset_longname: null,
        description: "Counterparty Token",
        issuer: "burn",
        divisible: true,
        locked: true,
        supply: asBaseUnits("2600000"),
      },
    },
    {
      asset: "PEPECASH",
      quantity_normalized: asDisplayUnits("1000000"),
      asset_info: {
        asset_longname: null,
        description: "Pepe Cash",
        issuer: "bc1qissuer",
        divisible: false,
        locked: true,
        supply: asBaseUnits("1000000000"),
      },
    },
    {
      asset: "RAREPEPE",
      quantity_normalized: asDisplayUnits("500"),
      asset_info: {
        asset_longname: "A.RAREPEPE",
        description: "Rare Pepe",
        issuer: "bc1qissuer2",
        divisible: false,
        locked: false,
        supply: asBaseUnits("1000"),
      },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveWallet = { id: "wallet1", name: "Test Wallet" };
    mockActiveAddress = { address: "bc1qtest123", name: "Test Address" };
    mockSettings.pinnedAssets = ["XCP", "PEPECASH"];
    mockFetchBTCBalance.mockReset();
    mockFetchTokenBalance.mockReset();
    mockFetchTokenBalances.mockReset();
    mockFetchBTCBalance.mockResolvedValue(100000000); // 1 BTC in sats
    mockFetchTokenBalance.mockResolvedValue(null);
    mockFetchTokenBalances.mockResolvedValue([]);
    mockFetchMempoolLedgerEvents.mockResolvedValue({ result: [] });
    mockSearchQuery = "";
    mockSearchResults = [];
    mockIsSearching = false;
    mockSearchError = null;
    mockInView.mockReturnValue(false);
  });

  // The rule from live testing: an asset fully escrowed on an in-mempool order shows a spendable
  // balance of 0, and a 0 row says nothing — the ledger drops it once the debit confirms anyway.
  // Pinned XCP is the exception, so an empty wallet still has somewhere to read "0".
  it("skips rows whose whole balance is pending out, except pinned XCP", async () => {
    mockFetchTokenBalance
      .mockResolvedValueOnce(mockTokenBalances[0]) // XCP, 100
      .mockResolvedValueOnce(mockTokenBalances[1]); // PEPECASH, 1000000
    mockFetchMempoolLedgerEvents.mockResolvedValue({
      result: [
        {
          event: "DEBIT",
          tx_hash: "tx1",
          params: {
            address: "bc1qtest123",
            asset: "PEPECASH",
            quantity: 1000000,
            quantity_normalized: "1000000",
            action: "open order",
          },
        },
        {
          event: "DEBIT",
          tx_hash: "tx2",
          params: {
            address: "bc1qtest123",
            asset: "XCP",
            quantity: 10000000000,
            quantity_normalized: "100.00000000",
            action: "open order",
          },
        },
      ],
    });

    render(<BalanceList />);

    await waitFor(() => {
      expect(screen.getByText("XCP")).toBeInTheDocument();
    });
    // Pinned XCP stays, showing its spendable figure of zero.
    expect(screen.getByText("0.00000000")).toBeInTheDocument();
    // The fully escrowed asset is not listed at all.
    expect(screen.queryByText("PEPECASH")).not.toBeInTheDocument();
  });

  it("should render loading spinner initially", () => {
    render(<BalanceList />);

    expect(screen.getByTestId("spinner")).toBeInTheDocument();
    expect(screen.getByText("Loading balances…")).toBeInTheDocument();
  });

  it("should fetch BTC balance on mount", async () => {
    render(<BalanceList />);

    await waitFor(() => {
      expect(mockFetchBTCBalance).toHaveBeenCalledWith("bc1qtest123");
    });
  });

  it("should display BTC balance after loading", async () => {
    mockFetchBTCBalance.mockResolvedValue(100000000); // 1 BTC

    render(<BalanceList />);

    await waitFor(() => {
      const btcTexts = screen.getAllByText("BTC");
      expect(btcTexts.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("1.00000000")).toBeInTheDocument();
    });
  });

  it("should fetch pinned asset balances", async () => {
    mockFetchTokenBalance
      .mockResolvedValueOnce(mockTokenBalances[0]) // XCP
      .mockResolvedValueOnce(mockTokenBalances[1]); // PEPECASH

    render(<BalanceList />);

    await waitFor(() => {
      expect(mockFetchTokenBalance).toHaveBeenCalledWith("bc1qtest123", "XCP", {
        type: "address",
      });
      expect(mockFetchTokenBalance).toHaveBeenCalledWith(
        "bc1qtest123",
        "PEPECASH",
        { type: "address" },
      );
    });
  });

  it("should display pinned asset balances", async () => {
    mockFetchTokenBalance
      .mockResolvedValueOnce(mockTokenBalances[0])
      .mockResolvedValueOnce(mockTokenBalances[1]);

    render(<BalanceList />);

    await waitFor(() => {
      const xcpTexts = screen.getAllByText("XCP");
      expect(xcpTexts.length).toBeGreaterThanOrEqual(1);
      const pepecashTexts = screen.getAllByText("PEPECASH");
      expect(pepecashTexts.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("should render search input", async () => {
    render(<BalanceList />);

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByTestId("spinner")).not.toBeInTheDocument();
    });

    // Now look for the search input
    expect(screen.getByPlaceholderText("Search balances…")).toBeInTheDocument();
  });

  it("should show search icon", async () => {
    render(<BalanceList />);

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByTestId("spinner")).not.toBeInTheDocument();
    });

    // Now look for the search icon (by checking the input is present)
    expect(
      screen.getByRole("textbox", { name: /search/i }),
    ).toBeInTheDocument();
  });

  it("should handle search input changes", async () => {
    render(<BalanceList />);

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByTestId("spinner")).not.toBeInTheDocument();
    });

    // Now interact with the search input
    const searchInput = screen.getByPlaceholderText("Search balances…");
    fireEvent.change(searchInput, { target: { value: "XCP" } });

    expect(mockSetSearchQuery).toHaveBeenCalledWith("XCP");
  });

  it("should show clear button when search query exists", async () => {
    mockSearchQuery = "XCP";

    render(<BalanceList />);

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByTestId("spinner")).not.toBeInTheDocument();
    });

    // Now look for the clear button
    expect(screen.getByLabelText("Clear search")).toBeInTheDocument();
  });

  it("should clear search when clear button clicked", async () => {
    mockSearchQuery = "XCP";

    render(<BalanceList />);

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByTestId("spinner")).not.toBeInTheDocument();
    });

    // Now interact with the clear button
    const clearButton = screen.getByLabelText("Clear search");
    fireEvent.click(clearButton);

    expect(mockSetSearchQuery).toHaveBeenCalledWith("");
  });

  it("should navigate to balance details when balance item clicked", async () => {
    mockFetchTokenBalance.mockResolvedValueOnce(mockTokenBalances[0]);

    render(<BalanceList />);

    await waitFor(() => {
      const xcpTexts = screen.getAllByText("XCP");
      const balanceItem = xcpTexts
        .find((text) => text.closest(".cursor-pointer"))
        ?.closest(".cursor-pointer");
      expect(balanceItem).toBeTruthy();
      fireEvent.click(balanceItem!);
    });

    expect(mockNavigate).toHaveBeenCalledWith("/assets/XCP/balance");
  });

  it("should render asset images with correct URLs", async () => {
    mockFetchTokenBalance
      .mockResolvedValueOnce(mockTokenBalances[0])
      .mockResolvedValueOnce(mockTokenBalances[1]);

    render(<BalanceList />);

    await waitFor(() => {
      const images = screen.getAllByRole("img");
      // BTC, XCP, PEPECASH
      expect(
        images.some(
          (img) =>
            img.getAttribute("src") === "https://cdn.xcp.io/img/icon/BTC",
        ),
      ).toBe(true);
      expect(
        images.some(
          (img) =>
            img.getAttribute("src") === "https://cdn.xcp.io/img/icon/XCP",
        ),
      ).toBe(true);
      expect(
        images.some(
          (img) =>
            img.getAttribute("src") === "https://cdn.xcp.io/img/icon/PEPECASH",
        ),
      ).toBe(true);
    });
  });

  it("should display balance amounts correctly", async () => {
    mockFetchTokenBalance
      .mockResolvedValueOnce(mockTokenBalances[0])
      .mockResolvedValueOnce(mockTokenBalances[1]);

    render(<BalanceList />);

    await waitFor(() => {
      expect(screen.getByText("100.00000000")).toBeInTheDocument(); // XCP
      expect(screen.getByText("1000000")).toBeInTheDocument(); // PEPECASH (indivisible)
    });
  });

  it("should render BalanceMenu for each balance", async () => {
    mockFetchTokenBalance
      .mockResolvedValueOnce(mockTokenBalances[0])
      .mockResolvedValueOnce(mockTokenBalances[1]);

    render(<BalanceList />);

    await waitFor(() => {
      const menus = screen.getAllByTestId("balance-menu");
      expect(menus.length).toBeGreaterThanOrEqual(3); // BTC, XCP, PEPECASH
      expect(
        menus.some((menu) => menu.getAttribute("data-asset") === "BTC"),
      ).toBe(true);
      expect(
        menus.some((menu) => menu.getAttribute("data-asset") === "XCP"),
      ).toBe(true);
      expect(
        menus.some((menu) => menu.getAttribute("data-asset") === "PEPECASH"),
      ).toBe(true);
    });
  });

  it("should handle API errors gracefully", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mockFetchBTCBalance.mockRejectedValue(new Error("API Error"));

    render(<BalanceList />);

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        "Error in loadInitialBalances:",
        expect.any(Error),
      );
    });

    consoleError.mockRestore();
  });

  it("should show searching spinner when searching", async () => {
    mockSearchQuery = "XCP";
    mockIsSearching = true;

    render(<BalanceList />);

    await waitFor(() => {
      expect(screen.getByText("Searching balances…")).toBeInTheDocument();
    });
  });

  it("should show no results message when search returns empty", async () => {
    mockSearchQuery = "NOTFOUND";
    mockSearchResults = [];

    render(<BalanceList />);

    await waitFor(() => {
      expect(screen.getByText("No results found")).toBeInTheDocument();
    });
  });

  it("should display search results", async () => {
    mockSearchQuery = "XCP";
    mockSearchResults = [{ symbol: "XCP" }, { symbol: "XCPCARD" }];

    render(<BalanceList />);

    await waitFor(() => {
      const xcpTexts = screen.getAllByText("XCP");
      expect(xcpTexts.length).toBeGreaterThanOrEqual(1);
      const xcpcardTexts = screen.getAllByText("XCPCARD");
      expect(xcpcardTexts.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("should navigate when search result clicked", async () => {
    mockSearchQuery = "XCP";
    mockSearchResults = [{ symbol: "XCP" }];

    render(<BalanceList />);

    await waitFor(() => {
      const xcpTexts = screen.getAllByText("XCP");
      const searchResult = xcpTexts
        .find((text) => text.closest(".cursor-pointer"))
        ?.closest(".cursor-pointer");
      expect(searchResult).toBeTruthy();
      fireEvent.click(searchResult!);
    });

    expect(mockNavigate).toHaveBeenCalledWith("/assets/XCP/balance");
  });

  it("should show load more message when hasMore is true", async () => {
    mockInView.mockReturnValue(false);
    // Return exactly 10 balances to ensure hasMore stays true
    const tenBalances = Array(10)
      .fill(0)
      .map((_, i) => ({
        ...mockTokenBalances[0],
        asset: `TOKEN${i}`,
        quantity_normalized: asDisplayUnits("100.00000000"),
      }));
    mockFetchTokenBalances.mockResolvedValue(tenBalances);

    render(<BalanceList />);

    // Wait for initial loading to complete
    await waitFor(() => {
      expect(screen.queryByText("Loading balances…")).not.toBeInTheDocument();
    });

    // Now look for the load more message (should show since hasMore=true and not currently fetching)
    expect(screen.getByText("Scroll to load more…")).toBeInTheDocument();
  });

  it("should fetch more balances when scrolling", async () => {
    mockInView.mockReturnValue(true);
    mockFetchTokenBalances.mockResolvedValue([mockTokenBalances[2]]);

    render(<BalanceList />);

    await waitFor(() => {
      expect(mockFetchTokenBalances).toHaveBeenCalledWith("bc1qtest123", {
        type: "address",
        limit: 20,
        offset: 0,
      });
    });
  });

  it("should handle empty balances", async () => {
    mockFetchBTCBalance.mockResolvedValue(0);
    mockFetchTokenBalance.mockResolvedValue(null);
    mockFetchTokenBalances.mockResolvedValue([]);

    render(<BalanceList />);

    await waitFor(() => {
      const btcTexts = screen.getAllByText("BTC");
      expect(btcTexts.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("0.00000000")).toBeInTheDocument();
    });
  });

  it("should filter out zero balances for non-special assets", async () => {
    const zeroBalance: TokenBalance = {
      asset: "EMPTYTOKEN",
      quantity_normalized: asDisplayUnits("0"),
      asset_info: {
        asset_longname: null,
        description: "",
        issuer: "",
        divisible: true,
        locked: false,
      },
    };

    mockFetchTokenBalance.mockResolvedValue(zeroBalance);

    render(<BalanceList />);

    await waitFor(() => {
      // Should not display EMPTYTOKEN with zero balance
      expect(screen.queryByText("EMPTYTOKEN")).not.toBeInTheDocument();
    });
  });

  it("should apply hover styles to balance items", async () => {
    mockFetchTokenBalance.mockResolvedValueOnce(mockTokenBalances[0]);

    render(<BalanceList />);

    await waitFor(() => {
      const xcpTexts = screen.getAllByText("XCP");
      const balanceItem = xcpTexts
        .find((text) => text.closest(".cursor-pointer"))
        ?.closest(".cursor-pointer");
      expect(balanceItem).toHaveClass("hover:bg-gray-50");
    });
  });

  // Was `expect(true).toBe(true)` under a comment saying the test was skipped. Both halves matter
  // in a wallet: a balance fetched for an address the wallet does not currently have is a balance
  // shown against the wrong address, and this list is what a send is started from.
  it.each([
    ['activeAddress', () => { mockActiveAddress = null; }],
    ['activeWallet', () => { mockActiveWallet = null; }],
  ])("fetches no balances when %s is missing", async (_name, clear) => {
    clear();

    render(<BalanceList />);

    await waitFor(() => {
      expect(screen.queryByTestId("spinner")).not.toBeInTheDocument();
    });
    expect(mockFetchBTCBalance).not.toHaveBeenCalled();
    expect(mockFetchTokenBalances).not.toHaveBeenCalled();
    expect(mockFetchTokenBalance).not.toHaveBeenCalled();
  });

  it("should reset when pinnedAssets change", async () => {
    const { rerender } = render(<BalanceList />);

    await waitFor(() => {
      expect(mockFetchBTCBalance).toHaveBeenCalledTimes(1);
    });

    // Change pinned assets
    mockSettings.pinnedAssets = ["XCP", "PEPECASH", "NEWASSET"];

    rerender(<BalanceList />);

    // Should refetch with new pinned assets
    await waitFor(() => {
      expect(mockFetchTokenBalance).toHaveBeenCalledWith(
        "bc1qtest123",
        "NEWASSET",
        { type: "address" },
      );
    });
  });

  it("should style search input correctly", async () => {
    render(<BalanceList />);

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByTestId("spinner")).not.toBeInTheDocument();
    });

    // Now check the search input styles
    const searchInput = screen.getByPlaceholderText("Search balances…");
    expect(searchInput).toHaveClass("w-full");
    expect(searchInput).toHaveClass("p-2.5");
    expect(searchInput).toHaveClass("pl-8");
    expect(searchInput).toHaveClass("pr-8");
    expect(searchInput).toHaveClass("border");
    expect(searchInput).toHaveClass("rounded-md");
    expect(searchInput).toHaveClass("bg-gray-50");
  });

  it("waits for the initial BTC/pinned load before fetching one balance page", async () => {
    let resolveBTC!: (sats: number) => void;
    let resolvePage!: (balances: TokenBalance[]) => void;
    mockFetchBTCBalance.mockReturnValue(new Promise<number>((resolve) => { resolveBTC = resolve; }));
    mockFetchTokenBalances.mockReturnValue(new Promise<TokenBalance[]>((resolve) => { resolvePage = resolve; }));
    mockInView.mockReturnValue(true);
    const { rerender } = render(<BalanceList />);
    await act(async () => {});
    expect(mockFetchTokenBalances).not.toHaveBeenCalled();
    await act(async () => resolveBTC(0));
    await waitFor(() => expect(mockFetchTokenBalances).toHaveBeenCalledTimes(1));
    rerender(<BalanceList />);
    await act(async () => {});
    expect(mockFetchTokenBalances).toHaveBeenCalledTimes(1);
    await act(async () => resolvePage([]));
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });

  it.each(["address", "refresh"])("discards a late balance page after %s changes", async (change) => {
    let resolvePage!: (balances: TokenBalance[]) => void;
    const page = new Promise<TokenBalance[]>((resolve) => { resolvePage = resolve; });
    mockFetchTokenBalances.mockReturnValueOnce(page).mockResolvedValue([]);
    mockInView.mockReturnValue(true);
    const onRefreshed = vi.fn();
    const { rerender } = render(<BalanceList refreshNonce={0} onRefreshed={onRefreshed} />);
    await waitFor(() => expect(mockFetchTokenBalances).toHaveBeenCalledTimes(1));
    if (change === "address") mockActiveAddress = { address: "bc1qsecond", name: "Second" };
    rerender(<BalanceList refreshNonce={change === "refresh" ? 1 : 0} onRefreshed={onRefreshed} />);
    await waitFor(() => expect(mockFetchTokenBalances).toHaveBeenCalledTimes(2));
    await act(async () => resolvePage([{ ...mockTokenBalances[0]!, asset: "STALE" }]));
    expect(screen.queryByText("STALE")).not.toBeInTheDocument();
    expect(mockCacheBalances).not.toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ asset: "STALE" })]));
    expect(mockFetchTokenBalances).toHaveBeenLastCalledWith(change === "address" ? "bc1qsecond" : "bc1qtest123", { type: "address", limit: 20, offset: 0 });
    expect(onRefreshed).toHaveBeenCalledTimes(change === "refresh" ? 1 : 0);
  });

  it("does not let a cancelled initial load finish a newer requested refresh", async () => {
    let resolveOld!: (sats: number) => void;
    let resolveFresh!: (sats: number) => void;
    mockFetchBTCBalance
      .mockReturnValueOnce(new Promise<number>((resolve) => { resolveOld = resolve; }))
      .mockReturnValueOnce(new Promise<number>((resolve) => { resolveFresh = resolve; }));
    const onRefreshed = vi.fn();
    const { rerender } = render(<BalanceList refreshNonce={0} onRefreshed={onRefreshed} />);
    await waitFor(() => expect(mockFetchBTCBalance).toHaveBeenCalledOnce());
    rerender(<BalanceList refreshNonce={1} onRefreshed={onRefreshed} />);
    await waitFor(() => expect(mockFetchBTCBalance).toHaveBeenCalledTimes(2));
    await act(async () => resolveOld(100_000_000));
    expect(onRefreshed).not.toHaveBeenCalled();
    expect(screen.getByText("Loading balances…")).toBeInTheDocument();
    await act(async () => resolveFresh(0));
    expect(onRefreshed).toHaveBeenCalledOnce();
    expect(screen.getByText("0.00000000")).toBeInTheDocument();
    expect(screen.queryByText("1.00000000")).not.toBeInTheDocument();
  });

  it("retains loaded balances and retries the failed page at the same offset", async () => {
    mockFetchTokenBalances.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([mockTokenBalances[0]!]);
    mockInView.mockReturnValue(true);
    render(<BalanceList />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to load more balances");
    expect(screen.getByText("BTC")).toBeInTheDocument();
    expect(mockFetchTokenBalances).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("XCP");
    expect(mockFetchTokenBalances).toHaveBeenNthCalledWith(2, "bc1qtest123", { type: "address", limit: 20, offset: 0 });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows initial failures and completes a failed refresh with a working retry", async () => {
    const onRefreshed = vi.fn();
    const { rerender } = render(<BalanceList refreshNonce={0} onRefreshed={onRefreshed} />);
    await screen.findByText("BTC");
    mockFetchBTCBalance.mockRejectedValueOnce(new Error("offline"));
    rerender(<BalanceList refreshNonce={1} onRefreshed={onRefreshed} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to load balances");
    expect(onRefreshed).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("BTC");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(onRefreshed).toHaveBeenCalledOnce();
  });

  it("renders an unowned global result while empty-wallet balances are pending", async () => {
    mockFetchBTCBalance.mockReturnValue(new Promise(() => {}));
    mockSearchQuery = "A95428956661682177";
    mockSearchResults = [{ symbol: mockSearchQuery }];
    render(<BalanceList />);
    fireEvent.click(await screen.findByRole("button", { name: `View ${mockSearchQuery}` }));
    expect(mockNavigate).toHaveBeenCalledWith(`/assets/${mockSearchQuery}/balance`);
  });

  it("shows a failed global search and retries without displaying No results", async () => {
    mockSearchQuery = "UNOWNED";
    mockSearchError = "Search failed. Please try again.";
    render(<BalanceList />);
    expect(await screen.findByRole("alert")).toHaveTextContent(mockSearchError);
    expect(screen.queryByText("No results found")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mockRetrySearch).toHaveBeenCalledOnce();
  });
});
