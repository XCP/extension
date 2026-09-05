import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

    expect(screen.getByRole('heading', { name: 'Send Bitcoin' })).toBeInTheDocument();
    expect(screen.getByText('Site description: Fund Emblem Vault')).toBeInTheDocument();
    expect(screen.getByText('Reference: vault-63')).toBeInTheDocument();
    expect(screen.getByText(ADDRESS)).toBeInTheDocument();
    expect(screen.getByText(/0\.00021600 BTC/)).toBeInTheDocument();
    expect(screen.queryByText(/outputs verified/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('approval-notice')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Compare payment details' })).not.toBeInTheDocument();
  });

  it('leads with the exact difference and discloses the complete comparison', async () => {
    render(<BitcoinPaymentCard
      intent={intent}
      proof={{
        proved: false,
        errors: ['the external payment outputs do not exactly match the site intent'],
        outputs: [{ index: 0, address: ADDRESS, amountSats: 21_599 }],
        totalSats: 21_599,
      }}
      failure={['the external payment outputs do not exactly match the site intent']}
    />);

    expect(screen.getByText('Bitcoin payment did not verify')).toBeInTheDocument();
    expect(screen.getByTestId('approval-notice')).toHaveTextContent('Transaction pays 1 sat less than requested.');
    const details = screen.getByRole('button', { name: 'Compare payment details' });
    expect(details).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(ADDRESS)).not.toBeInTheDocument();
    expect(screen.queryByText('Site declared')).not.toBeInTheDocument();
    expect(screen.queryByText(/do not exactly match/)).not.toBeInTheDocument();
    await userEvent.setup().click(details);
    expect(details).toHaveAttribute('aria-expanded', 'true');
    // The requested and actual amounts, destination, and original evidence are all preserved.
    expect(screen.getByText('Site declared')).toBeInTheDocument();
    expect(screen.getByText(/0\.00021600 BTC/)).toBeInTheDocument();
    expect(screen.getByText('Transaction pays')).toBeInTheDocument();
    expect(screen.getByText(/0\.00021599 BTC/)).toBeInTheDocument();
    expect(screen.getByText(/do not exactly match/)).toBeInTheDocument();
    expect(screen.getAllByText(ADDRESS)).toHaveLength(1);
    expect(screen.getByText('-1 sat')).toBeInTheDocument();
    expect(screen.getByText('Site description: Fund Emblem Vault')).toBeInTheDocument();
    expect(screen.getByText('Reference: vault-63')).toBeInTheDocument();
    // No boilerplate framing — the heading and the reasons carry it.
    expect(screen.queryByText(/cannot be proved/)).not.toBeInTheDocument();
  });

  it('keeps both full destinations when the recipient differs', async () => {
    const otherAddress = 'bc1qanotherdestination000000000000000000000';
    render(<BitcoinPaymentCard intent={intent} proof={{
      proved: false, errors: ['recipient mismatch'], totalSats: 21_600,
      outputs: [{ index: 0, address: otherAddress, amountSats: 21_600 }],
    }} />);
    expect(screen.getByTestId('approval-notice')).toHaveTextContent('The transaction pays a different destination.');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Compare payment details' }));
    expect(screen.getByText(ADDRESS)).toBeInTheDocument();
    expect(screen.getByText(otherAddress)).toBeInTheDocument();
    expect(screen.queryByText('Difference')).not.toBeInTheDocument();
  });

  it('keeps every output when multiple payments share an address', async () => {
    render(<BitcoinPaymentCard intent={{ ...intent, outputs: [
      ...intent.outputs, { address: ADDRESS, amountSats: 1_000 },
    ] }} proof={{ proved: false, errors: [], totalSats: 22_600,
      outputs: [{ index: 0, address: ADDRESS, amountSats: 22_600 }],
    }} />);
    expect(screen.queryByText(/Transaction pays .* sats (more|less)/)).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Compare payment details' }));
    expect(screen.getAllByText(ADDRESS)).toHaveLength(3);
    expect(screen.getByText('0.00021600 BTC')).toBeInTheDocument();
    expect(screen.getByText('0.00001000 BTC')).toBeInTheDocument();
    expect(screen.getByText('0.00022600 BTC')).toBeInTheDocument();
  });

  it('shows the value and full script of an unresolved output', async () => {
    render(<BitcoinPaymentCard intent={intent} proof={{
      proved: false, outputs: [], errors: [], totalSats: 0,
    }} outputs={[{ index: 0, value: 21_600, type: 'unknown', script: '51' }]} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Compare payment details' }));
    expect(screen.getByText('Output #0: 0.00021600 BTC')).toBeInTheDocument();
    expect(screen.getByText('Destination could not be identified')).toBeInTheDocument();
    expect(screen.getByText('51')).toBeInTheDocument();
    expect(screen.queryByText('No external payment output')).not.toBeInTheDocument();
  });

  it('does not describe unavailable evidence as an absent payment', async () => {
    render(<BitcoinPaymentCard intent={intent} proof={undefined} />);
    expect(screen.getByTestId('approval-notice')).toHaveTextContent('Payment outputs could not be reviewed.');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Compare payment details' }));
    expect(screen.getByText('Payment outputs could not be reviewed')).toBeInTheDocument();
    expect(screen.queryByText('No external payment output')).not.toBeInTheDocument();
  });

  it('does not present proved output amounts as an unblocked payment when asset checks failed', async () => {
    const reason = 'a requested input carries attached Counterparty assets';
    render(<BitcoinPaymentCard intent={intent} proof={{
      proved: true, errors: [], outputs: [{ index: 0, address: ADDRESS, amountSats: 21_600 }], totalSats: 21_600,
    }} failure={[reason]} />);
    expect(screen.getByTestId('approval-notice')).toHaveTextContent(reason);
    expect(screen.queryByRole('heading', { name: 'Send Bitcoin' })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Compare payment details' }));
    expect(screen.getByRole('listitem')).toHaveTextContent(reason);
    expect(screen.getAllByText('0.00021600 BTC')).toHaveLength(2);
  });

  it('keeps every failed check and script without reducing a multi-output mismatch to a net amount', async () => {
    const otherAddress = 'bc1qanotherdestination000000000000000000000';
    const script = '6a4c50' + 'ff'.repeat(80);
    render(<BitcoinPaymentCard intent={intent} proof={{
      proved: false, totalSats: 21_600,
      outputs: [
        { index: 0, address: ADDRESS, amountSats: 20_600 },
        { index: 1, address: otherAddress, amountSats: 1_000 },
      ], errors: ['output 2 carries data; plain Bitcoin payments may not', 'payment outputs differ'],
    }} failure={['a requested input carries attached Counterparty assets']} outputs={[
      { index: 2, value: 0, type: 'op_return', script },
    ]} />);
    expect(screen.queryByText(/Transaction pays .* sats (more|less)/)).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Compare payment details' }));
    expect(screen.getByText('0.00021600 BTC')).toBeInTheDocument();
    expect(screen.getByText('0.00020600 BTC')).toBeInTheDocument();
    expect(screen.getByText('0.00001000 BTC')).toBeInTheDocument();
    expect(screen.getAllByText(ADDRESS)).toHaveLength(2);
    expect(screen.getByText(otherAddress)).toBeInTheDocument();
    expect(screen.getByText(script)).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });
});
