import type { ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { AssetHeader } from "@/components/domain/asset/asset-header";
import { FaChevronRight, FaHistory, FiChevronDown } from "@/components/icons";
import type { ActionSection } from "@/components/ui/lists/action-list";
import { ActionList } from "@/components/ui/lists/action-list";
import { Spinner } from "@/components/ui/spinner";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { type Dividend, fetchDividendsByAsset, type PaginatedResponse } from "@/core/counterparty/api";
import { formatAddress, formatAmount, formatTimeAgo } from "@/core/format";
import { asDisplayUnits, isEqualTo, isGreaterThan } from "@/core/numeric";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { useAssetLatestIssuance } from "@/hooks/useAssetLatestIssuance";


/**
 * Constants for navigation paths.
 */
const PATHS = {
  BACK: "/index?tab=Assets",
  COMPOSE: "/compose",
} as const;

/**
 * ViewAsset component displays detailed information and actions for a specific asset.
 *
 * Features:
 * - Fetches and displays asset details
 * - Lists actionable options based on ownership and asset state
 *
 * @returns {ReactElement} The rendered asset view UI.
 * @example
 * ```tsx
 * <ViewAsset />
 * ```
 */
export default function AssetPage(): ReactElement {
  const { asset } = useParams<{ asset: string }>();
  const navigate = useNavigate();
  const { setHeaderProps, getCachedOwnedAsset } = useHeader();
  const { activeAddress } = useWallet();
  const { data: assetDetails, isLoading, error } = useAssetDetails(asset || "");
  // The asset summary carries no `fair_minting`; core reads it off the latest issuance, so we do
  // too. The same row is what core's `issuance.validate` calls `last_issuance`.
  const { data: latestIssuance, isLoading: isIssuanceLoading } = useAssetLatestIssuance(asset || "");

  // Get cached data for instant display
  const cachedAsset = useMemo(() => getCachedOwnedAsset(asset || ""), [getCachedOwnedAsset, asset]);
  
  // Dividend history state
  const [dividends, setDividends] = useState<Dividend[]>([]);
  const [dividendsLoading, setDividendsLoading] = useState(false);
  const [dividendsError, setDividendsError] = useState<string | null>(null);
  const [showDividends, setShowDividends] = useState(false);
  const [hasMoreDividends, setHasMoreDividends] = useState(true);
  const [dividendsOffset, setDividendsOffset] = useState(0);

  /**
   * Loads dividend history for the asset
   */
  const loadDividends = async () => {
    if (!asset || dividendsLoading) return;
    
    setDividendsLoading(true);
    setDividendsError(null);
    
    try {
      const response: PaginatedResponse<Dividend> = await fetchDividendsByAsset(asset, {
        limit: 10,
        offset: dividendsOffset,
      });
      
      if (dividendsOffset === 0) {
        setDividends(response.result);
      } else {
        setDividends(prev => [...prev, ...response.result]);
      }
      
      setHasMoreDividends(response.result.length === 10);
      setDividendsOffset(prev => prev + response.result.length);
    } catch (err) {
      setDividendsError(err instanceof Error ? err.message : "Failed to load dividend history");
    } finally {
      setDividendsLoading(false);
    }
  };

  // Load dividends when the section is first expanded. The guard is a one-shot latch: an asset
  // with no dividends still reads as empty and idle afterwards, so making it reactive refetches
  // forever.
  useEffect(() => {
    if (showDividends && dividends.length === 0 && !dividendsLoading) {
      loadDividends();
    }
  }, [showDividends, asset]);

  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: "Asset",
      onBack: () => navigate(PATHS.BACK),
    });
    return () => setHeaderProps(null);
  }, [setHeaderProps, navigate]);

  /**
   * The actions this address can actually take on this asset.
   *
   * Each entry is gated on the conditions counterparty-core validates, so the list only offers
   * transactions the node would accept: an action core would reject is not shown at all rather
   * than shown and refused at compose time. Every gate below cites the rule it mirrors, and the
   * one gate that is ours rather than core's — Pay Dividend during a fairmint — says so.
   *
   * @returns {ActionSection[]} The list of actionable options for the asset.
   */
  const getActionSections = (): ActionSection[] => {
    if (!assetDetails?.assetInfo || !asset) return [];
    // Both lookups start together, but the summary often answers first — from cache, even
    // instantly. Reading a still-loading fairminter state as "not minting" drew the full list and
    // then tore most of it back out a moment later, which is worse than a beat with no list: the
    // Asset Details card jumps up the page, and anything the owner reached for is gone by the time
    // they press it. An empty list is what this already renders while the summary loads, so
    // waiting for the second answer only widens that window rather than adding a new state. A
    // failed lookup settles as unknown, not loading, and still lets everything through.
    if (isIssuanceLoading) return [];

    const info = assetDetails.assetInfo;
    const actions = [];

    // Ownership follows `owner`, not `issuer`. Core writes `assets_info.issuer` once, at first
    // issuance, and never again; every ASSET_TRANSFER moves `owner` alone (`api/apiwatcher.py`).
    // Core's own `issuance.validate` compares the source against the *latest* issuance's issuer,
    // which a transfer rewrites to the destination — that is `owner`. Keying off `issuer` gave
    // every action to the address that gave the asset away and none to the one now holding it.
    const controller = info.owner ?? info.issuer;
    const isOwner = Boolean(controller) && controller === activeAddress?.address;

    // BTC has no issuance at all and XCP's supply came from burns; neither carries an owner, so
    // `isOwner` is already false for both. Naming the case anyway keeps the dividend and
    // fairminter bans below readable rather than incidental.
    const isProtocolAsset = asset === "BTC" || asset === "XCP";
    /** The precondition every action shares: you control it, and it is not a protocol asset. */
    const canAct = isOwner && !isProtocolAsset;
    const isLocked = info.locked;
    const isDescriptionLocked = info.description_locked ?? false;
    const isSubasset = Boolean(info.asset_longname);

    const totalSupply = info.supply_normalized || "0";
    const hasSupply = isGreaterThan(totalSupply, 0);
    const ownerBalance = assetDetails.availableBalance || "0";

    // Shared precondition for every action that reissues *this* asset. Core rejects all of them
    // while a fairminter is live: `issuance.validate` → "cannot issue during fair minting". One
    // action below is deliberately not covered by it — Issue Subasset creates a new asset with its
    // own empty issuance history, so the parent's fairminter never enters the check. Pay Dividend
    // is withheld too, but on our own judgement rather than core's; see there. An unestablished
    // state reads as "not minting" and blocks nothing; see `useAssetLatestIssuance`.
    const isFairMinting = latestIssuance?.fair_minting === true;
    const canReissue = canAct && !isFairMinting;

    // Start Mint — `fairminter.validate`: the asset must exist, be unlocked, be issued by the
    // source, and have no fairminter already open.
    if (canAct && !isLocked && !isFairMinting) {
      actions.push({
        id: "start-mint",
        title: "Start Mint",
        description: "Create a fairminter for this asset",
        onClick: () => navigate(`${PATHS.COMPOSE}/fairminter/${asset}`),
      });
    }

    // A locked supply is exactly what these two change, so both go once `locked` is set —
    // core: "locked asset and non‐zero quantity" for the first, and a second lock is a no-op.
    if (canReissue && !isLocked) {
      actions.push(
        {
          id: "issue-supply",
          title: "Issue Supply",
          description: "Issue additional tokens for this asset",
          onClick: () => navigate(`${PATHS.COMPOSE}/issuance/issue-supply/${asset}`),
        },
        {
          id: "lock-supply",
          title: "Lock Supply",
          description: "Permanently lock the token supply",
          onClick: () => navigate(`${PATHS.COMPOSE}/issuance/lock-supply/${asset}`),
        }
      );
    }

    // Reset rewrites supply and description together, so core blocks it on either lock
    // ("cannot reset a locked asset" / "Cannot reset issuance with locked description") and
    // requires the owner to be the sole holder of the whole supply. Display units on both sides:
    // `info.supply` is base units, `availableBalance` is already divided by divisibility.
    const canResetSupply =
      canReissue &&
      !isLocked &&
      !isDescriptionLocked &&
      (!hasSupply || isEqualTo(ownerBalance, totalSupply));

    if (canResetSupply) {
      actions.push({
        id: "reset-supply",
        title: "Reset Supply",
        description: "Destroy the supply and re-issue the asset",
        onClick: () => navigate(`${PATHS.COMPOSE}/issuance/reset-supply/${asset}`),
      });
    }

    // Subassets cannot nest, and core checks only that the parent is owned by the source — a
    // locked or fair-minting parent still accepts new children.
    if (canAct && !isSubasset) {
      actions.push({
        id: "issue-subasset",
        title: "Issue Subasset",
        description: "Create a new asset under this namespace",
        onClick: () => navigate(`${PATHS.COMPOSE}/issuance/${asset}`),
      });
    }

    // `dividend.validate`: "only issuer can pay dividends" — where core's "issuer" is the latest
    // issuance's, i.e. the current owner (`ledger.issuances.get_asset_issuer`). Dividends on BTC
    // or XCP are banned outright, and with no supply there are no holders, which core rejects as
    // "zero dividend".
    //
    // The fairminter clause is ours, not core's — `dividend.validate` says nothing about fair
    // minting, and the node would accept this. It is withheld because paying one mid-sale loses
    // money quietly. Until a soft cap settles, every minted token is credited to
    // `config.UNSPENDABLE` (`fairmint.parse`), and `supplies.holders` selects every address with a
    // balance, so the burn address is paid as an ordinary holder and that share is destroyed — for
    // a sale whose only other holder is the issuer, who `no_dividend_to_self` skips, that is the
    // whole payout. `pool_quantity` and an unopened premint sit at the same address. Supply also
    // moves every block a mint confirms, so the per-unit figure quoted here is stale by the time it
    // signs and the transaction fails on funds. Offering nothing beats offering that.
    if (canAct && !isFairMinting && hasSupply) {
      actions.push({
        id: "pay-dividend",
        title: "Pay Dividend",
        description: "Distribute dividends to token holders",
        onClick: () => navigate(`${PATHS.COMPOSE}/dividend/${asset}`),
      });
    }

    // Both write a description, which core refuses once `description_locked` is set: "Cannot
    // update a locked description". A second lock would be refused for the same reason.
    if (canReissue && !isDescriptionLocked) {
      actions.push(
        {
          id: "lock-description",
          title: "Lock Description",
          description: "Permanently lock the asset description",
          onClick: () => navigate(`${PATHS.COMPOSE}/issuance/lock-description/${asset}`),
        },
        {
          id: "update-description",
          title: "Update Description",
          description: "Update the asset description",
          onClick: () => navigate(`${PATHS.COMPOSE}/issuance/update-description/${asset}`),
        }
      );
    }

    // A transfer carries no description and no quantity, so neither lock blocks it — only
    // ownership and the fairminter do.
    if (canReissue) {
      actions.push({
        id: "transfer-ownership",
        title: "Transfer Ownership",
        description: "Transfer asset ownership to another address",
        onClick: () => navigate(`${PATHS.COMPOSE}/issuance/transfer-ownership/${asset}`),
      });
    }

    return [{ items: actions }];
  };

  // Build header data from fresh data or cache for instant display
  const headerAssetInfo = useMemo(() => {
    // Prefer fresh data if available
    if (assetDetails?.assetInfo) {
      return {
        asset: asset || "",
        asset_longname: assetDetails.assetInfo.asset_longname || null,
        description: assetDetails.assetInfo.description,
        issuer: assetDetails.assetInfo.issuer,
        divisible: assetDetails.assetInfo.divisible ?? false,
        locked: assetDetails.assetInfo.locked ?? false,
        supply: assetDetails.assetInfo.supply,
        supply_normalized: assetDetails.assetInfo.supply_normalized || asDisplayUnits('0')
      };
    }
    // Fall back to cached data for instant display (partial info)
    if (cachedAsset) {
      return {
        asset: cachedAsset.asset,
        asset_longname: cachedAsset.asset_longname,
        description: cachedAsset.description,
        issuer: undefined, // Not available in cache
        divisible: false, // Not available in cache, will update when loaded
        locked: cachedAsset.locked,
        // supply is base units and the cache holds only the normalized figure, so it is omitted
        // rather than filled with a display value 1e8 away from what the field means. That
        // substitution was previously masked by the hardcoded `divisible: false` above — nothing
        // divided it — which made a wrong value look right only while a second wrong value held.
        supply: undefined,
        supply_normalized: asDisplayUnits(cachedAsset.supply_normalized)
      };
    }
    return null;
  }, [asset, assetDetails, cachedAsset]);

  // Show spinner only if no cached data and still loading
  if (isLoading && !headerAssetInfo) {
    return <Spinner message="Loading asset details…" />;
  }

  // Only show error if there's an actual error and no data to display
  if (error && !headerAssetInfo) {
    return <div className="p-4 text-center text-gray-600">Failed to load asset information</div>;
  }

  // If we don't have any data yet, return empty div to prevent flash
  if (!headerAssetInfo) {
    return <div />;
  }

  return (
    <section className="p-4 space-y-6" aria-labelledby="asset-title">
      <AssetHeader
        className="mt-1 mb-5"
        assetInfo={headerAssetInfo}
      />
      {/* Actions require full data for ownership checks */}
      <ActionList sections={getActionSections()} />
      <div className="bg-white rounded-lg p-4 shadow-sm space-y-3">
        <h2 className="text-sm font-medium text-gray-900">Asset Details</h2>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Supply</span>
            <span className="text-sm text-gray-900">
              {assetDetails?.assetInfo?.supply_normalized || headerAssetInfo.supply_normalized || "0"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Divisible</span>
            <span className="text-sm text-gray-900">
              {assetDetails ? (assetDetails.isDivisible ? "Yes" : "No") : "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Locked</span>
            <span className="text-sm text-gray-900">
              {headerAssetInfo.locked ? "Yes" : "No"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Issuer</span>
            <span className="text-sm text-gray-900 font-mono">
              {headerAssetInfo.issuer ? formatAddress(headerAssetInfo.issuer) : (isLoading ? "Loading…" : "Unknown")}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Your Balance</span>
            <span className="text-sm text-gray-900">
              {assetDetails?.spendableBalance ?? assetDetails?.availableBalance ?? (isLoading ? "Loading…" : "0")}
            </span>
          </div>
        </div>
      </div>
      
      {/* Dividend History Section - Collapsible */}
      <div className="bg-white rounded-lg shadow-sm">
        <button type="button"
          onClick={() => setShowDividends(!showDividends)}
          className="w-full p-4 flex justify-between items-center hover:bg-gray-50 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-expanded={showDividends}
          aria-controls="dividend-history"
        >
          <div className="flex items-center gap-2">
            <FaHistory className="text-gray-500 size-4" aria-hidden="true" />
            <h2 className="text-sm font-medium text-gray-900">Dividend History</h2>
          </div>
          {showDividends ? (
            <FiChevronDown className="text-gray-400 size-4" aria-hidden="true" />
          ) : (
            <FaChevronRight className="text-gray-400 size-4" aria-hidden="true" />
          )}
        </button>
        
        {showDividends && (
          <div id="dividend-history" className="border-t border-gray-100">
            {dividendsLoading && dividends.length === 0 ? (
              <div className="p-4">
                <Spinner message="Loading dividend history…" />
              </div>
            ) : dividendsError ? (
              <div className="p-4 text-center text-red-600 text-sm">
                {dividendsError}
              </div>
            ) : dividends.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">
                No dividends have been distributed for this asset
              </div>
            ) : (
              <div className="p-4 space-y-3">
                {dividends.map((dividend) => (
                  <button type="button"
                    key={dividend.tx_hash}
                    onClick={() => navigate(`/transaction/${dividend.tx_hash}`)}
                    className="block w-full text-left border border-gray-200 rounded-lg p-3 hover:bg-gray-50 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    aria-label={`View dividend transaction ${dividend.tx_hash}`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {formatAmount({
                            value: dividend.quantity_per_unit_normalized,
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 8,
                          })} {dividend.dividend_asset} per unit
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Total distributed: {formatAmount({
                            value: dividend.total_distributed_normalized,
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 8,
                          })} {dividend.dividend_asset}
                        </div>
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatTimeAgo(dividend.block_time)}
                      </div>
                    </div>
                    <div className="text-xs text-gray-400 break-all">
                      TX: {dividend.tx_hash}
                    </div>
                  </button>
                ))}
                
                {hasMoreDividends && (
                  <button type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      loadDividends();
                    }}
                    disabled={dividendsLoading}
                    className="w-full py-2 text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                  >
                    {dividendsLoading ? "Loading…" : "Load More"}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
