import { useState, useRef, useCallback, useEffect } from 'react';
import { isValidBitcoinAddress } from '@/utils/validation/bitcoin';
import { lookupAssetOwner, shouldTriggerAssetLookup } from '@/utils/validation/assetOwner';

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

/**
 * Hook for managing multiple asset owner lookups with individual debouncing per destination
 * 
 * Features:
 * - Independent debouncing per destination ID
 * - Request cancellation using AbortController per destination
 * - Efficient state management for multiple concurrent lookups
 * - Automatic cleanup of completed or cancelled requests
 * - Optimized for DestinationsInput component usage
 * 
 * @param options Configuration options for the hook
 * @returns Object containing lookup control functions and state accessors
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

  // Cleanup function for a specific destination - stable reference
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

  // Cleanup all destinations
  const cleanupAll = useCallback(() => {
    Object.keys(debounceTimeouts.current).forEach(id => {
      clearTimeout(debounceTimeouts.current[parseInt(id)]);
    });
    Object.values(abortControllers.current).forEach(controller => {
      controller.abort();
    });
    debounceTimeouts.current = {};
    abortControllers.current = {};
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return cleanupAll;
  }, []);

  const performLookup = useCallback(async (destinationId: number, assetName: string) => {
    // Clear any existing timeout and abort ongoing request for this destination
    cleanupDestination(destinationId);
    
    // Clear lookup state for this destination
    setLookupStates(prev => ({
      ...prev,
      [destinationId]: { isLookingUp: false, error: undefined }
    }));

    // Skip lookup for invalid inputs or Bitcoin addresses
    if (!assetName || isValidBitcoinAddress(assetName)) {
      return;
    }

    if (!shouldTriggerAssetLookup(assetName)) {
      return;
    }

    // Set up debounced lookup
    debounceTimeouts.current[destinationId] = setTimeout(async () => {
      setLookupStates(prev => ({
        ...prev,
        [destinationId]: { isLookingUp: true, error: undefined }
      }));
      
      // Create new abort controller for this request
      const controller = new AbortController();
      abortControllers.current[destinationId] = controller;
      
      try {
        const result = await lookupAssetOwner(assetName);
        
        // Check if request was cancelled
        if (controller.signal.aborted) {
          return;
        }
        
        if (result.isValid && result.ownerAddress) {
          setLookupStates(prev => ({
            ...prev,
            [destinationId]: { isLookingUp: false, error: undefined }
          }));
          // Call the callback to update the destination
          onResolve?.(destinationId, assetName, result.ownerAddress);
        } else {
          setLookupStates(prev => ({
            ...prev,
            [destinationId]: { isLookingUp: false, error: result.error || 'Asset not found' }
          }));
        }
      } catch (error) {
        // Don't update state if request was cancelled
        if (controller.signal.aborted) {
          return;
        }
        
        setLookupStates(prev => ({
          ...prev,
          [destinationId]: { isLookingUp: false, error: 'Failed to lookup asset owner' }
        }));
      } finally {
        // Clear the controller reference
        if (abortControllers.current[destinationId] === controller) {
          delete abortControllers.current[destinationId];
        }
      }
    }, debounceMs);
  }, [debounceMs, onResolve]);

  const clearLookup = useCallback((destinationId: number) => {
    cleanupDestination(destinationId);
    setLookupStates(prev => {
      const newState = { ...prev };
      delete newState[destinationId];
      return newState;
    });
  }, []);

  const getLookupState = useCallback((destinationId: number) => {
    return lookupStates[destinationId] || { isLookingUp: false, error: undefined };
  }, [lookupStates]);

  return {
    performLookup,
    clearLookup,
    getLookupState,
    lookupStates
  };
}