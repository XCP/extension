"use client";

import axios from "axios";
import React, {
  createContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactElement,
  type ReactNode,
} from "react";
import { useWallet } from "@/contexts/wallet-context";
import type { ApiResponse, AssetInfo } from "@/utils/blockchain/counterparty";
import { fetchAssetDetails } from "@/utils/blockchain/counterparty/api";
import { toSatoshis } from "@/utils/numeric";

/**
 * Composer state shape with error handling.
 */
interface ComposerState<T> {
  step: "form" | "review" | "success";
  formData: T | null;
  apiResponse: ApiResponse | null;
  error: string | null; // Add error to state
}

/**
 * Context type for composer functionality.
 */
interface ComposerContextType<T> {
  state: ComposerState<T>;
  compose: (
    formData: FormData,
    composeTransaction: (data: any) => Promise<ApiResponse>,
    sourceAddress?: string,
    loadingId?: string,
    hideLoadingFn?: (id: string) => void,
    composeType?: string
  ) => void;
  sign: (apiResponse: ApiResponse, signFn: () => Promise<void>) => void;
  reset: () => void;
  revertToForm: () => void;
  clearError: () => void;
  setError: (error: string) => void;
  isPending: boolean;
}

/**
 * Props for ComposerProvider.
 */
interface ComposerProviderProps<T> {
  children: ReactNode;
  initialFormData?: T | null;
}

/**
 * Extended API response with optional broadcast data.
 */
interface ExtendedApiResponse extends ApiResponse {
  broadcast?: { txid: string; fees?: number };
}

/**
 * Configuration for normalizing form fields based on compose type
 */
const NORMALIZATION_CONFIG: Record<string, {
  quantityFields: string[];
  assetFields: Record<string, string>; // Maps quantity field to its corresponding asset field
}> = {
  send: {
    quantityFields: ['quantity'],
    assetFields: { quantity: 'asset' }
  },
  order: {
    quantityFields: ['give_quantity', 'get_quantity'],
    assetFields: { 
      give_quantity: 'give_asset',
      get_quantity: 'get_asset'
    }
  },
  issuance: {
    quantityFields: ['quantity'],
    assetFields: { quantity: 'asset' }
  },
  destroy: {
    quantityFields: ['quantity'],
    assetFields: { quantity: 'asset' }
  },
  dispenser: {
    quantityFields: ['give_quantity', 'escrow_quantity', 'mainchainrate'],
    assetFields: { 
      give_quantity: 'asset',
      escrow_quantity: 'asset',
      mainchainrate: 'BTC'  // mainchainrate is always in BTC (satoshis)
    }
  },
  dispense: {
    quantityFields: ['quantity'],
    assetFields: { quantity: 'asset' }  // Note: asset is derived from dispenser
  },
  dividend: {
    quantityFields: ['quantity_per_unit'],
    assetFields: { quantity_per_unit: 'dividend_asset' }
  },
  burn: {
    quantityFields: ['quantity'],
    assetFields: { quantity: 'asset' }  // BTC is always divisible
  },
  bet: {
    quantityFields: ['wager_quantity', 'counterwager_quantity'],
    assetFields: { 
      wager_quantity: 'asset',  // XCP is always divisible
      counterwager_quantity: 'asset'
    }
  },
  fairminter: {
    quantityFields: ['premint_quantity'],
    assetFields: { premint_quantity: 'asset' }
  },
  fairmint: {
    quantityFields: ['quantity'],
    assetFields: { quantity: 'asset' }
  },
  attach: {
    quantityFields: ['quantity'],
    assetFields: { quantity: 'asset' }
  },
  // Add more compose types as needed
};

/**
 * Normalizes form data by converting user-friendly values to API values
 */
