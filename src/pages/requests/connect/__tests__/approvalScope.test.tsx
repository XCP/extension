import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApprovalRequest } from '@/types/provider';
import type { Address, PairedAddresses, Wallet } from '@/types/wallet';
import ApproveConnectionPage from '../approve';

const mocks = vi.hoisted(() => ({
  requestId: 'request-A',
  wallet: null as Wallet | null,
  address: null as Address | null,
  getCurrentApproval: vi.fn<() => Promise<ApprovalRequest | null>>(),
  getPairedAddresses: vi.fn<() => Promise<PairedAddresses | null>>(),
  resolveApproval: vi.fn(),
  rejectApproval: vi.fn(),
  navigate: vi.fn(),
  setHeaderProps: vi.fn(),
}));

vi.mock('react-router', () => ({
  useNavigate: () => mocks.navigate,
  useSearchParams: () => [new URLSearchParams({ requestId: mocks.requestId, origin: 'https://site.example' })],
}));
vi.mock('@/contexts/wallet-context', () => ({
  useWallet: () => ({ activeWallet: mocks.wallet, activeAddress: mocks.address, isLoading: false }),
}));
vi.mock('@/contexts/header-context', () => ({ useHeader: () => ({ setHeaderProps: mocks.setHeaderProps }) }));
vi.mock('@/services/approvalService', () => ({ getApprovalService: () => mocks }));
vi.mock('@/services/walletService', () => ({ getWalletService: () => mocks }));

function selectIdentity(name: string) {
  mocks.address = { address: `bc1qwallet${name}`, name, pubKey: '02aa', path: "m/84'/0'/0'/0/0" };
  mocks.wallet = { id: `wallet-${name}`, name, type: 'mnemonic', addressFormat: 'p2wpkh',
    addressCount: 1, addresses: [mocks.address] };
}

function approval(pairedAddresses = true): ApprovalRequest {
  return { id: mocks.requestId, origin: 'https://site.example', method: 'xcp_requestAccounts',
    type: 'connection', timestamp: Date.now(), params: [{ address: mocks.address?.address,
      walletId: mocks.wallet?.id, capabilities: { pairedAddresses } }] };
}

function pairs(address = 'bc1qwalletA', legacy = '1legacyA'): PairedAddresses {
  return {
    legacy: { address: legacy, name: 'Legacy', path: "m/44'/0'/0'/0/0", pubKey: '02aa', format: 'p2pkh', type: 'p2pkh' },
    segwit: { address, name: 'SegWit', path: "m/84'/0'/0'/0/0", pubKey: '02bb', format: 'p2wpkh', type: 'p2wpkh' },
  };
}

