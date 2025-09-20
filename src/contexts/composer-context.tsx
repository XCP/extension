"use client";

import React, { useMemo } from "react";
import axios from "axios";
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
import { useHeader } from "@/contexts/header-context";
import { useLoading } from "@/contexts/loading-context";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { getComposeType, normalizeFormData } from "@/utils/blockchain/counterparty";
import type { ApiResponse } from "@/utils/blockchain/counterparty";
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
  initialFormData?: T | null;
  composeApi: (data: any) => Promise<ApiResponse>;
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
  initialFormData = null,
  composeApi,
  initialTitle,
}: ComposerProviderProps<T>): ReactElement {
  const navigate = useNavigate();
  const { activeAddress, activeWallet, authState, signTransaction, broadcastTransaction, unlockWallet, isWalletLocked } = useWallet();
  const { settings } = useSettings();
  const { showLoading, hideLoading } = useLoading();
  const { setHeaderProps } = useHeader();
  
  const previousAddressRef = useRef<string | undefined>(activeAddress?.address);
  const previousWalletRef = useRef<string | undefined>(activeWallet?.id);
  const previousAuthStateRef = useRef<string>(authState);
  const currentComposeTypeRef = useRef<string | undefined>(undefined);
  
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
  
  // Compose transaction
  const composeTransaction = useCallback(async (formData: FormData) => {
    if (!activeAddress) {
      setState(prev => ({ ...prev, error: "No active address available" }));
      return;
    }
    
    setState(prev => ({ ...prev, isComposing: true, error: null }));
    const loadingId = showLoading("Composing transaction...");
    
    try {
      // Convert FormData to object
      const rawData = Object.fromEntries(formData);
      const detectedType = getComposeType(rawData);
      
      // Reset if compose type changed
      if (currentComposeTypeRef.current && currentComposeTypeRef.current !== detectedType) {
        setState(prev => ({
          ...prev,
          formData: null,
          apiResponse: null,
        }));
      }
      currentComposeTypeRef.current = detectedType;
      
      // Store original user data for form persistence
      const userData = rawData as unknown as T;
      
      // Normalize data if compose type is detected
      let dataForApi: any = { ...userData, sourceAddress: activeAddress.address };
      if (detectedType) {
        const { normalizedData } = await normalizeFormData(formData, detectedType);
        dataForApi = { ...normalizedData, sourceAddress: activeAddress.address };
      }
      
      // Call compose API
      const response = await composeApi(dataForApi);
      
      setState(prev => ({
        ...prev,
        step: "review",
        formData: userData,
        apiResponse: response,
        error: null,
        isComposing: false,
      }));
    } catch (err) {
      console.error("Compose error:", err);
      let errorMessage = "An error occurred while composing the transaction.";
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        errorMessage = err.response.data.error;
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }
      
      setState(prev => ({
        ...prev,
        error: errorMessage,
        isComposing: false,
      }));
    } finally {
      hideLoading(loadingId);
    }
  }, [activeAddress, composeApi, showLoading, hideLoading]);
  
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
    const loadingId = showLoading("Signing and broadcasting transaction...");
    
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
      const txid = state.apiResponse.result.tx_hash || 'pending';
      recordTransaction(
        txid,
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
    } finally {
      hideLoading(loadingId);
    }
  }, [state.apiResponse, activeAddress, activeWallet, isWalletLocked, signTransaction, broadcastTransaction, showLoading, hideLoading]);
  
  // Handle unlock and sign (for auth modal)
  const handleUnlockAndSign = useCallback(async (password: string) => {
    if (!activeWallet || !state.apiResponse || !activeAddress) return;
    
    const loadingId = showLoading("Authorizing transaction...");
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
      const txid = state.apiResponse.result.tx_hash || 'pending';
      recordTransaction(
        txid,
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
      throw err; // Let the modal handle the error display
    } finally {
      hideLoading(loadingId);
    }
  }, [activeWallet, activeAddress, state.apiResponse, unlockWallet, signTransaction, broadcastTransaction, showLoading, hideLoading]);
  
  // Navigation actions
  const goBack = useCallback(() => {
    if (state.step === "review") {
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
  }, [state.step, navigate]);
  
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
    currentComposeTypeRef.current = undefined;
  }, []);
  
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