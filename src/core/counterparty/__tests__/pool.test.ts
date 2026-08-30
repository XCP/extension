import { describe, expect, it } from "vitest";
import { asBaseUnits, asDisplayUnits } from "@/core/numeric";
import { POOL_SLIPPAGE_AUTO } from "@/core/settings";
import {
  applyPoolSlippage,
  calculateInitialLpEstimate,
  calculateLimitingLpEstimate,
  describeSwapQuoteOutcome,
  getAutoSlippage,
  getPoolDisplayAssets,
  getPoolDisplayPair,
  isAutoPoolSlippage,
  normalizePoolPosition,
  readSwapQuoteOutcome,
  resolvePoolSlippage,
} from "../pool";

describe("counterparty pool utilities", () => {
  it("formats pool pairs with the quote asset second", () => {
    expect(getPoolDisplayAssets("XCP", "PEPECASH")).toEqual(["PEPECASH", "XCP"]);
    expect(getPoolDisplayPair("XCP", "PEPECASH")).toBe("PEPECASH / XCP");
    expect(getPoolDisplayPair("A111111111111111111", "XCP")).toBe("A111111111111111111 / XCP");
  });

  it("orders by quote asset rather than alphabetically", () => {
    // The cases alphabetical order gets backwards. BTC outranks everything, and a quote asset
    // that sorts after its pair still belongs on the right.
    expect(getPoolDisplayPair("BTC", "PEPECASH")).toBe("PEPECASH / BTC");
    expect(getPoolDisplayPair("PEPECASH", "BTC")).toBe("PEPECASH / BTC");
    expect(getPoolDisplayPair("XCP", "ZZZCOIN")).toBe("ZZZCOIN / XCP");
    // BTC outranks XCP, so an XCP pair against BTC prices in BTC.
    expect(getPoolDisplayPair("XCP", "BTC")).toBe("XCP / BTC");
  });

  it("derives Auto slippage from the quote's price impact", () => {
    // Rounded up to a tenth, so the tolerance covers the impact rather than sitting under it.
    expect(getAutoSlippage(1.23)).toBe("1.3");
    expect(getAutoSlippage(2)).toBe("2");
    // Floored at 0.5% (pool-fee territory) and capped at 5%.
    expect(getAutoSlippage(0)).toBe("0.5");
    expect(getAutoSlippage(0.11)).toBe("0.5");
    expect(getAutoSlippage(42)).toBe("5");
    // A negative impact means the trade improves the price; it still needs the floor.
    expect(getAutoSlippage(-3)).toBe("0.5");
  });

  it("falls back to the standing default when there is no quote to read", () => {
    expect(getAutoSlippage(null)).toBe("1");
    expect(getAutoSlippage(undefined)).toBe("1");
    expect(getAutoSlippage(Number.NaN)).toBe("1");
    expect(getAutoSlippage(Number.POSITIVE_INFINITY)).toBe("1");
  });

  describe("resolvePoolSlippage", () => {
    it("uses a stored percent verbatim, impact or no impact", () => {
      expect(resolvePoolSlippage("2.5", 4)).toBe("2.5");
      expect(resolvePoolSlippage("0", 4)).toBe("0");
      expect(resolvePoolSlippage("3")).toBe("3");
    });

    it("derives from the impact when the setting is auto", () => {
      expect(resolvePoolSlippage(POOL_SLIPPAGE_AUTO, 2.2)).toBe("2.2");
      expect(resolvePoolSlippage(POOL_SLIPPAGE_AUTO, 0.05)).toBe("0.5");
    });

    it("gives deposit and withdraw a real percent even when the setting says auto", () => {
      // They pass no impact because neither quotes one — but they still need a tolerance, so this
      // must never hand "auto" back to a form that will put it through applyPoolSlippage.
      expect(resolvePoolSlippage(POOL_SLIPPAGE_AUTO)).toBe("1");
      expect(resolvePoolSlippage(undefined)).toBe("1");
      expect(resolvePoolSlippage("")).toBe("1");
    });

    it("never returns the literal auto sentinel", () => {
      for (const setting of [POOL_SLIPPAGE_AUTO, undefined, "", "1.5"]) {
        expect(resolvePoolSlippage(setting, 3)).not.toBe(POOL_SLIPPAGE_AUTO);
      }
    });
  });

  it("identifies which stored settings mean auto", () => {
    expect(isAutoPoolSlippage(POOL_SLIPPAGE_AUTO)).toBe(true);
    expect(isAutoPoolSlippage(undefined)).toBe(true);
    expect(isAutoPoolSlippage("")).toBe(true);
    expect(isAutoPoolSlippage("1")).toBe(false);
  });

  it("applies pool slippage to raw integer quantities", () => {
    expect(applyPoolSlippage("100000000", "2.5")).toBe("97500000");
    expect(applyPoolSlippage("100", "0.5")).toBe("99");
    // One indivisible unit cannot absorb a fractional haircut. Returning zero here creates an
    // invalid DEX order (`non-positive get quantity`) instead of preserving the quoted fill.
    expect(applyPoolSlippage("1", "3")).toBe("1");
    expect(applyPoolSlippage(undefined, "1")).toBe("0");
  });

  it("estimates initial LP supply from the geometric mean", () => {
    expect(calculateInitialLpEstimate("100", "400")).toBe("200");
    expect(calculateInitialLpEstimate("0", "400")).toBe("0");
  });

  it("uses the limiting side when a deposit is below the quoted ratio", () => {
    expect(calculateLimitingLpEstimate("1000", "500", "250")).toBe("500");
    expect(calculateLimitingLpEstimate("1000", "500", "500")).toBe("1000");
    expect(calculateLimitingLpEstimate("1000", null, "250")).toBe("1000");
  });

  describe("normalizePoolPosition", () => {
    const position = {
      asset_a: "PEPECASH",
      asset_b: "XCP",
      reserve_a: 75000000000000,
      reserve_b: 300000000000,
      lp_asset: "A6900000000000001774",
      quantity: asBaseUnits(4743416490252),
    };

    it("derives quantity_normalized when the endpoint omits it", () => {
      expect(normalizePoolPosition(position).quantity_normalized).toBe("47434.16490252");
    });

    it("does not divide when lp_asset_info marks the LP asset indivisible", () => {
      const indivisible = { ...position, quantity: asBaseUnits(42), lp_asset_info: { divisible: false } };
      expect(normalizePoolPosition(indivisible).quantity_normalized).toBe("42");
    });

    it("keeps quantity_normalized from the API when present", () => {
      const alreadyNormalized = { ...position, quantity_normalized: asDisplayUnits("47434.1649") };
      expect(normalizePoolPosition(alreadyNormalized).quantity_normalized).toBe("47434.1649");
    });
  });
});

