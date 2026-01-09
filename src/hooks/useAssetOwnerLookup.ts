import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { isValidBitcoinAddress } from '@/utils/validation/bitcoin';
import { lookupAssetOwner, shouldTriggerAssetLookup } from '@/utils/validation/assetOwner';

// =============================================================================
// Types
// =============================================================================

interface MultiLookupState {
  [destinationId: number]: {
    isLookingUp: boolean;
    error?: string;
  };
}

interface UseMultiAssetOwnerLookupOptions {
  /** Debounce delay in milliseconds for asset lookups. Defaults to 800ms */
  debounceMs?: number;
  /** Callback fired when an asset is successfully resolved for a destination */
  onResolve?: (destinationId: number, assetName: string, ownerAddress: string) => void;
}

interface UseAssetOwnerLookupOptions {
  /** Debounce delay in milliseconds for asset lookups. Defaults to 800ms */
  debounceMs?: number;
  /** Callback fired when an asset is successfully resolved to an owner address */
  onResolve?: (assetName: string, ownerAddress: string) => void;
}

// =============================================================================
// useMultiAssetOwnerLookup - Core implementation for multiple lookups
// =============================================================================

/**
 * Hook for managing multiple asset owner lookups with individual debouncing per destination
 *
 * Features:
 * - Independent debouncing per destination ID
 * - Request cancellation using AbortController per destination
 * - Efficient state management for multiple concurrent lookups
 * - Automatic cleanup of completed or cancelled requests
 *
 * @example
 * ```tsx
 * const { performLookup, getLookupState } = useMultiAssetOwnerLookup({
 *   onResolve: (destinationId, assetName, ownerAddress) => {
 *     updateDestination(destinationId, ownerAddress);
 *   }
 * });
 *
 * const lookupState = getLookupState(destination.id);
 * performLookup(destination.id, inputValue);
 * ```
 */
export function useMultiAssetOwnerLookup(options: UseMultiAssetOwnerLookupOptions = {}) {
  const { debounceMs = 800, onResolve } = options;

  const [lookupStates, setLookupStates] = useState<MultiLookupState>({});
  const debounceTimeouts = useRef<{ [id: number]: NodeJS.Timeout }>({});
  const abortControllers = useRef<{ [id: number]: AbortController }>({});

  const cleanupDestination = useCallback((destinationId: number) => {
    if (debounceTimeouts.current[destinationId]) {
      clearTimeout(debounceTimeouts.current[destinationId]);
      delete debounceTimeouts.current[destinationId];
    }
    if (abortControllers.current[destinationId]) {
      abortControllers.current[destinationId].abort();
      delete abortControllers.current[destinationId];
    }
  }, []);

  const cleanupAll = useCallback(() => {
    Object.keys(debounceTimeouts.current).forEach((id) => {
      clearTimeout(debounceTimeouts.current[parseInt(id)]);
    });
    Object.values(abortControllers.current).forEach((controller) => {
      controller.abort();
    });
    debounceTimeouts.current = {};
    abortControllers.current = {};
  }, []);

  useEffect(() => {
    return cleanupAll;
  }, []);

  const performLookup = useCallback(
    async (destinationId: number, assetName: string) => {
      cleanupDestination(destinationId);

      setLookupStates((prev) => ({
        ...prev,
        [destinationId]: { isLookingUp: false, error: undefined },
      }));

      if (!assetName || isValidBitcoinAddress(assetName)) {
        return;
      }

      if (!shouldTriggerAssetLookup(assetName)) {
        return;
      }

      debounceTimeouts.current[destinationId] = setTimeout(async () => {
        setLookupStates((prev) => ({
          ...prev,
          [destinationId]: { isLookingUp: true, error: undefined },
        }));

        const controller = new AbortController();
        abortControllers.current[destinationId] = controller;

        try {
          const result = await lookupAssetOwner(assetName);

          if (controller.signal.aborted) return;

          if (result.isValid && result.ownerAddress) {
            setLookupStates((prev) => ({
              ...prev,
              [destinationId]: { isLookingUp: false, error: undefined },
            }));
            onResolve?.(destinationId, assetName, result.ownerAddress);
          } else {
            setLookupStates((prev) => ({
              ...prev,
              [destinationId]: { isLookingUp: false, error: result.error || 'Asset not found' },
            }));
          }
        } catch {
          if (controller.signal.aborted) return;

          setLookupStates((prev) => ({
            ...prev,
            [destinationId]: { isLookingUp: false, error: 'Failed to lookup asset owner' },
          }));
        } finally {
          if (abortControllers.current[destinationId] === controller) {
            delete abortControllers.current[destinationId];
          }
        }
      }, debounceMs);
    },
    [debounceMs, onResolve]
  );

  const clearLookup = useCallback((destinationId: number) => {
    cleanupDestination(destinationId);
    setLookupStates((prev) => {
      const newState = { ...prev };
      delete newState[destinationId];
      return newState;
    });
  }, []);

  const getLookupState = useCallback(
    (destinationId: number) => {
      return lookupStates[destinationId] || { isLookingUp: false, error: undefined };
    },
    [lookupStates]
  );

  return {
    performLookup,
    clearLookup,
    getLookupState,
    lookupStates,
  };
}

// =============================================================================
// useAssetOwnerLookup - Simplified single-lookup wrapper
// =============================================================================

/**
 * Hook for managing single asset owner lookups with debouncing and request cancellation.
 * This is a thin wrapper around useMultiAssetOwnerLookup for single-destination use cases.
 *
 * @example
 * ```tsx
 * const { isLookingUp, error, performLookup } = useAssetOwnerLookup({
 *   onResolve: (assetName, ownerAddress) => {
 *     setValue(ownerAddress);
 *   }
 * });
 *
 * useEffect(() => {
 *   performLookup(inputValue);
 * }, [inputValue, performLookup]);
 * ```
 */
export function useAssetOwnerLookup(options: UseAssetOwnerLookupOptions = {}) {
  const { debounceMs = 800, onResolve } = options;
  const SINGLE_ID = 0;

  const handleResolve = useCallback(
    (_destinationId: number, assetName: string, ownerAddress: string) => {
      onResolve?.(assetName, ownerAddress);
    },
    [onResolve]
  );

  const { performLookup: multiPerformLookup, clearLookup: multiClearLookup, getLookupState } = useMultiAssetOwnerLookup({
    debounceMs,
    onResolve: handleResolve,
  });

  const lookupState = getLookupState(SINGLE_ID);

  const performLookup = useCallback(
    (assetName: string) => {
      multiPerformLookup(SINGLE_ID, assetName);
    },
    [multiPerformLookup]
  );

  const clearLookup = useCallback(() => {
    multiClearLookup(SINGLE_ID);
  }, [multiClearLookup]);

  return useMemo(
    () => ({
      isLookingUp: lookupState.isLookingUp,
      result: null,
      error: lookupState.error ?? null,
      performLookup,
      clearLookup,
    }),
    [lookupState.isLookingUp, lookupState.error, performLookup, clearLookup]
  );
}
