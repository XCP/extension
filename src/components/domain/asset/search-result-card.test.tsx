import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SearchResultCard } from "./search-result-card";

// Mock the AssetIcon component
vi.mock("@/components/domain/asset/asset-icon", () => ({
  AssetIcon: ({ asset, size, className }: any) => {
    // Mock img element with error handling like the real AssetIcon
    return (
      <img
        src={`https://cdn.xcp.io/img/icon/${asset}`}
        alt={asset}
        className={className}
        data-size={size}
        onError={(e) => {
          // Set fallback SVG on error like the real component
          const target = e.target as HTMLImageElement;
          target.src = `data:image/svg+xml;base64,${btoa(`<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 48 48'><rect width='48' height='48' fill='#e5e7eb' rx='24'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='#9ca3af' font-family='system-ui' font-size='16'>${asset.slice(0, 3).toUpperCase()}</text></svg>`)}`;
        }}
      />
    );
  },
}));

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock("react-router", () => ({
  useNavigate: () => mockNavigate,
}));

describe("SearchResultCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders with symbol", () => {
    render(<SearchResultCard symbol="XCP" />);

    expect(screen.getByText("XCP")).toBeInTheDocument();
  });

  it("displays asset icon with correct URL", () => {
    render(<SearchResultCard symbol="PEPECASH" />);

    const img = screen.getByAltText("PEPECASH") as HTMLImageElement;
    expect(img.src).toBe("https://cdn.xcp.io/img/icon/PEPECASH");
  });

  it("navigates to asset page by default on click", () => {
    render(<SearchResultCard symbol="RARE" />);

    const card = screen.getByRole("button");
    fireEvent.click(card);

    expect(mockNavigate).toHaveBeenCalledWith("/assets/RARE");
  });

  it("navigates to balance page when navigationType is balance", () => {
    render(<SearchResultCard symbol="XCP" navigationType="balance" />);

    const card = screen.getByRole("button");
    fireEvent.click(card);

    expect(mockNavigate).toHaveBeenCalledWith("/assets/XCP/balance");
  });

  it("calls custom onClick handler when provided", () => {
    const mockOnClick = vi.fn();
    render(<SearchResultCard symbol="TEST" onClick={mockOnClick} />);

    const card = screen.getByRole("button");
    fireEvent.click(card);

    expect(mockOnClick).toHaveBeenCalledWith("TEST");
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // Keyboard activation is the platform's job now: a real <button> turns Enter
  // and Space into a click. jsdom does not synthesise that, so asserting the
  // element type is what actually pins the behaviour down.
  it("is a real button, so the browser handles keyboard activation", () => {
    render(<SearchResultCard symbol="XCP" />);

    const card = screen.getByRole("button");
    expect(card.tagName).toBe("BUTTON");
    expect(card).toHaveAttribute("type", "button");
  });

  it("applies custom className", () => {
    render(<SearchResultCard symbol="TEST" className="custom-class" />);

    const card = screen.getByRole("button");
    expect(card.className).toContain("custom-class");
  });

  it("has hover styles", () => {
    render(<SearchResultCard symbol="TEST" />);

    const card = screen.getByRole("button");
    expect(card.className).toContain("hover:bg-gray-50");
  });

  it("has proper accessibility attributes", () => {
    render(<SearchResultCard symbol="XCP" />);

    const card = screen.getByRole("button");
    expect(card).toHaveAttribute("aria-label", "View XCP");
  });

  it("handles image error with fallback", () => {
    render(<SearchResultCard symbol="INVALID" />);

    const img = screen.getByAltText("INVALID") as HTMLImageElement;
    fireEvent.error(img);

    // Check that fallback SVG is set
    expect(img.src).toContain("data:image/svg+xml");
  });
});
