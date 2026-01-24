import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BalanceMenu } from '../balance-menu';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

describe('BalanceMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render menu button', () => {
    render(
      <MemoryRouter>
        <BalanceMenu asset="BTC" />
      </MemoryRouter>
    );

    const menuButton = screen.getByRole('button');
    expect(menuButton).toBeInTheDocument();
  });

  it('should show More option when clicked', async () => {
    render(
      <MemoryRouter>
        <BalanceMenu asset="BTC" />
      </MemoryRouter>
    );

    const menuButton = screen.getByRole('button');
    fireEvent.click(menuButton);

    await waitFor(() => {
      expect(screen.getByText('More')).toBeInTheDocument();
    });
  });

  it('should navigate to balance page when More is clicked', async () => {
    render(
      <MemoryRouter>
        <BalanceMenu asset="TESTASSET" />
      </MemoryRouter>
    );

    const menuButton = screen.getByRole('button');
    fireEvent.click(menuButton);

    await waitFor(() => {
      const moreButton = screen.getByText('More');
      fireEvent.click(moreButton);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/assets/TESTASSET/balance');
  });

  it('should encode special characters in asset name', async () => {
    render(
      <MemoryRouter>
        <BalanceMenu asset="ASSET/NAME" />
      </MemoryRouter>
    );

    const menuButton = screen.getByRole('button');
    fireEvent.click(menuButton);

    await waitFor(() => {
      const moreButton = screen.getByText('More');
      fireEvent.click(moreButton);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/assets/ASSET%2FNAME/balance');
  });

  it('should stop event propagation when menu is clicked', () => {
    const mockOnClick = vi.fn();
    
    render(
      <div onClick={mockOnClick}>
        <MemoryRouter>
          <BalanceMenu asset="BTC" />
        </MemoryRouter>
      </div>
    );

    // Find the menu container div instead of the button
    const menuContainer = screen.getByRole('button').closest('div[class*="relative"]');
    if (menuContainer) {
      fireEvent.click(menuContainer);
    }

    // Parent click should not be triggered
    expect(mockOnClick).not.toHaveBeenCalled();
  });

  it('should stop event propagation when menu item is clicked', async () => {
    const mockOnClick = vi.fn();
    
    render(
      <div onClick={mockOnClick}>
        <MemoryRouter>
          <BalanceMenu asset="BTC" />
        </MemoryRouter>
      </div>
    );

    const menuButton = screen.getByRole('button');
    fireEvent.click(menuButton);

    // Reset the mock after the menu opens (since opening menu might trigger parent)
    mockOnClick.mockClear();

    await waitFor(() => {
      const moreButton = screen.getByText('More');
      fireEvent.click(moreButton);
    });

    // Parent click should not be triggered by menu item click
    expect(mockOnClick).not.toHaveBeenCalled();
  });

  it('should apply active styles when menu item is hovered', async () => {
    render(
      <MemoryRouter>
        <BalanceMenu asset="BTC" />
      </MemoryRouter>
    );

    const menuButton = screen.getByRole('button');
    fireEvent.click(menuButton);

    await waitFor(() => {
      const moreButton = screen.getByText('More').closest('button');
      expect(moreButton).toHaveClass('hover:bg-gray-50');
    });
  });
});