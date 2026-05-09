import { apiClient } from '@/utils/apiClient';
import { CounterpartyApiError } from '@/utils/blockchain/errors';
import { walletManager } from '@/utils/wallet/walletManager';

export type CounterpartyFeature = 'ammPools';

interface ServerInfo {
  server_ready: boolean;
  network: string;
  version: string;
  backend_height: number;
  counterparty_height: number;
}

interface FeatureRequirement {
  minVersion: string;
  activationHeights: Record<string, number>;
  label: string;
}

const CAPABILITY_CACHE_TTL_MS = 60_000;

const FEATURE_REQUIREMENTS: Record<CounterpartyFeature, FeatureRequirement> = {
  ammPools: {
    minVersion: '11.1.0',
    activationHeights: {
      mainnet: 999999999,
      testnet: 999999999,
      testnet3: 999999999,
      testnet4: 999999999,
      signet: 0,
      regtest: 0,
    },
    label: 'AMM pools',
  },
};

let cachedServerInfo: { apiBase: string; serverInfo: ServerInfo; timestamp: number } | null = null;

function getApiBase(): string {
  return walletManager.getSettings().counterpartyApiBase;
}

function parseVersion(version: string): [number, number, number] {
  const match = version.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return [0, 0, 0];
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function isVersionAtLeast(version: string, minimum: string): boolean {
  const current = parseVersion(version);
  const required = parseVersion(minimum);

  for (let i = 0; i < required.length; i += 1) {
    if (current[i] > required[i]) return true;
    if (current[i] < required[i]) return false;
  }
  return true;
}

async function fetchCapabilityServerInfo(): Promise<ServerInfo> {
  const apiBase = getApiBase();

  if (
    cachedServerInfo &&
    cachedServerInfo.apiBase === apiBase &&
    Date.now() - cachedServerInfo.timestamp < CAPABILITY_CACHE_TTL_MS
  ) {
    return cachedServerInfo.serverInfo;
  }

  const response = await apiClient.get<{ result?: ServerInfo }>(`${apiBase}/v2/`);
  if (!response.data.result) {
    throw new CounterpartyApiError('Invalid API response: missing result', '/v2/');
  }

  cachedServerInfo = {
    apiBase,
    serverInfo: response.data.result,
    timestamp: Date.now(),
  };

  return response.data.result;
}

export async function getCounterpartyFeatureStatus(feature: CounterpartyFeature): Promise<{
  supported: boolean;
  serverInfo: ServerInfo;
  reason?: string;
}> {
  const requirement = FEATURE_REQUIREMENTS[feature];
  const serverInfo = await fetchCapabilityServerInfo();

  if (!serverInfo.server_ready) {
    return {
      supported: false,
      serverInfo,
      reason: 'API server is not ready',
    };
  }

  if (!isVersionAtLeast(serverInfo.version, requirement.minVersion)) {
    return {
      supported: false,
      serverInfo,
      reason: `${requirement.label} require Counterparty API ${requirement.minVersion} or newer; current API is ${serverInfo.version}`,
    };
  }

  const activationHeight =
    requirement.activationHeights[serverInfo.network] ??
    requirement.activationHeights.mainnet;

  if (serverInfo.counterparty_height < activationHeight) {
    return {
      supported: false,
      serverInfo,
      reason: `${requirement.label} activate at block ${activationHeight}; current Counterparty height is ${serverInfo.counterparty_height}`,
    };
  }

  return { supported: true, serverInfo };
}

export async function requireCounterpartyFeature(feature: CounterpartyFeature): Promise<void> {
  const status = await getCounterpartyFeatureStatus(feature);
  if (!status.supported) {
    throw new CounterpartyApiError(
      status.reason ?? 'Counterparty feature is not supported by this API',
      '/v2/'
    );
  }
}

export function clearCounterpartyCapabilityCache(): void {
  cachedServerInfo = null;
}
