import { normalizeAddressForComparison } from '@/core/bitcoin/address';
import { type PsbtDetails, resolvePsbtSighashType } from '@/core/bitcoin/psbt';

/** The exact scope used by btcSignPSBT's omitted-input mode, made explicit before review. */
export function resolveProviderSignInputs(
  details: PsbtDetails,
  activeAddress: string,
  requested?: Record<string, number[]>,
  sighashTypes?: number[],
): Record<string, number[]> {
  if (requested !== undefined) return requested;
  const active = normalizeAddressForComparison(activeAddress);
  const owned = details.inputs.filter(input => input.address
    && normalizeAddressForComparison(input.address) === active);
  if (owned.length === 0) throw new Error('The PSBT has no inputs belonging to the active address');
  for (const input of owned) {
    const sighash = resolvePsbtSighashType(sighashTypes?.[input.index], input.sighashType);
    if (![0x00, 0x01, 0x81, 0x83].includes(sighash)) {
      throw new Error(`Input ${input.index} uses an unsupported sighash type`);
    }
  }
  return { [activeAddress]: owned.map(input => input.index) };
}
