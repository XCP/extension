/**
 * The DEX order card, shared by both approval screens.
 *
 * An order is the one message type with a layout of its own: two boxes and the rate between them,
 * because a trade is two amounts that only mean something as a pair. It lived inside the
 * raw-transaction screen, so a PSBT carrying the identical message fell through to the generic
 * headline-and-details rendering — one message, two appearances, depending on which method the
 * site happened to call.
 *
 * That is the same shape as the bug that made pool deposits disagree by 1e8 between two decoders:
 * a rule with two implementations gets fixed in whichever one the author is looking at. Here the
 * cost is milder (a person recognises one screen and not the other) but the cause is identical, so
 * the card and the builder live together and both screens call them.
 *
 * The receive box says "at least", because that is what an order's get_quantity is: the guaranteed
 * minimum, not a prediction. Sites show pool estimates; the signed message carries the bound. Every
 * major wallet simulates and shows the estimate, so a decoded minimum with no label reads as the
 * site's number gone wrong — a real user cancelled a correct transaction over exactly this. The
 * card therefore names the category, and beside it fetches its own pool quote from the wallet's
 * configured node — never from anything the site supplied — so the user sees the wallet
 * independently agree with what the site promised. When the order's minimum sits far below the
 * wallet's own quote, that same fetch turns into a warning: either the pool moved, or the site
 * composed against a number it shouldn't have.
 */

import { useEffect, useState } from 'react';
import { isAssetDivisible, normalizeQuantity } from '@/components/domain/tx/tx-action-info';
import { FiArrowDown } from '@/components/icons';
import { fetchPoolQuote, type PoolQuote } from '@/core/counterparty/api';
import type { CounterpartyMessage } from '@/core/counterparty/transaction';
import type { ProviderVerificationResult } from '@/core/counterparty/unpack';
import { formatPriceRatio } from '@/core/format';
import { type BigNumber, divide, isGreaterThan, subtract, toBigNumber, toNumber } from '@/core/numeric';

export interface OrderAction {
  giveAmount: string;
  giveAsset: string;
  getAmount: string;
  getAsset: string;
  /**
   * Give/get quantities in display units, for the price ratio — or null when divisibility could
   * not be established for both assets, in which case no ratio is shown. A ratio of raw base units
   * is wrong by 1e8 for a mixed-divisibility pair, and silently right for a matched one, which is
   * what hid it.
   */
  normalizedGive: number | null;
  normalizedGet: number | null;
  expiration: number;
  /**
   * Raw asset names and base-unit quantities, for the wallet's own pool-quote lookup. Raw names
   * because the API routes on them (a longname is display-only); strings because a 64-bit quantity
   * through Number() is already rounded.
   */
  giveAssetRaw: string;
  getAssetRaw: string;
  giveQuantityRaw: string;
  getQuantityRaw: string;
  /**
   * What the get side's base units divide by for display: 1e8, 1, or null when divisibility could
   * not be established. Carried rather than recovered from the normalized figure, which would mean
   * dividing two floats to recover a constant this builder already computed.
   */
  getDivisor: number | null;
}

/** The parts of a decoded transaction or PSBT this builder reads — both screens supply them. */
export interface OrderSource {
  counterpartyMessage?: CounterpartyMessage;
  verification?: ProviderVerificationResult;
}

/**
 * Build the order card's data, or null when this is not an order.
 *
 * Prefers the API decode, which carries `*_info` divisibility, and falls back to the local unpack,
 * which carries asset names but no divisibility — so on that path the ratio is withheld for
 * anything but BTC and XCP rather than computed against a guess.
 */
