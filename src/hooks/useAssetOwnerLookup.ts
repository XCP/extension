import { useState, useRef, useCallback } from 'react';
import { isValidBitcoinAddress, lookupAssetOwner, shouldTriggerAssetLookup } from '@/utils/validation';

interface AssetLookupState {
  isLookingUp: boolean;
  result: string | null;
  error: string | null;
}

/**
 * Hook for managing asset owner lookups with debouncing
 * Provides common functionality for both single and multiple destination inputs
 */
export function useAssetOwnerLookup() {
  const [lookupState, setLookupState] = useState<AssetLookupState>({
    isLookingUp: false,
    result: null,
    error: null
  });
  const debounceTimeout = useRef<NodeJS.Timeout | undefined>();

  const performLookup = useCallback(async (assetName: string, onResolve?: (address: string) => void) => {
    // Clear any existing timeout
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }

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
      
      try {
        const result = await lookupAssetOwner(assetName);
        
        if (result.isValid && result.ownerAddress) {
          setLookupState({
            isLookingUp: false,
            result: result.ownerAddress,
            error: null
          });
          // Call the callback to update the input value
          onResolve?.(result.ownerAddress);
        } else {
          setLookupState({
            isLookingUp: false,
            result: null,
            error: result.error || 'Asset not found'
          });
        }
      } catch (error) {
        setLookupState({
          isLookingUp: false,
          result: null,
          error: 'Failed to lookup asset owner'
        });
      }
    }, 800); // 800ms debounce
  }, []);

  const clearLookup = useCallback(() => {
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }
    setLookupState({ isLookingUp: false, result: null, error: null });
  }, []);

  // Cleanup timeout on unmount
  const cleanup = useCallback(() => {
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }
  }, []);

  return {
    lookupState,
    performLookup,
    clearLookup,
    cleanup
  };
}