async function normalizeFormData(
  formData: FormData,
  composeType: string
): Promise<{ normalizedData: any; assetInfoCache: Map<string, AssetInfo> }> {
  const config = NORMALIZATION_CONFIG[composeType];
  const assetInfoCache = new Map<string, AssetInfo>();
  const normalizedData: any = {};
  
  // Copy all form data to normalized data
  for (const [key, value] of formData.entries()) {
    normalizedData[key] = value;
  }
  
  if (!config) {
    // No normalization needed for this compose type
    return { normalizedData, assetInfoCache };
  }
  
  // Fetch asset info for all relevant assets
  const assetsToFetch = new Set<string>();
  for (const [quantityField, assetField] of Object.entries(config.assetFields)) {
    const asset = formData.get(assetField) as string;
    if (asset && asset !== 'BTC') {  // BTC is always divisible
      assetsToFetch.add(asset);
    }
  }
  
  // Fetch all asset info in parallel
  const assetPromises = Array.from(assetsToFetch).map(async (asset) => {
    const info = await fetchAssetDetails(asset);
    if (info) {
      assetInfoCache.set(asset, info);
    }
    return { asset, info };
  });
  await Promise.all(assetPromises);
  
  // Normalize quantity fields based on asset divisibility
  for (const quantityField of config.quantityFields) {
    const value = formData.get(quantityField);
    if (value === null || value === undefined || value === '') continue;
    
    const assetField = config.assetFields[quantityField];
    // Handle special case where assetField is a hardcoded asset like 'BTC'
    const asset = (assetField === 'BTC' || assetField === 'XCP') 
      ? assetField 
      : formData.get(assetField) as string;
    
    if (!asset) continue;
    
    // Check if asset is divisible
    let isDivisible = false;
    if (asset === 'BTC' || asset === 'XCP') {
      isDivisible = true;  // BTC and XCP are always divisible
    } else {
      const assetInfo = assetInfoCache.get(asset);
      isDivisible = assetInfo?.divisible ?? false;
    }
    
    // Convert to satoshis if divisible
    if (isDivisible) {
      normalizedData[quantityField] = toSatoshis(value.toString());
    } else {
      normalizedData[quantityField] = value.toString();
    }
  }
  
  return { normalizedData, assetInfoCache };
}

const ComposerContext = createContext<ComposerContextType<any> | undefined>(undefined);

export function useComposer<T>(): ComposerContextType<T> {
  const context = React.use(ComposerContext);
  if (!context) {
    throw new Error("useComposer must be used within a ComposerProvider");
  }
  return context as ComposerContextType<T>;
}

