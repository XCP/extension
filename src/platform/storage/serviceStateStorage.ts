/**
 * Storage for service state persistence.
 *
 * Services can persist state to survive service worker restarts.
 * State is stored in session storage (cleared on browser close).
 * Keep-alive pings use local storage.
 */

interface ServiceStateRecord {
  data: unknown;
  timestamp: number;
  version: number;
}

/**
 * Validates that a value has the expected ServiceStateRecord shape.
 */
function isValidServiceStateRecord(value: unknown): value is ServiceStateRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    'data' in obj &&
    typeof obj.timestamp === 'number' &&
    typeof obj.version === 'number'
  );
}

/**
 * Gets persisted state for a service.
 * Returns null if no state exists, data is invalid, or version mismatch.
 */
export async function getServiceState(
  serviceName: string,
  expectedVersion: number
): Promise<unknown | null> {
  if (!chrome?.storage?.session) {
    return null;
  }

  try {
    const stateKey = `${serviceName}_state`;
    const result = await chrome.storage.session.get(stateKey);

    if (!result[stateKey]) {
      return null;
    }

    const value = result[stateKey];

    // Validate shape before using
    if (!isValidServiceStateRecord(value)) {
      console.warn(`Invalid service state shape for ${serviceName}`);
      return null;
    }

    // Check version compatibility
    if (value.version !== expectedVersion) {
      console.warn(
        `State version mismatch for ${serviceName}. Expected ${expectedVersion}, got ${value.version}`
      );
      return null;
    }

    return value.data;
  } catch (err) {
    console.error(`Failed to get state for ${serviceName}:`, err);
    return null;
  }
}

/**
 * Persists state for a service.
 */
export async function setServiceState(
  serviceName: string,
  data: unknown,
  version: number
): Promise<void> {
  if (!chrome?.storage?.session) {
    throw new Error('Session storage API unavailable');
  }

  try {
    const stateKey = `${serviceName}_state`;
    const record: ServiceStateRecord = {
      data,
      timestamp: Date.now(),
      version,
    };

    await chrome.storage.session.set({ [stateKey]: record });
  } catch (err) {
    console.error(`Failed to save state for ${serviceName}:`, err);
    throw new Error('Failed to save service state');
  }
}

/**
 * Performs a keep-alive ping for a service.
 * This prevents service worker termination by accessing storage.
 */
export async function serviceKeepAlive(serviceName: string): Promise<void> {
  if (!chrome?.storage?.local) {
    return;
  }

  try {
    await chrome.storage.local.get(`${serviceName}-keepalive`);
  } catch (err) {
    // Keep-alive failures are non-critical, just log
    console.warn(`Keep-alive ping failed for ${serviceName}:`, err);
  }
}
