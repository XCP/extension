import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  analyzeMarketplaceIntent,
  type FundOffersIntentClaim,
  type MarketplaceAnalysisInput,
  type PrepareBulkFanoutIntentClaim,
} from '@/core/counterparty/marketplaceIntent';
import { CounterpartyDetailsCard } from './counterparty-details-card';
import { MarketplaceReviewCard, provedReviewNotes } from './marketplace-review-card';

const OWNER = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
const SPEND_TXID = '22'.repeat(32);
const COIN_TXID = '23'.repeat(32);

const selfSend = (intent: FundOffersIntentClaim | PrepareBulkFanoutIntentClaim): MarketplaceAnalysisInput => ({
  intent,
  inputs: [{ index: 0, txid: COIN_TXID, vout: 0, address: OWNER, value: 20_000, hasSignatures: false }],
  outputs: [
    { index: 0, type: 'p2wpkh', address: OWNER, value: 9_000 },
    { index: 1, type: 'p2wpkh', address: OWNER, value: 9_000 },
    { index: 2, type: 'p2wpkh', address: OWNER, value: 1_600 },
  ],
  signedInputs: [{ index: 0, sighashType: 0x01 }],
  signerAddresses: [OWNER],
  attachedAssets: [],
  attachedAssetDestination: null,
  hasCounterpartyPayload: false,
  transactionId: SPEND_TXID,
});

const fundOffers: FundOffersIntentClaim = {
  standard: 'counterparty-marketplace', version: 1, action: 'fund_offers',
  operationId: `offer-funding:${SPEND_TXID}`, protocolVersion: 'exact_offer_v1', assets: [],
  bidder: OWNER, target: { scope: 'asset', asset: 'RAREPEPE' },
  priceSats: 8_000, platformFeeSats: 1_000, delivery: { mode: 'detached' },
  fundingInputs: [{ txid: COIN_TXID, vout: 0, valueSats: 20_000 }], fundingValueSats: 20_000,
  slotCount: 2, slotValueSats: 9_000, networkFeeSats: 400, changeSats: 1_600,
  expectedTxid: SPEND_TXID, marketplaceExpiresAt: 2_000_000_000,
};

const fanout: PrepareBulkFanoutIntentClaim = {
  standard: 'counterparty-marketplace', version: 1, action: 'prepare_bulk_fanout',
  operationId: 'bulk-1', protocolVersion: 'counterparty_bulk_attach_v1', assets: [], batchIndex: 0,
  seller: OWNER, fundingOutpoint: { txid: COIN_TXID, vout: 0 }, fundingValueSats: 20_000,
  slotCount: 2, slotValueSats: 9_000, networkFeeSats: 400, changeSats: 1_600,
  expectedTxid: SPEND_TXID, operationExpiresAt: 2_000_000_000,
};

