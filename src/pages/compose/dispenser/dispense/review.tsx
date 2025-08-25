import { useEffect, useState } from "react";
import { ReviewScreen } from "@/components/screens/review-screen";
import { formatAmount } from "@/utils/format";
import { fetchAddressDispensers, fetchDispenserDispenses } from "@/utils/blockchain/counterparty";
import type { ReactElement } from "react";

/**
 * Props for the ReviewDispense component.
 */
interface ReviewDispenseProps {
  apiResponse: any; // Consider typing this more strictly based on your API response shape
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean; // Passed from useActionState in Composer
}

interface DispenserInfo {
  asset: string;
  give_quantity_normalized: string;
  satoshirate: number;
  asset_longname?: string;
  tx_hash?: string;
}

interface MempoolDispense {
  source: string;
  btc_amount: number;
  fee_rate?: number;
  tx_hash: string;
}

/**
 * Displays a review screen for dispense transactions.
 * @param {ReviewDispenseProps} props - Component props
 * @returns {ReactElement} Review UI for dispense transaction
 */
export function ReviewDispense({ 
  apiResponse, 
  onSign, 
  onBack,
  error,
  isSigning,
}: ReviewDispenseProps): ReactElement {
  const { result } = apiResponse || {};
  const [dispenserInfo, setDispenserInfo] = useState<DispenserInfo | null>(null);
  const [isLoadingInfo, setIsLoadingInfo] = useState(true);
  const [mempoolDispenses, setMempoolDispenses] = useState<MempoolDispense[]>([]);
  
  // Extract dispenser address from the transaction outputs
  const dispenserAddress = result?.params?.destination;
  const btcQuantity = result?.params?.quantity || 0;
  const numberOfDispenses = btcQuantity > 0 && dispenserInfo?.satoshirate 
    ? Math.floor(btcQuantity / dispenserInfo.satoshirate)
    : 0;
  
  // Fetch dispenser details and check mempool
  useEffect(() => {
    const fetchInfo = async () => {
      if (!dispenserAddress) {
        setIsLoadingInfo(false);
        return;
      }
      
      try {
        // Fetch dispenser info
        const { dispensers } = await fetchAddressDispensers(dispenserAddress, { 
          status: "open", 
          verbose: true 
        });
        
        if (dispensers && dispensers.length > 0) {
          // Sort by satoshirate then by asset name to find which will trigger
          const sorted = [...dispensers].sort((a: any, b: any) => {
            if (a.satoshirate !== b.satoshirate) {
              return a.satoshirate - b.satoshirate;
            }
            return a.asset.localeCompare(b.asset);
          });
          
          // Find the dispenser that will actually trigger based on BTC amount
          const triggeredDispenser = sorted.find((d: any) => d.satoshirate <= btcQuantity);
          
          if (triggeredDispenser) {
            const isDivisible = triggeredDispenser.asset_info?.divisible ?? false;
            const divisor = isDivisible ? 1e8 : 1;
            setDispenserInfo({
              asset: triggeredDispenser.asset,
              give_quantity_normalized: (triggeredDispenser.give_quantity / divisor).toString(),
              satoshirate: triggeredDispenser.satoshirate,
              asset_longname: triggeredDispenser.asset_info?.asset_longname,
              tx_hash: triggeredDispenser.tx_hash,
            });
            
            // Check for mempool dispenses from the same dispenser
            try {
              const { dispenses } = await fetchDispenserDispenses(
                triggeredDispenser.tx_hash,
                { show_unconfirmed: true, verbose: true }
              );
              
              // Filter for unconfirmed (mempool) transactions
              const mempoolTxs = dispenses?.filter((d: any) => 
                d.block_index === null || d.confirmed === false
              ) || [];
              
              const mempoolInfo: MempoolDispense[] = mempoolTxs.map((tx: any) => ({
                source: tx.destination || tx.source,  // destination is the one receiving from dispenser
                btc_amount: tx.btc_amount || 0,
                fee_rate: tx.fee_rate,
                tx_hash: tx.tx_hash
              }));
              
              setMempoolDispenses(mempoolInfo);
            } catch (err) {
              console.error("Failed to fetch mempool dispenses:", err);
            }
          }
        }
      } catch (err) {
        console.error("Failed to fetch dispenser info:", err);
      } finally {
        setIsLoadingInfo(false);
      }
    };
    
    fetchInfo();
  }, [dispenserAddress, btcQuantity]);
  
  // Calculate BTC amount from the API response
  const btcAmount = formatAmount({
    value: btcQuantity / 1e8,
    maximumFractionDigits: 8,
    minimumFractionDigits: 8
  });

  const customFields = [];
  
  // Add expected outcome if we have dispenser info
  if (!isLoadingInfo && dispenserInfo && numberOfDispenses > 0) {
    const totalReceived = Number(dispenserInfo.give_quantity_normalized) * numberOfDispenses;
    const assetName = dispenserInfo.asset_longname || dispenserInfo.asset;
    
    customFields.push(
      { 
        label: "# of Dispenses", 
        value: numberOfDispenses.toString() 
      },
      { 
        label: "You Receive", 
        value: `${formatAmount({
          value: totalReceived,
          minimumFractionDigits: 0,
          maximumFractionDigits: 8
        })} ${assetName}` 
      },
      { 
        label: "BTC Payment", 
        value: `${btcAmount} BTC` 
      }
    );
    
    // Add dispenser TX hash if available
    if (dispenserInfo.tx_hash) {
      customFields.push({
        label: "Dispenser TX Hash",
        value: dispenserInfo.tx_hash
      });
    }
    
    // Add mempool warning if there are competing transactions
    if (mempoolDispenses.length > 0) {
      const competingTxs = mempoolDispenses.map(tx => 
        `• ${tx.source.substring(0, 6)}...${tx.source.substring(tx.source.length - 4)} - ${formatAmount({
          value: tx.btc_amount / 1e8,
          minimumFractionDigits: 8,
          maximumFractionDigits: 8
        })} BTC${tx.fee_rate ? ` @ ${tx.fee_rate} sat/vB` : ''}`
      ).join('\n');
      
      customFields.push({
        label: "⚠️ Race Condition Warning",
        value: `${mempoolDispenses.length} pending transaction(s) competing for this dispenser:\n${competingTxs}\n\nThe dispenser may be depleted before your transaction confirms.`
      });
    }
  } else if (!isLoadingInfo && !dispenserInfo) {
    // Only show basic payment info if we couldn't fetch dispenser details
    customFields.push(
      { 
        label: "BTC Payment", 
        value: `${btcAmount} BTC` 
      }
    );
  }

  return (
    <ReviewScreen
      apiResponse={apiResponse}
      onSign={onSign}
      onBack={onBack}
      customFields={customFields}
      error={error}
      isSigning={isSigning}
    />
  );
}
