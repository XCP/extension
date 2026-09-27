import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ProviderApprovalPolicy } from '@/core/bitcoin/providerApprovalPolicy';
import type { DecodedPsbtBundleInfo } from '@/core/bitcoin/psbtBundleApprovalDecoder';
import ApprovePsbtsPage from '../approve';

const state = vi.hoisted(() => ({
  approve: vi.fn(), setHeaderProps: vi.fn(),
  policy: {blocked: false, requiresAcknowledgement: false, safeOwnChange: false} as ProviderApprovalPolicy,
  decoded: {} as DecodedPsbtBundleInfo,
  request: {} as Record<string, unknown>,
  activeAddress: '1wallet',
}));
vi.mock('@/hooks/useSignPsbtsRequest', () => ({useSignPsbtsRequest: () => ({
  requestId: 'batch', request: state.request,
  decodedInfo: state.decoded, approvalPolicy: state.policy,
  isLoading: false, isRefreshing: false, handleApprove: state.approve, handleCancel: vi.fn(),
})}));
vi.mock('@/contexts/wallet-context', () => ({useWallet: () => ({
  activeWallet: {name: 'Wallet', type: 'mnemonic'}, activeAddress: {address: state.activeAddress},
})}));
vi.mock('@/contexts/header-context', () => ({useHeader: () => ({setHeaderProps: state.setHeaderProps})}));
vi.mock('@/hooks/usePopupLifecycle', () => ({usePopupLifecycle: vi.fn()}));

beforeEach(() => {
  state.approve.mockReset().mockResolvedValue(undefined);
  vi.spyOn(window, 'close').mockImplementation(() => {});
  state.policy = {blocked: false, requiresAcknowledgement: false, safeOwnChange: false};
  state.request = {bundleKind: 'prepare-assets', origin: 'https://example.test', address: '1wallet', items: []};
  state.activeAddress = '1wallet';
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
  state.request = {bundleKind: 'authorize-offers', origin: 'https://example.test', address: '1wallet', items: [{signInputs: {'1wallet': [0]}}, {signInputs: {'1wallet': [0]}}, {signInputs: {'1wallet': [0]}}]};
  render(<ApprovePsbtsPage />);
  expect(state.setHeaderProps).toHaveBeenCalledWith({title: 'Authorize Offers'});
  fireEvent.click(screen.getByRole('button', {name: 'Authorize 3 offers'}));
  await waitFor(() => expect(state.approve).toHaveBeenCalledWith(false));
});

it('says fund and authorize, counting only the offers, when the review also funds them', async () => {
  state.request = {bundleKind: 'fund-and-authorize-offers', origin: 'https://example.test', address: '1wallet', items: [{signInputs: {'1wallet': [0]}}, {signInputs: {'1wallet': [0]}}, {signInputs: {'1wallet': [0]}}]};
  render(<ApprovePsbtsPage />);
  expect(state.setHeaderProps).toHaveBeenCalledWith({title: 'Fund and Authorize Offers'});
  fireEvent.click(screen.getByRole('button', {name: 'Fund and authorize 2 offers'}));
  await waitFor(() => expect(state.approve).toHaveBeenCalledWith(false));
});

it('names a single funded offer in the singular', () => {
  state.request = {bundleKind: 'fund-and-authorize-offers', origin: 'https://example.test', address: '1wallet', items: [{signInputs: {'1wallet': [0]}}, {signInputs: {'1wallet': [0]}}]};
  render(<ApprovePsbtsPage />);
  expect(screen.getByRole('button', {name: 'Fund and authorize 1 offer'})).toBeInTheDocument();
});

it('takes the review step when an exact-offer batch requires acknowledgement', async () => {
  state.request = {bundleKind: 'authorize-offers', origin: 'https://example.test', address: '1wallet', items: [{signInputs: {'1wallet': [0]}}]};
  state.policy.requiresAcknowledgement = true;
  render(<ApprovePsbtsPage />);
  fireEvent.click(screen.getByRole('button', {name: 'Authorize 1 offer'}));
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
  expect(state.approve).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', {name: 'Confirm and sign'}));
  await waitFor(() => expect(state.approve).toHaveBeenCalledWith(true));
});

it('names the request signer in the header after a switch to the paired sibling', () => {
  // The request was made for the SegWit half; the user has since switched to its Legacy sibling.
  state.request = {bundleKind: 'prepare-assets', origin: 'https://example.test', address: 'bc1qrequest', items: [
    {psbtHex: 'a', signInputs: {bc1qrequest: [0]}, sighashTypes: [1]},
    {psbtHex: 'b', signInputs: {bc1qrequest: [1]}, sighashTypes: [1]},
  ]};
  state.activeAddress = '1Sibling';
  render(<ApprovePsbtsPage />);
  expect(screen.getByText('bc1qrequest')).toBeInTheDocument();
  expect(screen.queryByText('1Sibling')).not.toBeInTheDocument();
});

it('states a ZELD note once for the batch, naming the items it concerns', () => {
  state.decoded.policyWarnings = [{
    code: 'zeld_movement', severity: 'info', title: 'Transactions 1, 3: ZELD', message: 'raw',
    data: {kind: 'asset_output', amount: '409600000000', asset: 'RARESHADILAY', vout: 0, items: [1, 3]},
  }];
  render(<ApprovePsbtsPage />);
  expect(screen.getByTestId('approval-zeld-notes')).toHaveTextContent(
    'Transactions 1, 3: 4,096 ZELD will sit on the output holding RARESHADILAY');
  expect(screen.queryByTestId('approval-notice')).not.toBeInTheDocument();
});
