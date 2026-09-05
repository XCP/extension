import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchInputsAlkanes } from '@/core/alkanes/inputAssets';
import { extractPsbtDetails } from '@/core/bitcoin/psbt';
import { decodePsbtForApproval } from '@/core/bitcoin/psbtApprovalDecoder';
import { analyzeMarketplaceBatch, parseMarketplaceBatchIntents } from '@/core/counterparty/marketplaceBatch';
import { analyzeAcceptanceCpfpBundle } from '@/core/counterparty/marketplaceBundle';
import type { MarketplaceApprovalReview } from '@/core/counterparty/marketplaceIntent';
import { DEFAULT_SETTINGS, getActiveSettings } from '@/core/settings';
import { getSignFlow } from '@/platform/provider/signFlow';
import { useSignPsbtsRequest } from '../useSignPsbtsRequest';

vi.mock('react-router', () => ({
  useSearchParams: () => [new URLSearchParams('requestId=request-1')],
}));
vi.mock('@/core/alkanes/inputAssets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/alkanes/inputAssets')>();
  return { ...actual, fetchInputsAlkanes: vi.fn() };
});
vi.mock('@/core/bitcoin/psbt', () => ({
  extractPsbtDetails: vi.fn(),
  resolvePsbtSighashType: vi.fn(() => 1),
}));
vi.mock('@/core/bitcoin/psbtApprovalDecoder', () => ({ decodePsbtForApproval: vi.fn() }));
vi.mock('@/core/counterparty/marketplaceBatch', () => ({
  analyzeMarketplaceBatch: vi.fn(),
  parseMarketplaceBatchIntents: vi.fn(),
}));
vi.mock('@/core/counterparty/marketplaceBundle', () => ({
  analyzeAcceptanceCpfpBundle: vi.fn(),
}));
vi.mock('@/core/counterparty/unpack/opReturn', () => ({
  extractPayloadFromOutputs: vi.fn(() => null),
}));
vi.mock('@/core/settings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/settings')>();
  return { ...actual, getActiveSettings: vi.fn(() => actual.DEFAULT_SETTINGS) };
});
vi.mock('@/platform/provider/emitToBackground', () => ({ emitToBackground: vi.fn() }));
vi.mock('@/platform/provider/signFlow', () => ({
  getSignFlow: vi.fn(),
  recordSignOutcome: vi.fn(),
}));

const review = (
  family: MarketplaceApprovalReview['family'] = 'marketplace_batch',
): MarketplaceApprovalReview => ({
  status: 'proved' as const,
  family,
  title: 'Proved batch',
  facts: [],
  notices: [{ severity: 'info' as const, message: 'proved' }],
  blockers: [],
});

const decodedParent = (
  safetyBlocked: boolean,
  alkaneBalances: Array<{
    inputIndex: number;
    utxo: string;
    balances: Array<{ id: string; value: string }>;
    lookupFailed?: boolean;
  }> = [],
) => ({
  psbtDetails: { inputs: [], outputs: [] },
  safety: { blocked: safetyBlocked, warnings: [] },
  alkaneBalances,
  marketplaceReview: review('create_listing'),
});

