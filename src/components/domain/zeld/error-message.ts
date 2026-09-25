import { t } from '@/i18n';

/** Exact actionable local diagnostics only; callers preserve all unknown error text. */
export function zeldErrorMessage(error: unknown): string | undefined {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : undefined;
  switch (message) {
    case "ZELD amount must be positive.": return t('zeld_error_amount');
    case "Fee rate must be positive.": return t('zeld_error_fee');
    case "The source address could not be decoded.": return t('zeld_error_source');
    case "The recipient address could not be decoded.": return t('zeld_error_recipient');
    case "Insufficient ZELD balance.": return t('zeld_error_balance');
    case "No spendable ZELD to move.": return t('zeld_error_none_to_move');
    case "Some ZELD sits on outputs the wallet cannot spend yet (unconfirmed, just spent, or carrying a Counterparty attachment).": return t('zeld_error_unspendable');
    case "Insufficient spendable ZELD.": return t('zeld_error_spendable_balance');
    case "Insufficient BTC to pay the recipient output and the fee.": return t('zeld_error_btc_balance');
    case "This output also holds ZELD, which would go to the destination with the assets. Detach first: the ZELD stays with you, and a new attach uses a clean output.": return t('zeld_error_detach_first');
    case "This output also holds ZELD, and the detach leaves no output of yours for it to land on. Add a little BTC to this address, then try again.": return t('zeld_error_detach_funding');
    case "Every output this address could spend holds ZELD, and this transaction pays the recipient first, so the ZELD would go with it. Move your ZELD to a small output on the ZELD page, then try again.": return t('zeld_error_park_first');
  }
  const seconds = /^ZELD hunt time must be a whole number of seconds from 0 to (\d+)$/.exec(message ?? '');
  if (seconds?.[1]) return t('zeld_hunt_invalid_seconds', [seconds[1]]);
  return undefined;
}
