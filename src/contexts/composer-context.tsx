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
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router";
import {
  ComposerContext,
  type ComposerState,
  type DecodedMessage,
} from "@/contexts/composer-context-object";
import { useHeader } from "@/contexts/header-context";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { isApiError } from "@/core/api/client";
import { checkTransactionFee } from "@/core/bitcoin/feeVerification";
import type { ApiResponse } from "@/core/counterparty/compose";
import {
  verifyInscriptionEnvelope,
  verifyRevealTransaction,
} from "@/core/counterparty/inscriptionEnvelope";
import { normalizeFormData } from "@/core/counterparty/normalize";
import {
  checkOutputPolicy,
  type IntendedDestination,
  pinnedDestination,
  pinnedQuantity,
} from "@/core/counterparty/outputPolicy";
import { packComposeMessage } from "@/core/counterparty/pack/messages";
import { fetchInputValues } from "@/core/counterparty/transaction";
import { unpackCounterpartyMessage } from "@/core/counterparty/unpack";
import { packAddress } from "@/core/counterparty/unpack/address";
import { bytesToHex } from "@/core/counterparty/unpack/binary";
import { extractCounterpartyPayload } from "@/core/counterparty/unpack/opReturn";
import { verifyTransaction } from "@/core/counterparty/unpack/verify";
import { checkReplayAttempt, recordTransaction } from "@/core/replayPrevention";
import { analytics, classifyTransactionError, getBtcBucket } from "@/platform/fathom";


/**
 * Maximum age for a composed transaction before requiring recomposition (5 minutes).
 * After this time, UTXOs may have been spent or fee rates may have changed significantly.
 */
const STALE_TRANSACTION_MS = 5 * 60 * 1000;

/**
 * Compose types whose payee is derived server-side and so cannot appear in the request. A BTCPay is
 * settled against an order match, and the address to pay comes from that match rather than from
 * anything the user typed — output accounting would have nothing to match it against. These skip
 * the output policy; every other type is accounted for.
 */
const SERVER_DERIVED_DESTINATION_TYPES = new Set(['btcpay']);

/**
 * Where a burn sends its BTC. These are protocol constants rather than anything the user types, so
 * the request never names them and output accounting would otherwise read a burn as paying a
 * stranger. Supplying them keeps the check exact — a burn must pay this address the quantity that
 * was asked and nothing else — instead of exempting burns the way btcpay is exempted. Both networks
 * are listed because both are provably unspendable.
 */
const BURN_ADDRESSES = ['1CounterpartyXXXXXXXXXXXXXXXUWLpVr', 'mvCounterpartyXXXXXXXXXXXXXXW24Hef'];

/**
 * Every Bitcoin address named anywhere in the request, regardless of field. The property being
 * enforced is that no output pays an address the request never named, so which field an address
 * came from does not matter and per-type destination fields need not be enumerated.
 */
function addressesNamedIn(params: Record<string, unknown>): string[] {
  const addresses: string[] = [];
  for (const value of Object.values(params)) {
    if (typeof value !== 'string') continue;
    // Addresses arrive bare, comma-separated (multi-destination sends), or packed alongside a value
    // (`more_outputs` is "sats:address"), so split on every separator the forms use.
    for (const candidate of value.split(/[,:\s]+/).map(part => part.trim()).filter(Boolean)) {
      try {
        packAddress(candidate);
        addresses.push(candidate);
      } catch {
        // Not an address; ignore.
      }
    }
  }
  return addresses;
}

/**
 * A fresh composer state — the single definition every reset path uses. A function rather than a
 * constant so each reset gets its own `verificationWarnings` array.
 */
function freshComposerState<T>(): ComposerState<T> {
  return {
    step: "form",
    formData: null,
    apiResponse: null,
    error: null,
    verificationWarnings: [],
    decodedMessage: null,
    isComposing: false,
    isSigning: false,
    composedAt: null,
    feeRate: null,
  };
}

/**
 * Props for ComposerProvider component.
 * @template T - Type of the form data
 */
