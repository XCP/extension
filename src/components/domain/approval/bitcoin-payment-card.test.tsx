import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import type { BitcoinPaymentIntentV1 } from '@/core/bitcoin/providerPayment';
import { BitcoinPaymentCard } from './bitcoin-payment-card';

const ADDRESS = 'bc1qglv8hh3l23y0qu5uw4zu7e8q4td0gcjsa8f3tq';
const intent: BitcoinPaymentIntentV1 = {
  standard: 'xcp-wallet/bitcoin-payment',
  version: 1,
  action: 'pay',
  outputs: [{ address: ADDRESS, amountSats: 21_600 }],
  description: 'Fund Emblem Vault',
  reference: 'vault-63',
};

describe('BitcoinPaymentCard', () => {
  it('shows a proved site-described payment with its full output terms', () => {
    render(<BitcoinPaymentCard intent={intent} proof={{
      proved: true,
      errors: [],
      outputs: [{ index: 0, address: ADDRESS, amountSats: 21_600 }],
      totalSats: 21_600,
    }} />);

    expect(screen.getByText('Bitcoin payment outputs verified')).toBeInTheDocument();
    expect(screen.getByText('Site description: Fund Emblem Vault')).toBeInTheDocument();
    expect(screen.getByText('Reference: vault-63')).toBeInTheDocument();
    expect(screen.getByText(ADDRESS)).toBeInTheDocument();
    expect(screen.getByText(/0\.00021600 BTC/)).toBeInTheDocument();
    expect(screen.getByText(/site name and description are context/i)).toBeInTheDocument();
  });

  it('never presents an unproved request as verified', () => {
    render(<BitcoinPaymentCard intent={intent} proof={{
      proved: false,
      errors: ['destination differs'],
      outputs: [],
      totalSats: 0,
    }} />);

    expect(screen.getByText('Bitcoin payment did not verify')).toBeInTheDocument();
    expect(screen.queryByText(ADDRESS)).not.toBeInTheDocument();
  });
});
