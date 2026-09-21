import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ManageDispenserCard } from './manage-dispenser-card';

const mockNavigate = vi.fn();
vi.mock('react-router', () => ({ useNavigate: () => mockNavigate }));
vi.mock('@/components/domain/asset/asset-icon', () => ({
  AssetIcon: () => <span data-testid="icon" />,
}));

const openDispenser: any = {
  asset: 'RAREPEPE',
  status: 0,
  give_remaining_normalized: '5',
  give_quantity_normalized: '1',
  escrow_quantity_normalized: '5',
  satoshirate: 100000,
};

describe('ManageDispenserCard', () => {
  beforeEach(() => vi.clearAllMocks());

  // A close already in the mempool means closing again fails and refilling escrows into a
  // dispenser that is ending; both give way to the balance list's italic in-flight word.
  it('stands Refill and Close down while a close is in the mempool', () => {
    render(<ManageDispenserCard dispenser={openDispenser} isClosing />);

    expect(screen.getByText('Closing')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refill' })).not.toBeInTheDocument();
  });

  it('opens the dispenser when the card body is clicked', () => {
    render(<ManageDispenserCard dispenser={openDispenser} />);

    fireEvent.click(screen.getByRole('button', { name: /RAREPEPE/ }));

    expect(mockNavigate).toHaveBeenCalledWith('/market/dispensers/RAREPEPE');
  });

  // Regression: Refill and Close used to sit inside a role="button" card whose
  // onKeyDown ran preventDefault() and navigated. A keypress on either opened
  // the dispenser AND suppressed the button's own activation, so neither action
  // was reachable from the keyboard.
  it.each(['Refill', 'Close'])(
    'does not open the dispenser when a key is pressed on %s',
    (name) => {
      render(<ManageDispenserCard dispenser={openDispenser} />);

      const action = screen.getByRole('button', { name });
      const notPrevented = fireEvent.keyDown(action, { key: 'Enter' });

      expect(mockNavigate).not.toHaveBeenCalled();
      // The browser turns this keypress into a click; nothing may cancel it.
      expect(notPrevented).toBe(true);
    }
  );

  it('routes Refill and Close to their own destinations on click', () => {
    render(<ManageDispenserCard dispenser={openDispenser} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(mockNavigate).toHaveBeenCalledWith('/compose/dispenser/close/RAREPEPE');

    mockNavigate.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Refill' }));
    expect(mockNavigate.mock.calls[0]![0]).toContain('refill=true');
  });

  it('shows Closed instead of the actions once the dispenser is closed', () => {
    render(<ManageDispenserCard dispenser={{ ...openDispenser, status: 10 }} />);

    expect(screen.queryByRole('button', { name: 'Refill' })).not.toBeInTheDocument();
    expect(screen.getByText('Closed')).toBeInTheDocument();
  });
});
