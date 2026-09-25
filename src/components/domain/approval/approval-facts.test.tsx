import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApprovalFacts } from './approval-facts';
import { CounterpartyDetailsCard } from './counterparty-details-card';
import { displayWidth, isShortText } from './fact-layout';

const layoutOf = (label: string) => screen.getByText(label).closest('[data-fact-layout]')?.getAttribute('data-fact-layout');

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
    // The full address, in one text node: nothing inserted, nothing truncated, no midpoint split.
    const recipient = screen.getByText(address);
    expect(recipient).toHaveClass('font-mono', '[overflow-wrap:anywhere]');
    expect(recipient.querySelector('wbr')).toBeNull();
    expect(layoutOf('Recipient')).toBe('identifier');
    expect(screen.getByRole('button', { name: 'Copy Recipient' })).toBeInTheDocument();
    expect(screen.getByText('250,330 sats')).toHaveClass('text-2xl', 'tabular-nums');
  });

  it('lets the field kind decide the layout', () => {
    render(<ApprovalFacts fields={[
      { kind: 'amount', label: 'Offer price', value: '250,000 sats' },
      { kind: 'text', label: 'Broadcast', value: 'Not now' },
      { kind: 'text', label: 'Delivery', value: 'Buyer chooses attached or detached delivery' },
      { kind: 'outpoint', label: 'Funding UTXO', value: `${'f'.repeat(64)}:1` },
    ]} />);
    expect(layoutOf('Offer price')).toBe('row');
    expect(screen.getByText('250,000 sats')).toHaveClass('text-right', 'tabular-nums');
    expect(layoutOf('Broadcast')).toBe('row');
    expect(layoutOf('Delivery')).toBe('stacked');
    expect(layoutOf('Funding UTXO')).toBe('identifier');
    for (const label of ['Offer price', 'Broadcast', 'Delivery', 'Funding UTXO']) {
      expect(screen.getByText(label)).toHaveAttribute('data-fact-label');
    }
  });

  it('shows three list entries, then every one on request', () => {
    const items = ['1 RAREPEPE', '1 SPELLS', '1 PEPEBRIDGE', '1 FAKEASF', '1 KARMA', '1 NAKAMOTO'];
    render(<ApprovalFacts fields={[{ kind: 'list', label: 'Detached', value: items.join(', '), items }]} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Show all 6' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(6);
    fireEvent.click(screen.getByRole('button', { name: 'Show fewer' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
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

describe('fact layout measures', () => {
  it('counts full-width characters double', () => {
    expect(displayWidth('Expires')).toBe(7);
    expect(displayWidth('有効期限')).toBe(8);
    expect(displayWidth('XCP 手数料')).toBe(10);
  });

  it('keeps only short, unpunctuated text inline', () => {
    expect(isShortText('Not now')).toBe(true);
    expect(isShortText('Attach only')).toBe(true);
    expect(isShortText('Not broadcast now.')).toBe(false);
    expect(isShortText('After confirmation and Counterparty verification')).toBe(false);
    expect(isShortText('今は行わない')).toBe(true);
    expect(isShortText('確認後に自動で有効化')).toBe(false);
  });
});
