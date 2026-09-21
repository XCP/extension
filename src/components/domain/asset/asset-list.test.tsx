import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import type { OwnedAsset } from "@/core/counterparty/api";
import { asDisplayUnits } from '@/core/numeric';
import { AssetList } from "./asset-list";

// Mock dependencies
const mockNavigate = vi.fn();
vi.mock("react-router", () => ({
  useNavigate: () => mockNavigate,
}));

// `let`, like the search mocks below, so a test can take the active address away.
let mockActiveAddress: { address: string; name: string } | null = {
  address: "bc1qtest123",
  name: "Test Address",
};
vi.mock("@/contexts/wallet-context", () => ({
  useWallet: () => ({
    activeAddress: mockActiveAddress,
  }),
}));

const mockCacheOwnedAssets = vi.fn();
vi.mock("@/contexts/header-context", () => ({
  useHeader: () => ({
    setHeaderProps: vi.fn(),
    cacheOwnedAssets: mockCacheOwnedAssets,
  }),
}));

const mockFetchOwnedAssets = vi.fn();
vi.mock("@/core/counterparty/api", () => ({
  fetchOwnedAssets: (...args: any[]) => mockFetchOwnedAssets(...args),
}));

vi.mock("@/core/format", () => ({
  normalizeAssetQuery: (query: string) => query.includes('.') ? query.trim() : query.trim().toUpperCase(),
  formatAsset: vi.fn((asset, options) => {
    if (options?.assetInfo?.asset_longname) {
      return options.assetInfo.asset_longname;
    }
    return asset;
  }),
  formatAmount: vi.fn(({ value }) => value.toString()),
}));

vi.mock("@/components/ui/spinner", () => ({
  Spinner: ({ message }: { message: string }) => (
    <div data-testid="spinner">{message}</div>
  ),
}));

