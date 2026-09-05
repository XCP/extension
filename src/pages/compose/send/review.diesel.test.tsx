import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReviewSend } from './review';

vi.mock('@/contexts/composer-context-object', () => ({
  useComposer: () => ({ state: { decodedMessage: null } }),
  useComposerOptional: () => ({ state: { decodedMessage: null } }),
}));
vi.mock('@/contexts/settings-context', () => ({
  useSettings: () => ({ settings: { fiat: 'USD' } }),
}));
vi.mock('@/hooks/useMarketPrices', () => ({
  useMarketPrices: () => ({ btc: 60_000, xcp: null }),
}));

const SOURCE = '1BoatSLRHtKNngkdXEeobR76b53LETtpyT';
const DESTINATION = '1BitcoinEaterAddressDontSendf59kuE';
const USER_BTC_OUTPUT = `2500000:${DESTINATION}`;

function response(withMint: boolean) {
  return {
    result: {
      name: 'send',
      btc_fee: 250,
      params: {
        source: SOURCE,
        destination: DESTINATION,
        asset: 'XCP',
        quantity: '100000000',
        quantity_normalized: '1',
        // The mint composer appends the wallet return and runestone after the caller output.
        more_outputs: withMint
          ? `${USER_BTC_OUTPUT},40000:${SOURCE},0:6a5d0fff7f818eec8a80c08080c0e5b6de03`
          : USER_BTC_OUTPUT,
      },
      ...(withMint ? {
        diesel_mint: {
          utxo_vout: 2,
          runestone_vout: 3,
          marginal_vbytes: 26,
          estimated_marginal_fee_sats: 26,
          fee_rate_sat_vbyte: 1,
          utxo_sats: 40_000,
          utxo_kind: 'change',
        },
      } : {}),
    },
  };
}

describe('optional DIESEL mint preserves review of caller BTC outputs', () => {
  it('control: displays the user-added BTC amount when no mint is attached', () => {
    render(<ReviewSend apiResponse={response(false)} onSign={() => {}} onBack={() => {}} error={null} isSigning={false} />);
    expect(screen.getByText('1 XCP')).toBeVisible();
    expect(screen.getByText('0.02500000 BTC')).toBeVisible();
  });

  it('displays the same user-added BTC amount alongside the included mint', () => {
    render(<ReviewSend apiResponse={response(true)} onSign={() => {}} onBack={() => {}} error={null} isSigning={false} />);
    expect(screen.getByText('1 XCP')).toBeVisible();
    expect(screen.getByText('DIESEL mint:')).toBeVisible();
    expect(screen.getByText('Included')).toBeVisible();
    expect(screen.getByText('0.02500000 BTC')).toBeVisible();
    expect(screen.queryByText('0.00040000 BTC')).not.toBeInTheDocument();
  });

  it('does not present injected wallet storage as a caller BTC payment', () => {
    const apiResponse = response(true);
    apiResponse.result.params.more_outputs = `40000:${SOURCE},0:6a5d0fff7f818eec8a80c08080c0e5b6de03`;
    apiResponse.result.diesel_mint!.utxo_vout = 1;
    render(<ReviewSend apiResponse={apiResponse} onSign={() => {}} onBack={() => {}} error={null} isSigning={false} />);
    expect(screen.getByText('1 XCP')).toBeVisible();
    expect(screen.getByText('Included')).toBeVisible();
    expect(screen.queryByText('0.00040000 BTC')).not.toBeInTheDocument();
  });
});
