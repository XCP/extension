import { describe, expect, it } from "vitest";
import {
  applyPoolSlippage,
  calculateInitialLpEstimate,
  calculateLimitingLpEstimate,
  getCanonicalPoolAssets,
  getCanonicalPoolPair,
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
});
