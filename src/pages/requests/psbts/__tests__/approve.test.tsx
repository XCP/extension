import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ProviderApprovalPolicy } from '@/core/bitcoin/providerApprovalPolicy';
import type { DecodedPsbtBundleInfo } from '@/core/bitcoin/psbtBundleApprovalDecoder';
import ApprovePsbtsPage from '../approve';

const state = vi.hoisted(() => ({
  approve: vi.fn(), setHeaderProps: vi.fn(),
  policy: {blocked: false, requiresAcknowledgement: false, safeOwnChange: false} as ProviderApprovalPolicy,
  decoded: {} as DecodedPsbtBundleInfo,
  request: {} as {bundleKind: string; origin: string; items: unknown[]},
}));
vi.mock('@/hooks/useSignPsbtsRequest', () => ({useSignPsbtsRequest: () => ({
  requestId: 'batch', request: state.request,
  decodedInfo: state.decoded, approvalPolicy: state.policy,
  isLoading: false, isRefreshing: false, handleApprove: state.approve, handleCancel: vi.fn(),
})}));
vi.mock('@/contexts/wallet-context', () => ({useWallet: () => ({
  activeWallet: {name: 'Wallet', type: 'mnemonic'}, activeAddress: {address: '1wallet'},
})}));
vi.mock('@/contexts/header-context', () => ({useHeader: () => ({setHeaderProps: state.setHeaderProps})}));
vi.mock('@/hooks/usePopupLifecycle', () => ({usePopupLifecycle: vi.fn()}));

beforeEach(() => {
  state.approve.mockReset().mockResolvedValue(undefined);
  vi.spyOn(window, 'close').mockImplementation(() => {});
  state.policy = {blocked: false, requiresAcknowledgement: false, safeOwnChange: false};
  state.request = {bundleKind: 'prepare-assets', origin: 'https://example.test', items: []};
  state.decoded = {items: [], review: {
    status: 'caution', family: 'prepare_asset', title: 'Prepare collectibles', facts: [], notices: [], blockers: [],
  }, policyWarnings: []};
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('keeps an ordinary batch a one-step approval', async () => {
  render(<ApprovePsbtsPage />);
  fireEvent.click(screen.getByRole('button', {name: 'Sign transactions'}));
  await waitFor(() => expect(state.approve).toHaveBeenCalledWith(false));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('shows the high-fee consequence before sending an acknowledgment', async () => {
  state.policy.requiresAcknowledgement = true;
  state.decoded.policyWarnings = [{severity: 'warning', title: 'Transaction 1: Unusually high network fee',
    message: 'This transaction pays 500,000 sats. Confirm that this fee is intentional.'}];
  render(<ApprovePsbtsPage />);
  fireEvent.click(screen.getByRole('button', {name: 'Sign transactions'}));
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
  expect(screen.getByText(/500,000 sats/)).toBeInTheDocument();
  expect(state.approve).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', {name: 'Confirm and sign'}));
  await waitFor(() => expect(state.approve).toHaveBeenCalledWith(true));
});

it('disables signing and explains a policy block even when marketplace terms proved', () => {
  state.policy.blocked = true;
  state.decoded.review.status = 'proved';
  state.decoded.policyWarnings = [{severity: 'block', title: 'Transaction 1: Blocked: ZELD Would Leave',
    message: 'Move your ZELD before signing this transaction.'}];
  render(<ApprovePsbtsPage />);
  expect(screen.getByText(/ZELD Would Leave/)).toBeInTheDocument();
  expect(screen.getByRole('button', {name: 'Blocked'})).toBeDisabled();
  expect(state.approve).not.toHaveBeenCalled();
});

it('does not carry an acknowledgment forward when the reviewed facts change', async () => {
  state.policy.requiresAcknowledgement = true;
  state.decoded.policyWarnings = [{severity: 'warning', title: 'High fee', message: '500,000 sats'}];
  const view = render(<ApprovePsbtsPage />);
  fireEvent.click(screen.getByRole('button', {name: 'Sign transactions'}));
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
  state.decoded = {...state.decoded, policyWarnings: [{severity: 'warning', title: 'High fee', message: '600,000 sats'}]};
  view.rerender(<ApprovePsbtsPage />);
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(state.approve).not.toHaveBeenCalled();
});

it('names exact-offer authorizations in the header and the sign button', async () => {
  state.request = {bundleKind: 'authorize-offers', origin: 'https://example.test', items: [{}, {}, {}]};
  render(<ApprovePsbtsPage />);
  expect(state.setHeaderProps).toHaveBeenCalledWith({title: 'Authorize Offers'});
  fireEvent.click(screen.getByRole('button', {name: 'Authorize 3 offers'}));
  await waitFor(() => expect(state.approve).toHaveBeenCalledWith(false));
});

it('takes the review step when an exact-offer batch requires acknowledgement', async () => {
  state.request = {bundleKind: 'authorize-offers', origin: 'https://example.test', items: [{}]};
  state.policy.requiresAcknowledgement = true;
  render(<ApprovePsbtsPage />);
  fireEvent.click(screen.getByRole('button', {name: 'Authorize 1 offer'}));
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
  expect(state.approve).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', {name: 'Confirm and sign'}));
  await waitFor(() => expect(state.approve).toHaveBeenCalledWith(true));
});
