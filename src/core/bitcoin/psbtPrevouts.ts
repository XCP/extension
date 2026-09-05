import { bytesToHex } from '@noble/hashes/utils.js';
import { RawTx } from '@scure/btc-signer';
import { decodeAddressFromScript } from '@/core/bitcoin/address';
import { normalizePsbtToHex, parsePSBT } from '@/core/bitcoin/psbt';
import { decodeRawTransaction, parseConsensusTransaction } from '@/core/bitcoin/rawTransaction';
import {
  noTrustedPrevout,
  type TrustedPrevoutResolver,
} from '@/core/bitcoin/trustedPrevout';
import { fetchPreviousRawTransaction } from '@/core/bitcoin/utxo';
import { ValidationError } from '@/core/errors';

export interface VerifiedPsbtPrevout {
  index: number;
  txid: string;
  vout: number;
  amount: bigint;
  script: Uint8Array;
  address?: string;
  rawTransaction: Uint8Array;
}

export interface VerifiedPsbt {
  hex: string;
  prevouts: VerifiedPsbtPrevout[];
}

export type PreviousRawTransactionResolver = (txid: string) => Promise<string | null>;

export interface VerifyPsbtPrevoutsOptions {
  resolveTrustedPrevout?: TrustedPrevoutResolver;
  fetchRawTransaction?: PreviousRawTransactionResolver;
  /** Signed package parents which are intentionally not on chain yet, keyed by txid. */
  packageTransactions?: ReadonlyMap<string, string>;
  /** Verify only inputs this wallet is being asked to sign; useful for marketplace placeholders. */
  inputIndices?: readonly number[];
}

const sameBytes = (left: Uint8Array, right: Uint8Array): boolean =>
  left.length === right.length && left.every((byte, index) => byte === right[index]);

/**
 * Resolve each requested PSBT input from the transaction it actually spends, then compare any
 * host-provided witness UTXO data. This gives signing one chain-rooted view instead of trusting
 * amounts and scripts supplied by the same website or compose API that requested the signature.
 */
export async function verifyPsbtPrevouts(
  psbt: string,
  options: VerifyPsbtPrevoutsOptions = {},
): Promise<VerifiedPsbt> {
  const transaction = parsePSBT(psbt);
  const resolveTrustedPrevout = options.resolveTrustedPrevout ?? noTrustedPrevout;
  const fetchRawTransaction = options.fetchRawTransaction ?? fetchPreviousRawTransaction;
  const rawCache = new Map<string, Uint8Array>();
  const inputIndices = options.inputIndices
    ?? Array.from({ length: transaction.inputsLength }, (_, index) => index);
  if (
    new Set(inputIndices).size !== inputIndices.length
    || inputIndices.some((index) =>
      !Number.isSafeInteger(index) || index < 0 || index >= transaction.inputsLength
    )
  ) {
    throw new ValidationError('INVALID_PSBT', 'PSBT prevout verification indices are invalid');
  }

  const prevouts = await Promise.all(
    inputIndices.map(async (index): Promise<VerifiedPsbtPrevout> => {
      const input = transaction.getInput(index);
      if (!input?.txid || input.index === undefined) {
        throw new ValidationError('INVALID_PSBT', `PSBT input ${index} has no outpoint`);
      }

      const txid = bytesToHex(input.txid).toLowerCase();
      let rawTransaction = rawCache.get(txid);
      if (!rawTransaction) {
        if (input.nonWitnessUtxo) {
          rawTransaction = RawTx.encode(input.nonWitnessUtxo);
        } else {
          const packaged = options.packageTransactions?.get(txid);
          const trusted = packaged ? null : await resolveTrustedPrevout(txid, input.index);
          const rawHex = packaged ?? trusted?.rawTxHex ?? await fetchRawTransaction(txid);
          if (!rawHex) {
            throw new ValidationError(
              'INVALID_PSBT',
              `Could not independently verify previous transaction ${txid}`,
            );
          }
          // Validate before caching, but preserve the exact transaction bytes. Re-serializing here
          // can change whether witness data is included even though the txid is unchanged.
          parseConsensusTransaction(rawHex);
          rawTransaction = decodeRawTransaction(rawHex);
        }
        rawCache.set(txid, rawTransaction);
      }

      const previous = parseConsensusTransaction(rawTransaction);
      if (previous.id !== txid) {
        throw new ValidationError(
          'INVALID_PSBT',
          `Previous transaction data does not match PSBT input ${index}`,
        );
      }
      const output = previous.getOutput(input.index);
      if (!output?.script || output.amount === undefined) {
        throw new ValidationError(
          'INVALID_PSBT',
          `Previous output ${txid}:${input.index} does not exist`,
        );
      }
      if (
        input.witnessUtxo
        && (
          input.witnessUtxo.amount !== output.amount
          || !sameBytes(input.witnessUtxo.script, output.script)
        )
      ) {
        throw new ValidationError(
          'INVALID_PSBT',
          `PSBT input ${index} does not match its real previous output`,
        );
      }

      const address = decodeAddressFromScript(bytesToHex(output.script)) ?? undefined;
      return {
        index,
        txid,
        vout: input.index,
        amount: output.amount,
        script: output.script,
        ...(address ? { address } : {}),
        rawTransaction,
      };
    }),
  );

  return { hex: normalizePsbtToHex(psbt), prevouts };
}
