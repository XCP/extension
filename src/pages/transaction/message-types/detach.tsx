import { type ReactNode } from "react";
import type { Transaction } from "@/utils/blockchain/counterparty";

/**
 * Renders detailed information for detach (UTXO detach) transactions
 */
export function detach(tx: Transaction): Array<{ label: string; value: string | ReactNode }> {
  const params = tx.unpacked_data?.params;
  if (!params) return [];
  
  const fields: Array<{ label: string; value: string | ReactNode }> = [
    {
      label: "Type",
      value: "UTXO Detach",
    },
  ];
  
  // Destination
  if (params.destination) {
    fields.push({
      label: "Destination",
      value: (
        <span className="text-xs break-all">
          {params.destination}
        </span>
      ),
    });
  } else {
    fields.push({
      label: "Destination",
      value: "Same as source (detach in place)",
    });
  }
  
  // Show detached assets if available in events
  const detachEvents = tx.events?.filter((e: any) => 
    e.event === 'UTXO_DETACH' || 
    e.event === 'ASSET_DETACH'
  );
  
  if (detachEvents && detachEvents.length > 0) {
    fields.push({
      label: "Assets Detached",
      value: (
        <div className="space-y-1">
          {detachEvents.map((event: any, idx: number) => (
            <div key={idx} className="text-xs">
              {event.params.asset}: {event.params.quantity}
            </div>
          ))}
        </div>
      ),
    });
  }
  
  return fields;
}