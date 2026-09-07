import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { ReviewScreen } from "@/components/screens/review-screen";
import { useSettings } from "@/contexts/settings-context";
import { fetchAddressDispensers, fetchMempoolDispenses } from "@/core/counterparty/api";
import {
  type DispensePayout,
  describePayout,
  resolveDispensersAt,
} from '@/core/counterparty/dispenseOutcome';
import { formatAmount } from "@/core/format";
import { divide, fromSatoshis, roundDown, toBigNumber } from "@/core/numeric";
import { useMarketPrices } from "@/hooks/useMarketPrices";

import { t } from '@/i18n';

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
  
  const dispenserAddress = result?.params?.dispenser;
  const btcQuantity = result?.params?.quantity || 0;
  const [allTriggeredDispensers, setAllTriggeredDispensers] = useState<VerboseDispenser[]>([]);
  const [payouts, setPayouts] = useState<DispensePayout[]>([]);
  
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
          setPayouts(await resolveDispensersAt(dispenserAddress, btcQuantity));
          
          try {
            const pending = await fetchMempoolDispenses(dispenserAddress);
            setMempoolDispenses(pending.map((tx) => ({
              source: tx.destination || tx.source,
              btc_amount: tx.btc_amount || 0,
              tx_hash: tx.tx_hash,
            })));
          } catch (err) {
            console.error("Failed to fetch mempool dispenses:", err);
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
    // Payout arithmetic is shared with the provider approval screen; see dispenseOutcome.ts for
    // why it must not be reimplemented here.
    const receivedAssets = payouts.map(describePayout);
    
    // Format USD value for BTC payment
    const usdDisplay = btcInFiat !== null
      ? `$${formatAmount({ value: btcInFiat, minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : null;

    // If multiple dispensers trigger, show all assets
    if (allTriggeredDispensers.length > 1) {
      customFields.push(
        {
          label: t('common_dispensers'),
          value: allTriggeredDispensers.length.toString()
        },
        {
          label: t('common_you_receive'),
          value: receivedAssets.join('\n')
        },
        {
          label: t('dispense_review_btc_payment'),
          value: `${btcAmount} BTC`,
          rightElement: usdDisplay ? <span className="text-gray-500">{usdDisplay}</span> : undefined
        }
      );
    } else {
      // Single dispenser
      const dispenser = allTriggeredDispensers[0]!;
      const satoshirate = toBigNumber(dispenser.satoshirate || 0);
      const numberOfDispenses = satoshirate.isGreaterThan(0)
        ? roundDown(divide(btcQuantity, satoshirate))
        : toBigNumber(0);

      // Add dispenser TX hash first (after To:)
      if (dispenser.tx_hash) {
        customFields.push({
          label: t('common_dispenser'),
          value: dispenser.tx_hash
        });
      }

      customFields.push(
        {
          label: t('dispense_review_of_dispenses'),
          value: numberOfDispenses.toString()
        },
        {
          label: t('common_you_receive'),
          value: receivedAssets[0]
        },
        {
          label: t('dispense_review_btc_payment'),
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
        })} BTC${tx.fee_rate ? t('dispense_review_sat_vb', [String(tx.fee_rate)]) : ''}`
      ).join('\n');
      
      customFields.push({
        label: t('dispense_review_race_condition_warning'),
        value: t('dispense_review_pending_transaction_s_competing_for', [String(mempoolDispenses.length), String(competingTxs)])
      });
    }
  } else if (!isLoadingInfo && allTriggeredDispensers.length === 0) {
    // Only show basic payment info if we couldn't fetch dispenser details or none trigger
    const usdDisplay = btcInFiat !== null
      ? `$${formatAmount({ value: btcInFiat, minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : null;
    customFields.push(
      {
        label: t('dispense_review_btc_payment'),
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
