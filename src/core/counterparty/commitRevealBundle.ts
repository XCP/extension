/**
 * Parse and prove a Counterparty commit/reveal pair before signing either transaction.
 * Checks bind the funding, envelope, source key, outputs and fees to the reviewed bytes.
 * The decoder separately verifies API support and the published message.
 */

import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { SigHash, TAPROOT_UNSPENDABLE_KEY, TaprootControlBlock, type Transaction } from '@scure/btc-signer';
import { tapLeafHash } from '@scure/btc-signer/payment.js';
import { decodeAddressFromScript, sameAddress } from '@/core/bitcoin/address';
import { DEFAULT_SEQUENCE } from '@/core/bitcoin/constants';
import { exceedsSaneFeeRate } from '@/core/bitcoin/feeVerification';
import { extractPsbtDetails, type PsbtDetails, parsePSBT, resolvePsbtSighashType, spendsTaprootOutput } from '@/core/bitcoin/psbt';
import type { PsbtBundleReview } from '@/core/bitcoin/psbtBundleTypes';
import { parseTransactionForSigning } from '@/core/bitcoin/rawTransaction';
import {
  absoluteLockSatisfied,
  belowMinRelayFee,
  type ChainFinalityContext,
  dustThresholdSats,
  isStandardVersion,
  lockTimeInForce,
  relativeLockInForce,
} from '@/core/bitcoin/relayPolicy';
import { satsValue } from '@/core/counterparty/marketplace/format';
import { parseMarketplaceIntent } from '@/core/counterparty/marketplace/intentParser';
import type { MarketplaceApprovalReview, MarketplaceIntentClaimV1 } from '@/core/counterparty/marketplace/intentTypes';
import {
  checkRevealSourceSignature,
  sourceControlsKey,
  sourceOutputScript,
  TAPSCRIPT_LEAF_VERSION,
} from '@/core/counterparty/revealSourceRule';
import { unpackCounterpartyMessage } from '@/core/counterparty/unpack';
import { extractPayloadFromOutputs } from '@/core/counterparty/unpack/opReturn';
import { extractDataEnvelopeMessage, extractEnvelopeMessage, REVEAL_MARKER_SCRIPT } from '@/core/counterparty/unpack/ordEnvelope';
import { isRecord } from '@/core/isRecord';
import { toSafeInteger } from '@/core/numeric';
import { t } from '@/i18n';

/** The claim standard of the two `commit-and-reveal` items that are not marketplace actions. */
export const COMMIT_REVEAL_STANDARD = 'counterparty-reveal';

/** Item 1: the unsigned reveal, which the wallet signs with the source key. */
export interface RevealIntentClaim {
  standard: typeof COMMIT_REVEAL_STANDARD;
  version: 1;
  action: 'sign_reveal';
}

/** Item 0 when the site names no marketplace action: the commit that funds the reveal. */
export interface CommitIntentClaim {
  standard: typeof COMMIT_REVEAL_STANDARD;
  version: 1;
  action: 'fund_commit';
}

export type CommitRevealIntentClaim = RevealIntentClaim | CommitIntentClaim;

const REVEAL_INTENT: RevealIntentClaim = { standard: COMMIT_REVEAL_STANDARD, version: 1, action: 'sign_reveal' };
const COMMIT_INTENT: CommitIntentClaim = { standard: COMMIT_REVEAL_STANDARD, version: 1, action: 'fund_commit' };

/** Whether a request's intent claims the reveal half of a `commit-and-reveal` bundle. */
export function isRevealIntentClaim(value: unknown): boolean {
  return isRecord(value) && value.standard === COMMIT_REVEAL_STANDARD && value.action === 'sign_reveal';
}

/** Whether a stored item is the reveal half, the one item signed by script path. */
export const isStoredRevealIntent = (intent: { action: string } | undefined): boolean =>
  intent?.action === 'sign_reveal';

const exactClaim = (value: Record<string, unknown>, action: string, label: string): void => {
  const keys = Object.keys(value).sort((a, b) => a < b ? -1 : a > b ? 1 : 0).join(',');
  if (value.standard !== COMMIT_REVEAL_STANDARD || value.version !== 1 || value.action !== action
    || keys !== 'action,standard,version') {
    throw new Error(`${label} must be exactly { standard: '${COMMIT_REVEAL_STANDARD}', version: 1, action: '${action}' }`);
  }
};

