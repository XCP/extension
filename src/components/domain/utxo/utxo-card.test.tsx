import { fireEvent, render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UtxoBalance } from "@/core/counterparty/api";
import { asDisplayUnits } from '@/core/numeric';
import { UtxoCard } from "./utxo-card";

vi.mock("@/components/domain/utxo/utxo-menu", () => ({
  UtxoMenu: ({ utxo }: { utxo: string }) => (
    <button type="button" data-testid={`utxo-menu-${utxo}`}>Menu</button>
  ),
}));

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

vi.mock("@/core/format", () => ({
  // Mirrors the real signature: a quantity arrives as a decimal string, not a number.
  formatAmount: ({ value }: { value: string | number }) => Number(value).toFixed(8),
  formatAsset: (asset: string) => asset,
  formatTxid: (txid: string) => `${txid.slice(0, 8)}...${txid.slice(-6)}`,
}));

const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
);

describe("UtxoCard", () => {
  const mockToken: UtxoBalance = {
    asset: "XCP",
    asset_info: {
      asset_longname: null,
      description: "Counterparty",
      divisible: true,
      issuer: "bc1qissuer",
      locked: false,
    },
    quantity_normalized: asDisplayUnits("100.50000000"),
    utxo: "abc123def456789012345678901234567890123456789012345678901234:0",
    utxo_address: "bc1qtest123",
  };

  const mockIndivisibleToken: UtxoBalance = {
    asset: "RAREPEPE",
    asset_info: {
      asset_longname: null,
      description: "Rare Pepe",
      divisible: false,
      issuer: "bc1qissuer",
      locked: false,
    },
    quantity_normalized: asDisplayUnits("5"),
    utxo: "def456abc789012345678901234567890123456789012345678901234567:1",
    utxo_address: "bc1qtest123",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders asset name and balance", () => {
    render(
      <TestWrapper>
        <UtxoCard token={mockToken} />
      </TestWrapper>,
    );

    expect(screen.getByText("XCP")).toBeInTheDocument();
    expect(screen.getByText("100.50000000")).toBeInTheDocument();
  });

  it("renders formatted txid", () => {
    render(
      <TestWrapper>
        <UtxoCard token={mockToken} />
      </TestWrapper>,
    );

    // Mock formatTxid: first 8 chars + "..." + last 6 chars
    expect(screen.getByText("abc123de...1234:0")).toBeInTheDocument();
  });

  it("renders asset icon", () => {
    render(
      <TestWrapper>
        <UtxoCard token={mockToken} />
      </TestWrapper>,
    );

    const img = screen.getByAltText("XCP") as HTMLImageElement;
    expect(img.src).toBe("https://cdn.xcp.io/img/icon/XCP");
  });

  it("renders utxo menu", () => {
    render(
      <TestWrapper>
        <UtxoCard token={mockToken} />
      </TestWrapper>,
    );

    expect(
      screen.getByTestId(`utxo-menu-${mockToken.utxo}`),
    ).toBeInTheDocument();
  });

  it("navigates to UTXO detail page on click", () => {
    render(
      <TestWrapper>
        <UtxoCard token={mockToken} />
      </TestWrapper>,
    );

    fireEvent.click(screen.getByText("XCP"));

    expect(mockNavigate).toHaveBeenCalledWith(
      `/assets/utxos/${mockToken.utxo}`,
    );
  });

  // The card body is a real button now, so the browser supplies Enter and Space.
  // jsdom does not synthesise that, so the element type is what pins it down —
  // and being a button, rather than a wrapper around one, is the point: the menu
  // is a button too, and one cannot contain the other.
  it("exposes the card body as a button, separate from the menu", () => {
    render(
      <TestWrapper>
        <UtxoCard token={mockToken} />
      </TestWrapper>,
    );

    const card = screen.getByText("XCP").closest("button")!;
    expect(card.tagName).toBe("BUTTON");
    expect(card).toHaveAttribute("type", "button");
    expect(card.querySelector("button")).toBeNull();
  });

  it("handles indivisible tokens", () => {
    render(
      <TestWrapper>
        <UtxoCard token={mockIndivisibleToken} />
      </TestWrapper>,
    );

    expect(screen.getByText("RAREPEPE")).toBeInTheDocument();
    expect(screen.getByText("5.00000000")).toBeInTheDocument();
  });

  it("has proper accessibility attributes", () => {
    render(
      <TestWrapper>
        <UtxoCard token={mockToken} />
      </TestWrapper>,
    );

    const card = screen.getByText("XCP").closest("button");
    expect(card).toHaveClass("cursor-pointer");
  });
});
