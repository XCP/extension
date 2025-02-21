import { ReviewScreen } from "@/components/screens/review-screen";
import { useComposer } from "@/contexts/composer-context";
import { formatAmount } from "@/utils/format";

interface ReviewOrderProps {
  apiResponse: any;
  onSign: () => Promise<void>;
  onBack: () => void;
}

export const ReviewOrder = ({ apiResponse, onSign, onBack }: ReviewOrderProps) => {
  const { error, setError } = useComposer();
  const { result } = apiResponse;

  const customFields = [
    {
      label: "Give",
      value: `${formatAmount({
        value: Number(result.params.give_quantity) / 1e8,
        minimumFractionDigits: 8,
        maximumFractionDigits: 8,
      })} ${result.params.give_asset}`,
    },
    {
      label: "Get",
      value: `${formatAmount({
        value: Number(result.params.get_quantity) / 1e8,
        minimumFractionDigits: 8,
        maximumFractionDigits: 8,
      })} ${result.params.get_asset}`,
    },
    {
      label: "Price",
      value: `1 ${result.params.give_asset} = ${formatAmount({
        value: Number(result.params.get_quantity) / Number(result.params.give_quantity),
        minimumFractionDigits: 8,
        maximumFractionDigits: 8,
      })} ${result.params.get_asset}`,
    },
    ...(result.params.expiration !== 8064
      ? [{ label: "Expiration", value: `${result.params.expiration} blocks` }]
      : []),
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
};
