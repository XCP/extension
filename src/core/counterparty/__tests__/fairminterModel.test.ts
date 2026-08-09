import { describe, expect, it } from "vitest";
import {
  describeFairminterLot,
  describeFairminterPaymentModel,
  getFairmintCost,
  getFairminterLotCost,
  getFairminterPaymentModel,
  getMaxFairmintLots,
  getQuantityForLots,
  isPaidFairminter,
  readFairminterPaymentModel,
} from "../fairminterModel";

/**
 * LAUNCHCOIN, as `/v2/assets/LAUNCHCOIN/fairminters` actually returns it. Fields not read by the
 * payment model are trimmed; the ones that are read are verbatim.
 *
 * Kept whole rather than reduced to `{ pool_quantity: 1 }` because the bug was never in the rule —
 * it was that three screens spelled out the rule's inputs by hand and each missed the same field.
 * A fixture in the shape core sends is what makes the extraction the thing under test.
 */
const LAUNCHCOIN = {
  source: "16aZDCvD6w1x25qYNWDrXLUswEXiUU9ttr",
  asset: "LAUNCHCOIN",
  price: 1000000,
  price_normalized: "0.0000100000000000",
  burn_payment: false,
  pool_quantity: 3100000000000000,
  lp_asset: "A690210627902342169",
  soft_cap: 6900000000000000,
  quantity_by_price_normalized: "1000.00000000",
} as const;

describe("readFairminterPaymentModel", () => {
  // The reported defect. This fairminter seeds a 31,000,000 XCP pool and has burn_payment false,
  // so reading only price and burn_payment lands on "issuer" — and the screen then names
  // `source` under "Paid to", an address that receives none of the payment.
  it("reads a real pool fairminter as paying the pool, not the issuer", () => {
    expect(readFairminterPaymentModel(LAUNCHCOIN)).toBe("pool");
    expect(describeFairminterPaymentModel(readFairminterPaymentModel(LAUNCHCOIN)))
      .toBe("XCP Fee (to liquidity pool)");
  });

  it("still reads an ordinary paid fairminter as paying the issuer", () => {
    expect(readFairminterPaymentModel({ ...LAUNCHCOIN, pool_quantity: 0 })).toBe("issuer");
    const { pool_quantity: _omitted, ...noPoolField } = LAUNCHCOIN;
    expect(readFairminterPaymentModel(noPoolField)).toBe("issuer");
  });

  it("accepts either spelling of each quantity, since only zero-ness is read", () => {
    // The fairminters endpoint sends `pool_quantity` with no `_normalized` companion; a composed
    // message's params carry the normalized one. Both have to answer.
    expect(readFairminterPaymentModel({ price: "1", pool_quantity_normalized: "31000000" }))
      .toBe("pool");
    expect(readFairminterPaymentModel({ price_normalized: "0.00001", pool_quantity: 1 }))
      .toBe("pool");
  });

  it("keeps a zero price free even when a pool is set", () => {
    expect(readFairminterPaymentModel({ ...LAUNCHCOIN, price: 0, price_normalized: "0" }))
      .toBe("free");
  });
});

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

describe("getFairminterLotCost", () => {
  it("uses core's per-lot price when it is available", () => {
    // price is base units: 100000000 = 1 XCP for the whole lot.
    expect(getFairminterLotCost({ price: 100000000, quantity_by_price_normalized: "1000" }))
      .toBe("1");
  });

  it("avoids the round trip through the per-unit price", () => {
    // A lot of 3 at 1 XCP gives price_normalized 0.33333333, whose product with 3 is 0.99999999.
    // Reading core's own per-lot figure keeps it exactly 1.
    const fairminter = {
      price: 100000000,
      price_normalized: "0.33333333",
      quantity_by_price_normalized: "3",
    };
    expect(getFairminterLotCost(fairminter)).toBe("1");
    // Without the raw price there is nothing better to do, and the drift is visible.
    expect(getFairminterLotCost({ ...fairminter, price: undefined })).toBe("0.99999999");
  });
});

