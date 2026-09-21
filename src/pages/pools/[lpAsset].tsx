import type { ReactElement } from "react";
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { ErrorAlert } from "@/components/ui/error-alert";
import { Spinner } from "@/components/ui/spinner";
import { useHeader } from "@/contexts/header-context";
import { useLpAssetPool } from "@/hooks/useLpAssetPool";
import { PoolOverview } from "@/pages/pools/pool-overview";

export default function PoolPositionPage(): ReactElement {
  const { lpAsset } = useParams<{ lpAsset: string }>();
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const asset = lpAsset ? decodeURIComponent(lpAsset) : undefined;
  const { data: pool, isLoading, error } = useLpAssetPool(asset);

  useEffect(() => {
    setHeaderProps({
      title: "Pool",
      onBack: () => navigate(-1),
    });
    return () => setHeaderProps(null);
  }, [navigate, setHeaderProps]);

  if (isLoading) {
    return <Spinner message="Loading pool position..." />;
  }

  if (!pool) {
    if (error) {
      return (
        <div className="p-4">
          <ErrorAlert message={error.message} />
        </div>
      );
    }
    return <div className="p-4 text-center text-gray-600">Pool position not found</div>;
  }

  return <PoolOverview pool={pool} position={pool} />;
}
