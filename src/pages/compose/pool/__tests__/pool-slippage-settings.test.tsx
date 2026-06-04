import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { PoolSlippageSettings } from "../pool-slippage-settings";

const mockUpdateSettings = vi.fn();
vi.mock("@/contexts/settings-context", () => ({
  useSettings: () => ({ settings: {}, updateSettings: mockUpdateSettings }),
}));

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("PoolSlippageSettings", () => {
  it("updates the per-transaction value and persists it as the default", () => {
    const onChange = vi.fn();
    render(<PoolSlippageSettings value="1" onChange={onChange} onBack={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "3%" }));

    expect(onChange).toHaveBeenCalledWith("3");
    expect(mockUpdateSettings).toHaveBeenCalledWith({ defaultPoolSlippage: "3" });
  });

  it("persists a custom value as the default", () => {
    const onChange = vi.fn();
    render(<PoolSlippageSettings value="1" onChange={onChange} onBack={() => {}} />);

    fireEvent.change(screen.getByLabelText("Custom slippage percent"), {
      target: { value: "0.8" },
    });

    expect(onChange).toHaveBeenCalledWith("0.8");
    expect(mockUpdateSettings).toHaveBeenCalledWith({ defaultPoolSlippage: "0.8" });
  });

  it("calls onBack when Done is pressed", () => {
    const onBack = vi.fn();
    render(<PoolSlippageSettings value="1" onChange={() => {}} onBack={onBack} />);

    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(onBack).toHaveBeenCalled();
  });
});