vi.mock("@/components/domain/asset/asset-menu", () => ({
  AssetMenu: ({ ownedAsset }: { ownedAsset: any }) => (
    <div data-testid="asset-menu" data-asset={ownedAsset.asset}>
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

const mockSetSearchQuery = vi.fn();
let mockSearchQuery = "";
let mockSearchResults: any[] = [];
let mockIsSearching = false;
let mockSearchError: string | null = null;
const mockRetrySearch = vi.fn();
let mockInView = false;

vi.mock("@/hooks/useInView", () => ({
  useInView: () => ({ ref: vi.fn(), inView: mockInView }),
}));

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

describe("AssetList", () => {
  const mockOwnedAssets: OwnedAsset[] = [
    {
      asset: "PEPECASH",
      asset_longname: null,
      supply_normalized: asDisplayUnits("1000000000"),
      description: "Test asset",
      locked: true,
    } as OwnedAsset,
    {
      asset: "RAREPEPE",
      asset_longname: "A.RAREPEPE",
      supply_normalized: asDisplayUnits("500000"),
      description: "Another test asset",
      locked: false,
    } as OwnedAsset,
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveAddress = { address: "bc1qtest123", name: "Test Address" };
    mockFetchOwnedAssets.mockReset();
    mockFetchOwnedAssets.mockResolvedValue([]);
    mockSearchQuery = "";
    mockSearchResults = [];
    mockIsSearching = false;
    mockSearchError = null;
    mockInView = false;
  });

  it("should render loading spinner initially", () => {
    render(<AssetList />);

    expect(screen.getByTestId("spinner")).toBeInTheDocument();
    expect(screen.getByText("Loading owned assets…")).toBeInTheDocument();
  });

  it("should fetch owned assets on mount", async () => {
    mockFetchOwnedAssets.mockResolvedValue(mockOwnedAssets);

    render(<AssetList />);

    await waitFor(() => {
      expect(mockFetchOwnedAssets).toHaveBeenCalledWith("bc1qtest123", {
        limit: 20,
        offset: 0,
      });
    });
  });

  it("should display owned assets after loading", async () => {
    mockFetchOwnedAssets.mockResolvedValue(mockOwnedAssets);

    render(<AssetList />);

    await waitFor(() => {
      expect(screen.getByText("PEPECASH")).toBeInTheDocument();
      expect(screen.getByText("A.RAREPEPE")).toBeInTheDocument();
    });
  });

  it("should display empty state when no assets", async () => {
    mockFetchOwnedAssets.mockResolvedValue([]);

    render(<AssetList />);

    await waitFor(() => {
      expect(screen.getByText("No Assets Owned")).toBeInTheDocument();
      expect(
        screen.getByText("This address hasn't issued any Counterparty assets."),
      ).toBeInTheDocument();
    });
  });

  it("should render search input", async () => {
    mockFetchOwnedAssets.mockResolvedValue(mockOwnedAssets);

    render(<AssetList />);

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByTestId("spinner")).not.toBeInTheDocument();
    });

    // Now look for the search input
    expect(screen.getByPlaceholderText("Search assets…")).toBeInTheDocument();
  });

  it("should show search icon", async () => {
    mockFetchOwnedAssets.mockResolvedValue(mockOwnedAssets);

    render(<AssetList />);

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByTestId("spinner")).not.toBeInTheDocument();
    });

    // Now look for the search icon (by its SVG structure)
    expect(
      screen.getByRole("textbox", { name: /search/i }),
    ).toBeInTheDocument();
  });

  it("should handle search input changes", async () => {
    mockFetchOwnedAssets.mockResolvedValue(mockOwnedAssets);

    render(<AssetList />);

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByTestId("spinner")).not.toBeInTheDocument();
    });

    // Now interact with the search input
    const searchInput = screen.getByPlaceholderText("Search assets…");
    fireEvent.change(searchInput, { target: { value: "PEPE" } });

    expect(mockSetSearchQuery).toHaveBeenCalledWith("PEPE");
  });

  it("should show clear button when search query exists", async () => {
    mockFetchOwnedAssets.mockResolvedValue(mockOwnedAssets);
    mockSearchQuery = "PEPE";

    render(<AssetList />);

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByTestId("spinner")).not.toBeInTheDocument();
    });

    // Now look for the clear button
    expect(screen.getByLabelText("Clear search")).toBeInTheDocument();
  });

  it("should clear search when clear button clicked", async () => {
    mockFetchOwnedAssets.mockResolvedValue(mockOwnedAssets);
    mockSearchQuery = "PEPE";

    render(<AssetList />);

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByTestId("spinner")).not.toBeInTheDocument();
    });

    // Now interact with the clear button
    const clearButton = screen.getByLabelText("Clear search");
    fireEvent.click(clearButton);

    expect(mockSetSearchQuery).toHaveBeenCalledWith("");
  });

  it("should navigate to asset page when asset clicked", async () => {
    mockFetchOwnedAssets.mockResolvedValue(mockOwnedAssets);

    render(<AssetList />);

    await waitFor(() => {
      const assetItem = screen.getByText("PEPECASH").closest(".cursor-pointer");
      fireEvent.click(assetItem!);
    });

    expect(mockNavigate).toHaveBeenCalledWith("/assets/PEPECASH");
  });

  it("should render asset images with correct URLs", async () => {
    mockFetchOwnedAssets.mockResolvedValue(mockOwnedAssets);

    render(<AssetList />);

    await waitFor(() => {
      const images = screen.getAllByRole("img");
      expect(images[0]).toHaveAttribute(
        "src",
        "https://cdn.xcp.io/img/icon/PEPECASH",
      );
      expect(images[1]).toHaveAttribute(
        "src",
        "https://cdn.xcp.io/img/icon/RAREPEPE",
      );
    });
  });

  it("should display supply information", async () => {
    mockFetchOwnedAssets.mockResolvedValue(mockOwnedAssets);

    render(<AssetList />);

    await waitFor(() => {
      expect(screen.getByText(/Supply: 1000000000/)).toBeInTheDocument();
      expect(screen.getByText(/Supply: 500000/)).toBeInTheDocument();
    });
  });

  it("should render AssetMenu for each asset", async () => {
    mockFetchOwnedAssets.mockResolvedValue(mockOwnedAssets);

    render(<AssetList />);

    await waitFor(() => {
      const menus = screen.getAllByTestId("asset-menu");
      expect(menus).toHaveLength(2);
      expect(menus[0]).toHaveAttribute("data-asset", "PEPECASH");
      expect(menus[1]).toHaveAttribute("data-asset", "RAREPEPE");
    });
  });

  it("should handle API errors gracefully", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mockFetchOwnedAssets.mockRejectedValue(new Error("API Error"));

    render(<AssetList />);

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        "Error fetching owned assets:",
        expect.any(Error),
      );
    });

    consoleError.mockRestore();
  });

  it("should show searching spinner when searching", async () => {
    mockFetchOwnedAssets.mockResolvedValue(mockOwnedAssets);
    mockSearchQuery = "PEPE";
    mockIsSearching = true;

    render(<AssetList />);

    await waitFor(() => {
      expect(screen.getByText("Searching assets…")).toBeInTheDocument();
    });
  });

  it("should show no results message when search returns empty", async () => {
    mockFetchOwnedAssets.mockResolvedValue(mockOwnedAssets);
    mockSearchQuery = "NOTFOUND";
    mockSearchResults = [];

    render(<AssetList />);

    await waitFor(() => {
      expect(screen.getByText("No results found")).toBeInTheDocument();
    });
  });

  it("should display search results", async () => {
    mockFetchOwnedAssets.mockResolvedValue(mockOwnedAssets);
    mockSearchQuery = "XCP";
    mockSearchResults = [{ symbol: "XCP" }, { symbol: "XCPCARD" }];

    render(<AssetList />);

    await waitFor(() => {
      const xcpTexts = screen.getAllByText("XCP");
      expect(xcpTexts.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("XCPCARD")).toBeInTheDocument();
    });
  });

  it("should navigate when search result clicked", async () => {
    mockFetchOwnedAssets.mockResolvedValue(mockOwnedAssets);
    mockSearchQuery = "XCP";
    mockSearchResults = [{ symbol: "XCP" }];

    render(<AssetList />);

    await waitFor(() => {
      const xcpTexts = screen.getAllByText("XCP");
      const searchResult = xcpTexts
        .find((text) =>
          text
            .closest(".cursor-pointer")
            ?.getAttribute("aria-label")
            ?.includes("View XCP"),
        )
        ?.closest(".cursor-pointer");
      expect(searchResult).toBeTruthy();
      fireEvent.click(searchResult!);
    });

    expect(mockNavigate).toHaveBeenCalledWith("/assets/XCP");
  });

  it("should cleanup on unmount", async () => {
    mockFetchOwnedAssets.mockImplementation(() => new Promise(() => {})); // Never resolves

    const { unmount } = render(<AssetList />);
    await waitFor(() => expect(mockFetchOwnedAssets).toHaveBeenCalledOnce());
    unmount();

    // Should not cause errors when unmounting during loading
    expect(mockFetchOwnedAssets).toHaveBeenCalled();
  });

  it("should handle missing activeAddress", async () => {
    // Was `expect(true).toBe(true)` under a comment asserting in prose that "the component
    // correctly handles missing activeAddress by not fetching assets". That is the thing to check:
    // fetching for an address the wallet does not have would query, and display, the wrong balance.
    mockActiveAddress = null;

    render(<AssetList />);

    await waitFor(() => {
      expect(screen.queryByTestId("spinner")).not.toBeInTheDocument();
    });
    expect(mockFetchOwnedAssets).not.toHaveBeenCalled();
  });

  it("should apply hover styles to asset items", async () => {
    mockFetchOwnedAssets.mockResolvedValue(mockOwnedAssets);

    render(<AssetList />);

    await waitFor(() => {
      const assetItem = screen.getByText("PEPECASH").closest(".cursor-pointer");
      expect(assetItem).toHaveClass("hover:bg-gray-50");
    });
  });

  it("should apply correct layout classes", async () => {
    mockFetchOwnedAssets.mockResolvedValue(mockOwnedAssets);

    render(<AssetList />);

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByTestId("spinner")).not.toBeInTheDocument();
    });

    // Now check the layout classes
    const container = screen
      .getByPlaceholderText("Search assets…")
      .closest(".space-y-2");
    expect(container).toHaveClass("space-y-2");
  });

  it("should style search input correctly", async () => {
    mockFetchOwnedAssets.mockResolvedValue(mockOwnedAssets);

    render(<AssetList />);

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByTestId("spinner")).not.toBeInTheDocument();
    });

    // Now check the search input styles
    const searchInput = screen.getByPlaceholderText("Search assets…");
    expect(searchInput).toHaveClass("w-full");
    expect(searchInput).toHaveClass("p-2.5");
    expect(searchInput).toHaveClass("pl-8");
    expect(searchInput).toHaveClass("pr-8");
    expect(searchInput).toHaveClass("border");
    expect(searchInput).toHaveClass("rounded-md");
    expect(searchInput).toHaveClass("bg-gray-50");
  });

  it("discards a late page after switching to another address", async () => {
    let resolvePage!: (assets: OwnedAsset[]) => void;
    const latePage = new Promise<OwnedAsset[]>((resolve) => { resolvePage = resolve; });
    const firstPage = Array.from({ length: 20 }, (_, i) => ({ ...mockOwnedAssets[0]!, asset: `FIRST${i}` }));
    mockFetchOwnedAssets.mockImplementation((address, { offset }) => {
      if (address === "bc1qsecond") return Promise.resolve([{ ...mockOwnedAssets[0]!, asset: "SECOND" }]);
      return offset === 0 ? Promise.resolve(firstPage) : latePage;
    });
    const { rerender } = render(<AssetList />);
    await screen.findByText("FIRST0");
    mockInView = true;
    rerender(<AssetList />);
    await waitFor(() => expect(mockFetchOwnedAssets).toHaveBeenCalledWith("bc1qtest123", { limit: 20, offset: 20 }));
    mockActiveAddress = { address: "bc1qsecond", name: "Second" };
    rerender(<AssetList />);
    await screen.findByText("SECOND");
    await act(async () => resolvePage([{ ...mockOwnedAssets[0]!, asset: "STALE" }]));
    expect(screen.queryByText("FIRST0")).not.toBeInTheDocument();
    expect(screen.queryByText("STALE")).not.toBeInTheDocument();
    expect(mockCacheOwnedAssets).not.toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ asset: "STALE" })]));
  });

  it("offers retry after an owned-asset failure instead of claiming the address owns nothing", async () => {
    mockFetchOwnedAssets.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(mockOwnedAssets);
    render(<AssetList />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to load owned assets");
    expect(screen.queryByText("No Assets Owned")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("PEPECASH");
    expect(mockFetchOwnedAssets).toHaveBeenCalledTimes(2);
  });

  it("renders global results while an empty address's owned-asset request is pending", async () => {
    mockFetchOwnedAssets.mockImplementation(() => new Promise(() => {}));
    mockSearchQuery = "UNOWNED";
    mockSearchResults = [{ symbol: "UNOWNED" }];
    render(<AssetList />);
    fireEvent.click(await screen.findByRole("button", { name: "View UNOWNED" }));
    expect(mockNavigate).toHaveBeenCalledWith("/assets/UNOWNED");
  });

  it("shows a failed global search and retries without displaying No results", async () => {
    mockSearchQuery = "UNOWNED";
    mockSearchError = "Search failed. Please try again.";
    render(<AssetList />);
    expect(await screen.findByRole("alert")).toHaveTextContent(mockSearchError);
    expect(screen.queryByText("No results found")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mockRetrySearch).toHaveBeenCalledOnce();
  });

  it("retries a failed later page without discarding existing assets or restarting at zero", async () => {
    const firstPage = Array.from({ length: 20 }, (_, i) => ({ ...mockOwnedAssets[0]!, asset: `FIRST${i}` }));
    mockFetchOwnedAssets.mockResolvedValueOnce(firstPage).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(mockOwnedAssets);
    mockInView = true;
    render(<AssetList />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to load more assets");
    expect(screen.getByText("FIRST0")).toBeInTheDocument();
    expect(mockFetchOwnedAssets).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("PEPECASH");
    expect(mockFetchOwnedAssets).toHaveBeenNthCalledWith(3, "bc1qtest123", { limit: 20, offset: 20 });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("discards old pagination when a refresh returns a shorter replacement list", async () => {
    let resolvePage!: (assets: OwnedAsset[]) => void;
    const latePage = new Promise<OwnedAsset[]>((resolve) => { resolvePage = resolve; });
    const firstPage = Array.from({ length: 20 }, (_, i) => ({ ...mockOwnedAssets[0]!, asset: `FIRST${i}` }));
    mockFetchOwnedAssets.mockResolvedValueOnce(firstPage).mockReturnValueOnce(latePage).mockResolvedValueOnce(mockOwnedAssets);
    mockInView = true;
    const onRefreshed = vi.fn();
    const { rerender } = render(<AssetList refreshNonce={0} onRefreshed={onRefreshed} />);
    await waitFor(() => expect(mockFetchOwnedAssets).toHaveBeenCalledTimes(2));
    rerender(<AssetList refreshNonce={1} onRefreshed={onRefreshed} />);
    await screen.findByText("PEPECASH");
    expect(onRefreshed).toHaveBeenCalledOnce();
    await act(async () => resolvePage([{ ...mockOwnedAssets[0]!, asset: "STALE" }]));
    expect(screen.queryByText("FIRST0")).not.toBeInTheDocument();
    expect(screen.queryByText("STALE")).not.toBeInTheDocument();
    expect(screen.queryByText("Scroll to load more…")).not.toBeInTheDocument();
    expect(mockFetchOwnedAssets).toHaveBeenCalledTimes(3);
    expect(mockCacheOwnedAssets).not.toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ asset: "STALE" })]));
  });

  it("does not overlap initial loading and pagination when the sentinel is visible", async () => {
    let resolveInitial!: (assets: OwnedAsset[]) => void;
    let resolveMore!: (assets: OwnedAsset[]) => void;
    mockFetchOwnedAssets
      .mockReturnValueOnce(new Promise<OwnedAsset[]>((resolve) => { resolveInitial = resolve; }))
      .mockReturnValueOnce(new Promise<OwnedAsset[]>((resolve) => { resolveMore = resolve; }));
    mockInView = true;
    const { rerender } = render(<AssetList />);
    await waitFor(() => expect(mockFetchOwnedAssets).toHaveBeenCalledOnce());
    rerender(<AssetList />);
    await act(async () => {});
    expect(mockFetchOwnedAssets).toHaveBeenCalledOnce();
    await act(async () => resolveInitial(Array.from({ length: 20 }, (_, i) => ({ ...mockOwnedAssets[0]!, asset: `FIRST${i}` }))));
    await waitFor(() => expect(mockFetchOwnedAssets).toHaveBeenCalledTimes(2));
    rerender(<AssetList />);
    await act(async () => {});
    expect(mockFetchOwnedAssets).toHaveBeenCalledTimes(2);
    expect(mockFetchOwnedAssets).toHaveBeenLastCalledWith("bc1qtest123", { limit: 20, offset: 20 });
    await act(async () => resolveMore([]));
  });
});
