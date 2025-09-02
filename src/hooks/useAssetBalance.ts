import { useState, useEffect, useRef } from "react";
import { useWallet } from "@/contexts/wallet-context";
import { useHeader } from "@/contexts/header-context";
import { fetchBTCBalance } from "@/utils/blockchain/bitcoin";
import { fetchAssetDetailsAndBalance } from "@/utils/blockchain/counterparty";

/**
 * Fetches and caches asset balance for the active address.
 * Integrates with HeaderContext for balance caching across the app.
 */
export function useAssetBalance(asset: string) {
  const { activeAddress, activeWallet } = useWallet();
  const { subheadings, setBalanceHeader } = useHeader();
  
  // Check cache for initial data
  const cachedBalance = subheadings.balances[asset];
  const initialBalance = cachedBalance?.quantity_normalized || null;
  
  const [state, setState] = useState<{
    isLoading: boolean;
    error: Error | null;
    balance: string | null;
    isDivisible: boolean;
  }>({
    isLoading: !initialBalance,
    error: null,
    balance: initialBalance,
    isDivisible: cachedBalance?.asset_info?.divisible ?? true,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const prevWalletRef = useRef<string | undefined>(undefined);
  const prevAddressRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    // Early return if no asset or address
    if (!asset || asset.trim() === '' || !activeAddress?.address) {
      setState({
        isLoading: false,
        error: null,
        balance: null,
        isDivisible: true,
      });
      return;
    }

    // Check if wallet or address changed
    const walletChanged = prevWalletRef.current !== undefined && 
                         prevWalletRef.current !== activeWallet?.id;
    const addressChanged = prevAddressRef.current !== undefined && 
                          prevAddressRef.current !== activeAddress?.address;
    
    // Update refs
    prevWalletRef.current = activeWallet?.id;
    prevAddressRef.current = activeAddress?.address;

    // Skip fetch if we have cached data and wallet/address haven't changed
    if (cachedBalance?.quantity_normalized && !walletChanged && !addressChanged) {
      setState({
        isLoading: false,
        error: null,
        balance: cachedBalance.quantity_normalized,
        isDivisible: cachedBalance.asset_info?.divisible ?? true,
      });
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
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      try {
        let balance: string;
        let isDivisible = true;
        let assetInfo = null;

        if (asset === 'BTC') {
          const balanceSats = await fetchBTCBalance(activeAddress!.address);
          balance = (balanceSats / 1e8).toString();
          assetInfo = {
            asset: 'BTC',
            asset_longname: null,
            description: 'Bitcoin',
            divisible: true,
            locked: true,
            supply: '21000000',
            supply_normalized: '21000000',
            issuer: '',
          };
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

        setState({
          isLoading: false,
          error: null,
          balance,
          isDivisible,
        });
      } catch (err) {
        if (!currentAbortController.signal.aborted) {
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
    cachedBalance?.quantity_normalized,
    setBalanceHeader,
  ]);

  return state;
}