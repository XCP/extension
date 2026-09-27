import type { ReactNode } from "react";
import type { Transaction } from "@/core/counterparty/api";
import { fromSatoshis } from "@/core/numeric";
import { t } from '@/i18n';
import { amountText, messageData } from "@/pages/transactions/_messages/facts";

type Fields = Array<{ label: string; value: string | ReactNode }>;

/** LP tokens are always divisible, so their raw quantities scale by 1e8 without a lookup. */
const lp = (raw: unknown): string | undefined =>
  raw != null && /^\d+$/.test(String(raw)) ? fromSatoshis(String(raw), { removeTrailingZeros: false }) : undefined;

const positive = (raw: unknown): boolean => raw != null && /^\d+$/.test(String(raw)) && BigInt(String(raw)) > 0n;

/**
 * Renders detailed information for pool deposits: both legs and the slippage floor.
 */
export function pooldeposit(tx: Transaction): Fields {
  const data = messageData(tx);
  if (!data) return [];
  const fields: Fields = [];
  for (const [quantity, asset] of [['quantity_a', 'asset_a'], ['quantity_b', 'asset_b']] as const) {
    const amount = amountText(data, quantity, asset);
    if (amount) fields.push({ label: t('tx_action_deposit'), value: amount });
  }
  // A zero floor means no slippage protection was set.
  if (positive(data.min_lp_quantity)) {
    fields.push({ label: t('tx_action_min_lp_received'), value: `${lp(data.min_lp_quantity)} LP` });
  }
  return fields;
}

/**
 * Renders detailed information for pool withdrawals: the LP tokens burned, the pool and the floors.
 */
export function poolwithdraw(tx: Transaction): Fields {
  const data = messageData(tx);
  if (!data) return [];
  const fields: Fields = [];
  const burned = lp(data.quantity);
  if (burned) fields.push({ label: t('common_amount'), value: t('tx_action_destroy_lp', [burned]) });
  if (data.asset_a && data.asset_b) {
    fields.push({ label: t('tx_action_pool'), value: `${data.asset_a} / ${data.asset_b}` });
  }
  for (const [quantity, asset] of [['min_quantity_a', 'asset_a'], ['min_quantity_b', 'asset_b']] as const) {
    if (!positive(data[quantity])) continue;
    const amount = amountText(data, quantity, asset);
    if (amount) fields.push({ label: t('tx_action_min_asset_back', [String(data[asset])]), value: amount });
  }
  return fields;
}
