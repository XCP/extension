import { lockedOutpoints } from '@/core/bitcoin/coinLockAccess';
import { isUtxoRecentlySpent } from '@/core/bitcoin/spentUtxoCache';
import { fetchUTXOs } from '@/core/bitcoin/utxo';
import { fetchInputsAttachedAssets } from '@/core/counterparty/inputAssets';
import { getActiveSettings } from '@/core/settings';
import { fetchZeldBalance, type ZeldUtxo } from '@/core/zeld/api';

export interface SpendableZeld {
  total: bigint;
  available: bigint;
  locked: bigint;
  unavailable: bigint;
  utxos: Array<ZeldUtxo & { value: number }>;
}

/** Shared by Max and compose. Only ZELD candidates need attachment lookups. */
export async function selectSpendableZeld(
  address: string,
  allowUnconfirmed = getActiveSettings().allowUnconfirmedTxs,
): Promise<SpendableZeld> {
  const [zeld, bitcoin] = await Promise.all([fetchZeldBalance(address), fetchUTXOs(address)]);
  const locks = await lockedOutpoints(address, bitcoin);
  const keyOf = (coin: { txid: string; vout: number }) => `${coin.txid.toLowerCase()}:${coin.vout}`;
  const bitcoinByOutpoint = new Map(bitcoin.map(coin => [keyOf(coin), coin]));
  const result: SpendableZeld = { total: zeld.baseUnits, available: 0n, locked: 0n, unavailable: 0n, utxos: [] };
  const candidates: SpendableZeld['utxos'] = [];
  for (const coin of zeld.utxos) {
    const key = keyOf(coin);
    const funding = bitcoinByOutpoint.get(key);
    if (locks.has(key)) result.locked += coin.balance;
    else if (!funding || (!allowUnconfirmed && !funding.status.confirmed) || isUtxoRecentlySpent(coin.txid, coin.vout)) {
      result.unavailable += coin.balance;
    } else candidates.push({ ...coin, value: funding.value });
  }
  // ZELD ownership does not prove an output is free of Counterparty attachments.
  // Use the same parent/ledger evidence as signing, including confirmed-but-unindexed outputs.
  const evidence = await fetchInputsAttachedAssets(candidates.map((coin, index) => ({
    index, txid: coin.txid, vout: coin.vout,
  })));
  const unsafe = new Set(evidence.filter(entry => entry.assets.length > 0 || entry.lookupFailed)
    .map(entry => entry.inputIndex));
  for (const [index, coin] of candidates.entries()) {
    if (unsafe.has(index) || isUtxoRecentlySpent(coin.txid, coin.vout)) result.unavailable += coin.balance;
    else {
      result.utxos.push(coin);
      result.available += coin.balance;
    }
  }
  return result;
}
