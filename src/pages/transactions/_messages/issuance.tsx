import type { ReactNode } from "react";
import type { Transaction } from "@/core/counterparty/api";
import { formatAmount } from "@/core/format";
import { isGreaterThan } from "@/core/numeric";

import { t } from '@/i18n';
/**
 * Renders detailed information for issuance transactions
 */
export function issuance(tx: Transaction): Array<{ label: string; value: string | ReactNode }> {
  // Try to get params from unpacked_data first, then check events
  let params = tx.unpacked_data?.params;
  if (!params) {
    const issuanceEvent = tx.events?.find((e: any) =>
      e.event === 'ISSUANCE' ||
      e.event === 'ASSET_ISSUANCE' ||
      e.event === 'ASSET_CREATION'
    );
    params = issuanceEvent?.params;
  }
  if (!params) return [];

  // Use API-provided normalized values (verbose=true always returns these)
  const isDivisible = params.divisible ?? true;
  const quantity = params.quantity_normalized;
  // A normalized quantity is a decimal string; compare it as a number without narrowing it first.
  const hasSupply = quantity !== undefined && isGreaterThan(quantity, 0);
  
  const fields: Array<{ label: string; value: string | ReactNode }> = [];
  
  // Determine issuance type
  let issuanceType = t('messages_issuance_asset_issuance');
  if (params.transfer_destination) {
    issuanceType = t('messages_issuance_ownership_transfer');
  } else if (!hasSupply && params.description === "") {
    issuanceType = t('messages_issuance_supply_reset');
  } else if (!hasSupply && params.lock) {
    issuanceType = t('messages_issuance_supply_lock');
  } else if (params.description && !hasSupply) {
    issuanceType = t('messages_issuance_description_update');
  } else if (hasSupply && params.asset && params.asset.includes('.')) {
    issuanceType = t('messages_issuance_subasset_creation');
  } else if (hasSupply) {
    issuanceType = t('messages_issuance_supply_increase');
  }
  
  fields.push({
    label: t('common_type'),
    value: issuanceType,
  });
  
  fields.push({
    label: t('common_asset'),
    value: params.asset,
  });
  
  // Show quantity if not zero
  if (hasSupply) {
    fields.push({
      label: t('common_quantity'),
      value: formatAmount({
        value: quantity,
        minimumFractionDigits: isDivisible ? 8 : 0,
        maximumFractionDigits: isDivisible ? 8 : 0,
      }),
    });
  }
  
  // Asset properties
  fields.push({
    label: t('common_divisible'),
    value: isDivisible ? t('messages_issuance_yes_8_decimal_places') : t('messages_issuance_no_whole_units_only'),
  });
  
  if (params.lock !== undefined) {
    fields.push({
      label: t('messages_issuance_supply_locked'),
      value: params.lock ? "🔒 Yes" : "🔓 No",
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
  
  // Transfer destination
  if (params.transfer_destination) {
    fields.push({
      label: t('messages_issuance_transfer_to'),
      value: (
        <span className="text-xs break-all">
          {params.transfer_destination}
        </span>
      ),
    });
  }
  
  // Parent asset for subassets
  if (params.asset && params.asset.includes('.')) {
    const parentAsset = params.asset.split('.')[0];
    fields.push({
      label: t('messages_issuance_parent_asset'),
      value: parentAsset,
    });
  }
  
  // Call date/price for callable assets
  if (params.callable !== undefined && params.callable) {
    fields.push({
      label: t('messages_issuance_callable'),
      value: "Yes",
    });
    
    if (params.call_date) {
      fields.push({
        label: t('messages_issuance_call_date'),
        value: new Date(params.call_date * 1000).toLocaleDateString(),
      });
    }
    
    if (params.call_price) {
      fields.push({
        label: t('messages_issuance_call_price'),
        value: `${formatAmount({
          value: params.call_price,
          minimumFractionDigits: 2,
          maximumFractionDigits: 8,
        })} XCP`,
      });
    }
  }
  
  return fields;
}