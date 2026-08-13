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

  // A cancel already in the mempool means a second cancel can only fail and burn its fee: the
  // button gives way to the same italic word the balance list uses for in-flight activity.
  it('stands the Cancel button down while a cancel is in the mempool', () => {
    render(<ManageOrderCard order={openOrder} isCancelling />);

    expect(screen.getByText('Cancelling')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  // Regression: the pair line read each side's canonical name, and a subasset's canonical name
  // is numeric (A123...). The order Goat wanted to cancel showed a number nobody typed. Both
  // sides must prefer the longname, and navigation must keep using the numeric name -- it is
  // what the API routes by.
  it('shows a subasset by its longname, on either side of the pair', () => {
    const subassetOrder = {
      ...openOrder,
      give_asset: 'A95428956661682177',
      give_asset_info: { asset_longname: 'PARENT.child' },
      get_asset: 'XCP',
    };
    render(<ManageOrderCard order={subassetOrder} />);

    expect(screen.getByText('PARENT.child/XCP')).toBeInTheDocument();
    expect(screen.queryByText(/A95428956661682177/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /PARENT\.child/ }));
    expect(mockNavigate).toHaveBeenCalledWith('/market/orders/A95428956661682177/XCP');
  });

  it('falls back to the numeric name when no longname is carried', () => {
    const bare = { ...openOrder, give_asset: 'A95428956661682177', get_asset: 'XCP' };
    render(<ManageOrderCard order={bare} />);

    expect(screen.getByText('A95428956661682177/XCP')).toBeInTheDocument();
  });

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
