/**
 * The checks a transaction gets before this wallet will sign it for a website.
 *
 * A PSBT and a raw transaction reach this code by different routes — one is parsed from a PSBT,
 * the other from raw bytes, and they resolve their Counterparty payload differently — but once the
 * payload is in hand, everything that decides whether signing is safe is the same. It used to be
 * written out twice, once per approval hook, with each copy carrying comments explaining that it
 * matched the other. It only takes one fix landing in one copy for the two screens to disagree
 * about whether the same transaction is safe, so they share this instead.
 *
 * Everything here reads the transaction's own bytes. Nothing decides safety from a remote party's
 * account of them (see `unpack/verify.ts`).
 */

import { normalizeAddressForComparison } from '@/core/bitcoin/address';
import {
  type BitcoinPaymentIntentV1,
  type BitcoinPaymentProof,
  proveBitcoinPaymentIntent,
} from '@/core/bitcoin/providerPayment';
import type { DecodedOutput } from '@/core/bitcoin/psbt';
import { scriptPaymentCandidates, scriptPaymentRisk } from '@/core/bitcoin/scriptPaymentRisk';
import { addressHoldsCounterpartyAssets } from '@/core/counterparty/assetHoldings';
import {
  type AttachedAssetDestination,
  movesCounterpartyValue,
  resolveAttachedAssetDestination,
} from '@/core/counterparty/attachedAssetMovement';
import { findUncommittedAssetSignatures } from '@/core/counterparty/durableSellAuthorization';
import type { InputAttachedAssets } from '@/core/counterparty/inputAssets';
import {
  analyzeMarketplaceIntent,
  type MarketplaceApprovalReview,
  type MarketplaceIntentClaimV1,
  type PolicyOfferWalletContext,
} from '@/core/counterparty/marketplaceIntent';
import { checkMessageStructure, type StructureFinding } from '@/core/counterparty/messageStructure';
import { type ProtocolContext, resolveProtocolContext } from '@/core/counterparty/protocolContext';
import {
  type InscriptionCommitContext,
  verifyInscriptionCommit,
} from '@/core/counterparty/providerInscriptions';
import {
  type RevealVerification,
  revealDisclosures,
  revealRefusalText,
  verifyCounterpartyReveal,
} from '@/core/counterparty/providerReveal';
import {
  type CounterpartyMessage,
  decodeCounterpartyMessage,
  describeMpmaSend,
  type MpmaRecipient,
  resolveMpmaRecipients,
} from '@/core/counterparty/transaction';
import {
  analyzeTransactionSafety,
  type SafetyAnalysis,
  type SecurityWarning,
  type VerifiedCommit,
} from '@/core/counterparty/transactionSafety';
import { type ProviderVerificationResult, verifyProviderTransaction } from '@/core/counterparty/unpack';
import type { MPMAData } from '@/core/counterparty/unpack/messages/mpma';
import { getActiveSettings } from '@/core/settings';
import { classifyZeldOutpoints } from '@/core/zeld/protection';
import { t } from '@/i18n';

/** An input being signed, identified by the outpoint it spends. */
export interface AnalyzedInput {
  index?: number;
  txid: string;
  vout: number;
  hasSignatures?: boolean;
  address?: string;
  value?: number;
  sequence?: number;
  /** Script type of the spent prevout. */
  scriptType?: DecodedOutput['type'];
}

/**
 * An output, in the shape every check below needs. Both approval paths already produce this — the
 * PSBT parser and the raw-transaction parser agree on these fields.
 */
export interface AnalyzedOutput {
  index: number;
  value: number;
  type: string;
  address?: string;
  script?: string;
}

