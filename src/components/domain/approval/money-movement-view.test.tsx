import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import type { MoneyMovement } from './money-movement';
import { MoneyMovementView } from './money-movement-view';

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
    // Specific, because the headline now also says the net effect couldn't be determined.
    expect(screen.getByText(/some amounts couldn't be determined/i)).toBeInTheDocument();
  });

  it('does not claim a direction when the totals are incomplete', () => {
    // An input whose value or owner could not be resolved is excluded from `spent`, which drives
    // `net` non-negative — so a draining transaction used to announce "You receive". The direction
    // is unknowable here and must not be asserted.
    render(
      <MoneyMovementView
        movement={movement({ net: 0, spent: 0, backToYou: 0, incomplete: true,
          external: [{ address: 'bc1qthem', value: 500_000 }] })}
      />
    );

    expect(screen.queryByText('You receive')).not.toBeInTheDocument();
    expect(screen.queryByText('You send')).not.toBeInTheDocument();
    expect(screen.getByText('Net effect')).toBeInTheDocument();
  });

  it('still shows a direction when the totals are complete', () => {
    render(<MoneyMovementView movement={movement({ net: -95000, fee: 5000 })} />);
    expect(screen.getByText('You send')).toBeInTheDocument();
  });

  it('shows the flexible (ANYONECANPAY) caveat when set', () => {
    render(<MoneyMovementView movement={movement({ net: 10000 })} flexible />);
    expect(screen.getByText(/may be added after you sign/i)).toBeInTheDocument();
  });
});