/**
 * Parse the two untrusted intents of a `commit-and-reveal` bundle: an optional marketplace intent
 * (or the explicit commit claim) on the commit, and the reveal claim on the reveal.
 */
export function parseCommitRevealIntents(commitValue: unknown, revealValue: unknown): {
  commit: MarketplaceIntentClaimV1 | CommitIntentClaim;
  reveal: RevealIntentClaim;
} {
  if (!isRecord(revealValue)) throw new Error('commit-and-reveal request 1 intent must be an object');
  exactClaim(revealValue, 'sign_reveal', 'commit-and-reveal request 1 intent');
  if (commitValue === undefined || commitValue === null) return { commit: COMMIT_INTENT, reveal: REVEAL_INTENT };
  if (isRecord(commitValue) && commitValue.standard === COMMIT_REVEAL_STANDARD) {
    exactClaim(commitValue, 'fund_commit', 'commit-and-reveal request 0 intent');
    return { commit: COMMIT_INTENT, reveal: REVEAL_INTENT };
  }
  const commit = parseMarketplaceIntent(commitValue);
  // A policy-offer funding set is proved only as its own bundle, and an exact-offer acceptance
  // leaves the buyer's input unsigned, which a commit funded only by the signer cannot have.
  if (commit.action === 'fund_policy_offer' || commit.action === 'accept_exact_offer') {
    throw new Error(`${commit.action} cannot fund a commit-and-reveal bundle`);
  }
  return { commit, reveal: REVEAL_INTENT };
}

/** One stored item of the bundle, as the provider recorded it. */
export interface CommitRevealItem {
  psbtHex: string;
  signInputs: Record<string, number[]>;
  sighashTypes: number[];
}

/** One output of the reveal as the site built it, as the review states it. */
export interface RevealOutputFact {
  index: number;
  /** Sats. */
  value: number;
  /** Undefined for a script no address describes. */
  address?: string;
  /** The bare CNTRPRTY marker Core reads the envelope by. */
  marker: boolean;
  /** Pays the signing address. */
  owned: boolean;
  /** Pays a well-known burn address: no one can spend it. */
  burn: boolean;
}

/** What the proof establishes about the pair, for the review and the signer. */
export interface CommitRevealEvidence {
  /** The address the message is published from, which signs both transactions. */
  sourceAddress: string;
  /** The reveal's unsigned transaction. */
  revealTxHex: string;
  /** The reveal as it will be broadcast, with a 64-byte placeholder where the signature goes. */
  placeholderRevealHex: string;
  envelopeHex: string;
  controlBlockHex: string;
  envelope: 'ord' | 'data';
  /** The sighash the reveal's input 0 is signed with: DEFAULT or ALL. */
  revealSighash: number;
  /** Every output of the reveal, as built. */
  revealOutputs: RevealOutputFact[];
  /** Sats. */
  commitFee: number;
  revealFee: number;
  commitValue: number;
}

export interface CommitRevealProof {
  /** Every reason the pair is refused; empty when it proved. */
  blockers: string[];
  /** A binding absolute locktime needs chain context; missing context must never permit signing. */
  needsChainContext?: boolean;
  evidence?: CommitRevealEvidence;
}


/**
 * Addresses whose outputs no one can spend, which a reveal may pay its inscription's dust to:
 * Counterparty's own mainnet burn address. Named on the review so the loss is plain.
 */
const BURN_ADDRESSES = new Set(['1CounterpartyXXXXXXXXXXXXXXXUWLpVr']);

/** The one tapleaf and control block a reveal PSBT's input 0 carries, when it carries exactly one. */
function readRevealLeaf(reveal: Transaction): { leaf: Uint8Array; controlBlock: Uint8Array; version: number } | null {
  const leaves = reveal.getInput(0).tapLeafScript ?? [];
  if (leaves.length !== 1) return null;
  const [control, scriptWithVersion] = leaves[0]!;
  if (scriptWithVersion.length < 2) return null;
  return {
    leaf: scriptWithVersion.subarray(0, -1),
    version: scriptWithVersion[scriptWithVersion.length - 1]!,
    controlBlock: TaprootControlBlock.encode(control),
  };
}

