import type { ConsolidationData, ConsolidationUTXO } from './consolidationApi';

/** Send each funding transaction once across the popup/background RPC boundary. */
export type ConsolidationRequest = Omit<ConsolidationData, 'utxos'> & {
  utxos: Omit<ConsolidationUTXO, 'prev_tx_hex'>[];
  transactions: Record<string, string>;
};

export function toConsolidationRequest(batch: ConsolidationData): ConsolidationRequest {
  const transactions: Record<string, string> = Object.create(null);
  const utxos = batch.utxos.map(({ prev_tx_hex, ...utxo }) => {
    const existing = transactions[utxo.txid];
    if (existing !== undefined && existing !== prev_tx_hex) {
      throw new Error(`Conflicting previous transaction for ${utxo.txid}`);
    }
    transactions[utxo.txid] = prev_tx_hex;
    return utxo;
  });
  return { ...batch, utxos, transactions };
}

/** Restore the signer's input shape; it still verifies every txid, output, amount and script. */
export function fromConsolidationRequest(request: ConsolidationRequest): ConsolidationData {
  const { transactions, ...batch } = request;
  const utxos = batch.utxos.map((utxo) => {
    const prevTx = transactions && Object.hasOwn(transactions, utxo.txid)
      ? transactions[utxo.txid] : undefined;
    if (typeof prevTx !== 'string' || prevTx.length === 0) {
      throw new Error(`Missing previous transaction for ${utxo.txid}`);
    }
    return { ...utxo, prev_tx_hex: prevTx };
  });
  return { ...batch, utxos };
}
