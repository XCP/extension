import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchOrder } from "@/core/counterparty/api";
import { ReviewCancel } from "./review";

vi.mock("@/core/counterparty/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/core/counterparty/api")>()),
  fetchOrder: vi.fn(),
}));

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

const OFFER_HASH = "c3".repeat(32);

function renderCancel() {
  render(
    <ReviewCancel
      apiResponse={{ result: { params: { source: "1Source", offer_hash: OFFER_HASH } } }}
      onSign={vi.fn()}
      onBack={vi.fn()}
      error={null}
      isSigning={false}
    />
  );
}

describe("ReviewCancel", () => {
  beforeEach(() => {
    vi.mocked(fetchOrder).mockReset();
  });

  it("names the order being cancelled, as the approval screen does", async () => {
    vi.mocked(fetchOrder).mockResolvedValue({
      give_asset: "XCP",
      give_quantity_normalized: "1.50000000",
      get_asset: "A95428956661682177",
      get_asset_info: { asset_longname: "PEPE.RARE", divisible: false },
      get_quantity_normalized: "100",
    } as any);
    renderCancel();
    expect(screen.getByTestId("Order")).toHaveTextContent("Loading…");
    await waitFor(() => expect(screen.getByTestId("Order")).toHaveTextContent("Give 1.50000000 XCP for 100 PEPE.RARE"));
    expect(fetchOrder).toHaveBeenCalledWith(OFFER_HASH);
    expect(screen.getByTestId("Order Hash")).toHaveTextContent(OFFER_HASH);
  });

  it.each([
    ["the lookup fails", "reject"],
    ["the ledger has no such order", "missing"],
  ] as const)("says the terms could not be loaded when %s", async (_, outcome) => {
    if (outcome === "reject") vi.mocked(fetchOrder).mockRejectedValue(new Error("offline"));
    else vi.mocked(fetchOrder).mockResolvedValue(null);
    renderCancel();
    await waitFor(() => expect(screen.getByTestId("Order")).toHaveTextContent("Could not load this order's terms."));
    expect(screen.getByTestId("Order Hash")).toHaveTextContent(OFFER_HASH);
  });
});
