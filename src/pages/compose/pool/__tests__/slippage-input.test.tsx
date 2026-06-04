import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SlippageInput } from "../slippage-input";

afterEach(() => cleanup());

function setup(value = "1") {
  const onChange = vi.fn();
  render(<SlippageInput value={value} onChange={onChange} showHelpText />);
  return { onChange };
}

describe("SlippageInput", () => {
  it("renders the rationalized presets and a custom field", () => {
    setup();
    expect(screen.getByRole("button", { name: "0.5%" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1%" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "3%" })).toBeInTheDocument();
    expect(screen.getByLabelText("Custom slippage percent")).toBeInTheDocument();
  });

  it("emits the preset value when a chip is clicked", () => {
    const { onChange } = setup("1");
    fireEvent.click(screen.getByRole("button", { name: "3%" }));
    expect(onChange).toHaveBeenCalledWith("3");
  });

  it("holds the value in the custom field only when it is not a preset", () => {
    setup("2");
    expect(screen.getByLabelText("Custom slippage percent")).toHaveValue("2");
  });

  it("emits typed custom values and rejects non-numeric input", () => {
    const { onChange } = setup("1");
    const custom = screen.getByLabelText("Custom slippage percent");

    fireEvent.change(custom, { target: { value: "0.3" } });
    expect(onChange).toHaveBeenCalledWith("0.3");

    onChange.mockClear();
    fireEvent.change(custom, { target: { value: "abc" } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("warns on a very low tolerance (below the tightest preset)", () => {
    setup("0.1");
    expect(screen.getByText(/Very low/i)).toBeInTheDocument();
  });

  it("warns on a very high tolerance", () => {
    setup("10");
    expect(screen.getByText(/Very high/i)).toBeInTheDocument();
  });

  it("shows no warning for an in-band value", () => {
    setup("1");
    expect(screen.queryByText(/Very low|Very high/i)).not.toBeInTheDocument();
  });
});