describe('MarketplaceReviewCard', () => {
  it('explains a proved flexible listing without a generic drain warning', () => {
    render(<MarketplaceReviewCard review={{
      status: 'caution',
      family: 'create_listing',
      title: 'List 1 RAREPEPE for 0.00250000 BTC',
      facts: [
        { label: 'Seller receives', value: '250,546 sats' },
        { label: 'Delivery', value: 'Detached to the eventual buyer' },
      ],
      notices: [{
        severity: 'warning',
        message: 'The buyer may add funding inputs and choose the detach destination.',
      }],
      blockers: [],
    }} />);

    expect(screen.getByText('List 1 RAREPEPE for 0.00250000 BTC')).toBeInTheDocument();
    expect(screen.queryByText('Terms verified — review authorization')).not.toBeInTheDocument();
    expect(screen.getByText('250,546 sats')).toBeInTheDocument();
    expect(screen.getByText(/buyer may add funding inputs/i)).toBeInTheDocument();
  });

  it('shows an exact checkout as proved rather than as a scary generic detach', () => {
    render(<MarketplaceReviewCard review={{
      status: 'proved',
      family: 'buy_listings',
      title: 'Buy 2 collectibles for 0.00306000 BTC',
      facts: [
        { label: 'You pay', value: '306,000 sats' },
        { label: 'Delivery', value: 'Detached to bc1qbuyer' },
      ],
      notices: [{
        severity: 'info',
        message: 'SIGHASH_ALL fixes every input, seller payment, fee, change output, and destination.',
      }],
      blockers: [],
    }} />);

    expect(screen.queryByText('Marketplace terms verified')).not.toBeInTheDocument();
    expect(screen.getByText('306,000 sats')).toBeInTheDocument();
    expect(screen.queryByText(/SIGHASH_ALL fixes every input/i)).not.toBeInTheDocument();
  });

  it('separates a variable XCP attach quote from wallet-proved Bitcoin terms', () => {
    render(<MarketplaceReviewCard review={{
      status: 'caution',
      family: 'attach_for_listing',
      title: 'Attach 1 raw unit of RAREPEPE',
      facts: [
        { label: 'Network fee', value: '1,000 sats' },
        { label: 'XCP fee', value: '0.25 XCP' },
      ],
      notices: [{
        severity: 'warning',
        message: 'Counterparty recomputes it at the block that confirms this transaction.',
      }],
      blockers: [],
    }} />);

    expect(screen.getByText('0.25 XCP')).toBeInTheDocument();
    expect(screen.queryByText(/Terms verified/i)).not.toBeInTheDocument();
    expect(screen.getByText(/recomputes it at the block/i)).toBeInTheDocument();
  });

  it('distinguishes a retryable incomplete lookup from a proved mismatch', () => {
    render(<MarketplaceReviewCard review={{
      status: 'retry',
      family: 'buy_listings',
      title: 'Attached-asset lookup is temporarily unavailable',
      facts: [],
      notices: [{ severity: 'warning', message: 'Retry after the indexer responds.' }],
      blockers: ['Asset status is required before signing.'],
    }} />);

    expect(screen.getByText('Verification incomplete — retry')).toBeInTheDocument();
    expect(screen.queryByText('Marketplace terms did not verify')).not.toBeInTheDocument();
    // M2: the plain-language cause leads; the wallet's own reason is only a detail.
    expect(screen.getByTestId('approval-notice-reason')).toHaveTextContent('Counterparty data is temporarily unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Why signing is unavailable' }));
    expect(screen.getByText('Retry in a moment.')).toBeInTheDocument();
    expect(screen.getByText('Asset status is required before signing.')).toBeInTheDocument();
    expect(screen.queryByText(/Nothing looks wrong/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry verification' })).not.toBeInTheDocument();
  });

  it('keeps a proved mismatch visually distinct from a retry', () => {
    render(<MarketplaceReviewCard review={{
      status: 'blocked',
      family: 'buy_listings',
      title: 'Seller payment does not match the signed listing',
      facts: [],
      notices: [],
      blockers: ['Seller payment differs.'],
    }} />);

    expect(screen.getByText('Marketplace terms did not verify')).toBeInTheDocument();
    expect(screen.getByTestId('approval-notice-reason')).toHaveTextContent('The site described a different transaction');
    fireEvent.click(screen.getByRole('button', { name: 'Why signing is unavailable' }));
    expect(screen.getByText(/the wallet will not sign it/i)).toBeInTheDocument();
    expect(screen.getByText('Seller payment differs.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry verification' })).not.toBeInTheDocument();
  });

  // M1: ledger drift is not the site's fault, so it must not read as a contradiction.
  it('tells the user a sold listing changed, rather than blaming the site', () => {
    render(<MarketplaceReviewCard review={{
      status: 'blocked', blockKind: 'ledger', family: 'buy_listings',
      title: 'Buy 1 collectible', facts: [], notices: [],
      blockers: ['seller input 1 does not resolve to exactly one attached asset'],
    }} onRetry={vi.fn()} />);

    expect(screen.getByTestId('approval-notice-reason')).toHaveTextContent('This listing changed');
    expect(screen.queryByText('The site described a different transaction')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Why signing is unavailable' }));
    expect(screen.getByText(/Return to the site and refresh/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry verification' })).not.toBeInTheDocument();
  });

  // F7: more inputs than the wallet checks is final; offering Retry would be a dead end.
  it('says too many inputs, with no retry, when the lookup cap was hit', () => {
    render(<MarketplaceReviewCard review={{
      status: 'blocked', blockKind: 'input_limit', family: 'buy_listings',
      title: 'Buy 20 collectibles', facts: [], notices: [],
      blockers: ['the attached-asset lookup for buyer input 60 failed'],
    }} onRetry={vi.fn()} />);

    expect(screen.getByTestId('approval-notice-reason')).toHaveTextContent('Too many inputs to check');
    fireEvent.click(screen.getByRole('button', { name: 'Why signing is unavailable' }));
    expect(screen.getByText(/more than 60 inputs/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry verification' })).not.toBeInTheDocument();
  });

  it('offers recovery independently of authorization and disables a pending retry', () => {
    const onRetry = vi.fn();
    const review = { status: 'retry' as const, family: 'create_listing' as const,
      title: 'List 1 RAREPEPE', facts: [], notices: [], blockers: ['Asset lookup unavailable'] };
    const { rerender } = render(<MarketplaceReviewCard review={review} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry verification' }));
    expect(onRetry).toHaveBeenCalledOnce();
    rerender(<MarketplaceReviewCard review={review} onRetry={onRetry} retrying />);
    expect(screen.getByRole('button', { name: 'Verifying…' })).toBeDisabled();
    rerender(<MarketplaceReviewCard review={review} onRetry={onRetry} retryError="Ledger still unavailable" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Ledger still unavailable');
    expect(screen.queryByRole('button', { name: /^(sign|authorize)( |$)/i })).not.toBeInTheDocument();
  });
});

describe('proved self-send outcome notes', () => {
  it.each([
    ['fund_offers', fundOffers, /Every output stays in this wallet/],
    ['prepare_bulk_fanout', fanout, /Every output remains controlled by this wallet/],
  ] as const)('renders the %s reassurance on the approval details and the review card', (_family, intent, note) => {
    const review = analyzeMarketplaceIntent(selfSend(intent));
    expect(review.status).toBe('proved');

    // What the single-PSBT approval screen renders for a proved review.
    const { unmount } = render(<CounterpartyDetailsCard fields={review.facts} notes={provedReviewNotes(review)} />);
    expect(screen.getByText(note)).toBeInTheDocument();
    unmount();

    render(<MarketplaceReviewCard review={review} />);
    expect(screen.getByText(note)).toBeInTheDocument();
  });

  it('names a Counterparty-free section by the title it is given', () => {
    const review = analyzeMarketplaceIntent(selfSend(fundOffers));
    render(<CounterpartyDetailsCard fields={review.facts} title="Details" />);
    expect(screen.getByRole('heading', { name: 'Details' })).toBeInTheDocument();
    expect(screen.queryByText('Counterparty')).not.toBeInTheDocument();
  });

  it('keeps notes off a self-send that did not prove', () => {
    const review = analyzeMarketplaceIntent({ ...selfSend(fundOffers), hasCounterpartyPayload: true });
    expect(review.status).toBe('blocked');
    expect(provedReviewNotes(review)).toEqual([]);
  });
});
