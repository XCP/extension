/**
 * Counterparty's swap quote, ported so it can be run against a state the
 * node does not have yet: the mempool's.
 *
 * Core's `/pools/{a}/{b}/quote` says of itself "reflects current state only;
 * actual execution may differ if trades confirm before yours." That gap is
 * exactly what slippage exists to cover, and it is a gap we can see — the
 * pending orders on a pair are public. This module is the quote algorithm
 * (`api/queries.py::get_pool_quote` and the integer helpers in
 * `ledger/markets.py`) in bigint, so a page can replay the orders already
 * ahead of a trade and quote what is left for it.
 *
 * Integer math throughout, mirroring execution's own floors, because a
 * quote in doubles would quietly disagree with consensus at the boundaries
 * that decide whether a market order fills or rests. Nothing here talks to
 * the network; callers bring the pool, the book, and the pending orders.
 *
 * The routing rule, as Core documents it: fill from the pool while its
 * marginal price beats the best resting order, take that order, repeat; the
 * pool absorbs whatever the book cannot. `fix_pool_best_price_routing`
 * (block 961,100) is assumed live, so the pool fills use the integer-exact
 * search rather than the older continuous quadratic.
 */

const BPS = 10_000n;

/** The fee a pool charges, in basis points — Core's ledger/markets.py. */
export const XCP_POOL_FEE_BPS = 50;
export const OTHER_POOL_FEE_BPS = 100;

/** The side of the pool a taker sees: what they pay into, what they draw. */
export interface PoolSide {
  reserveIn: bigint;
  reserveOut: bigint;
  feeBps: number;
}

/**
 * A resting order on the far side of the book: the maker GIVES what the
 * taker wants and GETS what the taker pays. Original quantities carry the
 * price; remaining quantities carry the depth.
 */
export interface BookOrder {
  giveQuantity: bigint;
  getQuantity: bigint;
  giveRemaining: bigint;
  getRemaining: bigint;
}

/** Everything one taker's fill can change. */
export interface MarketState {
  pool: PoolSide | null;
  book: BookOrder[];
}

export interface Fill {
  /** What the taker receives, pool and book together. */
  output: bigint;
  poolOutput: bigint;
  bookOutput: bigint;
  /** What neither the pool nor the book could take. */
  giveRemaining: bigint;
}

const bigMax = (a: bigint, b: bigint) => (a > b ? a : b);
const bigMin = (a: bigint, b: bigint) => (a < b ? a : b);

/** Constant-product output for one input, fee taken on the way in. */
export function computePoolOutput(
  reserveIn: bigint,
  reserveOut: bigint,
  input: bigint,
  feeBps: number,
): bigint {
  if (input <= 0n || reserveIn <= 0n || reserveOut <= 0n) return 0n;
  const inputWithFee = input * (BPS - BigInt(feeBps));
  return (inputWithFee * reserveOut) / (reserveIn * BPS + inputWithFee);
}

/** Smallest input whose floored output reaches `output`; `high` already does. */
function minPoolInputForOutput(
  reserveIn: bigint,
  reserveOut: bigint,
  output: bigint,
  feeBps: number,
  high: bigint,
): bigint {
  let low = 1n;
  while (low < high) {
    const mid = (low + high) / 2n;
    if (computePoolOutput(reserveIn, reserveOut, mid, feeBps) >= output) high = mid;
    else low = mid + 1n;
  }
  return low;
}

/**
 * What the book charges for `output` units at a maker's price — Python's
 * `round()` on an exact fraction, which is half-to-even.
 */
function bookInputForOutput(output: bigint, priceNum: bigint, priceDen: bigint): bigint {
  const numerator = output * priceNum;
  const quotient = numerator / priceDen;
  const remainder = numerator - quotient * priceDen;
  const twice = remainder * 2n;
  if (twice < priceDen) return quotient;
  if (twice > priceDen) return quotient + 1n;
  return quotient % 2n === 0n ? quotient : quotient + 1n;
}

/**
 * The most a taker should put through the pool before the next resting order
 * is the better deal, capped at what they have left. Zero when the pool is
 * already past that price.
 */
export function computePoolInputForTargetPrice(
  reserveIn: bigint,
  reserveOut: bigint,
  priceNum: bigint,
  priceDen: bigint,
  feeBps: number,
  maxInput: bigint,
): bigint {
  if (reserveIn <= 0n || reserveOut <= 0n) return 0n;
  if (priceNum <= 0n || priceDen <= 0n) return 0n;
  const feeFactor = BPS - BigInt(feeBps);
  if (reserveIn * BPS * priceDen >= reserveOut * feeFactor * priceNum) return 0n;

  // Largest input whose post-fill marginal price still beats the book.
  let high = (reserveOut * feeFactor * priceNum) / (BPS * priceDen) - reserveIn;
  high = bigMin(bigMax(high, 0n), maxInput);
  let low = 0n;
  while (low < high) {
    const mid = (low + high + 1n) / 2n;
    const output = computePoolOutput(reserveIn, reserveOut, mid, feeBps);
    if ((reserveIn + mid) * BPS * priceDen <= (reserveOut - output) * feeFactor * priceNum) {
      low = mid;
    } else {
      high = mid - 1n;
    }
  }

  // Never pay the pool more than the book would charge for the same units.
  let dx = low;
  let output = computePoolOutput(reserveIn, reserveOut, dx, feeBps);
  while (output > 0n) {
    const minInput = minPoolInputForOutput(reserveIn, reserveOut, output, feeBps, dx);
    if (minInput <= bookInputForOutput(output, priceNum, priceDen)) return minInput;
    dx = minInput - 1n;
    output = computePoolOutput(reserveIn, reserveOut, dx, feeBps);
  }
  return 0n;
}