export function buildOrderAction(source: OrderSource): OrderAction | null {
  if (source.counterpartyMessage?.messageType === 'order') {
    const { messageData } = source.counterpartyMessage;
    const giveAssetRaw = String(messageData.give_asset ?? '');
    const getAssetRaw = String(messageData.get_asset ?? '');

    // Prefer asset_longname (subasset display name) over numeric ID
    const giveInfo = messageData.give_asset_info as { asset_longname?: string | null } | undefined;
    const getInfo = messageData.get_asset_info as { asset_longname?: string | null } | undefined;

    const giveDivisor = isAssetDivisible(giveAssetRaw, messageData, 'give_asset') ? 1e8 : 1;
    const getDivisor = isAssetDivisible(getAssetRaw, messageData, 'get_asset') ? 1e8 : 1;

    return {
      giveAmount: normalizeQuantity(
        messageData.give_quantity,
        giveAssetRaw,
        messageData,
        'give_asset'
      ),
      giveAsset: giveInfo?.asset_longname || giveAssetRaw,
      getAmount: normalizeQuantity(messageData.get_quantity, getAssetRaw, messageData, 'get_asset'),
      getAsset: getInfo?.asset_longname || getAssetRaw,
      // Divided as BigNumber before narrowing to a float: a 64-bit quantity passed through
      // Number() first is already rounded, and the result feeds the displayed price.
      normalizedGive: toNumber(divide(String(messageData.give_quantity), giveDivisor)),
      normalizedGet: toNumber(divide(String(messageData.get_quantity), getDivisor)),
      expiration: Number(messageData.expiration ?? 0),
      giveAssetRaw,
      getAssetRaw,
      giveQuantityRaw: String(messageData.give_quantity ?? ''),
      getQuantityRaw: String(messageData.get_quantity ?? ''),
      getDivisor,
    };
  }

  const unpack = source.verification?.localUnpack;
  if (unpack?.success && unpack.messageType === 'order' && unpack.data) {
    const data = unpack.data as {
      giveAsset: string;
      giveQuantity: bigint;
      getAsset: string;
      getQuantity: bigint;
      expiration: number;
    };

    /** 1e8 for a known-divisible asset, 1 for a known-indivisible one, null when unknown. */
    const divisorFor = (asset: string): number | null => {
      const divisible = isAssetDivisible(asset);
      return divisible === undefined ? null : divisible ? 1e8 : 1;
    };
    const giveDivisor = divisorFor(data.giveAsset);
    const getDivisor = divisorFor(data.getAsset);

    return {
      giveAmount: normalizeQuantity(data.giveQuantity, data.giveAsset),
      giveAsset: data.giveAsset,
      getAmount: normalizeQuantity(data.getQuantity, data.getAsset),
      getAsset: data.getAsset,
      // Divisibility is not available on this path — the local unpack carries asset names, not
      // asset_info — so it can only be established for BTC and XCP. Rather than dividing by a
      // guess, the ratio is withheld unless both sides are known.
      normalizedGive:
        giveDivisor === null ? null : toNumber(divide(String(data.giveQuantity), giveDivisor)),
      normalizedGet:
        getDivisor === null ? null : toNumber(divide(String(data.getQuantity), getDivisor)),
      expiration: data.expiration,
      giveAssetRaw: data.giveAsset,
      getAssetRaw: data.getAsset,
      giveQuantityRaw: String(data.giveQuantity),
      getQuantityRaw: String(data.getQuantity),
      getDivisor,
    };
  }

  return null;
}

/**
 * The wallet's own read of the market, fetched from the configured node at approval time.
 *
 * `estimated_output` spans the pool *and* the order book — the API reports `pool_output` and
 * `book_output` separately and this is their sum — so the figure is a market estimate, not a pool
 * price. It is labelled "estimated", which is true of either venue; the venue breakdown is still
 * read, but only to tell an estimate backed by a real market from one backed by neither.
 *
 * `null` while loading, when the pair has no market, or when the node cannot be reached. In every
 * one of those cases the card shows the decoded minimum alone: the estimate is decoration, the
 * minimum is the contract, and signing is never blocked on this lookup.
 */
interface OwnQuote {
  /** Estimated output in base units. */
  estimatedRaw: BigNumber;
  /** Which venues the estimate came from, for the label. */
  route: 'pool' | 'book' | 'both' | null;
}

function routeOf(quote: PoolQuote): OwnQuote['route'] {
  const pool = isGreaterThan(quote.pool_output ?? 0, 0);
  const book = isGreaterThan(quote.book_output ?? 0, 0);
  if (pool && book) return 'both';
  if (pool) return 'pool';
  if (book) return 'book';
  return null;
}