/**
 * A zero-output quote is the same shape whether the pair has no pool or the input is too small to
 * buy one unit of the other asset, and the two want opposite advice. The screen read only the
 * output, so a PEPECASH/XCP pool that had just quoted 17.26 XCP -> 4231.50 PEPECASH at 1% impact
 * reported "No liquidity available for this pair" in the other direction — and then told the user
 * to try a *smaller* amount, the one change that cannot help.
 *
 * The fixtures are `/v2/pools/{a}/{b}/quote` verbatim, so the distinction is tested against what
 * the node sends rather than against what we assumed it sends.
 */
describe("readSwapQuoteOutcome", () => {
  /** 17.26246519 XCP -> PEPECASH: the direction that worked. */
  const FILLS = {
    estimated_output: 423150280251,
    pool_output: 423150280251,
    give_remaining: 0,
    pool_exists: true,
    price_impact: 1.0638,
  };

  /** 0.00000157 PEPECASH -> XCP: the reported bug. 157 sats is 0.64 satoshis of XCP. */
  const DUST = {
    estimated_output: 0,
    give_remaining: 157,
    pool_exists: true,
    price_impact: 100.0,
  };

  const ASSETS = { giveAsset: "PEPECASH", getAsset: "XCP" };

  it("calls a complete fill fillable, and says nothing about it", () => {
    expect(readSwapQuoteOutcome(FILLS)).toBe("fillable");
    expect(describeSwapQuoteOutcome("fillable", ASSETS)).toBeNull();
  });

  it("does not blame liquidity for an amount too small to buy one unit", () => {
    expect(readSwapQuoteOutcome(DUST)).toBe("dust");

    const message = describeSwapQuoteOutcome("dust", ASSETS)!;
    expect(message).toContain("too small");
    expect(message).toContain("larger");
    // The two things it used to say, both wrong for this quote.
    expect(message).not.toContain("No liquidity");
    expect(message).not.toContain("smaller");
  });

  it("does not mistake Core's refunded pool rounding dust for exhausted liquidity", () => {
    // Live TESTNETPEPE/XCP quote for one token. Core's compute_pool_fill intentionally consumes
    // the cheapest input that produces 47,103 output sats and refunds the redundant 1,164 sats.
    const roundedPoolFill = {
      estimated_output: 47103,
      pool_output: 47103,
      give_remaining: 1164,
      pool_exists: true,
    };
    expect(readSwapQuoteOutcome(roundedPoolFill)).toBe("fillable");
  });

  it("still reports a genuine book-only partial fill, and advises a smaller amount", () => {
    const partial = {
      estimated_output: 5,
      pool_output: 0,
      give_remaining: 900,
      pool_exists: false,
    };
    expect(readSwapQuoteOutcome(partial)).toBe("partial");
    expect(describeSwapQuoteOutcome("partial", ASSETS)).toContain("smaller");
  });

  it("reports a missing pool as a missing pool", () => {
    expect(readSwapQuoteOutcome({ estimated_output: 0, give_remaining: 500, pool_exists: false }))
      .toBe("no_pool");
    expect(readSwapQuoteOutcome(null)).toBe("no_pool");
    expect(describeSwapQuoteOutcome("no_pool", ASSETS)).toContain("No liquidity");
  });

  /**
   * An absent `pool_exists` is not evidence of a pool. Guessing "dust" there would tell someone
   * their amount is wrong when the pair may simply not trade — a worse wrong answer than the
   * generic one, because it sends them to try again.
   */
  it("does not infer a pool from a field the response omitted", () => {
    expect(readSwapQuoteOutcome({ estimated_output: 0, give_remaining: 157 })).toBe("no_pool");
  });

  it("compares give_remaining as a number even when it arrives as a string", () => {
    // A 64-bit quantity can arrive as a string; "900" > 0 as text is not the same comparison.
    expect(readSwapQuoteOutcome({ estimated_output: 5, give_remaining: "900", pool_exists: true }))
      .toBe("partial");
    expect(readSwapQuoteOutcome({ estimated_output: 5, give_remaining: "0", pool_exists: true }))
      .toBe("fillable");
  });

  it("names the asset you would receive nothing of", () => {
    expect(describeSwapQuoteOutcome("dust", ASSETS)).toContain("XCP");
    expect(describeSwapQuoteOutcome("dust", ASSETS)).toContain("PEPECASH");
  });
});
