import { type ReactElement, type KeyboardEvent } from "react";
import { FaBitcoin } from "@/components/icons";
import { formatAmount } from "@/utils/format";
import { CURRENCY_INFO, type FiatCurrency } from "@/utils/blockchain/bitcoin/price";

interface PriceTickerProps {
  btc: number | null;
  xcp: number | null;
  currency?: FiatCurrency;
  onBtcClick?: () => void;
  onXcpClick?: () => void;
  className?: string;
}

/**
 * PriceTicker displays current BTC and XCP prices in the specified currency.
 * Cards are clickable when onClick handlers are provided.
 */
export function PriceTicker({
  btc,
  xcp,
  currency = 'usd',
  onBtcClick,
  onXcpClick,
  className = "",
}: PriceTickerProps): ReactElement {
  const currencyInfo = CURRENCY_INFO[currency];
  const currencySymbol = currencyInfo.symbol;
  const decimals = currencyInfo.decimals;

  const handleBtcKeyDown = (e: KeyboardEvent) => {
    if (onBtcClick && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      onBtcClick();
    }
  };

  const handleXcpKeyDown = (e: KeyboardEvent) => {
    if (onXcpClick && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      onXcpClick();
    }
  };

  return (
    <div className={`grid grid-cols-2 gap-3 ${className}`}>
      <div
        className={`bg-white rounded-lg shadow-sm border border-gray-200 p-3 ${onBtcClick ? "cursor-pointer hover:border-orange-300 hover:shadow-md transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500" : ""}`}
        onClick={onBtcClick}
        onKeyDown={handleBtcKeyDown}
        role={onBtcClick ? "button" : undefined}
        tabIndex={onBtcClick ? 0 : undefined}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FaBitcoin className="text-orange-500" aria-hidden="true" />
            <span className="font-medium text-gray-900 text-sm">BTC</span>
          </div>
          <div className="flex items-center">
            {btc ? (
              <span className="font-semibold text-gray-900 text-sm">
                {currencySymbol}{formatAmount({ value: btc, maximumFractionDigits: 0 })}
              </span>
            ) : (
              <span className="text-gray-400">—</span>
            )}
          </div>
        </div>
      </div>
      <div
        className={`bg-white rounded-lg shadow-sm border border-gray-200 p-3 ${onXcpClick ? "cursor-pointer hover:border-rose-300 hover:shadow-md transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500" : ""}`}
        onClick={onXcpClick}
        onKeyDown={handleXcpKeyDown}
        role={onXcpClick ? "button" : undefined}
        tabIndex={onXcpClick ? 0 : undefined}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="https://app.xcp.io/img/icon/XCP" alt="" className="size-4 rounded-full" aria-hidden="true" />
            <span className="font-medium text-gray-900 text-sm">XCP</span>
          </div>
          <div className="flex items-center">
            {xcp ? (
              <span className="font-semibold text-gray-900 text-sm">
                {currencySymbol}{formatAmount({ value: xcp, maximumFractionDigits: decimals })}
              </span>
            ) : (
              <span className="text-gray-400">—</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