export function ComposerProvider<T>({
  children,
  initialFormData = null,
}: ComposerProviderProps<T>): ReactElement {
  const { activeAddress, activeWallet, authState, walletLocked } = useWallet();
  const previousAddressRef = useRef<string | undefined>(activeAddress?.address);
  const previousWalletRef = useRef<string | undefined>(activeWallet?.id);
  const previousAuthStateRef = useRef<string>(authState);
  
  const initialState: ComposerState<T> = {
    step: "form",
    formData: initialFormData,
    apiResponse: null,
    error: null, // Initialize error as null
  };

  const [state, setState] = useState(initialState);
  const [isPending, startTransition] = useTransition();
  const previousStepRef = useRef<"form" | "review" | "success" | null>(null);

  useEffect(() => {
    previousStepRef.current = state.step;
  }, [state.step]);

  // Reset composer state when address changes
  useEffect(() => {
    if (
      activeAddress?.address && 
      previousAddressRef.current && 
      activeAddress.address !== previousAddressRef.current
    ) {
      // Address changed - reset composer state to clean slate
      setState({
        step: "form",
        formData: null,
        apiResponse: null,
        error: null,
      });
    }
    previousAddressRef.current = activeAddress?.address;
  }, [activeAddress?.address]);

  // Reset composer state when wallet changes or lock/unlock occurs
  useEffect(() => {
    // Check if wallet changed
    const walletChanged = activeWallet?.id && 
                         previousWalletRef.current && 
                         activeWallet.id !== previousWalletRef.current;
    
    // Check if lock state changed (locked to unlocked or vice versa)
    const lockStateChanged = authState !== previousAuthStateRef.current && 
                            (authState === "LOCKED" || previousAuthStateRef.current === "LOCKED");
    
    if (walletChanged || lockStateChanged) {
      // Reset composer state on wallet change or lock/unlock
      setState({
        step: "form",
        formData: null,
        apiResponse: null,
        error: null,
      });
    }
    
    previousWalletRef.current = activeWallet?.id;
    previousAuthStateRef.current = authState;
  }, [activeWallet?.id, authState]);

  const compose = useCallback(
    (
      formData: FormData,
      composeTransaction: (data: any) => Promise<ApiResponse>,
      sourceAddress?: string,
      loadingId?: string,
      hideLoadingFn?: (id: string) => void,
      composeType?: string
    ) => {
      startTransition(async () => {
        let shouldHideLoading = true;
        try {
          if (!formData) throw new Error("No form data provided.");
          if (!composeTransaction) throw new Error("Compose transaction function not provided.");
          
          // Store original user data for form persistence
          const rawData = Object.fromEntries(formData);
          const userData = rawData as unknown as T;
          
          // Normalize data if compose type is provided
          let dataForApi = { ...userData, sourceAddress };
          if (composeType) {
            const { normalizedData } = await normalizeFormData(formData, composeType);
            dataForApi = { ...normalizedData, sourceAddress };
          }
          
          // Call compose function with normalized data
          const response = await composeTransaction(dataForApi);
          
          setState({
            step: "review",
            formData: userData, // Store original user data for form persistence
            apiResponse: response,
            error: null, // Clear error on success
          });
        } catch (err) {
          console.error("Compose error:", err);
          let errorMessage = "An error occurred while composing the transaction.";
          if (axios.isAxiosError(err) && err.response?.data?.error) {
            // Pass the API error message directly to the user
            errorMessage = err.response.data.error;
          } else if (err instanceof Error) {
            errorMessage = err.message;
          }
          const rawData = Object.fromEntries(formData);
          const data = rawData as unknown as T;
          setState({
            step: "form",
            formData: data,
            apiResponse: null,
            error: errorMessage, // Set error in state instead of throwing
          });
          // Always hide loading on error
          if (loadingId && hideLoadingFn) {
            hideLoadingFn(loadingId);
          }
          shouldHideLoading = false;
        } finally {
          if (loadingId && hideLoadingFn && shouldHideLoading) {
            hideLoadingFn(loadingId);
          }
        }
      });
    },
    []
  );

  const sign = useCallback(
    (apiResponse: ApiResponse, signFn: () => Promise<void>) => {
      // Don't use startTransition for sign to ensure immediate error display
      const executeSign = async () => {
        try {
          if (!apiResponse) throw new Error("No transaction composed.");
          if (!signFn) throw new Error("Sign function not provided.");
          await signFn();
          console.log("Sign success");
          setState({
            step: "success",
            formData: state.formData,
            apiResponse: apiResponse as ExtendedApiResponse,
            error: null,
          });
        } catch (err) {
          console.error("Sign error:", err);
          let errorMessage = "An error occurred while signing the transaction.";
          if (axios.isAxiosError(err) && err.response?.data?.error) {
            errorMessage = err.response.data.error.replace(/\[|\]|'/g, "");
          } else if (err instanceof Error) {
            errorMessage = err.message;
          }
          // Set error immediately without transition for immediate UI update
          setState((prev) => ({ ...prev, error: errorMessage }));
        }
      };
      
      executeSign();
    },
    [state.formData]
  );

  const reset = useCallback(() => {
    console.log("Resetting composer state");
    setState({ step: "form", formData: null, apiResponse: null, error: null });
  }, []);

  const revertToForm = useCallback(() => {
    setState((prev) => ({ ...prev, step: "form", apiResponse: null, error: null }));
  }, []);

  // Clear error when component unmounts or path changes
  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  // Set error directly (synchronously, without transitions)
  const setError = useCallback((error: string) => {
    setState((prev) => ({ ...prev, error }));
  }, []);

  useEffect(() => {
    if (
      state.step === "form" &&
      previousStepRef.current !== "review" &&
      previousStepRef.current !== null
    ) {
      setState((prev) => ({ ...prev, formData: null, error: null }));
    }
  }, [state.step]);

  const value = { state, compose, sign, reset, revertToForm, clearError, setError, isPending };

  return <ComposerContext value={value}>{children}</ComposerContext>;
}