function useOwnMarketQuote(order: OrderAction): OwnQuote | null {
  const [quote, setQuote] = useState<OwnQuote | null>(null);

  useEffect(() => {
    // BTC has no pool or book here, and a zero quantity has nothing to quote.
    if (
      order.giveAssetRaw === 'BTC' ||
      order.getAssetRaw === 'BTC' ||
      !order.giveQuantityRaw ||
      !isGreaterThan(order.giveQuantityRaw, 0)
    ) {
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        // fetchPoolQuote rather than a hand-rolled fetch: it encodes the asset names, skips the
        // cache, and parses through the lossless JSON boundary — a base-unit quantity read with
        // JSON.parse is already rounded above 2^53 (see core/api/losslessJson.ts).
        const result = await fetchPoolQuote(
          order.giveAssetRaw,
          order.getAssetRaw,
          order.giveQuantityRaw
        );
        if (cancelled) return;
        const estimatedRaw = toBigNumber(result.estimated_output ?? 0);
        if (estimatedRaw.isFinite() && estimatedRaw.isGreaterThan(0)) {
          setQuote({ estimatedRaw, route: routeOf(result) });
        }
      } catch {
        // No market, no node, no answer — the minimum stands on its own.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [order.giveAssetRaw, order.getAssetRaw, order.giveQuantityRaw]);

  return quote;
}

/** The give/receive card, with a rate the user can flip. */
export function OrderCard({ order }: { order: OrderAction }) {
  const [priceFlipped, setPriceFlipped] = useState(false);
  const ownQuote = useOwnMarketQuote(order);

  // Both figures are base-unit quantities, so they are compared as such and scaled for display by
  // the divisor the builder already established. Withheld when divisibility is unknown, exactly as
  // the price ratio is — showing an amount scaled by a guess is how a figure is wrong by 1e8.
  const minRaw = toBigNumber(order.getQuantityRaw || 0);
  const estimateDisplay =
    ownQuote && order.getDivisor !== null
      ? divide(ownQuote.estimatedRaw, order.getDivisor).toFixed(8)
      : null;

  /** How far below the wallet's own estimate this order is willing to settle, as a fraction. */
  const impliedSlippage =
    ownQuote && minRaw.isGreaterThan(0)
      ? toNumber(subtract(1, divide(minRaw, ownQuote.estimatedRaw)))
      : null;
  /** An estimate with no pool and no book behind it describes nothing, so it is not shown. */
  const hasVenue = ownQuote?.route != null;

  return (
    <div className="mb-3">
      <div className="bg-gray-50 rounded-lg p-4">
        <p className="text-xs text-gray-500 mb-1">You give</p>
        <p className="text-xl font-bold text-gray-900">
          {order.giveAmount}{' '}
          <span className="text-base font-normal text-gray-500">{order.giveAsset}</span>
        </p>
      </div>

      <div className="flex items-center justify-center gap-2 py-2">
        <div className="bg-white border border-gray-200 rounded-full p-1">
          <FiArrowDown className="size-3.5 text-gray-400" aria-hidden="true" />
        </div>
        <button
          type="button"
          onClick={() => setPriceFlipped((f) => !f)}
          className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer transition-colors"
          title="Click to flip price"
        >
          {order.normalizedGive === null || order.normalizedGet === null
            ? 'Price unavailable'
            : formatPriceRatio(
                order.normalizedGive,
                order.normalizedGet,
                order.giveAsset,
                order.getAsset,
                priceFlipped
              )}
        </button>
      </div>

      <div
        className="bg-gray-50 rounded-lg p-4"
        title={`Guaranteed by the transaction. If the market can't deliver this much, you keep your ${order.giveAsset}.`}
      >
        <p className="text-xs text-gray-500 mb-1">You receive at least</p>
        <p className="text-xl font-bold text-gray-900">
          {order.getAmount}{' '}
          <span className="text-base font-normal text-gray-500">{order.getAsset}</span>
        </p>
        {estimateDisplay !== null && hasVenue && impliedSlippage !== null
          && impliedSlippage >= 0 && (
          <p
            className="text-xs text-gray-500 mt-1.5"
            title="Estimated by your wallet from its own node, not supplied by the site."
          >
            ~{estimateDisplay} estimated
          </p>
        )}
        {impliedSlippage !== null && impliedSlippage < 0 && (
          <p className="text-xs text-red-600 mt-1.5">
            The market has moved below this minimum. This order is likely to rest unfilled instead
            of executing.
          </p>
        )}
        {impliedSlippage !== null && impliedSlippage >= 0.05 && (
          <p className="text-xs text-amber-600 mt-1.5">
            Accepts up to {(impliedSlippage * 100).toFixed(1)}% below the wallet's estimate —
            confirm this matches your slippage.
          </p>
        )}
      </div>

      <p className="text-xs text-gray-400 text-center mt-2">
        {order.expiration === 0
          ? 'Never expires'
          : `Expires in ${order.expiration.toLocaleString()} block${order.expiration === 1 ? '' : 's'}`}
      </p>
    </div>
  );
}
