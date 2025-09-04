import { useState } from 'react';
import { useWallet } from '@/contexts/wallet-context';
import { 
  consolidateBareMultisig,
  fetchConsolidationFeeConfig,
  estimateConsolidationFees
} from '@/utils/blockchain/bitcoin';

export function useConsolidateAndBroadcast() {
  const { 
    activeWallet, 
    activeAddress, 
    broadcastTransaction, 
    getPrivateKey 
  } = useWallet();
  const [isProcessing, setIsProcessing] = useState(false);
  const [feeConfig, setFeeConfig] = useState<{ feeAddress?: string; feePercent?: number } | null>(null);

  const consolidateAndBroadcast = async (
    feeRateSatPerVByte: number,
    destinationAddress?: string,
    includeServiceFee: boolean = true,
    includeStamps: boolean = false
  ) => {
    if (!activeWallet || !activeAddress) {
      throw new Error('Wallet not properly initialized');
    }

    setIsProcessing(true);
    try {
      // Get the private key using wallet context
      const privateKeyResult = await getPrivateKey(
        activeWallet.id,
        activeAddress.path // Use the derivation path from activeAddress
      );
      const privateKey = privateKeyResult.key;

      // Build consolidation options
      let consolidationOptions: any = {
        includeStamps // Pass the includeStamps option
      };
      
      // Fetch fee configuration if service fee is enabled
      if (includeServiceFee) {
        const config = await fetchConsolidationFeeConfig(activeAddress.address);
        if (config) {
          setFeeConfig({
            feeAddress: config.fee_address || undefined,
            feePercent: config.fee_percent
          });
          consolidationOptions.serviceFeeAddress = config.fee_address || undefined;
          consolidationOptions.serviceFeeRate = config.fee_percent;
        }
      }

      // Get signed transaction hex using the retrieved private key
      const signedTxHex = await consolidateBareMultisig(
        privateKey,
        activeAddress.address,
        feeRateSatPerVByte,
        destinationAddress,
        consolidationOptions
      );

      // Broadcast the transaction
      const result = await broadcastTransaction(signedTxHex);
      return result;
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    consolidateAndBroadcast,
    isProcessing,
    feeConfig,
    fetchConsolidationFeeConfig,
    estimateConsolidationFees
  };
} 