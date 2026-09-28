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
import { transactionErrorMessage } from '@/components/composer/transaction-error-message';
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
import { fetchOrderMatch } from "@/core/counterparty/api";
import { btcPayPayment } from "@/core/counterparty/btcpayPayment";
import type { ApiResponse } from "@/core/counterparty/compose";
import { composerChosenMessageFields } from "@/core/counterparty/composerChoices";
import {
  envelopeKind,
  readDataEnvelope,
  revealSpendsTransaction,
  verifyInscriptionEnvelope,
  verifyUnsignedReveal,
} from "@/core/counterparty/inscriptionEnvelope";
import { type MpmaTableFormatResolution, mpmaNearsActivation, resolveMpmaTableFormat } from "@/core/counterparty/mpmaTableFormat";
import { normalizeFormData, verifiedReviewParams } from "@/core/counterparty/normalize";
import {
  checkOutputPolicy,
  type IntendedDestination,
  pinnedDestinations,
  pinnedQuantity,
  withPinnedDestinations,
} from "@/core/counterparty/outputPolicy";
import { composesAsMpma, type PackRules, packComposeMessage } from "@/core/counterparty/pack/messages";
import { getSourcePubkey } from "@/core/counterparty/sourcePubkey";
import { chooseComposeEncoding, composeWithEncoding, readRevealShape, signsTaprootReveals } from "@/core/counterparty/taprootEncoding";
import { fetchInputValues } from "@/core/counterparty/transaction";
import { unpackCounterpartyMessage } from "@/core/counterparty/unpack";
import { packAddress } from "@/core/counterparty/unpack/address";
import { bytesToHex } from "@/core/counterparty/unpack/binary";
import { extractCounterpartyPayload } from "@/core/counterparty/unpack/opReturn";
import { verifyTransaction } from "@/core/counterparty/unpack/verify";
import { fromSatoshis, toFiniteNumber } from '@/core/numeric';
import { checkReplayAttempt, recordTransaction } from "@/core/replayPrevention";
import { ComposeVerificationError } from '@/core/validation/compose-verification-error';
import { huntZeldForCompose } from "@/core/zeld/composeHunt";
import { HUNTS_WHILE_SIGNING, huntsWhileSigning } from "@/core/zeld/eligibility";
import { zeldRecordAfterBroadcast } from "@/core/zeld/recordAfterBroadcast";
import { t } from '@/i18n';
import { analytics, classifyTransactionError, getBtcBucket } from "@/platform/fathom";
import { recordZeldOutpoints } from "@/services/zeldRecordClient";

/**
 * Maximum age for a composed transaction before requiring recomposition (5 minutes).
 * After this time, UTXOs may have been spent or fee rates may have changed significantly.
 */
const STALE_TRANSACTION_MS = 5 * 60 * 1000;

/**
 * Where a burn sends its BTC. These are protocol constants rather than anything the user types, so
 * the request never names them and output accounting would otherwise read a burn as paying a
 * stranger. Supplying them keeps the check exact — a burn must pay this address the quantity that
 * was asked and nothing else — instead of exempting burns the way btcpay is exempted. Both networks
 * are listed because both are provably unspendable.
 */
const BURN_ADDRESSES = ['1CounterpartyXXXXXXXXXXXXXXXUWLpVr', 'mvCounterpartyXXXXXXXXXXXXXXW24Hef'];

