import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { NumberInput } from "../number-input";

describe("NumberInput", () => {
  it("should render number input", () => {
    render(
      <NumberInput 
        value={0} 
        onChange={() => {}} 
        placeholder="Enter number..."
      />
    );
    
    const input = screen.getByPlaceholderText("Enter number...");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("inputMode", "decimal");
  });

  it("should call onChange when typing valid number", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    
    render(
      <NumberInput 
        value={0} 
        onChange={handleChange}
      />
    );
    
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "42");
    
    expect(handleChange).toHaveBeenCalledWith(4);
    expect(handleChange).toHaveBeenCalledWith(42);
  });

  it("should validate min and max bounds", () => {
    const handleValidation = vi.fn();
    
    const { rerender } = render(
      <NumberInput 
        value={50} 
        onChange={() => {}}
        onValidationChange={handleValidation}
        min={10}
        max={100}
      />
    );
    
    // Valid value
    expect(handleValidation).toHaveBeenLastCalledWith(true);
    
    // Below min
    rerender(
      <NumberInput 
        value={5} 
        onChange={() => {}}
        onValidationChange={handleValidation}
        min={10}
        max={100}
      />
    );
    expect(handleValidation).toHaveBeenLastCalledWith(false);
    
    // Above max
    rerender(
      <NumberInput 
        value={150} 
        onChange={() => {}}
        onValidationChange={handleValidation}
        min={10}
        max={100}
      />
    );
    expect(handleValidation).toHaveBeenLastCalledWith(false);
  });

  it("should show error message for invalid values", () => {
    render(
      <NumberInput 
        value={5} 
        onChange={() => {}}
        min={10}
        max={100}
      />
    );
    
    expect(screen.getByText("Minimum value is 10")).toBeInTheDocument();
  });

  it("should handle integer format", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    
    render(
      <NumberInput 
        value={0} 
        onChange={handleChange}
        format="integer"
      />
    );
    
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "3.14");
    
    // In integer mode, typing decimal point is blocked, so we get "314"
    expect(input).toHaveValue("314");
  });

  it("should show step buttons when enabled", () => {
    render(
      <NumberInput 
        value={5} 
        onChange={() => {}}
        showStepButtons={true}
      />
    );
    
    const increaseButton = screen.getByLabelText("Increase value");
    const decreaseButton = screen.getByLabelText("Decrease value");
    
    expect(increaseButton).toBeInTheDocument();
    expect(decreaseButton).toBeInTheDocument();
  });

  it("should increment and decrement with step buttons", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    
    const { rerender } = render(
      <NumberInput 
        value={10} 
        onChange={handleChange}
        showStepButtons={true}
        step={5}
      />
    );
    
    const increaseButton = screen.getByLabelText("Increase value");
    await user.click(increaseButton);
    expect(handleChange).toHaveBeenCalledWith(15);
    
    // Re-render with new value to simulate parent update
    rerender(
      <NumberInput 
        value={15} 
        onChange={handleChange}
        showStepButtons={true}
        step={5}
      />
    );
    
    const decreaseButton = screen.getByLabelText("Decrease value");
    await user.click(decreaseButton);
    expect(handleChange).toHaveBeenCalledWith(10);
  });

  it("should disable step buttons at bounds", () => {
    const { rerender } = render(
      <NumberInput 
        value={10} 
        onChange={() => {}}
        showStepButtons={true}
        min={10}
        max={20}
      />
    );
    
    const decreaseButton = screen.getByLabelText("Decrease value");
    expect(decreaseButton).toBeDisabled();
    
    // Update to max value
    rerender(
      <NumberInput 
        value={20} 
        onChange={() => {}}
        showStepButtons={true}
        min={10}
        max={20}
      />
    );
    
    const increaseButton = screen.getByLabelText("Increase value");
    expect(increaseButton).toBeDisabled();
  });

  it("should format decimals on blur", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    
    render(
      <NumberInput 
        value={0} 
        onChange={handleChange}
        decimals={2}
      />
    );
    
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "3.14159");
    
    // Blur the input
    fireEvent.blur(input);
    
    // Should format to 2 decimals
    expect(handleChange).toHaveBeenLastCalledWith(3.14);
    expect(input).toHaveValue("3.14");
  });

  it("should show label with required indicator", () => {
    render(
      <NumberInput 
        value={0} 
        onChange={() => {}}
        label="Quantity"
        required={true}
      />
    );
    
    expect(screen.getByText("Quantity")).toBeInTheDocument();
    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("should disable input when disabled prop is true", () => {
    render(
      <NumberInput 
        value={0} 
        onChange={() => {}}
        disabled={true}
      />
    );
    
    const input = screen.getByRole("textbox");
    expect(input).toBeDisabled();
  });

  it("should use numeric inputMode for integer format", () => {
    render(
      <NumberInput 
        value={0} 
        onChange={() => {}}
        format="integer"
      />
    );
    
    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("inputMode", "numeric");
  });

  it("should allow empty value when not required", () => {
    const handleValidation = vi.fn();
    
    render(
      <NumberInput 
        value="" 
        onChange={() => {}}
        onValidationChange={handleValidation}
        required={false}
      />
    );
    
    expect(handleValidation).toHaveBeenCalledWith(true);
  });
});