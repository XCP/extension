"use client";

import { useMemo } from "react";
import { isApiError } from "@/utils/apiClient";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { getComposeType, normalizeFormData } from "@/utils/blockchain/counterparty/normalize";
import type { ApiResponse } from "@/utils/blockchain/counterparty/compose";
import { checkReplayAttempt, recordTransaction, markTransactionBroadcasted } from "@/utils/security/replayPrevention";

/**
 * Composer state shape
 */
interface ComposerState<T> {
  step: "form" | "review" | "success";
  formData: T | null;
  apiResponse: ApiResponse | null;
  error: string | null;
  isComposing: boolean;
  isSigning: boolean;
  showAuthModal: boolean;
}

/**
 * Context type for composer functionality
 */
interface ComposerContextType<T> {
  // State
  state: ComposerState<T>;
  
  // Actions
  composeTransaction: (formData: FormData) => Promise<void>;
  signAndBroadcast: () => Promise<void>;
  goBack: () => void;
  reset: () => void;
  clearError: () => void;
  setShowAuthModal: (show: boolean) => void;
  
  // Help text management
  showHelpText: boolean;
  toggleHelpText: () => void;
  
  // Exposed wallet/settings
  activeAddress: ReturnType<typeof useWallet>["activeAddress"];
  activeWallet: ReturnType<typeof useWallet>["activeWallet"];
  settings: ReturnType<typeof useSettings>["settings"];
  
  // Special handler for auth modal
  handleUnlockAndSign: (password: string) => Promise<void>;
}

/**
 * Props for ComposerProvider
 */
interface ComposerProviderProps<T> {
  children: ReactNode;
  // Compose configuration
  composeType: string;
  composeApi: (data: any) => Promise<ApiResponse>;
  // UI configuration
  initialTitle: string;
  initialFormData?: T | null;
}

/**
 * Normalizes form data by converting user-friendly values to API values
 */

const ComposerContext = createContext<ComposerContextType<any> | undefined>(undefined);

export function useComposer<T>(): ComposerContextType<T> {
  const context = use(ComposerContext);
  if (!context) {
    throw new Error("useComposer must be used within a ComposerProvider");
  }
  return context as ComposerContextType<T>;
}

