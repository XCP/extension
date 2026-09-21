import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { AddressFormat } from '@/core/bitcoin/address';
import { DEFAULT_SETTINGS } from '@/core/settings';
import ZeldPage from './index';

const mockNavigate = vi.fn();
vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useNavigate: () => mockNavigate,
}));

let addressFormat: AddressFormat = AddressFormat.P2WPKH;
let walletType: 'mnemonic' | 'hardware' = 'mnemonic';
vi.mock('@/contexts/wallet-context', () => ({
  useWallet: () => ({
    activeWallet: { id: 'w', addressFormat, type: walletType },
    activeAddress: { address: 'bc1qtest123', name: 'Test' },
  }),
}));

let zeldHuntSeconds = 20;
vi.mock('@/contexts/settings-context', () => ({
  useSettings: () => ({ settings: { ...DEFAULT_SETTINGS, zeldHuntSeconds }, updateSettings: vi.fn(), isLoading: false }),
}));

vi.mock('@/contexts/header-context', () => ({ useHeader: () => ({ setHeaderProps: vi.fn() }) }));

const TXID = '000000f7dba08c0af8a0ca085d4c12578d330d5524f6d867dc8f66f970fe147d';
const mockFetchZeldBalance = vi.fn();
const mockFetchZeldRewards = vi.fn();
vi.mock('@/core/zeld/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/zeld/api')>()),
  fetchZeldBalance: (...args: unknown[]) => mockFetchZeldBalance(...args),
  fetchZeldRewards: (...args: unknown[]) => mockFetchZeldRewards(...args),
}));
vi.mock('@/core/bitcoin/utxo', () => ({
  fetchUTXOs: vi.fn(async () => [{ txid: TXID, vout: 1, value: 95_160, status: { confirmed: true } }]),
}));

describe('ZeldPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    addressFormat = AddressFormat.P2WPKH;
    zeldHuntSeconds = 20;
    mockFetchZeldBalance.mockResolvedValue({ baseUnits: 409_600_000_000n, utxos: [{ txid: TXID, vout: 1, balance: 409_600_000_000n }] });
    mockFetchZeldRewards.mockResolvedValue([{ txid: TXID, vout: 1, block_index: 965_470, reward: 409_600_000_000n, zero_count: 6 }]);
  });

  it('shows the balance, where it sits, and recent rewards', async () => {
    render(<MemoryRouter><ZeldPage /></MemoryRouter>);
    expect(await screen.findByText('Balance: 4,096.00000000')).toBeInTheDocument();
    expect(screen.getByText('Outputs').nextSibling).toHaveTextContent('1');
    expect(screen.getByText('95,160 sats')).toBeInTheDocument();
    expect(screen.getByText(/block 965,470, 6 zeros/)).toBeInTheDocument();
    expect(screen.getByText('+4,096')).toBeInTheDocument();
    expect((screen.getByLabelText('Seconds to hunt for a ZELD transaction ID') as HTMLInputElement).value).toBe('20');
  });

  it('routes Send ZELD to the send page', async () => {
    render(<MemoryRouter><ZeldPage /></MemoryRouter>);
    (await screen.findByText('Send ZELD')).click();
    expect(mockNavigate).toHaveBeenCalledWith('/zeld/send');
  });

  it('explains why a legacy hardware wallet cannot hunt, and says nothing for a legacy software wallet', async () => {
    addressFormat = AddressFormat.P2PKH;
    walletType = 'hardware';
    try {
      render(<MemoryRouter><ZeldPage /></MemoryRouter>);
      expect(await screen.findByText(/cannot hunt/)).toBeInTheDocument();
    } finally {
      walletType = 'mnemonic';
    }
    cleanup();
    render(<MemoryRouter><ZeldPage /></MemoryRouter>);
    await screen.findByText('Send ZELD');
    expect(screen.queryByText(/cannot hunt/)).toBeNull();
  });

  it('says when the indexer is unreachable', async () => {
    mockFetchZeldBalance.mockRejectedValue(new Error('down'));
    render(<MemoryRouter><ZeldPage /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be reached');
  });
});
