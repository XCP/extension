import type { ReactNode } from "react";
import type { Transaction } from "@/core/counterparty/api";
import { formatAmount } from "@/core/format";
import { divide, fromSatoshis, isGreaterThan, multiply, roundDown } from "@/core/numeric";
import { t } from '@/i18n';
import { eventParams, firstEvent, messageData } from "@/pages/transactions/_messages/facts";

/** Core's dispenser states: 0 open, 1 open on an empty address, 10 closed, 11 closing. */
function statusLabel(status: unknown): string {
  return status === 0 || status === 1 ? "🟢 Open" :
         status === 10 ? "🔴 Closed" :
         status === 11 ? "⚠️ Closing" : "Unknown";
}

/**
 * Renders detailed information for dispenser transactions
 */
export function dispenser(tx: Transaction): Array<{ label: string; value: string | ReactNode }> {
  // The message states the terms asked for (its `status` is the parse result, and the requested
  // state is `dispenser_status`). An opening's OPEN_DISPENSER event adds what the ledger recorded;
  // a close or refill updates the existing dispenser, whose DISPENSER_UPDATE is about that
  // dispenser's own transaction.
  const message = messageData(tx);
  const opened = eventParams(tx, 'OPEN_DISPENSER')[0];
  const update = firstEvent(tx, 'DISPENSER_UPDATE');
  const params = opened ? { ...message, ...opened } : message ?? update;
  if (!params) return [];

  const status = opened?.status ?? update?.status ?? message?.dispenser_status ?? params.status;
  // Closing states no terms: its quantities are zero placeholders.
  if ((status === 10 || status === 11) && !opened) {
    return [
      { label: t('common_asset'), value: params.asset },
      { label: t('common_status'), value: statusLabel(status) },
    ];
  }

  // Use API-provided normalized values (verbose=true always returns these)
  const isDivisible = params.asset_info?.divisible ?? true;
  const giveQuantity = params.give_quantity_normalized;
  const escrowQuantity = params.escrow_quantity_normalized;
  // The message names the rate `mainchainrate`, in satoshis, and sends no normalized form of it.
  const btcPerDispense = params.satoshirate_normalized
    ?? (params.mainchainrate != null && /^\d+$/.test(String(params.mainchainrate))
      ? fromSatoshis(String(params.mainchainrate), { removeTrailingZeros: false })
      : undefined);
  
  // Derived from the normalized strings, so a large escrow does not lose digits on the way. A
  // missing or zero give quantity has no answer here — substituting one would put a plausible
  // number on the screen that nothing in the transaction says.
  const canDerive = escrowQuantity !== undefined
    && giveQuantity !== undefined
    && isGreaterThan(giveQuantity, 0);
  const totalDispenses = canDerive ? divide(escrowQuantity, giveQuantity) : null;
  const totalBtcValue = totalDispenses !== null && btcPerDispense !== undefined
    ? multiply(totalDispenses, btcPerDispense)
    : null;
  
  const fields: Array<{ label: string; value: string | ReactNode }> = [
    {
      label: t('common_asset'),
      value: params.asset,
    },
    {
      label: t('common_status'),
      value: statusLabel(status),
    },
    {
      label: t('messages_dispenser_give_per_dispense'),
      value: `${formatAmount({
        value: giveQuantity,
        minimumFractionDigits: isDivisible ? 8 : 0,
        maximumFractionDigits: isDivisible ? 8 : 0,
      })} ${params.asset}`,
    },
    {
      label: t('messages_dispenser_price_per_dispense'),
      value: `${formatAmount({
        value: btcPerDispense,
        minimumFractionDigits: 8,
        maximumFractionDigits: 8,
      })} BTC`,
    },
    {
      label: t('messages_dispenser_total_escrow'),
      value: `${formatAmount({
        value: escrowQuantity,
        minimumFractionDigits: isDivisible ? 8 : 0,
        maximumFractionDigits: isDivisible ? 8 : 0,
      })} ${params.asset}`,
    },
  ];

  // Add remaining quantity if available
  if (params.give_remaining_normalized !== undefined) {
    const giveRemaining = params.give_remaining_normalized;
    const remainingDispenses = canDerive && giveRemaining !== undefined
      ? roundDown(divide(giveRemaining, giveQuantity))
      : null;
    
    fields.push({
      label: t('messages_dispenser_remaining_in_escrow'),
      value: `${formatAmount({
        value: giveRemaining,
        minimumFractionDigits: isDivisible ? 8 : 0,
        maximumFractionDigits: isDivisible ? 8 : 0,
      })} ${params.asset}`,
    });
    
    if (remainingDispenses !== null) {
      fields.push({
        label: t('messages_dispenser_remaining_dispenses'),
        value: remainingDispenses.toFixed(),
      });
    }
  }

  // Add total calculations, when the transaction says enough to work them out.
  if (totalDispenses !== null) {
    fields.push({
      label: t('messages_dispenser_max_dispenses'),
      value: roundDown(totalDispenses).toFixed(),
    });
  }

  if (totalBtcValue !== null) {
    fields.push({
      label: t('messages_dispenser_total_btc_value'),
      value: `${formatAmount({
        value: totalBtcValue,
        minimumFractionDigits: 8,
        maximumFractionDigits: 8,
      })} BTC`,
    });
  }

  // Add oracle address if present
  if (params.oracle_address) {
    fields.push({
      label: t('messages_dispenser_oracle_address'),
      value: params.oracle_address,
    });
  }

  return fields;
}