describe('useSignPsbtsRequest wallet safety propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getActiveSettings).mockReturnValue({
      ...DEFAULT_SETTINGS,
      protectAlkanesUtxos: true,
    });
    vi.mocked(fetchInputsAlkanes).mockResolvedValue([]);
  });

  it('does not let a marketplace proof override unsafe Alkanes inputs', async () => {
    const intent = { action: 'create_listing' };
    vi.mocked(getSignFlow).mockResolvedValue({
      kind: 'sign-psbts',
      bundleKind: 'bulk-listing',
      items: [{
        psbtHex: '00',
        signInputs: { bc1qexample: [0] },
        sighashTypes: [1],
        marketplaceIntent: intent,
      }],
    } as never);
    vi.mocked(parseMarketplaceBatchIntents).mockReturnValue({
      kind: 'bulk-listing',
      intents: [intent as never],
    });
    vi.mocked(decodePsbtForApproval).mockResolvedValue(decodedParent(false, [{
      inputIndex: 0,
      utxo: `${'ab'.repeat(32)}:0`,
      balances: [{ id: '2:0', value: '1' }],
    }]) as never);
    vi.mocked(analyzeMarketplaceBatch).mockReturnValue(review());

    const { result } = renderHook(() => useSignPsbtsRequest());

    await waitFor(() => expect(result.current.decodedInfo?.review).toMatchObject({
      status: 'blocked',
      blockers: ['wallet safety checks rejected at least one requested signature'],
      notices: [],
    }));
  });

  it('allows a proved plain-Bitcoin batch phase despite the generic item gate', async () => {
    const intent = { action: 'prepare_bulk_fanout' };
    vi.mocked(getSignFlow).mockResolvedValue({
      kind: 'sign-psbts',
      bundleKind: 'bulk-fanout',
      items: [{
        psbtHex: '00',
        signInputs: { bc1qexample: [0] },
        sighashTypes: [1],
        marketplaceIntent: intent,
      }],
    } as never);
    vi.mocked(parseMarketplaceBatchIntents).mockReturnValue({
      kind: 'bulk-fanout',
      intents: [intent as never],
    });
    vi.mocked(decodePsbtForApproval).mockResolvedValue(decodedParent(true) as never);
    vi.mocked(analyzeMarketplaceBatch).mockReturnValue(review());

    const { result } = renderHook(() => useSignPsbtsRequest());

    await waitFor(() => expect(result.current.decodedInfo?.review.status).toBe('proved'));
  });

  it.each([
    ['token-bearing', { balances: [{ id: '2:0', value: '1' }] }],
    ['unknown', { balances: [], lookupFailed: true }],
  ])('does not block a proved batch for an unsigned third-party %s input', async (_name, status) => {
    const intent = { action: 'create_listing' };
    vi.mocked(getSignFlow).mockResolvedValue({
      kind: 'sign-psbts',
      bundleKind: 'bulk-listing',
      items: [{
        psbtHex: '00',
        signInputs: { bc1qwallet: [0] },
        sighashTypes: [1],
        marketplaceIntent: intent,
      }],
    } as never);
    vi.mocked(parseMarketplaceBatchIntents).mockReturnValue({
      kind: 'bulk-listing',
      intents: [intent as never],
    });
    vi.mocked(decodePsbtForApproval).mockResolvedValue({
      ...decodedParent(false, [{ inputIndex: 1, utxo: `${'ab'.repeat(32)}:1`, ...status }]),
      psbtDetails: {
        inputs: [
          { index: 0, txid: 'cd'.repeat(32), vout: 0, address: 'bc1qwallet' },
          { index: 1, txid: 'ab'.repeat(32), vout: 1, address: 'bc1qthirdparty' },
        ],
        outputs: [],
      },
    } as never);
    vi.mocked(analyzeMarketplaceBatch).mockReturnValue(review());

    const { result } = renderHook(() => useSignPsbtsRequest());

    await waitFor(() => expect(result.current.decodedInfo?.review.status).toBe('proved'));
    expect(decodePsbtForApproval).toHaveBeenCalledWith(
      '00', ['bc1qwallet'], [0], [1], undefined, 'counterparty', undefined, intent,
    );
  });

  it('checks the signed fee-bump child for Alkanes before approving the pair', async () => {
    const parentIntent = { action: 'accept_exact_offer' };
    const childIntent = { action: 'bump_acceptance_fee' };
    vi.mocked(getSignFlow).mockResolvedValue({
      kind: 'sign-psbts',
      bundleKind: 'acceptance-cpfp',
      items: [
        {
          psbtHex: '00',
          signInputs: { bc1qexample: [0] },
          sighashTypes: [1],
          marketplaceIntent: parentIntent,
        },
        {
          psbtHex: '01',
          signInputs: { bc1qexample: [0] },
          sighashTypes: [1],
          marketplaceIntent: childIntent,
        },
      ],
    } as never);
    vi.mocked(decodePsbtForApproval).mockResolvedValue(decodedParent(false) as never);
    const childDetails = {
      inputs: [{ index: 0, txid: 'ab'.repeat(32), vout: 1 }],
      outputs: [{ index: 0, type: 'p2wpkh', value: 1_000, script: '0014' }],
      transactionId: 'cd'.repeat(32),
    };
    vi.mocked(extractPsbtDetails).mockReturnValue(childDetails as never);
    vi.mocked(fetchInputsAlkanes).mockResolvedValue([{
      inputIndex: 0,
      utxo: `${'ab'.repeat(32)}:1`,
      balances: [{ id: '2:0', value: '1' }],
    }]);
    vi.mocked(analyzeAcceptanceCpfpBundle).mockReturnValue(
      review('accept_exact_offer_with_cpfp'),
    );

    const { result } = renderHook(() => useSignPsbtsRequest());

    await waitFor(() => expect(result.current.decodedInfo?.review.status).toBe('blocked'));
    expect(fetchInputsAlkanes).toHaveBeenCalledWith(childDetails.inputs, [0]);
  });
});
