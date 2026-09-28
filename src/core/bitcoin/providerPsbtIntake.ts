/**
 * Pure checks a site's PSBT signing request passes before it reaches review. xcp_signPsbts runs
 * them per linked request and xcp_signPsbt / xcp_signBitcoinPsbt once, each in its own order and
 * with its own wording: the checks answer a question, and the caller turns the answer into the
 * -32602 message its method documents.
 */
import {
  type PsbtDetails, resolvePsbtSighashType, spendsTaprootOutput, tapLeafOwnerAddress, validateSignInputs,
} from '@/core/bitcoin/psbt';
import { marketplaceTransactionHeaderProblem } from '@/core/counterparty/marketplace/proofs';
import type { ProviderPsbtSigningRequestShape } from '@/core/providerCapabilities';

const SIGHASH_SINGLE_ANYONECANPAY = 0x83;

/** Why the PSBT's version or locktime does not fit the marketplace action it claims, or null. */
export const psbtHeaderProblem = (
  intent: { action: string; protocolVersion?: string },
  details: Pick<PsbtDetails, 'transactionVersion' | 'lockTime'>,
): string | null => marketplaceTransactionHeaderProblem(intent, details.transactionVersion, details.lockTime);

/**
 * Whether every input carries an authenticated prevout amount and the PSBT is funded. A listing's
 * null-buyer placeholder is the one exception: its input 0 is the buyer's, filled in later.
 */
export function hasAuthenticatedFunding(
  details: Pick<PsbtDetails, 'inputs' | 'unfunded'>,
  { nullBuyerPlaceholder = false }: { nullBuyerPlaceholder?: boolean } = {},
): boolean {
  const missingPrevout = details.inputs.some((input, inputIndex) =>
    input.value === undefined && !(nullBuyerPlaceholder && inputIndex === 0));
  return (nullBuyerPlaceholder || !details.unfunded) && !missingPrevout;
}

/** Whether the request names more sighash entries than the PSBT has inputs. */
export const hasExcessSighashEntries = (
  sighashTypes: readonly number[],
  details: Pick<PsbtDetails, 'inputs'>,
): boolean => sighashTypes.length > details.inputs.length;

/** Whether a SINGLE|ANYONECANPAY entry sits at an index with no output to commit to. */
export const usesSingleWithoutOutput = (
  sighashTypes: readonly number[],
  details: Pick<PsbtDetails, 'outputs'>,
): boolean => sighashTypes.some(
  (value, index) => value === SIGHASH_SINGLE_ANYONECANPAY && index >= details.outputs.length,
);

/**
 * Check each signer against the wallet's allowed addresses and the input it names. Ownership per
 * input is normally the prevout's own address, but an inscription reveal spends a commit output
 * whose address belongs to nobody; there the input is owned by whoever the declared leaf's
 * checksig key encodes to (tapLeafOwnerAddress).
 */
export const checkSignInputOwners = (
  signInputs: Record<string, number[]>,
  allowedAddresses: string[],
  details: Pick<PsbtDetails, 'inputs'>,
): { valid: boolean; error?: string } => validateSignInputs(
  signInputs,
  allowedAddresses,
  details.inputs.length,
  details.inputs.map(input => tapLeafOwnerAddress(input) ?? input.address),
);

/** The requested inputs with no sighash entry; sighashTypes is indexed by absolute input index. */
export const missingSighashEntries = (
  requestedInputIndices: readonly number[],
  sighashTypes: readonly number[],
): number[] => requestedInputIndices.filter(inputIndex => sighashTypes[inputIndex] === undefined);

/**
 * The request as the wallet's PSBT signing capability sees it. A requested input's sighash is the
 * one the signer will use; an unselected input's entry describes a signature someone else made.
 * Only the hardware contract checks that one, so it keeps the ALL fallback that contract expects.
 */
export function psbtSigningRequestShape(
  details: Pick<PsbtDetails, 'inputs'>,
  requestedInputIndices: number[] | undefined,
  sighashTypes: readonly number[] | undefined,
): ProviderPsbtSigningRequestShape {
  const requested = new Set(requestedInputIndices ?? []);
  return {
    inputCount: details.inputs.length,
    requestedInputIndices,
    sighashTypes: details.inputs.map((input, inputIndex) =>
      requested.has(inputIndex)
        ? resolvePsbtSighashType(sighashTypes?.[inputIndex], input.sighashType, spendsTaprootOutput(input))
        : resolvePsbtSighashType(undefined, input.sighashType)
    ),
    presignedInputIndices: details.inputs
      .filter(input => input.hasSignatures)
      .map(input => input.index),
  };
}
