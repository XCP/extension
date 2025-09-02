import { useState, useRef, useCallback, useEffect } from 'react';
import { isValidBitcoinAddress, lookupAssetOwner, shouldTriggerAssetLookup } from '@/utils/validation';

interface AssetLookupState {
  isLookingUp: boolean;
  result: string | null;
  error: string | null;
}

interface UseAssetOwnerLookupOptions {
  /** Debounce delay in milliseconds for asset lookups. Defaults to 800ms */
  debounceMs?: number;
  /** Callback fired when an asset is successfully resolved to an owner address */
  onResolve?: (assetName: string, ownerAddress: string) => void;
}

/**
 * Hook for managing single asset owner lookups with debouncing and request cancellation
 * 
 * Features:
 * - Debounced API calls to prevent excessive requests
 * - Request cancellation using AbortController
 * - Automatic cleanup on unmount or value changes
 * - Stable callback references to prevent unnecessary re-renders
 * 
 * @param options Configuration options for the hook
 * @returns Object containing lookup state and control functions
 * 
 * @example
 * ```tsx
 * const { isLookingUp, result, error, performLookup } = useAssetOwnerLookup({
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
  
  const [lookupState, setLookupState] = useState<AssetLookupState>({
    isLookingUp: false,
    result: null,
    error: null
  });
  
  const debounceTimeout = useRef<NodeJS.Timeout | undefined>(undefined);
  const abortController = useRef<AbortController | null>(null);

  // Cleanup function - stable reference
  const cleanup = useCallback(() => {
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
      debounceTimeout.current = undefined;
    }
    if (abortController.current) {
      abortController.current.abort();
      abortController.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const performLookup = useCallback(async (assetName: string) => {
    // Clear any existing timeout and abort ongoing request
    cleanup();
    setLookupState({ isLookingUp: false, result: null, error: null });

    // Skip lookup for invalid inputs or Bitcoin addresses
    if (!assetName || isValidBitcoinAddress(assetName)) {
      return;
    }

    if (!shouldTriggerAssetLookup(assetName)) {
      return;
    }

    // Set up debounced lookup
    debounceTimeout.current = setTimeout(async () => {
      setLookupState(prev => ({ ...prev, isLookingUp: true }));
      
      // Create new abort controller for this request
      abortController.current = new AbortController();
      const currentController = abortController.current;
      
      try {
        const result = await lookupAssetOwner(assetName);
        
        // Check if request was cancelled
        if (currentController.signal.aborted) {
          return;
        }
        
        if (result.isValid && result.ownerAddress) {
          setLookupState({
            isLookingUp: false,
            result: result.ownerAddress,
            error: null
          });
          // Call the callback to update the input value
          onResolve?.(assetName, result.ownerAddress);
        } else {
          setLookupState({
            isLookingUp: false,
            result: null,
            error: result.error || 'Asset not found'
          });
        }
      } catch (error) {
        // Don't update state if request was cancelled
        if (currentController.signal.aborted) {
          return;
        }
        
        setLookupState({
          isLookingUp: false,
          result: null,
          error: 'Failed to lookup asset owner'
        });
      } finally {
        // Clear the controller reference
        if (abortController.current === currentController) {
          abortController.current = null;
        }
      }
    }, debounceMs);
  }, [debounceMs, onResolve, cleanup]);

  const clearLookup = useCallback(() => {
    cleanup();
    setLookupState({ isLookingUp: false, result: null, error: null });
  }, [cleanup]);

  return {
    ...lookupState,
    performLookup,
    clearLookup
  };
}