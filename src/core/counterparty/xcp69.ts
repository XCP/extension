/**
 * XCP-69: a fully-specified pooled fairminter.
 *
 * Every parameter is fixed by the standard except the asset name, the description, and when the
 * sale opens. That is what separates it from the other three mint models in the form: those are
 * modifiers on a form the user fills in, this one *is* the form.
 *
 * The standard is xcp.fun's, not Counterparty's — core has no marker for it, so the predicate
 * below is the whole of the enforcement. A launch that misses it is still a valid fairminter; it
 * simply is not XCP-69, and nothing on-chain will say so afterwards. That asymmetry is why
 * `checkXcp69Conformance` runs before signing rather than being left to the launchpad to notice.
 *
 * Spec: `docs/xcp-69.md` in the launchpad repo.
 */

import { isNamedAsset } from "@/core/validation/asset";

/**
 * The fixed parameters, in the base units core stores and the predicate reads.
 *
 * The spec is explicit that conformance is checked against raw integer fields and never against
 * `*_normalized` — partly because two of these quantities have no normalized spelling at all.
 */
export const XCP69_BASE = {
  /** 100,000,000 total supply. */
  hard_cap: 10000000000000000n,
  /** 69,000,000 sold to the public. The 69 in the name. */
  soft_cap: 6900000000000000n,
  /** 31,000,000 reserved to seed the pool. soft_cap + pool_quantity === hard_cap. */
  pool_quantity: 3100000000000000n,
  /** 1,000 tokens per lot. */
  quantity_by_price: 100000000000n,
  /** 0.01 XCP per lot, so a full sale raises exactly 690 XCP. */
  price: 1000000n,
  /** 1,000,000 tokens — 10 XCP — per address, and the same per transaction. */
  max_mint_per_address: 100000000000000n,
  max_mint_per_tx: 100000000000000n,
  premint_quantity: 0n,
  minted_asset_commission_int: 0n,
} as const;

/** The same figures in the display units the form collects, before `normalize.ts` scales them. */
export const XCP69_DISPLAY = {
  hard_cap: "100000000",
  soft_cap: "69000000",
  pool_quantity: "31000000",
  lot_size: "1000",
  lot_price: "0.01",
  max_mint_per_address: "1000000",
  max_mint_per_tx: "1000000",
  premint_quantity: "0",
} as const;

/** The sale runs for exactly this many blocks, about a week. */
export const XCP69_WINDOW_BLOCKS = 1000;

/**
 * Default announcement lead, in blocks.
 *
 * Consensus does not require any lead — a fairminter confirming at or past its start simply opens
 * at once. The requirement is the standard's: `start_block` must be strictly greater than the
 * block the launch confirms in, so the announcement window is provably mint-proof. Nobody can know
 * their confirmation block in advance, so this is a wager on confirmation time and the user can
 * move it. Six blocks is roughly an hour.
 */
export const XCP69_DEFAULT_LEAD_BLOCKS = 6;

/** A lead the standard cannot tolerate: the launch would very likely confirm past its own start. */
export const XCP69_MIN_SAFE_LEAD_BLOCKS = 2;

/**
 * Every form field an XCP-69 launch submits, in the display units `normalize.ts` scales.
 *
 * One source, because the alternative shipped a defect: the submit branch used to list these
 * inline while conformance was checked against `XCP69_BASE`, so the check verified the standard's
 * constants against themselves and could not see what was actually being sent. It missed
 * `lot_price_asset` — the hidden field `normalize.ts` keys `lot_price` off — with the result that
 * the price reached core unscaled and a 690 XCP sale composed for a hundred-millionth of that.
 *
 * `lot_price_asset` is here rather than rendered, so it cannot be gated out of existence again.
 */
export function xcp69FormFields(params: {
  lpAsset: string;
  blocks: Xcp69Blocks | null;
}): Record<string, string> {
  return {
    max_mint_per_tx: XCP69_DISPLAY.max_mint_per_tx,
    max_mint_per_address: XCP69_DISPLAY.max_mint_per_address,
    lot_size: XCP69_DISPLAY.lot_size,
    lot_price: XCP69_DISPLAY.lot_price,
    // normalize.ts reads this to learn lot_price is priced in XCP, not in the minted asset.
    lot_price_asset: 'XCP',
    hard_cap: XCP69_DISPLAY.hard_cap,
    soft_cap: XCP69_DISPLAY.soft_cap,
    pool_quantity: XCP69_DISPLAY.pool_quantity,
    premint_quantity: XCP69_DISPLAY.premint_quantity,
    minted_asset_commission: '0',
    lp_asset: params.lpAsset,
    divisible: 'true',
    lock_quantity: 'true',
    lock_description: 'true',
    burn_payment: 'false',
    start_block: String(params.blocks?.start_block ?? 0),
    soft_cap_deadline_block: String(params.blocks?.soft_cap_deadline_block ?? 0),
    end_block: '0',
  };
}