/**
 * The Counterparty message an envelope carries, read as Core reads it: an ord envelope's `xcp`
 * metadata (with its content and MIME type), or a plain data envelope's pushes. Null when the leaf
 * carries no message the wallet can decode and show.
 */
function envelopeMessage(leaf: Uint8Array): { kind: 'ord' | 'data'; messageHex: string } | null {
  const ord = extractEnvelopeMessage(leaf);
  const kind = ord ? 'ord' : 'data';
  const messageHex = ord?.messageHex ?? extractDataEnvelopeMessage(leaf);
  if (!messageHex) return null;
  const unpacked = unpackCounterpartyMessage(messageHex);
  return unpacked.success && unpacked.messageType ? { kind, messageHex } : null;
}

const hasSignatureMaterial = (input: ReturnType<Transaction['getInput']>): boolean => Boolean(
  input.tapKeySig || input.partialSig?.length || input.tapScriptSig?.length
  || input.finalScriptSig?.length || input.finalScriptWitness?.length,
);

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => bytesToHex(a) === bytesToHex(b);

/** Every requested input index, flattened, and whether the request names exactly `address`. */
function signerOf(signInputs: Record<string, number[]>, address: string): number[] | null {
  const entries = Object.entries(signInputs);
  if (entries.length !== 1 || !sameAddress(entries[0]![0], address)) return null;
  return entries[0]![1];
}

/** The commit's checks: funded only by the signer, over P2WPKH/P2TR inputs, with no message of its own. */
function commitBlockers(commit: CommitRevealItem, details: PsbtDetails, source: string): string[] {
  const blockers: string[] = [];
  const indices = signerOf(commit.signInputs, source);
  if (!indices) blockers.push('the commit must be signed by the one address that signs the reveal');
  const all = details.inputs.map(input => input.index);
  if (!indices || indices.length !== all.length || new Set(indices).size !== all.length
    || !all.every(index => indices.includes(index))) {
    blockers.push('the commit must be funded only by inputs this wallet signs');
  }
  for (const input of details.inputs) {
    if (input.scriptType !== 'p2wpkh' && input.scriptType !== 'p2tr') {
      blockers.push(`commit input ${input.index} is not P2WPKH or P2TR, so the commit's txid is not the one the reveal spends`);
    } else if (!sameAddress(input.address, source)) {
      blockers.push(`commit input ${input.index} is not the signing address's`);
    }
    if (input.value === undefined) blockers.push(`commit input ${input.index} has no prevout amount`);
    if (input.hasSignatures) blockers.push(`commit input ${input.index} is already signed`);
    if (input.tapLeafScripts?.length) blockers.push(`commit input ${input.index} carries a script path`);
    const sighash = resolvePsbtSighashType(commit.sighashTypes[input.index], input.sighashType, spendsTaprootOutput(input));
    const allowed: number[] = input.scriptType === 'p2tr' ? [SigHash.DEFAULT, SigHash.ALL] : [SigHash.ALL];
    if (!allowed.includes(sighash)) {
      blockers.push(`commit input ${input.index} must be signed with SIGHASH_ALL${input.scriptType === 'p2tr' ? ' or SIGHASH_DEFAULT' : ''}`);
    }
  }
  const firstTxid = details.inputs[0]?.txid;
  if (firstTxid && extractPayloadFromOutputs(details.outputs.map(output => output.script ?? ''), firstTxid)) {
    blockers.push('the commit carries a Counterparty message of its own');
  }
  if (details.unfunded || details.fee <= 0) blockers.push('the commit does not pay a fee from its own inputs');
  const output = details.outputs[0];
  if (!output?.script || output.type !== 'p2tr') blockers.push('commit output 0 is not a Taproot output');
  return blockers;
}

/**
 * Prove a `commit-and-reveal` pair from its own bytes. Pure: the chain, the message's meaning and
 * the API version are the decoder's to check.
 *
 * The envelope and the reveal may be Core's or the site's own. What the wallet requires of them is
 * what makes the signature it gives mean exactly the message it shows, and nothing else:
 * Core 11.5's source-signature rule (a canonical envelope leaf, committed under tapscript as the
 * commit output's only leaf, closed by a key of the signing address), a message the wallet decodes,
 * the CNTRPRTY marker Core reads the envelope by, a commit output whose key path is no one's or the
 * user's own, a sane fee, and a reveal nodes relay and can mine as soon as the commit confirms (no
 * timelock in force, no dust output, at least the minimum relay fee).
 *
 * @param sourceAddress - the request's signing address, the one active when the site asked
 */