describe("getFairmintCost", () => {
  it("charges per lot, not per token", () => {
    const fairminter = { price: 100000000, quantity_by_price_normalized: "1000" };
    expect(getFairmintCost(fairminter, "1000")).toBe("1");
    expect(getFairmintCost(fairminter, "3000")).toBe("3");
  });

  it("is zero for a zero or empty quantity", () => {
    const fairminter = { price: 100000000, quantity_by_price_normalized: "1000" };
    expect(getFairmintCost(fairminter, 0)).toBe("0");
    expect(getFairmintCost(fairminter, "")).toBe("0");
  });

  // Assuming a lot size of 1 would multiply the cost by the real lot size, so a signing screen
  // would show a payment wrong by a factor. Absent is the only safe answer.
  it("returns null rather than guessing a missing lot size", () => {
    expect(getFairmintCost({ price: 100000000 }, "1000")).toBeNull();
    expect(getFairmintCost({ price: 1, quantity_by_price_normalized: "0" }, "10")).toBeNull();
    expect(getFairmintCost({ price: 1, quantity_by_price_normalized: null }, "10")).toBeNull();
  });

  it("matches the total a whole number of lots implies", () => {
    // 250 XCP per lot of 5,000 tokens; 4 lots is 20,000 tokens for 1,000 XCP.
    const fairminter = { price: 25000000000, quantity_by_price_normalized: "5000" };
    expect(getFairminterLotCost(fairminter)).toBe("250");
    expect(getFairmintCost(fairminter, "20000")).toBe("1000");
  });
});

describe("getMaxFairmintLots", () => {
  // 1 XCP per lot of 1,000 tokens.
  const base = { price: 100000000, quantity_by_price_normalized: "1000" };

  it("is what the balance affords, floored to whole lots", () => {
    expect(getMaxFairmintLots({ fairminter: base, balance: "10" })).toBe("10");
    expect(getMaxFairmintLots({ fairminter: base, balance: "10.9" })).toBe("10");
    expect(getMaxFairmintLots({ fairminter: base, balance: "0" })).toBe("0");
  });

  it("caps at max_mint_per_tx", () => {
    const fairminter = { ...base, max_mint_per_tx_normalized: "3000" };
    expect(getMaxFairmintLots({ fairminter, balance: "100" })).toBe("3");
  });

  // Core rejects `asset_supply + quantity > hard_cap`, which the old Max never checked, so it
  // could offer a quantity that was always going to fail.
  it("caps at the headroom left under the hard cap", () => {
    const fairminter = { ...base, hard_cap_normalized: "10000" };
    expect(getMaxFairmintLots({ fairminter, balance: "100", assetSupply: "7000" })).toBe("3");
    expect(getMaxFairmintLots({ fairminter, balance: "100", assetSupply: "10000" })).toBe("0");
  });

  it("caps at what this address has left of its allowance", () => {
    const fairminter = { ...base, max_mint_per_address_normalized: "5000" };
    expect(getMaxFairmintLots({ fairminter, balance: "100", alreadyMinted: "3000" })).toBe("2");
    expect(getMaxFairmintLots({ fairminter, balance: "100", alreadyMinted: "5000" })).toBe("0");
  });

  it("takes the tightest bound when several apply", () => {
    const fairminter = {
      ...base,
      max_mint_per_tx_normalized: "8000",
      hard_cap_normalized: "20000",
      max_mint_per_address_normalized: "6000",
    };
    expect(
      getMaxFairmintLots({
        fairminter,
        balance: "100",
        assetSupply: "16000",
        alreadyMinted: "1000",
      })
    ).toBe("4"); // hard cap leaves 4,000; the others allow 8, 5 and 100
  });

  // An unknown supply is not a full cap. Skipping the bound lets compose reject it, which is the
  // safe direction; guessing zero headroom would block a mint that is actually fine.
  it("skips a bound whose input is missing rather than guessing", () => {
    const fairminter = { ...base, hard_cap_normalized: "10000" };
    expect(getMaxFairmintLots({ fairminter, balance: "3" })).toBe("3");
  });

  /**
   * The bounds above are written with `_normalized` fields, which is how core sends most
   * quantities — but not all of them. Across 100 fairminters from `/v2/fairminters`,
   * `max_mint_per_address` and `pool_quantity` never carry a `_normalized` companion while every
   * other quantity always does. So the per-address bound was gated on a field that does not exist
   * and was skipped for every fairminter that sets one, which is the defect it was added to close.
   */
  describe("with the fields core actually sends", () => {
    it("caps at max_mint_per_address given only the base-unit field", () => {
      // 5,000 tokens of a divisible asset, i.e. 5 lots of 1,000, less 3,000 already minted.
      const fairminter = { ...base, max_mint_per_address: 500000000000, divisible: true };
      expect(getMaxFairmintLots({ fairminter, balance: "100", alreadyMinted: "3000" })).toBe("2");
      expect(getMaxFairmintLots({ fairminter, balance: "100", alreadyMinted: "5000" })).toBe("0");
    });

    it("does not divide the bound of an indivisible asset", () => {
      const fairminter = { ...base, max_mint_per_address: 5000, divisible: false };
      expect(getMaxFairmintLots({ fairminter, balance: "100", alreadyMinted: "3000" })).toBe("2");
    });

    it("reads an unknown divisibility as divisible, which under-offers rather than over-offers", () => {
      // Core's default. If the asset were really indivisible this bound comes out far too small,
      // and Max offers too few lots — compose still succeeds, which is the safe direction.
      const fairminter = { ...base, max_mint_per_address: 500000000000 };
      expect(getMaxFairmintLots({ fairminter, balance: "100" })).toBe("5");
    });

    it("still prefers core's normalized figure when it sends one", () => {
      const fairminter = {
        ...base,
        max_mint_per_tx: 999900000000000,
        max_mint_per_tx_normalized: "3000",
      };
      expect(getMaxFairmintLots({ fairminter, balance: "100" })).toBe("3");
    });

    // LAUNCHCOIN's real bounds: both caps are 1,000,000 tokens at 1,000 per lot.
    it("matches a live fairminter's bounds", () => {
      const launchcoin = {
        price: 1000000,
        quantity_by_price_normalized: "1000.00000000",
        max_mint_per_tx_normalized: "1000000.00000000",
        max_mint_per_address: 100000000000000,
        hard_cap_normalized: "100000000.00000000",
        divisible: true,
      };
      // 27.26 XCP at 0.01/lot affords 2,726 lots; the per-tx cap allows 1,000.
      expect(getMaxFairmintLots({ fairminter: launchcoin, balance: "27.26246519" })).toBe("1000");
      // Having already minted 999,000, only one lot of the per-address allowance is left.
      expect(
        getMaxFairmintLots({
          fairminter: launchcoin,
          balance: "27.26246519",
          alreadyMinted: "999000",
        })
      ).toBe("1");
    });
  });

  it("is zero when there is no lot size or no price", () => {
    expect(getMaxFairmintLots({ fairminter: { price: 100000000 }, balance: "10" })).toBe("0");
    expect(
      getMaxFairmintLots({ fairminter: { price: 0, quantity_by_price_normalized: "1" }, balance: "10" })
    ).toBe("0");
  });
});

