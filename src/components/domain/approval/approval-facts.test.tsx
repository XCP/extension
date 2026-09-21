import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApprovalFacts } from './approval-facts';
import { CounterpartyDetailsCard } from './counterparty-details-card';

describe('approval semantic facts', () => {
  it('keeps prose readable while preserving full identifiers and exact amounts', () => {
    const address = `bc1q${'a'.repeat(38)}`;
    const prose = 'Delisting removes this listing; spending the attached asset UTXO invalidates the signature.';
    render(<ApprovalFacts fields={[
      { kind: 'paragraph', label: 'Cancellation', value: prose },
      { kind: 'address', label: 'Recipient', value: address },
      { kind: 'amount', label: 'Your payout if sold', value: '250,330 sats', emphasis: 'primary' },
    ]} />);
    const paragraph = screen.getByText(prose);
    expect(paragraph).toHaveClass('whitespace-pre-wrap');
    expect(paragraph).not.toHaveClass('font-mono', 'break-all', 'text-right');
    const recipient = screen.getByText('Recipient').nextElementSibling;
    expect(recipient?.textContent).toBe(address);
    expect(recipient?.querySelector('wbr')).not.toBeNull();
    expect(screen.getByText('250,330 sats')).toHaveClass('text-2xl', 'tabular-nums');
  });

  it('preserves long asset names, quantities and every MPMA destination', () => {
    const asset = `PARENT.${'LONGNAME'.repeat(8)}`;
    const address = `bc1q${'b'.repeat(38)}`;
    const { container } = render(<CounterpartyDetailsCard fields={[]} recipients={[
      { asset, quantity: '99,999,999.99999999', address },
      { asset: 'XCP', quantity: '1.00000000', address: `${address}z` },
    ]} />);
    expect(screen.getByText(asset)).not.toHaveClass('truncate');
    expect(screen.getByText('99,999,999.99999999')).toBeInTheDocument();
    expect(container.textContent).toContain(address);
    expect(container.textContent).toContain(`${address}z`);
    expect(screen.getByText('Recipients (2)')).toBeInTheDocument();
  });
});
