import { useCallback, useEffect, useState, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ErrorAlert } from "@/components/ui/error-alert";
import { ActionList, type ActionSection } from "@/components/ui/lists/action-list";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { useInView } from "@/hooks/useInView";
import { fetchAddressPools, type PoolPosition } from "@/utils/blockchain/counterparty/api";
import { getCanonicalPoolPair } from "@/utils/blockchain/counterparty/pool";

const PAGE_SIZE = 20;

export default function ManagePoolsPage(): ReactElement {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { activeAddress } = useWallet();
  const [positions, setPositions] = useState<PoolPosition[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { ref: loadMoreRef, inView } = useInView({ rootMargin: "300px", threshold: 0 });

  useEffect(() => {
    setHeaderProps({
      title: "Pools",
      onBack: () => navigate("/actions"),
    });
    return () => setHeaderProps(null);
  }, [navigate, setHeaderProps]);

  useEffect(() => {
    if (!activeAddress?.address) {
      setPositions([]);
      setOffset(0);
      setHasMore(true);
      setInitialLoaded(false);
      return;
    }

    let cancelled = false;
    setPositions([]);
    setOffset(0);
    setHasMore(true);
    setInitialLoaded(false);
    setIsLoading(true);
    setError(null);

    fetchAddressPools(activeAddress.address, { limit: PAGE_SIZE, offset: 0 })
      .then((response) => {
        if (cancelled) return;
        setPositions(response.result);
        setOffset(PAGE_SIZE);
        setHasMore(response.result.length === PAGE_SIZE && response.result.length < response.result_count);
        setInitialLoaded(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load pool positions");
        setInitialLoaded(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeAddress?.address]);

  const appendPositions = useCallback((newPositions: PoolPosition[]) => {
    setPositions((current) => {
      const existing = new Set(current.map((position) => position.lp_asset));
      const unique = newPositions.filter((position) => !existing.has(position.lp_asset));
      return [...current, ...unique];
    });
  }, []);

  useEffect(() => {
    if (!activeAddress?.address || !inView || !hasMore || isFetchingMore || isLoading || !initialLoaded) {
      return;
    }

    let cancelled = false;

    const loadMore = async () => {
      setIsFetchingMore(true);
      setError(null);

      try {
        const response = await fetchAddressPools(activeAddress.address, { limit: PAGE_SIZE, offset });
        if (cancelled) return;

        appendPositions(response.result);
        setOffset((current) => current + PAGE_SIZE);
        setHasMore(response.result.length === PAGE_SIZE && offset + response.result.length < response.result_count);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load more pool positions");
          setHasMore(false);
        }
      } finally {
        if (!cancelled) setIsFetchingMore(false);
      }
    };

    loadMore();

    return () => {
      cancelled = true;
    };
  }, [activeAddress?.address, appendPositions, hasMore, inView, initialLoaded, isFetchingMore, isLoading, offset]);

  const sections: ActionSection[] = [
    {
      title: "Pools",
      items: [
        {
          id: "enter-pool",
          title: "Enter Pool",
          description: "Deposit assets into a liquidity pool",
          onClick: () => navigate("/compose/pool/deposit"),
        },
      ],
    },
  ];

  if (positions.length > 0) {
    sections.push({
      title: "Your Positions",
      items: positions.map((position) => ({
        id: position.lp_asset,
        title: getCanonicalPoolPair(position.asset_a, position.asset_b),
        description: `${position.quantity_normalized ?? position.quantity} ${position.lp_asset}`,
        onClick: () => navigate(`/pools/${encodeURIComponent(position.lp_asset)}`),
      })),
    });
  }

  return (
    <div className="flex flex-col h-full" role="main" aria-labelledby="pools-title">
      <h2 id="pools-title" className="sr-only">Manage Pools</h2>
      <div className="flex-1 overflow-auto no-scrollbar p-4 space-y-4">
        {error && <ErrorAlert message={error} onClose={() => setError(null)} />}
        {isLoading ? (
          <Spinner message="Loading pools..." className="min-h-[240px]" />
        ) : (
          <>
            <ActionList sections={sections} />
            {positions.length === 0 && (
              <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-600">
                <p>No LP positions were found for this address.</p>
                <Button
                  type="button"
                  fullWidth
                  className="mt-4"
                  onClick={() => navigate("/compose/pool/deposit")}
                >
                  Enter Pool
                </Button>
              </div>
            )}
            {positions.length > 0 && (
              <div ref={loadMoreRef} className="flex flex-col justify-center items-center py-1">
                {hasMore ? (
                  isFetchingMore ? (
                    <Spinner className="py-4" />
                  ) : (
                    <div className="text-sm text-gray-500">Scroll to load more...</div>
                  )
                ) : null}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
