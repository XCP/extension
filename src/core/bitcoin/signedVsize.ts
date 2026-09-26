/**
 * Estimated virtual size of a PSBT once its inputs are signed, for the high-fee-rate warning on
 * site-built transactions. The approval screen and the background policy both call this, so the
 * warning the user sees and the acknowledgement the signer demands cannot disagree.
 *
 * The rate warning is only as good as this estimate. Counting the witness at full weight (the
 * unsigned bytes plus 110 per input) nearly doubles a SegWit transaction's size and halves its
 * rate: a real 150 sat/vB payment read as ~95 and drew no warning. Each input is sized instead
 * from the script of the output it spends, at the usual signed size for that script type.
 */
import { exceedsSaneFeeRate } from '@/core/bitcoin/feeVerification';
import type { DecodedInput, DecodedOutput, PsbtDetails } from '@/core/bitcoin/psbt';

/** Version, locktime, and the input and output counts (one byte each below 253). */
const TX_OVERHEAD_VBYTES = 10;
/** The SegWit marker and flag bytes, at witness weight. */
const SEGWIT_MARKER_VBYTES = 0.5;
/** Outpoint (36), empty scriptSig length (1) and sequence (4). */
const INPUT_BASE_VBYTES = 41;

/**
 * Signed size per input by the spent script type, base bytes included.
 * P2WPKH: 41 + (1 + 73 + 34) / 4 ≈ 68. P2TR key path: 41 + (1 + 1 + 64) / 4 ≈ 58.
 * P2SH is assumed to wrap P2WPKH (91); P2PKH carries its signature and key in the scriptSig (148).
 * An unknown script (P2WSH, bare multisig) gets a typical 2-of-3 multisig size.
 */
const INPUT_VBYTES: Record<DecodedOutput['type'], number> = {
  p2wpkh: 68,
  p2tr: 58,
  p2sh: 91,
  p2pkh: 148,
  unknown: 105,
  op_return: 105,
};

/** Bytes a Bitcoin CompactSize length prefix takes for `length`. */
export const compactSizeLength = (length: number): number => (length < 0xfd ? 1 : length <= 0xffff ? 3 : 5);

function inputVbytes(input: Pick<DecodedInput, 'scriptType' | 'tapLeafScripts'>): number {
  const leaf = input.tapLeafScripts?.[0];
  if (input.scriptType === 'p2tr' && leaf) {
    // Script path: witness count, signature, the leaf script, and a 33-byte control block.
    const scriptBytes = leaf.length / 2;
    const witness = 1 + 1 + 65 + compactSizeLength(scriptBytes) + scriptBytes + 1 + 33;
    return INPUT_BASE_VBYTES + witness / 4;
  }
  return INPUT_VBYTES[input.scriptType ?? 'unknown'];
}

/**
 * Estimated signed vsize, or undefined when the transaction has no inputs to size.
 * Output sizes are exact; input sizes are typical signed sizes for their script type.
 */
export function estimateSignedPsbtVsize(details: {
  inputs: Array<Pick<DecodedInput, 'scriptType' | 'tapLeafScripts'>>;
  outputs: Array<Pick<DecodedOutput, 'script'>>;
}): number | undefined {
  if (details.inputs.length === 0) return undefined;
  const segwit = details.inputs.some(input => input.scriptType !== 'p2pkh');
  const inputs = details.inputs.reduce((sum, input) => sum + inputVbytes(input), 0);
  const outputs = details.outputs.reduce((sum, output) => {
    // A decoded output always has its script; tolerate a partial record rather than throw here.
    const scriptBytes = (output.script ?? '').length / 2;
    return sum + 8 + compactSizeLength(scriptBytes) + scriptBytes;
  }, 0);
  return Math.ceil(TX_OVERHEAD_VBYTES + (segwit ? SEGWIT_MARKER_VBYTES : 0) + inputs + outputs);
}

/** Absolute fee above which a site-built transaction always needs a second look: 0.1 BTC. */
export const HIGH_ABSOLUTE_FEE_SATS = 10_000_000;

/**
 * Whether a PSBT's fee needs acknowledgement: over 0.1 BTC, or a rate far above the network's.
 * Skipped for the rate when the PSBT is unfunded, where the other party supplies the inputs and
 * the fee is not yet knowable. The approval screen and the background policy share this.
 */
export function hasHighPsbtFee(
  details: Pick<PsbtDetails, 'fee' | 'unfunded' | 'inputs' | 'outputs'>,
  fastestFee?: number,
): boolean {
  return details.fee > HIGH_ABSOLUTE_FEE_SATS || (!details.unfunded
    && exceedsSaneFeeRate(details.fee, estimateSignedPsbtVsize(details), fastestFee));
}
