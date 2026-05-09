import { useEffect, useState, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ErrorAlert } from "@/components/ui/error-alert";
import { ActionList, type ActionSection } from "@/components/ui/lists/action-list";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { fetchAddressPools, type PoolPosition } from "@/utils/blockchain/counterparty/api";

export default function ManagePoolsPage(): ReactElement {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { activeAddress } = useWallet();
  const [positions, setPositions] = useState<PoolPosition[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetchAddressPools(activeAddress.address, { limit: 100 })
      .then((response) => {
        if (cancelled) return;
        setPositions(response.result);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load pool positions");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeAddress?.address]);

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
        title: `${position.asset_a} / ${position.asset_b}`,
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
          </>
        )}
      </div>
    </div>
  );
}
