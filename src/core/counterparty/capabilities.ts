import { apiClient } from '@/core/api/client';
import { CounterpartyApiError } from '@/core/errors';
import { getActiveSettings } from '@/core/settings';
import { t } from '@/i18n';

export type CounterpartyFeature = 'ammPools' | 'indefiniteOrders' | 'taprootReveals';

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
  /** The reader's sentence when the API is older than `minVersion`; `label`'s English otherwise. */
  versionMessage?: (minVersion: string, currentVersion: string) => string;
}

const CAPABILITY_CACHE_TTL_MS = 60_000;

/**
 * The oldest Counterparty API a custom node may run (`validation/api.ts`, checked when the node is
 * set). From 11.5 a Taproot reveal publishes its message only when the source signed it, and a node
 * older than that reads the chain differently past that release's activation height, so its
 * balances and history are not the network's.
 */
export const MIN_COUNTERPARTY_API_VERSION = '11.5.0';

/**
 * Core 11.5 returns an unsigned reveal the wallet signs with the source key; an older API returns
 * the reveal signed by the server, which 11.5 does not attribute to the source. Every compose that
 * asks for Taproot encoding (inscriptions, and long messages the wallet moves into an envelope)
 * requires it. Enforced by version alone: an 11.5 node applies the rule from its own activation
 * height, and a reveal the source signed is attributed to it on either side of that height.
 */
export const TAPROOT_REVEAL_MIN_VERSION = '11.5.0';

const FEATURE_REQUIREMENTS: Record<CounterpartyFeature, FeatureRequirement> = {
  ammPools: {
    minVersion: '11.1.0',
    activationHeights: {
      mainnet: 952800,
      testnet: 4961300,
      testnet3: 4961300,
      testnet4: 136300,
      signet: 310300,
      regtest: 0,
    },
    label: 'AMM pools',
  },
  indefiniteOrders: {
    minVersion: '11.1.0',
    activationHeights: {
      mainnet: 952800,
      testnet: 4961300,
      testnet3: 4961300,
      testnet4: 136300,
      signet: 310300,
      regtest: 0,
    },
    label: 'Never-expiring orders',
  },
  taprootReveals: {
    minVersion: TAPROOT_REVEAL_MIN_VERSION,
    activationHeights: {
      mainnet: 0,
      testnet: 0,
      testnet3: 0,
      testnet4: 0,
      signet: 0,
      regtest: 0,
    },
    label: 'Taproot encoding and inscriptions',
    versionMessage: (minVersion, currentVersion) =>
      t('capabilities_taproot_requires_api_version', [minVersion, currentVersion]),
  },
};

let cachedServerInfo: { apiBase: string; serverInfo: ServerInfo; timestamp: number } | null = null;

function getApiBase(): string {
  return getActiveSettings().counterpartyApiBase;
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
    if (current[i]! > required[i]!) return true;
    if (current[i]! < required[i]!) return false;
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
      reason: requirement.versionMessage?.(requirement.minVersion, String(serverInfo.version))
        ?? `${requirement.label} require Counterparty API ${requirement.minVersion} or newer; current API is ${serverInfo.version}`,
    };
  }

  const activationHeight =
    requirement.activationHeights[serverInfo.network] ??
    requirement.activationHeights.mainnet!;

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
