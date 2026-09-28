import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAssetDetails } from "@/core/counterparty/api";
import { ReviewDestroy } from "./review";

vi.mock("@/core/counterparty/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/core/counterparty/api")>()),
  fetchAssetDetails: vi.fn(),
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

function renderDestroy(params: Record<string, unknown>) {
  render(
    <ReviewDestroy
      apiResponse={{ result: { params: { source: "1Source", asset: "PEPE", ...params } } }}
      onSign={vi.fn()}
      onBack={vi.fn()}
      error={null}
      isSigning={false}
    />
  );
}

// As `verifiedReviewParams` leaves them: the base-unit quantity, its display form, and the verified
// divisibility under `asset_info`.
const DIVISIBLE = { quantity: "25000000000", quantity_normalized: "250", asset_info: { divisible: true } };
const INDIVISIBLE = { quantity: "250", quantity_normalized: "250", asset_info: { divisible: false } };

describe("ReviewDestroy", () => {
  beforeEach(() => {
    vi.mocked(fetchAssetDetails).mockReset();
    vi.mocked(fetchAssetDetails).mockResolvedValue({ asset: "PEPE", supply_normalized: "1000" } as any);
  });

  it.each([
    ["divisible", DIVISIBLE],
    ["indivisible", INDIVISIBLE],
  ])("states the supply before and after, and the share destroyed (%s)", async (_, params) => {
    renderDestroy(params);
    expect(screen.getByTestId("Amount")).toHaveTextContent("250 PEPE");
    expect(screen.getByTestId("Supply before")).toHaveTextContent("Loading…");
    await waitFor(() => expect(screen.getByTestId("Supply before")).toHaveTextContent("1000 PEPE"));
    expect(screen.getByTestId("Supply after")).toHaveTextContent("750 PEPE");
    expect(screen.getByTestId("Share destroyed")).toHaveTextContent("25.00%");
    expect(fetchAssetDetails).toHaveBeenCalledWith("PEPE");
  });

  it("derives nothing from a quantity whose divisibility is unverified", async () => {
    renderDestroy({ quantity: "25000000000", quantity_normalized: "250" });
    await waitFor(() => expect(screen.getByTestId("Supply before")).toHaveTextContent("1000 PEPE"));
    expect(screen.queryByTestId("Supply after")).not.toBeInTheDocument();
    expect(screen.queryByTestId("Share destroyed")).not.toBeInTheDocument();
  });

  it("says the supply could not be loaded rather than leaving the amount without scale", async () => {
    vi.mocked(fetchAssetDetails).mockRejectedValue(new Error("offline"));
    renderDestroy(DIVISIBLE);
    await waitFor(() => expect(screen.getByTestId("Supply before")).toHaveTextContent("Could not load this asset's supply."));
    expect(screen.getByTestId("Amount")).toHaveTextContent("250 PEPE");
  });

  it("keeps the tag", async () => {
    renderDestroy({ ...DIVISIBLE, tag: "burned for the drop" });
    expect(screen.getByTestId("Memo")).toHaveTextContent("burned for the drop");
    await waitFor(() => expect(screen.getByTestId("Supply before")).toHaveTextContent("1000 PEPE"));
  });
});
