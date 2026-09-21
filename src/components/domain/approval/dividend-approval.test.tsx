import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTxActionInfo } from '@/components/domain/tx/tx-action-info';
import { fetchAssetDetails, fetchAssetHolderCount } from '@/core/counterparty/api';
import { packComposeMessage } from '@/core/counterparty/pack/messages';
import { resolveProtocolContext } from '@/core/counterparty/protocolContext';
import { unpackCounterpartyMessage } from '@/core/counterparty/unpack';
import { ApprovalSummaryCard } from './approval-summary-card';

vi.mock('@/core/counterparty/api', () => ({
  fetchAssetDetails: vi.fn(),
  fetchAssetHolderCount: vi.fn(),
}));

/** Exercise the actual byte decoder, context resolver, approval adapter and rendered summary. */
async function renderDividend(dividendAsset: string, payoutDivisible?: boolean) {
  const packed = packComposeMessage('dividend', {
    asset: 'BONPARTY', dividend_asset: dividendAsset, quantity_per_unit: '1',
  });
  expect(packed).not.toBeNull();
  const localUnpack = unpackCounterpartyMessage(packed!.bytes);
  expect(localUnpack.success).toBe(true);
  const { context } = await resolveProtocolContext({
    messageType: localUnpack.messageType, data: localUnpack.data,
    signerAddresses: ['issuer'],
  });
  const txAction = getTxActionInfo({
    verification: {
      localUnpack, passed: undefined, comparedAgainstApi: false, repackProved: false, mismatches: [],
    },
    counterpartyMessage: {
      messageType: 'dividend', messageTypeId: 50, description: 'Untrusted API display',
      messageData: {
        asset: 'BONPARTY', asset_info: { divisible: true },
        dividend_asset: dividendAsset,
        ...(payoutDivisible === undefined ? {} : { dividend_asset_info: { divisible: payoutDivisible } }),
      },
    },
  }, context);
  expect(txAction).not.toBeNull();
  render(<ApprovalSummaryCard
    txAction={txAction}
    primaryFacts={txAction!.protocol}
    movement={{ spent: 0, backToYou: 0, atRisk: 0, external: [], fee: 0, net: 0, incomplete: false }}
    hideMovement
    hasHighFee={false}
    protocolFeeXcp={null}
  />);
  return context;
}

describe('dividend approval amounts', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Both distributions [0.5, 1.5] and [1, 1] have supply 2 and two holders. At one raw
    // payout unit per whole BONPARTY, Core dividend.validate truncates each holder row:
    // the first pays 1 raw unit in total, the second pays 2. Aggregate API facts cannot
    // distinguish these bills. Core 67e10db3, messages/dividend.py:79-115.
    vi.mocked(fetchAssetDetails).mockResolvedValue({
      asset: 'BONPARTY', divisible: true, supply: '200000000', supply_normalized: '2',
    } as Awaited<ReturnType<typeof fetchAssetDetails>>);
    vi.mocked(fetchAssetHolderCount).mockResolvedValue(2);
  });
  afterEach(cleanup);

  it('keeps an indivisible payout of 1 as 1, independent of the paying asset scale', async () => {
    const context = await renderDividend('RAREPEPE', false);
    expect(screen.getByText('1 RAREPEPE per unit')).toBeInTheDocument();
    expect(screen.queryByText(/0\.00000001 RAREPEPE/)).not.toBeInTheDocument();
    expect(screen.queryByText('Total dividend')).not.toBeInTheDocument();
    expect(screen.queryByText('XCP fee')).not.toBeInTheDocument();
    expect(context).toEqual({});
  });

  it('does not claim supply times rate when multiple holder payouts round separately', async () => {
    await renderDividend('XCP', true);
    expect(screen.getByText('0.00000001 XCP per unit')).toBeInTheDocument();
    expect(screen.queryByText('Total dividend')).not.toBeInTheDocument();
    expect(screen.queryByText('0.00000002 XCP')).not.toBeInTheDocument();
    expect(screen.queryByText('XCP fee')).not.toBeInTheDocument();
    expect(fetchAssetDetails).not.toHaveBeenCalled();
    expect(fetchAssetHolderCount).not.toHaveBeenCalled();
  });

  it('does not equate all holders with eligible fee recipients when the issuer owns supply', async () => {
    // Core no_dividend_to_self excludes the issuer, while the holders endpoint still counts it.
    vi.mocked(fetchAssetHolderCount).mockResolvedValue(3);
    await renderDividend('XCP', true);
    expect(screen.queryByText('XCP fee')).not.toBeInTheDocument();
    expect(screen.queryByText('0.0006 XCP')).not.toBeInTheDocument();
    expect(screen.queryByText('0 XCP')).not.toBeInTheDocument();
  });

  it('labels the raw payout unit when its divisibility is unavailable', async () => {
    await renderDividend('RAREPEPE');
    expect(screen.getByText('1 (base units) RAREPEPE per unit')).toBeInTheDocument();
    expect(screen.queryByText('Total dividend')).not.toBeInTheDocument();
    expect(screen.queryByText('XCP fee')).not.toBeInTheDocument();
  });
});
