import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { getPsbtApprovalPolicy } from '@/core/bitcoin/providerApprovalPolicy';
import type { DecodedPsbtInfo } from '@/core/bitcoin/psbtApprovalDecoder';
import type { ProtocolField } from '@/core/counterparty/describe';
import type { MarketplaceApprovalReview } from '@/core/counterparty/marketplace/intentTypes';
import { t } from '@/i18n';
import ApprovePsbtPage from '../approve';

/**
 * The invalidation screen with the real details card: its outcome notice is said once, whether or
 * not the card has facts of its own to show it under.
 */
const ADDRESS = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';
const state = vi.hoisted(() => ({ decoded: null as DecodedPsbtInfo | null }));
const request = { id: 'psbt', origin: 'https://example.test', address: ADDRESS,
  signInputs: { [ADDRESS]: [0] }, sighashTypes: [0x01] };

vi.mock('@/hooks/useSignPsbtRequest', () => ({ useSignPsbtRequest: () => ({
  request, requestId: 'psbt', decodedInfo: state.decoded,
  approvalPolicy: state.decoded ? getPsbtApprovalPolicy(request, state.decoded, true, 10) : undefined, fastestFee: 10,
  isLoading: false, isRefreshing: false, handleApprove: vi.fn(), handleCancel: vi.fn(), handleRetry: vi.fn(),
}) }));
vi.mock('@/contexts/wallet-context', () => ({ useWallet: () => ({
  activeWallet: { name: 'Wallet', type: 'mnemonic' }, activeAddress: { address: ADDRESS },
}) }));
vi.mock('@/contexts/settings-context', () => ({ useSettings: () => ({ settings: { strictTransactionVerification: true } }) }));
vi.mock('@/contexts/header-context', () => ({ useHeader: () => ({ setHeaderProps: vi.fn() }) }));
vi.mock('@/hooks/usePopupLifecycle', () => ({ usePopupLifecycle: vi.fn() }));
vi.mock('@/components/domain/approval/approval-summary-card', () => ({ ApprovalSummaryCard: () => null }));
vi.mock('@/components/domain/approval/approval-transaction-details', () => ({ ApprovalTransactionDetails: () => null }));

function invalidation(extraFacts: ProtocolField[]): DecodedPsbtInfo {
  const payment: ProtocolField[] = [
    { kind: 'amount', label: t('marketplace_invalidation_return'), value: '12,110 sats' },
    { kind: 'amount', label: t('marketplace_intent_network_fee'), value: '220 sats' },
  ];
  const review: MarketplaceApprovalReview = {
    status: 'proved', family: 'invalidate_offers', title: t('marketplace_invalidation_title'),
    facts: [...payment, ...extraFacts], paymentSummary: payment, blockers: [],
    notices: [{ severity: 'info', message: t('marketplace_invalidation_notice') }],
  };
  return {
    counterpartyMessage: undefined, verification: { passed: true }, safety: { blocked: false, warnings: [] },
    attachedAssets: [{ inputIndex: 0, utxo: `${'a'.repeat(64)}:0`, assets: [] }], mpmaRecipients: [],
    structureFindings: [], protocolContext: {}, attachedAssetDestination: null, marketplaceReview: review,
    psbtDetails: {
      transactionId: 'b'.repeat(64), transactionVersion: 2, lockTime: 0, rawTxHex: '00'.repeat(200),
      inputs: [{ index: 0, txid: 'a'.repeat(64), vout: 0, value: 12_330, address: ADDRESS }],
      outputs: [{ index: 0, value: 12_110, address: ADDRESS, type: 'p2wpkh', script: '' }],
      totalInputValue: 12_330, totalOutputValue: 12_110, fee: 220, unfunded: false, hasOpReturn: false,
    },
  } as unknown as DecodedPsbtInfo; // Only the fields the screen and policy read.
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it.each([
  ['only payment facts', []],
  ['a further fact in the details card', [{ kind: 'text' as const, label: 'Funding coins', value: '1' }]],
])('states the invalidation outcome once with %s', (_, extra) => {
  state.decoded = invalidation(extra as ProtocolField[]);
  render(<ApprovePsbtPage />);
  expect(screen.getAllByText(t('marketplace_invalidation_notice'))).toHaveLength(1);
});
