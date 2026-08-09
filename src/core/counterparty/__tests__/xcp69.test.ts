import { describe, expect, it } from "vitest";
import { isNumericAsset } from "@/core/validation/asset";
import { normalizeFormData } from "../normalize";
import {
  checkXcp69Conformance,
  deriveXcp69Blocks,
  describeXcp69LeadRisk,
  generateXcp69LpAsset,
  XCP69_BASE,
  XCP69_DEFAULT_LEAD_BLOCKS,
  XCP69_DISPLAY,
  XCP69_WINDOW_BLOCKS,
  xcp69CandidateFromFields,
  xcp69FormFields,
} from "../xcp69";

/** A conforming launch, in the base units core stores. */
const conforming = {
  asset: "LAUNCHCOIN",
  hard_cap: 10000000000000000,
  soft_cap: 6900000000000000,
  pool_quantity: 3100000000000000,
  quantity_by_price: 100000000000,
  price: 1000000,
  max_mint_per_address: 100000000000000,
  max_mint_per_tx: 100000000000000,
  premint_quantity: 0,
  minted_asset_commission_int: 0,
  start_block: 961518,
  soft_cap_deadline_block: 962518,
  end_block: 0,
  burn_payment: false,
  lock_quantity: true,
  lock_description: true,
  divisible: true,
  lp_asset: "A690210627902342169",
};

describe("XCP69 constants", () => {
  it("splits the supply exactly between the sale and the pool", () => {
    // The invariant the spec uses to rule out pre-existing supply.
    expect(XCP69_BASE.soft_cap + XCP69_BASE.pool_quantity).toBe(XCP69_BASE.hard_cap);
  });

  it("raises exactly 690 XCP on a full sale", () => {
    // 69,000,000 tokens / 1,000 per lot * 0.01 XCP = 690 XCP.
    const lots = XCP69_BASE.soft_cap / XCP69_BASE.quantity_by_price;
    expect(lots).toBe(69000n);
    expect((lots * XCP69_BASE.price) / 100000000n).toBe(690n);
  });

  it("opens the pool at 69/31 of the mint price", () => {
    // 690 XCP against 31,000,000 tokens, versus 0.01 per 1,000 minted.
    const poolTokens = XCP69_BASE.pool_quantity / 100000000n;
    expect(poolTokens).toBe(31000000n);
  });

  it("states the display figures the form collects, consistent with the base units", () => {
    // normalize.ts scales these by 1e8 for a divisible asset, so they must agree exactly.
    expect(BigInt(XCP69_DISPLAY.hard_cap) * 100000000n).toBe(XCP69_BASE.hard_cap);
    expect(BigInt(XCP69_DISPLAY.soft_cap) * 100000000n).toBe(XCP69_BASE.soft_cap);
    expect(BigInt(XCP69_DISPLAY.pool_quantity) * 100000000n).toBe(XCP69_BASE.pool_quantity);
    expect(BigInt(XCP69_DISPLAY.lot_size) * 100000000n).toBe(XCP69_BASE.quantity_by_price);
    expect(BigInt(XCP69_DISPLAY.max_mint_per_address) * 100000000n).toBe(XCP69_BASE.max_mint_per_address);
    // 0.01 XCP, which is divisible, so it scales the same way.
    expect(Math.round(Number(XCP69_DISPLAY.lot_price) * 1e8)).toBe(Number(XCP69_BASE.price));
  });
});

/**
 * The end of the pipe, not the start.
 *
 * The form test asserted `lot_price === '0.01'` in the FormData and passed while the price was
 * shipping unscaled: `normalize.ts` keys `lot_price` off a hidden `lot_price_asset` field that the
 * XCP-69 branch never sent, so it was skipped and reached core as display units. A 690 XCP sale
 * would have composed for a hundred-millionth of that. Checking what the form *hands over* is not
 * checking what the node *receives*.
 */
