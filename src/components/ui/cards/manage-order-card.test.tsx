import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ManageOrderCard } from './manage-order-card';

const mockNavigate = vi.fn();
vi.mock('react-router', () => ({ useNavigate: () => mockNavigate }));
vi.mock('@/components/domain/asset/asset-icon', () => ({
  AssetIcon: () => <span data-testid="icon" />,
}));

const openOrder: any = {
  tx_hash: 'deadbeef',
  status: 'open',
  give_asset: 'XCP',
  get_asset: 'PEPECASH',
  give_quantity_normalized: '10',
  get_quantity_normalized: '20',
  give_remaining_normalized: '10',
  get_remaining_normalized: '20',
};

describe('ManageOrderCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('opens the order when the card body is clicked', () => {
    render(<ManageOrderCard order={openOrder} />);

    fireEvent.click(screen.getByRole('button', { name: /XCP/ }));

    expect(mockNavigate).toHaveBeenCalledWith('/market/orders/PEPECASH/XCP');
  });

  it('cancels, rather than opening the order, when Cancel is clicked', () => {
    render(<ManageOrderCard order={openOrder} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockNavigate).toHaveBeenCalledWith('/compose/order/cancel/deadbeef');
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  // Regression: Cancel used to sit inside a role="button" card whose onKeyDown
  // ran preventDefault() and navigated. A keypress on Cancel therefore opened
  // the order AND suppressed the button's own activation, so cancelling was
  // unreachable from the keyboard.
  it('does not open the order when a key is pressed on Cancel', () => {
    render(<ManageOrderCard order={openOrder} />);

    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const notPrevented = fireEvent.keyDown(cancel, { key: 'Enter' });

    expect(mockNavigate).not.toHaveBeenCalled();
    // The browser turns this keypress into a click; nothing may cancel it.
    expect(notPrevented).toBe(true);
  });

  it('shows the status instead of Cancel once the order is closed', () => {
    render(<ManageOrderCard order={{ ...openOrder, status: 'filled' }} />);

    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    expect(screen.getByText('filled')).toBeInTheDocument();
  });
});
