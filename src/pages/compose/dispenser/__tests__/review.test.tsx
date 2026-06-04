import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ReviewDispenser } from '../review';

// Capture the customFields handed to the shared review screen.
vi.mock('@/components/screens/review-screen', () => ({
  ReviewScreen: ({ customFields }: any) => (
    <div data-testid="review-screen">
      {customFields.map((field: any, idx: number) => (
        <div key={idx}>
          <span>{field.label}</span>
          {field.value && <span>{field.value}</span>}
        </div>
      ))}
    </div>
  ),
}));

vi.mock('@/hooks/useMarketPrices', () => ({
  useMarketPrices: () => ({ btc: null }),
}));

vi.mock('@/contexts/settings-context', () => ({
  useSettings: () => ({ settings: { fiat: 'USD' } }),
}));

describe('ReviewDispenser', () => {
  afterEach(() => {
    cleanup();
  });

  const baseParams = {
    asset: 'PEPECASH',
    escrow_quantity_normalized: '5',
    give_quantity_normalized: '1',
    escrow_quantity: 5,
    give_quantity: 1,
    mainchainrate: 100000,
  };

  const renderWith = (params: Record<string, unknown>, assetProp: string) =>
    render(
      <ReviewDispenser
        apiResponse={{ result: { params } }}
        onSign={vi.fn()}
        onBack={vi.fn()}
        error={null}
        isSigning={false}
        asset={assetProp}
      />
    );

  it('labels amounts with the signed result.params.asset, not the route prop', () => {
    // The in-form asset-select path leaves the route prop empty; the displayed
    // asset must still match the asset actually being composed/signed.
    renderWith(baseParams, '');

    expect(screen.getByText('5 PEPECASH')).toBeInTheDocument();
    expect(screen.getByText('1 PEPECASH')).toBeInTheDocument();
  });

  it('prefers asset_longname when present', () => {
    renderWith({ ...baseParams, asset: 'A123', asset_longname: 'MYPROJECT.TOKEN' }, '');

    expect(screen.getByText('5 MYPROJECT.TOKEN')).toBeInTheDocument();
  });

  it('falls back to the prop only when params omit the asset', () => {
    const { asset: _omit, ...paramsWithoutAsset } = baseParams;
    renderWith(paramsWithoutAsset, 'FALLBACKASSET');

    expect(screen.getByText('5 FALLBACKASSET')).toBeInTheDocument();
  });
});
