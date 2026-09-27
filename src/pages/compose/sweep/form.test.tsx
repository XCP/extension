import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SweepOptions } from "@/core/counterparty/compose";
import { SweepForm } from "./form";

vi.mock("@/contexts/composer-context-object", () => ({
  useComposer: () => ({
    state: { error: null, isComposing: false }, clearError: vi.fn(),
    activeAddress: { address: "1CounterpartyXXXXXXXXXXXXXXXUWLpVr" }, activeWallet: { name: "Test" },
    showHelpText: false, feeRate: 1, setFeeRate: vi.fn(), settings: {},
  }),
}));
vi.mock("@/hooks/useAssetDetails", () => ({ useAssetDetails: () => ({ data: { availableBalance: "0" } }) }));
vi.mock("@/components/domain/address/address-header", () => ({ AddressHeader: () => null }));
vi.mock("@/components/ui/inputs/fee-rate-input", () => ({ FeeRateInput: () => null }));

function restoredFlags(flags: unknown): string | undefined {
  const { container, unmount } = render(
    <SweepForm formAction={vi.fn()} initialFormData={{ destination: "", flags } as unknown as SweepOptions} />
  );
  const value = container.querySelector<HTMLInputElement>('input[name="flags"]')?.value;
  unmount();
  return value;
}

describe("SweepForm", () => {
  // The composer keeps the submitted form as strings, so going back from review restores "2", not 2.
  it.each([
    ["1", "1"],
    ["2", "2"],
    ["3", "3"],
    [2, "2"],
    [6, "2"],
    [undefined, "3"],
  ])("restores the sweep type from flags %j", (flags, expected) => {
    expect(restoredFlags(flags)).toBe(expected);
  });
});
