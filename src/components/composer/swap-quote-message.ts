import type { SwapQuoteOutcome } from '@/core/counterparty/pool';
import { t } from '@/i18n';

/** Present the existing typed outcome; classification, amounts and API diagnostics stay untouched. */
export function swapQuoteOutcomeMessage(
  outcome: SwapQuoteOutcome,
  assets: { giveAsset: string; getAsset: string },
): string | null {
  switch (outcome) {
    case 'fillable': return null;
    case 'partial': return t('swap_quote_outcome_partial');
    case 'dust': return t('swap_quote_outcome_dust', [assets.getAsset, assets.giveAsset]);
    case 'no_pool': return t('swap_quote_outcome_no_liquidity');
  }
}