describe("xcp69FormFields through normalizeFormData", () => {
  const submit = async () => {
    const fields = xcp69FormFields({
      lpAsset: "A691234567890123456",
      blocks: deriveXcp69Blocks(961512, XCP69_DEFAULT_LEAD_BLOCKS),
    });
    const formData = new FormData();
    formData.set("asset", "LAUNCHCOIN");
    for (const [k, v] of Object.entries(fields)) formData.set(k, v);
    const { normalizedData } = await normalizeFormData(formData, "fairminter");
    return normalizedData;
  };

  it("scales every quantity to the base units core reads", async () => {
    const data = await submit();
    expect(data.lot_price).toBe(XCP69_BASE.price.toString());
    expect(data.lot_size).toBe(XCP69_BASE.quantity_by_price.toString());
    expect(data.hard_cap).toBe(XCP69_BASE.hard_cap.toString());
    expect(data.soft_cap).toBe(XCP69_BASE.soft_cap.toString());
    expect(data.pool_quantity).toBe(XCP69_BASE.pool_quantity.toString());
    expect(data.max_mint_per_address).toBe(XCP69_BASE.max_mint_per_address.toString());
    expect(data.max_mint_per_tx).toBe(XCP69_BASE.max_mint_per_tx.toString());
  });

  it("carries the field normalize.ts needs to price the lot in XCP", async () => {
    // The one that was missing. Without it lot_price is skipped entirely rather than scaled.
    const fields = xcp69FormFields({ lpAsset: "A69", blocks: null });
    expect(fields.lot_price_asset).toBe("XCP");
  });

  it("raises exactly 690 XCP at the composed price", async () => {
    // The figure the standard promises, computed from what actually reaches the node.
    const data = await submit();
    const lots = BigInt(data.soft_cap as string) / BigInt(data.lot_size as string);
    expect((lots * BigInt(data.lot_price as string)) / 100000000n).toBe(690n);
  });
});

describe("xcp69CandidateFromFields", () => {
  it("hands the conformance check the values being submitted", () => {
    const fields = xcp69FormFields({
      lpAsset: "A691234567890123456",
      blocks: deriveXcp69Blocks(961512, XCP69_DEFAULT_LEAD_BLOCKS),
    });
    expect(checkXcp69Conformance({ ...xcp69CandidateFromFields(fields), asset: "LAUNCHCOIN" }))
      .toEqual({ conformant: true, failures: [] });
  });

  it("fails conformance when the submitted price is wrong", () => {
    // The gate used to be fed XCP69_BASE, so it could not see the submission at all and showed
    // green over a launch about to ship the wrong price.
    const fields = { ...xcp69FormFields({ lpAsset: "A69", blocks: null }), lot_price: "0.02" };
    const result = checkXcp69Conformance({ ...xcp69CandidateFromFields(fields), asset: "LAUNCHCOIN" });
    expect(result.conformant).toBe(false);
    expect(result.failures).toContain("Price must be 0.01 XCP per lot");
  });
});

describe("deriveXcp69Blocks", () => {
  it("opens after the lead and runs exactly the window", () => {
    const blocks = deriveXcp69Blocks(961512, XCP69_DEFAULT_LEAD_BLOCKS);
    expect(blocks.start_block).toBe(961518);
    expect(blocks.soft_cap_deadline_block - blocks.start_block).toBe(XCP69_WINDOW_BLOCKS);
    expect(blocks.end_block).toBe(0);
  });
});

describe("generateXcp69LpAsset", () => {
  it("produces a valid numeric asset carrying the A69 convention", () => {
    for (let i = 0; i < 50; i++) {
      const name = generateXcp69LpAsset();
      expect(name.startsWith("A69")).toBe(true);
      // The range check is the point: a shorter tail falls below 26^12 and is not a numeric asset.
      expect(isNumericAsset(name)).toBe(true);
    }
  });

  it("does not repeat itself", () => {
    // A predictable name could be issued first by someone watching the mempool.
    const names = new Set(Array.from({ length: 50 }, () => generateXcp69LpAsset()));
    expect(names.size).toBe(50);
  });
});

