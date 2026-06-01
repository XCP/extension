import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BalanceMenu } from './balance-menu';

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

  const openMenu = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Balance actions' }));
  };

  it('should render menu button', () => {
    render(
      <MemoryRouter>
        <BalanceMenu asset="BTC" />
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: 'Balance actions' })).toBeInTheDocument();
  });

  it('should show BTC-specific quick actions', async () => {
    render(
      <MemoryRouter>
        <BalanceMenu asset="BTC" />
      </MemoryRouter>
    );

    openMenu();

    await waitFor(() => {
      expect(screen.getByText('Send')).toBeInTheDocument();
      expect(screen.getByText('Swap')).toBeInTheDocument();
      expect(screen.getByText('Mint')).toBeInTheDocument();
      expect(screen.queryByText('Dispense')).not.toBeInTheDocument();
      expect(screen.queryByText('BTC Pay')).not.toBeInTheDocument();
    });
  });

  it('should show XCP-specific actions', async () => {
    render(
      <MemoryRouter>
        <BalanceMenu asset="XCP" />
      </MemoryRouter>
    );

    openMenu();

    await waitFor(() => {
      expect(screen.getByText('Send')).toBeInTheDocument();
      expect(screen.getByText('Swap')).toBeInTheDocument();
      expect(screen.getByText('Mint')).toBeInTheDocument();
      expect(screen.queryByText('Sell')).not.toBeInTheDocument();
      expect(screen.queryByText('Dispense')).not.toBeInTheDocument();
      expect(screen.queryByText('BTC Pay')).not.toBeInTheDocument();
    });
  });

  it('should show other asset actions', async () => {
    render(
      <MemoryRouter>
        <BalanceMenu asset="TESTASSET" />
      </MemoryRouter>
    );

    openMenu();

    await waitFor(() => {
      expect(screen.getByText('Send')).toBeInTheDocument();
      expect(screen.getByText('Sell')).toBeInTheDocument();
      expect(screen.getByText('Swap')).toBeInTheDocument();
      expect(screen.queryByText('Mint')).not.toBeInTheDocument();
    });
  });

  it('should navigate to encoded send path', async () => {
    render(
      <MemoryRouter>
        <BalanceMenu asset="ASSET/NAME" />
      </MemoryRouter>
    );

    openMenu();
    fireEvent.click(await screen.findByText('Send'));

    expect(mockNavigate).toHaveBeenCalledWith('/compose/send/ASSET%2FNAME');
  });

  it('should navigate to sell path for other assets', async () => {
    render(
      <MemoryRouter>
        <BalanceMenu asset="TESTASSET" />
      </MemoryRouter>
    );

    openMenu();
    fireEvent.click(await screen.findByText('Sell'));

    expect(mockNavigate).toHaveBeenCalledWith('/compose/dispenser/TESTASSET');
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

    const menuContainer = screen.getByRole('button', { name: 'Balance actions' }).closest('div[class*="relative"]');
    if (menuContainer) {
      fireEvent.click(menuContainer);
    }

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

    openMenu();
    mockOnClick.mockClear();
    fireEvent.click(await screen.findByText('Send'));

    expect(mockOnClick).not.toHaveBeenCalled();
  });
});
