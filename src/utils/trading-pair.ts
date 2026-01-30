/**
 * Trading pair utilities for determining base/quote asset relationships.
 * This helps ensure consistent pricing display where common quote assets
 * like XCP, BTC, PEPECASH are always shown as the quote (denominator).
 */

// Priority-ordered list of known quote assets
// Lower index = higher priority to be the quote asset
const QUOTE_ASSETS = [
  'BTC', 'XCP', 'XBTC', 'FLDC', 'SJCX', 'BITCRYSTALS', 'LTBCOIN', 'SCOTCOIN',
  'PEPECASH', 'BITCORN', 'CORNFUTURES', 'NEWBITCORN', 'DATABITS', 'MAFIACASH',
  'PENISIUM', 'RUSTBITS', 'WILLCOIN', 'XFCCOIN', 'SOVEREIGNC', 'OLINCOIN',
  'BITROCK', 'DANKMEMECASH', 'COMMONFROG.PURCHASE', 'PEPSTEIN.HUSHMONEY',
  'SCUDOCOIN', 'GREEEEEECOIN', 'MOULACOIN', 'LICKOIN', 'IAMCOIN', 'NEOCASH',
  'RELICASH', 'SHADILAYCASH', 'BLUEBEARCASH', 'FAKEAPECASH', 'DANKROSECASH',
  'DESANTISCASH', 'DOLLARCASH', 'BOBOCASH', 'SHARPS', 'CRONOS', 'BOBOXX', 'SWARM',
  'DABC', 'KEKO', 'NVST', 'POWC', 'NOJAK', 'NOMNI', 'BASSMINT', 'RAIZER.BTC',
  'RAIZER', 'FUUUUUH.BTC', 'FUUUUUH', 'WOOOOK', 'VACUS', 'MUUI', 'FUTURECREDIT'
];

// Keywords that suggest an asset might be a quote asset
const QUOTE_KEYWORDS = ['CASH', 'COIN', 'MONEY', 'BTC'];

/**
 * Get the priority rank for a known quote asset.
 * Lower rank = higher priority to be quote.
 * Returns array length if not in list (lowest priority).
 */
function getQuoteRank(symbol: string): number {
  const index = QUOTE_ASSETS.indexOf(symbol);
  return index !== -1 ? index : QUOTE_ASSETS.length;
}

/**
 * Check if asset is in the known quote assets list.
 */
function isKnownQuoteAsset(symbol: string): boolean {
  return QUOTE_ASSETS.includes(symbol);
}

/**
 * Check if asset name contains quote-suggesting keywords.
 */
function hasQuoteKeyword(symbol: string): boolean {
  const upperSymbol = symbol.toUpperCase();
  return QUOTE_KEYWORDS.some(keyword => upperSymbol.includes(keyword));
}

/**
 * Determines the canonical trading pair order for two assets.
 * Returns [baseAsset, quoteAsset] where the quote is the "currency" side.
 *
 * @example
 * getTradingPair('PEPECASH', 'RAREPEPE') // Returns ['RAREPEPE', 'PEPECASH']
 * getTradingPair('XCP', 'PEPE') // Returns ['PEPE', 'XCP']
 * getTradingPair('BTC', 'XCP') // Returns ['XCP', 'BTC'] (BTC has higher priority)
 */
export function getTradingPair(asset1: string, asset2: string): [string, string] {
  const isAsset1Known = isKnownQuoteAsset(asset1);
  const isAsset2Known = isKnownQuoteAsset(asset2);

  // Both are known quote assets - use rank to determine priority
  if (isAsset1Known && isAsset2Known) {
    return getQuoteRank(asset1) < getQuoteRank(asset2)
      ? [asset2, asset1]  // asset1 is quote (lower rank = quote)
      : [asset1, asset2]; // asset2 is quote
  }

  // Only asset1 is a known quote asset
  if (isAsset1Known) {
    return [asset2, asset1];
  }

  // Only asset2 is a known quote asset
  if (isAsset2Known) {
    return [asset1, asset2];
  }

  // Neither is known - check for keywords
  const asset1HasKeyword = hasQuoteKeyword(asset1);
  const asset2HasKeyword = hasQuoteKeyword(asset2);

  // Both have keywords - use alphabetical order as tiebreaker
  if (asset1HasKeyword && asset2HasKeyword) {
    return asset1.localeCompare(asset2) < 0
      ? [asset1, asset2]
      : [asset2, asset1];
  }

  // Only asset1 has keyword
  if (asset1HasKeyword) {
    return [asset2, asset1];
  }

  // Only asset2 has keyword
  if (asset2HasKeyword) {
    return [asset1, asset2];
  }

  // Neither has keyword - use alphabetical order
  return asset1.localeCompare(asset2) < 0
    ? [asset1, asset2]
    : [asset2, asset1];
}

