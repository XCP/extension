import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchResultCard } from '../search-result-card';

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

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

describe('SearchResultCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with symbol', () => {
    render(<SearchResultCard symbol="XCP" />);
    
    expect(screen.getByText('XCP')).toBeInTheDocument();
  });

  it('displays asset icon with correct URL', () => {
    render(<SearchResultCard symbol="PEPECASH" />);
    
    const img = screen.getByAltText('PEPECASH') as HTMLImageElement;
    expect(img.src).toBe('https://app.xcp.io/img/icon/PEPECASH');
  });

  it('navigates to asset page by default on click', () => {
    render(<SearchResultCard symbol="RARE" />);
    
    const card = screen.getByRole('button');
    fireEvent.click(card);
    
    expect(mockNavigate).toHaveBeenCalledWith('/asset/RARE');
  });

  it('navigates to balance page when navigationType is balance', () => {
    render(<SearchResultCard symbol="XCP" navigationType="balance" />);
    
    const card = screen.getByRole('button');
    fireEvent.click(card);
    
    expect(mockNavigate).toHaveBeenCalledWith('/balance/XCP');
  });

  it('calls custom onClick handler when provided', () => {
    const mockOnClick = vi.fn();
    render(<SearchResultCard symbol="TEST" onClick={mockOnClick} />);
    
    const card = screen.getByRole('button');
    fireEvent.click(card);
    
    expect(mockOnClick).toHaveBeenCalledWith('TEST');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('handles keyboard navigation with Enter key', () => {
    render(<SearchResultCard symbol="XCP" />);
    
    const card = screen.getByRole('button');
    fireEvent.keyDown(card, { key: 'Enter' });
    
    expect(mockNavigate).toHaveBeenCalledWith('/asset/XCP');
  });

  it('handles keyboard navigation with Space key', () => {
    render(<SearchResultCard symbol="XCP" />);
    
    const card = screen.getByRole('button');
    fireEvent.keyDown(card, { key: ' ' });
    
    expect(mockNavigate).toHaveBeenCalledWith('/asset/XCP');
  });

  it('applies custom className', () => {
    render(<SearchResultCard symbol="TEST" className="custom-class" />);
    
    const card = screen.getByRole('button');
    expect(card.className).toContain('custom-class');
  });

  it('has hover styles', () => {
    render(<SearchResultCard symbol="TEST" />);
    
    const card = screen.getByRole('button');
    expect(card.className).toContain('hover:bg-gray-50');
  });

  it('has proper accessibility attributes', () => {
    render(<SearchResultCard symbol="XCP" />);
    
    const card = screen.getByRole('button');
    expect(card).toHaveAttribute('tabIndex', '0');
    expect(card).toHaveAttribute('aria-label', 'View XCP');
  });

  it('handles image error with fallback', () => {
    render(<SearchResultCard symbol="INVALID" />);
    
    const img = screen.getByAltText('INVALID') as HTMLImageElement;
    fireEvent.error(img);
    
    // Check that fallback SVG is set
    expect(img.src).toContain('data:image/svg+xml');
  });
});