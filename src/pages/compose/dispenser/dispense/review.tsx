import { ReviewScreen } from "@/components/screens/review-screen";
import { useComposer } from "@/contexts/composer-context";
import { formatAmount } from "@/utils/format";

interface ReviewDispenseProps {
  apiResponse: any;
  onSign: () => Promise<void>;
  onBack: () => void;
}

export function ReviewDispense({ apiResponse, onSign, onBack }: ReviewDispenseProps) {
  const { error, setError, formData } = useComposer();
  const { result } = apiResponse;
  const extra = formData?.extra || {};
  const { totalAssets = [], totalBtcAmount = 0 } = extra;

  const customFields = [
    { label: "Dispenser Address", value: result.params.dispenser },
    {
      label: "Assets You Get",
      value: totalAssets
        .map((asset: any) =>
          `${formatAmount({
            value: Number(asset.quantity),
            minimumFractionDigits: 0,
            maximumFractionDigits: 8,
          })} ${asset.asset_info?.asset_longname ?? asset.asset}`
        )
        .join(", "),
    },
    {
      label: "Total BTC Amount",
      value: `${(Number(result.params.quantity) / 1e8).toFixed(8)} BTC`,
    },
  ];

  return (
    <ReviewScreen
      apiResponse={apiResponse}
      onSign={onSign}
      onBack={onBack}
      customFields={customFields}
      error={error}
      setError={setError}
    />
  );
}
