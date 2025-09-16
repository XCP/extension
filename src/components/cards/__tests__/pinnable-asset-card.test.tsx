import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PinnableAssetCard } from '../pinnable-asset-card';

// Mock the AssetIcon component
vi.mock('@/components/asset-icon', () => ({
  AssetIcon: ({ asset, size, className }: any) => {
    // Mock img element with error handling like the real AssetIcon
    return (
      <img 
        src={`https://app.xcp.io/img/icon/${asset}`}
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
  }
}));

describe('PinnableAssetCard', () => {
  const mockOnPinToggle = vi.fn();
  const mockOnClick = vi.fn();
  const mockOnMoveUp = vi.fn();
  const mockOnMoveDown = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with symbol', () => {
    render(
      <PinnableAssetCard
        symbol="XCP"
        isPinned={false}
        onPinToggle={mockOnPinToggle}
      />
    );
    
    expect(screen.getByText('XCP')).toBeInTheDocument();
  });

  it('displays asset icon with correct URL', () => {
    render(
      <PinnableAssetCard
        symbol="PEPECASH"
        isPinned={false}
        onPinToggle={mockOnPinToggle}
      />
    );
    
    const img = screen.getByAltText('PEPECASH') as HTMLImageElement;
    expect(img.src).toBe('https://app.xcp.io/img/icon/PEPECASH');
  });

  it('shows unpinned state correctly', () => {
    render(
      <PinnableAssetCard
        symbol="TEST"
        isPinned={false}
        onPinToggle={mockOnPinToggle}
      />
    );
    
    const button = screen.getByRole('button', { name: /pin test/i });
    expect(button).toBeInTheDocument();
    expect(button.className).toContain('bg-gray-100');
  });

  it('shows pinned state correctly', () => {
    render(
      <PinnableAssetCard
        symbol="TEST"
        isPinned={true}
        onPinToggle={mockOnPinToggle}
      />
    );
    
    const button = screen.getByRole('button', { name: /unpin test/i });
    expect(button).toBeInTheDocument();
    expect(button.className).toContain('bg-blue-500');
  });

  it('calls onPinToggle when pin button is clicked', () => {
    render(
      <PinnableAssetCard
        symbol="XCP"
        isPinned={false}
        onPinToggle={mockOnPinToggle}
      />
    );
    
    const button = screen.getByRole('button', { name: /pin xcp/i });
    fireEvent.click(button);
    
    expect(mockOnPinToggle).toHaveBeenCalledWith('XCP');
  });

  it('prevents event propagation when pin button is clicked', () => {
    render(
      <PinnableAssetCard
        symbol="XCP"
        isPinned={false}
        onPinToggle={mockOnPinToggle}
        onClick={mockOnClick}
      />
    );
    
    const button = screen.getByRole('button', { name: /pin xcp/i });
    fireEvent.click(button);
    
    expect(mockOnPinToggle).toHaveBeenCalledWith('XCP');
    expect(mockOnClick).not.toHaveBeenCalled();
  });

  it('calls onClick when card is clicked (not pin button)', () => {
    const { container } = render(
      <PinnableAssetCard
        symbol="XCP"
        isPinned={false}
        onPinToggle={mockOnPinToggle}
        onClick={mockOnClick}
      />
    );
    
    const card = container.firstChild as HTMLElement;
    fireEvent.click(card);
    
    expect(mockOnClick).toHaveBeenCalledWith('XCP');
  });

  it('shows arrow buttons when showArrows is true', () => {
    render(
      <PinnableAssetCard
        symbol="XCP"
        isPinned={true}
        onPinToggle={mockOnPinToggle}
        showArrows={true}
        onMoveUp={mockOnMoveUp}
        onMoveDown={mockOnMoveDown}
      />
    );

    expect(screen.getByLabelText('Move XCP up')).toBeInTheDocument();
    expect(screen.getByLabelText('Move XCP down')).toBeInTheDocument();
  });

  it('disables up arrow when onMoveUp is not provided', () => {
    render(
      <PinnableAssetCard
        symbol="XCP"
        isPinned={true}
        onPinToggle={mockOnPinToggle}
        showArrows={true}
        onMoveDown={mockOnMoveDown}
      />
    );

    const upButton = screen.getByLabelText('Move XCP up');
    expect(upButton).toBeDisabled();
  });

  it('calls onMoveUp when up arrow is clicked', () => {
    render(
      <PinnableAssetCard
        symbol="XCP"
        isPinned={true}
        onPinToggle={mockOnPinToggle}
        showArrows={true}
        onMoveUp={mockOnMoveUp}
        onMoveDown={mockOnMoveDown}
      />
    );

    const upButton = screen.getByLabelText('Move XCP up');
    fireEvent.click(upButton);

    expect(mockOnMoveUp).toHaveBeenCalled();
  });

  it('calls onMoveDown when down arrow is clicked', () => {
    render(
      <PinnableAssetCard
        symbol="XCP"
        isPinned={true}
        onPinToggle={mockOnPinToggle}
        showArrows={true}
        onMoveUp={mockOnMoveUp}
        onMoveDown={mockOnMoveDown}
      />
    );

    const downButton = screen.getByLabelText('Move XCP down');
    fireEvent.click(downButton);

    expect(mockOnMoveDown).toHaveBeenCalled();
  });

  it('does not show arrows when showArrows is false', () => {
    render(
      <PinnableAssetCard
        symbol="XCP"
        isPinned={true}
        onPinToggle={mockOnPinToggle}
        showArrows={false}
      />
    );

    expect(screen.queryByLabelText('Move XCP up')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Move XCP down')).not.toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <PinnableAssetCard
        symbol="XCP"
        isPinned={false}
        onPinToggle={mockOnPinToggle}
        className="custom-class"
      />
    );
    
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('custom-class');
  });

  it('handles image error with fallback', () => {
    render(
      <PinnableAssetCard
        symbol="INVALID"
        isPinned={false}
        onPinToggle={mockOnPinToggle}
      />
    );
    
    const img = screen.getByAltText('INVALID') as HTMLImageElement;
    fireEvent.error(img);
    
    // Check that fallback SVG is set
    expect(img.src).toContain('data:image/svg+xml');
  });

  it('has hover effect on pin button', () => {
    render(
      <PinnableAssetCard
        symbol="XCP"
        isPinned={false}
        onPinToggle={mockOnPinToggle}
      />
    );
    
    const button = screen.getByRole('button', { name: /pin xcp/i });
    expect(button.className).toContain('hover:scale-110');
  });

  it('does not make card clickable when onClick is not provided', () => {
    const { container } = render(
      <PinnableAssetCard
        symbol="XCP"
        isPinned={false}
        onPinToggle={mockOnPinToggle}
      />
    );
    
    const card = container.firstChild as HTMLElement;
    expect(card).not.toHaveAttribute('role', 'button');
    expect(card).not.toHaveAttribute('tabIndex');
  });

  it('handles keyboard navigation when onClick is provided', () => {
    const { container } = render(
      <PinnableAssetCard
        symbol="XCP"
        isPinned={false}
        onPinToggle={mockOnPinToggle}
        onClick={mockOnClick}
      />
    );
    
    const card = container.firstChild as HTMLElement;
    fireEvent.keyDown(card, { key: 'Enter' });
    
    expect(mockOnClick).toHaveBeenCalledWith('XCP');
  });
});