export function proveCommitAndReveal(
  commit: CommitRevealItem,
  reveal: CommitRevealItem,
  sourceAddress: string,
  chain?: ChainFinalityContext,
): CommitRevealProof {
  let commitTx: Transaction;
  let revealTx: Transaction;
  let details: PsbtDetails;
  try {
    commitTx = parsePSBT(commit.psbtHex);
    details = extractPsbtDetails(commit.psbtHex);
  } catch {
    return { blockers: ['the commit PSBT could not be read'] };
  }
  try {
    revealTx = parsePSBT(reveal.psbtHex);
  } catch {
    return { blockers: ['the reveal PSBT could not be read'] };
  }
  const sourceScript = sourceOutputScript(sourceAddress);
  if (!sourceScript || !(
    (sourceScript.length === 22 && sourceScript[0] === 0x00)
    || (sourceScript.length === 34 && sourceScript[0] === 0x51))) {
    return { blockers: ['only a Native SegWit or Taproot address signs a Taproot reveal'] };
  }

  const blockers = commitBlockers(commit, details, sourceAddress);
  let needsChainContext = false;

  // The reveal: one input, spending commit output 0 as the commit's own bytes describe it.
  const commitOutput = commitTx.outputsLength > 0 ? commitTx.getOutput(0) : undefined;
  if (revealTx.inputsLength !== 1) {
    blockers.push('the reveal must spend exactly one output');
    return { blockers };
  }
  const input = revealTx.getInput(0);
  if (!input.txid || bytesToHex(input.txid) !== commitTx.id || input.index !== 0) {
    blockers.push('the reveal does not spend output 0 of this commit');
  }
  const prevout = input.witnessUtxo;
  if (!prevout || !commitOutput?.script || commitOutput.amount === undefined
    || !sameBytes(prevout.script, commitOutput.script) || prevout.amount !== commitOutput.amount) {
    blockers.push('the reveal’s witnessUtxo is not commit output 0');
  }
  if (input.nonWitnessUtxo) blockers.push('the reveal names its prevout by nonWitnessUtxo; a commit not yet broadcast has only witnessUtxo');
  if (hasSignatureMaterial(input)) blockers.push('the reveal is already signed');
  const revealIndices = signerOf(reveal.signInputs, sourceAddress);
  if (!revealIndices || revealIndices.length !== 1 || revealIndices[0] !== 0) {
    blockers.push('the reveal must ask the signing address to sign input 0 only');
  }
  const revealSighash = reveal.sighashTypes[0];
  if (reveal.sighashTypes.length !== 1 || (revealSighash !== SigHash.DEFAULT && revealSighash !== SigHash.ALL)
    || (input.sighashType !== undefined && input.sighashType !== revealSighash)) {
    blockers.push('the reveal must be signed with SIGHASH_DEFAULT or SIGHASH_ALL');
  }
  // Once the commit confirms, the reveal is the only spend of its output the user holds, so it must
  // be able to confirm right after it: a relayed version, and no timelock still to run.
  if (!isStandardVersion(revealTx.version)) {
    blockers.push(`the reveal’s transaction version ${revealTx.version} is not relayed`);
  }
  const sequence = input.sequence ?? DEFAULT_SEQUENCE;
  if (lockTimeInForce(revealTx.lockTime, [sequence])) {
    if (!chain) {
      needsChainContext = true;
    } else if (!absoluteLockSatisfied(revealTx.lockTime, chain)) {
      blockers.push('the reveal’s absolute locktime is not yet satisfied by the Bitcoin chain');
    }
  }
  if (relativeLockInForce(revealTx.version, sequence)) {
    blockers.push('the reveal’s input sequence delays it past the commit’s confirmation');
  }

  const leaf = readRevealLeaf(revealTx);
  if (!leaf) {
    blockers.push('the reveal must carry exactly one tapleaf, the envelope');
    return { blockers };
  }
  if (leaf.version !== TAPSCRIPT_LEAF_VERSION) blockers.push('the envelope leaf is not a tapscript leaf');
  if (leaf.controlBlock.length !== 33) blockers.push('the envelope must be the commit output’s only leaf');
  const message = envelopeMessage(leaf.leaf);
  if (!message) {
    blockers.push('the envelope carries no Counterparty message this wallet can read');
    return { blockers };
  }
  if (!commitOutput?.script || commitOutput.amount === undefined) return { blockers };

  // Core 11.5's source-signature rule, with a placeholder where the signature goes: a canonical
  // envelope leaf, committed under tapscript to commit output 0 by exactly this control block (so it
  // is that output's only leaf), and closed by a key of the signing address.
  const rule = checkRevealSourceSignature(commitOutput.script, sourceScript, [new Uint8Array(64), leaf.leaf, leaf.controlBlock]);
  if (!rule.ok) {
    blockers.push(rule.error === 'source_key_mismatch'
      ? 'the envelope is not closed by your address’s key, so the reveal would not publish from it'
      : `the reveal would not be attributed to your address: ${rule.detail}`);
    return { blockers };
  }
  // The commit output's key path: Core closes it with the envelope's own key, a site with the
  // unspendable point. Any other key could spend the output around the reveal.
  const internalKey = leaf.controlBlock.slice(1, 33);
  if (!sameBytes(internalKey, rule.leafKey) && !sameBytes(internalKey, TAPROOT_UNSPENDABLE_KEY)
    && !sourceControlsKey(sourceScript, internalKey)) {
    blockers.push('the commit output can be spent by a key that is neither yours nor unspendable');
  }

  // The reveal's outputs as built: the bare marker Core reads the envelope by, and whatever else the
  // site pays, each stated on the review.
  const revealOutputs: RevealOutputFact[] = [];
  let paid = 0n;
  for (let index = 0; index < revealTx.outputsLength; index += 1) {
    const output = revealTx.getOutput(index);
    const script = output.script ? bytesToHex(output.script) : '';
    const amount = output.amount ?? 0n;
    paid += amount;
    if (amount < BigInt(dustThresholdSats(output.script ?? new Uint8Array()))) {
      blockers.push(`reveal output ${index} is below the dust threshold for its script, so the reveal would not be relayed`);
    }
    const address = script && !script.startsWith('6a') ? decodeAddressFromScript(script) ?? undefined : undefined;
    revealOutputs.push({
      index,
      value: toSafeInteger(amount) ?? 0,
      ...(address ? { address } : {}),
      marker: script === REVEAL_MARKER_SCRIPT,
      owned: !!address && sameAddress(address, sourceAddress),
      burn: !!address && BURN_ADDRESSES.has(address),
    });
  }
  if (!revealOutputs.some(output => output.marker && output.value === 0)) {
    blockers.push('the reveal lacks the bare CNTRPRTY marker, so Counterparty would not read it');
  }
  if (revealOutputs.some(output => output.marker && output.value !== 0)) {
    blockers.push('every CNTRPRTY marker output must have zero value');
  }

  // Its fee is the commit output less what it pays, at a sane rate for its size once signed (a
  // 65-byte signature, the larger of the two sighashes), and at least the minimum relay rate for
  // its size with the signature its sighash makes.
  const revealTxHex = bytesToHex(revealTx.unsignedTx);
  const sized = parseTransactionForSigning(revealTxHex);
  sized.updateInput(0, { finalScriptWitness: [new Uint8Array(65), leaf.leaf, leaf.controlBlock] }, true);
  const placeholder = parseTransactionForSigning(revealTxHex);
  placeholder.updateInput(0, { finalScriptWitness: [new Uint8Array(64), leaf.leaf, leaf.controlBlock] }, true);
  const revealFee = toSafeInteger(commitOutput.amount - paid);
  if (revealFee === undefined || revealFee < 0) {
    blockers.push('the reveal spends more than the commit output provides');
  } else if (exceedsSaneFeeRate(revealFee, sized.vsize)) {
    blockers.push('the reveal pays a fee far above any sane rate');
  } else if (belowMinRelayFee(revealFee, revealSighash === SigHash.ALL ? sized.vsize : placeholder.vsize)) {
    blockers.push('the reveal pays less than the minimum relay fee, so it would not be relayed');
  }

  return {
    blockers,
    ...(needsChainContext ? { needsChainContext: true } : {}),
    evidence: {
      sourceAddress,
      revealTxHex,
      placeholderRevealHex: placeholder.hex,
      envelopeHex: bytesToHex(leaf.leaf),
      controlBlockHex: bytesToHex(leaf.controlBlock),
      envelope: message.kind,
      revealSighash: revealSighash ?? SigHash.DEFAULT,
      revealOutputs,
      commitFee: details.fee,
      revealFee: revealFee ?? 0,
      commitValue: toSafeInteger(commitOutput.amount) ?? 0,
    },
  };
}

