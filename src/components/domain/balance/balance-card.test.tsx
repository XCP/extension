import { fireEvent, render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TokenBalance } from "@/core/counterparty/api";
import { asBaseUnits, asDisplayUnits } from '@/core/numeric';
import { BalanceCard } from "./balance-card";

// Mock the BalanceMenu component
vi.mock("@/components/domain/balance/balance-menu", () => ({
  BalanceMenu: ({ asset }: { asset: string }) => (
    <button type="button" data-testid={`balance-menu-${asset}`}>Menu</button>
  ),
}));

// Mock the AssetIcon component
vi.mock("@/components/domain/asset/asset-icon", () => ({
  AssetIcon: ({ asset, size, className }: any) => (
    <img
      src={`https://cdn.xcp.io/img/icon/${asset}`}
      alt={asset}
      className={className}
      data-size={size}
    />
  ),
}));

// Mock the format utils
vi.mock("@/core/format", () => ({
  // Mirrors the real signature: a quantity arrives as a decimal string, not a number.
  formatAmount: ({ value }: { value: string | number }) => Number(value).toFixed(8),
  formatAsset: (
    asset: string,
    options?: { assetInfo?: any; shorten?: boolean },
  ) => {
    if (options?.shorten && asset.length > 10) {
      return `${asset.substring(0, 7)}...`;
    }
    return asset;
  },
}));

const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Test wrapper with router
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
);

describe("BalanceCard", () => {
  const mockDivisibleToken: TokenBalance = {
    asset: "XCP",
    asset_info: {
      asset_longname: null,
      description: "Counterparty",
      divisible: true,
      issuer: "bc1qissuer",
      locked: false,
      supply: asBaseUnits("1000000"),
    },
    quantity_normalized: asDisplayUnits("100.50000000"),
  };

  const mockIndivisibleToken: TokenBalance = {
    asset: "RAREPEPE",
    asset_info: {
      asset_longname: null,
      description: "Rare Pepe",
      divisible: false,
      issuer: "bc1qissuer",
      locked: false,
      supply: asBaseUnits("1000"),
    },
    quantity_normalized: asDisplayUnits("5"),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders divisible token correctly", () => {
    render(
      <TestWrapper>
        <BalanceCard token={mockDivisibleToken} />
      </TestWrapper>,
    );

    expect(screen.getByText("XCP")).toBeInTheDocument();
    expect(screen.getByText("100.50000000")).toBeInTheDocument();
    expect(screen.getByAltText("XCP")).toBeInTheDocument();
    expect(screen.getByTestId("balance-menu-XCP")).toBeInTheDocument();
  });

  it("renders indivisible token with correct decimal places", () => {
    render(
      <TestWrapper>
        <BalanceCard token={mockIndivisibleToken} />
      </TestWrapper>,
    );

    expect(screen.getByText("RAREPEPE")).toBeInTheDocument();
    expect(screen.getByText("5.00000000")).toBeInTheDocument();
  });

  it("navigates to balance page on click by default", () => {
    render(
      <TestWrapper>
        <BalanceCard token={mockDivisibleToken} />
      </TestWrapper>,
    );

    fireEvent.click(screen.getByText("XCP"));

    expect(mockNavigate).toHaveBeenCalledWith("/assets/XCP/balance");
  });

  it("calls custom onClick handler when provided", () => {
    const mockOnClick = vi.fn();

    render(
      <TestWrapper>
        <BalanceCard token={mockDivisibleToken} onClick={mockOnClick} />
      </TestWrapper>,
    );

    fireEvent.click(screen.getByText("XCP"));

    expect(mockOnClick).toHaveBeenCalledWith("XCP");
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("hides balance menu when showMenu is false", () => {
    render(
      <TestWrapper>
        <BalanceCard token={mockDivisibleToken} showMenu={false} />
      </TestWrapper>,
    );

    expect(screen.queryByTestId("balance-menu-XCP")).not.toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <TestWrapper>
        <BalanceCard token={mockDivisibleToken} className="custom-class" />
      </TestWrapper>,
    );

    const cardElement = container.firstChild as HTMLElement;
    expect(cardElement).toHaveClass("custom-class");
  });

  it("handles asset with special characters in URL encoding", () => {
    const specialToken: TokenBalance = {
      ...mockDivisibleToken,
      asset: "ASSET/WITH+SPECIAL&CHARS",
    };

    render(
      <TestWrapper>
        <BalanceCard token={specialToken} />
      </TestWrapper>,
    );

    // The text is shortened to "ASSET/W..." by formatAsset with shorten: true
    fireEvent.click(screen.getByText("ASSET/W..."));

    expect(mockNavigate).toHaveBeenCalledWith(
      "/assets/ASSET%2FWITH%2BSPECIAL%26CHARS/balance",
    );
  });

  it("handles token without asset_info gracefully", () => {
    const tokenWithoutInfo: TokenBalance = {
      asset: "UNKNOWN",
      quantity_normalized: asDisplayUnits("1.00000000"),
    };

    render(
      <TestWrapper>
        <BalanceCard token={tokenWithoutInfo} />
      </TestWrapper>,
    );

    expect(screen.getByText("UNKNOWN")).toBeInTheDocument();
    expect(screen.getByText("1.00000000")).toBeInTheDocument();
  });

  it("generates correct asset icon URL", () => {
    render(
      <TestWrapper>
        <BalanceCard token={mockDivisibleToken} />
      </TestWrapper>,
    );

    const img = screen.getByAltText("XCP") as HTMLImageElement;
    expect(img.src).toBe("https://cdn.xcp.io/img/icon/XCP");
  });

  it("has proper accessibility attributes", () => {
    render(
      <TestWrapper>
        <BalanceCard token={mockDivisibleToken} />
      </TestWrapper>,
    );

    const img = screen.getByAltText("XCP");
    expect(img).toHaveAttribute("alt", "XCP");

    // Find the card container by looking for the element with cursor-pointer class
    const cardElement = screen.getByText("XCP").closest(".cursor-pointer");
    expect(cardElement).toHaveClass("cursor-pointer");
  });
});
