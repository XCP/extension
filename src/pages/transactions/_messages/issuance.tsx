import type { ReactNode } from "react";
import type { Transaction } from "@/core/counterparty/api";
import { displayLocale, formatAmount } from "@/core/format";
import { isGreaterThan } from "@/core/numeric";
import { t } from '@/i18n';
import { eventParams, messageData } from "@/pages/transactions/_messages/facts";

/**
 * Renders detailed information for issuance transactions
 */
export function issuance(tx: Transaction): Array<{ label: string; value: string | ReactNode }> {
  // The message holds what was asked. Its ASSET_ISSUANCE event records what it did: `asset_events`
  // (creation, transfer, lock_quantity, ...), the new owner of a transfer (`issuer`), and the
  // asset's long name, which a description change or reissuance of a subasset does not repeat.
  const message = messageData(tx);
  const event = eventParams(tx, 'ASSET_ISSUANCE')[0] ?? eventParams(tx, 'ASSET_TRANSFER')[0];
  const params = message ?? event;
  if (!params) return [];
  const assetEvents = new Set(String(event?.asset_events ?? '').split(/[\s,]+/).filter(Boolean));
  const created = assetEvents.has('creation') || eventParams(tx, 'ASSET_CREATION').length > 0;
  const longname: unknown = params.subasset_longname || event?.asset_longname
    || (typeof params.asset === 'string' && params.asset.includes('.') ? params.asset : undefined);
  const assetName: string = typeof longname === 'string' && longname ? longname : params.asset;
  const transferDestination: unknown = params.transfer_destination
    || (event?.transfer === true && typeof event.issuer === 'string' ? event.issuer : undefined);
  const lock: unknown = params.lock ?? (assetEvents.has('lock_quantity') ? true : undefined);
  const reset = params.reset === true || assetEvents.has('reset');

  // Use API-provided normalized values (verbose=true always returns these)
  const isDivisible = params.divisible ?? true;
  const quantity = params.quantity_normalized;
  // A normalized quantity is a decimal string; compare it as a number without narrowing it first.
  const hasSupply = quantity !== undefined && isGreaterThan(quantity, 0);
  
  const fields: Array<{ label: string; value: string | ReactNode }> = [];
  
  // Determine issuance type
  let issuanceType = t('messages_issuance_asset_issuance');
  if (transferDestination) {
    issuanceType = t('messages_issuance_ownership_transfer');
  } else if (reset) {
    issuanceType = t('messages_issuance_supply_reset');
  } else if (created) {
    issuanceType = longname ? t('messages_issuance_subasset_creation') : t('messages_issuance_asset_issuance');
  } else if (hasSupply) {
    issuanceType = t('messages_issuance_supply_increase');
  } else if (lock) {
    issuanceType = t('messages_issuance_supply_lock');
  } else {
    issuanceType = t('messages_issuance_description_update');
  }
  
  fields.push({
    label: t('common_type'),
    value: issuanceType,
  });
  
  fields.push({
    label: t('common_asset'),
    value: assetName,
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
  
  if (lock !== undefined) {
    fields.push({
      label: t('messages_issuance_supply_locked'),
      value: lock ? '🔒 ' + t('tx_action_yes') : '🔓 ' + t('tx_action_no'),
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
  if (typeof transferDestination === 'string') {
    fields.push({
      label: t('messages_issuance_transfer_to'),
      value: (
        <span className="text-xs break-all">
          {transferDestination}
        </span>
      ),
    });
  }
  
  // Parent asset for subassets
  if (assetName && assetName.includes('.')) {
    const parentAsset = assetName.split('.')[0];
    fields.push({
      label: t('messages_issuance_parent_asset'),
      value: parentAsset,
    });
  }
  
  // Call date/price for callable assets
  if (params.callable !== undefined && params.callable) {
    fields.push({
      label: t('messages_issuance_callable'),
      value: t('tx_action_yes'),
    });
    
    if (params.call_date) {
      fields.push({
        label: t('messages_issuance_call_date'),
        // A call date carries no time of day, so it takes the date alone rather than
        // `formatDate`'s date-and-time — resolving the language the same way it does.
        value: new Date(params.call_date * 1000).toLocaleDateString(displayLocale()),
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