/** The leaf hash a reveal signature commits to, for the PSBT's `tapScriptSig` key. */
export const envelopeLeafHash = (envelopeHex: string): Uint8Array =>
  tapLeafHash(hexToBytes(envelopeHex), TAPSCRIPT_LEAF_VERSION);

export interface CommitRevealReviewInput {
  proof: CommitRevealProof;
  /** Refusals from outside the pair's bytes: the API version, the commit's own review. */
  blockers: string[];
  /** Lookups that failed and may succeed on a retry. */
  retry: string[];
  /** Whether the commit's review read the envelope's message as its Counterparty action. */
  messageShown: boolean;
  /** The decoded message, in the review's words, when the wallet could describe it. */
  messageDescription?: string;
  /** The commit's marketplace review, when the site claimed a marketplace action. */
  marketplaceReview?: MarketplaceApprovalReview;
}

/** One reveal output, as the review names it: the marker, or who it pays and what. */
function revealOutputFact(output: RevealOutputFact): MarketplaceApprovalReview['facts'][number] {
  const label = t('commit_reveal_reveal_output', String(output.index));
  const amount = satsValue(output.value);
  if (output.marker) return { kind: 'text', label, value: t('commit_reveal_output_marker') };
  if (!output.address) return { kind: 'text', label, value: t('commit_reveal_output_unknown', amount) };
  return {
    kind: 'address', label, value: output.address,
    description: output.owned ? t('commit_reveal_output_yours', amount)
      : output.burn ? t('commit_reveal_output_burn', amount)
        : t('commit_reveal_output_external', amount),
  };
}

