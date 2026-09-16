import type { ReactNode } from "react";
import type { Transaction } from "@/core/counterparty/api";
import { formatAmount } from "@/core/format";

import { t } from '@/i18n';
/**
 * Renders detailed information for dispense transactions (when someone uses a dispenser)
 */
export function dispense(tx: Transaction): Array<{ label: string; value: string | ReactNode }> {
  // For dispense transactions, data is in the events array
  const dispenseEvent = tx.events?.find((e: any) => e.event === 'DISPENSE');
  
  if (!dispenseEvent?.params) {
    // Fallback to transaction root data (use normalized value)
    const btcAmount = tx.btc_amount_normalized ?? '0';
    return [
      {
        label: t('messages_dispense_dispenser_address'),
        value: tx.destination || "N/A",
      },
      {
        label: t('messages_dispense_btc_paid'),
        value: `${formatAmount({
          value: btcAmount,
          minimumFractionDigits: 8,
          maximumFractionDigits: 8,
        })} BTC`,
      },
    ];
  }
  
  const params = dispenseEvent.params;
  const isDivisible = params.asset_info?.divisible ?? true;

  // Use API-provided normalized values (verbose=true always returns these)
  const quantityReceived = params.dispense_quantity_normalized;
  const btcPaid = params.btc_amount_normalized;
    
  const pricePerUnit = quantityReceived > 0 ? btcPaid / quantityReceived : 0;
  
  return [
    {
      label: t('messages_dispense_original_dispenser_tx'),
      value: params.dispenser_tx_hash ? (
        <span className="text-xs break-all font-mono">
          {params.dispenser_tx_hash}
        </span>
      ) : "N/A",
    },
    {
      label: t('messages_dispense_asset_received'),
      value: params.asset || "N/A",
    },
    {
      label: t('messages_dispense_quantity_received'),
      value: `${formatAmount({
        value: quantityReceived,
        minimumFractionDigits: isDivisible ? 8 : 0,
        maximumFractionDigits: isDivisible ? 8 : 0,
      })} ${params.asset}`,
    },
    {
      label: t('messages_dispense_btc_paid'),
      value: `${formatAmount({
        value: btcPaid,
        minimumFractionDigits: 8,
        maximumFractionDigits: 8,
      })} BTC`,
    },
    {
      label: t('common_effective_price'),
      value: pricePerUnit > 0 ? t('messages_dispense_btc_per', [String(formatAmount({
        value: pricePerUnit,
        minimumFractionDigits: 8,
        maximumFractionDigits: 8,
      })), String(params.asset)]) : "N/A",
    },
    {
      label: t('messages_dispense_from_dispenser'),
      value: (
        <span className="text-xs break-all">
          {params.source || "N/A"}
        </span>
      ),
    },
    {
      label: t('messages_dispense_to_address'),
      value: (
        <span className="text-xs break-all">
          {params.destination || "N/A"}
        </span>
      ),
    },
    {
      label: t('messages_dispense_dispense_index'),
      value: params.dispense_index !== undefined ? 
        `#${params.dispense_index}` : "N/A",
    },
  ];
}