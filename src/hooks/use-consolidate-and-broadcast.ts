import { useState } from 'react';
import { useWallet } from '@/contexts/wallet-context';
import { consolidateBareMultisig } from '@/utils/blockchain/bitcoin/bareMultisig';

export function useConsolidateAndBroadcast() {
  const { activeWallet, activeAddress, broadcastTransaction } = useWallet();
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
      // Get signed transaction hex
      const signedTxHex = await consolidateBareMultisig(
        activeWallet.id,
        activeAddress.address,
        feeRateSatPerVByte,
        destinationAddress
      );

      // Broadcast the transaction
      const txid = await broadcastTransaction(signedTxHex);
      return txid;
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    consolidateAndBroadcast,
    isProcessing
  };
} 