export interface SignRequestAnalysisInput {
  /** The Counterparty payload the outputs carry, read from the bytes, or undefined if none. */
  counterpartyDataHex: string | undefined;
  inputs: AnalyzedInput[];
  /** Mutated by neither this function nor its callees; enrichment happens before the call. */
  outputs: AnalyzedOutput[];
  /** Addresses this wallet would sign with. Empty when the caller has none to name. */
  signerAddresses: string[];
  /** Trusted wallet ownership, never addresses asserted by a site. */
  ownedAddresses?: string[];
  /**
   * Indices of the inputs this wallet is being asked to sign. Assets on inputs it does not sign
   * belong to someone else's side of the transaction.
   */
  signedInputIndices: number[];
  /** Effective sighash for every requested input, after request/PSBT/default resolution. */
  signedInputs: Array<{ index: number; sighashType: number }>;
  /** Transaction id, where the caller could establish one. Only the detail lookups use it. */
  transactionId: string | undefined;
  /**
   * The per-input attached-asset lookup, started by the caller before its own decoding so the two
   * overlap. Passed as a promise rather than a value to keep that overlap.
   */
  attachedAssets: Promise<InputAttachedAssets[]>;
  /**
   * The site's claim that this PSBT funds an inscription commit. Verified here, never trusted:
   * on proof, the envelope's message becomes the transaction's Counterparty payload and the
   * commit output is reported instead of flagged; on any failure, the request is hard-blocked
   * with the specific reason.
   */
  inscriptionContext?: InscriptionCommitContext;
  /**
   * The site's signed reveal for a Counterparty Taproot commit this PSBT funds. Verified here,
   * never trusted: on proof, the reveal's message becomes the transaction's Counterparty payload,
   * exactly as an inscription context's does; on any failure, the request is hard-blocked.
   */
  counterpartyReveal?: string;
  /** Provider capability selected before approval; defaults to Counterparty-only. */
  signingPurpose?: 'counterparty' | 'bitcoin-payment';
  /** Required and independently proved for the bitcoin-payment capability. */
  bitcoinPaymentIntent?: BitcoinPaymentIntentV1;
  /** Optional marketplace assertions; every term is proved below before receiving semantic UI. */
  marketplaceIntent?: MarketplaceIntentClaimV1;
  /** Bitcoin transaction header, decoded from the bytes; protocols that pin it prove it. */
  transactionVersion?: number;
  lockTime?: number;
  /** Wallet-supplied policy-offer facts (verified origin, clock, funding settlement). Never a site's. */
  policyOffer?: PolicyOfferWalletContext;
}

export interface SignRequestAnalysis {
  /** The verified inscription commit, when the request carried a context that proved out. */
  verifiedCommit?: VerifiedCommit;
  /** The API's rendering of the message, when it could supply one. Never used to decide safety. */
  counterpartyMessage: CounterpartyMessage | undefined;
  verification: ProviderVerificationResult;
  safety: SafetyAnalysis;
  attachedAssets: InputAttachedAssets[];
  mpmaRecipients: MpmaRecipient[];
  /** Exact local evidence stays unchanged until the approval UI translates the stable code. */
  structureFindings: StructureFinding[];
  protocolContext: ProtocolContext;
  attachedAssetDestination: AttachedAssetDestination | null;
  /** Exact external-output proof for a plain Bitcoin provider request. */
  bitcoinPaymentProof?: BitcoinPaymentProof;
  /** Every reason a plain Bitcoin request is gated, for the payment card to state directly. */
  bitcoinPaymentBlockers?: string[];
  marketplaceReview?: MarketplaceApprovalReview;
}

/**
 * The block a failed marketplace proof raises, led by what the user can do about it. The wallet's
 * internal reasons stay attached as details, never as the headline.
 */
function marketplaceBlockWarning(review: MarketplaceApprovalReview): SecurityWarning {
  const details = review.blockers;
  if (review.status === 'retry') {
    return {
      severity: 'block', code: 'marketplace_retry', data: { details },
      title: 'Retry Required: Counterparty Data Unavailable',
      message: `Counterparty data is temporarily unavailable. Retry in a moment. (${details.join('; ')})`,
    };
  }
  const kind = review.blockKind ?? 'transaction';
  return {
    severity: 'block', code: 'marketplace_blocked', data: { kind, details },
    title: kind === 'ledger' ? 'Blocked: This Listing Changed'
      : kind === 'input_limit' ? 'Blocked: Too Many Inputs to Check'
        : 'Blocked: The Site Described a Different Transaction',
    message: details.join('; '),
  };
}

