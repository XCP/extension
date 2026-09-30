import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/core/api/client';
import { CounterpartyApiError } from '@/core/errors';
import { getActiveSettings } from '@/core/settings';
import {
  clearCounterpartyCapabilityCache,
  getCounterpartyFeatureStatus,
  isVersionAtLeast,
  requireCounterpartyFeature,
} from '../capabilities';

vi.mock('@/core/api/client');
vi.mock('@/core/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/settings')>()),
  getActiveSettings: vi.fn(),
}));

const mockedApiClient = vi.mocked(apiClient, true);
const mockedGetSettings = vi.mocked(getActiveSettings);
const mockApiBase = 'https://api.counterparty.io:4000';

function mockServerInfo(overrides: Record<string, unknown> = {}) {
  mockedApiClient.get.mockResolvedValueOnce({
    data: {
      result: {
        server_ready: true,
        network: 'mainnet',
        version: '11.1.0',
        backend_height: 900000,
        counterparty_height: 952800,
        ...overrides,
      },
    },
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {},
  } as any);
}

describe('counterparty capabilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCounterpartyCapabilityCache();
    mockedGetSettings.mockReturnValue({ counterpartyApiBase: mockApiBase } as any);
  });

  it('compares semantic versions using numeric components', () => {
    expect(isVersionAtLeast('11.1.0', '11.1.0')).toBe(true);
    expect(isVersionAtLeast('11.1.0-alpha.1', '11.1.0')).toBe(true);
    expect(isVersionAtLeast('11.2.0', '11.1.0')).toBe(true);
    expect(isVersionAtLeast('11.0.9', '11.1.0')).toBe(false);
    expect(isVersionAtLeast('11.10.0', '11.2.0')).toBe(true);
    expect(isVersionAtLeast('11.2.0', '11.10.0')).toBe(false);
  });

  it('reports AMM pools as supported when version and height are ready', async () => {
    mockServerInfo();

    const status = await getCounterpartyFeatureStatus('ammPools');

    expect(status.supported).toBe(true);
    expect(mockedApiClient.get).toHaveBeenCalledWith(`${mockApiBase}/v2/`);
  });

  it('rejects AMM pools before the minimum API version', async () => {
    mockServerInfo({ version: '11.0.0' });

    await expect(requireCounterpartyFeature('ammPools')).rejects.toThrow(CounterpartyApiError);
    await expect(requireCounterpartyFeature('ammPools')).rejects.toThrow('11.1.0');
  });

  it('rejects AMM pools before activation height', async () => {
    mockServerInfo({ counterparty_height: 950000 });

    const status = await getCounterpartyFeatureStatus('ammPools');

    expect(status.supported).toBe(false);
    expect(status.reason).toContain('activate at block 952800');
  });

  it('reports indefinite orders as supported when version and height are ready', async () => {
    mockServerInfo();

    const status = await getCounterpartyFeatureStatus('indefiniteOrders');

    expect(status.supported).toBe(true);
  });

  it('rejects indefinite orders before activation height', async () => {
    mockServerInfo({ counterparty_height: 952799 });

    const status = await getCounterpartyFeatureStatus('indefiniteOrders');

    expect(status.supported).toBe(false);
    expect(status.reason).toContain('activate at block 952800');
  });

  it('allows AMM pools on regtest once the API version supports them', async () => {
    mockServerInfo({ network: 'regtest', counterparty_height: 0 });

    const status = await getCounterpartyFeatureStatus('ammPools');

    expect(status.supported).toBe(true);
  });

  describe('Taproot encoding, whose reveal the wallet signs (Core 11.5)', () => {
    it.each(['11.3.0', '11.4.9'])('is refused by an API at %s, with the translated reason', async (version) => {
      mockServerInfo({ version });
      const status = await getCounterpartyFeatureStatus('taprootReveals');
      expect(status.supported).toBe(false);
      expect(status.reason).toBe(
        `Taproot encoding and inscriptions need Counterparty API 11.5.0 or newer. This API runs ${version}.`);
    });

    it('is refused as a CounterpartyApiError, the error the wallet-chosen encoding falls back from', async () => {
      mockServerInfo({ version: '11.3.0' });
      await expect(requireCounterpartyFeature('taprootReveals')).rejects.toThrow(CounterpartyApiError);
    });

    // A pre-release reads as its release: 11.5.0-rc.1 compares equal to 11.5.0.
    it.each(['11.5.0', '11.5.0-rc.1', '11.5.3', '11.10.0', '12.0.0'])('is allowed by an API at %s on any network and height', async (version) => {
      for (const network of ['mainnet', 'testnet4', 'signet', 'regtest']) {
        clearCounterpartyCapabilityCache();
        mockServerInfo({ version, network, counterparty_height: 0 });
        await expect(requireCounterpartyFeature('taprootReveals')).resolves.toBeUndefined();
      }
    });

    it('is refused while the API is not ready', async () => {
      mockServerInfo({ version: '11.5.0', server_ready: false });
      const status = await getCounterpartyFeatureStatus('taprootReveals');
      expect(status.supported).toBe(false);
    });
  });
});
