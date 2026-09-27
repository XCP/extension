import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { normalizeFormData, verifiedReviewParams } from "@/core/counterparty/normalize";
import { ReviewSweep } from "./review";

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

const DESTINATION = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq";

function renderSweep(params: Record<string, unknown>) {
  render(
    <ReviewSweep
      apiResponse={{ result: { params: { destination: DESTINATION, ...params } } }}
      onSign={vi.fn()}
      onBack={vi.fn()}
      error={null}
      isSigning={false}
    />
  );
}

describe("ReviewSweep", () => {
  // Core's sweep flags: 1 moves every balance, 2 hands over asset ownership, 4 marks the memo binary.
  it.each([
    ["3", "All balances and asset ownership"],
    [3, "All balances and asset ownership"],
    ["1", "All balances"],
    ["2", "Asset ownership only"],
    [7, "All balances and asset ownership"],
    [6, "Asset ownership only"],
    [5, "All balances"],
  ])("states what flags %j move, as the approval screen words it", (flags, includes) => {
    renderSweep({ flags });
    expect(screen.getByTestId("Includes")).toHaveTextContent(includes);
    expect(screen.queryByTestId("Flag")).not.toBeInTheDocument();
  });

  it("does not describe the binary-memo flag as something the sweep moves", () => {
    renderSweep({ flags: 4 });
    expect(screen.queryByTestId("Includes")).not.toBeInTheDocument();
  });

  it("reads the flags from the verified params the form produced, hex memo flag included", async () => {
    const form = new FormData();
    form.set("destination", DESTINATION);
    form.set("flags", "2");
    form.set("memo", "0xdeadbeef");
    const { normalizedData } = await normalizeFormData(form, "sweep");
    expect(normalizedData.flags).toBe(6);
    renderSweep(verifiedReviewParams("sweep", normalizedData));
    expect(screen.getByTestId("Includes")).toHaveTextContent("Asset ownership only");
  });
});
