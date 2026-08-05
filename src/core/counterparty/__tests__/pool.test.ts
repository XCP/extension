import { describe, expect, it } from "vitest";
import {
  applyPoolSlippage,
  calculateInitialLpEstimate,
  calculateLimitingLpEstimate,
  getCanonicalPoolAssets,
  getCanonicalPoolPair,
  normalizePoolPosition,
} from "../pool";

describe("counterparty pool utilities", () => {
  it("formats pool pairs in canonical Counterparty asset order", () => {
    expect(getCanonicalPoolAssets("XCP", "PEPECASH")).toEqual(["PEPECASH", "XCP"]);
    expect(getCanonicalPoolPair("XCP", "PEPECASH")).toBe("PEPECASH / XCP");
    expect(getCanonicalPoolPair("A111111111111111111", "XCP")).toBe("A111111111111111111 / XCP");
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
      quantity: 4743416490252,
    };

    it("derives quantity_normalized when the endpoint omits it", () => {
      expect(normalizePoolPosition(position).quantity_normalized).toBe("47434.16490252");
    });

    it("does not divide when lp_asset_info marks the LP asset indivisible", () => {
      const indivisible = { ...position, quantity: 42, lp_asset_info: { divisible: false } };
      expect(normalizePoolPosition(indivisible).quantity_normalized).toBe("42");
    });

    it("keeps quantity_normalized from the API when present", () => {
      const alreadyNormalized = { ...position, quantity_normalized: "47434.1649" };
      expect(normalizePoolPosition(alreadyNormalized).quantity_normalized).toBe("47434.1649");
    });
  });
});