/** Keep structured local failures until render, so a language change cannot stale the diagnostic. */
type InternalComposerState<T> = Omit<ComposerState<T>, 'error'> & {
  error: string | ComposeVerificationError | null;
};

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
    reviewNotices: [],
    decodedMessage: null,
    isComposing: false,
    isSigning: false,
    composedAt: null,
    feeRate: null,
    zeldHuntProgress: null,
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
  const {
    activeAddress, activeWallet, authState, signTransaction, signCommitAndReveal, broadcastTransaction,
    setHardwareOperationInProgress,
  } = useWallet();
  const { settings } = useSettings();
  const { clearBalances } = useHeader();
  // Read once per render so the compose callback depends on the number, not the settings object.
  const zeldHuntSeconds = settings?.zeldHuntSeconds ?? 0;

  const previousAddressRef = useRef<string | undefined>(activeAddress?.address);
  const previousWalletRef = useRef<string | undefined>(activeWallet?.id);
  const previousAuthStateRef = useRef<string>(authState);
  const currentComposeTypeRef = useRef<string>(composeType);

  // AbortController for cancelling pending operations on unmount/navigation
  const abortControllerRef = useRef<AbortController | null>(null);
  // Fired by the spinner's "Use it now": the hunt settles for the rare txid it already has.
  const acceptZeldHuntRef = useRef<AbortController | null>(null);

  // Initialize state
  const [state, setState] = useState<InternalComposerState<T>>(freshComposerState);


  // Help text state (can be toggled locally)
  const [localShowHelpText, setLocalShowHelpText] = useState<boolean | null>(null);
  const showHelpText = localShowHelpText ?? settings?.showHelpText ?? false;

  // Toggle help text
  const toggleHelpText = useCallback(() => {
    setLocalShowHelpText(prev => prev === null ? !settings?.showHelpText : !prev);
  }, [settings?.showHelpText]);

  const setFeeRate = useCallback((rate: number | null) => {
    setState(prev => ({ ...prev, feeRate: rate }));
  }, []);
  
  // Reset composer state when address changes
  useEffect(() => {
    if (
      activeAddress?.address &&
      previousAddressRef.current &&
      activeAddress.address !== previousAddressRef.current
    ) {
      abortControllerRef.current?.abort();
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
      abortControllerRef.current?.abort();
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
      setState(prev => ({ ...prev, error: t('composer_context_no_active_address_available') }));
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

      // Normalization validates drafts and fee rates before any request. A
      // broadcast has no scaled quantities, but its fee still uses this gate.
      const { normalizedData, assetInfoCache } = await normalizeFormData(formData, composeType);
      const dataForApi: Record<string, any> = { ...normalizedData, sourceAddress: activeAddress.address };

      // Check if aborted before API call
      if (signal.aborted) return;

      // Core 11.5 returns an unsigned reveal the wallet signs with the source key. A hardware wallet
      // does not sign one here, so a request that asks for Taproot (an inscription) is refused
      // before it is composed; a wallet-chosen encoding never asks (`chooseComposeEncoding`).
      const requestsTaproot = dataForApi.encoding === 'taproot' || !!dataForApi.inscription;
      if (requestsTaproot && !signsTaprootReveals(activeWallet?.type)) {
        throw new Error(t('composer_context_taproot_needs_software_wallet'));
      }

      // An MPMA's address table depends on the block it lands in (`mpmaTableFormat.ts`), so the
      // table this request must produce is settled before compose, from the height, and the
      // message is held to it below. When the height cannot be read consistently the send is not
      // composed at all: either table could be the wrong one.
      let mpmaTable: MpmaTableFormatResolution | null = null;
      if (composesAsMpma(composeType, dataForApi)) {
        mpmaTable = await resolveMpmaTableFormat();
        if (signal.aborted) return;
        if (!mpmaTable) throw new Error(t('composer_context_mpma_table_format_unconfirmed'));
      }
      const packRules: PackRules = mpmaTable ? { mpmaTableFormat: mpmaTable.format } : {};
      const reviewNotices: string[] = [];
      if (mpmaTable && mpmaNearsActivation(mpmaTable)) {
        reviewNotices.push(t('composer_context_mpma_near_activation', [String(mpmaTable.activationHeight)]));
      }

      // Call compose API (UTXO selection is handled internally by compose functions). A message too
      // long for an OP_RETURN goes out Taproot-encoded where core allows it, since the multisig
      // fallback costs several times more; the user is never asked to choose, and a composer that
      // will not build it that way is asked once more for the default. Verification below compares
      // against `dataForApi`, which the encoding does not change.
      // Reassigned below if verification finds the reported fee differs from the real one.
      const encoding = chooseComposeEncoding(composeType, dataForApi, activeAddress.address, activeWallet?.type, packRules);
      let response = await composeWithEncoding(composeApi, dataForApi, encoding, signal);
      // The request as the wallet actually sent it: the form's data plus any message field the
      // compose function chose itself (an attach's output after the change). Recorded by the
      // compose function when it built the request, never read from the response, so the message
      // below is still held to exactly what this wallet asked for.
      const requestedData: Record<string, any> = { ...dataForApi, ...composerChosenMessageFields(response) };

      // Check if aborted after API call
      if (signal.aborted) return;

      // Validate response structure
      if (!response || typeof response !== 'object') {
        throw new Error(t('composer_context_invalid_api_response_response_is'));
      }

      if (!response.result || typeof response.result !== 'object') {
        throw new Error(t('composer_context_invalid_api_response_missing_or'));
      }

      // Ensure we have the minimum required fields
      if (!response.result.rawtransaction) {
        throw new Error(t('composer_context_invalid_api_response_missing_rawtransaction'));
      }

      // Verify the transaction locally before showing review screen
      // This protects against a compromised API returning malicious transactions
      let counterpartyData = extractCounterpartyPayload(response.result.rawtransaction);
      let verificationWarnings: string[] = [];
      let decodedMessage: DecodedMessage | null = null;

      // A Taproot compose carries its message in an envelope rather than an OP_RETURN, so the
      // transaction being signed is a commit paying a P2TR address derived from that envelope, and
      // a reveal publishes it. Core 11.5 returns an unsigned reveal the wallet signs with the source
      // key. A plain data envelope is read — its message then goes through every check below
      // exactly as an OP_RETURN payload would — and an inscription's ord envelope is rebuilt from
      // the message this request should produce. Either way the derived address explains the
      // commit output, and the reveal is held to core's construction and attribution rule before
      // either transaction can be signed. Verified here rather than exempted
      // (`inscriptionEnvelope.ts`).
      let taprootCommitAddress: string | null = null;
      let revealFee: number | undefined;
      const revealShape = readRevealShape(response.result);
      if (revealShape.kind === 'server_signed') {
        // A reveal signed by the server is not one Core 11.5 attributes to the user; never broadcast.
        throw new Error(t('composer_context_taproot_server_signed_reveal'));
      }
      if (revealShape.kind === 'partial') {
        // Part of a reveal is either one that cannot be checked or a commit whose message never
        // lands.
        throw new Error(t('composer_context_taproot_half_returned'));
      }
      if (revealShape.kind === 'unsigned' && (!requestsTaproot && encoding !== 'taproot')) {
        // Only a request that asked for Taproot gets a reveal to sign.
        throw new Error(t('composer_context_taproot_unexpected_envelope'));
      }
      if (revealShape.kind === 'unsigned') {
        const envelopeScript = revealShape.envelopeScriptHex;
        const kind = envelopeKind(envelopeScript);
        // A commit also carrying a data output, or an ord envelope nobody asked for, is not what
        // core builds for this request.
        if (!kind || counterpartyData || (kind === 'ord' && !dataForApi.inscription)) {
          throw new Error(t('composer_context_taproot_unexpected_envelope'));
        }
        if (kind === 'ord') {
          const expectedMessage = packComposeMessage(composeType, requestedData, undefined, packRules);
          if (!expectedMessage) {
            throw new Error(
              t('composer_context_transaction_verification_failed_this_inscription')
            );
          }
          const envelopeCheck = verifyInscriptionEnvelope(envelopeScript, expectedMessage.bytes);
          if (!envelopeCheck.ok || !envelopeCheck.commitAddress) {
            throw new Error(envelopeCheck.error || t('composer_context_transaction_verification_failed_bad_inscription'));
          }
          taprootCommitAddress = envelopeCheck.commitAddress;
        } else {
          const envelope = readDataEnvelope(envelopeScript);
          if (!envelope.ok || !envelope.commitAddress || !envelope.messageHex) {
            throw new Error(envelope.error || t('composer_context_taproot_unexpected_envelope'));
          }
          taprootCommitAddress = envelope.commitAddress;
          counterpartyData = envelope.messageHex;
        }
        // The wallet signs the reveal with the source key, so its key, commitment, input, outputs
        // and fee are checked before anything is signed.
        const revealCheck = verifyUnsignedReveal(revealShape.reveal, {
          kind,
          ownAddresses: [activeAddress.address],
          sourceAddress: activeAddress.address,
          commitTxHex: response.result.rawtransaction,
          commitAddress: taprootCommitAddress,
          envelopeScriptHex: envelopeScript,
          feeRate: toFiniteNumber(dataForApi.sat_per_vbyte) ?? 0,
        });
        if (!revealCheck.ok) {
          throw new Error(revealCheck.error || t('composer_context_transaction_verification_failed_bad_reveal'));
        }
        revealFee = revealCheck.revealFee;
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
        // it whole, so no field goes unchecked (see `unpack/verify.ts`). A null return means the type cannot be
        // constructed locally and falls through to field comparison; the decoded message supplies
        // only values the request cannot determine (see `Observed` in pack/messages.ts).
        // An MPMA must carry the address table core reads at the block it lands in, whatever
        // else is checked: the recipients decoded from the other table are not the ones core
        // would credit.
        if (unpacked.success && unpacked.messageType === 'mpma_send') {
          const carried = (unpacked.data as { tableFormat?: unknown } | undefined)?.tableFormat;
          if (!mpmaTable) mpmaTable = await resolveMpmaTableFormat();
          if (signal.aborted) return;
          if (!mpmaTable) throw new Error(t('composer_context_mpma_table_format_unconfirmed'));
          if (carried !== mpmaTable.format) {
            throw new Error(t('composer_context_transaction_verification_failed_the_composed'));
          }
        }
        const expected = packComposeMessage(composeType, requestedData, decodedMessage?.data, packRules);

        // An envelope's message is held to the exact bytes of the request, never to field
        // comparison: Taproot is only chosen for messages built locally.
        if (!expected && taprootCommitAddress) {
          throw new Error(t('composer_context_taproot_unexpected_envelope'));
        }

        if (expected) {
          // Any difference is fatal, with no severity gradation: there is no benign reason for a
          // composer to alter a message. counterparty-core treats its own output the same way
          // (`check_transaction_sanity` raises on `tx_data != data`).
          if (bytesToHex(expected.bytes).toLowerCase() !== counterpartyData.toLowerCase()) {
            throw new Error(
              t('composer_context_transaction_verification_failed_the_composed')
            );
          }
        } else {
          // Field comparison covers only fields it was taught about, so it grades severity:
          // informational differences surface on the review screen instead of blocking.
          const verification = verifyTransaction(counterpartyData, composeType, requestedData);

          if (!verification.valid) {
            // In strict mode (default), block the transaction
            // Verification errors are critical security issues
            const errorDetails = verification.errors.join('; ');
            throw new Error(t('composer_context_transaction_verification_failed', [String(errorDetails)]));
          }

          // Differences too minor to block, shown on the review screen so the user can still see them.
          verificationWarnings = verification.warnings;
        }
      } else if (!taprootCommitAddress && packComposeMessage(composeType, requestedData, undefined, packRules)) {
        // No payload, but this request's message can be built — so the transaction carries none of
        // it and cannot do what was asked. Signing it would spend the fee to no effect. Types that
        // legitimately carry no message (a BTC send, a burn) cannot be built and do not reach here,
        // and an inscription's message lives in its envelope rather than an output.
        throw new Error(t('composer_context_transaction_verification_failed_the_composed_2'));
      }
      // A transaction with no payload and no message to expect is a plain BTC spend; its outputs
      // and fee are still checked below.

      // Independently bound the fee for every transaction type (including
      // BTC-only sends with no OP_RETURN), so a drain-to-fee response or a
      // buggy fee estimate is rejected before the review screen.
      const feeCheck = await checkTransactionFee({
        rawTransaction: response.result.rawtransaction,
        // sat_per_vbyte arrives as a form string; checkTransactionFee coerces it.
        userFeeRate: dataForApi.sat_per_vbyte ?? null,
      }, fetchInputValues);
      if (!feeCheck.ok) {
        throw new ComposeVerificationError(
          feeCheck.error || t('composer_context_transaction_fee_verification_failed'),
          feeCheck.diagnostic,
        );
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
            t('composer_context_this_transaction_pays_a_sat', [String(feeCheck.computedFee), String(reportedFee)])
          );
        }
        response = {
          ...response,
          result: { ...response.result, btc_fee: feeCheck.computedFee },
        };
      }

      // Account for every output: each must be the data output, an address the request names, or
      // change to one of our own addresses. Anything else rejects the transaction, so a response
      // that adds a recipient fails closed even though no field-level check covers it (see `unpack/verify.ts`).
      if (activeAddress) {
        const intendedDestinations: IntendedDestination[] =
          addressesNamedIn(dataForApi).map(address => ({ address }));
        // A BTCPay pays an address the request never names — it comes from the order match — so
        // this used to skip output accounting altogether, and an added output went unexamined. The
        // match decides both the payee and the amount (`messages/btcpay.py`), so the wallet reads
        // the match itself and holds the transaction to what it says. Refusing when the match
        // cannot be read is the point: the alternative is accepting the composer's word for where
        // the money goes, which is the thing being guarded against.
        if (composeType === 'btcpay') {
          const matchId = typeof dataForApi.order_match_id === 'string'
            ? dataForApi.order_match_id
            : '';
          const match = matchId ? await fetchOrderMatch(matchId) : null;
          if (!match) {
            throw new Error(t('composer_context_transaction_verification_failed_this_order'));
          }
          const payment = btcPayPayment(match);
          if (!payment) {
            throw new Error(t('composer_context_transaction_verification_failed_neither_side'));
          }
          intendedDestinations.push({ address: payment.address, value: payment.quantity });
        }
        // A Taproot commit output pays an address the request cannot name, but one that was just
        // derived from an envelope verified to carry this request's message — so it is explained
        // by proof rather than by exemption.
        if (taprootCommitAddress) {
          intendedDestinations.push({ address: taprootCommitAddress });
        }
        if (composeType === 'burn') {
          // A burn carries no Counterparty message at all, so the outputs are the only thing that
          // can be checked — and pinning the amount here is the only verification a burn gets.
          for (const address of BURN_ADDRESSES) {
            intendedDestinations.push({ address, value: pinnedQuantity(dataForApi.quantity) });
          }
        }
        // Naming an address is not the same as agreeing to an amount paid to it.
        const accountedFor = withPinnedDestinations(
          intendedDestinations,
          pinnedDestinations(composeType, dataForApi, [activeAddress.address])
        );

        const outputCheck = checkOutputPolicy({
          rawTransaction: response.result.rawtransaction,
          ownAddresses: [activeAddress.address],
          intendedDestinations: accountedFor,
          // The same key the compose request sent as multisig_pubkey (both read the provider), so
          // any data output embedding a different recovery key is a substituted response, not a
          // choice this wallet made. Null when the wallet had no key to send, which turns the
          // check off rather than inventing an expectation.
          expectedRecoveryPubkey: getSourcePubkey(activeAddress.address) ?? undefined,
          // An ownership transfer names its new owner nowhere in the message; the node reads it
          // from the output ahead of the data output.
          positionalDestination: composeType === 'issuance' && typeof dataForApi.transfer_destination === 'string'
            && dataForApi.transfer_destination
            ? dataForApi.transfer_destination
            : undefined,
        });
        if (!outputCheck.ok) {
          throw new ComposeVerificationError(
            outputCheck.error || t('composer_context_transaction_pays_outputs_your_request'),
            outputCheck.diagnostic,
          );
        }
      }

      response = {
        ...response,
        result: {
          ...response.result,
          params: { ...response.result.params, ...verifiedReviewParams(composeType, requestedData, assetInfoCache) },
          // The review states what a two-transaction compose costs in total, so the reveal's share
          // is the one verified above, not anything the response says.
          ...(revealFee !== undefined ? { reveal_fee: revealFee } : {}),
        },
      };

      // Hunt for a ZELD txid last, once every check above has passed, because it edits the
      // transaction: nLockTime becomes the nonce, behind final sequences. The hunt proves that is
      // the only change
      // and records its outcome on the result, so the review describes exactly what gets signed.
      // Skipped rather than failed when it cannot apply, so no transaction is ever blocked by it.
      if (zeldHuntSeconds > 0 && activeWallet) {
        acceptZeldHuntRef.current = new AbortController();
        response = await huntZeldForCompose(response, {
          sourceAddress: activeAddress.address,
          addressFormat: activeWallet.addressFormat,
          publicKeyHex: activeAddress.pubKey,
          walletType: activeWallet.type,
          seconds: zeldHuntSeconds,
          signal,
          acceptEarly: acceptZeldHuntRef.current.signal,
          onProgress: (progress) => {
            if (!signal.aborted) setState(prev => ({ ...prev, zeldHuntProgress: progress }));
          },
        });
        acceptZeldHuntRef.current = null;
      }

      // Final abort check before state update
      if (signal.aborted) return;

      // Track successful compose (form → review)
      void analytics.track('compose');

      // Update state to review step with API response
      setState(prev => ({
        ...prev,
        step: "review" as const,
        formData: userData,
        apiResponse: response,
        error: null,
        verificationWarnings,
        reviewNotices,
        decodedMessage,
        isComposing: false,
        composedAt: Date.now(),
        zeldHuntProgress: null,
      }));
    } catch (error) {
      // Silently ignore abort errors (user navigated away)
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }

      console.error("Compose error:", error);

      let errorMessage = t('composer_context_an_error_occurred_while_composing');
      if (isApiError(error) && error.response?.data && typeof error.response.data === 'object' && 'error' in error.response.data) {
        errorMessage = (error.response.data as { error: string }).error;
      } else if (error instanceof Error) {
        errorMessage = transactionErrorMessage(error) ?? error.message;
      }

      void analytics.track(`compose_error_${classifyTransactionError(errorMessage)}`);

      // Don't update state if aborted
      if (signal.aborted) return;

      setState(prev => ({
        ...prev,
        error: error instanceof ComposeVerificationError ? error : errorMessage,
        isComposing: false,
      }));
    }
  }, [activeAddress, activeWallet, composeApi, composeType, zeldHuntSeconds, state.isComposing]);

  // Core sign and broadcast logic - extracted to avoid duplication
  const performSignAndBroadcast = useCallback(async () => {
    if (!state.apiResponse || !activeAddress) {
      throw new Error(t('composer_context_invalid_transaction_data'));
    }

    const rawTxHex = state.apiResponse.result.rawtransaction;
    // Verified at compose time; read again here so a reviewed response without every reveal field
    // can never be signed as a single transaction.
    const revealShape = readRevealShape(state.apiResponse.result);
    if (revealShape.kind === 'server_signed' || revealShape.kind === 'partial') {
      throw new Error(t('composer_context_taproot_half_returned'));
    }
    const unsignedReveal = revealShape.kind === 'unsigned' ? revealShape : null;
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
      throw new Error(t('composer_context_transaction_replay_detected', [String(replayCheck.reason)]));
    }

    // For hardware wallets, pause idle timer during signing
    const isHardwareWallet = activeWallet?.type === 'hardware';
    if (isHardwareWallet) {
      setHardwareOperationInProgress(true);
    }

    const signal = abortControllerRef.current?.signal;
    signal?.throwIfAborted();
    let signedTxHex: string;
    let revealHex: string | null = null;
    try {
      if (unsignedReveal) {
        // Commit and reveal are signed in one background request under one session guard, so a
        // lock or identity change stops both. Never with a ZELD nonce: the reveal spends the
        // commit's txid.
        const signed = await signCommitAndReveal(rawTxHex, activeAddress.address, {
          revealHex: unsignedReveal.reveal.revealHex,
          envelopeScriptHex: unsignedReveal.envelopeScriptHex,
          controlBlockHex: unsignedReveal.reveal.controlBlockHex,
        }, { psbtHex, inputValues, lockScripts });
        signedTxHex = signed.signedTxHex;
        revealHex = signed.signedRevealHex;
      } else {
        // Signing, including a legacy hunt, stays behind the background session guard.
        signedTxHex = await signTransaction(rawTxHex, activeAddress.address, {
          psbtHex, inputValues, lockScripts,
          ...(activeWallet && huntsWhileSigning(activeWallet.addressFormat, activeWallet.type)
            && state.apiResponse.result.zeld_hunt?.reason === HUNTS_WHILE_SIGNING
            ? { zeldHuntSeconds: state.apiResponse.result.zeld_hunt?.seconds ?? 0 }
            : {}),
        });
      }
    } finally {
      if (isHardwareWallet) setHardwareOperationInProgress(false);
    }
    // Navigating away or changing identity while a hunt/signature is pending must not broadcast.
    signal?.throwIfAborted();
    // The reveal spends the commit by txid. If anything between compose and signature changed the
    // commit, the reveal spends nothing and the commit alone would strand its value, so neither
    // goes out.
    if (unsignedReveal && (!revealHex || !revealSpendsTransaction(revealHex, signedTxHex))) {
      throw new Error(t('composer_context_reveal_no_longer_matches'));
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
    // What this spent and left of the address's ZELD, for approvals to fall back on while the
    // indexer is down or has not yet seen this transaction.
    void recordZeldOutpoints(activeAddress.address,
      zeldRecordAfterBroadcast(signedTxHex, activeAddress.address, state.apiResponse.result));

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

    // A Taproot compose is two transactions: the commit just went out, and the reveal publishes the
    // message. The reveal was checked at compose time against core's construction, signed with the
    // source key only after passing core's attribution rule, and checked again above against the
    // signed commit. It goes out only now, after the commit was accepted, because it spends the
    // commit's output. Without it the message never lands.
    let revealBroadcast: { txid?: string } | undefined;
    if (revealHex) {
      try {
        revealBroadcast = await broadcastTransaction(revealHex);
      } catch (error) {
        // The commit is already on the network and cannot be recalled, so this must not throw:
        // surface it as a warning with the reveal hex so the transaction can still be completed.
        const detail = error instanceof Error ? error.message : String(error);
        const warning = envelopeKind(state.apiResponse.result.envelope_script ?? '') === 'ord'
          ? t('composer_context_the_inscription_s_commit_transaction', [String(detail), String(revealHex)])
          : t('composer_context_the_reveal_was_not_accepted', [String(detail), String(revealHex)]);
        setState(prev => ({
          ...prev,
          verificationWarnings: [...prev.verificationWarnings, warning],
        }));
      }
    }

    // Return the updated apiResponse with broadcast info
    return {
      ...state.apiResponse,
      broadcast: broadcastResponse,
      ...(revealBroadcast ? { revealBroadcast } : {}),
    };
  }, [state.apiResponse, activeAddress, activeWallet, signTransaction, signCommitAndReveal, broadcastTransaction, setHardwareOperationInProgress]);

  // Sign and broadcast transaction
  const signAndBroadcast = useCallback(async () => {
    // Guard: Prevent double-signing race condition
    if (state.isSigning) {
      return;
    }

    if (!state.apiResponse || !activeAddress || !activeWallet) {
      setState(prev => ({ ...prev, error: t('composer_context_invalid_transaction_data') }));
      return;
    }

    // Check for stale transaction (composed too long ago)
    if (state.composedAt && Date.now() - state.composedAt > STALE_TRANSACTION_MS) {
      setState(prev => ({
        ...prev,
        error: t('composer_context_transaction_data_is_stale_please'),
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
      const btcFeeAmount = fromSatoshis(btcFee, { asNumber: true });
      void analytics.track('broadcast', getBtcBucket(btcFeeAmount));

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
      let errorMessage = t('composer_context_failed_to_sign_and_broadcast');
      if (error instanceof Error) {
        errorMessage = transactionErrorMessage(error) ?? error.message;
      }

      void analytics.track(`broadcast_error_${classifyTransactionError(errorMessage)}`);

      // Don't update state if aborted
      if (signal.aborted) return;

      setState(prev => ({
        ...prev,
        error: error instanceof ComposeVerificationError ? error : errorMessage,
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
        reviewNotices: [],
        decodedMessage: null,
      }));
    } else if (state.step === "success") {
      reset();
      void navigate("/index");
    }
  }, [state.step, navigate, reset]);
  
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  const displayedError = state.error instanceof ComposeVerificationError
    ? transactionErrorMessage(state.error) ?? state.error.message
    : state.error;
  const acceptZeldHunt = useCallback(() => {
    acceptZeldHuntRef.current?.abort();
  }, []);

  const contextValue = useMemo(() => ({
    state: {
      ...state,
      error: displayedError,
    },
    composeTransaction,
    signAndBroadcast,
    goBack,
    reset,
    clearError,
    acceptZeldHunt,
    showHelpText,
    toggleHelpText,
    feeRate: state.feeRate,
    setFeeRate,
    activeAddress,
    activeWallet,
    settings,
  }), [
    state,
    displayedError,
    composeTransaction,
    signAndBroadcast,
    goBack,
    reset,
    clearError,
    acceptZeldHunt,
    showHelpText,
    toggleHelpText,
    setFeeRate,
    activeAddress,
    activeWallet,
    settings,
  ]);
  
  return <ComposerContext value={contextValue}>{children}</ComposerContext>;
}