export interface Xcp69Blocks {
  start_block: number;
  soft_cap_deadline_block: number;
  /** Pool fairminters close at the soft-cap deadline, so an end block is dead weight. */
  end_block: 0;
}

/**
 * When the sale opens and closes, from the current height and a chosen lead.
 *
 * The window is exact: `soft_cap_deadline_block - start_block === 1000`. A creator cannot shorten
 * it to run a fast insider mint behind thousand-block metadata, because the launchpad reads the
 * clock from the chain rather than from the composed values.
 */
export function deriveXcp69Blocks(currentHeight: number, leadBlocks: number): Xcp69Blocks {
  const start = currentHeight + leadBlocks;
  return {
    start_block: start,
    soft_cap_deadline_block: start + XCP69_WINDOW_BLOCKS,
    end_block: 0,
  };
}

/** Numeric assets run from 26^12 + 1 up to 2^64 - 1. */
const NUMERIC_ASSET_MIN = 26n ** 12n + 1n;
const NUMERIC_ASSET_MAX = 2n ** 64n - 1n;

/**
 * An LP asset name of the form `A69…`, which is the standard's branding convention.
 *
 * The tail is random rather than derived: two launches must not collide, and a predictable name
 * could be front-run by issuing it first. Sixteen digits after the `69` puts the value between
 * 6.9e17 and 7.0e17, comfortably inside the numeric range — a shorter tail would fall *below*
 * 26^12 (9.54e16) and not be a valid numeric asset at all.
 *
 * Conformance requires only a valid, unissued numeric asset; the `A69` prefix is convention.
 */
export function generateXcp69LpAsset(): string {
  const digits = new Uint32Array(16);
  crypto.getRandomValues(digits);
  const tail = Array.from(digits, (d) => (d % 10).toString()).join("");
  const name = `A69${tail}`;
  const value = BigInt(`69${tail}`);
  /* c8 ignore next */
  if (value < NUMERIC_ASSET_MIN || value > NUMERIC_ASSET_MAX) {
    throw new Error(`Generated LP asset out of numeric range: ${name}`);
  }
  return name;
}

/** Display units are scaled by 1e8 for a divisible asset, which every XCP-69 launch is. */
function toBase(display: string): string {
  const [whole = '0', frac = ''] = display.split('.');
  return `${whole}${frac.padEnd(8, '0').slice(0, 8)}`.replace(/^0+(?=\d)/, '');
}

/**
 * The base-unit view of the fields a launch will submit, for the conformance predicate.
 *
 * Scaled here the way `normalize.ts` scales them, so the gate reads the numbers the node will,
 * rather than the constants they were built from.
 */
export function xcp69CandidateFromFields(fields: Record<string, string>): Xcp69Candidate {
  return {
    hard_cap: toBase(fields.hard_cap ?? ''),
    soft_cap: toBase(fields.soft_cap ?? ''),
    pool_quantity: toBase(fields.pool_quantity ?? ''),
    quantity_by_price: toBase(fields.lot_size ?? ''),
    price: toBase(fields.lot_price ?? ''),
    max_mint_per_address: toBase(fields.max_mint_per_address ?? ''),
    max_mint_per_tx: toBase(fields.max_mint_per_tx ?? ''),
    premint_quantity: toBase(fields.premint_quantity ?? ''),
    minted_asset_commission_int: fields.minted_asset_commission ?? '0',
    divisible: fields.divisible === 'true',
    burn_payment: fields.burn_payment === 'true',
    lock_quantity: fields.lock_quantity === 'true',
    lock_description: fields.lock_description === 'true',
    lp_asset: fields.lp_asset ?? null,
    start_block: Number(fields.start_block ?? 0),
    soft_cap_deadline_block: Number(fields.soft_cap_deadline_block ?? 0),
    end_block: Number(fields.end_block ?? 0),
  };
}

