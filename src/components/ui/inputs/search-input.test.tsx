import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { SearchInput } from "./search-input";

describe("SearchInput", () => {
  it("should render search input with icon", () => {
    render(
      <SearchInput 
        value="" 
        onChange={() => {}} 
        placeholder="Search items..."
      />
    );
    
    const input = screen.getByPlaceholderText("Search items...");
    expect(input).toBeInTheDocument();
  });

  it("should call onChange when typing", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    
    render(
      <SearchInput 
        value="" 
        onChange={handleChange}
      />
    );
    
    const input = screen.getByRole("textbox");
    await user.type(input, "test");
    
    // SearchInput auto-uppercases input
    expect(handleChange).toHaveBeenCalledWith("T");
    expect(handleChange).toHaveBeenCalledWith("TE");
    expect(handleChange).toHaveBeenCalledWith("TES");
    expect(handleChange).toHaveBeenCalledWith("TEST");
  });

  it("should debounce onSearch callback", async () => {
    vi.useFakeTimers();
    const handleSearch = vi.fn();
    const handleChange = vi.fn();
    
    const { rerender } = render(
      <SearchInput 
        value="" 
        onChange={handleChange}
        onSearch={handleSearch}
        debounceMs={100}
      />
    );
    
    // Simulate value change from parent
    rerender(
      <SearchInput 
        value="test" 
        onChange={handleChange}
        onSearch={handleSearch}
        debounceMs={100}
      />
    );
    
    // Should not call immediately
    expect(handleSearch).not.toHaveBeenCalled();
    
    // Advance timers
    vi.advanceTimersByTime(100);
    
    // Now it should have been called
    expect(handleSearch).toHaveBeenCalledWith("test");
    
    vi.useRealTimers();
  });

  it("should show clear button when has value", () => {
    render(
      <SearchInput 
        value="test" 
        onChange={() => {}}
        showClearButton={true}
      />
    );
    
    const clearButton = screen.getByLabelText("Clear search");
    expect(clearButton).toBeInTheDocument();
  });

  it("should clear input when clear button clicked", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    const handleSearch = vi.fn();
    
    render(
      <SearchInput 
        value="test" 
        onChange={handleChange}
        onSearch={handleSearch}
        showClearButton={true}
      />
    );
    
    const clearButton = screen.getByLabelText("Clear search");
    await user.click(clearButton);
    
    expect(handleChange).toHaveBeenCalledWith("");
    expect(handleSearch).toHaveBeenCalledWith("");
  });

  it("should show loading spinner when isLoading", () => {
    const { container } = render(
      <SearchInput 
        value="" 
        onChange={() => {}}
        isLoading={true}
      />
    );
    
    const spinner = container.querySelector(".animate-spin");
    expect(spinner).toBeInTheDocument();
    expect(spinner).toHaveClass("border-gray-500");
  });

  it("should disable input when disabled prop is true", () => {
    render(
      <SearchInput 
        value="" 
        onChange={() => {}}
        disabled={true}
      />
    );
    
    const input = screen.getByRole("textbox");
    expect(input).toBeDisabled();
  });

  it("should show label and required indicator", () => {
    render(
      <SearchInput 
        value="" 
        onChange={() => {}}
        label="Search Assets"
        required={true}
      />
    );
    
    expect(screen.getByText("Search Assets")).toBeInTheDocument();
    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("should show help text when showHelpText is true", () => {
    render(
      <SearchInput 
        value="" 
        onChange={() => {}}
        showHelpText={true}
        description="Type to search for assets"
      />
    );
    
    expect(screen.getByText("Type to search for assets")).toBeInTheDocument();
  });
});