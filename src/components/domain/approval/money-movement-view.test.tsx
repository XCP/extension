import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MoneyMovementView } from './money-movement-view';
import type { MoneyMovement } from './money-movement';

const movement = (over: Partial<MoneyMovement>): MoneyMovement => ({
  spent: 0, backToYou: 0, atRisk: 0, external: [], fee: 0, net: 0, incomplete: false, ...over,
});

describe('MoneyMovementView', () => {
  it('leads with "You send" and the outflow when net is negative', () => {
    render(<MoneyMovementView movement={movement({ net: -95000, external: [{ address: 'bc1qthem', value: 90000 }], fee: 5000 })} />);
    expect(screen.getByText('You send')).toBeInTheDocument();
    expect(screen.getByText(/0\.00095000/)).toBeInTheDocument();
  });

  it('leads with "You receive" when net is positive', () => {
    render(<MoneyMovementView movement={movement({ net: 60000, spent: 10000, backToYou: 70000 })} />);
    expect(screen.getByText('You receive')).toBeInTheDocument();
    expect(screen.getByText(/0\.00060000/)).toBeInTheDocument(); // headline net, distinct from the 0.00070000 row
  });

  it('lists an external destination, change, and fee', () => {
    render(
      <MoneyMovementView
        movement={movement({ net: -95000, external: [{ address: 'bc1qexternaldestinationaddr', value: 90000 }], backToYou: 5000, fee: 5000 })}
      />
    );
    expect(screen.getByText(/^bc1q/)).toBeInTheDocument(); // the external destination (truncated)
    expect(screen.getByText('To your wallet')).toBeInTheDocument();
    expect(screen.getByText('Network fee')).toBeInTheDocument();
  });

  it('shows "Unknown address" for an unresolved destination', () => {
    render(<MoneyMovementView movement={movement({ net: -40000, external: [{ address: null, value: 40000 }], fee: 10000 })} />);
    expect(screen.getByText('Unknown address')).toBeInTheDocument();
  });

  it('surfaces the incomplete caveat', () => {
    render(<MoneyMovementView movement={movement({ net: -1000, incomplete: true })} />);
    expect(screen.getByText(/couldn't be determined/i)).toBeInTheDocument();
  });

  it('shows the flexible (ANYONECANPAY) caveat when set', () => {
    render(<MoneyMovementView movement={movement({ net: 10000 })} flexible />);
    expect(screen.getByText(/may be added after you sign/i)).toBeInTheDocument();
  });
});