/**
 * Determines if the current order is a "buy" from the perspective of the base asset.
 * A buy order means you're giving quote asset to get base asset.
 *
 * @param giveAsset - The asset being given in the order
 * @param getAsset - The asset being received in the order
 * @returns true if this is a buy order (giving quote, getting base)
 */
export function isBuyOrder(giveAsset: string, getAsset: string): boolean {
  const [baseAsset] = getTradingPair(giveAsset, getAsset);
  return getAsset === baseAsset;
}

/**
 * Check if an asset is a known or probable quote asset.
 */
export function isQuoteAsset(symbol: string): boolean {
  return isKnownQuoteAsset(symbol) || hasQuoteKeyword(symbol);
}

// ============================================================
// Order calculation helpers
// ============================================================

/**
 * Minimal order interface for calculation functions.
 * Avoids circular dependency with api.ts by using a subset of fields.
 */
interface OrderLike {
  give_asset: string;
  get_asset: string;
  give_quantity_normalized: string;
  get_quantity_normalized: string;
  give_remaining_normalized: string;
  get_remaining_normalized: string;
}

/**
 * Minimal order match interface for calculation functions.
 */
interface OrderMatchLike {
  forward_asset: string;
  backward_asset: string;
  forward_quantity_normalized: string;
  backward_quantity_normalized: string;
}

/**
 * Calculate price per unit (quote per base) from an order.
 * Takes into account whether this is a sell order (give=base) or buy order (give=quote).
 *
 * @param order - The order to calculate price for
 * @param baseAsset - The base asset of the trading pair context
 * @returns Price in quote asset per unit of base asset
 */
export function getOrderPricePerUnit(order: OrderLike, baseAsset: string): number {
  if (order.give_asset === baseAsset) {
    // Sell order: giving base, getting quote
    // Price = quote/base = get_quantity / give_quantity
    const giveQty = Number(order.give_quantity_normalized);
    if (giveQty <= 0) return 0;
    return Number(order.get_quantity_normalized) / giveQty;
  } else {
    // Buy order: giving quote, getting base
    // Price = quote/base = give_quantity / get_quantity
    const getQty = Number(order.get_quantity_normalized);
    if (getQty <= 0) return 0;
    return Number(order.give_quantity_normalized) / getQty;
  }
}

/**
 * Get the base asset amount from an order (what's being bought/sold).
 */
export function getOrderBaseAmount(order: OrderLike, baseAsset: string): number {
  if (order.give_asset === baseAsset) {
    // Sell order: they're giving base
    return Number(order.give_remaining_normalized);
  } else {
    // Buy order: they want to receive base
    return Number(order.get_remaining_normalized);
  }
}

/**
 * Get the quote asset amount from an order.
 */
export function getOrderQuoteAmount(order: OrderLike, baseAsset: string): number {
  if (order.give_asset === baseAsset) {
    // Sell order: they want to receive quote
    return Number(order.get_remaining_normalized);
  } else {
    // Buy order: they're giving quote
    return Number(order.give_remaining_normalized);
  }
}

/**
 * Calculate price per unit from order match.
 */
export function getMatchPricePerUnit(match: OrderMatchLike, baseAsset: string): number {
  if (match.forward_asset === baseAsset) {
    const baseQty = Number(match.forward_quantity_normalized);
    if (baseQty <= 0) return 0;
    return Number(match.backward_quantity_normalized) / baseQty;
  } else {
    const baseQty = Number(match.backward_quantity_normalized);
    if (baseQty <= 0) return 0;
    return Number(match.forward_quantity_normalized) / baseQty;
  }
}