/** The bundle's review: the message, who publishes it, and what each transaction pays the network. */
export function commitRevealReview(input: CommitRevealReviewInput): PsbtBundleReview {
  const { proof, marketplaceReview } = input;
  const blockers = [
    ...proof.blockers,
    ...input.blockers,
    ...(!input.messageShown && proof.evidence ? ['the reveal’s message could not be shown as the commit’s action'] : []),
    ...(marketplaceReview?.status === 'blocked' ? marketplaceReview.blockers.map(problem => `commit: ${problem}`) : []),
  ];
  const retry = [
    ...input.retry,
    ...(proof.needsChainContext ? ['the Bitcoin chain tip could not be checked for the reveal’s locktime; try again'] : []),
    ...(marketplaceReview?.status === 'retry' ? marketplaceReview.blockers.map(problem => `commit: ${problem}`) : []),
  ];
  const status = blockers.length > 0 || !proof.evidence ? 'blocked'
    : retry.length > 0 ? 'retry'
      : marketplaceReview?.status === 'caution' ? 'caution' : 'proved';
  const evidence = proof.evidence;
  const facts: MarketplaceApprovalReview['facts'] = evidence ? [
    ...(input.messageDescription
      ? [{ kind: 'text' as const, label: t('commit_reveal_message'), value: input.messageDescription }]
      : []),
    { kind: 'address' as const, label: t('commit_reveal_published_from'), value: evidence.sourceAddress },
    {
      kind: 'amount' as const, label: t('commit_reveal_commit_fee'), value: satsValue(evidence.commitFee),
      description: t('commit_reveal_commit_fee_description'),
    },
    {
      kind: 'amount' as const, label: t('commit_reveal_reveal_fee'), value: satsValue(evidence.revealFee),
      description: t('commit_reveal_reveal_fee_description', satsValue(evidence.commitValue)),
    },
    ...(marketplaceReview && (marketplaceReview.status === 'proved' || marketplaceReview.status === 'caution')
      ? marketplaceReview.facts : []),
    ...evidence.revealOutputs.map(output => revealOutputFact(output)),
    { kind: 'paragraph' as const, label: t('commit_reveal_signing'), value: t('commit_reveal_signing_detail') },
  ] : [];
  return {
    status,
    family: 'commit_and_reveal',
    title: t('commit_reveal_title'),
    facts,
    notices: [],
    blockers: [...blockers, ...retry],
  };
}
