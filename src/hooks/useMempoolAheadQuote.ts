import { useEffect, useState } from "react";
import {
  fetchMempoolOpenOrders,
  fetchOpenBookOrders,
  type Pool,
} from "@/core/counterparty/api";
import {
  type MempoolQuote,
  OTHER_POOL_FEE_BPS,
  quoteAfterMempool,
  XCP_POOL_FEE_BPS,
} from "@/core/counterparty/poolQuote";
import { toBigNumber } from "@/core/numeric";

/** A raw quantity as bigint, whether it arrived as a digit string or a number. */
const rawBig = (value: string | number): bigint => BigInt(toBigNumber(value).toFixed(0));

export interface MempoolAheadState {
  /** Null until both the pending orders and, if any, the book have been read. */
  data: MempoolQuote | null;
  isLoading: boolean;
}

/** What one answer was computed for, so an answer to an older question is never shown. */
interface Answer {
  key: string;
  data: MempoolQuote | null;
}

/**
 * The swap quote after the orders already in the mempool have had their turn.
 *
 * Core's `/quote` reflects the confirmed state only, and says so: "actual execution may differ if
 * trades confirm before yours." Those trades are public — the node lists its own mempool — so the
 * same-direction ones are replayed through Core's quote algorithm (poolQuote.ts) ahead of this
 * trade, and what they leave is what Auto slippage has to cover. Priced off the confirmed quote
 * alone, a swap missed its price whenever a pending order confirmed first, and rested for a block
 * instead of filling: a network fee for nothing.
 *
 * Two reads, the second only when the first finds something. The mempool listing is one call; the
 * resting book is fetched only while there are pending orders to replay through it. A book that
 * fails to load counts as empty: the pool then absorbs every pending order, which overstates the
 * drop, and overstating is the safe direction for a tolerance. A mempool read that fails yields
 * null — the form falls back to the tolerance it always used.
 */
export function useMempoolAheadQuote({
  giveAsset,
  getAsset,
  quantity,
  pool,
  feeBps,
  enabled,
}: {
  giveAsset: string;
  getAsset: string;
  /** Raw base units of giveAsset, as a digit string. */
  quantity: string;
  /** The pair's pool, or null when there is none; undefined while it loads. */
  pool: Pool | null | undefined;
  /** The fee the quote reported; the protocol default for the pair when it did not. */
  feeBps?: number;
  enabled: boolean;
}): MempoolAheadState {
  const [answer, setAnswer] = useState<Answer | null>(null);

  const reserveA = pool?.reserve_a;
  const reserveB = pool?.reserve_b;
  const poolAssetA = pool?.asset_a;
  const poolKnown = pool !== undefined;
  const active = enabled && poolKnown && /^\d+$/.test(quantity) && quantity !== "0";
  // Everything the answer depends on. The effect below only ever sets state after a network
  // round trip, so the question being asked is derived here rather than mirrored into state.
  const key = active
    ? [giveAsset, getAsset, quantity, poolAssetA ?? "", reserveA ?? "", reserveB ?? "", feeBps ?? ""].join("|")
    : "";

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    const settle = (data: MempoolQuote | null) => {
      if (!cancelled) setAnswer({ key, data });
    };

    const read = async () => {
      const pendingAhead = (await fetchMempoolOpenOrders())
        .filter((order) => order.give_asset === giveAsset && order.get_asset === getAsset)
        .map((order) => rawBig(order.give_quantity))
        .filter((give) => give > 0n);
      if (cancelled) return;
      if (pendingAhead.length === 0) {
        settle(null);
        return;
      }

      const book = await fetchOpenBookOrders(getAsset, giveAsset)
        .then((orders) =>
          orders
            .filter((order) => order.give_asset === getAsset && order.get_asset === giveAsset)
            .map((order) => ({
              giveQuantity: rawBig(order.give_quantity),
              getQuantity: rawBig(order.get_quantity),
              giveRemaining: rawBig(order.give_remaining),
              getRemaining: rawBig(order.get_remaining),
            }))
        )
        .catch(() => []);
      if (cancelled) return;

      const hasPool =
        reserveA !== undefined && reserveB !== undefined && reserveA > 0 && reserveB > 0;
      const simPool = hasPool
        ? {
            reserveIn: rawBig(poolAssetA === giveAsset ? reserveA : reserveB),
            reserveOut: rawBig(poolAssetA === giveAsset ? reserveB : reserveA),
            feeBps:
              feeBps ?? (giveAsset === "XCP" || getAsset === "XCP" ? XCP_POOL_FEE_BPS : OTHER_POOL_FEE_BPS),
          }
        : null;
      if (!simPool && book.length === 0) {
        settle(null);
        return;
      }

      settle(quoteAfterMempool({ pool: simPool, book }, pendingAhead, BigInt(quantity)));
    };

    read().catch(() => settle(null));

    return () => {
      cancelled = true;
    };
  }, [active, key, quantity, giveAsset, getAsset, reserveA, reserveB, poolAssetA, feeBps]);

  if (!active) return { data: null, isLoading: false };
  const current = answer !== null && answer.key === key;
  return { data: current ? answer.data : null, isLoading: !current };
}
