/**
 * Storage for extension update state.
 *
 * Tracks update availability and reload scheduling for the update service.
 * Stored in local storage (persists across browser restarts).
 */

const UPDATE_STATE_KEY = 'update_service_state';

export interface UpdateState {
  updateAvailable: boolean;
  currentVersion: string;
  pendingVersion?: string;
  lastCheckTime: number;
  reloadScheduled: boolean;
}

/**
 * Gets the update state from local storage.
 * Returns null if no state exists.
 */
export async function getUpdateState(): Promise<UpdateState | null> {
  if (!chrome?.storage?.local) {
    return null;
  }

  try {
    const result = await chrome.storage.local.get(UPDATE_STATE_KEY);
    return (result[UPDATE_STATE_KEY] as UpdateState) ?? null;
  } catch (err) {
    console.error('Failed to get update state:', err);
    return null;
  }
}

/**
 * Saves the update state to local storage.
 */
export async function setUpdateState(state: UpdateState): Promise<void> {
  if (!chrome?.storage?.local) {
    return;
  }

  try {
    await chrome.storage.local.set({ [UPDATE_STATE_KEY]: state });
  } catch (err) {
    console.error('Failed to save update state:', err);
    throw new Error('Failed to save update state');
  }
}

/**
 * Clears the update state from local storage.
 */
export async function clearUpdateState(): Promise<void> {
  if (!chrome?.storage?.local) {
    return;
  }

  try {
    await chrome.storage.local.remove(UPDATE_STATE_KEY);
  } catch (err) {
    console.error('Failed to clear update state:', err);
  }
}
