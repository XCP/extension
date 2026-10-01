import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ApproveMessagePage from '../approve';

const state = vi.hoisted(() => ({ approve: vi.fn(), cancel: vi.fn(), cancellation: true, header: vi.fn() }));
vi.mock('@/hooks/useSignMessageRequest', () => ({ useSignMessageRequest: () => ({
  request: { id: 'cancel', address: 'bc1qaddress', origin: 'https://market.example', message: 'Original message bytes',
    ...(state.cancellation ? { cancelOffersIntent: { offerIds: ['a', 'b'] } } : {}) },
  review: { cancellationCoins: [{ outpoint: 'a'.repeat(64) + ':0', effect: 'unlocks' },
    { outpoint: 'b'.repeat(64) + ':1', effect: 'stays_locked' }] },
  requestId: 'cancel', isLoading: false, error: null, handleApprove: state.approve, handleCancel: state.cancel,
}) }));
vi.mock('@/contexts/wallet-context', () => ({ useWallet: () => ({
  activeWallet: { name: 'Wallet', type: 'mnemonic' }, activeAddress: { address: 'bc1qaddress' },
}) }));
vi.mock('@/contexts/header-context', () => ({ useHeader: () => ({ setHeaderProps: state.header }) }));
vi.mock('@/hooks/usePopupLifecycle', () => ({ usePopupLifecycle: vi.fn() }));

beforeEach(() => {
  state.cancellation = true;
  state.approve.mockReset().mockResolvedValue(undefined);
  state.cancel.mockReset().mockResolvedValue(undefined);
  vi.spyOn(window, 'close').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('shows the cancellation count, each lock outcome and the unchanged message before signing', async () => {
  render(<ApproveMessagePage />);
  expect(screen.getByRole('heading', { name: 'Cancel 2 offers' })).toBeInTheDocument();
  expect(screen.getByText('Unlocks')).toBeInTheDocument();
  expect(screen.getByText('Stays locked')).toBeInTheDocument();
  expect(screen.getByText('Original message bytes')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Sign' }));
  await waitFor(() => expect(state.approve).toHaveBeenCalledWith(false));
});

it('keeps ordinary message approval unchanged when there is no cancellation metadata', () => {
  state.cancellation = false;
  render(<ApproveMessagePage />);
  expect(screen.getByRole('button', { name: 'Sign message' })).toBeInTheDocument();
  expect(screen.queryByText('Unlocks')).not.toBeInTheDocument();
});

it('declining a cancellation never submits a signing approval', async () => {
  render(<ApproveMessagePage />);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(state.cancel).toHaveBeenCalled());
  expect(state.approve).not.toHaveBeenCalled();
});