describe('connection approval scope', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requestId = 'request-A';
    selectIdentity('A');
    mocks.getCurrentApproval.mockImplementation(() => Promise.resolve(approval()));
    mocks.getPairedAddresses.mockResolvedValue(pairs());
    mocks.resolveApproval.mockResolvedValue(true);
    vi.spyOn(window, 'close').mockImplementation(() => {});
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it('cannot approve before this request and its requested pair finish loading', async () => {
    const request = Promise.withResolvers<ApprovalRequest>();
    const addresses = Promise.withResolvers<PairedAddresses>();
    mocks.getCurrentApproval.mockReturnValueOnce(request.promise);
    mocks.getPairedAddresses.mockReturnValueOnce(addresses.promise);
    render(<ApproveConnectionPage />);

    expect(screen.getByRole('button', { name: 'Loading request…' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Loading request…' }));
    expect(mocks.getPairedAddresses).not.toHaveBeenCalled();
    expect(mocks.resolveApproval).not.toHaveBeenCalled();

    await act(async () => { request.resolve(approval()); await request.promise; });
    expect(screen.getByRole('button', { name: 'Loading addresses…' })).toBeDisabled();
    expect(screen.queryByText('1legacyA')).not.toBeInTheDocument();

    await act(async () => { addresses.resolve(pairs()); await addresses.promise; });
    expect(screen.getByText('1legacyA')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Connect both' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Connect both' }));
    await waitFor(() => expect(mocks.resolveApproval).toHaveBeenCalledExactlyOnceWith('request-A', {
      approved: true, updatedParams: { pairedAddresses: true },
    }));
  });

  it.each(['request', 'wallet', 'address'] as const)('clears the displayed pair immediately when the %s changes', async changed => {
    const { rerender } = render(<ApproveConnectionPage />);
    expect(await screen.findByText('1legacyA')).toBeVisible();
    const next = Promise.withResolvers<ApprovalRequest>();
    mocks.getCurrentApproval.mockReturnValueOnce(next.promise);

    if (changed === 'request') mocks.requestId = 'request-B';
    if (changed === 'wallet') mocks.wallet = { ...mocks.wallet!, id: 'wallet-B' };
    if (changed === 'address') mocks.address = { ...mocks.address!, address: 'bc1qwalletB' };
    rerender(<ApproveConnectionPage />);

    expect(screen.queryByText('1legacyA')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Loading request…' })).toBeDisabled();
    await act(async () => { next.resolve(approval(false)); await next.promise; });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(mocks.resolveApproval).toHaveBeenCalledExactlyOnceWith(mocks.requestId, {
      approved: true, updatedParams: { pairedAddresses: false },
    }));
  });

  it('discards old request responses through A -> B -> A without reviving paired permission', async () => {
    const firstA = Promise.withResolvers<ApprovalRequest>();
    const requestB = Promise.withResolvers<ApprovalRequest>();
    const currentA = Promise.withResolvers<ApprovalRequest>();
    const staleAApproval = approval();
    mocks.getCurrentApproval.mockReturnValueOnce(firstA.promise).mockReturnValueOnce(requestB.promise)
      .mockReturnValueOnce(currentA.promise);
    const { rerender } = render(<ApproveConnectionPage />);
    selectIdentity('B');
    mocks.requestId = 'request-B';
    const staleBApproval = approval();
    rerender(<ApproveConnectionPage />);
    selectIdentity('A');
    mocks.requestId = 'request-A';
    rerender(<ApproveConnectionPage />);

    await act(async () => {
      requestB.resolve(staleBApproval);
      firstA.resolve(staleAApproval);
      await Promise.all([firstA.promise, requestB.promise]);
    });
    expect(screen.getByRole('button', { name: 'Loading request…' })).toBeDisabled();
    expect(mocks.getPairedAddresses).not.toHaveBeenCalled();

    await act(async () => { currentA.resolve(approval(false)); await currentA.promise; });
    mocks.getCurrentApproval.mockResolvedValueOnce(approval(false));
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(mocks.resolveApproval).toHaveBeenCalledExactlyOnceWith('request-A', {
      approved: true, updatedParams: { pairedAddresses: false },
    }));
  });

  it('discards both stale A and B pairs after returning to A', async () => {
    const firstA = Promise.withResolvers<PairedAddresses>();
    const pairB = Promise.withResolvers<PairedAddresses>();
    const currentA = Promise.withResolvers<PairedAddresses>();
    mocks.getPairedAddresses.mockReturnValueOnce(firstA.promise).mockReturnValueOnce(pairB.promise)
      .mockReturnValueOnce(currentA.promise);
    const { rerender } = render(<ApproveConnectionPage />);
    await waitFor(() => expect(mocks.getPairedAddresses).toHaveBeenCalledTimes(1));
    selectIdentity('B');
    mocks.requestId = 'request-B';
    rerender(<ApproveConnectionPage />);
    await waitFor(() => expect(mocks.getPairedAddresses).toHaveBeenCalledTimes(2));
    selectIdentity('A');
    mocks.requestId = 'request-A';
    rerender(<ApproveConnectionPage />);
    await waitFor(() => expect(mocks.getPairedAddresses).toHaveBeenCalledTimes(3));

    await act(async () => {
      firstA.resolve(pairs('bc1qwalletA', '1oldA'));
      pairB.resolve(pairs('bc1qwalletB', '1legacyB'));
      await Promise.all([firstA.promise, pairB.promise]);
    });
    expect(screen.queryByText('1oldA')).not.toBeInTheDocument();
    expect(screen.queryByText('1legacyB')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Loading addresses…' })).toBeDisabled();

    await act(async () => { currentA.resolve(pairs()); await currentA.promise; });
    expect(screen.getByText('1legacyA')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Connect both' })).toBeEnabled();
  });

  it('never displays or grants a returned pair that excludes the approved address', async () => {
    mocks.getPairedAddresses.mockResolvedValue(pairs('bc1qwalletB', '1legacyB'));
    render(<ApproveConnectionPage />);
    expect(await screen.findByText(/Paired addresses are unavailable/)).toBeVisible();
    expect(screen.queryByText('1legacyB')).not.toBeInTheDocument();
    expect(screen.queryByText('bc1qwalletB')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(mocks.resolveApproval).toHaveBeenCalledExactlyOnceWith('request-A', {
      approved: true, updatedParams: { pairedAddresses: false },
    }));
  });

  it('shows the matched background request origin instead of the route origin', async () => {
    const request = { ...approval(false), origin: 'https://actual-requester.example' };
    mocks.getCurrentApproval.mockResolvedValue(request);
    render(<ApproveConnectionPage />);

    expect(await screen.findByText('actual-requester.example')).toBeVisible();
    expect(screen.getByText('https://actual-requester.example')).toBeVisible();
    expect(screen.queryByText('site.example')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(mocks.resolveApproval).toHaveBeenCalledExactlyOnceWith('request-A', {
      approved: true, updatedParams: { pairedAddresses: false },
    }));
  });

  it('does not complete a pending decision after the identity changes', async () => {
    const { rerender } = render(<ApproveConnectionPage />);
    await screen.findByText('1legacyA');
    const pending = Promise.withResolvers<ApprovalRequest>();
    const requestedA = approval();
    mocks.getCurrentApproval.mockReturnValueOnce(pending.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Connect both' }));
    selectIdentity('B');
    // The URL is still A's request, so the existing identity policy must also reject B.
    mocks.getCurrentApproval.mockResolvedValueOnce(requestedA);
    rerender(<ApproveConnectionPage />);
    expect(await screen.findByText(/active address changed/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Unavailable' })).toBeDisabled();
    await act(async () => { pending.resolve(requestedA); await pending.promise; });
    expect(mocks.resolveApproval).not.toHaveBeenCalled();
    expect(window.close).not.toHaveBeenCalled();
  });
});
