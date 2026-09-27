import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getPsbtApprovalPolicy, type ProviderApprovalPolicy } from '@/core/bitcoin/providerApprovalPolicy';
import type { DecodedPsbtInfo } from '@/core/bitcoin/psbtApprovalDecoder';
import type { MarketplaceApprovalReview } from '@/core/counterparty/marketplaceIntent';
import { zeldWarning } from '@/core/counterparty/signRequestAnalysis';
import ApprovePsbtPage from '../approve';

const ADDRESS = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';

const state = vi.hoisted(() => ({
  approve: vi.fn(),
  decoded: null as DecodedPsbtInfo | null,
  policy: undefined as ProviderApprovalPolicy | undefined,
  activeAddress: '',
}));
const request = { id: 'psbt', origin: 'https://example.test', address: ADDRESS,
  signInputs: { [ADDRESS]: [0] }, sighashTypes: [0x01] };
const SIBLING = '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2';

vi.mock('@/hooks/useSignPsbtRequest', () => ({ useSignPsbtRequest: () => ({
  request, requestId: 'psbt', decodedInfo: state.decoded, approvalPolicy: state.policy, fastestFee: 10,
  isLoading: false, isRefreshing: false, handleApprove: state.approve, handleCancel: vi.fn(), handleRetry: vi.fn(),
}) }));
vi.mock('@/contexts/wallet-context', () => ({ useWallet: () => ({
  activeWallet: { name: 'Wallet', type: 'mnemonic' }, activeAddress: { address: state.activeAddress },
}) }));
vi.mock('@/contexts/settings-context', () => ({ useSettings: () => ({ settings: { strictTransactionVerification: true } }) }));
vi.mock('@/contexts/header-context', () => ({ useHeader: () => ({ setHeaderProps: vi.fn() }) }));
vi.mock('@/hooks/usePopupLifecycle', () => ({ usePopupLifecycle: vi.fn() }));
// Presentation-only cards; this test is about the decision flow, not their layout.
vi.mock('@/components/domain/approval/approval-summary-card', () => ({ ApprovalSummaryCard: () => null }));
vi.mock('@/components/domain/approval/approval-transaction-details', () => ({ ApprovalTransactionDetails: () => null }));
vi.mock('@/components/domain/approval/counterparty-details-card', () => ({ CounterpartyDetailsCard: () => null }));

function decoded(family: MarketplaceApprovalReview['family']): DecodedPsbtInfo {
  const fee = 500;
  return {
    counterpartyMessage: undefined,
    verification: { passed: true },
    safety: { blocked: false, warnings: [] },
    attachedAssets: [{ inputIndex: 0, utxo: `${'a'.repeat(64)}:0`, assets: [] }],
    mpmaRecipients: [],
    structureFindings: [],
    protocolContext: {},
    attachedAssetDestination: null,
    marketplaceReview: {
      status: 'caution', family, title: family, facts: [], blockers: [],
      notices: [{ severity: 'info', message: `${family} notice` }],
    },
    psbtDetails: {
      transactionId: 'b'.repeat(64), transactionVersion: 2, lockTime: 0, rawTxHex: '00'.repeat(200),
      inputs: [{ index: 0, txid: 'a'.repeat(64), vout: 0, value: 100_000 + fee, address: ADDRESS }],
      outputs: [{ index: 0, value: 100_000, address: ADDRESS, type: 'p2wpkh', script: '' }],
      totalInputValue: 100_000 + fee, totalOutputValue: 100_000, fee, unfunded: false, hasOpReturn: false,
    },
  } as unknown as DecodedPsbtInfo; // Only the fields the screen and policy read.
}

