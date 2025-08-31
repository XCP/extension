import { useState } from 'react';
import { useWallet } from '@/contexts/wallet-context';
import { consolidateBareMultisig } from '@/utils/blockchain/bitcoin';

export function useConsolidateAndBroadcast() {
  const { 
    activeWallet, 
    activeAddress, 
    broadcastTransaction, 
    getPrivateKey 
  } = useWallet();
  const [isProcessing, setIsProcessing] = useState(false);

  const consolidateAndBroadcast = async (
    feeRateSatPerVByte: number,
    destinationAddress?: string
  ) => {
    if (!activeWallet || !activeAddress) {
      throw new Error('Wallet not properly initialized');
    }

    setIsProcessing(true);
    try {
      // Get the private key using wallet context
      const { key: privateKey } = await getPrivateKey(
        activeWallet.id,
        activeAddress.path // Use the derivation path from activeAddress
      );

      // Get signed transaction hex using the retrieved private key
      const signedTxHex = await consolidateBareMultisig(
        privateKey,
        activeAddress.address,
        feeRateSatPerVByte,
        destinationAddress
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
    isProcessing
  };
} 