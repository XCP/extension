import { useState } from 'react';
import { useWallet } from '@/contexts/wallet-context';
import { useNavigate } from 'react-router-dom';
import { 
  consolidationApi,
  type ConsolidationData,
  type ConsolidationReport
} from '@/services/consolidationApiService';
import { consolidateBareMultisigBatch } from '@/utils/blockchain/bitcoin/consolidateBatch';

export interface ConsolidationResult {
  batchNumber: number;
  txid: string;
  utxosConsolidated: number;
  status: 'success' | 'error';
  error?: string;
}

export function useMultiBatchConsolidation() {
  const navigate = useNavigate();
  const { 
    activeWallet, 
    activeAddress, 
    broadcastTransaction, 
    getPrivateKey 
  } = useWallet();
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [results, setResults] = useState<ConsolidationResult[]>([]);

  const consolidateAllBatches = async (
    allBatches: ConsolidationData[],
    feeRateSatPerVByte: number,
    destinationAddress?: string,
    includeStamps: boolean = false
  ) => {
    if (!activeWallet || !activeAddress) {
      throw new Error('Wallet not properly initialized');
    }

    setIsProcessing(true);
    setResults([]);
    const batchResults: ConsolidationResult[] = [];

    try {
      // Get the private key once for all batches
      const privateKeyResult = await getPrivateKey(
        activeWallet.id,
        activeAddress.path
      );
      const privateKey = privateKeyResult.key;

      // Process each batch sequentially
      for (let i = 0; i < allBatches.length; i++) {
        const batch = allBatches[i];
        setCurrentBatch(i + 1);
        
        try {
          console.log(`Processing batch ${i + 1} of ${allBatches.length}`);
          
          // Check if we can still broadcast
          if (i > 0) {
            const canBroadcast = await consolidationApi.canBroadcastMore(activeAddress.address);
            if (!canBroadcast) {
              throw new Error('Mempool limit reached. Please wait for confirmations before continuing.');
            }
          }

          // Build and sign the transaction for this batch
          const consolidationResult = await consolidateBareMultisigBatch(
            privateKey,
            activeAddress.address,
            batch,
            feeRateSatPerVByte,
            destinationAddress
          );

          // Broadcast the transaction
          const broadcastResult = await broadcastTransaction(consolidationResult.signedTxHex);
          const txid = typeof broadcastResult === 'string' 
            ? broadcastResult 
            : broadcastResult.txid;
          
          console.log(`Batch ${i + 1} broadcast successfully: ${txid}`);

          // Report to API for tracking with actual fees
          const report: ConsolidationReport = {
            txid: txid || '',
            batch_number: i + 1,
            utxo_count: batch.summary.batch_utxos,
            total_input: consolidationResult.totalInput,
            network_fee: consolidationResult.networkFee,
            service_fee: consolidationResult.serviceFee,
            output_amount: consolidationResult.outputAmount,
          };
          
          await consolidationApi.reportConsolidation(activeAddress.address, report);

          // Add to results
          const result: ConsolidationResult = {
            batchNumber: i + 1,
            txid: txid || '',
            utxosConsolidated: batch.summary.batch_utxos,
            status: 'success'
          };
          
          batchResults.push(result);
          setResults([...batchResults]);
          
        } catch (batchError) {
          console.error(`Error processing batch ${i + 1}:`, batchError);
          
          const result: ConsolidationResult = {
            batchNumber: i + 1,
            txid: '',
            utxosConsolidated: batch.summary.batch_utxos,
            status: 'error',
            error: batchError instanceof Error ? batchError.message : String(batchError)
          };
          
          batchResults.push(result);
          setResults([...batchResults]);
          
          // Stop processing on error
          throw new Error(`Batch ${i + 1} failed: ${result.error}`);
        }
      }

      // All batches successful - navigate to success with results
      navigate('/consolidation-success', { 
        state: { 
          results: batchResults,
          totalBatches: allBatches.length,
          address: activeAddress.address
        }
      });
      
      return batchResults;
      
    } catch (error) {
      console.error('Consolidation failed:', error);
      throw error;
    } finally {
      setIsProcessing(false);
      setCurrentBatch(0);
    }
  };

  return {
    consolidateAllBatches,
    isProcessing,
    currentBatch,
    results
  };
}