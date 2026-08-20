import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApprovalTransactionDetails } from './approval-transaction-details';

describe('ApprovalTransactionDetails', () => {
  it('shows the same money, asset, recipient, and decoder facts for every signing path', () => {
    render(
      <ApprovalTransactionDetails
        txid={'ab'.repeat(32)}
        inputs={[{
          index: 0,
          txid: 'cd'.repeat(32),
          vout: 1,
          value: 50_000,
          address: 'bc1qinput',
        }]}
        outputs={[{ index: 0, value: 10_000, type: 'op_return' }]}
        recipients={[{ asset: 'RAREPEPE', quantity: '1', address: 'bc1qrecipient' }]}
        attachedAssets={[{
          inputIndex: 0,
          utxo: `${'cd'.repeat(32)}:1`,
          assets: [{ asset: 'RAREPEPE', quantity_normalized: '1' }],
        }]}
        verification={{
          passed: false,
          comparedAgainstApi: true,
          repackProved: true,
          mismatches: ['Destination formatting differs'],
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Transaction Details' }));

    expect(screen.getByText('0.00050000 BTC')).toBeInTheDocument();
    expect(screen.getAllByText('RAREPEPE')).toHaveLength(2);
    expect(screen.getByText('bc1qrecipient')).toBeInTheDocument();
    expect(screen.getByText('Destination formatting differs')).toBeInTheDocument();
  });

  it('marks unresolved attached-asset status explicitly', () => {
    render(
      <ApprovalTransactionDetails
        inputs={[{ index: 0, txid: 'ef'.repeat(32), vout: 0 }]}
        outputs={[]}
        recipients={[]}
        attachedAssets={[{
          inputIndex: 0,
          utxo: `${'ef'.repeat(32)}:0`,
          assets: [],
          lookupFailed: true,
        }]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Transaction Details' }));

    expect(screen.getByText('Asset status unavailable')).toBeInTheDocument();
  });
});