beforeEach(() => {
  state.activeAddress = ADDRESS;
  state.approve.mockReset().mockResolvedValue(undefined);
  vi.spyOn(window, 'close').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it.each([
  ['authorize_exact_offer', 'Authorize offer'],
  ['prepare_asset', 'Prepare asset'],
  ['attach_for_listing', 'Sign transaction'],
] as const)('signs a checked %s in one click that the execution policy accepts', async (family, label) => {
  state.decoded = decoded(family);
  // The real execution policy, so a screen/service disagreement fails here.
  state.policy = getPsbtApprovalPolicy(request, state.decoded, true, 10);
  expect(state.policy.requiresAcknowledgement).toBe(false);
  render(<ApprovePsbtPage />);
  fireEvent.click(screen.getByRole('button', { name: label }));
  await waitFor(() => expect(state.approve).toHaveBeenCalledWith(false));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('takes the review step whenever the execution policy requires acknowledgement', async () => {
  state.decoded = decoded('authorize_exact_offer');
  state.policy = { blocked: false, requiresAcknowledgement: true, safeOwnChange: true };
  render(<ApprovePsbtPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Review' }));
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
  expect(state.approve).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Authorize offer' }));
  await waitFor(() => expect(state.approve).toHaveBeenCalledWith(true));
});

it('reviews a request as its own signer after a switch to the paired sibling', async () => {
  // Made for the SegWit half, now showing while its Legacy sibling is active. The background signs
  // input 0 with the request's key, so the header names it, its inputs are ours, and the sibling is
  // not presented as an extra "paired" signer.
  state.activeAddress = SIBLING;
  state.decoded = decoded('prepare_asset');
  state.policy = getPsbtApprovalPolicy(request, state.decoded, true, 10);
  render(<ApprovePsbtPage />);
  expect(screen.getByText(ADDRESS)).toBeInTheDocument();
  expect(screen.queryByText(SIBLING)).not.toBeInTheDocument();
  expect(screen.queryByText(/Signing addresses/i)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Prepare asset' }));
  await waitFor(() => expect(state.approve).toHaveBeenCalledWith(false));
});

it('offers a retry, not a sign, when a dispense could not check its dispenser', () => {
  const info = decoded('prepare_asset');
  info.marketplaceReview = undefined;
  info.safety = { blocked: true, warnings: [{
    severity: 'block', code: 'dispenser_lookup_retry',
    title: 'Retry Required: Couldn’t Check the Dispenser', message: 'Try again in a moment.',
  }] } as DecodedPsbtInfo['safety'];
  state.decoded = info;
  state.policy = getPsbtApprovalPolicy(request, info, true, 10);
  expect(state.policy).toMatchObject({ blocked: true, retry: true });
  render(<ApprovePsbtPage />);
  expect(screen.getByText('Retry Required: Couldn’t Check the Dispenser')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Retry verification' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Awaiting verification' })).toBeDisabled();
  expect(state.approve).not.toHaveBeenCalled();
});

it('states where ZELD stays with an attached asset without adding a review step', async () => {
  state.decoded = decoded('attach_for_listing');
  state.decoded.safety.warnings = [zeldWarning({ kind: 'asset_output', amount: '409600000000', asset: 'RARESHADILAY', vout: 0 }, false)];
  state.policy = getPsbtApprovalPolicy(request, state.decoded, true, 10);
  expect(state.policy.requiresAcknowledgement).toBe(false);
  render(<ApprovePsbtPage />);
  expect(screen.getByTestId('approval-zeld-notes')).toHaveTextContent(
    '4,096 ZELD will sit on the output holding RARESHADILAY and leave with it if that asset is sold or moved.');
  fireEvent.click(screen.getByRole('button', { name: 'Sign transaction' }));
  await waitFor(() => expect(state.approve).toHaveBeenCalledWith(false));
});

it('sends ZELD leaving the wallet through the review step, and shows no ZELD card without ZELD', async () => {
  state.decoded = decoded('attach_for_listing');
  render(<ApprovePsbtPage />);
  expect(screen.queryByTestId('approval-zeld-notes')).not.toBeInTheDocument();
  cleanup();
  state.decoded.safety.warnings = [zeldWarning({ kind: 'leaves', amount: '409600000000', destination: SIBLING }, false)];
  state.policy = getPsbtApprovalPolicy(request, state.decoded, true, 10);
  expect(state.policy.requiresAcknowledgement).toBe(true);
  render(<ApprovePsbtPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Review' }));
  expect(await screen.findByRole('dialog')).toHaveTextContent(`4,096 ZELD goes to ${SIBLING}.`);
  expect(state.approve).not.toHaveBeenCalled();
});
