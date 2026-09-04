import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeSignRequest } from '@/core/counterparty/signRequestAnalysis';
import { getSignFlow } from '@/platform/provider/signFlow';
import { useSignTransactionRequest } from '../useSignTransactionRequest';

vi.mock('react-router', () => ({
  useSearchParams: () => [new URLSearchParams('requestId=req-1')],
}));

vi.mock('@/platform/provider/signFlow', () => ({
  getSignFlow: vi.fn(),
  recordSignOutcome: vi.fn(),
}));

vi.mock('@/platform/provider/emitToBackground', () => ({
  emitToBackground: vi.fn(),
}));

vi.mock('@/core/bitcoin/localTransactionParse', () => ({
  parseRawTransactionLocally: () => ({
    txid: 'tx-1',
    inputs: [{ txid: 'prev-1', vout: 0 }],
    outputs: [{ index: 0, value: 10_000, type: 'p2wpkh', address: 'bc1qmine' }],
    vsize: 110,
    hasOpReturn: false,
  }),
}));

vi.mock('@/core/counterparty/inputAssets', () => ({
  fetchInputsAttachedAssets: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/core/counterparty/transaction', () => ({
  fetchInputPrevouts: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock('@/core/counterparty/unpack/opReturn', () => ({
  extractCounterpartyPayload: () => undefined,
}));

vi.mock('@/core/counterparty/signRequestAnalysis', () => ({
  analyzeSignRequest: vi.fn(),
}));

/** The signer addresses each `analyzeSignRequest` call was made with, in order. */
function signerAddressesPerCall(): string[][] {
  return vi.mocked(analyzeSignRequest).mock.calls.map(([input]) => input.signerAddresses);
}

describe('useSignTransactionRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSignFlow).mockResolvedValue({
      id: 'req-1',
      rawTxHex: '0100000000',
    } as any);
    vi.mocked(analyzeSignRequest).mockResolvedValue({
      counterpartyMessage: undefined,
      verification: {} as any,
      safety: { blocked: false, warnings: [] } as any,
      attachedAssets: [],
      alkaneBalances: [],
      mpmaRecipients: [],
      structureFindings: [],
      protocolContext: {} as any,
      attachedAssetDestination: null,
    });
  });

  // The approval screen passes `activeAddress?.address`, which is null until the wallet context
  // hydrates. If the analysis is not recomputed once the address arrives, the screen decides
  // whose outputs are whose with an empty signer list — every output back to the user reads as
  // leaving the wallet.
  it('re-analyzes with the signer address once the wallet context hydrates', async () => {
    const { result, rerender } = renderHook(
      ({ signer }: { signer?: string }) => useSignTransactionRequest(signer),
      { initialProps: { signer: undefined } as { signer?: string } }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(signerAddressesPerCall()).toEqual([[]]);

    rerender({ signer: 'bc1qmine' });

    await waitFor(() => {
      expect(signerAddressesPerCall()).toContainEqual(['bc1qmine']);
    });
  });

  it('does not re-analyze when the signer address is unchanged', async () => {
    const { result, rerender } = renderHook(
      ({ signer }: { signer?: string }) => useSignTransactionRequest(signer),
      { initialProps: { signer: 'bc1qmine' } as { signer?: string } }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(signerAddressesPerCall()).toEqual([['bc1qmine']]);

    rerender({ signer: 'bc1qmine' });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(signerAddressesPerCall()).toEqual([['bc1qmine']]);
  });
});
