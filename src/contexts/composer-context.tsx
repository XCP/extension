/**
 * @module composer-context
 *
 * Transaction composition and broadcast workflow management.
 *
 * The Composer provides a three-step transaction flow:
 * 1. **Form** - User enters transaction parameters
 * 2. **Review** - Shows composed transaction for confirmation
 * 3. **Success** - Displays broadcast result with txid
 *
 * ## Security Features
 *
 * - **Local verification**: Composed transactions are verified locally before
 *   showing the review screen to protect against compromised APIs
 * - **Replay prevention**: Transactions are checked against recent broadcasts
 *   to prevent double-spend attempts
 * - **Staleness detection**: Transactions older than 5 minutes require
 *   recomposition (UTXOs may have been spent)
 *
 * ## State Management
 *
 * State automatically resets when:
 * - Active address changes
 * - Active wallet changes
 * - Wallet is locked/unlocked
 *
 * @example
 * ```tsx
 * <ComposerProvider
 *   composeType="send"
 *   composeApi={composeSend}
 *   initialTitle="Send Assets"
 * >
 *   <SendForm />
 * </ComposerProvider>
 * ```
 */
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { isApiError } from "@/utils/apiClient";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { getComposeType, normalizeFormData } from "@/utils/blockchain/counterparty/normalize";
import type { ApiResponse } from "@/utils/blockchain/counterparty/compose";
import { checkReplayAttempt, recordTransaction } from "@/utils/security/replayPrevention";
import { verifyTransaction, extractOpReturnData } from "@/utils/blockchain/counterparty/unpack/verify";

/**
 * Maximum age for a composed transaction before requiring recomposition (5 minutes).
 * After this time, UTXOs may have been spent or fee rates may have changed significantly.
 */
const STALE_TRANSACTION_MS = 5 * 60 * 1000;

/**
 * Internal state for the composer workflow.
 * @template T - Type of the form data (varies by transaction type)
 */
interface ComposerState<T> {
  /** Current step in the workflow */
  step: "form" | "review" | "success";
  /** User's form input (preserved for back navigation) */
  formData: T | null;
  /** API response from compose endpoint */
  apiResponse: ApiResponse | null;
  /** Error message to display */
  error: string | null;
  /** True while calling compose API */
  isComposing: boolean;
  /** True while signing/broadcasting */
  isSigning: boolean;
  /** Whether auth modal is visible */
  showAuthModal: boolean;
  /** Timestamp when transaction was composed (for staleness detection) */
  composedAt: number | null;
}

/**
 * Public API for transaction composition workflow.
 * @template T - Type of the form data
 */
interface ComposerContextType<T> {
  // ─── State ─────────────────────────────────────────────────────────────────
  /** Current composer state */
  state: ComposerState<T>;

  // ─── Workflow Actions ──────────────────────────────────────────────────────
  /** Submit form data to compose a transaction */
  composeTransaction: (formData: FormData) => Promise<void>;
  /** Sign and broadcast the composed transaction */
  signAndBroadcast: () => Promise<void>;
  /** Navigate back one step (review→form, success→home) */
  goBack: () => void;
  /** Reset to initial form state */
  reset: () => void;
  /** Clear current error message */
  clearError: () => void;
  /** Show/hide the authentication modal */
  setShowAuthModal: (show: boolean) => void;

  // ─── UI State ──────────────────────────────────────────────────────────────
  /** Whether help text is visible */
  showHelpText: boolean;
  /** Toggle help text visibility */
  toggleHelpText: () => void;

  // ─── Wallet/Settings Access ────────────────────────────────────────────────
  /** Currently active address */
  activeAddress: ReturnType<typeof useWallet>["activeAddress"];
  /** Currently active wallet */
  activeWallet: ReturnType<typeof useWallet>["activeWallet"];
  /** Current settings */
  settings: ReturnType<typeof useSettings>["settings"];

  // ─── Auth Modal ────────────────────────────────────────────────────────────
  /** Unlock wallet and complete signing (called from auth modal) */
  handleUnlockAndSign: (password: string) => Promise<void>;
}

/**
 * Props for ComposerProvider component.
 * @template T - Type of the form data
 */
interface ComposerProviderProps<T> {
  /** Child components (form, review screen, etc.) */
  children: ReactNode;
  /** Transaction type identifier (e.g., "send", "order", "issuance") */
  composeType: string;
  /** API function to compose the transaction */
  composeApi: (data: any) => Promise<ApiResponse>;
  /** Title shown in header during form step */
  initialTitle: string;
}

const ComposerContext = createContext<ComposerContextType<any> | undefined>(undefined);

/**
 * Hook to access composer context.
 * @template T - Type of the form data
 * @returns Composer context value
 * @throws {Error} If used outside ComposerProvider
 */
export function useComposer<T>(): ComposerContextType<T> {
  const context = use(ComposerContext);
  if (!context) {
    throw new Error("useComposer must be used within a ComposerProvider");
  }
  return context as ComposerContextType<T>;
}

/**
 * Provides transaction composition workflow to child components.
 * Handles the form → review → success flow with automatic state management.
 * @template T - Type of the form data
 */
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
    } catch (error) {
      console.error("Compose error:", error);
      let errorMessage = "An error occurred while composing the transaction.";
      if (isApiError(error) && error.response?.data && typeof error.response.data === 'object' && 'error' in error.response.data) {
        errorMessage = (error.response.data as { error: string }).error;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      setState(prev => ({
        ...prev,
        error: errorMessage,
        isComposing: false,
      }));
    }
  }, [activeAddress, composeApi, composeType, state.isComposing]);
  
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
    // Use timestamp + random suffix to avoid any collision risk
    const placeholderTxid = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    recordTransaction(
      placeholderTxid,
      window.location.origin,
      'broadcast_transaction',
      [rawTxHex],
      { status: 'pending' }
    );

    const broadcastResponse = await broadcastTransaction(signedTxHex);

    // Record the real txid as broadcasted (the placeholder stays as 'pending'
    // but will be cleaned up automatically; replay prevention matches on params)
    if (broadcastResponse.txid) {
      recordTransaction(
        broadcastResponse.txid,
        window.location.origin,
        'broadcast_transaction',
        [rawTxHex],
        { status: 'broadcasted' }
      );
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
    } catch (error) {
      console.error("Sign/broadcast error:", error);
      let errorMessage = "Failed to sign and broadcast transaction";
      if (error instanceof Error) {
        errorMessage = error.message;

        // Special handling for wallet lock
        if (error.message.includes("Wallet is locked")) {
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
    } catch (error) {
      console.error("Authorization error:", error);
      setState(prev => ({ ...prev, isSigning: false }));
      throw error; // Let the modal handle the error display
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