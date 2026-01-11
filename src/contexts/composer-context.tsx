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
import { verifyTransaction, extractOpReturnData } from "@/utils/blockchain/counterparty/unpack/verify";

/**
 * Maximum age for a composed transaction before requiring recomposition (5 minutes).
 * After this time, UTXOs may have been spent or fee rates may have changed significantly.
 */
const STALE_TRANSACTION_MS = 5 * 60 * 1000;

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
  /** Timestamp when transaction was composed (for staleness detection) */
  composedAt: number | null;
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
    formData: null,
    apiResponse: null,
    error: null,
    isComposing: false,
    isSigning: false,
    showAuthModal: false,
    composedAt: null,
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
        composedAt: null,
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
        composedAt: null,
      });
    }

    previousWalletRef.current = activeWallet?.id;
    previousAuthStateRef.current = authState;
  }, [activeWallet?.id, authState]);

  // Compose transaction
  const composeTransaction = useCallback(async (formData: FormData) => {
    // Guard: Prevent double-composition race condition
    if (state.isComposing) {
      return;
    }

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

      // Verify the transaction locally before showing review screen
      // This protects against a compromised API returning malicious transactions
      const opReturnData = extractOpReturnData(response.result.rawtransaction);
      if (opReturnData) {
        // Verify the composed transaction matches what we requested
        const verification = verifyTransaction(opReturnData, composeType, dataForApi);

        if (!verification.valid) {
          // In strict mode (default), block the transaction
          // Verification errors are critical security issues
          const errorDetails = verification.errors.join('; ');
          throw new Error(`Transaction verification failed: ${errorDetails}`);
        }

        // Log any warnings (but don't block)
        if (verification.warnings.length > 0) {
          console.warn('Transaction verification warnings:', verification.warnings);
        }
      }
      // Note: If no OP_RETURN data found, this might be a non-Counterparty transaction
      // which is allowed through (e.g., BTC-only transactions)

      // Update state to review step with API response
      setState(prev => ({
        ...prev,
        step: "review" as const,
        formData: userData,
        apiResponse: response,
        error: null,
        isComposing: false,
        composedAt: Date.now(),
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
  }, [activeAddress, composeApi, state.isComposing]);
  
  // Core sign and broadcast logic - extracted to avoid duplication
  const performSignAndBroadcast = useCallback(async () => {
    if (!state.apiResponse || !activeAddress) {
      throw new Error("Invalid transaction data");
    }

    const rawTxHex = state.apiResponse.result.rawtransaction;

    // Check for replay attempt before signing
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

    // Record transaction before broadcast to prevent double-broadcast
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

    // Return the updated apiResponse with broadcast info
    return {
      ...state.apiResponse,
      broadcast: broadcastResponse
    };
  }, [state.apiResponse, activeAddress, signTransaction, broadcastTransaction]);

  // Sign and broadcast transaction
  const signAndBroadcast = useCallback(async () => {
    // Guard: Prevent double-signing race condition
    if (state.isSigning) {
      return;
    }

    if (!state.apiResponse || !activeAddress || !activeWallet) {
      setState(prev => ({ ...prev, error: "Invalid transaction data" }));
      return;
    }

    // Check for stale transaction (composed too long ago)
    if (state.composedAt && Date.now() - state.composedAt > STALE_TRANSACTION_MS) {
      setState(prev => ({
        ...prev,
        error: "Transaction data is stale. Please go back and recompose the transaction.",
      }));
      return;
    }

    // Check if wallet is locked
    if (await isWalletLocked()) {
      setState(prev => ({ ...prev, showAuthModal: true }));
      return;
    }

    setState(prev => ({ ...prev, isSigning: true, error: null }));

    try {
      const apiResponseWithBroadcast = await performSignAndBroadcast();

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
          setState(prev => ({ ...prev, showAuthModal: true, isSigning: false }));
          return;
        }
      }

      setState(prev => ({
        ...prev,
        error: errorMessage,
        isSigning: false,
      }));
    }
  }, [state.apiResponse, state.isSigning, state.composedAt, activeAddress, activeWallet, isWalletLocked, performSignAndBroadcast]);

  // Handle unlock and sign (for auth modal)
  const handleUnlockAndSign = useCallback(async (password: string) => {
    if (!activeWallet || !state.apiResponse || !activeAddress) return;

    setState(prev => ({ ...prev, isSigning: true }));
    try {
      await unlockWallet(activeWallet.id, password);
      setState(prev => ({ ...prev, showAuthModal: false }));

      const apiResponseWithBroadcast = await performSignAndBroadcast();

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
  }, [activeWallet, activeAddress, state.apiResponse, unlockWallet, performSignAndBroadcast]);

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
      composedAt: null,
    });
    currentComposeTypeRef.current = composeType;
  }, [composeType]);

  const goBack = useCallback(() => {
    if (state.step === "review") {
      // Go back to form, preserving user's form data for quick edits
      setState(prev => ({
        ...prev,
        step: "form",
        apiResponse: null,
        error: null,
      }));
    } else if (state.step === "success") {
      reset();
      navigate("/index");
    }
  }, [state.step, navigate, reset]);
  
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