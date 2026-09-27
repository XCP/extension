import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { verifiedReviewParams } from "@/core/counterparty/normalize";
import { ReviewFairminter } from "./review";

vi.mock("@/components/screens/review-screen", () => ({
  ReviewScreen: ({ customFields }: { customFields: Array<{ label: string; value: unknown }> }) => (
    <>
      {customFields.map((field) => (
        <div key={field.label} data-testid={field.label}>
          {String(field.value)}
        </div>
      ))}
    </>
  ),
}));

describe("ReviewFairminter", () => {
  it("shows Core 11.3 normalized pool and per-address quantities", () => {
    render(
      <ReviewFairminter
        apiResponse={{
          result: {
            params: {
              asset: "LAUNCHCOIN",
              lot_price: "1000000",
              lot_size: "100000000000",
              max_mint_per_address: "100000000000000",
              max_mint_per_address_normalized: "1000000.00000000",
              hard_cap: "10000000000000000",
              pool_quantity: "3100000000000000",
              pool_quantity_normalized: "31000000.00000000",
            },
          },
        }}
        onSign={vi.fn()}
        onBack={vi.fn()}
        error={null}
        isSigning={false}
      />
    );

    expect(screen.getByTestId("Mint per Address")).toHaveTextContent("1000000.00000000");
    expect(screen.getByTestId("Pool Reserve")).toHaveTextContent("31000000.00000000");
    expect(screen.queryByText("100000000000000")).not.toBeInTheDocument();
    expect(screen.queryByText("3100000000000000")).not.toBeInTheDocument();
  });
  it("shows the lot price in XCP and the lot size and caps at the new asset's scale, not base units", () => {
    // What the form submits for a 0.5 XCP price, lots of 10 and a hard cap of 1,000, once
    // normalized and verified — the params the review page receives.
    const params = verifiedReviewParams("fairminter", {
      asset: "LAUNCHCOIN", lot_price: "50000000", lot_price_asset: "XCP", lot_size: "1000000000",
      hard_cap: "100000000000", soft_cap: "20000000000", max_mint_per_tx: "10000000000", divisible: true,
    });
    render(
      <ReviewFairminter apiResponse={{ result: { params } }} onSign={vi.fn()} onBack={vi.fn()} error={null} isSigning={false} />
    );

    expect(screen.getByTestId("Lot Price")).toHaveTextContent(/^0\.5 XCP$/);
    expect(screen.getByTestId("Lot Size")).toHaveTextContent(/^10$/);
    expect(screen.getByTestId("Hard Cap")).toHaveTextContent(/^1000$/);
    expect(screen.getByTestId("Soft Cap")).toHaveTextContent(/^200$/);
    for (const raw of ["50000000", "1000000000", "100000000000", "20000000000"]) {
      expect(screen.queryByText(raw)).not.toBeInTheDocument();
    }
  });

  it("keeps an indivisible asset's lot size and cap whole", () => {
    const params = verifiedReviewParams("fairminter", {
      asset: "LAUNCHCOIN", lot_price: "100000000", lot_price_asset: "XCP", lot_size: "10", hard_cap: "1000", divisible: false,
    });
    render(
      <ReviewFairminter apiResponse={{ result: { params } }} onSign={vi.fn()} onBack={vi.fn()} error={null} isSigning={false} />
    );

    expect(screen.getByTestId("Lot Price")).toHaveTextContent(/^1 XCP$/);
    expect(screen.getByTestId("Lot Size")).toHaveTextContent(/^10$/);
    expect(screen.getByTestId("Hard Cap")).toHaveTextContent(/^1000$/);
  });
});
