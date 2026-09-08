import type { ReactNode } from "react";
import type { Transaction } from "@/core/counterparty/api";
import { formatAddress, formatAmount } from "@/core/format";
import { fromSatoshis } from "@/core/numeric";

import { t } from '@/i18n';
/**
 * Renders detailed information for MPMA (Multi-Peer Multi-Asset) transactions
 */
export function mpma(tx: Transaction): Array<{ label: string; value: string | ReactNode }> {
  const params = tx.unpacked_data?.params;
  if (!params) return [];
  
  const assetDestQuantList = params.asset_dest_quant_list || [];
  
  // Group by asset
  const assetGroups: Record<string, { 
    destinations: string[]; 
    quantity: number; 
    isDivisible: boolean;
    totalQuantity: number;
  }> = {};
  
  assetDestQuantList.forEach((item: any[]) => {
    const [asset, destination, quantity] = item;
    if (!assetGroups[asset]) {
      assetGroups[asset] = { 
        destinations: [], 
        quantity: 0,
        isDivisible: params.asset_info?.divisible ?? false,
        totalQuantity: 0,
      };
    }
    assetGroups[asset].destinations.push(destination);
    assetGroups[asset].quantity = quantity; // Same quantity per destination in MPMA
    assetGroups[asset].totalQuantity += quantity;
  });

  const fields: Array<{ label: string; value: string | ReactNode }> = [];
  
  // Add summary
  const totalDestinations = new Set(assetDestQuantList.map((item: any[]) => item[1])).size;
  const totalAssets = Object.keys(assetGroups).length;
  
  const assetsText = totalAssets === 1 ? '1 asset' : `${totalAssets} assets`;
  const addressesText = totalDestinations === 1 ? '1 address' : `${totalDestinations} addresses`;
  fields.push({
    label: t('common_type'),
    value: t('messages_mpma_multi_send_to', [String(assetsText), String(addressesText)]),
  });
  
  // Process each asset group
  Object.entries(assetGroups).forEach(([asset, data]) => {
    const displayQuantity = data.isDivisible ? fromSatoshis(data.quantity, true) : data.quantity;
    const displayTotal = data.isDivisible ? fromSatoshis(data.totalQuantity, true) : data.totalQuantity;
    
    fields.push({
      label: t('messages_mpma_recipients', [String(asset), String(data.destinations.length)]),
      value: (
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {data.destinations.map((dest, idx) => (
            <div key={idx} className="text-xs break-all py-0.5">
              {formatAddress(dest)}
            </div>
          ))}
        </div>
      ),
    });
    
    fields.push({
      label: t('messages_mpma_per_address', [String(asset)]),
      value: formatAmount({
        value: displayQuantity,
        minimumFractionDigits: data.isDivisible ? 8 : 0,
        maximumFractionDigits: data.isDivisible ? 8 : 0,
      }),
    });
    
    fields.push({
      label: t('messages_mpma_total_sent', [String(asset)]),
      value: formatAmount({
        value: displayTotal,
        minimumFractionDigits: data.isDivisible ? 8 : 0,
        maximumFractionDigits: data.isDivisible ? 8 : 0,
      }),
    });
  });
  
  // Add memos if present
  if (params.memos && params.memos.length > 0) {
    fields.push({
      label: t('common_memo'),
      value: (
        <div className="break-all">
          {params.memos[0]}
        </div>
      ),
    });
  }
  
  return fields;
}