import { describe, expect, it } from "vitest";
import {
  describeFairminterPaymentModel,
  getFairminterPaymentModel,
  isPaidFairminter,
} from "../fairminterModel";

describe("getFairminterPaymentModel", () => {
  it("calls a zero price free, whatever burn_payment says", () => {
    expect(getFairminterPaymentModel({ price: 0, burnPayment: false })).toBe("free");
    expect(getFairminterPaymentModel({ price: "0", burnPayment: true })).toBe("free");
    expect(getFairminterPaymentModel({ price: "0.00000000" })).toBe("free");
  });

  // The regression this exists for. burn_payment says where a payment goes, not whether there is
  // one, so a false value used to be read as "free" — and every pay-the-issuer fairminter created
  // outside this extension reported itself as costing nothing but miner fees.
  it("does not call a priced fairminter free just because burn_payment is false", () => {
    expect(getFairminterPaymentModel({ price: "1.5", burnPayment: false })).toBe("issuer");
    expect(getFairminterPaymentModel({ price: 100, burnPayment: false })).toBe("issuer");
  });

  it("reads a missing burn_payment as payment to the issuer", () => {
    // Core's default branch: xcp_destination = fairminter["source"].
    expect(getFairminterPaymentModel({ price: "1" })).toBe("issuer");
    expect(getFairminterPaymentModel({ price: "1", burnPayment: null })).toBe("issuer");
  });

  it("reports a burn when burn_payment is set on a priced fairminter", () => {
    expect(getFairminterPaymentModel({ price: "1", burnPayment: true })).toBe("burned");
  });

  it("puts a pool ahead of a burn, the way core orders the branches", () => {
    // perform_fairmint_soft_cap_operations checks pool_quantity before burn_payment.
    expect(getFairminterPaymentModel({ price: "1", burnPayment: true, poolQuantity: "500" }))
      .toBe("pool");
    expect(getFairminterPaymentModel({ price: "1", poolQuantity: 500 })).toBe("pool");
  });

  it("ignores a pool quantity of zero", () => {
    expect(getFairminterPaymentModel({ price: "1", poolQuantity: 0 })).toBe("issuer");
    expect(getFairminterPaymentModel({ price: "1", poolQuantity: "0" })).toBe("issuer");
  });

  // An absent price is not evidence of a free mint, so it must not produce one. Falling through to
  // the destination questions is the honest answer: we still know where a payment would go.
  it("does not invent a free mint from a missing price", () => {
    expect(getFairminterPaymentModel({})).toBe("issuer");
    expect(getFairminterPaymentModel({ price: undefined, burnPayment: true })).toBe("burned");
    expect(getFairminterPaymentModel({ price: null })).toBe("issuer");
    expect(getFairminterPaymentModel({ price: "" })).toBe("issuer");
  });
});

describe("describeFairminterPaymentModel", () => {
  it("labels every model", () => {
    expect(describeFairminterPaymentModel("free")).toBe("BTC Fee Only (to miners)");
    expect(describeFairminterPaymentModel("burned")).toBe("XCP Fee (burned)");
    expect(describeFairminterPaymentModel("pool")).toBe("XCP Fee (to liquidity pool)");
    expect(describeFairminterPaymentModel("issuer")).toBe("XCP Fee (to issuer)");
  });
});

describe("isPaidFairminter", () => {
  it("is true for everything that charges XCP", () => {
    expect(isPaidFairminter("free")).toBe(false);
    expect(isPaidFairminter("burned")).toBe(true);
    expect(isPaidFairminter("pool")).toBe(true);
    expect(isPaidFairminter("issuer")).toBe(true);
  });
});
