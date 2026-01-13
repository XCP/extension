/**
 * Storage for extension update state.
 *
 * Tracks update availability and reload scheduling for the update service.
 * Stored in local storage (persists across browser restarts).
 *
 * Uses wxt storage for consistency with other storage modules.
 */

import { storage } from '#imports';

export interface UpdateState {
  updateAvailable: boolean;
  currentVersion: string;
  pendingVersion?: string;
  lastCheckTime: number;
  reloadScheduled: boolean;
}

/**
 * Type guard to validate UpdateState shape on read.
 * Returns true if the value has the expected shape.
 */
function isValidUpdateState(value: unknown): value is UpdateState {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.updateAvailable === 'boolean' &&
    typeof obj.currentVersion === 'string' &&
    typeof obj.lastCheckTime === 'number' &&
    typeof obj.reloadScheduled === 'boolean'
  );
}

/**
 * Update state item - persisted in local storage.
 */
const updateStateItem = storage.defineItem<UpdateState | null>('local:updateServiceState', {
  fallback: null,
});

/**
 * Gets the update state from local storage.
 * Validates shape before returning to prevent corrupted data issues.
 * Returns null if no state exists or data is invalid.
 */
export async function getUpdateState(): Promise<UpdateState | null> {
  try {
    const value = await updateStateItem.getValue();
    if (value === null) {
      return null;
    }
    if (!isValidUpdateState(value)) {
      console.warn('Invalid update state shape in storage');
      return null;
    }
    return value;
  } catch (err) {
    console.error('Failed to get update state:', err);
    return null;
  }
}

/**
 * Saves the update state to local storage.
 */
export async function setUpdateState(state: UpdateState): Promise<void> {
  try {
    await updateStateItem.setValue(state);
  } catch (err) {
    console.error('Failed to save update state:', err);
    throw new Error('Failed to save update state');
  }
}

/**
 * Clears the update state from local storage.
 */
export async function clearUpdateState(): Promise<void> {
  try {
    await updateStateItem.removeValue();
  } catch (err) {
    console.error('Failed to clear update state:', err);
    // Note: Clearing update state is non-critical, don't throw
  }
}