describe("checkXcp69Conformance", () => {
  it("accepts a conforming launch", () => {
    expect(checkXcp69Conformance(conforming)).toEqual({ conformant: true, failures: [] });
  });

  it.each([
    // Strings, not numbers: 10000000000000001 is past Number.MAX_SAFE_INTEGER and rounds straight
    // back to the conforming value, so as a number this case silently tested nothing.
    ["hard_cap", "10000000000000001", "Hard cap must be 100,000,000"],
    ["soft_cap", "6900000000000001", "Soft cap must be 69,000,000"],
    ["pool_quantity", 0, "Pool reserve must be 31,000,000"],
    ["quantity_by_price", 1, "Lot size must be 1,000"],
    ["price", 0, "Price must be 0.01 XCP per lot"],
    ["max_mint_per_address", 0, "Per-address cap must be 1,000,000"],
    ["max_mint_per_tx", 0, "Per-transaction cap must be 1,000,000"],
    ["premint_quantity", 1, "Premint must be 0"],
    // The clause naive checks miss: the protocol allows up to a 99% skim per mint, which is a
    // premine with extra steps.
    ["minted_asset_commission_int", 1, "Commission must be 0"],
  ])("rejects a wrong %s", (field, value, message) => {
    const result = checkXcp69Conformance({ ...conforming, [field]: value });
    expect(result.conformant).toBe(false);
    expect(result.failures).toContain(message);
  });

  it("rejects a numeric asset", () => {
    const result = checkXcp69Conformance({ ...conforming, asset: "A690210627902342169" });
    expect(result.failures).toContain("Asset must be a named asset, not numeric");
  });

  it("rejects a burned payment, which would leave nothing to seed the pool", () => {
    const result = checkXcp69Conformance({ ...conforming, burn_payment: true });
    expect(result.failures).toContain("Payment must not be burned; it seeds the pool");
  });

  it.each([
    ["lock_quantity", "Supply must be locked"],
    ["lock_description", "Description must be locked"],
  ])("rejects an unlocked %s", (field, message) => {
    const result = checkXcp69Conformance({ ...conforming, [field]: false });
    expect(result.failures).toContain(message);
  });

  it("rejects an indivisible asset", () => {
    expect(checkXcp69Conformance({ ...conforming, divisible: false }).failures)
      .toContain("Asset must be divisible");
  });

  it("rejects a shortened mint window", () => {
    // The clause that stops a creator running a fast insider mint behind 1,000-block metadata.
    const result = checkXcp69Conformance({ ...conforming, soft_cap_deadline_block: 961520 });
    expect(result.failures).toContain("Mint window must be exactly 1000 blocks");
  });

  it("rejects a set end block", () => {
    expect(checkXcp69Conformance({ ...conforming, end_block: 962518 }).failures)
      .toContain("End block must be unset; pool fairminters close at the deadline");
  });

  it("rejects a missing LP asset", () => {
    expect(checkXcp69Conformance({ ...conforming, lp_asset: null }).failures)
      .toContain("An LP asset is required");
  });

  it("reads a display-unit figure in a base-unit field as a failure, not as a rounding", () => {
    // "100000000.00000000" reaching hard_cap means normalize.ts did not scale it. Treating that as
    // near-enough would let a launch through that is off by 1e8.
    const result = checkXcp69Conformance({ ...conforming, hard_cap: "100000000.00000000" });
    expect(result.failures).toContain("Hard cap must be 100,000,000");
  });

  it("reports every failure at once, not just the first", () => {
    const result = checkXcp69Conformance({});
    expect(result.conformant).toBe(false);
    expect(result.failures.length).toBeGreaterThan(10);
  });
});

describe("describeXcp69LeadRisk", () => {
  it("says nothing when the lead is comfortable", () => {
    expect(describeXcp69LeadRisk(XCP69_DEFAULT_LEAD_BLOCKS)).toBeNull();
    expect(describeXcp69LeadRisk(50)).toBeNull();
  });

  it("warns on a short lead", () => {
    expect(describeXcp69LeadRisk(3)).toContain("not XCP-69");
  });

  it("warns hardest on a lead that cannot be corrected afterwards", () => {
    expect(describeXcp69LeadRisk(1)).toContain("cannot be corrected");
    expect(describeXcp69LeadRisk(0)).toContain("cannot be corrected");
  });
});
