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
 * Update state item - persisted in local storage.
 */
const updateStateItem = storage.defineItem<UpdateState | null>('local:updateServiceState', {
  fallback: null,
});

/**
 * Gets the update state from local storage.
 * Returns null if no state exists.
 */
export async function getUpdateState(): Promise<UpdateState | null> {
  try {
    return await updateStateItem.getValue();
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
