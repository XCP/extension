import { normalizeAddressForComparison } from '@/core/bitcoin/address';
import { ALLOWED_PSBT_SIGHASH_TYPES, type PsbtDetails, resolvePsbtSighashType } from '@/core/bitcoin/psbt';

const SIGHASH_SINGLE = 0x03;

/**
 * Refuse at intake a sighash the signer would refuse after approval. The effective sighash is the
 * site's explicit entry or, without one, the type embedded in the PSBT input — so an embedded
 * NONE or bare SINGLE is caught here, not after the user has reviewed and approved it.
 */
function assertEffectiveSighashes(
  details: PsbtDetails,
  indices: number[],
  sighashTypes?: number[],
): void {
  for (const index of indices) {
    const input = details.inputs[index];
    // Out-of-range indices are reported by signInputs validation.
    if (!input) continue;
    const sighash = resolvePsbtSighashType(sighashTypes?.[index], input.sighashType);
    if (!ALLOWED_PSBT_SIGHASH_TYPES.has(sighash)) {
      throw new Error(`Input ${index} uses an unsupported sighash type`);
    }
    if ((sighash & 0x1f) === SIGHASH_SINGLE && index >= details.outputs.length) {
      throw new Error('SIGHASH_SINGLE requires an output at the same index');
    }
  }
}

/** The exact scope used by btcSignPSBT's omitted-input mode, made explicit before review. */
export function resolveProviderSignInputs(
  details: PsbtDetails,
  activeAddress: string,
  requested?: Record<string, number[]>,
  sighashTypes?: number[],
): Record<string, number[]> {
  if (requested !== undefined) {
    assertEffectiveSighashes(details,
      Object.values(requested).flat().filter(index => Number.isSafeInteger(index)), sighashTypes);
    return requested;
  }
  const active = normalizeAddressForComparison(activeAddress);
  const owned = details.inputs.filter(input => input.address
    && normalizeAddressForComparison(input.address) === active);
  if (owned.length === 0) throw new Error('The PSBT has no inputs belonging to the active address');
  assertEffectiveSighashes(details, owned.map(input => input.index), sighashTypes);
  return { [activeAddress]: owned.map(input => input.index) };
}
