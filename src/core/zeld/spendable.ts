import { lockedOutpoints } from '@/core/bitcoin/coinLockStore';
import { isUtxoRecentlySpent } from '@/core/bitcoin/spentUtxoCache';
import { fetchUTXOs } from '@/core/bitcoin/utxo';
import { fetchUtxosWithBalances } from '@/core/counterparty/api';
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
  // This complete, batched membership read fails closed. An address balance page can truncate
  // attachments on busy wallets; unrelated attached outputs do not belong in this query.
  const attached = candidates.length ? await fetchUtxosWithBalances(candidates.map(keyOf)) : new Set<string>();
  for (const coin of candidates) {
    if (attached.has(keyOf(coin)) || isUtxoRecentlySpent(coin.txid, coin.vout)) result.unavailable += coin.balance;
    else {
      result.utxos.push(coin);
      result.available += coin.balance;
    }
  }
  return result;
}