interface ComposerProviderProps<_T> {
  /** Child components (form, review screen, etc.) */
  children: ReactNode;
  /** Transaction type identifier (e.g., "send", "order", "issuance") */
  composeType: string;
  /** API function to compose the transaction */
  composeApi: (data: any) => Promise<ApiResponse>;
  /** Title shown in header during form step */
  initialTitle: string;
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
  const { activeAddress, activeWallet, authState, signTransaction, broadcastTransaction, setHardwareOperationInProgress } = useWallet();
  const { settings } = useSettings();
  const { clearBalances } = useHeader();

  const previousAddressRef = useRef<string | undefined>(activeAddress?.address);
  const previousWalletRef = useRef<string | undefined>(activeWallet?.id);
  const previousAuthStateRef = useRef<string>(authState);
  const currentComposeTypeRef = useRef<string>(composeType);

  // AbortController for cancelling pending operations on unmount/navigation
  const abortControllerRef = useRef<AbortController | null>(null);

  // Initialize state
  const [state, setState] = useState<ComposerState<T>>(freshComposerState);


  // Help text state (can be toggled locally)
  const [localShowHelpText, setLocalShowHelpText] = useState<boolean | null>(null);
  const showHelpText = localShowHelpText ?? settings?.showHelpText ?? false;

  // Toggle help text
  const toggleHelpText = useCallback(() => {
    setLocalShowHelpText(prev => prev === null ? !settings?.showHelpText : !prev);
  }, [settings?.showHelpText]);

  const setFeeRate = useCallback((rate: number) => {
    setState(prev => ({ ...prev, feeRate: rate }));
  }, []);
  
  // Reset composer state when address changes
  useEffect(() => {
    if (
      activeAddress?.address &&
      previousAddressRef.current &&
      activeAddress.address !== previousAddressRef.current
    ) {
      setState(freshComposerState<T>());
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
      setState(freshComposerState<T>());
    }

    previousWalletRef.current = activeWallet?.id;
    previousAuthStateRef.current = authState;
  }, [activeWallet?.id, authState]);

  // Cleanup: abort pending operations on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

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

    // Cancel any pending operation and create new AbortController
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    // Convert FormData to object early so we can preserve it on error
    const rawData = Object.fromEntries(formData);
    const userData = rawData as unknown as T;

    // Set isComposing to show local loading state, preserve formData for error recovery
    setState(prev => ({ ...prev, isComposing: true, error: null, formData: userData }));