export interface Xcp69Candidate {
  asset?: string;
  hard_cap?: string | number | bigint | null;
  soft_cap?: string | number | bigint | null;
  pool_quantity?: string | number | bigint | null;
  quantity_by_price?: string | number | bigint | null;
  price?: string | number | bigint | null;
  max_mint_per_address?: string | number | bigint | null;
  max_mint_per_tx?: string | number | bigint | null;
  premint_quantity?: string | number | bigint | null;
  minted_asset_commission_int?: string | number | bigint | null;
  start_block?: number | null;
  soft_cap_deadline_block?: number | null;
  end_block?: number | null;
  burn_payment?: boolean | null;
  lock_quantity?: boolean | null;
  lock_description?: boolean | null;
  divisible?: boolean | null;
  lp_asset?: string | null;
}

export interface Xcp69Conformance {
  conformant: boolean;
  /** One sentence per failed clause, in the order the spec states them. */
  failures: string[];
}

/** Reads a quantity as an integer, or null when it is absent or not one. */
function asInteger(value: string | number | bigint | null | undefined): bigint | null {
  if (value === undefined || value === null || value === "") return null;
  try {
    if (typeof value === "bigint") return value;
    const text = typeof value === "number" ? value.toString() : value.trim();
    // A decimal point here means display units reached a base-unit field, which is a unit error
    // rather than a value that happens to miss the constant — worth failing rather than rounding.
    if (!/^\d+$/.test(text)) return null;
    return BigInt(text);
  } catch {
    return null;
  }
}

/**
 * Whether a composed launch conforms to XCP-69, and what fails if not.
 *
 * Deliberately exhaustive rather than short-circuiting: a creator fixing one clause should not
 * have to re-run to discover the next.
 */
export function checkXcp69Conformance(candidate: Xcp69Candidate): Xcp69Conformance {
  const failures: string[] = [];

  const fixed: Array<[keyof typeof XCP69_BASE, string]> = [
    ["hard_cap", "Hard cap must be 100,000,000"],
    ["soft_cap", "Soft cap must be 69,000,000"],
    ["pool_quantity", "Pool reserve must be 31,000,000"],
    ["quantity_by_price", "Lot size must be 1,000"],
    ["price", "Price must be 0.01 XCP per lot"],
    ["max_mint_per_address", "Per-address cap must be 1,000,000"],
    ["max_mint_per_tx", "Per-transaction cap must be 1,000,000"],
    ["premint_quantity", "Premint must be 0"],
    ["minted_asset_commission_int", "Commission must be 0"],
  ];
  for (const [field, message] of fixed) {
    if (asInteger(candidate[field]) !== XCP69_BASE[field]) failures.push(message);
  }

  // A numeric asset can be issued by anyone holding the name; XCP-69 launches are named assets so
  // the ticker is the thing being launched.
  if (!candidate.asset || !isNamedAsset(candidate.asset)) {
    failures.push("Asset must be a named asset, not numeric");
  }

  if (candidate.divisible !== true) failures.push("Asset must be divisible");
  if (candidate.burn_payment === true) failures.push("Payment must not be burned; it seeds the pool");
  if (!candidate.lock_quantity) failures.push("Supply must be locked");
  if (!candidate.lock_description) failures.push("Description must be locked");

  const start = candidate.start_block ?? 0;
  const deadline = candidate.soft_cap_deadline_block ?? 0;
  if (deadline - start !== XCP69_WINDOW_BLOCKS) {
    failures.push(`Mint window must be exactly ${XCP69_WINDOW_BLOCKS} blocks`);
  }
  if ((candidate.end_block ?? 0) !== 0) {
    failures.push("End block must be unset; pool fairminters close at the deadline");
  }

  // Checked against the composed start block only. Whether the launch actually confirms before it
  // is unknowable here — see `describeXcp69LeadRisk`.
  if (start <= 0) failures.push("Start block must be set, and in the future");

  if (!candidate.lp_asset) failures.push("An LP asset is required");

  return { conformant: failures.length === 0, failures };
}

/**
 * The one clause this wallet cannot verify, stated plainly for the creator.
 *
 * `start_block > block_index` is measured at the confirming block, so a launch broadcast with too
 * little lead confirms late and is valid to core but not XCP-69 — permanently, with nothing
 * on-chain recording the near miss. Returns null when the lead is comfortable.
 */
export function describeXcp69LeadRisk(leadBlocks: number): string | null {
  if (leadBlocks < XCP69_MIN_SAFE_LEAD_BLOCKS) {
    return "Too short. This launch will very likely confirm at or after its own start block, which is valid to Counterparty but is not XCP-69, and cannot be corrected afterwards.";
  }
  if (leadBlocks < XCP69_DEFAULT_LEAD_BLOCKS) {
    return "Short. If the transaction confirms at or after the start block the launch is still valid, but it is not XCP-69.";
  }
  return null;
}
