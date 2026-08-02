import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { BalanceMenu } from './balance-menu';

const mockNavigate = vi.fn();
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
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

  it('offers Destroy for a Counterparty asset', async () => {
    render(
      <MemoryRouter>
        <BalanceMenu asset="RAREPEPE" />
      </MemoryRouter>
    );

    openMenu();

    fireEvent.click(await screen.findByText('Destroy'));
    expect(mockNavigate).toHaveBeenCalledWith('/compose/issuance/destroy/RAREPEPE');
  });

  it('offers Destroy for XCP', async () => {
    render(
      <MemoryRouter>
        <BalanceMenu asset="XCP" />
      </MemoryRouter>
    );

    openMenu();

    fireEvent.click(await screen.findByText('Destroy'));
    expect(mockNavigate).toHaveBeenCalledWith('/compose/issuance/destroy/XCP');
  });

  it('does not offer Destroy for BTC, which is not a Counterparty asset', async () => {
    render(
      <MemoryRouter>
        <BalanceMenu asset="BTC" />
      </MemoryRouter>
    );

    openMenu();

    await waitFor(() => expect(screen.getByText('Send')).toBeInTheDocument());
    expect(screen.queryByText('Destroy')).not.toBeInTheDocument();
  });

  it('encodes an asset longname in the destroy route', async () => {
    render(
      <MemoryRouter>
        <BalanceMenu asset="A95428956661682177.SUB" />
      </MemoryRouter>
    );

    openMenu();

    fireEvent.click(await screen.findByText('Destroy'));
    expect(mockNavigate).toHaveBeenCalledWith('/compose/issuance/destroy/A95428956661682177.SUB');
  });
});
