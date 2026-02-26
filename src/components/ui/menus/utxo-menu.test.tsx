import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { UtxoMenu } from './utxo-menu';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

describe('UtxoMenu', () => {
  const testUtxo = 'abc123def456:0';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render menu button', () => {
    render(
      <MemoryRouter>
        <UtxoMenu utxo={testUtxo} />
      </MemoryRouter>
    );

    const menuButton = screen.getByRole('button');
    expect(menuButton).toBeInTheDocument();
  });

  it('should show Detach and Move options when clicked', async () => {
    render(
      <MemoryRouter>
        <UtxoMenu utxo={testUtxo} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('Detach')).toBeInTheDocument();
      expect(screen.getByText('Move')).toBeInTheDocument();
    });
  });

  it('should show Detach before Move', async () => {
    render(
      <MemoryRouter>
        <UtxoMenu utxo={testUtxo} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      const detach = screen.getByText('Detach');
      const move = screen.getByText('Move');
      // Detach should appear before Move in the DOM
      expect(detach.compareDocumentPosition(move) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  it('should navigate to detach page when Detach is clicked', async () => {
    render(
      <MemoryRouter>
        <UtxoMenu utxo={testUtxo} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      fireEvent.click(screen.getByText('Detach'));
    });

    expect(mockNavigate).toHaveBeenCalledWith(`/compose/utxo/detach/${testUtxo}`);
  });

  it('should navigate to move page when Move is clicked', async () => {
    render(
      <MemoryRouter>
        <UtxoMenu utxo={testUtxo} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      fireEvent.click(screen.getByText('Move'));
    });

    expect(mockNavigate).toHaveBeenCalledWith(`/compose/utxo/move/${testUtxo}`);
  });

  it('should stop event propagation when menu is clicked', () => {
    const mockOnClick = vi.fn();

    render(
      <div onClick={mockOnClick}>
        <MemoryRouter>
          <UtxoMenu utxo={testUtxo} />
        </MemoryRouter>
      </div>
    );

    const menuContainer = screen.getByRole('button').closest('div[class*="relative"]');
    if (menuContainer) {
      fireEvent.click(menuContainer);
    }

    expect(mockOnClick).not.toHaveBeenCalled();
  });
});