    try {

      // Normalize data based on compose type (skip for broadcast which doesn't need normalization)
      let dataForApi: any = { ...userData, sourceAddress: activeAddress.address };
      if (composeType !== 'broadcast') {
        const { normalizedData } = await normalizeFormData(formData, composeType);
        dataForApi = { ...normalizedData, sourceAddress: activeAddress.address };
      }

      // Check if aborted before API call
      if (signal.aborted) return;

      // Call compose API (UTXO selection is handled internally by compose functions)
      // Reassigned below if verification finds the reported fee differs from the real one.
      let response = await composeApi(dataForApi);

      // Check if aborted after API call
      if (signal.aborted) return;

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
      const counterpartyData = extractCounterpartyPayload(response.result.rawtransaction);
      let verificationWarnings: string[] = [];
      let decodedMessage: DecodedMessage | null = null;

      // An inscription compose carries its message in an ord envelope rather than an OP_RETURN, so
      // the transaction being signed is a commit paying a P2TR address derived from that envelope.
      // Rebuild the envelope from the message this request should produce and require the composed
      // one to match, then let the derived address explain the commit output. Verified here rather
      // than exempted, so a substituted inscription still fails (`inscriptionEnvelope.ts`).
      let inscriptionCommitAddress: string | null = null;
      const envelopeScript = response.result.envelope_script;
      if (typeof envelopeScript === 'string' && envelopeScript.length > 0) {
        const expectedMessage = packComposeMessage(composeType, dataForApi);
        if (!expectedMessage) {
          throw new Error(
            'Transaction verification failed: this inscription could not be rebuilt for checking.'
          );
        }
        const envelopeCheck = verifyInscriptionEnvelope(envelopeScript, expectedMessage.bytes);
        if (!envelopeCheck.ok || !envelopeCheck.commitAddress) {
          throw new Error(envelopeCheck.error || 'Transaction verification failed: bad inscription.');
        }
        // The reveal is signed by the composer, so its outputs are checked rather than trusted.
        const revealHex = response.result.signed_reveal_rawtransaction;
        if (typeof revealHex !== 'string' || revealHex.length === 0) {
          throw new Error('The composer did not return the reveal transaction for this inscription.');
        }
        const revealCheck = verifyRevealTransaction(revealHex, [activeAddress.address]);
        if (!revealCheck.ok) {
          throw new Error(revealCheck.error || 'Transaction verification failed: bad reveal.');
        }
        inscriptionCommitAddress = envelopeCheck.commitAddress;
      }

      if (counterpartyData) {
        // Read the message out of the transaction so the review screen can render what the bytes
        // say rather than what the response claims they say.
        const unpacked = unpackCounterpartyMessage(counterpartyData);
        if (unpacked.success && unpacked.messageType && unpacked.data) {
          decodedMessage = {
            messageType: unpacked.messageType,
            data: unpacked.data as Record<string, unknown>,
          };
        }
        // Byte equality first: rebuild the message this request should have produced and compare
        // it whole, so no field goes unchecked (ADR-019). A null return means the type cannot be
        // constructed locally and falls through to field comparison; the decoded message supplies
        // only values the request cannot determine (see `Observed` in pack/messages.ts).
        const expected = packComposeMessage(composeType, dataForApi, decodedMessage?.data);

        if (expected) {
          // Any difference is fatal, with no severity gradation: there is no benign reason for a
          // composer to alter a message. counterparty-core treats its own output the same way
          // (`check_transaction_sanity` raises on `tx_data != data`).
          if (bytesToHex(expected.bytes).toLowerCase() !== counterpartyData.toLowerCase()) {
            throw new Error(
              'Transaction verification failed: the composed message does not match your request.'
            );
          }
        } else {
          // Field comparison covers only fields it was taught about, so it grades severity:
          // informational differences surface on the review screen instead of blocking.
          const verification = verifyTransaction(counterpartyData, composeType, dataForApi);

          if (!verification.valid) {
            // In strict mode (default), block the transaction
            // Verification errors are critical security issues
            const errorDetails = verification.errors.join('; ');
            throw new Error(`Transaction verification failed: ${errorDetails}`);
          }

          // Differences too minor to block, shown on the review screen so the user can still see them.
          verificationWarnings = verification.warnings;
        }
      }
      // Note: If no Counterparty payload was found, this might be a non-Counterparty
      // transaction, which is allowed through (e.g., BTC-only transactions)

      // Independently bound the fee for every transaction type (including
      // BTC-only sends with no OP_RETURN), so a drain-to-fee response or a
      // buggy fee estimate is rejected before the review screen.
      const feeCheck = await checkTransactionFee({
        rawTransaction: response.result.rawtransaction,
        // sat_per_vbyte arrives as a form string; checkTransactionFee coerces it.
        userFeeRate: dataForApi.sat_per_vbyte ?? null,
      }, fetchInputValues);
      if (!feeCheck.ok) {
        throw new Error(feeCheck.error || 'Transaction fee verification failed');
      }

      // Show the fee computed from the transaction's own inputs and outputs, not `btc_fee` as the
      // response asserts it. The bound above is loose enough for legitimate composers, so a
      // response can pass it while claiming a smaller fee than the transaction pays. Replacing the
      // field here covers every review screen, since they all render `result.btc_fee`.
      if (feeCheck.computedFee !== undefined) {
        const reportedFee = response.result.btc_fee;
        // Contradicting a stated fee is worth telling the user about; filling in one the response
        // never stated is not, so absence is corrected silently rather than reported as a
        // discrepancy.
        if (typeof reportedFee === 'number' && reportedFee !== feeCheck.computedFee) {
          verificationWarnings.push(
            `This transaction pays a ${feeCheck.computedFee} sat miner fee, though the composer `
            + `reported ${reportedFee}. The amount shown is the one the transaction pays.`
          );
        }
        response = {
          ...response,
          result: { ...response.result, btc_fee: feeCheck.computedFee },
        };
      }

      // Account for every output: each must be the data output, an address the request names, or
      // change to one of our own addresses. Anything else rejects the transaction, so a response
      // that adds a recipient fails closed even though no field-level check covers it (ADR-019).
      if (activeAddress && !SERVER_DERIVED_DESTINATION_TYPES.has(composeType)) {
        const intendedDestinations: IntendedDestination[] =
          addressesNamedIn(dataForApi).map(address => ({ address }));
        // The inscription commit output pays an address the request cannot name, but one that was
        // just derived from an envelope verified to carry this request's message — so it is
        // explained by proof rather than by exemption.
        if (inscriptionCommitAddress) {
          intendedDestinations.push({ address: inscriptionCommitAddress });
        }
        if (composeType === 'burn') {
          // A burn carries no Counterparty message at all, so the outputs are the only thing that
          // can be checked — and pinning the amount here is the only verification a burn gets.
          for (const address of BURN_ADDRESSES) {
            intendedDestinations.push({ address, value: pinnedQuantity(dataForApi.quantity) });
          }
        }
        // Naming an address is not the same as agreeing to an amount paid to it.
        const pinned = pinnedDestination(composeType, dataForApi);
        if (pinned) {
          const entry = intendedDestinations.find(d => d.address === pinned.address);
          if (entry) entry.value = pinned.value;
          else intendedDestinations.push(pinned);
        }

        const outputCheck = checkOutputPolicy({
          rawTransaction: response.result.rawtransaction,
          ownAddresses: [activeAddress.address],
          intendedDestinations,
          // An ownership transfer names its new owner nowhere in the message; the node reads it
          // from the output ahead of the data output.
          positionalDestination: composeType === 'issuance' && typeof dataForApi.transfer_destination === 'string'
            && dataForApi.transfer_destination
            ? dataForApi.transfer_destination
            : undefined,
        });
        if (!outputCheck.ok) {
          throw new Error(outputCheck.error || 'Transaction pays outputs your request did not ask for');
        }
      }

      // Final abort check before state update
      if (signal.aborted) return;

      // Track successful compose (form → review)
      analytics.track('compose');

      // Update state to review step with API response
      setState(prev => ({
        ...prev,
        step: "review" as const,
        formData: userData,
        apiResponse: response,
        error: null,
        verificationWarnings,
        decodedMessage,
        isComposing: false,
        composedAt: Date.now(),
      }));
    } catch (error) {
      // Silently ignore abort errors (user navigated away)
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }

      console.error("Compose error:", error);

      let errorMessage = "An error occurred while composing the transaction.";
      if (isApiError(error) && error.response?.data && typeof error.response.data === 'object' && 'error' in error.response.data) {
        errorMessage = (error.response.data as { error: string }).error;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      analytics.track(`compose_error_${classifyTransactionError(errorMessage)}`);

      // Don't update state if aborted
      if (signal.aborted) return;

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
    // PSBT is available for hardware wallet signing
    const psbtHex = state.apiResponse.result.psbt;
    // Input values and lock scripts are needed to complete PSBT for hardware wallets
    // The Counterparty API returns these separately from the PSBT
    const inputValues = state.apiResponse.result.inputs_values;
    const lockScripts = state.apiResponse.result.lock_scripts;

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

    // For hardware wallets, pause idle timer during signing
    const isHardwareWallet = activeWallet?.type === 'hardware';
    if (isHardwareWallet) {
      setHardwareOperationInProgress(true);
    }

    let signedTxHex: string;
    try {
      // Sign transaction - PSBT and input data are passed for hardware wallet support
      signedTxHex = await signTransaction(rawTxHex, activeAddress.address, { psbtHex, inputValues, lockScripts });
    } finally {
      // Re-enable idle timer after hardware signing completes (or fails)
      if (isHardwareWallet) {
        setHardwareOperationInProgress(false);
      }
    }

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

    // An inscription is two transactions: the commit just went out, and the reveal publishes the
    // content. The reveal is already signed by the composer and was checked at compose time to pay
    // only us. Broadcasting it immediately is safe because it spends the commit's output, whose
    // txid is fixed before signing — its inputs are segwit, which is why taproot encoding requires
    // a segwit source. Without this the content never lands and the committed sats are stranded.
    const revealHex = state.apiResponse.result.signed_reveal_rawtransaction;
    let revealBroadcast: { txid?: string } | undefined;
    if (typeof revealHex === 'string' && revealHex.length > 0) {
      try {
        revealBroadcast = await broadcastTransaction(revealHex);
      } catch (error) {
        // The commit is already on the network and cannot be recalled, so this must not throw:
        // surface it as a warning with the reveal hex so the inscription can still be completed.
        const detail = error instanceof Error ? error.message : String(error);
        setState(prev => ({
          ...prev,
          verificationWarnings: [
            ...prev.verificationWarnings,
            `The inscription's commit transaction was broadcast, but the reveal that publishes the `
            + `content was not accepted (${detail}). The content is not on chain yet. Reveal `
            + `transaction: ${revealHex}`,
          ],
        }));
      }
    }

    // Return the updated apiResponse with broadcast info
    return {
      ...state.apiResponse,
      broadcast: broadcastResponse,
      ...(revealBroadcast ? { revealBroadcast } : {}),
    };
  }, [state.apiResponse, activeAddress, activeWallet, signTransaction, broadcastTransaction, setHardwareOperationInProgress]);

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

    // Cancel any pending compose operation and create new AbortController for signing
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setState(prev => ({ ...prev, isSigning: true, error: null }));

    try {
      // Note: We don't check signal.aborted after performSignAndBroadcast
      // because once broadcast, the transaction is on the network regardless
      const apiResponseWithBroadcast = await performSignAndBroadcast();

      // Track successful broadcast with fee bucket
      const btcFee = apiResponseWithBroadcast?.result?.btc_fee || 0;
      const btcFeeAmount = btcFee / 100000000;
      analytics.track('broadcast', getBtcBucket(btcFeeAmount));

      // Only skip state update if aborted (user navigated away)
      if (signal.aborted) return;

      // Clear balance cache so it refreshes after broadcast
      clearBalances();

      setState(prev => ({
        ...prev,
        step: "success",
        apiResponse: apiResponseWithBroadcast,
        error: null,
        isSigning: false,
      }));
    } catch (error) {
      // Silently ignore abort errors
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }

      console.error("Sign/broadcast error:", error);
      let errorMessage = "Failed to sign and broadcast transaction";
      if (error instanceof Error) {
        errorMessage = error.message;
      }

      analytics.track(`broadcast_error_${classifyTransactionError(errorMessage)}`);

      // Don't update state if aborted
      if (signal.aborted) return;

      setState(prev => ({
        ...prev,
        error: errorMessage,
        isSigning: false,
      }));
    }
  }, [state.apiResponse, state.isSigning, state.composedAt, activeAddress, activeWallet, performSignAndBroadcast, clearBalances]);

  // Navigation actions
  const reset = useCallback(() => {
    setState(freshComposerState<T>());
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
        verificationWarnings: [],
        decodedMessage: null,
      }));
    } else if (state.step === "success") {
      reset();
      navigate("/index");
    }
  }, [state.step, navigate, reset]);
  
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  const contextValue = useMemo(() => ({
    state,
    composeTransaction,
    signAndBroadcast,
    goBack,
    reset,
    clearError,
    showHelpText,
    toggleHelpText,
    feeRate: state.feeRate,
    setFeeRate,
    activeAddress,
    activeWallet,
    settings,
  }), [
    state,
    composeTransaction,
    signAndBroadcast,
    goBack,
    reset,
    clearError,
    showHelpText,
    toggleHelpText,
    setFeeRate,
    activeAddress,
    activeWallet,
    settings,
  ]);
  
  return <ComposerContext value={contextValue}>{children}</ComposerContext>;
}