describe("getQuantityForLots", () => {
  it("multiplies lots by the lot size", () => {
    expect(getQuantityForLots({ quantity_by_price_normalized: "1000" }, "3")).toBe("3000");
  });

  it("is zero for no lots or no lot size", () => {
    expect(getQuantityForLots({ quantity_by_price_normalized: "1000" }, "0")).toBe("0");
    expect(getQuantityForLots({}, "3")).toBe("0");
  });

  // The point of the whole shape: a lot count can only compose to a multiple of the lot size, so
  // core's "quantity is not a multiple of lot_size" cannot be reached from this form.
  it("always composes to a multiple of the lot size", () => {
    for (const lots of ["1", "7", "13", "100"]) {
      const quantity = getQuantityForLots({ quantity_by_price_normalized: "250" }, lots);
      expect(Number(quantity) % 250).toBe(0);
    }
  });
});

describe("describeFairminterLot", () => {
  it("quotes the cost of a lot rather than of one token", () => {
    expect(describeFairminterLot({
      price: 100000000,
      quantity_by_price_normalized: "1000",
      asset: "TESTASSET",
    })).toBe("1 XCP per 1000 TESTASSET");
  });

  it("names a free mint", () => {
    expect(describeFairminterLot({ price: 0, quantity_by_price_normalized: "1" }))
      .toBe("Free mint (BTC fees only)");
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
