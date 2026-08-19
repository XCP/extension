import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
});
