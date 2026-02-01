import { formatAmount } from "@/utils/format";
import { CURRENCY_INFO } from "@/utils/blockchain/bitcoin/price";
import type { PriceUnit, FiatCurrency } from "@/utils/settings";

const SATS_PER_BTC = 100_000_000;

/**
 * Format price based on selected unit
 */
export function formatPrice(
  sats: number,
  unit: PriceUnit,
  btcPrice: number | null,
  currency: FiatCurrency
): string {
  switch (unit) {
    case "sats":
      return `${formatAmount({ value: sats, maximumFractionDigits: 0 })} sats`;
    case "btc":
      const btc = sats / SATS_PER_BTC;
      return `${formatAmount({ value: btc, minimumFractionDigits: 8, maximumFractionDigits: 8 })} BTC`;
    case "fiat":
      if (!btcPrice) return "—";
      const fiatValue = (sats / SATS_PER_BTC) * btcPrice;
      const { symbol, decimals } = CURRENCY_INFO[currency];
      return `${symbol}${formatAmount({ value: fiatValue, maximumFractionDigits: decimals })}`;
  }
}

/**
 * Get raw numeric price value (without symbol) for clipboard
 */
export function getRawPrice(
  sats: number,
  unit: PriceUnit,
  btcPrice: number | null,
  currency: FiatCurrency
): string {
  switch (unit) {
    case "sats":
      return formatAmount({ value: sats, maximumFractionDigits: 0 });
    case "btc":
      return formatAmount({ value: sats / SATS_PER_BTC, minimumFractionDigits: 8, maximumFractionDigits: 8 });
    case "fiat":
      if (!btcPrice) return "";
      const decimals = CURRENCY_INFO[currency].decimals;
      return formatAmount({ value: (sats / SATS_PER_BTC) * btcPrice, maximumFractionDigits: decimals });
  }
}

/**
 * Get next price unit in cycle: BTC → SATS → FIAT → BTC
 */
export function getNextPriceUnit(current: PriceUnit, hasFiat: boolean): PriceUnit {
  if (current === "btc") return "sats";
  if (current === "sats") return hasFiat ? "fiat" : "btc";
  return "btc";
}
