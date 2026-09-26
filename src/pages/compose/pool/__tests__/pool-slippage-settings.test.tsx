import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PoolSlippageSettings } from "../pool-slippage-settings";
import { SLIPPAGE_SAVE_DELAY_MS } from "../use-slippage-default";

const mockUpdateSettings = vi.fn();
const mockSettings: { defaultPoolSlippage?: string } = {};
vi.mock("@/contexts/settings-context", () => ({
  useSettings: () => ({ settings: mockSettings, updateSettings: mockUpdateSettings }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockUpdateSettings.mockResolvedValue(undefined);
  delete mockSettings.defaultPoolSlippage;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Let the save pause elapse and the queued save run. */
async function pause(): Promise<void> {
  await act(async () => { await vi.advanceTimersByTimeAsync(SLIPPAGE_SAVE_DELAY_MS); });
}

describe("PoolSlippageSettings", () => {
  it("updates the per-transaction value and persists it as the default", async () => {
    const onChange = vi.fn();
    render(<PoolSlippageSettings value="1" onChange={onChange} onBack={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "3%" }));

    expect(onChange).toHaveBeenCalledWith("3");
    await pause();
    expect(mockUpdateSettings).toHaveBeenCalledWith({ defaultPoolSlippage: "3" });
  });

  it("persists a custom value as the default", async () => {
    const onChange = vi.fn();
    render(<PoolSlippageSettings value="1" onChange={onChange} onBack={() => {}} />);

    fireEvent.change(screen.getByLabelText("Custom slippage percent"), {
      target: { value: "0.8" },
    });

    expect(onChange).toHaveBeenCalledWith("0.8");
    await pause();
    expect(mockUpdateSettings).toHaveBeenCalledWith({ defaultPoolSlippage: "0.8" });
  });

  it("saves once per pause in typing, not once per keystroke", async () => {
    render(<PoolSlippageSettings value="1" onChange={() => {}} onBack={() => {}} />);
    const input = screen.getByLabelText("Custom slippage percent");

    for (const draft of ["0", "0.", "0.7", "0.75"]) {
      fireEvent.change(input, { target: { value: draft } });
      await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    }
    expect(mockUpdateSettings).not.toHaveBeenCalled();

    await pause();
    expect(mockUpdateSettings).toHaveBeenCalledExactlyOnceWith({ defaultPoolSlippage: "0.75" });
  });

  it("does not save a value equal to the stored default", async () => {
    mockSettings.defaultPoolSlippage = "3";
    render(<PoolSlippageSettings value="1" onChange={() => {}} onBack={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "3%" }));
    await pause();

    expect(mockUpdateSettings).not.toHaveBeenCalled();
  });

  it("still saves the last edit when the panel closes inside the pause", async () => {
    const { unmount } = render(<PoolSlippageSettings value="1" onChange={() => {}} onBack={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "0.5%" }));
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(mockUpdateSettings).toHaveBeenCalledExactlyOnceWith({ defaultPoolSlippage: "0.5" });
  });

  it("calls onBack when Done is pressed", () => {
    const onBack = vi.fn();
    render(<PoolSlippageSettings value="1" onChange={() => {}} onBack={onBack} />);

    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(onBack).toHaveBeenCalled();
  });
});