/**
 * Run every safety check that applies to a transaction a website has asked this wallet to sign.
 *
 * @param input - the transaction, already parsed, with its Counterparty payload resolved
 * @returns the analysis both approval screens render, including any blocking warnings
 */
export async function analyzeSignRequest(
  input: SignRequestAnalysisInput
): Promise<SignRequestAnalysis> {
  const {
    inputs,
    outputs,
    signerAddresses,
    signedInputIndices,
    transactionId,
  } = input;
  let counterpartyDataHex = input.counterpartyDataHex;

  // A commit context is a claim to be proven, and proof changes what the transaction *is*: the
  // envelope's message becomes its Counterparty payload, exactly as though an OP_RETURN carried
  // it. Failure is a hard block with the reason — a site that names an envelope it cannot back
  // has described a different transaction than the one it asked to sign.
  let verifiedCommit: VerifiedCommit | undefined;
  let commitRefusal: string | undefined;
  // The same for a Counterparty commit whose reveal the site holds, except that the proof is the
  // commit output's own key committing to the reveal's single script (providerReveal.ts).
  let revealRefusal: SecurityWarning | undefined;
  let provedReveal: Extract<RevealVerification, { ok: true }> | undefined;
  if (input.counterpartyReveal !== undefined && !input.inscriptionContext) {
    const checked: RevealVerification = counterpartyDataHex
      ? { ok: false, reason: 'two_messages',
          error: 'This transaction carries its own Counterparty message as well as the reveal’s.' }
      : verifyCounterpartyReveal(
          input.counterpartyReveal,
          { transactionId, inputs, outputs },
          signerAddresses,
        );
    if (checked.ok) {
      provedReveal = checked;
      counterpartyDataHex = checked.messageHex;
      verifiedCommit = { address: checked.commitAddress, value: checked.commitValue, kind: 'reveal' };
    } else {
      revealRefusal = {
        code: 'counterparty_reveal_refused',
        data: { reason: checked.reason },
        severity: 'block',
        title: t('safety_blocked_reveal_did_not_verify'),
        message: revealRefusalText(checked.reason),
      };
    }
  }
  if (!counterpartyDataHex && input.inscriptionContext) {
    const signer = signerAddresses[0];
    if (signer) {
      const check = verifyInscriptionCommit(input.inscriptionContext, outputs, signer);
      if (check.ok && check.envelope && check.commitAddress) {
        counterpartyDataHex = check.envelope.messageHex;
        verifiedCommit = { address: check.commitAddress, value: check.commitValue ?? 0, kind: 'inscription' };
      } else {
        commitRefusal = check.error ?? 'The inscription context did not verify.';
      }
    } else {
      commitRefusal = 'The inscription context names no signing address to verify against.';
    }
  }

  // Payments to script addresses the wallet does not control can carry risk for an address
  // holding Counterparty assets. The candidates come from the bytes now; the payer's holdings are
  // looked up alongside the other reads, not after them, and only when there is a candidate.
  const ownedAddresses = [...signerAddresses, ...(input.ownedAddresses ?? [])];
  const scriptPaymentInput = {
    outputs,
    payerAddress: inputs[0]?.address,
    ownedAddresses,
    provenAddresses: verifiedCommit ? [verifiedCommit.address] : [],
  };
  const scriptPayments = revealRefusal ? [] : scriptPaymentCandidates(scriptPaymentInput);
  const payerHoldsAssets = scriptPayments.length > 0
    ? addressHoldsCounterpartyAssets(inputs[0]!.address!)
    : Promise.resolve(false);

  // The API's rendering is for display only — richer than the local unpack, and not trusted by
  // anything below that decides whether signing is safe.
  let counterpartyMessage: CounterpartyMessage | undefined;
  if (counterpartyDataHex) {
    try {
      const message = await decodeCounterpartyMessage(counterpartyDataHex);
      if (message) counterpartyMessage = message;
    } catch (err) {
      console.warn('Failed to decode Counterparty message:', err);
    }
  }

  // Compares the local binary unpack against the API's result; the local one wins.
  const verification = verifyProviderTransaction(counterpartyDataHex, counterpartyMessage);

  const messageType = counterpartyMessage?.messageType ?? verification.localUnpack?.messageType;
  const signingPurpose = input.signingPurpose ?? 'counterparty';
  const safety = analyzeTransactionSafety(messageType, outputs, signerAddresses, {
    verifiedCommit,
    plainBitcoinPayment: signingPurpose === 'bitcoin-payment',
  });

  if (commitRefusal) {
    safety.warnings = [
      {
        severity: 'block',
        title: 'Blocked: Inscription Did Not Verify',
        message:
          `${commitRefusal} The site's description of this inscription could not be proven ` +
          'against the transaction, so it will not be signed.',
      },
      ...safety.warnings,
    ];
    safety.blocked = true;
  }
  if (revealRefusal) {
    safety.warnings = [revealRefusal, ...safety.warnings];
    safety.blocked = true;
  } else if (provedReveal) {
    // A proved reveal fixes its message, not its outputs: say what the outputs decide for this
    // message type, and what the reveal as supplied pays. After any block, ahead of the rest.
    const disclosures = revealDisclosures(provedReveal, verification.localUnpack?.data, ownedAddresses);
    const firstNonBlock = safety.warnings.findIndex(warning => warning.severity !== 'block');
    const split = firstNonBlock === -1 ? safety.warnings.length : firstNonBlock;
    safety.warnings = [...safety.warnings.slice(0, split), ...disclosures, ...safety.warnings.slice(split)];
  }

  // mpma_send is described from the bytes, not from the API's rendering of them — see
  // resolveMpmaRecipients for why the API cannot be used for this type. Without it the screen says
  // "Send to 3 recipients" and names none of them.
  let mpmaRecipients: MpmaRecipient[] = [];
  if (verification.localUnpack?.messageType === 'mpma_send' && verification.localUnpack.data) {
    const sends = (verification.localUnpack.data as MPMAData).sends ?? [];
    if (sends.length > 0) {
      mpmaRecipients = await resolveMpmaRecipients(sends);
      if (counterpartyMessage) {
        counterpartyMessage = {
          ...counterpartyMessage,
          description: describeMpmaSend(mpmaRecipients),
        };
      }
    }
  }

  // Independent of both decoders: does the message's own account of this transaction hold up
  // against the transaction? Uses the local decode, since the point is to test the bytes.
  const structureFindings = checkMessageStructure(
    verification.localUnpack?.messageType,
    verification.localUnpack?.data,
    { inputs, outputs }
  );

  const { context: protocolContext, warnings: policyWarnings } = await resolveProtocolContext({
    messageType: verification.localUnpack?.messageType,
    data: verification.localUnpack?.data,
    transactionId,
    apiMessageData: counterpartyMessage?.messageData,
    outputs,
    signerAddresses,
    spentUtxos: inputs.map((i) => `${i.txid}:${i.vout}`),
  });

  // Policy blocks come from the same lookups as the detail list — an oracle-priced dispenser is
  // only visible once the dispensers behind the paid address have been read.
  if (policyWarnings.length > 0) {
    safety.warnings = [...policyWarnings, ...safety.warnings];
    safety.blocked = safety.blocked || policyWarnings.some((w) => w.severity === 'block');
  }

  const attachedAssets = await input.attachedAssets;

  if (scriptPayments.length > 0) {
    // Assets on the spent UTXOs count too; an input whose lookup failed is unknown, not empty.
    const inputsCarryAssets = attachedAssets.some(entry => entry.assets.length > 0 || entry.lookupFailed);
    const risk = scriptPaymentRisk(scriptPaymentInput, inputsCarryAssets || await payerHoldsAssets);
    if (risk) {
      const btcAmount = (risk.totalSats / 100_000_000).toFixed(8);
      safety.warnings = [
        ...safety.warnings,
        {
          code: 'unproven_script_output',
          data: risk,
          severity: 'warning',
          title: t('safety_unproven_script_output'),
          message: risk.addresses.length === 1
            ? t('safety_unproven_script_output_one', [btcAmount, risk.addresses[0]!, risk.source])
            : t('safety_unproven_script_output_many', [btcAmount, risk.addresses.join(', '), risk.source]),
        },
      ];
    }
  }

  // ZELD rides on the first spendable output. A site's transaction that spends this wallet's
  // ZELD-bearing outputs and pays someone else first would hand them the ZELD. The composer's
  // guard cannot recompose a site's bytes, so while the user hunts ZELD the request is refused
  // with the fix, and once hunting is off it is only pointed out.
  const firstSpendable = outputs.find((output) => output.type !== 'op_return');
  const signerSet = new Set(signerAddresses.map(normalizeAddressForComparison));
  const paysSigner = !!firstSpendable?.address && signerSet.has(normalizeAddressForComparison(firstSpendable.address));
  if (!paysSigner && signerAddresses.length > 0) {
    const signedInputs = signedInputIndices
      .map((index) => inputs[index])
      .filter((entry): entry is AnalyzedInput => !!entry);
    const zeld = await classifyZeldOutpoints(signedInputs, signerAddresses[0]!);
    if (zeld.bearing.length > 0) {
      const count = zeld.bearing.length;
      const hunting = (getActiveSettings().zeldHuntSeconds ?? 0) > 0;
      safety.warnings = [
        ...safety.warnings,
        {
          severity: hunting ? 'block' : 'warning',
          code: 'zeld_would_leave',
          data: { count },
          title: hunting ? 'Blocked: ZELD Would Leave' : 'ZELD Would Leave',
          message:
            `${count} of the outputs this site asks you to spend ${count === 1 ? 'holds' : 'hold'} ZELD, `
            + 'and the transaction pays someone else first, so the ZELD would go to them. '
            + (hunting
              ? 'Move your ZELD to a small output on the ZELD page, then have the site try again.'
              : 'To keep it, move your ZELD to a small output on the ZELD page first.'),
        },
      ];
      if (hunting) safety.blocked = true;
    }
  }

  let bitcoinPaymentProof: BitcoinPaymentProof | undefined;
  let bitcoinPaymentBlockers: string[] | undefined;
  if (signingPurpose === 'bitcoin-payment') {
    const signed = new Set(signedInputIndices);
    const signedAssets = attachedAssets.filter(
      (entry) => signed.has(entry.inputIndex) && entry.assets.length > 0
    );
    const unknownAssetStatus = attachedAssets.filter(
      (entry) => signed.has(entry.inputIndex) && entry.lookupFailed
    );
    const blockers: string[] = [];
    if (counterpartyDataHex) {
      blockers.push('the PSBT carries Counterparty data');
    }
    if (signedAssets.length > 0) {
      blockers.push('a requested input carries attached Counterparty assets');
    }
    if (unknownAssetStatus.length > 0) {
      blockers.push('the wallet could not verify that every requested input is free of attached assets');
    }
    if (!input.bitcoinPaymentIntent) {
      blockers.push('the site supplied no versioned Bitcoin payment intent');
    } else {
      bitcoinPaymentProof = proveBitcoinPaymentIntent(
        input.bitcoinPaymentIntent,
        outputs,
        signerAddresses,
      );
      blockers.push(...bitcoinPaymentProof.errors);
    }
    if (blockers.length > 0) {
      bitcoinPaymentBlockers = blockers;
      safety.warnings = [
        {
          // Tagged so the approval screen can let the payment card be the one failure voice
          // instead of repeating this in its generic warning stack.
          code: 'bitcoin_payment_gate',
          severity: 'block',
          title: unknownAssetStatus.length > 0
            ? 'Retry Required: Asset Status Unknown'
            : 'Blocked: Bitcoin Payment Did Not Verify',
          message:
            `This plain Bitcoin signing request cannot be proved: ${blockers.join('; ')}. ` +
            'No origin or site label can bypass these checks.',
        },
        ...safety.warnings,
      ];
      safety.blocked = true;
    } else if (bitcoinPaymentProof?.proved) {
      // BitcoinPaymentCard shows the exact, full destinations proved against the versioned
      // intent. The generic safety analyzer has only a truncated duplicate; keeping both spends
      // attention without adding a second fact.
      safety.warnings = safety.warnings.filter(
        (warning) => warning.code !== 'expected_btc_payment'
      );
    }
    // The Counterparty-only gate remains the default. Plain Bitcoin signing is reachable only
    // through the separate capability above, never because an origin was allowlisted.
  } else if (
    // A refused reveal already blocks, naming what the site got wrong; "not a Counterparty
    // transaction" would contradict the site's evident intent without adding a reason.
    !revealRefusal
    && !movesCounterpartyValue(Boolean(counterpartyDataHex), attachedAssets, signedInputIndices)
  ) {
    safety.warnings = [
      {
        code: 'counterparty_only_gate',
        severity: 'block',
        title: 'Blocked: Not a Counterparty Transaction',
        message:
          'This carries no Counterparty message and spends nothing holding Counterparty assets, ' +
          'so signing it would move only bitcoin at a site’s direction. Make plain Bitcoin ' +
          'payments in the wallet, where you choose the destination.',
      },
      ...safety.warnings,
    ];
    safety.blocked = true;
  }

  const attachedAssetDestination = resolveAttachedAssetDestination(
    outputs,
    attachedAssets,
    signedInputIndices,
    signerAddresses,
    input.signedInputs,
    verification.localUnpack?.success
      ? {
          messageType: verification.localUnpack.messageType,
          data: verification.localUnpack.data,
        }
      : undefined
  );

  let marketplaceReview: MarketplaceApprovalReview | undefined;
  if (input.marketplaceIntent) {
    marketplaceReview = analyzeMarketplaceIntent({
      intent: input.marketplaceIntent,
      inputs: inputs.map((transactionInput, index) => ({
        ...transactionInput,
        index: transactionInput.index ?? index,
      })),
      outputs,
      signedInputs: input.signedInputs,
      signerAddresses,
      attachedAssets,
      attachedAssetDestination,
      ownedAddresses: input.ownedAddresses,
      hasCounterpartyPayload: Boolean(counterpartyDataHex),
      transactionId,
      transactionVersion: input.transactionVersion,
      lockTime: input.lockTime,
      policyOffer: input.policyOffer,
      localCounterpartyMessage: verification.localUnpack?.success
        && verification.localUnpack.messageType
        ? {
            messageType: verification.localUnpack.messageType,
            data: verification.localUnpack.data,
          }
        : undefined,
    });
    if (marketplaceReview.status === 'blocked' || marketplaceReview.status === 'retry') {
      safety.warnings = [
        marketplaceBlockWarning(marketplaceReview),
        ...safety.warnings,
      ];
      safety.blocked = true;
    } else if (
      marketplaceReview.status === 'proved'
      && (marketplaceReview.family === 'prepare_bulk_fanout' || marketplaceReview.family === 'fund_offers')
    ) {
      // A proved fan-out or offer funding spends clean funding into exact same-wallet outputs.
      // Only its absence of a Counterparty payload is exempt; every other block survives.
      safety.warnings = safety.warnings.filter(warning => warning.code !== 'counterparty_only_gate');
      safety.blocked = safety.warnings.some(warning => warning.severity === 'block');
    } else if (
      marketplaceReview.status === 'caution'
      && marketplaceReview.family === 'fund_policy_offer'
    ) {
      // A proved policy-offer parent carries no Counterparty message by design, and its two
      // outputs that are not the bidder's — the offer output rebuilt from the bidder's own key and
      // the named market key's leaf, and the anchor returned to itself — are exactly what the
      // review states. Those findings are exempt; every other block (ZELD included) survives.
      // The offer output is a script address, but its one leaf is rebuilt byte for byte from
      // the bidder's own key and the named market key, so the script-address caution does not
      // apply to it.
      safety.warnings = safety.warnings.filter(
        warning => warning.code !== 'counterparty_only_gate' && warning.code !== 'external_btc_output'
          && warning.code !== 'unproven_script_output',
      );
      safety.blocked = safety.warnings.some(warning => warning.severity === 'block');
    } else if (
      (marketplaceReview.status === 'proved' || marketplaceReview.status === 'caution')
      && (
        marketplaceReview.family === 'buy_listings'
        || marketplaceReview.family === 'authorize_exact_offer'
        || marketplaceReview.family === 'accept_exact_offer'
        || marketplaceReview.family === 'accept_policy_offer'
      )
    ) {
      // These semantic cards prove the exact delivery output, attached asset, payments, and
      // signature scope. The generic warnings are intentionally alarming because they lack those
      // facts; once independently established, keeping them trains users to ignore red warnings.
      safety.warnings = safety.warnings.filter(
        warning => warning.code !== 'detach_all' && warning.code !== 'external_btc_output',
      );
      if (
        'delivery' in input.marketplaceIntent
        && input.marketplaceIntent.delivery.mode === 'attached'
        && (
          marketplaceReview.family === 'buy_listings'
          || marketplaceReview.family === 'authorize_exact_offer'
        )
      ) {
        // In these two roles the wallet signs clean buyer funding, while the exact transaction also
        // spends a seller's proved attached asset. There is intentionally no Counterparty message:
        // Core moves that one asset to output 0. The semantic proof is the narrow exception to the
        // provider's usual Counterparty-only gate.
        safety.warnings = safety.warnings.filter(
          warning => warning.code !== 'counterparty_only_gate',
        );
      }
      safety.blocked = safety.warnings.some(warning => warning.severity === 'block');
    }
  }

  // Last, so no marketplace family's warning filter can remove it: a SINGLE/NONE signature over
  // an asset-bearing (or unverifiable) input is a durable offer to sell that asset to whoever
  // holds the signature. Only a proved listing may ask for one (`durableSellAuthorization.ts`).
  const durableSellInputs = findUncommittedAssetSignatures(
    attachedAssets,
    input.signedInputs,
    marketplaceReview,
  );
  if (durableSellInputs.length > 0) {
    const inputList = durableSellInputs.map(index => `#${index}`).join(', ');
    // After any existing blocks, which name a more specific failure (a disproved marketplace
    // claim, a sweep), and ahead of everything that does not block.
    const firstNonBlock = safety.warnings.findIndex(warning => warning.severity !== 'block');
    const split = firstNonBlock === -1 ? safety.warnings.length : firstNonBlock;
    safety.warnings = [
      ...safety.warnings.slice(0, split),
      {
        code: 'durable_sell_authorization',
        data: { inputs: durableSellInputs },
        severity: 'block',
        title: t('safety_blocked_durable_sell_authorization'),
        message: t('safety_durable_sell_authorization_detail', inputList),
      },
      ...safety.warnings.slice(split),
    ];
    safety.blocked = true;
  }

  return {
    verifiedCommit,
    counterpartyMessage,
    verification,
    safety,
    attachedAssets,
    mpmaRecipients,
    structureFindings,
    protocolContext,
    attachedAssetDestination,
    bitcoinPaymentProof,
    bitcoinPaymentBlockers,
    marketplaceReview,
  };
}
