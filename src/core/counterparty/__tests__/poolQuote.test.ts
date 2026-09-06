import { describe, expect, it } from "vitest";
import {
  cloneMarket,
  computePoolOutput,
  fillMarket,
  quoteAfterMempool,
  XCP_POOL_FEE_BPS,
  type MarketState,
} from "@/core/counterparty/poolQuote";

/**
 * The bigint port of Core's swap quote. The numbers below were checked
 * against the live `/pools/{a}/{b}/quote` endpoint for real pairs (pool-only,
 * book-only, and mixed fills all matched to the unit), so what these tests
 * pin is the behaviour the widget leans on: replaying pending orders first
 * lowers the quote, and only same-direction orders count.
 */

const pool = (reserveIn: bigint, reserveOut: bigint): MarketState => ({
  pool: { reserveIn, reserveOut, feeBps: XCP_POOL_FEE_BPS },
  book: [],
});

describe("computePoolOutput", () => {
  it("is constant-product with the fee taken on the way in", () => {
    // (in * 9950 * out) / (in_reserve * 10000 + in * 9950), floored.
    expect(computePoolOutput(1_000_000_000_000n, 1_000_000_000_000n, 10_000_000_000n, 50)).toBe(
      (10_000_000_000n * 9950n * 1_000_000_000_000n) /
        (1_000_000_000_000n * 10_000n + 10_000_000_000n * 9950n),
    );
  });

  it("answers zero for an empty pool or no input", () => {
    expect(computePoolOutput(0n, 10n, 5n, 50)).toBe(0n);
    expect(computePoolOutput(10n, 10n, 0n, 50)).toBe(0n);
  });
});

describe("fillMarket", () => {
  it("fills a pool-only pair from the pool and moves the reserves", () => {
    const state = pool(1_000_000_000_000n, 1_000_000_000_000n);
    const fill = fillMarket(state, 10_000_000_000n);
    expect(fill.bookOutput).toBe(0n);
    expect(fill.poolOutput).toBe(fill.output);
    expect(fill.giveRemaining).toBe(0n);
    expect(state.pool!.reserveOut).toBe(1_000_000_000_000n - fill.output);
    expect(state.pool!.reserveIn).toBeGreaterThan(1_000_000_000_000n);
  });

  it("takes a resting order priced better than the pool before the pool", () => {
    // Pool at 1:1; a maker giving 2 out per 1 in is twice as good.
    const state: MarketState = {
      ...pool(1_000_000_000_000n, 1_000_000_000_000n),
      book: [
        { giveQuantity: 2_000n, getQuantity: 1_000n, giveRemaining: 2_000n, getRemaining: 1_000n },
      ],
    };
    const fill = fillMarket(state, 1_000n);
    expect(fill.bookOutput).toBe(2_000n);
    expect(fill.poolOutput).toBe(0n);
    expect(state.book[0]!.giveRemaining).toBe(0n);
  });

  it("leaves the remainder unfilled on a book-only pair", () => {
    const state: MarketState = {
      pool: null,
      book: [
        { giveQuantity: 500n, getQuantity: 500n, giveRemaining: 500n, getRemaining: 500n },
      ],
    };
    const fill = fillMarket(state, 800n);
    expect(fill.output).toBe(500n);
    expect(fill.giveRemaining).toBe(300n);
  });

  it("does not touch the state it was cloned from", () => {
    const original = pool(1_000_000n, 1_000_000n);
    fillMarket(cloneMarket(original), 10_000n);
    expect(original.pool!.reserveIn).toBe(1_000_000n);
  });
});

describe("quoteAfterMempool", () => {
  it("quotes the same as the baseline when nothing is pending", () => {
    const q = quoteAfterMempool(pool(1_000_000_000_000n, 1_000_000_000_000n), [], 10_000_000_000n);
    expect(q.output).toBe(q.baseline);
    expect(q.dropPercent).toBe(0);
    expect(q.pendingCount).toBe(0);
  });

  it("quotes less once pending orders of the same direction go first", () => {
    const state = pool(1_000_000_000_000n, 1_000_000_000_000n);
    const one = quoteAfterMempool(state, [10_000_000_000n], 10_000_000_000n);
    const two = quoteAfterMempool(state, [10_000_000_000n, 10_000_000_000n], 10_000_000_000n);
    expect(one.output).toBeLessThan(one.baseline);
    expect(two.output).toBeLessThan(one.output);
    expect(one.dropPercent).toBeGreaterThan(0);
    expect(two.dropPercent).toBeGreaterThan(one.dropPercent);
    // One percent of the pool in moves the marginal price by about two
    // percent (both reserves move), so a same-size trade ahead costs the
    // next taker a little under two percent.
    expect(one.dropPercent).toBeGreaterThan(1.8);
    expect(one.dropPercent).toBeLessThan(2.1);
  });

  it("ignores zero pending quantities", () => {
    const q = quoteAfterMempool(pool(1_000_000n, 1_000_000n), [0n], 1_000n);
    expect(q.output).toBe(q.baseline);
  });
});
