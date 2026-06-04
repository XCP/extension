import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  clearCounterpartyCapabilityCache,
  getCounterpartyFeatureStatus,
  isVersionAtLeast,
  requireCounterpartyFeature,
} from '../capabilities';
import { apiClient } from '@/utils/apiClient';
import { CounterpartyApiError } from '@/utils/blockchain/errors';
import { getActiveSettings } from '@/utils/settings';

vi.mock('@/utils/apiClient');
vi.mock('@/utils/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/settings')>()),
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
});
