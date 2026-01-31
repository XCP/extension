import { useEffect, useState } from "react";
import { ReviewScreen } from "@/components/screens/review-screen";
import { formatAmount } from "@/utils/format";
import { fromSatoshis } from "@/utils/numeric";
import { fetchAddressDispensers, fetchDispenserDispenses } from "@/utils/blockchain/counterparty/api";
import { useMarketPrices } from "@/hooks/useMarketPrices";
import { useSettings } from "@/contexts/settings-context";
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


interface MempoolDispense {
  source: string;
  btc_amount: number;
  fee_rate?: number;
  tx_hash: string;
}

// Extended dispenser type with verbose fields
interface VerboseDispenser {
  tx_hash: string;
  source: string;
  asset: string;
  status: number;
  give_remaining: number;
  give_remaining_normalized: string;
  give_quantity?: number;
  satoshirate?: number;
  asset_info?: {
    asset_longname: string | null;
    description: string;
    issuer: string | null;
    divisible: boolean;
    locked: boolean;
  };
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
  const { settings } = useSettings();
  const { btc: btcPrice } = useMarketPrices(settings.fiat);
  const [isLoadingInfo, setIsLoadingInfo] = useState(true);
  const [mempoolDispenses, setMempoolDispenses] = useState<MempoolDispense[]>([]);
  
  // Extract dispenser address from the transaction outputs
  const dispenserAddress = result?.params?.destination;
  const btcQuantity = result?.params?.quantity || 0;
  const [allTriggeredDispensers, setAllTriggeredDispensers] = useState<VerboseDispenser[]>([]);
  
  // Fetch dispenser details and check mempool
  useEffect(() => {
    const fetchInfo = async () => {
      if (!dispenserAddress) {
        setIsLoadingInfo(false);
        return;
      }
      
      try {
        // Fetch dispenser info
        const response = await fetchAddressDispensers(dispenserAddress, {
          status: "open",
          verbose: true
        });

        if (response.result && response.result.length > 0) {
          // Cast to VerboseDispenser type for verbose response
          const verboseDispensers = response.result as VerboseDispenser[];
          
          // Find ALL dispensers that will trigger based on BTC amount
          const triggered = verboseDispensers.filter(d => (d.satoshirate || 0) <= btcQuantity);
          
          // Sort by asset name (alphabetically) as that's the order they process
          const sorted = [...triggered].sort((a, b) => a.asset.localeCompare(b.asset));
          
          setAllTriggeredDispensers(sorted);
          
          // Set the first triggered dispenser for backward compatibility
          const triggeredDispenser = sorted[0];
          
          if (triggeredDispenser) {
            // Check for mempool dispenses from the same dispenser
            try {
              const dispensesResponse = await fetchDispenserDispenses(
                triggeredDispenser.tx_hash,
                { showUnconfirmed: true, verbose: true }
              );

              // Filter for unconfirmed (mempool) transactions
              const mempoolTxs = dispensesResponse.result?.filter((d: any) => 
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
  const btcInBtc = fromSatoshis(btcQuantity, true);
  const btcAmount = formatAmount({
    value: btcInBtc,
    maximumFractionDigits: 8,
    minimumFractionDigits: 8
  });
  const btcInFiat = btcPrice ? btcInBtc * btcPrice : null;

  const customFields = [];
  
  // Add expected outcome if we have triggered dispensers
  if (!isLoadingInfo && allTriggeredDispensers.length > 0) {
    // Calculate what will be received from all dispensers
    const receivedAssets = allTriggeredDispensers.map(dispenser => {
      const isDivisible = dispenser.asset_info?.divisible ?? false;
      const satoshirate = dispenser.satoshirate || 0;
      const numberOfDispenses = satoshirate > 0 ? Math.floor(btcQuantity / satoshirate) : 0;
      // For divisible assets, give_quantity is in satoshis; for indivisible, it's the raw count
      const giveQuantity = isDivisible
        ? fromSatoshis(dispenser.give_quantity || 0, true)
        : (dispenser.give_quantity || 0);
      const totalReceived = giveQuantity * numberOfDispenses;
      const assetName = dispenser.asset_info?.asset_longname || dispenser.asset;

      return `${formatAmount({
        value: totalReceived,
        minimumFractionDigits: 0,
        maximumFractionDigits: isDivisible ? 8 : 0
      })} ${assetName}`;
    });
    
    // Format USD value for BTC payment
    const usdDisplay = btcInFiat !== null
      ? `$${formatAmount({ value: btcInFiat, minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : null;

    // If multiple dispensers trigger, show all assets
    if (allTriggeredDispensers.length > 1) {
      customFields.push(
        {
          label: "Dispensers",
          value: allTriggeredDispensers.length.toString()
        },
        {
          label: "You Receive",
          value: receivedAssets.join('\n')
        },
        {
          label: "BTC Payment",
          value: `${btcAmount} BTC`,
          rightElement: usdDisplay ? <span className="text-gray-500">{usdDisplay}</span> : undefined
        }
      );
    } else {
      // Single dispenser
      const dispenser = allTriggeredDispensers[0];
      const satoshirate = dispenser.satoshirate || 0;
      const numberOfDispenses = satoshirate > 0 ? Math.floor(btcQuantity / satoshirate) : 0;

      // Add dispenser TX hash first (after To:)
      if (dispenser.tx_hash) {
        customFields.push({
          label: "Dispenser",
          value: dispenser.tx_hash
        });
      }

      customFields.push(
        {
          label: "# of Dispenses",
          value: numberOfDispenses.toString()
        },
        {
          label: "You Receive",
          value: receivedAssets[0]
        },
        {
          label: "BTC Payment",
          value: `${btcAmount} BTC`,
          rightElement: usdDisplay ? <span className="text-gray-500">{usdDisplay}</span> : undefined
        }
      );
    }
    
    // Add mempool warning if there are competing transactions
    if (mempoolDispenses.length > 0) {
      const competingTxs = mempoolDispenses.map(tx => 
        `• ${tx.source.substring(0, 6)}…${tx.source.substring(tx.source.length - 4)} - ${formatAmount({
          value: fromSatoshis(tx.btc_amount, true),
          minimumFractionDigits: 8,
          maximumFractionDigits: 8
        })} BTC${tx.fee_rate ? ` @ ${tx.fee_rate} sat/vB` : ''}`
      ).join('\n');
      
      customFields.push({
        label: "⚠️ Race Condition Warning",
        value: `${mempoolDispenses.length} pending transaction(s) competing for this dispenser:\n${competingTxs}\n\nThe dispenser may be depleted before your transaction confirms.`
      });
    }
  } else if (!isLoadingInfo && allTriggeredDispensers.length === 0) {
    // Only show basic payment info if we couldn't fetch dispenser details or none trigger
    const usdDisplay = btcInFiat !== null
      ? `$${formatAmount({ value: btcInFiat, minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : null;
    customFields.push(
      {
        label: "BTC Payment",
        value: `${btcAmount} BTC`,
        rightElement: usdDisplay ? <span className="text-gray-500">{usdDisplay}</span> : undefined
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
