import { parseRawTransactionLocally } from "@/core/bitcoin/localTransactionParse";
import { readUtxoAssets } from "@/core/counterparty/protocolContext";
import { type ReviewLookup, useReviewLookup } from "@/hooks/useReviewLookup";
import { t } from '@/i18n';

/**
 * The assets on every UTXO this transaction spends, read the way the approval screen reads a
 * detach's (`readUtxoAssets` over the spent outpoints).
 *
 * The outpoints come from the transaction's own bytes, not from the form or the compose response:
 * whatever is attached to an input leaves with it when it is spent, so the list is of what signing
 * actually moves. Unparseable bytes are a failed lookup, not an empty one.
 */
export function useSpentUtxoAssets(rawTransaction: unknown): ReviewLookup<string[]> {
  const parsed = typeof rawTransaction === "string" ? parseRawTransactionLocally(rawTransaction) : null;
  const utxos = parsed?.inputs.map((input) => `${input.txid}:${input.vout}`) ?? [];
  return useReviewLookup(utxos.length > 0 ? utxos.join(",") : undefined, () => readUtxoAssets(utxos));
}

/** The row value for a spent-assets lookup: one asset per line, or what kept it from being read. */
export function spentUtxoAssetsText(lookup: ReviewLookup<string[]>): string {
  if (lookup.status === "loading") return t('common_loading');
  if (lookup.status === "failed") return t('utxo_review_assets_unavailable');
  return lookup.value.length > 0 ? lookup.value.join("\n") : t('utxo_review_no_assets');
}
