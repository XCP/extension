import { describe, expect, it } from "vitest";
import { asBaseUnits, asDisplayUnits } from "@/core/numeric";
import { POOL_SLIPPAGE_AUTO } from "@/core/settings";
import {
  applyPoolSlippage,
  calculateInitialLpEstimate,
  calculateLimitingLpEstimate,
  getAutoSlippage,
  getPoolDisplayAssets,
  getPoolDisplayPair,
  isAutoPoolSlippage,
  normalizePoolPosition,
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