/** The pool's take of an unlimited-price fill: trimmed to the cheapest input
 *  that still yields the floored output, the rest refunded. */
export function computePoolFill(
  reserveIn: bigint,
  reserveOut: bigint,
  maxGive: bigint,
  feeBps: number,
): { fill: bigint; output: bigint } {
  const output = computePoolOutput(reserveIn, reserveOut, maxGive, feeBps);
  if (output <= 0n) return { fill: 0n, output: 0n };
  return {
    fill: minPoolInputForOutput(reserveIn, reserveOut, output, feeBps, maxGive),
    output,
  };
}

/** Cheapest maker first: the order Core walks the book in (`give_price:asc`). */
function byPriceAscending(a: BookOrder, b: BookOrder): number {
  const lhs = a.getQuantity * b.giveQuantity;
  const rhs = b.getQuantity * a.giveQuantity;
  return lhs < rhs ? -1 : lhs > rhs ? 1 : 0;
}

/** A private copy, so a simulation never edits what it was handed. */
export function cloneMarket(state: MarketState): MarketState {
  return {
    pool: state.pool ? { ...state.pool } : null,
    book: state.book.map((order) => ({ ...order })),
  };
}

/**
 * One taker, run through `state` — which is UPDATED in place: reserves move,
 * resting orders shrink. That is the point; running the pending orders
 * through first is what makes the next call a mempool-aware quote.
 */
export function fillMarket(state: MarketState, give: bigint): Fill {
  const pool =
    state.pool && state.pool.reserveIn > 0n && state.pool.reserveOut > 0n ? state.pool : null;
  const feeBps = pool?.feeBps ?? 0;
  let giveRemaining = give;
  let poolOutput = 0n;
  let bookOutput = 0n;

  state.book.sort(byPriceAscending);
  for (const order of state.book) {
    if (giveRemaining <= 0n) break;
    if (order.giveRemaining <= 0n) continue;

    if (pool) {
      const poolFill = bigMin(
        computePoolInputForTargetPrice(
          pool.reserveIn,
          pool.reserveOut,
          order.getQuantity,
          order.giveQuantity,
          feeBps,
          giveRemaining,
        ),
        giveRemaining,
      );
      if (poolFill > 0n) {
        const out = computePoolOutput(pool.reserveIn, pool.reserveOut, poolFill, feeBps);
        if (out > 0n) {
          poolOutput += out;
          giveRemaining -= poolFill;
          pool.reserveIn += poolFill;
          pool.reserveOut -= out;
        }
      }
    }
    if (giveRemaining <= 0n) break;

    let canTake = bigMin(giveRemaining, order.getRemaining);
    if (canTake <= 0n) continue;
    let fromOrder = (canTake * order.giveQuantity) / order.getQuantity;
    if (fromOrder > order.giveRemaining) {
      fromOrder = order.giveRemaining;
      canTake = (fromOrder * order.getQuantity) / order.giveQuantity;
    }
    if (fromOrder > 0n && canTake > 0n) {
      bookOutput += fromOrder;
      giveRemaining -= canTake;
      order.giveRemaining -= fromOrder;
      order.getRemaining -= canTake;
    }
  }

  if (giveRemaining > 0n && pool) {
    const { fill, output } = computePoolFill(
      pool.reserveIn,
      pool.reserveOut,
      giveRemaining,
      feeBps,
    );
    if (output > 0n) {
      poolOutput += output;
      giveRemaining -= fill;
      pool.reserveIn += fill;
      pool.reserveOut -= output;
    }
  }

  return { output: poolOutput + bookOutput, poolOutput, bookOutput, giveRemaining };
}

export interface MempoolQuote {
  /** What the trade gets if every pending order ahead of it confirms first. */
  output: bigint;
  /** What the same model says it gets against the confirmed state — the
   *  number to compare `output` to, so model drift cancels out. */
  baseline: bigint;
  /** Percentage `output` falls short of `baseline`; never negative. */
  dropPercent: number;
  pendingCount: number;
}

/**
 * The quote for `give`, after the same-direction orders already in the
 * mempool have had their turn.
 *
 * Same direction only, deliberately. An opposite-side order pending on the
 * pair can only improve the taker's price, and its ordering within the block
 * is no more knowable than anyone else's — so it is left out and the
 * estimate errs toward caution. Confirmation order among the pending orders
 * themselves does not matter to the result: each one moves the pool along
 * the same curve, and the book is walked cheapest-first either way.
 */
export function quoteAfterMempool(
  state: MarketState,
  pendingGives: bigint[],
  give: bigint,
): MempoolQuote {
  const baseline = fillMarket(cloneMarket(state), give).output;
  const ahead = cloneMarket(state);
  for (const pending of pendingGives) {
    if (pending > 0n) fillMarket(ahead, pending);
  }
  const output = fillMarket(ahead, give).output;
  const dropPercent =
    baseline > 0n && output < baseline
      ? Number(((baseline - output) * 1_000_000n) / baseline) / 10_000
      : 0;
  return { output, baseline, dropPercent, pendingCount: pendingGives.length };
}
