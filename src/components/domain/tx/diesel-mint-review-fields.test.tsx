import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DieselMintMetadata } from '@/core/counterparty/composeTypes';
import { ReviewAddressOptions } from '@/pages/compose/broadcast/address-options/review';
import { ReviewBroadcast } from '@/pages/compose/broadcast/review';
import { ReviewCancel } from '@/pages/compose/order/cancel/review';
import { ReviewOrder } from '@/pages/compose/order/review';
import { ReviewSwap } from '@/pages/compose/swap/review';

// Render the real review screen so assertions cover the field's value and supplementary details.
vi.mock('@/contexts/settings-context', () => ({
  useSettings: () => ({ settings: { fiat: 'usd', enableAdvancedBroadcasts: true } }),
}));

vi.mock('@/hooks/useMarketPrices', () => ({
  useMarketPrices: () => ({ btc: null, xcp: null }),
}));

vi.mock('@/contexts/composer-context-object', () => ({
  useComposerOptional: () => null,
}));

const orderParams = {
  give_asset: 'XCP',
  get_asset: 'PEPECASH',
  give_quantity: '200000000',
  get_quantity: '1000000000',
  give_quantity_normalized: '2',
  get_quantity_normalized: '10',
  expiration: 100,
  fee_required: 123,
};

const reviewCases: Array<{
  name: string;
  Component: typeof ReviewOrder;
  params: Record<string, unknown>;
  fields: Array<[label: string, value: string]>;
}> = [
  {
    name: 'order',
    Component: ReviewOrder,
    params: orderParams,
    fields: [
      ['Give', '2 XCP'],
      ['Get', '10 PEPECASH'],
      ['Price', '1 XCP = 5.00000000 PEPECASH'],
      ['Expiration', '100 blocks'],
      ['Fee Required', '123 satoshis'],
    ],
  },
  {
    name: 'cancel',
    Component: ReviewCancel,
    params: { offer_hash: 'ab'.repeat(32) },
    fields: [['Order Hash', 'ab'.repeat(32)]],
  },
  {
    name: 'broadcast',
    Component: ReviewBroadcast,
    params: { text: 'Testing DIESEL mining', value: 42, fee_fraction: 0.01 },
    fields: [['Message', 'Testing DIESEL mining'], ['Value', '42'], ['Fee Fraction', '0.01']],
  },
  {
    name: 'address options',
    Component: ReviewAddressOptions,
    params: { options: 1, text: 'options 1' },
    fields: [['Options', 'Require Memo']],
  },
  {
    name: 'swap',
    Component: ReviewSwap,
    params: orderParams,
    fields: [
      ['You Send', '2 XCP'],
      ['Minimum Received', '10 PEPECASH'],
      ['Minimum Price', '1 XCP = 5.00000000 PEPECASH'],
      ['Fills', 'Immediately, or cancels next block'],
    ],
  },
];

const optimizedMint: DieselMintMetadata = {
  utxo_vout: 1,
  runestone_vout: 2,
  utxo_sats: 97500,
  marginal_vbytes: 26,
  estimated_marginal_fee_sats: 65,
  fee_rate_sat_vbyte: 2.5,
  utxo_kind: 'change',
  rolled_utxo: `${'cd'.repeat(32)}:1`,
  pending_chain_position: 3,
};

function expectField(label: string, value: string) {
  const field = screen.getByText(`${label}:`).parentElement;
  expect(field).toHaveTextContent(value);
}

describe.each(reviewCases)('$name DIESEL mint review', ({ Component, params, fields }) => {
  afterEach(cleanup);

  function renderReview(metadata?: DieselMintMetadata) {
    render(
      <Component
        apiResponse={{
          result: {
            params: { source: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', ...params },
            btc_fee: 500,
            ...(metadata && { diesel_mint: metadata }),
          },
        }}
        onSign={vi.fn()}
        onBack={vi.fn()}
        error={null}
        isSigning={false}
      />,
    );
  }

  function expectHostDetails() {
    for (const [label, value] of fields) expectField(label, value);
    expectField('Fee', '0.00000500 BTC');
    expect(screen.getByRole('button', { name: 'Sign and broadcast transaction' })).toBeEnabled();
  }

  it('keeps every host detail alongside the mint cost, protected wallet return and rollover chain', () => {
    renderReview(optimizedMint);

    expectHostDetails();
    expectField('DIESEL mint', 'Included');
    expectField('DIESEL mint', '+26 vB (~65 sat at 2.5 sat/vB)');
    expectField('DIESEL mint', '97500 sat protected wallet return; remains yours');
    expectField('DIESEL mint', 'Existing DIESEL rolled forward');
    expectField('DIESEL mint', 'Unconfirmed chain 3/25');
    expect(screen.queryByText(/protected storage/)).not.toBeInTheDocument();
  });

  it('uses the explicit storage cost without inventing a rollover or unconfirmed chain', () => {
    renderReview({
      utxo_vout: 1,
      runestone_vout: 2,
      utxo_sats: 330,
      marginal_vbytes: 57,
      estimated_marginal_fee_sats: 114,
      fee_rate_sat_vbyte: 2,
      utxo_kind: 'explicit',
    });

    expectHostDetails();
    expectField('DIESEL mint', '+57 vB (~114 sat at 2 sat/vB)');
    expectField('DIESEL mint', '330 sat protected storage; remains yours');
    expect(screen.queryByText(/wallet return|rolled forward|Unconfirmed chain/)).not.toBeInTheDocument();
  });

  it('keeps the original review when no verified mint metadata exists', () => {
    renderReview();

    expectHostDetails();
    expect(screen.queryByText('DIESEL mint:')).not.toBeInTheDocument();
    expect(screen.queryByText(/sat protected|rolled forward|Unconfirmed chain/)).not.toBeInTheDocument();
  });
});
