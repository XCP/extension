import type { ReactNode } from "react";
import type { Transaction } from "@/core/counterparty/api";
import {
  describeFairminterPaymentModel,
  isPaidFairminter,
  readFairminterPaymentModel,
} from "@/core/counterparty/fairminterModel";
import { formatAmount } from "@/core/format";
import { isGreaterThan } from "@/core/numeric";

import { t } from '@/i18n';
/**
 * Renders detailed information for fairminter creation transactions
 */
export function fairminter(tx: Transaction): Array<{ label: string; value: string | ReactNode }> {
  const params = tx.unpacked_data?.params;
  if (!params) return [];
  
  const isDivisible = params.divisible ?? true;
  
  const fields: Array<{ label: string; value: string | ReactNode }> = [
    {
      label: t('common_type'),
      value: t('messages_fairminter_fairminter_creation'),
    },
    {
      label: t('common_asset'),
      value: params.asset,
    },
    {
      label: t('common_status'),
      value: params.status === 0 ? "🟢 Open" : 
             params.status === 1 ? "🔴 Closed" : 
             params.status === 2 ? "⚠️ Pending" : "Unknown",
    },
  ];

  // Mint model. Derived from the price first: burn_payment says where a payment goes, not whether
  // there is one, so reading it alone reported ordinary pay-the-issuer fairminters as free.
  const paymentModel = readFairminterPaymentModel(params);

  fields.push({
    label: t('messages_fairminter_mint_model'),
    value: describeFairminterPaymentModel(paymentModel),
  });

  // Bounds a paid mint as well as a free one — core rejects any quantity above it either way —
  // so it is not part of the free-mint branch.
  if (params.max_mint_per_tx_normalized !== undefined) {
    fields.push({
      label: t('messages_fairminter_max_mint_per_tx'),
      value: formatAmount({
        value: Number(params.max_mint_per_tx_normalized),
        minimumFractionDigits: isDivisible ? 8 : 0,
        maximumFractionDigits: isDivisible ? 8 : 0,
      }),
    });
  }

  if (isPaidFairminter(paymentModel)) {
    // Core derives price_normalized as price / quantity_by_price: it is per unit, not per lot.
    if (params.price_normalized !== undefined) {
      fields.push({
        label: t('messages_fairminter_price_per_unit'),
        value: `${formatAmount({
          value: params.price_normalized,
          minimumFractionDigits: 8,
          maximumFractionDigits: 8,
        })} XCP`,
      });
    }

    // Quantity per price (normalized)
    if (params.quantity_by_price_normalized !== undefined) {
      fields.push({
        label: t('messages_fairminter_quantity_per_price'),
        value: formatAmount({
          value: params.quantity_by_price_normalized,
          minimumFractionDigits: isDivisible ? 8 : 0,
          maximumFractionDigits: isDivisible ? 8 : 0,
        }),
      });
    }
  }

  // Caps (use API-provided normalized values)
  if (params.hard_cap_normalized !== undefined && Number(params.hard_cap_normalized) > 0) {
    fields.push({
      label: t('common_hard_cap'),
      value: formatAmount({
        value: Number(params.hard_cap_normalized),
        minimumFractionDigits: isDivisible ? 8 : 0,
        maximumFractionDigits: isDivisible ? 8 : 0,
      }),
    });
  }

  if (params.max_mint_per_address_normalized !== undefined && Number(params.max_mint_per_address_normalized) > 0) {
    fields.push({
      label: t('messages_fairminter_max_mint_per_address'),
      value: formatAmount({
        value: Number(params.max_mint_per_address_normalized),
        minimumFractionDigits: isDivisible ? 8 : 0,
        maximumFractionDigits: isDivisible ? 8 : 0,
      }),
    });
  }

  if (params.soft_cap_normalized !== undefined && Number(params.soft_cap_normalized) > 0) {
    fields.push({
      label: t('common_soft_cap'),
      value: formatAmount({
        value: Number(params.soft_cap_normalized),
        minimumFractionDigits: isDivisible ? 8 : 0,
        maximumFractionDigits: isDivisible ? 8 : 0,
      }),
    });
  }

  // Premint (use API-provided normalized value)
  if (params.premint_quantity_normalized !== undefined && isGreaterThan(params.premint_quantity_normalized, 0)) {
    fields.push({
      label: t('messages_fairminter_premint'),
      value: formatAmount({
        value: params.premint_quantity_normalized,
        minimumFractionDigits: isDivisible ? 8 : 0,
        maximumFractionDigits: isDivisible ? 8 : 0,
      }),
    });
  }

  // Commission
  if (params.minted_asset_commission !== undefined && params.minted_asset_commission > 0) {
    fields.push({
      label: t('common_commission'),
      value: `${(params.minted_asset_commission * 100).toFixed(2)}%`,
    });
  }

  // Blocks
  if (params.start_block !== undefined) {
    fields.push({
      label: t('common_start_block'),
      value: params.start_block.toString(),
    });
  }
  
  if (params.end_block !== undefined) {
    fields.push({
      label: t('common_end_block'),
      value: params.end_block.toString(),
    });
  }

  // Description
  if (params.description) {
    fields.push({
      label: t('common_description'),
      value: (
        <div className="break-all">
          {params.description}
        </div>
      ),
    });
  }

  // Locks
  fields.push({
    label: t('common_divisible'),
    value: isDivisible ? t('messages_fairminter_yes_8_decimals') : t('messages_fairminter_no_whole_units'),
  });
  
  if (params.lock_description !== undefined) {
    fields.push({
      label: t('common_description_locked'),
      value: params.lock_description ? "🔒 Yes" : "🔓 No",
    });
  }
  
  if (params.lock_quantity !== undefined) {
    fields.push({
      label: t('messages_fairminter_quantity_locked'),
      value: params.lock_quantity ? "🔒 Yes" : "🔓 No",
    });
  }

  return fields;
}