export function ComposerProvider<T>({
  children,
  composeType,
  composeApi,
  initialTitle,
  initialFormData = null,
}: ComposerProviderProps<T>): ReactElement {
  const navigate = useNavigate();
  const { activeAddress, activeWallet, authState, signTransaction, broadcastTransaction, unlockWallet, isWalletLocked } = useWallet();
  const { settings } = useSettings();

  const previousAddressRef = useRef<string | undefined>(activeAddress?.address);
  const previousWalletRef = useRef<string | undefined>(activeWallet?.id);
  const previousAuthStateRef = useRef<string>(authState);
  const currentComposeTypeRef = useRef<string>(composeType);

  // Initialize state
  const [state, setState] = useState<ComposerState<T>>({
    step: "form",
    formData: initialFormData,
    apiResponse: null,
    error: null,
    isComposing: false,
    isSigning: false,
    showAuthModal: false,
  });


  // Help text state (can be toggled locally)
  const [localShowHelpText, setLocalShowHelpText] = useState<boolean | null>(null);
  const showHelpText = localShowHelpText ?? settings?.showHelpText ?? false;
  
  // Toggle help text
  const toggleHelpText = useCallback(() => {
    setLocalShowHelpText(prev => prev === null ? !settings?.showHelpText : !prev);
  }, [settings?.showHelpText]);
  
  // Reset composer state when address changes
  useEffect(() => {
    if (
      activeAddress?.address && 
      previousAddressRef.current && 
      activeAddress.address !== previousAddressRef.current
    ) {
      setState({
        step: "form",
        formData: null,
        apiResponse: null,
        error: null,
        isComposing: false,
        isSigning: false,
        showAuthModal: false,
      });
    }
    previousAddressRef.current = activeAddress?.address;
  }, [activeAddress?.address]);
  
  // Reset composer state when wallet changes or lock/unlock occurs
  useEffect(() => {
    const walletChanged = activeWallet?.id && 
                         previousWalletRef.current && 
                         activeWallet.id !== previousWalletRef.current;
    
    const lockStateChanged = authState !== previousAuthStateRef.current && 
                            (authState === "LOCKED" || previousAuthStateRef.current === "LOCKED");
    
    if (walletChanged || lockStateChanged) {
      setState({
        step: "form",
        formData: null,
        apiResponse: null,
        error: null,
        isComposing: false,
        isSigning: false,
        showAuthModal: false,
      });
    }
    
    previousWalletRef.current = activeWallet?.id;
    previousAuthStateRef.current = authState;
  }, [activeWallet?.id, authState]);

  // Auto-compose for provider requests
  useEffect(() => {
    const autoCompose = async () => {
      // Only auto-compose if we have initial form data and we're on the form step
      if (!initialFormData || state.step !== 'form' || state.apiResponse) {
        return;
      }

      if (!activeAddress) {
        return;
      }

      // Set composing state
      setState(prev => ({ ...prev, isComposing: true, error: null }));

      try {
        // Provider data is already in API format (satoshis), pass directly to API
        const dataForApi = {
          ...initialFormData,
          sourceAddress: activeAddress.address
        };

        const result = await composeApi(dataForApi);

        // Skip to review step with the composed transaction
        setState({
          step: 'review',
          formData: initialFormData as T,
          apiResponse: result,
          error: null,
          isComposing: false,
          isSigning: false,
          showAuthModal: false
        });

      } catch (error) {
        console.error('Auto-compose failed:', error);
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Failed to compose transaction',
          isComposing: false
        }));
      }
    };

    autoCompose();
  }, [initialFormData, activeAddress, composeApi, state.step, state.apiResponse]);

  // Compose transaction
  const composeTransaction = useCallback(async (formData: FormData) => {
    if (!activeAddress) {
      setState(prev => ({ ...prev, error: "No active address available" }));
      return;
    }

    // Set isComposing to show local loading state
    setState(prev => ({ ...prev, isComposing: true, error: null }));

    // Execute async operation without awaiting to prevent unmount
    await (async () => {
    
    try {
      // Convert FormData to object
      const rawData = Object.fromEntries(formData);

      // Store original user data for form persistence
      const userData = rawData as unknown as T;

      // Normalize data based on compose type (skip for broadcast which doesn't need normalization)
      let dataForApi: any = { ...userData, sourceAddress: activeAddress.address };
      if (composeType !== 'broadcast') {
        const { normalizedData } = await normalizeFormData(formData, composeType);
        dataForApi = { ...normalizedData, sourceAddress: activeAddress.address };
      }

      // Call compose API
      const response = await composeApi(dataForApi);

      // Validate response structure
      if (!response || typeof response !== 'object') {
        throw new Error('Invalid API response: Response is not an object');
      }

      if (!response.result || typeof response.result !== 'object') {
        throw new Error('Invalid API response: Missing or invalid result field');
      }

      // Ensure we have the minimum required fields
      if (!response.result.rawtransaction) {
        throw new Error('Invalid API response: Missing rawtransaction');
      }

      // Update state to review step with API response
      setState(prev => ({
        ...prev,
        step: "review" as const,
        formData: userData,
        apiResponse: response,
        error: null,
        isComposing: false,
      }));
    } catch (err) {
      console.error("Compose error:", err);
      let errorMessage = "An error occurred while composing the transaction.";
      if (isApiError(err) && err.response?.data && typeof err.response.data === 'object' && 'error' in err.response.data) {
        errorMessage = (err.response.data as { error: string }).error;
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }
      
      setState(prev => ({
        ...prev,
        error: errorMessage,
        isComposing: false,
      }));
    }
    })(); // Execute the async IIFE
  }, [activeAddress, composeApi]);
  
  // Sign and broadcast transaction
  const signAndBroadcast = useCallback(async () => {
    if (!state.apiResponse || !activeAddress || !activeWallet) {
      setState(prev => ({ ...prev, error: "Invalid transaction data" }));
      return;
    }
    
    // Check if wallet is locked
    if (await isWalletLocked()) {
      setState(prev => ({ ...prev, showAuthModal: true }));
      return;
    }
    
    setState(prev => ({ ...prev, isSigning: true, error: null }));
    
    try {
      const rawTxHex = state.apiResponse.result.rawtransaction;

      // Check for replay attempt before signing
      const replayCheck = await checkReplayAttempt(
        window.location.origin, // Use current origin for internal transactions
        'broadcast_transaction',
        [rawTxHex],
        { address: activeAddress.address }
      );

      if (replayCheck.isReplay) {
        throw new Error(`Transaction replay detected: ${replayCheck.reason}`);
      }

      const signedTxHex = await signTransaction(rawTxHex, activeAddress.address);

      // Record transaction before broadcast to prevent double-broadcast
      // The actual txid comes from broadcast response, so we use a placeholder
      const placeholderTxid = `pending-${Date.now()}`;
      recordTransaction(
        placeholderTxid,
        window.location.origin,
        'broadcast_transaction',
        [rawTxHex],
        { status: 'pending' }
      );

      const broadcastResponse = await broadcastTransaction(signedTxHex);

      // Mark as successfully broadcasted
      if (broadcastResponse.txid) {
        markTransactionBroadcasted(broadcastResponse.txid);
      }

      // Add broadcast response to apiResponse
      const apiResponseWithBroadcast = {
        ...state.apiResponse,
        broadcast: broadcastResponse
      };

      setState(prev => ({
        ...prev,
        step: "success",
        apiResponse: apiResponseWithBroadcast,
        error: null,
        isSigning: false,
      }));
    } catch (err) {
      console.error("Sign/broadcast error:", err);
      let errorMessage = "Failed to sign and broadcast transaction";
      if (err instanceof Error) {
        errorMessage = err.message;
        
        // Special handling for wallet lock
        if (err.message.includes("Wallet is locked")) {
          setState(prev => ({ ...prev, showAuthModal: true }));
        }
      }
      
      setState(prev => ({
        ...prev,
        error: errorMessage,
        isSigning: false,
      }));
    }
  }, [state.apiResponse, activeAddress, activeWallet, isWalletLocked, signTransaction, broadcastTransaction]);
  
  // Handle unlock and sign (for auth modal)
  const handleUnlockAndSign = useCallback(async (password: string) => {
    if (!activeWallet || !state.apiResponse || !activeAddress) return;

    setState(prev => ({ ...prev, isSigning: true }));
    try {
      await unlockWallet(activeWallet.id, password);
      setState(prev => ({ ...prev, showAuthModal: false }));
      
      // Now sign and broadcast with replay prevention
      const rawTxHex = state.apiResponse.result.rawtransaction;

      // Check for replay attempt
      const replayCheck = await checkReplayAttempt(
        window.location.origin,
        'broadcast_transaction',
        [rawTxHex],
        { address: activeAddress.address }
      );

      if (replayCheck.isReplay) {
        throw new Error(`Transaction replay detected: ${replayCheck.reason}`);
      }

      const signedTxHex = await signTransaction(rawTxHex, activeAddress.address);

      // Record transaction before broadcast
      // The actual txid comes from broadcast response, so we use a placeholder
      const placeholderTxid = `pending-${Date.now()}`;
      recordTransaction(
        placeholderTxid,
        window.location.origin,
        'broadcast_transaction',
        [rawTxHex],
        { status: 'pending' }
      );

      const broadcastResponse = await broadcastTransaction(signedTxHex);

      // Mark as successfully broadcasted
      if (broadcastResponse.txid) {
        markTransactionBroadcasted(broadcastResponse.txid);
      }

      const apiResponseWithBroadcast = {
        ...state.apiResponse,
        broadcast: broadcastResponse
      };
      
      setState(prev => ({
        ...prev,
        step: "success",
        apiResponse: apiResponseWithBroadcast,
        error: null,
        isSigning: false,
      }));
    } catch (err) {
      console.error("Authorization error:", err);
      setState(prev => ({ ...prev, isSigning: false }));
      throw err; // Let the modal handle the error display
    }
  }, [activeWallet, activeAddress, state.apiResponse, unlockWallet, signTransaction, broadcastTransaction]);

  // Navigation actions
  const reset = useCallback(() => {
    setState({
      step: "form",
      formData: null,
      apiResponse: null,
      error: null,
      isComposing: false,
      isSigning: false,
      showAuthModal: false,
    });
    currentComposeTypeRef.current = composeType;
  }, [composeType]);

  const goBack = useCallback(() => {
    if (state.step === "review") {
      // For provider requests (auto-composed), go to home instead of form
      if (initialFormData) {
        reset();
        navigate("/index");
      } else {
        // For manual composes, go back to form
        setState(prev => ({
          ...prev,
          step: "form",
          apiResponse: null,
          error: null,
        }));
      }
    } else if (state.step === "success") {
      reset();
      navigate("/index");
    }
  }, [state.step, initialFormData, navigate, reset]);
  
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);
  
  const setShowAuthModal = useCallback((show: boolean) => {
    setState(prev => ({ ...prev, showAuthModal: show }));
  }, []);
  
  
  // Provide unlock handler for auth modal
  const contextValue = useMemo(() => ({
    state,
    composeTransaction,
    signAndBroadcast,
    goBack,
    reset,
    clearError,
    setShowAuthModal,
    showHelpText,
    toggleHelpText,
    activeAddress,
    activeWallet,
    settings,
    // Special handler for auth modal
    handleUnlockAndSign,
  }), [
    state,
    composeTransaction,
    signAndBroadcast,
    goBack,
    reset,
    clearError,
    setShowAuthModal,
    showHelpText,
    toggleHelpText,
    activeAddress,
    activeWallet,
    settings,
    handleUnlockAndSign,
  ]);
  
  return <ComposerContext value={contextValue}>{children}</ComposerContext>;
}