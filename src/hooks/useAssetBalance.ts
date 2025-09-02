import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useWallet } from "@/contexts/wallet-context";
import { useHeader } from "@/contexts/header-context";
import { fetchBTCBalance } from "@/utils/blockchain/bitcoin";
import { fetchAssetDetailsAndBalance } from "@/utils/blockchain/counterparty";

interface BalanceState {
  isLoading: boolean;
  error: Error | null;
  balance: string | null;
  isDivisible: boolean;
}

/**
 * Fetches and caches asset balance for the active address.
 * Integrates with HeaderContext for balance caching across the app.
 * 
 * @param asset - The asset symbol (e.g., 'BTC', 'XCP')
 * @returns Object containing balance, loading state, error, and divisibility flag
 * 
 * @example
 * const { balance, isLoading, error, isDivisible } = useAssetBalance('XCP');
 */
export function useAssetBalance(asset: string) {
  const { activeAddress, activeWallet } = useWallet();
  const { subheadings, setBalanceHeader } = useHeader();
  
  // Memoize BTC asset info to prevent recreation
  const BTC_ASSET_INFO = useMemo(() => ({
    asset: 'BTC',
    asset_longname: null,
    description: 'Bitcoin',
    divisible: true,
    locked: true,
    supply: '21000000',
    supply_normalized: '21000000',
    issuer: '',
  }), []);
  
  // Check cache for initial data
  const cachedBalance = subheadings.balances[asset];
  
  // Initialize state with cached data if available
  const [state, setState] = useState<BalanceState>(() => ({
    isLoading: !cachedBalance?.quantity_normalized,
    error: null,
    balance: cachedBalance?.quantity_normalized || null,
    isDivisible: cachedBalance?.asset_info?.divisible ?? true,
  }));

  const abortControllerRef = useRef<AbortController | null>(null);
  const prevWalletRef = useRef<string | undefined>(undefined);
  const prevAddressRef = useRef<string | undefined>(undefined);
  const prevAssetRef = useRef<string | undefined>(undefined);

  // Memoize the fetch decision logic
  const shouldFetchBalance = useCallback(() => {
    // Don't fetch if no asset or address
    if (!asset || asset.trim() === '' || !activeAddress?.address) {
      return false;
    }

    // Check if key parameters changed
    const walletChanged = prevWalletRef.current !== undefined && 
                         prevWalletRef.current !== activeWallet?.id;
    const addressChanged = prevAddressRef.current !== undefined && 
                          prevAddressRef.current !== activeAddress?.address;
    const assetChanged = prevAssetRef.current !== undefined && 
                        prevAssetRef.current !== asset;
    
    // Fetch if wallet, address, or asset changed
    if (walletChanged || addressChanged || assetChanged) {
      return true;
    }
    
    // Fetch if no cached data
    if (!cachedBalance?.quantity_normalized) {
      return true;
    }
    
    return false;
  }, [asset, activeAddress?.address, activeWallet?.id, cachedBalance?.quantity_normalized]);

  useEffect(() => {
    // Early return if no asset or address
    if (!asset || asset.trim() === '' || !activeAddress?.address) {
      // Only update state if it's different to prevent unnecessary re-renders
      setState(prev => {
        if (prev.balance !== null || prev.isLoading || prev.error) {
          return {
            isLoading: false,
            error: null,
            balance: null,
            isDivisible: true,
          };
        }
        return prev;
      });
      return;
    }

    // Update refs for next comparison
    const prevWallet = prevWalletRef.current;
    const prevAddress = prevAddressRef.current;
    const prevAsset = prevAssetRef.current;
    
    prevWalletRef.current = activeWallet?.id;
    prevAddressRef.current = activeAddress?.address;
    prevAssetRef.current = asset;

    // Determine if we should fetch
    const needsFetch = shouldFetchBalance();
    
    // If we have cached data and don't need to fetch, use it
    if (!needsFetch && cachedBalance?.quantity_normalized) {
      setState(prev => {
        // Only update if state is different
        if (prev.balance !== cachedBalance.quantity_normalized ||
            prev.isDivisible !== (cachedBalance.asset_info?.divisible ?? true) ||
            prev.isLoading || prev.error) {
          return {
            isLoading: false,
            error: null,
            balance: cachedBalance.quantity_normalized || null,
            isDivisible: cachedBalance.asset_info?.divisible ?? true,
          };
        }
        return prev;
      });
      return;
    }

    // If we don't need to fetch and have no cached data, something is off
    if (!needsFetch) {
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    abortControllerRef.current = new AbortController();
    const currentAbortController = abortControllerRef.current;

    async function fetchBalance() {
      // Single state update for loading
      setState(prev => ({
        ...prev,
        isLoading: true,
        error: null,
      }));

      try {
        let balance: string;
        let isDivisible = true;
        let assetInfo = null;

        if (asset === 'BTC') {
          const balanceSats = await fetchBTCBalance(activeAddress!.address);
          balance = (balanceSats / 1e8).toString();
          assetInfo = BTC_ASSET_INFO;
          isDivisible = true;
        } else {
          const result = await fetchAssetDetailsAndBalance(asset, activeAddress!.address);
          balance = result.availableBalance;
          isDivisible = result.isDivisible;
          assetInfo = result.assetInfo;
        }

        // Check if request was aborted
        if (currentAbortController.signal.aborted) {
          return;
        }

        // Update cache in HeaderContext
        setBalanceHeader(asset, {
          asset,
          quantity_normalized: balance,
          asset_info: assetInfo || undefined,
        });

        // Single state update for success
        setState({
          isLoading: false,
          error: null,
          balance,
          isDivisible,
        });
      } catch (err) {
        if (!currentAbortController.signal.aborted) {
          // Single state update for error
          setState({
            isLoading: false,
            error: err instanceof Error ? err : new Error(String(err)),
            balance: null,
            isDivisible: true,
          });
        }
      }
    }

    fetchBalance();

    // Cleanup
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [
    asset,
    activeAddress?.address,
    activeWallet?.id,
    shouldFetchBalance,
    setBalanceHeader,
    BTC_ASSET_INFO,
  ]);

  return state;
}